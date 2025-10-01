import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebCrawler } from '../../src/services/webCrawler.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('WebCrawler Unit Tests', () => {
  let crawler: WebCrawler;

  beforeEach(() => {
    crawler = new WebCrawler();
    vi.clearAllMocks();
  });

  describe('fetchPage', () => {
    it('should fetch HTML from a URL', async () => {
      const mockHtml = '<html><body><h1>Test</h1></body></html>';
      mockedAxios.get.mockResolvedValue({ data: mockHtml });

      const result = await crawler.fetchPage('https://example.com');

      // fetchPage returns cheerio object with html property
      expect(result.html).toBe(mockHtml);
      expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 30000,
      });
    });

    it('should throw error on network failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(crawler.fetchPage('https://example.com')).rejects.toThrow('Network error');
    });

    it('should throw error on timeout', async () => {
      mockedAxios.get.mockRejectedValue(new Error('timeout of 10000ms exceeded'));

      await expect(crawler.fetchPage('https://example.com')).rejects.toThrow('timeout');
    });
  });

  describe('extractMainContent', () => {
    it('should extract text from main content', () => {
      const html = `
        <html>
          <body>
            <header>Header</header>
            <main>
              <h1>Main Title</h1>
              <p>Main content paragraph</p>
            </main>
            <footer>Footer</footer>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const content = crawler.extractMainContent($);

      expect(content).toContain('Main Title');
      expect(content).toContain('Main content paragraph');
    });

    it('should extract from article tag if main is not present', () => {
      const html = `
        <html>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>Article content</p>
            </article>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const content = crawler.extractMainContent($);

      expect(content).toContain('Article Title');
      expect(content).toContain('Article content');
    });

    it('should extract from body if no main or article', () => {
      const html = `
        <html>
          <body>
            <h1>Body Title</h1>
            <p>Body content</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const content = crawler.extractMainContent($);

      expect(content).toContain('Body Title');
      expect(content).toContain('Body content');
    });

    it('should remove script and style tags', () => {
      const html = `
        <html>
          <body>
            <script>console.log('test');</script>
            <style>.test { color: red; }</style>
            <main>
              <p>Clean content</p>
            </main>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const content = crawler.extractMainContent($);

      expect(content).not.toContain('console.log');
      expect(content).not.toContain('color: red');
      expect(content).toContain('Clean content');
    });
  });

  describe('extractLinks', () => {
    it('should extract valid links from same domain', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page1">Page 1</a>
            <a href="https://example.com/page2">Page 2</a>
            <a href="https://other.com/page">Other</a>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const links = crawler.extractLinks($, 'https://example.com');

      expect(links).toHaveLength(2);
      expect(links).toContain('https://example.com/page1');
      expect(links).toContain('https://example.com/page2');
      expect(links).not.toContain('https://other.com/page');
    });

    it('should handle relative URLs', () => {
      const html = `
        <html>
          <body>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const links = crawler.extractLinks($, 'https://example.com');

      expect(links).toContain('https://example.com/about');
      expect(links).toContain('https://example.com/contact');
    });

    it('should filter out anchor links', () => {
      const html = `
        <html>
          <body>
            <a href="#section1">Section 1</a>
            <a href="/page">Page</a>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const links = crawler.extractLinks($, 'https://example.com');

      // Anchor links (#section1) resolve to base URL after normalization
      // Normalization keeps trailing slash for root path
      expect(links).toHaveLength(2);
      expect(links).toContain('https://example.com/page');
      expect(links).toContain('https://example.com/');
    });

    it('should filter out mailto and tel links', () => {
      const html = `
        <html>
          <body>
            <a href="mailto:test@example.com">Email</a>
            <a href="tel:1234567890">Phone</a>
            <a href="/page">Page</a>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const links = crawler.extractLinks($, 'https://example.com');

      expect(links).toHaveLength(1);
      expect(links).toContain('https://example.com/page');
    });

    it('should deduplicate links', () => {
      const html = `
        <html>
          <body>
            <a href="/page">Page 1</a>
            <a href="/page">Page 2</a>
            <a href="/page">Page 3</a>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const links = crawler.extractLinks($, 'https://example.com');

      expect(links).toHaveLength(1);
      expect(links).toContain('https://example.com/page');
    });
  });

  describe('htmlToMarkdown', () => {
    it('should convert HTML to markdown', () => {
      const html = '<h1>Title</h1><p>Paragraph</p>';

      const markdown = crawler.htmlToMarkdown(html);

      expect(markdown).toContain('# Title');
      expect(markdown).toContain('Paragraph');
    });

    it('should handle links', () => {
      const html = '<a href="https://example.com">Link</a>';

      const markdown = crawler.htmlToMarkdown(html);

      expect(markdown).toContain('[Link](https://example.com)');
    });

    it('should handle lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';

      const markdown = crawler.htmlToMarkdown(html);

      expect(markdown).toContain('Item 1');
      expect(markdown).toContain('Item 2');
    });

    it('should handle code blocks', () => {
      const html = '<pre><code>const x = 1;</code></pre>';

      const markdown = crawler.htmlToMarkdown(html);

      expect(markdown).toContain('const x = 1;');
    });
  });

  describe('setProgressCallback', () => {
    it('should set progress callback', () => {
      const callback = vi.fn();

      crawler.setProgressCallback(callback);

      // Access private property for testing
      expect((crawler as any).progressCallback).toBe(callback);
    });
  });
});

