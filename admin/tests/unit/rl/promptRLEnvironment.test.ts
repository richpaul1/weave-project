import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PromptRLEnvironment } from '../../../src/services/promptRLEnvironment.js';
import type {
  PromptTemplate,
  PromptCriteria,
  RLAction,
  RLState,
  PromptEvaluation
} from '../../../src/models/promptOptimization.js';

// Mock dependencies
const mockEvaluationService = {
  evaluatePrompt: vi.fn(),
  createRLState: vi.fn()
};

// Mock dependencies - will be recreated in beforeEach
let mockWeave: any;

describe('PromptRLEnvironment', () => {
  let environment: PromptRLEnvironment;
  let mockPrompt: PromptTemplate;
  let mockCriteria: PromptCriteria[];
  let mockAction: RLAction;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock weave for each test
    mockWeave = {
      createChildTrace: vi.fn().mockImplementation((name, operation) => operation()),
      logEvent: vi.fn(),
      logMetric: vi.fn(),
      getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
    };

    // Reset mock implementations to default behavior
    mockEvaluationService.evaluatePrompt.mockResolvedValue([testUtils.createMockEvaluation()]);
    mockEvaluationService.createRLState.mockResolvedValue(testUtils.createMockRLState());

    environment = new PromptRLEnvironment(
      mockEvaluationService as any,
      mockWeave as any
    );

    mockPrompt = {
      id: 'test-prompt-1',
      name: 'Test Prompt',
      systemPrompt: 'You are a helpful assistant.',
      examples: [],
      criteria: [],
      version: 1,
      metadata: {
        useCase: 'testing',
        expectedResponseLength: 100,
        tone: 'professional',
        format: 'structured'
      }
    };

    mockCriteria = [
      {
        id: 'criteria-1',
        name: 'structured',
        description: 'Response should be well-structured',
        weight: 0.3,
        targetValue: 0.8,
        evaluationType: 'automated'
      }
    ];

    mockAction = {
      type: 'add_instruction',
      parameters: { instruction: 'Be more specific' },
      description: 'Add instruction to be more specific'
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reset', () => {
    it('should reset environment with new prompt and criteria', async () => {
      // Arrange
      const mockState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0,
          trendDirection: 'stable',
          successRate: 0
        }
      };

      mockEvaluationService.createRLState.mockResolvedValue(mockState);

      // Act
      const result = await environment.reset(mockPrompt, mockCriteria, 'test query');

      // Assert
      expect(result).toEqual(mockState);
      expect(mockEvaluationService.createRLState).toHaveBeenCalledWith(
        mockPrompt,
        [],
        'test query'
      );
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_environment_reset',
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'environment_reset_score',
        0,
        expect.any(Object)
      );
    });

    it('should handle reset without context query', async () => {
      // Arrange
      const mockState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: '',
        performanceHistory: {
          averageScore: 0,
          trendDirection: 'stable',
          successRate: 0
        }
      };

      mockEvaluationService.createRLState.mockResolvedValue(mockState);

      // Act
      const result = await environment.reset(mockPrompt, mockCriteria);

      // Assert
      expect(result).toEqual(mockState);
      expect(mockEvaluationService.createRLState).toHaveBeenCalledWith(
        mockPrompt,
        [],
        ''
      );
    });
  });

  describe('step', () => {
    it('should execute action and return next state with reward', async () => {
      // Arrange
      const initialState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.5,
          trendDirection: 'stable',
          successRate: 0.6
        }
      };

      const modifiedPrompt = { ...mockPrompt, id: 'modified-prompt' };
      const mockEvaluations: PromptEvaluation[] = [
        {
          id: 'eval-1',
          promptId: modifiedPrompt.id,
          testQuery: 'test query',
          response: 'test response',
          criteriaScores: { structured: 0.8 },
          overallScore: 0.8,
          metadata: {
            responseTime: 100,
            tokenCount: 50,
            timestamp: new Date().toISOString(),
            evaluatorType: 'automated'
          }
        }
      ];

      const nextState: RLState = {
        promptTemplate: modifiedPrompt,
        recentEvaluations: mockEvaluations,
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.8,
          trendDirection: 'improving',
          successRate: 0.8
        }
      };

      // Set current state
      await environment.reset(mockPrompt, mockCriteria, 'test query');
      mockEvaluationService.createRLState.mockResolvedValue(initialState);

      // Mock action application and evaluation
      vi.spyOn(environment as any, 'applyAction').mockResolvedValue(modifiedPrompt);
      mockEvaluationService.evaluatePrompt.mockResolvedValue(mockEvaluations);
      mockEvaluationService.createRLState.mockResolvedValue(nextState);

      // Act
      const result = await environment.step(mockAction);

      // Assert
      expect(result.nextState).toEqual(nextState);
      expect(result.reward).toBeGreaterThan(0); // Should be positive due to improvement
      expect(result.done).toBe(false);
      expect(result.info).toHaveProperty('actionType', mockAction.type);
      expect(result.info).toHaveProperty('evaluationsCount', 1);
      expect(result.info).toHaveProperty('averageScore', 0.8);
      
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_applied',
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'rl_step_reward',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should terminate episode when max steps reached', async () => {
      // Arrange
      const environment = new PromptRLEnvironment(
        mockEvaluationService as any,
        mockWeave as any,
        { maxSteps: 1 } // Set max steps to 1
      );

      const initialState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.5,
          trendDirection: 'stable',
          successRate: 0.6
        }
      };

      await environment.reset(mockPrompt, mockCriteria, 'test query');
      mockEvaluationService.createRLState.mockResolvedValue(initialState);

      // Set up episode to be at max steps (10 actions already taken)
      const currentEpisode = (environment as any).currentEpisode;
      currentEpisode.actions = new Array(9).fill(mockAction); // 9 actions already taken
      currentEpisode.rewards = new Array(9).fill(0.5);

      const modifiedPrompt = { ...mockPrompt, id: 'modified-prompt' };
      const mockEvaluations: PromptEvaluation[] = [];

      vi.spyOn(environment as any, 'applyAction').mockResolvedValue(modifiedPrompt);
      mockEvaluationService.evaluatePrompt.mockResolvedValue(mockEvaluations);

      // Act
      const result = await environment.step(mockAction);

      // Assert
      expect(result.done).toBe(true);
      expect(result.info).toHaveProperty('terminationReason', 'max_steps');
    });

    it('should terminate episode when high performance achieved', async () => {
      // Arrange
      const initialState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.5,
          trendDirection: 'stable',
          successRate: 0.6
        }
      };

      const highPerformanceEvaluations: PromptEvaluation[] = [
        {
          id: 'eval-1',
          promptId: 'modified-prompt',
          testQuery: 'test query',
          response: 'excellent response',
          criteriaScores: { structured: 0.98 },
          overallScore: 0.98,
          metadata: {
            responseTime: 100,
            tokenCount: 50,
            timestamp: new Date().toISOString(),
            evaluatorType: 'automated'
          }
        }
      ];

      const nextState: RLState = {
        promptTemplate: { ...mockPrompt, id: 'modified-prompt' },
        recentEvaluations: highPerformanceEvaluations,
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.98,
          trendDirection: 'improving',
          successRate: 1.0
        }
      };

      await environment.reset(mockPrompt, mockCriteria, 'test query');
      mockEvaluationService.createRLState.mockResolvedValue(initialState);

      vi.spyOn(environment as any, 'applyAction').mockResolvedValue({ ...mockPrompt, id: 'modified-prompt' });
      mockEvaluationService.evaluatePrompt.mockResolvedValue(highPerformanceEvaluations);
      mockEvaluationService.createRLState.mockResolvedValue(nextState);

      // Act
      const result = await environment.step(mockAction);

      // Assert
      expect(result.done).toBe(true);
      expect(result.info).toHaveProperty('terminationReason', 'convergence');
    });
  });

  describe('applyAction', () => {
    it('should apply add_instruction action correctly', async () => {
      // Arrange
      const action: RLAction = {
        type: 'add_instruction',
        parameters: { instruction: 'Be more specific in your responses.' },
        description: 'Add specificity instruction'
      };

      // Act
      const result = await (environment as any).applyAction(mockPrompt, action);

      // Assert
      expect(result.systemPrompt).toContain('Be more specific in your responses.');
      expect(result.id).not.toBe(mockPrompt.id); // Should have new ID
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'prompt_modified',
        expect.any(Object)
      );
    });

    it('should apply change_format action correctly', async () => {
      // Arrange
      const action: RLAction = {
        type: 'change_format',
        parameters: { format: 'bullet_points' },
        description: 'Change to bullet point format'
      };

      // Act
      const result = await (environment as any).applyAction(mockPrompt, action);

      // Assert
      expect(result.metadata.format).toBe('bullet_points');
      expect(result.systemPrompt).toContain('bullet_points');
    });

    it('should apply adjust_tone action correctly', async () => {
      // Arrange
      const action: RLAction = {
        type: 'adjust_tone',
        parameters: { tone: 'friendly' },
        description: 'Make tone more friendly'
      };

      // Act
      const result = await (environment as any).applyAction(mockPrompt, action);

      // Assert
      expect(result.metadata.tone).toBe('friendly');
      expect(result.systemPrompt).toContain('friendly');
    });

    it('should apply add_constraint action correctly', async () => {
      // Arrange
      const action: RLAction = {
        type: 'add_constraint',
        parameters: { constraint: 'Keep responses under 100 words.' },
        description: 'Add length constraint'
      };

      // Act
      const result = await (environment as any).applyAction(mockPrompt, action);

      // Assert
      expect(result.systemPrompt).toContain('Keep responses under 100 words.');
    });

    it('should handle unknown action type', async () => {
      // Arrange
      const action: RLAction = {
        type: 'unknown_action' as any,
        parameters: {},
        description: 'Unknown action'
      };

      // Act
      const result = await (environment as any).applyAction(mockPrompt, action);

      // Assert
      expect(result.systemPrompt).toBe(mockPrompt.systemPrompt); // System prompt should be unchanged
      expect(result.name).toBe(mockPrompt.name); // Name should be unchanged
      expect(result.parentId).toBe(mockPrompt.id); // Should reference original prompt
    });
  });

  describe('calculateReward', () => {
    it('should calculate positive reward for improvement', async () => {
      // Arrange
      const previousState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.5,
          trendDirection: 'stable',
          successRate: 0.6
        }
      };

      const improvedEvaluations: PromptEvaluation[] = [
        {
          id: 'eval-1',
          promptId: 'modified-prompt',
          query: 'test query',
          response: { text: 'improved response' },
          criteriaScores: { structured: 0.8 },
          overallScore: 0.8,
          timestamp: new Date().toISOString(),
          responseTime: 100,
          metadata: {
            tokenCount: 50,
            evaluatorType: 'automated',
            timestamp: new Date().toISOString(),
            responseTime: 100
          }
        }
      ];

      // Act
      const reward = await (environment as any).calculateReward(
        previousState,
        improvedEvaluations,
        mockAction
      );

      // Assert
      expect(reward).toBeGreaterThan(0);
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'reward_calculated',
        expect.any(Object)
      );
    });

    it('should calculate negative reward for decline', async () => {
      // Arrange
      const previousState: RLState = {
        promptTemplate: mockPrompt,
        recentEvaluations: [],
        targetCriteria: mockCriteria,
        contextQuery: 'test query',
        performanceHistory: {
          averageScore: 0.8,
          trendDirection: 'stable',
          successRate: 0.8
        }
      };

      const worseEvaluations: PromptEvaluation[] = [
        {
          id: 'eval-1',
          promptId: 'modified-prompt',
          query: 'test query',
          response: { text: 'worse response' },
          criteriaScores: { structured: 0.3 },
          overallScore: 0.3,
          timestamp: new Date().toISOString(),
          responseTime: 100,
          metadata: {
            tokenCount: 50,
            evaluatorType: 'automated',
            timestamp: new Date().toISOString(),
            responseTime: 100
          }
        }
      ];

      // Act
      const reward = await (environment as any).calculateReward(
        previousState,
        worseEvaluations,
        mockAction
      );

      // Assert
      expect(reward).toBeLessThan(0);
    });
  });

  describe('getAvailableActions', () => {
    it('should return all available action types', () => {
      // Act
      const actions = environment.getAvailableActions();

      // Assert
      expect(actions).toHaveLength(8);
      expect(actions.map(a => a.type)).toContain('add_instruction');
      expect(actions.map(a => a.type)).toContain('add_constraint');
      expect(actions.map(a => a.type)).toContain('change_format');
      expect(actions.map(a => a.type)).toContain('adjust_tone');
      expect(actions.map(a => a.type)).toContain('add_constraint');
      // Note: remove_constraint is not in the current implementation
    });

    it('should return actions with proper structure', () => {
      // Act
      const actions = environment.getAvailableActions();

      // Assert
      actions.forEach(action => {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('parameters');
        expect(action).toHaveProperty('description');
        expect(typeof action.type).toBe('string');
        expect(typeof action.parameters).toBe('object');
        expect(typeof action.description).toBe('string');
      });
    });
  });

  describe('error handling', () => {
    it('should handle evaluation service errors', async () => {
      // Arrange
      mockEvaluationService.evaluatePrompt.mockRejectedValue(new Error('Evaluation failed'));

      await environment.reset(mockPrompt, mockCriteria, 'test query');
      vi.spyOn(environment as any, 'applyAction').mockResolvedValue(mockPrompt);

      // Act & Assert
      await expect(environment.step(mockAction)).rejects.toThrow('Evaluation failed');
    });

    it('should handle action application errors', async () => {
      // Arrange
      await environment.reset(mockPrompt, mockCriteria, 'test query');
      vi.spyOn(environment as any, 'applyAction').mockRejectedValue(new Error('Action failed'));

      // Act & Assert
      await expect(environment.step(mockAction)).rejects.toThrow('Action failed');
    });
  });
});
