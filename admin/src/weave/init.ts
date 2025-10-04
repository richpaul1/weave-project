import * as weave from 'weave';
import { config } from '../config.js';

/**
 * Initialize Weave SDK for observability in Node.js Admin Project
 *
 * This implementation uses the official Weave JavaScript SDK to provide
 * comprehensive tracing and observability for the admin backend operations.
 */

interface WeaveConfig {
  projectName: string;
  apiKey?: string;
}

class WeaveClient {
  private projectName: string;
  private apiKey?: string;
  private initialized: boolean = false;
  private weaveInstance: any = null;

  constructor(config: WeaveConfig) {
    this.projectName = config.projectName;
    this.apiKey = config.apiKey;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      console.log('[Weave] Already initialized');
      return;
    }

    console.log(`[Weave] Initializing project: ${this.projectName}`);

    try {
      // Initialize Weave with project name
      this.weaveInstance = await weave.init(this.projectName);

      this.initialized = true;
      console.log('[Weave] ✅ Initialized successfully with real Weave SDK');
      console.log(`[Weave] 📊 Project: ${this.projectName}`);

      // Log initialization event
      await this.logEvent('weave_admin_initialized', {
        project: this.projectName,
        timestamp: new Date().toISOString(),
        environment: 'admin-backend'
      });

    } catch (error) {
      console.error('[Weave] ❌ Failed to initialize:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Decorator to trace function execution using real Weave SDK
   * Usage: @adminWeave.op()
   */
  op(name?: string) {
    return function (
      target: any,
      propertyKey: string,
      descriptor?: PropertyDescriptor
    ) {
      // Handle both method decorators and direct function wrapping
      if (!descriptor) {
        // This is being used as a direct function wrapper
        const originalMethod = target;
        const operationName = name || 'anonymous_operation';

        return function (...args: any[]) {
          return adminWeave.wrapOperation(operationName, originalMethod, args);
        };
      }

      const originalMethod = descriptor.value;
      const operationName = name || `${target.constructor.name}.${propertyKey}`;

      descriptor.value = function (...args: any[]) {
        return adminWeave.wrapOperation(operationName, originalMethod, args, this);
      };

      return descriptor;
    };
  }

  /**
   * Internal method to wrap operations with tracing
   */
  private async wrapOperation(
    operationName: string,
    originalMethod: Function,
    args: any[],
    context?: any
  ): Promise<any> {
    // Use Weave's op decorator if available
    if (weave && weave.op) {
      try {
        const wrappedMethod = weave.op(originalMethod, { name: operationName });
        return context ? wrappedMethod.apply(context, args) : wrappedMethod(...args);
      } catch (error) {
        console.warn(`[Weave] Failed to use Weave SDK, falling back to console logging:`, error);
      }
    }

    // Fallback to console logging with timing
    const startTime = Date.now();
    console.log(`[Weave Trace] ${operationName} - START`);

    try {
      const result = context ? originalMethod.apply(context, args) : originalMethod(...args);

      // Check if result is a Promise
      if (result && typeof result.then === 'function') {
        return result.then(
          (value: any) => {
            const duration = Date.now() - startTime;
            console.log(`[Weave Trace] ${operationName} - END (${duration}ms)`);
            return value;
          },
          (error: any) => {
            const duration = Date.now() - startTime;
            console.log(`[Weave Trace] ${operationName} - ERROR (${duration}ms)`, error);
            throw error;
          }
        );
      } else {
        // Synchronous function
        const duration = Date.now() - startTime;
        console.log(`[Weave Trace] ${operationName} - END (${duration}ms)`);
        return result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`[Weave Trace] ${operationName} - ERROR (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Log a metric using Weave
   */
  async logMetric(name: string, value: number, metadata?: Record<string, any>): Promise<void> {
    try {
      if (this.weaveInstance && this.weaveInstance.log) {
        await this.weaveInstance.log({ [name]: value, ...metadata });
      } else {
        console.log(`[Weave Metric] ${name}: ${value}`, metadata || '');
      }
    } catch (error) {
      console.error(`[Weave] Failed to log metric ${name}:`, error);
    }
  }

  /**
   * Log an event using Weave
   */
  async logEvent(name: string, data?: Record<string, any>): Promise<void> {
    try {
      if (this.weaveInstance && this.weaveInstance.log) {
        await this.weaveInstance.log({ event: name, ...data });
      } else {
        console.log(`[Weave Event] ${name}`, data || '');
      }
    } catch (error) {
      console.error(`[Weave] Failed to log event ${name}:`, error);
    }
  }

  /**
   * Create a child trace/span
   */
  async createChildTrace(name: string, operation: () => Promise<any>): Promise<any> {
    try {
      if (weave && weave.op) {
        const wrappedOperation = weave.op(operation, { name });
        return await wrappedOperation();
      } else {
        console.log(`[Weave Child Trace] ${name} - START`);
        const startTime = Date.now();
        try {
          const result = await operation();
          const duration = Date.now() - startTime;
          console.log(`[Weave Child Trace] ${name} - END (${duration}ms)`);
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          console.log(`[Weave Child Trace] ${name} - ERROR (${duration}ms)`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error(`[Weave] Failed to create child trace ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get the current trace URL for debugging
   */
  getCurrentTraceUrl(): string | null {
    try {
      if (this.weaveInstance && this.weaveInstance.getCurrentCall) {
        const call = this.weaveInstance.getCurrentCall();
        if (call && call.traceUrl) {
          return call.traceUrl;
        }
      }
      return null;
    } catch (error) {
      console.error('[Weave] Failed to get trace URL:', error);
      return null;
    }
  }
}

// Create singleton instance
export const adminWeave = new WeaveClient({
  projectName: config.weaveProjectName,
  apiKey: config.wandbApiKey,
});

// Initialize on module load
export async function initializeWeave(): Promise<void> {
  await adminWeave.init();
}

// Export the weave instance for compatibility
export { adminWeave as weave };

