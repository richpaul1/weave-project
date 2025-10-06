"""
Working Weave Evaluation - Following the successful pattern

Based on the working example that properly creates evaluations in Weave.
"""
import weave
import asyncio
import os
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables from .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Define structured output model
class QAResponse(BaseModel):
    answer: str
    confidence: float

class SimpleQAModel(weave.Model):
    """Simple Q&A model for testing evaluations"""
    model_name: str
    
    @weave.op()
    def predict(self, sentence: str) -> QAResponse:
        """Simple prediction function that gives correct answers"""
        if "capital of France" in sentence:
            return QAResponse(answer="Paris", confidence=1.0)
        elif "To Kill a Mockingbird" in sentence:
            return QAResponse(answer="Harper Lee", confidence=1.0)
        elif "square root of 64" in sentence:
            return QAResponse(answer="8", confidence=1.0)
        else:
            return QAResponse(answer="I do not know", confidence=0.1)

# Test examples following the working pattern
examples = [
    {
        "id": "0",
        "sentence": "What is the capital of France?",
        "target": {"answer": "Paris", "confidence": 1.0}
    },
    {
        "id": "1", 
        "sentence": "Who wrote To Kill a Mockingbird?",
        "target": {"answer": "Harper Lee", "confidence": 1.0}
    },
    {
        "id": "2",
        "sentence": "What is the square root of 64?",
        "target": {"answer": "8", "confidence": 1.0}
    }
]

@weave.op()
def answer_correctness_score(target: dict, output: QAResponse) -> dict:
    """Score function that checks if the answer is correct"""
    target_answer = target["answer"].lower().strip()
    output_answer = output.answer.lower().strip()
    is_correct = target_answer == output_answer
    
    return {
        "correct": is_correct,
        "score": 1.0 if is_correct else 0.0,
        "target_answer": target_answer,
        "output_answer": output_answer
    }

@weave.op()
def confidence_score(target: dict, output: QAResponse) -> dict:
    """Score function that evaluates confidence levels"""
    target_confidence = target["confidence"]
    output_confidence = output.confidence
    
    # Good confidence means high confidence for correct answers
    confidence_appropriate = (
        (output_confidence >= 0.8 and target["answer"].lower() in output.answer.lower()) or
        (output_confidence <= 0.3 and target["answer"].lower() not in output.answer.lower())
    )
    
    return {
        "confidence_appropriate": confidence_appropriate,
        "confidence_score": 1.0 if confidence_appropriate else 0.0,
        "target_confidence": target_confidence,
        "output_confidence": output_confidence
    }

async def run_working_evaluation():
    """Run evaluation using the working pattern"""
    print("🔍 Starting Working Weave Evaluation...")
    
    # Initialize Weave with project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "working-eval-test")
    print(f"📊 Using Weave project: {wandb_project}")
    
    # Initialize weave client
    weave_client = weave.init(wandb_project)
    
    # Create model with proper name parameter
    model = SimpleQAModel(
        name="simple_qa_v1",
        model_name="simple-qa-model"
    )
    
    print("🎯 Creating evaluation...")
    
    # Create evaluation following the working pattern
    evaluation = weave.Evaluation(
        name="qa_evaluation",
        dataset=examples,
        scorers=[answer_correctness_score, confidence_score]
    )
    
    print("🚀 Running evaluation...")
    
    # Run evaluation
    results = await evaluation.evaluate(model)
    
    print("\n✅ Working Evaluation Complete!")
    print(f"📊 Results: {results}")
    
    return results

if __name__ == "__main__":
    asyncio.run(run_working_evaluation())
