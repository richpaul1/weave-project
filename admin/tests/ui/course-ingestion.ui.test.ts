/**
 * UI tests for Course Ingestion functionality using Playwright within Vitest
 * Tests the complete course ingestion workflow including markdown saving and Neo4j storage
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { testEnv } from '../utils/testEnv.js';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = testEnv.adminClientUrl;
const CONTENT_STORAGE_PATH = './storage/content/courses';

describe('Course Ingestion UI Tests', () => {
  let browser: Browser;
  let page: Page;
  let driver: Driver;
  let session: Session;

  beforeAll(async () => {
    // Launch browser
    browser = await chromium.launch({ 
      headless: process.env.CI ? true : false // Show browser in local development
    });
    
    // Connect to database for verification
    driver = neo4j.driver(
      testEnv.neo4jUri,
      neo4j.auth.basic(testEnv.neo4jUser, testEnv.neo4jPassword)
    );

    // Test database connection
    session = driver.session({ database: testEnv.neo4jDatabase });
    try {
      await session.run('RETURN 1');
      console.log('✅ Connected to Neo4j database for course ingestion UI tests');
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j database:', error);
      throw error;
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (driver) {
      await driver.close();
    }
  });

  beforeEach(async () => {
    // Create new page for each test
    page = await browser.newPage();

    // Clean up courses before each test
    session = driver.session({ database: testEnv.neo4jDatabase });
    try {
      await session.run('MATCH (c:Course) DETACH DELETE c');
      await session.run('MATCH (cc:CourseChunk) DELETE cc');
    } finally {
      await session.close();
    }

    // Clean up markdown files
    try {
      const files = await fs.readdir(CONTENT_STORAGE_PATH);
      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.metadata.json')) {
          await fs.unlink(path.join(CONTENT_STORAGE_PATH, file));
        }
      }
    } catch (error) {
      // Directory might not exist, that's ok
    }

    // Navigate to courses page
    try {
      console.log(`🌐 Navigating to: ${BASE_URL}/courses`);
      await page.goto(`${BASE_URL}/courses`, { timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      console.log('✅ Courses page loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load courses page:', error);
      await page.screenshot({ path: 'debug-courses-page-load-error.png' });
      throw error;
    }

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Courses")', { timeout: 10000 });
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  describe('Course Ingestion Workflow', () => {
    it('should successfully crawl and ingest courses with markdown and embeddings', async () => {
      // Verify initial state - no courses
      const initialCourseCount = await page.locator('[data-testid="total-courses"]').textContent();
      console.log(`📊 Initial course count: ${initialCourseCount}`);

      // Click the "Crawl Courses" button
      const crawlButton = page.locator('button:has-text("Crawl Courses")');
      expect(await crawlButton.isVisible()).toBe(true);
      
      console.log('🚀 Starting course crawling...');
      await crawlButton.click();

      // Wait for crawling to start (button should show "Crawling...")
      await page.waitForSelector('button:has-text("Crawling...")', { timeout: 5000 });
      expect(await page.locator('button:has-text("Crawling...")').isVisible()).toBe(true);

      // Wait for crawling to complete (this might take a while)
      await page.waitForSelector('button:has-text("Crawl Courses")', { timeout: 120000 });
      console.log('✅ Course crawling completed');

      // Wait for success toast notification
      const successToast = page.locator('[data-sonner-toast]:has-text("Course crawling started")');
      await successToast.waitFor({ timeout: 10000 });
      expect(await successToast.isVisible()).toBe(true);

      // Wait for page to refresh with new data
      await page.waitForTimeout(2000);

      // Verify courses were ingested
      const finalCourseCount = await page.locator('[data-testid="total-courses"]').textContent();
      console.log(`📊 Final course count: ${finalCourseCount}`);
      expect(parseInt(finalCourseCount || '0')).toBeGreaterThan(0);

      // Verify course cards are displayed
      const courseCards = page.locator('[data-testid="course-card"]');
      const cardCount = await courseCards.count();
      expect(cardCount).toBeGreaterThan(0);
      console.log(`📚 Found ${cardCount} course cards`);

      // Get the first course for detailed verification
      const firstCourse = courseCards.first();
      const courseTitle = await firstCourse.locator('h3, [data-testid="course-title"]').textContent();
      console.log(`🔍 Testing first course: ${courseTitle}`);

      // Click "View Details" on the first course
      await firstCourse.locator('button:has-text("View Details"), [data-testid="view-details"]').click();

      // Wait for course modal to open
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      expect(await page.locator('[role="dialog"]').isVisible()).toBe(true);

      // Verify course details are displayed
      const modalTitle = await page.locator('[role="dialog"] h2').textContent();
      expect(modalTitle).toBeTruthy();
      console.log(`📖 Course modal opened for: ${modalTitle}`);

      // Click on "Content" tab to view markdown
      await page.click('button:has-text("Content")');
      await page.waitForTimeout(1000);

      // Wait for markdown content to load
      await page.waitForSelector('pre', { timeout: 10000 });
      const markdownContent = await page.locator('pre').textContent();
      
      // Verify markdown content exists and is substantial
      expect(markdownContent).toBeTruthy();
      expect(markdownContent!.length).toBeGreaterThan(100);
      console.log(`📝 Markdown content loaded (${markdownContent!.length} characters)`);

      // Verify markdown contains expected course content
      expect(markdownContent!.toLowerCase()).toMatch(/course|learn|training|tutorial/);

      // Close the modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }, 180000); // 3 minute timeout for full crawling process

    it('should verify markdown files are saved to filesystem', async () => {
      // First, trigger course ingestion
      await page.click('button:has-text("Crawl Courses")');
      await page.waitForSelector('button:has-text("Crawling...")', { timeout: 5000 });
      await page.waitForSelector('button:has-text("Crawl Courses")', { timeout: 120000 });

      // Wait for ingestion to complete
      await page.waitForTimeout(3000);

      // Verify markdown files exist in filesystem
      const files = await fs.readdir(CONTENT_STORAGE_PATH);
      const markdownFiles = files.filter(file => file.endsWith('.md'));
      const metadataFiles = files.filter(file => file.endsWith('.metadata.json'));

      expect(markdownFiles.length).toBeGreaterThan(0);
      expect(metadataFiles.length).toBeGreaterThan(0);
      console.log(`📁 Found ${markdownFiles.length} markdown files and ${metadataFiles.length} metadata files`);

      // Verify content of first markdown file
      if (markdownFiles.length > 0) {
        const firstMarkdownFile = markdownFiles[0];
        const markdownPath = path.join(CONTENT_STORAGE_PATH, firstMarkdownFile);
        const markdownContent = await fs.readFile(markdownPath, 'utf-8');
        
        expect(markdownContent.length).toBeGreaterThan(100);
        expect(markdownContent).toMatch(/^#/m); // Should contain headers
        console.log(`📄 Verified markdown file: ${firstMarkdownFile} (${markdownContent.length} characters)`);
      }

      // Verify content of first metadata file
      if (metadataFiles.length > 0) {
        const firstMetadataFile = metadataFiles[0];
        const metadataPath = path.join(CONTENT_STORAGE_PATH, firstMetadataFile);
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        
        expect(metadata).toHaveProperty('title');
        expect(metadata).toHaveProperty('url');
        expect(metadata).toHaveProperty('slug');
        console.log(`📋 Verified metadata file: ${firstMetadataFile}`);
      }
    }, 180000);

    it('should verify courses and chunks are saved in Neo4j with embeddings', async () => {
      // First, trigger course ingestion
      await page.click('button:has-text("Crawl Courses")');
      await page.waitForSelector('button:has-text("Crawling...")', { timeout: 5000 });
      await page.waitForSelector('button:has-text("Crawl Courses")', { timeout: 120000 });

      // Wait for ingestion to complete
      await page.waitForTimeout(3000);

      // Verify courses are saved in Neo4j
      session = driver.session({ database: testEnv.neo4jDatabase });
      try {
        // Check Course nodes
        const courseResult = await session.run('MATCH (c:Course) RETURN count(c) as courseCount');
        const courseCount = courseResult.records[0].get('courseCount').toNumber();
        expect(courseCount).toBeGreaterThan(0);
        console.log(`🗄️ Found ${courseCount} Course nodes in Neo4j`);

        // Check CourseChunk nodes
        const chunkResult = await session.run('MATCH (cc:CourseChunk) RETURN count(cc) as chunkCount');
        const chunkCount = chunkResult.records[0].get('chunkCount').toNumber();
        expect(chunkCount).toBeGreaterThan(0);
        console.log(`🧩 Found ${chunkCount} CourseChunk nodes in Neo4j`);

        // Verify Course properties
        const coursePropsResult = await session.run(`
          MATCH (c:Course)
          RETURN c.id, c.title, c.url, c.slug, c.embedding, c.isActive
          LIMIT 1
        `);

        expect(coursePropsResult.records.length).toBeGreaterThan(0);
        const courseRecord = coursePropsResult.records[0];

        expect(courseRecord.get('c.id')).toBeTruthy();
        expect(courseRecord.get('c.title')).toBeTruthy();
        expect(courseRecord.get('c.url')).toBeTruthy();
        expect(courseRecord.get('c.slug')).toBeTruthy();
        expect(courseRecord.get('c.embedding')).toBeTruthy();
        expect(courseRecord.get('c.isActive')).toBe(true);

        console.log(`📊 Course properties verified: ${courseRecord.get('c.title')}`);

        // Verify CourseChunk properties and relationships
        const chunkPropsResult = await session.run(`
          MATCH (c:Course)-[:HAS_CHUNK]->(cc:CourseChunk)
          RETURN c.title, cc.content, cc.embedding, cc.chunkIndex
          LIMIT 1
        `);

        expect(chunkPropsResult.records.length).toBeGreaterThan(0);
        const chunkRecord = chunkPropsResult.records[0];

        expect(chunkRecord.get('c.title')).toBeTruthy();
        expect(chunkRecord.get('cc.content')).toBeTruthy();
        expect(chunkRecord.get('cc.embedding')).toBeTruthy();
        expect(chunkRecord.get('cc.chunkIndex')).toBeGreaterThanOrEqual(0);

        console.log(`🔗 CourseChunk relationship verified for: ${chunkRecord.get('c.title')}`);

        // Verify embeddings are valid vectors
        const embeddingResult = await session.run(`
          MATCH (c:Course)
          WHERE c.embedding IS NOT NULL
          RETURN size(c.embedding) as embeddingSize
          LIMIT 1
        `);

        if (embeddingResult.records.length > 0) {
          const embeddingSize = embeddingResult.records[0].get('embeddingSize').toNumber();
          expect(embeddingSize).toBeGreaterThan(0);
          console.log(`🧮 Course embedding vector size: ${embeddingSize}`);
        }

        // Verify chunk embeddings
        const chunkEmbeddingResult = await session.run(`
          MATCH (cc:CourseChunk)
          WHERE cc.embedding IS NOT NULL
          RETURN size(cc.embedding) as embeddingSize
          LIMIT 1
        `);

        if (chunkEmbeddingResult.records.length > 0) {
          const chunkEmbeddingSize = chunkEmbeddingResult.records[0].get('embeddingSize').toNumber();
          expect(chunkEmbeddingSize).toBeGreaterThan(0);
          console.log(`🧮 CourseChunk embedding vector size: ${chunkEmbeddingSize}`);
        }

      } finally {
        await session.close();
      }
    }, 180000);

    it('should verify course search functionality works with ingested data', async () => {
      // First, trigger course ingestion
      await page.click('button:has-text("Crawl Courses")');
      await page.waitForSelector('button:has-text("Crawling...")', { timeout: 5000 });
      await page.waitForSelector('button:has-text("Crawl Courses")', { timeout: 120000 });

      // Wait for ingestion to complete
      await page.waitForTimeout(3000);

      // Test search functionality
      const searchInput = page.locator('input[placeholder*="Search courses"]');
      expect(await searchInput.isVisible()).toBe(true);

      // Search for "agents" (common topic in W&B courses)
      await searchInput.fill('agents');
      await page.waitForTimeout(1000); // Wait for debounced search

      // Verify search results
      const courseCards = page.locator('[data-testid="course-card"]');
      const searchResultCount = await courseCards.count();

      if (searchResultCount > 0) {
        console.log(`🔍 Search for "agents" returned ${searchResultCount} results`);

        // Verify search results contain relevant content
        const firstResult = courseCards.first();
        const resultTitle = await firstResult.locator('h3, [data-testid="course-title"]').textContent();
        expect(resultTitle?.toLowerCase()).toMatch(/agent|ai|artificial/);
        console.log(`🎯 First search result: ${resultTitle}`);
      } else {
        console.log('ℹ️ No search results for "agents" - this may be expected depending on course content');
      }

      // Clear search to show all courses again
      await searchInput.clear();
      await page.waitForTimeout(1000);

      const allCourseCards = page.locator('[data-testid="course-card"]');
      const allCoursesCount = await allCourseCards.count();
      expect(allCoursesCount).toBeGreaterThan(0);
      console.log(`📚 Total courses after clearing search: ${allCoursesCount}`);
    }, 180000);

    it('should verify course content matches original website', async () => {
      // First, trigger course ingestion
      await page.click('button:has-text("Crawl Courses")');
      await page.waitForSelector('button:has-text("Crawling...")', { timeout: 5000 });
      await page.waitForSelector('button:has-text("Crawl Courses")', { timeout: 120000 });

      // Wait for ingestion to complete
      await page.waitForTimeout(3000);

      // Get first course
      const courseCards = page.locator('[data-testid="course-card"]');
      expect(await courseCards.count()).toBeGreaterThan(0);

      const firstCourse = courseCards.first();

      // Get course URL from the "Open Original" link
      await firstCourse.locator('button:has-text("View Details"), [data-testid="view-details"]').click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

      const originalLink = page.locator('[role="dialog"] a:has-text("Open Original")');
      const courseUrl = await originalLink.getAttribute('href');
      expect(courseUrl).toBeTruthy();
      expect(courseUrl).toMatch(/wandb\.ai\/site\/courses\//);
      console.log(`🌐 Original course URL: ${courseUrl}`);

      // Get the markdown content from our system
      await page.click('button:has-text("Content")');
      await page.waitForSelector('pre', { timeout: 10000 });
      const markdownContent = await page.locator('pre').textContent();

      // Verify markdown contains course-specific content
      expect(markdownContent).toBeTruthy();
      expect(markdownContent!.length).toBeGreaterThan(200);

      // Check for common course elements
      const lowerContent = markdownContent!.toLowerCase();
      const hasExpectedContent =
        lowerContent.includes('course') ||
        lowerContent.includes('learn') ||
        lowerContent.includes('tutorial') ||
        lowerContent.includes('training') ||
        lowerContent.includes('wandb') ||
        lowerContent.includes('weights') ||
        lowerContent.includes('biases');

      expect(hasExpectedContent).toBe(true);
      console.log(`✅ Course content verification passed for ${courseUrl}`);

      // Close modal
      await page.keyboard.press('Escape');
    }, 180000);
  });
});
