import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cheerio from 'cheerio';
import { WebCrawler } from '../../../src/services/webCrawler.js';

describe('WebCrawler - trim() error handling', () => {
  let crawler: WebCrawler;

  beforeEach(() => {
    crawler = new WebCrawler();
  });

  describe('_processPageImpl', () => {
    it('should handle undefined title text gracefully', async () => {
      // Mock fetchPage to return HTML without title or h1
      const mockFetchPage = vi.fn().mockResolvedValue({
        html: '<html><body><p>Some content</p></body></html>',
        $: cheerio.load('<html><body><p>Some content</p></body></html>')
      });
      
      // Mock extractMainContent to return valid content
      const mockExtractMainContent = vi.fn().mockResolvedValue('<p>Some content</p>');
      
      // Mock htmlToMarkdown to return valid markdown
      const mockHtmlToMarkdown = vi.fn().mockReturnValue('Some content');

      // Replace the methods with mocks
      crawler.fetchPage = mockFetchPage;
      crawler.extractMainContent = mockExtractMainContent;
      crawler.htmlToMarkdown = mockHtmlToMarkdown;

      // This should not throw "text.trim is not a function"
      const result = await crawler.processPage('https://example.com', 0);

      expect(result).toBeDefined();
      expect(result.title).toBe('https://example.com'); // Should fallback to URL
      expect(result.url).toBe('https://example.com');
      expect(result.markdown).toBe('Some content');
    });

    it('should handle empty title text gracefully', async () => {
      // Mock fetchPage to return HTML with empty title
      const mockFetchPage = vi.fn().mockResolvedValue({
        html: '<html><head><title></title></head><body><h1></h1><p>Some content</p></body></html>',
        $: cheerio.load('<html><head><title></title></head><body><h1></h1><p>Some content</p></body></html>')
      });
      
      // Mock extractMainContent to return valid content
      const mockExtractMainContent = vi.fn().mockResolvedValue('<p>Some content</p>');
      
      // Mock htmlToMarkdown to return valid markdown
      const mockHtmlToMarkdown = vi.fn().mockReturnValue('Some content');

      // Replace the methods with mocks
      crawler.fetchPage = mockFetchPage;
      crawler.extractMainContent = mockExtractMainContent;
      crawler.htmlToMarkdown = mockHtmlToMarkdown;

      // This should not throw "text.trim is not a function"
      const result = await crawler.processPage('https://example.com', 0);

      expect(result).toBeDefined();
      expect(result.title).toBe('https://example.com'); // Should fallback to URL
    });

    it('should handle null/undefined text from cheerio gracefully', async () => {
      // Create a mock cheerio object that returns undefined for text()
      const mockCheerio = {
        text: vi.fn().mockReturnValue(undefined)
      };

      const $ = cheerio.load('<html><body><p>Some content</p></body></html>');
      
      // Mock the title and h1 selectors to return our mock cheerio object
      vi.spyOn($, 'call').mockImplementation((selector: string) => {
        if (selector === 'title' || selector === 'h1') {
          return {
            text: () => undefined,
            first: () => ({ text: () => undefined })
          } as any;
        }
        return $.call($, selector);
      });

      const mockFetchPage = vi.fn().mockResolvedValue({
        html: '<html><body><p>Some content</p></body></html>',
        $
      });
      
      const mockExtractMainContent = vi.fn().mockResolvedValue('<p>Some content</p>');
      const mockHtmlToMarkdown = vi.fn().mockReturnValue('Some content');

      crawler.fetchPage = mockFetchPage;
      crawler.extractMainContent = mockExtractMainContent;
      crawler.htmlToMarkdown = mockHtmlToMarkdown;

      // This should not throw "text.trim is not a function"
      const result = await crawler.processPage('https://example.com', 0);

      expect(result).toBeDefined();
      expect(result.title).toBe('https://example.com'); // Should fallback to URL
    });

    it('should reproduce the actual trim error with real HTML', async () => {
      // Test with HTML that might cause the issue - malformed or missing elements
      const problematicHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <!-- No title tag -->
        </head>
        <body>
          <!-- No h1 tag -->
          <div>Some content without proper structure</div>
        </body>
        </html>
      `;

      const $ = cheerio.load(problematicHtml);
      
      const mockFetchPage = vi.fn().mockResolvedValue({
        html: problematicHtml,
        $
      });
      
      const mockExtractMainContent = vi.fn().mockResolvedValue('<div>Some content</div>');
      const mockHtmlToMarkdown = vi.fn().mockReturnValue('Some content');

      crawler.fetchPage = mockFetchPage;
      crawler.extractMainContent = mockExtractMainContent;
      crawler.htmlToMarkdown = mockHtmlToMarkdown;

      // This should not throw "text.trim is not a function"
      await expect(crawler.processPage('https://weave-docs.wandb.ai/', 0)).resolves.toBeDefined();
    });
  });

  describe('LLMService generateEmbedding input validation', () => {
    it('should handle non-string input to generateEmbedding', async () => {
      // Test what happens if we pass undefined/null to generateEmbedding
      const { llmService } = await import('../../../src/services/llmService.js');

      // These should throw proper errors, not "text.trim is not a function"
      await expect(llmService.generateEmbedding(undefined as any)).rejects.toThrow('Text cannot be empty');
      await expect(llmService.generateEmbedding(null as any)).rejects.toThrow('Text cannot be empty');
      await expect(llmService.generateEmbedding('' as any)).rejects.toThrow('Text cannot be empty');
    });

    it('should reproduce the actual trim error with non-string markdown', async () => {
      // Test the actual scenario where markdown might not be a string
      const { llmService } = await import('../../../src/services/llmService.js');

      // Test with various non-string types that could cause "text.trim is not a function"
      const nonStringValues = [
        { value: 123, name: 'number' },
        { value: true, name: 'boolean' },
        { value: {}, name: 'object' },
        { value: [], name: 'array' },
        { value: Symbol('test'), name: 'symbol' }
      ];

      for (const { value, name } of nonStringValues) {
        try {
          await llmService.generateEmbedding(value as any);
          // Should not throw an error anymore since we convert to string
          // The converted string should be valid (e.g., "123", "true", "[object Object]", etc.)
          // Only empty strings should throw an error
        } catch (error) {
          // The error should be a proper validation error, not "text.trim is not a function"
          expect(error.message).not.toContain('text.trim is not a function');
          expect(error.message).not.toContain('.trim is not a function');
          // If it throws, it should be for empty content after conversion
          expect(error.message).toContain('Text cannot be empty');
        }
      }
    });

    it('should handle htmlToMarkdown returning non-string values', async () => {
      // Test the scenario where htmlToMarkdown might return undefined/null
      const crawler = new WebCrawler();

      const mockFetchPage = vi.fn().mockResolvedValue({
        html: '<html><head><title>Test</title></head><body><p>Content</p></body></html>',
        $: cheerio.load('<html><head><title>Test</title></head><body><p>Content</p></body></html>')
      });

      const mockExtractMainContent = vi.fn().mockResolvedValue('<p>Content</p>');

      // Mock htmlToMarkdown to return undefined (which could happen if turndown fails)
      const mockHtmlToMarkdown = vi.fn().mockReturnValue(undefined);

      crawler.fetchPage = mockFetchPage;
      crawler.extractMainContent = mockExtractMainContent;
      crawler.htmlToMarkdown = mockHtmlToMarkdown;

      // This should handle the undefined markdown gracefully
      const result = await crawler.processPage('https://example.com', 0);

      expect(result).toBeDefined();
      expect(result.markdown).toBe(''); // Should convert undefined to empty string
    });
  });
});
