"""
Test the WeaveContextRelevanceScorerV1 integration in StorageService
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "agent"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

import weave
from app.services.storage import StorageService


def test_relevance_scorer():
    """Test the relevance scorer with sample queries and responses"""
    
    # Initialize Weave
    weave.init("demo")
    
    # Create storage service (which initializes the scorer)
    storage = StorageService()
    
    # Test cases
    test_cases = [
        {
            "query": "What is the capital of Antarctica?",
            "response": "The Antarctic has the happiest penguins.",
            "expected_pass": False,  # Not relevant
        },
        {
            "query": "What is Weave?",
            "response": "Weave is a toolkit for tracking and evaluating LLM applications.",
            "expected_pass": True,  # Relevant
        },
        {
            "query": "How do I create a dataset in Weave?",
            "response": "To create a dataset in Weave, you can use the weave.Dataset class and pass your data as a list of dictionaries.",
            "expected_pass": True,  # Relevant
        },
        {
            "query": "What is the weather today?",
            "response": "I can help you with information about Weave documentation.",
            "expected_pass": False,  # Not relevant
        },
    ]
    
    print("\n" + "="*80)
    print("Testing WeaveContextRelevanceScorerV1 Integration")
    print("="*80 + "\n")
    
    results = []
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'─'*80}")
        print(f"Test Case {i}:")
        print(f"{'─'*80}")
        print(f"Query:    {test_case['query']}")
        print(f"Response: {test_case['response']}")
        print(f"Expected: {'PASS' if test_case['expected_pass'] else 'FAIL'}")
        print()
        
        # Call the finalAIResponse method
        result = storage.finalAIResponse(
            user_message=test_case['query'],
            ai_response=test_case['response']
        )
        
        passed = result.get('passed', False)
        relevance_eval = result.get('relevance_evaluation', {})
        
        print(f"\nResult:   {'✅ PASS' if passed else '❌ FAIL'}")
        print(f"Details:  {relevance_eval}")
        
        results.append({
            "test_case": i,
            "query": test_case['query'],
            "passed": passed,
            "expected": test_case['expected_pass'],
            "match": passed == test_case['expected_pass']
        })
    
    # Summary
    print("\n" + "="*80)
    print("Summary")
    print("="*80)
    
    total = len(results)
    matches = sum(1 for r in results if r['match'])
    
    print(f"\nTotal test cases: {total}")
    print(f"Matching expected: {matches}/{total} ({matches/total*100:.1f}%)")
    
    print("\nDetailed Results:")
    for r in results:
        status = "✅" if r['match'] else "❌"
        print(f"  {status} Test {r['test_case']}: Got {'PASS' if r['passed'] else 'FAIL'}, Expected {'PASS' if r['expected'] else 'FAIL'}")
    
    print("\n" + "="*80 + "\n")
    
    return results


if __name__ == "__main__":
    test_relevance_scorer()

