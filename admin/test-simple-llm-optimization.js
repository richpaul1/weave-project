#!/usr/bin/env node

/**
 * Test script for Simple LLM Optimization
 * 
 * This script tests the new simple LLM-driven prompt optimization algorithm
 * by creating a job and monitoring its execution.
 */

const API_BASE = 'http://localhost:8060/api/prompt-optimization';

async function testSimpleLLMOptimization() {
  console.log('🧪 Testing Simple LLM Optimization Algorithm');
  console.log('=' .repeat(60));

  try {
    // Step 1: Set monitoring to detailed to capture comprehensive traces
    console.log('📊 Setting monitoring level to detailed...');
    const monitoringResponse = await fetch(`${API_BASE}/monitoring/level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'detailed' })
    });

    if (monitoringResponse.ok) {
      const monitoringResult = await monitoringResponse.json();
      console.log(`✅ Monitoring level set to detailed: ${JSON.stringify(monitoringResult)}`);
    } else {
      console.warn('⚠️ Failed to set monitoring level, continuing anyway...');
    }

    // Step 2: Create a simple LLM optimization job
    console.log('\n🚀 Creating Simple LLM optimization job...');
    
    const jobData = {
      name: 'Simple LLM Test - Customer Support',
      startingQuestion: 'How can I help you with your order?',
      initialPrompt: 'You are a customer support agent. Help the customer.',
      trainingExamples: [
        {
          query: 'I want to return my order',
          expectedResponse: 'I understand you\'d like to return your order. I can help you with that. Can you please provide your order number so I can look up the details and guide you through the return process?'
        },
        {
          query: 'Where is my package?',
          expectedResponse: 'I\'d be happy to help you track your package. Could you please provide your order number or tracking number? This will allow me to give you the most up-to-date information about your shipment\'s location and expected delivery date.'
        },
        {
          query: 'I received the wrong item',
          expectedResponse: 'I apologize for the inconvenience of receiving the wrong item. I\'ll help you resolve this right away. Can you please tell me your order number and describe what you received versus what you ordered? We\'ll arrange for the correct item to be sent and handle the return of the incorrect item.'
        }
      ],
      config: {
        algorithmType: 'simple_llm',
        maxIterations: 8
      }
    };

    const createResponse = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobData)
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      throw new Error(`Failed to create job: ${errorData.error || 'Unknown error'}`);
    }

    const job = await createResponse.json();
    console.log(`✅ Job created: ${job.name} (ID: ${job.id})`);
    console.log(`📋 Algorithm: ${job.config.algorithmType}`);
    console.log(`🔄 Max Iterations: ${job.config.maxIterations}`);
    console.log(`📚 Training Examples: ${job.trainingExamples.length}`);

    // Step 3: Start the optimization
    console.log('\n▶️ Starting optimization...');
    const startResponse = await fetch(`${API_BASE}/jobs/${job.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(`Failed to start job: ${errorData.error || 'Unknown error'}`);
    }

    console.log('✅ Optimization started successfully');

    // Step 4: Monitor progress
    console.log('\n📊 Monitoring progress...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    while (!completed && attempts < maxAttempts) {
      attempts++;
      
      try {
        const progressResponse = await fetch(`${API_BASE}/jobs/${job.id}/progress`);
        if (progressResponse.ok) {
          const progress = await progressResponse.json();
          
          console.log(`📈 Progress: ${progress.progressPercentage || 0}% - ` +
                     `Iteration ${progress.currentIteration || 0}/${progress.totalIterations || 0} - ` +
                     `Score: ${(progress.currentScore || 0).toFixed(3)} - ` +
                     `Status: ${progress.status || 'unknown'}`);

          // Check if job is completed
          const jobResponse = await fetch(`${API_BASE}/jobs/${job.id}`);
          if (jobResponse.ok) {
            const currentJob = await jobResponse.json();
            if (['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
              completed = true;
              console.log(`\n🏁 Job ${currentJob.status}: ${currentJob.name}`);
              
              if (currentJob.status === 'completed' && currentJob.finalResults) {
                console.log('\n🎯 Final Results:');
                console.log(`📊 Best Score: ${currentJob.finalResults.summary?.bestScore?.toFixed(3) || 'N/A'}`);
                console.log(`🔄 Total Iterations: ${currentJob.finalResults.summary?.totalIterations || 'N/A'}`);
                console.log(`⏱️ Execution Time: ${currentJob.finalResults.summary?.executionTime || 'N/A'}ms`);
                console.log(`🎯 Convergence: ${currentJob.finalResults.summary?.convergenceAchieved ? 'Yes' : 'No'}`);
                console.log(`🤖 Algorithm: ${currentJob.finalResults.summary?.algorithmUsed || 'N/A'}`);
                
                if (currentJob.finalResults.bestPrompts && currentJob.finalResults.bestPrompts.length > 0) {
                  const bestPrompt = currentJob.finalResults.bestPrompts[0];
                  console.log('\n📝 Best Prompt:');
                  console.log(`"${bestPrompt.prompt}"`);
                  console.log(`Score: ${bestPrompt.score?.toFixed(3) || 'N/A'}`);
                }
              }
              
              break;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error checking progress (attempt ${attempts}):`, error.message);
      }

      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!completed) {
      console.log('\n⏰ Timeout reached, cancelling job...');
      try {
        await fetch(`${API_BASE}/jobs/${job.id}/cancel`, { method: 'POST' });
        console.log('✅ Job cancelled successfully');
      } catch (error) {
        console.warn('⚠️ Failed to cancel job:', error.message);
      }
    }

    // Step 5: Get final monitoring stats
    console.log('\n📊 Final monitoring statistics...');
    try {
      const statsResponse = await fetch(`${API_BASE}/monitoring/stats`);
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        console.log(`📈 Monitoring Stats: ${JSON.stringify(stats, null, 2)}`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to get monitoring stats:', error.message);
    }

    console.log('\n✅ Simple LLM Optimization test completed!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Helper function for fetch (Node.js compatibility)
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the test
testSimpleLLMOptimization().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
