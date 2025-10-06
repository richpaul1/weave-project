"""
Simple Weave Evaluation Example

Following the exact pattern from Weave documentation to ensure evaluations show up properly.
"""
import weave
from weave import Evaluation, Model
import asyncio
import os
import sys

# Load environment variables from .env.local
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Simple test examples following Weave docs pattern
examples = [
    {"question": "What is the capital of France?", "expected": "Paris"},
    {"question": "Who wrote 'To Kill a Mockingbird'?", "expected": "Harper Lee"},
    {"question": "What is the square root of 64?", "expected": "8"},
]

@weave.op()
def match_score1(expected: str, output: dict) -> dict:
    """Score function that checks if expected matches generated text"""
    return {'match': expected == output['generated_text']}

@weave.op()
def match_score2(expected: str, output: dict) -> dict:
    """Second score function for demonstration"""
    return {'exact_match': expected.lower() == output['generated_text'].lower()}

# Let's use a simple function instead of a Model class to avoid Pydantic issues
@weave.op()
def simple_model_function(question: str):
    """Simple model function that returns a greeting"""
    return {'generated_text': 'Hello, ' + question + ' World'}

@weave.op()
def simple_function_to_evaluate(question: str):
    """Simple function for testing evaluations"""
    # Simulate some basic responses for our test questions
    if "capital of France" in question:
        return {'generated_text': 'Paris'}
    elif "To Kill a Mockingbird" in question:
        return {'generated_text': 'Harper Lee'}
    elif "square root of 64" in question:
        return {'generated_text': '8'}
    else:
        return {'generated_text': 'I do not know'}

async def run_simple_evaluation():
    """Run simple evaluation following Weave docs pattern"""
    print("🔍 Starting Simple Weave Evaluation...")
    
    # Initialize Weave with project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "simple-eval-test")
    print(f"📊 Using Weave project: {wandb_project}")
    weave.init(wandb_project)
    
    # Create evaluation
    evaluation = Evaluation(
        dataset=examples,
        scorers=[match_score1, match_score2],
        evaluation_name="Simple Test Evaluation"
    )

    print("🚀 Running evaluation on simple model function...")

    # Run evaluation on simple model function
    model_results = await evaluation.evaluate(simple_model_function, __weave={"display_name": "Simple Model Function Run"})
    print(f"📊 Model Results: {model_results}")

    print("🚀 Running evaluation on smart function...")

    # Run evaluation on smart function
    function_results = await evaluation.evaluate(simple_function_to_evaluate, __weave={"display_name": "Smart Function Evaluation Run"})
    print(f"📊 Function Results: {function_results}")

    print("\n✅ Simple Evaluation Complete!")
    return model_results, function_results

if __name__ == "__main__":
    asyncio.run(run_simple_evaluation())
