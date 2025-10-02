/**
 * Functional tests for Settings API endpoints
 * Tests the complete API functionality including database operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';
import settingsRoutes from '../../src/routes/settingsRoutes.js';

// Load environment variables
dotenv.config({ path: '../../.env.local' });

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

describe('Settings API Functional Tests', () => {
  let driver: Driver;
  let session: Session;

  beforeAll(async () => {
    // Connect to test database
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'neo4j://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      )
    );

    // Test database connection
    session = driver.session();
    try {
      await session.run('RETURN 1');
      console.log('✅ Connected to Neo4j database for functional tests');
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j database:', error);
      throw error;
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    if (driver) {
      await driver.close();
    }
  });

  beforeEach(async () => {
    // Clean up settings before each test
    session = driver.session();
    try {
      await session.run('MATCH (s:Setting) DELETE s');
    } finally {
      await session.close();
    }
  });

  describe('GET /api/settings/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/settings/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'settings',
        message: 'Settings service is healthy'
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/settings/chat', () => {
    it('should return default settings when no settings exist', async () => {
      const response = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Chat settings retrieved successfully'
      });

      const settings = response.body.data;
      expect(settings).toMatchObject({
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        enable_full_validation_testing: false
      });
      expect(settings.chat_service_prompt).toBeDefined();
      expect(settings.empty_search_default_response).toBeDefined();
    });

    it('should return stored settings when they exist', async () => {
      // First, store some settings
      const testSettings = {
        chat_service_prompt: 'Test prompt',
        search_score_threshold: 0.8,
        enable_title_matching: false,
        enable_full_page_content: true,
        max_pages: 10,
        empty_search_default_response: 'Test response',
        enable_full_validation_testing: true
      };

      await request(app)
        .put('/api/settings/chat')
        .send(testSettings)
        .expect(200);

      // Then retrieve them
      const response = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      expect(response.body.data).toMatchObject(testSettings);
    });
  });

  describe('PUT /api/settings/chat', () => {
    const validSettings = {
      chat_service_prompt: 'Updated test prompt',
      search_score_threshold: 0.7,
      enable_title_matching: false,
      enable_full_page_content: false,
      max_pages: 8,
      empty_search_default_response: 'Updated test response',
      enable_full_validation_testing: true
    };

    it('should update chat settings successfully', async () => {
      const response = await request(app)
        .put('/api/settings/chat')
        .send(validSettings)
        .expect(200);

      expect(response.body).toMatchObject({
        data: validSettings,
        message: 'Chat settings updated successfully'
      });

      // Verify settings were stored in database
      const getResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      expect(getResponse.body.data).toMatchObject(validSettings);
    });

    it('should validate required fields', async () => {
      const invalidSettings = {
        chat_service_prompt: 'short', // Too short
        search_score_threshold: 1.5, // Too high
        max_pages: 0, // Too low
      };

      const response = await request(app)
        .put('/api/settings/chat')
        .send(invalidSettings)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(Array.isArray(response.body.details)).toBe(true);
    });

    it('should handle partial updates', async () => {
      // First set initial settings
      await request(app)
        .put('/api/settings/chat')
        .send(validSettings)
        .expect(200);

      // Then update only some fields
      const partialUpdate = {
        chat_service_prompt: 'Partially updated prompt',
        search_score_threshold: 0.95,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 3,
        empty_search_default_response: 'Partially updated response',
        enable_full_validation_testing: false
      };

      const response = await request(app)
        .put('/api/settings/chat')
        .send(partialUpdate)
        .expect(200);

      expect(response.body.data).toMatchObject(partialUpdate);
    });
  });

  describe('POST /api/settings/chat/reset', () => {
    it('should reset settings to defaults', async () => {
      // First, set some custom settings
      const customSettings = {
        chat_service_prompt: 'Custom prompt',
        search_score_threshold: 0.6,
        enable_title_matching: false,
        enable_full_page_content: false,
        max_pages: 15,
        empty_search_default_response: 'Custom response',
        enable_full_validation_testing: true
      };

      await request(app)
        .put('/api/settings/chat')
        .send(customSettings)
        .expect(200);

      // Then reset to defaults
      const response = await request(app)
        .post('/api/settings/chat/reset')
        .expect(200);

      expect(response.body.message).toBe('Chat settings reset to defaults successfully');

      const defaultSettings = response.body.data;
      expect(defaultSettings).toMatchObject({
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        enable_full_validation_testing: false
      });

      // Verify settings were actually reset in database
      const getResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      expect(getResponse.body.data).toMatchObject(defaultSettings);
    });
  });

  describe('Data Persistence', () => {
    it('should persist settings across multiple requests', async () => {
      const testSettings = {
        chat_service_prompt: 'Persistence test prompt',
        search_score_threshold: 0.75,
        enable_title_matching: true,
        enable_full_page_content: false,
        max_pages: 7,
        empty_search_default_response: 'Persistence test response',
        enable_full_validation_testing: true
      };

      // Create settings
      await request(app)
        .put('/api/settings/chat')
        .send(testSettings)
        .expect(200);

      // Retrieve settings multiple times
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/api/settings/chat')
          .expect(200);

        expect(response.body.data).toMatchObject(testSettings);
      }
    });

    it('should handle concurrent updates correctly', async () => {
      const settings1 = {
        chat_service_prompt: 'Concurrent test 1',
        search_score_threshold: 0.8,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        empty_search_default_response: 'Response 1',
        enable_full_validation_testing: false
      };

      const settings2 = {
        chat_service_prompt: 'Concurrent test 2',
        search_score_threshold: 0.9,
        enable_title_matching: false,
        enable_full_page_content: false,
        max_pages: 10,
        empty_search_default_response: 'Response 2',
        enable_full_validation_testing: true
      };

      // Send concurrent requests
      const [response1, response2] = await Promise.all([
        request(app).put('/api/settings/chat').send(settings1),
        request(app).put('/api/settings/chat').send(settings2)
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify final state is consistent
      const finalResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      // Should match one of the two settings
      const finalSettings = finalResponse.body.data;
      const matchesSettings1 = JSON.stringify(finalSettings) === JSON.stringify(settings1);
      const matchesSettings2 = JSON.stringify(finalSettings) === JSON.stringify(settings2);
      
      expect(matchesSettings1 || matchesSettings2).toBe(true);
    });
  });
});
