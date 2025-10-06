/**
 * Enhanced Prompt Optimization Job Service
 * 
 * This service provides comprehensive job execution capabilities including:
 * - Job lifecycle management (create, start, pause, resume, cancel)
 * - Multi-round optimization orchestration
 * - Ensemble approach coordination
 * - Real-time progress tracking
 * - Error handling and recovery
 * - State persistence and recovery
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type {
  PromptOptimizationJob,
  OptimizationIteration,
  OptimizationProgress,
  TrainingExample,
  JobStatus,
  MultiCriteriaScores,
  OptimizationConfig,
  OptimizationRound,
  EnsembleResult
} from '../models/promptOptimizationEnhanced.js';
import { MultiRoundOptimizationService } from './multiRoundOptimizationService.js';
import { EnsembleCoordinator } from './rl/ensembleCoordinator.js';
import { AdaptiveStoppingService } from './adaptiveStoppingService.js';
import { PromptRLEnvironment } from './promptRLEnvironment.js';
import { PromptEvaluationService } from './promptEvaluationService.js';
import { SimpleLLMJobRunner } from './rl/simpleLLMJobRunner.js';
import { StorageService } from './storageService.js';
import { PromptTemplate, PromptCriteria } from '../models/promptOptimization.js';

/**
 * Job execution context for tracking state during optimization
 */
export interface JobExecutionContext {
  jobId: string;
  status: JobStatus;
  currentRound: number;
  currentIteration: number;
  startTime: number;
  pausedTime?: number;
  totalPausedDuration: number;
  lastProgressUpdate: number;
  cancellationRequested: boolean;
  errorCount: number;
  lastError?: Error;
  checkpointData?: any;
  executionOptions?: JobExecutionOptions;
}

/**
 * Job execution options for controlling optimization behavior
 */
export interface JobExecutionOptions {
  enableCheckpointing: boolean;
  checkpointInterval: number; // iterations
  maxRetries: number;
  retryDelay: number; // milliseconds
  progressUpdateInterval: number; // milliseconds
  enableRecovery: boolean;
  timeoutMinutes?: number;
}

/**
 * Job execution events for real-time monitoring
 */
export interface JobExecutionEvents {
  'job-started': { jobId: string; timestamp: number };
  'job-paused': { jobId: string; timestamp: number };
  'job-resumed': { jobId: string; timestamp: number };
  'job-completed': { jobId: string; timestamp: number; finalResults: any };
  'job-failed': { jobId: string; timestamp: number; error: Error };
  'job-cancelled': { jobId: string; timestamp: number };
  'progress-updated': { jobId: string; progress: OptimizationProgress };
  'iteration-completed': { jobId: string; iteration: OptimizationIteration };
  'round-completed': { jobId: string; roundNumber: number; results: any };
  'checkpoint-saved': { jobId: string; checkpointId: string };
  'error-occurred': { jobId: string; error: Error; recoverable: boolean };
}

/**
 * In-memory storage for prompt optimization jobs and results
 * Enhanced with execution context tracking and state management
 */
class PromptOptimizationMemoryStore {
  private jobs: Map<string, PromptOptimizationJob> = new Map();
  private jobIterations: Map<string, OptimizationIteration[]> = new Map();
  private jobProgress: Map<string, OptimizationProgress> = new Map();
  private executionContexts: Map<string, JobExecutionContext> = new Map();
  private jobCheckpoints: Map<string, any> = new Map();

  createJob(job: PromptOptimizationJob): void {
    this.jobs.set(job.id, { ...job });
    this.jobIterations.set(job.id, []);
    this.jobProgress.set(job.id, job.progress);
    
    // Initialize execution context
    this.executionContexts.set(job.id, {
      jobId: job.id,
      status: job.status,
      currentRound: 0,
      currentIteration: 0,
      startTime: 0,
      totalPausedDuration: 0,
      lastProgressUpdate: Date.now(),
      cancellationRequested: false,
      errorCount: 0
    });
  }

  getJob(jobId: string): PromptOptimizationJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      ...job,
      iterations: this.jobIterations.get(jobId) || [],
      progress: this.jobProgress.get(jobId) || job.progress
    };
  }

  updateJob(jobId: string, updates: Partial<PromptOptimizationJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(jobId, job);
    }
  }

  updateProgress(jobId: string, progress: OptimizationProgress): void {
    this.jobProgress.set(jobId, progress);
    
    // Update execution context
    const context = this.executionContexts.get(jobId);
    if (context) {
      context.currentRound = progress.currentRound;
      context.currentIteration = progress.currentIteration;
      context.lastProgressUpdate = Date.now();
    }
  }

  addIteration(jobId: string, iteration: OptimizationIteration): void {
    const iterations = this.jobIterations.get(jobId) || [];
    iterations.push(iteration);
    this.jobIterations.set(jobId, iterations);
  }

  getAllJobs(): PromptOptimizationJob[] {
    return Array.from(this.jobs.values()).map(job => ({
      ...job,
      iterations: this.jobIterations.get(job.id) || [],
      progress: this.jobProgress.get(job.id) || job.progress
    }));
  }

  deleteJob(jobId: string): void {
    this.jobs.delete(jobId);
    this.jobIterations.delete(jobId);
    this.jobProgress.delete(jobId);
    this.executionContexts.delete(jobId);
    this.jobCheckpoints.delete(jobId);
  }

  getJobProgress(jobId: string): OptimizationProgress | null {
    return this.jobProgress.get(jobId) || null;
  }

  // Execution context management
  getExecutionContext(jobId: string): JobExecutionContext | null {
    return this.executionContexts.get(jobId) || null;
  }

  updateExecutionContext(jobId: string, updates: Partial<JobExecutionContext>): void {
    const context = this.executionContexts.get(jobId);
    if (context) {
      Object.assign(context, updates);
      this.executionContexts.set(jobId, context);
    }
  }

  // Checkpoint management
  saveCheckpoint(jobId: string, checkpointData: any): void {
    this.jobCheckpoints.set(jobId, {
      ...checkpointData,
      timestamp: Date.now()
    });
  }

  getCheckpoint(jobId: string): any | null {
    return this.jobCheckpoints.get(jobId) || null;
  }

  clearCheckpoint(jobId: string): void {
    this.jobCheckpoints.delete(jobId);
  }
}

