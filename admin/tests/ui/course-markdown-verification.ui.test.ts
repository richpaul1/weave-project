/**
 * UI tests for Course Markdown Verification
 * Tests that course markdown is correctly saved and displayed in the UI
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { testEnv } from '../utils/testEnv.js';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = testEnv.adminClientUrl;
const CONTENT_STORAGE_PATH = './storage/content/courses';

// Mock course data for testing
const MOCK_COURSE_DATA = {
  id: 'test-course-123',
  url: 'https://wandb.ai/site/courses/agents/',
  title: 'AI Agents Course',
  description: 'Learn how to build AI agents with W&B',
  slug: 'agents',
  difficulty: 'intermediate' as const,
  duration: '2 hours',
  topics: ['ai', 'agents', 'machine learning'],
  instructor: 'W&B Team',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastCrawledAt: new Date().toISOString()
};

const MOCK_MARKDOWN_CONTENT = `# AI Agents Course

## Overview
This course teaches you how to build intelligent AI agents using Weights & Biases.

## What You'll Learn
- Understanding AI agent architectures
- Building autonomous agents
- Monitoring agent performance with W&B
- Best practices for agent deployment

## Prerequisites
- Basic Python knowledge
- Familiarity with machine learning concepts
- W&B account (free)

## Course Structure
1. Introduction to AI Agents
2. Agent Architecture Design
3. Implementation with W&B
4. Monitoring and Evaluation
5. Production Deployment

## Getting Started
To begin this course, you'll need to set up your development environment...

This is a comprehensive course that covers all aspects of building production-ready AI agents.
`;

describe('Course Markdown Verification UI Tests', () => {
  let browser: Browser;
  let page: Page;
  let driver: Driver;
  let session: Session;

  beforeAll(async () => {
    // Launch browser
    browser = await chromium.launch({ 
      headless: process.env.CI ? true : false
    });
    
    // Connect to database
    driver = neo4j.driver(
      testEnv.neo4jUri,
      neo4j.auth.basic(testEnv.neo4jUser, testEnv.neo4jPassword)
    );

    // Test database connection
    session = driver.session({ database: testEnv.neo4jDatabase });
    try {
      await session.run('RETURN 1');
      console.log('✅ Connected to Neo4j database for markdown verification tests');
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

    // Clean up before each test
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

  describe('Course Markdown Storage and Display', () => {
    it('should save and display course markdown correctly', async () => {
      // First, manually create a course with markdown content via API
      console.log('📝 Creating test course with markdown content...');
      
      // Create markdown file
      await fs.mkdir(CONTENT_STORAGE_PATH, { recursive: true });
      const markdownPath = path.join(CONTENT_STORAGE_PATH, `${MOCK_COURSE_DATA.slug}.md`);
      await fs.writeFile(markdownPath, MOCK_MARKDOWN_CONTENT, 'utf-8');
      
      // Create metadata file
      const metadataPath = path.join(CONTENT_STORAGE_PATH, `${MOCK_COURSE_DATA.slug}.metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(MOCK_COURSE_DATA, null, 2), 'utf-8');

      // Insert course into Neo4j
      session = driver.session({ database: testEnv.neo4jDatabase });
      try {
        await session.run(`
          CREATE (c:Course {
            id: $id,
            url: $url,
            title: $title,
            description: $description,
            slug: $slug,
            difficulty: $difficulty,
            duration: $duration,
            topics: $topics,
            instructor: $instructor,
            isActive: $isActive,
            createdAt: $createdAt,
            updatedAt: $updatedAt,
            lastCrawledAt: $lastCrawledAt
          })
        `, MOCK_COURSE_DATA);
        console.log('✅ Test course created in Neo4j');
      } finally {
        await session.close();
      }

      // Refresh the page to load the new course
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Give time for data to load

      // Verify course appears in the UI
      const courseCards = page.locator('[data-testid="course-card"]');
      const cardCount = await courseCards.count();
      expect(cardCount).toBeGreaterThan(0);
      console.log(`📚 Found ${cardCount} course card(s)`);

      // Find our test course
      const testCourseCard = courseCards.filter({ hasText: MOCK_COURSE_DATA.title });
      expect(await testCourseCard.count()).toBe(1);
      console.log(`🎯 Found test course: ${MOCK_COURSE_DATA.title}`);

      // Click "View Details" on the test course
      await testCourseCard.locator('[data-testid="view-details"]').click();

      // Wait for course modal to open
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      expect(await page.locator('[role="dialog"]').isVisible()).toBe(true);

      // Verify course details are displayed
      const modalTitle = await page.locator('[role="dialog"] h2').textContent();
      expect(modalTitle).toContain(MOCK_COURSE_DATA.title);
      console.log(`📖 Course modal opened for: ${modalTitle}`);

      // Click on "Content" tab to view markdown
      await page.click('button:has-text("Content")');
      await page.waitForTimeout(1000);

      // Wait for markdown content to load
      await page.waitForSelector('pre', { timeout: 10000 });
      const markdownContent = await page.locator('pre').textContent();
      
      // Verify markdown content is correctly displayed
      expect(markdownContent).toBeTruthy();
      expect(markdownContent!.length).toBeGreaterThan(100);
      console.log(`📝 Markdown content loaded (${markdownContent!.length} characters)`);

      // Verify specific content from our mock markdown
      expect(markdownContent).toContain('# AI Agents Course');
      expect(markdownContent).toContain('## Overview');
      expect(markdownContent).toContain('This course teaches you how to build intelligent AI agents');
      expect(markdownContent).toContain('## What You\'ll Learn');
      expect(markdownContent).toContain('Understanding AI agent architectures');
      expect(markdownContent).toContain('## Prerequisites');
      expect(markdownContent).toContain('Basic Python knowledge');
      
      console.log('✅ Markdown content verification passed');

      // Verify the markdown matches exactly what we saved
      expect(markdownContent?.trim()).toBe(MOCK_MARKDOWN_CONTENT.trim());
      console.log('✅ Markdown content matches saved file exactly');

      // Close the modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    it('should verify markdown file exists on filesystem', async () => {
      // Create test course files
      await fs.mkdir(CONTENT_STORAGE_PATH, { recursive: true });
      const markdownPath = path.join(CONTENT_STORAGE_PATH, `${MOCK_COURSE_DATA.slug}.md`);
      const metadataPath = path.join(CONTENT_STORAGE_PATH, `${MOCK_COURSE_DATA.slug}.metadata.json`);
      
      await fs.writeFile(markdownPath, MOCK_MARKDOWN_CONTENT, 'utf-8');
      await fs.writeFile(metadataPath, JSON.stringify(MOCK_COURSE_DATA, null, 2), 'utf-8');

      // Verify files exist
      const markdownExists = await fs.access(markdownPath).then(() => true).catch(() => false);
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      
      expect(markdownExists).toBe(true);
      expect(metadataExists).toBe(true);
      console.log('✅ Markdown and metadata files exist on filesystem');

      // Verify file contents
      const savedMarkdown = await fs.readFile(markdownPath, 'utf-8');
      const savedMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      
      expect(savedMarkdown).toBe(MOCK_MARKDOWN_CONTENT);
      expect(savedMetadata.title).toBe(MOCK_COURSE_DATA.title);
      expect(savedMetadata.slug).toBe(MOCK_COURSE_DATA.slug);
      console.log('✅ File contents verification passed');
    });

    it('should verify course data in Neo4j matches UI display', async () => {
      // Create test course in Neo4j
      session = driver.session({ database: testEnv.neo4jDatabase });
      try {
        await session.run(`
          CREATE (c:Course {
            id: $id,
            url: $url,
            title: $title,
            description: $description,
            slug: $slug,
            difficulty: $difficulty,
            duration: $duration,
            topics: $topics,
            instructor: $instructor,
            isActive: $isActive,
            createdAt: $createdAt,
            updatedAt: $updatedAt,
            lastCrawledAt: $lastCrawledAt
          })
        `, MOCK_COURSE_DATA);
      } finally {
        await session.close();
      }

      // Create markdown file for the API endpoint
      await fs.mkdir(CONTENT_STORAGE_PATH, { recursive: true });
      const markdownPath = path.join(CONTENT_STORAGE_PATH, `${MOCK_COURSE_DATA.slug}.md`);
      await fs.writeFile(markdownPath, MOCK_MARKDOWN_CONTENT, 'utf-8');

      // Refresh page and verify course appears
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Verify course data in UI matches Neo4j data
      const courseCard = page.locator('[data-testid="course-card"]').filter({ hasText: MOCK_COURSE_DATA.title });
      expect(await courseCard.count()).toBe(1);

      // Check course title
      const titleElement = courseCard.locator('[data-testid="course-title"]');
      const displayedTitle = await titleElement.textContent();
      expect(displayedTitle).toBe(MOCK_COURSE_DATA.title);

      // Open course details
      await courseCard.locator('[data-testid="view-details"]').click();
      await page.waitForSelector('[role="dialog"]');

      // Verify course metadata in details view
      const courseUrl = await page.locator('[role="dialog"] a:has-text("Open Original")').getAttribute('href');
      expect(courseUrl).toBe(MOCK_COURSE_DATA.url);

      // Check difficulty, duration, instructor
      const detailsText = await page.locator('[role="dialog"]').textContent();
      expect(detailsText).toContain(MOCK_COURSE_DATA.difficulty);
      expect(detailsText).toContain(MOCK_COURSE_DATA.duration);
      expect(detailsText).toContain(MOCK_COURSE_DATA.instructor);

      console.log('✅ Course data in UI matches Neo4j data');

      // Close modal
      await page.keyboard.press('Escape');
    });

    it('should verify agent can find the agents course', async () => {
      // Create the agents course in Neo4j with embeddings
      session = driver.session({ database: testEnv.neo4jDatabase });
      try {
        // Create a mock embedding (768 dimensions filled with random values)
        const mockEmbedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);

        await session.run(`
          CREATE (c:Course {
            id: $id,
            url: $url,
            title: $title,
            description: $description,
            slug: $slug,
            difficulty: $difficulty,
            duration: $duration,
            topics: $topics,
            instructor: $instructor,
            isActive: $isActive,
            createdAt: $createdAt,
            updatedAt: $updatedAt,
            lastCrawledAt: $lastCrawledAt,
            embedding: $embedding
          })
        `, {
          ...MOCK_COURSE_DATA,
          id: 'agents-course-test',
          slug: 'site-courses-agents',
          title: 'AI agent course | Free 2-hour course from Weights & Biases',
          url: 'https://wandb.ai/site/courses/agents/',
          embedding: mockEmbedding
        });
      } finally {
        await session.close();
      }

      // Test that the agent can find the course via API
      const agentResponse = await page.request.post('http://localhost:8283/api/chat/message', {
        data: {
          query: 'search for AI agent course',
          session_id: 'ui-test-session'
        }
      });

      expect(agentResponse.ok()).toBe(true);

      const result = await agentResponse.json();
      expect(result.response).toBeDefined();
      expect(result.sources).toBeDefined();
      expect(Array.isArray(result.sources)).toBe(true);

      // Verify the agents course is in the sources
      const agentsCourse = result.sources.find((source: any) =>
        source.title?.toLowerCase().includes('ai agent course') ||
        source.url?.includes('agents')
      );

      expect(agentsCourse).toBeDefined();
      if (agentsCourse) {
        console.log(`✅ Agent found course: ${agentsCourse.title}`);
        expect(agentsCourse.type).toBe('course');
        expect(agentsCourse.url).toContain('agents');
      }
    });
  });
});
