import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load weave-project/.env.local file
const envPath = path.resolve(__dirname, '../../../.env.local');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`❌ Failed to load .env.local file from: ${envPath}`);
  console.error(`   Error: ${result.error.message}`);
  console.error(`   Please create a .env.local file in the weave-project/ directory.`);
  process.exit(1);
}

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

export const testEnv = {
  // Admin Application Port (serves both frontend and backend)
  adminPort: parseInt(getRequiredEnv('ADMIN_PORT', 'Port for admin server'), 10),

  // Agent Application Ports
  agentBackendPort: parseInt(getRequiredEnv('AGENT_BACKEND_PORT', 'Port for agent backend server'), 10),
  agentClientPort: parseInt(getRequiredEnv('AGENT_CLIENT_PORT', 'Port for agent client frontend'), 10),

  // Neo4j - All required
  neo4jUri: getRequiredEnv('NEO4J_URI', 'Neo4j database URI (e.g., neo4j://localhost:7687)'),
  neo4jUser: getRequiredEnv('NEO4J_USER', 'Neo4j database username'),
  neo4jPassword: getRequiredEnv('NEO4J_PASSWORD', 'Neo4j database password'),
  neo4jDatabase: getRequiredEnv('NEO4J_DB_NAME', 'Neo4j database name'),

  // Computed URLs
  get adminUrl(): string {
    return `http://localhost:${this.adminPort}`;
  },

  // Legacy aliases for backward compatibility
  get adminBackendUrl(): string {
    return this.adminUrl;
  },

  get adminClientUrl(): string {
    return this.adminUrl;
  },

  get agentBackendUrl(): string {
    return `http://localhost:${this.agentBackendPort}`;
  },

  get agentClientUrl(): string {
    return `http://localhost:${this.agentClientPort}`;
  },
};
