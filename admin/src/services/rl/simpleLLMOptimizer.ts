import type {
  PromptTemplate,
  PromptCriteria,
  PromptEvaluation
} from '../../models/promptOptimization.js';
import type { WeaveService } from '../../weave/weaveService.js';
import { PromptEvaluationService } from '../promptEvaluationService.js';
import { LLMService } from '../llmService.js';

export interface SimpleLLMOptimizerConfig {
  maxIterations: number;
  targetScore: number;
  convergenceThreshold: number;
  improvementThreshold: number; // Minimum improvement to continue
  stagnationLimit: number; // Stop if no improvement for N iterations
}

export interface OptimizationIteration {
  iteration: number;
  prompt: PromptTemplate;
  score: number;
  improvement: number;
  feedback: string;
  reasoning: string;
  timestamp: string;
}

export interface SimpleLLMOptimizationResult {
  success: boolean;
  bestPrompt: PromptTemplate;
  bestScore: number;
  totalIterations: number;
  iterations: OptimizationIteration[];
  convergenceAchieved: boolean;
  finalReasoning: string;
}

/**
 * Simple LLM-driven prompt optimizer that uses the LLM itself to improve prompts
 * based on evaluation scores and feedback
 */
export class SimpleLLMOptimizer {
  private weave: WeaveService;
  private evaluationService: PromptEvaluationService;
  private llmService: LLMService;
  private config: SimpleLLMOptimizerConfig;

  constructor(
    weave: WeaveService,
    evaluationService: PromptEvaluationService,
    config: SimpleLLMOptimizerConfig,
    llmService?: LLMService
  ) {
    this.weave = weave;
    this.evaluationService = evaluationService;
    this.llmService = llmService || new LLMService();
    this.config = config;
  }

