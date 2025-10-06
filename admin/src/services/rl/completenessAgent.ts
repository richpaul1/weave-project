/**
 * Completeness-Specialized RL Agent
 * 
 * Focuses on optimizing prompt completeness and comprehensiveness.
 * Prioritizes actions that ensure prompts cover all necessary aspects.
 */

import { SpecializedRLAgent, SpecializedAgentConfig, SpecializedOptimizationResult } from './specializedRLAgent.js';
import { 
  RLAction, 
  RLState,
  PromptOptimizationSession
} from '../../models/promptOptimization.js';

export class CompletenessAgent extends SpecializedRLAgent {
  constructor(config: SpecializedAgentConfig, weave: any) {
    super(config, 'completeness', 'completeness-agent', weave);
  }

  /**
   * Create default configuration for completeness agent
   */
  static createDefaultConfig(): SpecializedAgentConfig {
    return {
      algorithm: 'ppo',
      hyperparameters: {
        learningRate: 0.001,
        discountFactor: 0.95,
        explorationRate: 0.25,
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
        maxEpisodeLength: 10,
        convergenceThreshold: 0.85,
        evaluationFrequency: 10
      },
      specialization: {
        focusCriteria: 'completeness',
        specializationBonus: 0.4,
        criteriaWeight: 1.6,
        diversityPenalty: 0.05
      }
    };
  }

  /**
   * Filter actions relevant to completeness optimization
   */
  protected filterRelevantActions(actions: RLAction[], state: RLState): RLAction[] {
    const completenessRelevantTypes = [
      'add_instruction',    // Add comprehensive instructions
      'modify_example',     // Add more complete examples
      'add_constraint',     // Add constraints for thoroughness
      'change_format'       // Format for comprehensive coverage
    ];

    return actions.filter(action => {
      // Check if action type is relevant to completeness
      if (!completenessRelevantTypes.includes(action.type)) {
        return false;
      }

      // Check if action parameters suggest completeness improvement
      const description = action.description.toLowerCase();
      const completenessKeywords = [
        'complete', 'comprehensive', 'thorough', 'detailed', 'cover',
        'include', 'address', 'all', 'every', 'entire', 'full',
        'extensive', 'exhaustive', 'additional', 'more', 'expand'
      ];

      return completenessKeywords.some(keyword => description.includes(keyword));
    });
  }

