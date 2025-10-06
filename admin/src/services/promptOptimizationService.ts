import * as weave from 'weave';
import { v4 as uuidv4 } from 'uuid';
import { MultiRoundOptimizationService } from './multiRoundOptimizationService.js';
import { AdaptiveStoppingService } from './adaptiveStoppingService.js';
import type {
  PromptOptimizationJob,
  TrainingExample,
  OptimizationIteration,
  MultiCriteriaScores,
  ResponseEvaluation,
  OptimizationProgress
} from '../models/promptOptimizationEnhanced.js';

/**
 * In-memory storage for prompt optimization jobs and results
 * This allows the UI to access real-time data for charts and progress tracking
 */
class PromptOptimizationMemoryStore {
  private jobs: Map<string, PromptOptimizationJob> = new Map();
  private jobIterations: Map<string, OptimizationIteration[]> = new Map();
  private jobProgress: Map<string, OptimizationProgress> = new Map();

  createJob(job: PromptOptimizationJob): void {
    this.jobs.set(job.id, { ...job });
    this.jobIterations.set(job.id, []);
    this.jobProgress.set(job.id, job.progress);
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
  }

  getJobProgress(jobId: string): OptimizationProgress | null {
    return this.jobProgress.get(jobId) || null;
  }

  getJobAnalytics(jobId: string) {
    const iterations = this.jobIterations.get(jobId) || [];
    if (iterations.length === 0) {
      return {
        totalIterations: 0,
        bestScore: 0,
        averageScore: 0,
        scoreProgression: [],
        improvementRate: 0
      };
    }

    const scores = iterations.map(iter => iter.actualScore || iter.predictedScore || 0);
    const bestScore = Math.max(...scores);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    const scoreProgression = iterations.map((iter, index) => ({
      iteration: index + 1,
      score: iter.actualScore || iter.predictedScore || 0,
      round: iter.roundNumber,
      timestamp: iter.timestamp
    }));

    // Calculate improvement rate (percentage of iterations that improved)
    let improvements = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[i - 1]) improvements++;
    }
    const improvementRate = scores.length > 1 ? improvements / (scores.length - 1) : 0;

    return {
      totalIterations: iterations.length,
      bestScore,
      averageScore,
      scoreProgression,
      improvementRate
    };
  }
}

/**
 * Weave-instrumented Prompt Optimization Service
 * Uses in-memory storage for real-time UI updates and Weave for comprehensive tracking
 */
export class PromptOptimizationService {
  private store = new PromptOptimizationMemoryStore();
  private multiRoundService = new MultiRoundOptimizationService();
  private stoppingService = new AdaptiveStoppingService();

  constructor() {
    // Set up weave operations with proper binding following the tutorial pattern
    const self = this;

    // Job Management Operations
    this.createOptimizationJob = weave.op(async function createOptimizationJob(jobData: Partial<PromptOptimizationJob>) {
      return await self._createOptimizationJobImpl(jobData);
    }, 'prompt_optimization_create_job');

    this.getOptimizationJob = weave.op(async function getOptimizationJob(jobId: string) {
      return await self._getOptimizationJobImpl(jobId);
    }, 'prompt_optimization_get_job');

    this.listOptimizationJobs = weave.op(async function listOptimizationJobs() {
      return await self._listOptimizationJobsImpl();
    }, 'prompt_optimization_list_jobs');

    this.deleteOptimizationJob = weave.op(async function deleteOptimizationJob(jobId: string) {
      return await self._deleteOptimizationJobImpl(jobId);
    }, 'prompt_optimization_delete_job');

    // Optimization Execution Operations
    this.startOptimization = weave.op(async function startOptimization(jobId: string) {
      return await self._startOptimizationImpl(jobId);
    }, 'prompt_optimization_start');

    this.runOptimizationIteration = weave.op(async function runOptimizationIteration(jobId: string, roundNumber: number, iterationNumber: number) {
      return await self._runOptimizationIterationImpl(jobId, roundNumber, iterationNumber);
    }, 'prompt_optimization_iteration');

    this.evaluatePrompt = weave.op(async function evaluatePrompt(prompt: string, question: string, trainingExamples: TrainingExample[]) {
      return await self._evaluatePromptImpl(prompt, question, trainingExamples);
    }, 'prompt_optimization_evaluate');

    // Analytics Operations
    this.getJobAnalytics = weave.op(async function getJobAnalytics(jobId: string) {
      return await self._getJobAnalyticsImpl(jobId);
    }, 'prompt_optimization_analytics');

    this.getJobProgress = weave.op(async function getJobProgress(jobId: string) {
      return await self._getJobProgressImpl(jobId);
    }, 'prompt_optimization_progress');
  }

