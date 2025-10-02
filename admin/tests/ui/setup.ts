/**
 * Setup file for UI tests
 * Ensures the admin server is running before UI tests
 */

import { beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { chromium } from 'playwright';

let serverProcess: ChildProcess | null = null;

beforeAll(async () => {
  // Check if server is already running
  const BASE_URL = process.env.ADMIN_PORT ? `http://localhost:${process.env.ADMIN_PORT}` : 'http://localhost:3002';
  
  try {
    const response = await fetch(`${BASE_URL}/api/settings/health`);
    if (response.ok) {
      console.log('✅ Admin server is already running');
      return;
    }
  } catch (error) {
    // Server not running, we'll start it
  }

  console.log('🚀 Starting admin server for UI tests...');
  
  // Start the admin server
  serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 30 seconds'));
    }, 30000);

    const checkServer = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/settings/health`);
        if (response.ok) {
          clearTimeout(timeout);
          console.log('✅ Admin server is ready for UI tests');
          resolve();
        } else {
          setTimeout(checkServer, 1000);
        }
      } catch (error) {
        setTimeout(checkServer, 1000);
      }
    };

    checkServer();
  });

  // Install Playwright browsers if needed
  try {
    await chromium.launch();
  } catch (error) {
    console.log('📦 Installing Playwright browsers...');
    const installProcess = spawn('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit'
    });
    
    await new Promise<void>((resolve, reject) => {
      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Playwright browsers installed');
          resolve();
        } else {
          reject(new Error(`Playwright install failed with code ${code}`));
        }
      });
    });
  }
}, 60000); // 60 second timeout for setup

afterAll(async () => {
  if (serverProcess) {
    console.log('🛑 Stopping admin server...');
    serverProcess.kill();
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      serverProcess!.on('exit', () => {
        console.log('✅ Admin server stopped');
        resolve();
      });
    });
  }
});
