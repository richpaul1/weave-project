"""
Simple RAG Evaluation without Weave Evaluation class

This bypasses the Pydantic forward reference issues by using manual evaluation
while still leveraging Weave ops for tracking.
"""
from __future__ import annotations
import weave
import asyncio
from typing import Dict, Any, List
from concurrent.futures import Future
import sys
import os
from dotenv import load_dotenv

# Make Future available globally
globals()['Future'] = Future

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(env_path)
print(f"✅ Environment configuration loaded from: {env_path}")

# Add agent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))

from app.services.storage import StorageService
from app.services.retrieval_service import RetrievalService
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService

# Test dataset
E2E_TEST_CASES = [
    {
        "id": "0",
        "sentence": "What is Weave?",
        "expected_topics": ["weave", "toolkit", "observability"]
    },
    {
        "id": "1", 
        "sentence": "How do I create a dataset in Weave?",
        "expected_topics": ["dataset", "weave", "creation"]
    },
    {
        "id": "2",
        "sentence": "What are the key features of RAG?",
        "expected_topics": ["rag", "retrieval", "generation", "features"]
    },
    {
        "id": "3",
        "sentence": "How does vector search work?",
        "expected_topics": ["vector", "search", "embeddings", "similarity"]
    },
    {
        "id": "4",
        "sentence": "What is the difference between Ollama and OpenAI?",
        "expected_topics": ["ollama", "openai", "llm", "comparison"]
    }
]

