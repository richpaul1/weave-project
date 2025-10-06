/**
 * Ensemble Coordinator for Multi-Agent RL Optimization
 * 
 * Manages multiple specialized RL agents, coordinates their execution,
 * and combines their results using various fusion strategies.
 */

import { ClarityAgent } from './clarityAgent.js';
import { CompletenessAgent } from './completenessAgent.js';
import { HelpfulnessAgent } from './helpfulnessAgent.js';
import { SpecializedRLAgent, SpecializedOptimizationResult } from './specializedRLAgent.js';
import { PromptRLEnvironment } from '../promptRLEnvironment.js';
import { 
  PromptTemplate, 
  PromptCriteria 
} from '../../models/promptOptimization.js';
import type {
  EnsembleConfig,
  EnsembleResult,
  SpecializedAgent,
  MultiCriteriaScores
} from '../../models/promptOptimizationEnhanced.js';

export interface EnsembleSession {
  sessionId: string;
  config: EnsembleConfig;
  agents: SpecializedRLAgent[];
  results: SpecializedOptimizationResult[];
  fusedResult: EnsembleResult['fusedResult'] | null;
  diversityMetrics: EnsembleResult['diversityMetrics'] | null;
  status: 'created' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  executionTime?: number;
}

export interface EnsembleExecutionOptions {
  maxEpisodes: number;
  parallelExecution: boolean;
  timeoutMinutes: number;
  convergenceThreshold: number;
  diversityWeight: number;
}

/**
 * Ensemble Coordinator for managing multiple specialized RL agents
 */
export class EnsembleCoordinator {
  private weave: any;

  constructor(weave: any) {
    this.weave = weave;

    // Bind methods directly (weave.op not available in our WeaveService)
    this.createEnsembleSession = this._createEnsembleSessionImpl.bind(this);
    this.executeEnsembleOptimization = this._executeEnsembleOptimizationImpl.bind(this);
    this.fuseResults = this._fuseResultsImpl.bind(this);
  }

  /**
   * Create ensemble session with specialized agents
   */
  async _createEnsembleSessionImpl(config: EnsembleConfig, options: EnsembleExecutionOptions): Promise<EnsembleSession> {
    const sessionId = `ensemble_${Date.now()}`;
    
    await this.weave.logEvent('ensemble_session_created', {
      sessionId,
      agentCount: config.agents.length,
      fusionStrategy: config.fusionStrategy,
      parallelExecution: config.parallelExecution
    });

    // Create specialized agents based on configuration
    const agents = await this.createSpecializedAgents(config.agents);

    const session: EnsembleSession = {
      sessionId,
      config,
      agents,
      results: [],
      fusedResult: null,
      diversityMetrics: null,
      status: 'created',
      startTime: new Date().toISOString()
    };

    return session;
  }

