#!/usr/bin/env python3
"""
View and analyze evaluation results.
"""

import json
import sys
from pathlib import Path

def load_latest_results():
    """Load the most recent evaluation results."""
    eval_files = sorted(Path('.').glob('evaluation_results_*.json'), reverse=True)
    
    if not eval_files:
        print("❌ No evaluation results found")
        return None
    
    latest = eval_files[0]
    print(f"📁 Loading: {latest}")
    
    with open(latest) as f:
        return json.load(f)


def print_detailed_comparison(results):
    """Print detailed comparison of each query."""
    print("\n" + "="*100)
    print("📊 DETAILED QUERY-BY-QUERY COMPARISON")
    print("="*100)
    
    simple_results = results["results"]["simple_prompt"]
    complex_results = results["results"]["complex_prompt"]
    
    for i, (simple, complex) in enumerate(zip(simple_results, complex_results), 1):
        print(f"\n{'='*100}")
        print(f"Query {i}: {simple['query']}")
        print(f"Category: {simple['category']}")
        print("="*100)
        
        # Simple prompt results
        print(f"\n📝 SIMPLE PROMPT (Score: {simple['evaluation']['percentage']:.1f}%)")
        print("-"*100)
        print(f"Response length: {simple['response']['word_count']} words")
        print(f"Images included: {simple['response']['image_count']}")
        print(f"Has image: {'✅ Yes' if simple['response']['has_image'] else '❌ No'}")
        print(f"\nFeedback:")
        for fb in simple['evaluation']['feedback']:
            print(f"  {fb}")
        
        print(f"\n📄 Response preview:")
        print(f"  {simple['response']['response'][:200]}...")
        
        # Complex prompt results
        print(f"\n📝 COMPLEX PROMPT (Score: {complex['evaluation']['percentage']:.1f}%)")
        print("-"*100)
        print(f"Response length: {complex['response']['word_count']} words")
        print(f"Images included: {complex['response']['image_count']}")
        print(f"Has image: {'✅ Yes' if complex['response']['has_image'] else '❌ No'}")
        print(f"\nFeedback:")
        for fb in complex['evaluation']['feedback']:
            print(f"  {fb}")
        
        print(f"\n📄 Response preview:")
        print(f"  {complex['response']['response'][:200]}...")
        
        if complex['response']['has_image']:
            print(f"\n🖼️  Images:")
            for img in complex['response']['images']:
                print(f"  - {img['alt']}")
                print(f"    {img['url'][:80]}...")
        
        # Comparison
        score_diff = complex['evaluation']['percentage'] - simple['evaluation']['percentage']
        print(f"\n📈 IMPROVEMENT: {score_diff:+.1f}%")
        
        if score_diff > 50:
            print("   🎯 MAJOR improvement with complex prompt")
        elif score_diff > 0:
            print("   ✅ Better with complex prompt")
        elif score_diff == 0:
            print("   ➖ No difference")
        else:
            print("   ⚠️  Worse with complex prompt")


def print_category_analysis(results):
    """Analyze results by category."""
    print("\n\n" + "="*100)
    print("📊 CATEGORY ANALYSIS")
    print("="*100)
    
    simple_results = results["results"]["simple_prompt"]
    complex_results = results["results"]["complex_prompt"]
    
    # Group by category
    categories = {}
    for simple, complex in zip(simple_results, complex_results):
        cat = simple['category']
        if cat not in categories:
            categories[cat] = {'simple': [], 'complex': []}
        categories[cat]['simple'].append(simple['evaluation']['percentage'])
        categories[cat]['complex'].append(complex['evaluation']['percentage'])
    
    print(f"\n{'Category':<20} {'Simple Avg':<15} {'Complex Avg':<15} {'Improvement':<15}")
    print("-"*100)
    
    for cat, scores in categories.items():
        simple_avg = sum(scores['simple']) / len(scores['simple'])
        complex_avg = sum(scores['complex']) / len(scores['complex'])
        improvement = complex_avg - simple_avg
        
        print(f"{cat:<20} {simple_avg:>13.1f}% {complex_avg:>13.1f}% {improvement:>+13.1f}%")


