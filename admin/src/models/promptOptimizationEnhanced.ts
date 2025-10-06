/**
 * Enhanced Prompt Optimization Models
 * 
 * Extends the existing prompt optimization system with:
 * - Multi-criteria scoring
 * - Multi-round optimization
 * - Ensemble approach support
 * - Advanced job management
 */

import { 
  PromptTemplate, 
  PromptCriteria, 
  RLAction, 
  RLState, 
  RLEpisode 
} from './promptOptimization.js';

// ============================================================================
// ENHANCED EVALUATION MODELS
// ============================================================================

export interface MultiCriteriaScores {
  relevance: number;      // 1-10: How well it answers the question
  clarity: number;        // 1-10: How clear and understandable
  completeness: number;   // 1-10: How comprehensive
  accuracy: number;       // 1-10: Factual correctness
  helpfulness: number;    // 1-10: Practical value
  engagement: number;     // 1-10: How engaging/interesting
}

export interface ResponseEvaluation {
  id: string;
  overallScore: number;           // 1-10 (weighted average or manual)
  criteria: MultiCriteriaScores;
  reason: string;                 // Explanation for the scores
  weight: number;                 // Importance of this example (0.1-2.0)
  isGoldenExample: boolean;       // Mark as high-quality reference
  evaluatorType: 'human' | 'automated' | 'ensemble';
  timestamp: string;
  metadata: {
    responseTime?: number;
    tokenCount?: number;
    evaluatorId?: string;
  };
}

export interface TrainingExample {
  id: string;
  response: string;               // Markdown response content
  evaluation: ResponseEvaluation;
  tags: string[];                 // Optional categorization
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// MULTI-ROUND OPTIMIZATION MODELS
// ============================================================================

export interface OptimizationRound {
  roundNumber: number;
  strategy: 'exploration' | 'refinement' | 'fine_tuning';
  maxIterations: number;
  targetScore: number;
  convergenceThreshold: number;
  focusCriteria?: keyof MultiCriteriaScores[];  // Focus on specific criteria
  agentConfig: {
    explorationRate: number;
    learningRate: number;
    diversityBonus: number;
  };
}

export interface MultiRoundConfig {
  rounds: OptimizationRound[];
  globalTargetScore: number;
  maxTotalIterations: number;
  allowEarlyTermination: boolean;
  transferLearning: boolean;      // Use learnings from previous rounds
}

// ============================================================================
// ENSEMBLE APPROACH MODELS
// ============================================================================

export interface SpecializedAgent {
  id: string;
  name: string;
  type: 'clarity' | 'completeness' | 'helpfulness' | 'engagement' | 'accuracy' | 'relevance';
  focusCriteria: keyof MultiCriteriaScores;
  weight: number;                 // Influence in ensemble decisions
  config: {
    explorationRate: number;
    learningRate: number;
    specializationBonus: number;  // Extra reward for improving focus criteria
  };
}

export interface EnsembleConfig {
  agents: SpecializedAgent[];
  fusionStrategy: 'weighted_voting' | 'consensus' | 'best_of_breed' | 'hybrid';
  consensusThreshold: number;     // Agreement level required for consensus
  diversityWeight: number;        // How much to value diverse approaches
  parallelExecution: boolean;     // Run agents in parallel vs sequential
}

export interface EnsembleResult {
  agentResults: Array<{
    agentId: string;
    prompt: string;
    score: number;
    criteriaScores: MultiCriteriaScores;
    confidence: number;
  }>;
  fusedResult: {
    prompt: string;
    score: number;
    criteriaScores: MultiCriteriaScores;
    consensus: number;            // Agreement level between agents
  };
  diversityMetrics: {
    promptVariety: number;        // How different the prompts are
    approachDiversity: number;    // How different the optimization approaches
  };
}

// ============================================================================
// JOB CONFIGURATION MODELS
// ============================================================================

export interface OptimizationConfig {
  // Algorithm Selection
  algorithmType: 'simple_llm' | 'multi_round' | 'ensemble';

  // Basic Configuration
  maxIterations: number;
  targetScore: number;
  convergenceThreshold: number;
  
  // Multi-Round Configuration
  multiRound: MultiRoundConfig;
  
  // Ensemble Configuration
  ensemble: EnsembleConfig;
  