  /**
   * Execute ensemble optimization with multiple agents
   */
  async _executeEnsembleOptimizationImpl(
    session: EnsembleSession,
    environment: PromptRLEnvironment,
    basePrompt: PromptTemplate,
    targetCriteria: PromptCriteria[],
    contextQuery?: string
  ): Promise<EnsembleResult> {
    const traceId = this.weave.startTrace('ensemble_optimization_execution', {
      sessionId: session.sessionId,
      agentCount: session.agents.length,
      fusionStrategy: session.config.fusionStrategy,
      parallelExecution: session.config.parallelExecution
    });

    try {
      console.log(`🎭 Starting ensemble optimization with ${session.agents.length} specialized agents`);
      
      session.status = 'running';
      const startTime = Date.now();

      await this.weave.logEvent('ensemble_optimization_started', {
        sessionId: session.sessionId,
        agentCount: session.agents.length,
        fusionStrategy: session.config.fusionStrategy,
        parallelExecution: session.config.parallelExecution
      });

      try {
        // Execute agents based on parallel/sequential configuration
        if (session.config.parallelExecution) {
          session.results = await this.executeAgentsInParallel(
            session.agents,
            environment,
            basePrompt,
            targetCriteria,
            contextQuery
          );
        } else {
          session.results = await this.executeAgentsSequentially(
            session.agents,
            environment,
            basePrompt,
            targetCriteria,
            contextQuery
          );
        }

        // Fuse results using configured strategy
        const ensembleResult = await this.fuseResults(session.results, session.config);
        
        session.fusedResult = ensembleResult.fusedResult;
        session.diversityMetrics = ensembleResult.diversityMetrics;
        session.status = 'completed';
        session.endTime = new Date().toISOString();
        session.executionTime = Date.now() - startTime;

        await this.weave.logEvent('ensemble_optimization_completed', {
          sessionId: session.sessionId,
          executionTime: session.executionTime,
          fusedScore: ensembleResult.fusedResult.score,
          consensus: ensembleResult.fusedResult.consensus,
          diversityScore: ensembleResult.diversityMetrics.promptVariety
        });

        this.weave.endTrace(traceId, {
          sessionId: session.sessionId,
          executionTime: session.executionTime,
          fusedScore: ensembleResult.fusedResult.score,
          consensus: ensembleResult.fusedResult.consensus,
          success: true
        });

        return ensembleResult;

      } catch (error) {
        session.status = 'failed';
        session.endTime = new Date().toISOString();
        session.executionTime = Date.now() - startTime;

        await this.weave.logEvent('ensemble_optimization_failed', {
          sessionId: session.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTime: session.executionTime
        });

        this.weave.endTrace(traceId, {
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTime: session.executionTime
        });

        throw error;
      }
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Create specialized agents from configuration
   */
  private async createSpecializedAgents(agentConfigs: SpecializedAgent[]): Promise<SpecializedRLAgent[]> {
    const agents: SpecializedRLAgent[] = [];

    for (const agentConfig of agentConfigs) {
      let agent: SpecializedRLAgent;

      const specializedConfig = {
        algorithm: 'ppo' as const,
        hyperparameters: {
          learningRate: agentConfig.config.learningRate,
          discountFactor: 0.95,
          explorationRate: agentConfig.config.explorationRate,
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
        },
        specialization: {
          focusCriteria: agentConfig.focusCriteria,
          specializationBonus: agentConfig.config.specializationBonus,
          criteriaWeight: agentConfig.weight,
          diversityPenalty: 0.1
        }
      };

      switch (agentConfig.type) {
        case 'clarity':
          agent = new ClarityAgent(specializedConfig, this.weave);
          break;
        case 'completeness':
          agent = new CompletenessAgent(specializedConfig, this.weave);
          break;
        case 'helpfulness':
          agent = new HelpfulnessAgent(specializedConfig, this.weave);
          break;
        default:
          throw new Error(`Unsupported agent type: ${agentConfig.type}`);
      }

      agents.push(agent);
    }

    return agents;
  }

  /**
   * Execute agents in parallel
   */
  private async executeAgentsInParallel(
    agents: SpecializedRLAgent[],
    environment: PromptRLEnvironment,
    basePrompt: PromptTemplate,
    targetCriteria: PromptCriteria[],
    contextQuery?: string
  ): Promise<SpecializedOptimizationResult[]> {
    const traceId = this.weave.startTrace('ensemble_parallel_execution', {
      agentCount: agents.length
    });

    try {
      console.log(`🔄 Executing ${agents.length} agents in parallel`);

      // Create separate environment instances for each agent
      const agentPromises = agents.map(async (agent, index) => {
        const agentTraceId = this.weave.startTrace(`agent_${index}_execution`, {
          agentIndex: index,
          agentType: agent.constructor.name
        });

        try {
          // Each agent gets its own environment copy to avoid conflicts
          const agentEnvironment = new PromptRLEnvironment(
            environment['evaluationService'],
            this.weave
          );

          const result = await agent.runSpecializedOptimization(
            agentEnvironment,
            20, // maxEpisodes
            basePrompt,
            targetCriteria,
            contextQuery
          );

          this.weave.endTrace(agentTraceId, {
            agentId: result.agentId,
            bestScore: result.bestScore,
            iterations: result.iterations,
            success: true
          });

          return result;
        } catch (error) {
          this.weave.endTrace(agentTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
          throw error;
        }
      });

      const results = await Promise.all(agentPromises);

      await this.weave.logEvent('parallel_execution_completed', {
        agentCount: agents.length,
        results: results.map(r => ({
          agentId: r.agentId,
          bestScore: r.bestScore,
          iterations: r.iterations,
          convergenceReached: r.convergenceReached
        }))
      });

      this.weave.endTrace(traceId, {
        agentCount: agents.length,
        resultsCount: results.length,
        success: true
      });

      return results;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Execute agents sequentially
   */
  private async executeAgentsSequentially(
    agents: SpecializedRLAgent[],
    environment: PromptRLEnvironment,
    basePrompt: PromptTemplate,
    targetCriteria: PromptCriteria[],
    contextQuery?: string
  ): Promise<SpecializedOptimizationResult[]> {
    const traceId = this.weave.startTrace('ensemble_sequential_execution', {
      agentCount: agents.length
    });

    try {
      console.log(`🔄 Executing ${agents.length} agents sequentially`);

      const results: SpecializedOptimizationResult[] = [];

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        
        const agentTraceId = this.weave.startTrace(`agent_${i}_execution`, {
          agentIndex: i,
          agentType: agent.constructor.name
        });

        try {
          const result = await agent.runSpecializedOptimization(
            environment,
            20, // maxEpisodes
            basePrompt,
            targetCriteria,
            contextQuery
          );

          this.weave.endTrace(agentTraceId, {
            agentId: result.agentId,
            bestScore: result.bestScore,
            iterations: result.iterations,
            success: true
          });

          results.push(result);
        } catch (error) {
          this.weave.endTrace(agentTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
          throw error;
        }

        // Use the best result so far as the starting point for the next agent
        if (result.bestScore > (basePrompt as any).score || 0) {
          basePrompt = result.bestPrompt;
        }
      }

      await this.weave.logEvent('sequential_execution_completed', {
        agentCount: agents.length,
        results: results.map(r => ({
          agentId: r.agentId,
          bestScore: r.bestScore,
          iterations: r.iterations,
          convergenceReached: r.convergenceReached
        }))
      });

      this.weave.endTrace(traceId, {
        agentCount: agents.length,
        resultsCount: results.length,
        success: true
      });

      return results;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Fuse results from multiple agents using configured strategy
   */
  async _fuseResultsImpl(results: SpecializedOptimizationResult[], config: EnsembleConfig): Promise<EnsembleResult> {
    const traceId = this.weave.startTrace('ensemble_result_fusion', {
      resultsCount: results.length,
      fusionStrategy: config.fusionStrategy
    });

    try {
      console.log(`🔀 Fusing results from ${results.length} agents using ${config.fusionStrategy}`);

      await this.weave.logEvent('result_fusion_started', {
        agentCount: results.length,
        fusionStrategy: config.fusionStrategy,
        consensusThreshold: config.consensusThreshold
      });

      // Calculate diversity metrics
      const diversityMetrics = this.calculateDiversityMetrics(results);

      // Apply fusion strategy
      let fusedResult: EnsembleResult['fusedResult'];

      switch (config.fusionStrategy) {
        case 'weighted_voting':
          fusedResult = await this.weightedVotingFusion(results, config);
          break;
        case 'consensus':
          fusedResult = await this.consensusFusion(results, config);
          break;
        case 'best_of_breed':
          fusedResult = await this.bestOfBreedFusion(results, config);
          break;
        case 'hybrid':
          fusedResult = await this.hybridFusion(results, config);
          break;
        default:
          throw new Error(`Unsupported fusion strategy: ${config.fusionStrategy}`);
      }

      const ensembleResult: EnsembleResult = {
        agentResults: results.map(r => ({
          agentId: r.agentId,
          prompt: r.bestPrompt.systemPrompt,
          score: r.bestScore,
          criteriaScores: r.criteriaScores,
          confidence: r.confidence
        })),
        fusedResult,
        diversityMetrics
      };

      await this.weave.logEvent('result_fusion_completed', {
        fusionStrategy: config.fusionStrategy,
        fusedScore: fusedResult.score,
        consensus: fusedResult.consensus,
        diversityScore: diversityMetrics.promptVariety
      });

      this.weave.endTrace(traceId, {
        fusionStrategy: config.fusionStrategy,
        fusedScore: fusedResult.score,
        consensus: fusedResult.consensus,
        success: true
      });

      return ensembleResult;
    } catch (error) {
      this.weave.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Weighted voting fusion strategy
   */
  private async weightedVotingFusion(results: SpecializedOptimizationResult[], config: EnsembleConfig): Promise<EnsembleResult['fusedResult']> {
    // Find agent weights from config
    const agentWeights = new Map<string, number>();
    config.agents.forEach(agent => {
      agentWeights.set(agent.id, agent.weight);
    });

    // Calculate weighted scores
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const weightedCriteriaScores: MultiCriteriaScores = {
      relevance: 0, clarity: 0, completeness: 0, accuracy: 0, helpfulness: 0, engagement: 0
    };

    for (const result of results) {
      const weight = agentWeights.get(result.agentId) || 1.0;
      totalWeightedScore += result.bestScore * weight;
      totalWeight += weight;

      // Weight criteria scores
      Object.keys(weightedCriteriaScores).forEach(criteria => {
        weightedCriteriaScores[criteria as keyof MultiCriteriaScores] +=
          result.criteriaScores[criteria as keyof MultiCriteriaScores] * weight;
      });
    }

    // Normalize scores
    const finalScore = totalWeightedScore / totalWeight;
    Object.keys(weightedCriteriaScores).forEach(criteria => {
      weightedCriteriaScores[criteria as keyof MultiCriteriaScores] /= totalWeight;
    });

    // Select best prompt (highest weighted score)
    const bestResult = results.reduce((best, current) => {
      const currentWeightedScore = current.bestScore * (agentWeights.get(current.agentId) || 1.0);
      const bestWeightedScore = best.bestScore * (agentWeights.get(best.agentId) || 1.0);
      return currentWeightedScore > bestWeightedScore ? current : best;
    });

    // Calculate consensus (agreement level)
    const consensus = this.calculateConsensus(results);

    return {
      prompt: bestResult.bestPrompt.systemPrompt,
      score: finalScore,
      criteriaScores: weightedCriteriaScores,
      consensus
    };
  }

  /**
   * Consensus fusion strategy
   */
  private async consensusFusion(results: SpecializedOptimizationResult[], config: EnsembleConfig): Promise<EnsembleResult['fusedResult']> {
    const consensus = this.calculateConsensus(results);

    if (consensus < config.consensusThreshold) {
      // Low consensus - use weighted voting as fallback
      return await this.weightedVotingFusion(results, config);
    }

    // High consensus - use average of top performers
    const sortedResults = results.sort((a, b) => b.bestScore - a.bestScore);
    const topResults = sortedResults.slice(0, Math.ceil(results.length * 0.6));

    const avgScore = topResults.reduce((sum, r) => sum + r.bestScore, 0) / topResults.length;
    const avgCriteriaScores: MultiCriteriaScores = {
      relevance: 0, clarity: 0, completeness: 0, accuracy: 0, helpfulness: 0, engagement: 0
    };

    Object.keys(avgCriteriaScores).forEach(criteria => {
      avgCriteriaScores[criteria as keyof MultiCriteriaScores] =
        topResults.reduce((sum, r) => sum + r.criteriaScores[criteria as keyof MultiCriteriaScores], 0) / topResults.length;
    });

    return {
      prompt: topResults[0].bestPrompt.systemPrompt,
      score: avgScore,
      criteriaScores: avgCriteriaScores,
      consensus
    };
  }

  /**
   * Best of breed fusion strategy
   */
  private async bestOfBreedFusion(results: SpecializedOptimizationResult[], config: EnsembleConfig): Promise<EnsembleResult['fusedResult']> {
    // Simply select the best performing agent
    const bestResult = results.reduce((best, current) =>
      current.bestScore > best.bestScore ? current : best
    );

    const consensus = this.calculateConsensus(results);

    return {
      prompt: bestResult.bestPrompt.systemPrompt,
      score: bestResult.bestScore,
      criteriaScores: bestResult.criteriaScores,
      consensus
    };
  }

  /**
   * Hybrid fusion strategy
   */
  private async hybridFusion(results: SpecializedOptimizationResult[], config: EnsembleConfig): Promise<EnsembleResult['fusedResult']> {
    const consensus = this.calculateConsensus(results);

    if (consensus >= config.consensusThreshold) {
      // High consensus - use consensus strategy
      return await this.consensusFusion(results, config);
    } else {
      // Low consensus - combine best of breed with weighted voting
      const bestOfBreed = await this.bestOfBreedFusion(results, config);
      const weightedVoting = await this.weightedVotingFusion(results, config);

      // Blend the two approaches
      const blendedScore = (bestOfBreed.score * 0.6) + (weightedVoting.score * 0.4);
      const blendedCriteriaScores: MultiCriteriaScores = {
        relevance: 0, clarity: 0, completeness: 0, accuracy: 0, helpfulness: 0, engagement: 0
      };

      Object.keys(blendedCriteriaScores).forEach(criteria => {
        blendedCriteriaScores[criteria as keyof MultiCriteriaScores] =
          (bestOfBreed.criteriaScores[criteria as keyof MultiCriteriaScores] * 0.6) +
          (weightedVoting.criteriaScores[criteria as keyof MultiCriteriaScores] * 0.4);
      });

      return {
        prompt: bestOfBreed.prompt, // Use best prompt
        score: blendedScore,
        criteriaScores: blendedCriteriaScores,
        consensus
      };
    }
  }

  /**
   * Calculate consensus level between agents
   */
  private calculateConsensus(results: SpecializedOptimizationResult[]): number {
    if (results.length < 2) return 1.0;

    const scores = results.map(r => r.bestScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Consensus is higher when standard deviation is lower
    // Normalize to 0-1 scale (assuming max std dev of 3.0 for scores 0-10)
    return Math.max(0, 1 - (stdDev / 3.0));
  }

  /**
   * Calculate diversity metrics
   */
  private calculateDiversityMetrics(results: SpecializedOptimizationResult[]): EnsembleResult['diversityMetrics'] {
    if (results.length < 2) {
      return { promptVariety: 0, approachDiversity: 0 };
    }

    // Calculate prompt variety (how different the prompts are)
    const prompts = results.map(r => r.bestPrompt.systemPrompt);
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < prompts.length; i++) {
      for (let j = i + 1; j < prompts.length; j++) {
        const similarity = this.calculatePromptSimilarity(prompts[i], prompts[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
    const promptVariety = 1 - avgSimilarity; // Higher variety = lower similarity

    // Calculate approach diversity (how different the optimization approaches were)
    const agentTypes = results.map(r => r.agentType);
    const uniqueTypes = new Set(agentTypes);
    const approachDiversity = uniqueTypes.size / results.length;

    return {
      promptVariety: Math.max(0, Math.min(1, promptVariety)),
      approachDiversity: Math.max(0, Math.min(1, approachDiversity))
    };
  }

  /**
   * Calculate similarity between two prompts (simplified)
   */
  private calculatePromptSimilarity(prompt1: string, prompt2: string): number {
    const words1 = prompt1.toLowerCase().split(/\s+/);
    const words2 = prompt2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Get ensemble session status
   */
  getSessionStatus(sessionId: string): EnsembleSession | null {
    // This would typically be stored in a session manager
    // For now, return null as this is a stateless implementation
    return null;
  }

  /**
   * Create default ensemble configuration
   */
  static createDefaultEnsembleConfig(): EnsembleConfig {
    return {
      agents: [
        {
          id: 'clarity-agent',
          name: 'Clarity Optimizer',
          type: 'clarity',
          focusCriteria: 'clarity',
          weight: 1.0,
          config: {
            explorationRate: 0.2,
            learningRate: 0.001,
            specializationBonus: 0.3
          }
        },
        {
          id: 'completeness-agent',
          name: 'Completeness Optimizer',
          type: 'completeness',
          focusCriteria: 'completeness',
          weight: 1.2,
          config: {
            explorationRate: 0.25,
            learningRate: 0.001,
            specializationBonus: 0.4
          }
        },
        {
          id: 'helpfulness-agent',
          name: 'Helpfulness Optimizer',
          type: 'helpfulness',
          focusCriteria: 'helpfulness',
          weight: 1.1,
          config: {
            explorationRate: 0.3,
            learningRate: 0.001,
            specializationBonus: 0.35
          }
        }
      ],
      fusionStrategy: 'weighted_voting',
      consensusThreshold: 0.7,
      diversityWeight: 0.2,
      parallelExecution: true
    };
  }
}
