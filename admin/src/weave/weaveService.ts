import { v4 as uuidv4 } from 'uuid';

/**
 * WeaveService - Handles W&B Weave integration for LLM workflow tracking
 *
 * This service provides:
 * - Trace initialization and management
 * - Performance metrics collection
 * - Error tracking and logging
 * - Custom event logging for LLM operations
 * - High-level abstractions (ThreadContext, operation decorators)
 * - Optimized instrumentation patterns
 */

/**
 * Thread context for managing Weave threads
 */
export class ThreadContext {
    public readonly threadId: string;
    public readonly turnId: string;
    private weaveService: WeaveService;
    private activeTraces: Map<string, string> = new Map(); // operation -> traceId
    private isActive: boolean = true;

    constructor(weaveService: WeaveService, threadId?: string, turnId?: string) {
        this.weaveService = weaveService;
        this.threadId = threadId || `thread_${uuidv4()}`;
        this.turnId = turnId || `turn_${uuidv4()}`;
    }

    /**
     * Start an operation within this thread context
     */
    async startOperation(
        operationName: string,
        inputs: any = {},
        attributes: any = {},
        parentOperation?: string
    ): Promise<string> {
        if (!this.isActive) {
            throw new Error('ThreadContext is no longer active');
        }

        const metadata = {
            ...attributes,
            thread_id: this.threadId,
            turn_id: this.turnId,
            thread_context: true
        };

        let traceId: string;

        if (parentOperation && this.activeTraces.has(parentOperation)) {
            // Create child trace
            const parentTraceId = this.activeTraces.get(parentOperation)!;
            traceId = this.weaveService.startChildTrace(parentTraceId, operationName, inputs, metadata);
        } else {
            // Create root trace
            traceId = this.weaveService.startTrace(operationName, inputs, metadata);
        }

        this.activeTraces.set(operationName, traceId);
        return traceId;
    }

    /**
     * End an operation within this thread context
     */
    endOperation(operationName: string, outputs: any = {}): void {
        const traceId = this.activeTraces.get(operationName);
        if (traceId) {
            this.weaveService.endTrace(traceId, outputs);
            // Don't delete from activeTraces yet - keep for potential child operations
            // Will be cleaned up in close()
        }
    }

    /**
     * Execute a function within an operation context
     */
    async withOperation<T>(
        operationName: string,
        fn: () => Promise<T> | T,
        inputs: any = {},
        attributes: any = {},
        parentOperation?: string
    ): Promise<T> {
        const traceId = await this.startOperation(operationName, inputs, attributes, parentOperation);

        try {
            const result = await fn();
            this.endOperation(operationName, { result });
            return result;
        } catch (error) {
            this.endOperation(operationName, {
                error: error instanceof Error ? error.message : String(error),
                status: 'error'
            });
            throw error;
        }
    }

    /**
     * Close the thread context
     */
    close(): void {
        // End any remaining active traces
        for (const [operationName, traceId] of this.activeTraces) {
            this.weaveService.endTrace(traceId, { status: 'context_closed' });
        }
        this.activeTraces.clear();
        this.isActive = false;
    }
}

/**
 * Operation decorator for automatic instrumentation
 */
export function weaveOp(operationName?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const opName = operationName || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            const weaveService = WeaveService.getInstance();

            if (!weaveService || !weaveService.isEnabled) {
                return originalMethod.apply(this, args);
            }

            // Check if we're in a thread context
            const currentContext = WeaveService.getCurrentThreadContext();

            if (currentContext) {
                // Use thread context
                return currentContext.withOperation(
                    opName,
                    () => originalMethod.apply(this, args),
                    { arguments: args },
                    {
                        method: propertyKey,
                        class: target.constructor.name,
                        auto_instrumented: true
                    }
                );
            } else {
                // Fallback to direct tracing
                const traceId = weaveService.startTrace(opName, { arguments: args }, {
                    method: propertyKey,
                    class: target.constructor.name,
                    auto_instrumented: true
                });

                try {
                    const result = await originalMethod.apply(this, args);
                    weaveService.endTrace(traceId, { result });
                    return result;
                } catch (error) {
                    weaveService.endTrace(traceId, {
                        error: error instanceof Error ? error.message : String(error),
                        status: 'error'
                    });
                    throw error;
                }
            }
        };

        return descriptor;
    };
}
export class WeaveService {
    private static instance: WeaveService | null = null;
    private static currentThreadContext: ThreadContext | null = null;

