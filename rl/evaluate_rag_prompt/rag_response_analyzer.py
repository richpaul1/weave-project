#!/usr/bin/env python3
"""
RAG Response Analyzer
Analyzes and displays full responses from the RAG-based prompt evaluation.
"""

import json
import sys
import re
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

def load_latest_rag_results() -> Dict[str, Any]:
    """Load the most recent RAG evaluation results"""
    current_dir = Path(__file__).parent
    result_files = list(current_dir.glob("rag_prompt_results_*.json"))
    
    if not result_files:
        print("❌ No RAG evaluation results found. Run rag_prompt_eval.py first.")
        sys.exit(1)
    
    # Get the most recent file
    latest_file = max(result_files, key=lambda f: f.stat().st_mtime)
    
    with open(latest_file, 'r') as f:
        return json.load(f)

def print_separator(title: str, char: str = "=", width: int = 80):
    """Print a formatted separator"""
    print(f"\n{char * width}")
    print(f"{title:^{width}}")
    print(f"{char * width}")

def print_rag_context_analysis(context_info: Dict[str, Any]):
    """Print analysis of the RAG context used"""
    print_separator("🔍 RAG CONTEXT ANALYSIS", "=", 80)
    
    print(f"Context Success: {'✅ Yes' if context_info.get('success', False) else '❌ No'}")
    print(f"Number of Chunks: {context_info.get('num_chunks', 0)}")
    print(f"Number of Sources: {context_info.get('num_sources', 0)}")
    print(f"Context Length: {context_info.get('context_length', 0)} characters")
    print(f"Final Prompt Length: {context_info.get('prompt_length', 0)} characters")
    
    # Chunk score analysis
    chunk_scores = context_info.get('chunk_scores', [])
    if chunk_scores:
        print(f"Chunk Score Range: {context_info.get('min_chunk_score', 0):.3f} - {context_info.get('max_chunk_score', 0):.3f}")
        print(f"Average Chunk Score: {context_info.get('avg_chunk_score', 0):.3f}")
    
    print(f"Prompt Template: {context_info.get('prompt_template', 'unknown')}")
    
    # Sources analysis
    sources = context_info.get('sources', [])
    if sources:
        print(f"\n📚 Sources Used:")
        for i, source in enumerate(sources, 1):
            title = source.get('title', 'Unknown')[:60]
            domain = source.get('domain', 'Unknown')
            print(f"  {i}. {title}... ({domain})")
    
    # Metadata
    metadata = context_info.get('metadata', {})
    if metadata:
        print(f"\n⚙️ RAG Configuration:")
        print(f"  Top K: {metadata.get('top_k', 'Unknown')}")
        print(f"  Min Score: {metadata.get('min_score', 'Unknown')}")
        print(f"  Expand Context: {metadata.get('expand_context', 'Unknown')}")
        print(f"  Prompt Version: {metadata.get('prompt_version', 'Unknown')}")

def print_model_response(model_name: str, result: Dict[str, Any]):
    """Print detailed response for a single model"""
    print_separator(f"🤖 {model_name}", "=", 80)
    
    # Basic info
    print(f"Model: {result.get('model', 'Unknown')}")
    print(f"Error: {'Yes' if result.get('error', False) else 'No'}")
    print(f"Latency: {result.get('latency', 0):.1f} seconds")
    print(f"Response Length: {result.get('word_count', 0)} words, {result.get('char_count', 0)} characters")
    
    # Image analysis
    images = result.get('images', [])
    print(f"Images Found: {len(images)}")
    if images:
        for i, img in enumerate(images, 1):
            print(f"  {i}. Alt: '{img['alt']}' | URL: {img['url']}")
    
    # Keyword analysis
    keywords = result.get('weave_keywords', [])
    print(f"Weave Keywords: {len(keywords)} - {', '.join(keywords) if keywords else 'None'}")
    
    # Code analysis
    code_blocks = result.get('code_blocks', 0)
    inline_code = result.get('inline_code', 0)
    print(f"Code: {code_blocks} blocks, {inline_code} inline")
    
    # Usage info (for OpenPipe)
    if 'usage' in result and result['usage']:
        usage = result['usage']
        print(f"Token Usage: {usage.get('input_tokens', 0)} input, {usage.get('output_tokens', 0)} output")
    
    print_separator("📝 FULL RESPONSE", "-", 80)
    response = result.get('response', 'No response available')
    
    # Truncate very long responses for readability
    if len(response) > 2000:
        print(response[:2000])
        print(f"\n... [Response truncated - showing first 2000 of {len(response)} characters] ...")
    else:
        print(response)
    
    print("-" * 80)

