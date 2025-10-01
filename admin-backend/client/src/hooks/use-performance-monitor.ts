import { useEffect } from 'react';

interface PerformanceMonitorOptions {
  suppressYouTubeWarnings?: boolean;
  logPerformanceMetrics?: boolean;
}

export function usePerformanceMonitor(options: PerformanceMonitorOptions = {}) {
  const { suppressYouTubeWarnings = true, logPerformanceMetrics = false } = options;

  useEffect(() => {
    if (!suppressYouTubeWarnings) return;

    // Store original console methods
    const originalWarn = console.warn;
    const originalError = console.error;

    // YouTube warning patterns to suppress
    const youtubeWarningPatterns = [
      /Added non-passive event listener/,
      /scroll-blocking.*touchstart/,
      /base\.js:\d+/,
      /www-embed-player\.js:\d+/,
      /youtube.*passive/i,
      /iframe.*touchstart/i
    ];

    // Custom console.warn that filters YouTube warnings
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      
      // Check if this is a YouTube performance warning
      const isYouTubeWarning = youtubeWarningPatterns.some(pattern => 
        pattern.test(message)
      );
      
      if (isYouTubeWarning) {
        if (logPerformanceMetrics) {
          console.debug('[Performance Monitor] Suppressed YouTube warning:', message);
        }
        return;
      }
      
      // Allow all other warnings through
      originalWarn.apply(console, args);
    };

    // Custom console.error that filters YouTube errors
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      
      // Check if this is a YouTube performance error
      const isYouTubeError = youtubeWarningPatterns.some(pattern => 
        pattern.test(message)
      );
      
      if (isYouTubeError) {
        if (logPerformanceMetrics) {
          console.debug('[Performance Monitor] Suppressed YouTube error:', message);
        }
        return;
      }
      
      // Allow all other errors through
      originalError.apply(console, args);
    };

    // Performance monitoring
    if (logPerformanceMetrics) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            console.debug('[Performance Monitor] Navigation timing:', {
              domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
              loadComplete: entry.loadEventEnd - entry.loadEventStart,
              totalTime: entry.loadEventEnd - entry.fetchStart
            });
          }
        }
      });
      
      try {
        observer.observe({ entryTypes: ['navigation', 'measure'] });
      } catch (e) {
        console.debug('[Performance Monitor] Performance Observer not supported');
      }

      return () => {
        observer.disconnect();
      };
    }

    // Cleanup function to restore original console methods
    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [suppressYouTubeWarnings, logPerformanceMetrics]);

  // Return performance utilities
  return {
    measurePerformance: (name: string, fn: () => void) => {
      if (!logPerformanceMetrics) {
        fn();
        return;
      }
      
      const start = performance.now();
      fn();
      const end = performance.now();
      console.debug(`[Performance Monitor] ${name}: ${end - start}ms`);
    },
    
    markPerformance: (name: string) => {
      if (logPerformanceMetrics) {
        performance.mark(name);
        console.debug(`[Performance Monitor] Mark: ${name}`);
      }
    }
  };
}
