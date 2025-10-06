"""
End-to-End RAG Evaluation

Evaluates the complete RAG pipeline from query to response using Weave evaluations.
"""
from __future__ import annotations
import weave
from weave import Evaluation, Model, Dataset
from weave.scorers import WeaveHallucinationScorerV1
import asyncio
from typing import Dict, Any, List
from concurrent.futures import Future
import sys
import os
from dotenv import load_dotenv

# Make Future available globally to resolve forward reference issues
globals()['Future'] = Future

# Patch typing module and weave module
import typing
typing.Future = Future
if hasattr(typing, '__dict__'):
    typing.__dict__['Future'] = Future

import weave
weave.Future = Future
if hasattr(weave, '__dict__'):
    weave.__dict__['Future'] = Future

# Also patch sys.modules to make Future available everywhere
import sys
if 'typing' in sys.modules:
    sys.modules['typing'].Future = Future

# Patch the modules where Weave models are defined so forward ref 'Future' resolves
try:
    import importlib
    patched_modules = set()
    # Patch Evaluation module
    eval_module_name = Evaluation.__module__
    eval_mod = sys.modules.get(eval_module_name) or importlib.import_module(eval_module_name)
    setattr(eval_mod, 'Future', Future)
    if hasattr(eval_mod, '__dict__'):
        eval_mod.__dict__['Future'] = Future
    patched_modules.add(eval_module_name)
    print(f"🐛 DEBUG: Patched Future into module: {eval_module_name}")

    # Patch dataset modules (including the actual module of Dataset)
    candidate_modules = [
        Dataset.__module__,
        'weave.flow.dataset',
        'weave.dataset',
        'weave.trace.dataset'
    ]
    for mod_name in candidate_modules:
        try:
            mod = sys.modules.get(mod_name) or importlib.import_module(mod_name)
            setattr(mod, 'Future', Future)
            if hasattr(mod, '__dict__'):
                mod.__dict__['Future'] = Future
            patched_modules.add(mod_name)
            print(f"🐛 DEBUG: Patched Future into module: {mod_name}")
        except Exception as inner_e:
            print(f"⚠️ DEBUG: Could not patch module {mod_name}: {inner_e}")
