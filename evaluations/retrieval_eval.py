"""
Retrieval Quality Evaluation

Evaluates the quality of context retrieval using Weave evaluations.
"""
import weave
import asyncio
from typing import List, Dict, Any
import sys
import os

# Add parent directory to path to import agent-backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent-backend'))

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService


# Define evaluation dataset
RETRIEVAL_TEST_CASES = [
    {
        "query": "What is Weave?",
        "expected_keywords": ["weave", "toolkit", "llm", "tracking", "evaluation"],
        "min_chunks": 1
    },
    {
        "query": "How do I log LLM calls?",
        "expected_keywords": ["log", "llm", "call", "trace", "weave"],
        "min_chunks": 1
    },
    {
        "query": "What is RAG?",
        "expected_keywords": ["rag", "retrieval", "augmented", "generation"],
        "min_chunks": 1
    },
    {
        "query": "How does vector search work?",
        "expected_keywords": ["vector", "search", "embedding", "similarity"],
        "min_chunks": 1
    },
    {
        "query": "What is hallucination detection?",
        "expected_keywords": ["hallucination", "detection", "fact", "verification"],
        "min_chunks": 1
    }
]


class RetrievalModel(weave.Model):
    """Weave model for retrieval evaluation"""
    
    storage: StorageService
    llm_service: LLMService
    retrieval_service: RetrievalService
    
    @weave.op()
    async def predict(self, query: str) -> Dict[str, Any]:
        """
        Retrieve context for a query.
        
        Args:
            query: The user query
            
        Returns:
            Dictionary with retrieved context
        """
        result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=5,
            min_score=0.0
        )
        
        return {
            "context": result["context_text"],
            "chunks": result["chunks"],
            "sources": result["sources"],
            "num_chunks": result["num_chunks"]
        }


@weave.op()
def relevance_score(query: str, model_output: Dict[str, Any], expected_keywords: List[str]) -> Dict[str, Any]:
    """
    Score the relevance of retrieved context.
    
    Args:
        query: The user query
        model_output: The retrieval model output
        expected_keywords: Keywords that should appear in relevant context
        
    Returns:
        Dictionary with score and details
    """
    context = model_output.get("context", "").lower()
    
    # Count how many expected keywords appear in context
    keywords_found = sum(1 for keyword in expected_keywords if keyword.lower() in context)
    score = keywords_found / len(expected_keywords) if expected_keywords else 0.0
    
    return {
        "score": score,
        "keywords_found": keywords_found,
        "total_keywords": len(expected_keywords),
        "details": f"Found {keywords_found}/{len(expected_keywords)} expected keywords"
    }


@weave.op()
def coverage_score(query: str, model_output: Dict[str, Any], min_chunks: int) -> Dict[str, Any]:
    """
    Score the coverage of retrieved context.
    
    Args:
        query: The user query
        model_output: The retrieval model output
        min_chunks: Minimum number of chunks expected
        
    Returns:
        Dictionary with score and details
    """
    num_chunks = model_output.get("num_chunks", 0)
    score = 1.0 if num_chunks >= min_chunks else num_chunks / min_chunks
    
    return {
        "score": score,
        "num_chunks": num_chunks,
        "min_chunks": min_chunks,
        "details": f"Retrieved {num_chunks} chunks (minimum: {min_chunks})"
    }


@weave.op()
def diversity_score(query: str, model_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the diversity of retrieved sources.
    
    Args:
        query: The user query
        model_output: The retrieval model output
        
    Returns:
        Dictionary with score and details
    """
    sources = model_output.get("sources", [])
    num_sources = len(sources)
    
    # Higher score for more diverse sources
    score = min(num_sources / 3.0, 1.0)  # Ideal is 3+ sources
    
    return {
        "score": score,
        "num_sources": num_sources,
        "details": f"Retrieved from {num_sources} different sources"
    }


async def run_retrieval_evaluation():
    """Run retrieval quality evaluation"""
    print("🔍 Starting Retrieval Quality Evaluation...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    storage = StorageService()
    llm_service = LLMService()
    retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
    
    # Create model
    model = RetrievalModel(
        storage=storage,
        llm_service=llm_service,
        retrieval_service=retrieval_service
    )
    
    # Create dataset
    dataset = weave.Dataset(
        name="retrieval_test_cases",
        rows=RETRIEVAL_TEST_CASES
    )
    
    # Create evaluation
    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[relevance_score, coverage_score, diversity_score]
    )
    
    # Run evaluation
    print("Running evaluation...")
    results = await evaluation.evaluate(model)
    
    print("\n✅ Retrieval Evaluation Complete!")
    print(f"Results: {results}")
    
    # Close connections
    storage.close()
    
    return results


if __name__ == "__main__":
    asyncio.run(run_retrieval_evaluation())

