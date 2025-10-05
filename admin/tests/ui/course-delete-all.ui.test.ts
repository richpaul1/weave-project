/**
 * UI tests for Delete All Courses functionality
 * Tests the complete user interface functionality for deleting all courses
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { testEnv } from '../utils/testEnv.js';

const BASE_URL = testEnv.adminClientUrl;

describe('Course Delete All UI Tests', () => {
  let browser: Browser;
  let page: Page;
  let driver: Driver;
  let session: Session;

  beforeAll(async () => {
    // Launch browser
    browser = await chromium.launch();

    // Connect to Neo4j
    driver = neo4j.driver(
      testEnv.neo4jUri,
      neo4j.auth.basic(testEnv.neo4jUser, testEnv.neo4jPassword)
    );
    session = driver.session({ database: testEnv.neo4jDatabase });
  }, 30000);

  beforeEach(async () => {
    // Create new page for each test
    page = await browser.newPage();

    // Navigate to courses page
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await session.close();
    await driver.close();
    await browser.close();
  });

  it('should display Delete All button when courses exist', async () => {
    // First ensure we have some courses by adding one via API
    const response = await fetch(`${BASE_URL}/api/courses/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://wandb.ai/site/courses/agents/'] })
    });
    expect(response.ok).toBe(true);

    // Refresh page to see the courses
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for courses to load
    await page.waitForSelector('[data-testid="course-card"]', { timeout: 10000 });

    // Check that Delete All button exists and is enabled
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    expect(await deleteAllButton.isVisible()).toBe(true);
    expect(await deleteAllButton.isEnabled()).toBe(true);
  });

  it('should disable Delete All button when no courses exist', async () => {
    // First delete all courses via API
    const response = await fetch(`${BASE_URL}/api/courses`, {
      method: 'DELETE'
    });
    expect(response.ok).toBe(true);

    // Refresh the page to see updated state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check that Delete All button is disabled
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    expect(await deleteAllButton.isVisible()).toBe(true);
    expect(await deleteAllButton.isDisabled()).toBe(true);
  });

  it('should show confirmation dialog when Delete All is clicked', async () => {
    // First ensure we have some courses
    const response = await fetch(`${BASE_URL}/api/courses/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://wandb.ai/site/courses/agents/'] })
    });
    expect(response.ok).toBe(true);

    // Refresh page to see the courses
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for courses to load
    await page.waitForSelector('[data-testid="course-card"]', { timeout: 10000 });

    // Set up dialog handler to capture the confirmation
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // Cancel the operation
    });

    // Click Delete All button
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    await deleteAllButton.click();

    // Verify confirmation dialog appeared with correct message
    expect(dialogMessage).toContain('delete ALL courses');
    expect(dialogMessage).toContain('cannot be undone');
  });

  it('should successfully delete all courses when confirmed', async () => {
    // First ensure we have some courses
    const response = await fetch(`${BASE_URL}/api/courses/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://wandb.ai/site/courses/agents/'] })
    });
    expect(response.ok).toBe(true);

    // Refresh page to see the courses
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for courses to load
    await page.waitForSelector('[data-testid="course-card"]', { timeout: 10000 });

    // Count initial courses
    const initialCourseCards = await page.locator('[data-testid="course-card"]').count();
    expect(initialCourseCards).toBeGreaterThan(0);

    // Set up dialog handler to confirm the operation
    page.on('dialog', async dialog => {
      await dialog.accept(); // Confirm the operation
    });

    // Click Delete All button
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    await deleteAllButton.click();

    // Wait for the operation to complete and page to update
    await page.waitForTimeout(2000);

    // Verify no courses remain
    const remainingCourseCards = await page.locator('[data-testid="course-card"]').count();
    expect(remainingCourseCards).toBe(0);

    // Verify "No courses found" message is displayed
    expect(await page.locator('text=No courses found').isVisible()).toBe(true);

    // Verify Delete All button is now disabled
    expect(await deleteAllButton.isDisabled()).toBe(true);
  });

  it('should show success toast after deleting all courses', async () => {
    // First ensure we have some courses
    const response = await fetch(`${BASE_URL}/api/courses/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://wandb.ai/site/courses/agents/'] })
    });
    expect(response.ok).toBe(true);

    // Refresh page to see the courses
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for courses to load
    await page.waitForSelector('[data-testid="course-card"]', { timeout: 10000 });

    // Set up dialog handler to confirm the operation
    page.on('dialog', async dialog => {
      await dialog.accept(); // Confirm the operation
    });

    // Click Delete All button
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    await deleteAllButton.click();

    // Wait for success toast to appear
    await page.waitForSelector('.sonner-toast', { timeout: 5000 });
    expect(await page.locator('.sonner-toast').isVisible()).toBe(true);

    // Verify toast contains success message
    const toastText = await page.locator('.sonner-toast').textContent();
    expect(toastText).toContain('All courses deleted successfully');
    expect(toastText).toContain('courses');
    expect(toastText).toContain('chunks');
    expect(toastText).toContain('files');
  });

  it('should show loading state while deleting', async () => {
    // First ensure we have some courses
    const response = await fetch(`${BASE_URL}/api/courses/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: ['https://wandb.ai/site/courses/agents/'] })
    });
    expect(response.ok).toBe(true);

    // Refresh page to see the courses
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for courses to load
    await page.waitForSelector('[data-testid="course-card"]', { timeout: 10000 });

    // Set up dialog handler to confirm the operation
    page.on('dialog', async dialog => {
      await dialog.accept(); // Confirm the operation
    });

    // Click Delete All button
    const deleteAllButton = page.locator('button:has-text("Delete All")');
    await deleteAllButton.click();

    // Verify button shows loading state
    await page.waitForSelector('button:has-text("Deleting...")', { timeout: 1000 });
    expect(await page.locator('button:has-text("Deleting...")').isVisible()).toBe(true);

    // Wait for operation to complete
    await page.waitForTimeout(3000);

    // Verify button returns to normal state (but disabled since no courses)
    expect(await page.locator('button:has-text("Delete All")').isVisible()).toBe(true);
    expect(await page.locator('button:has-text("Delete All")').isDisabled()).toBe(true);
  });
});
