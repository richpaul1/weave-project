#!/usr/bin/env python3
"""
RAG-Based Prompt Evaluation
Tests the same prompt across multiple models using real RAG context from the agent.
"""

import os
import sys
import json
import asyncio
import re
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

# Add the project root to Python path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

import weave
import httpx
from openai import OpenAI

from rag_context_retriever import RAGContextRetriever

# Load environment variables
from dotenv import load_dotenv
load_dotenv(project_root / ".env.local")

# Test prompt - same as our best performing prompt
TEST_QUERY = "How do I trace my LLM calls with Weave? Please include relevant images and examples."

class BaseRAGModel(weave.Model):
    """Base model class for RAG evaluation with context"""
    
    def extract_images(self, text: str) -> List[Dict[str, str]]:
        """Extract markdown images from text"""
        pattern = r'!\[([^\]]*)\]\(([^\)]+)\)'
        matches = re.findall(pattern, text)
        return [{"alt": alt, "url": url} for alt, url in matches]
    
    def count_weave_keywords(self, text: str) -> tuple[int, List[str]]:
        """Count Weave-specific keywords in text"""
        keywords = [
            "weave", "@weave.op", "tracing", "trace", "wandb", 
            "evaluation", "dataset", "model", "op", "decorator"
        ]
        found_keywords = []
        text_lower = text.lower()
        
        for keyword in keywords:
            if keyword.lower() in text_lower:
                found_keywords.append(keyword)
        
        return len(found_keywords), found_keywords
    
    def count_code_blocks(self, text: str) -> tuple[int, int]:
        """Count code blocks and inline code"""
        code_blocks = len(re.findall(r'```[\s\S]*?```', text))
        inline_code = len(re.findall(r'`[^`\n]+`', text))
        return code_blocks, inline_code
    
    def analyze_response(self, response: str) -> Dict[str, Any]:
        """Analyze response for various metrics"""
        images = self.extract_images(response)
        keyword_count, keywords = self.count_weave_keywords(response)
        code_blocks, inline_code = self.count_code_blocks(response)
        
        return {
            "response": response,
            "word_count": len(response.split()),
            "char_count": len(response),
            "image_count": len(images),
            "images": images,
            "keyword_count": keyword_count,
            "weave_keywords": keywords,
            "code_blocks": code_blocks,
            "inline_code": inline_code,
            "error": False
        }

class Qwen3BaselineModel(BaseRAGModel):
    """Qwen3 baseline model for RAG evaluation"""

    model_name: str = "qwen3:0.6b"

    @weave.op(name="qwen3_0_6b")
    async def predict(self, rag_prompt: str) -> Dict[str, Any]:
        """Generate response using Qwen3 baseline model with RAG context"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": self.model_name,
                        "prompt": rag_prompt,
                        "stream": False
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    response_text = result.get("response", "")
                    return self.analyze_response(response_text)
                else:
                    return {
                        "response": f"Error: HTTP {response.status_code}",
                        "error": True,
                        **self.analyze_response("")
                    }
        except Exception as e:
            return {
                "response": f"Error: {str(e)}",
                "error": True,
                **self.analyze_response("")
            }

class Qwen3WeaveModel(BaseRAGModel):
    """Qwen3 Weave-trained model for RAG evaluation"""

    model_name: str = "qwen3-weave:0.6b"

    @weave.op(name="qwen3_weave_0_6b")
    async def predict(self, rag_prompt: str) -> Dict[str, Any]:
        """Generate response using Qwen3 Weave-trained model with RAG context"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": self.model_name,
                        "prompt": rag_prompt,
                        "stream": False
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    response_text = result.get("response", "")
                    return self.analyze_response(response_text)
                else:
                    return {
                        "response": f"Error: HTTP {response.status_code}",
                        "error": True,
                        **self.analyze_response("")
                    }
        except Exception as e:
            return {
                "response": f"Error: {str(e)}",
                "error": True,
                **self.analyze_response("")
            }

