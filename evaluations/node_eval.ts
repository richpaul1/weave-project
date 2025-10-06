/**
 * Node.js Weave Evaluation Test
 * 
 * Testing if the Node.js SDK works better for evaluations than Python
 */
import * as weave from 'weave';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env.local') });

// Test dataset - simple Q&A examples
const testDataset = [
  {
    id: '1',
    question: 'What is the capital of France?',
    expected: 'Paris'
  },
  {
    id: '2', 
    question: 'Who wrote To Kill a Mockingbird?',
    expected: 'Harper Lee'
  },
  {
    id: '3',
    question: 'What is the square root of 64?',
    expected: '8'
  }
];

// Simple model function that gives correct answers
const simpleModel = weave.op(async function simpleModel({datasetRow}: {datasetRow: any}) {
  const question = datasetRow.question;
  
  if (question.includes('capital of France')) {
    return { generated_text: 'Paris' };
  } else if (question.includes('To Kill a Mockingbird')) {
    return { generated_text: 'Harper Lee' };
  } else if (question.includes('square root of 64')) {
    return { generated_text: '8' };
  } else {
    return { generated_text: 'I do not know' };
  }
}, { name: 'simpleModel' });

// Scorer function - exact match
const exactMatchScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const expected = datasetRow.expected;
  const generated = modelOutput.generated_text;
  const isMatch = expected === generated;
  
  return {
    exact_match: isMatch,
    score: isMatch ? 1.0 : 0.0,
    expected,
    generated
  };
}, { name: 'exactMatchScorer' });

// Case insensitive scorer
const caseInsensitiveScorer = weave.op(({modelOutput, datasetRow}: {modelOutput: any, datasetRow: any}) => {
  const expected = datasetRow.expected.toLowerCase();
  const generated = modelOutput.generated_text.toLowerCase();
  const isMatch = expected === generated;
  
  return {
    case_insensitive_match: isMatch,
    score: isMatch ? 1.0 : 0.0,
    expected,
    generated
  };
}, { name: 'caseInsensitiveScorer' });

async function runNodeEvaluation() {
  console.log('🔍 Starting Node.js Weave Evaluation...');
  
  // Get project name from environment
  const wandbProject = process.env.WANDB_PROJECT || 'node-eval-test';
  console.log(`📊 Using Weave project: ${wandbProject}`);
  
  // Initialize Weave
  await weave.init(wandbProject);
  
  console.log('📝 Creating dataset...');
  
  // Create dataset
  const dataset = new weave.Dataset({
    id: 'Simple Q&A Dataset',
    description: 'Simple question and answer dataset for testing evaluations',
    rows: testDataset
  });
  
  console.log('🎯 Creating evaluation...');
  
  // Create evaluation
  const evaluation = new weave.Evaluation({
    dataset: dataset,
    scorers: [exactMatchScorer, caseInsensitiveScorer]
  });
  
  console.log('🚀 Running evaluation...');
  
  // Run evaluation
  const results = await evaluation.evaluate({ model: simpleModel });
  
  console.log('\n✅ Node.js Evaluation Complete!');
  console.log('📊 Results:', JSON.stringify(results, null, 2));
  
  return results;
}

// Run the evaluation
runNodeEvaluation()
  .then((results) => {
    console.log('\n🎉 Evaluation finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  });