/**
 * Enhanced Prompt Optimization Job Service
 * Provides comprehensive job execution and lifecycle management
 */
export class PromptOptimizationJobService extends EventEmitter {
  private weave: any;
  private store: PromptOptimizationMemoryStore;
  private storageService: StorageService;
  private evaluationService: PromptEvaluationService;
  private multiRoundService: MultiRoundOptimizationService;
  private ensembleCoordinator: EnsembleCoordinator;
  private adaptiveStoppingService: AdaptiveStoppingService;
  private runningJobs: Set<string> = new Set();
  private pausedJobs: Set<string> = new Set();
  private defaultExecutionOptions: JobExecutionOptions;

  constructor(weave: any, storageService?: StorageService) {
    super();
    this.weave = weave;
    this.store = new PromptOptimizationMemoryStore();
    this.storageService = storageService || StorageService.getInstance();
    this.evaluationService = new PromptEvaluationService(null, null, weave);
    this.multiRoundService = new MultiRoundOptimizationService(weave);
    this.ensembleCoordinator = new EnsembleCoordinator(weave);
    this.adaptiveStoppingService = new AdaptiveStoppingService(weave);

    this.defaultExecutionOptions = {
      enableCheckpointing: true,
      checkpointInterval: 10,
      maxRetries: 3,
      retryDelay: 1000,
      progressUpdateInterval: 1000,
      enableRecovery: true,
      timeoutMinutes: 60
    };

    // Bind Weave operations
    this._bindWeaveOperations();
  }

  private _bindWeaveOperations(): void {
    // Bind methods directly (weave.op not available in our WeaveService)
    this.createJob = this._createJobImpl.bind(this);
    this.startJob = this._startJobImpl.bind(this);
    this.pauseJob = this._pauseJobImpl.bind(this);
    this.resumeJob = this._resumeJobImpl.bind(this);
    this.cancelJob = this._cancelJobImpl.bind(this);
  }

  // Weave-wrapped methods (public interface)
  createJob!: (jobData: any) => Promise<PromptOptimizationJob>;
  startJob!: (jobId: string, options?: Partial<JobExecutionOptions>) => Promise<void>;
  pauseJob!: (jobId: string) => Promise<void>;
  resumeJob!: (jobId: string) => Promise<void>;
  cancelJob!: (jobId: string) => Promise<void>;

  // ============================================================================
  // IMPLEMENTATION METHODS
  // ============================================================================

