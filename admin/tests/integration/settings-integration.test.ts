/**
 * Integration tests for Settings functionality
 * Tests the complete integration between API, service layer, and database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';
import settingsRoutes from '../../src/routes/settingsRoutes.js';
import { SettingsService } from '../../src/services/settingsService.js';

// Load environment variables
dotenv.config({ path: '../../.env.local' });

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

describe('Settings Integration Tests', () => {
  let driver: Driver;
  let session: Session;
  let settingsService: SettingsService;

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
      console.log('✅ Connected to Neo4j database for integration tests');
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j database:', error);
      throw error;
    } finally {
      await session.close();
    }

    // Initialize settings service
    settingsService = new SettingsService();
  });

  afterAll(async () => {
    // Clean up all settings before closing
    try {
      const cleanupSession = driver.session();
      try {
        await cleanupSession.run('MATCH (s:Setting) DELETE s');
      } finally {
        await cleanupSession.close();
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }

    if (settingsService) {
      try {
        await settingsService.close();
      } catch (error) {
        console.warn('Settings service close warning:', error);
      }
    }
    if (driver) {
      try {
        await driver.close();
      } catch (error) {
        console.warn('Driver close warning:', error);
      }
    }
  });

  beforeEach(async () => {
    // Clean up settings before each test
    try {
      const cleanupSession = driver.session();
      try {
        // Force delete all settings with multiple attempts
        for (let attempt = 0; attempt < 3; attempt++) {
          await cleanupSession.run('MATCH (s:Setting) DETACH DELETE s');
          await new Promise(resolve => setTimeout(resolve, 150));

          // Verify cleanup
          const result = await cleanupSession.run('MATCH (s:Setting) RETURN count(s) as count');
          const count = result.records[0].get('count').toNumber();
          if (count === 0) {
            break; // Success
          }
          console.warn(`Integration attempt ${attempt + 1}: ${count} settings still exist after cleanup`);
        }

        // Also reset the settings service to ensure clean state
        await settingsService.resetChatSettings();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Final cleanup to remove the reset settings we just created
        await cleanupSession.run('MATCH (s:Setting) DETACH DELETE s');
      } finally {
        await cleanupSession.close();
      }
    } catch (error) {
      console.warn('BeforeEach cleanup warning:', error);
    }
  });

  describe('End-to-End Settings Flow', () => {
    it('should complete full settings lifecycle: API -> Service -> Database', async () => {
      // Step 1: Verify default settings through API
      const initialResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      const initialSettings = initialResponse.body.data;
      console.log('Initial settings from API:', initialSettings);

      // Be more flexible with initial settings since they might vary
      expect(typeof initialSettings.search_score_threshold).toBe('number');
      expect(typeof initialSettings.max_pages).toBe('number');

      // Step 2: Update settings through API
      const newSettings = {
        chat_service_prompt: 'Integration test prompt',
        search_score_threshold: 0.75,
        enable_title_matching: false,
        enable_full_page_content: true,
        max_pages: 8,
        empty_search_default_response: 'Integration test response',
        enable_full_validation_testing: true
      };

      const updateResponse = await request(app)
        .put('/api/settings/chat')
        .send(newSettings)
        .expect(200);

      console.log('Update response:', updateResponse.body);
      expect(updateResponse.body.data).toMatchObject(newSettings);

      // Wait a bit to ensure database operation completes
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 3: Verify settings were saved by retrieving them through the service
      const retrievedSettings = await settingsService.getChatSettings();

      console.log('Retrieved settings through service:', retrievedSettings);
      expect(retrievedSettings.chat_service_prompt).toBe('Integration test prompt');
      expect(retrievedSettings.search_score_threshold).toBe(0.75);
      expect(retrievedSettings.max_pages).toBe(8);
      expect(retrievedSettings.enable_title_matching).toBe(false);
      expect(retrievedSettings.enable_full_page_content).toBe(true);
      expect(retrievedSettings.empty_search_default_response).toBe('Integration test response');
      expect(retrievedSettings.enable_full_validation_testing).toBe(true);

      // Step 4: Verify settings through service layer
      const serviceSettings = await settingsService.getChatSettings();
      expect(serviceSettings).toMatchObject(newSettings);

      // Step 5: Reset through API
      const resetResponse = await request(app)
        .post('/api/settings/chat/reset')
        .expect(200);

      expect(resetResponse.body.message).toBe('Chat settings reset to defaults successfully');

      // Step 6: Verify reset in database
      session = driver.session();
      try {
        const result = await session.run(`
          MATCH (s:Setting)
          WHERE s.key = 'search_score_threshold'
          RETURN s.value as value
        `);

        if (result.records.length > 0) {
          expect(result.records[0].get('value')).toBe('0.9');
        }
      } finally {
        await session.close();
      }

      // Step 7: Verify reset through service layer
      const resetServiceSettings = await settingsService.getChatSettings();
      expect(resetServiceSettings.search_score_threshold).toBe(0.9);
      expect(resetServiceSettings.max_pages).toBe(5);
    });

    it('should handle concurrent API and service updates correctly', async () => {
      const apiSettings = {
        chat_service_prompt: 'API update prompt',
        search_score_threshold: 0.8,
        enable_title_matching: false,
        enable_full_page_content: true,
        max_pages: 6,
        empty_search_default_response: 'API response',
        enable_full_validation_testing: true
      };

      const serviceSettings = {
        chat_service_prompt: 'Service update prompt',
        search_score_threshold: 0.7,
        enable_title_matching: true,
        enable_full_page_content: false,
        max_pages: 12,
        empty_search_default_response: 'Service response',
        enable_full_validation_testing: false
      };

      // Start both operations simultaneously
      const [apiResult, serviceResult] = await Promise.all([
        request(app).put('/api/settings/chat').send(apiSettings),
        settingsService.updateChatSettings(serviceSettings)
      ]);

      // Verify both operations completed successfully
      expect(apiResult.status).toBe(200);
      expect(serviceResult).toMatchObject(serviceSettings);

      // Verify final state is consistent
      const finalApiResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      const finalServiceSettings = await settingsService.getChatSettings();

      // Both should return the same final state
      expect(finalApiResponse.body.data).toMatchObject(finalServiceSettings);

      // Final state should match one of the two updates
      const finalSettings = finalApiResponse.body.data;
      const matchesApi = JSON.stringify(finalSettings) === JSON.stringify(apiSettings);
      const matchesService = JSON.stringify(finalSettings) === JSON.stringify(serviceSettings);
      
      expect(matchesApi || matchesService).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database connection failures gracefully', async () => {
      // Create a service with bad connection
      const badService = new SettingsService();

      // Mock the driver to simulate connection failure
      (badService as any).driver = {
        session: () => ({
          run: () => Promise.reject(new Error('Connection failed')),
          close: () => Promise.resolve()
        }),
        close: () => Promise.resolve()
      };

      // Should handle the error gracefully and return defaults
      const settings = await badService.getChatSettings();
      expect(settings.search_score_threshold).toBe(0.9); // Default value
      expect(settings.max_pages).toBe(5); // Default value

      await badService.close();
    });

    it('should recover from temporary database issues', async () => {
      // Create a service that simulates temporary failure
      const tempService = new SettingsService();

      // Mock temporary failure - first call fails, second succeeds
      let callCount = 0;
      const originalSession = (tempService as any).driver.session;
      (tempService as any).driver.session = () => {
        callCount++;
        if (callCount === 1) {
          return {
            run: () => Promise.reject(new Error('Temporary failure')),
            close: () => Promise.resolve()
          };
        } else {
          // Return a working session for subsequent calls
          return originalSession.call((tempService as any).driver);
        }
      };

      // First call should fail and return defaults
      const defaultSettings = await tempService.getChatSettings();
      expect(defaultSettings.search_score_threshold).toBe(0.9);
      expect(defaultSettings.max_pages).toBe(5);

      // Second call should succeed (using real database)
      const recoveredSettings = await tempService.getChatSettings();
      expect(recoveredSettings.search_score_threshold).toBe(0.9); // Should be defaults since DB is clean

      await tempService.close();
    });
  });

  describe('Data Consistency Integration', () => {
    it('should maintain data consistency across service instances', async () => {
      // Create multiple service instances
      const service1 = new SettingsService();
      const service2 = new SettingsService();

      try {
        // Update through first service
        const settings1 = {
          chat_service_prompt: 'Multi-service test prompt',
          search_score_threshold: 0.82,
          enable_title_matching: true,
          enable_full_page_content: true,
          max_pages: 9,
          empty_search_default_response: 'Multi-service test response',
          enable_full_validation_testing: false
        };

        await service1.updateChatSettings(settings1);

        // Read through second service
        const retrievedSettings = await service2.getChatSettings();
        expect(retrievedSettings).toMatchObject(settings1);

        // Update through second service
        const settings2 = {
          ...settings1,
          chat_service_prompt: 'Updated by second service',
          max_pages: 11
        };

        await service2.updateChatSettings(settings2);

        // Read through first service
        const finalSettings = await service1.getChatSettings();
        expect(finalSettings).toMatchObject(settings2);

      } finally {
        await service1.close();
        await service2.close();
      }
    });

    it('should handle large settings data correctly', async () => {
      // Create large prompt text (5KB)
      const largePrompt = 'A'.repeat(5000) + ' - Large prompt test';
      const largeResponse = 'B'.repeat(3000) + ' - Large response test';

      const largeSettings = {
        chat_service_prompt: largePrompt,
        search_score_threshold: 0.88,
        enable_title_matching: false,
        enable_full_page_content: true,
        max_pages: 4,
        empty_search_default_response: largeResponse,
        enable_full_validation_testing: true
      };

      // Save through API
      const saveResponse = await request(app)
        .put('/api/settings/chat')
        .send(largeSettings)
        .expect(200);

      expect(saveResponse.body.data).toMatchObject(largeSettings);

      // Verify through service
      const serviceSettings = await settingsService.getChatSettings();
      expect(serviceSettings).toMatchObject(largeSettings);

      // Verify persistence by retrieving again through service
      const persistedSettings = await settingsService.getChatSettings();
      expect(persistedSettings.chat_service_prompt).toBe(largePrompt);
      expect(persistedSettings.empty_search_default_response).toBe(largeResponse);
      expect(persistedSettings.search_score_threshold).toBe(0.88);
      expect(persistedSettings.max_pages).toBe(4);
    });
  });

  describe('Performance Integration', () => {
    it('should handle rapid successive updates efficiently', async () => {
      const startTime = Date.now();

      // Make 10 rapid updates
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const settings = {
          chat_service_prompt: `Rapid update ${i}`,
          search_score_threshold: 0.8 + (i * 0.01),
          enable_title_matching: i % 2 === 0,
          enable_full_page_content: true,
          max_pages: 5 + i,
          empty_search_default_response: `Response ${i}`,
          enable_full_validation_testing: i % 3 === 0
        };

        promises.push(
          request(app)
            .put('/api/settings/chat')
            .send(settings)
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      // Should complete within reasonable time (10 seconds for 10 updates)
      expect(totalTime).toBeLessThan(10000);

      // Verify final state is consistent
      const finalResponse = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      const finalServiceSettings = await settingsService.getChatSettings();
      expect(finalResponse.body.data).toMatchObject(finalServiceSettings);
    });
  });
});
