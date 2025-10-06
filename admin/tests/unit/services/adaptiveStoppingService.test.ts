import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveStoppingService } from '../../../src/services/adaptiveStoppingService.js';
import type {
  OptimizationIteration,
  StoppingConfig
} from '../../../src/models/promptOptimizationEnhanced.js';

describe('AdaptiveStoppingService', () => {
  let service: AdaptiveStoppingService;
  let defaultConfig: StoppingConfig;

  beforeEach(() => {
    service = new AdaptiveStoppingService();
    defaultConfig = AdaptiveStoppingService.createDefaultConfig(20, 8.5);
  });

  describe('createDefaultConfig', () => {
    it('should create valid default configuration', () => {
      const config = AdaptiveStoppingService.createDefaultConfig(30, 9.0);

      expect(config.maxIterations).toBe(30);
      expect(config.targetScore).toBe(9.0);
      expect(config.minIterations).toBe(6); // 20% of 30
      expect(config.convergenceThreshold).toBe(0.1);
      expect(config.plateauPatience).toBe(5);
      expect(config.improvementThreshold).toBe(0.01);
      expect(config.varianceThreshold).toBe(0.05);
      expect(config.confidenceThreshold).toBe(0.8);
    });

    it('should ensure minimum iterations is at least 3', () => {
      const config = AdaptiveStoppingService.createDefaultConfig(5, 8.0);
      expect(config.minIterations).toBe(3);
    });
  });

  describe('checkStoppingCriteria', () => {
    it('should not stop with no iterations', async () => {
      const decision = await service.checkStoppingCriteria([], defaultConfig);

      expect(decision.shouldStop).toBe(false);
      expect(decision.reason).toContain('No iterations completed');
      expect(decision.recommendedAction).toBe('continue');
      expect(decision.confidence).toBe(1.0);
    });

    it('should not stop before minimum iterations', async () => {
      const iterations = createMockIterations([6.0, 6.5]);
      const decision = await service.checkStoppingCriteria(iterations, defaultConfig);

      expect(decision.shouldStop).toBe(false);
      expect(decision.reason).toContain('Minimum iterations not reached');
      expect(decision.recommendedAction).toBe('continue');
    });

    it('should stop when maximum iterations reached', async () => {
      const iterations = createMockIterations(Array(20).fill(7.0));
      const decision = await service.checkStoppingCriteria(iterations, defaultConfig);

      expect(decision.shouldStop).toBe(true);
      expect(decision.reason).toContain('Maximum iterations reached');
      expect(decision.recommendedAction).toBe('stop');
      expect(decision.confidence).toBe(1.0);
    });

    it('should stop when target score achieved', async () => {
      const iterations = createMockIterations([6.0, 7.0, 8.0, 8.6]);
      const decision = await service.checkStoppingCriteria(iterations, defaultConfig);

      expect(decision.shouldStop).toBe(true);
      expect(decision.reason).toContain('Target score achieved');
      expect(decision.recommendedAction).toBe('stop');
      expect(decision.confidence).toBe(1.0);
    });

    it('should stop when convergence detected', async () => {
      // Create scores that converge (very small variance and improvement)
      const scores = [7.0, 7.01, 7.011, 7.012, 7.013, 7.014];
      const iterations = createMockIterations(scores);
      
      const config = {
        ...defaultConfig,
        minIterations: 3,
        varianceThreshold: 0.01,
        improvementThreshold: 0.005
      };

      const decision = await service.checkStoppingCriteria(iterations, config);

      expect(decision.shouldStop).toBe(true);
      expect(decision.reason).toContain('Convergence detected');
    });

    it('should continue when optimization is progressing', async () => {
      const iterations = createMockIterations([5.0, 6.0, 7.0, 7.5]);
      const decision = await service.checkStoppingCriteria(iterations, defaultConfig);

      expect(decision.shouldStop).toBe(false);
      expect(decision.reason).toContain('should continue');
      expect(decision.recommendedAction).toBe('continue');
    });
  });

  describe('detectConvergence', () => {
    it('should return default metrics for insufficient data', async () => {
      const metrics = await service.detectConvergence([7.0], 0.1);

      expect(metrics.scoreVariance).toBe(1.0);
      expect(metrics.improvementRate).toBe(0.0);
      expect(metrics.plateauLength).toBe(0);
      expect(metrics.trendDirection).toBe('stable');
      expect(metrics.confidenceLevel).toBe(0.0);
    });

    it('should detect improving trend', async () => {
      const scores = [5.0, 6.0, 7.0, 8.0];
      const metrics = await service.detectConvergence(scores, 0.1);

      expect(metrics.trendDirection).toBe('improving');
      expect(metrics.improvementRate).toBeGreaterThan(0);
    });

    it('should detect declining trend', async () => {
      const scores = [8.0, 7.5, 7.0, 6.5];
      const metrics = await service.detectConvergence(scores, 0.1);

      expect(metrics.trendDirection).toBe('declining');
      expect(metrics.improvementRate).toBeLessThan(0);
    });

    it('should detect stable trend', async () => {
      const scores = [7.0, 7.01, 6.99, 7.02, 6.98];
      const metrics = await service.detectConvergence(scores, 0.1);

      expect(metrics.trendDirection).toBe('stable');
      expect(Math.abs(metrics.improvementRate)).toBeLessThan(0.01);
    });

    it('should calculate low variance for converged scores', async () => {
      const scores = [7.0, 7.001, 7.002, 7.001, 7.003];
      const metrics = await service.detectConvergence(scores, 0.1);

      expect(metrics.scoreVariance).toBeLessThan(0.01);
    });
  });

  describe('calculateImprovementRate', () => {
    it('should return 0 for insufficient data', async () => {
      const rate = await service.calculateImprovementRate([7.0]);
      expect(rate).toBe(0);
    });

    it('should calculate positive improvement rate', async () => {
      const scores = [5.0, 6.0, 7.0, 8.0];
      const rate = await service.calculateImprovementRate(scores);
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeCloseTo(1.0, 1); // Average improvement of 1.0 per iteration
    });

    it('should calculate negative improvement rate', async () => {
      const scores = [8.0, 7.0, 6.0, 5.0];
      const rate = await service.calculateImprovementRate(scores);
      expect(rate).toBeLessThan(0);
      expect(rate).toBeCloseTo(-1.0, 1);
    });

    it('should use specified window size', async () => {
      const scores = [1.0, 2.0, 3.0, 4.0, 5.0, 5.1, 5.2];
      const rate = await service.calculateImprovementRate(scores, 3);
      
      // Should only consider last 3 scores: [5.0, 5.1, 5.2]
      expect(rate).toBeCloseTo(0.1, 1);
    });
  });

  describe('detectPlateau', () => {
    it('should return false for insufficient data', async () => {
      const plateau = await service.detectPlateau([7.0, 7.1], 5);
      expect(plateau).toBe(false);
    });

    it('should detect plateau when scores are stable', async () => {
      const scores = [7.0, 7.001, 7.002, 7.001, 7.003, 7.002];
      const plateau = await service.detectPlateau(scores, 5);
      expect(plateau).toBe(true);
    });

    it('should not detect plateau when scores are changing', async () => {
      const scores = [7.0, 7.1, 7.2, 7.3, 7.4, 7.5];
      const plateau = await service.detectPlateau(scores, 5);
      expect(plateau).toBe(false);
    });

    it('should respect patience parameter', async () => {
      const scores = [7.0, 7.001, 7.002]; // Only 2 stable iterations
      const plateau = await service.detectPlateau(scores, 5);
      expect(plateau).toBe(false);
    });
  });

  describe('predictOptimalStoppingPoint', () => {
    it('should return default prediction for insufficient data', async () => {
      const iterations = createMockIterations([7.0, 7.1]);
      const prediction = await service.predictOptimalStoppingPoint(iterations);
      expect(prediction).toBe(12); // 2 + 10
    });

    it('should predict early stop for no improvement', async () => {
      const scores = [7.0, 7.0, 7.0, 7.0, 7.0];
      const iterations = createMockIterations(scores);
      const prediction = await service.predictOptimalStoppingPoint(iterations);
      expect(prediction).toBeLessThanOrEqual(7); // Should stop soon
    });

    it('should predict longer run for rapid improvement', async () => {
      const scores = [5.0, 6.0, 7.0, 8.0, 9.0];
      const iterations = createMockIterations(scores);
      const prediction = await service.predictOptimalStoppingPoint(iterations);
      expect(prediction).toBeGreaterThan(10); // Should continue longer
    });
  });

  // Helper function to create mock iterations
  function createMockIterations(scores: number[]): OptimizationIteration[] {
    return scores.map((score, index) => ({
      id: `iter-${index}`,
      jobId: 'test-job',
      roundNumber: 1,
      iterationNumber: index + 1,
      inputPrompt: 'test prompt',
      generatedResponse: 'test response',
      actualScore: score,
      predictedScore: score,
      criteriaScores: {
        relevance: score,
        clarity: score,
        completeness: score,
        accuracy: score,
        helpfulness: score,
        engagement: score
      },
      appliedActions: [],
      improvements: [],
      agentId: 'test-agent',
      timestamp: new Date().toISOString(),
      executionTime: 100,
      confidence: 0.8,
      novelty: 0.5
    }));
  }
});
