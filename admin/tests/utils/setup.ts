import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables for testing
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env.test') });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Mock console methods to reduce noise during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  
  // Keep error logging for debugging
  const originalError = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (process.env.VITEST_VERBOSE === 'true') {
      originalError(...args);
    }
  });
});

afterAll(async () => {
  // Restore console methods
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  vi.clearAllTimers();
});

// Global test utilities
declare global {
  var testUtils: {
    createMockPrompt: () => any;
    createMockCriteria: () => any[];
    createMockWeave: () => any;
    createMockEvaluation: () => any;
    createMockRLState: () => any;
    createMockRLAgentConfig: () => any;
    sleep: (ms: number) => Promise<void>;
  };
}

// Test utilities
global.testUtils = {
  createMockPrompt: () => ({
    id: 'test-prompt-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Prompt',
    systemPrompt: 'You are a helpful assistant.',
    examples: [
      {
        id: 'example-1',
        userQuery: 'Test query',
        expectedResponse: 'Test response',
        explanation: 'Test explanation'
      }
    ],
    criteria: [],
    version: 1,
    metadata: {
      useCase: 'testing',
      expectedResponseLength: 100,
      tone: 'professional',
      format: 'structured'
    }
  }),

  createMockCriteria: () => [
    {
      id: 'structured',
      name: 'structured',
      description: 'Response should be well-structured',
      weight: 0.3,
      targetValue: 0.8,
      evaluationType: 'automated'
    },
    {
      id: 'actionable',
      name: 'actionable',
      description: 'Response should be actionable',
      weight: 0.25,
      targetValue: 0.7,
      evaluationType: 'automated'
    },
    {
      id: 'concise',
      name: 'concise',
      description: 'Response should be concise',
      weight: 0.2,
      targetValue: 0.8,
      evaluationType: 'automated'
    },
    {
      id: 'relevant',
      name: 'relevant',
      description: 'Response should be relevant',
      weight: 0.25,
      targetValue: 0.8,
      evaluationType: 'automated'
    }
  ],

  createMockWeave: () => ({
    createChildTrace: vi.fn().mockImplementation((name, operation) => operation()),
    logEvent: vi.fn(),
    logMetric: vi.fn(),
    getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
  }),

  createMockEvaluation: () => ({
    id: 'eval-' + Math.random().toString(36).substr(2, 9),
    promptId: 'test-prompt-1',
    testQuery: 'test query',
    response: 'test response',
    criteriaScores: { structured: 0.8, concise: 0.7, actionable: 0.9 },
    overallScore: 0.8,
    metadata: {
      tokenCount: 50,
      evaluatorType: 'automated' as const,
      timestamp: new Date().toISOString(),
      responseTime: 100
    }
  }),

  createMockRLState: () => ({
    promptTemplate: global.testUtils.createMockPrompt(),
    recentEvaluations: [global.testUtils.createMockEvaluation()],
    targetCriteria: global.testUtils.createMockCriteria(),
    contextQuery: 'test query',
    performanceHistory: {
      averageScore: 0.75,
      trendDirection: 'stable' as const,
      successRate: 0.8
    }
  }),

  createMockRLAgentConfig: () => ({
    algorithm: 'ppo' as const,
    hyperparameters: {
      explorationRate: 0.2,
      learningRate: 0.001,
      discountFactor: 0.95,
      explorationDecay: 0.995
    },
    trainingConfig: {
      maxEpisodes: 50,
      maxEpisodeLength: 20,
      convergenceThreshold: 0.9,
      evaluationFrequency: 5
    }
  }),

  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

// Performance monitoring for tests
const performanceMonitor = {
  testStartTimes: new Map<string, number>(),
  
  startTest(testName: string) {
    this.testStartTimes.set(testName, Date.now());
  },
  
  endTest(testName: string) {
    const startTime = this.testStartTimes.get(testName);
    if (startTime) {
      const duration = Date.now() - startTime;
      if (duration > 5000) { // Log slow tests
        console.warn(`Slow test detected: ${testName} took ${duration}ms`);
      }
      this.testStartTimes.delete(testName);
    }
  }
};

// Add performance monitoring to global scope
(global as any).performanceMonitor = performanceMonitor;

// Memory leak detection
let initialMemoryUsage: NodeJS.MemoryUsage;

beforeAll(() => {
  initialMemoryUsage = process.memoryUsage();
});

afterAll(() => {
  const finalMemoryUsage = process.memoryUsage();
  const memoryIncrease = finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed;
  
  // Log significant memory increases
  if (memoryIncrease > 50 * 1024 * 1024) { // 50MB
    console.warn(`Significant memory increase detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
  }
});

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

export {};
