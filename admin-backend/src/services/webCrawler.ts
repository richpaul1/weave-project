import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import TurndownService from 'turndown';
import { weave } from '../weave/init.js';

/**
 * Normalizes a URL for consistent crawling
 */
function normalizeUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    url.hash = '';
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch (e) {
    console.warn(`Could not normalize URL "${urlString}"`, e);
    return urlString;
  }
}

/**
 * Checks if a URL is a valid sub-link within the root domain
 */
function isValidSubLink(rootUrl: URL, foundUrl: URL): boolean {
  // Same protocol
  if (rootUrl.protocol !== foundUrl.protocol) return false;

  // Same domain
  const rootDomain = rootUrl.hostname.split('.').slice(-2).join('.');
  const foundDomain = foundUrl.hostname.split('.').slice(-2).join('.');
  if (rootDomain !== foundDomain) return false;

  // Same hostname or subdomain
  if (foundUrl.hostname !== rootUrl.hostname && 
      !foundUrl.hostname.endsWith(`.${rootUrl.hostname}`)) {
    return false;
  }

  // Path must be within root path
  const rootPath = rootUrl.pathname.endsWith('/') ? rootUrl.pathname : `${rootUrl.pathname}/`;
  const foundPath = foundUrl.pathname.endsWith('/') ? foundUrl.pathname : `${foundUrl.pathname}/`;
  
  if (!foundPath.startsWith(rootPath)) return false;

  return true;
}

export interface CrawlResult {
  url: string;
  title: string;
  markdown: string;
  links: string[];
  depth: number;
}

export interface CrawlProgress {
  total: number;
  completed: number;
  failed: number;
  currentUrl: string;
}

export class WebCrawler {
  private turndownService: TurndownService;
  private progressCallback?: (progress: CrawlProgress) => void;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: CrawlProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Fetch and parse a single page
   */
  @weave.op()
  async fetchPage(url: string): Promise<{ html: string; $: cheerio.CheerioAPI }> {
    weave.logEvent('fetch_page_start', { url });
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      const duration = Date.now() - startTime;

      weave.logMetric('fetch_page_duration_ms', duration, { url });
      weave.logEvent('fetch_page_success', { url, duration });

      return { html: response.data, $ };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      weave.logEvent('fetch_page_error', { url, error: error.message, duration });
      throw error;
    }
  }

  /**
   * Extract main content from page
   */
  @weave.op()
  extractMainContent($: cheerio.CheerioAPI): string {
    // Try to find main content
    let mainHtml = $('main').html();

    if (!mainHtml) {
      const selectors = [
        'article',
        '.content',
        '#content',
        '.main-content',
        '.page-content',
        '[role="main"]',
      ];

      for (const selector of selectors) {
        const content = $(selector).html();
        if (content && content.length > 100) {
          mainHtml = content;
          break;
        }
      }
    }

    // Fallback to body
    if (!mainHtml) {
      mainHtml = $('body').html() || '';
    }

    return mainHtml;
  }

  /**
   * Extract links from page
   */
  @weave.op()
  extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: Set<string> = new Set();
    const baseUrlParsed = new URL(baseUrl);

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        const absoluteUrl = new URL(href, baseUrl);
        const normalized = normalizeUrl(absoluteUrl.href);

        if (isValidSubLink(baseUrlParsed, absoluteUrl)) {
          links.add(normalized);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return Array.from(links);
  }

  /**
   * Convert HTML to Markdown
   */
  @weave.op()
  htmlToMarkdown(html: string): string {
    return this.turndownService.turndown(html);
  }

  /**
   * Process a single page
   */
  @weave.op()
  async processPage(url: string, depth: number): Promise<CrawlResult> {
    weave.logEvent('process_page_start', { url, depth });

    const { html, $ } = await this.fetchPage(url);

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || url;

    // Extract main content
    const mainHtml = this.extractMainContent($);

    // Convert to markdown
    const markdown = this.htmlToMarkdown(mainHtml);

    // Extract links
    const links = this.extractLinks($, url);

    weave.logEvent('process_page_complete', { 
      url, 
      depth, 
      title, 
      markdownLength: markdown.length,
      linksFound: links.length,
    });

    return {
      url,
      title,
      markdown,
      links,
      depth,
    };
  }

  /**
   * Crawl website with breadth-first search
   */
  @weave.op()
  async crawl(startUrl: string, maxDepth: number = 2): Promise<CrawlResult[]> {
    weave.logEvent('crawl_start', { startUrl, maxDepth });
    const startTime = Date.now();

    const normalizedStartUrl = normalizeUrl(startUrl);
    const visited = new Set<string>();
    const results: CrawlResult[] = [];
    const queue: Array<{ url: string; depth: number }> = [{ url: normalizedStartUrl, depth: 0 }];

    let completed = 0;
    let failed = 0;

    while (queue.length > 0) {
      const { url, depth } = queue.shift()!;

      // Skip if already visited
      if (visited.has(url)) continue;
      visited.add(url);

      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          total: visited.size + queue.length,
          completed,
          failed,
          currentUrl: url,
        });
      }

      try {
        // Process page
        const result = await this.processPage(url, depth);
        results.push(result);
        completed++;

        // Add new links to queue if not at max depth
        if (depth < maxDepth) {
          for (const link of result.links) {
            if (!visited.has(link)) {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }

        weave.logMetric('crawl_progress', completed, { 
          total: visited.size,
          failed,
          queueSize: queue.length,
        });
      } catch (error: any) {
        failed++;
        console.error(`Failed to process ${url}:`, error.message);
        weave.logEvent('crawl_page_error', { url, depth, error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    weave.logEvent('crawl_complete', {
      startUrl,
      maxDepth,
      pagesProcessed: completed,
      pagesFailed: failed,
      duration,
    });
    weave.logMetric('crawl_duration_ms', duration, { startUrl, maxDepth });

    return results;
  }
}

