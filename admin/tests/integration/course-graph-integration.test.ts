import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StorageService } from '../../src/services/storageService.js';
import { CONTENT_NODE_TYPES, normalizeToContentNodeType } from '../../../shared/schema.js';

describe('Course Graph Integration', () => {
  let storage: StorageService;
  let testCourseId: string;

  beforeAll(async () => {
    storage = StorageService.getInstance();
    await storage.initializeSchema();
  });

  afterAll(async () => {
    // Clean up test course if it was created
    if (testCourseId) {
      try {
        await storage.deleteCourse(testCourseId);
      } catch (error) {
        console.warn('Failed to clean up test course:', error);
      }
    }
  });

  describe('Course Node Type Configuration', () => {
    it('should include Course in CONTENT_NODE_TYPES', () => {
      expect(CONTENT_NODE_TYPES).toHaveProperty('course');
      expect(CONTENT_NODE_TYPES.course).toHaveProperty('color');
      expect(CONTENT_NODE_TYPES.course.color).toBe('#06B6D4'); // Cyan color
    });

    it('should normalize Course node type correctly', () => {
      expect(normalizeToContentNodeType('Course')).toBe('course');
      expect(normalizeToContentNodeType('COURSE')).toBe('course');
      expect(normalizeToContentNodeType('course')).toBe('course');
    });
  });

  describe('Course Node Creation', () => {
    it('should create Course nodes in Neo4j database', async () => {
      const testCourse = {
        url: 'https://example.com/test-course',
        title: 'Test Course for Graph Legend',
        markdown: '# Test Course\n\nThis is a test course to verify Course nodes appear in the graph legend.\n\n## Module 1\n\nContent for module 1.\n\n## Module 2\n\nContent for module 2.',
        metadata: {
          description: 'A test course for verifying graph legend functionality',
          difficulty: 'beginner' as const,
          duration: '1 hour',
          topics: ['testing', 'graph', 'legend'],
          instructor: 'Test Instructor'
        }
      };

      // Save the course
      const courseMetadata = await storage.saveCourse(
        testCourse.url,
        testCourse.title,
        testCourse.markdown,
        testCourse.metadata
      );

      testCourseId = courseMetadata.id;

      // Verify course was created
      expect(courseMetadata).toBeDefined();
      expect(courseMetadata.id).toBeDefined();
      expect(courseMetadata.url).toBe(testCourse.url);
      expect(courseMetadata.title).toBe(testCourse.title);
      expect(courseMetadata.difficulty).toBe(testCourse.metadata.difficulty);
      expect(courseMetadata.topics).toEqual(testCourse.metadata.topics);
      expect(courseMetadata.isActive).toBe(true);

      console.log(`✅ Created test course with ID: ${courseMetadata.id}`);
    }, 30000);

    it('should retrieve Course nodes from database', async () => {
      // Get all courses
      const courses = await storage.getAllCourses();
      
      expect(Array.isArray(courses)).toBe(true);
      
      if (testCourseId) {
        const testCourse = courses.find(c => c.id === testCourseId);
        expect(testCourse).toBeDefined();
        expect(testCourse?.title).toBe('Test Course for Graph Legend');
        
        console.log(`✅ Found test course in database: ${testCourse?.title}`);
      }
    }, 30000);

    it('should verify Course nodes appear in graph data', async () => {
      // Get all graph nodes (this should include Course nodes)
      const graphNodes = await storage.getGraphNodes();
      
      expect(Array.isArray(graphNodes)).toBe(true);
      
      // Look for Course nodes
      const courseNodes = graphNodes.filter(node => 
        node.type === 'Course' || 
        node.type === 'course' ||
        normalizeToContentNodeType(node.type) === 'course'
      );
      
      if (testCourseId) {
        expect(courseNodes.length).toBeGreaterThan(0);
        
        const testCourseNode = courseNodes.find(node => 
          node.properties?.id === testCourseId
        );
        
        expect(testCourseNode).toBeDefined();
        expect(testCourseNode?.label).toBe('Test Course for Graph Legend');
        
        console.log(`✅ Found Course node in graph data:`, {
          id: testCourseNode?.id,
          label: testCourseNode?.label,
          type: testCourseNode?.type
        });
      }
    }, 30000);
  });

  describe('Course Node Type Verification', () => {
    it('should verify Course nodes will appear in graph legend', () => {
      // This test verifies that Course nodes will be properly categorized
      // and colored in the graph legend
      
      const courseNodeType = 'Course';
      const normalizedType = normalizeToContentNodeType(courseNodeType);
      
      expect(normalizedType).toBe('course');
      expect(CONTENT_NODE_TYPES[normalizedType]).toBeDefined();
      expect(CONTENT_NODE_TYPES[normalizedType].color).toBe('#06B6D4');
      
      console.log(`✅ Course nodes will appear in graph legend with color: ${CONTENT_NODE_TYPES[normalizedType].color}`);
    });

    it('should have unique color for Course nodes', () => {
      const courseColor = CONTENT_NODE_TYPES.course.color;
      const otherColors = Object.entries(CONTENT_NODE_TYPES)
        .filter(([type]) => type !== 'course')
        .map(([, config]) => config.color);
      
      expect(otherColors).not.toContain(courseColor);
      
      console.log(`✅ Course nodes have unique color: ${courseColor}`);
    });
  });
});
