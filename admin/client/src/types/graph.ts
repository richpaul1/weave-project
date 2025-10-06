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
  page: { color: '#3B82F6' },        // Blue
  chunk: { color: '#6B7280' },       // Gray
  coursechunk: { color: '#F97316' },  // Orange
  course: { color: '#06B6D4' },      // Cyan
  setting: { color: '#10B981' },     // Green
  chatmessage: { color: '#A855F7' }, // Purple
};

export type ContentNodeType = keyof typeof CONTENT_NODE_TYPES;

/**
 * Normalize node type to standard content node type
 */
export function normalizeToContentNodeType(type: string): ContentNodeType {
  const lowerType = type.toLowerCase();

  // Direct matches
  if (lowerType === 'page') return 'page';
  if (lowerType === 'chunk' || lowerType === 'text_chunk') return 'chunk';
  if (lowerType === 'coursechunk' || lowerType === 'course_chunk') return 'coursechunk';
  if (lowerType === 'course') return 'course';
  if (lowerType === 'setting') return 'setting';
  if (lowerType === 'chatmessage' || lowerType === 'chat_message') return 'chatmessage';

  // Default to chunk for unknown types
  return 'chunk';
}