except Exception as e:
    print(f"⚠️ DEBUG: Failed to patch Weave modules with Future: {e}")

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
    model_name: str = "eval_efficiency"

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

        # Enhanced token tracking
        tokens_used = result["metadata"].get("tokens", 0)
        response_text = result["response"]

        # Extract context text for hallucination detection
        context_text = result.get("context", "")
        if not context_text and "metadata" in result:
            # Try to get context from metadata if available
            context_text = result["metadata"].get("context", "")

        # Ensure we have context for hallucination detection
        if not context_text:
            context_text = "No context available"

        return {
            "response": response_text,
            "query": sentence,  # Add original query for hallucination scorer
            "context_text": context_text,  # Add context for hallucination scorer
            "sources": result["sources"],
            "num_chunks": result["metadata"]["num_chunks"],
            "num_sources": result["metadata"]["num_sources"],
            "model": result["metadata"]["model"],
            "tokens": tokens_used,
            "token_details": {
                "total_tokens": tokens_used,
                "response_length": len(response_text),
                "chars_per_token": len(response_text) / tokens_used if tokens_used > 0 else 0,
                "model_name": result["metadata"].get("model", "unknown")
            }
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


@weave.op()
def token_usage_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score and track token usage efficiency and details.

    Args:
        output: The RAG pipeline output

    Returns:
        Dictionary with token usage metrics and score
    """
    tokens = output.get("tokens", 0)
    token_details = output.get("token_details", {})
    response_length = len(output.get("response", ""))

    # Calculate efficiency metrics
    chars_per_token = token_details.get("chars_per_token", 0)
    model_name = token_details.get("model_name", "unknown")

    # Score based on token efficiency
    # Good efficiency: 3+ chars per token
    # Excellent efficiency: 4+ chars per token
    if chars_per_token >= 4:
        efficiency_score = 1.0
    elif chars_per_token >= 3:
        efficiency_score = 0.8
    elif chars_per_token >= 2:
        efficiency_score = 0.6
    elif chars_per_token >= 1:
        efficiency_score = 0.4
    else:
        efficiency_score = 0.0

    return {
        "score": efficiency_score,
        "total_tokens": tokens,
        "response_length": response_length,
        "chars_per_token": chars_per_token,
        "model_name": model_name,
        "efficiency_rating": (
            "excellent" if chars_per_token >= 4 else
            "good" if chars_per_token >= 3 else
            "fair" if chars_per_token >= 2 else
            "poor" if chars_per_token >= 1 else
            "very_poor"
        ),
        "details": f"Used {tokens} tokens for {response_length} chars ({chars_per_token:.2f} chars/token) - {model_name}"
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

@weave.op()
def token_usage_eval_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for token usage tracking in Weave evaluation format"""
    return token_usage_scorer(output)

@weave.op()
def simple_hallucination_eval_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Scorer for simple rule-based hallucination detection in evaluation format"""
    return simple_hallucination_scorer(output)


# Simple rule-based hallucination scorer (no external dependencies)
@weave.op()
def simple_hallucination_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simple rule-based hallucination scorer that checks for basic consistency.

    Args:
        output: The RAG pipeline output containing response and context_text

    Returns:
        Dictionary with hallucination score and details
    """
    response = output.get("response", "").lower()
    context_text = output.get("context_text", "").lower()
    query = output.get("query", "").lower()

    if not context_text or not response:
        return {
            "score": 0.0,
            "has_hallucination": True,
            "passed": False,
            "details": "Missing context or response for hallucination detection"
        }

    # Simple heuristic-based hallucination detection
    try:
        # Check 1: Response should contain some words from context
        context_words = set(context_text.split())
        response_words = set(response.split())

        # Remove common stop words for better matching
        stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "this", "that", "these", "those"}

        context_content_words = context_words - stop_words
        response_content_words = response_words - stop_words

        # Calculate overlap
        if len(context_content_words) > 0:
            overlap = len(context_content_words.intersection(response_content_words))
            overlap_ratio = overlap / len(context_content_words)
        else:
            overlap_ratio = 0.0

        # Check 2: Response shouldn't contradict context with negative words
        contradiction_indicators = ["not", "never", "no", "false", "incorrect", "wrong", "opposite"]
        has_contradiction = any(word in response for word in contradiction_indicators)

        # Check 3: Response length should be reasonable (not too short or too long)
        response_length = len(response.split())
        reasonable_length = 5 <= response_length <= 200

        # Scoring logic
        if overlap_ratio >= 0.3 and not has_contradiction and reasonable_length:
            score = 1.0
            passed = True
            has_hallucination = False
        elif overlap_ratio >= 0.1 and reasonable_length:
            score = 0.5
            passed = False
            has_hallucination = True
        else:
            score = 0.0
            passed = False
            has_hallucination = True

        return {
            "score": score,
            "has_hallucination": has_hallucination,
            "passed": passed,
            "overlap_ratio": overlap_ratio,
            "has_contradiction": has_contradiction,
            "reasonable_length": reasonable_length,
            "details": f"Overlap: {overlap_ratio:.2f}, Contradiction: {has_contradiction}, Length OK: {reasonable_length}"
        }

    except Exception as e:
        return {
            "score": 0.0,
            "has_hallucination": True,
            "passed": False,
            "details": f"Error in simple hallucination detection: {str(e)}"
        }


