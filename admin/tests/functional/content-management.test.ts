/**
 * Functional tests for Content Management operations
 * Tests page deletion and reset all content functionality with mocks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../../src/services/storageService.js';
import neo4j from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';

// Mock neo4j-driver
vi.mock('neo4j-driver');
const mockedNeo4j = vi.mocked(neo4j);

// Mock fs/promises
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// Mock weave
vi.mock('../../src/weave/init.js', () => ({
  weave: {
    op: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
    logEvent: vi.fn(),
  },
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  config: {
    contentStoragePath: '/test/storage/content',
    neo4jUri: 'neo4j://localhost:7687',
    neo4jUser: 'neo4j',
    neo4jPassword: 'password',
    neo4jDatabase: 'neo4j',
  },
}));

describe('Content Management Functional Tests', () => {
  let storage: StorageService;
  let mockDriver: any;
  let mockSession: any;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Create mock session with detailed run method
    mockSession = {
      run: vi.fn(),
      close: vi.fn(),
    };

    // Create mock driver
    mockDriver = {
      session: vi.fn(() => mockSession),
      close: vi.fn(),
    };

    // Mock neo4j.driver to return our mock driver
    mockedNeo4j.driver.mockReturnValue(mockDriver);
    mockedNeo4j.auth = {
      basic: vi.fn((username, password) => ({ username, password })),
    } as any;

    // Mock console methods to capture logs
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    storage = new StorageService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await storage.close();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('deletePage', () => {
    const mockPage = {
      id: 'page-123',
      url: 'https://example.com/test',
      title: 'Test Page',
      domain: 'example.com',
      slug: 'test',
      crawlDepth: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('should delete page with all related chunks and files', async () => {
      // Mock getPageById to return a page
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const record: any = {
                id: mockPage.id,
                url: mockPage.url,
                title: mockPage.title,
                domain: mockPage.domain,
                slug: mockPage.slug,
                crawlDepth: mockPage.crawlDepth,
                createdAt: mockPage.createdAt,
                updatedAt: mockPage.updatedAt,
              };
              return record[key];
            },
          }],
        })
        // Mock chunk count query
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => key === 'chunkCount' ? { toNumber: () => 3 } : null,
          }],
        })
        // Mock delete query
        .mockResolvedValueOnce({});

      // Mock file system operations
      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.deletePage(mockPage.id);

      // Verify getPageById was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (p:Page {id: $id})'),
        { id: mockPage.id }
      );

      // Verify chunk count query was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)'),
        { id: mockPage.id }
      );

      // Verify delete query was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE p, c'),
        { id: mockPage.id }
      );

      // Verify file deletions
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);
      expect(mockedFs.unlink).toHaveBeenCalledWith(expect.stringContaining('test.md'));
      expect(mockedFs.unlink).toHaveBeenCalledWith(expect.stringContaining('test.json'));

      // Verify logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleting page "Test Page" with 3 chunks')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully deleted page "Test Page" and 3 related chunks')
      );
    });

    it('should handle page not found gracefully', async () => {
      // Mock getPageById to return no page
      mockSession.run.mockResolvedValueOnce({ records: [] });

      await storage.deletePage('non-existent-id');

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Page with id non-existent-id not found')
      );

      // Verify no delete operations were attempted
      expect(mockSession.run).toHaveBeenCalledTimes(1); // Only getPageById
    });

    it('should handle file deletion errors gracefully', async () => {
      // Mock getPageById to return a page
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const record: any = { ...mockPage };
              return record[key];
            },
          }],
        })
        // Mock chunk count query
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => key === 'chunkCount' ? { toNumber: () => 2 } : null,
          }],
        })
        // Mock delete query
        .mockResolvedValueOnce({});

      // Mock file system operations to fail
      mockedFs.unlink.mockRejectedValue(new Error('File not found'));

      await storage.deletePage(mockPage.id);

      // Verify database operations still completed
      expect(mockSession.run).toHaveBeenCalledTimes(3);

      // Verify warning was logged for file deletion failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete files:'),
        expect.any(Error)
      );
    });
  });

  describe('resetAllContent', () => {
    it('should delete all pages and chunks while preserving chat and settings', async () => {
      // Mock count query
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const counts: any = {
                pageCount: { toNumber: () => 5 },
                chunkCount: { toNumber: () => 15 },
                totalNodes: { toNumber: () => 20 },
              };
              return counts[key];
            },
          }],
        })
        // Mock delete pages and chunks query
        .mockResolvedValueOnce({})
        // Mock orphaned nodes cleanup query
        .mockResolvedValueOnce({});

      // Mock file system operations
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify count query was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE n:Page OR n:Chunk'),
        undefined
      );

      // Verify delete query was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE n:Page OR n:Chunk'),
        undefined
      );

      // Verify orphaned nodes cleanup was called
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('AND NOT n:ChatMessage'),
        undefined
      );

      // Verify file system operations
      expect(mockedFs.rm).toHaveBeenCalledWith('/test/storage/content', {
        recursive: true,
        force: true,
      });
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/test/storage/content', {
        recursive: true,
      });

      // Verify logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preparing to delete: 5 pages with vectors, 15 chunks with vectors')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preserving: ChatMessage and Setting nodes')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reset complete: Deleted 20 content nodes')
      );
    });

    it('should handle empty database gracefully', async () => {
      // Mock count query returning zero counts
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const counts: any = {
                pageCount: { toNumber: () => 0 },
                chunkCount: { toNumber: () => 0 },
                totalNodes: { toNumber: () => 0 },
              };
              return counts[key];
            },
          }],
        })
        // Mock delete queries
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      // Mock file system operations
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify operations still completed
      expect(mockSession.run).toHaveBeenCalledTimes(3);
      expect(mockedFs.rm).toHaveBeenCalled();
      expect(mockedFs.mkdir).toHaveBeenCalled();

      // Verify appropriate logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preparing to delete: 0 pages with vectors, 0 chunks with vectors')
      );
    });

    it('should handle file system errors gracefully', async () => {
      // Mock count query
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const counts: any = {
                pageCount: { toNumber: () => 2 },
                chunkCount: { toNumber: () => 8 },
                totalNodes: { toNumber: () => 10 },
              };
              return counts[key];
            },
          }],
        })
        // Mock delete queries
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      // Mock file system operations to fail
      mockedFs.rm.mockRejectedValue(new Error('Permission denied'));
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify database operations still completed
      expect(mockSession.run).toHaveBeenCalledTimes(3);

      // Verify warning was logged for file system failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete content directory:'),
        expect.any(Error)
      );

      // Verify success message still shows database cleanup
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reset complete: Deleted 10 content nodes')
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle database connection errors during page deletion', async () => {
      // Mock database error
      mockSession.run.mockRejectedValue(new Error('Connection lost'));

      await expect(storage.deletePage('page-123')).rejects.toThrow('Connection lost');

      // Verify session was still closed
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should handle database connection errors during reset', async () => {
      // Mock database error
      mockSession.run.mockRejectedValue(new Error('Database unavailable'));

      await expect(storage.resetAllContent()).rejects.toThrow('Database unavailable');

      // Verify session was still closed
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should preserve specific node types during reset', async () => {
      // Mock count query
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const counts: any = {
                pageCount: { toNumber: () => 3 },
                chunkCount: { toNumber: () => 9 },
                totalNodes: { toNumber: () => 12 },
              };
              return counts[key];
            },
          }],
        })
        // Mock delete queries
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      // Mock file system operations
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify that the orphaned nodes cleanup specifically excludes ChatMessage and Setting
      const orphanedNodesQuery = mockSession.run.mock.calls.find(call =>
        call[0].includes('AND NOT n:ChatMessage') && call[0].includes('AND NOT n:Setting')
      );
      expect(orphanedNodesQuery).toBeDefined();

      // Verify preservation message was logged
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preserved: Chat history and settings')
      );
    });

    it('should handle partial file deletion during individual page deletion', async () => {
      const mockPage = {
        id: 'page-456',
        url: 'https://example.com/partial',
        title: 'Partial Test Page',
        domain: 'example.com',
        slug: 'partial',
        crawlDepth: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Mock getPageById to return a page
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const record: any = { ...mockPage };
              return record[key];
            },
          }],
        })
        // Mock chunk count query
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => key === 'chunkCount' ? { toNumber: () => 1 } : null,
          }],
        })
        // Mock delete query
        .mockResolvedValueOnce({});

      // Mock file system operations - markdown succeeds, metadata fails
      mockedFs.unlink
        .mockResolvedValueOnce(undefined) // markdown file succeeds
        .mockRejectedValueOnce(new Error('Metadata file not found')); // metadata file fails

      await storage.deletePage(mockPage.id);

      // Verify both file deletions were attempted
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2);

      // Verify database operations completed despite file errors
      expect(mockSession.run).toHaveBeenCalledTimes(3);

      // Verify success message was still logged (database operations succeeded)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully deleted page "Partial Test Page"')
      );
    });

    it('should log detailed vector embedding cleanup information', async () => {
      // Mock count query with specific numbers
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const counts: any = {
                pageCount: { toNumber: () => 7 },
                chunkCount: { toNumber: () => 21 },
                totalNodes: { toNumber: () => 28 },
              };
              return counts[key];
            },
          }],
        })
        // Mock delete queries
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      // Mock file system operations
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify specific vector embedding count logging
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('7 pages with vectors, 21 chunks with vectors')
      );

      // Check that weave event was logged with correct vector embedding count
      const { weave } = await import('../../src/weave/init.js');
      expect(weave.logEvent).toHaveBeenCalledWith('all_content_reset',
        expect.objectContaining({
          pageCount: 7,
          chunkCount: 21,
          totalContentNodesDeleted: 28,
          vectorEmbeddingsCleared: 28, // 7 pages + 21 chunks
          storageCleared: true,
          chatHistoryPreserved: true,
          settingsPreserved: true,
        })
      );
    });
  });
});
