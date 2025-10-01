#!/usr/bin/env node

/**
 * Dev with URLs
 *
 * Wrapper script that starts dev servers then prints URLs
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('\n🚀 Starting services...\n');

// Start the dev servers
const dev = spawn('npm', ['run', 'dev:raw'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
});

// Wait a bit for services to start, then print URLs
setTimeout(() => {
  console.log('\n');
  spawn('node', [path.join(__dirname, 'print-urls.js')], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
}, 3000); // Wait 3 seconds for services to start

// Forward signals to child process
process.on('SIGINT', () => {
  dev.kill('SIGINT');
});

process.on('SIGTERM', () => {
  dev.kill('SIGTERM');
});

dev.on('close', (code) => {
  process.exit(code || 0);
});