class OpenAIRAGModel(BaseRAGModel):
    """OpenAI model for RAG evaluation"""

    model_name: str = "gpt-4"

    @weave.op(name="gpt_4")
    async def predict(self, rag_prompt: str) -> Dict[str, Any]:
        """Generate response using OpenAI model with RAG context"""
        try:
            client = OpenAI(api_key=os.getenv("OPEN_API_KEY"))
            
            response = client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "user", "content": rag_prompt}
                ],
                max_tokens=1000,
                temperature=0.7
            )
            
            response_text = response.choices[0].message.content
            return self.analyze_response(response_text)
            
        except Exception as e:
            return {
                "response": f"Error: {str(e)}",
                "error": True,
                **self.analyze_response("")
            }

class OpenPipeRAGModel(BaseRAGModel):
    """OpenPipe model for RAG evaluation using manual HTTP client"""

    model_name: str = "openpipe:multimodal-agent-v1"

    @weave.op(name="openpipe_multimodal_agent_v1")
    async def predict(self, rag_prompt: str) -> Dict[str, Any]:
        """Generate response using OpenPipe model with RAG context"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://app.openpipe.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {os.getenv('OPEN_PIPE_API_KEY')}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model_name,
                        "messages": [
                            {"role": "user", "content": rag_prompt}
                        ],
                        "max_tokens": 1000,
                        "temperature": 0.7
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    response_text = result["choices"][0]["message"]["content"]
                    analysis = self.analyze_response(response_text)
                    
                    # Add usage info if available
                    if "usage" in result:
                        analysis["usage"] = result["usage"]
                    
                    return analysis
                else:
                    return {
                        "response": f"Error: HTTP {response.status_code} - {response.text}",
                        "error": True,
                        **self.analyze_response("")
                    }
                    
        except Exception as e:
            return {
                "response": f"Error: {str(e)}",
                "error": True,
                **self.analyze_response("")
            }

async def evaluate_models_with_rag_context():
    """Main evaluation function using RAG context"""

    # Create descriptive evaluation name
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    evaluation_name = f"{timestamp}-prompt-rag"

    print(f"🏷️ Evaluation Name: {evaluation_name}")

    print("🔍 Starting RAG-Based Prompt Evaluation")
    print("=" * 60)
    
    # Check environment variables
    required_vars = ["OPEN_API_KEY", "OPEN_PIPE_API_KEY", "WANDB_API_KEY"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"❌ Missing environment variables: {missing_vars}")
        return
    
    print("✅ All environment variables found")
    
    # Initialize RAG context retriever
    retriever = RAGContextRetriever()
    
    try:
        # Check if agent is running
        if not await retriever.check_agent_health():
            print("❌ Agent is not running. Please start the agent first.")
            print("   Run: cd agent && python -m uvicorn app.main:app --reload")
            return
        
        # Retrieve context for the test query
        print(f"\n🔍 Retrieving RAG context for query:")
        print(f"'{TEST_QUERY}'")
        
        context_result = await retriever.retrieve_context_for_query(TEST_QUERY)
        
        if not context_result["success"]:
            print(f"❌ Failed to retrieve context: {context_result['error']}")
            return
        
        # Extract context information
        context_info = retriever.extract_context_info(context_result)
        rag_prompt = context_result["formatted_prompt"]
        
        print(f"\n📊 RAG Context Retrieved:")
        print(f"   Chunks: {context_info['num_chunks']}")
        print(f"   Sources: {context_info['num_sources']}")
        print(f"   Context length: {context_info['context_length']} chars")
        print(f"   Final prompt length: {context_info['prompt_length']} chars")
        print(f"   Avg chunk score: {context_info['avg_chunk_score']:.3f}")
        
        # Initialize models
        print(f"\n📝 Creating models...")
        models = {
            "qwen3:0.6b": Qwen3BaselineModel(),
            "qwen3-weave:0.6b": Qwen3WeaveModel(),
            "gpt-4": OpenAIRAGModel(),
            "openpipe:multimodal-agent-v1": OpenPipeRAGModel()
        }
        print("✅ All models created successfully")
        
        # Create evaluation dataset
        dataset = [{"rag_prompt": rag_prompt, "query": TEST_QUERY}]

        # Create evaluation function
        @weave.op()
        def evaluate_model_response(model_output: Dict[str, Any]) -> Dict[str, Any]:
            """Evaluate model response quality"""
            return {
                "image_count": model_output.get("image_count", 0),
                "word_count": model_output.get("word_count", 0),
                "keyword_count": model_output.get("keyword_count", 0),
                "code_blocks": model_output.get("code_blocks", 0),
                "error": model_output.get("error", False),
                "has_images": model_output.get("image_count", 0) > 0,
                "has_keywords": model_output.get("keyword_count", 0) > 0,
                "response_quality": "good" if not model_output.get("error", False) and model_output.get("word_count", 0) > 50 else "poor"
            }

        # Test each model and run evaluations
        results = []

        for model_name, model in models.items():
            print(f"\n🧪 Testing {model_name}...")
            print("-" * 60)

            start_time = time.time()
            result = await model.predict(rag_prompt)
            end_time = time.time()

            result["model_name"] = model_name
            result["model"] = getattr(model, 'model_name', model_name)
            result["latency"] = end_time - start_time

            if result["error"]:
                print(f"❌ Error")
                print(f"   Response: {result['response']}")
            else:
                print(f"✅ Success")
                print(f"   Images: {result['image_count']}")
                print(f"   Words: {result['word_count']}")
                print(f"   Keywords: {result['keyword_count']}")
                print(f"   Code blocks: {result['code_blocks']}")
                print(f"   Latency: {result['latency']:.1f}s")

            # Run Weave evaluation for this model
            model_eval_name = f"{evaluation_name}-{model_name.lower().replace(' ', '-').replace('(', '').replace(')', '')}"
            evaluation = weave.Evaluation(
                dataset=dataset,
                scorers=[evaluate_model_response],
                evaluation_name=model_eval_name
            )
            
            # Run the evaluation
            await evaluation.evaluate(model)

            results.append(result)
        
        # Display results table
        print(f"\n" + "=" * 100)
        print("📊 RAG-BASED PROMPT EVALUATION RESULTS")
        print("=" * 100)
        print(f"Original Query: {TEST_QUERY}")
        print(f"RAG Context: {context_info['num_chunks']} chunks, {context_info['num_sources']} sources")
        print("=" * 100)
        print(f"{'Model':<35} {'Images':<8} {'Words':<8} {'Keywords':<10} {'Code':<6} {'Latency':<8} {'Error':<6}")
        print("-" * 100)
        
        for result in results:
            model_name = result["model_name"]
            images = result["image_count"]
            words = result["word_count"]
            keywords = result["keyword_count"]
            code = result["code_blocks"]
            latency = f"{result['latency']:.1f}s"
            error = "Yes" if result["error"] else "No"
            
            print(f"{model_name:<35} {images:<8} {words:<8} {keywords:<10} {code:<6} {latency:<8} {error:<6}")
        
        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"rag_prompt_results_{timestamp}.json"
        
        output_data = {
            "evaluation_name": evaluation_name,
            "timestamp": datetime.now().isoformat(),
            "original_query": TEST_QUERY,
            "rag_context_info": context_info,
            "rag_prompt": rag_prompt,
            "results": results
        }
        
        with open(filename, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\n📁 Results saved to: {filename}")
        print(f"🔗 View in Weave: https://wandb.ai/{os.getenv('WANDB_ENTITY')}/{os.getenv('WANDB_PROJECT')}/weave")
        
    finally:
        await retriever.close()

if __name__ == "__main__":
    # Initialize Weave with original project name
    weave.init(f"{os.getenv('WANDB_ENTITY')}/{os.getenv('WANDB_PROJECT')}")

    # Run evaluation
    asyncio.run(evaluate_models_with_rag_context())
