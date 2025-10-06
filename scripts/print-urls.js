#!/usr/bin/env node

/**
 * Print Service URLs
 *
 * Displays all service URLs after starting the application
 * Reads configuration from .env.local file
 */

const fs = require('fs');
const path = require('path');

// Load .env.local file
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};

if (!fs.existsSync(envPath)) {
  console.error('\n❌ Error: .env.local file not found');
  console.error(`   Expected location: ${envPath}`);
  console.error('   Please create .env.local file in the weave-project directory\n');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Helper to get required env var
function getRequiredEnv(key, description) {
  const value = env[key];
  if (!value) {
    console.error(`\n❌ Missing required environment variable: ${key}`);
    console.error(`   Description: ${description}`);
    console.error(`   Please add this to weave-project/.env.local file\n`);
    process.exit(1);
  }
  return value;
}

// Build Weave project URL
const wandbEntity = env.WANDB_ENTITY || '';
const wandbProject = getRequiredEnv('WANDB_PROJECT', 'Weights & Biases project name');
const weaveUrl = wandbEntity
  ? `https://wandb.ai/${wandbEntity}/${wandbProject}/weave`
  : `https://wandb.ai/${wandbProject}/weave`;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

const { reset, bright, green, blue, cyan, yellow } = colors;

console.log('\n');
console.log(`${bright}${blue}${'═'.repeat(60)}${reset}`);
console.log(`${bright}${blue}  🚀 IzzyDocs - Access URLs${reset}`);
console.log(`${bright}${blue}${'═'.repeat(60)}${reset}`);
console.log('');

console.log(`${bright}${cyan}Admin Frontend (Content Management & Graph):${reset}`);
console.log(`  ${green}➜${reset}  ${bright}http://localhost:3003/${reset}`);
console.log(`  ${green}➜${reset}  ${bright}http://localhost:3003/graph${reset} (Knowledge Graph)`);
console.log('');

console.log(`${bright}${cyan}Chat Frontend (Ask Questions):${reset}`);
console.log(`  ${green}➜${reset}  ${bright}http://localhost:8001/${reset}`);
console.log('');

console.log(`${bright}${cyan}Backend APIs:${reset}`);
console.log(`  ${green}➜${reset}  Admin Backend: ${bright}http://localhost:3002${reset}`);
console.log(`  ${green}➜${reset}  Agent Backend: ${bright}http://localhost:8000${reset}`);
console.log('');

console.log(`${bright}${cyan}Weave Dashboard (Observability):${reset}`);
console.log(`  ${green}➜${reset}  ${bright}${weaveUrl}${reset}`);
console.log('');

console.log(`${bright}${blue}${'═'.repeat(60)}${reset}`);
console.log(`${bright}${yellow}  💡 Tip: Press Ctrl+C to stop all services${reset}`);
console.log(`${bright}${blue}${'═'.repeat(60)}${reset}`);
console.log('\n');

