/**
 * Advanced Result Fusion Strategies for Ensemble RL Optimization
 * 
 * Implements sophisticated algorithms for combining results from multiple
 * specialized RL agents with quality assessment and adaptive weighting.
 */

import type { SpecializedOptimizationResult } from './specializedRLAgent.js';
import type {
  EnsembleConfig,
  EnsembleResult,
  MultiCriteriaScores
} from '../../models/promptOptimizationEnhanced.js';

export interface FusionMetrics {
  confidenceScore: number;
  diversityScore: number;
  consensusLevel: number;
  qualityScore: number;
  stabilityScore: number;
}

export interface FusionAnalysis {
  recommendedStrategy: EnsembleConfig['fusionStrategy'];
  confidence: number;
  reasoning: string[];
  alternativeStrategies: Array<{
    strategy: EnsembleConfig['fusionStrategy'];
    score: number;
    reason: string;
  }>;
}

export interface AdaptiveFusionConfig {
  qualityThreshold: number;
  qualityWeight: number;
  diversityWeight: number;
  consensusWeight: number;
  confidenceWeight: number;
  stabilityWeight: number;
  adaptiveWeighting: boolean;
}

/**
 * Advanced Result Fusion Strategy Service
 */
export class ResultFusionStrategy {
  private weave: any;

  constructor(weave: any) {
    this.weave = weave;

    // Bind methods directly (weave.op not available in our WeaveService)
    this.analyzeFusionStrategy = this._analyzeFusionStrategyImpl.bind(this);
    this.adaptiveFusion = this._adaptiveFusionImpl.bind(this);
    this.qualityWeightedFusion = this._qualityWeightedFusionImpl.bind(this);
  }

  /**
   * Analyze results and recommend optimal fusion strategy
   */
  async _analyzeFusionStrategyImpl(results: SpecializedOptimizationResult[]): Promise<FusionAnalysis> {
    const metrics = this.calculateFusionMetrics(results);
    
    await this.weave.logEvent('fusion_analysis_started', {
      agentCount: results.length,
      metrics
    });

    const strategies = this.evaluateStrategies(results, metrics);
    const recommended = strategies[0];

    const analysis: FusionAnalysis = {
      recommendedStrategy: recommended.strategy,
      confidence: recommended.score,
      reasoning: this.generateRecommendationReasoning(metrics, recommended),
      alternativeStrategies: strategies.slice(1, 3)
    };

    await this.weave.logEvent('fusion_analysis_completed', {
      recommendedStrategy: analysis.recommendedStrategy,
      confidence: analysis.confidence,
      alternativeCount: analysis.alternativeStrategies.length
    });

    return analysis;
  }