  // Weave-wrapped methods (public interface)
  createOptimizationJob!: (jobData: Partial<PromptOptimizationJob>) => Promise<PromptOptimizationJob>;
  getOptimizationJob!: (jobId: string) => Promise<PromptOptimizationJob | null>;
  listOptimizationJobs!: () => Promise<PromptOptimizationJob[]>;
  deleteOptimizationJob!: (jobId: string) => Promise<void>;
  startOptimization!: (jobId: string) => Promise<void>;
  runOptimizationIteration!: (jobId: string, roundNumber: number, iterationNumber: number) => Promise<OptimizationIteration>;
  evaluatePrompt!: (prompt: string, question: string, trainingExamples: TrainingExample[]) => Promise<ResponseEvaluation>;
  getJobAnalytics!: (jobId: string) => Promise<any>;
  getJobProgress!: (jobId: string) => Promise<OptimizationProgress | null>;

  // Implementation methods (private)
  async _createOptimizationJobImpl(jobData: Partial<PromptOptimizationJob>): Promise<PromptOptimizationJob> {
    const jobId = jobData.id || `job-${uuidv4()}`;
    const now = new Date().toISOString();

    const job: PromptOptimizationJob = {
      id: jobId,
      name: jobData.name || 'Untitled Optimization Job',
      description: jobData.description || '',
      startingQuestion: jobData.startingQuestion || '',
      initialPrompt: jobData.initialPrompt || '',
      trainingExamples: jobData.trainingExamples || [],
      config: jobData.config || {
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
        bestPrompt: '',
        bestScore: 0,
        totalIterations: 0,
        convergenceAchieved: false,
        executionTime: 0,
        insights: []
      },
      createdBy: jobData.createdBy || 'system',
      createdAt: now,
      updatedAt: now
    };

    this.store.createJob(job);
    return job;
  }

  async _getOptimizationJobImpl(jobId: string): Promise<PromptOptimizationJob | null> {
    return this.store.getJob(jobId);
  }

  async _listOptimizationJobsImpl(): Promise<PromptOptimizationJob[]> {
    return this.store.getAllJobs();
  }

  async _deleteOptimizationJobImpl(jobId: string): Promise<void> {
    this.store.deleteJob(jobId);
  }

  async _startOptimizationImpl(jobId: string): Promise<void> {
    const job = this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Update job status to running
    this.store.updateJob(jobId, { 
      status: 'running',
      updatedAt: new Date().toISOString()
    });

    // Start the optimization process
    // This would typically run in the background
    this._runOptimizationProcess(jobId);
  }

