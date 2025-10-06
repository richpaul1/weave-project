import type { 
  PromptOptimizationJob,
  PromptTemplate,
  PromptCriteria,
  TrainingExample
} from '../../models/promptOptimization.js';
import type { WeaveService } from '../../weave/weaveService.js';
import { PromptEvaluationService } from '../promptEvaluationService.js';
import { LLMService } from '../llmService.js';
import {
  SimpleLLMOptimizer,
  type SimpleLLMOptimizerConfig,
  type SimpleLLMOptimizationResult
} from './simpleLLMOptimizer.js';

export interface SimpleLLMJobResult {
  jobId: string;
  success: boolean;
  bestPrompt: PromptTemplate;
  bestScore: number;
  totalIterations: number;
  executionTime: number;
  convergenceAchieved: boolean;
  iterations: Array<{
    iteration: number;
    score: number;
    improvement: number;
    reasoning: string;
    timestamp: string;
  }>;
}

/**
 * Job runner for Simple LLM-based prompt optimization
 * Integrates with the existing job system while using the simpler algorithm
 */
export class SimpleLLMJobRunner {
  private weave: WeaveService;
  private evaluationService: PromptEvaluationService;
  private llmService: LLMService;

  constructor(weave: WeaveService, evaluationService?: PromptEvaluationService, llmService?: LLMService) {
    this.weave = weave;
    this.evaluationService = evaluationService || new PromptEvaluationService(weave);
    this.llmService = llmService || new LLMService();
  }

