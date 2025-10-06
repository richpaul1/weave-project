/**
 * Helpfulness-Specialized RL Agent
 * 
 * Focuses on optimizing prompt helpfulness and practical value.
 * Prioritizes actions that make prompts more useful and actionable.
 */

import { SpecializedRLAgent, SpecializedAgentConfig, SpecializedOptimizationResult } from './specializedRLAgent.js';
import { 
  RLAction, 
  RLState,
  PromptOptimizationSession
} from '../../models/promptOptimization.js';

export class HelpfulnessAgent extends SpecializedRLAgent {
  constructor(config: SpecializedAgentConfig, weave: any) {
    super(config, 'helpfulness', 'helpfulness-agent', weave);
  }

  /**
   * Create default configuration for helpfulness agent
   */
  static createDefaultConfig(): SpecializedAgentConfig {
    return {
      algorithm: 'ppo',
      hyperparameters: {
        learningRate: 0.001,
        discountFactor: 0.95,
        explorationRate: 0.3,
        explorationDecay: 0.995,
        batchSize: 32,
        memorySize: 10000
      },
      networkArchitecture: {
        hiddenLayers: [64, 32, 16],
        activationFunction: 'relu',
        optimizer: 'adam'
      },
      trainingConfig: {
        episodesPerUpdate: 5,
        maxEpisodeLength: 8,
        convergenceThreshold: 0.85,
        evaluationFrequency: 10
      },
      specialization: {
        focusCriteria: 'helpfulness',
        specializationBonus: 0.35,
        criteriaWeight: 1.4,
        diversityPenalty: 0.1
      }
    };
  }

  /**
   * Filter actions relevant to helpfulness optimization
   */
  protected filterRelevantActions(actions: RLAction[], state: RLState): RLAction[] {
    const helpfulnessRelevantTypes = [
      'add_instruction',    // Add helpful guidance
      'modify_example',     // Make examples more practical
      'add_constraint',     // Add helpful constraints
      'change_format'       // Format for better usability
    ];

    return actions.filter(action => {
      // Check if action type is relevant to helpfulness
      if (!helpfulnessRelevantTypes.includes(action.type)) {
        return false;
      }

      // Check if action parameters suggest helpfulness improvement
      const description = action.description.toLowerCase();
      const helpfulnessKeywords = [
        'helpful', 'useful', 'practical', 'actionable', 'guidance',
        'assist', 'support', 'benefit', 'value', 'solve', 'solution',
        'tip', 'advice', 'recommend', 'suggest', 'improve', 'better'
      ];

      return helpfulnessKeywords.some(keyword => description.includes(keyword));
    });
  }

