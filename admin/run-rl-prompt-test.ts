#!/usr/bin/env tsx

/**
 * RL Prompt Optimization Integration Test
 * 
 * This test demonstrates the complete RL prompt optimization system:
 * 1. Initialize Weave instrumentation
 * 2. Create test prompts and criteria
 * 3. Set up RL environment and agent
 * 4. Run optimization episodes
 * 5. Analyze results and trace URLs
 */

import { adminWeave, initializeWeave } from './src/weave/init.js';
import { PromptEvaluationService } from './src/services/promptEvaluationService.js';
import { PromptRLEnvironment } from './src/services/promptRLEnvironment.js';
import { PromptRLAgent } from './src/services/promptRLAgent.js';
import { 
  PromptTemplate, 
  PromptCriteria, 
  RLAgentConfig 
} from './src/models/promptOptimization.js';

// Mock LLM and Storage services for testing
class MockLLMService {
  async generateCompletion(prompt: string, query: string): Promise<any> {
    return {
      text: `Mock response for: ${query}`,
      tokens: 50,
      responseTime: 100
    };
  }
}

class MockStorageService {
  async storePrompt(prompt: PromptTemplate): Promise<void> {
    console.log(`📝 Stored prompt: ${prompt.name}`);
  }
  
  async storeEvaluation(evaluation: any): Promise<void> {
    console.log(`📊 Stored evaluation with score: ${evaluation.overallScore}`);
  }
}

async function createTestPrompt(): Promise<PromptTemplate> {
  return {
    id: 'test_prompt_001',
    name: 'Course Recommendation Assistant',
    description: 'Helps users find relevant courses based on their learning goals',
    systemPrompt: `You are a helpful course recommendation assistant. When users ask about learning topics, provide relevant course suggestions with clear explanations.

Always be helpful and provide actionable recommendations.`,
    examples: [
      {
        id: 'example_1',
        input: 'I want to learn machine learning',
        expectedOutput: 'Here are some excellent machine learning courses:\n\n• Introduction to Machine Learning - Perfect for beginners\n• Advanced ML Algorithms - For those with programming experience\n• Practical ML Projects - Hands-on learning approach\n\nWould you like more details about any of these courses?',
        weight: 1.0,
        metadata: {}
      }
    ],
    criteria: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    metadata: {
      useCase: 'course_recommendation',
      targetDomain: 'education',
      expectedResponseLength: 150,
      tone: 'friendly',
      format: 'structured'
    }
  };
}

async function createTestCriteria(): Promise<PromptCriteria[]> {
  return [
    {
      id: 'criteria_structured',
      name: 'structured',
      description: 'Response should be well-structured with bullet points or numbered lists',
      weight: 0.3,
      evaluationType: 'boolean',
      target: true,
      enabled: true
    },
    {
      id: 'criteria_actionable',
      name: 'actionable',
      description: 'Response should include actionable recommendations',
      weight: 0.25,
      evaluationType: 'boolean',
      target: true,
      enabled: true
    },
    {
      id: 'criteria_concise',
      name: 'concise',
      description: 'Response should be concise (under 200 words)',
      weight: 0.2,
      evaluationType: 'numeric',
      target: 200,
      enabled: true
    },
    {
      id: 'criteria_relevant',
      name: 'relevant',
      description: 'Response should be relevant to the user query',
      weight: 0.25,
      evaluationType: 'numeric',
      target: 0.8,
      enabled: true
    }
  ];
}

async function createRLAgentConfig(): Promise<RLAgentConfig> {
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
    }
  };
}

