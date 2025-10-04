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

export class PromptRLEnvironment {
  private currentState: RLState | null = null;
  private episodeHistory: RLEpisode[] = [];
  private currentEpisode: Partial<RLEpisode> | null = null;
  private weave: any;
  private config: { maxSteps?: number };

  constructor(
    private evaluationService: PromptEvaluationService,
    weave: any,
    config?: { maxSteps?: number }
  ) {
    this.weave = weave;
    this.config = config || {};
  }

  /**
   * Reset environment with a new prompt and target criteria
   */
  async reset(
    basePrompt: PromptTemplate,
    targetCriteria: PromptCriteria[],
    contextQuery?: string
  ): Promise<RLState> {
    return await this.weave.createChildTrace('rl_environment_reset', async () => {
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

      await this.weave.logMetric('environment_reset_score', this.currentState.performanceHistory.averageScore, {
        promptId: basePrompt.id,
        episodeId: this.currentEpisode.id
      });

      console.log(`✅ Environment reset complete. Initial score: ${this.currentState.performanceHistory.averageScore.toFixed(3)}`);
      
      return this.currentState;
    });
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
    return await this.weave.createChildTrace('rl_environment_step', async () => {
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

      await this.weave.logMetric('rl_step_reward', reward, {
        promptId: modifiedPrompt.id,
        actionType: action.type,
        stepNumber: this.currentEpisode.actions!.length,
        episodeId: this.currentEpisode.id
      });

      console.log(`📊 Step completed. Reward: ${reward.toFixed(3)}, Done: ${done}`);

      return { nextState, reward, done, info };
    });
  }

  /**
   * Apply an RL action to modify a prompt
   */
  private async applyAction(prompt: PromptTemplate, action: RLAction): Promise<PromptTemplate> {
    return await this.weave.createChildTrace(`apply_action_${action.type}`, async () => {
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

      return modifiedPrompt;
    });
  }

  /**
   * Calculate reward based on evaluation results and action taken
   */
  private async calculateReward(
    previousState: RLState,
    evaluations: PromptEvaluation[],
    action: RLAction
  ): Promise<number> {
    return await this.weave.createChildTrace('calculate_rl_reward', async () => {
      const currentScore = evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length;
      const previousScore = previousState.performanceHistory.averageScore;
      
      // Base reward: improvement in score
      let reward = (currentScore - previousScore) * 10; // Scale to make rewards more significant
      
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
      
      // Normalize reward to [-1, 1] range
      reward = Math.max(-1, Math.min(1, reward));
      
      await this.weave.logEvent('reward_calculated', {
        totalReward: reward,
        scoreImprovement: currentScore - previousScore,
        criteriaBonus,
        lengthPenalty,
        consistencyBonus,
        actionAdjustment,
        currentScore,
        previousScore
      });
      
      return reward;
    });
  }

  private calculateCriteriaBonus(evaluations: PromptEvaluation[], criteria: PromptCriteria[]): number {
    let bonus = 0;

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
    return await this.weave.createChildTrace('finalize_rl_episode', async () => {
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
      
      await this.weave.logMetric('episode_total_reward', totalReward, {
        episodeId: completedEpisode.id,
        episodeLength: completedEpisode.episodeLength
      });
      
      console.log(`🏁 Episode completed. Total reward: ${totalReward.toFixed(3)}, Steps: ${completedEpisode.episodeLength}`);
    });
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
