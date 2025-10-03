import neo4j, { Driver, Session } from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { weave } from '../weave/init.js';
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

export class StorageService {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      config.neo4jUri,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
    );
  }

  /**
   * Get a Neo4j session
   */
  private getSession(): Session {
    return this.driver.session({ database: config.neo4jDatabase });
  }

  /**
   * Close the driver
   */
  async close(): Promise<void> {
    await this.driver.close();
  }

  /**
   * Initialize database schema
   */
  @weave.op()
  async initializeSchema(): Promise<void> {
    const session = this.getSession();
    try {
      // Create constraints
      await session.run(`
        CREATE CONSTRAINT page_id_unique IF NOT EXISTS
        FOR (p:Page) REQUIRE p.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
        FOR (c:Chunk) REQUIRE c.id IS UNIQUE
      `);

      // Create indexes
      await session.run(`
        CREATE INDEX page_url_index IF NOT EXISTS
        FOR (p:Page) ON (p.url)
      `);

      await session.run(`
        CREATE INDEX page_domain_index IF NOT EXISTS
        FOR (p:Page) ON (p.domain)
      `);

      weave.logEvent('schema_initialized');
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
  @weave.op()
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

      weave.logEvent('markdown_saved', { domain, slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save markdown file: ${error.message}`);
      throw new Error(`Failed to save markdown file for ${domain}/${slug}: ${error.message}`);
    }
  }

  /**
   * Save metadata to file system
   */
  @weave.op()
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

      weave.logEvent('metadata_saved', { domain, slug, filePath });
      return filePath;
    } catch (error: any) {
      console.error(`Failed to save metadata file: ${error.message}`);
      throw new Error(`Failed to save metadata file for ${domain}/${slug}: ${error.message}`);
    }
  }

  /**
   * Save page to Neo4j
   */
  @weave.op()
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

      weave.logEvent('page_saved_neo4j', { id, url, domain, slug });
      return metadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Save complete page (Neo4j + file system) with chunks
   */
  @weave.op()
  async saveCompletePage(url: string, title: string, markdown: string, crawlDepth: number): Promise<PageMetadata> {
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
          MATCH (p:Page {id: $pageId})
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

      weave.logEvent('complete_page_saved', {
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
  @weave.op()
  async createPageChunks(pageId: string, markdown: string): Promise<void> {
    const chunks = chunkMarkdown(markdown, 1000);

    for (const chunk of chunks) {
      await this.createChunk(pageId, chunk);
    }

    weave.logEvent('page_chunks_created', {
      pageId,
      chunkCount: chunks.length,
    });
  }

  /**
   * Create a single chunk node and link it to a page
   */
  @weave.op()
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
   * Get all pages
   */
  @weave.op()
  async getAllPages(): Promise<PageMetadata[]> {
    const session = this.getSession();
    
    try {
      const result = await session.run(`
        MATCH (p:Page)
        RETURN p
        ORDER BY p.createdAt DESC
      `);

      return result.records.map(record => {
        const node = record.get('p');
        return node.properties as PageMetadata;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get page by ID
   */
  @weave.op()
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
  @weave.op()
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
  @weave.op()
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

      weave.logEvent('pages_searched_by_vector', {
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
  @weave.op()
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

      weave.logEvent('chunks_searched_by_vector', {
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
   * Delete page
   */
  @weave.op()
  async deletePage(id: string): Promise<void> {
    const session = this.getSession();
    
    try {
      // Get page metadata first
      const page = await this.getPageById(id);
      if (!page) return;

      // Delete from Neo4j
      await session.run(
        `
        MATCH (p:Page {id: $id})
        DETACH DELETE p
        `,
        { id }
      );

      // Delete files
      try {
        const mdPath = this.getMarkdownPath(page.domain, page.slug);
        const metaPath = this.getMetadataPath(page.domain, page.slug);
        
        await fs.unlink(mdPath).catch(() => {});
        await fs.unlink(metaPath).catch(() => {});
      } catch (e) {
        console.warn('Failed to delete files:', e);
      }

      weave.logEvent('page_deleted', { id, url: page.url });
    } finally {
      await session.close();
    }
  }

  /**
   * Reset all content
   */
  @weave.op()
  async resetAllContent(): Promise<void> {
    const session = this.getSession();

    try {
      // Delete all pages from Neo4j
      await session.run(`
        MATCH (p:Page)
        DETACH DELETE p
      `);

      // Delete all files
      try {
        await fs.rm(config.contentStoragePath, { recursive: true, force: true });
        await fs.mkdir(config.contentStoragePath, { recursive: true });
      } catch (e) {
        console.warn('Failed to delete content directory:', e);
      }

      weave.logEvent('all_content_reset');
    } finally {
      await session.close();
    }
  }

  /**
   * Get all graph nodes
   */
  @weave.op()
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
  @weave.op()
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
  @weave.op()
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
  @weave.op()
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
  @weave.op()
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
}

