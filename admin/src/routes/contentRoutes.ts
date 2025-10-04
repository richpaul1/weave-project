import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storageService.js';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/content/pages
 * Get all pages
 */
router.get('/pages', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const pages = await storage.getAllPages();
    res.json({ pages });
  } catch (error: any) {
    console.error('Error getting pages:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/content/pages/:id
 * Get page by ID
 */
router.get('/pages/:id', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    const page = await storage.getPageById(id);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({ page });
  } catch (error: any) {
    console.error('Error getting page:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/content/pages/:id/markdown
 * Get page markdown content
 */
router.get('/pages/:id/markdown', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    const page = await storage.getPageById(id);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Read markdown file
    const markdownPath = path.join(
      config.contentStoragePath,
      page.domain,
      `${page.slug}.md`
    );

    const markdown = await fs.readFile(markdownPath, 'utf-8');

    res.json({
      page,
      markdown,
    });
  } catch (error: any) {
    console.error('Error getting markdown:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * DELETE /api/content/pages/:id
 * Delete a page
 */
router.delete('/pages/:id', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    await storage.deletePage(id);

    res.json({ message: 'Page deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting page:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/content/stats
 * Get content statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const pages = await storage.getAllPages();

    // Calculate stats
    const stats = {
      totalPages: pages.length,
      domains: [...new Set(pages.map(p => p.domain))].length,
      byDomain: pages.reduce((acc, page) => {
        acc[page.domain] = (acc[page.domain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byDepth: pages.reduce((acc, page) => {
        const depth = page.crawlDepth.toString();
        acc[depth] = (acc[depth] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    res.json({ stats });
  } catch (error: any) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

export default router;