    public isEnabled: boolean;
    private projectName: string;
    private entity: string;
    private apiKey: string;
    private activeTraces: Map<string, any> = new Map();
    private sampleRate: number;

    constructor() {
        this.isEnabled = process.env.WEAVE_ENABLED === 'true';
        this.projectName = process.env.WANDB_PROJECT || 'graphcognitivehub-llm-monitoring';
        this.entity = process.env.WANDB_ENTITY || '';
        this.apiKey = process.env.WANDB_API_KEY || '';
        this.sampleRate = parseFloat(process.env.WEAVE_SAMPLE_RATE || '1.0');

        // Set as singleton instance
        WeaveService.instance = this;

        // Debug: Log all environment variables and initialization values
        console.log('🔍 Weave Service Debug - Environment Variables:');
        console.log(`  WEAVE_ENABLED: "${process.env.WEAVE_ENABLED}"`);
        console.log(`  WANDB_PROJECT: "${process.env.WANDB_PROJECT}"`);
        console.log(`  WANDB_ENTITY: "${process.env.WANDB_ENTITY}"`);
        console.log(`  WANDB_API_KEY: "${process.env.WANDB_API_KEY ? process.env.WANDB_API_KEY.substring(0, 8) + '...' : 'NOT SET'}"`);
        console.log(`  WEAVE_SAMPLE_RATE: "${process.env.WEAVE_SAMPLE_RATE}"`);

        console.log('🔍 Weave Service Debug - Initialized Values:');
        console.log(`  isEnabled: ${this.isEnabled}`);
        console.log(`  projectName: "${this.projectName}"`);
        console.log(`  entity: "${this.entity}"`);
        console.log(`  apiKey: "${this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'NOT SET'}"`);
        console.log(`  sampleRate: ${this.sampleRate}`);

        if (this.isEnabled) {
            console.log('🔍 Weave Service initialized');
            console.log(`📊 Project: ${this.entity}/${this.projectName}`);
            console.log(`🎯 Sample Rate: ${this.sampleRate * 100}%`);
        } else {
            console.log('⚠️ Weave Service is DISABLED');
        }
    }

    /**
     * Get singleton instance
     */
    static getInstance(): WeaveService | null {
        return WeaveService.instance;
    }

    /**
     * Get current thread context
     */
    static getCurrentThreadContext(): ThreadContext | null {
        return WeaveService.currentThreadContext;
    }

    /**
     * Set current thread context
     */
    static setCurrentThreadContext(context: ThreadContext | null): void {
        WeaveService.currentThreadContext = context;
    }

    /**
     * Create a new thread context
     */
    createThreadContext(threadId?: string, turnId?: string): ThreadContext {
        return new ThreadContext(this, threadId, turnId);
    }

    /**
     * Execute a function within a thread context
     */
    async withThread<T>(
        fn: (context: ThreadContext) => Promise<T> | T,
        threadId?: string,
        turnId?: string
    ): Promise<T> {
        const context = this.createThreadContext(threadId, turnId);
        const previousContext = WeaveService.currentThreadContext;

        try {
            WeaveService.setCurrentThreadContext(context);
            const result = await fn(context);
            return result;
        } finally {
            context.close();
            WeaveService.setCurrentThreadContext(previousContext);
        }
    }

