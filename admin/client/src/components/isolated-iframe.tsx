import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface IsolatedIframeProps extends React.IframeHTMLAttributes<HTMLIFrameElement> {
  src: string;
  title: string;
  className?: string;
}

/**
 * An iframe component that prevents parent styles from affecting the iframe content
 * Useful for previewing external content without dark mode interference
 */
export const IsolatedIframe = forwardRef<HTMLIFrameElement, IsolatedIframeProps>(
  ({ src, title, className, style, ...props }, ref) => {
    return (
      <div className="iframe-container w-full h-full">
        <iframe
          ref={ref}
          src={src}
          title={title}
          className={cn("iframe-isolated", className)}
          style={{
            colorScheme: 'light',
            filter: 'none',
            ...style,
          }}
          // Security sandbox by default
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          // Prevent referrer leakage
          referrerPolicy="no-referrer-when-downgrade"
          // Loading optimization
          loading="lazy"
          {...props}
        />
      </div>
    );
  }
);

IsolatedIframe.displayName = 'IsolatedIframe';