  async _runOptimizationProcess(jobId: string): Promise<void> {
    const job = this.store.getJob(jobId);
    if (!job) return;

    try {
      // Check if multi-round optimization is enabled
      if (job.config.multiRound && job.config.multiRound.rounds.length > 0) {
        await this._runMultiRoundOptimization(jobId);
      } else {
        await this._runSingleRoundOptimization(jobId);
      }

      // Mark job as completed
      this.store.updateJob(jobId, {
        status: 'completed',
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      this.store.updateJob(jobId, {
        status: 'failed',
        updatedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async _runSingleRoundOptimization(jobId: string): Promise<void> {
    const job = this.store.getJob(jobId);
    if (!job) return;

    const maxIterations = job.config.maxIterations;

    for (let i = 1; i <= maxIterations; i++) {
      // Run iteration with Weave tracking
      await this.runOptimizationIteration(jobId, 1, i);

      // Update progress
      const progress = this.store.getJobProgress(jobId);
      if (progress) {
        progress.currentIteration = i;
        progress.totalIterations = i;
        this.store.updateProgress(jobId, progress);
      }

      // Check for convergence or stopping criteria
      const analytics = this.store.getJobAnalytics(jobId);
      if (analytics.bestScore >= job.config.targetScore) {
        break;
      }
    }
  }

  async _runMultiRoundOptimization(jobId: string): Promise<void> {
    const job = this.store.getJob(jobId);
    if (!job) return;

    const multiRoundConfig = job.config.multiRound;
    let totalIterations = 0;
    let bestOverallScore = 0;
    let shouldContinue = true;

    for (let roundIndex = 0; roundIndex < multiRoundConfig.rounds.length && shouldContinue; roundIndex++) {
      const round = multiRoundConfig.rounds[roundIndex];

      console.log(`🔄 Starting Round ${round.roundNumber}: ${round.strategy}`);

      // Run round with specific strategy
      const roundResult = await this._runOptimizationRound(jobId, round, totalIterations);

      totalIterations += roundResult.iterationsCompleted;
      bestOverallScore = Math.max(bestOverallScore, roundResult.bestScore);

      // Update progress for multi-round
      const progress = this.store.getJobProgress(jobId);
      if (progress) {
        progress.currentRound = round.roundNumber;
        progress.totalRounds = multiRoundConfig.rounds.length;
        progress.currentIteration = totalIterations;
        progress.bestScore = bestOverallScore;
        this.store.updateProgress(jobId, progress);
      }

      // Check global stopping criteria
      if (multiRoundConfig.allowEarlyTermination) {
        if (bestOverallScore >= multiRoundConfig.globalTargetScore) {
          console.log(`🎯 Global target score ${multiRoundConfig.globalTargetScore} reached!`);
          shouldContinue = false;
        }

        if (totalIterations >= multiRoundConfig.maxTotalIterations) {
          console.log(`⏱️ Maximum total iterations ${multiRoundConfig.maxTotalIterations} reached!`);
          shouldContinue = false;
        }
      }
    }
  }

  async _runOptimizationRound(jobId: string, round: any, startingIteration: number): Promise<{ iterationsCompleted: number; bestScore: number; convergenceReached: boolean }> {
    const job = this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    let iterationsCompleted = 0;
    let bestRoundScore = 0;
    let convergenceReached = false;
    let lastScores: number[] = [];

    console.log(`🚀 Round ${round.roundNumber} (${round.strategy}): Starting with ${round.maxIterations} max iterations`);

    for (let i = 1; i <= round.maxIterations; i++) {
      const globalIteration = startingIteration + i;

      // Run iteration with round-specific parameters
      const iteration = await this.runOptimizationIteration(jobId, round.roundNumber, globalIteration);

      iterationsCompleted++;
      bestRoundScore = Math.max(bestRoundScore, iteration.actualScore);
      lastScores.push(iteration.actualScore);

      // Keep only last 5 scores for convergence check
      if (lastScores.length > 5) {
        lastScores.shift();
      }

      // Update progress
      const progress = this.store.getJobProgress(jobId);
      if (progress) {
        progress.currentIteration = globalIteration;
        progress.bestScore = Math.max(progress.bestScore || 0, iteration.actualScore);
        this.store.updateProgress(jobId, progress);
      }

      // Check round-specific stopping criteria
      if (iteration.actualScore >= round.targetScore) {
        console.log(`🎯 Round ${round.roundNumber} target score ${round.targetScore} reached!`);
        break;
      }

      // Use adaptive stopping criteria
      if (job.config.adaptiveStoppingEnabled && i >= 3) {
        const roundIterations = this.store.getJobIterations(jobId)
          .filter(iter => iter.roundNumber === round.roundNumber);

        const stoppingConfig = AdaptiveStoppingService.createDefaultConfig(
          round.maxIterations,
          round.targetScore
        );
        stoppingConfig.convergenceThreshold = round.convergenceThreshold;

        const stoppingDecision = await this.stoppingService.checkStoppingCriteria(
          roundIterations,
          stoppingConfig
        );

        if (stoppingDecision.shouldStop) {
          console.log(`🛑 Round ${round.roundNumber} stopped: ${stoppingDecision.reason}`);
          convergenceReached = stoppingDecision.reason.includes('Convergence');
          break;
        }
      }

      // Fallback: Check for simple convergence
      if (this._checkConvergence(lastScores, round.convergenceThreshold)) {
        console.log(`📈 Round ${round.roundNumber} converged after ${i} iterations`);
        convergenceReached = true;
        break;
      }
    }

    console.log(`✅ Round ${round.roundNumber} completed: ${iterationsCompleted} iterations, best score: ${bestRoundScore.toFixed(3)}`);

    return {
      iterationsCompleted,
      bestScore: bestRoundScore,
      convergenceReached
    };
  }

  private _checkConvergence(scores: number[], threshold: number): boolean {
    if (scores.length < 3) return false;

    // Check if the variance in recent scores is below threshold
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);

    return standardDeviation < threshold;
  }

  async _runOptimizationIterationImpl(jobId: string, roundNumber: number, iterationNumber: number): Promise<OptimizationIteration> {
    const job = this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Simulate prompt modification and evaluation
    const modifiedPrompt = this._generateModifiedPrompt(job.initialPrompt, iterationNumber);
    const evaluation = await this.evaluatePrompt(modifiedPrompt, job.startingQuestion, job.trainingExamples);

    const iteration: OptimizationIteration = {
      id: `iteration-${uuidv4()}`,
      jobId,
      roundNumber,
      iterationNumber,
      agentId: 'default-agent',
      inputPrompt: modifiedPrompt,
      appliedActions: [
        {
          type: 'modify_instruction',
          parameters: { modification: `Iteration ${iterationNumber} improvement` },
          description: `Applied optimization for iteration ${iterationNumber}`
        }
      ],
      generatedResponse: `Generated response for iteration ${iterationNumber}`,
      predictedScore: evaluation.overallScore - 0.1,
      actualScore: evaluation.overallScore,
      criteriaScores: evaluation.criteria,
      improvements: [`Improvement ${iterationNumber}`],
      executionTime: Math.random() * 1000 + 500,
      timestamp: new Date().toISOString(),
      novelty: Math.random(),
      confidence: Math.random() * 0.5 + 0.5
    };

    this.store.addIteration(jobId, iteration);
    return iteration;
  }

  async _evaluatePromptImpl(prompt: string, question: string, trainingExamples: TrainingExample[]): Promise<ResponseEvaluation> {
    // Simulate evaluation logic
    // In a real implementation, this would use LLM evaluation or human feedback
    const baseScore = 6 + Math.random() * 3; // Random score between 6-9
    
    const criteria: MultiCriteriaScores = {
      relevance: Math.min(10, baseScore + Math.random() - 0.5),
      clarity: Math.min(10, baseScore + Math.random() - 0.5),
      completeness: Math.min(10, baseScore + Math.random() - 0.5),
      accuracy: Math.min(10, baseScore + Math.random() - 0.5),
      helpfulness: Math.min(10, baseScore + Math.random() - 0.5),
      engagement: Math.min(10, baseScore + Math.random() - 0.5)
    };

    const overallScore = Object.values(criteria).reduce((sum, score) => sum + score, 0) / 6;

    return {
      id: `eval-${uuidv4()}`,
      overallScore,
      criteria,
      reason: `Evaluated prompt: "${prompt.substring(0, 50)}..."`,
      weight: 1.0,
      isGoldenExample: overallScore >= 8.0,
      evaluatorType: 'automated',
      timestamp: new Date().toISOString(),
      metadata: {
        promptLength: prompt.length,
        questionLength: question.length,
        trainingExampleCount: trainingExamples.length
      }
    };
  }

  async _getJobAnalyticsImpl(jobId: string): Promise<any> {
    return this.store.getJobAnalytics(jobId);
  }

  async _getJobProgressImpl(jobId: string): Promise<OptimizationProgress | null> {
    const job = this.store.getJob(jobId);
    return job ? job.progress : null;
  }

  private _generateModifiedPrompt(basePrompt: string, iteration: number): string {
    // Simple prompt modification simulation
    const modifications = [
      'Be more specific and detailed.',
      'Use clear, concise language.',
      'Provide step-by-step instructions.',
      'Include relevant examples.',
      'Focus on practical applications.',
      'Ensure accuracy and completeness.'
    ];
    
    const modification = modifications[iteration % modifications.length];
    return `${basePrompt}\n\nAdditional guidance: ${modification}`;
  }

  // Utility methods for UI integration
  getMemoryStore() {
    return this.store;
  }

  // Real-time progress streaming for WebSocket connections
  subscribeToJobProgress(jobId: string, callback: (progress: OptimizationProgress) => void) {
    // This would be implemented with WebSocket or Server-Sent Events
    // For now, return a simple polling mechanism
    const interval = setInterval(() => {
      const progress = this.store.getJobProgress(jobId);
      if (progress) {
        callback(progress);
      }
    }, 1000);

    return () => clearInterval(interval);
  }
}
