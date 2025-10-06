import { Router, Request, Response } from 'express';
import { WebCrawler } from '../services/webCrawler.js';
import { StorageService } from '../services/storageService.js';
import * as weave from 'weave';

const router = Router();

// In-memory storage for crawl jobs
interface CrawlJob {
  id: string;
  url: string;
  maxDepth: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
    currentUrl: string;
  };
  results?: any[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

const crawlJobs = new Map<string, CrawlJob>();

/**
 * POST /api/crawler/start
 * Start a new crawl job
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { url, maxDepth = 2 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Validate maxDepth
    if (maxDepth < 0 || maxDepth > 5) {
      return res.status(400).json({ error: 'maxDepth must be between 0 and 5' });
    }

    // Create job
    const jobId = `crawl-${Date.now()}`;
    const job: CrawlJob = {
      id: jobId,
      url,
      maxDepth,
      status: 'pending',
      progress: {
        total: 0,
        completed: 0,
        failed: 0,
        currentUrl: '',
      },
    };

    crawlJobs.set(jobId, job);

    // Start crawl in background
    startCrawl(jobId, url, maxDepth);

    res.json({
      jobId,
      status: 'pending',
      message: 'Crawl job started',
    });
  } catch (error: any) {
    console.error('Error starting crawl:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/crawler/status/:jobId
 * Get status of a crawl job
 */
router.get('/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = crawlJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    url: job.url,
    maxDepth: job.maxDepth,
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    resultsCount: job.results?.length || 0,
  });
});

/**
 * GET /api/crawler/jobs
 * Get all crawl jobs
 */
router.get('/jobs', (req: Request, res: Response) => {
  const jobs = Array.from(crawlJobs.values()).map(job => ({
    jobId: job.id,
    url: job.url,
    maxDepth: job.maxDepth,
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    resultsCount: job.results?.length || 0,
  }));

  res.json({ jobs });
});

/**
 * DELETE /api/crawler/reset
 * Reset all content
 */
router.delete('/reset', async (req: Request, res: Response) => {
  try {
    const storage = StorageService.getInstance();
    await storage.resetAllContent();

    // Clear all jobs
    crawlJobs.clear();

    res.json({ message: 'All content reset successfully' });
  } catch (error: any) {
    console.error('Error resetting content:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Weave-instrumented crawl job execution
 */
const executeCrawlJob = weave.op(async function executeCrawlJob(jobId: string, url: string, maxDepth: number) {
  return await _executeCrawlJobImpl(jobId, url, maxDepth);
}, { name: 'CrawlerRoutes.executeCrawlJob' });

/**
 * Implementation of crawl job execution
 */
async function _executeCrawlJobImpl(jobId: string, url: string, maxDepth: number) {
  const job = crawlJobs.get(jobId);
  if (!job) return;

  const crawler = new WebCrawler();
  const storage = StorageService.getInstance();

  try {
    // Update job status
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    // Set progress callback
    crawler.setProgressCallback((progress) => {
      job.progress = progress;
    });

    console.log(`[Crawl ${jobId}] Starting crawl of ${url} with maxDepth ${maxDepth}`);

    // Run crawl (this will create WebCrawler.crawl trace)
    const results = await crawler.crawl(url, maxDepth);

    console.log(`[Crawl ${jobId}] Crawl completed, processing ${results.length} pages`);

    // Save results to storage (this will create StorageService.saveCompletePage traces)
    for (const result of results) {
      try {
        await storage.saveCompletePage(
          result.url,
          result.title,
          result.markdown,
          result.depth
        );
      } catch (error: any) {
        console.error(`[Crawl ${jobId}] Failed to save page ${result.url}:`, error.message);
      }
    }

    // Update job status
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.results = results;

    console.log(`[Crawl ${jobId}] Job completed successfully`);
  } catch (error: any) {
    console.error(`[Crawl ${jobId}] Job failed:`, error);
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  }
}

/**
 * Background function to run the crawl (legacy wrapper)
 */
async function startCrawl(jobId: string, url: string, maxDepth: number) {
  return await executeCrawlJob(jobId, url, maxDepth);
}

export default router;

