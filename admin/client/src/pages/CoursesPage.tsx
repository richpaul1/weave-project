import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal,
  ExternalLink,
  Eye,
  Trash2,
  RefreshCw,
  Clock,
  User,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';

// Types based on our course schema
interface Course {
  id: string;
  url: string;
  title: string;
  description?: string;
  slug: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  duration?: string;
  topics?: string[];
  instructor?: string;
  createdAt: string;
  updatedAt: string;
  lastCrawledAt?: string;
  isActive: boolean;
}

interface CourseStats {
  totalCourses: number;
  activeCourses: number;
  totalChunks: number;
  lastCrawled?: string;
}

// API functions
const fetchCourses = async (): Promise<Course[]> => {
  const response = await fetch('/api/courses');
  if (!response.ok) {
    throw new Error('Failed to fetch courses');
  }
  return response.json();
};

const searchCourses = async (query: string): Promise<Course[]> => {
  if (!query.trim()) {
    return fetchCourses();
  }

  const response = await fetch(`/api/courses/search?q=${encodeURIComponent(query)}&useVector=true&limit=50`);
  if (!response.ok) {
    throw new Error('Failed to search courses');
  }
  const result = await response.json();
  return result.results || [];
};

const fetchCourseStats = async (): Promise<CourseStats> => {
  const response = await fetch('/api/courses/stats');
  if (!response.ok) {
    throw new Error('Failed to fetch course stats');
  }
  return response.json();
};

