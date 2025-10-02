import neo4j, { Driver } from 'neo4j-driver';
import { config } from '../config.js';

export interface ChatSettings {
  chat_service_prompt: string;
  search_score_threshold: number;
  enable_title_matching: boolean;
  enable_full_page_content: boolean;
  max_pages: number;
  empty_search_default_response: string;
  enable_full_validation_testing: boolean;
}

export interface SettingsServiceConfig {
  driver?: Driver;
}

export class SettingsService {
  private driver: Driver;

  constructor(config?: SettingsServiceConfig) {
    if (config?.driver) {
      this.driver = config.driver;
    } else {
      this.driver = neo4j.driver(
        process.env.NEO4J_URI || 'neo4j://localhost:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );
    }
  }

  /**
   * Get current chat settings from database
   */
  async getChatSettings(): Promise<ChatSettings> {
    const session = this.driver.session();
    try {
      // Try to get settings from database
      const result = await session.run(`
        MATCH (s:Setting)
        WHERE s.key IN [
          'chat_service_prompt', 'search_score_threshold', 'enable_title_matching',
          'enable_full_page_content', 'max_pages', 'empty_search_default_response',
          'enable_full_validation_testing'
        ]
        RETURN s.key as key, s.value as value
      `);

      const settings: Partial<ChatSettings> = {};
      result.records.forEach(record => {
        const key = record.get('key');
        const value = record.get('value');
        
        // Convert string values to appropriate types
        if (key === 'search_score_threshold') {
          settings[key] = parseFloat(value);
        } else if (key === 'max_pages') {
          settings[key] = parseInt(value);
        } else if (['enable_title_matching', 'enable_full_page_content', 'enable_full_validation_testing'].includes(key)) {
          settings[key] = value === 'true' || value === true;
        } else {
          settings[key] = value;
        }
      });

      // Return settings with defaults for missing values
      return {
        chat_service_prompt: settings.chat_service_prompt || 'You are a helpful AI assistant. Use the provided context to answer questions accurately and comprehensively. If you cannot find relevant information in the context, say so clearly.\\n\\nContext:\\n{context}\\n\\nQuestion: {query}\\n\\nAnswer:',
        search_score_threshold: settings.search_score_threshold ?? 0.9,
        enable_title_matching: settings.enable_title_matching ?? true,
        enable_full_page_content: settings.enable_full_page_content ?? true,
        max_pages: settings.max_pages ?? 100,
        empty_search_default_response: settings.empty_search_default_response || "I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation.",
        enable_full_validation_testing: settings.enable_full_validation_testing ?? false
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Update chat settings in database
   */
  async updateChatSettings(settings: ChatSettings): Promise<ChatSettings> {
    const session = this.driver.session();
    try {
      // Update each setting individually
      for (const [key, value] of Object.entries(settings)) {
        await session.run(`
          MERGE (s:Setting {key: $key})
          SET s.value = $value, s.updatedAt = datetime()
        `, { key, value: String(value) });
      }

      return settings;
    } finally {
      await session.close();
    }
  }

  /**
   * Reset chat settings to defaults
   */
  async resetChatSettings(): Promise<ChatSettings> {
    const defaultSettings: ChatSettings = {
      chat_service_prompt: 'You are a helpful AI assistant. Use the provided context to answer questions accurately and comprehensively. If you cannot find relevant information in the context, say so clearly.\\n\\nContext:\\n{context}\\n\\nQuestion: {query}\\n\\nAnswer:',
      search_score_threshold: 0.9,
      enable_title_matching: true,
      enable_full_page_content: true,
      max_pages: 100,
      empty_search_default_response: "I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation.",
      enable_full_validation_testing: false
    };

    return await this.updateChatSettings(defaultSettings);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}