async function runRLPromptOptimizationTest(): Promise<void> {
  console.log('🚀 Starting RL Prompt Optimization Integration Test');
  console.log('=' .repeat(80));
  
  try {
    // Initialize Weave
    console.log('\n📡 Initializing Weave for RL Prompt Optimization...');
    await initializeWeave();
    console.log('✅ Weave initialized successfully');
    
    // Create test data
    console.log('\n📋 Creating test prompt and criteria...');
    const testPrompt = await createTestPrompt();
    const testCriteria = await createTestCriteria();
    const testQueries = [
      'I want to learn Python programming',
      'What courses do you recommend for data science?',
      'I need help with machine learning fundamentals',
      'Can you suggest advanced AI courses?'
    ];
    
    console.log(`✅ Created test prompt: ${testPrompt.name}`);
    console.log(`✅ Created ${testCriteria.length} evaluation criteria`);
    console.log(`✅ Prepared ${testQueries.length} test queries`);
    
    // Initialize services
    console.log('\n🔧 Initializing RL optimization services...');
    const mockLLM = new MockLLMService();
    const mockStorage = new MockStorageService();
    
    const evaluationService = new PromptEvaluationService(mockLLM, mockStorage);
    const rlEnvironment = new PromptRLEnvironment(evaluationService, testQueries);
    
    const agentConfig = await createRLAgentConfig();
    const rlAgent = new PromptRLAgent(agentConfig);
    
    console.log('✅ Services initialized successfully');
    
    // Test 1: Baseline Evaluation
    console.log('\n🧪 Test 1: Baseline Prompt Evaluation');
    const baselineEvaluations = await adminWeave.createChildTrace('baseline_evaluation', async () => {
      console.log('📊 Evaluating baseline prompt performance...');
      
      const evaluations = await evaluationService.evaluatePrompt(
        testPrompt,
        testQueries.slice(0, 2), // Use subset for faster testing
        testCriteria
      );
      
      const averageScore = evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length;
      console.log(`📈 Baseline average score: ${averageScore.toFixed(3)}`);
      
      await adminWeave.logEvent('baseline_evaluation_completed', {
        promptId: testPrompt.id,
        averageScore,
        evaluationsCount: evaluations.length
      });
      
      return evaluations;
    });
    
    // Test 2: RL Environment Setup
    console.log('\n🧪 Test 2: RL Environment Initialization');
    await adminWeave.createChildTrace('rl_environment_setup', async () => {
      console.log('🔄 Resetting RL environment...');
      
      // Update prompt criteria
      testPrompt.criteria = testCriteria;
      
      const initialState = await rlEnvironment.reset(
        testPrompt,
        testCriteria,
        testQueries[0]
      );
      
      console.log(`✅ Environment reset. Initial score: ${initialState.performanceHistory.averageScore.toFixed(3)}`);
      
      // Test available actions
      const availableActions = rlEnvironment.getAvailableActions();
      console.log(`🎯 Available actions: ${availableActions.length}`);
      
      for (const action of availableActions.slice(0, 3)) {
        console.log(`  • ${action.type}: ${action.description}`);
      }
      
      await adminWeave.logEvent('rl_environment_initialized', {
        promptId: testPrompt.id,
        initialScore: initialState.performanceHistory.averageScore,
        availableActionsCount: availableActions.length
      });
    });
    
    // Test 3: Single RL Episode
    console.log('\n🧪 Test 3: Single RL Episode Execution');
    await adminWeave.createChildTrace('single_rl_episode', async () => {
      console.log('🎮 Running single RL episode...');
      
      const state = rlEnvironment.getCurrentState()!;
      const availableActions = rlEnvironment.getAvailableActions();
      
      // Agent selects action
      const selectedAction = await rlAgent.selectAction(state, availableActions);
      console.log(`🎯 Agent selected: ${selectedAction.type} - ${selectedAction.description}`);
      
      // Execute action in environment
      const stepResult = await rlEnvironment.step(selectedAction);
      
      console.log(`📊 Step result:`);
      console.log(`  • Reward: ${stepResult.reward.toFixed(3)}`);
      console.log(`  • New score: ${stepResult.nextState.performanceHistory.averageScore.toFixed(3)}`);
      console.log(`  • Episode done: ${stepResult.done}`);
      
      await adminWeave.logEvent('rl_episode_step_completed', {
        actionType: selectedAction.type,
        reward: stepResult.reward,
        newScore: stepResult.nextState.performanceHistory.averageScore,
        episodeDone: stepResult.done
      });
    });
    
    // Test 4: Multi-Episode Optimization
    console.log('\n🧪 Test 4: Multi-Episode Optimization Session');
    const optimizationSession = await adminWeave.createChildTrace('optimization_session', async () => {
      console.log('🚀 Running optimization session with 5 episodes...');
      
      // Reset environment for fresh start
      await rlEnvironment.reset(testPrompt, testCriteria, testQueries[0]);
      
      const session = await rlAgent.runOptimizationSession(rlEnvironment, 5);
      
      console.log(`🏁 Optimization session completed:`);
      console.log(`  • Episodes completed: ${session.episodes.length}`);
      console.log(`  • Best score achieved: ${session.bestScore.toFixed(3)}`);
      console.log(`  • Best prompt ID: ${session.bestPromptId}`);
      console.log(`  • Status: ${session.status}`);
      
      return session;
    });
    
    // Test 5: Training Analysis
    console.log('\n🧪 Test 5: Training Analysis and Metrics');
    await adminWeave.createChildTrace('training_analysis', async () => {
      console.log('📈 Analyzing training results...');
      
      const trainingHistory = rlAgent.getTrainingHistory();
      const episodeHistory = rlEnvironment.getEpisodeHistory();
      
      console.log(`📊 Training Statistics:`);
      console.log(`  • Training updates: ${trainingHistory.length}`);
      console.log(`  • Total episodes: ${episodeHistory.length}`);
      console.log(`  • Current exploration rate: ${rlAgent.getExplorationRate().toFixed(3)}`);
      
      if (episodeHistory.length > 0) {
        const totalRewards = episodeHistory.map(ep => ep.totalReward);
        const avgReward = totalRewards.reduce((a, b) => a + b, 0) / totalRewards.length;
        const maxReward = Math.max(...totalRewards);
        
        console.log(`  • Average episode reward: ${avgReward.toFixed(3)}`);
        console.log(`  • Maximum episode reward: ${maxReward.toFixed(3)}`);
      }
      
      await adminWeave.logEvent('training_analysis_completed', {
        trainingUpdates: trainingHistory.length,
        totalEpisodes: episodeHistory.length,
        explorationRate: rlAgent.getExplorationRate(),
        sessionId: optimizationSession.id
      });
    });
    
    // Test 6: Final Evaluation
    console.log('\n🧪 Test 6: Final Optimized Prompt Evaluation');
    await adminWeave.createChildTrace('final_evaluation', async () => {
      console.log('🎯 Evaluating final optimized prompt...');
      
      const finalState = rlEnvironment.getCurrentState();
      if (finalState) {
        const finalEvaluations = await evaluationService.evaluatePrompt(
          finalState.promptTemplate,
          testQueries.slice(0, 2),
          testCriteria
        );
        
        const finalScore = finalEvaluations.reduce((sum, e) => sum + e.overallScore, 0) / finalEvaluations.length;
        const baselineScore = baselineEvaluations.reduce((sum, e) => sum + e.overallScore, 0) / baselineEvaluations.length;
        const improvement = finalScore - baselineScore;
        
        console.log(`📈 Final Results:`);
        console.log(`  • Baseline score: ${baselineScore.toFixed(3)}`);
        console.log(`  • Final score: ${finalScore.toFixed(3)}`);
        console.log(`  • Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(3)} (${(improvement/baselineScore*100).toFixed(1)}%)`);
        
        await adminWeave.logEvent('final_evaluation_completed', {
          baselineScore,
          finalScore,
          improvement,
          improvementPercentage: improvement/baselineScore*100
        });
      }
    });
    
    // Get trace URL
    console.log('\n🔗 Attempting to get trace URL...');
    const traceUrl = adminWeave.getCurrentTraceUrl();
    
    if (traceUrl) {
      console.log('\n' + '='.repeat(80));
      console.log('🎉 SUCCESS! RL Prompt Optimization Test Completed');
      console.log('🔗 COMPREHENSIVE TRACE URL FOR ANALYSIS:');
      console.log(traceUrl);
      console.log('='.repeat(80));
      console.log('\n📊 Use this URL to analyze the complete RL optimization process:');
      console.log('🔍 • Parent-child trace relationships');
      console.log('🎯 • RL agent decision making');
      console.log('📈 • Prompt evaluation metrics');
      console.log('🎮 • Episode progression and rewards');
      console.log('🧠 • Training and optimization traces');
    } else {
      console.log('\n' + '='.repeat(80));
      console.log('✅ RL Prompt Optimization Test Completed Successfully');
      console.log('ℹ️  Trace URL not available (may be running in local mode)');
      console.log('📊 Check console logs for detailed trace information');
      console.log('='.repeat(80));
    }
    
  } catch (error) {
    console.error('\n❌ RL Prompt Optimization test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runRLPromptOptimizationTest().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