  // Advanced Options
  adaptiveStoppingEnabled: boolean;
  humanFeedbackLoop: {
    pauseForReview: boolean;
    reviewFrequency: number;      // Every N iterations
    allowManualScoring: boolean;
  };
  
  // Performance Options
  parallelProcessing: boolean;
  maxConcurrentAgents: number;
  timeoutMinutes: number;
}

// ============================================================================
// JOB MANAGEMENT MODELS
// ============================================================================

export interface OptimizationIteration {
  id: string;
  jobId: string;
  roundNumber: number;
  iterationNumber: number;
  agentId?: string;               // For ensemble approach
  
  // Input
  inputPrompt: string;
  appliedActions: RLAction[];
  
  // Output
  generatedResponse: string;
  predictedScore: number;
  actualScore?: number;           // If manually scored
  criteriaScores?: MultiCriteriaScores;
  
  // Metadata
  improvements: string[];         // What the agent changed
  executionTime: number;          // Milliseconds
  timestamp: string;
  
  // Analysis
  novelty: number;               // How different from previous iterations
  confidence: number;            // Agent's confidence in this iteration
}

export interface OptimizationProgress {
  currentRound: number;
  currentIteration: number;
  totalIterations: number;
  bestScore: number;
  averageScore: number;
  convergenceProgress: number;    // 0-1, how close to convergence
  estimatedTimeRemaining: number; // Minutes
  
  // Score trends
  scoreHistory: Array<{
    iteration: number;
    score: number;
    criteriaScores: MultiCriteriaScores;
  }>;
  
  // Current best results
  topPrompts: Array<{
    rank: number;
    prompt: string;
    score: number;
    criteriaScores: MultiCriteriaScores;
    iteration: number;
    roundNumber: number;
  }>;
}

export type JobStatus = 
  | 'created' 
  | 'running' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled'
  | 'waiting_for_review';

export interface PromptOptimizationJob {
  // Basic Information
  id: string;
  name: string;
  description?: string;
  
  // Input Configuration
  startingQuestion: string;
  initialPrompt: string;
  trainingExamples: TrainingExample[];
  
  // Optimization Configuration
  config: OptimizationConfig;
  
  // Execution State
  status: JobStatus;
  progress: OptimizationProgress;
  
  // Results
  iterations: OptimizationIteration[];
  finalResults: {
    bestPrompts: Array<{
      rank: number;
      prompt: string;
      response: string;
      score: number;
      criteriaScores: MultiCriteriaScores;
      metadata: {
        roundNumber: number;
        iterationNumber: number;
        agentId?: string;
        improvements: string[];
      };
    }>;
    analytics: {
      totalIterations: number;
      totalExecutionTime: number;
      convergenceAchieved: boolean;
      averageImprovement: number;
      bestRound: number;
      mostEffectiveAgent?: string;
    };
  };
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  
  // Error Handling
  error?: {
    message: string;
    stack?: string;
    timestamp: string;
    recoverable: boolean;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface OptimizationPattern {
  id: string;
  name: string;
  domain: string;                 // "customer_support", "education", etc.
  improvements: string[];         // Common successful modifications
  successRate: number;           // How often this pattern works
  averageImprovement: number;     // Average score improvement
  applicableContexts: string[];  // When to use this pattern
  createdFrom: string[];          // Job IDs that contributed to this pattern
}

export interface JobTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  defaultQuestion: string;
  defaultPrompt: string;
  suggestedExamples: TrainingExample[];
  recommendedConfig: OptimizationConfig;
  tags: string[];
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface OptimizationJobResponse {
  job: PromptOptimizationJob;
  message?: string;
  warnings?: string[];
}

export interface JobListResponse {
  jobs: Array<Pick<PromptOptimizationJob, 
    'id' | 'name' | 'status' | 'progress' | 'createdAt' | 'updatedAt'
  >>;
  total: number;
  page: number;
  pageSize: number;
}

export interface JobAnalyticsResponse {
  jobId: string;
  analytics: {
    scoreProgression: Array<{
      iteration: number;
      score: number;
      criteriaBreakdown: MultiCriteriaScores;
    }>;
    agentPerformance?: Array<{
      agentId: string;
      averageScore: number;
      bestScore: number;
      iterationsCount: number;
    }>;
    patternAnalysis: {
      successfulPatterns: OptimizationPattern[];
      recommendedImprovements: string[];
    };
  };
}
