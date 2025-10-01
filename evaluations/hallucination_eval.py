"""
Hallucination Detection Evaluation

Evaluates the accuracy of hallucination detection using Weave evaluations.
"""
import weave
import asyncio
from typing import Dict, Any
import sys
import os

# Add parent directory to path to import agent-backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent-backend'))

from app.services.llm_service import LLMService
from app.services.hallucination_service import HallucinationService


# Define evaluation dataset with known hallucinations
HALLUCINATION_TEST_CASES = [
    {
        "response": "Weave is a lightweight toolkit for tracking and evaluating LLM applications.",
        "context": "Weave is a lightweight toolkit for tracking and evaluating LLM applications. It provides automatic logging of LLM calls and traces.",
        "expected_score": 0.0,  # No hallucination
        "label": "accurate"
    },
    {
        "response": "Weave was created by Microsoft in 2020.",
        "context": "Weave is a lightweight toolkit for tracking and evaluating LLM applications.",
        "expected_score": 1.0,  # Complete hallucination
        "label": "hallucinated"
    },
    {
        "response": "Weave is a toolkit that provides logging and was created by Weights & Biases.",
        "context": "Weave is a lightweight toolkit for tracking and evaluating LLM applications. It provides automatic logging of LLM calls.",
        "expected_score": 0.5,  # Partial hallucination (creator not mentioned in context)
        "label": "partial"
    },
    {
        "response": "The system uses Neo4j for storage and Ollama for LLM inference.",
        "context": "The system uses Neo4j as the graph database for storing pages and chunks. It uses Ollama for running local LLM models.",
        "expected_score": 0.0,  # No hallucination
        "label": "accurate"
    },
    {
        "response": "The RAG pipeline uses GPT-4 and costs $100 per month.",
        "context": "The RAG pipeline retrieves context from Neo4j and generates responses using an LLM.",
        "expected_score": 1.0,  # Complete hallucination
        "label": "hallucinated"
    }
]


class HallucinationDetectorModel(weave.Model):
    """Weave model for hallucination detection evaluation"""
    
    llm_service: LLMService
    hallucination_service: HallucinationService
    
    @weave.op()
    async def predict(self, response: str, context: str) -> Dict[str, Any]:
        """
        Detect hallucinations in a response.
        
        Args:
            response: The LLM response to check
            context: The context used to generate the response
            
        Returns:
            Dictionary with hallucination detection results
        """
        result = await self.hallucination_service.detect_hallucination(
            response=response,
            context=context
        )
        
        return {
            "score": result["score"],
            "supported_claims": result["supported_claims"],
            "unsupported_claims": result["unsupported_claims"],
            "total_claims": result["total_claims"]
        }


@weave.op()
def detection_accuracy(response: str, context: str, model_output: Dict[str, Any], expected_score: float, label: str) -> Dict[str, Any]:
    """
    Score the accuracy of hallucination detection.
    
    Args:
        response: The LLM response
        context: The context
        model_output: The hallucination detector output
        expected_score: Expected hallucination score (0.0 = no hallucination, 1.0 = complete hallucination)
        label: Expected label (accurate, partial, hallucinated)
        
    Returns:
        Dictionary with accuracy score and details
    """
    detected_score = model_output.get("score", 0.0)
    
    # Calculate error (lower is better)
    error = abs(detected_score - expected_score)
    
    # Convert error to accuracy score (1.0 = perfect, 0.0 = completely wrong)
    accuracy = 1.0 - error
    
    # Determine detected label
    if detected_score < 0.3:
        detected_label = "accurate"
    elif detected_score < 0.7:
        detected_label = "partial"
    else:
        detected_label = "hallucinated"
    
    label_match = 1.0 if detected_label == label else 0.0
    
    return {
        "score": accuracy,
        "label_match": label_match,
        "error": error,
        "detected_score": detected_score,
        "expected_score": expected_score,
        "detected_label": detected_label,
        "expected_label": label,
        "details": f"Detected: {detected_score:.2f}, Expected: {expected_score:.2f}, Error: {error:.2f}"
    }


@weave.op()
def claim_extraction_quality(response: str, context: str, model_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the quality of claim extraction.
    
    Args:
        response: The LLM response
        context: The context
        model_output: The hallucination detector output
        
    Returns:
        Dictionary with quality score and details
    """
    total_claims = model_output.get("total_claims", 0)
    
    # Good claim extraction should find at least 1 claim per sentence
    # Estimate sentences by counting periods
    estimated_sentences = response.count('.') + 1
    
    # Score based on whether we extracted a reasonable number of claims
    if total_claims == 0:
        score = 0.0
    elif total_claims < estimated_sentences * 0.5:
        score = 0.5  # Too few claims
    elif total_claims > estimated_sentences * 2:
        score = 0.7  # Too many claims (over-extraction)
    else:
        score = 1.0  # Good number of claims
    
    return {
        "score": score,
        "total_claims": total_claims,
        "estimated_sentences": estimated_sentences,
        "details": f"Extracted {total_claims} claims from ~{estimated_sentences} sentences"
    }


async def run_hallucination_evaluation():
    """Run hallucination detection evaluation"""
    print("🔍 Starting Hallucination Detection Evaluation...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    llm_service = LLMService()
    hallucination_service = HallucinationService(llm_service=llm_service)
    
    # Create model
    model = HallucinationDetectorModel(
        llm_service=llm_service,
        hallucination_service=hallucination_service
    )
    
    # Create dataset
    dataset = weave.Dataset(
        name="hallucination_test_cases",
        rows=HALLUCINATION_TEST_CASES
    )
    
    # Create evaluation
    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[detection_accuracy, claim_extraction_quality]
    )
    
    # Run evaluation
    print("Running evaluation...")
    results = await evaluation.evaluate(model)
    
    print("\n✅ Hallucination Detection Evaluation Complete!")
    print(f"Results: {results}")
    
    return results


if __name__ == "__main__":
    asyncio.run(run_hallucination_evaluation())

