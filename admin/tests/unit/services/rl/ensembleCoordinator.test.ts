import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnsembleCoordinator } from '../../../../src/services/rl/ensembleCoordinator.js';
import type { 
  EnsembleConfig,
  SpecializedAgent,
  MultiCriteriaScores
} from '../../../../src/models/promptOptimizationEnhanced.js';
import type { 
  PromptTemplate, 
  PromptCriteria 
} from '../../../../src/models/promptOptimization.js';
import type { SpecializedOptimizationResult } from '../../../../src/services/rl/specializedRLAgent.js';

// Mock Weave
const mockWeave = {
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logEvent: vi.fn(),
  logMetrics: vi.fn(),
  getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
};

// Mock PromptRLEnvironment
const mockEnvironment = {
  evaluationService: {},
  testQueries: ['test query 1', 'test query 2']
};

describe('EnsembleCoordinator', () => {
  let coordinator: EnsembleCoordinator;
  let mockConfig: EnsembleConfig;
  let mockPrompt: PromptTemplate;
  let mockCriteria: PromptCriteria[];
  let mockResults: SpecializedOptimizationResult[];

  beforeEach(() => {
    coordinator = new EnsembleCoordinator(mockWeave);

    // Create mock configuration
    mockConfig = {
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
          id: 'completeness-agent',
          name: 'Completeness Optimizer',
          type: 'completeness',
          focusCriteria: 'completeness',
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

    // Create mock prompt
    mockPrompt = {
      id: 'test-prompt',
      name: 'Test Prompt',
      description: 'Test prompt for ensemble',
      systemPrompt: 'You are a helpful assistant.',
      examples: [],
      criteria: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      metadata: {}
    };

    // Create mock criteria
    mockCriteria = [
      {
        id: 'clarity',
        name: 'clarity',
        description: 'Response clarity',
        weight: 1.0,
        evaluationType: 'numeric',
        target: 8.0,
        enabled: true
      }
    ];

    // Create mock results
    mockResults = [
      {
        agentId: 'clarity-agent',
        agentType: 'clarity',
        focusCriteria: 'clarity',
        bestPrompt: {
          ...mockPrompt,
          systemPrompt: 'You are a clear and helpful assistant.'
        },
        bestScore: 8.5,
        criteriaScores: {
          relevance: 8.0,
          clarity: 9.0,
          completeness: 7.5,
          accuracy: 8.5,
          helpfulness: 8.0,
          engagement: 7.5
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
        focusCriteria: 'completeness',
        bestPrompt: {
          ...mockPrompt,
          systemPrompt: 'You are a comprehensive and thorough assistant.'
        },
        bestScore: 8.2,
        criteriaScores: {
          relevance: 7.5,
          clarity: 7.8,
          completeness: 9.2,
          accuracy: 8.0,
          helpfulness: 8.5,
          engagement: 7.8
        },
        confidence: 0.82,
        iterations: 18,
        convergenceReached: true,
        specializedInsights: {
          strengthAreas: ['Excellent completeness'],
          improvementAreas: [],
          recommendations: []
        }
      }
    ];

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Session Creation', () => {
    it('should create ensemble session with correct configuration', async () => {
      const options = {
        maxEpisodes: 20,
        parallelExecution: true,
        timeoutMinutes: 30,
        convergenceThreshold: 0.85,
        diversityWeight: 0.2
      };

      const session = await coordinator._createEnsembleSessionImpl(mockConfig, options);

      expect(session.sessionId).toMatch(/^ensemble_\d+$/);
      expect(session.config).toEqual(mockConfig);
      expect(session.agents).toHaveLength(2);
      expect(session.status).toBe('created');
      expect(session.results).toHaveLength(0);
    });

    it('should create default ensemble configuration', () => {
      const defaultConfig = EnsembleCoordinator.createDefaultEnsembleConfig();

      expect(defaultConfig.agents).toHaveLength(3);
      expect(defaultConfig.fusionStrategy).toBe('weighted_voting');
      expect(defaultConfig.consensusThreshold).toBe(0.7);
      expect(defaultConfig.parallelExecution).toBe(true);
      
      const agentTypes = defaultConfig.agents.map(a => a.type);
      expect(agentTypes).toContain('clarity');
      expect(agentTypes).toContain('completeness');
      expect(agentTypes).toContain('helpfulness');
    });
  });

  describe('Result Fusion', () => {
    it('should perform weighted voting fusion correctly', async () => {
      const result = await coordinator._fuseResultsImpl(mockResults, mockConfig);

      expect(result.fusedResult).toBeDefined();
      expect(result.fusedResult.score).toBeGreaterThan(0);
      expect(result.fusedResult.consensus).toBeGreaterThan(0);
      expect(result.agentResults).toHaveLength(2);
      expect(result.diversityMetrics).toBeDefined();
    });

    it('should calculate consensus correctly', () => {
      const consensus = coordinator['calculateConsensus'](mockResults);
      
      expect(consensus).toBeGreaterThan(0);
      expect(consensus).toBeLessThanOrEqual(1);
    });

    it('should handle consensus fusion strategy', async () => {
      const consensusConfig = {
        ...mockConfig,
        fusionStrategy: 'consensus' as const
      };

      const result = await coordinator._fuseResultsImpl(mockResults, consensusConfig);

      expect(result.fusedResult).toBeDefined();
      expect(result.fusedResult.score).toBeGreaterThan(0);
    });

    it('should handle best of breed fusion strategy', async () => {
      const bestOfBreedConfig = {
        ...mockConfig,
        fusionStrategy: 'best_of_breed' as const
      };

      const result = await coordinator._fuseResultsImpl(mockResults, bestOfBreedConfig);

      expect(result.fusedResult).toBeDefined();
      expect(result.fusedResult.score).toBe(8.5); // Should pick the best score
      expect(result.fusedResult.prompt).toContain('clear'); // Should pick clarity agent's prompt
    });

    it('should handle hybrid fusion strategy', async () => {
      const hybridConfig = {
        ...mockConfig,
        fusionStrategy: 'hybrid' as const
      };

      const result = await coordinator._fuseResultsImpl(mockResults, hybridConfig);

      expect(result.fusedResult).toBeDefined();
      expect(result.fusedResult.score).toBeGreaterThan(0);
    });
  });

  describe('Diversity Metrics', () => {
    it('should calculate diversity metrics correctly', () => {
      const metrics = coordinator['calculateDiversityMetrics'](mockResults);

      expect(metrics.promptVariety).toBeGreaterThan(0);
      expect(metrics.promptVariety).toBeLessThanOrEqual(1);
      expect(metrics.approachDiversity).toBeGreaterThan(0);
      expect(metrics.approachDiversity).toBeLessThanOrEqual(1);
    });

    it('should handle single result diversity calculation', () => {
      const singleResult = [mockResults[0]];
      const metrics = coordinator['calculateDiversityMetrics'](singleResult);

      expect(metrics.promptVariety).toBe(0);
      expect(metrics.approachDiversity).toBe(0);
    });

    it('should calculate prompt similarity correctly', () => {
      const prompt1 = 'You are a helpful assistant.';
      const prompt2 = 'You are a helpful and clear assistant.';
      const prompt3 = 'Provide comprehensive responses to user queries.';

      const similarity1 = coordinator['calculatePromptSimilarity'](prompt1, prompt2);
      const similarity2 = coordinator['calculatePromptSimilarity'](prompt1, prompt3);

      expect(similarity1).toBeGreaterThan(similarity2); // More similar prompts
      expect(similarity1).toBeGreaterThan(0);
      expect(similarity1).toBeLessThanOrEqual(1);
    });
  });

  describe('Agent Creation', () => {
    it('should create specialized agents from configuration', async () => {
      const agents = await coordinator['createSpecializedAgents'](mockConfig.agents);

      expect(agents).toHaveLength(2);
      expect(agents[0].constructor.name).toBe('ClarityAgent');
      expect(agents[1].constructor.name).toBe('CompletenessAgent');
    });

    it('should throw error for unsupported agent type', async () => {
      const invalidConfig: SpecializedAgent[] = [
        {
          id: 'invalid-agent',
          name: 'Invalid Agent',
          type: 'invalid' as any,
          focusCriteria: 'clarity',
          weight: 1.0,
          config: {
            explorationRate: 0.2,
            learningRate: 0.001,
            specializationBonus: 0.3
          }
        }
      ];

      await expect(coordinator['createSpecializedAgents'](invalidConfig))
        .rejects.toThrow('Unsupported agent type: invalid');
    });
  });

  describe('Fusion Strategy Edge Cases', () => {
    it('should handle empty results array', async () => {
      await expect(coordinator._fuseResultsImpl([], mockConfig))
        .rejects.toThrow();
    });

    it('should handle single result', async () => {
      const singleResult = [mockResults[0]];
      const result = await coordinator._fuseResultsImpl(singleResult, mockConfig);

      expect(result.fusedResult.score).toBe(mockResults[0].bestScore);
      expect(result.fusedResult.consensus).toBe(1.0); // Perfect consensus with single result
    });

    it('should handle results with very different scores', async () => {
      const diverseResults = [
        { ...mockResults[0], bestScore: 9.5 },
        { ...mockResults[1], bestScore: 3.2 }
      ];

      const result = await coordinator._fuseResultsImpl(diverseResults, mockConfig);

      expect(result.fusedResult.consensus).toBeLessThan(0.5); // Low consensus
      expect(result.diversityMetrics.promptVariety).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported fusion strategy', async () => {
      const invalidConfig = {
        ...mockConfig,
        fusionStrategy: 'invalid_strategy' as any
      };

      await expect(coordinator._fuseResultsImpl(mockResults, invalidConfig))
        .rejects.toThrow('Unsupported fusion strategy: invalid_strategy');
    });
  });
});
