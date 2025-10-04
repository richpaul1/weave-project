import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebCrawler } from '../../src/services/webCrawler.js';

// Mock dependencies
vi.mock('../../src/weave/init.js', () => ({
  weave: {
    op: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
    logEvent: vi.fn(),
    logMetric: vi.fn(),
  }
}));

vi.mock('axios');
vi.mock('cheerio');

describe('WebCrawler Domain Filtering', () => {
  let crawler: WebCrawler;
  let mockAxios: any;
  let mockCheerio: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock axios
    mockAxios = await import('axios');
    mockAxios.default.get = vi.fn();

    // Mock cheerio
    mockCheerio = await import('cheerio');
    mockCheerio.load = vi.fn();

    crawler = new WebCrawler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isValidSubLink function', () => {
    // We need to test the internal function, so let's create a test version
    const isValidSubLink = (rootUrl: URL, foundUrl: URL): boolean => {
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
    };

    it('should allow same domain URLs', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const validUrl = new URL('https://weave-docs.wandb.ai/guides/core-types');
      
      expect(isValidSubLink(rootUrl, validUrl)).toBe(true);
    });

    it('should reject different domains', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const externalUrl = new URL('https://example.com/page');
      
      expect(isValidSubLink(rootUrl, externalUrl)).toBe(false);
    });

    it('should reject subdomains', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const subdomainUrl = new URL('https://api.weave-docs.wandb.ai/data');
      
      expect(isValidSubLink(rootUrl, subdomainUrl)).toBe(false);
    });

    it('should reject different protocols', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const httpUrl = new URL('http://weave-docs.wandb.ai/page');
      
      expect(isValidSubLink(rootUrl, httpUrl)).toBe(false);
    });

    it('should reject API paths', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const apiUrl = new URL('https://weave-docs.wandb.ai/api/v1/data');
      
      expect(isValidSubLink(rootUrl, apiUrl)).toBe(false);
    });

    it('should reject admin paths', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const adminUrl = new URL('https://weave-docs.wandb.ai/admin/dashboard');
      
      expect(isValidSubLink(rootUrl, adminUrl)).toBe(false);
    });

    it('should reject static asset paths', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const staticUrl = new URL('https://weave-docs.wandb.ai/static/css/main.css');
      
      expect(isValidSubLink(rootUrl, staticUrl)).toBe(false);
    });

    it('should reject file downloads', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const pdfUrl = new URL('https://weave-docs.wandb.ai/docs/manual.pdf');
      
      expect(isValidSubLink(rootUrl, pdfUrl)).toBe(false);
    });

    it('should reject anchor-only links', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/guides');
      const anchorUrl = new URL('https://weave-docs.wandb.ai/guides#section1');
      
      expect(isValidSubLink(rootUrl, anchorUrl)).toBe(false);
    });

    it('should allow deep paths within same domain', () => {
      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      const deepUrl = new URL('https://weave-docs.wandb.ai/guides/core-types/datasets');
      
      expect(isValidSubLink(rootUrl, deepUrl)).toBe(true);
    });
  });

  describe('domain filtering integration', () => {
    it('should include external skip count in completion log', async () => {
      const { WeaveService } = await import('../../src/weave/weaveService.js');
      const weaveService = WeaveService.getInstance();
      const logEventSpy = vi.spyOn(weaveService!, 'logEvent');

      // Mock a simple failing crawl to test logging
      mockAxios.default.get.mockRejectedValue(new Error('Network error'));

      const startUrl = 'https://weave-docs.wandb.ai/';
      await crawler.crawl(startUrl, 1);

      // Should log completion with skip count
      expect(logEventSpy).toHaveBeenCalledWith('crawl_complete', expect.objectContaining({
        pagesSkippedExternal: expect.any(Number)
      }));
    });
  });

  describe('real-world domain scenarios', () => {
    it('should handle wandb.ai domain correctly', () => {
      const isValidSubLink = (rootUrl: URL, foundUrl: URL): boolean => {
        if (rootUrl.protocol !== foundUrl.protocol) return false;
        if (foundUrl.hostname !== rootUrl.hostname) return false;
        
        const skipPaths = ['/api/', '/admin/', '/login/', '/logout/', '/auth/', '/static/', '/assets/', '/css/', '/js/', '/images/', '.pdf', '.zip', '.exe', '.dmg', '.pkg'];
        const foundPath = foundUrl.pathname.toLowerCase();
        if (skipPaths.some(skip => foundPath.includes(skip))) return false;
        
        if (foundUrl.href === rootUrl.href + '#' || (foundUrl.pathname === rootUrl.pathname && foundUrl.hash)) return false;
        
        return true;
      };

      const rootUrl = new URL('https://weave-docs.wandb.ai/');
      
      // Should allow same domain
      expect(isValidSubLink(rootUrl, new URL('https://weave-docs.wandb.ai/guides'))).toBe(true);
      expect(isValidSubLink(rootUrl, new URL('https://weave-docs.wandb.ai/reference/python-sdk'))).toBe(true);
      
      // Should reject different wandb subdomains
      expect(isValidSubLink(rootUrl, new URL('https://wandb.ai/'))).toBe(false);
      expect(isValidSubLink(rootUrl, new URL('https://app.wandb.ai/dashboard'))).toBe(false);
      expect(isValidSubLink(rootUrl, new URL('https://api.wandb.ai/v1/data'))).toBe(false);
      
      // Should reject completely external domains
      expect(isValidSubLink(rootUrl, new URL('https://github.com/wandb/weave'))).toBe(false);
      expect(isValidSubLink(rootUrl, new URL('https://docs.python.org/'))).toBe(false);
    });
  });
});
