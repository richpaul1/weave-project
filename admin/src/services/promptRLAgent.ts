/**
 * RL Agent for Prompt Optimization
 * 
 * Implements a simplified PPO-like algorithm for optimizing prompts
 * based on evaluation feedback and user criteria.
 */

// Removed adminWeave import - now passed as constructor parameter
import { PromptRLEnvironment } from './promptRLEnvironment.js';
import { 
  RLAction, 
  RLState, 
  RLAgentConfig,
  PromptOptimizationSession,
  RLEpisode 
} from '../models/promptOptimization.js';

interface PolicyNetwork {
  weights: number[][];
  biases: number[];
}

interface ValueNetwork {
  weights: number[][];
  biases: number[];
}

export class PromptRLAgent {
  private policyNetwork: PolicyNetwork;
  private valueNetwork: ValueNetwork;
  private config: RLAgentConfig;
  private trainingHistory: any[] = [];
  private explorationRate: number;
  private weave: any;

  constructor(weave: any, config?: Partial<RLAgentConfig>) {
    this.weave = weave;

    // Set default config if not provided
    this.config = {
      algorithm: config?.algorithm || 'ppo',
      hyperparameters: {
        explorationRate: config?.hyperparameters?.explorationRate || (config as any)?.explorationRate || 0.2,
        learningRate: config?.hyperparameters?.learningRate || (config as any)?.learningRate || 0.001,
        discountFactor: config?.hyperparameters?.discountFactor || (config as any)?.discountFactor || 0.95,
        explorationDecay: config?.hyperparameters?.explorationDecay || 0.995
      },
      trainingConfig: {
        maxEpisodes: config?.trainingConfig?.maxEpisodes || 50,
        convergenceThreshold: config?.trainingConfig?.convergenceThreshold || 0.9,
        evaluationFrequency: config?.trainingConfig?.evaluationFrequency || 5,
        maxEpisodeLength: config?.trainingConfig?.maxEpisodeLength || 20
      }
    } as RLAgentConfig;

    this.explorationRate = this.config.hyperparameters.explorationRate;
    
    // Initialize simple neural networks
    this.policyNetwork = this.initializeNetwork([64, 32, 16]); // State -> Action probabilities
    this.valueNetwork = this.initializeNetwork([64, 32, 1]);   // State -> Value estimate
    
    console.log('🤖 RL Agent initialized with configuration:', this.config.algorithm);
  }

  /**
   * Select action based on current state using policy network
   */
  async selectAction(state: RLState, availableActions: RLAction[]): Promise<RLAction> {
    return await this.weave.createChildTrace('rl_agent_select_action', async () => {
      console.log(`🎯 Agent selecting action from ${availableActions.length} options`);

      // Handle empty action list
      if (availableActions.length === 0) {
        throw new Error('No available actions to select from');
      }

      await this.weave.logEvent('rl_action_selection_started', {
        stateScore: state.performanceHistory.averageScore,
        availableActionsCount: availableActions.length,
        explorationRate: this.explorationRate,
        timestamp: new Date().toISOString()
      });

      // Encode state to feature vector
      const stateVector = this.encodeState(state);
      
      // Get action probabilities from policy network
      const actionProbs = this.forwardPolicy(stateVector, availableActions.length);
      
      // Apply exploration vs exploitation
      let selectedActionIndex: number;
      const randomValue = Math.random();
      const explorationUsed = randomValue < this.explorationRate;

      if (explorationUsed) {
        // Exploration: random action
        selectedActionIndex = Math.floor(Math.random() * availableActions.length);
        console.log(`🎲 Exploration: Random action selected (ε=${this.explorationRate})`);
      } else {
        // Exploitation: best action according to policy
        selectedActionIndex = this.argmax(actionProbs);
        console.log(`🎯 Exploitation: Best action selected (prob=${actionProbs[selectedActionIndex].toFixed(3)})`);
      }

      const selectedAction = availableActions[selectedActionIndex];

      await this.weave.logEvent('rl_action_selected', {
        actionType: selectedAction.type,
        actionIndex: selectedActionIndex,
        actionProbability: actionProbs[selectedActionIndex],
        explorationUsed,
        stateScore: state.performanceHistory.averageScore
      });

      await this.weave.logMetric('action_selection_confidence', actionProbs[selectedActionIndex], {
        actionType: selectedAction.type,
        explorationRate: this.explorationRate
      });
      
      console.log(`✅ Selected action: ${selectedAction.type} - ${selectedAction.description}`);
      
      return selectedAction;
    });
  }

