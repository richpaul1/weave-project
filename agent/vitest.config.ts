import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000, // 60 seconds for UI tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    include: ['tests/ui/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
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
