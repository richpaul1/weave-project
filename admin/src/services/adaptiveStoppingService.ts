/**
 * Adaptive Stopping Criteria Service
 * 
 * Implements intelligent stopping mechanisms for prompt optimization:
 * - Convergence detection based on score improvement patterns
 * - Plateau detection for early termination
 * - Performance-based stopping criteria
 * - Resource-aware termination
 */

import * as weave from 'weave';
import type {
  OptimizationIteration,
  PromptOptimizationJob,
  OptimizationProgress
} from '../models/promptOptimizationEnhanced.js';

export interface ConvergenceMetrics {
  scoreVariance: number;
  improvementRate: number;
  plateauLength: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  confidenceLevel: number;
}

export interface StoppingDecision {
  shouldStop: boolean;
  reason: string;
  confidence: number;
  recommendedAction: 'continue' | 'stop' | 'adjust_parameters';
  metrics: ConvergenceMetrics;
}

export interface StoppingConfig {
  convergenceThreshold: number;
  plateauPatience: number;
  minIterations: number;
  maxIterations: number;
  targetScore: number;
  improvementThreshold: number;
  varianceThreshold: number;
  confidenceThreshold: number;
}

export class AdaptiveStoppingService {
  // Weave-wrapped methods
  checkStoppingCriteria!: (iterations: OptimizationIteration[], config: StoppingConfig) => Promise<StoppingDecision>;
  detectConvergence!: (scores: number[], threshold: number) => Promise<ConvergenceMetrics>;
  calculateImprovementRate!: (scores: number[], windowSize?: number) => Promise<number>;
  detectPlateau!: (scores: number[], patience: number) => Promise<boolean>;
  predictOptimalStoppingPoint!: (iterations: OptimizationIteration[]) => Promise<number>;

  constructor() {
    const self = this;

    // Initialize Weave-wrapped methods following the tutorial pattern
    this.checkStoppingCriteria = weave.op(async function checkStoppingCriteria(iterations: OptimizationIteration[], config: StoppingConfig) {
      return await self._checkStoppingCriteriaImpl(iterations, config);
    }, 'adaptive_stopping_check_criteria');

    this.detectConvergence = weave.op(async function detectConvergence(scores: number[], threshold: number) {
      return await self._detectConvergenceImpl(scores, threshold);
    }, 'adaptive_stopping_detect_convergence');

    this.calculateImprovementRate = weave.op(async function calculateImprovementRate(scores: number[], windowSize?: number) {
      return await self._calculateImprovementRateImpl(scores, windowSize);
    }, 'adaptive_stopping_improvement_rate');

    this.detectPlateau = weave.op(async function detectPlateau(scores: number[], patience: number) {
      return await self._detectPlateauImpl(scores, patience);
    }, 'adaptive_stopping_detect_plateau');

    this.predictOptimalStoppingPoint = weave.op(async function predictOptimalStoppingPoint(iterations: OptimizationIteration[]) {
      return await self._predictOptimalStoppingPointImpl(iterations);
    }, 'adaptive_stopping_predict_optimal');
  }

  async _checkStoppingCriteriaImpl(iterations: OptimizationIteration[], config: StoppingConfig): Promise<StoppingDecision> {
    if (iterations.length === 0) {
      return {
        shouldStop: false,
        reason: 'No iterations completed yet',
        confidence: 1.0,
        recommendedAction: 'continue',
        metrics: this._getDefaultMetrics()
      };
    }

    const scores = iterations.map(iter => iter.actualScore);
    const latestScore = scores[scores.length - 1];

    // Check minimum iterations
    if (iterations.length < config.minIterations) {
      return {
        shouldStop: false,
        reason: `Minimum iterations not reached (${iterations.length}/${config.minIterations})`,
        confidence: 1.0,
        recommendedAction: 'continue',
        metrics: await this.detectConvergence(scores, config.convergenceThreshold)
      };
    }

    // Check maximum iterations
    if (iterations.length >= config.maxIterations) {
      return {
        shouldStop: true,
        reason: `Maximum iterations reached (${config.maxIterations})`,
        confidence: 1.0,
        recommendedAction: 'stop',
        metrics: await this.detectConvergence(scores, config.convergenceThreshold)
      };
    }

    // Check target score achievement
    if (latestScore >= config.targetScore) {
      return {
        shouldStop: true,
        reason: `Target score achieved (${latestScore.toFixed(3)} >= ${config.targetScore})`,
        confidence: 1.0,
        recommendedAction: 'stop',
        metrics: await this.detectConvergence(scores, config.convergenceThreshold)
      };
    }

    // Check convergence
    const convergenceMetrics = await this.detectConvergence(scores, config.convergenceThreshold);
    if (convergenceMetrics.scoreVariance < config.varianceThreshold && 
        convergenceMetrics.improvementRate < config.improvementThreshold) {
      return {
        shouldStop: true,
        reason: `Convergence detected (variance: ${convergenceMetrics.scoreVariance.toFixed(4)}, improvement: ${convergenceMetrics.improvementRate.toFixed(4)})`,
        confidence: convergenceMetrics.confidenceLevel,
        recommendedAction: convergenceMetrics.confidenceLevel > config.confidenceThreshold ? 'stop' : 'adjust_parameters',
        metrics: convergenceMetrics
      };
    }

    // Check plateau
    const plateauDetected = await this.detectPlateau(scores, config.plateauPatience);
    if (plateauDetected) {
      return {
        shouldStop: true,
        reason: `Plateau detected for ${config.plateauPatience} iterations`,
        confidence: 0.8,
        recommendedAction: 'adjust_parameters',
        metrics: convergenceMetrics
      };
    }

    // Continue optimization
    return {
      shouldStop: false,
      reason: 'Optimization should continue',
      confidence: 0.7,
      recommendedAction: 'continue',
      metrics: convergenceMetrics
    };
  }

