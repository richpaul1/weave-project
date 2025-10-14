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
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')

# Initialize Weave without any autopatch to avoid conflicts
weave.init('rl-demo')

# Import httpx for direct API calls to avoid Weave instrumentation conflicts
import httpx
import json
from leaderboard import create_prompts_leaderboard, print_leaderboard_info

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


# Weave Model for Simple Prompt - OpenPipe
class SimplePromptOpenPipeModel(Model):
    """OpenPipe model using simple prompt"""

    model_name: str = "simple_prompt_openpipe"
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


# Weave Model for Complex Prompt - OpenPipe
class ComplexPromptOpenPipeModel(Model):
    """OpenPipe model using complex prompt"""

    model_name: str = "complex_prompt_openpipe"
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


# Weave Model for Simple Prompt - Local Custom Model
class SimplePromptLocalModel(Model):
    """Local qwen3-weave model using simple prompt"""

    model_name: str = "simple_prompt_local"
    system_prompt: str = SIMPLE_PROMPT
    temperature: float = 0.3

    @weave.op()
    async def predict(self, sentence: str, category: str = None, expected_image: bool = None) -> Dict[str, Any]:
        """
        Query the local custom model with simple prompt.
        Returns the response and metadata.
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": "qwen3-weave:0.6b",
                        "prompt": f"System: {self.system_prompt}\n\nUser: {sentence}",
                        "stream": False,
                        "options": {
                            "temperature": self.temperature,
                            "num_predict": 800
                        }
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    response_text = result.get("response", "")
                else:
                    response_text = f"Error: HTTP {response.status_code}"

        except Exception as e:
            response_text = f"Error: {str(e)}"

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response_text)

        return {
            "response": response_text,
            "query": sentence,
            "category": category,
            "expected_image": expected_image,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "error": "Error:" in response_text
        }


# Weave Model for Complex Prompt - Local Custom Model
class ComplexPromptLocalModel(Model):
    """Local qwen3-weave model using complex prompt"""

    model_name: str = "complex_prompt_local"
    system_prompt: str = COMPLEX_PROMPT
    temperature: float = 0.3

    @weave.op()
    async def predict(self, sentence: str, category: str = None, expected_image: bool = None) -> Dict[str, Any]:
        """
        Query the local custom model with complex prompt.
        Returns the response and metadata.
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": "qwen3-weave:0.6b",
                        "prompt": f"System: {self.system_prompt}\n\nUser: {sentence}",
                        "stream": False,
                        "options": {
                            "temperature": self.temperature,
                            "num_predict": 800
                        }
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    response_text = result.get("response", "")
                else:
                    response_text = f"Error: HTTP {response.status_code}"

        except Exception as e:
            response_text = f"Error: {str(e)}"

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response_text)

        return {
            "response": response_text,
            "query": sentence,
            "category": category,
            "expected_image": expected_image,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "error": "Error:" in response_text
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
    Run the full evaluation comparing simple vs complex prompts for both OpenPipe and Local models.
    """
    print("🧪 Starting Prompt Comparison Evaluation with Weave Framework")
    print("="*80)
    print(f"\nModels: openpipe:multimodal-agent-v1 vs local-qwen3-weave:0.6b")
    print(f"Test queries: {len(TEST_QUERIES)}")
    print(f"Temperature: 0.3")
    print("\n" + "="*80)

    # Create models
    print("\n📝 Creating models...")
    simple_openpipe_model = SimplePromptOpenPipeModel(name="simple_prompt_openpipe_model")
    complex_openpipe_model = ComplexPromptOpenPipeModel(name="complex_prompt_openpipe_model")
    simple_local_model = SimplePromptLocalModel(name="simple_prompt_local_model")
    complex_local_model = ComplexPromptLocalModel(name="complex_prompt_local_model")

    # Create evaluations for OpenPipe model
    print("\n📝 Testing OpenPipe with SIMPLE PROMPT")
    print("-"*80)

    simple_openpipe_evaluation = Evaluation(
        evaluation_name="simple_prompt_openpipe_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    simple_openpipe_results = await simple_openpipe_evaluation.evaluate(simple_openpipe_model)

    print("\n📝 Testing OpenPipe with COMPLEX PROMPT")
    print("-"*80)

    complex_openpipe_evaluation = Evaluation(
        evaluation_name="complex_prompt_openpipe_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    complex_openpipe_results = await complex_openpipe_evaluation.evaluate(complex_openpipe_model)

    # Create evaluations for Local model
    print("\n📝 Testing Local qwen3-weave with SIMPLE PROMPT")
    print("-"*80)

    simple_local_evaluation = Evaluation(
        evaluation_name="simple_prompt_local_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    simple_local_results = await simple_local_evaluation.evaluate(simple_local_model)

    print("\n📝 Testing Local qwen3-weave with COMPLEX PROMPT")
    print("-"*80)

    complex_local_evaluation = Evaluation(
        evaluation_name="complex_prompt_local_evaluation",
        dataset=TEST_QUERIES,
        scorers=[image_inclusion_scorer, response_length_scorer, overall_quality_scorer]
    )

    complex_local_results = await complex_local_evaluation.evaluate(complex_local_model)

    # Print summary
    print("\n\n" + "="*80)
    print("📊 EVALUATION SUMMARY")
    print("="*80)

    # Extract scores for all models
    simple_openpipe_quality = simple_openpipe_results.get("overall_quality_scorer", {})
    complex_openpipe_quality = complex_openpipe_results.get("overall_quality_scorer", {})
    simple_local_quality = simple_local_results.get("overall_quality_scorer", {})
    complex_local_quality = complex_local_results.get("overall_quality_scorer", {})

    simple_openpipe_image = simple_openpipe_results.get("image_inclusion_scorer", {})
    complex_openpipe_image = complex_openpipe_results.get("image_inclusion_scorer", {})
    simple_local_image = simple_local_results.get("image_inclusion_scorer", {})
    complex_local_image = complex_local_results.get("image_inclusion_scorer", {})

    print(f"\n{'Model/Prompt':<25} {'Quality Score':<15} {'Image Rate':<15} {'Images':<10}")
    print("-"*80)

    # OpenPipe results
    if "score" in simple_openpipe_quality and "mean" in simple_openpipe_quality["score"]:
        simple_op_avg = simple_openpipe_quality["score"]["mean"] * 100
        simple_op_img_count = simple_openpipe_image.get("passed", {}).get("true_count", 0)
        simple_op_img_rate = (simple_op_img_count/len(TEST_QUERIES)*100)
        print(f"{'OpenPipe + Simple':<25} {simple_op_avg:>13.1f}% {simple_op_img_rate:>13.1f}% {simple_op_img_count:>8}/{len(TEST_QUERIES)}")

    if "score" in complex_openpipe_quality and "mean" in complex_openpipe_quality["score"]:
        complex_op_avg = complex_openpipe_quality["score"]["mean"] * 100
        complex_op_img_count = complex_openpipe_image.get("passed", {}).get("true_count", 0)
        complex_op_img_rate = (complex_op_img_count/len(TEST_QUERIES)*100)
        print(f"{'OpenPipe + Complex':<25} {complex_op_avg:>13.1f}% {complex_op_img_rate:>13.1f}% {complex_op_img_count:>8}/{len(TEST_QUERIES)}")

    # Local model results
    if "score" in simple_local_quality and "mean" in simple_local_quality["score"]:
        simple_local_avg = simple_local_quality["score"]["mean"] * 100
        simple_local_img_count = simple_local_image.get("passed", {}).get("true_count", 0)
        simple_local_img_rate = (simple_local_img_count/len(TEST_QUERIES)*100)
        print(f"{'Local + Simple':<25} {simple_local_avg:>13.1f}% {simple_local_img_rate:>13.1f}% {simple_local_img_count:>8}/{len(TEST_QUERIES)}")

    if "score" in complex_local_quality and "mean" in complex_local_quality["score"]:
        complex_local_avg = complex_local_quality["score"]["mean"] * 100
        complex_local_img_count = complex_local_image.get("passed", {}).get("true_count", 0)
        complex_local_img_rate = (complex_local_img_count/len(TEST_QUERIES)*100)
        print(f"{'Local + Complex':<25} {complex_local_avg:>13.1f}% {complex_local_img_rate:>13.1f}% {complex_local_img_count:>8}/{len(TEST_QUERIES)}")

    print("\n" + "="*80)

    # Determine best combination
    scores = [
        ("OpenPipe + Simple", simple_op_avg if 'simple_op_avg' in locals() else 0),
        ("OpenPipe + Complex", complex_op_avg if 'complex_op_avg' in locals() else 0),
        ("Local + Simple", simple_local_avg if 'simple_local_avg' in locals() else 0),
        ("Local + Complex", complex_local_avg if 'complex_local_avg' in locals() else 0)
    ]

    best_combo = max(scores, key=lambda x: x[1])
    print(f"🏆 BEST PERFORMER: {best_combo[0]} ({best_combo[1]:.1f}%)")

    # Model comparison
    if 'simple_local_avg' in locals() and 'simple_op_avg' in locals():
        if simple_local_avg > simple_op_avg + 5:
            print("✅ Local model outperforms OpenPipe with simple prompt")
        elif simple_op_avg > simple_local_avg + 5:
            print("✅ OpenPipe outperforms local model with simple prompt")
        else:
            print("⚖️ Similar performance between models with simple prompt")

    print("="*80 + "\n")

    # Save results
    output_file = f"evaluation_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    results_data = {
        "timestamp": datetime.now().isoformat(),
        "models": ["openpipe:multimodal-agent-v1", "local-qwen3-weave:0.6b"],
        "simple_openpipe_results": simple_openpipe_results,
        "complex_openpipe_results": complex_openpipe_results,
        "simple_local_results": simple_local_results,
        "complex_local_results": complex_local_results
    }

    with open(output_file, 'w') as f:
        json.dump(results_data, f, indent=2, default=str)

    print(f"📁 Results saved to: {output_file}")
    print(f"🔗 View in Weave: https://wandb.ai/richpaul1-stealth/rl-demo")

    # Create leaderboard
    evaluations = [simple_openpipe_evaluation, complex_openpipe_evaluation,
                   simple_local_evaluation, complex_local_evaluation]
    try:
        print("\n🏆 Creating Prompt_Comparison Leaderboard...")

        # Create leaderboard
        leaderboard_uri = create_prompts_leaderboard(evaluations, "rl-demo")
        print_leaderboard_info(leaderboard_uri, "Prompt_Comparison")

    except Exception as e:
        print(f"⚠️ Failed to create leaderboard: {e}")
        print("Evaluation results are still available in Weave")

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

