#!/usr/bin/env python3
"""
Model Comparison Evaluation: Local vs OpenAI vs Custom OpenPipe Model
Compares the performance of three different models on the same prompts used for training.
"""

import os
import json
import weave
from weave import Evaluation, Model
from datetime import datetime
from dotenv import load_dotenv
from typing import Dict, Any, List
import asyncio
import re
import httpx
from leaderboard import create_models_leaderboard, print_leaderboard_info

# Load environment variables
load_dotenv('../../.env.local')
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')
OPENAI_API_KEY = os.getenv('OPEN_API_KEY')
WANDB_API_KEY = os.getenv('WANDB_API_KEY')
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'qwen3:0.6b')

# Initialize Weave FIRST
weave.init('rl-demo')

# Import and initialize OpenAI AFTER weave.init() for proper auto-instrumentation
from openai import OpenAI
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Manual OpenPipe API client to avoid Weave instrumentation issues (same fix as prompt_comparison_eval.py)
import httpx
import json

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
            with httpx.Client(timeout=120.0) as client:  # Increased timeout for OpenPipe
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )

                if response.status_code != 200:
                    return {
                        "error": f"HTTP {response.status_code}: {response.text}",
                        "choices": [],
                        "usage": {}
                    }

                try:
                    return response.json()
                except Exception as e:
                    return {
                        "error": f"JSON decode error: {str(e)}",
                        "choices": [],
                        "usage": {}
                    }
        except httpx.TimeoutException:
            return {
                "error": "Request timed out after 120 seconds",
                "choices": [],
                "usage": {}
            }
        except Exception as e:
            return {
                "error": f"Network error: {str(e)}",
                "choices": [],
                "usage": {}
            }

# Initialize manual OpenPipe client
openpipe_client = ManualOpenPipeClient(OPENPIPE_API_KEY)
OPENPIPE_AVAILABLE = True

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

# Test queries from training data - representative samples
TEST_QUERIES = [
    {
        "id": "q1",
        "prompt": "How do I trace my LLM calls with Weave?",
        "category": "tracing",
        "expected_features": ["tracing", "weave", "llm"],
        "context": "User wants to understand Weave tracing functionality"
    },
    {
        "id": "q2", 
        "prompt": "What is a Weave Dataset and how do I create one?",
        "category": "datasets",
        "expected_features": ["dataset", "creation", "weave"],
        "context": "User needs to understand Weave datasets"
    },
    {
        "id": "q3",
        "prompt": "Show me how to use weave.Model to track my models",
        "category": "models",
        "expected_features": ["model", "tracking", "versioning"],
        "context": "User wants to track model versions with Weave"
    },
    {
        "id": "q4",
        "prompt": "Explain Weave evaluation framework and show me an example",
        "category": "evaluation", 
        "expected_features": ["evaluation", "framework", "example"],
        "context": "User needs to understand Weave evaluation capabilities"
    },
    {
        "id": "q5",
        "prompt": "How do I use the evaluation playground in Weave?",
        "category": "playground",
        "expected_features": ["playground", "evaluation", "ui"],
        "context": "User wants to use Weave's evaluation playground"
    },
    {
        "id": "q6",
        "prompt": "What are Weave operations and how do I create them?",
        "category": "operations",
        "expected_features": ["operations", "weave.op", "decorator"],
        "context": "User needs to understand Weave operations"
    }
]

# System prompt used for training
SYSTEM_PROMPT = """You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"""


class OllamaModel(Model):
    """Model using local Ollama (baseline)"""

    model_name: str = "ollama_qwen3_baseline"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3:0.6b"
    temperature: float = 0.3
    
    @weave.op()
    async def predict(self, prompt: str, category: str = None, **kwargs) -> Dict[str, Any]:
        """Query the local Ollama model"""
        try:
            # Use environment variables at runtime
            base_url = OLLAMA_BASE_URL
            model = OLLAMA_MODEL

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": f"System: {SYSTEM_PROMPT}\n\nUser: {prompt}",
                        "stream": False,
                        "options": {
                            "temperature": self.temperature,
                            "num_predict": 500
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
            "model": f"ollama:{model}",
            "prompt": prompt,
            "category": category,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "temperature": self.temperature,
            "error": "Error:" in response_text
        }