  /**
   * Execute a simple LLM optimization job
   */
  async executeJob(
    job: PromptOptimizationJob,
    progressCallback?: (progress: { 
      currentIteration: number; 
      totalIterations: number; 
      bestScore: number; 
      status: string 
    }) => void
  ): Promise<SimpleLLMJobResult> {
    const traceId = this.weave.startTrace('simple_llm_job_execution', {
      jobId: job.id,
      jobName: job.name,
      maxIterations: job.config.maxIterations
    });

    const startTime = Date.now();

    try {
      console.log(`🚀 Starting Simple LLM Job: ${job.name} (${job.id})`);

      // Extract job configuration and normalize scores to 0-1 range
      const normalizedTargetScore = job.config.targetScore > 1 ? job.config.targetScore / 10 : job.config.targetScore;
      const normalizedConvergenceThreshold = job.config.convergenceThreshold > 1 ? job.config.convergenceThreshold / 10 : job.config.convergenceThreshold;

      const config: SimpleLLMOptimizerConfig = {
        maxIterations: job.config.maxIterations || 10,
        targetScore: normalizedTargetScore || 0.8,
        convergenceThreshold: normalizedConvergenceThreshold || 0.05,
        improvementThreshold: 0.01, // Stop if improvement < 1%
        stagnationLimit: 3 // Stop if no improvement for 3 iterations
      };

      // Prepare initial prompt
      const initialPrompt: PromptTemplate = {
        id: `${job.id}_initial`,
        name: `${job.name} - Initial`,
        content: job.initialPrompt || 'You are a helpful assistant. Please provide a clear and accurate response.',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          jobId: job.id,
          type: 'initial'
        }
      };

      // Extract test queries and expected outputs from training examples
      const testQueries = job.trainingExamples.map(ex => ex.query);
      const expectedOutputs = job.trainingExamples.map(ex => ex.expectedResponse);

      // Create criteria (simplified - use default criteria if none provided)
      const criteria: PromptCriteria[] = this.createDefaultCriteria();

      // Create optimizer
      const optimizer = new SimpleLLMOptimizer(this.weave, this.evaluationService, config, this.llmService);

      // Set up progress tracking
      let currentIteration = 0;
      const originalStartTrace = this.weave.startTrace.bind(this.weave);
      
      // Intercept iteration traces to report progress
      this.weave.startTrace = (operation: string, inputs: any = {}, metadata: any = {}, parentTraceId?: string) => {
        if (operation.startsWith('optimization_iteration_')) {
          currentIteration = inputs.iteration || currentIteration + 1;
          if (progressCallback) {
            progressCallback({
              currentIteration,
              totalIterations: config.maxIterations,
              bestScore: inputs.currentScore || 0,
              status: `Iteration ${currentIteration}/${config.maxIterations}`
            });
          }
        }
        return originalStartTrace(operation, inputs, metadata, parentTraceId);
      };

      // Run optimization
      const result = await optimizer.optimizePrompt(
        initialPrompt,
        testQueries,
        expectedOutputs,
        criteria,
        job.description || `Optimize prompt for: ${job.name}`
      );

      // Restore original startTrace method
      this.weave.startTrace = originalStartTrace;

      const executionTime = Date.now() - startTime;

      // Final progress update
      if (progressCallback) {
        progressCallback({
          currentIteration: result.totalIterations,
          totalIterations: config.maxIterations,
          bestScore: result.bestScore,
          status: result.convergenceAchieved ? 'Converged' : 'Completed'
        });
      }

      const jobResult: SimpleLLMJobResult = {
        jobId: job.id,
        success: result.success,
        bestPrompt: result.bestPrompt,
        bestScore: result.bestScore,
        totalIterations: result.totalIterations,
        executionTime,
        convergenceAchieved: result.convergenceAchieved,
        iterations: result.iterations.map(iter => ({
          iteration: iter.iteration,
          score: iter.score,
          improvement: iter.improvement,
          reasoning: iter.reasoning,
          timestamp: iter.timestamp
        }))
      };

      console.log(`✅ Simple LLM Job completed: ${result.bestScore.toFixed(3)} score in ${result.totalIterations} iterations`);

      this.weave.endTrace(traceId, {
        success: jobResult.success,
        bestScore: jobResult.bestScore,
        totalIterations: jobResult.totalIterations,
        executionTime: jobResult.executionTime,
        convergenceAchieved: jobResult.convergenceAchieved
      });

      return jobResult;

    } catch (error) {
      this.weave.endTrace(traceId, { 
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Create default evaluation criteria
   */
  private createDefaultCriteria(): PromptCriteria[] {
    return [
      {
        id: 'relevance',
        name: 'Relevance',
        description: 'How well the response addresses the query',
        weight: 0.3,
        enabled: true,
        type: 'automated'
      },
      {
        id: 'accuracy',
        name: 'Accuracy',
        description: 'Factual correctness of the response',
        weight: 0.3,
        enabled: true,
        type: 'automated'
      },
      {
        id: 'clarity',
        name: 'Clarity',
        description: 'How clear and understandable the response is',
        weight: 0.2,
        enabled: true,
        type: 'automated'
      },
      {
        id: 'completeness',
        name: 'Completeness',
        description: 'How thoroughly the response covers the topic',
        weight: 0.2,
        enabled: true,
        type: 'automated'
      }
    ];
  }

  /**
   * Validate job configuration for simple LLM optimization
   */
  static validateJobConfig(job: PromptOptimizationJob): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!job.trainingExamples || job.trainingExamples.length === 0) {
      errors.push('At least one training example is required');
    }

    if (!job.initialPrompt || job.initialPrompt.trim().length === 0) {
      errors.push('Initial prompt is required');
    }

    if (job.config.maxIterations && job.config.maxIterations < 1) {
      errors.push('Maximum iterations must be at least 1');
    }

    if (job.config.maxIterations && job.config.maxIterations > 50) {
      errors.push('Maximum iterations should not exceed 50 for simple optimization');
    }

    if (job.config.targetScore && job.config.targetScore < 0) {
      errors.push('Target score must be positive');
    }

    if (job.config.targetScore && job.config.targetScore > 10) {
      errors.push('Target score must not exceed 10');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get recommended configuration for simple LLM optimization
   */
  static getRecommendedConfig(trainingExamplesCount: number): Partial<SimpleLLMOptimizerConfig> {
    // Adjust iterations based on training examples
    let maxIterations = 10;
    if (trainingExamplesCount <= 2) {
      maxIterations = 5;
    } else if (trainingExamplesCount >= 5) {
      maxIterations = 15;
    }

    return {
      maxIterations,
      targetScore: 0.8,
      convergenceThreshold: 0.05,
      improvementThreshold: 0.01,
      stagnationLimit: 3
    };
  }
}
