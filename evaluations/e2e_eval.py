"""
End-to-End RAG Evaluation

Evaluates the complete RAG pipeline from query to response using Weave evaluations.
"""
import weave
from weave import Evaluation, Model
import asyncio
from typing import Dict, Any, List
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Add parent directory to path to import agent modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent'))

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService


# Define evaluation dataset following Weave format
E2E_TEST_CASES = [
    {
        "id": "0",
        "sentence": "What is Weave?",
        "expected_topics": ["weave", "toolkit", "llm", "tracking"],
        "min_response_length": 50
    },
    {
        "id": "1",
        "sentence": "How do I use Weave for tracking LLM calls?",
        "expected_topics": ["weave", "tracking", "llm", "calls", "logging"],
        "min_response_length": 50
    },
    {
        "id": "2",
        "sentence": "What is RAG?",
        "expected_topics": ["rag", "retrieval", "augmented", "generation"],
        "min_response_length": 50
    },
    {
        "id": "3",
        "sentence": "How does the system store data?",
        "expected_topics": ["neo4j", "database", "storage", "graph"],
        "min_response_length": 50
    },
    {
        "id": "4",
        "sentence": "What LLM models are supported?",
        "expected_topics": ["ollama", "llm", "model"],
        "min_response_length": 50
    }
]


class RAGPipelineModel(Model):
    """Weave Model for the RAG pipeline evaluation"""

    # Define model fields
    model_name: str = "rag_pipeline"

    def model_post_init(self, __context):
        """Initialize services after model creation"""
        # Initialize services (using object.__setattr__ to bypass Pydantic validation)
        object.__setattr__(self, '_storage', StorageService())
        self._storage.connect()
        object.__setattr__(self, '_llm_service', LLMService())
        object.__setattr__(self, '_retrieval_service', RetrievalService(storage=self._storage, llm_service=self._llm_service))
        object.__setattr__(self, '_rag_service', RAGService(retrieval_service=self._retrieval_service, llm_service=self._llm_service))

    @weave.op()
    async def predict(self, sentence: str) -> Dict[str, Any]:
        """
        Process a query through the complete RAG pipeline.

        Args:
            sentence: The user query (following Weave convention)

        Returns:
            Dictionary with RAG pipeline output
        """
        result = await self._rag_service.process_query(
            query=sentence,
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

    def __del__(self):
        """Clean up connections"""
        if hasattr(self, '_storage'):
            self._storage.close()





@weave.op()
def response_quality_scorer(expected_topics: List[str], min_response_length: int, output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the quality of the generated response.

    Args:
        expected_topics: Topics that should be covered in the response
        min_response_length: Minimum expected response length
        output: The RAG pipeline output

    Returns:
        Dictionary with quality score and details
    """
    response = output.get("response", "").lower()

    # Check topic coverage
    topics_covered = sum(1 for topic in expected_topics if topic.lower() in response)
    topic_score = topics_covered / len(expected_topics) if expected_topics else 0.0

    # Check response length
    response_length = len(output.get("response", ""))
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
def context_utilization_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score how well the pipeline utilized retrieved context.

    Args:
        output: The RAG pipeline output

    Returns:
        Dictionary with utilization score and details
    """
    num_chunks = output.get("num_chunks", 0)
    num_sources = output.get("num_sources", 0)

    # Good context utilization means:
    # - Retrieved at least 1 chunk
    # - Retrieved from at least 1 source
    # - Response is not empty

    response_length = len(output.get("response", ""))

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
def efficiency_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the efficiency of the RAG pipeline.

    Args:
        output: The RAG pipeline output

    Returns:
        Dictionary with efficiency score and details
    """
    tokens = output.get("tokens", 0)
    response_length = len(output.get("response", ""))

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
def source_citation_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score whether the response properly cites sources.

    Args:
        output: The RAG pipeline output

    Returns:
        Dictionary with citation score and details
    """
    response = output.get("response", "")
    sources = output.get("sources", [])

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


# Create scorer functions that match Weave evaluation signature
@weave.op()
def response_quality_eval_scorer(expected_topics: List[str], min_response_length: int, output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for response quality in Weave evaluation format"""
    return response_quality_scorer(expected_topics, min_response_length, output)

@weave.op()
def context_utilization_eval_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for context utilization in Weave evaluation format"""
    return context_utilization_scorer(output)

@weave.op()
def efficiency_eval_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for efficiency in Weave evaluation format"""
    return efficiency_scorer(output)

@weave.op()
def source_citation_eval_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for source citation in Weave evaluation format"""
    return source_citation_scorer(output)


async def run_e2e_evaluation():
    """Run end-to-end RAG evaluation using proper Weave evaluation framework"""
    print("🔍 Starting End-to-End RAG Evaluation with Weave Framework...")

    # Initialize Weave with project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "weave-rag-project")
    print(f"📊 Using Weave project: {wandb_project}")
    weave.init(wandb_project)

    print("🎯 Creating RAG Pipeline Model...")

    # Create the RAG model
    model = RAGPipelineModel(name="rag_pipeline_v1")

    print("📝 Creating evaluation dataset...")

    # Create evaluation with proper Weave framework
    evaluation = Evaluation(
        name="e2e_rag_evaluation",
        dataset=E2E_TEST_CASES,
        scorers=[
            context_utilization_eval_scorer,
            efficiency_eval_scorer,
            source_citation_eval_scorer
        ]
    )

    print("🚀 Running evaluation...")

    # Run evaluation
    results = await evaluation.evaluate(model)

    print("\n✅ End-to-End RAG Evaluation Complete!")
    print(f"📊 Results: {results}")

    return results


if __name__ == "__main__":
    asyncio.run(run_e2e_evaluation())

