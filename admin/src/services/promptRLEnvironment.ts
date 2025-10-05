/**
 * RL Environment for Prompt Optimization
 * 
 * This environment allows RL agents to interact with prompts,
 * apply modifications, and receive rewards based on performance.
 */

// Removed adminWeave import - now passed as constructor parameter
import { PromptEvaluationService } from './promptEvaluationService.js';
import {
  PromptTemplate,
  RLAction,
  RLState,
  PromptEvaluation,
  PromptCriteria,
  RLEpisode
} from '../models/promptOptimization.js';
import type {
  MultiCriteriaScores,
  OptimizationRound,
  RoundSpecificConfig
} from '../models/promptOptimizationEnhanced.js';

export class PromptRLEnvironment {
  private currentState: RLState | null = null;
  private episodeHistory: RLEpisode[] = [];
  private currentEpisode: Partial<RLEpisode> | null = null;
  private weave: any;
  private config: { maxSteps?: number };
  private currentRound: OptimizationRound | null = null;
  private multiCriteriaMode: boolean = false;
  private focusCriteria: string[] = [];

  constructor(
    private evaluationService: PromptEvaluationService,
    weave: any,
    config?: { maxSteps?: number }
  ) {
    this.weave = weave;
    this.config = config || {};
  }

  /**
   * Configure environment for multi-round optimization
   */
  configureForRound(round: OptimizationRound): void {
    this.currentRound = round;
    this.multiCriteriaMode = true;

    // Set focus criteria if specified
    if (round.focusCriteria && round.focusCriteria.length > 0) {
      this.focusCriteria = round.focusCriteria as string[];
    } else {
      this.focusCriteria = [];
    }

    console.log(`🎯 Environment configured for Round ${round.roundNumber} (${round.strategy})`);
    if (this.focusCriteria.length > 0) {
      console.log(`📊 Focus criteria: ${this.focusCriteria.join(', ')}`);
    }
  }

  /**
   * Enable multi-criteria evaluation mode
   */
  enableMultiCriteriaMode(focusCriteria?: string[]): void {
    this.multiCriteriaMode = true;
    this.focusCriteria = focusCriteria || [];
    console.log(`📊 Multi-criteria mode enabled${focusCriteria ? ` with focus on: ${focusCriteria.join(', ')}` : ''}`);
  }

  /**
   * Disable multi-criteria evaluation mode
   */
  disableMultiCriteriaMode(): void {
    this.multiCriteriaMode = false;
    this.focusCriteria = [];
    console.log(`📊 Multi-criteria mode disabled`);
  }