class WeaveTrainedModel(Model):
    """Model using our Weave-trained qwen3-weave:0.6b"""

    model_name: str = "qwen3_weave_trained"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3-weave:0.6b"
    temperature: float = 0.3

    @weave.op()
    async def predict(self, prompt: str, category: str = None, **kwargs) -> Dict[str, Any]:
        """Query Weave-trained local model"""
        try:
            response = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": self.temperature
                    }
                },
                timeout=60.0
            )
            response.raise_for_status()
            result = response.json()
            response_text = result.get("response", "")

        except Exception as e:
            response_text = f"Error: {str(e)}"

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response_text)

        return {
            "response": response_text,
            "model": self.model,
            "prompt": prompt,
            "category": category,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "temperature": self.temperature,
            "error": "Error:" in response_text
        }


class OpenAIModel(Model):
    """Model using OpenAI API"""

    model_name: str = "openai_gpt3.5"
    model: str = "gpt-3.5-turbo"
    temperature: float = 0.3

    @weave.op()
    def predict(self, prompt: str, category: str = None, **kwargs) -> Dict[str, Any]:
        """Query OpenAI model"""
        try:
            print(f"🤖 OpenAI: Making API call with model {self.model}")

            # Simple, direct OpenAI call (not async)
            response = openai_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=self.temperature,
                max_tokens=500
            )

            # Better error handling for response extraction
            if response.choices and len(response.choices) > 0:
                message = response.choices[0].message
                response_text = message.content if message.content else ""
                print(f"✅ OpenAI: Got response ({len(response_text)} chars)")
                print(f"🐛 DEBUG: Response preview: {response_text[:200]}...")
                print(f"🐛 DEBUG: Full response:\n{response_text}\n" + "="*50)

                # Log the full response object for debugging
                print(f"🐛 DEBUG: Response object type: {type(response)}")
                print(f"🐛 DEBUG: Has choices: {hasattr(response, 'choices')}")
                print(f"🐛 DEBUG: Choices length: {len(response.choices) if hasattr(response, 'choices') else 'N/A'}")
            else:
                response_text = "Error: No response choices returned"
                print("❌ OpenAI: No response choices returned")
                print(f"🐛 DEBUG: Full response: {response}")

        except Exception as e:
            response_text = f"Error: {str(e)}"
            print(f"❌ OpenAI: API call failed: {str(e)}")
        
        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response_text)
        


        print(f"🐛 DEBUG: Response text ************: {response_text}")
        return {
            "response": response_text,
            "model": f"openai:{self.model}",
            "prompt": prompt,
            "category": category,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "temperature": self.temperature,
            "error": "Error:" in response_text
        }


class OpenPipeModel(Model):
    """Model using custom OpenPipe trained model"""

    model_name: str = "openpipe_multimodal"
    model: str = "openpipe:multimodal-agent-v1"
    temperature: float = 0.3

    @weave.op()
    async def predict(self, prompt: str, category: str = None, **kwargs) -> Dict[str, Any]:
        """Query custom OpenPipe model"""
        # Use the safe wrapper to avoid token usage conflicts
        result = safe_openpipe_call(
            model="openpipe:multimodal-agent-v1",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=self.temperature,
            max_tokens=500
        )

        response_text = result["response"]

        # Extract metrics
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response_text)

        return {
            "response": response_text,
            "model": "openpipe:multimodal-agent-v1",
            "prompt": prompt,
            "category": category,
            "has_image": len(images) > 0,
            "image_count": len(images),
            "images": [{"alt": alt, "url": url} for alt, url in images],
            "word_count": len(response_text.split()),
            "char_count": len(response_text),
            "temperature": self.temperature,
            "error": "Error:" in response_text
        }


# Scorers for evaluation
@weave.op()
def temperature_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Score based on temperature setting"""
    temperature = output.get("temperature", 0.0)

    return {
        "temperature": temperature,
        "temperature_category": "low" if temperature < 0.5 else "medium" if temperature < 1.0 else "high",
        "is_deterministic": temperature == 0.0,
        "is_creative": temperature >= 0.7
    }

@weave.op()
def response_quality_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Score response quality based on length and content"""
    response = output.get("response", "")
    word_count = output.get("word_count", 0)
    has_error = output.get("error", False)
    
    if has_error:
        score = 0.0
        quality = "error"
    elif word_count < 50:
        score = 0.3
        quality = "too_short"
    elif 50 <= word_count <= 300:
        score = 1.0
        quality = "good"
    else:
        score = 0.7
        quality = "too_long"
    
    return {
        "score": score,
        "word_count": word_count,
        "quality": quality,
        "has_error": has_error
    }


