"""
RAG Service for Query Processing

Orchestrates the full RAG pipeline: retrieval + generation.
All methods are decorated with @weave.op() for observability.
"""
from typing import Dict, Any, AsyncGenerator, Optional
import weave
from app.services.retrieval_service import RetrievalService
from app.services.llm_service import LLMService


class RAGService:
    """
    RAG service that orchestrates retrieval and generation.
    """
    
    # System prompt for RAG
    SYSTEM_PROMPT = """You are a helpful AI assistant that answers questions based on the provided context.

Instructions:
1. Answer the question using ONLY the information from the provided context
2. If the context doesn't contain enough information to answer the question, say so
3. Cite your sources by referencing [Source N] numbers from the context
4. Be concise and accurate
5. Do not make up information that is not in the context"""

    # Context template
    CONTEXT_TEMPLATE = """Context:

{context}

---

Question: {query}

Answer:"""
    
    def __init__(
        self,
        retrieval_service: RetrievalService,
        llm_service: LLMService
    ):
        """
        Initialize RAG service.
        
        Args:
            retrieval_service: Service for retrieving context
            llm_service: Service for generating responses
        """
        self.retrieval_service = retrieval_service
        self.llm_service = llm_service
    
    @weave.op()
    async def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        Process a query through the RAG pipeline.
        
        Args:
            query: The user query
            session_id: Optional session ID for tracking
            top_k: Number of context chunks to retrieve
            
        Returns:
            Dictionary with 'response', 'sources', 'metadata' keys
        """
        # Retrieve relevant context
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )
        
        # Build prompt with context
        prompt = self._build_prompt(query, context_result["context_text"])
        
        # Generate response
        completion = await self.llm_service.generate_completion(
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT
        )
        
        # Post-process response
        response_text = self._post_process_response(completion["text"])
        
        return {
            "response": response_text,
            "sources": context_result["sources"],
            "metadata": {
                "session_id": session_id,
                "num_chunks": context_result["num_chunks"],
                "num_sources": context_result["num_sources"],
                "model": completion["model"],
                "tokens": completion["tokens"],
                "provider": completion["provider"]
            }
        }
    
    @weave.op()
    async def process_query_streaming(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a query through the RAG pipeline with streaming response.
        
        Args:
            query: The user query
            session_id: Optional session ID for tracking
            top_k: Number of context chunks to retrieve
            
        Yields:
            Dictionaries with 'type' and 'data' keys:
            - type='context': Context retrieval complete
            - type='chunk': Response text chunk
            - type='done': Response complete with metadata
        """
        # Retrieve relevant context
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )
        
        # Yield context information
        yield {
            "type": "context",
            "data": {
                "sources": context_result["sources"],
                "num_chunks": context_result["num_chunks"]
            }
        }
        
        # Build prompt with context
        prompt = self._build_prompt(query, context_result["context_text"])
        
        # Stream response
        full_response = ""
        async for chunk in self.llm_service.generate_streaming(
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT
        ):
            full_response += chunk
            yield {
                "type": "chunk",
                "data": {"text": chunk}
            }
        
        # Post-process and yield final response
        response_text = self._post_process_response(full_response)
        
        yield {
            "type": "done",
            "data": {
                "response": response_text,
                "sources": context_result["sources"],
                "metadata": {
                    "session_id": session_id,
                    "num_chunks": context_result["num_chunks"],
                    "num_sources": context_result["num_sources"]
                }
            }
        }
    
    def _build_prompt(self, query: str, context: str) -> str:
        """
        Build the prompt with context and query.
        
        Args:
            query: The user query
            context: The retrieved context
            
        Returns:
            Formatted prompt
        """
        return self.CONTEXT_TEMPLATE.format(
            context=context,
            query=query
        )
    
    def _post_process_response(self, response: str) -> str:
        """
        Post-process the LLM response.
        
        Args:
            response: Raw LLM response
            
        Returns:
            Cleaned response
        """
        # Remove leading/trailing whitespace
        response = response.strip()
        
        # Remove any "Answer:" prefix if present
        if response.lower().startswith("answer:"):
            response = response[7:].strip()
        
        return response

