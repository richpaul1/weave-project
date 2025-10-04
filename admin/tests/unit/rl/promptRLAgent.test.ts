import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PromptRLAgent } from '../../../src/services/promptRLAgent.js';
import type {
  RLState,
  RLAction,
  RLEpisode,
  PromptTemplate,
  PromptCriteria,
  PromptOptimizationSession
} from '../../../src/models/promptOptimization.js';

// Mock dependencies - will be recreated in beforeEach
let mockWeave: any;

describe('PromptRLAgent', () => {
  let agent: PromptRLAgent;
  let mockState: RLState;
  let mockActions: RLAction[];
  let mockPrompt: PromptTemplate;
  let mockCriteria: PromptCriteria[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock weave for each test
    mockWeave = {
      createChildTrace: vi.fn().mockImplementation((name, operation) => operation()),
      logEvent: vi.fn(),
      logMetric: vi.fn(),
      getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
    };

    const mockConfig = testUtils.createMockRLAgentConfig();
    agent = new PromptRLAgent(mockWeave, mockConfig);

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

    mockState = {
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

    mockActions = [
      {
        type: 'add_instruction',
        parameters: { instruction: 'Be more specific' },
        description: 'Add instruction to be more specific'
      },
      {
        type: 'change_format',
        parameters: { format: 'bullet_points' },
        description: 'Change to bullet point format'
      },
      {
        type: 'adjust_tone',
        parameters: { tone: 'friendly' },
        description: 'Make tone more friendly'
      }
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('selectAction', () => {
    it('should select action from available actions', async () => {
      // Act
      const selectedAction = await agent.selectAction(mockState, mockActions);

      // Assert
      expect(mockActions).toContain(selectedAction);
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_selection_started',
        expect.any(Object)
      );
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_selected',
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'action_selection_confidence',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should use exploration when random value is below epsilon', async () => {
      // Arrange
      const agent = new PromptRLAgent(mockWeave as any, { explorationRate: 1.0 }); // Always explore
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Below exploration rate

      // Act
      const selectedAction = await agent.selectAction(mockState, mockActions);

      // Assert
      expect(mockActions).toContain(selectedAction);
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_selected',
        expect.objectContaining({
          explorationUsed: true
        })
      );
    });

    it('should use exploitation when random value is above epsilon', async () => {
      // Arrange
      const agent = new PromptRLAgent(mockWeave as any, { explorationRate: 0.0 }); // Never explore
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      // Act
      const selectedAction = await agent.selectAction(mockState, mockActions);

      // Assert
      expect(mockActions).toContain(selectedAction);
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_selected',
        expect.objectContaining({
          explorationUsed: false
        })
      );
    });

    it('should handle empty action list', async () => {
      // Act & Assert
      await expect(agent.selectAction(mockState, [])).rejects.toThrow('No available actions to select from');
    });

    it('should consider state score in action selection', async () => {
      // Arrange
      const highScoreState = {
        ...mockState,
        performanceHistory: {
          ...mockState.performanceHistory,
          averageScore: 0.9
        }
      };

      const lowScoreState = {
        ...mockState,
        performanceHistory: {
          ...mockState.performanceHistory,
          averageScore: 0.1
        }
      };

      // Act
      const highScoreAction = await agent.selectAction(highScoreState, mockActions);
      const lowScoreAction = await agent.selectAction(lowScoreState, mockActions);

      // Assert
      expect(mockActions).toContain(highScoreAction);
      expect(mockActions).toContain(lowScoreAction);
      // Both should be valid actions, but selection logic may differ based on score
    });
  });

  describe('train', () => {
    it('should train agent with episode data', async () => {
      // Arrange
      const mockEpisodes: RLEpisode[] = [
        {
          id: 'episode-1',
          sessionId: 'session-1',
          steps: [
            {
              state: mockState,
              action: mockActions[0],
              reward: 0.5,
              nextState: mockState,
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
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_training_started',
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'policy_loss',
        expect.any(Number),
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'value_loss',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should handle empty episode list', async () => {
      // Act
      await agent.train([]);

      // Assert
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_training_started',
        expect.objectContaining({
          episodesCount: 0
        })
      );
    });

    it('should update exploration rate after training', async () => {
      // Arrange
      const initialExplorationRate = agent.getExplorationRate();
      const mockEpisodes: RLEpisode[] = [
        {
          id: 'episode-1',
          sessionId: 'session-1',
          steps: [],
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

  describe('runOptimizationSession', () => {
    it('should run complete optimization session', async () => {
      // Arrange
      const mockEnvironment = {
        reset: vi.fn().mockResolvedValue(mockState),
        step: vi.fn().mockResolvedValue({
          nextState: mockState,
          reward: 0.5,
          done: true,
          info: { terminationReason: 'max_steps' }
        }),
        getAvailableActions: vi.fn().mockReturnValue(mockActions),
        getCurrentState: vi.fn().mockReturnValue(mockState),
        getEpisodeHistory: vi.fn().mockReturnValue([]),
        startNewEpisode: vi.fn().mockResolvedValue(undefined)
      };

      // Act
      const session = await agent.runOptimizationSession(
        mockEnvironment as any,
        2,
        mockPrompt,
        mockCriteria,
        'test query'
      );

      // Assert
      expect(session).toMatchObject({
        id: expect.any(String),
        episodes: expect.any(Array),
        bestScore: expect.any(Number),
        bestPromptId: expect.any(String),
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        status: 'completed'
      });

      expect(mockEnvironment.reset).toHaveBeenCalled();
      expect(mockEnvironment.step).toHaveBeenCalled();
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'optimization_session_started',
        expect.any(Object)
      );
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'optimization_session_completed',
        expect.any(Object)
      );
    });

    it('should handle environment errors during optimization', async () => {
      // Arrange
      const mockEnvironment = {
        reset: vi.fn(),
        step: vi.fn().mockRejectedValue(new Error('Environment error')),
        getAvailableActions: vi.fn().mockReturnValue(mockActions),
        getCurrentState: vi.fn().mockReturnValue(mockState),
        getEpisodeHistory: vi.fn().mockReturnValue([]),
        startNewEpisode: vi.fn().mockResolvedValue(undefined)
      };

      // Act & Assert
      await expect(agent.runOptimizationSession(mockEnvironment as any, 1))
        .rejects.toThrow('Environment error');
    });

    it('should detect convergence when performance stabilizes', async () => {
      // Arrange
      const stableScore = 0.95; // Above convergence threshold of 0.9
      const stableState = {
        ...mockState,
        performanceHistory: {
          ...mockState.performanceHistory,
          averageScore: stableScore
        }
      };

      const mockEnvironment = {
        reset: vi.fn().mockResolvedValue(stableState),
        step: vi.fn().mockResolvedValue({
          nextState: stableState,
          reward: 0.01, // Very small improvement
          done: true,
          info: { terminationReason: 'max_steps' }
        }),
        getAvailableActions: vi.fn().mockReturnValue(mockActions),
        getCurrentState: vi.fn().mockReturnValue(stableState),
        getEpisodeHistory: vi.fn().mockReturnValue([]),
        startNewEpisode: vi.fn().mockResolvedValue(undefined)
      };

      // Act
      const session = await agent.runOptimizationSession(mockEnvironment as any, 10);

      // Assert
      expect(session.converged).toBe(true);
    });

    it('should track best performing prompt across episodes', async () => {
      // Arrange
      let episodeCount = 0;
      const mockEnvironment = {
        reset: vi.fn().mockResolvedValue(mockState),
        step: vi.fn().mockImplementation(() => {
          episodeCount++;
          const score = episodeCount === 2 ? 0.9 : 0.5; // Second episode has best score
          return Promise.resolve({
            nextState: {
              ...mockState,
              performanceHistory: {
                ...mockState.performanceHistory,
                averageScore: score
              }
            },
            reward: score,
            done: true,
            info: { terminationReason: 'max_steps' }
          });
        }),
        getAvailableActions: vi.fn().mockReturnValue(mockActions),
        getCurrentState: vi.fn().mockReturnValue(mockState),
        getEpisodeHistory: vi.fn().mockReturnValue([
          { id: 'episode-1', sessionId: 'session-1', steps: [], totalReward: 0.5, finalScore: 0.5 },
          { id: 'episode-2', sessionId: 'session-1', steps: [], totalReward: 0.9, finalScore: 0.9 },
          { id: 'episode-3', sessionId: 'session-1', steps: [], totalReward: 0.7, finalScore: 0.7 }
        ]),
        startNewEpisode: vi.fn().mockResolvedValue(undefined)
      };

      // Act
      const session = await agent.runOptimizationSession(mockEnvironment as any, 3);

      // Assert
      expect(session.bestScore).toBe(0.9);
      expect(session.episodes).toHaveLength(3);
    });
  });

  describe('getTrainingStats', () => {
    it('should return current training statistics', () => {
      // Act
      const stats = agent.getTrainingStats();

      // Assert
      expect(stats).toMatchObject({
        trainingUpdates: expect.any(Number),
        totalEpisodes: expect.any(Number),
        explorationRate: expect.any(Number)
      });
    });

    it('should update stats after training', async () => {
      // Arrange
      const initialStats = agent.getTrainingStats();
      const mockEpisodes: RLEpisode[] = [
        {
          id: 'episode-1',
          sessionId: 'session-1',
          steps: [],
          totalReward: 0.5,
          finalScore: 0.6,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }
      ];

      // Act
      await agent.train(mockEpisodes);
      const finalStats = agent.getTrainingStats();

      // Assert
      expect(finalStats.totalEpisodes).toBeGreaterThan(initialStats.totalEpisodes);
      expect(finalStats.trainingUpdates).toBeGreaterThan(initialStats.trainingUpdates);
    });
  });

  describe('configuration', () => {
    it('should initialize with default configuration', () => {
      // Arrange
      const defaultAgent = new PromptRLAgent(mockWeave as any);

      // Act
      const stats = defaultAgent.getTrainingStats();

      // Assert
      expect(stats.explorationRate).toBe(0.2); // Default exploration rate
    });

    it('should initialize with custom configuration', () => {
      // Arrange
      const customConfig = {
        explorationRate: 0.5,
        learningRate: 0.01,
        algorithm: 'ppo' as const
      };
      const customAgent = new PromptRLAgent(mockWeave as any, customConfig);

      // Act
      const stats = customAgent.getTrainingStats();

      // Assert
      expect(stats.explorationRate).toBe(0.5);
    });
  });

  describe('weave instrumentation', () => {
    it('should log action selection events', async () => {
      // Act
      await agent.selectAction(mockState, mockActions);

      // Assert
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'rl_action_selection_started',
        expect.objectContaining({
          stateScore: mockState.performanceHistory.averageScore,
          availableActionsCount: mockActions.length
        })
      );
    });

    it('should log training metrics', async () => {
      // Arrange
      const mockEpisodes: RLEpisode[] = [
        {
          id: 'episode-1',
          sessionId: 'session-1',
          steps: [],
          totalReward: 0.5,
          finalScore: 0.6,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }
      ];

      // Act
      await agent.train(mockEpisodes);

      // Assert
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'policy_loss',
        expect.any(Number),
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'value_loss',
        expect.any(Number),
        expect.any(Object)
      );
      expect(mockWeave.logMetric).toHaveBeenCalledWith(
        'exploration_rate',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should create child traces for optimization sessions', async () => {
      // Arrange
      const mockEnvironment = {
        reset: vi.fn().mockResolvedValue(mockState),
        step: vi.fn().mockResolvedValue({
          nextState: mockState,
          reward: 0.5,
          done: true,
          info: { terminationReason: 'max_steps' }
        }),
        getAvailableActions: vi.fn().mockReturnValue(mockActions),
        getCurrentState: vi.fn().mockReturnValue(mockState),
        getEpisodeHistory: vi.fn().mockReturnValue([]),
        startNewEpisode: vi.fn().mockResolvedValue(undefined)
      };

      // Act
      await agent.runOptimizationSession(mockEnvironment as any, 1);

      // Assert
      expect(mockWeave.createChildTrace).toHaveBeenCalledWith(
        'rl_optimization_session',
        expect.any(Function)
      );
    });
  });

  describe('error handling', () => {
    it('should handle action selection errors gracefully', async () => {
      // Arrange
      const invalidState = null as any;

      // Act & Assert
      await expect(agent.selectAction(invalidState, mockActions))
        .rejects.toThrow();
    });

    it('should handle training errors gracefully', async () => {
      // Arrange
      const invalidEpisodes = null as any;

      // Act & Assert
      await expect(agent.train(invalidEpisodes))
        .rejects.toThrow();
    });
  });
});