  /**
   * Reset environment with a new prompt and target criteria
   */
  async reset(
    basePrompt: PromptTemplate,
    targetCriteria: PromptCriteria[],
    contextQuery?: string
  ): Promise<RLState> {
    const traceId = this.weave.startTrace('rl_environment_reset', {
      promptId: basePrompt.id,
      promptName: basePrompt.name,
      criteriaCount: targetCriteria.length
    });

    try {
      console.log(`🔄 Resetting RL environment with prompt: ${basePrompt.name}`);

      await this.weave.logEvent('rl_environment_reset', {
        promptId: basePrompt.id,
        promptName: basePrompt.name,
        criteriaCount: targetCriteria.length,
        testQueriesCount: undefined,
        timestamp: new Date().toISOString()
      });

      // Clear episode history for fresh start
      this.episodeHistory = [];

      // Get recent evaluations for this prompt
      const recentEvaluations = await this.getRecentEvaluations(basePrompt.id);

      // Create initial state
      this.currentState = await this.evaluationService.createRLState(
        basePrompt,
        recentEvaluations,
        contextQuery || ''
      );

      // Initialize new episode
      this.currentEpisode = {
        id: `episode_${Date.now()}`,
        promptId: basePrompt.id,
        initialState: this.currentState,
        actions: [],
        rewards: [],
        timestamp: new Date().toISOString(),
        metadata: {
          agentVersion: '1.0.0',
          explorationRate: 0.1,
          learningRate: 0.001
        }
      };

      await this.weave.logMetrics({
        environment_reset_score: this.currentState.performanceHistory.averageScore,
        promptId: basePrompt.id,
        episodeId: this.currentEpisode.id
      });

      console.log(`✅ Environment reset complete. Initial score: ${this.currentState.performanceHistory.averageScore.toFixed(3)}`);

      this.weave.endTrace(traceId, {
        initialScore: this.currentState.performanceHistory.averageScore,
        episodeId: this.currentEpisode.id,
        evaluationsCount: recentEvaluations.length
      });

      return this.currentState;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Apply an action to the current prompt and return new state + reward
   */
  async step(action: RLAction): Promise<{
    nextState: RLState;
    reward: number;
    done: boolean;
    info: Record<string, any>;
  }> {
    const traceId = this.weave.startTrace('rl_environment_step', {
      actionType: action.type,
      actionDescription: action.description,
      currentScore: this.currentState?.performanceHistory.averageScore,
      episodeLength: this.currentEpisode?.actions?.length || 0
    });

    try {
      if (!this.currentState || !this.currentEpisode) {
        throw new Error('Environment not initialized. Call reset() first.');
      }

      console.log(`🎯 Applying RL action: ${action.type} - ${action.description}`);

      await this.weave.logEvent('rl_action_applied', {
        actionType: action.type,
        actionDescription: action.description,
        promptId: this.currentState.promptTemplate.id,
        episodeId: this.currentEpisode.id,
        stepNumber: this.currentEpisode.actions?.length || 0
      });

      // Apply action to create modified prompt
      const modifiedPrompt = await this.applyAction(this.currentState.promptTemplate, action);

      // Evaluate modified prompt
      const testQueries = [this.currentState.contextQuery || 'test query'];
      const evaluations = await this.evaluationService.evaluatePrompt(
        modifiedPrompt,
        testQueries,
        this.currentState.targetCriteria
      );

      // Calculate reward
      const reward = await this.calculateReward(
        this.currentState,
        evaluations,
        action
      );

      // Create next state
      const nextState = await this.evaluationService.createRLState(
        modifiedPrompt,
        [...this.currentState.recentEvaluations, ...evaluations],
        this.currentState.contextQuery
      );

      // Update episode
      this.currentEpisode.actions!.push(action);
      this.currentEpisode.rewards!.push(reward);

      // Check if episode is done
      const stepCount = this.currentEpisode.actions!.length;
      const done = this.isEpisodeDone(nextState, stepCount);

      // Determine termination reason
      let terminationReason = '';
      if (done) {
        if (stepCount >= 10) {
          terminationReason = 'max_steps';
        } else if (nextState.performanceHistory.averageScore >= 0.95) {
          terminationReason = 'convergence';
        } else if (nextState.performanceHistory.trendDirection === 'declining' && stepCount > 5) {
          terminationReason = 'declining_performance';
        }
        await this.finalizeEpisode(nextState);
      }

      // Update current state
      this.currentState = nextState;

      const info = {
        evaluationsCount: evaluations.length,
        averageScore: evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length,
        actionType: action.type,
        stepNumber: stepCount,
        traceUrl: this.weave.getCurrentTraceUrl(),
        ...(done && { terminationReason })
      };

      await this.weave.logMetrics({
        rl_step_reward: reward,
        promptId: modifiedPrompt.id,
        actionType: action.type,
        stepNumber: this.currentEpisode.actions!.length,
        episodeId: this.currentEpisode.id
      });

      console.log(`📊 Step completed. Reward: ${reward.toFixed(3)}, Done: ${done}`);

      this.weave.endTrace(traceId, {
        reward,
        newScore: nextState.performanceHistory.averageScore,
        done,
        improvement: reward > 0,
        episodeLength: stepCount,
        terminationReason: done ? terminationReason : undefined
      });

      return { nextState, reward, done, info };
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Apply an RL action to modify a prompt
   */
  private async applyAction(prompt: PromptTemplate, action: RLAction): Promise<PromptTemplate> {
    const traceId = this.weave.startTrace(`apply_action_${action.type}`, {
      originalPromptId: prompt.id,
      actionType: action.type,
      actionParameters: action.parameters
    });

    try {
      console.log(`🔧 Applying action: ${action.type}`);

      const modifiedPrompt: PromptTemplate = {
        ...prompt,
        id: `${prompt.id}_modified_${Date.now()}`,
        version: prompt.version + 1,
        updatedAt: new Date().toISOString(),
        parentId: prompt.id
      };

      switch (action.type) {
        case 'add_instruction':
          modifiedPrompt.systemPrompt += `\n\n${action.parameters.instruction}`;
          break;

        case 'modify_example':
          if (action.parameters.exampleIndex < modifiedPrompt.examples.length) {
            modifiedPrompt.examples[action.parameters.exampleIndex].expectedOutput = action.parameters.newOutput;
          }
          break;

        case 'change_format':
          modifiedPrompt.metadata.format = action.parameters.format;
          modifiedPrompt.systemPrompt += `\n\nFormat your response as: ${action.parameters.format}`;
          break;

        case 'adjust_tone':
          modifiedPrompt.metadata.tone = action.parameters.tone;
          modifiedPrompt.systemPrompt += `\n\nUse a ${action.parameters.tone} tone in your response.`;
          break;

        case 'add_constraint':
          modifiedPrompt.systemPrompt += `\n\nConstraint: ${action.parameters.constraint}`;
          break;

        case 'remove_constraint':
          // Simple implementation: remove lines containing the constraint
          const lines = modifiedPrompt.systemPrompt.split('\n');
          modifiedPrompt.systemPrompt = lines
            .filter(line => !line.toLowerCase().includes(action.parameters.constraint.toLowerCase()))
            .join('\n');
          break;

        default:
          console.warn(`Unknown action type: ${action.type}`);
      }

      await this.weave.logEvent('prompt_modified', {
        originalPromptId: prompt.id,
        modifiedPromptId: modifiedPrompt.id,
        actionType: action.type,
        actionParameters: action.parameters
      });

      this.weave.endTrace(traceId, {
        modifiedPromptId: modifiedPrompt.id,
        actionApplied: action.type,
        success: true
      });

      return modifiedPrompt;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Calculate reward based on evaluation results and action taken
   * Enhanced for multi-criteria evaluation and round-specific strategies
   */
  private async calculateReward(
    previousState: RLState,
    evaluations: PromptEvaluation[],
    action: RLAction
  ): Promise<number> {
    const traceId = this.weave.startTrace('calculate_rl_reward', {
      actionType: action.type,
      multiCriteriaMode: this.multiCriteriaMode,
      currentRound: this.currentRound?.roundNumber,
      roundStrategy: this.currentRound?.strategy,
      evaluationsCount: evaluations.length
    });

    try {
      let reward = 0;

      if (this.multiCriteriaMode) {
        reward = await this.calculateMultiCriteriaReward(previousState, evaluations, action);
      } else {
        reward = await this.calculateStandardReward(previousState, evaluations, action);
      }

      // Apply round-specific adjustments
      if (this.currentRound) {
        reward = this.applyRoundSpecificAdjustments(reward, action);
      }

      // Normalize reward to [-1, 1] range
      reward = Math.max(-1, Math.min(1, reward));

      await this.weave.logEvent('reward_calculated', {
        totalReward: reward,
        multiCriteriaMode: this.multiCriteriaMode,
        currentRound: this.currentRound?.roundNumber,
        roundStrategy: this.currentRound?.strategy,
        focusCriteria: this.focusCriteria
      });

      this.weave.endTrace(traceId, {
        reward,
        multiCriteriaMode: this.multiCriteriaMode,
        roundStrategy: this.currentRound?.strategy,
        success: true
      });

      return reward;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Calculate reward using multi-criteria evaluation
   */
  private async calculateMultiCriteriaReward(
    previousState: RLState,
    evaluations: PromptEvaluation[],
    action: RLAction
  ): Promise<number> {
    // Extract multi-criteria scores from evaluations
    const currentScores = this.extractMultiCriteriaScores(evaluations);
    const previousScores = this.extractMultiCriteriaScores(previousState.recentEvaluations);

    let totalReward = 0;
    let criteriaCount = 0;

    // Calculate improvement for each criterion
    const criteriaWeights = this.getCriteriaWeights();

    for (const [criterion, weight] of Object.entries(criteriaWeights)) {
      const currentScore = currentScores[criterion] || 0;
      const previousScore = previousScores[criterion] || 0;
      const improvement = currentScore - previousScore;

      // Apply focus bonus if this criterion is in focus
      const focusMultiplier = this.focusCriteria.includes(criterion) ? 2.0 : 1.0;

      const criterionReward = improvement * weight * focusMultiplier;
      totalReward += criterionReward;
      criteriaCount++;
    }

    // Average the reward across criteria
    if (criteriaCount > 0) {
      totalReward /= criteriaCount;
    }

    // Scale reward
    totalReward *= 10;

    // Add strategy-specific bonuses
    totalReward += this.calculateStrategySpecificBonus(currentScores, action);

    return totalReward;
  }

  /**
   * Calculate standard single-score reward
   */
  private async calculateStandardReward(
    previousState: RLState,
    evaluations: PromptEvaluation[],
    action: RLAction
  ): Promise<number> {
    const currentScore = evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length;
    const previousScore = previousState.performanceHistory.averageScore;

    // Base reward: improvement in score
    let reward = (currentScore - previousScore) * 10;

    // Bonus for meeting specific criteria
    const criteriaBonus = this.calculateCriteriaBonus(evaluations, previousState.targetCriteria);
    reward += criteriaBonus;

    // Penalty for making responses too long or too short
    const lengthPenalty = this.calculateLengthPenalty(evaluations);
    reward -= lengthPenalty;

    // Bonus for consistency across test queries
    const consistencyBonus = this.calculateConsistencyBonus(evaluations);
    reward += consistencyBonus;

    // Action-specific adjustments
    const actionAdjustment = this.calculateActionAdjustment(action, currentScore);
    reward += actionAdjustment;

    return reward;
  }

  /**
   * Extract multi-criteria scores from evaluations
   */
  private extractMultiCriteriaScores(evaluations: PromptEvaluation[]): Record<string, number> {
    const scores: Record<string, number> = {};

    if (evaluations.length === 0) return scores;

    // Aggregate scores across evaluations
    for (const evaluation of evaluations) {
      for (const [criterion, score] of Object.entries(evaluation.criteriaScores)) {
        if (!scores[criterion]) {
          scores[criterion] = 0;
        }
        scores[criterion] += score;
      }
    }

    // Average the scores
    for (const criterion in scores) {
      scores[criterion] /= evaluations.length;
    }

    return scores;
  }

  /**
   * Get criteria weights based on current round strategy
   */
  private getCriteriaWeights(): Record<string, number> {
    const defaultWeights = {
      relevance: 1.0,
      clarity: 1.0,
      completeness: 1.0,
      accuracy: 1.0,
      helpfulness: 1.0,
      engagement: 1.0
    };

    if (!this.currentRound) return defaultWeights;

    // Adjust weights based on round strategy
    switch (this.currentRound.strategy) {
      case 'exploration':
        return {
          ...defaultWeights,
          relevance: 1.5,
          completeness: 1.3,
          clarity: 0.8
        };
      case 'refinement':
        return {
          ...defaultWeights,
          clarity: 1.5,
          accuracy: 1.4,
          helpfulness: 1.2
        };
      case 'fine_tuning':
        return {
          ...defaultWeights,
          accuracy: 1.6,
          engagement: 1.3,
          helpfulness: 1.4
        };
      default:
        return defaultWeights;
    }
  }

  /**
   * Calculate strategy-specific bonus
   */
  private calculateStrategySpecificBonus(scores: Record<string, number>, action: RLAction): number {
    if (!this.currentRound) return 0;

    let bonus = 0;

    switch (this.currentRound.strategy) {
      case 'exploration':
        // Bonus for diversity and trying new approaches
        if (action.type === 'add_instruction' || action.type === 'change_format') {
          bonus += 0.1;
        }
        break;
      case 'refinement':
        // Bonus for improving clarity and accuracy
        if (scores.clarity > 7.0 && scores.accuracy > 7.0) {
          bonus += 0.15;
        }
        break;
      case 'fine_tuning':
        // Bonus for high overall performance
        const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
        if (avgScore > 8.0) {
          bonus += 0.2;
        }
        break;
    }

    return bonus;
  }

  /**
   * Apply round-specific reward adjustments
   */
  private applyRoundSpecificAdjustments(reward: number, action: RLAction): number {
    if (!this.currentRound) return reward;

    const config = this.currentRound.agentConfig;

    // Apply diversity bonus during exploration
    if (this.currentRound.strategy === 'exploration') {
      reward += config.diversityBonus * 0.1;
    }

    // Reduce reward volatility during fine-tuning
    if (this.currentRound.strategy === 'fine_tuning') {
      reward *= 0.8; // More conservative rewards
    }

    return reward;
  }

  private calculateCriteriaBonus(evaluations: PromptEvaluation[], criteria: PromptCriteria[]): number {
    let bonus = 0;

    // Defensive programming: ensure criteria is iterable
    if (!Array.isArray(criteria) || criteria.length === 0) {
      console.warn('⚠️ PromptRLEnvironment: Invalid criteria array in calculateCriteriaBonus');
      return 0;
    }

    for (const criterion of criteria) {
      const avgScore = evaluations.reduce((sum, evalRecord) =>
        sum + (evalRecord.criteriaScores[criterion.id] || 0), 0
      ) / evaluations.length;

      // Bonus for exceeding threshold
      if (avgScore > 0.8) {
        bonus += criterion.weight * 0.1;
      }
    }

    return bonus;
  }

  private calculateLengthPenalty(evaluations: PromptEvaluation[]): number {
    const avgTokens = evaluations.reduce((sum, evalRecord) => sum + evalRecord.metadata.tokenCount, 0) / evaluations.length;
    
    // Penalty for responses that are too long (>500 tokens) or too short (<50 tokens)
    if (avgTokens > 500) return (avgTokens - 500) / 1000; // Max penalty 0.5
    if (avgTokens < 50) return (50 - avgTokens) / 100; // Max penalty 0.5
    
    return 0;
  }

  private calculateConsistencyBonus(evaluations: PromptEvaluation[]): number {
    if (evaluations.length < 2) return 0;
    
    const scores = evaluations.map(e => e.overallScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Bonus for low variance (consistent performance)
    return Math.max(0, (0.2 - stdDev) * 0.5);
  }

  private calculateActionAdjustment(action: RLAction, currentScore: number): number {
    // Encourage certain actions when score is high
    if (currentScore > 0.8) {
      if (action.type === 'add_constraint' || action.type === 'change_format') {
        return 0.05; // Small bonus for refinement actions
      }
    }
    
    // Encourage exploration when score is low
    if (currentScore < 0.6) {
      if (action.type === 'add_instruction' || action.type === 'adjust_tone') {
        return 0.05; // Small bonus for major changes
      }
    }
    
    return 0;
  }

  /**
   * Check if episode should end
   */
  private isEpisodeDone(state: RLState, stepCount: number): boolean {
    const maxSteps = this.config.maxSteps || 10;
    const convergenceThreshold = 0.95;

    // End if max steps reached
    if (stepCount >= maxSteps) return true;
    
    // End if performance is very high
    if (state.performanceHistory.averageScore >= convergenceThreshold) return true;
    
    // End if performance is declining consistently
    if (state.performanceHistory.trendDirection === 'declining' && stepCount > 5) return true;
    
    return false;
  }

  /**
   * Finalize current episode
   */
  private async finalizeEpisode(finalState: RLState): Promise<void> {
    const traceId = this.weave.startTrace('finalize_rl_episode', {
      episodeId: this.currentEpisode?.id,
      finalScore: finalState.performanceHistory.averageScore,
      promptId: finalState.promptTemplate.id
    });

    try {
      if (!this.currentEpisode) return;

      const totalReward = this.currentEpisode.rewards!.reduce((sum, r) => sum + r, 0);

      const completedEpisode: RLEpisode = {
        ...this.currentEpisode as RLEpisode,
        finalState,
        totalReward,
        episodeLength: this.currentEpisode.actions!.length
      };

      this.episodeHistory.push(completedEpisode);

      await this.weave.logEvent('rl_episode_completed', {
        episodeId: completedEpisode.id,
        totalReward,
        episodeLength: completedEpisode.episodeLength,
        finalScore: finalState.performanceHistory.averageScore,
        promptId: finalState.promptTemplate.id
      });

      await this.weave.logMetrics({
        episode_total_reward: totalReward,
        episodeId: completedEpisode.id,
        episodeLength: completedEpisode.episodeLength
      });

      console.log(`🏁 Episode completed. Total reward: ${totalReward.toFixed(3)}, Steps: ${completedEpisode.episodeLength}`);

      this.weave.endTrace(traceId, {
        totalReward,
        episodeLength: completedEpisode.episodeLength,
        finalScore: finalState.performanceHistory.averageScore,
        success: true
      });
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get recent evaluations for a prompt (mock implementation)
   */
  private async getRecentEvaluations(promptId: string): Promise<PromptEvaluation[]> {
    // Mock implementation - in real system, this would query the database
    return [];
  }

  /**
   * Start a new episode
   */
  async startNewEpisode(): Promise<void> {
    if (!this.currentState) {
      throw new Error('Environment not initialized. Call reset() first.');
    }

    // Initialize new episode
    this.currentEpisode = {
      id: `episode_${Date.now()}`,
      promptId: this.currentState.promptTemplate.id,
      initialState: this.currentState,
      actions: [],
      rewards: [],
      timestamp: new Date().toISOString(),
      metadata: {
        agentVersion: '1.0.0',
        explorationRate: 0.1,
        learningRate: 0.001
      }
    };

    await this.weave.logEvent('rl_episode_started', {
      episodeId: this.currentEpisode.id,
      promptId: this.currentState.promptTemplate.id,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get episode history
   */
  getEpisodeHistory(): RLEpisode[] {
    return [...this.episodeHistory];
  }

  /**
   * Get current state
   */
  getCurrentState(): RLState | null {
    return this.currentState;
  }

  /**
   * Get available actions for current state
   */
  getAvailableActions(): RLAction[] {
    const actions: RLAction[] = [
      {
        type: 'add_instruction',
        parameters: { instruction: 'Always include relevant examples in your response.' },
        description: 'Add instruction to include examples'
      },
      {
        type: 'add_instruction',
        parameters: { instruction: 'Provide step-by-step guidance when applicable.' },
        description: 'Add instruction for step-by-step guidance'
      },
      {
        type: 'change_format',
        parameters: { format: 'bullet_points' },
        description: 'Change response format to bullet points'
      },
      {
        type: 'change_format',
        parameters: { format: 'numbered' },
        description: 'Change response format to numbered list'
      },
      {
        type: 'adjust_tone',
        parameters: { tone: 'professional' },
        description: 'Adjust tone to be more professional'
      },
      {
        type: 'adjust_tone',
        parameters: { tone: 'friendly' },
        description: 'Adjust tone to be more friendly'
      },
      {
        type: 'add_constraint',
        parameters: { constraint: 'Keep responses under 200 words.' },
        description: 'Add length constraint'
      },
      {
        type: 'add_constraint',
        parameters: { constraint: 'Include at least one actionable recommendation.' },
        description: 'Add actionability constraint'
      }
    ];
    
    return actions;
  }
}
