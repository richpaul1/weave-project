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

describe('StorageService Unit Tests', () => {
  let storage: StorageService;
  let mockDriver: any;
  let mockSession: any;

  beforeEach(() => {
    // Create mock session
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

    storage = new StorageService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('initializeSchema', () => {
    it('should create constraints and indexes', async () => {
      mockSession.run.mockResolvedValue({});

      await storage.initializeSchema();

      // Should create 2 constraints and 2 indexes
      expect(mockSession.run).toHaveBeenCalledTimes(4);
      
      // Check constraint creation
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT')
      );
      
      // Check index creation
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX')
      );
    });

    it('should handle errors gracefully', async () => {
      mockSession.run.mockRejectedValue(new Error('Database error'));

      await expect(storage.initializeSchema()).rejects.toThrow('Database error');
    });
  });

  describe('savePage', () => {
    it('should save page to Neo4j', async () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const data: any = {
            id: 'test-id',
            url: 'https://example.com',
            title: 'Test Page',
            domain: 'example.com',
            slug: 'index',
            depth: 0,
            crawledAt: new Date().toISOString(),
          };
          return data[key];
        }),
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord],
      });

      const metadata = await storage.savePage(
        'https://example.com',
        'Test Page',
        0
      );

      expect(metadata.url).toBe('https://example.com');
      expect(metadata.title).toBe('Test Page');
      expect(metadata.domain).toBe('example.com');
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE'),
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Test Page',
        })
      );
    });

    it('should generate correct domain and slug', async () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const data: any = {
            id: 'test-id',
            url: 'https://docs.example.com/guide/intro',
            title: 'Introduction',
            domain: 'docs.example.com',
            slug: 'guide-intro',
            depth: 1,
            crawledAt: new Date().toISOString(),
          };
          return data[key];
        }),
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord],
      });

      const metadata = await storage.savePage(
        'https://docs.example.com/guide/intro',
        'Introduction',
        1
      );

      expect(metadata.domain).toBe('docs.example.com');
      expect(metadata.slug).toBe('guide-intro');
    });
  });

  describe('saveMarkdownFile', () => {
    it('should save markdown to file system', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await storage.saveMarkdownFile('example.com', 'test', '# Test Content');

      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('example.com/test.md'),
        '# Test Content',
        'utf-8'
      );
    });

    it('should create directory if it does not exist', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await storage.saveMarkdownFile('new-domain.com', 'page', '# Content');

      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('new-domain.com'),
        { recursive: true }
      );
    });

    it('should handle file write errors', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockRejectedValue(new Error('Write error'));

      await expect(
        storage.saveMarkdownFile('example.com', 'test', '# Content')
      ).rejects.toThrow('Write error');
    });
  });

  describe('saveMetadataFile', () => {
    it('should save metadata as JSON', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const metadata = {
        id: 'test-id',
        url: 'https://example.com',
        title: 'Test',
        domain: 'example.com',
        slug: 'test',
        depth: 0,
        crawledAt: new Date().toISOString(),
      };

      await storage.saveMetadataFile('example.com', 'test', metadata);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.meta.json'),
        expect.stringMatching(/"url":\s*"https:\/\/example\.com"/),
        'utf-8'
      );
    });

    it('should format JSON with indentation', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const metadata = {
        id: 'test-id',
        url: 'https://example.com',
        title: 'Test',
        domain: 'example.com',
        slug: 'test',
        depth: 0,
        crawledAt: new Date().toISOString(),
      };

      await storage.saveMetadataFile('example.com', 'test', metadata);

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const jsonContent = writeCall[1] as string;
      
      // Check that JSON is formatted (has newlines)
      expect(jsonContent).toContain('\n');
    });
  });

  describe('getAllPages', () => {
    it('should retrieve all pages from Neo4j', async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            if (key === 'p') {
              return {
                properties: {
                  id: 'id1',
                  url: 'https://example.com/page1',
                  title: 'Page 1',
                  domain: 'example.com',
                  slug: 'page1',
                  depth: 0,
                  crawledAt: new Date().toISOString(),
                },
              };
            }
          }),
        },
        {
          get: vi.fn((key: string) => {
            if (key === 'p') {
              return {
                properties: {
                  id: 'id2',
                  url: 'https://example.com/page2',
                  title: 'Page 2',
                  domain: 'example.com',
                  slug: 'page2',
                  depth: 1,
                  crawledAt: new Date().toISOString(),
                },
              };
            }
          }),
        },
      ];

      mockSession.run.mockResolvedValue({
        records: mockRecords,
      });

      const pages = await storage.getAllPages();

      expect(pages).toHaveLength(2);
      expect(pages[0].url).toBe('https://example.com/page1');
      expect(pages[1].url).toBe('https://example.com/page2');
    });

    it('should return empty array when no pages exist', async () => {
      mockSession.run.mockResolvedValue({
        records: [],
      });

      const pages = await storage.getAllPages();

      expect(pages).toHaveLength(0);
    });
  });

  describe('getPageById', () => {
    it('should retrieve page by ID', async () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          if (key === 'p') {
            return {
              properties: {
                id: 'test-id',
                url: 'https://example.com',
                title: 'Test Page',
                domain: 'example.com',
                slug: 'index',
                depth: 0,
                crawledAt: new Date().toISOString(),
              },
            };
          }
        }),
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord],
      });

      const page = await storage.getPageById('test-id');

      expect(page).toBeDefined();
      expect(page?.id).toBe('test-id');
      expect(page?.url).toBe('https://example.com');
    });

    it('should return null when page not found', async () => {
      mockSession.run.mockResolvedValue({
        records: [],
      });

      const page = await storage.getPageById('non-existent-id');

      expect(page).toBeNull();
    });
  });

  describe('deletePage', () => {
    it('should delete page from Neo4j and file system', async () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          if (key === 'p') {
            return {
              properties: {
                id: 'test-id',
                url: 'https://example.com',
                domain: 'example.com',
                slug: 'test',
              },
            };
          }
        }),
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord],
      });

      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.deletePage('test-id');

      // Should delete from Neo4j
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { id: 'test-id' }
      );

      // Should delete markdown file
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('test.md')
      );

      // Should delete metadata file
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('test.meta.json')
      );
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          if (key === 'p') {
            return {
              properties: {
                id: 'test-id',
                url: 'https://example.com',
                domain: 'example.com',
                slug: 'test',
              },
            };
          }
        }),
      };

      mockSession.run.mockResolvedValue({
        records: [mockRecord],
      });

      // Mock file not found error
      mockedFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      // Should not throw error
      await expect(storage.deletePage('test-id')).resolves.not.toThrow();
    });
  });

  describe('resetAllContent', () => {
    it('should delete all pages from Neo4j', async () => {
      mockSession.run.mockResolvedValue({});
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (p:Page)')
      );
    });

    it('should delete all markdown files', async () => {
      mockSession.run.mockResolvedValue({});
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      expect(mockedFs.rm).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true, force: true }
      );
    });

    it('should recreate storage directory', async () => {
      mockSession.run.mockResolvedValue({});
      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });
  });

  describe('close', () => {
    it('should close Neo4j driver', async () => {
      await storage.close();

      expect(mockDriver.close).toHaveBeenCalled();
    });
  });
});