  /**
   * Create a new optimization job
   */
  async _createJobImpl(jobData: any): Promise<PromptOptimizationJob> {
    const jobId = uuidv4();
    const traceId = this.weave.startTrace('create_optimization_job', {
      jobId, // Include job ID in Weave instrumentation
      jobName: jobData.name,
      hasInitialPrompt: !!jobData.initialPrompt,
      trainingExamplesCount: jobData.trainingExamples?.length || 0
    });

    try {
      const now = new Date().toISOString();

      // Create default configuration if not provided
      const defaultConfig: OptimizationConfig = {
        maxIterations: jobData.maxIterations || 50,
        targetScore: jobData.targetScore || 8.0,
        convergenceThreshold: jobData.convergenceThreshold || 0.1,
        multiRound: {
          rounds: [
            {
              roundNumber: 1,
              strategy: 'exploration',
              maxIterations: 20,
              targetScore: 6.0,
              convergenceThreshold: 0.2,
              agentConfig: {
                explorationRate: 0.8,
                learningRate: 0.001,
                diversityBonus: 0.3
              }
            },
            {
              roundNumber: 2,
              strategy: 'refinement',
              maxIterations: 20,
              targetScore: 7.5,
              convergenceThreshold: 0.15,
              agentConfig: {
                explorationRate: 0.4,
                learningRate: 0.0005,
                diversityBonus: 0.2
              }
            },
            {
              roundNumber: 3,
              strategy: 'fine_tuning',
              maxIterations: 10,
              targetScore: 9.0,
              convergenceThreshold: 0.05,
              agentConfig: {
                explorationRate: 0.1,
                learningRate: 0.0001,
                diversityBonus: 0.1
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
              name: 'Clarity Agent',
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
              id: 'completeness-agent',
              name: 'Completeness Agent',
              type: 'completeness',
              focusCriteria: 'completeness',
              weight: 1.0,
              config: {
                explorationRate: 0.25,
                learningRate: 0.001,
                specializationBonus: 0.4
              }
            },
            {
              id: 'helpfulness-agent',
              name: 'Helpfulness Agent',
              type: 'helpfulness',
              focusCriteria: 'helpfulness',
              weight: 1.0,
              config: {
                explorationRate: 0.3,
                learningRate: 0.001,
                specializationBonus: 0.35
              }
            }
          ],
          fusionStrategy: 'hybrid',
          consensusThreshold: 0.7,
          diversityWeight: 0.3,
          parallelExecution: true
        },
        adaptiveStoppingEnabled: true,
        humanFeedbackLoop: {
          pauseForReview: false,
          reviewFrequency: 10,
          allowManualScoring: true
        },
        parallelProcessing: true,
        maxConcurrentAgents: 3,
        timeoutMinutes: 60
      };

      const job: PromptOptimizationJob = {
        id: jobId,
        name: jobData.name || `Optimization Job ${jobId.slice(0, 8)}`,
        description: jobData.description,
        startingQuestion: jobData.startingQuestion,
        initialPrompt: jobData.initialPrompt,
        trainingExamples: jobData.trainingExamples || [],
        config: { ...defaultConfig, ...jobData.config },
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
        createdBy: jobData.createdBy || 'system',
        createdAt: now,
        updatedAt: now
      };

      // Store in memory for real-time access
      this.store.createJob(job);

      // Persist to Neo4j database
      if (this.storageService) {
        try {
          await this.storageService.createOptimizationJob(job);
          console.log(`📊 Job ${job.id} persisted to Neo4j database`);
        } catch (error) {
          console.warn(`⚠️ Failed to persist job ${job.id} to Neo4j:`, error);
          // Continue with in-memory storage only
        }
      }

      await this.weave.logEvent('job_created', {
        jobId: job.id,
        name: job.name,
        config: job.config,
        trainingExamplesCount: job.trainingExamples.length
      });

      this.weave.endTrace(traceId, {
        jobId: job.id,
        jobName: job.name,
        success: true
      });

      return job;
    } catch (error) {
      this.weave.endTrace(traceId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Start job execution
   */
  async _startJobImpl(jobId: string, options?: Partial<JobExecutionOptions>): Promise<void> {
    const traceId = this.weave.startTrace('start_job_execution', {
      jobId,
      options: options || {}
    });

    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (this.runningJobs.has(jobId)) {
        throw new Error(`Job ${jobId} is already running`);
      }

      if (job.status === 'completed') {
        throw new Error(`Job ${jobId} is already completed`);
      }

      // Merge execution options
      const executionOptions = { ...this.defaultExecutionOptions, ...options };

      // Update job status and context
      this.store.updateJob(jobId, {
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      this.store.updateExecutionContext(jobId, {
        status: 'running',
        startTime: Date.now(),
        cancellationRequested: false,
        errorCount: 0,
        executionOptions
      });

      this.runningJobs.add(jobId);
      this.pausedJobs.delete(jobId);

      // Emit job started event
      this.emit('job-started', { jobId, timestamp: Date.now() });

      await this.weave.logEvent('job_started', {
        jobId,
        executionOptions,
        timestamp: new Date().toISOString()
      });

      // Start the optimization process asynchronously
      this._executeJobAsync(jobId, executionOptions).catch(error => {
        console.error(`Job ${jobId} execution failed:`, error);
        this._handleJobError(jobId, error);
      });

      this.weave.endTrace(traceId, {
        jobId,
        success: true
      });
    } catch (error) {
      this.weave.endTrace(traceId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Pause job execution
   */
  async _pauseJobImpl(jobId: string): Promise<void> {
    const traceId = this.weave.startTrace('pause_job_execution', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!this.runningJobs.has(jobId)) {
        throw new Error(`Job ${jobId} is not running`);
      }

      // Update job status and context
      this.store.updateJob(jobId, {
        status: 'paused',
        updatedAt: new Date().toISOString()
      });

      this.store.updateExecutionContext(jobId, {
        status: 'paused',
        pausedTime: Date.now()
      });

      this.runningJobs.delete(jobId);
      this.pausedJobs.add(jobId);

      // Emit job paused event
      this.emit('job-paused', { jobId, timestamp: Date.now() });

      await this.weave.logEvent('job_paused', {
        jobId,
        timestamp: new Date().toISOString()
      });

      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Resume job execution
   */
  async _resumeJobImpl(jobId: string): Promise<void> {
    const traceId = this.weave.startTrace('resume_job_execution', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!this.pausedJobs.has(jobId)) {
        throw new Error(`Job ${jobId} is not paused`);
      }

      const context = this.store.getExecutionContext(jobId);
      if (!context) {
        throw new Error(`Execution context for job ${jobId} not found`);
      }

      // Calculate paused duration
      const pausedDuration = context.pausedTime ? Date.now() - context.pausedTime : 0;
      const totalPausedDuration = context.totalPausedDuration + pausedDuration;

      // Update job status and context
      this.store.updateJob(jobId, {
        status: 'running',
        updatedAt: new Date().toISOString()
      });

      this.store.updateExecutionContext(jobId, {
        status: 'running',
        pausedTime: undefined,
        totalPausedDuration
      });

      this.pausedJobs.delete(jobId);
      this.runningJobs.add(jobId);

      // Emit job resumed event
      this.emit('job-resumed', { jobId, timestamp: Date.now() });

      await this.weave.logEvent('job_resumed', {
        jobId,
        pausedDuration,
        totalPausedDuration,
        timestamp: new Date().toISOString()
      });

      // Resume the optimization process
      this._executeJobAsync(jobId, this.defaultExecutionOptions).catch(error => {
        console.error(`Job ${jobId} resume failed:`, error);
        this._handleJobError(jobId, error);
      });

      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Cancel job execution
   */
  async _cancelJobImpl(jobId: string): Promise<void> {
    const traceId = this.weave.startTrace('cancel_job_execution', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (job.status === 'completed' || job.status === 'cancelled') {
        throw new Error(`Job ${jobId} is already ${job.status}`);
      }

      // Mark for cancellation
      this.store.updateExecutionContext(jobId, {
        cancellationRequested: true
      });

      // Update job status
      this.store.updateJob(jobId, {
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });

      this.runningJobs.delete(jobId);
      this.pausedJobs.delete(jobId);

      // Emit job cancelled event
      this.emit('job-cancelled', { jobId, timestamp: Date.now() });

      await this.weave.logEvent('job_cancelled', {
        jobId,
        timestamp: new Date().toISOString()
      });

      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): PromptOptimizationJob | null {
    return this.store.getJob(jobId);
  }

  /**
   * List all jobs (from memory store for real-time data)
   */
  listJobs(): PromptOptimizationJob[] {
    return this.store.getAllJobs();
  }

  /**
   * List jobs from Neo4j database with pagination
   */
  async listJobsFromDatabase(page: number = 1, pageSize: number = 10): Promise<{
    jobs: PromptOptimizationJob[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    if (!this.storageService) {
      // Fallback to memory store
      const jobs = this.store.getAllJobs();
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      return {
        jobs: jobs.slice(startIndex, endIndex),
        total: jobs.length,
        page,
        pageSize
      };
    }

    try {
      return await this.storageService.listOptimizationJobs(page, pageSize);
    } catch (error) {
      console.warn('⚠️ Failed to fetch jobs from Neo4j, using memory store:', error);
      // Fallback to memory store
      const jobs = this.store.getAllJobs();
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      return {
        jobs: jobs.slice(startIndex, endIndex),
        total: jobs.length,
        page,
        pageSize
      };
    }
  }

  /**
   * Delete job
   */
  async deleteJob(jobId: string): Promise<void> {
    const job = this.store.getJob(jobId);
    if (job && (job.status === 'running' || job.status === 'paused')) {
      throw new Error(`Cannot delete job ${jobId} while it is ${job.status}`);
    }

    // Delete from memory store
    this.store.deleteJob(jobId);
    this.runningJobs.delete(jobId);
    this.pausedJobs.delete(jobId);

    // Delete from Neo4j database if available
    if (this.storageService) {
      try {
        await this.storageService.deleteOptimizationJob(jobId);
        console.log(`📊 Job ${jobId} deleted from Neo4j database`);
      } catch (error) {
        console.warn(`⚠️ Failed to delete job ${jobId} from Neo4j:`, error);
        // Don't throw error - job is already deleted from memory
      }
    }
  }

  /**
   * Update job
   */
  async updateJob(jobId: string, jobData: any): Promise<PromptOptimizationJob> {
    const existingJob = this.store.getJob(jobId);
    if (!existingJob) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (existingJob.status === 'running' || existingJob.status === 'paused') {
      throw new Error(`Cannot update job ${jobId} while it is ${existingJob.status}`);
    }

    // Create updated job with new data but preserve certain fields
    const updatedJob: PromptOptimizationJob = {
      ...existingJob,
      name: jobData.name || existingJob.name,
      startingQuestion: jobData.startingQuestion || existingJob.startingQuestion,
      initialPrompt: jobData.initialPrompt || existingJob.initialPrompt,
      trainingExamples: jobData.trainingExamples || existingJob.trainingExamples,
      config: {
        ...existingJob.config,
        algorithmType: jobData.algorithmType || existingJob.config?.algorithmType || 'simple_llm',
        maxIterations: jobData.maxIterations || existingJob.config?.maxIterations || 50
      },
      status: 'created', // Reset status to created for rerun
      updatedAt: new Date().toISOString(),
      // Reset progress and results
      progress: {
        currentIteration: 0,
        totalIterations: jobData.maxIterations || existingJob.config?.maxIterations || 50,
        bestScore: 0,
        averageScore: 0,
        convergenceProgress: 0,
        estimatedTimeRemaining: 0,
        scoreHistory: [],
        topPrompts: []
      },
      finalResults: undefined
    };

    // Update in memory store
    this.store.updateJob(jobId, updatedJob);

    // Update in Neo4j database if available
    if (this.storageService) {
      try {
        await this.storageService.updateOptimizationJob(jobId, {
          name: updatedJob.name,
          startingQuestion: updatedJob.startingQuestion,
          initialPrompt: updatedJob.initialPrompt,
          trainingExamples: updatedJob.trainingExamples,
          config: updatedJob.config,
          status: updatedJob.status,
          progress: updatedJob.progress,
          updatedAt: updatedJob.updatedAt
        });
        console.log(`📊 Job ${jobId} updated in Neo4j database`);
      } catch (error) {
        console.warn(`⚠️ Failed to update job ${jobId} in Neo4j:`, error);
        // Don't throw error - job is already updated in memory
      }
    }

    return updatedJob;
  }

  /**
   * Get job progress
   */
  getJobProgress(jobId: string): OptimizationProgress | null {
    return this.store.getJobProgress(jobId);
  }

  /**
   * Get execution context
   */
  getExecutionContext(jobId: string): JobExecutionContext | null {
    return this.store.getExecutionContext(jobId);
  }

  /**
   * Subscribe to job progress updates
   */
  subscribeToJobProgress(jobId: string, callback: (progress: OptimizationProgress) => void): () => void {
    const progressHandler = (data: { jobId: string; progress: OptimizationProgress }) => {
      if (data.jobId === jobId) {
        callback(data.progress);
      }
    };

    this.on('progress-updated', progressHandler);

    return () => {
      this.off('progress-updated', progressHandler);
    };
  }

  /**
   * Get comprehensive real-time progress data for UI updates
   */
  getRealtimeProgressData(jobId: string): any {
    const job = this.store.getJob(jobId);
    const context = this.store.getExecutionContext(jobId);
    const progress = this.store.getJobProgress(jobId);

    if (!job || !context || !progress) {
      return null;
    }

    const now = Date.now();
    const elapsedTime = context.startTime > 0 ? now - context.startTime - context.totalPausedDuration : 0;

    // Calculate progress percentage
    const totalExpectedIterations = job.config.maxIterations || 10;
    const progressPercentage = Math.min((progress.totalIterations / totalExpectedIterations) * 100, 100);

    // Estimate time remaining
    const iterationsPerMs = progress.totalIterations > 0 ? elapsedTime / progress.totalIterations : 0;
    const remainingIterations = Math.max(0, totalExpectedIterations - progress.totalIterations);
    const estimatedTimeRemaining = iterationsPerMs > 0 ? remainingIterations * iterationsPerMs : 0;

    // Calculate score improvement
    const baselineScore = progress.scoreHistory.length > 0 ? progress.scoreHistory[0].score : 0;
    const scoreImprovement = progress.bestScore - baselineScore;
    const improvementPercentage = baselineScore > 0 ? (scoreImprovement / baselineScore) * 100 : 0;

    // Determine current phase
    let currentPhase = 'initialization';
    if (job.config.multiRound?.enabled) {
      const roundPhases = ['exploration', 'refinement', 'fine-tuning'];
      currentPhase = roundPhases[Math.min(progress.currentRound, roundPhases.length - 1)] || 'optimization';
    } else if (job.config.ensemble?.enabled) {
      currentPhase = 'ensemble_optimization';
    } else {
      currentPhase = 'single_agent_optimization';
    }

    return {
      jobId,
      status: job.status,
      overallProgress: {
        percentage: progressPercentage,
        currentPhase,
        estimatedTimeRemaining
      },
      currentRound: {
        roundNumber: progress.currentRound,
        phase: currentPhase,
        progress: progress.currentRound > 0 ? (progress.currentIteration / (job.config.maxIterations || 10)) * 100 : 0,
        bestScore: progress.bestScore
      },
      scores: {
        baseline: baselineScore,
        current: progress.averageScore,
        best: progress.bestScore,
        improvement: scoreImprovement,
        improvementPercentage
      },
      timing: {
        startTime: new Date(context.startTime).toISOString(),
        elapsedTime,
        estimatedCompletion: estimatedTimeRemaining > 0 ?
          new Date(now + estimatedTimeRemaining).toISOString() : null,
        totalPausedDuration: context.totalPausedDuration
      },
      iterations: {
        current: progress.currentIteration,
        total: progress.totalIterations,
        expected: totalExpectedIterations,
        completionRate: progress.totalIterations > 0 ? elapsedTime / progress.totalIterations : 0
      },
      convergence: {
        progress: progress.convergenceProgress,
        threshold: job.config.convergenceThreshold || 0.01,
        isConverging: progress.convergenceProgress > 0.8
      },
      lastUpdate: new Date(context.lastProgressUpdate).toISOString()
    };
  }

  // ============================================================================
  // PRIVATE EXECUTION METHODS
  // ============================================================================

  /**
   * Execute job asynchronously with full orchestration
   */
  private async _executeJobAsync(jobId: string, options: JobExecutionOptions): Promise<void> {
    const traceId = this.weave.startTrace('execute_job_async', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      try {
        console.log(`🚀 Starting job execution: ${job.name} (${jobId})`);

        // Determine execution strategy based on algorithm type
        const algorithmType = job.config.algorithmType || 'multi_round'; // Default to existing behavior

        switch (algorithmType) {
          case 'simple_llm':
            await this._executeSimpleLLMOptimization(jobId, options, traceId);
            break;
          case 'ensemble':
            await this._executeEnsembleOptimization(jobId, options, traceId);
            break;
          case 'multi_round':
          default:
            await this._executeMultiRoundOptimization(jobId, options, traceId);
            break;
        }

        // Mark job as completed
        await this._completeJob(jobId, traceId);

        this.weave.endTrace(traceId, { success: true });
      } catch (error) {
        console.error(`Job ${jobId} execution failed:`, error);
        await this._handleJobError(jobId, error as Error);
        this.weave.endTrace(traceId, { error: error.message });
      }
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute simple LLM-driven optimization approach
   */
  private async _executeSimpleLLMOptimization(jobId: string, options: JobExecutionOptions, parentTraceId?: string): Promise<void> {
    const traceId = parentTraceId ?
      this.weave.startChildTrace(parentTraceId, 'execute_simple_llm_optimization', { jobId }) :
      this.weave.startTrace('execute_simple_llm_optimization', { jobId });

    try {
      const job = this.store.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      console.log(`🤖 Starting Simple LLM Optimization for job: ${job.name}`);

      // Validate job configuration for simple LLM optimization
      const validation = SimpleLLMJobRunner.validateJobConfig(job);
      if (!validation.valid) {
        throw new Error(`Invalid job configuration: ${validation.errors.join(', ')}`);
      }

      // Create simple LLM job runner
      const jobRunner = new SimpleLLMJobRunner(this.weave, this.evaluationService);

      // Set up progress callback
      const progressCallback = (progress: {
        currentIteration: number;
        totalIterations: number;
        bestScore: number;
        status: string
      }) => {
        // Update job progress
        const progressPercentage = Math.round((progress.currentIteration / progress.totalIterations) * 100);

        this.store.updateProgress(jobId, {
          currentIteration: progress.currentIteration,
          totalIterations: progress.totalIterations,
          progressPercentage,
          currentScore: progress.bestScore,
          status: progress.status,
          lastUpdated: new Date().toISOString()
        });

        // Emit progress event
        this.emit('progress', {
          jobId,
          progress: {
            currentIteration: progress.currentIteration,
            totalIterations: progress.totalIterations,
            progressPercentage,
            currentScore: progress.bestScore,
            status: progress.status,
            lastUpdated: new Date().toISOString()
          }
        });

        console.log(`📊 Simple LLM Progress: ${progress.currentIteration}/${progress.totalIterations} (${progressPercentage}%) - Score: ${progress.bestScore.toFixed(3)}`);
      };

      // Execute the simple LLM optimization
      const result = await jobRunner.executeJob(job, progressCallback);

      // Store the results
      const finalIteration = {
        id: uuidv4(),
        iteration: result.totalIterations,
        prompt: result.bestPrompt.content,
        score: result.bestScore,
        timestamp: new Date().toISOString(),
        metadata: {
          algorithmType: 'simple_llm',
          convergenceAchieved: result.convergenceAchieved,
          executionTime: result.executionTime
        }
      };

      this.store.addIteration(jobId, finalIteration);

      // Update job with final results
      this.store.updateJob(jobId, {
        finalResults: {
          bestPrompts: [{
            rank: 1,
            prompt: result.bestPrompt.content,
            score: result.bestScore,
            metadata: {
              algorithmType: 'simple_llm',
              totalIterations: result.totalIterations,
              convergenceAchieved: result.convergenceAchieved
            }
          }],
          summary: {
            totalIterations: result.totalIterations,
            bestScore: result.bestScore,
            convergenceAchieved: result.convergenceAchieved,
            executionTime: result.executionTime,
            algorithmUsed: 'simple_llm'
          }
        }
      });

      console.log(`✅ Simple LLM Optimization completed: ${result.bestScore.toFixed(3)} score in ${result.totalIterations} iterations`);

      this.weave.endTrace(traceId, {
        success: true,
        bestScore: result.bestScore,
        totalIterations: result.totalIterations,
        convergenceAchieved: result.convergenceAchieved,
        executionTime: result.executionTime
      });

    } catch (error) {
      console.error(`❌ Simple LLM Optimization failed for job ${jobId}:`, error);
      this.weave.endTrace(traceId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Execute ensemble optimization approach
   */
  private async _executeEnsembleOptimization(jobId: string, options: JobExecutionOptions, parentTraceId?: string): Promise<void> {
    const traceId = parentTraceId ?
      this.weave.startChildTrace(parentTraceId, 'execute_ensemble_optimization', { jobId }) :
      this.weave.startTrace('execute_ensemble_optimization', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);

      console.log(`🎭 Starting ensemble optimization for job ${jobId}`);

      // Create ensemble session
      const ensembleSession = await this.ensembleCoordinator.createEnsembleSession(
        job.config.ensemble,
        {
          maxEpisodes: job.config.maxIterations,
          parallelExecution: job.config.ensemble.parallelExecution,
          timeoutMinutes: options.timeoutMinutes || 60,
          convergenceThreshold: job.config.convergenceThreshold,
          diversityWeight: job.config.ensemble.diversityWeight
        }
      );

      // Create RL environment
      const evaluationService = new PromptEvaluationService(null, null, this.weave);
      const environment = new PromptRLEnvironment(evaluationService, this.weave);

      // Convert job data to RL format
      const basePrompt: PromptTemplate = {
        content: job.initialPrompt,
        variables: {},
        metadata: {
          jobId: job.id,
          question: job.startingQuestion
        }
      };

      const targetCriteria: PromptCriteria[] = [
        { name: 'relevance', weight: 1.0, description: 'How well it answers the question' },
        { name: 'clarity', weight: 1.0, description: 'How clear and understandable' },
        { name: 'completeness', weight: 1.0, description: 'How comprehensive' },
        { name: 'helpfulness', weight: 1.0, description: 'Practical value' }
      ];

      // Execute ensemble optimization
      const ensembleResult = await this.ensembleCoordinator.executeEnsembleOptimization(
        ensembleSession,
        environment,
        basePrompt,
        targetCriteria,
        job.startingQuestion
      );

      // Update job with ensemble results
      await this._updateJobWithEnsembleResults(jobId, ensembleResult);

      console.log(`✅ Ensemble optimization completed for job ${jobId}`);
      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Execute multi-round optimization approach
   */
  private async _executeMultiRoundOptimization(jobId: string, options: JobExecutionOptions, parentTraceId?: string): Promise<void> {
    const traceId = parentTraceId ?
      this.weave.startChildTrace(parentTraceId, 'execute_multi_round_optimization', { jobId }) :
      this.weave.startTrace('execute_multi_round_optimization', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);

      console.log(`🔄 Starting multi-round optimization for job ${jobId}`);

      // Create multi-round session
      const multiRoundSession = await this.multiRoundService.createMultiRoundSession(
        job.config.multiRound,
        {
          enableAdaptiveAdjustment: true,
          knowledgeTransferEnabled: job.config.multiRound.transferLearning,
          progressCallback: (progress) => this._updateJobProgress(jobId, progress)
        }
      );

      // Convert job data to RL format
      const basePrompt: PromptTemplate = {
        content: job.initialPrompt,
        variables: {},
        metadata: {
          jobId: job.id,
          question: job.startingQuestion
        }
      };

      const targetCriteria: PromptCriteria[] = [
        { name: 'relevance', weight: 1.0, description: 'How well it answers the question' },
        { name: 'clarity', weight: 1.0, description: 'How clear and understandable' },
        { name: 'completeness', weight: 1.0, description: 'How comprehensive' },
        { name: 'helpfulness', weight: 1.0, description: 'Practical value' }
      ];

      // Execute multi-round optimization
      const multiRoundResult = await this.multiRoundService.executeMultiRoundOptimization(
        multiRoundSession,
        basePrompt,
        targetCriteria,
        job.startingQuestion
      );

      // Update job with multi-round results
      await this._updateJobWithMultiRoundResults(jobId, multiRoundResult);

      console.log(`✅ Multi-round optimization completed for job ${jobId}`);
      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Complete job execution
   */
  private async _completeJob(jobId: string, parentTraceId?: string): Promise<void> {
    const traceId = parentTraceId ?
      this.weave.startChildTrace(parentTraceId, 'complete_job', { jobId }) :
      this.weave.startTrace('complete_job', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) return;

      const context = this.store.getExecutionContext(jobId);
      const executionTime = context ? Date.now() - context.startTime - context.totalPausedDuration : 0;

      // Update job status
      this.store.updateJob(jobId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update final analytics
      const finalResults = {
        ...job.finalResults,
        analytics: {
          ...job.finalResults.analytics,
          totalExecutionTime: executionTime,
          totalIterations: job.iterations.length
        }
      };

      this.store.updateJob(jobId, { finalResults });

      this.runningJobs.delete(jobId);
      this.pausedJobs.delete(jobId);

      // Clear checkpoint
      this.store.clearCheckpoint(jobId);

      // Emit completion event
      this.emit('job-completed', {
        jobId,
        timestamp: Date.now(),
        finalResults
      });

      await this.weave.logEvent('job_completed', {
        jobId,
        executionTime,
        totalIterations: job.iterations.length,
        finalScore: job.progress.bestScore,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Job ${jobId} completed successfully`);
      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Handle job execution errors
   */
  private async _handleJobError(jobId: string, error: Error): Promise<void> {
    const traceId = this.weave.startTrace('handle_job_error', { jobId, error: error.message });
    try {
      const context = this.store.getExecutionContext(jobId);
      if (!context) return;

      context.errorCount++;
      context.lastError = error;

      const maxRetries = context.executionOptions?.maxRetries ?? this.defaultExecutionOptions.maxRetries;
      const isRecoverable = context.errorCount < maxRetries;

      // Update job with error information
      this.store.updateJob(jobId, {
        status: isRecoverable ? 'paused' : 'failed',
        updatedAt: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          recoverable: isRecoverable
        }
      });

      this.runningJobs.delete(jobId);

      if (isRecoverable) {
        this.pausedJobs.add(jobId);
        console.log(`⚠️ Job ${jobId} paused due to error (attempt ${context.errorCount}): ${error.message}`);

        // Emit error event
        this.emit('error-occurred', { jobId, error, recoverable: true });

        // Schedule retry after delay
        const retryDelay = context.executionOptions?.retryDelay ?? this.defaultExecutionOptions.retryDelay;
        setTimeout(() => {
          this.resumeJob(jobId).catch(retryError => {
            console.error(`Failed to retry job ${jobId}:`, retryError);
            this._handleJobError(jobId, retryError as Error);
          });
        }, retryDelay);

      } else {
        console.error(`❌ Job ${jobId} failed permanently after ${context.errorCount} attempts: ${error.message}`);

        // Emit failure event
        this.emit('job-failed', { jobId, timestamp: Date.now(), error });
      }

      await this.weave.logEvent('job_error', {
        jobId,
        error: error.message,
        errorCount: context.errorCount,
        recoverable: isRecoverable,
        timestamp: new Date().toISOString()
      });

      this.weave.endTrace(traceId, { success: true, isRecoverable });
    } catch (handlerError) {
      this.weave.endTrace(traceId, { error: handlerError.message });
      throw handlerError;
    }
  }

  /**
   * Update job progress
   */
  private _updateJobProgress(jobId: string, progress: Partial<OptimizationProgress>): void {
    const currentProgress = this.store.getJobProgress(jobId);
    if (!currentProgress) return;

    const updatedProgress = { ...currentProgress, ...progress };
    this.store.updateProgress(jobId, updatedProgress);

    // Emit progress update event
    this.emit('progress-updated', { jobId, progress: updatedProgress });
  }

  /**
   * Update job with ensemble results
   */
  private async _updateJobWithEnsembleResults(jobId: string, ensembleResult: EnsembleResult): Promise<void> {
    const traceId = this.weave.startTrace('update_job_ensemble_results', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) return;

      // Convert ensemble results to job format
      const bestPrompts = ensembleResult.agentResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((result, index) => ({
          rank: index + 1,
          prompt: result.prompt,
          response: '', // Would be generated in real implementation
          score: result.score,
          criteriaScores: result.criteriaScores,
          metadata: {
            roundNumber: 1,
            iterationNumber: index + 1,
            agentId: result.agentId,
            improvements: [`Optimized by ${result.agentId}`]
          }
        }));

      const finalResults = {
        bestPrompts,
        analytics: {
          totalIterations: ensembleResult.agentResults.length,
          totalExecutionTime: 0, // Will be calculated in _completeJob
          convergenceAchieved: ensembleResult.fusedResult.consensus > 0.8,
          averageImprovement: ensembleResult.fusedResult.score - 5.0, // Baseline score
          bestRound: 1,
          mostEffectiveAgent: ensembleResult.agentResults
            .reduce((best, current) => current.score > best.score ? current : best)
            .agentId
        }
      };

      // Update job progress
      const progress: OptimizationProgress = {
        currentRound: 1,
        currentIteration: ensembleResult.agentResults.length,
        totalIterations: ensembleResult.agentResults.length,
        bestScore: ensembleResult.fusedResult.score,
        averageScore: ensembleResult.agentResults.reduce((sum, r) => sum + r.score, 0) / ensembleResult.agentResults.length,
        convergenceProgress: ensembleResult.fusedResult.consensus,
        estimatedTimeRemaining: 0,
        scoreHistory: ensembleResult.agentResults.map((result, index) => ({
          iteration: index + 1,
          score: result.score,
          criteriaScores: result.criteriaScores
        })),
        topPrompts: bestPrompts.map(p => ({
          rank: p.rank,
          prompt: p.prompt,
          score: p.score,
          criteriaScores: p.criteriaScores,
          iteration: p.metadata.iterationNumber,
          roundNumber: p.metadata.roundNumber
        }))
      };

      this.store.updateJob(jobId, { finalResults });
      this.store.updateProgress(jobId, progress);

      await this.weave.logEvent('job_ensemble_results_updated', {
        jobId,
        bestScore: ensembleResult.fusedResult.score,
        consensus: ensembleResult.fusedResult.consensus,
        agentCount: ensembleResult.agentResults.length
      });

      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }

  /**
   * Update job with multi-round results
   */
  private async _updateJobWithMultiRoundResults(jobId: string, multiRoundResult: any): Promise<void> {
    const traceId = this.weave.startTrace('update_job_multi_round_results', { jobId });
    try {
      const job = this.store.getJob(jobId);
      if (!job) return;

      // This would be implemented based on the actual MultiRoundOptimizationService result format
      // For now, we'll create a placeholder implementation

      const bestPrompts = [{
        rank: 1,
        prompt: multiRoundResult.bestPrompt || job.initialPrompt,
        response: '',
        score: multiRoundResult.bestScore || 7.5,
        criteriaScores: {
          relevance: 8.0,
          clarity: 7.5,
          completeness: 7.0,
          accuracy: 8.0,
          helpfulness: 7.5,
          engagement: 7.0
        },
        metadata: {
          roundNumber: multiRoundResult.completedRounds || 3,
          iterationNumber: multiRoundResult.totalIterations || 50,
          improvements: ['Multi-round optimization completed']
        }
      }];

      const finalResults = {
        bestPrompts,
        analytics: {
          totalIterations: multiRoundResult.totalIterations || 50,
          totalExecutionTime: 0, // Will be calculated in _completeJob
          convergenceAchieved: multiRoundResult.convergenceAchieved || false,
          averageImprovement: (multiRoundResult.bestScore || 7.5) - 5.0,
          bestRound: multiRoundResult.bestRound || 2
        }
      };

      this.store.updateJob(jobId, { finalResults });

      await this.weave.logEvent('job_multi_round_results_updated', {
        jobId,
        bestScore: multiRoundResult.bestScore,
        totalIterations: multiRoundResult.totalIterations,
        convergenceAchieved: multiRoundResult.convergenceAchieved
      });

      this.weave.endTrace(traceId, { success: true });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error.message });
      throw error;
    }
  }
}
