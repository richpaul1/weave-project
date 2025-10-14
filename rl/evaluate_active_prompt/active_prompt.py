#!/usr/bin/env python3
"""
Single Prompt Evaluation Across Multiple Models
Evaluates how different models respond to the same prompt that generates the most images.
"""

import os
import sys
import json
import asyncio
import httpx
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

import weave
from openai import OpenAI
from dotenv import load_dotenv
from leaderboard import create_active_prompt_leaderboard, print_leaderboard_info

# Load environment variables
load_dotenv('../../.env.local')
OPEN_API_KEY = os.getenv('OPEN_API_KEY')
OPEN_PIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')
WANDB_API_KEY = os.getenv('WANDB_API_KEY')
WANDB_PROJECT = os.getenv('WANDB_PROJECT')
WANDB_ENTITY = os.getenv('WANDB_ENTITY')



# The best prompt that generated the most images
BEST_PROMPT = """You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework.

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

# Manual OpenPipe client to avoid Weave instrumentation issues
class ManualOpenPipeClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://app.openpipe.ai/api/v1"
        
    def chat_completion(self, model: str, messages: list, temperature: float, max_tokens: int) -> dict:
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
            with httpx.Client(timeout=120.0) as client:  # Increased timeout
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )

                # Check for HTTP errors
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

# Initialize clients
openai_client = OpenAI(api_key=OPEN_API_KEY)
openpipe_client = ManualOpenPipeClient(OPEN_PIPE_API_KEY)

# Model implementations
class BaseModel(weave.Model):
    """Base model class with common functionality"""
    
    def extract_images(self, text: str) -> List[Dict[str, str]]:
        """Extract markdown images from text"""
        pattern = r'!\[([^\]]*)\]\(([^\)]+)\)'
        matches = re.findall(pattern, text)
        return [{"alt": alt, "url": url} for alt, url in matches]
    
    def analyze_response(self, response: str) -> Dict[str, Any]:
        """Analyze response for various metrics"""
        images = self.extract_images(response)
        words = len(response.split())
        chars = len(response)
        
        # Count Weave-specific keywords
        weave_keywords = [
            'weave', '@weave.op', 'weave.Model', 'weave.Evaluation', 'weave.Dataset',
            'observability', 'tracing', 'wandb', 'weights & biases'
        ]
        found_keywords = [kw for kw in weave_keywords if kw.lower() in response.lower()]
        
        # Count code blocks
        code_blocks = response.count('```') // 2
        inline_code = (response.count('`') - (code_blocks * 6)) // 2
        
        return {
            "word_count": words,
            "char_count": chars,
            "image_count": len(images),
            "images": images,
            "has_images": len(images) > 0,
            "weave_keywords": found_keywords,
            "keyword_count": len(found_keywords),
            "code_blocks": code_blocks,
            "inline_code": inline_code,
            "has_code": code_blocks > 0 or inline_code > 0
        }

class OllamaBaselineModel(BaseModel):
    """Baseline qwen3:0.6b model"""

    model_name: str = "qwen3:0.6b"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3:0.6b"
    temperature: float = 0.3

    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query baseline Ollama model"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": self.temperature}
                    }
                )
                response.raise_for_status()
                result = response.json()
                response_text = result.get("response", "")

        except Exception as e:
            response_text = f"Error: {str(e)}"

        analysis = self.analyze_response(response_text)

        return {
            "response": response_text,
            "model": self.model,
            "prompt": prompt,
            "error": "Error:" in response_text,
            **analysis
        }

class WeaveTrainedModel(BaseModel):
    """Weave-trained qwen3-weave:0.6b model"""

    model_name: str = "qwen3-weave:0.6b"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3-weave:0.6b"
    temperature: float = 0.3

    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query Weave-trained model"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": self.temperature}
                    }
                )
                response.raise_for_status()
                result = response.json()
                response_text = result.get("response", "")

        except Exception as e:
            response_text = f"Error: {str(e)}"

        analysis = self.analyze_response(response_text)

        return {
            "response": response_text,
            "model": self.model,
            "prompt": prompt,
            "error": "Error:" in response_text,
            **analysis
        }

class OpenAIModel(BaseModel):
    """OpenAI GPT-3 model"""
    
    model_name: str = "openai_gpt3.5"
    model: str = "gpt-3.5-turbo"
    temperature: float = 0.3

    
    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query OpenAI model"""
        try:
            response = openai_client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.temperature,
                max_tokens=1000
            )
            response_text = response.choices[0].message.content

        except Exception as e:
            response_text = f"Error: {str(e)}"

        analysis = self.analyze_response(response_text)

        return {
            "response": response_text,
            "model": self.model,
            "prompt": prompt,
            "error": "Error:" in response_text,
            **analysis
        }

