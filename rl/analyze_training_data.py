#!/usr/bin/env python3
"""
Analyze existing markdown files and extract text-image training pairs
for training a multimodal agent with OpenPipe ART.

This script is part of the RL project for training agents to return
both text and images when appropriate.
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import hashlib

@dataclass
class TextImagePair:
    """Represents a text-image training pair"""
    text_before: str
    text_after: str
    image_path: str
    image_alt: str
    context: str
    source_file: str
    confidence_score: float

class TrainingDataAnalyzer:
    """Analyzes markdown files to extract text-image training pairs"""

    def __init__(self, storage_path: str = "./storage/content", docs_path: str = "./docs"):
        self.storage_path = Path(storage_path)
        self.docs_path = Path(docs_path)
        self.training_pairs: List[TextImagePair] = []

        # Patterns for finding images in markdown
        self.image_patterns = [
            r'!\[([^\]]*)\]\(([^)]+)\)',  # ![alt](url)
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*>',  # <img src="url" alt="text">
            r'<img[^>]+alt=["\']([^"\']*)["\'][^>]*src=["\']([^"\']+)["\'][^>]*>',  # <img alt="text" src="url">
        ]

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
    
    def _should_exclude_image(self, image_path: str) -> bool:
        """Check if an image should be excluded based on URL patterns"""
        image_path_lower = image_path.lower()
        for pattern in self.exclude_patterns:
            if pattern in image_path_lower:
                return True
        return False

    def find_markdown_files(self) -> List[Path]:
        """Find all markdown files in storage directory only"""
        markdown_files = []

        # Search only in storage directory
        if self.storage_path.exists():
            markdown_files.extend(self.storage_path.rglob("*.md"))
            print(f"Found {len(list(self.storage_path.rglob('*.md')))} files in storage: {self.storage_path}")
        else:
            print(f"Storage path does not exist: {self.storage_path}")

        return list(set(markdown_files))  # Remove duplicates
    
    def extract_text_image_pairs(self, file_path: Path) -> List[TextImagePair]:
        """Extract text-image pairs from a markdown file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            return []
        
        pairs = []
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            # Find images in current line
            for pattern in self.image_patterns:
                matches = re.finditer(pattern, line)
                for match in matches:
                    if pattern == self.image_patterns[0]:  # ![alt](url)
                        alt_text = match.group(1)
                        image_url = match.group(2)
                    else:  # <img> tags
                        if 'src=' in match.group(0):
                            alt_text = match.group(1) if len(match.groups()) > 1 else ""
                            image_url = match.group(2) if len(match.groups()) > 1 else match.group(1)
                        else:
                            alt_text = match.group(2) if len(match.groups()) > 1 else ""
                            image_url = match.group(1)

                    # Skip excluded images (badges, etc.)
                    if self._should_exclude_image(image_url):
                        continue

                    # Extract context around the image
                    context_start = max(0, i - 3)
                    context_end = min(len(lines), i + 4)
                    context = '\n'.join(lines[context_start:context_end])
                    
                    # Extract text before and after image
                    text_before = '\n'.join(lines[max(0, i-2):i]).strip()
                    text_after = '\n'.join(lines[i+1:min(len(lines), i+3)]).strip()
                    
                    # Calculate confidence score based on context quality
                    confidence = self._calculate_confidence(text_before, text_after, alt_text, context)
                    
                    pair = TextImagePair(
                        text_before=text_before,
                        text_after=text_after,
                        image_path=image_url,
                        image_alt=alt_text,
                        context=context,
                        source_file=str(file_path),
                        confidence_score=confidence
                    )
                    pairs.append(pair)
        
        return pairs
    
    def _calculate_confidence(self, text_before: str, text_after: str, alt_text: str, context: str) -> float:
        """Calculate confidence score for a text-image pair"""
        score = 0.0
        
        # Higher score for meaningful text before/after
        if len(text_before.strip()) > 20:
            score += 0.3
        if len(text_after.strip()) > 20:
            score += 0.3
            
        # Higher score for descriptive alt text
        if len(alt_text.strip()) > 5:
            score += 0.2
            
        # Higher score for rich context
        if len(context.strip()) > 100:
            score += 0.2
            
        return min(1.0, score)
    
    def analyze_all_files(self) -> Dict:
        """Analyze all markdown files and return statistics"""
        markdown_files = self.find_markdown_files()
        print(f"Found {len(markdown_files)} markdown files")
        
        all_pairs = []
        file_stats = {}
        
        for file_path in markdown_files:
            pairs = self.extract_text_image_pairs(file_path)
            all_pairs.extend(pairs)
            file_stats[str(file_path)] = {
                'pairs_found': len(pairs),
                'avg_confidence': sum(p.confidence_score for p in pairs) / len(pairs) if pairs else 0
            }
            print(f"  {file_path}: {len(pairs)} pairs found")
        
        self.training_pairs = all_pairs
        
        # Calculate overall statistics
        high_quality_pairs = [p for p in all_pairs if p.confidence_score >= 0.7]
        medium_quality_pairs = [p for p in all_pairs if 0.4 <= p.confidence_score < 0.7]
        low_quality_pairs = [p for p in all_pairs if p.confidence_score < 0.4]
        
        stats = {
            'total_files': len(markdown_files),
            'total_pairs': len(all_pairs),
            'high_quality_pairs': len(high_quality_pairs),
            'medium_quality_pairs': len(medium_quality_pairs),
            'low_quality_pairs': len(low_quality_pairs),
            'avg_confidence': sum(p.confidence_score for p in all_pairs) / len(all_pairs) if all_pairs else 0,
            'file_stats': file_stats
        }
        
        return stats
    
    def export_training_data(self, output_path: str = "training_data.json", min_confidence: float = 0.4):
        """Export training pairs to JSON format for OpenPipe ART"""
        filtered_pairs = [p for p in self.training_pairs if p.confidence_score >= min_confidence]
        
        training_data = []
        for pair in filtered_pairs:
            training_data.append({
                'text_before': pair.text_before,
                'text_after': pair.text_after,
                'image_path': pair.image_path,
                'image_alt': pair.image_alt,
                'context': pair.context,
                'source_file': pair.source_file,
                'confidence_score': pair.confidence_score,
                'training_id': hashlib.md5(f"{pair.source_file}_{pair.image_path}".encode()).hexdigest()[:8]
            })
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(training_data, f, indent=2, ensure_ascii=False)
        
        print(f"Exported {len(training_data)} training pairs to {output_path}")
        return training_data

