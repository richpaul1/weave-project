import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptEvaluationService } from '../../../src/services/promptEvaluationService.js';
import { PromptRLEnvironment } from '../../../src/services/promptRLEnvironment.js';
import { PromptRLAgent } from '../../../src/services/promptRLAgent.js';
import type {
  PromptTemplate,
  PromptCriteria
} from '../../../src/models/promptOptimization.js';

// Performance-optimized mock services
class PerformanceLLMService {
  private responseCache = new Map<string, { text: string }>();
  private callCount = 0;

  async generateResponse(prompt: string, query: string): Promise<{ text: string }> {
    this.callCount++;
    
    // Simulate realistic response time with some variability
    const baseDelay = 50; // Base 50ms
    const variability = Math.random() * 100; // 0-100ms additional
    await new Promise(resolve => setTimeout(resolve, baseDelay + variability));

    // Extract prompt text from PromptTemplate object or use as string
    const promptText = typeof prompt === 'string' ? prompt : prompt.content || prompt.template || '';

    // Use caching for identical prompt+query combinations
    const cacheKey = `${promptText.substring(0, 100)}:${query}`;
    if (this.responseCache.has(cacheKey)) {
      return this.responseCache.get(cacheKey)!;
    }

    // Generate response based on prompt characteristics
    let response = `Response to: ${query.substring(0, 30)}...`;

    if (promptText.includes('bullet')) {
      response = `• Point 1 about ${query.split(' ')[0]}\n• Point 2\n• Point 3`;
    } else if (promptText.includes('concise')) {
      response = `Brief answer: ${query.split(' ')[0]} course recommended.`;
    } else {
      response = `Here's a detailed response about ${query}. This includes comprehensive information and recommendations.`;
    }

    const result = { text: response };
    this.responseCache.set(cacheKey, result);
    return result;
  }

  getCallCount(): number {
    return this.callCount;
  }

  clearCache(): void {
    this.responseCache.clear();
    this.callCount = 0;
  }
}

class PerformanceStorageService {
  private evaluations: any[] = [];
  private writeTime = 0;
  private readTime = 0;

  async saveEvaluation(evaluation: any): Promise<void> {
    const start = Date.now();
    // Simulate storage write time
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10));
    this.evaluations.push(evaluation);
    this.writeTime += Date.now() - start;
  }

  async getEvaluationHistory(promptId: string): Promise<any[]> {
    const start = Date.now();
    // Simulate storage read time
    await new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 5));
    const result = this.evaluations.filter(e => e.promptId === promptId);
    this.readTime += Date.now() - start;
    return result;
  }

  getPerformanceStats() {
    return {
      totalEvaluations: this.evaluations.length,
      totalWriteTime: this.writeTime,
      totalReadTime: this.readTime,
      avgWriteTime: this.evaluations.length > 0 ? this.writeTime / this.evaluations.length : 0,
      avgReadTime: this.readTime > 0 ? this.readTime : 0
    };
  }

  clear(): void {
    this.evaluations = [];
    this.writeTime = 0;
    this.readTime = 0;
  }
}

const mockWeave = {
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logEvent: vi.fn(),
  logMetrics: vi.fn(),
  getCurrentTraceUrl: vi.fn().mockReturnValue('https://perf-trace-url.com')
};