    /**
     * Initialize W&B connection and test API connectivity
     * This replaces the separate initializeWeave function
     */
    async initialize(): Promise<void> {
        if (!this.isEnabled) {
            console.log('⚠️ Weave tracking is disabled');
            return;
        }

        console.log(`[Weave] Initializing project: ${this.entity}/${this.projectName}`);

        if (!this.apiKey) {
            console.warn('⚠️ WANDB_API_KEY not found - Weave tracking will be limited');
            return;
        }

        try {
            // Test API connectivity by making a simple request
            await this.testApiConnectivity();
            console.log('✅ Weave Service ready for trace collection');

            // Log initialization event
            this.logEvent('weave_admin_initialized', {
                project: `${this.entity}/${this.projectName}`,
                timestamp: new Date().toISOString(),
                environment: 'admin-backend'
            });

        } catch (error) {
            console.error('❌ Failed to initialize Weave:', error);
            console.warn('⚠️ Weave will continue with local logging only');
            // Don't disable completely, just log locally
        }
    }

    /**
     * Test W&B API connectivity
     */
    private async testApiConnectivity(): Promise<void> {
        const testUrl = 'https://api.wandb.ai/api/v1/viewer';

        try {
            const response = await fetch(testUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`🔗 W&B API connected successfully - User: ${data.entity || 'unknown'}`);
            } else {
                throw new Error(`API test failed: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('🔗 W&B API connectivity test failed:', error);
            throw error;
        }
    }

    /**
     * Start a new trace for an operation
     */
    startTrace(operation: string, inputs: any = {}, metadata: any = {}, parentTraceId?: string): string {
        if (!this.isEnabled || !this.shouldSample()) {
            return '';
        }

        const traceId = uuidv4();
        const callId = uuidv4();

        // For child traces, use parent's trace_id; for root traces, use new trace_id
        let actualTraceId = traceId;
        let parentCallId = null;

        if (parentTraceId) {
            const parentTrace = this.activeTraces.get(parentTraceId);
            if (parentTrace) {
                actualTraceId = parentTrace.actualTraceId || parentTrace.id;
                parentCallId = parentTrace.callId;
            }
        }

        const trace = {
            id: traceId,
            callId: callId,
            actualTraceId: actualTraceId,
            operation,
            inputs: this.sanitizeData(inputs),
            attributes: {
                ...metadata,
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.4.0',
                environment: process.env.NODE_ENV || 'development',
                parentTraceId: parentTraceId || null,
                parentCallId: parentCallId
            },
            startTime: Date.now(),
            status: 'running',
            parentTraceId: parentTraceId || null,
            parentCallId: parentCallId
        };

        this.activeTraces.set(traceId, trace);

        const prefix = parentTraceId ? '  🔗' : '🔍';
        console.log(`${prefix} [Weave] Started trace: ${operation} (${traceId.substring(0, 8)})${parentTraceId ? ` → child of (${parentTraceId.substring(0, 8)})` : ''}`);
        return traceId;
    }

    /**
     * Start a child trace linked to a parent
     */
    startChildTrace(parentId: string, operation: string, inputs: any = {}, metadata: any = {}): string {
        if (!this.isEnabled || !parentId) {
            return '';
        }

        const traceId = this.startTrace(operation, inputs, metadata, parentId);
        return traceId;
    }

    /**
     * Log intermediate data to an active trace
     */
    logTrace(traceId: string, data: any): void {
        if (!this.isEnabled || !traceId) {
            return;
        }

        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            return;
        }

        if (!trace.logs) {
            trace.logs = [];
        }

        trace.logs.push({
            timestamp: new Date().toISOString(),
            data: this.sanitizeData(data)
        });
    }

    /**
     * Finish a trace with outputs and final status
     */
    finishTrace(traceId: string, outputs: any = {}, error?: Error): void {
        if (!this.isEnabled || !traceId) {
            return;
        }

        const trace = this.activeTraces.get(traceId);
        if (!trace) {
            return;
        }

        const endTime = Date.now();
        const duration = endTime - trace.startTime;

        trace.outputs = this.sanitizeData(outputs);
        trace.duration = duration;
        trace.endTime = endTime;
        trace.status = error ? 'error' : 'success';

        if (error) {
            trace.error = {
                message: error.message,
                name: error.name,
                stack: error.stack
            };
        }

        // Log the completed trace
        this.logCompletedTrace(trace);

        // Mark as ended but keep in activeTraces for potential child operations
        trace.ended = true;
        // Don't delete from activeTraces yet - child operations may need parent info

        const status = error ? '❌' : '✅';
        console.log(`${status} [Weave] Finished trace: ${trace.operation} (${traceId.substring(0, 8)}) - ${duration}ms`);
    }

    /**
     * End a trace with results (alias for finishTrace for consistency)
     */
    endTrace(traceId: string, outputs: any = {}, error?: Error): void {
        this.finishTrace(traceId, outputs, error);
    }

    /**
     * Log a completed trace to W&B Weave via REST API
     */
    private logCompletedTrace(trace: any): void {
        console.log('🔍 [Weave Debug] Completed trace details:');
        console.log(`  Trace ID: ${trace.id}`);
        console.log(`  Operation: ${trace.operation}`);
        console.log(`  Status: ${trace.status}`);
        console.log(`  Duration: ${trace.duration}ms`);
        console.log(`  Project: ${this.entity}/${this.projectName}`);
        console.log(`  API Key Available: ${!!this.apiKey}`);

        // Send to W&B Weave API
        if (this.apiKey) {
            this.sendTraceToWeave(trace).catch(error => {
                console.error('❌ Failed to send trace to Weave:', error);
            });
        }

        // Also log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.log('📊 [Weave Trace]', {
                operation: trace.operation,
                duration: trace.duration,
                status: trace.status,
                inputSize: JSON.stringify(trace.inputs).length,
                outputSize: JSON.stringify(trace.outputs).length
            });
        }
    }

    /**
     * Send trace to W&B Weave via REST API
     */
    private async sendTraceToWeave(trace: any): Promise<void> {
        const startUrl = 'https://trace.wandb.ai/call/start';
        const endUrl = 'https://trace.wandb.ai/call/end';

        try {
            // Extract thread_id from attributes and remove it from attributes
            const threadId = trace.attributes?.thread_id;
            const cleanAttributes = { ...trace.attributes };
            delete cleanAttributes.thread_id;

            // Use the IDs we calculated in startTrace
            const traceCallId = trace.callId;
            const traceId = trace.actualTraceId;
            const parentCallId = trace.parentCallId;

            // Start the trace - matching W&B API specification exactly
            const startPayload = {
                start: {
                    project_id: `${this.entity}/${this.projectName}`,
                    id: traceCallId,
                    op_name: trace.operation,
                    trace_id: traceId,
                    started_at: new Date(trace.startTime).toISOString(),
                    attributes: cleanAttributes || {},
                    inputs: trace.inputs,
                    // Add thread_id if specified
                    ...(threadId && {
                        thread_id: threadId
                    }),
                    // Add parent relationship if this is a child trace
                    ...(parentCallId && {
                        parent_id: parentCallId
                    })
                }
            };

            console.log('📤 [Weave API] Sending start trace:', trace.operation);
            console.log('🔍 [Weave API] Start payload:', JSON.stringify(startPayload, null, 2));

            const startResponse = await fetch(startUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`
                },
                body: JSON.stringify(startPayload)
            });

