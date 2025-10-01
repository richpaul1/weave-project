import { useState, useEffect } from 'react';
import { RelatedContent } from '@/components/related-content-panel';

interface UseRelatedContentOptions {
  enabled?: boolean;
  topK?: number;
}

interface UseRelatedContentResult {
  relatedContent: RelatedContent | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRelatedContent(
  content: string | null,
  options: UseRelatedContentOptions = {}
): UseRelatedContentResult {
  const { enabled = true, topK = 3 } = options;
  
  const [relatedContent, setRelatedContent] = useState<RelatedContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRelatedContent = async () => {
    if (!content || !enabled) {
      console.log('🔍 Related content: Skipping fetch - no content or disabled', {
        hasContent: !!content,
        contentLength: content?.length || 0,
        enabled,
        contentPreview: content?.substring(0, 100) || 'null'
      });
      setRelatedContent(null);
      return;
    }

    console.log('🔍 Related content: Starting fetch', {
      contentLength: content.length,
      topK,
      contentPreview: content.substring(0, 200) + '...'
    });
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/related-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          topK
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🔍 Related content: API response', data);

      if (data.success) {
        setRelatedContent(data.data);
        console.log('🔍 Related content: Set content', data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch related content');
      }
    } catch (err) {
      console.error('Error fetching related content:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRelatedContent(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Debounce the API call to avoid too many requests
    const timeoutId = setTimeout(() => {
      fetchRelatedContent();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [content, enabled, topK]);

  const refetch = () => {
    fetchRelatedContent();
  };

  return {
    relatedContent,
    isLoading,
    error,
    refetch
  };
}
