"""
Test WeaveHallucinationScorerV1 independently
"""
from __future__ import annotations
import weave
from weave.scorers import WeaveHallucinationScorerV1
import asyncio
from typing import Dict, Any

# Initialize Weave
weave.init("support-app-eval")

# Test the WeaveHallucinationScorerV1 directly
@weave.op()
def test_weave_hallucination_scorer():
    """Test the WeaveHallucinationScorerV1 with sample data"""
    
    hallucination_scorer = WeaveHallucinationScorerV1()
    
    # Test case 1: No hallucination (factual response)
    result1 = hallucination_scorer.score(
        query="What is the capital of France?",
        context="Paris is the capital city of France. It is located in the northern part of the country.",
        output="Paris is the capital of France."
    )
    
    print(f"Test 1 - Factual response:")
    print(f"  Output is hallucinated: {not result1.passed}")
    print(f"  Result: {result1}")
    print()
    
    # Test case 2: Hallucination (contradicts context)
    result2 = hallucination_scorer.score(
        query="What is the capital of Antarctica?",
        context="People in Antarctica love the penguins.",
        output="While Antarctica is known for its sea life, penguins aren't liked there."
    )
    
    print(f"Test 2 - Contradictory response:")
    print(f"  Output is hallucinated: {not result2.passed}")
    print(f"  Result: {result2}")
    print()
    
    # Test case 3: Information not in context
    result3 = hallucination_scorer.score(
        query="What is Weave?",
        context="Weave is a toolkit for building AI applications.",
        output="Weave is a toolkit for building AI applications that was created by Microsoft."
    )
    
    print(f"Test 3 - Added information not in context:")
    print(f"  Output is hallucinated: {not result3.passed}")
    print(f"  Result: {result3}")
    
    return {
        "test1_passed": result1.passed,
        "test2_passed": result2.passed,
        "test3_passed": result3.passed
    }

if __name__ == "__main__":
    print("🔍 Testing WeaveHallucinationScorerV1...")
    results = test_weave_hallucination_scorer()
    print(f"\n✅ Test Results: {results}")
