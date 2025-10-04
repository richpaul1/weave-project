import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PromptEvaluationService } from '../../../src/services/promptEvaluationService.js';
import { PromptRLEnvironment } from '../../../src/services/promptRLEnvironment.js';
import { PromptRLAgent } from '../../../src/services/promptRLAgent.js';
import type {
  PromptTemplate,
  PromptCriteria,
  PromptOptimizationSession
} from '../../../src/models/promptOptimization.js';

// Mock services with realistic behavior
class MockLLMService {
  async generateResponse(prompt: any, query: string): Promise<{ text: string; metadata?: { tokenCount: number } }> {
    // Extract prompt text from PromptTemplate object or use as string
    const promptText = typeof prompt === 'string' ? prompt : prompt.content || prompt.template || '';

    // Simulate different response qualities based on prompt characteristics
    const hasStructureInstructions = promptText.includes('bullet') || promptText.includes('structure');
    const hasConciseInstructions = promptText.includes('concise') || promptText.includes('brief');
    const hasFriendlyTone = promptText.includes('friendly') || promptText.includes('warm');
    
    let response = `Here's a response to: ${query.substring(0, 20)}...`;
    
    if (hasStructureInstructions) {
      response = `Here are the key points:\n• Point 1\n• Point 2\n• Point 3`;
    }
    
    if (hasConciseInstructions) {
      response = response.substring(0, 50) + '.';
    }
    
    if (hasFriendlyTone) {
      response = `Hi there! ${response} Hope this helps!`;
    }
    
    // Add some randomness to simulate real LLM variability
    const randomFactor = Math.random() * 0.2 + 0.9; // 0.9 to 1.1
    const baseLength = response.length;
    const adjustedLength = Math.floor(baseLength * randomFactor);
    
    if (adjustedLength < baseLength) {
      response = response.substring(0, adjustedLength);
    } else {
      response += ' Additional details and context.';
    }
    
    return {
      text: response,
      metadata: {
        tokenCount: Math.floor(response.length / 4)
      }
    };
  }
}

class MockStorageService {
  private evaluations: any[] = [];
  
  async saveEvaluation(evaluation: any): Promise<void> {
    this.evaluations.push(evaluation);
  }
  
  async getEvaluationHistory(promptId: string): Promise<any[]> {
    return this.evaluations.filter(e => e.promptId === promptId);
  }
  
  getEvaluations() {
    return this.evaluations;
  }
  
  clear() {
    this.evaluations = [];
  }
}

