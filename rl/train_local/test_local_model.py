#!/usr/bin/env python3
"""
Test the qwen3-weave:0.6b model with comprehensive evaluation.
Compares performance against baseline and validates Weave-specific improvements.
"""

import os
import sys
import json
import subprocess
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

def test_model_availability():
    """Test if qwen3-weave:0.6b model is available"""
    print("🔍 Checking model availability...")
    
    try:
        result = subprocess.run(['ollama', 'show', 'qwen3-weave:0.6b'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ qwen3-weave:0.6b is available")
            return True
        else:
            print("❌ qwen3-weave:0.6b not found. Run create_weave_model.py first")
            return False
    except Exception as e:
        print(f"❌ Error checking model: {e}")
        return False

def run_query(model_name: str, query: str, timeout: int = 30) -> Dict[str, Any]:
    """Run a single query against the model"""
    start_time = time.time()
    
    try:
        result = subprocess.run([
            'ollama', 'run', model_name, query
        ], capture_output=True, text=True, timeout=timeout)
        
        end_time = time.time()
        latency = end_time - start_time
        
        if result.returncode == 0:
            response = result.stdout.strip()
            return {
                "success": True,
                "response": response,
                "latency": latency,
                "error": None
            }
        else:
            return {
                "success": False,
                "response": None,
                "latency": latency,
                "error": result.stderr
            }
            
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "response": None,
            "latency": timeout,
            "error": "Timeout"
        }
    except Exception as e:
        return {
            "success": False,
            "response": None,
            "latency": 0,
            "error": str(e)
        }

def analyze_response(response: str, query: str) -> Dict[str, Any]:
    """Analyze response quality and Weave-specific content"""
    if not response:
        return {"error": True, "analysis": "No response"}
    
    # Basic metrics
    word_count = len(response.split())
    char_count = len(response)
    
    # Weave-specific keywords
    weave_keywords = [
        'weave', '@weave.op', 'weave.Model', 'weave.Evaluation', 'weave.Dataset',
        'observability', 'tracing', 'wandb', 'weights & biases'
    ]
    
    found_keywords = []
    for keyword in weave_keywords:
        if keyword.lower() in response.lower():
            found_keywords.append(keyword)
    
    # Image detection
    image_pattern = r'!\[([^\]]*)\]\(([^\)]+)\)'
    import re
    images = re.findall(image_pattern, response)
    
    # Code detection
    code_blocks = response.count('```')
    inline_code = response.count('`') - (code_blocks * 6)  # Subtract code block backticks
    
    return {
        "word_count": word_count,
        "char_count": char_count,
        "weave_keywords": found_keywords,
        "keyword_count": len(found_keywords),
        "has_images": len(images) > 0,
        "image_count": len(images),
        "images": images,
        "code_blocks": code_blocks // 2,  # Each block has opening and closing
        "inline_code": inline_code // 2,
        "has_code": code_blocks > 0 or inline_code > 0,
        "error": False
    }

def run_comprehensive_test():
    """Run comprehensive test suite"""
    print("\n🧪 Running Comprehensive Test Suite")
    print("=" * 50)
    
    # Test queries from our evaluation
    test_queries = [
        {
            "id": "basic",
            "query": "What is Weave?",
            "expected_keywords": ["weave", "observability", "wandb"],
            "expected_images": False
        },
        {
            "id": "tracing",
            "query": "How do I trace my LLM calls with Weave?",
            "expected_keywords": ["@weave.op", "tracing", "weave"],
            "expected_images": True
        },
        {
            "id": "dataset",
            "query": "What is a Weave Dataset and how do I create one?",
            "expected_keywords": ["weave.Dataset", "dataset", "create"],
            "expected_images": True
        },
        {
            "id": "model",
            "query": "Show me how to use weave.Model to track my models",
            "expected_keywords": ["weave.Model", "tracking", "model"],
            "expected_images": True
        },
        {
            "id": "evaluation",
            "query": "Explain Weave evaluation framework and show me an example",
            "expected_keywords": ["weave.Evaluation", "evaluation", "framework"],
            "expected_images": True
        },
        {
            "id": "operations",
            "query": "What are Weave operations and how do I create them?",
            "expected_keywords": ["@weave.op", "operations", "decorator"],
            "expected_images": True
        }
    ]
    
    results = []
    total_latency = 0
    successful_queries = 0
    
    for test in test_queries:
        print(f"\n📝 Testing: {test['id']}")
        print(f"Query: {test['query']}")
        
        # Run query
        result = run_query("qwen3-weave:0.6b", test['query'])
        
        if result['success']:
            # Analyze response
            analysis = analyze_response(result['response'], test['query'])
            
            # Check expectations
            keyword_match = any(kw.lower() in result['response'].lower() for kw in test['expected_keywords'])
            image_match = analysis['has_images'] == test['expected_images']
            
            print(f"✅ Success ({result['latency']:.1f}s)")
            print(f"   Keywords found: {analysis['weave_keywords']}")
            print(f"   Images: {analysis['image_count']}")
            print(f"   Code blocks: {analysis['code_blocks']}")
            print(f"   Words: {analysis['word_count']}")
            
            successful_queries += 1
            total_latency += result['latency']
            
            # Store result
            results.append({
                "test_id": test['id'],
                "query": test['query'],
                "response": result['response'],
                "latency": result['latency'],
                "analysis": analysis,
                "keyword_match": keyword_match,
                "image_match": image_match,
                "success": True
            })
            
        else:
            print(f"❌ Failed: {result['error']}")
            results.append({
                "test_id": test['id'],
                "query": test['query'],
                "error": result['error'],
                "latency": result['latency'],
                "success": False
            })
    
    # Calculate summary statistics
    if successful_queries > 0:
        avg_latency = total_latency / successful_queries
        total_keywords = sum(len(r.get('analysis', {}).get('weave_keywords', [])) for r in results if r['success'])
        total_images = sum(r.get('analysis', {}).get('image_count', 0) for r in results if r['success'])
        total_words = sum(r.get('analysis', {}).get('word_count', 0) for r in results if r['success'])
        
        print(f"\n📊 SUMMARY STATISTICS")
        print("=" * 30)
        print(f"Successful queries: {successful_queries}/{len(test_queries)}")
        print(f"Average latency: {avg_latency:.1f}s")
        print(f"Total Weave keywords: {total_keywords}")
        print(f"Total images included: {total_images}")
        print(f"Average words per response: {total_words/successful_queries:.0f}")
        print(f"Responses with images: {sum(1 for r in results if r.get('analysis', {}).get('has_images', False))}/{successful_queries}")
    
    return results

def compare_with_baseline():
    """Compare with baseline qwen3:0.6b model"""
    print("\n🔄 Comparing with Baseline qwen3:0.6b")
    print("=" * 40)
    
    test_query = "How do I trace my LLM calls with Weave?"
    
    # Test baseline model
    print("Testing baseline qwen3:0.6b...")
    baseline_result = run_query("qwen3:0.6b", test_query)
    
    # Test our model
    print("Testing qwen3-weave:0.6b...")
    weave_result = run_query("qwen3-weave:0.6b", test_query)
    
    if baseline_result['success'] and weave_result['success']:
        baseline_analysis = analyze_response(baseline_result['response'], test_query)
        weave_analysis = analyze_response(weave_result['response'], test_query)
        
        print(f"\n📊 COMPARISON RESULTS")
        print("=" * 25)
        print(f"{'Metric':<20} {'Baseline':<15} {'Weave Model':<15} {'Improvement'}")
        print("-" * 65)
        print(f"{'Latency (s)':<20} {baseline_result['latency']:<15.1f} {weave_result['latency']:<15.1f} {weave_result['latency']/baseline_result['latency']:.2f}x")
        print(f"{'Weave Keywords':<20} {baseline_analysis['keyword_count']:<15} {weave_analysis['keyword_count']:<15} {'+' if weave_analysis['keyword_count'] > baseline_analysis['keyword_count'] else '='}")
        print(f"{'Images':<20} {baseline_analysis['image_count']:<15} {weave_analysis['image_count']:<15} {'+' if weave_analysis['image_count'] > baseline_analysis['image_count'] else '='}")
        print(f"{'Word Count':<20} {baseline_analysis['word_count']:<15} {weave_analysis['word_count']:<15} {'+' if weave_analysis['word_count'] > baseline_analysis['word_count'] else '='}")
        print(f"{'Code Blocks':<20} {baseline_analysis['code_blocks']:<15} {weave_analysis['code_blocks']:<15} {'+' if weave_analysis['code_blocks'] > baseline_analysis['code_blocks'] else '='}")
        
        return {
            "baseline": {"result": baseline_result, "analysis": baseline_analysis},
            "weave_model": {"result": weave_result, "analysis": weave_analysis}
        }
    else:
        print("❌ Comparison failed - one or both models didn't respond")
        return None

def save_test_results(results: List[Dict], comparison: Dict = None):
    """Save test results to file"""
    test_data = {
        "model_name": "qwen3-weave:0.6b",
        "test_timestamp": datetime.now().isoformat(),
        "comprehensive_test": results,
        "comparison": comparison,
        "summary": {
            "total_tests": len(results),
            "successful_tests": sum(1 for r in results if r['success']),
            "average_latency": sum(r['latency'] for r in results if r['success']) / max(1, sum(1 for r in results if r['success'])),
            "total_weave_keywords": sum(len(r.get('analysis', {}).get('weave_keywords', [])) for r in results if r['success']),
            "responses_with_images": sum(1 for r in results if r.get('analysis', {}).get('has_images', False))
        }
    }
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"results/qwen3_weave_test_{timestamp}.json"
    
    with open(filename, 'w') as f:
        json.dump(test_data, f, indent=2)
    
    print(f"✅ Test results saved to {filename}")

def main():
    """Main testing function"""
    print("🧪 Testing qwen3-weave:0.6b Model")
    print("=" * 40)
    
    # Create results directory
    Path("results").mkdir(exist_ok=True)
    
    # Check model availability
    if not test_model_availability():
        sys.exit(1)
    
    # Run comprehensive tests
    results = run_comprehensive_test()
    
    # Compare with baseline
    comparison = compare_with_baseline()
    
    # Save results
    save_test_results(results, comparison)
    
    print("\n🎉 Testing Complete!")
    print("\n🎯 NEXT STEPS:")
    print("1. Review results in results/ directory")
    print("2. Run full evaluation: python ../evaluate_models/model_comparison_eval.py")
    print("3. Use your model: ollama run qwen3-weave:0.6b")

if __name__ == "__main__":
    main()
