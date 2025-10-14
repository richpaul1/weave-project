#!/usr/bin/env node

/**
 * Test script to verify WebCrawler Weave instrumentation
 */

import * as weave from 'weave';
import { WebCrawler } from './dist/services/webCrawler.js';

// Hardcoded test configuration
const CONFIG = {
    entity: 'richpaul1-stealth',
    project: 'support-app-dev1',
    apiKey: 'xxxx'
};

console.log('🧪 Testing WebCrawler Weave Instrumentation');
console.log(`📊 Entity: ${CONFIG.entity}`);
console.log(`📊 Project: ${CONFIG.project}`);
console.log(`📊 API Key: ${CONFIG.apiKey.substring(0, 8)}...`);
console.log('');

// Set environment variables for Weave
process.env.WANDB_API_KEY = CONFIG.apiKey;
process.env.WANDB_PROJECT = CONFIG.project;
process.env.WANDB_ENTITY = CONFIG.entity;

async function testCrawlerInstrumentation() {
    try {
        console.log('🔗 Initializing Weave...');
        await weave.init(`${CONFIG.entity}/${CONFIG.project}`);
        console.log('✅ Weave initialized successfully');
        console.log('');

        console.log('🕷️ Creating WebCrawler instance...');
        const crawler = new WebCrawler();
        console.log('✅ WebCrawler created');
        console.log('');

        console.log('📄 Testing fetchPage method...');
        try {
            // Test with a simple, reliable page
            const testUrl = 'https://httpbin.org/html';
            console.log(`  Fetching: ${testUrl}`);
            
            const pageResult = await crawler.fetchPage(testUrl);
            console.log(`  ✅ fetchPage completed successfully`);
            console.log(`  📊 HTML length: ${pageResult.html.length} characters`);
            console.log(`  📊 Cheerio loaded: ${typeof pageResult.$}`);
        } catch (error) {
            console.log(`  ❌ fetchPage failed: ${error.message}`);
        }
        console.log('');

        console.log('🔄 Testing processPage method...');
        try {
            const testUrl = 'https://httpbin.org/html';
            console.log(`  Processing: ${testUrl}`);
            
            const processResult = await crawler.processPage(testUrl, 0);
            console.log(`  ✅ processPage completed successfully`);
            console.log(`  📊 Title: "${processResult.title}"`);
            console.log(`  📊 Markdown length: ${processResult.markdown.length} characters`);
            console.log(`  📊 Links found: ${processResult.links.length}`);
            console.log(`  📊 Depth: ${processResult.depth}`);
        } catch (error) {
            console.log(`  ❌ processPage failed: ${error.message}`);
        }
        console.log('');

        console.log('🌐 Testing crawl method (limited)...');
        try {
            const testUrl = 'https://httpbin.org/html';
            console.log(`  Crawling: ${testUrl} (maxDepth: 0)`);
            
            const crawlResults = await crawler.crawl(testUrl, 0);
            console.log(`  ✅ crawl completed successfully`);
            console.log(`  📊 Pages crawled: ${crawlResults.length}`);
            
            if (crawlResults.length > 0) {
                const firstResult = crawlResults[0];
                console.log(`  📊 First page title: "${firstResult.title}"`);
                console.log(`  📊 First page markdown length: ${firstResult.markdown.length}`);
            }
        } catch (error) {
            console.log(`  ❌ crawl failed: ${error.message}`);
        }
        console.log('');

        console.log('🎉 Test completed!');
        console.log('');
        console.log('📋 Check your Weave dashboard for traces:');
        console.log(`   https://wandb.ai/${CONFIG.entity}/${CONFIG.project}`);
        console.log('');
        console.log('Expected traces:');
        console.log('  - WebCrawler.fetchPage');
        console.log('  - WebCrawler.processPage');
        console.log('  - WebCrawler.crawl');
        console.log('');
        console.log('✅ If you see named traces (not anonymous), the fix worked!');

    } catch (error) {
        console.error('💥 Test failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testCrawlerInstrumentation().catch(console.error);
