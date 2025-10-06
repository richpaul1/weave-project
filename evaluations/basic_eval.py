"""
Basic Weave Evaluation - Manual Approach

Using only @weave.op decorators to track evaluation without Evaluation class
to avoid Pydantic compatibility issues.
"""
import weave
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Simple test examples
test_examples = [
    {"question": "What is the capital of France?", "expected": "Paris"},
    {"question": "Who wrote 'To Kill a Mockingbird'?", "expected": "Harper Lee"},
    {"question": "What is the square root of 64?", "expected": "8"},
]

@weave.op()
def simple_model(question: str) -> dict:
    """Simple model that gives basic responses"""
    if "capital of France" in question:
        return {'generated_text': 'Paris'}
    elif "To Kill a Mockingbird" in question:
        return {'generated_text': 'Harper Lee'}
    elif "square root of 64" in question:
        return {'generated_text': '8'}
    else:
        return {'generated_text': 'I do not know'}

@weave.op()
def match_scorer(expected: str, output: dict) -> dict:
    """Score function that checks exact match"""
    generated = output.get('generated_text', '')
    is_match = expected == generated
    return {
        'match': is_match,
        'score': 1.0 if is_match else 0.0,
        'expected': expected,
        'generated': generated
    }

@weave.op()
def case_insensitive_scorer(expected: str, output: dict) -> dict:
    """Score function that checks case-insensitive match"""
    generated = output.get('generated_text', '')
    is_match = expected.lower() == generated.lower()
    return {
        'case_insensitive_match': is_match,
        'score': 1.0 if is_match else 0.0,
        'expected': expected.lower(),
        'generated': generated.lower()
    }

@weave.op()
async def run_single_evaluation(example: dict) -> dict:
    """Run evaluation on a single example"""
    question = example['question']
    expected = example['expected']
    
    # Get model output
    output = simple_model(question)
    
    # Run scorers
    exact_score = match_scorer(expected, output)
    case_score = case_insensitive_scorer(expected, output)
    
    return {
        'example': example,
        'output': output,
        'scores': {
            'exact_match': exact_score,
            'case_insensitive': case_score
        }
    }

@weave.op()
async def run_evaluation_batch(examples: list) -> dict:
    """Run evaluation on all examples"""
    results = []
    
    for i, example in enumerate(examples):
        print(f"📝 Evaluating example {i+1}: {example['question']}")
        result = await run_single_evaluation(example)
        results.append(result)
        
        # Print scores
        exact_score = result['scores']['exact_match']['score']
        case_score = result['scores']['case_insensitive']['score']
        print(f"   ✅ Exact Match: {exact_score:.1f}")
        print(f"   ✅ Case Insensitive: {case_score:.1f}")
    
    # Calculate overall scores
    exact_scores = [r['scores']['exact_match']['score'] for r in results]
    case_scores = [r['scores']['case_insensitive']['score'] for r in results]
    
    avg_exact = sum(exact_scores) / len(exact_scores)
    avg_case = sum(case_scores) / len(case_scores)
    
    summary = {
        'total_examples': len(examples),
        'results': results,
        'summary_scores': {
            'average_exact_match': avg_exact,
            'average_case_insensitive': avg_case,
            'overall_score': (avg_exact + avg_case) / 2
        }
    }
    
    return summary

async def main():
    """Main evaluation function"""
    print("🔍 Starting Basic Weave Evaluation...")
    
    # Initialize Weave with project name from environment
    wandb_project = os.getenv("WANDB_PROJECT", "basic-eval-test")
    print(f"📊 Using Weave project: {wandb_project}")
    weave.init(wandb_project)
    
    print("🚀 Running evaluation...")
    
    # Run evaluation
    results = await run_evaluation_batch(test_examples)
    
    # Print summary
    print(f"\n📊 Evaluation Summary:")
    print(f"   Total Examples: {results['total_examples']}")
    print(f"   Average Exact Match: {results['summary_scores']['average_exact_match']:.2f}")
    print(f"   Average Case Insensitive: {results['summary_scores']['average_case_insensitive']:.2f}")
    print(f"   Overall Score: {results['summary_scores']['overall_score']:.2f}")
    
    print("\n✅ Basic Evaluation Complete!")
    return results

if __name__ == "__main__":
    asyncio.run(main())
