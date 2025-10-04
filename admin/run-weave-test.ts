#!/usr/bin/env tsx

/**
 * Weave Integration Test Runner
 * 
 * This script runs a comprehensive test of Weave instrumentation
 * and outputs the trace URL for analysis.
 */

import { adminWeave, initializeWeave } from './src/weave/init.js';

// Test service with instrumentation
class WeaveTestService {
  async parentOperation(testName: string): Promise<any> {
    console.log(`\n🎯 Starting parent operation: ${testName}`);
    
    // Log the start event
    await adminWeave.logEvent('test_started', {
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
    
    // Log metrics
    await adminWeave.logMetric('operations_completed', 3, {
      test_name: testName,
      success: validationResult.valid
    });
    
    const result = {
      test_name: testName,
      prepared_items: preparedData.length,
      processed_items: processedData.length,
      validation: validationResult,
      completed_at: new Date().toISOString()
    };
    
    console.log(`✅ Parent operation completed: ${testName}`);
    return result;
  }

  private async prepareData(testName: string): Promise<any[]> {
    console.log(`📋 Preparing data for: ${testName}`);
    
    // Simulate data preparation with nested operations
    const rawData = await adminWeave.createChildTrace('fetch_raw_data', async () => {
      console.log('🔍 Fetching raw data...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return [
        { id: 1, name: 'Item 1', category: 'test' },
        { id: 2, name: 'Item 2', category: 'demo' },
        { id: 3, name: 'Item 3', category: 'sample' }
      ];
    });
    
    const cleanedData = await adminWeave.createChildTrace('clean_data', async () => {
      console.log('🧹 Cleaning data...');
      await new Promise(resolve => setTimeout(resolve, 75));
      return rawData.map(item => ({
        ...item,
        cleaned: true,
        cleaned_at: new Date().toISOString()
      }));
    });
    
    return cleanedData;
  }

  private async processData(data: any[]): Promise<any[]> {
    console.log(`⚙️ Processing ${data.length} items`);
    
    const processed = [];
    for (const item of data) {
      const processedItem = await adminWeave.createChildTrace(`process_item_${item.id}`, async () => {
        console.log(`🔄 Processing item ${item.id}: ${item.name}`);
        
        // Simulate complex processing
        await adminWeave.createChildTrace('analyze_item', async () => {
          await new Promise(resolve => setTimeout(resolve, 30));
        });
        
        await adminWeave.createChildTrace('enrich_item', async () => {
          await new Promise(resolve => setTimeout(resolve, 25));
        });
        
        return {
          ...item,
          processed: true,
          analysis_score: Math.random(),
          enriched_data: { score: Math.floor(Math.random() * 100) },
          processed_at: new Date().toISOString()
        };
      });
      
      processed.push(processedItem);
    }
    
    return processed;
  }

  private async validateResults(data: any[]): Promise<any> {
    console.log(`✅ Validating ${data.length} processed items`);
    
    const validation = await adminWeave.createChildTrace('run_validation_checks', async () => {
      console.log('🔍 Running validation checks...');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const checks = {
        all_processed: data.every(item => item.processed),
        all_have_scores: data.every(item => item.analysis_score !== undefined),
        all_enriched: data.every(item => item.enriched_data),
        count_matches: data.length === 3
      };
      
      return {
        valid: Object.values(checks).every(check => check),
        checks,
        validated_at: new Date().toISOString()
      };
    });
    
    return validation;
  }

  async errorTestOperation(): Promise<void> {
    console.log('💥 Testing error handling...');
    
    await adminWeave.createChildTrace('operation_that_fails', async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
      throw new Error('Intentional test error for trace analysis');
    });
  }
}

async function runWeaveIntegrationTest(): Promise<void> {
  console.log('🚀 Starting Weave Integration Test for Node.js Admin Project');
  console.log('=' .repeat(70));
  
  try {
    // Initialize Weave
    console.log('\n📡 Initializing Weave...');
    await initializeWeave();
    console.log('✅ Weave initialized successfully');
    
    // Create test service
    const testService = new WeaveTestService();
    
    // Test 1: Successful operation with nested traces
    console.log('\n🧪 Test 1: Successful Operation with Nested Traces');
    const result1 = await testService.parentOperation('nested_traces_test');
    console.log(`📊 Result: ${result1.processed_items} items processed, validation: ${result1.validation.valid}`);
    
    // Test 2: Parallel operations
    console.log('\n🧪 Test 2: Parallel Operations');
    const [result2a, result2b] = await Promise.all([
      testService.parentOperation('parallel_test_a'),
      testService.parentOperation('parallel_test_b')
    ]);
    console.log(`📊 Parallel results: A=${result2a.processed_items} items, B=${result2b.processed_items} items`);
    
    // Test 3: Error handling
    console.log('\n🧪 Test 3: Error Handling');
    try {
      await testService.errorTestOperation();
    } catch (error) {
      console.log(`✅ Error caught as expected: ${error.message}`);
    }
    
    // Test 4: Additional metrics and events
    console.log('\n🧪 Test 4: Additional Metrics and Events');
    await adminWeave.logEvent('integration_test_completed', {
      total_tests: 4,
      success: true,
      timestamp: new Date().toISOString(),
      environment: 'admin_backend'
    });
    
    await adminWeave.logMetric('test_duration_seconds', 10, {
      test_type: 'integration',
      component: 'admin_backend'
    });
    
    // Try to get trace URL
    console.log('\n🔗 Attempting to get trace URL...');
    const traceUrl = adminWeave.getCurrentTraceUrl();
    
    if (traceUrl) {
      console.log('\n' + '='.repeat(70));
      console.log('🎉 SUCCESS! Weave integration test completed');
      console.log('🔗 TRACE URL FOR ANALYSIS:');
      console.log(traceUrl);
      console.log('='.repeat(70));
      console.log('\n📊 Use this URL to analyze the trace hierarchy in Weave UI');
      console.log('🔍 Look for parent-child relationships and nested operations');
    } else {
      console.log('\n' + '='.repeat(70));
      console.log('✅ Weave integration test completed successfully');
      console.log('ℹ️  Trace URL not available (may be running in local mode)');
      console.log('📊 Check console logs for trace information');
      console.log('='.repeat(70));
    }
    
  } catch (error) {
    console.error('\n❌ Weave integration test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runWeaveIntegrationTest().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
