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
from app.config.prompts import PromptConfig


class RAGService:
    """
    RAG service that orchestrates retrieval and generation.
    Uses versioned prompts from the centralized configuration.
    """
    
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
        print(f"🔍 RAG Service: Starting query processing")
        print(f"   Query: '{query}'")
        print(f"   Session ID: {session_id}")
        print(f"   Top K: {top_k}")

        # Add session metadata to the current operation
        add_session_metadata(
            session_id=session_id,
            operation_type="rag_query",
            query_length=len(query),
            top_k=top_k
        )

        # Retrieve relevant context
        print(f"📚 RAG Service: Calling retrieval service...")
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )

        print(f"📊 RAG Service: Context retrieval results:")
        print(f"   Num chunks: {context_result['num_chunks']}")
        print(f"   Num sources: {context_result['num_sources']}")
        print(f"   Context text length: {len(context_result['context_text'])}")
        print(f"   Sources: {[s['title'] for s in context_result['sources']]}")

        # Build prompt with context
        print(f"🔨 RAG Service: Building prompt...")
        prompt = self._build_prompt(query, context_result["context_text"])
        print(f"   Prompt length: {len(prompt)}")

        # Generate response
        print(f"🤖 RAG Service: Generating LLM response...")
        completion = await self.llm_service.generate_completion(
            prompt=prompt,
            system_prompt=PromptConfig.get_legacy_system_prompt()
        )

        print(f"✅ RAG Service: LLM response generated:")
        print(f"   Model: {completion['model']}")
        print(f"   Tokens: {completion['tokens']}")
        print(f"   Response length: {len(completion['text'])}")

        # Post-process response
        response_text = self._post_process_response(completion["text"])

        result = {
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

        print(f"🎯 RAG Service: Query processing complete")
        print(f"   Final response length: {len(response_text)}")
        print(f"   Final sources count: {len(context_result['sources'])}")

        return result
    
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
        # Retrieve relevant context using the same method as non-streaming
        print(f"🔍 RAG Service: Starting query processing")
        print(f"   Query: '{query}'")
        print(f"   Session ID: {session_id}")
        print(f"   Top K: {top_k}")

        print(f"📚 RAG Service: Calling retrieval service...")
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )

        print(f"📊 RAG Service: Context retrieval results:")
        print(f"   Num chunks: {context_result.get('num_chunks', 0)}")
        print(f"   Num sources: {len(context_result.get('sources', []))}")
        print(f"   Context text length: {len(context_result.get('context_text', ''))}")
        print(f"   Sources: {[s.get('title', 'Unknown') for s in context_result.get('sources', [])]}")
        
        # Yield context information
        yield {
            "type": "context",
            "data": {
                "sources": context_result["sources"],
                "num_chunks": context_result.get("num_chunks", 0),
                "num_sources": len(context_result["sources"])
            }
        }
        
        # Build prompt with context
        print(f"🔨 RAG Service: Building prompt...")
        prompt = self._build_prompt(query, context_result["context_text"])
        print(f"   Prompt length: {len(prompt)}")
        
        # Stream response with thinking/response separation
        print(f"🤖 RAG Service: Generating streaming LLM response...")
        full_response = ""
        thinking_content = ""
        response_content = ""
        in_thinking = False
        thinking_complete = False

        async for chunk in self.llm_service.generate_streaming(
            prompt=prompt,
            system_prompt=PromptConfig.get_legacy_system_prompt()
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
                    "num_chunks": context_result.get("num_chunks", 0),
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
            context_chunks=context.count("---") + 1 if context else 0,
            # Track legacy prompt usage
            legacy_rag_service=True,
            legacy_prompt_version="1.0.0",  # Legacy service uses v1.0.0 prompts
            prompt_template_type="legacy_context_template"
        )

        return PromptConfig.get_legacy_context_template().format(
            context=context,
            query=query
        )
    
    def _post_process_response(self, response: str) -> str:
        """
        Post-process the LLM response to remove thinking tags and clean up.

        Args:
            response: Raw LLM response

        Returns:
            Cleaned response without thinking tags
        """
        # Remove thinking tags if they exist
        if "<think>" in response and "</think>" in response:
            think_start = response.find("<think>")
            think_end = response.find("</think>") + 8
            response = response[:think_start] + response[think_end:]

        # Remove leading/trailing whitespace
        response = response.strip()

        # Remove any "Answer:" prefix if present
        if response.lower().startswith("answer:"):
            response = response[7:].strip()

        return response

