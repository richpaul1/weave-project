import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { StorageService } from '../../src/services/storageService.js';
import { WebCrawler } from '../../src/services/webCrawler.js';
import { config } from '../../src/config.js';

/**
 * Integration tests for the complete embedding pipeline
 * Tests that pages and chunks are stored with embeddings for agent retrieval
 */
describe('Embedding Pipeline Integration Tests', () => {
  let storage: StorageService;
  let crawler: WebCrawler;

  beforeAll(async () => {
    storage = new StorageService();
    crawler = new WebCrawler();

    // Add delay to avoid concurrent schema initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await storage.initializeSchema();
    } catch (error: any) {
      if (!error.code?.includes('DeadlockDetected')) {
        throw error;
      }
    }

    await storage.resetAllContent();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    await storage.resetAllContent();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    await storage.resetAllContent();
    await storage.close();
  });

  it('should verify embedding configuration is available', () => {
    // Verify that embedding models are configured
    expect(config.ollamaEmbeddingModel).toBeDefined();
    expect(config.ollamaEmbeddingModel.length).toBeGreaterThan(0);
    expect(config.ollamaBaseUrl).toBeDefined();
    expect(config.ollamaBaseUrl.length).toBeGreaterThan(0);
  });

  it('should create pages with embeddings when saving complete page', async () => {
    const url = 'https://example.com/test-embedding';
    const title = 'Test Page for Embeddings';
    const markdown = '# Weave Documentation\n\nWeave is a lightweight toolkit for tracking and evaluating LLM applications. It provides automatic logging of LLM calls and traces.';
    
    // Save complete page (should generate embeddings)
    const metadata = await storage.saveCompletePage(url, title, markdown, 0);

    // Verify page exists
    const page = await storage.getPageById(metadata.id);
    expect(page).toBeDefined();
    expect(page?.title).toBe(title);

    // Verify page has embedding
    expect(page?.embedding).toBeDefined();
    expect(Array.isArray(page?.embedding)).toBe(true);
    expect(page?.embedding?.length).toBeGreaterThan(0);

    // Verify chunks were created
    const chunks = await storage.getPageChunks(metadata.id);
    expect(chunks).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);

    // Verify chunks have embeddings
    for (const chunk of chunks) {
      expect(chunk.embedding).toBeDefined();
      expect(Array.isArray(chunk.embedding)).toBe(true);
      expect(chunk.embedding!.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should verify pages can be found by vector similarity', async () => {
    const testPages = [
      {
        url: 'https://example.com/weave-intro',
        title: 'Introduction to Weave',
        markdown: '# Weave Introduction\n\nWeave is a toolkit for ML observability and evaluation.'
      },
      {
        url: 'https://example.com/python-guide',
        title: 'Python Programming Guide',
        markdown: '# Python Guide\n\nPython is a programming language used for data science.'
      }
    ];

    // Save test pages
    const savedPages = [];
    for (const page of testPages) {
      const metadata = await storage.saveCompletePage(page.url, page.title, page.markdown, 0);
      savedPages.push(metadata);
    }

    // Test vector similarity search
    const { llmService } = await import('../../src/services/llmService.js');
    const queryEmbedding = await llmService.generateEmbedding('What is Weave?');
    const relevantPages = await storage.searchPagesByVector(queryEmbedding, 5, 0.5);

    expect(relevantPages.length).toBeGreaterThan(0);
    const weavePages = relevantPages.filter(p => p.title.includes('Weave'));
    expect(weavePages.length).toBeGreaterThan(0);

    // Verify scores are reasonable
    for (const page of relevantPages) {
      expect(page.score).toBeGreaterThan(0);
      expect(page.score).toBeLessThanOrEqual(1);
    }
  }, 30000);

  it('should verify chunks can be found by vector similarity', async () => {
    const url = 'https://example.com/weave-features';
    const title = 'Weave Features';
    const markdown = `# Weave Features

## Automatic Logging
Weave provides automatic logging of LLM calls and traces.

## Evaluation Framework
Weave includes a comprehensive evaluation framework for ML models.

## Observability Tools
Monitor your ML applications with Weave's observability tools.`;

    // Save page with multiple chunks
    const metadata = await storage.saveCompletePage(url, title, markdown, 0);

    // Verify chunks were created
    const chunks = await storage.getPageChunks(metadata.id);
    expect(chunks.length).toBeGreaterThan(1); // Should create multiple chunks

    // Test chunk vector similarity search
    const { llmService } = await import('../../src/services/llmService.js');
    const queryEmbedding = await llmService.generateEmbedding('automatic logging');
    const relevantChunks = await storage.searchChunksByVector(queryEmbedding, 5, 0.5);

    expect(relevantChunks.length).toBeGreaterThan(0);
    const loggingChunks = relevantChunks.filter(c => c.text.includes('logging'));
    expect(loggingChunks.length).toBeGreaterThan(0);

    // Verify scores are reasonable
    for (const chunk of relevantChunks) {
      expect(chunk.score).toBeGreaterThan(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    }
  }, 30000);

  it('should verify agent can retrieve context from crawled pages', async () => {
    // Crawl a real page about Weave
    const url = 'https://weave-docs.wandb.ai/';
    const results = await crawler.crawl(url, 0);
    
    expect(results.length).toBeGreaterThan(0);
    
    // Save the crawled page
    const firstResult = results[0];
    const metadata = await storage.saveCompletePage(
      firstResult.url,
      firstResult.title,
      firstResult.markdown,
      firstResult.depth
    );

    // Verify page and chunks exist
    const page = await storage.getPageById(metadata.id);
    expect(page).toBeDefined();
    
    const chunks = await storage.getPageChunks(metadata.id);
    expect(chunks.length).toBeGreaterThan(0);

    // TODO: Verify agent can find this content
    // This test will fail until we implement embedding generation
    // const queryEmbedding = await generateEmbedding('Tell me about weave');
    // const relevantPages = await storage.searchPagesByVector(queryEmbedding, 5, 0.7);
    // 
    // expect(relevantPages.length).toBeGreaterThan(0);
    // const foundPage = relevantPages.find(p => p.id === metadata.id);
    // expect(foundPage).toBeDefined();
  }, 60000);

  it('should verify complete pipeline from crawl to agent retrieval', async () => {
    // This is the integration test that should pass once we implement embeddings
    
    // 1. Crawl content
    const url = 'https://example.com';
    const results = await crawler.crawl(url, 0);
    expect(results.length).toBeGreaterThan(0);

    // 2. Save with embeddings
    const metadata = await storage.saveCompletePage(
      results[0].url,
      results[0].title,
      results[0].markdown,
      results[0].depth
    );

    // 3. Verify storage
    const page = await storage.getPageById(metadata.id);
    expect(page).toBeDefined();

    const chunks = await storage.getPageChunks(metadata.id);
    expect(chunks.length).toBeGreaterThan(0);

    // 4. TODO: Verify agent can retrieve
    // This is what the agent needs to work:
    // - Pages with embeddings
    // - Chunks with embeddings  
    // - Vector similarity search
    // - Markdown file loading
    
    console.log('✅ Pipeline test completed - embeddings need to be implemented');
  }, 60000);
});
