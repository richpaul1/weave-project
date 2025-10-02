"""
RAG Service for Query Processing

Orchestrates the full RAG pipeline: retrieval + generation.
All methods are decorated with @weave.op() for observability.
Uses Weave threads to track conversation sessions.
"""
from typing import Dict, Any, AsyncGenerator, Optional
import weave
from app.services.retrieval_service import RetrievalService
from app.services.llm_service import LLMService
from app.utils.weave_utils import add_session_metadata


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
        TURN-LEVEL OPERATION: Process a query through the RAG pipeline.
        This represents one conversation turn in the thread.

        Args:
            query: The user query
            session_id: Optional session ID for tracking (used as thread_id)
            top_k: Number of context chunks to retrieve

        Returns:
            Dictionary with 'response', 'sources', 'metadata' keys
        """
        # Add session metadata to the current operation
        add_session_metadata(
            session_id=session_id,
            operation_type="rag_query",
            query_length=len(query),
            top_k=top_k
        )
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
        TURN-LEVEL OPERATION: Process a query through the RAG pipeline with streaming response.
        This represents one conversation turn in the thread.

        Args:
            query: The user query
            session_id: Optional session ID for tracking (used as thread_id)
            top_k: Number of context chunks to retrieve

        Yields:
            Dictionaries with 'type' and 'data' keys:
            - type='context': Context retrieval complete
            - type='thinking': Thinking process chunk
            - type='response': Response text chunk
            - type='done': Response complete with metadata
        """
        # Add session metadata to the current operation
        add_session_metadata(
            session_id=session_id,
            operation_type="rag_streaming",
            query_length=len(query),
            top_k=top_k
        )
        # Retrieve relevant context using page-based approach (like parent ChatService)
        context_result = await self.retrieval_service.retrieve_page_context(
            query=query,
            top_k=top_k
        )
        
        # Yield context information
        yield {
            "type": "context",
            "data": {
                "sources": context_result["sources"],
                "num_pages": context_result["num_pages"],
                "num_sources": context_result["num_sources"]
            }
        }
        
        # Build prompt with context
        prompt = self._build_prompt(query, context_result["context_text"])
        
        # Stream response with thinking/response separation
        full_response = ""
        thinking_content = ""
        response_content = ""
        in_thinking = False
        thinking_complete = False

        async for chunk in self.llm_service.generate_streaming(
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT
        ):
            full_response += chunk

            # Check for thinking tags
            if "<think>" in full_response and not in_thinking:
                in_thinking = True
                # Send any content before <think> as response
                pre_think = full_response.split("<think>")[0]
                if pre_think.strip():
                    response_content += pre_think
                    yield {
                        "type": "response",
                        "data": {"text": pre_think}
                    }

            if in_thinking and not thinking_complete:
                # We're in thinking mode
                if "</think>" in full_response:
                    # Thinking is complete
                    thinking_complete = True
                    in_thinking = False

                    # Extract thinking content
                    think_start = full_response.find("<think>") + 7
                    think_end = full_response.find("</think>")
                    thinking_content = full_response[think_start:think_end]

                    # Send thinking content
                    yield {
                        "type": "thinking",
                        "data": {"text": thinking_content}
                    }

                    # Send any content after </think> as response
                    post_think = full_response[think_end + 8:]
                    if post_think.strip():
                        response_content += post_think
                        yield {
                            "type": "response",
                            "data": {"text": post_think}
                        }
                else:
                    # Still accumulating thinking content, don't send chunks yet
                    continue
            elif thinking_complete or not in_thinking:
                # Send as response content
                if thinking_complete:
                    # Only send the new chunk after thinking
                    think_end = full_response.find("</think>") + 8
                    new_content = full_response[think_end:]
                    if len(new_content) > len(response_content):
                        new_chunk = new_content[len(response_content):]
                        response_content += new_chunk
                        yield {
                            "type": "response",
                            "data": {"text": new_chunk}
                        }
                else:
                    # No thinking tags, send as response
                    response_content += chunk
                    yield {
                        "type": "response",
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
                    "num_pages": context_result["num_pages"],
                    "num_sources": context_result["num_sources"]
                }
            }
        }
    
    @weave.op()
    def _build_prompt(self, query: str, context: str) -> str:
        """
        NESTED CALL: Build the prompt with context and query.
        This captures the full prompt construction process.

        Args:
            query: The user query
            context: The retrieved context

        Returns:
            Formatted prompt with context and query
        """
        # Add prompt building metadata
        add_session_metadata(
            operation_type="prompt_building",
            query_length=len(query),
            context_length=len(context),
            context_chunks=context.count("---") + 1 if context else 0
        )

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

