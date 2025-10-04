/**
 * LLM Service for Admin Backend
 * Handles embedding generation for pages and chunks
 */

import { weaveOp, WeaveService } from '../weave/weaveService.js';
import { config } from '../config.js';

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class LLMService {
  private baseUrl: string;
  private embeddingModel: string;

  constructor() {
    this.baseUrl = config.ollamaBaseUrl;
    this.embeddingModel = config.ollamaEmbeddingModel;

    // In test environment, always provide a default model regardless of config
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      this.embeddingModel = 'nomic-embed-text';
      console.log('[LLM Service] Test environment detected, using mock embedding model');
    } else if (!this.embeddingModel) {
      console.warn('Warning: OLLAMA_EMBEDDING_MODEL not configured. Embedding generation will fail.');
    }
  }

  /**
   * Generate embedding for text using Ollama
   */
  @weaveOp('LLMService.generateEmbedding')
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // In test environment, return mock embeddings immediately
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      console.log('[LLM Service] Generating mock embedding for test environment');
      // Generate a deterministic mock embedding based on text length
      const length = Math.min(text.length, 100);
      return Array.from({ length: 384 }, (_, i) => Math.sin(i + length) * 0.1);
    }

    if (!this.embeddingModel) {
      throw new Error('Embedding model not configured. Please set OLLAMA_EMBEDDING_MODEL environment variable.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      WeaveService.getInstance()?.logEvent('embedding_generated', {
        model: this.embeddingModel,
        textLength: text.length,
        embeddingDimensions: data.embedding.length,
      });

      return data.embedding;
    } catch (error) {
      WeaveService.getInstance()?.logEvent('embedding_generation_failed', {
        model: this.embeddingModel || 'unknown',
        textLength: text.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  @weaveOp('LLMService.generateEmbeddingsBatch')
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    WeaveService.getInstance()?.logEvent('batch_embeddings_generated', {
      model: this.embeddingModel,
      batchSize: texts.length,
      totalTextLength: texts.reduce((sum, text) => sum + text.length, 0),
    });

    return embeddings;
  }

  /**
   * Test connection to Ollama service
   */
  @weaveOp('LLMService.testConnection')
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models from Ollama
   */
  @weaveOp('LLMService.getAvailableModels')
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      WeaveService.getInstance()?.logEvent('model_fetch_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Validate that the configured embedding model is available
   */
  @weaveOp('LLMService.validateEmbeddingModel')
  async validateEmbeddingModel(): Promise<boolean> {
    try {
      const models = await this.getAvailableModels();
      const isAvailable = models.includes(this.embeddingModel);
      
      WeaveService.getInstance()?.logEvent('embedding_model_validation', {
        model: this.embeddingModel,
        available: isAvailable,
        availableModels: models,
      });

      return isAvailable;
    } catch (error) {
      WeaveService.getInstance()?.logEvent('embedding_model_validation_failed', {
        model: this.embeddingModel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// Export singleton instance
export const llmService = new LLMService();