def main():
    parser = argparse.ArgumentParser(description="Analyze markdown files for text-image training pairs")
    parser.add_argument("--storage-path", default="./storage/content", help="Path to storage directory")
    parser.add_argument("--docs-path", default="./docs", help="Path to docs directory")
    parser.add_argument("--output", default="training_data.json", help="Output file for training data")
    parser.add_argument("--min-confidence", type=float, default=0.4, help="Minimum confidence score")
    
    args = parser.parse_args()
    
    analyzer = TrainingDataAnalyzer(args.storage_path, args.docs_path)
    
    print("Analyzing markdown files for text-image pairs...")
    stats = analyzer.analyze_all_files()
    
    print("\n=== Analysis Results ===")
    print(f"Total files analyzed: {stats['total_files']}")
    print(f"Total text-image pairs found: {stats['total_pairs']}")
    print(f"High quality pairs (≥0.7): {stats['high_quality_pairs']}")
    print(f"Medium quality pairs (0.4-0.7): {stats['medium_quality_pairs']}")
    print(f"Low quality pairs (<0.4): {stats['low_quality_pairs']}")
    print(f"Average confidence score: {stats['avg_confidence']:.2f}")
    
    # Export training data
    training_data = analyzer.export_training_data(args.output, args.min_confidence)
    
    print(f"\n=== Training Data Export ===")
    print(f"Exported {len(training_data)} pairs with confidence ≥ {args.min_confidence}")
    print(f"Training data saved to: {args.output}")

if __name__ == "__main__":
    main()
