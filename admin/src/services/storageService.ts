import neo4j, { Driver, Session } from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as weave from 'weave';
import { config } from '../config.js';
import { WeaveService } from '../weave/weaveService.js';
import { chunkMarkdown, type TextChunk } from '../utils/textChunking.js';
import { llmService } from './llmService.js';

export interface PageMetadata {
  id: string;
  url: string;
  title: string;
  domain: string;
  slug: string;
  crawlDepth: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkData {
  id: string;
  pageId: string;
  text: string;
  chunkIndex: number;
  embedding?: number[];
}

export interface CourseMetadata {
  id: string;
  url: string;
  title: string;
  description?: string;
  slug: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  duration?: string;
  topics?: string[];
  instructor?: string;
  createdAt: string;
  updatedAt: string;
  lastCrawledAt?: string;
  isActive: boolean;
}

export interface CourseChunkData {
  id: string;
  courseId: string;
  text: string;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  embedding?: number[];
  section?: string;
  createdAt: string;
}

export class StorageService {
  private static instance: StorageService | null = null;
  private static driver: Driver | null = null;
  private driver: Driver;

  // Weave-wrapped methods (will be set up in constructor)
  public initializeSchema!: () => Promise<void>;
  public saveCompletePage!: (url: string, title: string, markdown: string, crawlDepth: number) => Promise<PageMetadata>;
  public getAllPages!: () => Promise<PageMetadata[]>;

  private constructor() {
    if (StorageService.driver) {
      this.driver = StorageService.driver;
      return;
    }

    try {
      console.log('🔌 Initializing Neo4j driver...');
      console.log(`   URI: ${config.neo4jUri}`);
      console.log(`   User: ${config.neo4jUser}`);
      console.log(`   Database: ${config.neo4jDatabase}`);

      this.driver = neo4j.driver(
        config.neo4jUri,
        neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
      );

      StorageService.driver = this.driver;
      console.log('✅ Neo4j driver initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Neo4j driver:', error);
      throw error;
    }

    // Set up weave operations with proper binding
    const self = this;

    this.initializeSchema = weave.op(async function initializeSchema() {
      return await self._initializeSchemaImpl();
    }, { name: 'StorageService.initializeSchema' });

    this.saveCompletePage = weave.op(async function saveCompletePage(url: string, title: string, markdown: string, crawlDepth: number) {
      return await self._saveCompletePageImpl(url, title, markdown, crawlDepth);
    }, { name: 'StorageService.saveCompletePage' });

    this.getAllPages = weave.op(async function getAllPages() {
      return await self._getAllPagesImpl();
    }, { name: 'StorageService.getAllPages' });
  }

  /**
   * Get singleton instance of StorageService
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Get a Neo4j session
   */
  private getSession(): Session {
    return this.driver.session({ database: config.neo4jDatabase });
  }

  /**
   * Close the driver (only call this when shutting down the application)
   */
  async close(): Promise<void> {
    if (StorageService.driver) {
      await StorageService.driver.close();
      StorageService.driver = null;
      StorageService.instance = null;
    }
  }

  /**
   * Close the driver for application shutdown
   */
  static async shutdown(): Promise<void> {
    if (StorageService.instance) {
      await StorageService.instance.close();
    }
  }

