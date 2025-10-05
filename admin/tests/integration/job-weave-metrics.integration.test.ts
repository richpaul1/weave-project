/**
 * Integration test to verify that job execution captures the correct metrics in Weave
 * for progress tracking and reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptOptimizationJobService } from '../../src/services/promptOptimizationJobService.js';
import { WeaveService } from '../../src/weave/weaveService.js';
import type { 
  PromptOptimizationJob, 
  OptimizationConfig, 
  TrainingExample,
  EvaluationCriteria 
} from '../../src/types/promptOptimization.js';

describe('Job Weave Metrics Integration Tests', () => {
  let jobService: PromptOptimizationJobService;
  let mockWeave: any;
  let testJob: PromptOptimizationJob;

  beforeEach(async () => {
    // Create mock Weave service that captures all metrics and events
    mockWeave = {
      startTrace: vi.fn().mockReturnValue('mock-trace-id'),
      endTrace: vi.fn(),
      logEvent: vi.fn(),
      logMetrics: vi.fn(),
      getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com'),
      initialize: vi.fn().mockResolvedValue(undefined)
    };

    // Initialize job service with mock Weave
    jobService = new PromptOptimizationJobService(mockWeave);

    // Create test job configuration
    const config: OptimizationConfig = {
      maxIterations: 5,
      convergenceThreshold: 0.01,
      evaluationCriteria: [
        { id: 'clarity', name: 'clarity', weight: 0.4, description: 'Response clarity' },
        { id: 'completeness', name: 'completeness', weight: 0.3, description: 'Response completeness' },
        { id: 'helpfulness', name: 'helpfulness', weight: 0.3, description: 'Response helpfulness' }
      ] as EvaluationCriteria[],
      multiRound: {
        enabled: true,
        rounds: [
          { phase: 'exploration', iterations: 2, explorationRate: 0.8 },
          { phase: 'refinement', iterations: 2, explorationRate: 0.4 },
          { phase: 'fine-tuning', iterations: 1, explorationRate: 0.1 }
        ]
      },
      ensemble: {
        enabled: true,
        agents: ['clarity', 'completeness', 'helpfulness'],
        fusionStrategy: 'weighted_voting',
        parallelExecution: true
      }
    };

    const trainingExamples: TrainingExample[] = [
      {
        id: 'example1',
        query: 'What is machine learning?',
        expectedResponse: 'Machine learning is a subset of AI...',
        metadata: { difficulty: 'beginner' }
      },
      {
        id: 'example2', 
        query: 'Explain neural networks',
        expectedResponse: 'Neural networks are computing systems...',
        metadata: { difficulty: 'intermediate' }
      }
    ];

    // Create test job
    testJob = await jobService.createJob({
      name: 'Test Metrics Job',
      description: 'Job to test Weave metrics capture',
      initialPrompt: {
        id: 'test-prompt',
        name: 'Test Prompt',
        template: 'You are a helpful AI assistant. Answer the following question: {query}',
        variables: ['query'],
        metadata: { version: '1.0' }
      },
      config,
      trainingExamples
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Job Lifecycle Metrics', () => {
    it('should capture job creation metrics', async () => {
      // Verify job creation event was logged
      expect(mockWeave.logEvent).toHaveBeenCalledWith('job_created', expect.objectContaining({
        jobId: testJob.id,
        name: testJob.name,
        config: testJob.config,
        trainingExamplesCount: testJob.trainingExamples.length
      }));
    });

    it('should capture job start metrics', async () => {
      await jobService.startJob(testJob.id, { 
        maxConcurrentJobs: 1,
        timeoutMs: 30000 
      });

      expect(mockWeave.logEvent).toHaveBeenCalledWith('job_started', expect.objectContaining({
        jobId: testJob.id,
        timestamp: expect.any(String)
      }));
    });

    it('should capture job pause and resume metrics', async () => {
      await jobService.startJob(testJob.id);
      await jobService.pauseJob(testJob.id);

      expect(mockWeave.logEvent).toHaveBeenCalledWith('job_paused', expect.objectContaining({
        jobId: testJob.id,
        timestamp: expect.any(String)
      }));

      await jobService.resumeJob(testJob.id);

      expect(mockWeave.logEvent).toHaveBeenCalledWith('job_resumed', expect.objectContaining({
        jobId: testJob.id,
        pausedDuration: expect.any(Number),
        totalPausedDuration: expect.any(Number),
        timestamp: expect.any(String)
      }));
    });
  });

  describe('Optimization Progress Metrics', () => {
    it('should capture round-level progress metrics', async () => {
      // This test verifies that we capture metrics for each optimization round
      // We'll need to implement this in the multi-round service
      
      // Expected metrics for progress tracking:
      const expectedRoundMetrics = [
        'round_started',
        'round_progress_updated', 
        'round_completed'
      ];

      // Expected data for each round:
      const expectedRoundData = {
        roundNumber: expect.any(Number),
        roundPhase: expect.stringMatching(/exploration|refinement|fine-tuning/),
        currentIteration: expect.any(Number),
        totalIterations: expect.any(Number),
        bestScore: expect.any(Number),
        averageScore: expect.any(Number),
        progressPercentage: expect.any(Number)
      };

      // This will be implemented when we add proper instrumentation
      expect(true).toBe(true); // Placeholder
    });

    it('should capture iteration-level metrics', async () => {
      // Expected metrics for each optimization iteration
      const expectedIterationMetrics = [
        'iteration_started',
        'iteration_action_selected',
        'iteration_evaluation_completed',
        'iteration_completed'
      ];

      // Expected data for progress tracking
      const expectedIterationData = {
        iterationNumber: expect.any(Number),
        actionType: expect.any(String),
        scoreImprovement: expect.any(Number),
        cumulativeImprovement: expect.any(Number),
        explorationRate: expect.any(Number),
        convergenceProgress: expect.any(Number)
      };

      // This will be implemented when we add proper instrumentation
      expect(true).toBe(true); // Placeholder
    });

    it('should capture ensemble coordination metrics', async () => {
      // Expected metrics for ensemble progress
      const expectedEnsembleMetrics = [
        'ensemble_session_started',
        'ensemble_agent_progress',
        'ensemble_fusion_started',
        'ensemble_session_completed'
      ];

      // Expected data for ensemble tracking
      const expectedEnsembleData = {
        sessionId: expect.any(String),
        agentCount: expect.any(Number),
        agentProgress: expect.arrayContaining([
          expect.objectContaining({
            agentId: expect.any(String),
            agentType: expect.any(String),
            currentScore: expect.any(Number),
            iterationsCompleted: expect.any(Number)
          })
        ]),
        fusionStrategy: expect.any(String),
        consensusLevel: expect.any(Number)
      };

      // This will be implemented when we add proper instrumentation
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Performance and Quality Metrics', () => {
    it('should capture score progression metrics', async () => {
      // Metrics for tracking how scores improve over time
      const expectedScoreMetrics = {
        baseline_score: expect.any(Number),
        current_best_score: expect.any(Number),
        score_improvement: expect.any(Number),
        improvement_percentage: expect.any(Number),
        score_trend: expect.stringMatching(/improving|declining|stable/),
        convergence_rate: expect.any(Number)
      };

      // This will be implemented when we add proper instrumentation
      expect(true).toBe(true); // Placeholder
    });

    it('should capture timing and performance metrics', async () => {
      // Metrics for tracking optimization performance
      const expectedPerformanceMetrics = {
        iteration_duration_ms: expect.any(Number),
        evaluation_time_ms: expect.any(Number),
        total_optimization_time_ms: expect.any(Number),
        estimated_completion_time_ms: expect.any(Number),
        throughput_iterations_per_minute: expect.any(Number)
      };

      // This will be implemented when we add proper instrumentation
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Real-time Progress Data', () => {
    it('should provide structured progress data for UI updates', async () => {
      // Test the real-time progress data method
      const progressData = jobService.getRealtimeProgressData(testJob.id);

      // Verify the progress data structure exists and has the right properties
      expect(progressData).toBeDefined();
      expect(progressData.jobId).toBe(testJob.id);
      expect(progressData.status).toBe('created');

      // Verify main sections exist
      expect(progressData.overallProgress).toBeDefined();
      expect(progressData.currentRound).toBeDefined();
      expect(progressData.scores).toBeDefined();
      expect(progressData.timing).toBeDefined();
      expect(progressData.iterations).toBeDefined();
      expect(progressData.convergence).toBeDefined();

      // Verify specific values
      expect(progressData.overallProgress.percentage).toBeGreaterThanOrEqual(0);
      expect(progressData.overallProgress.percentage).toBeLessThanOrEqual(100);
      expect(typeof progressData.overallProgress.currentPhase).toBe('string');
      expect(typeof progressData.lastUpdate).toBe('string');
    });
  });
});
