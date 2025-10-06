import fetch from 'node-fetch';

const baseUrl = 'http://localhost:8060/api/prompt-optimization';
const targetJobId = '74da4a02-6dcf-4597-b744-3a882b11914b';

async function testJobExecution() {
  console.log('🧪 Integration Test: Job Execution with Weave Monitoring');
  console.log(`🎯 Target Job ID: ${targetJobId}\n`);

  try {
    // 0. Set monitoring to minimal level first
    console.log('0️⃣ Setting monitoring level to minimal...');
    const monitoringResponse = await fetch(`${baseUrl}/monitoring/level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'minimal' })
    });

    if (monitoringResponse.ok) {
      const monitoringData = await monitoringResponse.json();
      console.log('✅ Monitoring level set:', monitoringData.message);
      console.log('📊 Monitoring stats:', monitoringData.stats.monitoring);
    }

    // 1. Check if the job exists
    console.log('\n1️⃣ Checking if target job exists...');
    const getResponse = await fetch(`${baseUrl}/jobs/${targetJobId}`);
    
    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        console.log('❌ Target job not found. Creating a new job for testing...');
        await createTestJob();
        return;
      }
      throw new Error(`Failed to get job: ${getResponse.status} ${getResponse.statusText}`);
    }

    const job = await getResponse.json();
    console.log('✅ Job found:', {
      id: job.id,
      name: job.name,
      status: job.status,
      maxIterations: job.config?.maxIterations
    });

    // 2. Check current job status
    if (job.status === 'running') {
      console.log('⚠️ Job is currently running. Waiting for completion or cancelling...');
      await fetch(`${baseUrl}/jobs/${targetJobId}/cancel`, { method: 'POST' });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 3. Start the job execution
    console.log('\n2️⃣ Starting job execution...');
    const startResponse = await fetch(`${baseUrl}/jobs/${targetJobId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enableCheckpointing: true,
        progressUpdateInterval: 2000,
        maxRetries: 2
      })
    });

    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(`Failed to start job: ${startResponse.status} - ${errorData.error || startResponse.statusText}`);
    }

    console.log('✅ Job execution started');

    // 4. Monitor progress for a limited time
    console.log('\n3️⃣ Monitoring job progress...');
    const maxMonitoringTime = 30000; // 30 seconds
    const startTime = Date.now();
    let lastStatus = '';

    while (Date.now() - startTime < maxMonitoringTime) {
      const progressResponse = await fetch(`${baseUrl}/jobs/${targetJobId}`);
      if (progressResponse.ok) {
        const currentJob = await progressResponse.json();
        
        if (currentJob.status !== lastStatus) {
          console.log(`📊 Status: ${currentJob.status}`);
          if (currentJob.progress) {
            console.log(`   Progress: ${currentJob.progress.currentIteration}/${currentJob.progress.totalIterations}`);
            console.log(`   Best Score: ${currentJob.progress.bestScore}`);
          }
          lastStatus = currentJob.status;
        }

        // Check if job completed
        if (['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
          console.log(`✅ Job finished with status: ${currentJob.status}`);
          
          if (currentJob.finalResults) {
            console.log('📈 Final Results:');
            console.log(`   Best Score: ${currentJob.finalResults.bestPrompts?.[0]?.score || 'N/A'}`);
            console.log(`   Total Iterations: ${currentJob.finalResults.analytics?.totalIterations || 'N/A'}`);
          }
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 5. Stop monitoring and cancel if still running
    if (Date.now() - startTime >= maxMonitoringTime) {
      console.log('\n⏰ Monitoring time limit reached. Cancelling job...');
      await fetch(`${baseUrl}/jobs/${targetJobId}/cancel`, { method: 'POST' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🎯 Integration test completed successfully!');
    console.log('📊 Check Weave dashboard for trace analysis');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
  }
}

async function createTestJob() {
  console.log('🔧 Creating test job...');
  
  const jobData = {
    name: 'Integration Test Job',
    description: 'Job created for integration testing',
    startingQuestion: 'How can I improve customer satisfaction?',
    initialPrompt: 'You are a helpful customer service assistant. Provide clear, empathetic, and actionable responses.',
    maxIterations: 10, // Reduced for testing
    trainingExamples: [
      {
        query: 'I am unhappy with my recent purchase',
        expectedResponse: 'I understand your frustration. Let me help you resolve this issue quickly.',
        tags: ['customer-service', 'complaint']
      },
      {
        query: 'Can you help me track my order?',
        expectedResponse: 'I\'d be happy to help you track your order. Please provide your order number.',
        tags: ['customer-service', 'tracking']
      }
    ]
  };

  const createResponse = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData)
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create test job: ${createResponse.status}`);
  }

  const newJob = await createResponse.json();
  console.log('✅ Test job created:', {
    id: newJob.id,
    name: newJob.name
  });
  
  console.log(`\n🔄 Please run the test again with job ID: ${newJob.id}`);
}

// Run the test
testJobExecution();