  async _detectConvergenceImpl(scores: number[], threshold: number): Promise<ConvergenceMetrics> {
    if (scores.length < 3) {
      return this._getDefaultMetrics();
    }

    // Calculate variance in recent scores
    const recentScores = scores.slice(-Math.min(10, scores.length));
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const variance = recentScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / recentScores.length;

    // Calculate improvement rate
    const improvementRate = await this.calculateImprovementRate(scores, 5);

    // Detect trend direction
    const trendDirection = this._detectTrend(recentScores);

    // Calculate plateau length
    const plateauLength = this._calculatePlateauLength(scores, threshold);

    // Calculate confidence level
    const confidenceLevel = this._calculateConfidenceLevel(variance, improvementRate, scores.length);

    return {
      scoreVariance: variance,
      improvementRate,
      plateauLength,
      trendDirection,
      confidenceLevel
    };
  }

  async _calculateImprovementRateImpl(scores: number[], windowSize: number = 5): Promise<number> {
    if (scores.length < 2) return 0;

    const window = Math.min(windowSize, scores.length);
    const recentScores = scores.slice(-window);
    
    if (recentScores.length < 2) return 0;

    // Calculate average improvement per iteration
    let totalImprovement = 0;
    for (let i = 1; i < recentScores.length; i++) {
      totalImprovement += recentScores[i] - recentScores[i - 1];
    }

    return totalImprovement / (recentScores.length - 1);
  }

  async _detectPlateauImpl(scores: number[], patience: number): Promise<boolean> {
    if (scores.length < patience + 1) return false;

    const recentScores = scores.slice(-patience);
    const threshold = 0.01; // Minimum improvement threshold

    // Check if all recent improvements are below threshold
    for (let i = 1; i < recentScores.length; i++) {
      const improvement = recentScores[i] - recentScores[i - 1];
      if (Math.abs(improvement) > threshold) {
        return false;
      }
    }

    return true;
  }

  async _predictOptimalStoppingPointImpl(iterations: OptimizationIteration[]): Promise<number> {
    if (iterations.length < 5) return iterations.length + 10; // Default prediction

    const scores = iterations.map(iter => iter.actualScore);
    
    // Simple prediction based on improvement rate
    const improvementRate = await this.calculateImprovementRate(scores);
    
    if (improvementRate <= 0.001) {
      return iterations.length + 2; // Stop soon if no improvement
    }
    
    if (improvementRate > 0.1) {
      return iterations.length + 10; // Continue if improving rapidly
    }

    // Moderate improvement - predict based on trend
    return iterations.length + Math.ceil(5 / Math.max(improvementRate, 0.01));
  }

  private _getDefaultMetrics(): ConvergenceMetrics {
    return {
      scoreVariance: 1.0,
      improvementRate: 0.0,
      plateauLength: 0,
      trendDirection: 'stable',
      confidenceLevel: 0.0
    };
  }

  private _detectTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';

    const improvements = [];
    for (let i = 1; i < scores.length; i++) {
      improvements.push(scores[i] - scores[i - 1]);
    }

    const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;
    
    if (avgImprovement > 0.01) return 'improving';
    if (avgImprovement < -0.01) return 'declining';
    return 'stable';
  }

  private _calculatePlateauLength(scores: number[], threshold: number): number {
    if (scores.length < 2) return 0;

    let plateauLength = 0;
    for (let i = scores.length - 1; i > 0; i--) {
      const improvement = Math.abs(scores[i] - scores[i - 1]);
      if (improvement < threshold) {
        plateauLength++;
      } else {
        break;
      }
    }

    return plateauLength;
  }

  private _calculateConfidenceLevel(variance: number, improvementRate: number, sampleSize: number): number {
    // Simple confidence calculation based on variance, improvement rate, and sample size
    let confidence = 0.5; // Base confidence

    // Lower variance increases confidence
    confidence += Math.max(0, (0.1 - variance) * 2);

    // Stable improvement rate increases confidence
    confidence += Math.max(0, (0.05 - Math.abs(improvementRate)) * 4);

    // More samples increase confidence
    confidence += Math.min(0.3, sampleSize * 0.02);

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Create default stopping configuration
   */
  static createDefaultConfig(maxIterations: number = 20, targetScore: number = 8.5): StoppingConfig {
    return {
      convergenceThreshold: 0.1,
      plateauPatience: 5,
      minIterations: Math.max(3, Math.floor(maxIterations * 0.2)),
      maxIterations,
      targetScore,
      improvementThreshold: 0.01,
      varianceThreshold: 0.05,
      confidenceThreshold: 0.8
    };
  }
}