  /**
   * Optimize a prompt using LLM-driven iterative improvement
   */
  async optimizePrompt(
    initialPrompt: PromptTemplate,
    testQueries: string[],
    expectedOutputs: string[],
    criteria: PromptCriteria[],
    contextDescription?: string
  ): Promise<SimpleLLMOptimizationResult> {
    const traceId = this.weave.startTrace('simple_llm_optimization', {
      initialPromptId: initialPrompt.id,
      maxIterations: this.config.maxIterations,
      targetScore: this.config.targetScore,
      testQueriesCount: testQueries.length
    });

    try {
      console.log(`🚀 Starting Simple LLM Optimization (${this.config.maxIterations} max iterations)`);

      const iterations: OptimizationIteration[] = [];
      let currentPrompt = initialPrompt;
      let bestPrompt = initialPrompt;
      let bestScore = 0;
      let stagnationCount = 0;

      // Initial evaluation
      const initialEvaluations = await this.evaluationService.evaluatePrompt(
        currentPrompt, 
        testQueries, 
        criteria
      );
      const initialScore = this.calculateAverageScore(initialEvaluations);
      bestScore = initialScore;

      console.log(`📊 Initial score: ${initialScore.toFixed(3)}`);

      for (let i = 0; i < this.config.maxIterations; i++) {
        const iterationTraceId = this.weave.startChildTrace(
          traceId,
          `optimization_iteration_${i + 1}`,
          { iteration: i + 1, currentScore: bestScore }
        );

        try {
          // Generate feedback and improvement suggestions
          const feedback = await this.generateFeedback(
            currentPrompt,
            testQueries,
            expectedOutputs,
            initialEvaluations,
            criteria,
            contextDescription
          );

          // Generate improved prompt using LLM
          const improvedPrompt = await this.generateImprovedPrompt(
            currentPrompt,
            feedback,
            testQueries,
            expectedOutputs,
            contextDescription
          );

          // Evaluate the improved prompt
          const evaluations = await this.evaluationService.evaluatePrompt(
            improvedPrompt,
            testQueries,
            criteria
          );
          const score = this.calculateAverageScore(evaluations);
          const improvement = score - bestScore;

          const iteration: OptimizationIteration = {
            iteration: i + 1,
            prompt: improvedPrompt,
            score,
            improvement,
            feedback: feedback.summary,
            reasoning: feedback.reasoning,
            timestamp: new Date().toISOString()
          };

          iterations.push(iteration);

          console.log(`📈 Iteration ${i + 1}: Score ${score.toFixed(3)} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(3)})`);

          // Update best if improved
          if (score > bestScore) {
            bestScore = score;
            bestPrompt = improvedPrompt;
            currentPrompt = improvedPrompt;
            stagnationCount = 0;
            console.log(`🏆 New best score: ${bestScore.toFixed(3)}`);
          } else {
            stagnationCount++;
            // Sometimes use the new prompt even if score didn't improve (exploration)
            if (Math.random() < 0.3) {
              currentPrompt = improvedPrompt;
              console.log(`🔄 Exploring new direction despite lower score`);
            }
          }

          this.weave.endTrace(iterationTraceId, {
            score,
            improvement,
            newBest: score > bestScore,
            stagnationCount
          });

          // Check convergence conditions
          if (bestScore >= this.config.targetScore) {
            console.log(`🎯 Target score achieved: ${bestScore.toFixed(3)} >= ${this.config.targetScore}`);
            break;
          }

          if (stagnationCount >= this.config.stagnationLimit) {
            console.log(`⏹️ Stopping due to stagnation (${stagnationCount} iterations without improvement)`);
            break;
          }

          if (improvement < this.config.improvementThreshold && i > 2) {
            console.log(`⏹️ Stopping due to minimal improvement: ${improvement.toFixed(3)} < ${this.config.improvementThreshold}`);
            break;
          }

        } catch (error) {
          this.weave.endTrace(iterationTraceId, { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          console.error(`❌ Error in iteration ${i + 1}:`, error);
          // Continue with next iteration
        }
      }

      const result: SimpleLLMOptimizationResult = {
        success: bestScore > initialScore,
        bestPrompt,
        bestScore,
        totalIterations: iterations.length,
        iterations,
        convergenceAchieved: bestScore >= this.config.targetScore,
        finalReasoning: iterations[iterations.length - 1]?.reasoning || 'No iterations completed'
      };

      console.log(`✅ Optimization complete: ${bestScore.toFixed(3)} (${iterations.length} iterations)`);

      this.weave.endTrace(traceId, {
        success: result.success,
        bestScore: result.bestScore,
        totalIterations: result.totalIterations,
        convergenceAchieved: result.convergenceAchieved
      });

      return result;

    } catch (error) {
      this.weave.endTrace(traceId, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Generate feedback on current prompt performance
   */
  private async generateFeedback(
    prompt: PromptTemplate,
    testQueries: string[],
    expectedOutputs: string[],
    evaluations: PromptEvaluation[],
    criteria: PromptCriteria[],
    contextDescription?: string
  ): Promise<{ summary: string; reasoning: string; suggestions: string[] }> {
    const traceId = this.weave.startTrace('generate_feedback', {
      promptId: prompt.id,
      evaluationsCount: evaluations.length
    });

    try {
      // Analyze current performance
      const avgScore = this.calculateAverageScore(evaluations);
      const weakAreas = this.identifyWeakAreas(evaluations, criteria);
      
      // Generate actual outputs for comparison
      const actualOutputs: string[] = [];
      for (const query of testQueries) {
        const response = await this.evaluationService['generateResponse'](prompt, query);
        actualOutputs.push(response.text || '');
      }

      const feedbackPrompt = this.createFeedbackPrompt(
        prompt,
        testQueries,
        expectedOutputs,
        actualOutputs,
        avgScore,
        weakAreas,
        contextDescription
      );

      // Use LLM to generate feedback (mock for now)
      const feedback = await this.callLLMForFeedback(feedbackPrompt);

      this.weave.endTrace(traceId, { avgScore, weakAreasCount: weakAreas.length });
      return feedback;

    } catch (error) {
      this.weave.endTrace(traceId, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Generate an improved prompt based on feedback
   */
  private async generateImprovedPrompt(
    currentPrompt: PromptTemplate,
    feedback: { summary: string; reasoning: string; suggestions: string[] },
    testQueries: string[],
    expectedOutputs: string[],
    contextDescription?: string
  ): Promise<PromptTemplate> {
    const traceId = this.weave.startTrace('generate_improved_prompt', {
      currentPromptId: currentPrompt.id,
      suggestionsCount: feedback.suggestions.length
    });

    try {
      const improvementPrompt = this.createImprovementPrompt(
        currentPrompt,
        feedback,
        testQueries,
        expectedOutputs,
        contextDescription
      );

      // Use LLM to generate improved prompt (mock for now)
      const improvedPromptText = await this.callLLMForImprovement(improvementPrompt);

      const improvedPrompt: PromptTemplate = {
        ...currentPrompt,
        id: `${currentPrompt.id}_improved_${Date.now()}`,
        content: improvedPromptText,
        version: currentPrompt.version + 1,
        updatedAt: new Date().toISOString(),
        parentId: currentPrompt.id
      };

      this.weave.endTrace(traceId, { 
        improvedPromptId: improvedPrompt.id,
        contentLength: improvedPromptText.length
      });

      return improvedPrompt;

    } catch (error) {
      this.weave.endTrace(traceId, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private calculateAverageScore(evaluations: PromptEvaluation[]): number {
    if (evaluations.length === 0) return 0;
    const totalScore = evaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0);
    return totalScore / evaluations.length;
  }

  private identifyWeakAreas(evaluations: PromptEvaluation[], criteria: PromptCriteria[]): string[] {
    const weakAreas: string[] = [];
    const criteriaMap = new Map(criteria.map(c => [c.id, c]));

    for (const evaluation of evaluations) {
      for (const [criteriaId, score] of Object.entries(evaluation.criteriaScores)) {
        if (score < 0.6) { // Threshold for weak performance
          const criterion = criteriaMap.get(criteriaId);
          if (criterion && !weakAreas.includes(criterion.name)) {
            weakAreas.push(criterion.name);
          }
        }
      }
    }

    return weakAreas;
  }

  /**
   * Create feedback prompt for LLM analysis
   */
  private createFeedbackPrompt(
    prompt: PromptTemplate,
    testQueries: string[],
    expectedOutputs: string[],
    actualOutputs: string[],
    avgScore: number,
    weakAreas: string[],
    contextDescription?: string
  ): string {
    return `You are an expert prompt engineer. Analyze the following prompt's performance and provide detailed feedback.

CONTEXT: ${contextDescription || 'General prompt optimization'}

CURRENT PROMPT:
"${prompt.content}"

PERFORMANCE ANALYSIS:
- Average Score: ${avgScore.toFixed(3)}/1.0
- Weak Areas: ${weakAreas.join(', ') || 'None identified'}

TEST CASES:
${testQueries.map((query, i) => `
Query ${i + 1}: "${query}"
Expected: "${expectedOutputs[i] || 'Not specified'}"
Actual: "${actualOutputs[i] || 'No output'}"
`).join('\n')}

Please provide:
1. A summary of the main issues (2-3 sentences)
2. Detailed reasoning about why the prompt is underperforming
3. Specific suggestions for improvement

Focus on making the prompt more effective at producing the expected outputs.`;
  }

  /**
   * Create improvement prompt for LLM
   */
  private createImprovementPrompt(
    currentPrompt: PromptTemplate,
    feedback: { summary: string; reasoning: string; suggestions: string[] },
    testQueries: string[],
    expectedOutputs: string[],
    contextDescription?: string
  ): string {
    return `You are an expert prompt engineer. Improve the following prompt based on the analysis and feedback provided.

CONTEXT: ${contextDescription || 'General prompt optimization'}

CURRENT PROMPT:
"${currentPrompt.content}"

FEEDBACK ANALYSIS:
Summary: ${feedback.summary}
Reasoning: ${feedback.reasoning}
Suggestions: ${feedback.suggestions.join('; ')}

TARGET BEHAVIOR:
${testQueries.map((query, i) => `
For input: "${query}"
Should produce: "${expectedOutputs[i] || 'High-quality relevant response'}"
`).join('\n')}

Please provide an improved version of the prompt that:
1. Addresses the identified issues
2. Is more likely to produce the expected outputs
3. Maintains clarity and effectiveness
4. Incorporates the specific suggestions

Return only the improved prompt text, no additional commentary.`;
  }

  /**
   * Call LLM for feedback analysis using real LLM service
   */
  private async callLLMForFeedback(feedbackPrompt: string): Promise<{ summary: string; reasoning: string; suggestions: string[] }> {
    try {
      const systemPrompt = `You are an expert prompt engineer analyzing prompt performance.
Your task is to provide structured feedback in JSON format with exactly these fields:
- summary: Brief overview of the main issues
- reasoning: Detailed explanation of why the prompt is underperforming
- suggestions: Array of specific improvement recommendations

Respond only with valid JSON, no additional text.`;

      const response = await this.llmService.generateCompletionNoThinking(
        feedbackPrompt,
        systemPrompt,
        'qwen3:0.6b',
        500,
        0.1
      );

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(response);
        if (parsed.summary && parsed.reasoning && Array.isArray(parsed.suggestions)) {
          return parsed;
        }
      } catch (parseError) {
        console.warn('Failed to parse LLM feedback as JSON, using fallback');
      }

      // Fallback: extract information from text response
      return {
        summary: "The prompt needs improvement based on evaluation results.",
        reasoning: response.substring(0, 200) + "...",
        suggestions: [
          "Improve clarity and specificity",
          "Add more detailed instructions",
          "Include examples of desired output",
          "Refine the prompt structure"
        ]
      };

    } catch (error) {
      console.error('Error calling LLM for feedback:', error);

      // Fallback to basic feedback
      return {
        summary: "Unable to generate detailed feedback due to LLM error.",
        reasoning: "The LLM service encountered an error while analyzing the prompt performance.",
        suggestions: [
          "Review prompt clarity",
          "Add more specific instructions",
          "Include examples",
          "Test with different approaches"
        ]
      };
    }
  }

  /**
   * Call LLM for prompt improvement using real LLM service
   */
  private async callLLMForImprovement(improvementPrompt: string): Promise<string> {
    try {
      const systemPrompt = `You are an expert prompt engineer. Your task is to improve prompts based on the analysis provided.

Create an improved version of the prompt that:
1. Addresses the specific issues identified
2. Incorporates the suggested improvements
3. Maintains the original intent and purpose
4. Is clear, specific, and actionable

Return only the improved prompt text, no additional commentary or explanation.`;

      const response = await this.llmService.generateCompletionNoThinking(
        improvementPrompt,
        systemPrompt,
        'qwen3:0.6b',
        800,
        0.2
      );

      // Clean up the response - remove any extra formatting or commentary
      const cleanedResponse = response
        .replace(/^["']|["']$/g, '') // Remove quotes
        .replace(/^Improved prompt:\s*/i, '') // Remove "Improved prompt:" prefix
        .replace(/^Here's the improved prompt:\s*/i, '') // Remove variations
        .trim();

      // Ensure we have a meaningful response
      if (cleanedResponse.length < 10) {
        throw new Error('LLM response too short');
      }

      return cleanedResponse;

    } catch (error) {
      console.error('Error calling LLM for improvement:', error);

      // Fallback to a generic improved prompt
      return `You are a helpful assistant specialized in providing clear, accurate, and well-structured responses. When answering questions, please:

1. Start with a brief, direct answer
2. Provide supporting details and context
3. Use bullet points or numbered lists for clarity
4. Include relevant examples when helpful
5. End with a concise summary

Always maintain a professional yet approachable tone, and ensure your responses are factual and helpful.`;
    }
  }
}
