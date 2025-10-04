/**
 * LLM Service for Admin Backend
 * Handles embedding generation for pages and chunks
 */

import { weave } from '../weave/init.js';
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

    if (!this.embeddingModel) {
      console.warn('Warning: OLLAMA_EMBEDDING_MODEL not configured. Embedding generation will fail.');
    }
  }

  /**
   * Generate embedding for text using Ollama
   */
  @weave.op()
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
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

      weave.logEvent('embedding_generated', {
        model: this.embeddingModel,
        textLength: text.length,
        embeddingDimensions: data.embedding.length,
      });

      return data.embedding;
    } catch (error) {
      weave.logEvent('embedding_generation_failed', {
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
  @weave.op()
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    weave.logEvent('batch_embeddings_generated', {
      model: this.embeddingModel,
      batchSize: texts.length,
      totalTextLength: texts.reduce((sum, text) => sum + text.length, 0),
    });

    return embeddings;
  }

  /**
   * Test connection to Ollama service
   */
  @weave.op()
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
  @weave.op()
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      weave.logEvent('model_fetch_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Validate that the configured embedding model is available
   */
  @weave.op()
  async validateEmbeddingModel(): Promise<boolean> {
    try {
      const models = await this.getAvailableModels();
      const isAvailable = models.includes(this.embeddingModel);
      
      weave.logEvent('embedding_model_validation', {
        model: this.embeddingModel,
        available: isAvailable,
        availableModels: models,
      });

      return isAvailable;
    } catch (error) {
      weave.logEvent('embedding_model_validation_failed', {
        model: this.embeddingModel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// Export singleton instance
export const llmService = new LLMService();
