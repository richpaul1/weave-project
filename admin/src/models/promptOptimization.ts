/**
 * Data models for RL Prompt Optimization System
 * 
 * These models define the structure for prompts, criteria, evaluations,
 * and RL training data used in the prompt optimization system.
 */

export interface PromptCriteria {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1, importance of this criteria
  evaluationType: 'boolean' | 'numeric' | 'categorical';
  target?: any; // Target value for the criteria
  enabled: boolean;
}

export interface PromptExample {
  id: string;
  input: string;
  expectedOutput: string;
  metadata?: Record<string, any>;
  weight: number; // How important this example is for training
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  examples: PromptExample[];
  criteria: PromptCriteria[];
  version: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  parentId?: string; // For tracking prompt evolution
  metadata: {
    useCase: string;
    targetDomain: string;
    expectedResponseLength: number;
    tone: 'professional' | 'casual' | 'technical' | 'friendly';
    format: 'structured' | 'conversational' | 'bullet_points' | 'numbered';
  };
}

export interface PromptEvaluation {
  id: string;
  promptId: string;
  testQuery: string;
  response: string;
  criteriaScores: Record<string, number>; // criteria_id -> score
  overallScore: number;
  userFeedback?: {
    rating: number; // 1-5
    comments?: string;
    helpful: boolean;
  };
  metadata: {
    responseTime: number;
    tokenCount: number;
    timestamp: string;
    evaluatorType: 'automated' | 'human' | 'rl_agent';
  };
  traceUrl?: string;
}

export interface RLAction {
  type: 'add_instruction' | 'modify_example' | 'change_format' | 'adjust_tone' | 'add_constraint' | 'remove_constraint';
  parameters: Record<string, any>;
  description: string;
}

export interface RLState {
  promptTemplate: PromptTemplate;
  recentEvaluations: PromptEvaluation[];
  targetCriteria: PromptCriteria[];
  contextQuery: string;
  performanceHistory: {
    averageScore: number;
    trendDirection: 'improving' | 'declining' | 'stable';
    successRate: number;
  };
}

export interface RLEpisode {
  id: string;
  promptId: string;
  initialState: RLState;
  actions: RLAction[];
  rewards: number[];
  finalState: RLState;
  totalReward: number;
  episodeLength: number;
  timestamp: string;
  metadata: {
    agentVersion: string;
    explorationRate: number;
    learningRate: number;
  };
}

export interface PromptOptimizationSession {
  id: string;
  name: string;
  description: string;
  basePromptId: string;
  targetCriteria: PromptCriteria[];
  testQueries: string[];
  status: 'created' | 'training' | 'paused' | 'completed' | 'failed';
  episodes: RLEpisode[];
  bestPromptId?: string;
  bestScore: number;
  converged: boolean;
  startedAt: string;
  completedAt?: string;
  // Legacy aliases for backward compatibility
  startTime?: string;
  endTime?: string;
  metadata: {
    maxEpisodes: number;
    convergenceThreshold: number;
    evaluationFrequency: number;
  };
}

export interface PromptABTest {
  id: string;
  name: string;
  description: string;
  promptAId: string;
  promptBId: string;
  trafficSplit: number; // 0-1, percentage going to prompt A
  status: 'draft' | 'running' | 'paused' | 'completed';
  startedAt?: string;
  endedAt?: string;
  results: {
    promptA: {
      evaluations: number;
      averageScore: number;
      userSatisfaction: number;
    };
    promptB: {
      evaluations: number;
      averageScore: number;
      userSatisfaction: number;
    };
    statisticalSignificance: number;
    winner?: 'A' | 'B' | 'tie';
  };
  metadata: {
    minimumSampleSize: number;
    confidenceLevel: number;
    testDuration: number; // days
  };
}

// RL Agent Configuration
export interface RLAgentConfig {
  algorithm: 'ppo' | 'dqn' | 'a2c';
  hyperparameters: {
    learningRate: number;
    discountFactor: number;
    explorationRate: number;
    explorationDecay: number;
    batchSize: number;
    memorySize: number;
  };
  networkArchitecture: {
    hiddenLayers: number[];
    activationFunction: string;
    optimizer: string;
  };
  trainingConfig: {
    episodesPerUpdate: number;
    maxEpisodeLength: number;
    convergenceThreshold: number;
    evaluationFrequency: number;
  };
}

// Evaluation Metrics
export interface EvaluationMetrics {
  criteriaCompliance: Record<string, number>;
  responseQuality: {
    coherence: number;
    relevance: number;
    completeness: number;
    accuracy: number;
  };
  userEngagement: {
    clickThroughRate: number;
    timeSpent: number;
    followUpQuestions: number;
    satisfactionRating: number;
  };
  technicalMetrics: {
    responseTime: number;
    tokenEfficiency: number;
    errorRate: number;
  };
}

// Database schemas for Neo4j
export interface PromptNode {
  id: string;
  name: string;
  systemPrompt: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  metadata: Record<string, any>;
}

export interface EvaluationNode {
  id: string;
  promptId: string;
  query: string;
  response: string;
  overallScore: number;
  timestamp: string;
  traceUrl?: string;
}

export interface CriteriaNode {
  id: string;
  name: string;
  description: string;
  weight: number;
  evaluationType: string;
  enabled: boolean;
}

// Relationships
export interface PromptEvolutionRelationship {
  type: 'EVOLVED_FROM';
  properties: {
    action: string;
    improvement: number;
    timestamp: string;
  };
}

export interface EvaluationRelationship {
  type: 'EVALUATED_BY';
  properties: {
    score: number;
    timestamp: string;
  };
}

export interface CriteriaRelationship {
  type: 'MEETS_CRITERIA';
  properties: {
    score: number;
    weight: number;
  };
}