@weave.op()
def weave_relevance_scorer(prompt: str, output: Dict[str, Any]) -> Dict[str, Any]:
    """Score how relevant the response is to Weave"""
    response = output.get("response", "").lower()
    
    weave_keywords = ["weave", "wandb", "trace", "model", "dataset", "evaluation", "op"]
    keyword_count = sum(1 for keyword in weave_keywords if keyword in response)
    
    if keyword_count >= 3:
        score = 1.0
        relevance = "high"
    elif keyword_count >= 1:
        score = 0.7
        relevance = "medium"
    else:
        score = 0.3
        relevance = "low"
    
    return {
        "score": score,
        "keyword_count": keyword_count,
        "relevance": relevance,
        "keywords_found": [kw for kw in weave_keywords if kw in response]
    }


@weave.op()
def image_inclusion_scorer(output: Dict[str, Any]) -> Dict[str, Any]:
    """Score based on image inclusion (bonus points for multimodal responses)"""
    has_image = output.get("has_image", False)
    image_count = output.get("image_count", 0)

    if has_image:
        score = 1.0
        bonus = min(image_count * 0.1, 0.5)  # Bonus for multiple images
        final_score = min(score + bonus, 1.0)
    else:
        final_score = 0.5  # Not penalized heavily, but bonus for images

    return {
        "score": final_score,
        "has_image": has_image,
        "image_count": image_count,
        "bonus": bonus if has_image else 0.0
    }


