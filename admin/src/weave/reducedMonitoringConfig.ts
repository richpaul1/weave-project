/**
 * Reduced Monitoring Configuration for Weave
 * 
 * This configuration reduces the number of traces generated while maintaining
 * proper parent/child relationships and essential monitoring.
 */

export interface MonitoringLevel {
  level: 'minimal' | 'essential' | 'detailed' | 'verbose';
  description: string;
  enabledOperations: string[];
  enabledEvents: string[];
  enabledMetrics: string[];
}

export const MONITORING_LEVELS: Record<string, MonitoringLevel> = {
  minimal: {
    level: 'minimal',
    description: 'Only top-level job operations',
    enabledOperations: [
      'create_optimization_job',
      'start_job_execution',
      'complete_job',
      'job_error'
    ],
    enabledEvents: [
      'job_created',
      'job_started',
      'job_completed',
      'job_failed',
      'job_cancelled'
    ],
    enabledMetrics: [
      'job_execution_time',
      'final_score'
    ]
  },
  
  essential: {
    level: 'essential',
    description: 'Job lifecycle + major optimization steps',
    enabledOperations: [
      'create_optimization_job',
      'start_job_execution',
      'execute_job_async',
      'execute_multi_round_optimization',
      'execute_ensemble_optimization',
      'complete_job',
      'job_error'
    ],
    enabledEvents: [
      'job_created',
      'job_started',
      'job_completed',
      'job_failed',
      'job_cancelled',
      'optimization_round_completed',
      'ensemble_results_updated'
    ],
    enabledMetrics: [
      'job_execution_time',
      'final_score',
      'optimization_rounds',
      'convergence_achieved'
    ]
  },
  
  detailed: {
    level: 'detailed',
    description: 'All major operations with some sub-operations',
    enabledOperations: [
      'create_optimization_job',
      'start_job_execution',
      'execute_job_async',
      'execute_multi_round_optimization',
      'execute_ensemble_optimization',
      'ensemble_parallel_execution',
      'multi_round_execute_optimization',
      'complete_job',
      'job_error',
      'prompt_evaluation'
    ],
    enabledEvents: [
      'job_created',
      'job_started',
      'job_completed',
      'job_failed',
      'job_cancelled',
      'optimization_round_completed',
      'ensemble_results_updated',
      'multi_round_strategy_created',
      'prompt_evaluation_started'
    ],
    enabledMetrics: [
      'job_execution_time',
      'final_score',
      'optimization_rounds',
      'convergence_achieved',
      'evaluation_scores',
      'agent_performance'
    ]
  },
  
  verbose: {
    level: 'verbose',
    description: 'All operations (current behavior)',
    enabledOperations: ['*'], // All operations
    enabledEvents: ['*'], // All events
    enabledMetrics: ['*'] // All metrics
  }
};

export class ReducedMonitoringConfig {
  private currentLevel: MonitoringLevel;
  
  constructor(level: keyof typeof MONITORING_LEVELS = 'essential') {
    this.currentLevel = MONITORING_LEVELS[level];
  }
  
  /**
   * Check if an operation should be traced
   */
  shouldTraceOperation(operationName: string): boolean {
    if (this.currentLevel.enabledOperations.includes('*')) {
      return true;
    }
    return this.currentLevel.enabledOperations.includes(operationName);
  }
  
  /**
   * Check if an event should be logged
   */
  shouldLogEvent(eventName: string): boolean {
    if (this.currentLevel.enabledEvents.includes('*')) {
      return true;
    }
    return this.currentLevel.enabledEvents.includes(eventName);
  }
  
  /**
   * Check if metrics should be logged
   */
  shouldLogMetrics(metricName: string): boolean {
    if (this.currentLevel.enabledMetrics.includes('*')) {
      return true;
    }
    return this.currentLevel.enabledMetrics.includes(metricName);
  }
  
  /**
   * Get current monitoring level
   */
  getCurrentLevel(): MonitoringLevel {
    return this.currentLevel;
  }
  
  /**
   * Set monitoring level
   */
  setLevel(level: keyof typeof MONITORING_LEVELS): void {
    this.currentLevel = MONITORING_LEVELS[level];
  }
  
  /**
   * Get monitoring statistics
   */
  getStats(): any {
    return {
      level: this.currentLevel.level,
      description: this.currentLevel.description,
      operationsCount: this.currentLevel.enabledOperations.length,
      eventsCount: this.currentLevel.enabledEvents.length,
      metricsCount: this.currentLevel.enabledMetrics.length
    };
  }
}

/**
 * Parent/Child trace relationship manager
 */
export class TraceHierarchyManager {
  private traceHierarchy: Map<string, string[]> = new Map(); // parent -> children
  private traceParents: Map<string, string> = new Map(); // child -> parent
  
  /**
   * Register a parent-child relationship
   */
  registerChildTrace(parentTraceId: string, childTraceId: string): void {
    // Add to parent's children list
    if (!this.traceHierarchy.has(parentTraceId)) {
      this.traceHierarchy.set(parentTraceId, []);
    }
    this.traceHierarchy.get(parentTraceId)!.push(childTraceId);
    
    // Set child's parent
    this.traceParents.set(childTraceId, parentTraceId);
  }
  
  /**
   * Get children of a trace
   */
  getChildren(traceId: string): string[] {
    return this.traceHierarchy.get(traceId) || [];
  }
  
  /**
   * Get parent of a trace
   */
  getParent(traceId: string): string | null {
    return this.traceParents.get(traceId) || null;
  }
  
  /**
   * Get trace hierarchy for a root trace
   */
  getTraceHierarchy(rootTraceId: string): any {
    const buildHierarchy = (traceId: string): any => {
      const children = this.getChildren(traceId);
      return {
        traceId,
        children: children.map(childId => buildHierarchy(childId))
      };
    };
    
    return buildHierarchy(rootTraceId);
  }
  
  /**
   * Clean up completed traces
   */
  cleanup(traceId: string): void {
    // Remove from children lists
    const children = this.getChildren(traceId);
    children.forEach(childId => {
      this.traceParents.delete(childId);
    });
    
    // Remove from hierarchy
    this.traceHierarchy.delete(traceId);
    
    // Remove from parent's children list
    const parent = this.getParent(traceId);
    if (parent) {
      const siblings = this.getChildren(parent);
      const index = siblings.indexOf(traceId);
      if (index > -1) {
        siblings.splice(index, 1);
      }
    }
    
    this.traceParents.delete(traceId);
  }
  
  /**
   * Get statistics
   */
  getStats(): any {
    return {
      totalTraces: this.traceParents.size + this.traceHierarchy.size,
      rootTraces: Array.from(this.traceHierarchy.keys()).filter(id => !this.traceParents.has(id)).length,
      childTraces: this.traceParents.size
    };
  }
}

// Global instances
export const monitoringConfig = new ReducedMonitoringConfig('essential');
export const traceHierarchy = new TraceHierarchyManager();
