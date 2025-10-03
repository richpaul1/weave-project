/**
 * Shared TypeScript interfaces for Course functionality
 * Used by both Admin Backend and Frontend
 */

export interface CourseMetadata {
  id: string;
  url: string;
  title: string;
  description?: string;
  slug: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  duration?: string; // e.g., "2 hours", "1 week"
  topics?: string[]; // e.g., ["machine learning", "pytorch", "computer vision"]
  instructor?: string;
  createdAt: string;
  updatedAt: string;
  lastCrawledAt?: string;
  isActive: boolean;
}

export interface CourseChunkData {
  id: string;
  courseId: string;
  text: string;
  chunkIndex: number;
  startPosition: number;
  endPosition: number;
  embedding?: number[];
  section?: string; // e.g., "Introduction", "Module 1", "Exercise 2"
  createdAt: string;
}

export interface CourseSearchResult {
  course: CourseMetadata;
  chunks: Array<CourseChunkData & { score: number }>;
  totalScore: number;
  relevantSections: string[];
}

export interface CourseStats {
  totalCourses: number;
  activeCourses: number;
  totalChunks: number;
  byDifficulty: Record<string, number>;
  byTopic: Record<string, number>;
  lastCrawled?: string;
}

export interface CourseCrawlJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
    currentCourse: string;
  };
  startedAt?: string;
  completedAt?: string;
  error?: string;
  coursesFound?: number;
}

export interface CourseApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
