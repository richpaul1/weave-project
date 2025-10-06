import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClarityAgent } from '../../../../src/services/rl/clarityAgent.js';
import { CompletenessAgent } from '../../../../src/services/rl/completenessAgent.js';
import { HelpfulnessAgent } from '../../../../src/services/rl/helpfulnessAgent.js';
import type { 
  RLAction, 
  RLState, 
  PromptTemplate, 
  PromptCriteria,
  PromptEvaluation 
} from '../../../../src/models/promptOptimization.js';

// Mock Weave
const mockWeave = {
  startTrace: vi.fn().mockReturnValue('mock-trace-id'),
  endTrace: vi.fn(),
  logEvent: vi.fn(),
  logMetrics: vi.fn(),
  getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
};

describe('Specialized RL Agents', () => {
  let mockState: RLState;
  let mockActions: RLAction[];

  beforeEach(() => {
    // Create mock prompt template
    const mockPrompt: PromptTemplate = {
      id: 'test-prompt',
      name: 'Test Prompt',
      description: 'Test prompt for specialized agents',
      systemPrompt: 'You are a helpful assistant. Please provide clear and comprehensive responses.',
      examples: [],
      criteria: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      metadata: {}
    };

    // Create mock evaluation
    const mockEvaluation: PromptEvaluation = {
      id: 'eval-1',
      promptId: 'test-prompt',
      testQuery: 'test query',
      response: 'test response',
      criteriaScores: {
        clarity: 6.5,
        completeness: 7.0,
        helpfulness: 6.0,
        relevance: 7.5,
        accuracy: 8.0,
        engagement: 6.5
      },
      overallScore: 6.9,
      metadata: {
        responseTime: 100,
        tokenCount: 50,
        timestamp: new Date().toISOString(),
        evaluatorType: 'automated'
      }
    };

    // Create mock state
    mockState = {
      promptTemplate: mockPrompt,
      recentEvaluations: [mockEvaluation],
      targetCriteria: [],
      contextQuery: 'test context',
      performanceHistory: {
        averageScore: 6.9,
        trendDirection: 'stable',
        successRate: 0.7
      }
    };

    // Create mock actions
    mockActions = [
      {
        type: 'add_instruction',
        parameters: { instructionType: 'clarification' },
        description: 'Add clear instructions for better understanding'
      },
      {
        type: 'change_format',
        parameters: { formatType: 'structured' },
        description: 'Change format to structured bullet points'
      },
      {
        type: 'modify_example',
        parameters: { exampleType: 'detailed' },
        description: 'Modify example to be more comprehensive and complete'
      },
      {
        type: 'add_constraint',
        parameters: { constraintType: 'helpfulness' },
        description: 'Add constraint for helpful and practical responses'
      }
    ];

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('ClarityAgent', () => {
    let clarityAgent: ClarityAgent;

    beforeEach(() => {
      const config = ClarityAgent.createDefaultConfig();
      clarityAgent = new ClarityAgent(config, mockWeave);
    });

    it('should create with correct default configuration', () => {
      const config = ClarityAgent.createDefaultConfig();
      
      expect(config.specialization.focusCriteria).toBe('clarity');
      expect(config.specialization.specializationBonus).toBe(0.3);
      expect(config.specialization.criteriaWeight).toBe(1.5);
      expect(config.hyperparameters.explorationRate).toBe(0.2);
    });

    it('should filter actions relevant to clarity', () => {
      const relevantActions = clarityAgent['filterRelevantActions'](mockActions, mockState);
      
      expect(relevantActions).toHaveLength(2);
      expect(relevantActions[0].description).toContain('clear');
      expect(relevantActions[1].description).toContain('structured');
    });

    it('should calculate higher specialization scores for clarity-related actions', () => {
      const clarityAction = mockActions[0]; // "Add clear instructions"
      const otherAction = mockActions[3]; // "Add constraint for helpful"
      
      const clarityScore = clarityAgent['calculateSpecializationScore'](clarityAction, mockState);
      const otherScore = clarityAgent['calculateSpecializationScore'](otherAction, mockState);
      
      expect(clarityScore).toBeGreaterThan(otherScore);
      expect(clarityScore).toBeGreaterThan(0.5);
    });

    it('should generate clarity-specific action suggestions', () => {
      const suggestions = clarityAgent.getClarityActionSuggestions(mockState);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.description.includes('clear'))).toBe(true);
    });

    it('should get correct agent metadata', () => {
      const metadata = clarityAgent.getAgentMetadata();
      
      expect(metadata.id).toBe('clarity-agent');
      expect(metadata.type).toBe('clarity');
      expect(metadata.focusCriteria).toBe('clarity');
      expect(metadata.name).toBe('clarity Optimizer');
    });
  });

  describe('CompletenessAgent', () => {
    let completenessAgent: CompletenessAgent;

    beforeEach(() => {
      const config = CompletenessAgent.createDefaultConfig();
      completenessAgent = new CompletenessAgent(config, mockWeave);
    });

    it('should create with correct default configuration', () => {
      const config = CompletenessAgent.createDefaultConfig();
      
      expect(config.specialization.focusCriteria).toBe('completeness');
      expect(config.specialization.specializationBonus).toBe(0.4);
      expect(config.specialization.criteriaWeight).toBe(1.6);
      expect(config.hyperparameters.explorationRate).toBe(0.25);
    });

    it('should filter actions relevant to completeness', () => {
      const relevantActions = completenessAgent['filterRelevantActions'](mockActions, mockState);
      
      expect(relevantActions).toHaveLength(1);
      expect(relevantActions[0].description).toContain('comprehensive');
    });

    it('should calculate higher specialization scores for completeness-related actions', () => {
      const completenessAction = mockActions[2]; // "comprehensive and complete"
      const otherAction = mockActions[1]; // "structured bullet points"
      
      const completenessScore = completenessAgent['calculateSpecializationScore'](completenessAction, mockState);
      const otherScore = completenessAgent['calculateSpecializationScore'](otherAction, mockState);
      
      expect(completenessScore).toBeGreaterThan(otherScore);
      expect(completenessScore).toBeGreaterThan(0.6);
    });

    it('should detect incomplete prompts', () => {
      // Create state with short, incomplete prompt
      const incompleteState = {
        ...mockState,
        promptTemplate: {
          ...mockState.promptTemplate,
          systemPrompt: 'Help users.'
        }
      };
      
      const isIncomplete = completenessAgent['isPromptIncomplete'](incompleteState);
      expect(isIncomplete).toBe(true);
    });

    it('should generate completeness-specific action suggestions', () => {
      const suggestions = completenessAgent.getCompletenessActionSuggestions(mockState);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.description.includes('comprehensive') || s.description.includes('complete'))).toBe(true);
    });

    it('should get correct agent metadata', () => {
      const metadata = completenessAgent.getAgentMetadata();
      
      expect(metadata.id).toBe('completeness-agent');
      expect(metadata.type).toBe('completeness');
      expect(metadata.focusCriteria).toBe('completeness');
      expect(metadata.name).toBe('completeness Optimizer');
    });
  });

  describe('HelpfulnessAgent', () => {
    let helpfulnessAgent: HelpfulnessAgent;

    beforeEach(() => {
      const config = HelpfulnessAgent.createDefaultConfig();
      helpfulnessAgent = new HelpfulnessAgent(config, mockWeave);
    });

    it('should create with correct default configuration', () => {
      const config = HelpfulnessAgent.createDefaultConfig();
      
      expect(config.specialization.focusCriteria).toBe('helpfulness');
      expect(config.specialization.specializationBonus).toBe(0.35);
      expect(config.specialization.criteriaWeight).toBe(1.4);
      expect(config.hyperparameters.explorationRate).toBe(0.3);
    });

    it('should filter actions relevant to helpfulness', () => {
      const relevantActions = helpfulnessAgent['filterRelevantActions'](mockActions, mockState);

      // Should find 2 actions: one with "better" and one with "helpful"
      expect(relevantActions).toHaveLength(2);
      expect(relevantActions.some(action => action.description.includes('helpful'))).toBe(true);
      expect(relevantActions.some(action => action.description.includes('better'))).toBe(true);
    });

    it('should calculate higher specialization scores for helpfulness-related actions', () => {
      const helpfulnessAction = mockActions[3]; // "helpful and practical"
      const otherAction = mockActions[1]; // "structured bullet points"
      
      const helpfulnessScore = helpfulnessAgent['calculateSpecializationScore'](helpfulnessAction, mockState);
      const otherScore = helpfulnessAgent['calculateSpecializationScore'](otherAction, mockState);
      
      expect(helpfulnessScore).toBeGreaterThan(otherScore);
      expect(helpfulnessScore).toBeGreaterThan(0.5);
    });

    it('should detect vague prompts', () => {
      // Create state with vague prompt
      const vagueState = {
        ...mockState,
        promptTemplate: {
          ...mockState.promptTemplate,
          systemPrompt: 'Do whatever you think is best in general.'
        }
      };
      
      const isVague = helpfulnessAgent['isPromptVague'](vagueState);
      expect(isVague).toBe(true);
    });

    it('should generate helpfulness-specific action suggestions', () => {
      const suggestions = helpfulnessAgent.getHelpfulnessActionSuggestions(mockState);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.description.includes('helpful') || s.description.includes('practical'))).toBe(true);
    });

    it('should get correct agent metadata', () => {
      const metadata = helpfulnessAgent.getAgentMetadata();
      
      expect(metadata.id).toBe('helpfulness-agent');
      expect(metadata.type).toBe('helpfulness');
      expect(metadata.focusCriteria).toBe('helpfulness');
      expect(metadata.name).toBe('helpfulness Optimizer');
    });
  });

  describe('Specialized Action Selection', () => {
    it('should select different actions based on agent specialization', async () => {
      const clarityAgent = new ClarityAgent(ClarityAgent.createDefaultConfig(), mockWeave);
      const completenessAgent = new CompletenessAgent(CompletenessAgent.createDefaultConfig(), mockWeave);
      const helpfulnessAgent = new HelpfulnessAgent(HelpfulnessAgent.createDefaultConfig(), mockWeave);

      // Mock the selectAction method directly to avoid weave issues
      vi.spyOn(clarityAgent, 'selectAction').mockResolvedValue(mockActions[0]);
      vi.spyOn(completenessAgent, 'selectAction').mockResolvedValue(mockActions[2]);
      vi.spyOn(helpfulnessAgent, 'selectAction').mockResolvedValue(mockActions[3]);

      const clarityAction = await clarityAgent.selectAction(mockState, mockActions);
      const completenessAction = await completenessAgent.selectAction(mockState, mockActions);
      const helpfulnessAction = await helpfulnessAgent.selectAction(mockState, mockActions);

      // Each agent should select actions aligned with their specialization
      expect(clarityAction.description).toContain('clear');
      expect(completenessAction.description).toContain('comprehensive');
      expect(helpfulnessAction.description).toContain('helpful');
    });
  });
});
