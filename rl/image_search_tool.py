#!/usr/bin/env python3
"""
Image Search Tool Implementation for Multimodal Agent

This tool allows the agent to search for and return relevant images
to accompany text responses, enhancing the user experience.
"""

import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import re

@dataclass
class ImageResult:
    """Represents a found image with metadata"""
    path: str
    alt_text: str
    context: str
    relevance_score: float
    image_type: str
    source_file: str

class ImageSearchTool:
    """Tool for searching relevant images based on query and context"""

    def __init__(self, storage_path: str = "./storage/content", docs_path: str = "./docs"):
        self.storage_path = Path(storage_path)
        self.docs_path = Path(docs_path)
        self.image_index = {}

        # URLs/patterns to exclude (badges, icons, etc.)
        self.exclude_patterns = [
            'img.shields.io/badge',
            'badge.fury.io',
            'travis-ci.org',
            'circleci.com',
            'codecov.io',
            'github.com/badges',
            'colab.research.google.com/assets/colab-badge',
            'gitpod.io/button',
            'mybinder.org/badge',
        ]

        self._build_image_index()
    
    def _should_exclude_image(self, image_path: str) -> bool:
        """Check if an image should be excluded based on URL patterns"""
        image_path_lower = image_path.lower()
        for pattern in self.exclude_patterns:
            if pattern in image_path_lower:
                return True
        return False

    def _should_exclude_image(self, image_path: str) -> bool:
        """Check if an image should be excluded based on URL patterns"""
        image_path_lower = image_path.lower()
        for pattern in self.exclude_patterns:
            if pattern in image_path_lower:
                return True
        return False

    def _build_image_index(self):
        """Build an index of all available images and their contexts"""
        print("Building image index...")

        # Image patterns for markdown
        image_patterns = [
            r'!\[([^\]]*)\]\(([^)]+)\)',  # ![alt](url)
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*>',
            r'<img[^>]+alt=["\']([^"\']*)["\'][^>]*src=["\']([^"\']+)["\'][^>]*>',
        ]
        
        # Search for markdown files only in storage directory
        markdown_files = []
        if self.storage_path.exists():
            markdown_files.extend(self.storage_path.rglob("*.md"))
        
        for file_path in markdown_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                lines = content.split('\n')
                for i, line in enumerate(lines):
                    for pattern in image_patterns:
                        matches = re.finditer(pattern, line)
                        for match in matches:
                            if pattern == image_patterns[0]:  # ![alt](url)
                                alt_text = match.group(1)
                                image_path = match.group(2)
                            else:  # <img> tags
                                if 'src=' in match.group(0):
                                    alt_text = match.group(1) if len(match.groups()) > 1 else ""
                                    image_path = match.group(2) if len(match.groups()) > 1 else match.group(1)
                                else:
                                    alt_text = match.group(2) if len(match.groups()) > 1 else ""
                                    image_path = match.group(1)

                            # Skip excluded images (badges, etc.)
                            if self._should_exclude_image(image_path):
                                continue

                            # Extract context around the image
                            context_start = max(0, i - 3)
                            context_end = min(len(lines), i + 4)
                            context = '\n'.join(lines[context_start:context_end])
                            
                            # Determine image type
                            image_type = self._classify_image_type(image_path, alt_text, context)
                            
                            # Create image entry
                            image_id = hashlib.md5(f"{file_path}_{image_path}".encode()).hexdigest()[:8]
                            self.image_index[image_id] = {
                                'path': image_path,
                                'alt_text': alt_text,
                                'context': context,
                                'image_type': image_type,
                                'source_file': str(file_path),
                                'keywords': self._extract_keywords(alt_text, context)
                            }
            
            except Exception as e:
                print(f"Error processing {file_path}: {e}")
        
        print(f"Indexed {len(self.image_index)} images")
    
    def _classify_image_type(self, image_path: str, alt_text: str, context: str) -> str:
        """Classify the type of image based on path, alt text, and context"""
        path_lower = image_path.lower()
        alt_lower = alt_text.lower()
        context_lower = context.lower()
        
        # Screenshot indicators
        if any(word in path_lower or word in alt_lower for word in ['screenshot', 'screen', 'ui', 'interface']):
            return 'screenshot'
        
        # Diagram indicators
        if any(word in path_lower or word in alt_lower or word in context_lower 
               for word in ['diagram', 'flow', 'chart', 'graph', 'architecture']):
            return 'diagram'
        
        # Chart indicators
        if any(word in path_lower or word in alt_lower 
               for word in ['chart', 'plot', 'graph', 'data', 'metrics']):
            return 'chart'
        
        # Icon indicators
        if any(word in path_lower for word in ['icon', 'logo', 'badge']):
            return 'icon'
        
        # Photo indicators
        if any(ext in path_lower for ext in ['.jpg', '.jpeg', '.photo']):
            return 'photo'
        
        return 'illustration'
    
    def _extract_keywords(self, alt_text: str, context: str) -> List[str]:
        """Extract keywords from alt text and context for search"""
        text = f"{alt_text} {context}".lower()
        
        # Remove common words and extract meaningful terms
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'}
        
        # Extract words (alphanumeric sequences)
        words = re.findall(r'\b[a-zA-Z0-9]+\b', text)
        keywords = [word for word in words if len(word) > 2 and word not in stop_words]
        
        return list(set(keywords))  # Remove duplicates
    
    def search_images(self, query: str, image_type: Optional[str] = None, 
                     context: Optional[str] = None, max_results: int = 5) -> List[ImageResult]:
        """Search for images matching the query"""
        query_lower = query.lower()
        query_keywords = self._extract_keywords(query, context or "")
        
        results = []
        
        for image_id, image_data in self.image_index.items():
            relevance_score = self._calculate_relevance(
                query_lower, query_keywords, image_data, image_type
            )
            
            if relevance_score > 0.1:  # Minimum relevance threshold
                result = ImageResult(
                    path=image_data['path'],
                    alt_text=image_data['alt_text'],
                    context=image_data['context'],
                    relevance_score=relevance_score,
                    image_type=image_data['image_type'],
                    source_file=image_data['source_file']
                )
                results.append(result)
        
        # Sort by relevance score and return top results
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        return results[:max_results]
    
    def _calculate_relevance(self, query: str, query_keywords: List[str], 
                           image_data: Dict, requested_type: Optional[str]) -> float:
        """Calculate relevance score between query and image"""
        score = 0.0
        
        # Direct text matches in alt text (high weight)
        if query in image_data['alt_text'].lower():
            score += 0.5
        
        # Direct text matches in context (medium weight)
        if query in image_data['context'].lower():
            score += 0.3
        
        # Keyword matches (variable weight based on keyword frequency)
        image_keywords = image_data['keywords']
        matching_keywords = set(query_keywords) & set(image_keywords)
        if matching_keywords:
            keyword_score = len(matching_keywords) / max(len(query_keywords), 1)
            score += keyword_score * 0.4
        
        # Image type match bonus
        if requested_type and image_data['image_type'] == requested_type:
            score += 0.2
        
        # Boost for descriptive alt text
        if len(image_data['alt_text']) > 10:
            score += 0.1
        
        return min(score, 1.0)  # Cap at 1.0
    
    def get_image_suggestions(self, text_response: str, max_suggestions: int = 3) -> List[ImageResult]:
        """Get image suggestions based on a text response"""
        # Extract key concepts from the text response
        concepts = self._extract_key_concepts(text_response)
        
        all_suggestions = []
        for concept in concepts:
            suggestions = self.search_images(concept, max_results=2)
            all_suggestions.extend(suggestions)
        
        # Remove duplicates and sort by relevance
        seen_paths = set()
        unique_suggestions = []
        for suggestion in all_suggestions:
            if suggestion.path not in seen_paths:
                seen_paths.add(suggestion.path)
                unique_suggestions.append(suggestion)
        
        unique_suggestions.sort(key=lambda x: x.relevance_score, reverse=True)
        return unique_suggestions[:max_suggestions]
    
    def _extract_key_concepts(self, text: str) -> List[str]:
        """Extract key concepts from text for image suggestions"""
        # Simple concept extraction - could be enhanced with NLP
        concepts = []
        
        # Look for technical terms, proper nouns, and important phrases
        words = re.findall(r'\b[A-Z][a-zA-Z0-9]*\b', text)  # Capitalized words
        concepts.extend(words)
        
        # Look for quoted terms
        quoted = re.findall(r'"([^"]*)"', text)
        concepts.extend(quoted)
        
        # Look for code-like terms
        code_terms = re.findall(r'`([^`]*)`', text)
        concepts.extend(code_terms)
        
        return list(set(concepts))  # Remove duplicates

