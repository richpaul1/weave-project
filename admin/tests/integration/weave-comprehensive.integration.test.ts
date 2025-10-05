/**
 * Weave Integration Test Suite
 *
 * This test suite runs comprehensive tests of Weave instrumentation
 * and validates trace functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WeaveService } from '../../src/weave/weaveService.js';

// Test service with instrumentation
class WeaveTestService {
  private weaveService: WeaveService;

  constructor() {
    this.weaveService = WeaveService.getInstance()!;
  }

  async parentOperation(testName: string): Promise<any> {
    console.log(`\n🎯 Starting parent operation: ${testName}`);

    // Log the start event
    await this.weaveService.logEvent('test_started', {
      test_name: testName,
      timestamp: new Date().toISOString(),
      environment: 'integration_test'
    });

    // Child operation 1: Data preparation
    const preparedData = await this.prepareData(testName);

    // Child operation 2: Processing
    const processedData = await this.processData(preparedData);

    // Child operation 3: Validation
    const validationResult = await this.validateResults(processedData);

    // Log completion event
    await this.weaveService.logEvent('test_completed', {
      test_name: testName,
      success: validationResult.isValid,
      duration_ms: validationResult.duration,
      data_points: processedData.length
    });

    console.log(`✅ Parent operation completed: ${testName}`);

    return {
      testName,
      preparedData,
      processedData,
      validationResult,
      success: validationResult.isValid
    };
  }
  
  async prepareData(testName: string): Promise<any[]> {
    const traceId = this.weaveService.startTrace('data_preparation', {
      test_name: testName,
      operation: 'data_preparation'
    });

    try {
      console.log('📋 Preparing test data...');

      // Simulate data preparation
      const data = Array.from({ length: 10 }, (_, i) => ({
        id: `${testName}_item_${i}`,
        value: Math.random() * 100,
        timestamp: new Date().toISOString(),
        category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C'
      }));

      await this.weaveService.logEvent('data_prepared', {
        items_count: data.length,
        categories: ['A', 'B', 'C'],
        test_name: testName
      });

      console.log(`📊 Prepared ${data.length} data items`);
      this.weaveService.endTrace(traceId, { items_count: data.length });
      return data;
    } catch (error) {
      this.weaveService.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
  
  async processData(data: any[]): Promise<any[]> {
    const traceId = this.weaveService.startTrace('data_processing', {
      items_count: data.length,
      operation: 'data_processing'
    });

    try {
      console.log('⚙️ Processing data...');

      const processedData = [];

      for (const item of data) {
        // Simulate processing with nested child trace
        const itemTraceId = this.weaveService.startTrace('process_item', {
          item_id: item.id,
          original_value: item.value
        });

        try {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          const processed = {
            ...item,
            processed: true,
            processedAt: new Date().toISOString(),
            score: item.value * 1.5,
            grade: item.value > 50 ? 'high' : 'low'
          };

          await this.weaveService.logEvent('item_processed', {
            item_id: item.id,
            original_value: item.value,
            processed_score: processed.score,
            grade: processed.grade
          });

          this.weaveService.endTrace(itemTraceId, {
            processed_score: processed.score,
            grade: processed.grade
          });

          processedData.push(processed);
        } catch (error) {
          this.weaveService.endTrace(itemTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
          throw error;
        }
      }

      await this.weaveService.logEvent('processing_completed', {
        items_processed: processedData.length,
        high_grade_count: processedData.filter(item => item.grade === 'high').length,
        low_grade_count: processedData.filter(item => item.grade === 'low').length
      });

      console.log(`🔄 Processed ${processedData.length} items`);
      this.weaveService.endTrace(traceId, { items_processed: processedData.length });
      return processedData;
    } catch (error) {
      this.weaveService.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
  
  async validateResults(processedData: any[]): Promise<any> {
    const traceId = this.weaveService.startTrace('validation', {
      items_to_validate: processedData.length,
      operation: 'validation'
    });

    try {
      console.log('✅ Validating results...');

      const startTime = Date.now();

      // Validation checks
      const checks = {
        allItemsProcessed: processedData.every(item => item.processed),
        scoresCalculated: processedData.every(item => typeof item.score === 'number'),
        gradesAssigned: processedData.every(item => ['high', 'low'].includes(item.grade)),
        timestampsValid: processedData.every(item => item.processedAt)
      };

      const isValid = Object.values(checks).every(check => check);
      const duration = Date.now() - startTime;

      await this.weaveService.logEvent('validation_completed', {
        is_valid: isValid,
        checks,
        duration_ms: duration,
        items_validated: processedData.length
      });

      console.log(`🔍 Validation ${isValid ? 'passed' : 'failed'} (${duration}ms)`);

      const result = {
        isValid,
        checks,
        duration,
        itemsValidated: processedData.length
      };

      this.weaveService.endTrace(traceId, {
        is_valid: isValid,
        duration_ms: duration,
        items_validated: processedData.length
      });

      return result;
    } catch (error) {
      this.weaveService.endTrace(traceId, { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

async function runWeaveIntegrationTest(): Promise<void> {
  console.log('🚀 Starting Weave Integration Test');
  console.log('=' .repeat(60));

  try {
    // Initialize Weave
    console.log('\n📡 Initializing Weave...');
    const weaveService = new WeaveService();
    await weaveService.initialize();
    console.log('✅ Weave initialized successfully');

    // Create test service
    const testService = new WeaveTestService();

    // Run multiple test scenarios
    const testScenarios = [
      'basic_workflow',
      'complex_processing',
      'validation_test'
    ];

    const results = [];

    for (const scenario of testScenarios) {
      console.log(`\n🧪 Running test scenario: ${scenario}`);

      const scenarioTraceId = weaveService.startTrace(`test_scenario_${scenario}`, {
        scenario_name: scenario,
        test_type: 'integration'
      });

      try {
        const result = await testService.parentOperation(scenario);
        weaveService.endTrace(scenarioTraceId, {
          success: result.success,
          data_points: result.processedData?.length || 0
        });

        results.push(result);
        console.log(`📊 Scenario ${scenario}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        weaveService.endTrace(scenarioTraceId, { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      }
    }

    // Summary
    console.log('\n📈 Test Summary:');
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Successful tests: ${successCount}/${results.length}`);
    console.log(`❌ Failed tests: ${results.length - successCount}/${results.length}`);

    // Log final summary
    await weaveService.logEvent('integration_test_summary', {
      total_scenarios: results.length,
      successful_scenarios: successCount,
      failed_scenarios: results.length - successCount,
      overall_success: successCount === results.length,
      test_duration: Date.now()
    });

    // Get trace URL
    console.log('\n🔗 Attempting to get trace URL...');
    const traceUrl = weaveService.getCurrentTraceUrl();

    if (traceUrl) {
      console.log('\n' + '='.repeat(60));
      console.log('🎉 SUCCESS! Weave Integration Test Completed');
      console.log('🔗 TRACE URL FOR ANALYSIS:');
      console.log(traceUrl);
      console.log('='.repeat(60));
      console.log('\n📊 Use this URL to analyze:');
      console.log('🔍 • Parent-child trace relationships');
      console.log('📈 • Event logging and metrics');
      console.log('⏱️ • Performance and timing data');
      console.log('🎯 • Test scenario execution flow');
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('✅ Weave Integration Test Completed Successfully');
      console.log('ℹ️  Trace URL not available (may be running in local mode)');
      console.log('📊 Check console logs for detailed trace information');
      console.log('='.repeat(60));
    }

    return {
      traceUrl,
      results,
      successCount: results.filter(r => r.success).length,
      totalCount: results.length
    };
  } catch (error) {
    console.error('\n❌ Weave integration test failed:');
    console.error(error);
    throw error;
  }
}

// Test suite
describe('Weave Comprehensive Integration Tests', () => {
  let weaveService: WeaveService;

  beforeAll(async () => {
    weaveService = new WeaveService();
    await weaveService.initialize();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should run comprehensive Weave integration test', async () => {
    const result = await runWeaveIntegrationTest();
    expect(result).toBeDefined();
    expect(result.successCount).toBeGreaterThan(0);
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.successCount).toBe(result.totalCount); // All tests should pass
  });
});
