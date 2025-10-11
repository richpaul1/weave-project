#!/usr/bin/env python3
"""
Detailed Response Analyzer
Analyzes and displays full responses from the single prompt evaluation.
"""

import json
import sys
import re
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

def load_latest_results() -> Dict[str, Any]:
    """Load the most recent evaluation results"""
    current_dir = Path(__file__).parent
    result_files = list(current_dir.glob("single_prompt_results_*.json"))
    
    if not result_files:
        print("❌ No evaluation results found. Run single_prompt_eval.py first.")
        sys.exit(1)
    
    # Get the most recent file
    latest_file = max(result_files, key=lambda f: f.stat().st_mtime)
    
    with open(latest_file, 'r') as f:
        return json.load(f)

def extract_images_from_text(text: str) -> List[Dict[str, str]]:
    """Extract markdown images from text"""
    pattern = r'!\[([^\]]*)\]\(([^\)]+)\)'
    matches = re.findall(pattern, text)
    return [{"alt": alt, "url": url} for alt, url in matches]

def print_separator(title: str, char: str = "=", width: int = 80):
    """Print a formatted separator"""
    print(f"\n{char * width}")
    print(f"{title:^{width}}")
    print(f"{char * width}")

def print_model_response(model_name: str, result: Dict[str, Any]):
    """Print detailed response for a single model"""
    print_separator(f"🤖 {model_name}", "=", 80)
    
    # Basic info
    print(f"Model: {result.get('model', 'Unknown')}")
    print(f"Error: {'Yes' if result.get('error', False) else 'No'}")
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

def analyze_image_generation(results: List[Dict[str, Any]]):
    """Analyze image generation patterns across models"""
    print_separator("🖼️ IMAGE GENERATION ANALYSIS", "=", 80)
    
    total_images = 0
    models_with_images = 0
    image_details = []
    
    for result in results:
        model_name = result.get('model_name', 'Unknown')
        image_count = result.get('image_count', 0)
        images = result.get('images', [])
        
        total_images += image_count
        if image_count > 0:
            models_with_images += 1
            
        image_details.append({
            'model': model_name,
            'count': image_count,
            'images': images
        })
    
    print(f"Total Images Generated: {total_images}")
    print(f"Models with Images: {models_with_images}/{len(results)}")
    print(f"Average Images per Model: {total_images/len(results):.1f}")
    
    print("\n📊 Image Generation by Model:")
    for detail in image_details:
        print(f"  {detail['model']}: {detail['count']} images")
        for img in detail['images']:
            print(f"    - {img['alt']} ({img['url']})")

def analyze_response_quality(results: List[Dict[str, Any]]):
    """Analyze response quality metrics"""
    print_separator("📈 RESPONSE QUALITY ANALYSIS", "=", 80)
    
    metrics = {
        'word_count': [],
        'keyword_count': [],
        'code_blocks': [],
        'error_rate': 0
    }
    
    for result in results:
        metrics['word_count'].append(result.get('word_count', 0))
        metrics['keyword_count'].append(result.get('keyword_count', 0))
        metrics['code_blocks'].append(result.get('code_blocks', 0))
        if result.get('error', False):
            metrics['error_rate'] += 1
    
    print(f"Average Word Count: {sum(metrics['word_count'])/len(metrics['word_count']):.0f}")
    print(f"Average Weave Keywords: {sum(metrics['keyword_count'])/len(metrics['keyword_count']):.1f}")
    print(f"Average Code Blocks: {sum(metrics['code_blocks'])/len(metrics['code_blocks']):.1f}")
    print(f"Error Rate: {metrics['error_rate']}/{len(results)} ({metrics['error_rate']/len(results)*100:.1f}%)")
    
    print("\n📊 Detailed Metrics by Model:")
    for result in results:
        model_name = result.get('model_name', 'Unknown')
        words = result.get('word_count', 0)
        keywords = result.get('keyword_count', 0)
        code = result.get('code_blocks', 0)
        error = "❌" if result.get('error', False) else "✅"
        
        print(f"  {model_name}: {words} words, {keywords} keywords, {code} code blocks {error}")

def compare_responses(results: List[Dict[str, Any]]):
    """Compare key aspects of responses"""
    print_separator("🔍 RESPONSE COMPARISON", "=", 80)
    
    print("Key Differences:")
    
    # Find the model with most images
    max_images = max(result.get('image_count', 0) for result in results)
    if max_images > 0:
        best_image_models = [r for r in results if r.get('image_count', 0) == max_images]
        print(f"🏆 Most Images ({max_images}): {', '.join(r['model_name'] for r in best_image_models)}")
    
    # Find the model with most keywords
    max_keywords = max(result.get('keyword_count', 0) for result in results)
    if max_keywords > 0:
        best_keyword_models = [r for r in results if r.get('keyword_count', 0) == max_keywords]
        print(f"🎯 Most Weave Keywords ({max_keywords}): {', '.join(r['model_name'] for r in best_keyword_models)}")
    
    # Find the longest response
    max_words = max(result.get('word_count', 0) for result in results)
    if max_words > 0:
        longest_models = [r for r in results if r.get('word_count', 0) == max_words]
        print(f"📝 Longest Response ({max_words} words): {', '.join(r['model_name'] for r in longest_models)}")
    
    # Find models with errors
    error_models = [r for r in results if r.get('error', False)]
    if error_models:
        print(f"❌ Models with Errors: {', '.join(r['model_name'] for r in error_models)}")
    else:
        print("✅ All models responded successfully")

def main():
    """Main analysis function"""
    print("🔍 Detailed Response Analysis")
    print("="*60)
    
    # Load results
    data = load_latest_results()
    results = data.get('results', [])
    prompt = data.get('prompt', 'Unknown prompt')
    
    print(f"Analyzing results for prompt:")
    print(f"'{prompt}'")
    print(f"\nEvaluation timestamp: {data.get('timestamp', 'Unknown')}")
    print(f"Models evaluated: {len(results)}")
    
    # Show detailed responses for each model
    for result in results:
        print_model_response(result.get('model_name', 'Unknown'), result)
    
    # Analysis sections
    analyze_image_generation(results)
    analyze_response_quality(results)
    compare_responses(results)
    
    print_separator("✅ ANALYSIS COMPLETE", "=", 80)
    print("Use this analysis to understand how different models respond to the same prompt.")
    print("Focus on image generation patterns and response quality differences.")

if __name__ == "__main__":
    main()
