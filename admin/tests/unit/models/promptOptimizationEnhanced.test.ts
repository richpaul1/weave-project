import { describe, it, expect } from 'vitest';
import type {
  MultiCriteriaScores,
  ResponseEvaluation,
  TrainingExample,
  OptimizationRound,
  MultiRoundConfig,
  SpecializedAgent,
  EnsembleConfig,
  OptimizationConfig,
  OptimizationIteration,
  OptimizationProgress,
  PromptOptimizationJob,
  OptimizationPattern,
  JobTemplate
} from '../../../src/models/promptOptimizationEnhanced.js';

describe('Enhanced Prompt Optimization Models', () => {
  
  describe('MultiCriteriaScores', () => {
    it('should have all required criteria fields', () => {
      const scores: MultiCriteriaScores = {
        relevance: 8,
        clarity: 9,
        completeness: 7,
        accuracy: 8,
        helpfulness: 9,
        engagement: 7
      };

      expect(scores.relevance).toBe(8);
      expect(scores.clarity).toBe(9);
      expect(scores.completeness).toBe(7);
      expect(scores.accuracy).toBe(8);
      expect(scores.helpfulness).toBe(9);
      expect(scores.engagement).toBe(7);
    });

    it('should validate score ranges (1-10)', () => {
      const validScores: MultiCriteriaScores = {
        relevance: 1,
        clarity: 10,
        completeness: 5,
        accuracy: 3,
        helpfulness: 8,
        engagement: 6
      };

      // All scores should be within valid range
      Object.values(validScores).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('ResponseEvaluation', () => {
    it('should create valid response evaluation', () => {
      const evaluation: ResponseEvaluation = {
        id: 'eval-1',
        overallScore: 8.5,
        criteria: {
          relevance: 9,
          clarity: 8,
          completeness: 8,
          accuracy: 9,
          helpfulness: 8,
          engagement: 7
        },
        reason: 'Good response with clear explanations',
        weight: 1.0,
        isGoldenExample: true,
        evaluatorType: 'human',
        timestamp: new Date().toISOString(),
        metadata: {
          responseTime: 1500,
          tokenCount: 250,
          evaluatorId: 'user-123'
        }
      };

      expect(evaluation.id).toBe('eval-1');
      expect(evaluation.overallScore).toBe(8.5);
      expect(evaluation.isGoldenExample).toBe(true);
      expect(evaluation.evaluatorType).toBe('human');
      expect(evaluation.weight).toBe(1.0);
    });

    it('should support different evaluator types', () => {
      const humanEval: ResponseEvaluation['evaluatorType'] = 'human';
      const automatedEval: ResponseEvaluation['evaluatorType'] = 'automated';
      const ensembleEval: ResponseEvaluation['evaluatorType'] = 'ensemble';

      expect(['human', 'automated', 'ensemble']).toContain(humanEval);
      expect(['human', 'automated', 'ensemble']).toContain(automatedEval);
      expect(['human', 'automated', 'ensemble']).toContain(ensembleEval);
    });
  });

  describe('TrainingExample', () => {
    it('should create valid training example', () => {
      const example: TrainingExample = {
        id: 'example-1',
        response: '# How to Reset Password\n\n1. Go to login page\n2. Click "Forgot Password"',
        evaluation: {
          id: 'eval-1',
          overallScore: 8,
          criteria: {
            relevance: 9,
            clarity: 8,
            completeness: 7,
            accuracy: 9,
            helpfulness: 8,
            engagement: 6
          },
          reason: 'Clear step-by-step instructions',
          weight: 1.0,
          isGoldenExample: false,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        tags: ['password', 'authentication', 'help'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect(example.id).toBe('example-1');
      expect(example.response).toContain('Reset Password');
      expect(example.tags).toHaveLength(3);
      expect(example.evaluation.overallScore).toBe(8);
    });
  });

  describe('OptimizationRound', () => {
    it('should create valid optimization round', () => {
      const round: OptimizationRound = {
        roundNumber: 1,
        strategy: 'exploration',
        maxIterations: 20,
        targetScore: 8.0,
        convergenceThreshold: 0.1,
        focusCriteria: ['clarity', 'helpfulness'],
        agentConfig: {
          explorationRate: 0.3,
          learningRate: 0.001,
          diversityBonus: 0.1
        }
      };

      expect(round.roundNumber).toBe(1);
      expect(round.strategy).toBe('exploration');
      expect(round.maxIterations).toBe(20);
      expect(round.focusCriteria).toContain('clarity');
      expect(round.focusCriteria).toContain('helpfulness');
    });

    it('should support all strategy types', () => {
      const strategies: OptimizationRound['strategy'][] = [
        'exploration',
        'refinement', 
        'fine_tuning'
      ];

      strategies.forEach(strategy => {
        expect(['exploration', 'refinement', 'fine_tuning']).toContain(strategy);
      });
    });
  });

  describe('MultiRoundConfig', () => {
    it('should create valid multi-round configuration', () => {
      const config: MultiRoundConfig = {
        rounds: [
          {
            roundNumber: 1,
            strategy: 'exploration',
            maxIterations: 20,
            targetScore: 7.0,
            convergenceThreshold: 0.1,
            agentConfig: {
              explorationRate: 0.4,
              learningRate: 0.001,
              diversityBonus: 0.2
            }
          },
          {
            roundNumber: 2,
            strategy: 'refinement',
            maxIterations: 10,
            targetScore: 8.5,
            convergenceThreshold: 0.05,
            agentConfig: {
              explorationRate: 0.2,
              learningRate: 0.0005,
              diversityBonus: 0.1
            }
          }
        ],
        globalTargetScore: 9.0,
        maxTotalIterations: 50,
        allowEarlyTermination: true,
        transferLearning: true
      };

      expect(config.rounds).toHaveLength(2);
      expect(config.rounds[0].strategy).toBe('exploration');
      expect(config.rounds[1].strategy).toBe('refinement');
      expect(config.globalTargetScore).toBe(9.0);
      expect(config.transferLearning).toBe(true);
    });
  });

  describe('SpecializedAgent', () => {
    it('should create valid specialized agent', () => {
      const agent: SpecializedAgent = {
        id: 'clarity-agent-1',
        name: 'Clarity Optimizer',
        type: 'clarity',
        focusCriteria: 'clarity',
        weight: 1.0,
        config: {
          explorationRate: 0.2,
          learningRate: 0.001,
          specializationBonus: 0.3
        }
      };

      expect(agent.id).toBe('clarity-agent-1');
      expect(agent.type).toBe('clarity');
      expect(agent.focusCriteria).toBe('clarity');
      expect(agent.weight).toBe(1.0);
    });

    it('should support all agent types', () => {
      const agentTypes: SpecializedAgent['type'][] = [
        'clarity',
        'completeness',
        'helpfulness',
        'engagement',
        'accuracy',
        'relevance'
      ];

      agentTypes.forEach(type => {
        expect([
          'clarity', 'completeness', 'helpfulness', 
          'engagement', 'accuracy', 'relevance'
        ]).toContain(type);
      });
    });
  });

  describe('EnsembleConfig', () => {
    it('should create valid ensemble configuration', () => {
      const config: EnsembleConfig = {
        agents: [
          {
            id: 'clarity-agent',
            name: 'Clarity Optimizer',
            type: 'clarity',
            focusCriteria: 'clarity',
            weight: 1.0,
            config: {
              explorationRate: 0.2,
              learningRate: 0.001,
              specializationBonus: 0.3
            }
          },
          {
            id: 'helpfulness-agent',
            name: 'Helpfulness Optimizer',
            type: 'helpfulness',
            focusCriteria: 'helpfulness',
            weight: 1.2,
            config: {
              explorationRate: 0.25,
              learningRate: 0.001,
              specializationBonus: 0.4
            }
          }
        ],
        fusionStrategy: 'weighted_voting',
        consensusThreshold: 0.7,
        diversityWeight: 0.2,
        parallelExecution: true
      };

      expect(config.agents).toHaveLength(2);
      expect(config.fusionStrategy).toBe('weighted_voting');
      expect(config.consensusThreshold).toBe(0.7);
      expect(config.parallelExecution).toBe(true);
    });

    it('should support all fusion strategies', () => {
      const strategies: EnsembleConfig['fusionStrategy'][] = [
        'weighted_voting',
        'consensus',
        'best_of_breed',
        'hybrid'
      ];

      strategies.forEach(strategy => {
        expect([
          'weighted_voting', 'consensus', 'best_of_breed', 'hybrid'
        ]).toContain(strategy);
      });
    });
  });

  describe('PromptOptimizationJob', () => {
    it('should create valid optimization job', () => {
      const job: PromptOptimizationJob = {
        id: 'job-1',
        name: 'Customer Support Optimization',
        description: 'Optimize customer support responses',
        startingQuestion: 'How do I reset my password?',
        initialPrompt: 'You are a helpful customer support agent.',
        trainingExamples: [],
        config: {
          maxIterations: 20,
          targetScore: 8.5,
          convergenceThreshold: 0.1,
          multiRound: {
            rounds: [],
            globalTargetScore: 9.0,
            maxTotalIterations: 50,
            allowEarlyTermination: true,
            transferLearning: false
          },
          ensemble: {
            agents: [],
            fusionStrategy: 'weighted_voting',
            consensusThreshold: 0.7,
            diversityWeight: 0.2,
            parallelExecution: true
          },
          adaptiveStoppingEnabled: true,
          humanFeedbackLoop: {
            pauseForReview: false,
            reviewFrequency: 5,
            allowManualScoring: true
          },
          parallelProcessing: true,
          maxConcurrentAgents: 3,
          timeoutMinutes: 60
        },
        status: 'created',
        progress: {
          currentRound: 0,
          currentIteration: 0,
          totalIterations: 0,
          bestScore: 0,
          averageScore: 0,
          convergenceProgress: 0,
          estimatedTimeRemaining: 0,
          scoreHistory: [],
          topPrompts: []
        },
        iterations: [],
        finalResults: {
          bestPrompts: [],
          analytics: {
            totalIterations: 0,
            totalExecutionTime: 0,
            convergenceAchieved: false,
            averageImprovement: 0,
            bestRound: 0
          }
        },
        createdBy: 'user-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      expect(job.id).toBe('job-1');
      expect(job.name).toBe('Customer Support Optimization');
      expect(job.status).toBe('created');
      expect(job.config.maxIterations).toBe(20);
    });

    it('should support all job statuses', () => {
      const statuses = [
        'created',
        'running',
        'paused',
        'completed',
        'failed',
        'cancelled',
        'waiting_for_review'
      ];

      statuses.forEach(status => {
        expect([
          'created', 'running', 'paused', 'completed', 
          'failed', 'cancelled', 'waiting_for_review'
        ]).toContain(status);
      });
    });
  });

  describe('Type Serialization', () => {
    it('should serialize and deserialize job correctly', () => {
      const originalJob: Partial<PromptOptimizationJob> = {
        id: 'job-1',
        name: 'Test Job',
        status: 'created',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const serialized = JSON.stringify(originalJob);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.id).toBe(originalJob.id);
      expect(deserialized.name).toBe(originalJob.name);
      expect(deserialized.status).toBe(originalJob.status);
    });

    it('should handle nested objects in serialization', () => {
      const scores: MultiCriteriaScores = {
        relevance: 8,
        clarity: 9,
        completeness: 7,
        accuracy: 8,
        helpfulness: 9,
        engagement: 7
      };

      const serialized = JSON.stringify(scores);
      const deserialized: MultiCriteriaScores = JSON.parse(serialized);

      expect(deserialized.relevance).toBe(8);
      expect(deserialized.clarity).toBe(9);
      expect(Object.keys(deserialized)).toHaveLength(6);
    });
  });
});
