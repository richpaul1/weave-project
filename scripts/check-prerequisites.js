#!/usr/bin/env node

/**
 * Check Prerequisites Script
 * 
 * Verifies that all required services and dependencies are available
 * before starting the Weave Project.
 */

const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const { green, red, yellow, blue, cyan, reset } = colors;

let allChecksPassed = true;

console.log(`${blue}🔍 Checking Weave Project Prerequisites...${reset}\n`);

// Helper function to check if a command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper function to get command version
function getVersion(command, versionFlag = '--version') {
  try {
    const output = execSync(`${command} ${versionFlag}`, { encoding: 'utf8' });
    return output.trim().split('\n')[0];
  } catch {
    return 'unknown';
  }
}

// Helper function to check HTTP endpoint
function checkEndpoint(url, timeout = 2000) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Check functions
async function checkNode() {
  console.log(`${cyan}Checking Node.js...${reset}`);
  if (!commandExists('node')) {
    console.log(`${red}✗ Node.js not found${reset}`);
    console.log(`  Install from: https://nodejs.org/\n`);
    allChecksPassed = false;
    return;
  }
  
  const version = getVersion('node', '--version');
  const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
  
  if (majorVersion >= 18) {
    console.log(`${green}✓ Node.js ${version}${reset}\n`);
  } else {
    console.log(`${yellow}⚠ Node.js ${version} (v18+ recommended)${reset}\n`);
  }
}

async function checkPython() {
  console.log(`${cyan}Checking Python...${reset}`);
  if (!commandExists('python') && !commandExists('python3')) {
    console.log(`${red}✗ Python not found${reset}`);
    console.log(`  Install from: https://www.python.org/\n`);
    allChecksPassed = false;
    return;
  }
  
  const pythonCmd = commandExists('python3') ? 'python3' : 'python';
  const version = getVersion(pythonCmd, '--version');
  
  console.log(`${green}✓ ${version}${reset}\n`);
}

async function checkNeo4j() {
  console.log(`${cyan}Checking Neo4j...${reset}`);
  const isRunning = await checkEndpoint('http://localhost:7474');
  
  if (isRunning) {
    console.log(`${green}✓ Neo4j is running on port 7474${reset}\n`);
  } else {
    console.log(`${red}✗ Neo4j is not running on port 7474${reset}`);
    console.log(`  Start Neo4j or run: docker run --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password -d neo4j:latest\n`);
    allChecksPassed = false;
  }
}

async function checkOllama() {
  console.log(`${cyan}Checking Ollama...${reset}`);
  const isRunning = await checkEndpoint('http://localhost:11434/api/tags');
  
  if (isRunning) {
    console.log(`${green}✓ Ollama is running on port 11434${reset}\n`);
  } else {
    console.log(`${red}✗ Ollama is not running on port 11434${reset}`);
    console.log(`  Start Ollama: ollama serve\n`);
    allChecksPassed = false;
  }
}

async function checkEnvFile() {
  console.log(`${cyan}Checking .env.local...${reset}`);
  const envPath = path.join(__dirname, '..', '.env.local');
  
  if (fs.existsSync(envPath)) {
    console.log(`${green}✓ .env.local file found${reset}\n`);
  } else {
    console.log(`${red}✗ .env.local file not found${reset}`);
    console.log(`  Create .env.local in the weave-project directory\n`);
    allChecksPassed = false;
  }
}

async function checkDependencies() {
  console.log(`${cyan}Checking dependencies...${reset}`);
  
  // Check admin-backend dependencies
  const adminNodeModules = path.join(__dirname, '..', 'admin-backend', 'node_modules');
  if (fs.existsSync(adminNodeModules)) {
    console.log(`${green}✓ Admin backend dependencies installed${reset}`);
  } else {
    console.log(`${yellow}⚠ Admin backend dependencies not installed${reset}`);
    console.log(`  Run: cd admin-backend && npm install`);
  }
  
  // Check client dependencies
  const clientNodeModules = path.join(__dirname, '..', 'client', 'node_modules');
  if (fs.existsSync(clientNodeModules)) {
    console.log(`${green}✓ Client dependencies installed${reset}`);
  } else {
    console.log(`${yellow}⚠ Client dependencies not installed${reset}`);
    console.log(`  Run: cd client && npm install`);
  }
  
  // Check agent-backend dependencies
  const agentVenv = path.join(__dirname, '..', 'agent-backend', 'venv');
  if (fs.existsSync(agentVenv)) {
    console.log(`${green}✓ Agent backend virtual environment found${reset}`);
  } else {
    console.log(`${yellow}⚠ Agent backend virtual environment not found${reset}`);
    console.log(`  Run: cd agent-backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`);
  }
  
  console.log();
}

async function checkPorts() {
  console.log(`${cyan}Checking ports...${reset}`);
  
  const ports = [
    { port: 3002, service: 'Admin Backend' },
    { port: 8000, service: 'Agent Backend' },
    { port: 5174, service: 'Frontend' },
  ];
  
  for (const { port, service } of ports) {
    const isInUse = await checkEndpoint(`http://localhost:${port}`);
    if (isInUse) {
      console.log(`${yellow}⚠ Port ${port} (${service}) is already in use${reset}`);
    } else {
      console.log(`${green}✓ Port ${port} (${service}) is available${reset}`);
    }
  }
  
  console.log();
}

// Main execution
async function main() {
  await checkNode();
  await checkPython();
  await checkNeo4j();
  await checkOllama();
  await checkEnvFile();
  await checkDependencies();
  await checkPorts();
  
  console.log(`${blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}\n`);
  
  if (allChecksPassed) {
    console.log(`${green}✅ All prerequisites are met!${reset}`);
    console.log(`${green}You can start the services with: npm run dev${reset}\n`);
    process.exit(0);
  } else {
    console.log(`${red}❌ Some prerequisites are missing${reset}`);
    console.log(`${yellow}Please fix the issues above before starting the services${reset}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${red}Error checking prerequisites:${reset}`, error);
  process.exit(1);
});