const deleteCourse = async (courseId: string): Promise<void> => {
  const response = await fetch(`/api/courses/${courseId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete course');
  }
};

const crawlCourses = async (): Promise<{ message: string; coursesFound: number }> => {
  const response = await fetch('/api/courses/crawl', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to start course crawling');
  }
  return response.json();
};

const deleteAllCourses = async (): Promise<{ message: string; deletedCourses: number; deletedChunks: number; deletedFiles: number }> => {
  const response = await fetch('/api/courses', {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete all courses');
  }
  return response.json();
};

export default function CoursesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [courseMarkdown, setCourseMarkdown] = useState('');
  const [loadingMarkdown, setLoadingMarkdown] = useState(false);
  const queryClient = useQueryClient();

  // Debounce search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Queries
  const {
    data: courses = [],
    isLoading: coursesLoading,
    error: coursesError
  } = useQuery({
    queryKey: ['courses', debouncedSearchTerm],
    queryFn: () => searchCourses(debouncedSearchTerm),
  });

  const { 
    data: stats, 
    isLoading: statsLoading 
  } = useQuery({
    queryKey: ['course-stats'],
    queryFn: fetchCourseStats,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-stats'] });
      toast.success('Course deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete course: ${error.message}`);
    },
  });

  const crawlMutation = useMutation({
    mutationFn: crawlCourses,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-stats'] });
      toast.success(`Course crawling started. Found ${data.coursesFound} courses.`);
    },
    onError: (error) => {
      toast.error(`Failed to start crawling: ${error.message}`);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: deleteAllCourses,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-stats'] });
      toast.success(`All courses deleted successfully! Removed ${data.deletedCourses} courses, ${data.deletedChunks} chunks, and ${data.deletedFiles} files.`);
    },
    onError: (error) => {
      toast.error(`Failed to delete all courses: ${error.message}`);
    },
  });

  // Courses are already filtered by the search API
  const filteredCourses = courses;

  const handleViewCourse = async (course: Course) => {
    setSelectedCourse(course);
    setIsViewModalOpen(true);

    // Fetch course markdown content
    setLoadingMarkdown(true);
    try {
      const response = await fetch(`/api/courses/${course.id}/markdown`);
      if (response.ok) {
        const markdown = await response.text();
        setCourseMarkdown(markdown);
      } else {
        setCourseMarkdown('Failed to load course content.');
      }
    } catch (error) {
      console.error('Error fetching course markdown:', error);
      setCourseMarkdown('Error loading course content.');
    } finally {
      setLoadingMarkdown(false);
    }
  };

  const handleDeleteCourse = (courseId: string) => {
    if (confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      deleteMutation.mutate(courseId);
    }
  };

  const handleDeleteAllCourses = () => {
    if (confirm('Are you sure you want to delete ALL courses? This will remove all courses, their chunks, and markdown files. This action cannot be undone.')) {
      deleteAllMutation.mutate();
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (coursesError) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">
            Error loading courses: {coursesError.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            Courses
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and explore learning courses from W&B
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => crawlMutation.mutate()}
            disabled={crawlMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${crawlMutation.isPending ? 'animate-spin' : ''}`} />
            {crawlMutation.isPending ? 'Crawling...' : 'Crawl Courses'}
          </Button>
          <Button
            onClick={handleDeleteAllCourses}
            disabled={deleteAllMutation.isPending || courses.length === 0}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <Trash2 className={`h-4 w-4 ${deleteAllMutation.isPending ? 'animate-spin' : ''}`} />
            {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-courses">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats?.totalCourses || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats?.activeCourses || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chunks</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : stats?.totalChunks || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Crawled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {statsLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : stats?.lastCrawled ? (
                new Date(stats.lastCrawled).toLocaleDateString()
              ) : (
                'Never'
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Courses Grid */}
      {coursesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No courses found</h3>
          <p className="text-muted-foreground">
            {searchTerm ? 'Try adjusting your search terms.' : 'Start by crawling courses from W&B.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <Card key={course.id} className="hover:shadow-lg transition-shadow" data-testid="course-card">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-2" data-testid="course-title">{course.title}</CardTitle>
                    {course.description && (
                      <CardDescription className="mt-2 line-clamp-3">
                        {course.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewCourse(course)} data-testid="view-details">
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={course.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Original
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteCourse(course.id)}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Metadata */}
                  <div className="flex flex-wrap gap-2">
                    {course.difficulty && (
                      <Badge className={getDifficultyColor(course.difficulty)}>
                        {course.difficulty}
                      </Badge>
                    )}
                    {course.duration && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {course.duration}
                      </Badge>
                    )}
                    {course.instructor && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {course.instructor}
                      </Badge>
                    )}
                  </div>

                  {/* Topics */}
                  {course.topics && course.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {course.topics.slice(0, 3).map((topic, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                      {course.topics.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{course.topics.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Last updated */}
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(course.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Course View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedCourse?.title}
            </DialogTitle>
            <DialogDescription>
              Course details and content preview
            </DialogDescription>
          </DialogHeader>
          
          {selectedCourse && (
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Course Details</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="preview">Live Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex-1 min-h-0 space-y-6">
                {/* Course metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Course Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>URL:</strong> <a href={selectedCourse.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{selectedCourse.url}</a></div>
                      <div><strong>Difficulty:</strong> {selectedCourse.difficulty || 'Not specified'}</div>
                      <div><strong>Duration:</strong> {selectedCourse.duration || 'Not specified'}</div>
                      <div><strong>Instructor:</strong> {selectedCourse.instructor || 'Not specified'}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Timestamps</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Created:</strong> {new Date(selectedCourse.createdAt).toLocaleString()}</div>
                      <div><strong>Updated:</strong> {new Date(selectedCourse.updatedAt).toLocaleString()}</div>
                      <div><strong>Last Crawled:</strong> {selectedCourse.lastCrawledAt ? new Date(selectedCourse.lastCrawledAt).toLocaleString() : 'Never'}</div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedCourse.description && (
                  <div>
                    <h4 className="font-semibold mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground">{selectedCourse.description}</p>
                  </div>
                )}

                {/* Topics */}
                {selectedCourse.topics && selectedCourse.topics.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Topics</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedCourse.topics.map((topic, index) => (
                        <Badge key={index} variant="secondary">{topic}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="content" className="flex-1 min-h-0">
                <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                  {loadingMarkdown ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {courseMarkdown}
                    </pre>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 min-h-0">
                <div className="border rounded-lg overflow-hidden h-[60vh]">
                  <iframe
                    src={selectedCourse.url}
                    className="w-full h-full"
                    title={`Preview of ${selectedCourse.title}`}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
