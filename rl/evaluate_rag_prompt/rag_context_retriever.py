#!/usr/bin/env python3
"""
RAG Context Retriever
Retrieves context from the agent's RAG system for evaluation purposes.
"""

import os
import sys
import json
import httpx
from typing import Dict, Any, Optional
from pathlib import Path

# Add the project root to Python path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.append(str(project_root))

class RAGContextRetriever:
    """
    Retrieves context from the agent's RAG system using the new API endpoint.
    This ensures we use the exact same context retrieval logic as the production agent.
    """
    
    def __init__(self, agent_base_url: str = "http://localhost:8082"):
        """
        Initialize the RAG context retriever.
        
        Args:
            agent_base_url: Base URL of the agent API
        """
        self.agent_base_url = agent_base_url.rstrip('/')
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def retrieve_context_for_query(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        """
        Retrieve context for a query using the agent's RAG system.
        
        Args:
            query: The query to retrieve context for
            top_k: Number of top chunks to retrieve
            
        Returns:
            Dictionary containing context data and formatted prompt
        """
        try:
            print(f"🔍 RAG Context Retriever: Retrieving context for query")
            print(f"   Query: '{query}'")
            print(f"   Agent URL: {self.agent_base_url}")
            print(f"   Top K: {top_k}")
            
            # Call the agent's context retrieval endpoint
            response = await self.client.post(
                f"{self.agent_base_url}/api/chat/retrieve-context",
                json={
                    "query": query,
                    "top_k": top_k,
                    "session_id": "evaluation_session"
                },
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                print(f"❌ RAG Context Retriever: API call failed with status {response.status_code}")
                print(f"   Response: {response.text}")
                return {
                    "success": False,
                    "error": f"API call failed: {response.status_code} - {response.text}",
                    "context_data": None,
                    "formatted_prompt": None
                }
            
            result = response.json()
            
            if not result.get("success", False):
                print(f"❌ RAG Context Retriever: Context retrieval failed")
                print(f"   Error: {result}")
                return {
                    "success": False,
                    "error": "Context retrieval failed",
                    "context_data": None,
                    "formatted_prompt": None
                }
            
            context_data = result["context_data"]
            formatted_prompt = result["formatted_prompt"]
            
            print(f"✅ RAG Context Retriever: Context retrieved successfully")
            print(f"   Chunks: {context_data['num_chunks']}")
            print(f"   Sources: {context_data['num_sources']}")
            print(f"   Context length: {len(context_data['context_text'])} chars")
            print(f"   Prompt length: {len(formatted_prompt)} chars")
            
            return {
                "success": True,
                "query": query,
                "context_data": context_data,
                "formatted_prompt": formatted_prompt,
                "metadata": result.get("metadata", {}),
                "prompt_template": result.get("prompt_template", "unknown")
            }
            
        except httpx.TimeoutException:
            print(f"❌ RAG Context Retriever: Request timed out")
            return {
                "success": False,
                "error": "Request timed out",
                "context_data": None,
                "formatted_prompt": None
            }
        except Exception as e:
            print(f"❌ RAG Context Retriever: Unexpected error: {str(e)}")
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "context_data": None,
                "formatted_prompt": None
            }
    
    async def check_agent_health(self) -> bool:
        """
        Check if the agent is running and accessible.

        Returns:
            True if agent is healthy, False otherwise
        """
        try:
            print(f"🏥 RAG Context Retriever: Checking agent health...")
            # Try the docs endpoint instead of health
            response = await self.client.get(f"{self.agent_base_url}/docs")

            if response.status_code == 200:
                print(f"✅ RAG Context Retriever: Agent is healthy")
                return True
            else:
                print(f"❌ RAG Context Retriever: Agent health check failed: {response.status_code}")
                return False

        except Exception as e:
            print(f"❌ RAG Context Retriever: Agent health check error: {str(e)}")
            return False
    
    def extract_context_info(self, context_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract key information from context result for analysis.
        
        Args:
            context_result: Result from retrieve_context_for_query
            
        Returns:
            Dictionary with extracted context information
        """
        if not context_result.get("success", False):
            return {
                "success": False,
                "error": context_result.get("error", "Unknown error"),
                "num_chunks": 0,
                "num_sources": 0,
                "context_length": 0,
                "prompt_length": 0,
                "sources": [],
                "chunk_scores": []
            }
        
        context_data = context_result["context_data"]
        chunks = context_data.get("chunks", [])
        sources = context_data.get("sources", [])
        
        return {
            "success": True,
            "num_chunks": len(chunks),
            "num_sources": len(sources),
            "context_length": len(context_data.get("context_text", "")),
            "prompt_length": len(context_result.get("formatted_prompt", "")),
            "sources": [
                {
                    "title": source.get("title", "Unknown"),
                    "url": source.get("url", "Unknown"),
                    "domain": source.get("domain", "Unknown")
                }
                for source in sources
            ],
            "chunk_scores": [chunk.get("score", 0) for chunk in chunks],
            "avg_chunk_score": sum(chunk.get("score", 0) for chunk in chunks) / len(chunks) if chunks else 0,
            "min_chunk_score": min(chunk.get("score", 0) for chunk in chunks) if chunks else 0,
            "max_chunk_score": max(chunk.get("score", 0) for chunk in chunks) if chunks else 0,
            "prompt_template": context_result.get("prompt_template", "unknown"),
            "metadata": context_result.get("metadata", {})
        }
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

async def test_context_retrieval():
    """Test the context retrieval system."""
    retriever = RAGContextRetriever()
    
    try:
        # Check agent health first
        if not await retriever.check_agent_health():
            print("❌ Agent is not running. Please start the agent first.")
            return
        
        # Test with the same query we used in the best prompt evaluation
        test_query = "How do I trace my LLM calls with Weave? Please include relevant images and examples."
        
        print(f"\n🧪 Testing context retrieval with query:")
        print(f"'{test_query}'")
        
        result = await retriever.retrieve_context_for_query(test_query)
        
        if result["success"]:
            info = retriever.extract_context_info(result)
            
            print(f"\n📊 Context Retrieval Results:")
            print(f"   Chunks: {info['num_chunks']}")
            print(f"   Sources: {info['num_sources']}")
            print(f"   Context length: {info['context_length']} chars")
            print(f"   Prompt length: {info['prompt_length']} chars")
            print(f"   Avg chunk score: {info['avg_chunk_score']:.3f}")
            print(f"   Score range: {info['min_chunk_score']:.3f} - {info['max_chunk_score']:.3f}")
            print(f"   Template: {info['prompt_template']}")
            
            print(f"\n📚 Sources:")
            for i, source in enumerate(info['sources'], 1):
                print(f"   {i}. {source['title'][:50]}... ({source['domain']})")
            
            print(f"\n📝 Formatted Prompt Preview:")
            prompt = result["formatted_prompt"]
            if len(prompt) > 500:
                print(f"{prompt[:500]}...")
                print(f"[Truncated - full prompt is {len(prompt)} characters]")
            else:
                print(prompt)
        else:
            print(f"❌ Context retrieval failed: {result['error']}")
    
    finally:
        await retriever.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_context_retrieval())
