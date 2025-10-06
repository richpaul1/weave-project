import { describe, it, expect } from 'vitest';
import { CONTENT_NODE_TYPES, normalizeToContentNodeType } from '../../../shared/schema.js';

describe('Graph Node Types', () => {
  describe('CONTENT_NODE_TYPES', () => {
    it('should include all expected node types', () => {
      const expectedTypes = ['page', 'video', 'transcript', 'chunk', 'entity', 'topic', 'course', 'coursechunk', 'setting', 'chatmessage'];

      for (const type of expectedTypes) {
        expect(CONTENT_NODE_TYPES).toHaveProperty(type);
        expect(CONTENT_NODE_TYPES[type]).toHaveProperty('color');
        expect(typeof CONTENT_NODE_TYPES[type].color).toBe('string');
        expect(CONTENT_NODE_TYPES[type].color).toMatch(/^#[0-9A-Fa-f]{6}$/); // Valid hex color
      }
    });

    it('should have unique colors for each node type', () => {
      const colors = Object.values(CONTENT_NODE_TYPES).map(type => type.color);
      const uniqueColors = new Set(colors);
      
      expect(uniqueColors.size).toBe(colors.length);
    });

    it('should include Course node type with cyan color', () => {
      expect(CONTENT_NODE_TYPES).toHaveProperty('course');
      expect(CONTENT_NODE_TYPES.course.color).toBe('#06B6D4'); // Cyan color
    });
  });

  describe('normalizeToContentNodeType', () => {
    it('should normalize course type correctly', () => {
      expect(normalizeToContentNodeType('course')).toBe('course');
      expect(normalizeToContentNodeType('Course')).toBe('course');
      expect(normalizeToContentNodeType('COURSE')).toBe('course');
    });

    it('should normalize all standard types correctly', () => {
      expect(normalizeToContentNodeType('page')).toBe('page');
      expect(normalizeToContentNodeType('video')).toBe('video');
      expect(normalizeToContentNodeType('transcript')).toBe('transcript');
      expect(normalizeToContentNodeType('chunk')).toBe('chunk');
      expect(normalizeToContentNodeType('entity')).toBe('entity');
      expect(normalizeToContentNodeType('topic')).toBe('topic');
      expect(normalizeToContentNodeType('course')).toBe('course');
      expect(normalizeToContentNodeType('coursechunk')).toBe('coursechunk');
      expect(normalizeToContentNodeType('setting')).toBe('setting');
      expect(normalizeToContentNodeType('chatmessage')).toBe('chatmessage');
    });

    it('should handle case insensitive input', () => {
      expect(normalizeToContentNodeType('PAGE')).toBe('page');
      expect(normalizeToContentNodeType('Video')).toBe('video');
      expect(normalizeToContentNodeType('TRANSCRIPT')).toBe('transcript');
      expect(normalizeToContentNodeType('Chunk')).toBe('chunk');
      expect(normalizeToContentNodeType('ENTITY')).toBe('entity');
      expect(normalizeToContentNodeType('Topic')).toBe('topic');
      expect(normalizeToContentNodeType('COURSE')).toBe('course');
      expect(normalizeToContentNodeType('CourseChunk')).toBe('coursechunk');
      expect(normalizeToContentNodeType('SETTING')).toBe('setting');
      expect(normalizeToContentNodeType('ChatMessage')).toBe('chatmessage');
    });

    it('should default to entity for unknown types', () => {
      expect(normalizeToContentNodeType('unknown')).toBe('entity');
      expect(normalizeToContentNodeType('random')).toBe('entity');
      expect(normalizeToContentNodeType('')).toBe('entity');
    });
  });
});