def safe_openpipe_call(prompt: str) -> Dict[str, Any]:
    """Safe OpenPipe call with manual HTTP client"""
    try:
        messages = [{"role": "user", "content": prompt}]
        result = openpipe_client.chat_completion(
            model="openpipe:multimodal-agent-v1",
            messages=messages,
            temperature=0.3,
            max_tokens=1000
        )

        print(f"🔍 OpenPipe raw result: {result}")

        # Check if there's an error in the result
        if "error" in result and result["error"]:
            return {
                "response": f"OpenPipe API Error: {result['error']}",
                "usage": {},
                "error": result["error"]
            }

        if "choices" in result and len(result["choices"]) > 0:
            response_text = result["choices"][0]["message"]["content"]
        else:
            error_msg = f"Unexpected response format: {result}"
            print(f"❌ OpenPipe error: {error_msg}")
            return {
                "response": error_msg,
                "usage": {},
                "error": error_msg
            }

        # Extract usage info safely
        usage_info = {}
        if "usage" in result:
            usage = result["usage"]
            if isinstance(usage, dict):
                usage_info = {
                    "input_tokens": usage.get("prompt_tokens", 0),
                    "output_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0)
                }

        print(f"✅ OpenPipe success: {len(response_text)} chars, usage: {usage_info}")

        return {
            "response": response_text,
            "usage": usage_info,
            "error": None
        }

    except Exception as e:
        error_msg = f"Exception in OpenPipe call: {str(e)}"
        print(f"❌ OpenPipe exception: {error_msg}")
        return {
            "response": error_msg,
            "usage": {},
            "error": str(e)
        }

