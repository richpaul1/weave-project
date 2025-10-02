/**
 * Basic UI tests for the agent chat interface using Vitest + Playwright
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env.local' });

const CLIENT_URL = process.env.AGENT_CLIENT_URL || 'http://localhost:8001';
const BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://localhost:8000';

describe('Agent Chat Basic UI Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: !process.env.HEADED,
      slowMo: process.env.HEADED ? 100 : 0,
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
  });

  afterEach(async () => {
    await page?.close();
  });

  it('should load the chat page correctly', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Check that the page title is correct
    await expect(page).toHaveTitle(/Weave Agent/);
    
    // Check that main elements are present
    await expect(page.locator('h2')).toContainText('RAG Chat Interface');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Send' })).toBeVisible();
  });

  it('should show debug button', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Check debug button is present
    const debugButton = page.locator('button', { hasText: 'Debug' });
    await expect(debugButton).toBeVisible();
    
    // Check it has the bug icon
    await expect(debugButton.locator('svg')).toBeVisible();
  });

  it('should handle chat input functionality', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Find the textarea and send button
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Initially send button should be disabled
    await expect(sendButton).toBeDisabled();
    
    // Type a message
    const testMessage = 'Hello, this is a test message';
    await textarea.fill(testMessage);
    
    // Send button should now be enabled
    await expect(sendButton).toBeEnabled();
    
    // Clear the message
    await textarea.fill('');
    
    // Send button should be disabled again
    await expect(sendButton).toBeDisabled();
  });

  it('should send a chat message', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Find the textarea and send button
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Type a simple test message
    const testMessage = 'explain weave to me';
    await textarea.fill(testMessage);
    
    // Click send
    await sendButton.click();
    
    // Check that the message appears in the chat
    await expect(page.locator(`text=${testMessage}`)).toBeVisible();
    
    // Check that the textarea is cleared
    await expect(textarea).toHaveValue('');
    
    // Check that send button is disabled again
    await expect(sendButton).toBeDisabled();
  });

  it('should handle keyboard shortcuts', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Find the textarea
    const textarea = page.locator('textarea');
    
    // Type a message
    const testMessage = 'test keyboard shortcut';
    await textarea.fill(testMessage);
    
    // Press Enter to send
    await textarea.press('Enter');
    
    // Check that the message appears in the chat
    await expect(page.locator(`text=${testMessage}`)).toBeVisible();
    
    // Check that the textarea is cleared
    await expect(textarea).toHaveValue('');
  });

  it('should handle Shift+Enter for new lines', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Find the textarea
    const textarea = page.locator('textarea');
    
    // Type a message
    const firstLine = 'First line';
    await textarea.fill(firstLine);
    
    // Press Shift+Enter to add new line
    await textarea.press('Shift+Enter');
    
    // Type second line
    const secondLine = 'Second line';
    await textarea.type(secondLine);
    
    // Check that both lines are in the textarea
    const expectedContent = `${firstLine}\n${secondLine}`;
    await expect(textarea).toHaveValue(expectedContent);
    
    // Message should not have been sent yet
    await expect(page.locator(`text=${firstLine}`)).not.toBeVisible();
  });

  it('should work on different screen sizes', async () => {
    await page.goto(`${CLIENT_URL}/chat/test-session`);
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check that main elements are still visible
    await expect(page.locator('h2')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Send' })).toBeVisible();
    
    // Debug button icon should still be visible
    const debugButton = page.locator('button', { hasText: 'Debug' });
    await expect(debugButton.locator('svg')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Check that elements are still visible
    await expect(page.locator('h2')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Send' })).toBeVisible();
  });
});
