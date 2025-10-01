/**
 * Shared TypeScript interfaces for Admin Backend and Frontend
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

