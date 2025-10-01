import React from 'react';
import { GraphNode } from '@/types/graph';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ExternalLink } from 'lucide-react';

interface GraphSearchResultsProps {
  results: GraphNode[];
  query: string;
  onNodeSelect: (node: GraphNode) => void;
  className?: string;
}

export default function GraphSearchResults({ 
  results, 
  query, 
  onNodeSelect, 
  className = "" 
}: GraphSearchResultsProps) {
  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'concept': return 'bg-primary/10 text-primary border-primary/20';
      case 'document': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'person': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'entity': return 'bg-accent/10 text-accent border-accent/20';
      case 'page': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      default: return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-yellow-900 px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const formatProperties = (properties: string | null) => {
    if (!properties) return null;
    
    try {
      const props = typeof properties === 'string' ? JSON.parse(properties) : properties;
      return Object.entries(props)
        .slice(0, 3) // Show only first 3 properties
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    } catch (e) {
      return typeof properties === 'string' ? properties.slice(0, 100) : null;
    }
  };

  if (results.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-muted-foreground">
          {query ? `No nodes found matching "${query}"` : 'Enter a search term to find nodes'}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-sm text-muted-foreground mb-4">
        Found {results.length} node{results.length !== 1 ? 's' : ''} matching "{query}"
      </div>
      
      {results.map((node) => {
        const propertiesText = formatProperties(node.properties);
        
        return (
          <Card key={node.id} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={getNodeTypeColor(node.type)}>
                      {node.type}
                    </Badge>
                    <h3 className="font-medium text-sm truncate">
                      {highlightText(node.label, query)}
                    </h3>
                  </div>
                  
                  {propertiesText && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {highlightText(propertiesText, query)}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>ID: {node.id.slice(0, 8)}...</span>
                    {node.x !== null && node.y !== null && (
                      <span>Position: ({node.x?.toFixed(0)}, {node.y?.toFixed(0)})</span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNodeSelect(node)}
                    className="h-8 px-2"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
