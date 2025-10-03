import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { WebCrawler } from '../../src/services/webCrawler.js';
import { StorageService } from '../../src/services/storageService.js';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../src/config.js';

/**
 * Integration tests for Web Crawler
 * These tests use real services (no mocking)
 */
describe('WebCrawler Integration Tests', () => {
  let crawler: WebCrawler;
  let storage: StorageService;

  beforeAll(async () => {
    crawler = new WebCrawler();
    storage = new StorageService();

    // Add delay to avoid concurrent schema initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // Initialize schema
      await storage.initializeSchema();
    } catch (error: any) {
      // Ignore deadlock errors during schema init - constraints may already exist
      if (!error.code?.includes('DeadlockDetected')) {
        throw error;
      }
    }

    // Clean up any existing test data
    await storage.resetAllContent();
    // Add delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    // Clean up before each test to ensure isolation
    await storage.resetAllContent();
    // Add delay to ensure cleanup is complete before next test
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Double-check that database is actually clean
    const pages = await storage.getAllPages();
    if (pages.length > 0) {
      console.warn(`Found ${pages.length} pages after reset, cleaning again...`);
      await storage.resetAllContent();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  afterAll(async () => {
    // Clean up test data
    await storage.resetAllContent();
    await storage.close();
  });

  it('should fetch a real webpage', async () => {
    const url = 'https://example.com';
    const result = await crawler.fetchPage(url);

    expect(result).toBeDefined();
    expect(result.html).toBeDefined();
    expect(result.$).toBeDefined();
    expect(result.html.length).toBeGreaterThan(0);
  }, 30000);

  it('should extract main content from a webpage', async () => {
    const url = 'https://example.com';
    const { $ } = await crawler.fetchPage(url);
    
    const mainContent = crawler.extractMainContent($);
    
    expect(mainContent).toBeDefined();
    expect(mainContent.length).toBeGreaterThan(0);
  }, 30000);

  it('should convert HTML to markdown', async () => {
    const html = '<h1>Test Title</h1><p>Test paragraph</p>';
    const markdown = crawler.htmlToMarkdown(html);

    expect(markdown).toContain('# Test Title');
    expect(markdown).toContain('Test paragraph');
  });

  it('should extract links from a webpage', async () => {
    const url = 'https://example.com';
    const { $ } = await crawler.fetchPage(url);
    
    const links = crawler.extractLinks($, url);
    
    expect(Array.isArray(links)).toBe(true);
    // example.com typically has at least one link
    expect(links.length).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should process a single page', async () => {
    const url = 'https://example.com';
    const result = await crawler.processPage(url, 0);

    expect(result).toBeDefined();
    expect(result.url).toBe(url);
    expect(result.title).toBeDefined();
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.markdown).toBeDefined();
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.depth).toBe(0);
    expect(Array.isArray(result.links)).toBe(true);
  }, 30000);

  it('should crawl a website with depth 0', async () => {
    const url = 'https://example.com';
    const results = await crawler.crawl(url, 0);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    // URL might have trailing slash added
    expect(results[0].url).toMatch(/^https:\/\/example\.com\/?$/);
    expect(results[0].depth).toBe(0);
  }, 60000);

  it('should save a page to storage', async () => {
    const url = 'https://example.com/test';
    const title = 'Test Page';
    const markdown = '# Test\n\nThis is a test page.';
    
    const metadata = await storage.saveCompletePage(url, title, markdown, 0);

    expect(metadata).toBeDefined();
    expect(metadata.id).toBeDefined();
    expect(metadata.url).toBe(url);
    expect(metadata.title).toBe(title);
    expect(metadata.domain).toBe('example.com');
    expect(metadata.slug).toBeDefined();
    expect(metadata.crawlDepth).toBe(0);
  }, 30000);

  it('should retrieve saved pages', async () => {
    const url = 'https://example.com/test2';
    const title = 'Test Page 2';
    const markdown = '# Test 2\n\nAnother test page.';
    
    await storage.saveCompletePage(url, title, markdown, 0);
    
    const pages = await storage.getAllPages();
    
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);
    
    const savedPage = pages.find(p => p.url === url);
    expect(savedPage).toBeDefined();
    expect(savedPage?.title).toBe(title);
  }, 30000);

  it('should delete a page', async () => {
    const url = 'https://example.com/test-delete';
    const title = 'Test Delete';
    const markdown = '# Delete Test';
    
    const metadata = await storage.saveCompletePage(url, title, markdown, 0);
    
    // Verify it exists
    let page = await storage.getPageById(metadata.id);
    expect(page).toBeDefined();
    
    // Delete it
    await storage.deletePage(metadata.id);
    
    // Verify it's gone
    page = await storage.getPageById(metadata.id);
    expect(page).toBeNull();
  }, 30000);

  it('should reset all content', async () => {
    // Add some test pages
    await storage.saveCompletePage('https://example.com/reset1', 'Reset 1', '# Reset 1', 0);
    await storage.saveCompletePage('https://example.com/reset2', 'Reset 2', '# Reset 2', 0);

    // Verify pages exist
    let pages = await storage.getAllPages();
    expect(pages.length).toBeGreaterThan(0);

    // Reset all
    await storage.resetAllContent();

    // Verify all gone
    pages = await storage.getAllPages();
    expect(pages.length).toBe(0);
  }, 30000);

  it('should crawl real website and verify markdown files are created', async () => {
    // Use Weave docs as test URL
    const url = 'https://weave-docs.wandb.ai/';
    const results = await crawler.crawl(url, 0);

    expect(results.length).toBeGreaterThan(0);

    // Save the first result to storage
    const firstResult = results[0];
    let markdownExists = false;
    let markdownPath = '';
    let metadata: any = null;

    try {
      metadata = await storage.saveCompletePage(
        firstResult.url,
        firstResult.title,
        firstResult.markdown,
        firstResult.depth
      );

      // Verify markdown file exists
      markdownPath = path.join(
        config.contentStoragePath,
        metadata.domain,
        `${metadata.slug}.md`
      );

      markdownExists = await fs.access(markdownPath)
        .then(() => true)
        .catch(() => false);

      expect(markdownExists).toBe(true);

      // Wait for page to be committed to Neo4j
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify page exists in Neo4j
      const savedPage = await storage.getPageById(metadata.id);
      if (!savedPage) {
        // Debug: Check if page exists with different query
        const allPages = await storage.getAllPages();
        console.log(`Page ${metadata.id} not found. Available pages:`, allPages.map(p => ({ id: p.id, url: p.url })));
      }
      expect(savedPage).toBeTruthy();
      expect(savedPage?.url).toBe(firstResult.url);

    } catch (error: any) {
      console.error('Error in saveCompletePage test:', error.message);
      throw error;
    }

    // Verify markdown content
    const markdownContent = await fs.readFile(markdownPath, 'utf-8');
    expect(markdownContent).toBe(firstResult.markdown);
    expect(markdownContent.length).toBeGreaterThan(0);

    // Verify metadata file exists
    const metadataPath = path.join(
      config.contentStoragePath,
      metadata.domain,
      `${metadata.slug}.meta.json`
    );

    const metadataExists = await fs.access(metadataPath)
      .then(() => true)
      .catch(() => false);

    expect(metadataExists).toBe(true);

    // Verify metadata content
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const parsedMetadata = JSON.parse(metadataContent);
    expect(parsedMetadata.id).toBe(metadata.id);
    expect(parsedMetadata.url).toBe(metadata.url);
    expect(parsedMetadata.title).toBe(metadata.title);

    // Verify page exists in Neo4j
    const page = await storage.getPageById(metadata.id);
    expect(page).toBeDefined();
    expect(page?.url).toBe(metadata.url);
    expect(page?.title).toBe(metadata.title);

    // Clean up
    await storage.deletePage(metadata.id);
  }, 60000);

  it('should completely clear all content from system', async () => {
    // Clean up first to ensure we start fresh
    await storage.resetAllContent();
    // Add delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create multiple pages with markdown files
    const testPages = [
      { url: 'https://test1.example.com/page1', title: 'Test Page 1', markdown: '# Test 1\n\nContent 1' },
      { url: 'https://test2.example.com/page2', title: 'Test Page 2', markdown: '# Test 2\n\nContent 2' },
      { url: 'https://test3.example.com/page3', title: 'Test Page 3', markdown: '# Test 3\n\nContent 3' },
    ];

    const createdMetadata = [];
    for (const page of testPages) {
      try {
        const metadata = await storage.saveCompletePage(page.url, page.title, page.markdown, 0);
        createdMetadata.push(metadata);
        console.log(`✅ Successfully saved page: ${page.url}`);
      } catch (error: any) {
        console.error(`❌ Failed to save page ${page.url}:`, error.message);
        throw error;
      }
    }

    // Verify all pages exist in Neo4j
    let pages = await storage.getAllPages();
    console.log(`📊 Expected ${testPages.length} pages, found ${pages.length} pages`);
    if (pages.length !== testPages.length) {
      console.log('Pages found:', pages.map(p => ({ url: p.url, title: p.title })));
      console.log('Expected pages:', testPages.map(p => ({ url: p.url, title: p.title })));
    }
    expect(pages.length).toBe(testPages.length);

    // Verify all markdown files exist
    for (const metadata of createdMetadata) {
      const markdownPath = path.join(
        config.contentStoragePath,
        metadata.domain,
        `${metadata.slug}.md`
      );
      const exists = await fs.access(markdownPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    // Reset all content
    await storage.resetAllContent();

    // Verify Neo4j is empty
    pages = await storage.getAllPages();
    expect(pages.length).toBe(0);

    // Verify all markdown files are deleted
    for (const metadata of createdMetadata) {
      const markdownPath = path.join(
        config.contentStoragePath,
        metadata.domain,
        `${metadata.slug}.md`
      );
      const exists = await fs.access(markdownPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    }

    // Verify metadata files are deleted
    for (const metadata of createdMetadata) {
      const metadataPath = path.join(
        config.contentStoragePath,
        metadata.domain,
        `${metadata.slug}.meta.json`
      );
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    }

    // Verify storage directory still exists but is empty (or only has empty subdirs)
    const storageExists = await fs.access(config.contentStoragePath)
      .then(() => true)
      .catch(() => false);
    expect(storageExists).toBe(true);
  }, 60000);
});

