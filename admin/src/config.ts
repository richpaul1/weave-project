import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load weave-project/.env.local file
const envPath = path.resolve(__dirname, '../../.env.local');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`❌ Failed to load .env.local file from: ${envPath}`);
  console.error(`   Error: ${result.error.message}`);
  console.error(`   Please create a .env.local file in the weave-project/ directory.`);
  process.exit(1);
}

console.log(`✅ Loaded environment configuration from: ${envPath}`);

/**
 * Helper function to get required environment variable
 * Throws helpful error if variable is missing
 */
function getRequiredEnv(key: string, description: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`\n❌ Missing required environment variable: ${key}`);
    console.error(`   Description: ${description}`);
    console.error(`   Please add this to weave-project/.env.local file.`);
    console.error(`   Example: ${key}=your-value-here\n`);
    process.exit(1);
  }
  return value;
}

/**
 * Helper function to get optional environment variable with default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // Server (serves both frontend and backend)
  port: parseInt(getRequiredEnv('ADMIN_PORT', 'Port for admin server'), 10),

  // Content Storage
  contentStoragePath: getRequiredEnv('CONTENT_STORAGE_PATH', 'Path where markdown content files will be stored'),

  // Neo4j - All required
  neo4jUri: getRequiredEnv('NEO4J_URI', 'Neo4j database URI (e.g., neo4j://localhost:7687)'),
  neo4jUser: getRequiredEnv('NEO4J_USER', 'Neo4j database username'),
  neo4jPassword: getRequiredEnv('NEO4J_PASSWORD', 'Neo4j database password'),
  neo4jDatabase: getRequiredEnv('NEO4J_DB_NAME', 'Neo4j database name'),

  // Ollama - Required for embeddings and LLM
  ollamaBaseUrl: getOptionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  ollamaModel: getOptionalEnv('OLLAMA_MODEL', 'llama3.2'),
  ollamaEmbeddingModel: getOptionalEnv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text'),

  // OpenAI - Optional (alternative to Ollama)
  openaiApiKey: getOptionalEnv('OPENAI_API_KEY', ''),
  openaiModel: getOptionalEnv('OPENAI_MODEL', 'gpt-4'),
  openaiEmbeddingModel: getOptionalEnv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),

  // Weave - Use same env vars as agent backend for consistency
  wandbProject: getOptionalEnv('WANDB_PROJECT', 'support-app'),
  wandbEntity: getOptionalEnv('WANDB_ENTITY', ''),
  wandbApiKey: getOptionalEnv('WANDB_API_KEY', ''), // Optional - can use local mode

  // Computed Weave project name (entity/project or just project)
  get weaveProjectName(): string {
    return this.wandbEntity ? `${this.wandbEntity}/${this.wandbProject}` : this.wandbProject;
  },
};