async def run_model_comparison():
    """Run the full model comparison evaluation"""
    print("🔍 Starting Model Comparison Evaluation")
    print("="*80)
    print(f"Models to compare:")
    print(f"  1. Local Ollama: {OLLAMA_MODEL}")
    print(f"  2. OpenAI: gpt-3.5-turbo")
    print(f"  3. Custom OpenPipe: openpipe:multimodal-agent-v1")
    print(f"Test queries: {len(TEST_QUERIES)}")
    print("="*80)

    # Create models
    print("\n📝 Creating models...")
    ollama_model = OllamaModel(name="ollama_baseline_model")
    weave_model = WeaveTrainedModel(name="weave_trained_model")
    openai_model = OpenAIModel(name="openai_model")
    openpipe_model = OpenPipeModel(name="openpipe_model")

    models = [
        ("local-qwen3:0.6b", ollama_model),
        ("local-qwen3-weave:0.6b", weave_model),
        ("gpt-3.5-turbo", openai_model),
        ("openpipe:multimodal-agent-v1", openpipe_model)
    ]

    print("✅ All models created successfully")

    results = {}
    evaluations = []  # Store evaluation objects for leaderboard

    # Run evaluation for each model
    for model_name, model in models:
        print(f"\n🧪 Testing {model_name}...")
        print("-"*60)

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
        evaluation_name = f"{timestamp}-models-{model_name.lower()}"
        evaluation = Evaluation(
            dataset=TEST_QUERIES,
            scorers=[response_quality_scorer, weave_relevance_scorer, image_inclusion_scorer, temperature_scorer],
            evaluation_name=evaluation_name
        )

        try:
            model_results = await evaluation.evaluate(model)
            results[model_name] = model_results
            evaluations.append(evaluation)  # Store for leaderboard
            print(f"✅ {model_name} evaluation completed")
        except Exception as e:
            print(f"❌ {model_name} evaluation failed: {e}")
            results[model_name] = {"error": str(e)}

    # Print comparison summary
    print("\n\n" + "="*80)
    print("📊 MODEL COMPARISON SUMMARY")
    print("="*80)

    print(f"\n{'Model':<20} {'Quality':<12} {'Relevance':<12} {'Images':<12} {'Temp':<8} {'Overall':<12}")
    print("-"*88)

    for model_name in results:
        if "error" in results[model_name]:
            print(f"{model_name:<20} {'ERROR':<12} {'ERROR':<12} {'ERROR':<12} {'ERROR':<8} {'ERROR':<12}")
            continue

        result = results[model_name]

        # Extract average scores
        quality_score = result.get("response_quality_scorer", {}).get("score", {}).get("mean", 0) * 100
        relevance_score = result.get("weave_relevance_scorer", {}).get("score", {}).get("mean", 0) * 100
        image_score = result.get("image_inclusion_scorer", {}).get("score", {}).get("mean", 0) * 100
        temperature = result.get("temperature_scorer", {}).get("temperature", {}).get("mean", 0.0)
        overall_score = (quality_score + relevance_score + image_score) / 3

        print(f"{model_name:<20} {quality_score:>10.1f}% {relevance_score:>10.1f}% {image_score:>10.1f}% {temperature:>6.1f} {overall_score:>10.1f}%")

    # Detailed analysis
    print("\n" + "="*80)
    print("📈 DETAILED ANALYSIS")
    print("="*80)

    for model_name, result in results.items():
        if "error" in result:
            print(f"\n❌ {model_name}: {result['error']}")
            continue

        print(f"\n🔍 {model_name}:")

        # Quality analysis
        quality_data = result.get("response_quality_scorer", {})
        if "quality" in quality_data:
            quality_counts = quality_data["quality"]
            print(f"  Quality Distribution:")
            for quality, count in quality_counts.items():
                print(f"    {quality}: {count}")

        # Relevance analysis
        relevance_data = result.get("weave_relevance_scorer", {})
        if "relevance" in relevance_data:
            relevance_counts = relevance_data["relevance"]
            print(f"  Relevance Distribution:")
            for relevance, count in relevance_counts.items():
                print(f"    {relevance}: {count}")

        # Image analysis
        image_data = result.get("image_inclusion_scorer", {})
        if "has_image" in image_data:
            image_counts = image_data["has_image"]
            print(f"  Image Inclusion:")
            print(f"    With images: {image_counts.get('true_count', 0)}")
            print(f"    Without images: {image_counts.get('false_count', 0)}")

    # Save results
    output_file = f"model_comparison_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    results_data = {
        "timestamp": datetime.now().isoformat(),
        "models_tested": list(results.keys()),
        "test_queries": TEST_QUERIES,
        "results": results
    }

    with open(output_file, 'w') as f:
        json.dump(results_data, f, indent=2, default=str)

    print(f"\n📁 Results saved to: {output_file}")
    print(f"🔗 View in Weave: https://wandb.ai/richpaul1-stealth/rl-demo")

    # Create leaderboard if we have evaluations
    if evaluations:
        try:
            print("\n🏆 Creating Models Leaderboard...")

            # Create leaderboard
            leaderboard_uri = create_models_leaderboard(evaluations, "rl-demo")
            print_leaderboard_info(leaderboard_uri, "Models")

        except Exception as e:
            print(f"⚠️ Failed to create leaderboard: {e}")
            print("Evaluation results are still available in Weave")

    return results_data


if __name__ == "__main__":
    print("🐛 DEBUG: Starting model_comparison_eval.py")
    print(f"🐛 DEBUG: Weave version: {weave.__version__}")

    # Check environment variables
    missing_vars = []
    if not OPENPIPE_API_KEY:
        missing_vars.append("OPEN_PIPE_API_KEY")
    if not OPENAI_API_KEY:
        missing_vars.append("OPENAI_API_KEY")
    if not WANDB_API_KEY:
        missing_vars.append("WANDB_API_KEY")

    if missing_vars:
        print(f"❌ Missing environment variables: {', '.join(missing_vars)}")
        print("Please check your .env.local file")
        exit(1)

    print("✅ All environment variables found")

    # Debug OpenAI client initialization
    print(f"🐛 DEBUG: OpenAI API Key present: {bool(OPENAI_API_KEY)}")
    print(f"🐛 DEBUG: OpenAI API Key length: {len(OPENAI_API_KEY) if OPENAI_API_KEY else 0}")

    # Test OpenAI client
    try:
        test_response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=10
        )
        print("✅ OpenAI client test successful")
    except Exception as e:
        print(f"❌ OpenAI client test failed: {e}")

    # Run evaluation
    try:
        asyncio.run(run_model_comparison())
    except Exception as e:
        print(f"🐛 DEBUG: Main execution failed: {e}")
        import traceback
        traceback.print_exc()