async def run_e2e_evaluation():
    """Run end-to-end RAG evaluation using proper Weave evaluation framework"""
    print("🔍 Starting End-to-End RAG Evaluation with Weave Framework...")

    # Add debugger breakpoint (uncomment to use)
    # import pdb; pdb.set_trace()

    # Initialize Weave with project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "weave-rag-project")
    print(f"📊 Using Weave project: {wandb_project}")
    print("🐛 DEBUG: About to call weave.init()")
    weave.init(wandb_project)
    print("🐛 DEBUG: weave.init() completed")

    print("🎯 Creating RAG Pipeline Model...")

    # Create the RAG model
    model = RAGPipelineModel(name="rag_pipeline_v1")

    print("📝 Creating evaluation dataset...")

    # Create evaluation with proper Weave framework including hallucination detection
    evaluation = Evaluation(
        name="e2e_rag_evaluation_with_hallucination",
        dataset=E2E_TEST_CASES,
        scorers=[
            context_utilization_eval_scorer,
            efficiency_eval_scorer,
            source_citation_eval_scorer,
            token_usage_eval_scorer,
            simple_hallucination_eval_scorer
        ]
    )

    print("🚀 Running evaluation...")

    # Run evaluation
    results = await evaluation.evaluate(model)

    print("\n✅ End-to-End RAG Evaluation Complete!")

    # Enhanced results display with token usage
    print("\n📊 Detailed Results Summary:")

    # Token usage summary
    if "token_usage_eval_scorer" in results:
        token_results = results["token_usage_eval_scorer"]
        print(f"\n🪙 Token Usage Analysis:")
        print(f"   Average Tokens Used: {token_results.get('total_tokens', {}).get('mean', 0):.1f}")
        print(f"   Average Chars/Token: {token_results.get('chars_per_token', {}).get('mean', 0):.2f}")
        print(f"   Token Efficiency Score: {token_results.get('score', {}).get('mean', 0):.2f}")

    # Hallucination detection summary
    if "simple_hallucination_eval_scorer" in results:
        hallucination_results = results["simple_hallucination_eval_scorer"]
        hallucination_score = hallucination_results.get("score", {}).get("mean", 0)
        has_hallucination_count = hallucination_results.get("has_hallucination", {}).get("true_count", 0)
        passed_count = hallucination_results.get("passed", {}).get("true_count", 0)
        overlap_ratio = hallucination_results.get("overlap_ratio", {}).get("mean", 0)
        total_examples = 5  # We have 5 test cases
        print(f"\n🔍 Simple Hallucination Analysis:")
        print(f"   Hallucination-Free Score: {hallucination_score:.2f}")
        print(f"   Examples Passed: {passed_count}/{total_examples}")
        print(f"   Examples with Hallucinations: {has_hallucination_count}/{total_examples}")
        print(f"   Average Context Overlap: {overlap_ratio:.2f}")
        print(f"   Factual Accuracy: {'High' if hallucination_score > 0.8 else 'Medium' if hallucination_score > 0.6 else 'Low'}")

    # Other metrics summary
    if "context_utilization_eval_scorer" in results:
        context_score = results["context_utilization_eval_scorer"].get("score", {}).get("mean", 0)
        print(f"   Context Utilization: {context_score:.2f}")

    if "efficiency_eval_scorer" in results:
        efficiency_score = results["efficiency_eval_scorer"].get("score", {}).get("mean", 0)
        print(f"   Overall Efficiency: {efficiency_score:.2f}")

    if "source_citation_eval_scorer" in results:
        citation_score = results["source_citation_eval_scorer"].get("score", {}).get("mean", 0)
        print(f"   Source Citation: {citation_score:.2f}")

    print(f"\n� Full Results: {results}")

    return results


if __name__ == "__main__":
    print("🐛 DEBUG: Starting e2e_eval1.py")
    print(f"🐛 DEBUG: Python version: {sys.version}")
    print(f"🐛 DEBUG: Weave version: {weave.__version__}")

    # Try to rebuild the models to resolve forward reference issues
    try:
        print("🐛 DEBUG: Attempting to rebuild RAGPipelineModel...")
        RAGPipelineModel.model_rebuild()
        print("✅ RAGPipelineModel rebuilt successfully")
    except Exception as e:
        print(f"⚠️ RAGPipelineModel rebuild failed: {e}")
        print(f"🐛 DEBUG: Exception type: {type(e)}")
        print("Proceeding anyway...")

    try:
        print("🐛 DEBUG: Attempting to rebuild Evaluation...")
        Evaluation.model_rebuild()
        print("✅ Evaluation rebuilt successfully")
    except Exception as e:
        print(f"⚠️ Evaluation rebuild failed: {e}")
        print(f"🐛 DEBUG: Exception type: {type(e)}")
        print("Proceeding anyway...")

    # Rebuild Dataset as well to resolve forward reference issues
    try:
        print("🐛 DEBUG: Attempting to rebuild Dataset...")
        Dataset.model_rebuild()
        print("✅ Dataset rebuilt successfully")
    except Exception as e:
        print(f"⚠️ Dataset rebuild failed: {e}")
        print(f"🐛 DEBUG: Exception type: {type(e)}")
        print("Proceeding anyway...")


    print("🐛 DEBUG: Starting asyncio.run(run_e2e_evaluation())")
    try:
        asyncio.run(run_e2e_evaluation())
    except Exception as e:
        print(f"🐛 DEBUG: Main execution failed: {e}")
        print(f"🐛 DEBUG: Exception type: {type(e)}")
        import traceback
        traceback.print_exc()

