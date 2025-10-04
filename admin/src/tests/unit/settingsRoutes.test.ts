import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import settingsRoutes from '../../routes/settingsRoutes.js';
import { SettingsService } from '../../services/settingsService.js';

// Mock the SettingsService
vi.mock('../../services/settingsService.js', () => ({
  SettingsService: vi.fn(),
}));

const MockedSettingsService = vi.mocked(SettingsService);

describe('Settings Routes', () => {
  let app: express.Application;
  let mockSettingsService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);

    // Create mock service instance
    mockSettingsService = {
      getChatSettings: vi.fn(),
      updateChatSettings: vi.fn(),
      resetChatSettings: vi.fn(),
      close: vi.fn(),
    };

    // Mock the constructor to return our mock instance
    MockedSettingsService.mockImplementation(() => mockSettingsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/settings/chat', () => {
    it('should return chat settings successfully', async () => {
      const mockSettings = {
        chat_service_prompt: 'Test prompt',
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        empty_search_default_response: 'Test response',
        enable_full_validation_testing: false
      };

      mockSettingsService.getChatSettings.mockResolvedValue(mockSettings);

      const response = await request(app)
        .get('/api/settings/chat')
        .expect(200);

      expect(response.body).toEqual({
        data: mockSettings,
        message: 'Chat settings retrieved successfully'
      });

      expect(mockSettingsService.getChatSettings).toHaveBeenCalledOnce();
    });

    it('should handle service errors', async () => {
      mockSettingsService.getChatSettings.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/settings/chat')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to get chat settings',
        message: 'Database error'
      });


    });
  });

  describe('PUT /api/settings/chat', () => {
    const validSettings = {
      chat_service_prompt: 'Updated prompt',
      search_score_threshold: 0.8,
      enable_title_matching: false,
      enable_full_page_content: true,
      max_pages: 10,
      empty_search_default_response: 'Updated response',
      enable_full_validation_testing: true
    };

    it('should update chat settings successfully', async () => {
      mockSettingsService.updateChatSettings.mockResolvedValue(validSettings);

      const response = await request(app)
        .put('/api/settings/chat')
        .send(validSettings)
        .expect(200);

      expect(response.body).toEqual({
        data: validSettings,
        message: 'Chat settings updated successfully'
      });

      expect(mockSettingsService.updateChatSettings).toHaveBeenCalledWith(validSettings);
    });

    it('should validate request body', async () => {
      const invalidSettings = {
        chat_service_prompt: 'short', // Too short
        search_score_threshold: 1.5, // Too high
        enable_title_matching: 'not_boolean', // Wrong type
        max_pages: 0, // Too low
      };

      const response = await request(app)
        .put('/api/settings/chat')
        .send(invalidSettings)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(mockSettingsService.updateChatSettings).not.toHaveBeenCalled();
    });

    it('should handle service errors during update', async () => {
      mockSettingsService.updateChatSettings.mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .put('/api/settings/chat')
        .send(validSettings)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to update chat settings',
        message: 'Update failed'
      });


    });
  });

  describe('POST /api/settings/chat/reset', () => {
    it('should reset chat settings successfully', async () => {
      const defaultSettings = {
        chat_service_prompt: 'Default prompt',
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        empty_search_default_response: 'Default response',
        enable_full_validation_testing: false
      };

      mockSettingsService.resetChatSettings.mockResolvedValue(defaultSettings);

      const response = await request(app)
        .post('/api/settings/chat/reset')
        .expect(200);

      expect(response.body).toEqual({
        data: defaultSettings,
        message: 'Chat settings reset to defaults successfully'
      });

      expect(mockSettingsService.resetChatSettings).toHaveBeenCalledOnce();
    });

    it('should handle service errors during reset', async () => {
      mockSettingsService.resetChatSettings.mockRejectedValue(new Error('Reset failed'));

      const response = await request(app)
        .post('/api/settings/chat/reset')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to reset chat settings',
        message: 'Reset failed'
      });


    });
  });

  describe('GET /api/settings/health', () => {
    it('should return healthy status when service is working', async () => {
      mockSettingsService.getChatSettings.mockResolvedValue({});

      const response = await request(app)
        .get('/api/settings/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('settings');
      expect(response.body.message).toBe('Settings service is healthy');
      expect(response.body.timestamp).toBeDefined();

      expect(mockSettingsService.getChatSettings).toHaveBeenCalledOnce();
    });

    it('should return unhealthy status when service fails', async () => {
      mockSettingsService.getChatSettings.mockRejectedValue(new Error('Service down'));

      const response = await request(app)
        .get('/api/settings/health')
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.service).toBe('settings');
      expect(response.body.error).toBe('Settings service is unhealthy');
      expect(response.body.message).toBe('Service down');


    });
  });
});