  /**
   * Adaptive fusion that selects strategy based on result characteristics
   */
  async _adaptiveFusionImpl(
    results: SpecializedOptimizationResult[],
    config: AdaptiveFusionConfig
  ): Promise<EnsembleResult['fusedResult']> {
    const traceId = this.weave.startTrace('adaptive_fusion_execution', {
      resultsCount: results.length,
      adaptiveWeighting: config.adaptiveWeighting
    });

    try {
      console.log(`🔄 Performing adaptive fusion with ${results.length} agent results`);

      const metrics = this.calculateFusionMetrics(results);
      const analysis = await this.analyzeFusionStrategy(results);

      await this.weave.logEvent('adaptive_fusion_started', {
        selectedStrategy: analysis.recommendedStrategy,
        confidence: analysis.confidence,
        metrics
      });

      // Apply adaptive weighting if enabled
      let adaptedResults = results;
      if (config.adaptiveWeighting) {
        adaptedResults = this.applyAdaptiveWeighting(results, metrics, config);
      }

      // Execute the recommended strategy
      const fusedResult = await this.executeFusionStrategy(
        analysis.recommendedStrategy,
        adaptedResults,
        config
      );

      // Enhance with quality assessment
      const enhancedResult = this.enhanceWithQualityMetrics(fusedResult, metrics);

      await this.weave.logEvent('adaptive_fusion_completed', {
        strategy: analysis.recommendedStrategy,
        finalScore: enhancedResult.score,
        qualityScore: metrics.qualityScore
      });

      this.weave.endTrace(traceId, {
        strategy: analysis.recommendedStrategy,
        finalScore: enhancedResult.score,
        qualityScore: metrics.qualityScore,
        success: true
      });

      return enhancedResult;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Quality-weighted fusion that emphasizes high-quality results
   */
  async _qualityWeightedFusionImpl(
    results: SpecializedOptimizationResult[],
    config: EnsembleConfig
  ): Promise<EnsembleResult['fusedResult']> {
    const traceId = this.weave.startTrace('quality_weighted_fusion', {
      resultsCount: results.length
    });

    try {
      console.log(`⭐ Performing quality-weighted fusion`);

      // Calculate quality scores for each result
      const qualityScores = results.map(result => this.calculateResultQuality(result));
      
      // Apply quality-based weighting
      const qualityWeightedResults = results.map((result, index) => ({
        ...result,
        qualityWeight: qualityScores[index]
      }));

      // Sort by quality and apply exponential weighting
      const sortedResults = qualityWeightedResults.sort((a, b) => b.qualityWeight - a.qualityWeight);
      
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const weightedCriteriaScores: MultiCriteriaScores = {
        relevance: 0, clarity: 0, completeness: 0, accuracy: 0, helpfulness: 0, engagement: 0
      };

      sortedResults.forEach((result, index) => {
        // Exponential decay for lower quality results
        const positionWeight = Math.exp(-index * 0.5);
        const finalWeight = result.qualityWeight * positionWeight;
        
        totalWeightedScore += result.bestScore * finalWeight;
        totalWeight += finalWeight;

        Object.keys(weightedCriteriaScores).forEach(criteria => {
          weightedCriteriaScores[criteria as keyof MultiCriteriaScores] += 
            result.criteriaScores[criteria as keyof MultiCriteriaScores] * finalWeight;
        });
      });

      // Normalize scores
      const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
      Object.keys(weightedCriteriaScores).forEach(criteria => {
        if (totalWeight > 0) {
          weightedCriteriaScores[criteria as keyof MultiCriteriaScores] /= totalWeight;
        }
      });

      // Calculate consensus based on quality-weighted agreement
      const consensus = this.calculateQualityWeightedConsensus(sortedResults);

      await this.weave.logEvent('quality_weighted_fusion_completed', {
        finalScore,
        consensus,
        qualityScores: qualityScores.map((score, i) => ({ agentId: results[i].agentId, quality: score }))
      });

      const result = {
        prompt: sortedResults[0].bestPrompt.systemPrompt,
        score: finalScore,
        criteriaScores: weightedCriteriaScores,
        consensus
      };

      this.weave.endTrace(traceId, {
        finalScore,
        consensus,
        qualityScoresCount: qualityScores.length,
        success: true
      });

      return result;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Calculate comprehensive fusion metrics
   */
  private calculateFusionMetrics(results: SpecializedOptimizationResult[]): FusionMetrics {
    if (results.length === 0) {
      return {
        confidenceScore: 0,
        diversityScore: 0,
        consensusLevel: 0,
        qualityScore: 0,
        stabilityScore: 0
      };
    }

    // Confidence score (average of agent confidences)
    const confidenceScore = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    // Diversity score (variety in approaches and results)
    const diversityScore = this.calculateDiversityScore(results);

    // Consensus level (agreement between agents)
    const consensusLevel = this.calculateConsensusLevel(results);

    // Quality score (overall result quality)
    const qualityScore = this.calculateOverallQuality(results);

    // Stability score (consistency of convergence)
    const stabilityScore = this.calculateStabilityScore(results);

    return {
      confidenceScore,
      diversityScore,
      consensusLevel,
      qualityScore,
      stabilityScore
    };
  }

  /**
   * Evaluate different fusion strategies and rank them
   */
  private evaluateStrategies(
    results: SpecializedOptimizationResult[],
    metrics: FusionMetrics
  ): Array<{ strategy: EnsembleConfig['fusionStrategy']; score: number; reason: string }> {
    const strategies: Array<{ strategy: EnsembleConfig['fusionStrategy']; score: number; reason: string }> = [];

    // Weighted voting - good for balanced results
    const weightedVotingScore = 
      (metrics.qualityScore * 0.3) + 
      (metrics.consensusLevel * 0.3) + 
      (metrics.confidenceScore * 0.4);
    strategies.push({
      strategy: 'weighted_voting',
      score: weightedVotingScore,
      reason: 'Balanced approach considering all agent contributions'
    });

    // Consensus - good for high agreement
    const consensusScore = 
      (metrics.consensusLevel * 0.5) + 
      (metrics.qualityScore * 0.3) + 
      (metrics.stabilityScore * 0.2);
    strategies.push({
      strategy: 'consensus',
      score: consensusScore,
      reason: 'High consensus between agents suggests reliable results'
    });

    // Best of breed - good for high diversity or clear winner
    const bestOfBreedScore = 
      (metrics.qualityScore * 0.4) + 
      (metrics.diversityScore * 0.3) + 
      (1 - metrics.consensusLevel) * 0.3; // Benefits from low consensus
    strategies.push({
      strategy: 'best_of_breed',
      score: bestOfBreedScore,
      reason: 'Clear quality leader or high diversity in approaches'
    });

    // Hybrid - good for moderate consensus
    const hybridScore = 
      (metrics.qualityScore * 0.25) + 
      (metrics.diversityScore * 0.25) + 
      (metrics.consensusLevel * 0.25) + 
      (metrics.stabilityScore * 0.25);
    strategies.push({
      strategy: 'hybrid',
      score: hybridScore,
      reason: 'Balanced metrics suggest hybrid approach'
    });

    return strategies.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate reasoning for strategy recommendation
   */
  private generateRecommendationReasoning(
    metrics: FusionMetrics,
    recommended: { strategy: EnsembleConfig['fusionStrategy']; score: number; reason: string }
  ): string[] {
    const reasoning: string[] = [recommended.reason];

    if (metrics.consensusLevel > 0.8) {
      reasoning.push('High consensus between agents indicates reliable convergence');
    } else if (metrics.consensusLevel < 0.4) {
      reasoning.push('Low consensus suggests diverse approaches or conflicting results');
    }

    if (metrics.qualityScore > 0.8) {
      reasoning.push('High overall quality scores from multiple agents');
    } else if (metrics.qualityScore < 0.5) {
      reasoning.push('Quality concerns may require careful result selection');
    }

    if (metrics.diversityScore > 0.7) {
      reasoning.push('High diversity in approaches provides robust optimization');
    }

    if (metrics.stabilityScore > 0.8) {
      reasoning.push('Stable convergence patterns across agents');
    }

    return reasoning;
  }

  /**
   * Apply adaptive weighting based on metrics
   */
  private applyAdaptiveWeighting(
    results: SpecializedOptimizationResult[],
    metrics: FusionMetrics,
    config: AdaptiveFusionConfig
  ): SpecializedOptimizationResult[] {
    return results.map(result => {
      const qualityWeight = this.calculateResultQuality(result) * config.qualityWeight;
      const confidenceWeight = result.confidence * config.confidenceWeight;
      const stabilityWeight = (result.convergenceReached ? 1.0 : 0.5) * config.stabilityWeight;
      
      const adaptiveWeight = (qualityWeight + confidenceWeight + stabilityWeight) / 3;
      
      return {
        ...result,
        adaptiveWeight
      };
    });
  }

  /**
   * Execute specific fusion strategy
   */
  private async executeFusionStrategy(
    strategy: EnsembleConfig['fusionStrategy'],
    results: SpecializedOptimizationResult[],
    config: AdaptiveFusionConfig
  ): Promise<EnsembleResult['fusedResult']> {
    // This would delegate to the appropriate fusion method
    // For now, implement a simplified version
    const bestResult = results.reduce((best, current) => 
      current.bestScore > best.bestScore ? current : best
    );

    return {
      prompt: bestResult.bestPrompt.systemPrompt,
      score: bestResult.bestScore,
      criteriaScores: bestResult.criteriaScores,
      consensus: this.calculateConsensusLevel(results)
    };
  }

  /**
   * Enhance result with quality metrics
   */
  private enhanceWithQualityMetrics(
    result: EnsembleResult['fusedResult'],
    metrics: FusionMetrics
  ): EnsembleResult['fusedResult'] {
    // Apply quality adjustment to final score
    const qualityAdjustment = metrics.qualityScore * 0.1;
    const adjustedScore = Math.min(10, result.score + qualityAdjustment);

    return {
      ...result,
      score: adjustedScore
    };
  }

  /**
   * Calculate result quality score
   */
  private calculateResultQuality(result: SpecializedOptimizationResult): number {
    // Handle edge cases and ensure valid numbers
    const bestScore = typeof result.bestScore === 'number' && !isNaN(result.bestScore) ? result.bestScore : 0;
    const confidence = typeof result.confidence === 'number' && !isNaN(result.confidence) ? result.confidence : 0;
    const iterations = typeof result.iterations === 'number' && !isNaN(result.iterations) ? result.iterations : 1;

    const scoreComponent = bestScore / 10; // Normalize to 0-1
    const confidenceComponent = confidence;
    const convergenceComponent = result.convergenceReached ? 1.0 : 0.5;
    const iterationEfficiency = Math.max(0, 1 - (iterations / 50)); // Fewer iterations = more efficient

    const quality = (scoreComponent * 0.4) + (confidenceComponent * 0.3) +
                   (convergenceComponent * 0.2) + (iterationEfficiency * 0.1);

    // Ensure the result is a valid number
    return isNaN(quality) ? 0 : Math.max(0, Math.min(1, quality));
  }

  /**
   * Calculate diversity score
   */
  private calculateDiversityScore(results: SpecializedOptimizationResult[]): number {
    if (results.length < 2) return 0;

    const agentTypes = results.map(r => r.agentType);
    const uniqueTypes = new Set(agentTypes);
    const typeDiversity = uniqueTypes.size / results.length;

    const scores = results.map(r => r.bestScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const scoreVariance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const scoreSpread = Math.min(1, scoreVariance / 4); // Normalize variance

    return (typeDiversity * 0.6) + (scoreSpread * 0.4);
  }

  /**
   * Calculate consensus level
   */
  private calculateConsensusLevel(results: SpecializedOptimizationResult[]): number {
    if (results.length < 2) return 1.0;

    const scores = results.map(r => r.bestScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    return Math.max(0, 1 - (stdDev / 3.0));
  }

  /**
   * Calculate overall quality
   */
  private calculateOverallQuality(results: SpecializedOptimizationResult[]): number {
    if (results.length === 0) return 0;

    const qualityScores = results.map(r => this.calculateResultQuality(r));
    return qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
  }

  /**
   * Calculate stability score
   */
  private calculateStabilityScore(results: SpecializedOptimizationResult[]): number {
    if (results.length === 0) return 0;

    const convergenceRate = results.filter(r => r.convergenceReached).length / results.length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    return (convergenceRate * 0.6) + (avgConfidence * 0.4);
  }

  /**
   * Calculate quality-weighted consensus
   */
  private calculateQualityWeightedConsensus(results: Array<SpecializedOptimizationResult & { qualityWeight: number }>): number {
    if (results.length < 2) return 1.0;

    const weightedScores = results.map(r => r.bestScore * r.qualityWeight);
    const totalWeight = results.reduce((sum, r) => sum + r.qualityWeight, 0);
    const weightedAvg = totalWeight > 0 ? weightedScores.reduce((a, b) => a + b, 0) / totalWeight : 0;
    
    const weightedVariance = results.reduce((sum, r) => {
      const diff = r.bestScore - weightedAvg;
      return sum + (diff * diff * r.qualityWeight);
    }, 0) / totalWeight;
    
    const weightedStdDev = Math.sqrt(weightedVariance);
    return Math.max(0, 1 - (weightedStdDev / 3.0));
  }

  /**
   * Create default adaptive fusion configuration
   */
  static createDefaultAdaptiveFusionConfig(): AdaptiveFusionConfig {
    return {
      qualityThreshold: 0.7,
      qualityWeight: 0.4,
      diversityWeight: 0.2,
      consensusWeight: 0.3,
      confidenceWeight: 0.3,
      stabilityWeight: 0.2,
      adaptiveWeighting: true
    };
  }
}