class SimpleRAGEvaluator:
    """Simple RAG evaluator that bypasses Weave Evaluation class"""
    
    def __init__(self):
        """Initialize RAG services"""
        self._storage = StorageService()
        self._llm_service = LLMService(provider="ollama")
        self._retrieval_service = RetrievalService(self._storage, self._llm_service)
        self._rag_service = RAGService(self._retrieval_service, self._llm_service)
    
    @weave.op()
    async def evaluate_single(self, test_case: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate a single test case"""
        sentence = test_case["sentence"]
        
        # Process query through RAG pipeline
        result = await self._rag_service.process_query(
            query=sentence,
            session_id="eval_session"
        )
        
        response_text = result["response"]
        context_text = result.get("context", "")
        tokens_used = result["metadata"].get("tokens", 0)
        
        # Simple hallucination check
        hallucination_result = self.simple_hallucination_check(
            query=sentence,
            context=context_text,
            response=response_text
        )
        
        # Token efficiency check
        token_efficiency = self.token_efficiency_check(response_text, tokens_used)
        
        return {
            "test_case_id": test_case["id"],
            "query": sentence,
            "response": response_text,
            "context": context_text,
            "tokens_used": tokens_used,
            "hallucination_score": hallucination_result["score"],
            "hallucination_details": hallucination_result["details"],
            "token_efficiency_score": token_efficiency["score"],
            "token_efficiency_details": token_efficiency["details"],
            "sources": result.get("sources", []),
            "num_chunks": result["metadata"].get("num_chunks", 0)
        }
    
    @weave.op()
    def simple_hallucination_check(self, query: str, context: str, response: str) -> Dict[str, Any]:
        """Simple rule-based hallucination detection"""
        if not context or not response:
            return {"score": 0.0, "details": "Missing context or response"}
        
        # Convert to lowercase for comparison
        context_lower = context.lower()
        response_lower = response.lower()
        
        # Check word overlap
        context_words = set(context_lower.split())
        response_words = set(response_lower.split())
        
        # Remove stop words
        stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
        context_content = context_words - stop_words
        response_content = response_words - stop_words
        
        if len(context_content) > 0:
            overlap = len(context_content.intersection(response_content))
            overlap_ratio = overlap / len(context_content)
        else:
            overlap_ratio = 0.0
        
        # Score based on overlap
        if overlap_ratio >= 0.3:
            score = 1.0
        elif overlap_ratio >= 0.1:
            score = 0.5
        else:
            score = 0.0
        
        return {
            "score": score,
            "overlap_ratio": overlap_ratio,
            "details": f"Context-response overlap: {overlap_ratio:.2f}"
        }
    
    @weave.op()
    def token_efficiency_check(self, response: str, tokens: int) -> Dict[str, Any]:
        """Check token efficiency"""
        if tokens == 0:
            return {"score": 0.0, "details": "No tokens used"}
        
        chars_per_token = len(response) / tokens
        
        # Score based on efficiency
        if chars_per_token >= 4:
            score = 1.0
            rating = "Excellent"
        elif chars_per_token >= 3:
            score = 0.8
            rating = "Good"
        elif chars_per_token >= 2:
            score = 0.6
            rating = "Fair"
        else:
            score = 0.4
            rating = "Poor"
        
        return {
            "score": score,
            "chars_per_token": chars_per_token,
            "rating": rating,
            "details": f"{chars_per_token:.2f} chars/token ({rating})"
        }
    
    async def run_evaluation(self) -> Dict[str, Any]:
        """Run evaluation on all test cases"""
        print("🔍 Starting Simple RAG Evaluation...")
        
        results = []
        for i, test_case in enumerate(E2E_TEST_CASES):
            print(f"\n📝 Evaluating {i+1}/{len(E2E_TEST_CASES)}: {test_case['sentence']}")
            
            try:
                result = await self.evaluate_single(test_case)
                results.append(result)
                print(f"   ✅ Response: {result['response'][:100]}...")
                print(f"   📊 Hallucination Score: {result['hallucination_score']:.2f}")
                print(f"   🪙 Token Efficiency: {result['token_efficiency_score']:.2f}")
            except Exception as e:
                print(f"   ❌ Error: {e}")
                results.append({
                    "test_case_id": test_case["id"],
                    "query": test_case["sentence"],
                    "error": str(e)
                })
        
        # Calculate summary statistics
        valid_results = [r for r in results if "error" not in r]
        if valid_results:
            avg_hallucination = sum(r["hallucination_score"] for r in valid_results) / len(valid_results)
            avg_token_efficiency = sum(r["token_efficiency_score"] for r in valid_results) / len(valid_results)
            avg_tokens = sum(r["tokens_used"] for r in valid_results) / len(valid_results)
            
            print(f"\n✅ Simple RAG Evaluation Complete!")
            print(f"📊 Summary:")
            print(f"   Total Cases: {len(E2E_TEST_CASES)}")
            print(f"   Successful: {len(valid_results)}")
            print(f"   Average Hallucination Score: {avg_hallucination:.2f}")
            print(f"   Average Token Efficiency: {avg_token_efficiency:.2f}")
            print(f"   Average Tokens Used: {avg_tokens:.1f}")
        
        return {
            "results": results,
            "summary": {
                "total_cases": len(E2E_TEST_CASES),
                "successful_cases": len(valid_results),
                "avg_hallucination_score": avg_hallucination if valid_results else 0,
                "avg_token_efficiency": avg_token_efficiency if valid_results else 0,
                "avg_tokens_used": avg_tokens if valid_results else 0
            }
        }
    
    def __del__(self):
        """Clean up connections"""
        if hasattr(self, '_storage'):
            self._storage.close()

@weave.op()
async def run_simple_rag_evaluation():
    """Main evaluation function"""
    # Initialize Weave
    wandb_project = os.getenv("WANDB_PROJECT", "support-app-eval")
    print(f"📊 Using Weave project: {wandb_project}")
    weave.init(wandb_project)
    
    # Run evaluation
    evaluator = SimpleRAGEvaluator()
    try:
        results = await evaluator.run_evaluation()
        return results
    finally:
        # Clean up
        if hasattr(evaluator, '_storage'):
            evaluator._storage.close()

if __name__ == "__main__":
    asyncio.run(run_simple_rag_evaluation())
