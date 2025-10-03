/**
 * UI tests specifically for testing Weave explanation functionality
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { expect } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env.local' });

const CLIENT_URL = process.env.AGENT_CLIENT_URL || `http://localhost:${process.env.AGENT_CLIENT_PORT || '3000'}`;
const BACKEND_URL = process.env.AGENT_BACKEND_URL || `http://localhost:${process.env.AGENT_BACKEND_PORT || '3001'}`;

describe('Agent Chat Weave Explanation Tests', () => {
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
    page.setDefaultTimeout(60000); // Longer timeout for AI responses
  });

  afterEach(async () => {
    await page?.close();
  });

  it('should ask for Weave explanation', async () => {
    const sessionId = `weave-test-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);
    
    // Wait for page to load
    await expect(page.locator('h2')).toContainText('RAG Chat Interface');
    
    // Find the textarea and send button
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Type the Weave explanation request
    const weaveQuestion = 'explain weave to me';
    await textarea.fill(weaveQuestion);
    
    // Click send
    await sendButton.click();
    
    // Verify the user message appears (use more specific selector)
    await expect(page.locator('[data-testid="chat-messages"]').locator(`text=${weaveQuestion}`).first()).toBeVisible();
    
    // Wait for AI response to start (look for bot avatar)
    const botAvatar = page.locator('.bg-primary').first();
    await expect(botAvatar).toBeVisible({ timeout: 30000 });
    
    // Wait for the response content to appear
    const responseContent = page.locator('.markdown-content').first();
    await expect(responseContent).toBeVisible({ timeout: 120000 }); // 2 minute timeout
    
    // Verify the response contains relevant Weave-related content
    const responseText = await responseContent.innerText();
    const lowerResponseText = responseText.toLowerCase();
    
    // Check for key Weave concepts in the response
    const weaveKeywords = [
      'weave',
      'observability', 
      'tracing',
      'llm',
      'monitoring',
      'weights',
      'biases',
      'wandb'
    ];
    
    // At least some of these keywords should appear in the response
    const keywordFound = weaveKeywords.some(keyword => lowerResponseText.includes(keyword));
    expect(keywordFound).toBe(true);
  });

  it('should show thinking process for Weave explanation', async () => {
    const sessionId = `weave-thinking-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);
    
    // Wait for page to load
    await expect(page.locator('h2')).toContainText('RAG Chat Interface');
    
    // Find the textarea and send button
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Ask about Weave
    const weaveQuestion = 'explain weave to me in detail';
    await textarea.fill(weaveQuestion);
    await sendButton.click();
    
    // Wait for the thinking process to appear
    const thinkingSection = page.locator('text=Thinking Process');
    await expect(thinkingSection).toBeVisible({ timeout: 30000 });
    
    // Click the thinking process button to expand it
    const thinkingButton = page.locator('button:has-text("Thinking Process")');
    await expect(thinkingButton.first()).toBeVisible({ timeout: 60000 });
    await thinkingButton.first().click();

    // Check that thinking content appears (use more specific selector)
    const thinkingContent = page.locator('[data-testid="chat-messages"] .text-xs.text-muted-foreground.whitespace-pre-wrap');
    await expect(thinkingContent.first()).toBeVisible({ timeout: 10000 });
    
    // Verify thinking content is not empty
    const thinkingText = await thinkingContent.innerText();
    expect(thinkingText.length).toBeGreaterThan(0);
  });

  it('should test debug button with Weave session', async () => {
    const sessionId = `weave-debug-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);
    
    // Check debug button is present
    const debugButton = page.locator('button', { hasText: 'Debug' });
    await expect(debugButton).toBeVisible();
    
    // Send a Weave question first to create some session data
    const textarea = page.locator('textarea');
    await textarea.fill('explain weave to me');
    await page.locator('button', { hasText: 'Send' }).click();
    
    // Wait for response to start (use more specific selector)
    await expect(page.locator('[data-testid="chat-messages"]').locator('text=explain weave to me').first()).toBeVisible();
    
    // Test debug button click (should open new tab)
    // We can't easily test the new tab opening in Playwright, but we can test the click
    await debugButton.click();
    
    // The button should still be visible after clicking
    await expect(debugButton).toBeVisible();
  });

  it('should handle multiple Weave questions', async () => {
    const sessionId = `weave-multi-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);

    // Wait for page to load
    await expect(page.locator('h2')).toContainText('RAG Chat Interface');

    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });

    // First question (very simple)
    const firstQuestion = 'hi';
    await textarea.fill(firstQuestion);
    await sendButton.click();

    // Wait for first response to start appearing
    const firstResponse = page.locator('.markdown-content').first();
    await expect(firstResponse).toBeVisible({ timeout: 60000 });

    // Second question (very simple)
    const secondQuestion = 'bye';
    await textarea.fill(secondQuestion);
    await sendButton.click();

    // Wait for second response to appear (should have 2 markdown content sections)
    const allResponses = page.locator('.markdown-content');
    await expect(allResponses).toHaveCount(2, { timeout: 60000 });

    // Test passes if we can successfully send multiple messages and get responses
  });

  it('should handle streaming responses', async () => {
    const sessionId = `weave-stream-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);
    
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Ask about Weave
    const weaveQuestion = 'explain weave to me';
    await textarea.fill(weaveQuestion);
    await sendButton.click();
    
    // Wait for actual content to start appearing
    const responseContent = page.locator('.markdown-content').first();
    await expect(responseContent).toBeVisible({ timeout: 60000 });

    // Final response should not be empty
    const finalText = await responseContent.innerText();
    expect(finalText.length).toBeGreaterThan(0);
  });

  it('should provide comprehensive Weave explanation', async () => {
    const sessionId = `weave-comprehensive-${Date.now()}`;
    await page.goto(`${CLIENT_URL}/chat/${sessionId}`);
    
    // Wait for page to load completely
    await expect(page.locator('h2')).toContainText('RAG Chat Interface');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Send' })).toBeVisible();
    
    const textarea = page.locator('textarea');
    const sendButton = page.locator('button', { hasText: 'Send' });
    
    // Ask a comprehensive question about Weave
    const comprehensiveQuestion = 'explain weave to me including its key features, benefits, and how it helps with LLM observability';
    await textarea.fill(comprehensiveQuestion);
    await sendButton.click();
    
    // Verify user message appears (use more specific selector)
    await expect(page.locator('[data-testid="chat-messages"]').locator(`text=${comprehensiveQuestion}`).first()).toBeVisible();
    
    // Wait for thinking process
    const thinkingSection = page.locator('text=Thinking Process');
    await expect(thinkingSection).toBeVisible({ timeout: 30000 });
    
    // Wait for AI response
    const botAvatar = page.locator('.bg-primary').first();
    await expect(botAvatar).toBeVisible({ timeout: 30000 });
    
    // Wait for response content
    const responseContent = page.locator('.markdown-content').first();
    await expect(responseContent).toBeVisible({ timeout: 180000 }); // 3 minute timeout for comprehensive response
    
    // Verify response quality
    const responseText = await responseContent.innerText();
    const lowerResponseText = responseText.toLowerCase();
    
    // Should contain multiple Weave concepts
    const requiredConcepts = ['weave', 'observability', 'llm'];
    for (const concept of requiredConcepts) {
      expect(lowerResponseText).toContain(concept);
    }
    
    // Response should be substantial (more than just a short sentence)
    expect(responseText.length).toBeGreaterThan(50);
    
    // Test debug button is functional
    const debugButton = page.locator('button', { hasText: 'Debug' });
    await expect(debugButton).toBeVisible();
    
    // Check if Weave is enabled (green indicator)
    const greenIndicator = debugButton.locator('.bg-green-500');
    if (await greenIndicator.isVisible()) {
      // If Weave is enabled, button should be green
      const buttonClasses = await debugButton.getAttribute('class');
      expect(buttonClasses).toContain('text-green');
    }
    
    // Test follow-up question
    const followUp = 'how do I get started with weave?';
    await textarea.fill(followUp);
    await sendButton.click();
    
    // Verify follow-up works
    await expect(page.locator(`text=${followUp}`)).toBeVisible();
    
    // Should now have 2 responses
    const allResponses = page.locator('.markdown-content');
    await expect(allResponses).toHaveCount(2, { timeout: 120000 });
  }, 300000); // 5 minute timeout for comprehensive test
});