class OpenPipeModel(BaseModel):
    """OpenPipe custom model"""

    model_name: str = "openpipe:multimodal-agent-v1"
    model: str = "openpipe:multimodal-agent-v1"

    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query OpenPipe model"""
        result = safe_openpipe_call(prompt)
        response_text = result["response"]

        analysis = self.analyze_response(response_text)

        return {
            "response": response_text,
            "model": self.model,
            "prompt": prompt,
            "error": result["error"] is not None,
            "usage": result["usage"],
            **analysis
        }

def print_comparison_table(results: List[Dict[str, Any]]):
    """Print a comparison table of results"""
    print("\n" + "="*100)
    print("📊 SINGLE PROMPT EVALUATION RESULTS")
    print("="*100)
    print(f"Prompt: {BEST_PROMPT}")
    print("="*100)
    
    # Header
    print(f"{'Model':<25} {'Images':<8} {'Words':<8} {'Keywords':<10} {'Code':<6} {'Error':<6}")
    print("-" * 100)
    
    # Results
    for result in results:
        model_name = result['model_name']
        image_count = result.get('image_count', 0)
        word_count = result.get('word_count', 0)
        keyword_count = result.get('keyword_count', 0)
        code_blocks = result.get('code_blocks', 0)
        has_error = "Yes" if result.get('error', False) else "No"
        
        print(f"{model_name:<25} {image_count:<8} {word_count:<8} {keyword_count:<10} {code_blocks:<6} {has_error:<6}")

async def main():
    """Main evaluation function"""

    # Create descriptive evaluation name
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    evaluation_name = f"{timestamp}-single-prompt"

    print(f"🏷️ Evaluation Name: {evaluation_name}")
    print("🔍 Starting Single Prompt Evaluation")
    print("="*60)

    # Initialize Weave
    client = weave.init(f"{WANDB_ENTITY}/{WANDB_PROJECT}",settings={"client_parallelism": 100})
    
    # Create models
    print("\n📝 Creating models...")
    models = [
        ("qwen3:0.6b", OllamaBaselineModel()),
        ("qwen3-weave:0.6b", WeaveTrainedModel()),
        ("gpt-4", OpenAIModel()),
        ("openpipe:multimodal-agent-v1", OpenPipeModel())
    ]
    print("✅ All models created successfully")
    
    # Create evaluation dataset
    dataset = [{"prompt": BEST_PROMPT}]

    # Create evaluation function
    @weave.op()
    def evaluate_model_response(model_output: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate model response quality"""
        # Capture the actual response text for visibility in Weave
        response_text = model_output.get("response", "")

        # Throw exception if response is blank
        if not response_text or response_text.strip() == "":
            raise ValueError(f"Model response is blank or empty. Model output: {model_output}")

        return {
            "response_text": response_text,  # Include actual response text
            "response_preview": response_text[:200] + "..." if len(response_text) > 200 else response_text,
            "response_length": len(response_text),  # Aggregatable metric
            "response_has_content": len(response_text.strip()) > 0,  # Boolean metric
            "image_count": model_output.get("image_count", 0),
            "word_count": model_output.get("word_count", 0),
            "keyword_count": model_output.get("keyword_count", 0),
            "code_blocks": model_output.get("code_blocks", 0),
            "error": model_output.get("error", False),
            "has_images": model_output.get("image_count", 0) > 0,
            "has_keywords": model_output.get("keyword_count", 0) > 0,
            "response_quality": "good" if not model_output.get("error", False) and model_output.get("word_count", 0) > 50 else "poor"
        }

    # Run evaluation
    results = []
    evaluations = []  # Store evaluation objects for leaderboard

    for model_name, model in models:
        print(f"\n🧪 Testing {model_name}...")
        print("-" * 60)

        try:
            result = await model.predict(BEST_PROMPT)
            result['model_name'] = model_name
            results.append(result)

            # Print immediate results
            print(f"✅ Success")
            print(f"   Images: {result.get('image_count', 0)}")
            print(f"   Words: {result.get('word_count', 0)}")
            print(f"   Keywords: {result.get('keyword_count', 0)}")
            print(f"   Code blocks: {result.get('code_blocks', 0)}")

            # Run Weave evaluation for this model
            model_eval_name = f"{evaluation_name}-{model_name.lower().replace(':', '_').replace('-', '_')}"
            evaluation = weave.Evaluation(
                dataset=dataset,
                scorers=[evaluate_model_response],
                evaluation_name=model_eval_name
            )

            # Run the evaluation
            await evaluation.evaluate(model)
            evaluations.append(evaluation)  # Store for leaderboard
            client.flush()

        except Exception as e:
            print(f"❌ Failed: {str(e)}")
            results.append({
                'model_name': model_name,
                'error': True,
                'response': f"Error: {str(e)}",
                'image_count': 0,
                'word_count': 0,
                'keyword_count': 0,
                'code_blocks': 0
            })
    
    # Print comparison table
    print_comparison_table(results)
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"single_prompt_results_{timestamp}.json"
    
    output_data = {
        "evaluation_name": evaluation_name,
        "timestamp": datetime.now().isoformat(),
        "prompt": BEST_PROMPT,
        "models_tested": [r['model_name'] for r in results],
        "results": results,
        "summary": {
            "total_models": len(results),
            "successful_models": sum(1 for r in results if not r.get('error', False)),
            "total_images": sum(r.get('image_count', 0) for r in results),
            "avg_words": sum(r.get('word_count', 0) for r in results) / len(results),
            "total_keywords": sum(r.get('keyword_count', 0) for r in results)
        }
    }
    
    with open(filename, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n📁 Results saved to: {filename}")
    print(f"🔗 View in Weave: https://wandb.ai/{WANDB_ENTITY}/{WANDB_PROJECT}/weave")

    # Create leaderboard if we have evaluations
    if evaluations:
        try:
            print("\n🏆 Creating Active_Prompt Leaderboard...")

            # Create leaderboard
            leaderboard_uri = create_active_prompt_leaderboard(evaluations, "rl-demo")
            print_leaderboard_info(leaderboard_uri, "Active_Prompt")

        except Exception as e:
            print(f"⚠️ Failed to create leaderboard: {e}")
            print("Evaluation results are still available in Weave")

if __name__ == "__main__":
    asyncio.run(main())