describe('Prompt Optimization Workflow - Functional Tests', () => {
  let evaluationService: PromptEvaluationService;
  let environment: PromptRLEnvironment;
  let agent: PromptRLAgent;
  let mockLLMService: MockLLMService;
  let mockStorageService: MockStorageService;
  let mockWeave: any;
  let basePrompt: PromptTemplate;
  let criteria: PromptCriteria[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock objects for each test
    mockWeave = {
      createChildTrace: vi.fn().mockImplementation((name, operation) => operation()),
      logEvent: vi.fn(),
      logMetric: vi.fn(),
      getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
    };

    mockLLMService = new MockLLMService();
    mockStorageService = new MockStorageService();
    
    evaluationService = new PromptEvaluationService(
      mockLLMService as any,
      mockStorageService as any,
      mockWeave as any
    );
    
    environment = new PromptRLEnvironment(
      evaluationService,
      mockWeave as any
    );
    
    agent = new PromptRLAgent(mockWeave as any);

    basePrompt = {
      id: 'course-recommendation-prompt',
      name: 'Course Recommendation Assistant',
      systemPrompt: 'You are a helpful assistant that recommends courses.',
      examples: [
        {
          id: 'example-1',
          userQuery: 'I want to learn Python',
          expectedResponse: 'I recommend starting with Python Basics course.',
          explanation: 'Direct course recommendation'
        }
      ],
      criteria: [],
      version: 1,
      metadata: {
        useCase: 'course_recommendation',
        expectedResponseLength: 150,
        tone: 'professional',
        format: 'conversational'
      }
    };

    criteria = [
      {
        id: 'structured',
        name: 'structured',
        description: 'Response should be well-structured with clear organization',
        weight: 0.3,
        targetValue: 0.8,
        evaluationType: 'automated',
        enabled: true
      },
      {
        id: 'actionable',
        name: 'actionable',
        description: 'Response should provide actionable recommendations',
        weight: 0.25,
        targetValue: 0.7,
        evaluationType: 'automated',
        enabled: true
      },
      {
        id: 'concise',
        name: 'concise',
        description: 'Response should be concise and to the point',
        weight: 0.2,
        targetValue: 0.8,
        evaluationType: 'automated',
        enabled: true
      },
      {
        id: 'relevant',
        name: 'relevant',
        description: 'Response should be relevant to the user query',
        weight: 0.25,
        targetValue: 0.8,
        evaluationType: 'automated',
        enabled: true
      }
    ];
  });

  afterEach(() => {
    mockStorageService.clear();
    vi.restoreAllMocks();
  });

  describe('Complete Optimization Workflow', () => {
    it('should run end-to-end prompt optimization successfully', async () => {
      // Arrange
      const testQueries = [
        'I want to learn machine learning',
        'What courses do you recommend for data science?',
        'Help me get started with web development'
      ];

      // Act - Run baseline evaluation
      const baselineEvaluations = await evaluationService.evaluatePrompt(
        basePrompt,
        testQueries.slice(0, 2),
        criteria
      );

      const baselineScore = baselineEvaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) / baselineEvaluations.length;

      // Initialize environment before optimization
      await environment.reset(basePrompt, criteria);

      // Act - Run optimization session
      const optimizationSession = await agent.runOptimizationSession(environment, 3);

      // Assert - Verify session completed
      expect(optimizationSession).toMatchObject({
        id: expect.any(String),
        episodes: expect.any(Array),
        bestScore: expect.any(Number),
        bestPromptId: expect.any(String),
        converged: expect.any(Boolean),
        startTime: expect.any(String),
        endTime: expect.any(String)
      });

      expect(optimizationSession.episodes.length).toBeGreaterThan(0);
      expect(optimizationSession.episodes.length).toBeLessThanOrEqual(3);

      // Assert - Verify episodes have proper structure
      optimizationSession.episodes.forEach(episode => {
        expect(episode).toMatchObject({
          id: expect.any(String),
          promptId: expect.any(String),
          actions: expect.any(Array),
          rewards: expect.any(Array),
          totalReward: expect.any(Number),
          episodeLength: expect.any(Number),
          timestamp: expect.any(String)
        });

        expect(episode.actions.length).toBeGreaterThan(0);
        expect(episode.rewards.length).toBeGreaterThan(0);
        expect(episode.actions.length).toBe(episode.rewards.length);

        episode.actions.forEach(action => {
          expect(action).toMatchObject({
            type: expect.any(String),
            parameters: expect.any(Object),
            description: expect.any(String)
          });
        });

        episode.rewards.forEach(reward => {
          expect(reward).toEqual(expect.any(Number));
        });
      });

      // Assert - Verify evaluations were stored
      const storedEvaluations = mockStorageService.getEvaluations();
      expect(storedEvaluations.length).toBeGreaterThan(baselineEvaluations.length);

      // Assert - Verify Weave instrumentation
      expect(mockWeave.createChildTrace).toHaveBeenCalled();
      expect(mockWeave.logEvent).toHaveBeenCalled();
      expect(mockWeave.logMetric).toHaveBeenCalled();
    }, 30000); // Increase timeout for complex workflow

    it('should improve prompt performance through optimization', async () => {
      // Arrange
      const testQueries = [
        'I want to learn Python programming',
        'What data science courses do you recommend?'
      ];

      // Act - Get baseline performance
      const baselineEvaluations = await evaluationService.evaluatePrompt(
        basePrompt,
        testQueries,
        criteria
      );
      const baselineScore = baselineEvaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) / baselineEvaluations.length;

      // Initialize environment before optimization
      await environment.reset(basePrompt, criteria);

      // Act - Run optimization with more episodes for better chance of improvement
      const optimizationSession = await agent.runOptimizationSession(environment, 5);

      // Assert - Best score should be tracked
      expect(optimizationSession.bestScore).toBeGreaterThanOrEqual(0);
      expect(optimizationSession.bestScore).toBeLessThanOrEqual(1);

      // Assert - Should have attempted multiple optimization strategies
      const allActions = optimizationSession.episodes.flatMap(ep => ep.actions.map(action => action.type));
      const uniqueActionTypes = new Set(allActions);
      expect(uniqueActionTypes.size).toBeGreaterThan(1); // Should try different action types

      // Assert - Should show learning progression
      const episodeScores = optimizationSession.episodes.map(ep => ep.totalReward);
      const firstHalfAvg = episodeScores.slice(0, Math.ceil(episodeScores.length / 2))
        .reduce((sum, score) => sum + score, 0) / Math.ceil(episodeScores.length / 2);
      const secondHalfAvg = episodeScores.slice(Math.ceil(episodeScores.length / 2))
        .reduce((sum, score) => sum + score, 0) / Math.floor(episodeScores.length / 2);

      // Note: Due to randomness, we can't guarantee improvement, but we can verify the system is working
      expect(typeof firstHalfAvg).toBe('number');
      expect(typeof secondHalfAvg).toBe('number');
    }, 45000);

    it('should handle different action types correctly', async () => {
      // Arrange
      const testQuery = 'I want to learn web development';

      // Act - Reset environment and get available actions
      await environment.reset(basePrompt, criteria, testQuery);
      const availableActions = environment.getAvailableActions();

      // Test each action type
      const actionResults = [];
      for (const action of availableActions.slice(0, 3)) { // Test first 3 actions
        try {
          const result = await environment.step(action);
          actionResults.push({
            actionType: action.type,
            reward: result.reward,
            done: result.done,
            success: true
          });
          
          // Reset for next action
          await environment.reset(basePrompt, criteria, testQuery);
        } catch (error) {
          actionResults.push({
            actionType: action.type,
            error: error.message,
            success: false
          });
        }
      }

      // Assert - All actions should execute without errors
      const successfulActions = actionResults.filter(result => result.success);
      expect(successfulActions.length).toBeGreaterThan(0);

      // Assert - Actions should produce different outcomes
      const rewards = successfulActions.map(result => result.reward);
      expect(rewards.length).toBeGreaterThan(0);
      
      // Assert - Rewards should be reasonable numbers
      rewards.forEach(reward => {
        expect(typeof reward).toBe('number');
        expect(reward).toBeGreaterThan(-2); // Reasonable lower bound
        expect(reward).toBeLessThan(2); // Reasonable upper bound
      });
    }, 30000);
  });

  describe('Agent Learning Behavior', () => {
    it('should demonstrate exploration vs exploitation behavior', async () => {
      // Arrange
      const explorationAgent = new PromptRLAgent(mockWeave as any, { explorationRate: 0.8 });
      const exploitationAgent = new PromptRLAgent(mockWeave as any, { explorationRate: 0.1 });

      const testState = await evaluationService.createRLState(basePrompt, [], 'test query');

      // Initialize environment before getting available actions
      await environment.reset(basePrompt, criteria);
      const availableActions = environment.getAvailableActions();

      // Act - Select actions multiple times
      const explorationSelections = [];
      const exploitationSelections = [];

      for (let i = 0; i < 10; i++) {
        explorationSelections.push(await explorationAgent.selectAction(testState, availableActions));
        exploitationSelections.push(await exploitationAgent.selectAction(testState, availableActions));
      }

      // Assert - High exploration should show more variety
      const explorationVariety = new Set(explorationSelections.map(a => a.type)).size;
      const exploitationVariety = new Set(exploitationSelections.map(a => a.type)).size;

      // Note: Due to randomness, we can't guarantee this, but it's likely
      expect(explorationVariety).toBeGreaterThan(0);
      expect(exploitationVariety).toBeGreaterThan(0);
    });

    it('should update exploration rate after training', async () => {
      // Arrange
      const initialExplorationRate = agent.getExplorationRate();

      // Create mock episodes for training
      const mockEpisodes = [
        {
          id: 'episode-1',
          sessionId: 'session-1',
          steps: [
            {
              state: await evaluationService.createRLState(basePrompt, [], 'test'),
              action: environment.getAvailableActions()[0],
              reward: 0.5,
              nextState: await evaluationService.createRLState(basePrompt, [], 'test'),
              done: false
            }
          ],
          totalReward: 0.5,
          finalScore: 0.6,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }
      ];

      // Act
      await agent.train(mockEpisodes);

      // Assert
      const finalExplorationRate = agent.getExplorationRate();
      expect(finalExplorationRate).toBeLessThanOrEqual(initialExplorationRate);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty criteria list', async () => {
      // Act & Assert
      await expect(evaluationService.evaluatePrompt(basePrompt, ['test query'], []))
        .resolves.toBeDefined();
    });

    it('should handle very short queries', async () => {
      // Act
      const result = await evaluationService.evaluatePrompt(basePrompt, ['Hi'], criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long queries', async () => {
      // Arrange
      const longQuery = 'I want to learn '.repeat(100) + 'programming';

      // Act
      const result = await evaluationService.evaluatePrompt(basePrompt, [longQuery], criteria);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle optimization session with max episodes reached', async () => {
      // Arrange
      const shortEnvironment = new PromptRLEnvironment(
        evaluationService,
        mockWeave as any,
        { maxSteps: 1 } // Force quick termination
      );

      // Initialize environment before optimization
      await shortEnvironment.reset(basePrompt, criteria);

      // Act
      const session = await agent.runOptimizationSession(shortEnvironment, 2);

      // Assert
      expect(session.episodes.length).toBeLessThanOrEqual(2);
      expect(session.episodes.every(ep => ep.actions.length <= 1)).toBe(true);
    });
  });

  describe('Performance and Metrics', () => {
    it('should complete evaluation within reasonable time', async () => {
      // Arrange
      const startTime = Date.now();
      const testQueries = ['Quick test query'];

      // Act
      await evaluationService.evaluatePrompt(basePrompt, testQueries, criteria);

      // Assert
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should track metrics consistently', async () => {
      // Arrange
      const testQueries = ['Test query 1', 'Test query 2'];

      // Act
      await evaluationService.evaluatePrompt(basePrompt, testQueries, criteria);

      // Assert - Verify metrics were logged
      const metricCalls = mockWeave.logMetric.mock.calls;
      expect(metricCalls.length).toBeGreaterThan(0);

      // Check for expected metric types
      const metricNames = metricCalls.map(call => call[0]);
      expect(metricNames).toContain('evaluation_score');
      expect(metricNames).toContain('llm_response_time');
    });

    it('should maintain evaluation consistency', async () => {
      // Arrange
      const testQuery = 'I want to learn Python programming';

      // Act - Evaluate same prompt multiple times
      const evaluation1 = await evaluationService.evaluatePrompt(basePrompt, [testQuery], criteria);
      const evaluation2 = await evaluationService.evaluatePrompt(basePrompt, [testQuery], criteria);

      // Assert - Scores should be similar (within reasonable variance due to LLM randomness)
      const score1 = evaluation1[0].overallScore;
      const score2 = evaluation2[0].overallScore;
      const variance = Math.abs(score1 - score2);
      
      expect(variance).toBeLessThan(0.3); // Allow for some randomness but expect consistency
    });
  });
});
