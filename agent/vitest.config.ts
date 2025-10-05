import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120000, // 120 seconds for UI tests (increased for slow operations)
    hookTimeout: 60000, // 60 seconds for setup/teardown
    include: [
      'tests/ui/**/*.test.ts',
      'tests/ui/**/*.test.js'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/unit/**/*.py',      // Exclude Python unit tests (use pytest)
      'tests/functional/**/*.py', // Exclude Python functional tests (use pytest)
      'tests/integration/**/*.py' // Exclude Python integration tests (use pytest)
    ],
    globals: true,
    environment: 'node',
    reporters: ['verbose'],
    pool: 'forks', // Use separate processes for UI tests
    poolOptions: {
      forks: {
        singleFork: true // Run tests sequentially to avoid browser conflicts
      }
    }
  }
});
