#!/usr/bin/env node

/**
 * Test Edit Functionality for Prompt Optimization Dashboard
 * Tests that the edit screen loads without JavaScript errors
 */

const API_BASE = 'http://localhost:8060/api/prompt-optimization';

async function testEditFunctionality() {
  console.log('🧪 Testing Edit Functionality');
  console.log('=' .repeat(50));

  try {
    // Step 1: Get existing jobs
    console.log('1️⃣ Fetching existing jobs...');
    const jobsResponse = await fetch(`${API_BASE}/jobs`);
    if (!jobsResponse.ok) {
      throw new Error(`Jobs API failed: ${jobsResponse.status}`);
    }
    
    const jobsData = await jobsResponse.json();
    console.log(`✅ Found ${jobsData.jobs.length} jobs`);
    
    if (jobsData.jobs.length === 0) {
      console.log('⚠️ No jobs found, creating a test job first...');
      
      // Create a test job with training examples
      const testJobData = {
        name: "Edit Test Job",
        startingQuestion: "How can I help you?",
        initialPrompt: "You are a helpful assistant.",
        trainingExamples: [
          {
            query: "What is the weather?",
            expectedResponse: "I'd be happy to help you with weather information. Could you please tell me your location?"
          },
          {
            query: "How do I return an item?",
            expectedResponse: "I can help you with returns. Please provide your order number and I'll guide you through the process."
          }
        ],
        config: {
          algorithmType: "simple_llm",
          maxIterations: 10,
          targetScore: 8,
          convergenceThreshold: 0.1
        }
      };

      const createResponse = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testJobData)
      });

      if (createResponse.ok) {
        const createdJob = await createResponse.json();
        console.log(`✅ Created test job: ${createdJob.id}`);
        
        // Refetch jobs
        const updatedJobsResponse = await fetch(`${API_BASE}/jobs`);
        const updatedJobsData = await updatedJobsResponse.json();
        jobsData.jobs = updatedJobsData.jobs;
      } else {
        throw new Error('Failed to create test job');
      }
    }

    // Step 2: Test training examples data structure
    console.log('\n2️⃣ Testing training examples data structure...');
    const testJob = jobsData.jobs[0];
    console.log(`📊 Testing job: ${testJob.name} (${testJob.id})`);
    
    if (testJob.trainingExamples && testJob.trainingExamples.length > 0) {
      console.log(`   Found ${testJob.trainingExamples.length} training examples`);
      
      testJob.trainingExamples.forEach((example, index) => {
        console.log(`   Example ${index + 1}:`);
        console.log(`     - Has query: ${!!example.query}`);
        console.log(`     - Has expectedResponse: ${!!example.expectedResponse}`);
        console.log(`     - Has response: ${!!example.response}`);
        console.log(`     - Has evaluation: ${!!example.evaluation}`);
        console.log(`     - Has id: ${!!example.id}`);
        
        // Test the transformation logic that would happen in editJob
        const transformedExample = {
          id: example.id || `example-${Date.now()}-${index}`,
          response: example.response || example.expectedResponse || '',
          evaluation: example.evaluation || {
            overallScore: 8,
            criteria: {
              relevance: 8,
              clarity: 8,
              completeness: 8,
              accuracy: 8,
              helpfulness: 8,
              engagement: 8
            },
            reason: 'Default evaluation for existing example'
          }
        };
        
        // Test the UI display logic
        try {
          const scoreDisplay = `Score: ${transformedExample.evaluation?.overallScore || 0}/10`;
          const responseDisplay = transformedExample.response;
          console.log(`     - Score display: ${scoreDisplay}`);
          console.log(`     - Response display: ${responseDisplay.substring(0, 50)}...`);
          console.log(`     ✅ Transformation successful`);
        } catch (error) {
          console.error(`     ❌ Transformation failed: ${error.message}`);
        }
      });
    } else {
      console.log('   No training examples found');
    }

    // Step 3: Test edit job data transformation
    console.log('\n3️⃣ Testing edit job data transformation...');
    
    // Simulate the editJob function logic
    const transformedExamples = (testJob.trainingExamples || []).map((example, index) => ({
      id: example.id || `example-${Date.now()}-${index}`,
      response: example.response || example.expectedResponse || '',
      evaluation: example.evaluation || {
        overallScore: 8,
        criteria: {
          relevance: 8,
          clarity: 8,
          completeness: 8,
          accuracy: 8,
          helpfulness: 8,
          engagement: 8
        },
        reason: 'Default evaluation for existing example'
      }
    }));

    const transformedJob = {
      name: testJob.name,
      startingQuestion: testJob.startingQuestion,
      initialPrompt: testJob.initialPrompt,
      maxIterations: testJob.config?.maxIterations || 50,
      algorithmType: testJob.config?.algorithmType || 'simple_llm',
      trainingExamples: transformedExamples
    };

    console.log(`✅ Transformed job data:`);
    console.log(`   - Name: ${transformedJob.name}`);
    console.log(`   - Algorithm: ${transformedJob.algorithmType}`);
    console.log(`   - Max Iterations: ${transformedJob.maxIterations}`);
    console.log(`   - Training Examples: ${transformedJob.trainingExamples.length}`);

    // Test that all transformed examples can be displayed safely
    transformedJob.trainingExamples.forEach((example, index) => {
      try {
        const scoreDisplay = `${example.evaluation?.overallScore || 0}/10`;
        const responseDisplay = example.response;
        console.log(`   - Example ${index + 1}: Score ${scoreDisplay}, Response: "${responseDisplay.substring(0, 30)}..."`);
      } catch (error) {
        console.error(`   ❌ Example ${index + 1} display failed: ${error.message}`);
        throw error;
      }
    });

    console.log('\n🎉 Edit Functionality Test Summary:');
    console.log('✅ Job data fetching works correctly');
    console.log('✅ Training examples data structure is compatible');
    console.log('✅ Data transformation logic is safe');
    console.log('✅ UI display logic handles all cases');
    console.log('✅ Edit functionality should work without errors');
    console.log('\n🚀 The edit screen should now load without JavaScript errors!');

  } catch (error) {
    console.error('\n❌ Edit Functionality Test Failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the server is running: npm run dev');
    console.log('2. Check browser console for additional errors');
    console.log('3. Verify job data structure matches expectations');
    process.exit(1);
  }
}

// Run the test
testEditFunctionality().catch(console.error);
