import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../../src/services/storageService.js';
import type {
  PromptOptimizationJob,
  TrainingExample,
  OptimizationIteration,
  MultiCriteriaScores,
  ResponseEvaluation
} from '../../src/models/promptOptimizationEnhanced.js';

describe('Prompt Optimization Storage Integration Tests', () => {
  let storage: StorageService;
  let testJobId: string;
  let testExampleId: string;
  let testIterationId: string;

  beforeEach(async () => {
    storage = StorageService.getInstance();
    
    // Create test job
    testJobId = `test-job-${Date.now()}`;
    const testJob = {
      id: testJobId,
      name: 'Test Optimization Job',
      description: 'Integration test job',
      startingQuestion: 'How do I reset my password?',
      initialPrompt: 'You are a helpful customer support agent.',
      status: 'created',
      createdBy: 'test-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      }
    };

    await storage.createOptimizationJob(testJob);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await storage.deleteOptimizationJob(testJobId);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Optimization Job CRUD Operations', () => {
    it('should create and retrieve optimization job', async () => {
      const retrievedJob = await storage.getOptimizationJobById(testJobId);
      
      expect(retrievedJob).toBeTruthy();
      expect(retrievedJob.id).toBe(testJobId);
      expect(retrievedJob.name).toBe('Test Optimization Job');
      expect(retrievedJob.startingQuestion).toBe('How do I reset my password?');
      expect(retrievedJob.config).toBeTruthy();
      expect(retrievedJob.config.maxIterations).toBe(20);
      expect(retrievedJob.progress).toBeTruthy();
      expect(retrievedJob.progress.currentRound).toBe(0);
    });

    it('should update optimization job', async () => {
      const updates = {
        status: 'running',
        progress: {
          currentRound: 1,
          currentIteration: 5,
          totalIterations: 5,
          bestScore: 7.5,
          averageScore: 6.8,
          convergenceProgress: 0.3,
          estimatedTimeRemaining: 15,
          scoreHistory: [
            { iteration: 1, score: 6.0, criteriaScores: { relevance: 6, clarity: 6, completeness: 6, accuracy: 6, helpfulness: 6, engagement: 6 } },
            { iteration: 2, score: 6.5, criteriaScores: { relevance: 7, clarity: 6, completeness: 6, accuracy: 7, helpfulness: 6, engagement: 6 } }
          ],
          topPrompts: []
        }
      };

      await storage.updateOptimizationJob(testJobId, updates);
      
      const updatedJob = await storage.getOptimizationJobById(testJobId);
      expect(updatedJob.status).toBe('running');
      expect(updatedJob.progress.currentRound).toBe(1);
      expect(updatedJob.progress.bestScore).toBe(7.5);
      expect(updatedJob.progress.scoreHistory).toHaveLength(2);
    });

    it('should list optimization jobs with pagination', async () => {
      const result = await storage.listOptimizationJobs(1, 10);
      
      expect(result).toBeTruthy();
      expect(result.jobs).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      
      // Find our test job
      const testJob = result.jobs.find(job => job.id === testJobId);
      expect(testJob).toBeTruthy();
    });

    it('should delete optimization job', async () => {
      await storage.deleteOptimizationJob(testJobId);
      
      const deletedJob = await storage.getOptimizationJobById(testJobId);
      expect(deletedJob).toBeNull();
    });

    it('should return null for non-existent job', async () => {
      const nonExistentJob = await storage.getOptimizationJobById('non-existent-id');
      expect(nonExistentJob).toBeNull();
    });
  });

  describe('Training Example Operations', () => {
    beforeEach(async () => {
      testExampleId = `test-example-${Date.now()}`;
    });

    it('should add training example to job', async () => {
      const criteriaScores: MultiCriteriaScores = {
        relevance: 8,
        clarity: 9,
        completeness: 7,
        accuracy: 8,
        helpfulness: 9,
        engagement: 7
      };

      const evaluation: ResponseEvaluation = {
        id: 'eval-1',
        overallScore: 8.0,
        criteria: criteriaScores,
        reason: 'Clear and helpful response',
        weight: 1.0,
        isGoldenExample: true,
        evaluatorType: 'human',
        timestamp: new Date().toISOString(),
        metadata: {}
      };

      const example: TrainingExample = {
        id: testExampleId,
        response: '# Password Reset\n\n1. Go to login page\n2. Click "Forgot Password"',
        evaluation,
        tags: ['password', 'authentication'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const createdId = await storage.addTrainingExample(testJobId, example);
      expect(createdId).toBe(testExampleId);

      // Verify the example was added
      const job = await storage.getOptimizationJobById(testJobId);
      expect(job.trainingExamples).toHaveLength(1);
      expect(job.trainingExamples[0].id).toBe(testExampleId);
      expect(job.trainingExamples[0].evaluation.overallScore).toBe(8.0);
      expect(job.trainingExamples[0].evaluation.criteria.clarity).toBe(9);
    });

    it('should update training example', async () => {
      // First add an example
      const example = {
        id: testExampleId,
        response: 'Original response',
        evaluation: {
          id: 'eval-1',
          overallScore: 7.0,
          criteria: { relevance: 7, clarity: 7, completeness: 7, accuracy: 7, helpfulness: 7, engagement: 7 },
          reason: 'Original evaluation',
          weight: 1.0,
          isGoldenExample: false,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        tags: ['original'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await storage.addTrainingExample(testJobId, example);

      // Update the example
      const updates = {
        response: 'Updated response',
        evaluation: {
          id: 'eval-1',
          overallScore: 8.5,
          criteria: { relevance: 9, clarity: 8, completeness: 8, accuracy: 9, helpfulness: 8, engagement: 8 },
          reason: 'Updated evaluation',
          weight: 1.2,
          isGoldenExample: true,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        tags: ['updated', 'improved']
      };

      await storage.updateTrainingExample(testExampleId, updates);

      // Verify the update
      const job = await storage.getOptimizationJobById(testJobId);
      const updatedExample = job.trainingExamples.find((ex: any) => ex.id === testExampleId);
      expect(updatedExample.response).toBe('Updated response');
      expect(updatedExample.evaluation.overallScore).toBe(8.5);
      expect(updatedExample.evaluation.isGoldenExample).toBe(true);
    });

    it('should delete training example', async () => {
      // First add an example
      const example = {
        id: testExampleId,
        response: 'Test response',
        evaluation: {
          id: 'eval-1',
          overallScore: 7.0,
          criteria: { relevance: 7, clarity: 7, completeness: 7, accuracy: 7, helpfulness: 7, engagement: 7 },
          reason: 'Test evaluation',
          weight: 1.0,
          isGoldenExample: false,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await storage.addTrainingExample(testJobId, example);

      // Verify it was added
      let job = await storage.getOptimizationJobById(testJobId);
      expect(job.trainingExamples).toHaveLength(1);

      // Delete the example
      await storage.deleteTrainingExample(testExampleId);

      // Verify it was deleted
      job = await storage.getOptimizationJobById(testJobId);
      expect(job.trainingExamples).toHaveLength(0);
    });
  });

  describe('Optimization Iteration Operations', () => {
    beforeEach(async () => {
      testIterationId = `test-iteration-${Date.now()}`;
    });

    it('should add optimization iteration to job', async () => {
      const iteration: OptimizationIteration = {
        id: testIterationId,
        jobId: testJobId,
        roundNumber: 1,
        iterationNumber: 1,
        agentId: 'clarity-agent',
        inputPrompt: 'You are a helpful assistant.',
        appliedActions: [
          {
            type: 'add_instruction',
            parameters: { instruction: 'Be more specific' },
            description: 'Added specificity instruction'
          }
        ],
        generatedResponse: 'I can help you with password reset...',
        predictedScore: 7.5,
        actualScore: 8.0,
        criteriaScores: {
          relevance: 8,
          clarity: 9,
          completeness: 7,
          accuracy: 8,
          helpfulness: 8,
          engagement: 7
        },
        improvements: ['Added specificity', 'Improved clarity'],
        executionTime: 1500,
        timestamp: new Date().toISOString(),
        novelty: 0.7,
        confidence: 0.8
      };

      const createdId = await storage.addOptimizationIteration(testJobId, iteration);
      expect(createdId).toBe(testIterationId);

      // Verify the iteration was added
      const job = await storage.getOptimizationJobById(testJobId);
      expect(job.iterations).toHaveLength(1);
      expect(job.iterations[0].id).toBe(testIterationId);
      expect(job.iterations[0].predictedScore).toBe(7.5);
      expect(job.iterations[0].appliedActions).toHaveLength(1);
    });

    it('should get optimization iterations for job', async () => {
      // Add multiple iterations
      const iterations = [
        {
          id: `${testIterationId}-1`,
          roundNumber: 1,
          iterationNumber: 1,
          inputPrompt: 'Prompt 1',
          appliedActions: [],
          generatedResponse: 'Response 1',
          predictedScore: 7.0,
          improvements: [],
          executionTime: 1000,
          timestamp: new Date().toISOString()
        },
        {
          id: `${testIterationId}-2`,
          roundNumber: 1,
          iterationNumber: 2,
          inputPrompt: 'Prompt 2',
          appliedActions: [],
          generatedResponse: 'Response 2',
          predictedScore: 7.5,
          improvements: [],
          executionTime: 1200,
          timestamp: new Date().toISOString()
        },
        {
          id: `${testIterationId}-3`,
          roundNumber: 2,
          iterationNumber: 1,
          inputPrompt: 'Prompt 3',
          appliedActions: [],
          generatedResponse: 'Response 3',
          predictedScore: 8.0,
          improvements: [],
          executionTime: 1100,
          timestamp: new Date().toISOString()
        }
      ];

      for (const iteration of iterations) {
        await storage.addOptimizationIteration(testJobId, iteration);
      }

      // Get all iterations
      const allIterations = await storage.getOptimizationIterations(testJobId);
      expect(allIterations).toHaveLength(3);
      expect(allIterations[0].roundNumber).toBe(1);
      expect(allIterations[2].roundNumber).toBe(2);

      // Get iterations for specific round
      const round1Iterations = await storage.getOptimizationIterations(testJobId, 1);
      expect(round1Iterations).toHaveLength(2);
      expect(round1Iterations.every(iter => iter.roundNumber === 1)).toBe(true);
    });

    it('should get optimization analytics for job', async () => {
      // Add test iterations
      const iterations = [
        {
          id: `${testIterationId}-1`,
          roundNumber: 1,
          iterationNumber: 1,
          inputPrompt: 'Prompt 1',
          appliedActions: [],
          generatedResponse: 'Response 1',
          predictedScore: 6.0,
          improvements: [],
          executionTime: 1000,
          timestamp: new Date().toISOString(),
          criteriaScores: { relevance: 6, clarity: 6, completeness: 6, accuracy: 6, helpfulness: 6, engagement: 6 }
        },
        {
          id: `${testIterationId}-2`,
          roundNumber: 1,
          iterationNumber: 2,
          inputPrompt: 'Prompt 2',
          appliedActions: [],
          generatedResponse: 'Response 2',
          predictedScore: 7.5,
          improvements: [],
          executionTime: 1200,
          timestamp: new Date().toISOString(),
          criteriaScores: { relevance: 8, clarity: 7, completeness: 7, accuracy: 8, helpfulness: 7, engagement: 7 }
        }
      ];

      for (const iteration of iterations) {
        await storage.addOptimizationIteration(testJobId, iteration);
      }

      const analytics = await storage.getOptimizationAnalytics(testJobId);
      
      expect(analytics.totalIterations).toBe(2);
      expect(analytics.bestScore).toBe(7.5);
      expect(analytics.avgScore).toBe(6.75); // (6.0 + 7.5) / 2
      expect(analytics.scoreProgression).toHaveLength(2);
      expect(analytics.scoreProgression[0].score).toBe(6.0);
      expect(analytics.scoreProgression[1].score).toBe(7.5);
    });
  });

  describe('Data Integrity and Relationships', () => {
    it('should maintain referential integrity when deleting job', async () => {
      // Add training example and iteration
      const example = {
        id: `${testExampleId}-integrity`,
        response: 'Test response',
        evaluation: {
          id: 'eval-1',
          overallScore: 7.0,
          criteria: { relevance: 7, clarity: 7, completeness: 7, accuracy: 7, helpfulness: 7, engagement: 7 },
          reason: 'Test',
          weight: 1.0,
          isGoldenExample: false,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        },
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const iteration = {
        id: `${testIterationId}-integrity`,
        roundNumber: 1,
        iterationNumber: 1,
        inputPrompt: 'Test prompt',
        appliedActions: [],
        generatedResponse: 'Test response',
        predictedScore: 7.0,
        improvements: [],
        executionTime: 1000,
        timestamp: new Date().toISOString()
      };

      await storage.addTrainingExample(testJobId, example);
      await storage.addOptimizationIteration(testJobId, iteration);

      // Verify they were added
      let job = await storage.getOptimizationJobById(testJobId);
      expect(job.trainingExamples).toHaveLength(1);
      expect(job.iterations).toHaveLength(1);

      // Delete the job
      await storage.deleteOptimizationJob(testJobId);

      // Verify everything was deleted
      job = await storage.getOptimizationJobById(testJobId);
      expect(job).toBeNull();
    });

    it('should handle complex nested data structures', async () => {
      const complexConfig = {
        maxIterations: 50,
        targetScore: 9.0,
        multiRound: {
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
            }
          ],
          globalTargetScore: 9.0,
          maxTotalIterations: 50,
          allowEarlyTermination: true,
          transferLearning: true
        },
        ensemble: {
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
            }
          ],
          fusionStrategy: 'weighted_voting',
          consensusThreshold: 0.7,
          diversityWeight: 0.2,
          parallelExecution: true
        }
      };

      await storage.updateOptimizationJob(testJobId, { config: complexConfig });

      const updatedJob = await storage.getOptimizationJobById(testJobId);
      expect(updatedJob.config.multiRound.rounds).toHaveLength(1);
      expect(updatedJob.config.ensemble.agents).toHaveLength(1);
      expect(updatedJob.config.ensemble.agents[0].type).toBe('clarity');
    });
  });
});