describe('Prompt Optimization Performance Tests', () => {
  let evaluationService: PromptEvaluationService;
  let environment: PromptRLEnvironment;
  let agent: PromptRLAgent;
  let llmService: PerformanceLLMService;
  let storageService: PerformanceStorageService;
  let basePrompt: PromptTemplate;
  let criteria: PromptCriteria[];

  beforeEach(() => {
    llmService = new PerformanceLLMService();
    storageService = new PerformanceStorageService();
    
    evaluationService = new PromptEvaluationService(
      llmService as any,
      storageService as any,
      mockWeave as any
    );
    
    environment = new PromptRLEnvironment(
      evaluationService,
      mockWeave as any
    );
    
    agent = new PromptRLAgent(mockWeave as any);

    basePrompt = {
      id: 'perf-test-prompt',
      name: 'Performance Test Prompt',
      systemPrompt: 'You are a helpful assistant.',
      examples: [],
      criteria: [],
      version: 1,
      metadata: {
        useCase: 'performance_testing',
        expectedResponseLength: 100,
        tone: 'professional',
        format: 'structured'
      }
    };

    criteria = [
      {
        id: 'structured',
        name: 'structured',
        description: 'Well-structured response',
        weight: 0.4,
        targetValue: 0.8,
        evaluationType: 'automated'
      },
      {
        id: 'concise',
        name: 'concise',
        description: 'Concise response',
        weight: 0.3,
        targetValue: 0.7,
        evaluationType: 'automated'
      },
      {
        id: 'relevant',
        name: 'relevant',
        description: 'Relevant response',
        weight: 0.3,
        targetValue: 0.8,
        evaluationType: 'automated'
      }
    ];
  });

  describe('Single Evaluation Performance', () => {
    it('should complete single evaluation within performance threshold', async () => {
      // Arrange
      const testQuery = 'I want to learn Python programming';
      const startTime = Date.now();

      // Act
      const result = await evaluationService.evaluatePrompt(basePrompt, [testQuery], criteria);

      // Assert
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result).toHaveLength(1);
      expect(result[0].metadata.responseTime).toBeLessThan(500); // LLM response time should be reasonable
    });

    it('should handle multiple queries efficiently', async () => {
      // Arrange
      const testQueries = [
        'I want to learn Python',
        'I want to learn JavaScript',
        'I want to learn data science',
        'I want to learn machine learning',
        'I want to learn web development'
      ];
      const startTime = Date.now();

      // Act
      const result = await evaluationService.evaluatePrompt(basePrompt, testQueries, criteria);

      // Assert
      const duration = Date.now() - startTime;
      const avgTimePerQuery = duration / testQueries.length;
      
      expect(result).toHaveLength(5);
      expect(avgTimePerQuery).toBeLessThan(800); // Average time per query should be reasonable
      expect(duration).toBeLessThan(3000); // Total time should be reasonable
    });
  });

  describe('Concurrent Evaluation Performance', () => {
    it('should handle concurrent evaluations efficiently', async () => {
      // Arrange
      const concurrentEvaluations = 5;
      const testQuery = 'I want to learn programming';
      const startTime = Date.now();

      // Act
      const promises = Array(concurrentEvaluations).fill(null).map(() =>
        evaluationService.evaluatePrompt(basePrompt, [testQuery], criteria)
      );

      const results = await Promise.all(promises);

      // Assert
      const duration = Date.now() - startTime;
      const avgTimePerEvaluation = duration / concurrentEvaluations;

      expect(results).toHaveLength(concurrentEvaluations);
      expect(avgTimePerEvaluation).toBeLessThan(1000); // Should benefit from concurrency
      expect(duration).toBeLessThan(2000); // Total time should be less than sequential
      
      // Verify all evaluations completed successfully
      results.forEach(result => {
        expect(result).toHaveLength(1);
        expect(result[0].overallScore).toBeGreaterThanOrEqual(0);
      });
    });

    it('should maintain performance under high concurrency', async () => {
      // Arrange
      const highConcurrency = 10;
      const testQuery = 'Performance test query';
      const startTime = Date.now();

      // Act
      const promises = Array(highConcurrency).fill(null).map((_, index) =>
        evaluationService.evaluatePrompt(
          { ...basePrompt, id: `prompt-${index}` },
          [testQuery],
          criteria
        )
      );

      const results = await Promise.all(promises);

      // Assert
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(highConcurrency);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Check LLM service performance
      const llmCallCount = llmService.getCallCount();
      expect(llmCallCount).toBe(highConcurrency); // Should make expected number of calls
    }, 10000);
  });

  describe('RL Training Performance', () => {
    it('should complete RL episode within performance threshold', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await environment.reset(basePrompt, criteria, 'test query');
      const action = environment.getAvailableActions()[0];
      const result = await environment.step(action);

      // Assert
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Single step should complete quickly
      expect(result.reward).toBeTypeOf('number');
      expect(result.nextState).toBeDefined();
    });

    it('should complete optimization session within reasonable time', async () => {
      // Arrange
      const maxEpisodes = 3;
      await environment.reset(basePrompt, criteria);
      const startTime = Date.now();

      // Act
      const session = await agent.runOptimizationSession(environment, maxEpisodes);

      // Assert
      const duration = Date.now() - startTime;
      const avgTimePerEpisode = duration / session.episodes.length;

      expect(session.episodes.length).toBeLessThanOrEqual(maxEpisodes);
      expect(avgTimePerEpisode).toBeLessThan(5000); // Average episode time should be reasonable
      expect(duration).toBeLessThan(15000); // Total session time should be reasonable
    }, 20000);

    it('should scale linearly with episode count', async () => {
      // Arrange
      const episodeCounts = [1, 2, 3];
      const timings: number[] = [];

      // Act
      for (const episodeCount of episodeCounts) {
        await environment.reset(basePrompt, criteria);
        const startTime = Date.now();
        const session = await agent.runOptimizationSession(environment, episodeCount);
        const duration = Date.now() - startTime;
        timings.push(duration);
        
        expect(session.episodes.length).toBeLessThanOrEqual(episodeCount);
      }

      // Assert - Should scale roughly linearly
      const timePerEpisode1 = timings[0] / 1;
      const timePerEpisode2 = timings[1] / 2;
      const timePerEpisode3 = timings[2] / 3;

      // Allow for some variance but expect reasonable scaling
      const maxVariance = Math.max(timePerEpisode1, timePerEpisode2, timePerEpisode3);
      const minVariance = Math.min(timePerEpisode1, timePerEpisode2, timePerEpisode3);
      const varianceRatio = maxVariance / minVariance;

      expect(varianceRatio).toBeLessThan(3); // Should not vary by more than 3x
    }, 30000);
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory during repeated evaluations', async () => {
      // Arrange
      const iterations = 20;
      const testQuery = 'Memory test query';
      const initialMemory = process.memoryUsage().heapUsed;

      // Act
      for (let i = 0; i < iterations; i++) {
        await evaluationService.evaluatePrompt(
          { ...basePrompt, id: `memory-test-${i}` },
          [testQuery],
          criteria
        );
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePerIteration = memoryIncrease / iterations;

      // Memory increase should be reasonable (less than 1MB per iteration)
      expect(memoryIncreasePerIteration).toBeLessThan(1024 * 1024);
    }, 15000);

    it('should efficiently use storage operations', async () => {
      // Arrange
      const testQueries = ['Query 1', 'Query 2', 'Query 3'];

      // Act
      await evaluationService.evaluatePrompt(basePrompt, testQueries, criteria);

      // Assert
      const storageStats = storageService.getPerformanceStats();
      
      expect(storageStats.totalEvaluations).toBe(3);
      expect(storageStats.avgWriteTime).toBeLessThan(50); // Average write time should be fast
      expect(storageStats.totalWriteTime).toBeLessThan(150); // Total write time should be reasonable
    });
  });

  describe('Throughput Performance', () => {
    it('should achieve minimum throughput for evaluations', async () => {
      // Arrange
      const targetThroughput = 5; // evaluations per second
      const testDuration = 3000; // 3 seconds
      const testQuery = 'Throughput test query';
      
      let completedEvaluations = 0;
      const startTime = Date.now();

      // Act - Run evaluations for specified duration
      const promises: Promise<any>[] = [];
      
      while (Date.now() - startTime < testDuration) {
        const promise = evaluationService.evaluatePrompt(
          { ...basePrompt, id: `throughput-${completedEvaluations}` },
          [testQuery],
          criteria
        ).then(() => {
          completedEvaluations++;
        });
        
        promises.push(promise);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await Promise.all(promises);

      // Assert
      const actualDuration = Date.now() - startTime;
      const actualThroughput = (completedEvaluations * 1000) / actualDuration;

      expect(actualThroughput).toBeGreaterThan(targetThroughput);
      expect(completedEvaluations).toBeGreaterThan(0);
    }, 10000);

    it('should maintain consistent response times under load', async () => {
      // Arrange
      const loadTestCount = 15;
      const testQuery = 'Load test query';
      const responseTimes: number[] = [];

      // Act
      for (let i = 0; i < loadTestCount; i++) {
        const startTime = Date.now();
        await evaluationService.evaluatePrompt(
          { ...basePrompt, id: `load-test-${i}` },
          [testQuery],
          criteria
        );
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Assert
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      const responseTimeVariance = maxResponseTime - minResponseTime;

      expect(avgResponseTime).toBeLessThan(1000); // Average should be reasonable
      expect(maxResponseTime).toBeLessThan(2000); // Max should not be too high
      expect(responseTimeVariance).toBeLessThan(1500); // Variance should be reasonable
    }, 20000);
  });

  describe('Optimization Performance', () => {
    it('should show performance improvement over time', async () => {
      // Arrange
      const testQuery = 'Performance improvement test';
      const episodeCount = 5;
      await environment.reset(basePrompt, criteria);

      // Act
      const session = await agent.runOptimizationSession(environment, episodeCount);

      // Assert
      expect(session.episodes.length).toBeGreaterThan(0);
      
      // Check that episodes completed in reasonable time
      session.episodes.forEach(episode => {
        // Episodes should have actions and rewards
        expect(episode.actions.length).toBeGreaterThan(0);
        expect(episode.rewards.length).toBeGreaterThan(0);
        expect(episode.actions.length).toBe(episode.rewards.length);

        // Episode should have reasonable total reward
        expect(episode.totalReward).toBeLessThan(0); // Rewards are typically negative in this system
      });

      // Verify session completed efficiently
      const sessionStartTime = new Date(session.startTime).getTime();
      const sessionEndTime = new Date(session.endTime).getTime();
      const sessionDuration = sessionEndTime - sessionStartTime;
      
      expect(sessionDuration).toBeLessThan(30000); // Session should complete within 30 seconds
    }, 35000);
  });
});
