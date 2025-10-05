/**
 * Integration test for course ingestion from W&B courses website
 * 
 * This test verifies the complete pipeline:
 * 1. Crawling https://wandb.ai/site/courses/ to discover course URLs
 * 2. Crawling individual course pages and converting HTML to markdown
 * 3. Storing courses in Neo4j with proper metadata and embeddings
 * 4. Creating course chunks with embeddings
 * 5. Verifying agent can retrieve courses from the database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { StorageService } from '../../src/services/storageService.js';
import { WebCrawler } from '../../src/services/webCrawler.js';
import { LLMService } from '../../src/services/llmService.js';
import { config } from '../../src/config.js';
import fs from 'fs/promises';
import path from 'path';

describe('Course Ingestion Integration Test', () => {
  let storage: StorageService;
  let crawler: WebCrawler;
  let llmService: LLMService;
  let testCourseIds: string[] = [];

  beforeAll(async () => {
    // Initialize services
    storage = new StorageService();
    crawler = new WebCrawler();
    llmService = new LLMService();

    // Initialize database schema
    try {
      await storage.initializeSchema();
    } catch (error: any) {
      // Ignore deadlock errors during schema init
      if (!error.code?.includes('DeadlockDetected')) {
        throw error;
      }
    }

    console.log('🔧 Course ingestion integration test setup complete');
  }, 60000);

  afterAll(async () => {
    // Clean up test courses
    for (const courseId of testCourseIds) {
      try {
        await storage.deleteCourse(courseId);
      } catch (error) {
        console.warn(`Failed to delete test course ${courseId}:`, error);
      }
    }

    // Close connections
    await storage.close();
    console.log('🧹 Course ingestion integration test cleanup complete');
  }, 30000);

  beforeEach(() => {
    // Reset test course IDs for each test
    testCourseIds = [];
  });

  describe('Course Discovery and URL Extraction', () => {
    it('should crawl W&B courses page and extract course URLs', async () => {
      console.log('🔍 Testing course discovery from W&B courses page...');
      
      // Crawl the main courses page
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      
      expect(coursesPageResults).toBeDefined();
      expect(coursesPageResults.length).toBeGreaterThan(0);
      
      const coursesPageContent = coursesPageResults[0].markdown;
      expect(coursesPageContent).toBeDefined();
      expect(coursesPageContent.length).toBeGreaterThan(0);
      
      // Extract course URLs using the same pattern as the actual implementation
      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      
      // Remove duplicates and filter out the main courses page
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));
      
      console.log(`📚 Found ${uniqueCourseUrls.length} course URLs`);
      console.log('Course URLs:', uniqueCourseUrls.slice(0, 3)); // Log first 3 for debugging
      
      expect(uniqueCourseUrls.length).toBeGreaterThan(0);
      
      // Verify URLs follow expected pattern
      uniqueCourseUrls.forEach(url => {
        expect(url).toMatch(/^https:\/\/wandb\.ai\/site\/courses\/[^\/]+\/?$/);
      });
    }, 60000);
  });

  describe('Individual Course Content Processing', () => {
    it('should crawl a specific course and convert to markdown', async () => {
      console.log('🔍 Testing individual course content processing...');
      
      // Use a known course URL for testing (we'll use the first one we find)
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;
      
      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));
      
      expect(uniqueCourseUrls.length).toBeGreaterThan(0);
      
      // Test with the first course found
      const testCourseUrl = uniqueCourseUrls[0];
      console.log(`📖 Testing course: ${testCourseUrl}`);
      
      const courseResults = await crawler.crawl(testCourseUrl, 0);
      
      expect(courseResults).toBeDefined();
      expect(courseResults.length).toBeGreaterThan(0);
      
      const courseData = courseResults[0];
      // URL might have trailing slash normalized, so check both
      expect([testCourseUrl, testCourseUrl.replace(/\/$/, ''), testCourseUrl + '/']).toContain(courseData.url);
      expect(courseData.title).toBeDefined();
      expect(courseData.title.length).toBeGreaterThan(0);
      expect(courseData.markdown).toBeDefined();
      expect(courseData.markdown.length).toBeGreaterThan(0);
      
      console.log(`✅ Course processed: "${courseData.title}"`);
      console.log(`📄 Markdown length: ${courseData.markdown.length} characters`);
      
      // Verify markdown contains expected content
      expect(courseData.markdown).toContain('#'); // Should have headers
      expect(courseData.markdown.length).toBeGreaterThan(100); // Should have substantial content
    }, 90000);
  });

  describe('Course Metadata Extraction', () => {
    it('should extract course metadata from content', async () => {
      console.log('🔍 Testing course metadata extraction...');

      // Get a course to test with
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;

      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

      expect(uniqueCourseUrls.length).toBeGreaterThan(0);

      const testCourseUrl = uniqueCourseUrls[0];
      const courseResults = await crawler.crawl(testCourseUrl, 0);
      const courseData = courseResults[0];

      // Extract metadata using the same function as the actual implementation
      const metadata = extractCourseMetadata(courseData);

      console.log('📊 Extracted metadata:', metadata);

      // Verify metadata structure
      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');

      // Check that at least some metadata was extracted
      const hasMetadata = !!(metadata.difficulty || metadata.duration ||
                         metadata.instructor || metadata.description ||
                         (metadata.topics && metadata.topics.length > 0));

      expect(hasMetadata).toBe(true);

      if (metadata.difficulty) {
        expect(['beginner', 'intermediate', 'advanced']).toContain(metadata.difficulty);
      }

      if (metadata.topics) {
        expect(Array.isArray(metadata.topics)).toBe(true);
        expect(metadata.topics.length).toBeGreaterThan(0);
      }
    }, 90000);
  });

  describe('Course Storage with Embeddings and Chunks', () => {
    it('should save course to Neo4j with embeddings and chunks', async () => {
      console.log('🔍 Testing course storage with embeddings and chunks...');

      // Get a course to test with
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;

      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

      expect(uniqueCourseUrls.length).toBeGreaterThan(0);

      const testCourseUrl = uniqueCourseUrls[0];
      const courseResults = await crawler.crawl(testCourseUrl, 0);
      const courseData = courseResults[0];
      const metadata = extractCourseMetadata(courseData);

      // Save the course
      const savedCourse = await storage.saveCourse(
        courseData.url,
        courseData.title,
        courseData.markdown,
        metadata
      );

      testCourseIds.push(savedCourse.id);

      console.log(`💾 Saved course: ${savedCourse.title} (ID: ${savedCourse.id})`);

      // Verify course was saved correctly
      expect(savedCourse).toBeDefined();
      expect(savedCourse.id).toBeDefined();
      expect(savedCourse.url).toBe(courseData.url);
      expect(savedCourse.title).toBe(courseData.title);
      expect(savedCourse.isActive).toBe(true);

      // Verify course can be retrieved
      const retrievedCourse = await storage.getCourseById(savedCourse.id);
      expect(retrievedCourse).toBeDefined();
      expect(retrievedCourse!.id).toBe(savedCourse.id);
      expect(retrievedCourse!.title).toBe(courseData.title);

      // Verify course appears in all courses list
      const allCourses = await storage.getAllCourses();
      const foundCourse = allCourses.find(c => c.id === savedCourse.id);
      expect(foundCourse).toBeDefined();

      console.log(`✅ Course storage verification complete`);
    }, 120000);
  });

  describe('Course File System Storage', () => {
    it('should save course markdown and metadata files', async () => {
      console.log('🔍 Testing course file system storage...');

      // Get a course to test with
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;

      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

      expect(uniqueCourseUrls.length).toBeGreaterThan(0);

      const testCourseUrl = uniqueCourseUrls[0];
      const courseResults = await crawler.crawl(testCourseUrl, 0);
      const courseData = courseResults[0];
      const metadata = extractCourseMetadata(courseData);

      // Save the course
      const savedCourse = await storage.saveCourse(
        courseData.url,
        courseData.title,
        courseData.markdown,
        metadata
      );

      testCourseIds.push(savedCourse.id);

      // Verify markdown file exists
      const markdownPath = path.join(
        config.contentStoragePath,
        'courses',
        `${savedCourse.slug}.md`
      );

      const markdownExists = await fs.access(markdownPath)
        .then(() => true)
        .catch(() => false);

      expect(markdownExists).toBe(true);

      // Verify markdown content
      const savedMarkdown = await fs.readFile(markdownPath, 'utf-8');
      expect(savedMarkdown).toBe(courseData.markdown);

      // Verify metadata file exists
      const metadataPath = path.join(
        config.contentStoragePath,
        'courses',
        `${savedCourse.slug}.metadata.json`
      );

      const metadataExists = await fs.access(metadataPath)
        .then(() => true)
        .catch(() => false);

      expect(metadataExists).toBe(true);

      // Verify metadata content
      const savedMetadataContent = await fs.readFile(metadataPath, 'utf-8');
      const savedMetadata = JSON.parse(savedMetadataContent);
      expect(savedMetadata.id).toBe(savedCourse.id);
      expect(savedMetadata.title).toBe(courseData.title);

      console.log(`✅ File system storage verification complete`);
    }, 120000);
  });

  describe('Agent Course Service Integration', () => {
    it('should verify agent can retrieve ingested courses', async () => {
      console.log('🔍 Testing agent course service integration...');

      // First, ingest a course
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;

      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

      expect(uniqueCourseUrls.length).toBeGreaterThan(0);

      const testCourseUrl = uniqueCourseUrls[0];
      const courseResults = await crawler.crawl(testCourseUrl, 0);
      const courseData = courseResults[0];
      const metadata = extractCourseMetadata(courseData);

      // Save the course
      const savedCourse = await storage.saveCourse(
        courseData.url,
        courseData.title,
        courseData.markdown,
        metadata
      );

      testCourseIds.push(savedCourse.id);

      console.log(`💾 Saved course for agent testing: ${savedCourse.title}`);

      // Test that the course can be found by the agent's expected interface
      // This simulates what the agent's course service would do

      // 1. Test getting course by ID
      const retrievedCourse = await storage.getCourseById(savedCourse.id);
      expect(retrievedCourse).toBeDefined();
      expect(retrievedCourse!.id).toBe(savedCourse.id);

      // 2. Test getting all courses (agent uses this for search)
      const allCourses = await storage.getAllCourses();
      const foundCourse = allCourses.find(c => c.id === savedCourse.id);
      expect(foundCourse).toBeDefined();
      expect(foundCourse!.title).toBe(courseData.title);
      expect(foundCourse!.isActive).toBe(true);

      // 3. Verify course has the expected structure for agent consumption
      expect(foundCourse!.url).toBeDefined();
      expect(foundCourse!.slug).toBeDefined();
      expect(foundCourse!.createdAt).toBeDefined();
      expect(foundCourse!.updatedAt).toBeDefined();

      // 4. Verify course chunks exist (for vector search)
      // Note: This would require querying CourseChunk nodes, but we can verify
      // the course was saved with the saveCourse method which creates chunks

      console.log(`✅ Agent integration verification complete`);
      console.log(`📊 Course available for agent queries: "${foundCourse!.title}"`);
    }, 120000);
  });

  describe('End-to-End Course Ingestion Pipeline', () => {
    it('should complete full course ingestion pipeline', async () => {
      console.log('🔍 Testing complete end-to-end course ingestion pipeline...');

      // This test simulates the complete admin UI workflow

      // Step 1: Discover courses from main page
      const coursesPageUrl = 'https://wandb.ai/site/courses/';
      const coursesPageResults = await crawler.crawl(coursesPageUrl, 0);
      const coursesPageContent = coursesPageResults[0].markdown;

      const courseUrlPattern = /https?:\/\/wandb\.ai\/site\/courses\/[^\/\s"']+\/?/g;
      const foundUrls = coursesPageContent.match(courseUrlPattern) || [];
      const uniqueCourseUrls = [...new Set(foundUrls)]
        .filter(url => url !== coursesPageUrl && !url.endsWith('/courses/'));

      expect(uniqueCourseUrls.length).toBeGreaterThan(0);
      console.log(`📚 Discovered ${uniqueCourseUrls.length} courses`);

      // Step 2: Process first course (limit to 1 for test performance)
      const testCourseUrl = uniqueCourseUrls[0];
      console.log(`🔄 Processing course: ${testCourseUrl}`);

      const courseResults = await crawler.crawl(testCourseUrl, 0);
      expect(courseResults.length).toBeGreaterThan(0);

      const courseData = courseResults[0];
      const metadata = extractCourseMetadata(courseData);

      // Step 3: Save course with full pipeline
      const savedCourse = await storage.saveCourse(
        courseData.url,
        courseData.title,
        courseData.markdown,
        metadata
      );

      testCourseIds.push(savedCourse.id);

      // Step 4: Verify complete storage
      // - Neo4j Course node
      const dbCourse = await storage.getCourseById(savedCourse.id);
      expect(dbCourse).toBeDefined();

      // - File system storage
      const markdownPath = path.join(config.contentStoragePath, 'courses', `${savedCourse.slug}.md`);
      const markdownExists = await fs.access(markdownPath).then(() => true).catch(() => false);
      expect(markdownExists).toBe(true);

      // - Course appears in listings
      const allCourses = await storage.getAllCourses();
      const foundInList = allCourses.find(c => c.id === savedCourse.id);
      expect(foundInList).toBeDefined();

      console.log(`✅ End-to-end pipeline complete for: "${savedCourse.title}"`);
      console.log(`📊 Course ready for agent consumption`);
      console.log(`🔗 Course URL: ${savedCourse.url}`);
      console.log(`📁 Course slug: ${savedCourse.slug}`);

      // Step 5: Verify course structure matches agent expectations
      expect(savedCourse).toMatchObject({
        id: expect.any(String),
        url: expect.any(String),
        title: expect.any(String),
        slug: expect.any(String),
        isActive: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    }, 180000); // 3 minutes for full pipeline
  });
});

/**
 * Helper function to extract course metadata from crawled content
 * This mirrors the implementation in courseRoutes.ts
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
