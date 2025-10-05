import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import TurndownService from 'turndown';
import { weaveOp, WeaveService } from '../weave/weaveService.js';
import { llmService } from './llmService.js';
import { config } from '../config.js';

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
  @weaveOp('WebCrawler.fetchPage')
  async fetchPage(url: string): Promise<{ html: string; $: cheerio.CheerioAPI }> {
    WeaveService.getInstance()?.logEvent('fetch_page_start', { url });
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      const duration = Date.now() - startTime;

      WeaveService.getInstance()?.logMetrics({ fetch_page_duration_ms: duration, url });
      WeaveService.getInstance()?.logEvent('fetch_page_success', { url, duration });

      return { html: response.data, $ };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      WeaveService.getInstance()?.logEvent('fetch_page_error', { url, error: error.message, duration });
      throw error;
    }
  }

  /**
   * Extract main content from page
   */
  async extractMainContent($: cheerio.CheerioAPI, url?: string): Promise<string> {
    // Special handling for W&B course pages
    if (url && url.includes('wandb.ai/site/courses/') && !url.endsWith('/courses/')) {
      if (config.useLLMForCourseExtraction) {
        return await this.extractCourseContentWithLLM($, url);
      } else {
        return this.extractCourseContent($);
      }
    }

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
   * Extract course-specific content from W&B course pages (original method)
   */
  private extractCourseContent($: cheerio.CheerioAPI): string {
    return this.extractRawCourseContent($);
  }

  /**
   * Extract course-specific content from W&B course pages using LLM for clean descriptions
   */
  private async extractCourseContentWithLLM($: cheerio.CheerioAPI, url?: string): Promise<string> {
    const rawMarkdown = this.extractRawCourseContent($);

    if (url) {
      try {
        const cleanMarkdown = await llmService.generateCourseMarkdown(rawMarkdown, url);
        return cleanMarkdown;
      } catch (error) {
        console.warn('Failed to generate clean course markdown, falling back to raw content:', error);
      }
    }

    return rawMarkdown;
  }

  /**
   * Extract raw course content from W&B course pages (original method)
   */
  private extractRawCourseContent($: cheerio.CheerioAPI): string {
    // First, try to extract structured course data from JSON-LD
    const jsonLdContent = this.extractJsonLdCourseData($);

    // Create a container for course content
    const courseContainer = $('<div></div>');

    // Add JSON-LD course data if available
    if (jsonLdContent) {
      courseContainer.append(jsonLdContent);
    }

    // Look for course-specific content in the page
    const courseHeadings = $('h1, h2, h3').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes('ai engineering') ||
             text.includes('agent') ||
             text.includes('course');
    });

    // Add course headings and their following content
    courseHeadings.each((_, heading) => {
      const $heading = $(heading);
      courseContainer.append($heading.clone());

      // Add following content until next heading or section
      let next = $heading.next();
      while (next.length > 0 && !next.is('h1, h2, h3, section, .elementor-section')) {
        if (next.is('p, ul, ol, div') && next.text().trim().length > 0) {
          courseContainer.append(next.clone());
        }
        next = next.next();
      }
    });

    // Look for course details like duration, price, instructors
    const courseDetails = $('*').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      const isRelevant = text.includes('hour') ||
                        text.includes('free') ||
                        text.includes('instructor') ||
                        text.includes('duration') ||
                        text.includes('price');
      const isShort = text.trim().length > 0 && text.trim().length < 100;
      return isRelevant && isShort;
    });

    courseDetails.each((_, el) => {
      const $el = $(el);
      courseContainer.append($el.clone());
    });

    // Clean up the container by removing script and style elements
    courseContainer.find('script, style, nav, .nav, header, footer').remove();

    // Convert to markdown
    const html = courseContainer.html() || '';
    const markdown = this.turndownService.turndown(html);

    // If we got very little content, return a basic course structure
    if (markdown.length < 200) {
      return this.createBasicCourseMarkdown($);
    }

    return markdown;
  }

  private extractJsonLdCourseData($: cheerio.CheerioAPI): string {
    const jsonLdScripts = $('script[type="application/ld+json"]');
    let courseData = '';

    jsonLdScripts.each((_, script) => {
      try {
        const data = JSON.parse($(script).html() || '');

        // Handle both single objects and arrays
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'Course') {
            courseData += `<h1>${item.name || 'Course'}</h1>\n\n`;
            if (item.description) {
              courseData += `<h2>Description</h2>\n<p>${item.description}</p>\n\n`;
            }

            if (item.hasCourseInstance) {
              const instance = item.hasCourseInstance;
              if (instance.description) {
                courseData += `<h2>Course Details</h2>\n<p>${instance.description}</p>\n\n`;
              }

              if (instance.instructor && Array.isArray(instance.instructor)) {
                courseData += `<h2>Instructors</h2>\n<ul>\n`;
                instance.instructor.forEach((instructor: any) => {
                  if (instructor.name) {
                    courseData += `<li>${instructor.name}</li>\n`;
                  }
                });
                courseData += '</ul>\n\n';
              }
            }
            break;
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    });

    return courseData;
  }

  private createBasicCourseMarkdown($: cheerio.CheerioAPI): string {
    const title = $('title').text() || 'Course';
    const description = $('meta[name="description"]').attr('content') || 'Course description not available.';

    return `# ${title}\n\n## Description\n${description}\n\n## Course Information\nThis course provides comprehensive training in the subject matter.\n\n## Getting Started\nTo begin this course, follow the enrollment instructions provided.\n`;
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
  @weaveOp('WebCrawler.processPage')
  async processPage(url: string, depth: number): Promise<CrawlResult> {
    WeaveService.getInstance()?.logEvent('process_page_start', { url, depth });

    const { html, $ } = await this.fetchPage(url);

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || url;

    // Extract main content (pass URL for course-specific handling)
    const mainContent = await this.extractMainContent($, url);

    // For course pages, the content is already markdown from LLM
    // For other pages, convert HTML to markdown
    let markdown: string;
    if (url && url.includes('wandb.ai/site/courses/') && !url.endsWith('/courses/')) {
      markdown = mainContent; // Already markdown from LLM
    } else {
      markdown = this.htmlToMarkdown(mainContent, url); // Convert HTML to markdown
    }

    // Extract links
    const links = this.extractLinks($, url);

    WeaveService.getInstance()?.logEvent('process_page_complete', {
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
  @weaveOp('WebCrawler.crawl')
  async crawl(startUrl: string, maxDepth: number = 2): Promise<CrawlResult[]> {
    WeaveService.getInstance()?.logEvent('crawl_start', { startUrl, maxDepth });
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
            WeaveService.getInstance()?.logEvent('crawl_skip_external', { url, startDomain: startUrlParsed.hostname, foundDomain: currentUrlParsed.hostname });
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

        WeaveService.getInstance()?.logMetrics({
          crawl_progress: completed,
          total: visited.size,
          failed,
          queueSize: queue.length,
        });
      } catch (error: any) {
        failed++;
        console.error(`Failed to process ${url}:`, error.message);
        WeaveService.getInstance()?.logEvent('crawl_page_error', { url, depth, error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    WeaveService.getInstance()?.logEvent('crawl_complete', {
      startUrl,
      maxDepth,
      pagesProcessed: completed,
      pagesFailed: failed,
      pagesSkippedExternal: skippedExternal,
      duration,
    });
    WeaveService.getInstance()?.logMetrics({ crawl_duration_ms: duration, startUrl, maxDepth });

    console.log(`[Crawl] Completed: ${completed} pages processed, ${failed} failed, ${skippedExternal} external domains skipped`);

    return results;
  }
}

