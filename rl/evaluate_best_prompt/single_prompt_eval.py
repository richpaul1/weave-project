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

# Environment setup
def load_environment():
    """Load environment variables from .env.local"""
    env_path = Path(__file__).parent.parent.parent / ".env.local"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

def check_environment():
    """Check if all required environment variables are set"""
    required_vars = [
        'OPEN_API_KEY', 'OPEN_PIPE_API_KEY', 
        'WANDB_API_KEY', 'WANDB_PROJECT', 'WANDB_ENTITY'
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        print(f"❌ Missing environment variables: {missing}")
        return False
    
    print("✅ All environment variables found")
    return True

# The best prompt that generated the most images
BEST_PROMPT = "How do I trace my LLM calls with Weave? Please include relevant images and examples."

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
        with httpx.Client() as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            )
            return response.json()

# Initialize clients
load_environment()
openai_client = OpenAI(api_key=os.getenv('OPEN_API_KEY'))
openpipe_client = ManualOpenPipeClient(os.getenv('OPEN_PIPE_API_KEY'))

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
    
    model_name: str = "ollama_baseline"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3:0.6b"
    temperature: float = 0.3
    
    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query baseline Ollama model"""
        try:
            response = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": self.temperature}
                },
                timeout=60.0
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
    
    model_name: str = "weave_trained"
    base_url: str = "http://localhost:11434"
    model: str = "qwen3-weave:0.6b"
    temperature: float = 0.3
    
    @weave.op()
    async def predict(self, prompt: str) -> Dict[str, Any]:
        """Query Weave-trained model"""
        try:
            response = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": self.temperature}
                },
                timeout=60.0
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
    """OpenAI GPT-4 model"""
    
    model_name: str = "openai_gpt4"
    model: str = "gpt-4"
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

@weave.op()
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
        
        if "choices" in result and len(result["choices"]) > 0:
            response_text = result["choices"][0]["message"]["content"]
        else:
            response_text = f"Error: Unexpected response format: {result}"
            
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
        
        return {
            "response": response_text,
            "usage": usage_info,
            "error": None
        }
        
    except Exception as e:
        return {
            "response": f"Error: {str(e)}",
            "usage": {},
            "error": str(e)
        }

class OpenPipeModel(BaseModel):
    """OpenPipe custom model"""
    
    model_name: str = "openpipe_custom"
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
    print("🔍 Starting Single Prompt Evaluation")
    print("="*60)
    
    # Check environment
    if not check_environment():
        sys.exit(1)
    
    # Initialize Weave
    weave.init(
        project_name=f"{os.getenv('WANDB_ENTITY')}/{os.getenv('WANDB_PROJECT')}",
        autopatch_settings={"openai": False}  # Disable to avoid token validation issues
    )
    
    # Create models
    print("\n📝 Creating models...")
    models = [
        ("Ollama Baseline (qwen3:0.6b)", OllamaBaselineModel(name="ollama_baseline")),
        ("Weave Trained (qwen3-weave:0.6b)", WeaveTrainedModel(name="weave_trained")),
        ("OpenAI (GPT-4)", OpenAIModel(name="openai_gpt4")),
        ("OpenPipe (Custom)", OpenPipeModel(name="openpipe_custom"))
    ]
    print("✅ All models created successfully")
    
    # Run evaluation
    results = []
    
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
    print(f"🔗 View in Weave: https://wandb.ai/{os.getenv('WANDB_ENTITY')}/{os.getenv('WANDB_PROJECT')}/weave")

if __name__ == "__main__":
    asyncio.run(main())
