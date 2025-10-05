import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PromptEvaluationService } from '../../../src/services/promptEvaluationService.js';
import type {
  PromptTemplate,
  PromptCriteria,
  PromptEvaluation,
  RLState
} from '../../../src/models/promptOptimization.js';

// Mock Weave - will be recreated in beforeEach
let mockWeave: any;

// Mock LLM Service
const mockLLMService = {
  generateResponse: vi.fn().mockResolvedValue({
    text: 'This is a well-structured response that addresses the query comprehensively.',
    metadata: { tokenCount: 50 }
  })
};

// Mock Storage Service
const mockStorageService = {
  saveEvaluation: vi.fn(),
  getEvaluationHistory: vi.fn()
};

describe('PromptEvaluationService', () => {
  let service: PromptEvaluationService;
  let mockPrompt: PromptTemplate;
  let mockCriteria: PromptCriteria[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock weave for each test
    mockWeave = {
      startTrace: vi.fn().mockReturnValue('mock-trace-id'),
      endTrace: vi.fn(),
      logEvent: vi.fn(),
      logMetrics: vi.fn(),
      getCurrentTraceUrl: vi.fn().mockReturnValue('https://test-trace-url.com')
    };

    // Reset mock implementations to default behavior
    mockLLMService.generateResponse.mockResolvedValue({
      text: 'This is a well-structured response that addresses the query comprehensively.',
      metadata: { tokenCount: 50 }
    });
    mockStorageService.saveEvaluation.mockResolvedValue(undefined);

    service = new PromptEvaluationService(
      mockLLMService as any,
      mockStorageService as any,
      mockWeave as any
    );

    mockPrompt = {
      id: 'test-prompt-1',
      name: 'Test Prompt',
      systemPrompt: 'You are a helpful assistant.',
      examples: [
        {
          id: 'example-1',
          userQuery: 'Test query',
          expectedResponse: 'Test response',
          explanation: 'Test explanation'
        }
      ],
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
        evaluationType: 'automated',
        enabled: true
      },
      {
        id: 'criteria-2',
        name: 'concise',
        description: 'Response should be concise',
        weight: 0.2,
        targetValue: 0.7,
        evaluationType: 'automated',
        enabled: true
      }
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('evaluatePrompt', () => {
    it('should evaluate prompt against all criteria', async () => {
      // Arrange
      const testQueries = ['Query 1', 'Query 2'];
      const mockResponse = { text: 'Test response from LLM' };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockResolvedValue(undefined);

      // Act
      const result = await service.evaluatePrompt(mockPrompt, testQueries, mockCriteria);

      // Assert
      expect(result).toHaveLength(2);
      expect(mockLLMService.generateResponse).toHaveBeenCalledTimes(2);
      expect(mockStorageService.saveEvaluation).toHaveBeenCalledTimes(2);
      expect(mockWeave.startTrace).toHaveBeenCalled();
      expect(mockWeave.endTrace).toHaveBeenCalled();
      expect(mockWeave.logEvent).toHaveBeenCalled();
      expect(mockWeave.logMetrics).toHaveBeenCalled();
      
      // Check evaluation structure
      result.forEach(evaluation => {
        expect(evaluation).toMatchObject({
          id: expect.any(String),
          promptId: mockPrompt.id,
          testQuery: expect.any(String),
          response: expect.any(String),
          criteriaScores: expect.any(Object),
          overallScore: expect.any(Number),
          metadata: expect.objectContaining({
            responseTime: expect.any(Number),
            tokenCount: expect.any(Number),
            timestamp: expect.any(String),
            evaluatorType: 'automated'
          })
        });
      });
    });

    it('should handle LLM service errors gracefully', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const error = new Error('LLM service error');
      
      mockLLMService.generateResponse.mockRejectedValue(error);

      // Act & Assert
      await expect(service.evaluatePrompt(mockPrompt, testQueries, mockCriteria))
        .rejects.toThrow('LLM service error');
    });

    it('should calculate correct overall scores', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const mockResponse = { 
        text: 'This is a well-structured and concise response with bullet points:\n• Point 1\n• Point 2' 
      };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockResolvedValue(undefined);

      // Act
      const result = await service.evaluatePrompt(mockPrompt, testQueries, mockCriteria);

      // Assert
      expect(result).toHaveLength(1);
      const evaluation = result[0];
      
      // Check that scores are calculated
      expect(evaluation.criteriaScores).toHaveProperty('criteria-1');
      expect(evaluation.criteriaScores).toHaveProperty('criteria-2');
      expect(evaluation.overallScore).toBeGreaterThan(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(1);
    });
  });

  describe('createRLState', () => {
    it('should create valid RL state from prompt and evaluations', async () => {
      // Arrange
      const recentEvaluations: PromptEvaluation[] = [
        {
          id: 'eval-1',
          promptId: mockPrompt.id,
          testQuery: 'Test query',
          response: 'Test response',
          criteriaScores: { structured: 0.8, concise: 0.7 },
          overallScore: 0.75,
          metadata: {
            responseTime: 100,
            tokenCount: 50,
            timestamp: new Date().toISOString(),
            evaluatorType: 'automated'
          }
        }
      ];
      const contextQuery = 'Test context query';

      // Act
      const result = await service.createRLState(mockPrompt, recentEvaluations, contextQuery);

      // Assert
      expect(result).toMatchObject({
        promptTemplate: mockPrompt,
        recentEvaluations: recentEvaluations,
        targetCriteria: expect.any(Array),
        contextQuery: contextQuery,
        performanceHistory: {
          averageScore: 0.75,
          trendDirection: expect.any(String),
          successRate: expect.any(Number)
        }
      });
      
      expect(mockWeave.startTrace).toHaveBeenCalled();
      expect(mockWeave.endTrace).toHaveBeenCalled();
      expect(mockWeave.logEvent).toHaveBeenCalled();
    });

    it('should handle empty evaluation history', async () => {
      // Arrange
      const recentEvaluations: PromptEvaluation[] = [];
      const contextQuery = 'Test context query';

      // Act
      const result = await service.createRLState(mockPrompt, recentEvaluations, contextQuery);

      // Assert
      expect(result.performanceHistory.averageScore).toBe(0);
      expect(result.performanceHistory.trendDirection).toBe('stable');
      expect(result.performanceHistory.successRate).toBe(0);
    });
  });

  describe('criterion evaluators', () => {
    it('should evaluate structured criterion correctly', async () => {
      // Arrange
      const structuredResponse = 'Here are the key points:\n• Point 1\n• Point 2\n• Point 3';
      const unstructuredResponse = 'This is just a plain text response without structure';

      // Act
      const structuredScore = await (service as any).evaluateStructure(structuredResponse);
      const unstructuredScore = await (service as any).evaluateStructure(unstructuredResponse);

      // Assert
      expect(structuredScore).toBeGreaterThan(unstructuredScore);
      expect(structuredScore).toBeGreaterThan(0.5);
      expect(unstructuredScore).toBeLessThan(0.5);
    });

    it('should evaluate conciseness criterion correctly', async () => {
      // Arrange
      const conciseResponse = 'Short and to the point.';
      const verboseResponse = 'This is a very long response that goes on and on with lots of unnecessary details and repetitive information that could be much shorter and more concise but instead continues to ramble without adding much value to the actual content being conveyed to the reader who is probably getting bored by now.';

      // Act
      const conciseScore = await (service as any).evaluateConciseness(conciseResponse, 10); // Target closer to concise length
      const verboseScore = await (service as any).evaluateConciseness(verboseResponse, 10);

      // Assert
      expect(conciseScore).toBeGreaterThan(verboseScore);
      expect(conciseScore).toBeGreaterThan(0.7);
      expect(verboseScore).toBeLessThan(0.3);
    });

    it('should evaluate actionability criterion correctly', async () => {
      // Arrange
      const actionableResponse = 'To solve this problem: 1. First, do X. 2. Then, do Y. 3. Finally, do Z.';
      const nonActionableResponse = 'This is a general description without specific steps or actions.';

      // Act
      const actionableScore = await (service as any).evaluateActionability(actionableResponse);
      const nonActionableScore = await (service as any).evaluateActionability(nonActionableResponse);

      // Assert
      expect(actionableScore).toBeGreaterThan(nonActionableScore);
      expect(actionableScore).toBeGreaterThan(0.3);
    });

    it('should evaluate relevance criterion correctly', async () => {
      // Arrange
      const query = 'How do I learn Python programming?';
      const relevantResponse = 'To learn Python programming, start with basic syntax, then practice with projects.';
      const irrelevantResponse = 'The weather is nice today and I like ice cream.';

      // Act
      const relevantScore = await (service as any).evaluateRelevance(relevantResponse, query);
      const irrelevantScore = await (service as any).evaluateRelevance(irrelevantResponse, query);

      // Assert
      expect(relevantScore).toBeGreaterThan(irrelevantScore);
      expect(relevantScore).toBeGreaterThan(0.5);
      expect(irrelevantScore).toBeLessThan(0.2);
    });
  });

  describe('error handling', () => {
    it('should handle storage service errors', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const mockResponse = { text: 'Test response' };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockRejectedValue(new Error('Storage error'));

      // Act & Assert
      await expect(service.evaluatePrompt(mockPrompt, testQueries, mockCriteria))
        .rejects.toThrow('Storage error');
    });

    it('should handle invalid response format', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const invalidResponse = null;
      
      mockLLMService.generateResponse.mockResolvedValue(invalidResponse);

      // Act & Assert
      await expect(service.evaluatePrompt(mockPrompt, testQueries, mockCriteria))
        .rejects.toThrow('Invalid response format from LLM service');
    });
  });

  describe('weave instrumentation', () => {
    it('should create child traces for all operations', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const mockResponse = { text: 'Test response' };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockResolvedValue(undefined);

      // Act
      await service.evaluatePrompt(mockPrompt, testQueries, mockCriteria);

      // Assert
      expect(mockWeave.startTrace).toHaveBeenCalledWith(
        'prompt_evaluation',
        expect.any(Object)
      );
      expect(mockWeave.endTrace).toHaveBeenCalled();
    });

    it('should log metrics for evaluation scores', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const mockResponse = { text: 'Test response' };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockResolvedValue(undefined);

      // Act
      await service.evaluatePrompt(mockPrompt, testQueries, mockCriteria);

      // Assert
      expect(mockWeave.logMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation_score: expect.any(Number)
        })
      );
    });

    it('should log events for evaluation lifecycle', async () => {
      // Arrange
      const testQueries = ['Query 1'];
      const mockResponse = { text: 'Test response' };
      
      mockLLMService.generateResponse.mockResolvedValue(mockResponse);
      mockStorageService.saveEvaluation.mockResolvedValue(undefined);

      // Act
      await service.evaluatePrompt(mockPrompt, testQueries, mockCriteria);

      // Assert
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'prompt_evaluation_started',
        expect.any(Object)
      );
      expect(mockWeave.logEvent).toHaveBeenCalledWith(
        'prompt_evaluation_completed',
        expect.any(Object)
      );
    });
  });
});
