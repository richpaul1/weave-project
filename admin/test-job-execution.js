import fetch from 'node-fetch';

const API_BASE = 'http://localhost:8060/api/prompt-optimization';

async function testJobExecution() {
  try {
    console.log('🧪 Testing Job Execution with Fixed Weave API...\n');

    // 1. Create a new job
    console.log('1️⃣ Creating optimization job...');
    const createResponse = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Weave API Test Job',
        initialPrompt: 'You are a helpful assistant. Answer the following question clearly and concisely.',
        startingQuestion: 'What are the benefits of renewable energy?',
        trainingExamples: [
          {
            input: 'What is solar energy?',
            expectedOutput: 'Solar energy is power derived from sunlight using photovoltaic cells or solar thermal collectors.',
            criteria: { relevance: 9, clarity: 8, completeness: 7 }
          },
          {
            input: 'How does wind power work?',
            expectedOutput: 'Wind power generates electricity using turbines that convert wind kinetic energy into electrical energy.',
            criteria: { relevance: 9, clarity: 9, completeness: 8 }
          }
        ],
        config: {
          maxIterations: 5,
          targetScore: 8.5,
          convergenceThreshold: 0.1,
          strategy: 'ensemble',
          ensembleSize: 2,
          timeoutMinutes: 5
        }
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create job: ${createResponse.status} ${createResponse.statusText}`);
    }

    const job = await createResponse.json();
    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Name: ${job.name}`);
    console.log(`   Status: ${job.status}\n`);

    // 2. Start the job
    console.log('2️⃣ Starting job execution...');
    const startResponse = await fetch(`${API_BASE}/jobs/${job.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!startResponse.ok) {
      throw new Error(`Failed to start job: ${startResponse.status} ${startResponse.statusText}`);
    }

    const startResult = await startResponse.json();
    console.log(`✅ Job started successfully`);
    console.log(`   Message: ${startResult.message}\n`);

    // 3. Monitor progress for a few seconds
    console.log('3️⃣ Monitoring job progress...');
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      try {
        const progressResponse = await fetch(`${API_BASE}/jobs/${job.id}/realtime-progress`);
        if (progressResponse.ok) {
          const progress = await progressResponse.json();
          console.log(`📊 Progress Update ${attempts + 1}:`);
          console.log(`   Status: ${progress.status}`);
          console.log(`   Overall Progress: ${progress.overallProgress?.percentage || 0}%`);
          console.log(`   Current Phase: ${progress.overallProgress?.currentPhase || 'N/A'}`);
          console.log(`   Best Score: ${progress.scores?.best || 'N/A'}`);
          console.log(`   Current Round: ${progress.currentRound?.roundNumber || 'N/A'}`);
          console.log(`   Iterations: ${progress.iterations?.current || 0}/${progress.iterations?.total || 0}`);
          
          if (progress.status === 'completed' || progress.status === 'failed') {
            console.log(`\n🎯 Job ${progress.status}!`);
            break;
          }
        }
      } catch (progressError) {
        console.log(`⚠️ Progress check failed: ${progressError.message}`);
      }
      
      attempts++;
      console.log(''); // Empty line for readability
    }

    // 4. Get final job details
    console.log('4️⃣ Getting final job details...');
    const finalResponse = await fetch(`${API_BASE}/jobs/${job.id}`);
    if (finalResponse.ok) {
      const finalJob = await finalResponse.json();
      console.log(`📋 Final Job Status:`);
      console.log(`   Status: ${finalJob.status}`);
      console.log(`   Created: ${finalJob.createdAt}`);
      console.log(`   Updated: ${finalJob.updatedAt}`);
      if (finalJob.completedAt) {
        console.log(`   Completed: ${finalJob.completedAt}`);
      }
      if (finalJob.error) {
        console.log(`   Error: ${finalJob.error.message}`);
      }
      if (finalJob.finalResults) {
        console.log(`   Best Score: ${finalJob.finalResults.analytics?.bestScore || 'N/A'}`);
        console.log(`   Total Iterations: ${finalJob.finalResults.analytics?.totalIterations || 'N/A'}`);
      }
    }

    console.log('\n✅ Job execution test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the test
testJobExecution();