def print_image_analysis(results):
    """Analyze image inclusion patterns."""
    print("\n\n" + "="*100)
    print("📊 IMAGE INCLUSION ANALYSIS")
    print("="*100)
    
    simple_results = results["results"]["simple_prompt"]
    complex_results = results["results"]["complex_prompt"]
    
    print(f"\n{'Query':<50} {'Simple':<10} {'Complex':<10}")
    print("-"*100)
    
    for simple, complex in zip(simple_results, complex_results):
        query_short = simple['query'][:47] + "..." if len(simple['query']) > 50 else simple['query']
        simple_img = "✅ Yes" if simple['response']['has_image'] else "❌ No"
        complex_img = "✅ Yes" if complex['response']['has_image'] else "❌ No"
        
        print(f"{query_short:<50} {simple_img:<10} {complex_img:<10}")


def export_for_weave(results):
    """Export results in a format suitable for Weave analysis."""
    export_data = []
    
    simple_results = results["results"]["simple_prompt"]
    complex_results = results["results"]["complex_prompt"]
    
    for simple, complex in zip(simple_results, complex_results):
        export_data.append({
            "query_id": simple['query_id'],
            "query": simple['query'],
            "category": simple['category'],
            "simple_score": simple['evaluation']['percentage'],
            "complex_score": complex['evaluation']['percentage'],
            "simple_has_image": simple['response']['has_image'],
            "complex_has_image": complex['response']['has_image'],
            "simple_word_count": simple['response']['word_count'],
            "complex_word_count": complex['response']['word_count'],
            "improvement": complex['evaluation']['percentage'] - simple['evaluation']['percentage']
        })
    
    output_file = "weave_export.json"
    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"\n📁 Exported for Weave: {output_file}")


def main():
    """Main function."""
    results = load_latest_results()
    
    if not results:
        return
    
    print(f"\n📅 Evaluation timestamp: {results['timestamp']}")
    print(f"🤖 Model: {results['model']}")
    print(f"📊 Test queries: {len(results['test_queries'])}")
    
    # Print summary
    summary = results['summary']
    print("\n" + "="*100)
    print("📊 SUMMARY")
    print("="*100)
    print(f"\nSimple Prompt:")
    print(f"  Average Score: {summary['simple_prompt']['avg_score']:.1f}%")
    print(f"  Image Rate: {summary['simple_prompt']['image_rate']:.1f}%")
    print(f"  Images Included: {summary['simple_prompt']['images_included']}/{len(results['test_queries'])}")
    
    print(f"\nComplex Prompt:")
    print(f"  Average Score: {summary['complex_prompt']['avg_score']:.1f}%")
    print(f"  Image Rate: {summary['complex_prompt']['image_rate']:.1f}%")
    print(f"  Images Included: {summary['complex_prompt']['images_included']}/{len(results['test_queries'])}")
    
    print(f"\nImprovement:")
    print(f"  Score Delta: {summary['improvement']['score_delta']:+.1f}%")
    print(f"  Additional Images: {summary['improvement']['image_delta']:+}")
    
    # Detailed analysis
    print_detailed_comparison(results)
    print_category_analysis(results)
    print_image_analysis(results)
    
    # Export for Weave
    export_for_weave(results)
    
    print("\n" + "="*100)
    print("✅ Analysis complete!")
    print("="*100)
    print("\n💡 Next steps:")
    print("   1. Review detailed query comparisons above")
    print("   2. Check category performance")
    print("   3. View in Weave: https://wandb.ai/richpaul1-stealth/rl-demo")
    print("   4. Use complex prompt in production")
    print("\n")


if __name__ == "__main__":
    main()