            if (!startResponse.ok) {
                throw new Error(`Start trace failed: ${startResponse.status} ${startResponse.statusText}`);
            }

            const startData = await startResponse.json();

            // Use our generated IDs (they should match what we sent)
            const weaveCallId = traceCallId;
            const weaveTraceId = traceId;

            // Store W&B IDs in the trace for child traces to reference
            trace.weaveCallId = weaveCallId;
            trace.weaveTraceId = weaveTraceId;

            console.log(`📤 [Weave API] Trace started - Call ID: ${weaveCallId}, Trace ID: ${weaveTraceId}`);

            // End the trace - matching W&B API specification
            const endPayload = {
                end: {
                    project_id: `${this.entity}/${this.projectName}`,
                    id: weaveCallId,
                    ended_at: new Date(trace.endTime).toISOString(),
                    outputs: trace.outputs,
                    summary: {
                        weave: {
                            status: trace.status,
                            latency_ms: trace.duration
                        }
                    }
                }
            };

            const endResponse = await fetch(endUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`
                },
                body: JSON.stringify(endPayload)
            });

            if (!endResponse.ok) {
                throw new Error(`End trace failed: ${endResponse.status} ${endResponse.statusText}`);
            }

            console.log(`✅ [Weave API] Trace completed successfully: ${trace.operation}`);

        } catch (error) {
            console.error('❌ [Weave API] Failed to send trace:', error);
            throw error;
        }
    }

    /**
     * Store trace data locally for batch processing
     */
    private storeTraceData(trace: any): void {
        // TODO: Implement local storage for traces
        // Could use file system or in-memory buffer for batch upload
    }

    /**
     * Clean up ended traces that are older than the specified time
     */
    cleanupEndedTraces(maxAgeMs: number = 60000): void {
        const now = Date.now();
        for (const [traceId, trace] of this.activeTraces.entries()) {
            if (trace.ended && trace.endTime && (now - trace.endTime) > maxAgeMs) {
                this.activeTraces.delete(traceId);
            }
        }
    }

    /**
     * Determine if this operation should be sampled
     */
    private shouldSample(): boolean {
        return Math.random() < this.sampleRate;
    }

    /**
     * Sanitize data to remove sensitive information
     */
    private sanitizeData(data: any): any {
        if (!data) return data;

        const sensitivePatterns = [
            /password/i,
            /api_key/i,
            /secret/i,
            /token/i,
            /auth/i
        ];

        const sanitized = JSON.parse(JSON.stringify(data));

        const sanitizeObject = (obj: any): any => {
            if (typeof obj !== 'object' || obj === null) {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(sanitizeObject);
            }

            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                const shouldRedact = sensitivePatterns.some(pattern => pattern.test(key));
                if (shouldRedact) {
                    result[key] = '[REDACTED]';
                } else {
                    result[key] = sanitizeObject(value);
                }
            }
            return result;
        };

        return sanitizeObject(sanitized);
    }

    /**
     * Get current trace statistics
     */
    getStats(): any {
        return {
            enabled: this.isEnabled,
            activeTraces: this.activeTraces.size,
            sampleRate: this.sampleRate,
            project: `${this.entity}/${this.projectName}`
        };
    }

    /**
     * Simple function wrapper for Weave instrumentation
     */
    instrument<T extends (...args: any[]) => any>(fn: T, operationName: string): T {
        return (async (...args: any[]) => {
            if (!this.isEnabled) {
                return fn(...args);
            }

            const currentContext = WeaveService.getCurrentThreadContext();

            if (currentContext) {
                // Use thread context
                return currentContext.withOperation(
                    operationName,
                    () => fn(...args),
                    { arguments: args },
                    { auto_instrumented: true }
                );
            } else {
                // Fallback to direct tracing
                const traceId = this.startTrace(operationName, { arguments: args }, {
                    auto_instrumented: true
                });

                try {
                    const result = await fn(...args);
                    this.endTrace(traceId, { result });
                    return result;
                } catch (error) {
                    this.endTrace(traceId, {
                        error: error instanceof Error ? error.message : String(error),
                        status: 'error'
                    });
                    throw error;
                }
            }
        }) as T;
    }

    /**
     * Log a custom event
     */
    logEvent(event: string, data: any = {}): void {
        if (!this.isEnabled) {
            return;
        }

        console.log(`📝 [Weave Event] ${event}:`, this.sanitizeData(data));
    }

    /**
     * Log performance metrics
     */
    logMetrics(metrics: any): void {
        if (!this.isEnabled) {
            return;
        }

        console.log(`📈 [Weave Metrics]`, metrics);
    }

    /**
     * Get the current trace URL for debugging
     */
    getCurrentTraceUrl(): string | null {
        try {
            // In the current implementation, we don't have access to the actual Weave instance
            // that would provide trace URLs. This is a placeholder that returns null.
            // When we have a real Weave SDK integration, this would return the actual trace URL.
            return null;
        } catch (error) {
            console.error('[Weave] Failed to get trace URL:', error);
            return null;
        }
    }
}

// Global instance
export const weaveService = new WeaveService();
