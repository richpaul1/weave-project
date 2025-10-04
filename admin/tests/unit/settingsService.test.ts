import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsService, type ChatSettings } from '../../src/services/settingsService.js';

// Mock neo4j-driver
const mockSession = {
  run: vi.fn(),
  close: vi.fn(),
};

const mockDriver = {
  session: vi.fn(() => mockSession),
  close: vi.fn(),
};

// Mock the neo4j module
vi.mock('neo4j-driver', () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: {
      basic: vi.fn(),
    },
  },
  driver: vi.fn(() => mockDriver),
  auth: {
    basic: vi.fn(),
  },
}));

describe('SettingsService', () => {
  let settingsService: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    settingsService = new SettingsService({ driver: mockDriver as any });
  });

  afterEach(async () => {
    await settingsService.close();
  });

  describe('getChatSettings', () => {
    it('should return default settings when no settings exist in database', async () => {
      // Mock empty result from database
      mockSession.run.mockResolvedValue({
        records: [],
      });

      const settings = await settingsService.getChatSettings();

      expect(settings).toEqual({
        chat_service_prompt: 'You are a helpful AI assistant. Use the provided context to answer questions accurately and comprehensively. If you cannot find relevant information in the context, say so clearly.\\n\\nContext:\\n{context}\\n\\nQuestion: {query}\\n\\nAnswer:',
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        empty_search_default_response: "I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation.",
        enable_full_validation_testing: false
      });

      expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('MATCH (s:Setting)'));
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should return settings from database when they exist', async () => {
      // Mock database result with settings
      const mockRecords = [
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'chat_service_prompt' : 'Custom prompt') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'search_score_threshold' : '0.8') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'enable_title_matching' : 'false') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'enable_full_page_content' : 'true') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'max_pages' : '10') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'empty_search_default_response' : 'Custom response') },
        { get: vi.fn().mockImplementation((key) => key === 'key' ? 'enable_full_validation_testing' : 'true') },
      ];

      mockSession.run.mockResolvedValue({
        records: mockRecords,
      });

      const settings = await settingsService.getChatSettings();

      expect(settings).toEqual({
        chat_service_prompt: 'Custom prompt',
        search_score_threshold: 0.8,
        enable_title_matching: false,
        enable_full_page_content: true,
        max_pages: 10,
        empty_search_default_response: 'Custom response',
        enable_full_validation_testing: true
      });
    });

    it('should handle database errors gracefully', async () => {
      mockSession.run.mockRejectedValue(new Error('Database connection failed'));

      // The service should return default settings instead of throwing
      const result = await settingsService.getChatSettings();
      expect(result).toMatchObject({
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        enable_full_validation_testing: false
      });
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('updateChatSettings', () => {
    it('should update all settings in database', async () => {
      const testSettings: ChatSettings = {
        chat_service_prompt: 'Test prompt',
        search_score_threshold: 0.7,
        enable_title_matching: false,
        enable_full_page_content: false,
        max_pages: 3,
        empty_search_default_response: 'Test response',
        enable_full_validation_testing: true
      };

      mockSession.run.mockResolvedValue({});

      const result = await settingsService.updateChatSettings(testSettings);

      expect(result).toEqual(testSettings);
      expect(mockSession.run).toHaveBeenCalledTimes(7); // One call for each setting
      expect(mockSession.close).toHaveBeenCalled();

      // Verify each setting was updated
      const calls = mockSession.run.mock.calls;
      expect(calls[0][0]).toContain('MERGE (s:Setting {key: $key})');
      expect(calls[0][1]).toEqual({ key: 'chat_service_prompt', value: 'Test prompt' });
    });

    it('should handle update errors', async () => {
      const testSettings: ChatSettings = {
        chat_service_prompt: 'Test prompt',
        search_score_threshold: 0.7,
        enable_title_matching: false,
        enable_full_page_content: false,
        max_pages: 3,
        empty_search_default_response: 'Test response',
        enable_full_validation_testing: true
      };

      mockSession.run.mockRejectedValue(new Error('Update failed'));

      await expect(settingsService.updateChatSettings(testSettings)).rejects.toThrow('Update failed');
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('resetChatSettings', () => {
    it('should reset settings to defaults', async () => {
      mockSession.run.mockResolvedValue({});

      const result = await settingsService.resetChatSettings();

      expect(result).toEqual({
        chat_service_prompt: 'You are a helpful AI assistant. Use the provided context to answer questions accurately and comprehensively. If you cannot find relevant information in the context, say so clearly.\\n\\nContext:\\n{context}\\n\\nQuestion: {query}\\n\\nAnswer:',
        search_score_threshold: 0.9,
        enable_title_matching: true,
        enable_full_page_content: true,
        max_pages: 5,
        empty_search_default_response: "I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation.",
        enable_full_validation_testing: false
      });

      expect(mockSession.run).toHaveBeenCalledTimes(7); // One call for each setting
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close the driver connection', async () => {
      await settingsService.close();
      expect(mockDriver.close).toHaveBeenCalled();
    });
  });
});