  /**
   * Calculate specialization score for helpfulness
   */
  protected calculateSpecializationScore(action: RLAction, state: RLState): number {
    let score = 0;

    // Base score by action type
    switch (action.type) {
      case 'add_instruction':
        score += 0.8; // Instructions can be very helpful
        break;
      case 'modify_example':
        score += 0.7; // Practical examples are helpful
        break;
      case 'add_constraint':
        score += 0.5; // Helpful constraints guide users
        break;
      case 'change_format':
        score += 0.6; // Better format improves usability
        break;
      default:
        score += 0.1; // Small bonus for any action
    }

    // Bonus for helpfulness-specific parameters
    const description = action.description.toLowerCase();
    
    if (description.includes('helpful') || description.includes('useful')) {
      score += 0.4;
    }
    if (description.includes('practical') || description.includes('actionable')) {
      score += 0.35;
    }
    if (description.includes('guidance') || description.includes('assist')) {
      score += 0.3;
    }
    if (description.includes('solution') || description.includes('solve')) {
      score += 0.25;
    }
    if (description.includes('tip') || description.includes('advice')) {
      score += 0.2;
    }
    if (description.includes('recommend') || description.includes('suggest')) {
      score += 0.2;
    }

    // Penalty for actions that might reduce helpfulness
    if (description.includes('vague') || description.includes('unclear')) {
      score -= 0.3;
    }
    if (description.includes('generic') || description.includes('abstract')) {
      score -= 0.2;
    }
    if (description.includes('theoretical') || description.includes('academic')) {
      score -= 0.15;
    }

    // Consider current helpfulness level
    const currentHelpfulnessScore = this.getCurrentHelpfulnessScore(state);
    if (currentHelpfulnessScore < 6.5) {
      score += 0.25; // Bonus when helpfulness is low
    }

    // Bonus for making prompts more actionable
    if (this.isPromptVague(state) && description.includes('specific')) {
      score += 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get current helpfulness score from state
   */
  private getCurrentHelpfulnessScore(state: RLState): number {
    if (state.recentEvaluations.length === 0) return 5.0;
    
    const latestEvaluation = state.recentEvaluations[state.recentEvaluations.length - 1];
    return latestEvaluation.criteriaScores['helpfulness'] || 5.0;
  }

  /**
   * Check if prompt appears vague or not actionable
   */
  private isPromptVague(state: RLState): boolean {
    // Defensive programming: check if prompt exists
    if (!state?.promptTemplate?.systemPrompt) {
      console.warn('⚠️ HelpfulnessAgent: Missing systemPrompt in state');
      return true; // Consider missing prompt as vague
    }

    const prompt = state.promptTemplate.systemPrompt.toLowerCase();
    
    // Check for vagueness indicators
    const vagueIndicators = [
      !prompt.includes('specific'),
      !prompt.includes('example'),
      prompt.includes('general') || prompt.includes('generic'),
      prompt.includes('anything') || prompt.includes('whatever'),
      prompt.split('should').length < 2, // No clear guidance
    ];

    return vagueIndicators.filter(Boolean).length >= 2;
  }

  /**
   * Generate helpfulness-specific insights
   */
  protected async generateSpecializedInsights(
    session: PromptOptimizationSession,
    finalState: RLState | null
  ): Promise<SpecializedOptimizationResult['specializedInsights']> {
    const insights = {
      strengthAreas: [] as string[],
      improvementAreas: [] as string[],
      recommendations: [] as string[]
    };

    if (!finalState || finalState.recentEvaluations.length === 0) {
      insights.improvementAreas.push('No evaluation data available for analysis');
      return insights;
    }

    const helpfulnessScore = this.getCurrentHelpfulnessScore(finalState);
    const overallScore = finalState.performanceHistory.averageScore;
    const prompt = finalState?.promptTemplate?.systemPrompt?.toLowerCase() || '';

    // Analyze helpfulness performance
    if (helpfulnessScore >= 8.5) {
      insights.strengthAreas.push('Excellent practical value and usefulness');
      insights.strengthAreas.push('Provides clear, actionable guidance');
    } else if (helpfulnessScore >= 7.0) {
      insights.strengthAreas.push('Good helpfulness with room for improvement');
      insights.improvementAreas.push('Could be more practical and actionable');
    } else {
      insights.improvementAreas.push('Limited practical value and helpfulness');
      insights.improvementAreas.push('Lacks clear guidance and actionable advice');
    }

    // Analyze prompt characteristics for helpfulness
    const hasSpecificGuidance = prompt.includes('specific') || prompt.includes('exactly');
    const hasActionableAdvice = prompt.includes('should') || prompt.includes('must') || prompt.includes('recommend');
    const hasPracticalExamples = prompt.includes('example') && (prompt.includes('practical') || prompt.includes('real'));
    const hasUserFocus = prompt.includes('user') || prompt.includes('help') || prompt.includes('assist');
    
    if (hasSpecificGuidance) {
      insights.strengthAreas.push('Provides specific, targeted guidance');
    } else {
      insights.improvementAreas.push('Lacks specific guidance and direction');
    }

    if (hasActionableAdvice) {
      insights.strengthAreas.push('Includes actionable recommendations');
    } else {
      insights.improvementAreas.push('Missing actionable advice and recommendations');
    }

    if (hasPracticalExamples) {
      insights.strengthAreas.push('Contains practical, real-world examples');
    } else {
      insights.improvementAreas.push('Needs more practical examples');
    }

    if (hasUserFocus) {
      insights.strengthAreas.push('User-focused and assistance-oriented');
    } else {
      insights.improvementAreas.push('Could be more user-focused');
    }

    // Analyze action patterns
    const helpfulnessActions = session.episodes.flatMap(ep => ep.actions)
      .filter(action => this.filterRelevantActions([action], finalState).length > 0);

    if (helpfulnessActions.length > 0) {
      const instructionActions = helpfulnessActions.filter(a => a.type === 'add_instruction').length;
      const exampleActions = helpfulnessActions.filter(a => a.type === 'modify_example').length;

      if (instructionActions > exampleActions) {
        insights.strengthAreas.push('Focused on adding helpful instructions');
      } else {
        insights.strengthAreas.push('Emphasized practical example improvements');
      }
    }

    // Generate recommendations
    if (helpfulnessScore < 7.5) {
      insights.recommendations.push('Add specific, actionable guidance for users');
      insights.recommendations.push('Include practical tips and recommendations');
      insights.recommendations.push('Focus on solving real user problems');
    }

    if (helpfulnessScore < 6.5) {
      insights.recommendations.push('Provide step-by-step instructions for common tasks');
      insights.recommendations.push('Add troubleshooting guidance and error handling');
      insights.recommendations.push('Include context about when and why to use advice');
    }

    if (!hasSpecificGuidance) {
      insights.recommendations.push('Replace vague instructions with specific guidance');
    }

    if (!hasPracticalExamples) {
      insights.recommendations.push('Add real-world examples that users can relate to');
    }

    if (this.isPromptVague(finalState)) {
      insights.recommendations.push('Make instructions more concrete and actionable');
    }

    // Performance-based recommendations
    if (overallScore > helpfulnessScore + 1.0) {
      insights.recommendations.push('Focus more on practical helpfulness while maintaining quality');
    }

    if (session.episodes.length > 20 && !session.converged) {
      insights.recommendations.push('Consider more user-focused, practical actions');
    }

    return insights;
  }

  /**
   * Get helpfulness-specific action suggestions
   */
  getHelpfulnessActionSuggestions(state: RLState): RLAction[] {
    const suggestions: RLAction[] = [];
    const currentHelpfulness = this.getCurrentHelpfulnessScore(state);
    const prompt = state?.promptTemplate?.systemPrompt?.toLowerCase() || '';

    if (currentHelpfulness < 6.5) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'practical_guidance', focus: 'actionable' },
        description: 'Add practical, actionable guidance for users'
      });

      suggestions.push({
        type: 'modify_example',
        parameters: { exampleType: 'practical', usefulness: 'high' },
        description: 'Modify examples to be more practical and useful'
      });
    }

    if (currentHelpfulness < 7.5) {
      suggestions.push({
        type: 'add_constraint',
        parameters: { constraintType: 'helpfulness', requirement: 'user_focused' },
        description: 'Add constraints ensuring user-focused, helpful responses'
      });
    }

    if (!prompt.includes('specific')) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'specific_guidance', position: 'beginning' },
        description: 'Add specific guidance instead of vague instructions'
      });
    }

    if (this.isPromptVague(state)) {
      suggestions.push({
        type: 'change_format',
        parameters: { formatType: 'actionable', structure: 'step_by_step' },
        description: 'Change format to be more actionable and step-by-step'
      });
    }

    if (!prompt.includes('help') && !prompt.includes('assist')) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'user_assistance', focus: 'helpful' },
        description: 'Add instructions emphasizing user assistance and helpfulness'
      });
    }

    return suggestions;
  }
}
