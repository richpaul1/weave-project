/**
 * Graph-related types re-exported from shared schema
 */

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: any;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id?: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  weight?: number;
  properties?: any;
}

/**
 * Content node types for graph visualization
 */
export const CONTENT_NODE_TYPES: Record<string, { color: string }> = {
  page: { color: '#3B82F6' },      // Blue
  video: { color: '#EF4444' },     // Red
  transcript: { color: '#F97316' }, // Orange
  chunk: { color: '#6B7280' },     // Gray
  entity: { color: '#10B981' },    // Green
  topic: { color: '#A855F7' },     // Purple
  course: { color: '#06B6D4' },    // Cyan
};

export type ContentNodeType = keyof typeof CONTENT_NODE_TYPES;

/**
 * Normalize node type to standard content node type
 */
export function normalizeToContentNodeType(type: string): ContentNodeType {
  const lowerType = type.toLowerCase();

  // Direct matches
  if (lowerType === 'page') return 'page';
  if (lowerType === 'video') return 'video';
  if (lowerType === 'transcript' || lowerType === 'transcript_chunk') return 'transcript';
  if (lowerType === 'chunk' || lowerType === 'text_chunk') return 'chunk';
  if (lowerType === 'entity') return 'entity';
  if (lowerType === 'topic') return 'topic';
  if (lowerType === 'course') return 'course';

  // Default to entity for unknown types
  return 'entity';
}

