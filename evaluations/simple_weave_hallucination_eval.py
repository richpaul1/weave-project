"""
Simple evaluation with WeaveHallucinationScorerV1 that doesn't use the complex RAG model
"""
from __future__ import annotations
import weave
from weave import Evaluation
from weave.scorers import WeaveHallucinationScorerV1
import asyncio
from typing import Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Simple test dataset with context included
SIMPLE_TEST_CASES = [
    {
        "id": "0",
        "query": "What is Weave?",
        "context": "Weave is a toolkit for building AI applications with observability and evaluation features.",
        "expected": "Weave is a toolkit for AI applications"
    },
    {
        "id": "1", 
        "query": "What is RAG?",
        "context": "RAG stands for Retrieval-Augmented Generation, a technique that combines information retrieval with text generation.",
        "expected": "RAG is Retrieval-Augmented Generation"
    }
]

@weave.op()
def simple_model(query: str, context: str) -> str:
    """Simple model that just returns a response based on context"""
    if "Weave" in query:
        return "Weave is a toolkit for building AI applications with observability features."
    elif "RAG" in query:
        return "RAG stands for Retrieval-Augmented Generation, which combines retrieval with generation."
    else:
        return "I don't have information about that topic."

# Create a custom scorer that uses WeaveHallucinationScorerV1
@weave.op()
def weave_hallucination_scorer(query: str, context: str, output: str) -> Dict[str, Any]:
    """Custom scorer using WeaveHallucinationScorerV1"""
    try:
        scorer = WeaveHallucinationScorerV1()
        result = scorer.score(query=query, context=context, output=output)
        
        return {
            "score": 1.0 if result.passed else 0.0,
            "passed": result.passed,
            "has_hallucination": not result.passed,
            "details": f"Weave hallucination check - Passed: {result.passed}"
        }
    except Exception as e:
        return {
            "score": 0.0,
            "passed": False,
            "has_hallucination": True,
            "details": f"Error in hallucination detection: {str(e)}"
        }

async def run_simple_hallucination_evaluation():
    """Run simple hallucination evaluation"""
    print("🔍 Starting Simple Weave Hallucination Evaluation...")
    
    # Initialize Weave
    wandb_project = os.getenv("WANDB_PROJECT", "weave-rag-project")
    print(f"📊 Using Weave project: {wandb_project}")
    weave.init(wandb_project)
    
    print("🚀 Running evaluation...")
    
    # Test each case manually since we can't use the full evaluation framework
    results = []
    for i, test_case in enumerate(SIMPLE_TEST_CASES):
        print(f"\n📝 Evaluating case {i+1}: {test_case['query']}")
        
        # Generate response
        response = simple_model(test_case["query"], test_case["context"])
        print(f"   Response: {response}")
        
        # Check for hallucinations
        hallucination_result = weave_hallucination_scorer(
            query=test_case["query"],
            context=test_case["context"], 
            output=response
        )
        
        print(f"   Hallucination Check: {hallucination_result}")
        results.append(hallucination_result)
    
    # Calculate summary
    total_cases = len(results)
    passed_cases = sum(1 for r in results if r["passed"])
    hallucination_score = passed_cases / total_cases if total_cases > 0 else 0
    
    print(f"\n✅ Simple Hallucination Evaluation Complete!")
    print(f"📊 Summary:")
    print(f"   Total Cases: {total_cases}")
    print(f"   Passed Cases: {passed_cases}")
    print(f"   Hallucination-Free Score: {hallucination_score:.2f}")
    print(f"   Factual Accuracy: {'High' if hallucination_score > 0.8 else 'Medium' if hallucination_score > 0.6 else 'Low'}")
    
    return results

if __name__ == "__main__":
    asyncio.run(run_simple_hallucination_evaluation())
