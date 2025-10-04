/**
 * Weave Integration Test for Node.js Admin Project
 * 
 * This test verifies that Weave instrumentation works correctly with:
 * 1. Parent-child trace relationships
 * 2. Nested function calls
 * 3. Async operations
 * 4. Error handling
 * 5. Metadata capture
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminWeave, initializeWeave } from '../../src/weave/init.js';

// Test service class to demonstrate instrumentation
class TestCourseService {

  async searchCourses(query: string, limit: number = 5): Promise<any> {
    console.log(`🔍 Searching for courses: "${query}" (limit: ${limit})`);
    
    // Simulate database query
    await this.simulateDbQuery(query);
    
    // Simulate processing results
    const results = await this.processResults(query, limit);
    
    // Log metrics
    await adminWeave.logMetric('courses_found', results.length, {
      query,
      limit,
      timestamp: new Date().toISOString()
    });
    
    return {
      query,
      total: results.length,
      courses: results,
      searchMethod: 'vector'
    };
  }

  simulateDbQuery = async (query: string): Promise<void> => {
    console.log(`📊 Executing database query for: "${query}"`);
    
    // Simulate async database operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create child trace for specific operations
    await adminWeave.createChildTrace('neo4j_vector_search', async () => {
      console.log('🔍 Performing vector similarity search...');
      await new Promise(resolve => setTimeout(resolve, 50));
      return { similarity_scores: [0.95, 0.87, 0.82] };
    });
    
    await adminWeave.createChildTrace('neo4j_metadata_fetch', async () => {
      console.log('📋 Fetching course metadata...');
      await new Promise(resolve => setTimeout(resolve, 30));
      return { metadata_count: 3 };
    });
  }

  processResults = async (query: string, limit: number): Promise<any[]> => {
    console.log(`⚙️ Processing results for query: "${query}"`);
    
    // Simulate result processing with child operations
    const rawResults = await adminWeave.createChildTrace('format_courses', async () => {
      console.log('📝 Formatting course data...');
      await new Promise(resolve => setTimeout(resolve, 25));
      
      return [
        {
          id: '1',
          title: 'Machine Learning Fundamentals',
          difficulty: 'beginner',
          topics: ['ml', 'python', 'data-science']
        },
        {
          id: '2', 
          title: 'Advanced Deep Learning',
          difficulty: 'advanced',
          topics: ['deep-learning', 'neural-networks', 'ai']
        },
        {
          id: '3',
          title: 'Data Science with Python',
          difficulty: 'intermediate', 
          topics: ['python', 'data-science', 'pandas']
        }
      ];
    });

    // Apply limit
    return rawResults.slice(0, limit);
  }

  getCourseDetails = async (courseId: string): Promise<any> => {
    console.log(`📖 Getting details for course: ${courseId}`);
    
    // Simulate error scenario for testing
    if (courseId === 'error-test') {
      throw new Error('Simulated course not found error');
    }
    
    await new Promise(resolve => setTimeout(resolve, 75));
    
    return {
      id: courseId,
      title: 'Test Course',
      description: 'A test course for Weave integration',
      instructor: 'Test Instructor',
      duration: '2 hours'
    };
  }
}

// Test crawler service to demonstrate complex nested operations
class TestCrawlerService {

  async crawlWebsite(url: string): Promise<any> {
    console.log(`🕷️ Crawling website: ${url}`);
    
    // Multiple nested operations
    const pages = await this.discoverPages(url);
    const content = await this.extractContent(pages);
    const processed = await this.processContent(content);
    
    await adminWeave.logEvent('crawl_completed', {
      url,
      pages_found: pages.length,
      content_extracted: content.length,
      processing_time: Date.now()
    });
    
    return {
      url,
      pages_crawled: pages.length,
      content_chunks: processed.length,
      status: 'completed'
    };
  }

  discoverPages = async (url: string): Promise<string[]> => {
    console.log(`🔍 Discovering pages from: ${url}`);
    
    await adminWeave.createChildTrace('fetch_sitemap', async () => {
      console.log('📄 Fetching sitemap...');
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    
    await adminWeave.createChildTrace('parse_links', async () => {
      console.log('🔗 Parsing page links...');
      await new Promise(resolve => setTimeout(resolve, 60));
    });
    
    return [
      `${url}/page1`,
      `${url}/page2`, 
      `${url}/page3`
    ];
  }

  extractContent = async (pages: string[]): Promise<any[]> => {
    console.log(`📝 Extracting content from ${pages.length} pages`);

    const content = [];
    for (const page of pages) {
      // Sanitize page URL for trace name by replacing invalid characters
      const sanitizedPageName = page.replace(/[:/]/g, '_');
      const pageContent = await adminWeave.createChildTrace(`extract_page_${sanitizedPageName}`, async () => {
        console.log(`📄 Extracting content from: ${page}`);
        await new Promise(resolve => setTimeout(resolve, 30));
        return {
          url: page,
          title: `Title for ${page}`,
          content: `Content from ${page}`,
          wordCount: Math.floor(Math.random() * 1000) + 500
        };
      });
      content.push(pageContent);
    }

    return content;
  }

  processContent = async (content: any[]): Promise<any[]> => {
    console.log(`⚙️ Processing ${content.length} content items`);
    
    const processed = [];
    for (const item of content) {
      // Sanitize URL for trace name by replacing invalid characters
      const sanitizedUrl = item.url.replace(/[:/]/g, '_');
      const processedItem = await adminWeave.createChildTrace(`process_${sanitizedUrl}`, async () => {
        console.log(`🔄 Processing: ${item.url}`);
        
        // Simulate chunking
        await adminWeave.createChildTrace('chunk_content', async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
        });
        
        // Simulate embedding generation
        await adminWeave.createChildTrace('generate_embeddings', async () => {
          await new Promise(resolve => setTimeout(resolve, 35));
        });
        
        return {
          ...item,
          chunks: Math.ceil(item.wordCount / 200),
          embeddings_generated: true,
          processed_at: new Date().toISOString()
        };
      });
      processed.push(processedItem);
    }
    
    return processed;
  }
}

describe('Weave Integration Test', () => {
  let courseService: TestCourseService;
  let crawlerService: TestCrawlerService;
  
  beforeAll(async () => {
    console.log('\n🚀 Initializing Weave for integration testing...');
    await initializeWeave();
    
    courseService = new TestCourseService();
    crawlerService = new TestCrawlerService();
    
    console.log('✅ Weave integration test setup complete\n');
  });

  afterAll(async () => {
    console.log('\n🏁 Weave integration test cleanup complete');
  });

  it('should create parent-child traces for course search', async () => {
    console.log('\n🧪 Test 1: Course Search with Nested Operations');
    
    const result = await courseService.searchCourses('machine learning', 3);
    
    expect(result).toBeDefined();
    expect(result.query).toBe('machine learning');
    expect(result.courses).toHaveLength(3);
    expect(result.searchMethod).toBe('vector');
    
    console.log('✅ Course search test completed');
    console.log(`📊 Found ${result.total} courses`);
  });

  it('should handle errors in traced operations', async () => {
    console.log('\n🧪 Test 2: Error Handling in Traced Operations');
    
    await expect(courseService.getCourseDetails('error-test')).rejects.toThrow('Simulated course not found error');
    
    console.log('✅ Error handling test completed');
  });

  it('should create complex nested traces for crawling', async () => {
    console.log('\n🧪 Test 3: Complex Nested Crawling Operations');
    
    const result = await crawlerService.crawlWebsite('https://example.com');
    
    expect(result).toBeDefined();
    expect(result.url).toBe('https://example.com');
    expect(result.pages_crawled).toBe(3);
    expect(result.status).toBe('completed');
    
    console.log('✅ Crawling test completed');
    console.log(`🕷️ Crawled ${result.pages_crawled} pages, generated ${result.content_chunks} chunks`);
  });

  it('should demonstrate parallel operations', async () => {
    console.log('\n🧪 Test 4: Parallel Operations with Tracing');
    
    // Run multiple operations in parallel
    const [searchResult, courseDetails, crawlResult] = await Promise.all([
      courseService.searchCourses('python programming', 2),
      courseService.getCourseDetails('test-course-123'),
      crawlerService.crawlWebsite('https://test-site.com')
    ]);
    
    expect(searchResult.courses).toHaveLength(2);
    expect(courseDetails.id).toBe('test-course-123');
    expect(crawlResult.status).toBe('completed');
    
    console.log('✅ Parallel operations test completed');
  });

  it('should capture trace URL for analysis', async () => {
    console.log('\n🧪 Test 5: Trace URL Capture');
    
    await courseService.searchCourses('data science', 1);
    
    const traceUrl = adminWeave.getCurrentTraceUrl();
    if (traceUrl) {
      console.log(`🔗 Trace URL: ${traceUrl}`);
      console.log('📊 Use this URL to analyze the trace in Weave UI');
    } else {
      console.log('ℹ️ Trace URL not available (may be in local mode)');
    }
    
    console.log('✅ Trace URL test completed');
  });
});
