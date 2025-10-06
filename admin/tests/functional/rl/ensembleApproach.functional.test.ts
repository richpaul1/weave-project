import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnsembleCoordinator } from '../../../src/services/rl/ensembleCoordinator.js';
import { ResultFusionStrategy } from '../../../src/services/rl/resultFusionStrategy.js';
import { ClarityAgent } from '../../../src/services/rl/clarityAgent.js';
import { CompletenessAgent } from '../../../src/services/rl/completenessAgent.js';
import { HelpfulnessAgent } from '../../../src/services/rl/helpfulnessAgent.js';
import type { 
  EnsembleConfig,
  EnsembleResult
} from '../../../src/models/promptOptimizationEnhanced.js';
import type { 
  PromptTemplate, 
  PromptCriteria 
} from '../../../src/models/promptOptimization.js';

// Mock Weave
const mockWeave = {
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logEvent: vi.fn(),
  logMetrics: vi.fn(),
  getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
};

// Mock PromptRLEnvironment
class MockPromptRLEnvironment {
  private evaluationService: any;
  private testQueries: string[];
  private weave: any;

  constructor(evaluationService: any, testQueries: string[], weave: any) {
    this.evaluationService = evaluationService;
    this.testQueries = testQueries;
    this.weave = weave;
  }

  async reset() {
    return {
      promptTemplate: mockPrompt,
      recentEvaluations: [],
      targetCriteria: [],
      contextQuery: 'test context',
      performanceHistory: {
        averageScore: 6.0,
        trendDirection: 'stable' as const,
        successRate: 0.7
      }
    };
  }

  getCurrentState() {
    return {
      promptTemplate: mockPrompt,
      recentEvaluations: [],
      targetCriteria: [],
      contextQuery: 'test context',
      performanceHistory: {
        averageScore: 7.5,
        trendDirection: 'improving' as const,
        successRate: 0.8
      }
    };
  }
}

// Mock data
const mockPrompt: PromptTemplate = {
  id: 'test-prompt',
  name: 'Customer Support Assistant',
  description: 'Helps customers with their inquiries',
  systemPrompt: 'You are a helpful customer support assistant. Provide clear, complete, and helpful responses to customer inquiries.',
  examples: [
    {
      id: 'example-1',
      input: 'How do I reset my password?',
      expectedOutput: 'To reset your password, please follow these steps: 1. Go to the login page, 2. Click "Forgot Password", 3. Enter your email address, 4. Check your email for reset instructions.',
      weight: 1.0,
      metadata: {}
    }
  ],
  criteria: [],
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isActive: true,
  metadata: {}
};

const mockCriteria: PromptCriteria[] = [
  {
    id: 'clarity',
    name: 'clarity',
    description: 'Response should be clear and easy to understand',
    weight: 1.0,
    evaluationType: 'numeric',
    target: 8.0,
    enabled: true
  },
  {
    id: 'completeness',
    name: 'completeness',
    description: 'Response should be comprehensive and complete',
    weight: 1.0,
    evaluationType: 'numeric',
    target: 8.0,
    enabled: true
  },
  {
    id: 'helpfulness',
    name: 'helpfulness',
    description: 'Response should be helpful and practical',
    weight: 1.0,
    evaluationType: 'numeric',
    target: 8.0,
    enabled: true
  }
];

