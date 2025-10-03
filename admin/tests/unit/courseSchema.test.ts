import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService, CourseMetadata, CourseChunkData } from '../../src/services/storageService.js';
import neo4j from 'neo4j-driver';
import fs from 'fs/promises';

// Mock neo4j-driver
vi.mock('neo4j-driver');
const mockedNeo4j = vi.mocked(neo4j);

// Mock fs/promises
vi.mock('fs/promises');
const mockedFs = vi.mocked(fs);

// Mock llmService
vi.mock('../../src/services/llmService.js', () => ({
  llmService: {
    generateEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
  },
}));

// Mock textChunking
vi.mock('../../src/utils/textChunking.js', () => ({
  chunkMarkdown: vi.fn(() => [
    { text: 'chunk 1', index: 0, startPosition: 0, endPosition: 7 },
    { text: 'chunk 2', index: 1, startPosition: 8, endPosition: 15 },
  ]),
}));

describe('Course Database Schema Tests', () => {
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

  describe('Course Schema Initialization', () => {
    it('should create course constraints and indexes', async () => {
      mockSession.run.mockResolvedValue({});

      await storage.initializeSchema();

      // Verify course constraints were created
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT course_id_unique')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT course_chunk_id_unique')
      );

      // Verify course indexes were created
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX course_url_index')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX course_slug_index')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX course_difficulty_index')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX course_active_index')
      );
    });
  });

  describe('Course Storage Operations', () => {
    const mockCourseData = {
      url: 'https://wandb.ai/site/courses/prompting/',
      title: 'Prompt Engineering Course',
      description: 'Learn prompt engineering techniques',
      difficulty: 'beginner' as const,
      duration: '2 hours',
      topics: ['prompt engineering', 'LLM'],
      instructor: 'John Doe',
    };

    it('should save course with metadata and chunks', async () => {
      const mockCourseRecord = {
        properties: {
          id: 'course-123',
          url: mockCourseData.url,
          title: mockCourseData.title,
          slug: 'prompting',
          isActive: true,
        },
      };

      mockSession.run.mockResolvedValue({
        records: [{ get: () => mockCourseRecord }],
      });

      // Mock file system operations
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const result = await storage.saveCourse(
        mockCourseData.url,
        mockCourseData.title,
        '# Course Content\n\nThis is the course content.',
        mockCourseData
      );

      // Verify course was saved to Neo4j
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (c:Course {url: $url})'),
        expect.objectContaining({
          url: mockCourseData.url,
          title: mockCourseData.title,
          difficulty: mockCourseData.difficulty,
          topics: mockCourseData.topics,
          isActive: true,
        })
      );

      // Verify chunks were created
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (cc:CourseChunk'),
        expect.objectContaining({
          text: 'chunk 1',
          chunkIndex: 0,
        })
      );

      // Verify file system operations
      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledTimes(2); // markdown + metadata

      expect(result).toMatchObject({
        url: mockCourseData.url,
        title: mockCourseData.title,
        difficulty: mockCourseData.difficulty,
        isActive: true,
      });
    });

    it('should get all courses', async () => {
      const mockCourses = [
        {
          properties: {
            id: 'course-1',
            title: 'Course 1',
            url: 'https://example.com/course1',
            isActive: true,
          },
        },
        {
          properties: {
            id: 'course-2',
            title: 'Course 2',
            url: 'https://example.com/course2',
            isActive: false,
          },
        },
      ];

      mockSession.run.mockResolvedValue({
        records: mockCourses.map(course => ({ get: () => course })),
      });

      const courses = await storage.getAllCourses();

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Course)'),
      );
      expect(courses).toHaveLength(2);
      expect(courses[0]).toMatchObject({
        id: 'course-1',
        title: 'Course 1',
        isActive: true,
      });
    });

    it('should get course by ID', async () => {
      const mockCourse = {
        properties: {
          id: 'course-123',
          title: 'Test Course',
          url: 'https://example.com/test',
        },
      };

      mockSession.run.mockResolvedValue({
        records: [{ get: () => mockCourse }],
      });

      const course = await storage.getCourseById('course-123');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (c:Course {id: $id})'),
        { id: 'course-123' }
      );
      expect(course).toMatchObject({
        id: 'course-123',
        title: 'Test Course',
      });
    });

    it('should return null for non-existent course', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const course = await storage.getCourseById('non-existent');

      expect(course).toBeNull();
    });

    it('should delete course and related chunks', async () => {
      mockSession.run
        .mockResolvedValueOnce({
          records: [{ get: () => 'test-slug' }],
        })
        .mockResolvedValueOnce({});

      // Mock file deletion
      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.deleteCourse('course-123');

      // Verify course and chunks were deleted
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE c, cc'),
        { id: 'course-123' }
      );

      // Verify files were deleted
      expect(mockedFs.unlink).toHaveBeenCalledTimes(2); // markdown + metadata
    });
  });

  describe('Course File System Operations', () => {
    it('should save course markdown file', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const filePath = await storage.saveCourseMarkdownFile('test-slug', '# Test Content');

      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-slug.md'),
        '# Test Content',
        'utf-8'
      );
      expect(filePath).toContain('test-slug.md');
    });

    it('should save course metadata file', async () => {
      const metadata: CourseMetadata = {
        id: 'course-123',
        url: 'https://example.com/course',
        title: 'Test Course',
        slug: 'test-slug',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        isActive: true,
      };

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const filePath = await storage.saveCourseMetadataFile('test-slug', metadata);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-slug.metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      expect(filePath).toContain('test-slug.metadata.json');
    });

    it('should delete course files', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.deleteCourseFiles('test-slug');

      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('test-slug.md')
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('test-slug.metadata.json')
      );
    });

    it('should handle file deletion errors gracefully', async () => {
      mockedFs.unlink.mockRejectedValue(new Error('File not found'));

      // Should not throw error
      await expect(storage.deleteCourseFiles('test-slug')).resolves.toBeUndefined();
    });
  });

  describe('Reset Content with Courses', () => {
    it('should include courses in reset operation', async () => {
      const mockCountResult = {
        records: [{
          get: vi.fn()
            .mockReturnValueOnce({ toNumber: () => 5 }) // pageCount
            .mockReturnValueOnce({ toNumber: () => 10 }) // chunkCount
            .mockReturnValueOnce({ toNumber: () => 3 }) // courseCount
            .mockReturnValueOnce({ toNumber: () => 8 }) // courseChunkCount
            .mockReturnValueOnce({ toNumber: () => 26 }), // totalNodes
        }],
      };

      mockSession.run
        .mockResolvedValueOnce(mockCountResult)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockedFs.rm.mockResolvedValue(undefined);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await storage.resetAllContent();

      // Verify count query includes courses
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('n:Page OR n:Chunk OR n:Course OR n:CourseChunk')
      );

      // Verify delete query includes courses
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('n:Page OR n:Chunk OR n:Course OR n:CourseChunk')
      );
    });
  });
});
