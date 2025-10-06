#!/usr/bin/env node

/**
 * Standalone Weave SDK Test
 *
 * This script tests the official Weave SDK functionality with hardcoded credentials
 * to isolate any authentication or API issues.
 */

import * as weave from 'weave';

// Hardcoded test configuration
const CONFIG = {
    entity: 'richpaul1-stealth',
    project: 'support-app-dev1',
    apiKey: '07d1775877b89b133aa54a7c47bb7b570c9d98ae'
};

console.log('🧪 Starting Weave SDK Test');
console.log(`📊 Entity: ${CONFIG.entity}`);
console.log(`📊 Project: ${CONFIG.project}`);
console.log(`📊 API Key: ${CONFIG.apiKey.substring(0, 8)}...`);
console.log('');

// Set environment variables for Weave
process.env.WANDB_API_KEY = CONFIG.apiKey;
process.env.WANDB_PROJECT = CONFIG.project;
process.env.WANDB_ENTITY = CONFIG.entity;

/**
 * Test 1: Weave Initialization
 */
async function testWeaveInit() {
    console.log('🔗 Test 1: Weave Initialization');

    try {
        // Initialize Weave
        await weave.init(`${CONFIG.entity}/${CONFIG.project}`);
        console.log('✅ Weave initialized successfully');
        return true;
    } catch (error) {
        console.log('❌ Weave initialization failed:', error.message);
        return false;
    }
}

/**
 * Test 2: Simple Function with Weave Op Decorator
 */
async function testWeaveOp() {
    console.log('🔍 Test 2: Weave Op Decorator');

    try {
        // Create a simple function with Weave op decorator
        const simpleFunction = weave.op(
            async function processData(input) {
                console.log(`  Processing input: ${input}`);

                // Simulate some work
                await new Promise(resolve => setTimeout(resolve, 100));

                const result = `Processed: ${input.toUpperCase()}`;
                console.log(`  Generated result: ${result}`);

                return result;
            },
            { name: 'process_data' }
        );

        // Call the function
        const result = await simpleFunction('test data');
        console.log('✅ Weave op function executed successfully');
        console.log(`  Result: ${result}`);

        return result;
    } catch (error) {
        console.log('❌ Weave op function failed:', error.message);
        return null;
    }
}

/**
 * Test 3: Weave SDK API Exploration
 */
async function testWeaveAPI() {
    console.log('📊 Test 3: Weave SDK API Exploration');

    try {
        console.log('  Available Weave functions:');
        console.log(`    weave.init: ${typeof weave.init}`);
        console.log(`    weave.op: ${typeof weave.op}`);
        console.log(`    weave.Model: ${typeof weave.Model}`);
        console.log(`    weave.publish: ${typeof weave.publish}`);
        console.log(`    weave.Dataset: ${typeof weave.Dataset}`);

        // List all available properties
        const weaveKeys = Object.keys(weave).sort();
        console.log(`  All Weave properties: ${weaveKeys.join(', ')}`);

        console.log('✅ Weave API exploration completed');
        return true;
    } catch (error) {
        console.log('❌ Weave API exploration failed:', error.message);
        return null;
    }
}

/**
 * Test 4: Weave Dataset and Evaluation
 */
async function testWeaveDataset() {
    console.log('🔧 Test 4: Weave Dataset and Evaluation');

    try {
        // Create a simple dataset
        const examples = [
            { input: 'Hello', expected_output: 'Hi there!' },
            { input: 'How are you?', expected_output: 'I am doing well!' },
            { input: 'Goodbye', expected_output: 'See you later!' }
        ];

        console.log('  Creating dataset...');
        const dataset = new weave.Dataset({
            name: 'test-dataset',
            rows: examples
        });

        console.log('  Publishing dataset...');
        const publishedDataset = await weave.publish(dataset);
        console.log(`  ✅ Dataset published: ${publishedDataset.name}`);

        return publishedDataset;
    } catch (error) {
        console.log('❌ Weave dataset failed:', error.message);
        return null;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    try {
        console.log('🚀 Starting Weave SDK Tests\n');

        // Test 1: Weave Initialization
        const initResult = await testWeaveInit();
        console.log('');

        // Test 2: Weave Op Decorator
        const opResult = await testWeaveOp();
        console.log('');

        // Test 3: Weave API Exploration
        const apiResult = await testWeaveAPI();
        console.log('');

        // Test 4: Weave Dataset
        const datasetResult = await testWeaveDataset();
        console.log('');

        // Summary
        console.log('📋 Test Summary:');
        console.log(`  Weave Initialization: ${initResult ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Weave Op Decorator: ${opResult ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Weave API Exploration: ${apiResult ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Weave Dataset: ${datasetResult ? '✅ PASS' : '❌ FAIL'}`);

        if (initResult) {
            console.log('\n🎉 Weave SDK is working!');
            console.log('✅ The API key is valid');
            console.log('✅ Authentication is working');
            console.log('✅ Weave client is properly configured');
        } else {
            console.log('\n❌ Weave SDK initialization failed');
            console.log('🔍 This suggests either:');
            console.log('   - Invalid API key');
            console.log('   - Wrong project/entity configuration');
            console.log('   - Network/firewall issues');
            console.log('   - Weave SDK version compatibility issues');
        }

    } catch (error) {
        console.error('💥 Test runner failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the tests
runTests().catch(console.error);
