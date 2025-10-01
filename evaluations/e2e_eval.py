"""
End-to-End RAG Evaluation

Evaluates the complete RAG pipeline from query to response using Weave evaluations.
"""
import weave
import asyncio
from typing import Dict, Any, List
import sys
import os

# Add parent directory to path to import agent-backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent-backend'))

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService


# Define evaluation dataset
E2E_TEST_CASES = [
    {
        "query": "What is Weave?",
        "expected_topics": ["weave", "toolkit", "llm", "tracking"],
        "min_response_length": 50
    },
    {
        "query": "How do I use Weave for tracking LLM calls?",
        "expected_topics": ["weave", "tracking", "llm", "calls", "logging"],
        "min_response_length": 50
    },
    {
        "query": "What is RAG?",
        "expected_topics": ["rag", "retrieval", "augmented", "generation"],
        "min_response_length": 50
    },
    {
        "query": "How does the system store data?",
        "expected_topics": ["neo4j", "database", "storage", "graph"],
        "min_response_length": 50
    },
    {
        "query": "What LLM models are supported?",
        "expected_topics": ["ollama", "llm", "model"],
        "min_response_length": 50
    }
]


class RAGPipelineModel(weave.Model):
    """Weave model for end-to-end RAG evaluation"""
    
    storage: StorageService
    llm_service: LLMService
    retrieval_service: RetrievalService
    rag_service: RAGService
    
    @weave.op()
    async def predict(self, query: str) -> Dict[str, Any]:
        """
        Process a query through the complete RAG pipeline.
        
        Args:
            query: The user query
            
        Returns:
            Dictionary with RAG pipeline output
        """
        result = await self.rag_service.process_query(
            query=query,
            session_id="eval-session",
            top_k=5
        )
        
        return {
            "response": result["response"],
            "sources": result["sources"],
            "num_chunks": result["metadata"]["num_chunks"],
            "num_sources": result["metadata"]["num_sources"],
            "model": result["metadata"]["model"],
            "tokens": result["metadata"]["tokens"]
        }


@weave.op()
def response_quality(query: str, model_output: Dict[str, Any], expected_topics: List[str], min_response_length: int) -> Dict[str, Any]:
    """
    Score the quality of the generated response.
    
    Args:
        query: The user query
        model_output: The RAG pipeline output
        expected_topics: Topics that should be covered in the response
        min_response_length: Minimum expected response length
        
    Returns:
        Dictionary with quality score and details
    """
    response = model_output.get("response", "").lower()
    
    # Check topic coverage
    topics_covered = sum(1 for topic in expected_topics if topic.lower() in response)
    topic_score = topics_covered / len(expected_topics) if expected_topics else 0.0
    
    # Check response length
    response_length = len(model_output.get("response", ""))
    length_score = 1.0 if response_length >= min_response_length else response_length / min_response_length
    
    # Combined score
    score = (topic_score * 0.7) + (length_score * 0.3)
    
    return {
        "score": score,
        "topic_score": topic_score,
        "length_score": length_score,
        "topics_covered": topics_covered,
        "total_topics": len(expected_topics),
        "response_length": response_length,
        "details": f"Topics: {topics_covered}/{len(expected_topics)}, Length: {response_length} chars"
    }


@weave.op()
def context_utilization(query: str, model_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score how well the pipeline utilized retrieved context.
    
    Args:
        query: The user query
        model_output: The RAG pipeline output
        
    Returns:
        Dictionary with utilization score and details
    """
    num_chunks = model_output.get("num_chunks", 0)
    num_sources = model_output.get("num_sources", 0)
    
    # Good context utilization means:
    # - Retrieved at least 1 chunk
    # - Retrieved from at least 1 source
    # - Response is not empty
    
    response_length = len(model_output.get("response", ""))
    
    if num_chunks == 0 or response_length == 0:
        score = 0.0
    elif num_sources == 0:
        score = 0.3
    elif num_chunks < 3:
        score = 0.6
    else:
        score = 1.0
    
    return {
        "score": score,
        "num_chunks": num_chunks,
        "num_sources": num_sources,
        "response_length": response_length,
        "details": f"Used {num_chunks} chunks from {num_sources} sources"
    }


@weave.op()
def efficiency_score(query: str, model_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the efficiency of the RAG pipeline.
    
    Args:
        query: The user query
        model_output: The RAG pipeline output
        
    Returns:
        Dictionary with efficiency score and details
    """
    tokens = model_output.get("tokens", 0)
    response_length = len(model_output.get("response", ""))
    
    # Efficiency = response quality per token used
    # Good efficiency: high response length with low token count
    
    if tokens == 0:
        score = 0.0
    else:
        # Calculate characters per token (higher is better)
        chars_per_token = response_length / tokens
        
        # Normalize to 0-1 scale (assume 3-5 chars/token is good)
        if chars_per_token >= 3:
            score = 1.0
        else:
            score = chars_per_token / 3.0
    
    return {
        "score": score,
        "tokens": tokens,
        "response_length": response_length,
        "chars_per_token": response_length / tokens if tokens > 0 else 0,
        "details": f"Generated {response_length} chars using {tokens} tokens"
    }


@weave.op()
def source_citation(query: str, model_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score whether the response properly cites sources.
    
    Args:
        query: The user query
        model_output: The RAG pipeline output
        
    Returns:
        Dictionary with citation score and details
    """
    response = model_output.get("response", "")
    sources = model_output.get("sources", [])
    
    # Check if response contains source citations (e.g., [Source 1], [1], etc.)
    has_citations = "[" in response and "]" in response
    has_sources = len(sources) > 0
    
    if has_sources and has_citations:
        score = 1.0
    elif has_sources:
        score = 0.5  # Has sources but didn't cite them
    else:
        score = 0.0
    
    return {
        "score": score,
        "has_citations": has_citations,
        "has_sources": has_sources,
        "num_sources": len(sources),
        "details": f"Citations: {has_citations}, Sources: {len(sources)}"
    }


async def run_e2e_evaluation():
    """Run end-to-end RAG evaluation"""
    print("🔍 Starting End-to-End RAG Evaluation...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    storage = StorageService()
    llm_service = LLMService()
    retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
    rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)
    
    # Create model
    model = RAGPipelineModel(
        storage=storage,
        llm_service=llm_service,
        retrieval_service=retrieval_service,
        rag_service=rag_service
    )
    
    # Create dataset
    dataset = weave.Dataset(
        name="e2e_test_cases",
        rows=E2E_TEST_CASES
    )
    
    # Create evaluation
    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[response_quality, context_utilization, efficiency_score, source_citation]
    )
    
    # Run evaluation
    print("Running evaluation...")
    results = await evaluation.evaluate(model)
    
    print("\n✅ End-to-End RAG Evaluation Complete!")
    print(f"Results: {results}")
    
    # Close connections
    storage.close()
    
    return results


if __name__ == "__main__":
    asyncio.run(run_e2e_evaluation())