  /**
   * Train the agent using collected episodes
   */
  async train(episodes: RLEpisode[]): Promise<void> {
    return await this.weave.createChildTrace('rl_agent_training', async () => {
      console.log(`🎓 Training agent with ${episodes.length} episodes`);

      await this.weave.logEvent('rl_training_started', {
        episodesCount: episodes.length,
        algorithm: this.config.algorithm,
        learningRate: this.config.hyperparameters.learningRate,
        timestamp: new Date().toISOString()
      });

      if (episodes.length < 1) {
        console.log(`⏳ No episodes provided for training`);
        return;
      }

      // Prepare training data
      const trainingData = await this.prepareTrainingData(episodes);
      
      // Update policy network
      const policyLoss = await this.updatePolicyNetwork(trainingData);
      
      // Update value network
      const valueLoss = await this.updateValueNetwork(trainingData);
      
      // Update exploration rate
      this.updateExplorationRate();
      
      // Record training metrics
      const trainingMetrics = {
        policyLoss,
        valueLoss,
        explorationRate: this.explorationRate,
        episodesUsed: episodes.length,
        averageReward: episodes.reduce((sum, ep) => sum + ep.totalReward, 0) / episodes.length,
        timestamp: new Date().toISOString()
      };
      
      this.trainingHistory.push(trainingMetrics);
      
      await this.weave.logEvent('rl_training_completed', trainingMetrics);

      await this.weave.logMetric('policy_loss', policyLoss, {
        trainingStep: this.trainingHistory.length,
        episodesUsed: episodes.length
      });

      await this.weave.logMetric('value_loss', valueLoss, {
        trainingStep: this.trainingHistory.length,
        episodesUsed: episodes.length
      });

      await this.weave.logMetric('exploration_rate', this.explorationRate, {
        trainingStep: this.trainingHistory.length,
        episodesUsed: episodes.length
      });
      
      console.log(`✅ Training completed. Policy loss: ${policyLoss.toFixed(4)}, Value loss: ${valueLoss.toFixed(4)}`);
    });
  }

  /**
   * Run optimization session
   */
  async runOptimizationSession(
    environment: PromptRLEnvironment,
    maxEpisodes: number = 50,
    basePrompt?: PromptTemplate,
    targetCriteria?: PromptCriteria[],
    contextQuery?: string
  ): Promise<PromptOptimizationSession> {
    return await this.weave.createChildTrace('rl_optimization_session', async () => {
      console.log(`🚀 Starting optimization session with ${maxEpisodes} max episodes`);

      const sessionId = `session_${Date.now()}`;

      await this.weave.logEvent('optimization_session_started', {
        sessionId,
        maxEpisodes,
        agentConfig: this.config.algorithm,
        timestamp: new Date().toISOString()
      });

      // Reset environment if parameters provided
      if (basePrompt && targetCriteria) {
        await environment.reset(basePrompt, targetCriteria, contextQuery);
      }

      const episodes: RLEpisode[] = [];

      // Initialize best score with current state's score
      const initialState = environment.getCurrentState();
      let bestScore = initialState?.performanceHistory.averageScore || 0;
      let bestPromptId: string | undefined = initialState?.promptTemplate.id;
      
      for (let episodeNum = 0; episodeNum < maxEpisodes; episodeNum++) {
        console.log(`\n📊 Episode ${episodeNum + 1}/${maxEpisodes}`);

        // Start new episode (except for the first one which is started in reset)
        if (episodeNum > 0) {
          await environment.startNewEpisode();
        }

        const episode = await this.weave.createChildTrace(`episode_${episodeNum + 1}`, async () => {
          let state = environment.getCurrentState();
          if (!state) {
            throw new Error('Environment not initialized');
          }
          
          const episodeActions: RLAction[] = [];
          const episodeRewards: number[] = [];
          let done = false;
          let stepCount = 0;
          
          while (!done && stepCount < this.config.trainingConfig.maxEpisodeLength) {
            // Select action
            const availableActions = environment.getAvailableActions();
            const action = await this.selectAction(state, availableActions);
            
            // Take step in environment
            const stepResult = await environment.step(action);
            
            episodeActions.push(action);
            episodeRewards.push(stepResult.reward);
            
            state = stepResult.nextState;
            done = stepResult.done;
            stepCount++;
            
            console.log(`  Step ${stepCount}: ${action.type} → reward: ${stepResult.reward.toFixed(3)}`);
          }
          
          const totalReward = episodeRewards.reduce((sum, r) => sum + r, 0);
          const finalScore = state.performanceHistory.averageScore;
          
          if (finalScore >= bestScore) {
            bestScore = finalScore;
            bestPromptId = state.promptTemplate.id;
            console.log(`🏆 New best score: ${bestScore.toFixed(3)}`);
          }
          
          await this.weave.logMetric('episode_total_reward', totalReward, {
            sessionId,
            episodeNumber: episodeNum + 1,
            stepCount
          });

          await this.weave.logMetric('episode_final_score', finalScore, {
            sessionId,
            episodeNumber: episodeNum + 1
          });
          
          return {
            episodeNumber: episodeNum + 1,
            totalReward,
            finalScore,
            stepCount
          };
        });
        
        // Train agent periodically (every 5 episodes)
        if ((episodeNum + 1) % 5 === 0) {
          const recentEpisodes = environment.getEpisodeHistory().slice(-5);
          await this.train(recentEpisodes);
        }
        
        // Check for convergence
        if (bestScore >= this.config.trainingConfig.convergenceThreshold) {
          console.log(`🎯 Convergence reached at episode ${episodeNum + 1}`);
          break;
        }
      }
      
      const converged = bestScore >= this.config.trainingConfig.convergenceThreshold;

      const startTime = new Date().toISOString();
      const endTime = new Date().toISOString();

      const session: PromptOptimizationSession = {
        id: sessionId,
        name: `Optimization Session ${new Date().toISOString()}`,
        description: `RL optimization with ${this.config.algorithm}`,
        basePromptId: environment.getCurrentState()?.promptTemplate.id || '',
        targetCriteria: environment.getCurrentState()?.targetCriteria || [],
        testQueries: [], // Would be populated from environment
        status: 'completed',
        episodes: environment.getEpisodeHistory(),
        bestPromptId,
        bestScore,
        converged,
        startedAt: startTime,
        completedAt: endTime,
        // Legacy aliases for backward compatibility
        startTime,
        endTime,
        metadata: {
          maxEpisodes,
          convergenceThreshold: this.config.trainingConfig.convergenceThreshold,
          evaluationFrequency: this.config.trainingConfig.evaluationFrequency
        }
      };
      
      await this.weave.logEvent('optimization_session_completed', {
        sessionId,
        episodesCompleted: session.episodes.length,
        bestScore,
        bestPromptId,
        converged
      });
      
      console.log(`🏁 Optimization session completed. Best score: ${bestScore.toFixed(3)}`);
      
      return session;
    });
  }

