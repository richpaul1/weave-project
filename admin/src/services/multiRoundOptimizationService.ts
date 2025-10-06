/**
 * Multi-Round Optimization Strategy Service
 * 
 * Implements sophisticated multi-round optimization strategies with:
 * - Exploration phase: Broad search for promising directions
 * - Refinement phase: Focus on best candidates with targeted improvements
 * - Fine-tuning phase: Precise optimization of top performers
 */

import type {
  OptimizationRound,
  MultiRoundConfig,
  PromptOptimizationJob,
  OptimizationIteration
} from '../models/promptOptimizationEnhanced.js';

export interface RoundResult {
  roundNumber: number;
  strategy: string;
  iterationsCompleted: number;
  bestScore: number;
  convergenceReached: boolean;
  improvements: string[];
  executionTime: number;
  transferredKnowledge?: any;
}

export interface MultiRoundSession {
  sessionId: string;
  jobId: string;
  rounds: RoundResult[];
  globalBestScore: number;
  totalIterations: number;
  totalExecutionTime: number;
  status: 'running' | 'completed' | 'failed' | 'early_terminated';
  terminationReason?: string;
}

export class MultiRoundOptimizationService {
  private weave: any;

  constructor(weave: any) {
    this.weave = weave;

    // Bind methods directly (weave.op not available in our WeaveService)
    this.createMultiRoundStrategy = this._createMultiRoundStrategyImpl.bind(this);
    this.executeMultiRoundOptimization = this._executeMultiRoundOptimizationImpl.bind(this);
    this.generateOptimizationRounds = this._generateOptimizationRoundsImpl.bind(this);
    this.checkGlobalConvergence = this._checkGlobalConvergenceImpl.bind(this);
    this.transferKnowledgeBetweenRounds = this._transferKnowledgeBetweenRoundsImpl.bind(this);
  }

  // Public method interfaces
  createMultiRoundStrategy: (jobConfig: any) => Promise<MultiRoundConfig>;
  executeMultiRoundOptimization: (jobId: string, config: MultiRoundConfig) => Promise<MultiRoundSession>;
  generateOptimizationRounds: (strategy: string, totalIterations: number) => Promise<OptimizationRound[]>;
  checkGlobalConvergence: (session: MultiRoundSession) => Promise<boolean>;
  transferKnowledgeBetweenRounds: (fromRound: RoundResult, toRound: OptimizationRound) => Promise<OptimizationRound>;

