/**
 * RAG System Evaluation using Node.js Weave SDK
 * 
 * This evaluation calls the Python RAG system via HTTP and evaluates the responses
 */
import * as weave from 'weave';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

// RAG evaluation dataset
const ragTestDataset = [
  {
    id: '1',
    query: 'What is Weave?',
    expected_topics: ['weave', 'toolkit', 'llm', 'tracking'],
    min_response_length: 50
  },
  {
    id: '2',
    query: 'How do I use Weave for tracking LLM calls?',
    expected_topics: ['weave', 'tracking', 'llm', 'calls', 'logging'],
    min_response_length: 50
  },
  {
    id: '3',
    query: 'What is RAG?',
    expected_topics: ['rag', 'retrieval', 'augmented', 'generation'],
    min_response_length: 50
  },
  {
    id: '4',
    query: 'How does the system store data?',
    expected_topics: ['neo4j', 'database', 'storage', 'graph'],
    min_response_length: 50
  },
  {
    id: '5',
    query: 'What LLM models are supported?',
    expected_topics: ['ollama', 'llm', 'model'],
    min_response_length: 50
  }
];

// RAG model that calls the Python backend
const ragModel = weave.op(async function ragModel({datasetRow}: {datasetRow: any}) {
  const query = datasetRow.query;
  
  try {
    // Call the Python RAG system (assuming it's running on port 8081)
    const response = await fetch('http://localhost:8081/api/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        session_id: 'eval-session'
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    return {
      response: result.response || '',
      sources: result.sources || [],
      num_chunks: result.metadata?.num_chunks || 0,
      num_sources: result.metadata?.num_sources || 0,
      model: result.metadata?.model || '',
      tokens: result.metadata?.tokens || 0
    };
  } catch (error) {
    console.error(`Error calling RAG system for query "${query}":`, error);
    return {
      response: '',
      sources: [],
      num_chunks: 0,
      num_sources: 0,
      model: 'error',
      tokens: 0,
      error: error.message
    };
  }
}, { name: 'ragModel' });

// Response quality scorer
const responseQualityScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const response = (modelOutput.response || '').toLowerCase();
  const expectedTopics = datasetRow.expected_topics || [];
  const minLength = datasetRow.min_response_length || 50;
  
  // Check topic coverage
  const topicsCovered = expectedTopics.filter(topic => 
    response.includes(topic.toLowerCase())
  ).length;
  const topicScore = expectedTopics.length > 0 ? topicsCovered / expectedTopics.length : 0;
  
  // Check response length
  const responseLength = (modelOutput.response || '').length;
  const lengthScore = responseLength >= minLength ? 1.0 : responseLength / minLength;
  
  // Combined score
  const score = (topicScore * 0.7) + (lengthScore * 0.3);
  
  return {
    response_quality: score,
    topic_score: topicScore,
    length_score: lengthScore,
    topics_covered: topicsCovered,
    total_topics: expectedTopics.length,
    response_length: responseLength,
    score: score
  };
}, { name: 'responseQualityScorer' });

// Context utilization scorer
const contextUtilizationScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const numChunks = modelOutput.num_chunks || 0;
  const numSources = modelOutput.num_sources || 0;
  const responseLength = (modelOutput.response || '').length;
  
  let score = 0;
  if (numChunks === 0 || responseLength === 0) {
    score = 0.0;
  } else if (numSources === 0) {
    score = 0.3;
  } else if (numChunks < 3) {
    score = 0.6;
  } else {
    score = 1.0;
  }
  
  return {
    context_utilization: score,
    num_chunks: numChunks,
    num_sources: numSources,
    response_length: responseLength,
    score: score
  };
}, { name: 'contextUtilizationScorer' });

// Efficiency scorer
const efficiencyScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const tokens = modelOutput.tokens || 0;
  const responseLength = (modelOutput.response || '').length;
  
  let score = 0;
  if (tokens === 0) {
    score = 0.0;
  } else {
    const charsPerToken = responseLength / tokens;
    score = charsPerToken >= 3 ? 1.0 : charsPerToken / 3.0;
  }
  
  return {
    efficiency: score,
    tokens: tokens,
    response_length: responseLength,
    chars_per_token: tokens > 0 ? responseLength / tokens : 0,
    score: score
  };
}, { name: 'efficiencyScorer' });

// Source citation scorer
const sourceCitationScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const response = modelOutput.response || '';
  const sources = modelOutput.sources || [];
  
  const hasCitations = response.includes('[') && response.includes(']');
  const hasSources = sources.length > 0;
  
  let score = 0;
  if (hasSources && hasCitations) {
    score = 1.0;
  } else if (hasSources) {
    score = 0.5;
  } else {
    score = 0.0;
  }
  
  return {
    source_citation: score,
    has_citations: hasCitations,
    has_sources: hasSources,
    num_sources: sources.length,
    score: score
  };
}, { name: 'sourceCitationScorer' });

async function runRAGEvaluation() {
  console.log('🔍 Starting RAG System Evaluation with Node.js...');
  
  // Get project name from environment
  const wandbProject = process.env.WANDB_PROJECT || 'rag-eval-node';
  console.log(`📊 Using Weave project: ${wandbProject}`);
  
  // Initialize Weave
  await weave.init(wandbProject);
  
  console.log('📝 Creating RAG evaluation dataset...');
  
  // Create dataset
  const dataset = new weave.Dataset({
    id: 'RAG Evaluation Dataset',
    description: 'End-to-end evaluation of the RAG system',
    rows: ragTestDataset
  });
  
  console.log('🎯 Creating RAG evaluation...');
  
  // Create evaluation
  const evaluation = new weave.Evaluation({
    dataset: dataset,
    scorers: [
      responseQualityScorer,
      contextUtilizationScorer,
      efficiencyScorer,
      sourceCitationScorer
    ]
  });
  
  console.log('🚀 Running RAG evaluation...');
  console.log('📡 Note: Make sure the Python RAG system is running on http://localhost:8081');
  
  // Run evaluation
  const results = await evaluation.evaluate({ model: ragModel });
  
  console.log('\n✅ RAG Evaluation Complete!');
  console.log('📊 Results:', JSON.stringify(results, null, 2));
  
  return results;
}

// Run the evaluation
runRAGEvaluation()
  .then((results) => {
    console.log('\n🎉 RAG Evaluation finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ RAG Evaluation failed:', error);
    process.exit(1);
  });
