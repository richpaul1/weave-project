import { Router, Request, Response } from 'express';
import { SettingsService, ChatSettings } from '../services/settingsService.js';
import { z } from 'zod';

const router = Router();

// Validation schema for chat settings
const chatSettingsSchema = z.object({
  chat_service_prompt: z.string().min(10, "Please enter a valid prompt"),
  search_score_threshold: z.number().min(0.5, "Threshold must be at least 0.5").max(1.0, "Threshold must be at most 1.0"),
  enable_title_matching: z.boolean(),
  enable_full_page_content: z.boolean(),
  max_pages: z.number().min(1, "Must be at least 1").max(1000, "Must be at most 1000"),
  empty_search_default_response: z.string().min(10, "Please enter a valid default response"),
  enable_full_validation_testing: z.boolean(),
});

/**
 * GET /api/settings/chat
 * Get current chat settings
 */
router.get('/chat', async (req: Request, res: Response) => {
  const settingsService = new SettingsService();
  
  try {
    const settings = await settingsService.getChatSettings();
    res.json({
      data: settings,
      message: 'Chat settings retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting chat settings:', error);
    res.status(500).json({
      error: 'Failed to get chat settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await settingsService.close();
  }
});

/**
 * PUT /api/settings/chat
 * Update chat settings
 */
router.put('/chat', async (req: Request, res: Response) => {
  const settingsService = new SettingsService();
  
  try {
    // Validate request body
    const validationResult = chatSettingsSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid settings data',
        details: validationResult.error.errors
      });
    }

    const settings = validationResult.data;
    const updatedSettings = await settingsService.updateChatSettings(settings);
    
    res.json({
      data: updatedSettings,
      message: 'Chat settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating chat settings:', error);
    res.status(500).json({
      error: 'Failed to update chat settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await settingsService.close();
  }
});

/**
 * POST /api/settings/chat/reset
 * Reset chat settings to defaults
 */
router.post('/chat/reset', async (req: Request, res: Response) => {
  const settingsService = new SettingsService();
  
  try {
    const defaultSettings = await settingsService.resetChatSettings();
    
    res.json({
      data: defaultSettings,
      message: 'Chat settings reset to defaults successfully'
    });
  } catch (error) {
    console.error('Error resetting chat settings:', error);
    res.status(500).json({
      error: 'Failed to reset chat settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await settingsService.close();
  }
});

/**
 * GET /api/settings/health
 * Health check for settings service
 */
router.get('/health', async (req: Request, res: Response) => {
  const settingsService = new SettingsService();
  
  try {
    // Try to get settings to verify database connection
    await settingsService.getChatSettings();
    
    res.json({
      status: 'ok',
      service: 'settings',
      timestamp: new Date().toISOString(),
      message: 'Settings service is healthy'
    });
  } catch (error) {
    console.error('Settings health check failed:', error);
    res.status(500).json({
      status: 'error',
      service: 'settings',
      timestamp: new Date().toISOString(),
      error: 'Settings service is unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await settingsService.close();
  }
});

export default router;
