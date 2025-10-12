#!/usr/bin/env python3
"""
Evaluation: Simple Prompt vs Complex Prompt
Compares the performance of two different system prompts for the multimodal agent.
Captures queries, responses, and metrics for analysis using Weave Evaluation framework.
"""

import os
import json
import weave
from weave import Evaluation, Model
from datetime import datetime
from dotenv import load_dotenv
from typing import Dict, Any
import asyncio
import re

# Load environment variables
load_dotenv('../../.env.local')
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')
WANDB_API_KEY = os.getenv('WANDB_API_KEY')

# Initialize Weave without any autopatch to avoid conflicts
weave.init('rl-demo')

# Import httpx for direct API calls to avoid Weave instrumentation conflicts
import httpx
import json

# Manual OpenPipe API client to avoid Weave instrumentation issues
class ManualOpenPipeClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://app.openpipe.ai/api/v1"

    def chat_completion(self, model: str, messages: list, temperature: float, max_tokens: int) -> dict:
        """Make a direct API call to OpenPipe without Weave instrumentation"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        try:
            with httpx.Client() as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=60.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"error": str(e)}

# Initialize manual OpenPipe client
openpipe_client = ManualOpenPipeClient(OPENPIPE_API_KEY)

# Create a wrapper function to handle OpenPipe API calls safely
@weave.op()
def safe_openpipe_call(model: str, messages: list, temperature: float, max_tokens: int) -> dict:
    """
    Wrapper for OpenPipe API calls that avoids Weave instrumentation conflicts.
    """
    try:
        result = openpipe_client.chat_completion(model, messages, temperature, max_tokens)

        if "error" in result:
            return {
                "response": f"Error: {result['error']}",
                "usage": {"input_tokens": None, "output_tokens": None, "total_tokens": None},
                "error": result['error']
            }

        response_text = result["choices"][0]["message"]["content"]

        # Extract token usage safely
        usage_info = {"input_tokens": None, "output_tokens": None, "total_tokens": None}
        if "usage" in result and result["usage"]:
            usage = result["usage"]
            usage_info = {
                "input_tokens": usage.get("prompt_tokens"),
                "output_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens")
            }

        return {
            "response": response_text,
            "usage": usage_info,
            "error": None
        }

    except Exception as e:
        return {
            "response": f"Error: {str(e)}",
            "usage": {"input_tokens": None, "output_tokens": None, "total_tokens": None},
            "error": str(e)
        }

# Define the two prompts to compare
SIMPLE_PROMPT = "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"

COMPLEX_PROMPT = """You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework.

IMPORTANT: Always include relevant screenshots and diagrams in your responses using markdown format: ![alt text](image_url)