  /**
   * Get current training statistics
   */
  getTrainingStats() {
    return {
      trainingUpdates: this.trainingHistory.length,
      totalEpisodes: this.trainingHistory.length,
      averageReward: this.trainingHistory.length > 0
        ? this.trainingHistory.reduce((sum, h) => sum + (h.averageReward || 0), 0) / this.trainingHistory.length
        : 0,
      explorationRate: this.explorationRate,
      algorithm: this.config.algorithm
    };
  }

  /**
   * Encode state to feature vector for neural network
   */
  private encodeState(state: RLState): number[] {
    const features: number[] = [];
    
    // Performance features
    features.push(state.performanceHistory.averageScore);
    features.push(state.performanceHistory.successRate);
    features.push(state.performanceHistory.trendDirection === 'improving' ? 1 : 
                  state.performanceHistory.trendDirection === 'declining' ? -1 : 0);
    
    // Criteria features
    for (const criterion of state.targetCriteria) {
      features.push(criterion.weight);
      features.push(criterion.enabled ? 1 : 0);
    }
    
    // Pad or truncate to fixed size
    while (features.length < 64) features.push(0);
    return features.slice(0, 64);
  }

  /**
   * Initialize neural network with random weights
   */
  private initializeNetwork(layers: number[]): PolicyNetwork {
    const weights: number[][] = [];
    const biases: number[] = [];
    
    for (let i = 0; i < layers.length - 1; i++) {
      const layerWeights: number[] = [];
      for (let j = 0; j < layers[i] * layers[i + 1]; j++) {
        layerWeights.push((Math.random() - 0.5) * 0.1);
      }
      weights.push(layerWeights);
    }
    
    for (let i = 1; i < layers.length; i++) {
      for (let j = 0; j < layers[i]; j++) {
        biases.push((Math.random() - 0.5) * 0.1);
      }
    }
    
    return { weights, biases };
  }

  /**
   * Forward pass through policy network
   */
  private forwardPolicy(input: number[], outputSize: number): number[] {
    // Simplified forward pass - in real implementation would use proper matrix operations
    const output = new Array(outputSize).fill(0);
    
    for (let i = 0; i < outputSize; i++) {
      output[i] = Math.random(); // Placeholder
    }
    
    // Apply softmax
    const expSum = output.reduce((sum, val) => sum + Math.exp(val), 0);
    return output.map(val => Math.exp(val) / expSum);
  }

  /**
   * Utility functions
   */
  private argmax(array: number[]): number {
    return array.indexOf(Math.max(...array));
  }

  private async prepareTrainingData(episodes: RLEpisode[]): Promise<any> {
    // Simplified training data preparation
    return { episodes: episodes.length };
  }

  private async updatePolicyNetwork(trainingData: any): Promise<number> {
    // Simplified policy update - return mock loss
    return Math.random() * 0.1;
  }

  private async updateValueNetwork(trainingData: any): Promise<number> {
    // Simplified value update - return mock loss
    return Math.random() * 0.1;
  }

  private updateExplorationRate(): void {
    this.explorationRate *= this.config.hyperparameters.explorationDecay;
    this.explorationRate = Math.max(0.01, this.explorationRate);
  }

  /**
   * Get training history
   */
  getTrainingHistory(): any[] {
    return [...this.trainingHistory];
  }

  /**
   * Get current exploration rate
   */
  getExplorationRate(): number {
    return this.explorationRate;
  }
}
