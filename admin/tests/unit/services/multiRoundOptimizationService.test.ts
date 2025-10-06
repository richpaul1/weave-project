import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiRoundOptimizationService } from '../../../src/services/multiRoundOptimizationService.js';
import type {
  OptimizationRound,
  MultiRoundConfig
} from '../../../src/models/promptOptimizationEnhanced.js';

// Mock Weave
const mockWeave = {
  op: vi.fn((fn: Function, name: string) => fn),
  createChildTrace: vi.fn((name: string, fn: Function) => fn()),
  logEvent: vi.fn(),
  createTrace: vi.fn(),
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logMetric: vi.fn(),
  logMetrics: vi.fn()
};

describe('MultiRoundOptimizationService', () => {
  let service: MultiRoundOptimizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MultiRoundOptimizationService(mockWeave);
  });

  describe('createMultiRoundStrategy', () => {
    it('should create a three-phase strategy by default', async () => {
      const jobConfig = {
        maxIterations: 30,
        targetScore: 8.0
      };

      const strategy = await service.createMultiRoundStrategy(jobConfig);

      expect(strategy).toBeDefined();
      expect(strategy.rounds).toHaveLength(3);
      expect(strategy.globalTargetScore).toBe(8.5);
      expect(strategy.maxTotalIterations).toBe(30);
      expect(strategy.allowEarlyTermination).toBe(true);
      expect(strategy.transferLearning).toBe(true);
    });

    it('should handle custom configuration parameters', async () => {
      const jobConfig = {
        maxIterations: 50,
        targetScore: 9.0
      };

      const strategy = await service.createMultiRoundStrategy(jobConfig);

      expect(strategy.globalTargetScore).toBe(9.5);
      expect(strategy.maxTotalIterations).toBe(50);
    });

    it('should cap global target score at 10.0', async () => {
      const jobConfig = {
        maxIterations: 20,
        targetScore: 9.8
      };

      const strategy = await service.createMultiRoundStrategy(jobConfig);

      expect(strategy.globalTargetScore).toBe(10.0);
    });
  });

  describe('generateOptimizationRounds', () => {
    it('should generate three-phase strategy correctly', async () => {
      const rounds = await service.generateOptimizationRounds('three_phase', 30);

      expect(rounds).toHaveLength(3);
      
      // Check exploration phase
      expect(rounds[0].strategy).toBe('exploration');
      expect(rounds[0].agentConfig.explorationRate).toBe(0.8);
      expect(rounds[0].targetScore).toBe(6.0);
      
      // Check refinement phase
      expect(rounds[1].strategy).toBe('refinement');
      expect(rounds[1].agentConfig.explorationRate).toBe(0.4);
      expect(rounds[1].targetScore).toBe(7.5);
      
      // Check fine-tuning phase
      expect(rounds[2].strategy).toBe('fine_tuning');
      expect(rounds[2].agentConfig.explorationRate).toBe(0.1);
      expect(rounds[2].targetScore).toBe(8.5);
    });

    it('should generate adaptive strategy correctly', async () => {
      const rounds = await service.generateOptimizationRounds('adaptive', 20);

      expect(rounds).toHaveLength(2);
      expect(rounds[0].strategy).toBe('exploration');
      expect(rounds[1].strategy).toBe('refinement');
      expect(rounds[0].agentConfig.explorationRate).toBe(0.9);
      expect(rounds[1].agentConfig.explorationRate).toBe(0.3);
    });

    it('should generate focused strategy correctly', async () => {
      const rounds = await service.generateOptimizationRounds('focused', 25);

      expect(rounds).toHaveLength(1);
      expect(rounds[0].strategy).toBe('refinement');
      expect(rounds[0].maxIterations).toBe(25);
      expect(rounds[0].agentConfig.explorationRate).toBe(0.5);
    });

    it('should default to three-phase for unknown strategy', async () => {
      const rounds = await service.generateOptimizationRounds('unknown', 15);

      expect(rounds).toHaveLength(3);
      expect(rounds[0].strategy).toBe('exploration');
    });

    it('should distribute iterations correctly across phases', async () => {
      const totalIterations = 30;
      const rounds = await service.generateOptimizationRounds('three_phase', totalIterations);

      const totalAllocated = rounds.reduce((sum, round) => sum + round.maxIterations, 0);
      expect(totalAllocated).toBe(totalIterations);
      
      // Check approximate distribution (40%, 40%, 20%)
      expect(rounds[0].maxIterations).toBe(12); // 40% of 30
      expect(rounds[1].maxIterations).toBe(12); // 40% of 30
      expect(rounds[2].maxIterations).toBe(6);  // remaining 20%
    });
  });

  describe('executeMultiRoundOptimization', () => {
    it('should execute multi-round optimization session', async () => {
      const config: MultiRoundConfig = {
        rounds: [
          {
            roundNumber: 1,
            strategy: 'exploration',
            maxIterations: 5,
            targetScore: 6.0,
            convergenceThreshold: 0.3,
            agentConfig: {
              explorationRate: 0.8,
              learningRate: 0.1,
              diversityBonus: 0.3
            }
          }
        ],
        globalTargetScore: 8.0,
        maxTotalIterations: 10,
        allowEarlyTermination: true,
        transferLearning: false,
        adaptiveRoundAdjustment: false,
        convergencePatience: 3
      };

      const session = await service.executeMultiRoundOptimization('test-job-1', config);

      expect(session).toBeDefined();
      expect(session.jobId).toBe('test-job-1');
      expect(session.rounds).toHaveLength(1);
      expect(session.status).toMatch(/completed|early_terminated/);
      expect(session.totalIterations).toBeGreaterThan(0);
      expect(session.globalBestScore).toBeGreaterThan(0);
    });

    it('should handle early termination on target score', async () => {
      // Mock high performance to trigger early termination
      const originalExecuteRound = (service as any)._executeRound;
      (service as any)._executeRound = vi.fn().mockResolvedValue({
        roundNumber: 1,
        strategy: 'exploration',
        iterationsCompleted: 3,
        bestScore: 9.0, // High score to trigger early termination
        convergenceReached: false,
        improvements: ['test improvement'],
        executionTime: 100
      });

      const config: MultiRoundConfig = {
        rounds: [
          {
            roundNumber: 1,
            strategy: 'exploration',
            maxIterations: 10,
            targetScore: 6.0,
            convergenceThreshold: 0.3,
            agentConfig: {
              explorationRate: 0.8,
              learningRate: 0.1,
              diversityBonus: 0.3
            }
          },
          {
            roundNumber: 2,
            strategy: 'refinement',
            maxIterations: 10,
            targetScore: 7.5,
            convergenceThreshold: 0.2,
            agentConfig: {
              explorationRate: 0.4,
              learningRate: 0.05,
              diversityBonus: 0.1
            }
          }
        ],
        globalTargetScore: 8.5,
        maxTotalIterations: 20,
        allowEarlyTermination: true,
        transferLearning: false,
        adaptiveRoundAdjustment: false,
        convergencePatience: 3
      };

      const session = await service.executeMultiRoundOptimization('test-job-2', config);

      expect(session.status).toBe('early_terminated');
      expect(session.terminationReason).toBe('global_target_reached');
      expect(session.rounds).toHaveLength(1); // Should stop after first round

      // Restore original method
      (service as any)._executeRound = originalExecuteRound;
    });
  });

  describe('checkGlobalConvergence', () => {
    it('should return false for insufficient data', async () => {
      const session = {
        sessionId: 'test',
        jobId: 'test',
        rounds: [],
        globalBestScore: 0,
        totalIterations: 0,
        totalExecutionTime: 0,
        status: 'running' as const
      };

      const converged = await service.checkGlobalConvergence(session);
      expect(converged).toBe(false);
    });

    it('should detect convergence when improvement is minimal', async () => {
      const session = {
        sessionId: 'test',
        jobId: 'test',
        rounds: [
          {
            roundNumber: 1,
            strategy: 'exploration',
            iterationsCompleted: 5,
            bestScore: 7.0,
            convergenceReached: false,
            improvements: [],
            executionTime: 100
          },
          {
            roundNumber: 2,
            strategy: 'refinement',
            iterationsCompleted: 5,
            bestScore: 7.02, // Minimal improvement
            convergenceReached: false,
            improvements: [],
            executionTime: 100
          },
          {
            roundNumber: 3,
            strategy: 'fine_tuning',
            iterationsCompleted: 5,
            bestScore: 7.03, // Minimal improvement
            convergenceReached: false,
            improvements: [],
            executionTime: 100
          }
        ],
        globalBestScore: 7.03,
        totalIterations: 15,
        totalExecutionTime: 300,
        status: 'running' as const
      };

      const converged = await service.checkGlobalConvergence(session);
      expect(converged).toBe(true);
    });

    it('should not detect convergence when improvement is significant', async () => {
      const session = {
        sessionId: 'test',
        jobId: 'test',
        rounds: [
          {
            roundNumber: 1,
            strategy: 'exploration',
            iterationsCompleted: 5,
            bestScore: 6.0,
            convergenceReached: false,
            improvements: [],
            executionTime: 100
          },
          {
            roundNumber: 2,
            strategy: 'refinement',
            iterationsCompleted: 5,
            bestScore: 7.0, // Significant improvement
            convergenceReached: false,
            improvements: [],
            executionTime: 100
          }
        ],
        globalBestScore: 7.0,
        totalIterations: 10,
        totalExecutionTime: 200,
        status: 'running' as const
      };

      const converged = await service.checkGlobalConvergence(session);
      expect(converged).toBe(false);
    });
  });

  describe('transferKnowledgeBetweenRounds', () => {
    it('should increase exploration rate when previous round converged', async () => {
      const fromRound = {
        roundNumber: 1,
        strategy: 'exploration',
        iterationsCompleted: 5,
        bestScore: 6.5,
        convergenceReached: true, // Converged
        improvements: [],
        executionTime: 100
      };

      const toRound: OptimizationRound = {
        roundNumber: 2,
        strategy: 'refinement',
        maxIterations: 10,
        targetScore: 7.5,
        convergenceThreshold: 0.2,
        agentConfig: {
          explorationRate: 0.4,
          learningRate: 0.05,
          diversityBonus: 0.1
        }
      };

      const adjustedRound = await service.transferKnowledgeBetweenRounds(fromRound, toRound);

      expect(adjustedRound.agentConfig.explorationRate).toBeGreaterThan(0.4);
      expect(adjustedRound.agentConfig.explorationRate).toBeLessThanOrEqual(0.9);
    });

    it('should increase target score when performing well', async () => {
      const fromRound = {
        roundNumber: 1,
        strategy: 'exploration',
        iterationsCompleted: 5,
        bestScore: 8.0, // High score (> roundNumber * 2)
        convergenceReached: false,
        improvements: [],
        executionTime: 100
      };

      const toRound: OptimizationRound = {
        roundNumber: 2,
        strategy: 'refinement',
        maxIterations: 10,
        targetScore: 7.5,
        convergenceThreshold: 0.2,
        agentConfig: {
          explorationRate: 0.4,
          learningRate: 0.05,
          diversityBonus: 0.1
        }
      };

      const adjustedRound = await service.transferKnowledgeBetweenRounds(fromRound, toRound);

      expect(adjustedRound.targetScore).toBe(8.0); // Increased by 0.5
    });

    it('should cap target score at 10.0', async () => {
      const fromRound = {
        roundNumber: 1,
        strategy: 'exploration',
        iterationsCompleted: 5,
        bestScore: 9.0,
        convergenceReached: false,
        improvements: [],
        executionTime: 100
      };

      const toRound: OptimizationRound = {
        roundNumber: 2,
        strategy: 'refinement',
        maxIterations: 10,
        targetScore: 9.8, // Already high
        convergenceThreshold: 0.2,
        agentConfig: {
          explorationRate: 0.4,
          learningRate: 0.05,
          diversityBonus: 0.1
        }
      };

      const adjustedRound = await service.transferKnowledgeBetweenRounds(fromRound, toRound);

      expect(adjustedRound.targetScore).toBe(10.0); // Capped at 10.0
    });
  });
});