def compare_rag_vs_non_rag():
    """Compare RAG results with previous non-RAG results if available"""
    print_separator("🔄 RAG vs NON-RAG COMPARISON", "=", 80)
    
    # Try to load previous non-RAG results
    non_rag_file = Path(__file__).parent.parent / "evaluate_best_prompt" / "single_prompt_results_20251011_155137.json"
    
    if non_rag_file.exists():
        with open(non_rag_file, 'r') as f:
            non_rag_data = json.load(f)
        
        print("📊 Comparison with Previous Non-RAG Results:")
        print("(Note: This compares different prompt formats - RAG includes context)")
        
        # Create comparison table
        print(f"\n{'Model':<35} {'RAG Images':<12} {'Non-RAG Images':<16} {'RAG Words':<12} {'Non-RAG Words':<14}")
        print("-" * 90)
        
        # This would need the current RAG results to compare
        print("(Comparison requires both result sets to be loaded)")
    else:
        print("📝 No previous non-RAG results found for comparison.")
        print("Run the evaluation in ../evaluate_best_prompt/ to compare.")

def analyze_rag_effectiveness(results: List[Dict[str, Any]], context_info: Dict[str, Any]):
    """Analyze how effective the RAG context was"""
    print_separator("📈 RAG EFFECTIVENESS ANALYSIS", "=", 80)
    
    total_images = sum(result.get('image_count', 0) for result in results)
    total_keywords = sum(result.get('keyword_count', 0) for result in results)
    avg_words = sum(result.get('word_count', 0) for result in results) / len(results) if results else 0
    error_count = sum(1 for result in results if result.get('error', False))
    
    print(f"RAG Context Quality:")
    print(f"  Sources Retrieved: {context_info.get('num_sources', 0)}")
    print(f"  Chunks Retrieved: {context_info.get('num_chunks', 0)}")
    print(f"  Average Chunk Score: {context_info.get('avg_chunk_score', 0):.3f}")
    print(f"  Context Length: {context_info.get('context_length', 0)} chars")
    
    print(f"\nModel Performance with RAG:")
    print(f"  Total Images Generated: {total_images}")
    print(f"  Total Weave Keywords: {total_keywords}")
    print(f"  Average Response Length: {avg_words:.0f} words")
    print(f"  Error Rate: {error_count}/{len(results)} ({error_count/len(results)*100:.1f}%)")
    
    # Analyze which models benefited most from RAG
    print(f"\n🏆 RAG Performance by Model:")
    for result in results:
        model_name = result.get('model_name', 'Unknown')
        images = result.get('image_count', 0)
        keywords = result.get('keyword_count', 0)
        words = result.get('word_count', 0)
        error = "❌" if result.get('error', False) else "✅"
        
        print(f"  {model_name}: {images} images, {keywords} keywords, {words} words {error}")
    
    # Context utilization analysis
    if context_info.get('sources'):
        print(f"\n📚 Context Source Analysis:")
        for i, source in enumerate(context_info['sources'], 1):
            domain = source.get('domain', 'Unknown')
            title = source.get('title', 'Unknown')[:50]
            print(f"  {i}. {domain}: {title}...")

def main():
    """Main analysis function"""
    print("🔍 RAG-Based Response Analysis")
    print("="*60)
    
    # Load results
    data = load_latest_rag_results()
    results = data.get('results', [])
    original_query = data.get('original_query', 'Unknown query')
    rag_context_info = data.get('rag_context_info', {})
    rag_prompt = data.get('rag_prompt', '')
    
    print(f"Analyzing RAG-based results for query:")
    print(f"'{original_query}'")
    print(f"\nEvaluation timestamp: {data.get('timestamp', 'Unknown')}")
    print(f"Models evaluated: {len(results)}")
    
    # Show RAG context analysis
    print_rag_context_analysis(rag_context_info)
    
    # Show detailed responses for each model
    for result in results:
        print_model_response(result.get('model_name', 'Unknown'), result)
    
    # Analyze RAG effectiveness
    analyze_rag_effectiveness(results, rag_context_info)
    
    # Compare with non-RAG if available
    compare_rag_vs_non_rag()
    
    print_separator("✅ RAG ANALYSIS COMPLETE", "=", 80)
    print("Key insights:")
    print("- How did RAG context affect model responses?")
    print("- Which models utilized the context most effectively?")
    print("- Did RAG improve image generation and domain knowledge?")
    print("- How does prompt length with context affect different models?")

if __name__ == "__main__":
    main()
