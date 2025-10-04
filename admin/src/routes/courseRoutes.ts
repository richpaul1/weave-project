import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storageService.js';
import { WebCrawler } from '../services/webCrawler.js';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/courses
 * Get all courses
 */
router.get('/', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const courses = await storage.getAllCourses();
    res.json(courses);
  } catch (error: any) {
    console.error('Error getting courses:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/courses/stats
 * Get course statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const courses = await storage.getAllCourses();
    
    // Calculate stats
    const activeCourses = courses.filter(c => c.isActive);
    const lastCrawled = courses.reduce((latest, course) => {
      if (!course.lastCrawledAt) return latest;
      const crawledAt = new Date(course.lastCrawledAt);
      return !latest || crawledAt > latest ? crawledAt : latest;
    }, null as Date | null);

    // Get total chunks count from Neo4j
    const session = storage.driver.session();
    let totalChunks = 0;
    try {
      const result = await session.run('MATCH (cc:CourseChunk) RETURN count(cc) as count');
      totalChunks = result.records[0]?.get('count').toNumber() || 0;
    } finally {
      await session.close();
    }

    const stats = {
      totalCourses: courses.length,
      activeCourses: activeCourses.length,
      totalChunks,
      lastCrawled: lastCrawled?.toISOString(),
      byDifficulty: courses.reduce((acc, course) => {
        const difficulty = course.difficulty || 'unknown';
        acc[difficulty] = (acc[difficulty] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byInstructor: courses.reduce((acc, course) => {
        const instructor = course.instructor || 'unknown';
        acc[instructor] = (acc[instructor] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error getting course stats:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/courses/search
 * Search courses by query with vector similarity and text matching
 */
router.get('/search', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();

  try {
    const { q: query, difficulty, instructor, limit = '10', useVector = 'true' } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const limitNum = parseInt(limit as string, 10) || 10;
    let useVectorSearch = useVector === 'true';

    let searchResults: any[] = [];

    if (useVectorSearch) {
      // Use vector similarity search for semantic matching
      try {
        searchResults = await storage.searchSimilarCourses(query, limitNum * 2); // Get more for filtering
      } catch (error) {
        console.warn('Vector search failed, falling back to text search:', error);
        useVectorSearch = false;
      }
    }

    if (!useVectorSearch || searchResults.length === 0) {
      // Fallback to text-based search
      const allCourses = await storage.getAllCourses();
      searchResults = allCourses.filter(course => {
        return course.title.toLowerCase().includes(query.toLowerCase()) ||
               course.description?.toLowerCase().includes(query.toLowerCase()) ||
               course.topics?.some(topic => topic.toLowerCase().includes(query.toLowerCase()));
      });
    }

    // Apply additional filters
    let filteredCourses = searchResults.filter(course => {
      const matchesDifficulty = !difficulty || course.difficulty === difficulty;
      const matchesInstructor = !instructor || course.instructor === instructor;
      return matchesDifficulty && matchesInstructor;
    });

    // Limit results
    filteredCourses = filteredCourses.slice(0, limitNum);

    res.json({
      query,
      filters: { difficulty, instructor },
      searchMethod: useVectorSearch ? 'vector' : 'text',
      results: filteredCourses,
      total: filteredCourses.length
    });
  } catch (error: any) {
    console.error('Error searching courses:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/courses/:id
 * Get course by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    const course = await storage.getCourseById(id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error: any) {
    console.error('Error getting course:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/courses/:id/markdown
 * Get course markdown content
 */
router.get('/:id/markdown', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    const course = await storage.getCourseById(id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Read markdown file
    const markdownPath = path.join(
      config.contentStoragePath,
      'courses',
      `${course.slug}.md`
    );

    const markdown = await fs.readFile(markdownPath, 'utf-8');

    res.json({
      course,
      markdown,
    });
  } catch (error: any) {
    console.error('Error getting course markdown:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * DELETE /api/courses/:id
 * Delete a course
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    await storage.deleteCourse(id);

    res.json({ message: 'Course deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * POST /api/courses/crawl
 * Start crawling courses from W&B courses page
 */
router.post('/crawl', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  const crawler = new WebCrawler();
  
  try {
    console.log('🔍 Starting course discovery crawl...');
    
    // First, crawl the main courses page to discover course URLs
    const coursesPageUrl = 'https://wandb.ai/site/courses/';
    const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
    
    if (coursesPageResults.length === 0) {
      return res.status(500).json({ error: 'Failed to crawl courses page' });
    }

    const coursesPageContent = coursesPageResults[0].markdown;
    
    // Extract course URLs from the content
    // Look for links that match the pattern /site/courses/[course-name]
    const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
    const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
    
    // Remove duplicates and filter out the main courses page
    const uniqueCourseUrls = [...new Set(foundUrls)]
      .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

    console.log(`📚 Found ${uniqueCourseUrls.length} course URLs to crawl`);

    let successCount = 0;
    let errorCount = 0;

    // Crawl each individual course
    for (const courseUrl of uniqueCourseUrls) {
      try {
        console.log(`🔍 Crawling course: ${courseUrl}`);
        
        const courseResults = await crawler.crawl(courseUrl, 0);
        
        if (courseResults.length > 0) {
          const courseData = courseResults[0];
          
          // Extract course metadata from the content
          const metadata = extractCourseMetadata(courseData);

          // Save the course
          await storage.saveCourse(
            courseData.url,
            courseData.title,
            courseData.markdown,
            metadata
          );
          
          successCount++;
          console.log(`✅ Successfully saved course: ${courseData.title}`);
        } else {
          console.warn(`⚠️ No content found for course: ${courseUrl}`);
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ Error crawling course ${courseUrl}:`, error);
        errorCount++;
      }
    }

    console.log(`🎉 Course crawling completed: ${successCount} successful, ${errorCount} errors`);

    res.json({
      message: 'Course crawling completed',
      coursesFound: uniqueCourseUrls.length,
      successful: successCount,
      errors: errorCount,
      urls: uniqueCourseUrls
    });
  } catch (error: any) {
    console.error('Error during course crawling:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * Helper function to extract course metadata from crawled content
 */
function extractCourseMetadata(courseData: any) {
  const content = courseData.markdown.toLowerCase();
  
  // Extract difficulty
  let difficulty: 'beginner' | 'intermediate' | 'advanced' | undefined;
  if (content.includes('beginner')) difficulty = 'beginner';
  else if (content.includes('intermediate')) difficulty = 'intermediate';
  else if (content.includes('advanced')) difficulty = 'advanced';
  
  // Extract duration (look for patterns like "2 hours", "30 minutes", etc.)
  const durationMatch = content.match(/(\d+)\s*(hour|hr|minute|min)s?/i);
  const duration = durationMatch ? durationMatch[0] : undefined;
  
  // Extract instructor (look for "instructor:", "by:", "taught by", etc.)
  const instructorMatch = content.match(/(?:instructor|by|taught by):\s*([^\n\r.]+)/i);
  const instructor = instructorMatch ? instructorMatch[1].trim() : undefined;
  
  // Extract topics/tags (this is basic - could be enhanced)
  const topics: string[] = [];
  const topicKeywords = ['python', 'machine learning', 'deep learning', 'ai', 'data science', 'mlops', 'wandb', 'weights & biases'];
  topicKeywords.forEach(keyword => {
    if (content.includes(keyword)) {
      topics.push(keyword);
    }
  });
  
  // Extract description (first paragraph or first sentence)
  const lines = courseData.markdown.split('\n').filter(line => line.trim());
  const description = lines.find(line => 
    line.length > 50 && 
    !line.startsWith('#') && 
    !line.startsWith('*') && 
    !line.startsWith('-')
  )?.substring(0, 200);
  
  return {
    difficulty,
    duration,
    instructor,
    topics: topics.length > 0 ? topics : undefined,
    description
  };
}

export default router;