  async _createMultiRoundStrategyImpl(jobConfig: any): Promise<MultiRoundConfig> {
    const traceId = this.weave.startTrace('multi_round_create_strategy', {
      maxIterations: jobConfig.maxIterations || 20,
      targetScore: jobConfig.targetScore || 8.5
    });

    try {
      const totalIterations = jobConfig.maxIterations || 20;
      const targetScore = jobConfig.targetScore || 8.5;

      await this.weave.logEvent('multi_round_strategy_creation_started', {
        totalIterations,
        targetScore,
        strategy: 'three_phase'
      });

      // Generate default 3-phase strategy
      const rounds = await this.generateOptimizationRounds('three_phase', totalIterations);

      const config: MultiRoundConfig = {
        rounds,
        globalTargetScore: Math.min(targetScore + 0.5, 10.0),
        maxTotalIterations: totalIterations,
        allowEarlyTermination: true,
        transferLearning: true,
        adaptiveRoundAdjustment: true,
        convergencePatience: 3
      };

      await this.weave.logEvent('multi_round_strategy_created', {
        roundsCount: config.rounds.length,
        globalTargetScore: config.globalTargetScore,
        maxTotalIterations: config.maxTotalIterations
      });

      this.weave.endTrace(traceId, {
        roundsCreated: config.rounds.length,
        globalTargetScore: config.globalTargetScore,
        success: true
      });

      return config;
    } catch (error) {
      this.weave.endTrace(traceId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async _executeMultiRoundOptimizationImpl(jobId: string, config: MultiRoundConfig): Promise<MultiRoundSession> {
    const traceId = this.weave.startTrace('multi_round_execute_optimization', {
      jobId,
      roundsCount: config.rounds.length,
      globalTargetScore: config.globalTargetScore
    });

    const sessionId = `multi_round_${jobId}_${Date.now()}`;
    const startTime = Date.now();

    const session: MultiRoundSession = {
      sessionId,
      jobId,
      rounds: [],
      globalBestScore: 0,
      totalIterations: 0,
      totalExecutionTime: 0,
      status: 'running'
    };

    try {

      await this.weave.logEvent('multi_round_session_started', {
        sessionId,
        jobId,
        roundsCount: config.rounds.length,
        globalTargetScore: config.globalTargetScore,
        maxTotalIterations: config.maxTotalIterations
      });

      for (let i = 0; i < config.rounds.length; i++) {
        const round = config.rounds[i];

        await this.weave.logEvent('round_started', {
          sessionId,
          roundNumber: i + 1,
          roundPhase: round.phase,
          targetIterations: round.iterations,
          explorationRate: round.explorationRate
        });

        // Apply knowledge transfer from previous round
        if (i > 0 && config.transferLearning) {
          const previousRound = session.rounds[i - 1];
          await this.transferKnowledgeBetweenRounds(previousRound, round);
        }

        // Execute round
        const roundResult = await this._executeRound(round, session);
        session.rounds.push(roundResult);

        // Update session metrics
        session.globalBestScore = Math.max(session.globalBestScore, roundResult.bestScore);
        session.totalIterations += roundResult.iterationsCompleted;

        await this.weave.logEvent('round_completed', {
          sessionId,
          roundNumber: i + 1,
          roundPhase: round.phase,
          iterationsCompleted: roundResult.iterationsCompleted,
          bestScore: roundResult.bestScore,
          scoreImprovement: roundResult.scoreImprovement,
          convergenceAchieved: roundResult.convergenceAchieved
        });

        await this.weave.logMetrics({
          round_best_score: roundResult.bestScore,
          round_iterations: roundResult.iterationsCompleted,
          round_score_improvement: roundResult.scoreImprovement,
          global_best_score: session.globalBestScore,
          total_iterations: session.totalIterations,
          sessionId,
          roundNumber: i + 1
        });

        // Check global stopping criteria
        if (config.allowEarlyTermination) {
          if (session.globalBestScore >= config.globalTargetScore) {
            session.status = 'early_terminated';
            session.terminationReason = 'global_target_reached';
            break;
          }

          if (await this.checkGlobalConvergence(session)) {
            session.status = 'early_terminated';
            session.terminationReason = 'global_convergence';
            break;
          }
        }
      }

      if (session.status === 'running') {
        session.status = 'completed';
      }

    } catch (error) {
      session.status = 'failed';
      throw error;
    } finally {
      session.totalExecutionTime = Date.now() - startTime;
    }

    return session;
  }

  async _generateOptimizationRoundsImpl(strategy: string, totalIterations: number): Promise<OptimizationRound[]> {
    switch (strategy) {
      case 'three_phase':
        return this._generateThreePhaseStrategy(totalIterations);
      case 'adaptive':
        return this._generateAdaptiveStrategy(totalIterations);
      case 'focused':
        return this._generateFocusedStrategy(totalIterations);
      default:
        return this._generateThreePhaseStrategy(totalIterations);
    }
  }

  private _generateThreePhaseStrategy(totalIterations: number): OptimizationRound[] {
    const explorationIterations = Math.ceil(totalIterations * 0.4);
    const refinementIterations = Math.ceil(totalIterations * 0.4);
    const finetuningIterations = totalIterations - explorationIterations - refinementIterations;

    return [
      {
        roundNumber: 1,
        strategy: 'exploration',
        maxIterations: explorationIterations,
        targetScore: 6.0,
        convergenceThreshold: 0.3,
        agentConfig: {
          explorationRate: 0.8,
          learningRate: 0.1,
          diversityBonus: 0.3
        }
      },
      {
        roundNumber: 2,
        strategy: 'refinement',
        maxIterations: refinementIterations,
        targetScore: 7.5,
        convergenceThreshold: 0.2,
        agentConfig: {
          explorationRate: 0.4,
          learningRate: 0.05,
          diversityBonus: 0.1
        }
      },
      {
        roundNumber: 3,
        strategy: 'fine_tuning',
        maxIterations: finetuningIterations,
        targetScore: 8.5,
        convergenceThreshold: 0.1,
        agentConfig: {
          explorationRate: 0.1,
          learningRate: 0.02,
          diversityBonus: 0.05
        }
      }
    ];
  }

  private _generateAdaptiveStrategy(totalIterations: number): OptimizationRound[] {
    // Adaptive strategy adjusts based on performance
    return [
      {
        roundNumber: 1,
        strategy: 'exploration',
        maxIterations: Math.ceil(totalIterations * 0.5),
        targetScore: 6.5,
        convergenceThreshold: 0.25,
        agentConfig: {
          explorationRate: 0.9,
          learningRate: 0.08,
          diversityBonus: 0.4
        }
      },
      {
        roundNumber: 2,
        strategy: 'refinement',
        maxIterations: Math.ceil(totalIterations * 0.5),
        targetScore: 8.0,
        convergenceThreshold: 0.15,
        agentConfig: {
          explorationRate: 0.3,
          learningRate: 0.04,
          diversityBonus: 0.1
        }
      }
    ];
  }

  private _generateFocusedStrategy(totalIterations: number): OptimizationRound[] {
    // Single focused round with balanced parameters
    return [
      {
        roundNumber: 1,
        strategy: 'refinement',
        maxIterations: totalIterations,
        targetScore: 8.0,
        convergenceThreshold: 0.2,
        agentConfig: {
          explorationRate: 0.5,
          learningRate: 0.06,
          diversityBonus: 0.2
        }
      }
    ];
  }

  private async _executeRound(round: OptimizationRound, session: MultiRoundSession): Promise<RoundResult> {
    const startTime = Date.now();
    
    // Simulate round execution (this would integrate with actual RL agents)
    const result: RoundResult = {
      roundNumber: round.roundNumber,
      strategy: round.strategy,
      iterationsCompleted: 0,
      bestScore: 0,
      convergenceReached: false,
      improvements: [],
      executionTime: 0
    };

    // This would be replaced with actual RL agent execution
    result.iterationsCompleted = Math.min(round.maxIterations, Math.ceil(Math.random() * round.maxIterations));
    result.bestScore = Math.min(round.targetScore + Math.random() * 1.5, 10.0);
    result.convergenceReached = Math.random() > 0.7;
    result.improvements = this._generateImprovements(round.strategy);
    result.executionTime = Date.now() - startTime;

    return result;
  }

  private _generateImprovements(strategy: string): string[] {
    const improvements = {
      exploration: [
        'Discovered new prompt patterns',
        'Identified effective instruction formats',
        'Found optimal context structures'
      ],
      refinement: [
        'Improved clarity and specificity',
        'Enhanced response accuracy',
        'Optimized instruction ordering'
      ],
      fine_tuning: [
        'Fine-tuned parameter weights',
        'Polished edge case handling',
        'Perfected response formatting'
      ]
    };

    return improvements[strategy as keyof typeof improvements] || [];
  }

  async _checkGlobalConvergenceImpl(session: MultiRoundSession): Promise<boolean> {
    if (session.rounds.length < 2) return false;

    const recentScores = session.rounds.slice(-3).map(r => r.bestScore);
    if (recentScores.length < 2) return false;

    // Check if improvement rate is below threshold
    const improvements = [];
    for (let i = 1; i < recentScores.length; i++) {
      improvements.push(recentScores[i] - recentScores[i - 1]);
    }

    const avgImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;
    return avgImprovement < 0.05; // Converged if improvement < 0.05 per round
  }

  async _transferKnowledgeBetweenRoundsImpl(fromRound: RoundResult, toRound: OptimizationRound): Promise<OptimizationRound> {
    // Adjust next round parameters based on previous round performance
    const adjustedRound = { ...toRound };

    if (fromRound.convergenceReached) {
      // If previous round converged, increase exploration in next round
      adjustedRound.agentConfig.explorationRate = Math.min(
        adjustedRound.agentConfig.explorationRate * 1.2,
        0.9
      );
    }

    if (fromRound.bestScore > fromRound.roundNumber * 2) {
      // If performing well, increase target score
      adjustedRound.targetScore = Math.min(adjustedRound.targetScore + 0.5, 10.0);
    }

    return adjustedRound;
  }
}
