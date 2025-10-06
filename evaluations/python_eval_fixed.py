"""
Fixed Python Weave Evaluation - Following Node.js Pattern

Using the exact same pattern as the working Node.js version:
- Simple functions with @weave.op() instead of weave.Model
- Same dataset structure
- Same evaluation pattern
"""
import weave
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Test dataset - exact same structure as Node.js version
test_dataset = [
    {
        "id": "1",
        "question": "What is the capital of France?",
        "expected": "Paris"
    },
    {
        "id": "2", 
        "question": "Who wrote To Kill a Mockingbird?",
        "expected": "Harper Lee"
    },
    {
        "id": "3",
        "question": "What is the square root of 64?",
        "expected": "8"
    }
]

# Simple model function - exact same logic as Node.js version
@weave.op()
async def simple_model(datasetRow: dict) -> dict:
    """Simple model function that gives correct answers"""
    question = datasetRow["question"]
    
    if "capital of France" in question:
        return {"generated_text": "Paris"}
    elif "To Kill a Mockingbird" in question:
        return {"generated_text": "Harper Lee"}
    elif "square root of 64" in question:
        return {"generated_text": "8"}
    else:
        return {"generated_text": "I do not know"}

# Scorer function - exact match (same as Node.js)
@weave.op()
def exact_match_scorer(modelOutput: dict, datasetRow: dict) -> dict:
    """Score function that checks exact match"""
    expected = datasetRow["expected"]
    generated = modelOutput["generated_text"]
    is_match = expected == generated
    
    return {
        "exact_match": is_match,
        "score": 1.0 if is_match else 0.0,
        "expected": expected,
        "generated": generated
    }

# Case insensitive scorer (same as Node.js)
@weave.op()
def case_insensitive_scorer(modelOutput: dict, datasetRow: dict) -> dict:
    """Score function that checks case-insensitive match"""
    expected = datasetRow["expected"].lower()
    generated = modelOutput["generated_text"].lower()
    is_match = expected == generated
    
    return {
        "case_insensitive_match": is_match,
        "score": 1.0 if is_match else 0.0,
        "expected": expected,
        "generated": generated
    }

async def run_python_evaluation():
    """Run evaluation using the exact Node.js pattern"""
    print("🔍 Starting Fixed Python Weave Evaluation...")
    
    # Get project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "python-eval-test")
    print(f"📊 Using Weave project: {wandb_project}")
    
    # Initialize Weave
    await weave.init(wandb_project)
    
    print("📝 Creating dataset...")
    
    # Create dataset - same as Node.js
    dataset = weave.Dataset(
        id="Simple Q&A Dataset",
        description="Simple question and answer dataset for testing evaluations",
        rows=test_dataset
    )
    
    print("🎯 Creating evaluation...")
    
    # Create evaluation - same as Node.js
    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[exact_match_scorer, case_insensitive_scorer]
    )
    
    print("🚀 Running evaluation...")
    
    # Run evaluation - same as Node.js
    results = await evaluation.evaluate(model=simple_model)
    
    print("\n✅ Fixed Python Evaluation Complete!")
    print(f"📊 Results: {results}")
    
    return results

if __name__ == "__main__":
    asyncio.run(run_python_evaluation())
