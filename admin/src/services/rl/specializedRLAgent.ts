/**
 * Base Specialized RL Agent for Prompt Optimization
 * 
 * Extends the base RL agent with specialization for specific criteria.
 * Each specialized agent focuses on optimizing particular aspects of prompts.
 */

import { PromptRLAgent } from '../promptRLAgent.js';
import { PromptRLEnvironment } from '../promptRLEnvironment.js';
import { 
  RLAction, 
  RLState, 
  RLAgentConfig,
  PromptOptimizationSession,
  RLEpisode,
  PromptTemplate,
  PromptCriteria
} from '../../models/promptOptimization.js';
import type {
  SpecializedAgent,
  MultiCriteriaScores
} from '../../models/promptOptimizationEnhanced.js';

export interface SpecializedAgentConfig extends RLAgentConfig {
  specialization: {
    focusCriteria: keyof MultiCriteriaScores;
    specializationBonus: number;
    criteriaWeight: number;
    diversityPenalty: number;
  };
}

export interface SpecializedOptimizationResult {
  agentId: string;
  agentType: string;
  focusCriteria: string;
  bestPrompt: PromptTemplate;
  bestScore: number;
  criteriaScores: MultiCriteriaScores;
  confidence: number;
  iterations: number;
  convergenceReached: boolean;
  specializedInsights: {
    strengthAreas: string[];
    improvementAreas: string[];
    recommendations: string[];
  };
}

/**
 * Base class for specialized RL agents
 */
export abstract class SpecializedRLAgent extends PromptRLAgent {
  protected specialization: SpecializedAgentConfig['specialization'];
  protected agentType: string;
  protected agentId: string;

  constructor(
    config: SpecializedAgentConfig,
    agentType: string,
    agentId: string,
    weave: any
  ) {
    super(weave, config);
    this.specialization = config.specialization;
    this.agentType = agentType;
    this.agentId = agentId;
  }