  /**
   * Calculate specialization score for completeness
   */
  protected calculateSpecializationScore(action: RLAction, state: RLState): number {
    let score = 0;

    // Base score by action type
    switch (action.type) {
      case 'add_instruction':
        score += 0.9; // Instructions greatly improve completeness
        break;
      case 'modify_example':
        score += 0.7; // More complete examples help
        break;
      case 'add_constraint':
        score += 0.6; // Constraints ensure thoroughness
        break;
      case 'change_format':
        score += 0.5; // Format can improve coverage
        break;
      default:
        score += 0.1; // Small bonus for any action
    }

    // Bonus for completeness-specific parameters
    const description = action.description.toLowerCase();
    
    if (description.includes('comprehensive') || description.includes('thorough')) {
      score += 0.4;
    }
    if (description.includes('complete') || description.includes('detailed')) {
      score += 0.3;
    }
    if (description.includes('cover all') || description.includes('address all')) {
      score += 0.35;
    }
    if (description.includes('additional') || description.includes('more')) {
      score += 0.25;
    }
    if (description.includes('expand') || description.includes('extend')) {
      score += 0.2;
    }

    // Penalty for actions that might reduce completeness
    if (description.includes('remove') || description.includes('delete')) {
      score -= 0.3;
    }
    if (description.includes('simplify') || description.includes('reduce')) {
      score -= 0.2;
    }
    if (description.includes('brief') || description.includes('short')) {
      score -= 0.15;
    }

    // Consider current completeness level
    const currentCompletenessScore = this.getCurrentCompletenessScore(state);
    if (currentCompletenessScore < 6.5) {
      score += 0.3; // Higher bonus when completeness is low
    }

    // Bonus for adding content when prompt seems incomplete
    if (this.isPromptIncomplete(state) && action.type === 'add_instruction') {
      score += 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get current completeness score from state
   */
  private getCurrentCompletenessScore(state: RLState): number {
    if (state.recentEvaluations.length === 0) return 5.0;
    
    const latestEvaluation = state.recentEvaluations[state.recentEvaluations.length - 1];
    return latestEvaluation.criteriaScores['completeness'] || 5.0;
  }

  /**
   * Check if prompt appears incomplete based on various indicators
   */
  private isPromptIncomplete(state: RLState): boolean {
    // Defensive programming: check if prompt exists
    if (!state?.promptTemplate?.systemPrompt) {
      console.warn('⚠️ CompletenessAgent: Missing systemPrompt in state');
      return true; // Consider missing prompt as incomplete
    }

    const prompt = state.promptTemplate.systemPrompt;

    // Check for common incompleteness indicators
    const indicators = [
      prompt.length < 100,  // Very short prompts often incomplete
      !prompt.includes('example'),  // Missing examples
      !prompt.includes('format'),   // No format specification
      prompt.split('.').length < 3, // Very few sentences
      !prompt.includes('should') && !prompt.includes('must'), // No clear requirements
    ];

    return indicators.filter(Boolean).length >= 2;
  }

  /**
   * Generate completeness-specific insights
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

    const completenessScore = this.getCurrentCompletenessScore(finalState);
    const overallScore = finalState.performanceHistory.averageScore;
    const prompt = finalState?.promptTemplate?.systemPrompt || '';

    // Analyze completeness performance
    if (completenessScore >= 8.5) {
      insights.strengthAreas.push('Excellent comprehensiveness and coverage');
      insights.strengthAreas.push('Addresses all key aspects thoroughly');
    } else if (completenessScore >= 7.0) {
      insights.strengthAreas.push('Good coverage with minor gaps');
      insights.improvementAreas.push('Could include additional details or examples');
    } else {
      insights.improvementAreas.push('Significant gaps in completeness');
      insights.improvementAreas.push('Missing important aspects or details');
    }

    // Analyze prompt structure for completeness
    const hasExamples = prompt.toLowerCase().includes('example');
    const hasFormat = prompt.toLowerCase().includes('format');
    const hasConstraints = prompt.toLowerCase().includes('must') || prompt.toLowerCase().includes('should');
    
    if (hasExamples) {
      insights.strengthAreas.push('Includes helpful examples');
    } else {
      insights.improvementAreas.push('Missing examples to illustrate expectations');
    }

    if (hasFormat) {
      insights.strengthAreas.push('Specifies output format');
    } else {
      insights.improvementAreas.push('No clear format specification');
    }

    if (hasConstraints) {
      insights.strengthAreas.push('Includes clear requirements and constraints');
    } else {
      insights.improvementAreas.push('Missing explicit requirements');
    }

    // Analyze action patterns
    const completenessActions = session.episodes.flatMap(ep => ep.actions)
      .filter(action => this.filterRelevantActions([action], finalState).length > 0);

    if (completenessActions.length > 0) {
      const addActions = completenessActions.filter(a => a.type === 'add_instruction').length;
      const modifyActions = completenessActions.filter(a => a.type === 'modify_example').length;

      if (addActions > modifyActions) {
        insights.strengthAreas.push('Focused on adding comprehensive instructions');
      } else {
        insights.strengthAreas.push('Emphasized improving example completeness');
      }
    }

    // Generate recommendations
    if (completenessScore < 7.5) {
      insights.recommendations.push('Add more detailed instructions covering edge cases');
      insights.recommendations.push('Include comprehensive examples showing expected outputs');
      insights.recommendations.push('Specify all requirements and constraints explicitly');
    }

    if (completenessScore < 6.5) {
      insights.recommendations.push('Break down complex tasks into detailed steps');
      insights.recommendations.push('Add context about when and how to apply instructions');
      insights.recommendations.push('Include error handling and exception cases');
    }

    if (!hasExamples) {
      insights.recommendations.push('Add multiple examples covering different scenarios');
    }

    if (!hasFormat) {
      insights.recommendations.push('Specify expected output format and structure');
    }

    // Performance-based recommendations
    if (overallScore > completenessScore + 1.5) {
      insights.recommendations.push('Focus more on comprehensive coverage while maintaining quality');
    }

    if (session.episodes.length > 25 && !session.converged) {
      insights.recommendations.push('Consider more aggressive completeness-focused actions');
    }

    return insights;
  }

  /**
   * Get completeness-specific action suggestions
   */
  getCompletenessActionSuggestions(state: RLState): RLAction[] {
    const suggestions: RLAction[] = [];
    const currentCompleteness = this.getCurrentCompletenessScore(state);
    const prompt = state?.promptTemplate?.systemPrompt || '';

    if (currentCompleteness < 6.5) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'comprehensive', coverage: 'complete' },
        description: 'Add comprehensive instructions covering all aspects'
      });

      suggestions.push({
        type: 'modify_example',
        parameters: { exampleType: 'detailed', completeness: 'high' },
        description: 'Modify examples to be more detailed and complete'
      });
    }

    if (currentCompleteness < 7.5) {
      suggestions.push({
        type: 'add_constraint',
        parameters: { constraintType: 'thoroughness', requirement: 'complete_coverage' },
        description: 'Add constraints ensuring thorough coverage of all aspects'
      });
    }

    if (!prompt.toLowerCase().includes('example')) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'examples', position: 'middle' },
        description: 'Add comprehensive examples to illustrate all scenarios'
      });
    }

    if (this.isPromptIncomplete(state)) {
      suggestions.push({
        type: 'add_instruction',
        parameters: { instructionType: 'detailed_requirements', position: 'beginning' },
        description: 'Add detailed requirements and specifications'
      });
    }

    return suggestions;
  }
}
