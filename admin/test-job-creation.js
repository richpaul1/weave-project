// Test script to create and start a prompt optimization job
// This will help us verify the UI and real-time progress tracking

const API_BASE = 'http://localhost:8060/api/prompt-optimization';

async function createTestJob() {
  const jobData = {
    name: 'Test Optimization Job',
    startingQuestion: 'How can I improve customer satisfaction?',
    initialPrompt: 'You are a helpful customer service assistant. Please provide clear and empathetic responses to customer inquiries.',
    trainingExamples: [
      {
        id: 'example-1',
        response: 'Thank you for contacting us! I understand your concern and I\'m here to help you resolve this issue quickly.',
        evaluation: {
          overallScore: 8.5,
          criteria: {
            relevance: 9,
            clarity: 8,
            completeness: 8,
            accuracy: 9,
            helpfulness: 8,
            engagement: 8
          },
          reason: 'Good empathetic response with clear intent to help'
        },
        tags: ['empathy', 'helpful'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'example-2',
        response: 'I apologize for the inconvenience. Let me look into this matter immediately and provide you with a solution.',
        evaluation: {
          overallScore: 7.5,
          criteria: {
            relevance: 8,
            clarity: 8,
            completeness: 7,
            accuracy: 8,
            helpfulness: 7,
            engagement: 7
          },
          reason: 'Professional response but could be more specific'
        },
        tags: ['professional', 'solution-focused'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    config: {
      maxIterations: 10,
      targetScore: 9.0,
      strategy: 'multi_round',
      ensembleSize: 3,
      convergenceThreshold: 0.1
    }
  };

  try {
    console.log('Creating test job...');
    const response = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const job = await response.json();
    console.log('✅ Job created successfully:', job.id);
    console.log('Job details:', {
      id: job.id,
      name: job.name,
      status: job.status,
      trainingExamples: job.trainingExamples.length
    });

    return job;
  } catch (error) {
    console.error('❌ Failed to create job:', error);
    throw error;
  }
}

async function startJob(jobId) {
  try {
    console.log(`Starting job ${jobId}...`);
    const response = await fetch(`${API_BASE}/jobs/${jobId}/start`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Job started successfully:', result.message);
    return result;
  } catch (error) {
    console.error('❌ Failed to start job:', error);
    throw error;
  }
}

async function getJobProgress(jobId) {
  try {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/realtime-progress`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const progress = await response.json();
    console.log('📊 Job progress:', {
      status: progress.status,
      percentage: progress.overallProgress.percentage,
      currentPhase: progress.overallProgress.currentPhase,
      bestScore: progress.scores.best,
      currentRound: progress.currentRound.roundNumber
    });
    
    return progress;
  } catch (error) {
    console.error('❌ Failed to get job progress:', error);
    throw error;
  }
}

async function monitorJob(jobId, duration = 30000) {
  console.log(`🔍 Monitoring job ${jobId} for ${duration/1000} seconds...`);
  
  const startTime = Date.now();
  const interval = setInterval(async () => {
    try {
      await getJobProgress(jobId);
      
      if (Date.now() - startTime > duration) {
        clearInterval(interval);
        console.log('⏰ Monitoring completed');
      }
    } catch (error) {
      console.error('Error during monitoring:', error);
    }
  }, 2000); // Check every 2 seconds
}

async function runTest() {
  try {
    console.log('🚀 Starting prompt optimization job test...');
    
    // Create a test job
    const job = await createTestJob();
    
    // Start the job
    await startJob(job.id);
    
    // Monitor progress for 30 seconds
    await monitorJob(job.id, 30000);
    
    console.log('✅ Test completed successfully!');
    console.log(`📱 You can view the job in the UI at: http://localhost:8060/`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this script is executed directly
if (typeof window === 'undefined') {
  runTest();
}

export { createTestJob, startJob, getJobProgress, monitorJob };
