/**
 * Simplified MarkdownRenderer
 * 
 * PURPOSE: Render markdown content without DocVideo handling
 * MediaRestorationService now converts DocVideo to HTML video elements
 * This component just renders the clean HTML
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface SimpleMarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

export default function SimpleMarkdownRenderer({ 
  content, 
  className = "", 
  isStreaming = false 
}: SimpleMarkdownRendererProps) {
  
  // If content is empty, return empty div
  if (!content || content.trim() === '') {
    return (
      <div className={`markdown-content ${className} ${isStreaming ? 'streaming-text' : ''}`}>
        {/* Empty content */}
      </div>
    );
  }

  return (
    <div className={`markdown-content ${className} ${isStreaming ? 'streaming-text' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            
            return !inline && match ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Table components
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-gray-700">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-800">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody>{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr>{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-gray-700 px-4 py-2 text-left font-bold text-white">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-700 px-4 py-2 text-gray-300">{children}</td>
          ),
          // Links
          a: ({ href, children }) => {
            // Check if it's an anchor link (starts with #) or internal link
            const isAnchorLink = href?.startsWith('#');
            const isInternalLink = href?.startsWith('/');
            const isExternalLink = href?.startsWith('http://') || href?.startsWith('https://');
            const shouldOpenInNewTab = isExternalLink && !isAnchorLink;

            return (
              <a
                href={href}
                className="text-blue-400 hover:text-blue-300 underline"
                target={shouldOpenInNewTab ? "_blank" : undefined}
                rel={shouldOpenInNewTab ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          // Headings
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mb-3 text-white">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold mb-2 text-white">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-bold mb-2 text-white">{children}</h4>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 text-gray-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 text-gray-300">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="mb-1">{children}</li>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-4 text-gray-300 leading-relaxed">{children}</p>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400 mb-4">
              {children}
            </blockquote>
          ),
          // Horizontal rules
          hr: () => (
            <hr className="border-gray-600 my-6" />
          ),
          // Images (standard markdown images)
          img: ({ src, alt }) => (
            <img 
              src={src} 
              alt={alt} 
              className="max-w-full h-auto rounded-lg my-4"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