  /**
   * Specialized action selection that considers focus criteria
   */
  async selectAction(state: RLState, availableActions: RLAction[]): Promise<RLAction> {
    const traceId = this.weave.startTrace('specialized_agent_select_action', {
      agentId: this.agentId,
      agentType: this.agentType,
      focusCriteria: this.specialization.focusCriteria,
      stateScore: state.performanceHistory.averageScore,
      availableActionsCount: availableActions.length
    });

    try {
      console.log(`🎯 ${this.agentType} Agent selecting action (focus: ${this.specialization.focusCriteria})`);

      await this.weave.logEvent('specialized_action_selection_started', {
        agentId: this.agentId,
        agentType: this.agentType,
        focusCriteria: this.specialization.focusCriteria,
        stateScore: state.performanceHistory.averageScore,
        availableActionsCount: availableActions.length
      });

      // Filter actions that are relevant to our specialization
      const relevantActions = this.filterRelevantActions(availableActions, state);

      // If no relevant actions, fall back to base selection
      const actionsToConsider = relevantActions.length > 0 ? relevantActions : availableActions;

      // Use base selection logic but with specialized scoring
      const selectedAction = await this.selectSpecializedAction(state, actionsToConsider);

      await this.weave.logEvent('specialized_action_selected', {
        agentId: this.agentId,
        actionType: selectedAction.type,
        actionDescription: selectedAction.description,
        relevantActionsCount: relevantActions.length,
        specializedSelection: relevantActions.length > 0
      });

      this.weave.endTrace(traceId, {
        selectedActionType: selectedAction.type,
        relevantActionsCount: relevantActions.length,
        specializedSelection: relevantActions.length > 0,
        success: true
      });

      return selectedAction;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Filter actions that are relevant to this agent's specialization
   */
  protected abstract filterRelevantActions(actions: RLAction[], state: RLState): RLAction[];

  /**
   * Select action with specialized scoring
   */
  protected async selectSpecializedAction(state: RLState, actions: RLAction[]): Promise<RLAction> {
    // Calculate specialized action scores
    const actionScores = actions.map(action => {
      const baseScore = Math.random(); // Simplified - would use policy network
      const specializationScore = this.calculateSpecializationScore(action, state);
      return baseScore + (specializationScore * this.specialization.criteriaWeight);
    });

    // Apply exploration vs exploitation
    const explorationUsed = Math.random() < this.explorationRate;
    
    let selectedIndex: number;
    if (explorationUsed) {
      selectedIndex = Math.floor(Math.random() * actions.length);
    } else {
      selectedIndex = this.argmax(actionScores);
    }

    return actions[selectedIndex];
  }

  /**
   * Calculate how well an action aligns with this agent's specialization
   */
  protected abstract calculateSpecializationScore(action: RLAction, state: RLState): number;

  /**
   * Run specialized optimization session
   */
  async runSpecializedOptimization(
    environment: PromptRLEnvironment,
    maxEpisodes: number = 30,
    basePrompt?: PromptTemplate,
    targetCriteria?: PromptCriteria[],
    contextQuery?: string
  ): Promise<SpecializedOptimizationResult> {
    const traceId = this.weave.startTrace('specialized_optimization_session', {
      agentId: this.agentId,
      agentType: this.agentType,
      focusCriteria: this.specialization.focusCriteria,
      maxEpisodes
    });

    try {
      console.log(`🚀 Starting ${this.agentType} specialized optimization (${maxEpisodes} episodes)`);

      await this.weave.logEvent('specialized_optimization_started', {
        agentId: this.agentId,
        agentType: this.agentType,
        focusCriteria: this.specialization.focusCriteria,
        maxEpisodes
      });

      // Run base optimization session
      const session = await this.runOptimizationSession(
        environment,
        maxEpisodes,
        basePrompt,
        targetCriteria,
        contextQuery
      );

      // Analyze results with specialization focus
      const finalState = environment.getCurrentState();
      const insights = await this.generateSpecializedInsights(session, finalState);

      const result: SpecializedOptimizationResult = {
        agentId: this.agentId,
        agentType: this.agentType,
        focusCriteria: this.specialization.focusCriteria,
        bestPrompt: finalState?.promptTemplate || basePrompt!,
        bestScore: session.bestScore,
        criteriaScores: this.extractCriteriaScores(finalState),
        confidence: this.calculateConfidence(session),
        iterations: session.episodes.length,
        convergenceReached: session.converged,
        specializedInsights: insights
      };

      await this.weave.logEvent('specialized_optimization_completed', {
        agentId: this.agentId,
        result: {
          bestScore: result.bestScore,
          confidence: result.confidence,
          iterations: result.iterations,
          convergenceReached: result.convergenceReached
        }
      });

      this.weave.endTrace(traceId, {
        bestScore: result.bestScore,
        confidence: result.confidence,
        iterations: result.iterations,
        convergenceReached: result.convergenceReached,
        success: true
      });

      return result;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Generate insights specific to this agent's specialization
   */
  protected abstract generateSpecializedInsights(
    session: PromptOptimizationSession,
    finalState: RLState | null
  ): Promise<SpecializedOptimizationResult['specializedInsights']>;

  /**
   * Extract criteria scores from state
   */
  protected extractCriteriaScores(state: RLState | null): MultiCriteriaScores {
    if (!state || state.recentEvaluations.length === 0) {
      return {
        relevance: 0,
        clarity: 0,
        completeness: 0,
        accuracy: 0,
        helpfulness: 0,
        engagement: 0
      };
    }

    const latestEvaluation = state.recentEvaluations[state.recentEvaluations.length - 1];
    return {
      relevance: latestEvaluation.criteriaScores['relevance'] || 0,
      clarity: latestEvaluation.criteriaScores['clarity'] || 0,
      completeness: latestEvaluation.criteriaScores['completeness'] || 0,
      accuracy: latestEvaluation.criteriaScores['accuracy'] || 0,
      helpfulness: latestEvaluation.criteriaScores['helpfulness'] || 0,
      engagement: latestEvaluation.criteriaScores['engagement'] || 0
    };
  }

  /**
   * Calculate confidence based on session performance
   */
  protected calculateConfidence(session: PromptOptimizationSession): number {
    if (session.episodes.length === 0) return 0;

    const scores = session.episodes.map(ep => ep.totalReward);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stability = Math.max(0, 1 - variance);
    
    // Confidence based on final score and stability
    const finalScore = session.bestScore / 10; // Normalize to 0-1
    return Math.min(1, (finalScore * 0.7) + (stability * 0.3));
  }

  /**
   * Get agent metadata
   */
  getAgentMetadata(): SpecializedAgent {
    return {
      id: this.agentId,
      name: `${this.agentType} Optimizer`,
      type: this.agentType as any,
      focusCriteria: this.specialization.focusCriteria,
      weight: 1.0,
      config: {
        explorationRate: this.explorationRate,
        learningRate: this.config.hyperparameters.learningRate,
        specializationBonus: this.specialization.specializationBonus
      }
    };
  }
}
