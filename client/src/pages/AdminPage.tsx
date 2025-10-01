import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import type { PageMetadata, CrawlJobStatus, ContentStats } from '../../../shared/schema';

const API_BASE = 'http://localhost:3002/api';

export function AdminPage() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [crawling, setCrawling] = useState(false);
  const [currentJob, setCurrentJob] = useState<CrawlJobStatus | null>(null);
  const [pages, setPages] = useState<PageMetadata[]>([]);
  const [stats, setStats] = useState<ContentStats | null>(null);

  // Load pages and stats on mount
  useEffect(() => {
    loadPages();
    loadStats();
  }, []);

  // Poll job status when crawling
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      setCrawling(false);
      if (currentJob?.status === 'completed') {
        loadPages();
        loadStats();
      }
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE}/crawler/status/${currentJob.jobId}`);
        setCurrentJob(response.data);
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob]);

  const loadPages = async () => {
    try {
      const response = await axios.get(`${API_BASE}/content/pages`);
      setPages(response.data.pages || []);
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/content/stats`);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const startCrawl = async () => {
    if (!url) return;

    try {
      setCrawling(true);
      const response = await axios.post(`${API_BASE}/crawler/start`, {
        url,
        maxDepth,
      });

      setCurrentJob({
        jobId: response.data.jobId,
        url,
        maxDepth,
        status: 'pending',
        progress: { total: 0, completed: 0, failed: 0, currentUrl: '' },
      });
    } catch (error: any) {
      console.error('Error starting crawl:', error);
      alert(error.response?.data?.error || 'Failed to start crawl');
      setCrawling(false);
    }
  };

  const resetContent = async () => {
    if (!confirm('Are you sure you want to delete all content?')) return;

    try {
      await axios.delete(`${API_BASE}/crawler/reset`);
      setPages([]);
      setStats(null);
      setCurrentJob(null);
      alert('All content reset successfully');
    } catch (error) {
      console.error('Error resetting content:', error);
      alert('Failed to reset content');
    }
  };

  const deletePage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;

    try {
      await axios.delete(`${API_BASE}/content/pages/${id}`);
      loadPages();
      loadStats();
    } catch (error) {
      console.error('Error deleting page:', error);
      alert('Failed to delete page');
    }
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

