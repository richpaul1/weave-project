/**
 * Prompt Evaluation Service with Comprehensive Weave Instrumentation
 * 
 * This service evaluates prompt performance against defined criteria
 * and provides detailed tracing for RL training and analysis.
 */

// Removed adminWeave import - now passed as constructor parameter
import { 
  PromptTemplate, 
  PromptEvaluation, 
  PromptCriteria, 
  EvaluationMetrics,
  RLState 
} from '../models/promptOptimization.js';

export class PromptEvaluationService {
  private weave: any;

  constructor(
    private llmService: any, // Will integrate with existing LLM service
    private storageService: any, // Will integrate with Neo4j storage
    weave: any
  ) {
    this.weave = weave;
  }

  /**
   * Evaluate a prompt against test queries and criteria
   */
  async evaluatePrompt(
    prompt: PromptTemplate,
    testQueries: string[],
    criteria: PromptCriteria[]
  ): Promise<PromptEvaluation[]> {
    // Defensive programming: ensure parameters are valid
    const safeTestQueries = testQueries || [];
    const safeCriteria = criteria || [];

    const traceId = this.weave.startTrace('prompt_evaluation', {
      promptId: prompt?.id || 'unknown',
      promptName: prompt?.name || 'unknown',
      testQueriesCount: safeTestQueries.length,
      criteriaCount: safeCriteria.length
    });

    try {
      console.log(`🧪 Evaluating prompt: ${prompt?.name || 'unknown'} with ${safeTestQueries.length} test queries`);

      await this.weave.logEvent('prompt_evaluation_started', {
        promptId: prompt?.id || 'unknown',
        promptName: prompt?.name || 'unknown',
        testQueriesCount: safeTestQueries.length,
        criteriaCount: safeCriteria.length,
        timestamp: new Date().toISOString()
      });

      const evaluations: PromptEvaluation[] = [];
      
      for (let i = 0; i < safeTestQueries.length; i++) {
        const query = safeTestQueries[i];

        const queryTraceId = this.weave.startTrace(`evaluate_query_${i + 1}`, {
          queryIndex: i,
          queryLength: query?.length || 0,
          promptId: prompt?.id || 'unknown'
        });

        try {
          console.log(`📝 Evaluating query ${i + 1}/${safeTestQueries.length}: "${query?.substring(0, 50) || 'unknown'}..."`);

          // Generate response using the prompt
          const response = await this.generateResponse(prompt, query);

          // Evaluate against all criteria
          const criteriaScores = await this.evaluateCriteria(response, safeCriteria, query);

          // Calculate overall score
          const overallScore = this.calculateOverallScore(criteriaScores, safeCriteria);

          // Create evaluation record
          const evaluationRecord: PromptEvaluation = {
            id: `eval_${Date.now()}_${i}`,
            promptId: prompt?.id || 'unknown',
            testQuery: query || '',
            response: response.text || '',
            criteriaScores,
            overallScore,
            metadata: {
              responseTime: response.responseTime || 0,
              tokenCount: response.tokenCount || 0,
              timestamp: new Date().toISOString(),
              evaluatorType: 'automated'
            },
            traceUrl: this.weave.getCurrentTraceUrl() || undefined
          };

          await this.weave.logMetrics({
            evaluation_score: overallScore,
            promptId: prompt.id,
            queryIndex: i,
            responseTime: response.responseTime
          });

          // Save evaluation to storage (if available)
          if (this.storageService && typeof this.storageService.saveEvaluation === 'function') {
            await this.storageService.saveEvaluation(evaluationRecord);
          } else {
            // In-memory storage for testing/development
            console.log(`📝 Mock storage: Evaluation saved for query ${i + 1} with score ${overallScore.toFixed(3)}`);
          }

          this.weave.endTrace(queryTraceId, {
            overallScore,
            responseTime: response.responseTime,
            tokenCount: response.tokenCount
          });

          evaluations.push(evaluationRecord);
        } catch (error) {
          this.weave.endTrace(queryTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
          throw error;
        }
      }
      
      // Log summary metrics
      const averageScore = evaluations.reduce((sum, evalRecord) => sum + evalRecord.overallScore, 0) / evaluations.length;
      const averageResponseTime = evaluations.reduce((sum, evalRecord) => sum + evalRecord.metadata.responseTime, 0) / evaluations.length;
      
      await this.weave.logEvent('prompt_evaluation_completed', {
        promptId: prompt.id,
        evaluationsCount: evaluations.length,
        averageScore,
        averageResponseTime,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Prompt evaluation completed. Average score: ${averageScore.toFixed(3)}`);

      this.weave.endTrace(traceId, {
        evaluationsCount: evaluations.length,
        averageScore,
        averageResponseTime
      });

      return evaluations;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Generate response using a specific prompt
   */
  private async generateResponse(prompt: PromptTemplate, query: string): Promise<any> {
    const traceId = this.weave.startTrace('generate_llm_response', {
      promptId: prompt.id,
      queryLength: query.length
    });

    try {
      console.log(`🤖 Generating response for query: "${query.substring(0, 30)}..."`);

      const startTime = Date.now();

      // Call the injected LLM service or use mock response
      let response;
      if (this.llmService && typeof this.llmService.generateResponse === 'function') {
        response = await this.llmService.generateResponse(prompt, query);
      } else {
        // Mock response for testing/development
        const mockText = this.generateMockResponse(prompt, query);
        response = {
          text: mockText,
          responseTime: Math.floor(Math.random() * 500) + 100, // 100-600ms
          tokenCount: Math.floor(mockText.length / 4) // Rough estimate
        };
      }

      const responseTime = Date.now() - startTime;

      // Handle null or invalid response
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from LLM service');
      }

      await this.weave.logMetrics({
        llm_response_time: responseTime,
        promptId: prompt.id,
        queryLength: query.length,
        responseLength: response.text?.length || 0
      });

      const result = {
        text: response.text || '',
        responseTime,
        tokenCount: response.metadata?.tokenCount || Math.floor((response.text?.length || 0) / 4)
      };

      this.weave.endTrace(traceId, {
        responseTime,
        responseLength: result.text.length,
        tokenCount: result.tokenCount
      });

      return result;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Evaluate response against all criteria
   */
  private async evaluateCriteria(
    response: any,
    criteria: PromptCriteria[],
    originalQuery: string
  ): Promise<Record<string, number>> {
    const traceId = this.weave.startTrace('evaluate_all_criteria', {
      criteriaCount: criteria.length,
      enabledCriteriaCount: criteria.filter(c => c.enabled).length
    });

    try {
      console.log(`📊 Evaluating response against ${criteria.length} criteria`);

      const scores: Record<string, number> = {};

      for (const criterion of criteria) {
        if (!criterion.enabled) continue;

        const criterionTraceId = this.weave.startTrace(`evaluate_${criterion.name}`, {
          criterionId: criterion.id,
          weight: criterion.weight
        });

        try {
          const score = await this.evaluateSingleCriterion(response.text || response, criterion, originalQuery);

          await this.weave.logMetrics({
            [`criteria_${criterion.name}_score`]: score,
            criterionId: criterion.id,
            weight: criterion.weight
          });

          this.weave.endTrace(criterionTraceId, { score });
          scores[criterion.id] = score;
        } catch (error) {
          this.weave.endTrace(criterionTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
          throw error;
        }
      }

      this.weave.endTrace(traceId, { scoresCount: Object.keys(scores).length });
      return scores;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Evaluate response against a single criterion
   */
  private async evaluateSingleCriterion(
    response: string,
    criterion: PromptCriteria,
    originalQuery: string
  ): Promise<number> {
    // Ensure response is a string
    const responseText = typeof response === 'string' ? response : (response?.text || String(response));
    console.log(`🔍 Evaluating criterion: ${criterion.name}`);
    
    // Simulate criterion evaluation based on type
    switch (criterion.name.toLowerCase()) {
      case 'include_images':
        return this.evaluateImageInclusion(responseText);

      case 'concise':
        return this.evaluateConciseness(responseText, criterion.target || 200);

      case 'structured':
        return this.evaluateStructure(responseText);

      case 'actionable':
        return this.evaluateActionability(responseText);

      case 'relevant':
        return this.evaluateRelevance(responseText, originalQuery);

      case 'professional_tone':
        return this.evaluateTone(responseText, 'professional');

      case 'technical_accuracy':
        return this.evaluateTechnicalAccuracy(responseText);
      
      default:
        // Generic evaluation
        return Math.random() * 0.4 + 0.6; // 0.6-1.0 range
    }
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(
    criteriaScores: Record<string, number>, 
    criteria: PromptCriteria[]
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const criterion of criteria) {
      if (!criterion.enabled || !(criterion.id in criteriaScores)) continue;
      
      totalWeight += criterion.weight;
      weightedSum += criteriaScores[criterion.id] * criterion.weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Specific criterion evaluation methods
   */
  private evaluateImageInclusion(response: string): number {
    const hasImageReferences = /\b(image|picture|photo|diagram|chart|graph|visual)\b/i.test(response);
    const hasUrls = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp)/i.test(response);
    const hasImageMarkdown = /!\[.*?\]\(.*?\)/g.test(response);
    
    if (hasUrls || hasImageMarkdown) return 1.0;
    if (hasImageReferences) return 0.7;
    return 0.2;
  }

  private evaluateConciseness(response: string, targetLength: number): number {
    const wordCount = response.split(/\s+/).length;
    const ratio = wordCount / targetLength;

    // Optimal around target length, penalty for being too long or too short
    if (ratio <= 1.0) return 0.8 + (ratio * 0.2); // 0.8-1.0 for under target
    return Math.max(0.1, 1.2 - (ratio * 0.5)); // Stronger penalty for over target
  }

  private evaluateStructure(response: string): number {
    let score = 0.3; // Lower base score to differentiate better

    // Check for bullet points or numbered lists
    if (/^[\s]*[-*•]\s/m.test(response) || /^[\s]*\d+\.\s/m.test(response)) score += 0.4;

    // Check for headers or sections
    if (/^#+\s/m.test(response) || /\*\*.*?\*\*/g.test(response)) score += 0.2;

    // Check for clear paragraphs
    if (response.split('\n\n').length > 1) score += 0.1;

    return Math.min(score, 1.0);
  }

  private evaluateActionability(response: string): number {
    const actionWords = /\b(should|must|can|will|try|start|begin|create|build|implement|use|apply|follow|step|action|next|do|first|then|finally)\b/gi;
    const matches = response.match(actionWords) || [];

    // More action words = more actionable, but with a base score
    return Math.min(0.2 + (matches.length * 0.1), 1.0);
  }

  private evaluateRelevance(response: string, query: string): number {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const responseWords = response.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const queryWord of queryWords) {
      if (responseWords.some(respWord => respWord.includes(queryWord))) {
        matches++;
      }
    }
    
    return queryWords.length > 0 ? matches / queryWords.length : 0.5;
  }

  private evaluateTone(response: string, targetTone: string): number {
    const professionalWords = /\b(furthermore|however|therefore|consequently|moreover|nevertheless)\b/gi;
    const casualWords = /\b(hey|cool|awesome|yeah|totally|basically|kinda)\b/gi;
    
    const profMatches = (response.match(professionalWords) || []).length;
    const casualMatches = (response.match(casualWords) || []).length;
    
    if (targetTone === 'professional') {
      return Math.min((profMatches * 0.2) + 0.6 - (casualMatches * 0.1), 1.0);
    } else {
      return Math.min((casualMatches * 0.2) + 0.6 - (profMatches * 0.1), 1.0);
    }
  }

  private evaluateTechnicalAccuracy(response: string): number {
    // Simple heuristic: presence of technical terms and absence of uncertainty
    const technicalTerms = /\b(algorithm|framework|implementation|architecture|protocol|specification)\b/gi;
    const uncertaintyWords = /\b(maybe|perhaps|possibly|might|could be|not sure)\b/gi;
    
    const techMatches = (response.match(technicalTerms) || []).length;
    const uncertainMatches = (response.match(uncertaintyWords) || []).length;
    
    return Math.min(0.7 + (techMatches * 0.1) - (uncertainMatches * 0.2), 1.0);
  }

  /**
   * Generate mock response for testing (will be replaced with real LLM integration)
   */
  private generateMockResponse(prompt: PromptTemplate, query: string): string {
    const responses = [
      `Based on your query about "${query.substring(0, 30)}...", here are the key points:\n\n• First important aspect\n• Second consideration\n• Third recommendation\n\nFor more detailed information, you might want to explore additional resources.`,
      
      `To address your question regarding "${query.substring(0, 30)}...", I recommend the following approach:\n\n1. Start by understanding the fundamentals\n2. Apply the concepts systematically\n3. Monitor progress and adjust as needed\n\nThis structured approach should help you achieve your goals effectively.`,
      
      `Your inquiry about "${query.substring(0, 30)}..." is quite interesting. Here's what you should know:\n\nThe main considerations include technical accuracy, practical implementation, and long-term sustainability. I suggest focusing on proven methodologies while remaining open to innovative approaches.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Create RL state from current prompt and evaluation history
   */
  async createRLState(
    prompt: PromptTemplate,
    recentEvaluations: PromptEvaluation[],
    contextQuery: string
  ): Promise<RLState> {
    const traceId = this.weave.startTrace('create_rl_state', {
      promptId: prompt.id,
      evaluationsCount: recentEvaluations.length,
      contextQueryLength: contextQuery.length
    });

    try {
      const averageScore = recentEvaluations.length > 0
        ? recentEvaluations.reduce((sum, evalRecord) => sum + evalRecord.overallScore, 0) / recentEvaluations.length
        : 0;

      const state: RLState = {
        promptTemplate: prompt,
        recentEvaluations: recentEvaluations.slice(-10), // Last 10 evaluations
        targetCriteria: prompt.criteria,
        contextQuery,
        performanceHistory: {
          averageScore,
          trendDirection: this.calculateTrend(recentEvaluations),
          successRate: recentEvaluations.filter(e => e.overallScore > 0.7).length / Math.max(recentEvaluations.length, 1)
        }
      };

      await this.weave.logEvent('rl_state_created', {
        promptId: prompt.id,
        averageScore,
        evaluationsCount: recentEvaluations.length,
        successRate: state.performanceHistory.successRate
      });

      this.weave.endTrace(traceId, {
        averageScore,
        successRate: state.performanceHistory.successRate,
        trendDirection: state.performanceHistory.trendDirection
      });

      return state;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private calculateTrend(evaluations: PromptEvaluation[]): 'improving' | 'declining' | 'stable' {
    if (evaluations.length < 3) return 'stable';
    
    const recent = evaluations.slice(-3).map(e => e.overallScore);
    const older = evaluations.slice(-6, -3).map(e => e.overallScore);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    
    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }
}
