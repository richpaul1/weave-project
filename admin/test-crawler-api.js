#!/usr/bin/env node

/**
 * Test script to verify WebCrawler Weave instrumentation via API
 */

import fetch from 'node-fetch';

const ADMIN_URL = 'http://localhost:8060';

console.log('🧪 Testing WebCrawler Weave Instrumentation via API');
console.log(`📊 Admin URL: ${ADMIN_URL}`);
console.log('');

async function testCrawlerAPI() {
    try {
        console.log('🔗 Testing admin server health...');
        const healthResponse = await fetch(`${ADMIN_URL}/health`);
        if (!healthResponse.ok) {
            throw new Error(`Admin server not responding: ${healthResponse.status}`);
        }
        console.log('✅ Admin server is running');
        console.log('');

        console.log('🕷️ Starting a test crawl...');
        const crawlResponse = await fetch(`${ADMIN_URL}/api/crawler/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: 'https://httpbin.org/html',
                maxDepth: 0
            })
        });

        if (!crawlResponse.ok) {
            throw new Error(`Crawl start failed: ${crawlResponse.status}`);
        }

        const crawlData = await crawlResponse.json();
        console.log(`✅ Crawl started successfully`);
        console.log(`📊 Job ID: ${crawlData.jobId}`);
        console.log('');

        // Wait for crawl to complete
        console.log('⏳ Waiting for crawl to complete...');
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;

            const statusResponse = await fetch(`${ADMIN_URL}/api/crawler/status/${crawlData.jobId}`);
            if (!statusResponse.ok) {
                console.log(`  ❌ Status check failed: ${statusResponse.status}`);
                continue;
            }

            const statusData = await statusResponse.json();
            console.log(`  📊 Status: ${statusData.status} (attempt ${attempts}/${maxAttempts})`);
            
            if (statusData.status === 'completed') {
                console.log('✅ Crawl completed successfully!');
                console.log(`📊 Results: ${statusData.resultsCount || 0} pages crawled`);
                console.log('');
                break;
            } else if (statusData.status === 'failed') {
                console.log('❌ Crawl failed');
                console.log(`📊 Error: ${statusData.error || 'Unknown error'}`);
                break;
            }
        }

        if (attempts >= maxAttempts) {
            console.log('⏰ Crawl timed out after 30 seconds');
        }

        console.log('🎉 Test completed!');
        console.log('');
        console.log('📋 Check your Weave dashboard for traces:');
        console.log('   https://wandb.ai/richpaul1-stealth/support-app-dev1');
        console.log('');
        console.log('Expected traces:');
        console.log('  - WebCrawler.fetchPage');
        console.log('  - WebCrawler.processPage');
        console.log('  - WebCrawler.crawl');
        console.log('');
        console.log('✅ If you see named traces (not anonymous), the fix worked!');

    } catch (error) {
        console.error('💥 Test failed:', error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
            console.log('');
            console.log('🔧 To fix this:');
            console.log('   1. Start the admin server: npm run dev');
            console.log('   2. Wait for it to fully start');
            console.log('   3. Run this test again');
        }
        
        process.exit(1);
    }
}

// Run the test
testCrawlerAPI().catch(console.error);