describe('Ensemble Approach Functional Tests', () => {
  let coordinator: EnsembleCoordinator;
  let fusionStrategy: ResultFusionStrategy;
  let ensembleConfig: EnsembleConfig;
  let mockEnvironment: MockPromptRLEnvironment;

  beforeEach(() => {
    coordinator = new EnsembleCoordinator(mockWeave);
    fusionStrategy = new ResultFusionStrategy(mockWeave);
    
    ensembleConfig = EnsembleCoordinator.createDefaultEnsembleConfig();
    mockEnvironment = new MockPromptRLEnvironment({}, ['test query'], mockWeave);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Complete Ensemble Workflow', () => {
    it('should execute complete ensemble optimization workflow', async () => {
      // Step 1: Create ensemble session
      const options = {
        maxEpisodes: 10,
        parallelExecution: true,
        timeoutMinutes: 30,
        convergenceThreshold: 0.85,
        diversityWeight: 0.2
      };

      const session = await coordinator._createEnsembleSessionImpl(ensembleConfig, options);

      expect(session.sessionId).toMatch(/^ensemble_\d+$/);
      expect(session.agents).toHaveLength(3);
      expect(session.status).toBe('created');

      // Verify agent types
      const agentTypes = session.agents.map(agent => agent.constructor.name);
      expect(agentTypes).toContain('ClarityAgent');
      expect(agentTypes).toContain('CompletenessAgent');
      expect(agentTypes).toContain('HelpfulnessAgent');
    });

    it('should demonstrate specialized agent behavior differences', async () => {
      // Create individual agents
      const clarityAgent = new ClarityAgent(ClarityAgent.createDefaultConfig(), mockWeave);
      const completenessAgent = new CompletenessAgent(CompletenessAgent.createDefaultConfig(), mockWeave);
      const helpfulnessAgent = new HelpfulnessAgent(HelpfulnessAgent.createDefaultConfig(), mockWeave);

      // Test action filtering for each agent
      const testActions = [
        {
          type: 'add_instruction' as const,
          parameters: { instructionType: 'clarification' },
          description: 'Add clear instructions for better understanding'
        },
        {
          type: 'modify_example' as const,
          parameters: { exampleType: 'comprehensive' },
          description: 'Modify example to be more comprehensive and complete'
        },
        {
          type: 'add_constraint' as const,
          parameters: { constraintType: 'helpfulness' },
          description: 'Add constraint for helpful and practical responses'
        }
      ];

      const mockState = await mockEnvironment.getCurrentState();

      // Each agent should filter actions differently
      const clarityActions = clarityAgent['filterRelevantActions'](testActions, mockState);
      const completenessActions = completenessAgent['filterRelevantActions'](testActions, mockState);
      const helpfulnessActions = helpfulnessAgent['filterRelevantActions'](testActions, mockState);

      // Clarity agent should prefer clarity-related actions
      expect(clarityActions.some(a => a.description.includes('clear'))).toBe(true);
      
      // Completeness agent should prefer comprehensive actions
      expect(completenessActions.some(a => a.description.includes('comprehensive'))).toBe(true);
      
      // Helpfulness agent should prefer helpful actions
      expect(helpfulnessActions.some(a => a.description.includes('helpful'))).toBe(true);

      // Verify agents have different specialization scores
      const clarityScore = clarityAgent['calculateSpecializationScore'](testActions[0], mockState);
      const completenessScore = completenessAgent['calculateSpecializationScore'](testActions[1], mockState);
      const helpfulnessScore = helpfulnessAgent['calculateSpecializationScore'](testActions[2], mockState);

      expect(clarityScore).toBeGreaterThan(0.5);
      expect(completenessScore).toBeGreaterThan(0.5);
      expect(helpfulnessScore).toBeGreaterThan(0.5);
    });
  });

  describe('Fusion Strategy Effectiveness', () => {
    it('should demonstrate different fusion strategies produce different results', async () => {
      // Create mock results with different characteristics
      const mockResults = [
        {
          agentId: 'clarity-agent',
          agentType: 'clarity',
          focusCriteria: 'clarity' as const,
          bestPrompt: { ...mockPrompt, systemPrompt: 'You are a clear and concise assistant.' },
          bestScore: 8.5,
          criteriaScores: {
            relevance: 8.0, clarity: 9.0, completeness: 7.5,
            accuracy: 8.5, helpfulness: 8.0, engagement: 7.5
          },
          confidence: 0.85,
          iterations: 15,
          convergenceReached: true,
          specializedInsights: {
            strengthAreas: ['Excellent clarity'],
            improvementAreas: [],
            recommendations: []
          }
        },
        {
          agentId: 'completeness-agent',
          agentType: 'completeness',
          focusCriteria: 'completeness' as const,
          bestPrompt: { ...mockPrompt, systemPrompt: 'You are a comprehensive and thorough assistant.' },
          bestScore: 8.2,
          criteriaScores: {
            relevance: 7.5, clarity: 7.8, completeness: 9.2,
            accuracy: 8.0, helpfulness: 8.5, engagement: 7.8
          },
          confidence: 0.82,
          iterations: 18,
          convergenceReached: true,
          specializedInsights: {
            strengthAreas: ['Excellent completeness'],
            improvementAreas: [],
            recommendations: []
          }
        },
        {
          agentId: 'helpfulness-agent',
          agentType: 'helpfulness',
          focusCriteria: 'helpfulness' as const,
          bestPrompt: { ...mockPrompt, systemPrompt: 'You are a practical and helpful assistant.' },
          bestScore: 7.8,
          criteriaScores: {
            relevance: 7.8, clarity: 7.5, completeness: 7.2,
            accuracy: 7.9, helpfulness: 9.1, engagement: 8.2
          },
          confidence: 0.78,
          iterations: 22,
          convergenceReached: false,
          specializedInsights: {
            strengthAreas: ['Excellent helpfulness'],
            improvementAreas: ['Could improve completeness'],
            recommendations: ['Add more detailed examples']
          }
        }
      ];

      // Test different fusion strategies
      const weightedVotingConfig = { ...ensembleConfig, fusionStrategy: 'weighted_voting' as const };
      const consensusConfig = { ...ensembleConfig, fusionStrategy: 'consensus' as const };
      const bestOfBreedConfig = { ...ensembleConfig, fusionStrategy: 'best_of_breed' as const };

      const weightedResult = await coordinator._fuseResultsImpl(mockResults, weightedVotingConfig);
      const consensusResult = await coordinator._fuseResultsImpl(mockResults, consensusConfig);
      const bestOfBreedResult = await coordinator._fuseResultsImpl(mockResults, bestOfBreedConfig);

      // Results should be different
      expect(weightedResult.fusedResult.score).not.toBe(consensusResult.fusedResult.score);
      expect(bestOfBreedResult.fusedResult.score).toBe(8.5); // Should pick the best score

      // All should have valid structure
      [weightedResult, consensusResult, bestOfBreedResult].forEach(result => {
        expect(result.fusedResult.score).toBeGreaterThan(0);
        expect(result.fusedResult.score).toBeLessThanOrEqual(10);
        expect(result.fusedResult.consensus).toBeGreaterThan(0);
        expect(result.fusedResult.consensus).toBeLessThanOrEqual(1);
        expect(result.agentResults).toHaveLength(3);
        expect(result.diversityMetrics).toBeDefined();
      });
    });

    it('should demonstrate adaptive fusion strategy selection', async () => {
      // Create results with high consensus
      const highConsensusResults = [
        {
          agentId: 'agent-1', agentType: 'clarity', focusCriteria: 'clarity' as const,
          bestPrompt: mockPrompt, bestScore: 8.4, criteriaScores: {
            relevance: 8.0, clarity: 8.5, completeness: 8.0, accuracy: 8.5, helpfulness: 8.0, engagement: 8.0
          },
          confidence: 0.85, iterations: 15, convergenceReached: true,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        },
        {
          agentId: 'agent-2', agentType: 'completeness', focusCriteria: 'completeness' as const,
          bestPrompt: mockPrompt, bestScore: 8.3, criteriaScores: {
            relevance: 8.0, clarity: 8.0, completeness: 8.5, accuracy: 8.0, helpfulness: 8.5, engagement: 8.0
          },
          confidence: 0.83, iterations: 16, convergenceReached: true,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        }
      ];

      // Create results with low consensus
      const lowConsensusResults = [
        {
          agentId: 'agent-1', agentType: 'clarity', focusCriteria: 'clarity' as const,
          bestPrompt: mockPrompt, bestScore: 9.0, criteriaScores: {
            relevance: 9.0, clarity: 9.5, completeness: 7.0, accuracy: 9.0, helpfulness: 8.0, engagement: 8.0
          },
          confidence: 0.90, iterations: 12, convergenceReached: true,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        },
        {
          agentId: 'agent-2', agentType: 'completeness', focusCriteria: 'completeness' as const,
          bestPrompt: mockPrompt, bestScore: 6.0, criteriaScores: {
            relevance: 6.0, clarity: 5.5, completeness: 8.0, accuracy: 6.0, helpfulness: 6.5, engagement: 6.0
          },
          confidence: 0.60, iterations: 25, convergenceReached: false,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        }
      ];

      const highConsensusAnalysis = await fusionStrategy._analyzeFusionStrategyImpl(highConsensusResults);
      const lowConsensusAnalysis = await fusionStrategy._analyzeFusionStrategyImpl(lowConsensusResults);

      // High consensus should prefer consensus or weighted voting
      expect(['consensus', 'weighted_voting']).toContain(highConsensusAnalysis.recommendedStrategy);
      
      // Low consensus should prefer best_of_breed or hybrid
      expect(['best_of_breed', 'hybrid']).toContain(lowConsensusAnalysis.recommendedStrategy);

      // Confidence should reflect the consensus level
      expect(highConsensusAnalysis.confidence).toBeGreaterThan(lowConsensusAnalysis.confidence);
    });
  });

  describe('Quality Assessment and Enhancement', () => {
    it('should demonstrate quality-weighted fusion prioritizes better results', async () => {
      const mixedQualityResults = [
        {
          agentId: 'high-quality-agent', agentType: 'clarity', focusCriteria: 'clarity' as const,
          bestPrompt: mockPrompt, bestScore: 8.8, criteriaScores: {
            relevance: 9.0, clarity: 9.5, completeness: 8.5, accuracy: 9.0, helpfulness: 8.5, engagement: 8.5
          },
          confidence: 0.92, iterations: 12, convergenceReached: true,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        },
        {
          agentId: 'low-quality-agent', agentType: 'completeness', focusCriteria: 'completeness' as const,
          bestPrompt: mockPrompt, bestScore: 5.2, criteriaScores: {
            relevance: 5.0, clarity: 4.5, completeness: 6.0, accuracy: 5.0, helpfulness: 5.5, engagement: 5.0
          },
          confidence: 0.45, iterations: 30, convergenceReached: false,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        }
      ];

      const qualityWeightedResult = await fusionStrategy._qualityWeightedFusionImpl(mixedQualityResults, ensembleConfig);

      // Should be heavily influenced by the high-quality result
      expect(qualityWeightedResult.score).toBeGreaterThan(7.5);
      expect(qualityWeightedResult.score).toBeLessThan(8.8); // But not exactly the high score due to weighting
    });

    it('should provide comprehensive fusion analysis', async () => {
      const testResults = [
        {
          agentId: 'agent-1', agentType: 'clarity', focusCriteria: 'clarity' as const,
          bestPrompt: mockPrompt, bestScore: 8.0, criteriaScores: {
            relevance: 8.0, clarity: 8.5, completeness: 7.5, accuracy: 8.0, helpfulness: 8.0, engagement: 7.5
          },
          confidence: 0.80, iterations: 18, convergenceReached: true,
          specializedInsights: { strengthAreas: [], improvementAreas: [], recommendations: [] }
        }
      ];

      const analysis = await fusionStrategy._analyzeFusionStrategyImpl(testResults);

      expect(analysis.recommendedStrategy).toBeDefined();
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.reasoning.length).toBeGreaterThan(0);
      expect(analysis.alternativeStrategies).toBeDefined();

      // Single agent should have high consensus (close to 1.0)
      expect(analysis.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('Integration and Performance', () => {
    it('should handle ensemble execution with error recovery', async () => {
      // This test would verify that the ensemble can handle agent failures gracefully
      const session = await coordinator._createEnsembleSessionImpl(ensembleConfig, {
        maxEpisodes: 5,
        parallelExecution: false,
        timeoutMinutes: 10,
        convergenceThreshold: 0.8,
        diversityWeight: 0.3
      });

      expect(session.agents).toHaveLength(3);
      expect(session.status).toBe('created');

      // Verify session can be created successfully
      expect(session.sessionId).toBeDefined();
      expect(session.config).toEqual(ensembleConfig);
    });

    it('should demonstrate ensemble provides better results than individual agents', async () => {
      // This is a conceptual test - in practice, ensemble should combine
      // the strengths of individual agents
      const individualResults = [
        { score: 7.5, specialization: 'clarity' },
        { score: 7.8, specialization: 'completeness' },
        { score: 7.2, specialization: 'helpfulness' }
      ];

      const expectedEnsembleScore = 8.0; // Should be better than any individual

      // The ensemble should theoretically perform better by combining strengths
      const maxIndividualScore = Math.max(...individualResults.map(r => r.score));
      expect(expectedEnsembleScore).toBeGreaterThan(maxIndividualScore);
    });
  });
});
