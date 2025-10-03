import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { PageMetadata, CrawlJobStatus, ContentStats } from '../../../shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'sonner';

export default function AdminPage() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [crawling, setCrawling] = useState(false);
  const [currentJob, setCurrentJob] = useState<CrawlJobStatus | null>(null);
  const queryClient = useQueryClient();

  // Fetch pages
  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ['/api/content/pages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/content/pages');
      return response;
    },
  });

  const pages = pagesData?.pages || [];

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['/api/content/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/content/stats');
      return response;
    },
  });

  const stats = statsData?.stats || null;

  // Poll job status when crawling
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      setCrawling(false);
      if (currentJob?.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['/api/content/pages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/content/stats'] });
      }
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await apiRequest('GET', `/api/crawler/status/${currentJob.jobId}`);
        setCurrentJob(response);
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob, queryClient]);

  // Start crawl mutation
  const startCrawlMutation = useMutation({
    mutationFn: async (data: { url: string; maxDepth: number }) => {
      return apiRequest('POST', '/api/crawler/start', data);
    },
    onSuccess: (response) => {
      setCurrentJob({
        jobId: response.jobId,
        url,
        maxDepth,
        status: 'pending',
        progress: { total: 0, completed: 0, failed: 0, currentUrl: '' },
      });
    },
    onError: (error: any) => {
      console.error('Error starting crawl:', error);
      toast.error(error.message || 'Failed to start crawl');
      setCrawling(false);
    },
  });

  // Delete page mutation
  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/content/pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content/pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content/stats'] });
      toast.success('Page deleted successfully');
    },
    onError: (error: any) => {
      console.error('Error deleting page:', error);
      toast.error('Failed to delete page');
    },
  });

  // Reset content mutation
  const resetContentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', '/api/crawler/reset');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content/pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content/stats'] });
      setCurrentJob(null);
      toast.success('All content reset successfully');
    },
    onError: (error: any) => {
      console.error('Error resetting content:', error);
      toast.error('Failed to reset content');
    },
  });

  const startCrawl = async () => {
    if (!url) return;
    setCrawling(true);
    startCrawlMutation.mutate({ url, maxDepth });
  };

  const resetContent = async () => {
    if (!confirm('Are you sure you want to delete all content?')) return;
    resetContentMutation.mutate();
  };

  const deletePage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;
    deletePageMutation.mutate(id);
  };

  const getProgressPercentage = () => {
    if (!currentJob?.progress.total) return 0;
    return Math.round((currentJob.progress.completed / currentJob.progress.total) * 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Content Management</h1>
        <p className="text-muted-foreground mt-2">
          Crawl websites and manage content for the RAG system
        </p>
      </div>

      {/* Crawler Section */}
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler</CardTitle>
          <CardDescription>
            Enter a URL to crawl and extract content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={crawling}
              />
            </div>
            <div className="w-32">
              <Input
                type="number"
                min="0"
                max="5"
                value={maxDepth}
                onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                disabled={crawling}
                placeholder="Depth"
              />
            </div>
            <Button onClick={startCrawl} disabled={crawling || !url}>
              {crawling ? 'Crawling...' : 'Start Crawl'}
            </Button>
          </div>

          {currentJob && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">Status:</span>
                <Badge variant={
                  currentJob.status === 'completed' ? 'default' :
                  currentJob.status === 'failed' ? 'destructive' :
                  'secondary'
                }>
                  {currentJob.status}
                </Badge>
              </div>
              
              {currentJob.status === 'running' && (
                <>
                  <Progress value={getProgressPercentage()} />
                  <div className="text-sm text-muted-foreground">
                    {currentJob.progress.completed} / {currentJob.progress.total} pages
                    {currentJob.progress.failed > 0 && ` (${currentJob.progress.failed} failed)`}
                  </div>
                  {currentJob.progress.currentUrl && (
                    <div className="text-xs text-muted-foreground truncate">
                      Current: {currentJob.progress.currentUrl}
                    </div>
                  )}
                </>
              )}

              {currentJob.status === 'completed' && (
                <div className="text-sm text-green-600">
                  ✓ Crawl completed! Processed {currentJob.resultsCount} pages
                </div>
              )}

              {currentJob.status === 'failed' && (
                <div className="text-sm text-destructive">
                  ✗ Crawl failed: {currentJob.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Section */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Content Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold">{stats.totalPages}</div>
                <div className="text-sm text-muted-foreground">Total Pages</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.domains}</div>
                <div className="text-sm text-muted-foreground">Domains</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pages List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Pages</CardTitle>
              <CardDescription>{pages.length} pages stored</CardDescription>
            </div>
            <Button variant="destructive" onClick={resetContent} disabled={pages.length === 0}>
              Reset All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pages yet. Start a crawl to add content.
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map((page) => (
                <div key={page.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{page.title}</div>
                    <div className="text-sm text-muted-foreground truncate">{page.url}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Depth: {page.crawlDepth} • {page.domain}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePage(page.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