When answering questions:
1. Provide clear text explanations
2. Include at least one relevant image/screenshot from the Weave documentation
3. Use the format: ![description](https://weave-docs.wandb.ai/assets/images/...)
4. Explain why the image is relevant

Example response format:
"Here's how to use Weave tracing:

[Your explanation here]

![Weave Trace UI](https://weave-docs.wandb.ai/assets/images/trace-example.png)

This screenshot shows the trace interface where you can see..."
"""

# Test queries - Weave dataset format
TEST_QUERIES = [
    {
        "id": "q1",
        "sentence": "How do I trace my LLM calls with Weave?",
        "category": "tracing",
        "expected_image": True
    },
    {
        "id": "q2",
        "sentence": "What is a Weave Dataset?",
        "category": "datasets",
        "expected_image": True
    },
    {
        "id": "q3",
        "sentence": "Show me how to use the evaluation playground",
        "category": "evaluation",
        "expected_image": True
    },
    {
        "id": "q4",
        "sentence": "How do I use weave.Model to track my models?",
        "category": "models",
        "expected_image": True
    },
    {
        "id": "q5",
        "sentence": "Explain Weave tracing and show me an example",
        "category": "tracing",
        "expected_image": True
    },
    {
        "id": "q6",
        "sentence": "How do I create a dataset in Weave?",
        "category": "datasets",
        "expected_image": True
    }
]


# Weave Model for Simple Prompt
class SimplePromptModel(Model):
    """Model using simple prompt"""

    model_name: str = "simple_prompt"
    system_prompt: str = SIMPLE_PROMPT
    temperature: float = 0.3

    @weave.op()
    async def predict(self, sentence: str, category: str = None, expected_image: bool = None) -> Dict[str, Any]:
        """
        Query the model with simple prompt.
        Returns the response and metadata.
        """
        # Use the safe wrapper to avoid token usage conflicts
        result = safe_openpipe_call(
            model="openpipe:multimodal-agent-v1",
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": sentence}
            ],
            temperature=self.temperature,
            max_tokens=800
        )

        response = result["response"]

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response)

        return {
            "response": response,
            "query": sentence,
            "category": category,
            "expected_image": expected_image,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response.split()),
            "char_count": len(response),
            "error": "Error:" in response
        }


# Weave Model for Complex Prompt
class ComplexPromptModel(Model):
    """Model using complex prompt"""

    model_name: str = "complex_prompt"
    system_prompt: str = COMPLEX_PROMPT
    temperature: float = 0.3

    @weave.op()
    async def predict(self, sentence: str, category: str = None, expected_image: bool = None) -> Dict[str, Any]:
        """
        Query the model with complex prompt.
        Returns the response and metadata.
        """
        # Use the safe wrapper to avoid token usage conflicts
        result = safe_openpipe_call(
            model="openpipe:multimodal-agent-v1",
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": sentence}
            ],
            temperature=self.temperature,
            max_tokens=800
        )

        response = result["response"]

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response)

        return {
            "response": response,
            "query": sentence,
            "category": category,
            "expected_image": expected_image,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response.split()),
            "char_count": len(response),
            "error": "Error:" in response
        }


# Scorers for Weave Evaluation
@weave.op()
def image_inclusion_scorer(expected_image: bool, output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score based on image inclusion.
    """
    has_image = output.get("has_image", False)
    image_count = output.get("image_count", 0)

    if expected_image and has_image:
        score = 1.0
        passed = True
    elif not expected_image and not has_image:
        score = 1.0
        passed = True
    else:
        score = 0.0
        passed = False

    return {
        "score": score,
        "passed": passed,
        "has_image": has_image,
        "image_count": image_count,
        "details": f"Expected image: {expected_image}, Has image: {has_image}, Count: {image_count}"
    }


@weave.op()
def response_length_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score based on response length (150-500 words is ideal).
    """
    word_count = output.get("word_count", 0)

    if 150 <= word_count <= 500:
        score = 1.0
        quality = "good"
    elif word_count < 150:
        score = 0.5
        quality = "too_short"
    else:
        score = 0.7
        quality = "too_long"

    return {
        "score": score,
        "word_count": word_count,
        "quality": quality,
        "details": f"Word count: {word_count}, Quality: {quality}"
    }


@weave.op()
def overall_quality_scorer(expected_image: bool, output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Overall quality score combining multiple factors.
    """
    score = 0.0
    max_score = 100.0

    # Image inclusion (40 points)
    if output.get("has_image", False):
        score += 40

    # Response length (20 points)
    word_count = output.get("word_count", 0)
    if 150 <= word_count <= 500:
        score += 20
    elif word_count < 150:
        score += 10
    else:
        score += 15

    # Image count (20 points)
    if output.get("image_count", 0) >= 1:
        score += 20

    # Expected image presence (20 points)
    if expected_image and output.get("has_image", False):
        score += 20
    elif not expected_image and not output.get("has_image", False):
        score += 20

    return {
        "score": score / max_score,  # Normalize to 0-1
        "raw_score": score,
        "max_score": max_score,
        "percentage": score,
        "details": f"Score: {score}/{max_score} ({score}%)"
    }


async def run_evaluation():
    """
    Run the full evaluation comparing simple vs complex prompts using Weave Evaluation framework.
    """
    print("🧪 Starting Prompt Comparison Evaluation with Weave Framework")
    print("="*80)
    print(f"\nModel: openpipe:multimodal-agent-v1")
    print(f"Test queries: {len(TEST_QUERIES)}")
    print(f"Temperature: 0.3")
    print("\n" + "="*80)

    # Create models
    print("\n📝 Creating models...")
    simple_model = SimplePromptModel(name="simple_prompt_model")
    complex_model = ComplexPromptModel(name="complex_prompt_model")

    # Create evaluations
    print("\n📝 Testing with SIMPLE PROMPT")
    print("-"*80)

    simple_evaluation = Evaluation(
        evaluation_name="simple_prompt_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    simple_results = await simple_evaluation.evaluate(simple_model)

    print("\n📝 Testing with COMPLEX PROMPT")
    print("-"*80)

    complex_evaluation = Evaluation(
        evaluation_name="complex_prompt_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    complex_results = await complex_evaluation.evaluate(complex_model)

    # Print summary
    print("\n\n" + "="*80)
    print("📊 EVALUATION SUMMARY")
    print("="*80)

    # Extract scores
    simple_quality = simple_results.get("overall_quality_scorer", {})
    complex_quality = complex_results.get("overall_quality_scorer", {})

    simple_image = simple_results.get("image_inclusion_scorer", {})
    complex_image = complex_results.get("image_inclusion_scorer", {})

    print(f"\n{'Metric':<30} {'Simple Prompt':<20} {'Complex Prompt':<20}")
    print("-"*80)

    if "score" in simple_quality and "mean" in simple_quality["score"]:
        simple_avg = simple_quality["score"]["mean"] * 100
        complex_avg = complex_quality["score"]["mean"] * 100
        print(f"{'Average Quality Score':<30} {simple_avg:>18.1f}% {complex_avg:>18.1f}%")

    if "passed" in simple_image and "true_count" in simple_image["passed"]:
        simple_img_count = simple_image["passed"]["true_count"]
        complex_img_count = complex_image["passed"]["true_count"]
        print(f"{'Images Included':<30} {simple_img_count:>18}/{len(TEST_QUERIES)} {complex_img_count:>18}/{len(TEST_QUERIES)}")
        print(f"{'Image Inclusion Rate':<30} {(simple_img_count/len(TEST_QUERIES)*100):>18.1f}% {(complex_img_count/len(TEST_QUERIES)*100):>18.1f}%")

    print("\n" + "="*80)

    if complex_avg > simple_avg + 10:
        print("✅ RESULT: Complex prompt significantly outperforms simple prompt")
        print("💡 RECOMMENDATION: Use complex prompt in production")
    elif complex_avg > simple_avg:
        print("⚠️  RESULT: Complex prompt slightly better than simple prompt")
        print("💡 RECOMMENDATION: Consider using complex prompt")
    else:
        print("❌ RESULT: No significant improvement with complex prompt")
        print("💡 RECOMMENDATION: Simple prompt is sufficient")

    print("="*80 + "\n")

    # Save results
    output_file = f"evaluation_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    results_data = {
        "timestamp": datetime.now().isoformat(),
        "model": "openpipe:multimodal-agent-v1",
        "simple_results": simple_results,
        "complex_results": complex_results
    }

    with open(output_file, 'w') as f:
        json.dump(results_data, f, indent=2, default=str)

    print(f"📁 Results saved to: {output_file}")
    print(f"🔗 View in Weave: https://wandb.ai/richpaul1-stealth/rl-demo")

    return results_data


if __name__ == "__main__":
    print("🐛 DEBUG: Starting prompt_comparison_eval.py")
    print(f"🐛 DEBUG: Weave version: {weave.__version__}")

    # Run evaluation
    print("🐛 DEBUG: Starting asyncio.run(run_evaluation())")
    try:
        asyncio.run(run_evaluation())
    except Exception as e:
        print(f"🐛 DEBUG: Main execution failed: {e}")
        print(f"🐛 DEBUG: Exception type: {type(e)}")
        import traceback
        traceback.print_exc()

