import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResultFusionStrategy } from '../../../../src/services/rl/resultFusionStrategy.js';
import type { SpecializedOptimizationResult } from '../../../../src/services/rl/specializedRLAgent.js';
import type { PromptTemplate } from '../../../../src/models/promptOptimization.js';

// Mock Weave
const mockWeave = {
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logEvent: vi.fn(),
  logMetrics: vi.fn(),
  getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
};

describe('ResultFusionStrategy', () => {
  let fusionStrategy: ResultFusionStrategy;
  let mockResults: SpecializedOptimizationResult[];

  beforeEach(() => {
    fusionStrategy = new ResultFusionStrategy(mockWeave);

    // Create mock prompt template
    const mockPrompt: PromptTemplate = {
      id: 'test-prompt',
      name: 'Test Prompt',
      description: 'Test prompt for fusion',
      systemPrompt: 'You are a helpful assistant.',
      examples: [],
      criteria: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      metadata: {}
    };

    // Create mock results with varying quality
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
      },
      {
        agentId: 'helpfulness-agent',
        agentType: 'helpfulness',
        focusCriteria: 'helpfulness',
        bestPrompt: {
          ...mockPrompt,
          systemPrompt: 'You are a practical and helpful assistant.'
        },
        bestScore: 7.8,
        criteriaScores: {
          relevance: 7.8,
          clarity: 7.5,
          completeness: 7.2,
          accuracy: 7.9,
          helpfulness: 9.1,
          engagement: 8.2
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

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('Fusion Metrics Calculation', () => {
    it('should calculate comprehensive fusion metrics', () => {
      const metrics = fusionStrategy['calculateFusionMetrics'](mockResults);

      expect(metrics.confidenceScore).toBeGreaterThan(0);
      expect(metrics.confidenceScore).toBeLessThanOrEqual(1);
      expect(metrics.diversityScore).toBeGreaterThan(0);
      expect(metrics.consensusLevel).toBeGreaterThan(0);
      expect(metrics.qualityScore).toBeGreaterThan(0);
      expect(metrics.stabilityScore).toBeGreaterThan(0);
    });

    it('should handle empty results array', () => {
      const metrics = fusionStrategy['calculateFusionMetrics']([]);

      expect(metrics.confidenceScore).toBe(0);
      expect(metrics.diversityScore).toBe(0);
      expect(metrics.consensusLevel).toBe(0);
      expect(metrics.qualityScore).toBe(0);
      expect(metrics.stabilityScore).toBe(0);
    });

    it('should calculate result quality correctly', () => {
      const highQualityResult = mockResults[0]; // High score, high confidence, converged
      const lowerQualityResult = mockResults[2]; // Lower score, lower confidence, not converged

      const highQuality = fusionStrategy['calculateResultQuality'](highQualityResult);
      const lowerQuality = fusionStrategy['calculateResultQuality'](lowerQualityResult);

      expect(highQuality).toBeGreaterThan(lowerQuality);
      expect(highQuality).toBeGreaterThan(0.7);
      expect(lowerQuality).toBeLessThan(0.8);
    });
  });

  describe('Strategy Analysis', () => {
    it('should analyze and recommend fusion strategy', async () => {
      const analysis = await fusionStrategy._analyzeFusionStrategyImpl(mockResults);

      expect(analysis.recommendedStrategy).toBeDefined();
      expect(['weighted_voting', 'consensus', 'best_of_breed', 'hybrid']).toContain(analysis.recommendedStrategy);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
      expect(analysis.reasoning.length).toBeGreaterThan(0);
      expect(analysis.alternativeStrategies.length).toBeGreaterThan(0);
    });

    it('should evaluate strategies correctly', () => {
      const metrics = fusionStrategy['calculateFusionMetrics'](mockResults);
      const strategies = fusionStrategy['evaluateStrategies'](mockResults, metrics);

      expect(strategies).toHaveLength(4);
      expect(strategies[0].score).toBeGreaterThanOrEqual(strategies[1].score);
      expect(strategies[1].score).toBeGreaterThanOrEqual(strategies[2].score);
      expect(strategies[2].score).toBeGreaterThanOrEqual(strategies[3].score);

      strategies.forEach(strategy => {
        expect(['weighted_voting', 'consensus', 'best_of_breed', 'hybrid']).toContain(strategy.strategy);
        expect(strategy.score).toBeGreaterThan(0);
        expect(strategy.reason).toBeDefined();
      });
    });

    it('should generate meaningful recommendation reasoning', () => {
      const metrics = fusionStrategy['calculateFusionMetrics'](mockResults);
      const strategies = fusionStrategy['evaluateStrategies'](mockResults, metrics);
      const reasoning = fusionStrategy['generateRecommendationReasoning'](metrics, strategies[0]);

      expect(reasoning.length).toBeGreaterThan(0);
      expect(reasoning[0]).toBe(strategies[0].reason);
    });
  });

  describe('Adaptive Fusion', () => {
    it('should perform adaptive fusion', async () => {
      const config = ResultFusionStrategy.createDefaultAdaptiveFusionConfig();
      const result = await fusionStrategy._adaptiveFusionImpl(mockResults, config);

      expect(result.prompt).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.criteriaScores).toBeDefined();
      expect(result.consensus).toBeGreaterThan(0);
      expect(result.consensus).toBeLessThanOrEqual(1);
    });

    it('should apply adaptive weighting when enabled', () => {
      const config = ResultFusionStrategy.createDefaultAdaptiveFusionConfig();
      const metrics = fusionStrategy['calculateFusionMetrics'](mockResults);
      
      const weightedResults = fusionStrategy['applyAdaptiveWeighting'](mockResults, metrics, config);

      expect(weightedResults).toHaveLength(mockResults.length);
      weightedResults.forEach(result => {
        expect(result).toHaveProperty('adaptiveWeight');
        expect(result.adaptiveWeight).toBeGreaterThan(0);
      });
    });

    it('should create default adaptive fusion configuration', () => {
      const config = ResultFusionStrategy.createDefaultAdaptiveFusionConfig();

      expect(config.qualityThreshold).toBe(0.7);
      expect(config.qualityWeight).toBe(0.4);
      expect(config.diversityWeight).toBe(0.2);
      expect(config.consensusWeight).toBe(0.3);
      expect(config.confidenceWeight).toBe(0.3);
      expect(config.stabilityWeight).toBe(0.2);
      expect(config.adaptiveWeighting).toBe(true);
    });
  });

  describe('Quality-Weighted Fusion', () => {
    it('should perform quality-weighted fusion', async () => {
      const config = {
        agents: [],
        fusionStrategy: 'weighted_voting' as const,
        consensusThreshold: 0.7,
        diversityWeight: 0.2,
        parallelExecution: true
      };

      const result = await fusionStrategy._qualityWeightedFusionImpl(mockResults, config);

      expect(result.prompt).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
      expect(result.criteriaScores).toBeDefined();
      expect(result.consensus).toBeGreaterThan(0);
    });

    it('should prioritize higher quality results', async () => {
      // Create results with clear quality differences
      const lowQualityResult = {
        ...mockResults[2],
        bestScore: 5.0,
        confidence: 0.3,
        convergenceReached: false
      };

      const mixedResults = [mockResults[0], lowQualityResult];
      const config = {
        agents: [],
        fusionStrategy: 'weighted_voting' as const,
        consensusThreshold: 0.7,
        diversityWeight: 0.2,
        parallelExecution: true
      };

      const result = await fusionStrategy._qualityWeightedFusionImpl(mixedResults, config);

      // Should be closer to the high-quality result
      expect(result.score).toBeGreaterThan(7.0);
      expect(result.prompt).toContain('clear'); // From the clarity agent
    });
  });

  describe('Diversity and Consensus Calculations', () => {
    it('should calculate diversity score correctly', () => {
      const diversityScore = fusionStrategy['calculateDiversityScore'](mockResults);

      expect(diversityScore).toBeGreaterThan(0);
      expect(diversityScore).toBeLessThanOrEqual(1);
    });

    it('should calculate consensus level correctly', () => {
      const consensusLevel = fusionStrategy['calculateConsensusLevel'](mockResults);

      expect(consensusLevel).toBeGreaterThan(0);
      expect(consensusLevel).toBeLessThanOrEqual(1);
    });

    it('should handle single result for diversity and consensus', () => {
      const singleResult = [mockResults[0]];
      
      const diversityScore = fusionStrategy['calculateDiversityScore'](singleResult);
      const consensusLevel = fusionStrategy['calculateConsensusLevel'](singleResult);

      expect(diversityScore).toBe(0);
      expect(consensusLevel).toBe(1.0);
    });

    it('should calculate higher consensus for similar scores', () => {
      const similarResults = mockResults.map(result => ({
        ...result,
        bestScore: 8.0 // All similar scores
      }));

      const consensusLevel = fusionStrategy['calculateConsensusLevel'](similarResults);
      const originalConsensus = fusionStrategy['calculateConsensusLevel'](mockResults);

      expect(consensusLevel).toBeGreaterThan(originalConsensus);
    });
  });

  describe('Quality Assessment', () => {
    it('should calculate overall quality correctly', () => {
      const overallQuality = fusionStrategy['calculateOverallQuality'](mockResults);

      expect(overallQuality).toBeGreaterThan(0);
      expect(overallQuality).toBeLessThanOrEqual(1);
    });

    it('should calculate stability score correctly', () => {
      const stabilityScore = fusionStrategy['calculateStabilityScore'](mockResults);

      expect(stabilityScore).toBeGreaterThan(0);
      expect(stabilityScore).toBeLessThanOrEqual(1);
    });

    it('should enhance result with quality metrics', () => {
      const baseResult = {
        prompt: 'Test prompt',
        score: 8.0,
        criteriaScores: mockResults[0].criteriaScores,
        consensus: 0.8
      };

      const metrics = fusionStrategy['calculateFusionMetrics'](mockResults);
      const enhancedResult = fusionStrategy['enhanceWithQualityMetrics'](baseResult, metrics);

      expect(enhancedResult.score).toBeGreaterThanOrEqual(baseResult.score);
      expect(enhancedResult.score).toBeLessThanOrEqual(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle results with extreme score differences', () => {
      const extremeResults = [
        { ...mockResults[0], bestScore: 9.8 },
        { ...mockResults[1], bestScore: 2.1 }
      ];

      const metrics = fusionStrategy['calculateFusionMetrics'](extremeResults);
      
      expect(metrics.consensusLevel).toBeLessThan(0.5); // Low consensus
      expect(metrics.diversityScore).toBeGreaterThan(0); // High diversity
    });

    it('should handle all converged vs all non-converged results', () => {
      const allConverged = mockResults.map(r => ({ ...r, convergenceReached: true }));
      const noneConverged = mockResults.map(r => ({ ...r, convergenceReached: false }));

      const convergedStability = fusionStrategy['calculateStabilityScore'](allConverged);
      const nonConvergedStability = fusionStrategy['calculateStabilityScore'](noneConverged);

      expect(convergedStability).toBeGreaterThan(nonConvergedStability);
    });
  });
});
