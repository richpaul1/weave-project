/**
 * Clarity-Specialized RL Agent
 * 
 * Focuses on optimizing prompt clarity, readability, and comprehensibility.
 * Prioritizes actions that make prompts clearer and easier to understand.
 */

import { SpecializedRLAgent, SpecializedAgentConfig, SpecializedOptimizationResult } from './specializedRLAgent.js';
import { 
  RLAction, 
  RLState,
  PromptOptimizationSession
} from '../../models/promptOptimization.js';

export class ClarityAgent extends SpecializedRLAgent {
  constructor(config: SpecializedAgentConfig, weave: any) {
    super(config, 'clarity', 'clarity-agent', weave);
  }

  /**
   * Create default configuration for clarity agent
   */
  static createDefaultConfig(): SpecializedAgentConfig {
    return {
      algorithm: 'ppo',
      hyperparameters: {
        learningRate: 0.001,
        discountFactor: 0.95,
        explorationRate: 0.2,
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
        focusCriteria: 'clarity',
        specializationBonus: 0.3,
        criteriaWeight: 1.5,
        diversityPenalty: 0.1
      }
    };
  }

  /**
   * Filter actions relevant to clarity optimization
   */
  protected filterRelevantActions(actions: RLAction[], state: RLState): RLAction[] {
    const clarityRelevantTypes = [
      'add_instruction',    // Add clarifying instructions
      'change_format',      // Improve structure and formatting
      'modify_example',     // Make examples clearer
      'add_constraint'      // Add constraints for clarity
    ];

    return actions.filter(action => {
      // Check if action type is relevant to clarity
      if (!clarityRelevantTypes.includes(action.type)) {
        return false;
      }

      // Check if action parameters suggest clarity improvement
      const description = action.description.toLowerCase();
      const clarityKeywords = [
        'clear', 'clarify', 'explain', 'structure', 'organize',
        'format', 'readable', 'understand', 'simple', 'concise',
        'step-by-step', 'bullet', 'numbered', 'section', 'heading'
      ];

      return clarityKeywords.some(keyword => description.includes(keyword));
    });
  }

  /**
   * Calculate specialization score for clarity
   */
  protected calculateSpecializationScore(action: RLAction, state: RLState): number {
    let score = 0;

    // Base score by action type
    switch (action.type) {
      case 'change_format':
        score += 0.8; // Formatting greatly improves clarity
        break;
      case 'add_instruction':
        score += 0.6; // Instructions can clarify expectations
        break;
      case 'modify_example':
        score += 0.5; // Better examples improve understanding
        break;
      case 'add_constraint':
        score += 0.4; // Constraints can provide clarity
        break;
      default:
        score += 0.1; // Small bonus for any action
    }

    // Bonus for clarity-specific parameters
    const description = action.description.toLowerCase();
    
    if (description.includes('structure') || description.includes('format')) {
      score += 0.3;
    }
    if (description.includes('step-by-step') || description.includes('numbered')) {
      score += 0.25;
    }
    if (description.includes('clear') || description.includes('clarify')) {
      score += 0.2;
    }
    if (description.includes('simple') || description.includes('concise')) {
      score += 0.15;
    }

    // Penalty for actions that might reduce clarity
    if (description.includes('complex') || description.includes('advanced')) {
      score -= 0.2;
    }
    if (description.includes('technical') || description.includes('jargon')) {
      score -= 0.15;
    }

    // Consider current clarity level
    const currentClarityScore = this.getCurrentClarityScore(state);
    if (currentClarityScore < 6.0) {
      score += 0.2; // Bonus when clarity is low
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get current clarity score from state
   */
  private getCurrentClarityScore(state: RLState): number {
    if (state.recentEvaluations.length === 0) return 5.0;
    
    const latestEvaluation = state.recentEvaluations[state.recentEvaluations.length - 1];
    return latestEvaluation.criteriaScores['clarity'] || 5.0;
  }

  /**
   * Generate clarity-specific insights
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

    const clarityScore = this.getCurrentClarityScore(finalState);
    const overallScore = finalState.performanceHistory.averageScore;

    // Analyze clarity performance
    if (clarityScore >= 8.0) {
      insights.strengthAreas.push('Excellent clarity and readability');
      insights.strengthAreas.push('Well-structured and easy to understand');
    } else if (clarityScore >= 6.5) {
      insights.strengthAreas.push('Good clarity with room for improvement');
      insights.improvementAreas.push('Could benefit from better structure');
    } else {
      insights.improvementAreas.push('Clarity needs significant improvement');
      insights.improvementAreas.push('Prompt may be confusing or unclear');
    }

    // Analyze action patterns
    const clarityActions = session.episodes.flatMap(ep => ep.actions)
      .filter(action => this.filterRelevantActions([action], finalState).length > 0);

    if (clarityActions.length > 0) {
      const formatActions = clarityActions.filter(a => a.type === 'change_format').length;
      const instructionActions = clarityActions.filter(a => a.type === 'add_instruction').length;

      if (formatActions > instructionActions) {
        insights.strengthAreas.push('Focused on structural improvements');
      } else {
        insights.strengthAreas.push('Emphasized instructional clarity');
      }
    }

    // Generate recommendations
    if (clarityScore < 7.0) {
      insights.recommendations.push('Add clear step-by-step instructions');
      insights.recommendations.push('Use bullet points or numbered lists for structure');
      insights.recommendations.push('Simplify complex language and technical terms');
    }

    if (clarityScore < 6.0) {
      insights.recommendations.push('Break down complex requests into smaller parts');
      insights.recommendations.push('Add examples to illustrate expected responses');
      insights.recommendations.push('Use clear section headings and formatting');
    }

    // Performance-based recommendations
    if (overallScore > clarityScore + 1.0) {
      insights.recommendations.push('Focus more on clarity while maintaining other strengths');
    }

    if (session.episodes.length > 20 && !session.converged) {
      insights.recommendations.push('Consider more aggressive clarity-focused actions');
    }

    return insights;
  }

  /**
   * Get clarity-specific action suggestions
   */
  getClarityActionSuggestions(state: RLState): RLAction[] {
    const suggestions: RLAction[] = [];
    const currentClarity = this.getCurrentClarityScore(state);

    if (currentClarity < 6.0) {
      suggestions.push({
        type: 'change_format',
        parameters: { formatType: 'structured', addBullets: true },
        description: 'Add bullet points and clear structure for better readability'
      });

      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'clarification', position: 'beginning' },
        description: 'Add clear instructions at the beginning to set expectations'
      });
    }

    if (currentClarity < 7.0) {
      suggestions.push({
        type: 'modify_example',
        parameters: { exampleType: 'step_by_step', clarity: 'high' },
        description: 'Modify examples to be more step-by-step and clear'
      });

      suggestions.push({
        type: 'add_constraint',
        parameters: { constraintType: 'format', requirement: 'clear_sections' },
        description: 'Add constraint for clear section organization'
      });
    }

    return suggestions;
  }
}
