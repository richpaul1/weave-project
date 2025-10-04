import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import TurndownService from 'turndown';
import { weave } from '../weave/init.js';
import { weaveOp } from '../weave/weaveService.js';

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
 * Checks if a URL is within the same domain as the root URL
 * This prevents crawling external domains while allowing full domain exploration
 */
function isValidSubLink(rootUrl: URL, foundUrl: URL): boolean {
  // Same protocol
  if (rootUrl.protocol !== foundUrl.protocol) return false;

  // Must be exact same hostname (no subdomains allowed for security)
  if (foundUrl.hostname !== rootUrl.hostname) return false;

  // Skip common non-content paths
  const skipPaths = [
    '/api/', '/admin/', '/login/', '/logout/', '/auth/',
    '/static/', '/assets/', '/css/', '/js/', '/images/',
    '.pdf', '.zip', '.exe', '.dmg', '.pkg'
  ];

  const foundPath = foundUrl.pathname.toLowerCase();
  if (skipPaths.some(skip => foundPath.includes(skip))) {
    return false;
  }

  // Skip anchor-only links (same page)
  if (foundUrl.href === rootUrl.href + '#' ||
      (foundUrl.pathname === rootUrl.pathname && foundUrl.hash)) {
    return false;
  }

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
  private currentBaseUrl?: string;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    this.setupTurndownRules();
  }

  /**
   * Setup TurndownService rules to handle relative URLs
   */
  private setupTurndownRules(): void {
    // Handle images with relative URL resolution
    this.turndownService.addRule('images', {
      filter: 'img',
      replacement: (_content: any, node: any) => {
        const src = node.getAttribute && node.getAttribute('src');
        const alt = node.getAttribute && node.getAttribute('alt') || '';

        if (src) {
          // Resolve relative URLs to absolute URLs if base URL is available
          const resolvedSrc = this.resolveUrl(src);
          return `![${alt}](${resolvedSrc})`;
        }
        return '';
      }
    });

    // Handle links with relative URL resolution
    this.turndownService.addRule('links', {
      filter: 'a',
      replacement: (content: any, node: any) => {
        const href = node.getAttribute && node.getAttribute('href');
        const title = node.getAttribute && node.getAttribute('title');

        if (href) {
          // Resolve relative URLs to absolute URLs if base URL is available
          const resolvedHref = this.resolveUrl(href);
          const titlePart = title ? ` "${title}"` : '';
          return `[${content}](${resolvedHref}${titlePart})`;
        }
        return content;
      }
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
  @weaveOp()
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
   * Helper method to resolve relative URLs to absolute URLs
   */
  private resolveUrl(url: string): string {
    if (!this.currentBaseUrl || url.startsWith('http://') || url.startsWith('https://')) {
      return url; // Return as-is if no base URL or already absolute
    }

    try {
      return new URL(url, this.currentBaseUrl).href;
    } catch (error) {
      console.warn(`Failed to resolve URL: ${url} with base: ${this.currentBaseUrl}`);
      return url; // Return original if resolution fails
    }
  }

  /**
   * Convert relative URLs to absolute URLs in markdown content
   */
  private convertRelativeUrlsToAbsolute(markdownContent: string, baseUrl: string): string {
    const markdownLinkOrImageRegex = /(!?\[([^\]]*)\])\(([^)]+)\)/g;

    return markdownContent.replace(markdownLinkOrImageRegex, (match, textPart, _linkText, url) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        return match; // Already absolute
      }

      // Convert relative URL to absolute
      try {
        const absoluteUrl = new URL(url, baseUrl).toString();
        return `${textPart}(${absoluteUrl})`;
      } catch (error) {
        console.warn(`Failed to convert relative URL: ${url}`, error);
        return match; // Return original if conversion fails
      }
    });
  }

  /**
   * Convert HTML to Markdown
   */
  htmlToMarkdown(html: string, baseUrl?: string): string {
    // Set the base URL for use in TurndownService rules
    this.currentBaseUrl = baseUrl;

    let markdown = this.turndownService.turndown(html);

    // Convert any remaining relative URLs to absolute URLs
    if (baseUrl) {
      markdown = this.convertRelativeUrlsToAbsolute(markdown, baseUrl);
    }

    return markdown;
  }

  /**
   * Process a single page
   */
  @weaveOp()
  async processPage(url: string, depth: number): Promise<CrawlResult> {
    weave.logEvent('process_page_start', { url, depth });

    const { html, $ } = await this.fetchPage(url);

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || url;

    // Extract main content
    const mainHtml = this.extractMainContent($);

    // Convert to markdown with base URL for relative URL resolution
    const markdown = this.htmlToMarkdown(mainHtml, url);

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
  @weaveOp()
  async crawl(startUrl: string, maxDepth: number = 2): Promise<CrawlResult[]> {
    weave.logEvent('crawl_start', { startUrl, maxDepth });
    const startTime = Date.now();

    const normalizedStartUrl = normalizeUrl(startUrl);
    const startUrlParsed = new URL(normalizedStartUrl);
    const visited = new Set<string>();
    const results: CrawlResult[] = [];
    const queue: Array<{ url: string; depth: number }> = [{ url: normalizedStartUrl, depth: 0 }];

    let completed = 0;
    let failed = 0;
    let skippedExternal = 0;

    while (queue.length > 0) {
      const { url, depth } = queue.shift()!;

      // Skip if already visited
      if (visited.has(url)) continue;
      visited.add(url);

      // Validate domain for non-root URLs
      if (depth > 0) {
        try {
          const currentUrlParsed = new URL(url);
          if (!isValidSubLink(startUrlParsed, currentUrlParsed)) {
            skippedExternal++;
            console.log(`[Crawl] Skipping external domain: ${url}`);
            weave.logEvent('crawl_skip_external', { url, startDomain: startUrlParsed.hostname, foundDomain: currentUrlParsed.hostname });
            continue;
          }
        } catch (error) {
          console.warn(`[Crawl] Invalid URL format: ${url}`);
          continue;
        }
      }

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
      pagesSkippedExternal: skippedExternal,
      duration,
    });
    weave.logMetric('crawl_duration_ms', duration, { startUrl, maxDepth });

    console.log(`[Crawl] Completed: ${completed} pages processed, ${failed} failed, ${skippedExternal} external domains skipped`);

    return results;
  }
}