  /**
   * Implementation of initializeSchema - Initialize database schema
   */
  async _initializeSchemaImpl(): Promise<void> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }
    const session = this.getSession();
    try {
      // Create constraints for existing nodes
      await session.run(`
        CREATE CONSTRAINT page_id_unique IF NOT EXISTS
        FOR (p:Page) REQUIRE p.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
        FOR (c:Chunk) REQUIRE c.id IS UNIQUE
      `);

      // Create constraints for course nodes
      await session.run(`
        CREATE CONSTRAINT course_id_unique IF NOT EXISTS
        FOR (c:Course) REQUIRE c.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT course_chunk_id_unique IF NOT EXISTS
        FOR (cc:CourseChunk) REQUIRE cc.id IS UNIQUE
      `);

      // Create indexes for existing nodes
      await session.run(`
        CREATE INDEX page_url_index IF NOT EXISTS
        FOR (p:Page) ON (p.url)
      `);

      await session.run(`
        CREATE INDEX page_domain_index IF NOT EXISTS
        FOR (p:Page) ON (p.domain)
      `);

      // Create indexes for course nodes
      await session.run(`
        CREATE INDEX course_url_index IF NOT EXISTS
        FOR (c:Course) ON (c.url)
      `);

      await session.run(`
        CREATE INDEX course_slug_index IF NOT EXISTS
        FOR (c:Course) ON (c.slug)
      `);

      await session.run(`
        CREATE INDEX course_difficulty_index IF NOT EXISTS
        FOR (c:Course) ON (c.difficulty)
      `);

      await session.run(`
        CREATE INDEX course_active_index IF NOT EXISTS
        FOR (c:Course) ON (c.isActive)
      `);

      WeaveService.getInstance()?.logEvent('schema_initialized');
    } finally {
      await session.close();
    }
  }

  /**
   * Generate file path for markdown content
   */
  private getMarkdownPath(domain: string, slug: string): string {
    return path.join(config.contentStoragePath, domain, `${slug}.md`);
  }

  /**
   * Generate file path for metadata
   */
  private getMetadataPath(domain: string, slug: string): string {
    return path.join(config.contentStoragePath, domain, `${slug}.meta.json`);
  }

  // ===== COURSE FILE SYSTEM METHODS =====

  /**
   * Get course markdown file path
   */
  private getCourseMarkdownPath(slug: string): string {
    return path.join(config.contentStoragePath, 'courses', `${slug}.md`);
  }

  /**
   * Get course metadata file path
   */
  private getCourseMetadataPath(slug: string): string {
    return path.join(config.contentStoragePath, 'courses', `${slug}.metadata.json`);
  }

  /**
   * Save course markdown content to file system
   */
  
  async saveCourseMarkdownFile(slug: string, markdown: string): Promise<string> {
    const filePath = this.getCourseMarkdownPath(slug);
    const dir = path.dirname(filePath);

    try {
      // Ensure courses directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write markdown file
      await fs.writeFile(filePath, markdown, 'utf-8');

      WeaveService.getInstance()?.logEvent('course_markdown_saved', { slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save course markdown file: ${error.message}`);
      throw new Error(`Failed to save course markdown file for ${slug}: ${error.message}`);
    }
  }

  /**
   * Save course metadata to file system
   */
  
  async saveCourseMetadataFile(slug: string, metadata: CourseMetadata): Promise<string> {
    const filePath = this.getCourseMetadataPath(slug);
    const dir = path.dirname(filePath);

    try {
      // Ensure courses directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write metadata file
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');

      WeaveService.getInstance()?.logEvent('course_metadata_saved', { slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save course metadata file: ${error.message}`);
      throw new Error(`Failed to save course metadata file for ${slug}: ${error.message}`);
    }
  }

  /**
   * Delete course files from file system
   */
  
  async deleteCourseFiles(slug: string): Promise<void> {
    try {
      const markdownPath = this.getCourseMarkdownPath(slug);
      const metadataPath = this.getCourseMetadataPath(slug);

      // Delete files if they exist
      try {
        await fs.unlink(markdownPath);
        WeaveService.getInstance()?.logEvent('course_markdown_deleted', { slug, path: markdownPath });
      } catch (e) {
        // File might not exist, that's ok
      }

      try {
        await fs.unlink(metadataPath);
        WeaveService.getInstance()?.logEvent('course_metadata_deleted', { slug, path: metadataPath });
      } catch (e) {
        // File might not exist, that's ok
      }
    } catch (error: any) {
      console.error(`Failed to delete course files: ${error.message}`);
      throw new Error(`Failed to delete course files for ${slug}: ${error.message}`);
    }
  }

  /**
   * Generate slug from URL
   */
  private generateSlug(url: string): string {
    try {
      const urlObj = new URL(url);
      let slug = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
      
      if (!slug) {
        slug = 'index';
      }

      // Replace slashes with dashes
      slug = slug.replace(/\//g, '-');
      
      // Remove special characters
      slug = slug.replace(/[^a-zA-Z0-9-_]/g, '-');
      
      // Remove consecutive dashes
      slug = slug.replace(/-+/g, '-');
      
      return slug;
    } catch (e) {
      return 'page-' + uuidv4().substring(0, 8);
    }
  }

  /**
   * Save markdown content to file system
   */
  
  async saveMarkdownFile(domain: string, slug: string, markdown: string): Promise<string> {
    const filePath = this.getMarkdownPath(domain, slug);
    const dir = path.dirname(filePath);

    try {
      // Ensure base storage directory exists first
      await fs.mkdir(config.contentStoragePath, { recursive: true });

      // Create domain directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Write markdown file
      await fs.writeFile(filePath, markdown, 'utf-8');

      WeaveService.getInstance()?.logEvent('markdown_saved', { domain, slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save markdown file: ${error.message}`);
      throw new Error(`Failed to save markdown file for ${domain}/${slug}: ${error.message}`);
    }
  }

  /**
   * Save metadata to file system
   */
  
  async saveMetadataFile(domain: string, slug: string, metadata: PageMetadata): Promise<string> {
    const filePath = this.getMetadataPath(domain, slug);
    const dir = path.dirname(filePath);

    try {
      // Ensure base storage directory exists first
      await fs.mkdir(config.contentStoragePath, { recursive: true });

      // Create directory if it doesn't exist
      await fs.mkdir(dir, { recursive: true });

      // Write metadata file
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');

      WeaveService.getInstance()?.logEvent('metadata_saved', { domain, slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save metadata file: ${error.message}`);
      throw new Error(`Failed to save metadata file for ${domain}/${slug}: ${error.message}`);
    }
  }

  /**
   * Save page to Neo4j
   */
  
  async savePage(url: string, title: string, crawlDepth: number): Promise<PageMetadata> {
    const session = this.getSession();
    
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const slug = this.generateSlug(url);
      const id = uuidv4();
      const now = new Date().toISOString();

      const metadata: PageMetadata = {
        id,
        url,
        title,
        domain,
        slug,
        crawlDepth,
        createdAt: now,
        updatedAt: now,
      };

      // Save to Neo4j
      await session.run(
        `
        MERGE (p:Page {url: $url})
        SET p.id = $id,
            p.title = $title,
            p.domain = $domain,
            p.slug = $slug,
            p.crawlDepth = $crawlDepth,
            p.createdAt = $createdAt,
            p.updatedAt = $updatedAt
        RETURN p
        `,
        metadata
      );

      WeaveService.getInstance()?.logEvent('page_saved_neo4j', { id, url, domain, slug });
      return metadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Implementation of saveCompletePage - Save complete page (Neo4j + file system) with chunks
   */

  async _saveCompletePageImpl(url: string, title: string, markdown: string, crawlDepth: number): Promise<PageMetadata> {
    const session = this.getSession();

    try {
      // Generate metadata
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const slug = this.generateSlug(url);
      const id = uuidv4();
      const now = new Date().toISOString();

      const metadata: PageMetadata = {
        id,
        url,
        title,
        domain,
        slug,
        crawlDepth,
        createdAt: now,
        updatedAt: now,
      };

      // Generate page embedding
      const pageEmbedding = await llmService.generateEmbedding(markdown);

      // Save page to Neo4j in single transaction with embedding
      await session.run(
        `
        MERGE (p:Page {url: $url})
        SET p.id = $id,
            p.title = $title,
            p.domain = $domain,
            p.slug = $slug,
            p.crawlDepth = $crawlDepth,
            p.createdAt = $createdAt,
            p.updatedAt = $updatedAt,
            p.embedding = $embedding
        RETURN p
        `,
        { ...metadata, embedding: pageEmbedding }
      );

      // Create chunks in the same session/transaction with embeddings
      const chunks = chunkMarkdown(markdown, 1000);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = uuidv4();

        // Generate embedding for chunk text
        const chunkEmbedding = await llmService.generateEmbedding(chunk.text);

        await session.run(`
          MATCH (p:Page {url: $url})
          CREATE (c:Chunk {
            id: $chunkId,
            pageId: $pageId,
            text: $text,
            chunkIndex: $chunkIndex,
            startPosition: $startPosition,
            endPosition: $endPosition,
            embedding: $embedding,
            createdAt: datetime()
          })
          CREATE (p)-[:HAS_CHUNK]->(c)
          RETURN c.id as chunkId
        `, {
          url,
          pageId: id,
          chunkId,
          text: chunk.text,
          chunkIndex: chunk.index,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          embedding: chunkEmbedding
        });
      }

      // Save markdown to file system
      await this.saveMarkdownFile(metadata.domain, metadata.slug, markdown);

      // Save metadata to file system
      await this.saveMetadataFile(metadata.domain, metadata.slug, metadata);

      WeaveService.getInstance()?.logEvent('complete_page_saved', {
        id: metadata.id,
        url,
        domain: metadata.domain,
        slug: metadata.slug,
        chunksCreated: chunks.length
      });

      return metadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Create chunks for a page and store them in Neo4j
   */
  
  async createPageChunks(pageId: string, markdown: string): Promise<void> {
    const chunks = chunkMarkdown(markdown, 1000);

    for (const chunk of chunks) {
      await this.createChunk(pageId, chunk);
    }

    WeaveService.getInstance()?.logEvent('page_chunks_created', {
      pageId,
      chunkCount: chunks.length,
    });
  }

  /**
   * Create a single chunk node and link it to a page
   */
  
  async createChunk(pageId: string, chunk: TextChunk): Promise<string> {
    const session = this.getSession();
    const chunkId = uuidv4();

    try {
      // First verify the page exists
      const pageCheckResult = await session.run(`
        MATCH (p:Page {id: $pageId})
        RETURN p.id as pageId
      `, { pageId });

      if (pageCheckResult.records.length === 0) {
        throw new Error(`Page with id ${pageId} not found. Cannot create chunk.`);
      }

      // Create chunk and link to page in a single transaction
      await session.run(`
        MATCH (p:Page {id: $pageId})
        CREATE (c:Chunk {
          id: $chunkId,
          pageId: $pageId,
          text: $text,
          chunkIndex: $chunkIndex,
          startPosition: $startPosition,
          endPosition: $endPosition,
          createdAt: datetime()
        })
        CREATE (p)-[:HAS_CHUNK]->(c)
        RETURN c.id as chunkId
      `, {
        chunkId,
        pageId,
        text: chunk.text,
        chunkIndex: chunk.index,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
      });

      return chunkId;
    } finally {
      await session.close();
    }
  }

  /**
   * Implementation of getAllPages - Get all pages
   */
  async _getAllPagesImpl(): Promise<PageMetadata[]> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (p:Page)
        RETURN p
        ORDER BY p.createdAt DESC
      `);

      const pages = result.records.map(record => {
        const node = record.get('p');
        return node.properties as PageMetadata;
      });

      // Log the count of pages returned for Weave tracking
      WeaveService.getInstance()?.logEvent('pages_retrieved', {
        totalPages: pages.length,
        operation: 'getAllPages'
      });

      return pages;
    } finally {
      await session.close();
    }
  }

  /**
   * Get page by ID
   */
  
  async getPageById(id: string): Promise<PageMetadata | null> {
    const session = this.getSession();
    
    try {
      const result = await session.run(
        `
        MATCH (p:Page {id: $id})
        RETURN p
        `,
        { id }
      );

      if (result.records.length === 0) return null;

      const node = result.records[0].get('p');
      return node.properties as PageMetadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Get chunks for a specific page
   */
  
  async getPageChunks(pageId: string): Promise<ChunkData[]> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Page {id: $pageId})-[:HAS_CHUNK]->(c:Chunk)
        RETURN c
        ORDER BY c.chunkIndex
        `,
        { pageId }
      );

      const chunks: ChunkData[] = [];
      for (const record of result.records) {
        const chunkNode = record.get('c');
        chunks.push({
          id: chunkNode.properties.id,
          pageId: chunkNode.properties.pageId,
          text: chunkNode.properties.text,
          chunkIndex: chunkNode.properties.chunkIndex,
          embedding: chunkNode.properties.embedding || undefined
        });
      }

      return chunks;
    } finally {
      await session.close();
    }
  }

  /**
   * Search pages by vector similarity
   */
  
  async searchPagesByVector(embedding: number[], limit: number = 5, scoreThreshold: number = 0.9): Promise<Array<PageMetadata & { score: number }>> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `
        MATCH (p:Page)
        WHERE p.embedding IS NOT NULL
        WITH p,
             reduce(dot = 0.0, i in range(0, size(p.embedding)-1) | dot + p.embedding[i] * $embedding[i]) as dotProduct,
             sqrt(reduce(norm1 = 0.0, i in range(0, size(p.embedding)-1) | norm1 + p.embedding[i] * p.embedding[i])) as norm1,
             sqrt(reduce(norm2 = 0.0, i in range(0, size($embedding)-1) | norm2 + $embedding[i] * $embedding[i])) as norm2
        WITH p, dotProduct / (norm1 * norm2) AS score
        WHERE score >= $scoreThreshold
        RETURN p, score
        ORDER BY score DESC
        LIMIT $limit
        `,
        { embedding, scoreThreshold, limit: neo4j.int(limit) }
      );

      const pages: Array<PageMetadata & { score: number }> = [];
      for (const record of result.records) {
        const pageNode = record.get('p');
        const score = record.get('score');
        pages.push({
          id: pageNode.properties.id,
          url: pageNode.properties.url,
          title: pageNode.properties.title,
          domain: pageNode.properties.domain,
          slug: pageNode.properties.slug,
          crawlDepth: pageNode.properties.crawlDepth,
          createdAt: pageNode.properties.createdAt,
          updatedAt: pageNode.properties.updatedAt,
          score: score
        });
      }

      WeaveService.getInstance()?.logEvent('pages_searched_by_vector', {
        resultsCount: pages.length,
        scoreThreshold,
        limit
      });

      return pages;
    } finally {
      await session.close();
    }
  }

  /**
   * Search chunks by vector similarity
   */
  
  async searchChunksByVector(embedding: number[], limit: number = 5, scoreThreshold: number = 0.9): Promise<Array<ChunkData & { score: number }>> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `
        MATCH (c:Chunk)
        WHERE c.embedding IS NOT NULL
        WITH c,
             reduce(dot = 0.0, i in range(0, size(c.embedding)-1) | dot + c.embedding[i] * $embedding[i]) as dotProduct,
             sqrt(reduce(norm1 = 0.0, i in range(0, size(c.embedding)-1) | norm1 + c.embedding[i] * c.embedding[i])) as norm1,
             sqrt(reduce(norm2 = 0.0, i in range(0, size($embedding)-1) | norm2 + $embedding[i] * $embedding[i])) as norm2
        WITH c, dotProduct / (norm1 * norm2) AS score
        WHERE score >= $scoreThreshold
        RETURN c, score
        ORDER BY score DESC
        LIMIT $limit
        `,
        { embedding, scoreThreshold, limit: neo4j.int(limit) }
      );

      const chunks: Array<ChunkData & { score: number }> = [];
      for (const record of result.records) {
        const chunkNode = record.get('c');
        const score = record.get('score');
        chunks.push({
          id: chunkNode.properties.id,
          pageId: chunkNode.properties.pageId,
          text: chunkNode.properties.text,
          chunkIndex: chunkNode.properties.chunkIndex,
          embedding: chunkNode.properties.embedding,
          score: score
        });
      }

      WeaveService.getInstance()?.logEvent('chunks_searched_by_vector', {
        resultsCount: chunks.length,
        scoreThreshold,
        limit
      });

      return chunks;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete page and all related nodes (chunks with vector embeddings) and files
   */
  
  async deletePage(id: string): Promise<void> {
    const session = this.getSession();

    try {
      // Get page metadata first
      const page = await this.getPageById(id);
      if (!page) {
        console.warn(`⚠️ Page with id ${id} not found`);
        return;
      }

      // First, count what we're about to delete for logging
      const countResult = await session.run(
        `
        MATCH (p:Page {id: $id})
        OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)
        RETURN count(c) as chunkCount
        `,
        { id }
      );
      const chunkCount = countResult.records[0]?.get('chunkCount')?.toNumber() || 0;

      console.log(`🗑️ Deleting page "${page.title}" with ${chunkCount} chunks and vector embeddings`);

      // Delete page and all related chunks in a single transaction
      await session.run(
        `
        MATCH (p:Page {id: $id})
        OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)
        DETACH DELETE p, c
        `,
        { id }
      );

      // Delete associated files
      try {
        const mdPath = this.getMarkdownPath(page.domain, page.slug);
        const metaPath = this.getMetadataPath(page.domain, page.slug);

        await fs.unlink(mdPath).catch(() => {});
        await fs.unlink(metaPath).catch(() => {});

        console.log(`✅ Deleted files: ${page.slug}.md and ${page.slug}.json`);
      } catch (e) {
        console.warn('⚠️ Failed to delete files:', e);
      }

      console.log(`✅ Successfully deleted page "${page.title}" and ${chunkCount} related chunks with vector embeddings`);

      WeaveService.getInstance()?.logEvent('page_deleted', {
        id,
        url: page.url,
        title: page.title,
        chunksDeleted: chunkCount,
        vectorEmbeddingsCleared: chunkCount + 1, // +1 for page embedding
        filesDeleted: true
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Reset all content - deletes page-related and course-related nodes and vector embeddings only
   * Preserves ChatMessage and Setting nodes
   */
  
  async resetAllContent(): Promise<void> {
    const session = this.getSession();

    try {
      // First, get count of content nodes to be deleted for logging
      const countResult = await session.run(`
        MATCH (n)
        WHERE n:Page OR n:Chunk OR n:Course OR n:CourseChunk
        RETURN
          count(CASE WHEN n:Page THEN 1 END) as pageCount,
          count(CASE WHEN n:Chunk THEN 1 END) as chunkCount,
          count(CASE WHEN n:Course THEN 1 END) as courseCount,
          count(CASE WHEN n:CourseChunk THEN 1 END) as courseChunkCount,
          count(n) as totalNodes
      `);

      const record = countResult.records[0];
      const pageCount = record?.get('pageCount')?.toNumber() || 0;
      const chunkCount = record?.get('chunkCount')?.toNumber() || 0;
      const courseCount = record?.get('courseCount')?.toNumber() || 0;
      const courseChunkCount = record?.get('courseChunkCount')?.toNumber() || 0;
      const totalNodes = record?.get('totalNodes')?.toNumber() || 0;

      console.log(`🗑️ Preparing to delete: ${pageCount} pages, ${chunkCount} chunks, ${courseCount} courses, ${courseChunkCount} course chunks`);
      console.log(`💾 Preserving: ChatMessage and Setting nodes`);

      // Delete Page, Chunk, Course, and CourseChunk nodes (which contain vector embeddings)
      // This preserves chat history and settings while clearing all crawled content
      await session.run(`
        MATCH (n)
        WHERE n:Page OR n:Chunk OR n:Course OR n:CourseChunk
        DETACH DELETE n
      `);

      // Additional cleanup: Delete any orphaned nodes that were connected only to content nodes
      // but preserve ChatMessage and Setting nodes
      await session.run(`
        MATCH (n)
        WHERE NOT EXISTS((n)--())
          AND NOT n:ChatMessage
          AND NOT n:Setting
        DELETE n
      `);

      // Delete all files from the content storage directory
      try {
        await fs.rm(config.contentStoragePath, { recursive: true, force: true });
        await fs.mkdir(config.contentStoragePath, { recursive: true });
        console.log(`✅ Deleted content storage directory: ${config.contentStoragePath}`);
      } catch (e) {
        console.warn('⚠️ Failed to delete content directory:', e);
      }

      console.log(`✅ Reset complete: Deleted ${totalNodes} content nodes (${pageCount} pages with vectors, ${chunkCount} chunks with vectors)`);
      console.log(`💾 Preserved: Chat history and settings`);

      WeaveService.getInstance()?.logEvent('all_content_reset', {
        pageCount,
        chunkCount,
        totalContentNodesDeleted: totalNodes,
        vectorEmbeddingsCleared: pageCount + chunkCount,
        storageCleared: true,
        chatHistoryPreserved: true,
        settingsPreserved: true
      });
    } finally {
      await session.close();
    }
  }

  // ===== COURSE STORAGE METHODS =====

  /**
   * Save course to Neo4j with metadata
   */
  
  async saveCourse(
    url: string,
    title: string,
    markdown: string,
    metadata: Partial<CourseMetadata> = {}
  ): Promise<CourseMetadata> {
    const session = this.getSession();

    try {
      // Generate course metadata
      const urlObj = new URL(url);
      const slug = this.generateSlug(url);
      const id = uuidv4();
      const now = new Date().toISOString();

      const courseMetadata: CourseMetadata = {
        id,
        url,
        title,
        description: metadata.description || null,
        slug,
        difficulty: metadata.difficulty || null,
        duration: metadata.duration || null,
        topics: metadata.topics || [],
        instructor: metadata.instructor || null,
        createdAt: now,
        updatedAt: now,
        lastCrawledAt: now,
        isActive: true,
      };

      // Generate course embedding
      const courseEmbedding = await llmService.generateEmbedding(markdown);

      // Save course to Neo4j
      await session.run(
        `
        MERGE (c:Course {url: $url})
        SET c.id = $id,
            c.title = $title,
            c.description = $description,
            c.slug = $slug,
            c.difficulty = $difficulty,
            c.duration = $duration,
            c.topics = $topics,
            c.instructor = $instructor,
            c.createdAt = $createdAt,
            c.updatedAt = $updatedAt,
            c.lastCrawledAt = $lastCrawledAt,
            c.isActive = $isActive,
            c.embedding = $embedding
        RETURN c
        `,
        { ...courseMetadata, embedding: courseEmbedding }
      );

      // Create chunks for the course content
      const chunks = chunkMarkdown(markdown, 1000);
      for (const chunk of chunks) {
        const chunkId = uuidv4();
        const chunkEmbedding = await llmService.generateEmbedding(chunk.text);

        await session.run(`
          MATCH (c:Course {id: $courseId})
          CREATE (cc:CourseChunk {
            id: $chunkId,
            courseId: $courseId,
            text: $text,
            chunkIndex: $chunkIndex,
            startPosition: $startPosition,
            endPosition: $endPosition,
            embedding: $embedding,
            section: $section,
            createdAt: datetime()
          })
          CREATE (c)-[:HAS_CHUNK]->(cc)
          RETURN cc.id as chunkId
        `, {
          courseId: id,
          chunkId,
          text: chunk.text,
          chunkIndex: chunk.index,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          embedding: chunkEmbedding,
          section: metadata.section || null
        });
      }

      // Save markdown to file system (in courses subdirectory)
      await this.saveCourseMarkdownFile(slug, markdown);

      // Save metadata to file system
      await this.saveCourseMetadataFile(slug, courseMetadata);

      WeaveService.getInstance()?.logEvent('course_saved', {
        id: courseMetadata.id,
        url,
        slug: courseMetadata.slug,
        chunksCreated: chunks.length
      });

      return courseMetadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Get all courses
   */
  
  async getAllCourses(): Promise<CourseMetadata[]> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (c:Course)
        RETURN c
        ORDER BY c.createdAt DESC
      `);

      return result.records.map(record => {
        const node = record.get('c');
        return node.properties as CourseMetadata;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Search for similar courses using vector similarity
   */
  
  async searchSimilarCourses(query: string, limit: number = 10): Promise<CourseMetadata[]> {
    const session = this.getSession();

    try {
      // Generate embedding for the search query
      const queryEmbedding = await llmService.generateEmbedding(query);

      // Use vector similarity search to find similar courses
      // Calculate cosine similarity manually since GDS might not be available
      const result = await session.run(`
        MATCH (c:Course)
        WHERE c.embedding IS NOT NULL
        WITH c,
             reduce(dot = 0.0, i in range(0, size(c.embedding)-1) | dot + c.embedding[i] * $queryEmbedding[i]) AS dotProduct,
             sqrt(reduce(norm1 = 0.0, i in range(0, size(c.embedding)-1) | norm1 + c.embedding[i] * c.embedding[i])) AS norm1,
             sqrt(reduce(norm2 = 0.0, i in range(0, size($queryEmbedding)-1) | norm2 + $queryEmbedding[i] * $queryEmbedding[i])) AS norm2
        WITH c, dotProduct / (norm1 * norm2) AS similarity
        RETURN c, similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `, {
        queryEmbedding,
        limit: neo4j.int(limit)
      });

      return result.records.map(record => {
        const node = record.get('c');
        const similarity = record.get('similarity');
        const courseData = node.properties as CourseMetadata;

        // Add similarity score for debugging/ranking
        (courseData as any).similarity = similarity;

        return courseData;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get course by ID
   */
  
  async getCourseById(id: string): Promise<CourseMetadata | null> {
    const session = this.getSession();

    try {
      const result = await session.run(
        `MATCH (c:Course {id: $id}) RETURN c`,
        { id }
      );

      if (result.records.length === 0) {
        return null;
      }

      const node = result.records[0].get('c');
      return node.properties as CourseMetadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete course and all related chunks
   */
  
  async deleteCourse(id: string): Promise<void> {
    const session = this.getSession();

    try {
      // Get course metadata for file cleanup
      const courseResult = await session.run(
        `MATCH (c:Course {id: $id}) RETURN c.slug as slug`,
        { id }
      );

      if (courseResult.records.length === 0) {
        throw new Error(`Course with id ${id} not found`);
      }

      const slug = courseResult.records[0].get('slug');

      // Delete course and all related chunks
      await session.run(`
        MATCH (c:Course {id: $id})
        OPTIONAL MATCH (c)-[:HAS_CHUNK]->(cc:CourseChunk)
        DETACH DELETE c, cc
      `, { id });

      // Delete course files
      await this.deleteCourseFiles(slug);

      WeaveService.getInstance()?.logEvent('course_deleted', { id, slug });
    } finally {
      await session.close();
    }
  }

  /**
   * Delete all courses and their related data
   */
  async deleteAllCourses(): Promise<{ deletedCourses: number; deletedChunks: number; deletedFiles: number }> {
    const session = this.getSession();

    try {
      // First, get count of courses and chunks to be deleted for logging
      const countResult = await session.run(`
        MATCH (c:Course)
        OPTIONAL MATCH (c)-[:HAS_CHUNK]->(cc:CourseChunk)
        RETURN
          count(DISTINCT c) as courseCount,
          count(cc) as chunkCount
      `);

      const courseCount = countResult.records[0]?.get('courseCount')?.toNumber() || 0;
      const chunkCount = countResult.records[0]?.get('chunkCount')?.toNumber() || 0;

      if (courseCount === 0) {
        return { deletedCourses: 0, deletedChunks: 0, deletedFiles: 0 };
      }

      // Delete all courses and their chunks from Neo4j
      await session.run(`
        MATCH (c:Course)
        OPTIONAL MATCH (c)-[:HAS_CHUNK]->(cc:CourseChunk)
        DETACH DELETE c, cc
      `);

      // Delete all course files from filesystem
      let deletedFiles = 0;
      try {
        const coursesDir = path.join(config.contentStoragePath, 'courses');
        const files = await fs.readdir(coursesDir);

        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.json')) {
            await fs.unlink(path.join(coursesDir, file));
            deletedFiles++;
          }
        }
      } catch (error) {
        console.warn('Failed to delete some course files:', error);
      }

      console.log(`✅ Deleted all courses: ${courseCount} courses, ${chunkCount} chunks, ${deletedFiles} files`);

      WeaveService.getInstance()?.logEvent('all_courses_deleted', {
        deletedCourses: courseCount,
        deletedChunks: chunkCount,
        deletedFiles
      });

      return {
        deletedCourses: courseCount,
        deletedChunks: chunkCount,
        deletedFiles
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get all graph nodes
   */
  
  async getGraphNodes(): Promise<any[]> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (n)
        RETURN n.id as id, labels(n)[0] as type,
               COALESCE(n.title, n.label, n.name, n.id) as label,
               properties(n) as properties
        ORDER BY type, label
      `);

      return result.records.map(record => ({
        id: record.get('id'),
        type: record.get('type'),
        label: record.get('label'),
        properties: record.get('properties'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all graph edges
   */
  
  async getGraphEdges(): Promise<any[]> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (source)-[r]->(target)
        RETURN source.id as sourceId, target.id as targetId,
               type(r) as relationship,
               COALESCE(r.weight, 1.0) as weight,
               properties(r) as properties
      `);

      return result.records.map(record => ({
        sourceId: record.get('sourceId'),
        targetId: record.get('targetId'),
        relationship: record.get('relationship'),
        weight: record.get('weight'),
        properties: record.get('properties'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Search graph nodes by label
   */
  
  async searchGraphNodes(query: string, limit: number = 50): Promise<any> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (n)
        WHERE toLower(COALESCE(n.title, n.label, n.name, '')) CONTAINS toLower($query)
        RETURN n.id as id, labels(n)[0] as type,
               COALESCE(n.title, n.label, n.name, n.id) as label,
               properties(n) as properties
        ORDER BY label
        LIMIT $limit
      `, { query, limit: neo4j.int(limit) });

      const results = result.records.map(record => ({
        id: record.get('id'),
        type: record.get('type'),
        label: record.get('label'),
        properties: record.get('properties'),
      }));

      return {
        results,
        total: results.length,
        query,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get node type statistics
   */
  
  async getNodeTypeStats(): Promise<Record<string, number>> {
    const session = this.getSession();

    try {
      const result = await session.run(`
        MATCH (n)
        RETURN labels(n)[0] as type, count(n) as count
        ORDER BY count DESC
      `);

      const stats: Record<string, number> = {};
      result.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        stats[type] = count;
      });

      return stats;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a graph node and optionally its connections
   */
  
  async deleteGraphNode(nodeId: string, cascade: boolean = false): Promise<{ deletedNodes: number; deletedEdges: number }> {
    const session = this.getSession();

    try {
      if (cascade) {
        // Delete node and all connected nodes
        const result = await session.run(`
          MATCH (n {id: $nodeId})
          OPTIONAL MATCH (n)-[r]-()
          WITH n, count(r) as edgeCount
          DETACH DELETE n
          RETURN 1 as deletedNodes, edgeCount
        `, { nodeId });

        const record = result.records[0];
        return {
          deletedNodes: record ? record.get('deletedNodes') : 0,
          deletedEdges: record ? record.get('edgeCount').toNumber() : 0,
        };
      } else {
        // Delete only the node and its relationships
        const result = await session.run(`
          MATCH (n {id: $nodeId})
          OPTIONAL MATCH (n)-[r]-()
          WITH n, count(r) as edgeCount
          DETACH DELETE n
          RETURN 1 as deletedNodes, edgeCount
        `, { nodeId });

        const record = result.records[0];
        return {
          deletedNodes: record ? record.get('deletedNodes') : 0,
          deletedEdges: record ? record.get('edgeCount').toNumber() : 0,
        };
      }
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // PROMPT OPTIMIZATION METHODS
  // ============================================================================

  /**
   * Create a new prompt optimization job
   */
  async createOptimizationJob(job: any): Promise<string> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const result = await session.run(`
        CREATE (job:PromptOptimizationJob {
          id: $id,
          name: $name,
          description: $description,
          startingQuestion: $startingQuestion,
          initialPrompt: $initialPrompt,
          status: $status,
          createdBy: $createdBy,
          createdAt: $createdAt,
          updatedAt: $updatedAt,
          config: $config,
          progress: $progress
        })
        RETURN job.id as id
      `, {
        id: job.id,
        name: job.name,
        description: job.description || '',
        startingQuestion: job.startingQuestion,
        initialPrompt: job.initialPrompt,
        status: job.status,
        createdBy: job.createdBy,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        config: JSON.stringify(job.config),
        progress: JSON.stringify(job.progress)
      });

      return result.records[0].get('id');
    } finally {
      await session.close();
    }
  }

  /**
   * Get optimization job by ID
   */
  async getOptimizationJobById(jobId: string): Promise<any | null> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const result = await session.run(`
        MATCH (job:PromptOptimizationJob {id: $jobId})
        OPTIONAL MATCH (job)-[:HAS_TRAINING_EXAMPLE]->(example:TrainingExample)
        OPTIONAL MATCH (job)-[:HAS_ITERATION]->(iteration:OptimizationIteration)
        RETURN job,
               collect(DISTINCT example) as trainingExamples,
               collect(DISTINCT iteration) as iterations
      `, { jobId });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const jobNode = record.get('job').properties;
      const trainingExamples = record.get('trainingExamples').map((node: any) => ({
        ...node.properties,
        evaluation: JSON.parse(node.properties.evaluation || '{}')
      }));
      const iterations = record.get('iterations').map((node: any) => ({
        ...node.properties,
        appliedActions: JSON.parse(node.properties.appliedActions || '[]'),
        criteriaScores: JSON.parse(node.properties.criteriaScores || '{}')
      }));

      return {
        ...jobNode,
        config: JSON.parse(jobNode.config || '{}'),
        progress: JSON.parse(jobNode.progress || '{}'),
        trainingExamples,
        iterations
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Update optimization job
   */
  async updateOptimizationJob(jobId: string, updates: any): Promise<void> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      // Separate training examples from other updates
      const { trainingExamples, ...jobUpdates } = updates;

      // Update job properties (excluding trainingExamples)
      if (Object.keys(jobUpdates).length > 0) {
        const setClause = Object.keys(jobUpdates)
          .map(key => {
            if (key === 'config' || key === 'progress') {
              return `job.${key} = $${key}`;
            }
            return `job.${key} = $${key}`;
          })
          .join(', ');

        const params: any = { jobId };
        Object.keys(jobUpdates).forEach(key => {
          if (key === 'config' || key === 'progress') {
            params[key] = JSON.stringify(jobUpdates[key]);
          } else {
            params[key] = jobUpdates[key];
          }
        });

        await session.run(`
          MATCH (job:PromptOptimizationJob {id: $jobId})
          SET ${setClause}, job.updatedAt = datetime()
        `, params);
      }

      // Handle training examples separately if provided
      if (trainingExamples && Array.isArray(trainingExamples)) {
        // First, delete existing training examples
        await session.run(`
          MATCH (job:PromptOptimizationJob {id: $jobId})-[:HAS_TRAINING_EXAMPLE]->(example:TrainingExample)
          DETACH DELETE example
        `, { jobId });

        // Then, create new training examples
        for (const example of trainingExamples) {
          await session.run(`
            MATCH (job:PromptOptimizationJob {id: $jobId})
            CREATE (example:TrainingExample {
              id: $exampleId,
              response: $response,
              evaluation: $evaluation,
              tags: $tags,
              createdAt: $createdAt,
              updatedAt: $updatedAt
            })
            CREATE (job)-[:HAS_TRAINING_EXAMPLE]->(example)
          `, {
            jobId,
            exampleId: example.id,
            response: example.response || '',
            evaluation: JSON.stringify(example.evaluation || {}),
            tags: JSON.stringify(example.tags || []),
            createdAt: example.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    } finally {
      await session.close();
    }
  }

  /**
   * List optimization jobs with pagination
   */
  async listOptimizationJobs(page: number = 1, pageSize: number = 10): Promise<{
    jobs: any[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      // Get total count
      const countResult = await session.run(`
        MATCH (job:PromptOptimizationJob)
        RETURN count(job) as total
      `);
      const total = countResult.records[0].get('total').toNumber();

      // Get paginated jobs
      const skip = neo4j.int((page - 1) * pageSize);
      const limit = neo4j.int(pageSize);
      const result = await session.run(`
        MATCH (job:PromptOptimizationJob)
        RETURN job
        ORDER BY job.createdAt DESC
        SKIP $skip
        LIMIT $limit
      `, { skip, limit });

      const jobs = result.records.map(record => {
        const jobNode = record.get('job').properties;
        return {
          ...jobNode,
          config: JSON.parse(jobNode.config || '{}'),
          progress: JSON.parse(jobNode.progress || '{}')
        };
      });

      return { jobs, total, page, pageSize };
    } finally {
      await session.close();
    }
  }

  /**
   * Delete optimization job and all related data
   */
  async deleteOptimizationJob(jobId: string): Promise<void> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      await session.run(`
        MATCH (job:PromptOptimizationJob {id: $jobId})
        OPTIONAL MATCH (job)-[:HAS_TRAINING_EXAMPLE]->(example:TrainingExample)
        OPTIONAL MATCH (job)-[:HAS_ITERATION]->(iteration:OptimizationIteration)
        DETACH DELETE job, example, iteration
      `, { jobId });
    } finally {
      await session.close();
    }
  }

  /**
   * Add training example to optimization job
   */
  async addTrainingExample(jobId: string, example: any): Promise<string> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const result = await session.run(`
        MATCH (job:PromptOptimizationJob {id: $jobId})
        CREATE (example:TrainingExample {
          id: $exampleId,
          response: $response,
          evaluation: $evaluation,
          tags: $tags,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })
        CREATE (job)-[:HAS_TRAINING_EXAMPLE]->(example)
        RETURN example.id as id
      `, {
        jobId,
        exampleId: example.id,
        response: example.response,
        evaluation: JSON.stringify(example.evaluation),
        tags: example.tags || [],
        createdAt: example.createdAt,
        updatedAt: example.updatedAt
      });

      return result.records[0].get('id');
    } finally {
      await session.close();
    }
  }

  /**
   * Update training example
   */
  async updateTrainingExample(exampleId: string, updates: any): Promise<void> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const setClause = Object.keys(updates)
        .map(key => {
          if (key === 'evaluation') {
            return `example.${key} = $${key}`;
          }
          return `example.${key} = $${key}`;
        })
        .join(', ');

      const params: any = { exampleId };
      Object.keys(updates).forEach(key => {
        if (key === 'evaluation') {
          params[key] = JSON.stringify(updates[key]);
        } else {
          params[key] = updates[key];
        }
      });

      await session.run(`
        MATCH (example:TrainingExample {id: $exampleId})
        SET ${setClause}, example.updatedAt = datetime()
      `, params);
    } finally {
      await session.close();
    }
  }

  /**
   * Delete training example
   */
  async deleteTrainingExample(exampleId: string): Promise<void> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      await session.run(`
        MATCH (example:TrainingExample {id: $exampleId})
        DETACH DELETE example
      `, { exampleId });
    } finally {
      await session.close();
    }
  }

  /**
   * Add optimization iteration to job
   */
  async addOptimizationIteration(jobId: string, iteration: any): Promise<string> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const result = await session.run(`
        MATCH (job:PromptOptimizationJob {id: $jobId})
        CREATE (iteration:OptimizationIteration {
          id: $iterationId,
          roundNumber: $roundNumber,
          iterationNumber: $iterationNumber,
          agentId: $agentId,
          inputPrompt: $inputPrompt,
          appliedActions: $appliedActions,
          generatedResponse: $generatedResponse,
          predictedScore: $predictedScore,
          actualScore: $actualScore,
          criteriaScores: $criteriaScores,
          improvements: $improvements,
          executionTime: $executionTime,
          timestamp: $timestamp,
          novelty: $novelty,
          confidence: $confidence
        })
        CREATE (job)-[:HAS_ITERATION]->(iteration)
        RETURN iteration.id as id
      `, {
        jobId,
        iterationId: iteration.id,
        roundNumber: iteration.roundNumber,
        iterationNumber: iteration.iterationNumber,
        agentId: iteration.agentId || null,
        inputPrompt: iteration.inputPrompt,
        appliedActions: JSON.stringify(iteration.appliedActions || []),
        generatedResponse: iteration.generatedResponse,
        predictedScore: iteration.predictedScore,
        actualScore: iteration.actualScore || null,
        criteriaScores: JSON.stringify(iteration.criteriaScores || {}),
        improvements: iteration.improvements || [],
        executionTime: iteration.executionTime,
        timestamp: iteration.timestamp,
        novelty: iteration.novelty || 0,
        confidence: iteration.confidence || 0
      });

      return result.records[0].get('id');
    } finally {
      await session.close();
    }
  }

  /**
   * Get optimization iterations for a job
   */
  async getOptimizationIterations(jobId: string, roundNumber?: number): Promise<any[]> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      let query = `
        MATCH (job:PromptOptimizationJob {id: $jobId})-[:HAS_ITERATION]->(iteration:OptimizationIteration)
      `;

      const params: any = { jobId };

      if (roundNumber !== undefined) {
        query += ` WHERE iteration.roundNumber = $roundNumber`;
        params.roundNumber = roundNumber;
      }

      query += `
        RETURN iteration
        ORDER BY iteration.roundNumber, iteration.iterationNumber
      `;

      const result = await session.run(query, params);

      return result.records.map(record => {
        const iterationNode = record.get('iteration').properties;
        return {
          ...iterationNode,
          appliedActions: JSON.parse(iterationNode.appliedActions || '[]'),
          criteriaScores: JSON.parse(iterationNode.criteriaScores || '{}')
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get optimization analytics for a job
   */
  async getOptimizationAnalytics(jobId: string): Promise<any> {
    const session = this.driver.session({ database: config.neo4jDatabase });
    try {
      const result = await session.run(`
        MATCH (job:PromptOptimizationJob {id: $jobId})-[:HAS_ITERATION]->(iteration:OptimizationIteration)
        WITH job, iteration
        ORDER BY iteration.roundNumber, iteration.iterationNumber
        RETURN
          count(iteration) as totalIterations,
          avg(iteration.executionTime) as avgExecutionTime,
          max(iteration.predictedScore) as bestScore,
          avg(iteration.predictedScore) as avgScore,
          collect({
            iteration: iteration.iterationNumber,
            round: iteration.roundNumber,
            score: iteration.predictedScore,
            criteriaScores: iteration.criteriaScores
          }) as scoreProgression
      `, { jobId });

      if (result.records.length === 0) {
        return {
          totalIterations: 0,
          avgExecutionTime: 0,
          bestScore: 0,
          avgScore: 0,
          scoreProgression: []
        };
      }

      const record = result.records[0];
      return {
        totalIterations: record.get('totalIterations').toNumber(),
        avgExecutionTime: record.get('avgExecutionTime'),
        bestScore: record.get('bestScore'),
        avgScore: record.get('avgScore'),
        scoreProgression: record.get('scoreProgression').map((item: any) => ({
          ...item,
          criteriaScores: JSON.parse(item.criteriaScores || '{}')
        }))
      };
    } finally {
      await session.close();
    }
  }
}
