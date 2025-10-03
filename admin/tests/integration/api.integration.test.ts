import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import crawlerRoutes from '../../src/routes/crawlerRoutes.js';
import contentRoutes from '../../src/routes/contentRoutes.js';
import { StorageService } from '../../src/services/storageService.js';

/**
 * Integration tests for API endpoints
 * These tests use real services and database
 */
describe('API Integration Tests', () => {
  let app: express.Application;
  let storage: StorageService;

  beforeAll(async () => {
    // Create Express app
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/crawler', crawlerRoutes);
    app.use('/api/content', contentRoutes);

    // Initialize storage
    storage = new StorageService();
    // Add delay to avoid concurrent schema initialization with other test suites
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      await storage.initializeSchema();
    } catch (error: any) {
      // Ignore deadlock errors during schema init - constraints may already exist
      if (!error.code?.includes('DeadlockDetected')) {
        throw error;
      }
    }
    // Ensure clean state
    await storage.resetAllContent();
    // Add additional delay to ensure cleanup is complete
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
    await storage.resetAllContent();
    await storage.close();
  });

  describe('Content API', () => {
    it('GET /api/content/pages - should return empty array initially', async () => {
      const response = await request(app)
        .get('/api/content/pages')
        .expect(200);

      expect(response.body).toHaveProperty('pages');
      expect(Array.isArray(response.body.pages)).toBe(true);
      expect(response.body.pages.length).toBe(0);
    });

    it('GET /api/content/stats - should return stats', async () => {
      const response = await request(app)
        .get('/api/content/stats')
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalPages');
      expect(response.body.stats).toHaveProperty('domains');
      expect(response.body.stats).toHaveProperty('byDomain');
      expect(response.body.stats).toHaveProperty('byDepth');
    });

    it('should create and retrieve a page', async () => {
      // Clean up first
      await storage.resetAllContent();

      // Create a page directly via storage
      const metadata = await storage.saveCompletePage(
        'https://example.com/test',
        'Test Page',
        '# Test\n\nTest content',
        0
      );

      // Retrieve all pages
      const response = await request(app)
        .get('/api/content/pages')
        .expect(200);

      expect(response.body.pages.length).toBe(1);
      expect(response.body.pages[0].id).toBe(metadata.id);
      expect(response.body.pages[0].title).toBe('Test Page');

      // Clean up after
      await storage.resetAllContent();
    });

    it('GET /api/content/pages/:id - should return specific page', async () => {
      const metadata = await storage.saveCompletePage(
        'https://example.com/test2',
        'Test Page 2',
        '# Test 2',
        0
      );

      // Wait a bit for the page to be fully committed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the page exists first
      const allPages = await storage.getAllPages();
      const pageExists = allPages.some(p => p.id === metadata.id);
      if (!pageExists) {
        console.warn(`Page ${metadata.id} not found in getAllPages, available pages:`, allPages.map(p => p.id));
      }

      const response = await request(app)
        .get(`/api/content/pages/${metadata.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('page');
      expect(response.body.page.id).toBe(metadata.id);
      expect(response.body.page.title).toBe('Test Page 2');
    });

    it('GET /api/content/pages/:id - should return 404 for non-existent page', async () => {
      const response = await request(app)
        .get('/api/content/pages/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('GET /api/content/pages/:id/markdown - should return page with markdown', async () => {
      const markdown = '# Test Markdown\n\nThis is test content.';
      const metadata = await storage.saveCompletePage(
        'https://example.com/markdown-test',
        'Markdown Test',
        markdown,
        0
      );

      const response = await request(app)
        .get(`/api/content/pages/${metadata.id}/markdown`)
        .expect(200);

      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('markdown');
      expect(response.body.markdown).toBe(markdown);
    });

    it('DELETE /api/content/pages/:id - should delete a page', async () => {
      const metadata = await storage.saveCompletePage(
        'https://example.com/delete-test',
        'Delete Test',
        '# Delete',
        0
      );

      // Delete the page
      await request(app)
        .delete(`/api/content/pages/${metadata.id}`)
        .expect(200);

      // Verify it's gone
      await request(app)
        .get(`/api/content/pages/${metadata.id}`)
        .expect(404);
    });
  });

  describe('Crawler API', () => {
    it('POST /api/crawler/start - should reject invalid URL', async () => {
      const response = await request(app)
        .post('/api/crawler/start')
        .send({ url: 'not-a-url' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('POST /api/crawler/start - should reject missing URL', async () => {
      const response = await request(app)
        .post('/api/crawler/start')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('URL is required');
    });

    it('POST /api/crawler/start - should reject invalid maxDepth', async () => {
      const response = await request(app)
        .post('/api/crawler/start')
        .send({ url: 'https://example.com', maxDepth: 10 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('maxDepth');
    });

    it('POST /api/crawler/start - should start a crawl job', async () => {
      const response = await request(app)
        .post('/api/crawler/start')
        .send({ url: 'https://example.com', maxDepth: 0 })
        .expect(200);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('pending');
    });

    it('GET /api/crawler/status/:jobId - should return job status', async () => {
      // Start a job
      const startResponse = await request(app)
        .post('/api/crawler/start')
        .send({ url: 'https://example.com', maxDepth: 0 })
        .expect(200);

      const jobId = startResponse.body.jobId;

      // Get status
      const statusResponse = await request(app)
        .get(`/api/crawler/status/${jobId}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('jobId');
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('progress');
      expect(statusResponse.body.jobId).toBe(jobId);
    });

    it('GET /api/crawler/status/:jobId - should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/api/crawler/status/non-existent-job')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('GET /api/crawler/jobs - should return all jobs', async () => {
      const response = await request(app)
        .get('/api/crawler/jobs')
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(Array.isArray(response.body.jobs)).toBe(true);
    });

    it('DELETE /api/crawler/reset - should reset all content', async () => {
      // Add some test data
      await storage.saveCompletePage(
        'https://example.com/reset-test',
        'Reset Test',
        '# Reset',
        0
      );

      // Reset
      const response = await request(app)
        .delete('/api/crawler/reset')
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify content is gone
      const pagesResponse = await request(app)
        .get('/api/content/pages')
        .expect(200);

      expect(pagesResponse.body.pages.length).toBe(0);
    });

    it('should complete a full crawl workflow', async () => {
      // Start crawl
      const startResponse = await request(app)
        .post('/api/crawler/start')
        .send({ url: 'https://example.com', maxDepth: 0 })
        .expect(200);

      const jobId = startResponse.body.jobId;

      // Poll until complete (with timeout)
      let attempts = 0;
      let status = 'pending';
      let lastStatus: any = null;

      while (attempts < 60 && status !== 'completed' && status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResponse = await request(app)
          .get(`/api/crawler/status/${jobId}`)
          .expect(200);

        status = statusResponse.body.status;
        lastStatus = statusResponse.body;
        attempts++;
      }

      expect(status).toBe('completed');
      expect(lastStatus.resultsCount).toBeGreaterThan(0);

      // Wait a bit more for pages to be saved to database
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify pages were created
      const pagesResponse = await request(app)
        .get('/api/content/pages')
        .expect(200);

      expect(pagesResponse.body.pages.length).toBeGreaterThan(0);
    }, 120000); // 2 minute timeout for full crawl
  });
});

