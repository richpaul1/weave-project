import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptOptimizationService } from '../../../src/services/promptOptimizationService.js';
import type {
  PromptOptimizationJob,
  TrainingExample,
  MultiCriteriaScores
} from '../../../src/models/promptOptimizationEnhanced.js';

// Mock Weave
vi.mock('weave', () => ({
  op: (fn: Function, name: string) => fn
}));

describe('PromptOptimizationService Unit Tests', () => {
  let service: PromptOptimizationService;

  beforeEach(() => {
    service = new PromptOptimizationService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Job Management', () => {
    it('should create optimization job with default values', async () => {
      const jobData = {
        name: 'Test Job',
        startingQuestion: 'How do I test?',
        initialPrompt: 'You are a helpful assistant.'
      };

      const job = await service.createOptimizationJob(jobData);

      expect(job.id).toBeTruthy();
      expect(job.name).toBe('Test Job');
      expect(job.startingQuestion).toBe('How do I test?');
      expect(job.initialPrompt).toBe('You are a helpful assistant.');
      expect(job.status).toBe('created');
      expect(job.config.maxIterations).toBe(20);
      expect(job.progress.currentIteration).toBe(0);
      expect(job.trainingExamples).toEqual([]);
      expect(job.iterations).toEqual([]);
    });

    it('should create job with custom configuration', async () => {
      const jobData = {
        name: 'Custom Job',
        startingQuestion: 'Custom question?',
        initialPrompt: 'Custom prompt',
        config: {
          maxIterations: 50,
          targetScore: 9.0,
          convergenceThreshold: 0.05,
          multiRound: {
            rounds: [],
            globalTargetScore: 9.5,
            maxTotalIterations: 100,
            allowEarlyTermination: false,
            transferLearning: true
          },
          ensemble: {
            agents: [],
            fusionStrategy: 'consensus' as const,
            consensusThreshold: 0.8,
            diversityWeight: 0.3,
            parallelExecution: false
          },
          adaptiveStoppingEnabled: false,
          humanFeedbackLoop: {
            pauseForReview: true,
            reviewFrequency: 10,
            allowManualScoring: false
          },
          parallelProcessing: false,
          maxConcurrentAgents: 5,
          timeoutMinutes: 120
        }
      };

      const job = await service.createOptimizationJob(jobData);

      expect(job.config.maxIterations).toBe(50);
      expect(job.config.targetScore).toBe(9.0);
      expect(job.config.multiRound.globalTargetScore).toBe(9.5);
      expect(job.config.ensemble.fusionStrategy).toBe('consensus');
    });

    it('should retrieve created job', async () => {
      const jobData = {
        name: 'Retrievable Job',
        startingQuestion: 'Can I retrieve this?',
        initialPrompt: 'Test prompt'
      };

      const createdJob = await service.createOptimizationJob(jobData);
      const retrievedJob = await service.getOptimizationJob(createdJob.id);

      expect(retrievedJob).toBeTruthy();
      expect(retrievedJob!.id).toBe(createdJob.id);
      expect(retrievedJob!.name).toBe('Retrievable Job');
    });

    it('should return null for non-existent job', async () => {
      const job = await service.getOptimizationJob('non-existent-id');
      expect(job).toBeNull();
    });

    it('should list all jobs', async () => {
      const job1 = await service.createOptimizationJob({ name: 'Job 1' });
      const job2 = await service.createOptimizationJob({ name: 'Job 2' });

      const jobs = await service.listOptimizationJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.name)).toContain('Job 1');
      expect(jobs.map(j => j.name)).toContain('Job 2');
    });

    it('should delete job', async () => {
      const job = await service.createOptimizationJob({ name: 'To Delete' });
      
      await service.deleteOptimizationJob(job.id);
      
      const deletedJob = await service.getOptimizationJob(job.id);
      expect(deletedJob).toBeNull();
    });
  });

  describe('Optimization Execution', () => {
    let testJob: PromptOptimizationJob;

    beforeEach(async () => {
      testJob = await service.createOptimizationJob({
        name: 'Execution Test Job',
        startingQuestion: 'How do I optimize prompts?',
        initialPrompt: 'You are an AI assistant.',
        trainingExamples: [
          {
            id: 'example-1',
            response: 'Good response',
            evaluation: {
              id: 'eval-1',
              overallScore: 8.0,
              criteria: { relevance: 8, clarity: 8, completeness: 8, accuracy: 8, helpfulness: 8, engagement: 8 },
              reason: 'Well structured',
              weight: 1.0,
              isGoldenExample: true,
              evaluatorType: 'human',
              timestamp: new Date().toISOString(),
              metadata: {}
            },
            tags: ['good'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      });
    });

    it('should start optimization and update job status', async () => {
      await service.startOptimization(testJob.id);

      const updatedJob = await service.getOptimizationJob(testJob.id);
      expect(updatedJob!.status).toBe('running');
    });

    it('should run optimization iteration', async () => {
      const iteration = await service.runOptimizationIteration(testJob.id, 1, 1);

      expect(iteration.id).toBeTruthy();
      expect(iteration.jobId).toBe(testJob.id);
      expect(iteration.roundNumber).toBe(1);
      expect(iteration.iterationNumber).toBe(1);
      expect(iteration.inputPrompt).toContain('You are an AI assistant.');
      expect(iteration.appliedActions).toHaveLength(1);
      expect(iteration.actualScore).toBeGreaterThan(0);
      expect(iteration.criteriaScores).toBeTruthy();
      expect(iteration.executionTime).toBeGreaterThan(0);
    });

    it('should evaluate prompt correctly', async () => {
      const prompt = 'You are a helpful AI assistant that provides clear answers.';
      const question = 'How do I reset my password?';
      const trainingExamples = testJob.trainingExamples;

      const evaluation = await service.evaluatePrompt(prompt, question, trainingExamples);

      expect(evaluation.id).toBeTruthy();
      expect(evaluation.overallScore).toBeGreaterThan(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(10);
      expect(evaluation.criteria.relevance).toBeGreaterThan(0);
      expect(evaluation.criteria.clarity).toBeGreaterThan(0);
      expect(evaluation.evaluatorType).toBe('automated');
      expect(evaluation.metadata.promptLength).toBe(prompt.length);
    });

    it('should throw error when starting optimization for non-existent job', async () => {
      await expect(service.startOptimization('non-existent')).rejects.toThrow('Job non-existent not found');
    });
  });

  describe('Analytics and Progress', () => {
    let testJob: PromptOptimizationJob;

    beforeEach(async () => {
      testJob = await service.createOptimizationJob({
        name: 'Analytics Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      });
    });

    it('should return empty analytics for job with no iterations', async () => {
      const analytics = await service.getJobAnalytics(testJob.id);

      expect(analytics.totalIterations).toBe(0);
      expect(analytics.bestScore).toBe(0);
      expect(analytics.averageScore).toBe(0);
      expect(analytics.scoreProgression).toEqual([]);
      expect(analytics.improvementRate).toBe(0);
    });

    it('should calculate analytics after iterations', async () => {
      // Run multiple iterations
      await service.runOptimizationIteration(testJob.id, 1, 1);
      await service.runOptimizationIteration(testJob.id, 1, 2);
      await service.runOptimizationIteration(testJob.id, 1, 3);

      const analytics = await service.getJobAnalytics(testJob.id);

      expect(analytics.totalIterations).toBe(3);
      expect(analytics.bestScore).toBeGreaterThan(0);
      expect(analytics.averageScore).toBeGreaterThan(0);
      expect(analytics.scoreProgression).toHaveLength(3);
      expect(analytics.improvementRate).toBeGreaterThanOrEqual(0);
      expect(analytics.improvementRate).toBeLessThanOrEqual(1);
    });

    it('should get job progress', async () => {
      const progress = await service.getJobProgress(testJob.id);

      expect(progress).toBeTruthy();
      expect(progress!.currentIteration).toBe(0);
      expect(progress!.totalIterations).toBe(0);
      expect(progress!.bestScore).toBe(0);
    });

    it('should return null progress for non-existent job', async () => {
      const progress = await service.getJobProgress('non-existent');
      expect(progress).toBeNull();
    });
  });

  describe('Memory Store Integration', () => {
    it('should provide access to memory store', () => {
      const store = service.getMemoryStore();
      expect(store).toBeTruthy();
    });

    it('should maintain data consistency across operations', async () => {
      const job1 = await service.createOptimizationJob({ name: 'Consistency Test 1' });
      const job2 = await service.createOptimizationJob({ name: 'Consistency Test 2' });

      // Add iterations to job1
      await service.runOptimizationIteration(job1.id, 1, 1);
      await service.runOptimizationIteration(job1.id, 1, 2);

      // Verify job1 has iterations but job2 doesn't
      const retrievedJob1 = await service.getOptimizationJob(job1.id);
      const retrievedJob2 = await service.getOptimizationJob(job2.id);

      expect(retrievedJob1!.iterations).toHaveLength(2);
      expect(retrievedJob2!.iterations).toHaveLength(0);

      // Verify analytics are separate
      const analytics1 = await service.getJobAnalytics(job1.id);
      const analytics2 = await service.getJobAnalytics(job2.id);

      expect(analytics1.totalIterations).toBe(2);
      expect(analytics2.totalIterations).toBe(0);
    });
  });

  describe('Progress Subscription', () => {
    it('should provide progress subscription mechanism', async () => {
      const job = await service.createOptimizationJob({ name: 'Subscription Test' });
      
      let callbackCount = 0;
      const unsubscribe = service.subscribeToJobProgress(job.id, (progress) => {
        callbackCount++;
        expect(progress).toBeTruthy();
      });

      // Wait a bit to see if callback is called
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      unsubscribe();
      
      expect(callbackCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle iteration errors gracefully', async () => {
      await expect(service.runOptimizationIteration('non-existent', 1, 1))
        .rejects.toThrow('Job non-existent not found');
    });

    it('should handle evaluation with empty training examples', async () => {
      const evaluation = await service.evaluatePrompt('Test prompt', 'Test question', []);
      
      expect(evaluation.overallScore).toBeGreaterThan(0);
      expect(evaluation.metadata.trainingExampleCount).toBe(0);
    });
  });
});
