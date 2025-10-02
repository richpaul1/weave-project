/**
 * Shared TypeScript interfaces for Agent Backend and Frontend
 */

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

export interface CrawlJobStatus {
  jobId: string;
  url: string;
  maxDepth: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
    currentUrl: string;
  };
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultsCount?: number;
}

export interface ContentStats {
  totalPages: number;
  domains: number;
  byDomain: Record<string, number>;
  byDepth: Record<string, number>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Chat-related interfaces
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'ai';
  content: string;
  thinking?: string;
  createdAt: number;
  isStreaming?: boolean;
  isThinkingComplete?: boolean;
}

export interface ChatRequest {
  query: string;
  session_id?: string;
  top_k?: number;
  stream?: boolean;
}

export interface ChatResponse {
  response: string;
  sources?: Array<{
    id: string;
    title: string;
    url: string;
    relevance: number;
  }>;
  chunks?: Array<{
    text: string;
    score: number;
  }>;
  hallucination_score?: number;
  session_id?: string;
}

/**
 * Graph-related interfaces
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

  // Default to entity for unknown types
  return 'entity';
}