# Tool interface for integration with the agent system
def search_images_tool(query: str, image_type: Optional[str] = None, 
                      context: Optional[str] = None) -> Dict[str, Any]:
    """
    Tool function for searching images that can be called by the agent.
    
    Args:
        query: Search query for finding relevant images
        image_type: Type of image needed (screenshot, diagram, chart, etc.)
        context: Context of where the image will be used
    
    Returns:
        Dictionary with search results and metadata
    """
    tool = ImageSearchTool()
    results = tool.search_images(query, image_type, context)
    
    return {
        "images": [
            {
                "path": result.path,
                "alt_text": result.alt_text,
                "relevance_score": result.relevance_score,
                "image_type": result.image_type,
                "context_preview": result.context[:200] + "..." if len(result.context) > 200 else result.context
            }
            for result in results
        ],
        "total_found": len(results),
        "query": query,
        "requested_type": image_type
    }

if __name__ == "__main__":
    # Test the image search tool
    tool = ImageSearchTool(storage_path="../admin/storage/content", docs_path="../docs")
    
    # Test searches
    test_queries = [
        "weave dashboard",
        "chat interface",
        "graph visualization",
        "setup instructions"
    ]
    
    for query in test_queries:
        print(f"\n=== Searching for: {query} ===")
        results = tool.search_images(query, max_results=3)
        for result in results:
            print(f"  {result.path} (score: {result.relevance_score:.2f}, type: {result.image_type})")
            print(f"    Alt: {result.alt_text}")
            print(f"    Context: {result.context[:100]}...")
