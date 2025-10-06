"""
Enhanced RAG Service with Course Integration

Orchestrates the full RAG pipeline with intelligent query routing:
- Learning queries -> Course search + RAG
- General queries -> Standard RAG
- Mixed queries -> Both systems

All methods are decorated with @weave.op() for observability.
Uses Weave threads to track conversation sessions.
"""
from typing import Dict, Any, AsyncGenerator, Optional, List
import weave
from app.services.retrieval_service import RetrievalService
from app.services.llm_service import LLMService
from app.services.independent_course_service import IndependentCourseService
from app.services.query_classifier import QueryClassifier
from app.utils.weave_utils import add_session_metadata
from app.prompts import PromptConfig


class EnhancedRAGService:
    """
    Enhanced RAG service that intelligently routes queries to appropriate handlers.
    Uses versioned prompts from the centralized configuration.
    """

    def __init__(
        self,
        retrieval_service: RetrievalService,
        llm_service: LLMService,
        course_service: Optional[IndependentCourseService] = None
    ):
        """
        Initialize enhanced RAG service.
        
        Args:
            retrieval_service: Service for retrieving context from knowledge base
            llm_service: Service for LLM completions
            course_service: Service for course search (optional)
        """
        self.retrieval_service = retrieval_service
        self.llm_service = llm_service
        self.course_service = course_service or IndependentCourseService()
        self.query_classifier = QueryClassifier(llm_service)

    def _format_conversation_history(self, history_pairs: List[Dict[str, Any]]) -> str:
        """
        Format conversation history pairs into a readable string for the LLM.

        Args:
            history_pairs: List of Q&A pairs from storage service

        Returns:
            Formatted history string
        """
        if not history_pairs:
            return ""

        formatted_pairs = []
        for i, pair in enumerate(history_pairs, 1):
            formatted_pairs.append(f"Q{i}: {pair['question']}")
            formatted_pairs.append(f"A{i}: {pair['answer']}")
            formatted_pairs.append("")  # Empty line between pairs

        # Remove the last empty line
        if formatted_pairs and formatted_pairs[-1] == "":
            formatted_pairs.pop()

        history_text = "\n".join(formatted_pairs)
        return PromptConfig.get_history_template().format(history_pairs=history_text)

    @weave.op()
    async def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        TURN-LEVEL OPERATION: Process a query through the enhanced RAG pipeline.
        This represents one conversation turn in the thread.

        Args:
            query: The user query
            session_id: Optional session ID for tracking (used as thread_id)
            top_k: Number of context chunks to retrieve

        Returns:
            Dictionary with 'response', 'sources', 'metadata' keys
        """
        print(f"🔍 Enhanced RAG Service: Starting query processing")
        print(f"   Query: '{query}'")
        print(f"   Session ID: {session_id}")
        print(f"   Top K: {top_k}")

        # Add session metadata to the current operation
        add_session_metadata(
            session_id=session_id,
            operation_type="enhanced_rag_query",
            query_length=len(query),
            top_k=top_k,
            # Explicit prompt version tracking
            general_system_prompt_version=PromptConfig.get_current_version(),
            learning_system_prompt_version=PromptConfig.get_current_version()
        )

        # Step 1: Classify the query
        print(f"🔍 Enhanced RAG Service: Classifying query...")
        classification = self.query_classifier.classify_query(query)
        query_type = classification["query_type"]
        confidence = classification["confidence"]
        
        print(f"📊 Enhanced RAG Service: Query classification:")
        print(f"   Type: {query_type}")
        print(f"   Confidence: {confidence:.2f}")

        # Step 2: Route query based on classification
        if query_type == "learning":
            return await self._process_learning_query(query, session_id, top_k, classification)
        elif query_type == "mixed":
            return await self._process_mixed_query(query, session_id, top_k, classification)
        else:
            return await self._process_general_query(query, session_id, top_k, classification)
    
    @weave.op()
    async def _process_learning_query(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int,
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a learning-focused query using course search.
        
        Args:
            query: The user query
            session_id: Session ID for tracking
            top_k: Number of context chunks to retrieve
            classification: Query classification results
            
        Returns:
            Response dictionary with course recommendations
        """
        print(f"🎓 Enhanced RAG Service: Processing learning query")
        
        add_session_metadata(
            operation_type="learning_query_processing",
            classification_confidence=classification["confidence"],
            # Track which prompt version is used for learning queries
            learning_system_prompt_version=PromptConfig.get_current_version(),
            learning_prompt_used=True
        )
        
        try:
            # Search for relevant courses
            print(f"🔍 Enhanced RAG Service: Searching for courses...")
            course_result = await self.course_service.search_courses(
                query=query,
                use_vector=True,
                limit=5
            )
            
            courses = course_result.get('results', [])
            
            if courses:
                # Format course response
                response = self.course_service.format_course_response(course_result, query)
                
                # Create sources from courses
                sources = []
                for course in courses:
                    sources.append({
                        "type": "course",
                        "id": course.get("id"),
                        "title": course.get("title"),
                        "url": course.get("url"),
                        "difficulty": course.get("difficulty"),
                        "duration": course.get("duration"),
                        "topics": course.get("topics", [])
                    })
                
                return {
                    "response": response,
                    "sources": sources,
                    "metadata": {
                        "query_type": "learning",
                        "classification": classification,
                        "course_search": course_result,
                        "num_courses": len(courses),
                        "search_method": course_result.get("searchMethod")
                    }
                }
            else:
                # No courses found, fall back to general RAG
                print(f"⚠️ Enhanced RAG Service: No courses found, falling back to general RAG")
                return await self._process_general_query(query, session_id, top_k, classification)
                
        except Exception as e:
            print(f"❌ Enhanced RAG Service: Course search failed: {str(e)}")
            # Fall back to general RAG on error
            return await self._process_general_query(query, session_id, top_k, classification)
    
    @weave.op()
    async def _process_mixed_query(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int,
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a mixed query using both course search and general RAG.
        
        Args:
            query: The user query
            session_id: Session ID for tracking
            top_k: Number of context chunks to retrieve
            classification: Query classification results
            
        Returns:
            Response dictionary combining courses and general context
        """
        print(f"🔄 Enhanced RAG Service: Processing mixed query")
        
        add_session_metadata(
            operation_type="mixed_query_processing",
            classification_confidence=classification["confidence"],
            # Track prompt versions for mixed queries (uses both learning and general)
            learning_system_prompt_version=PromptConfig.get_current_version(),
            general_system_prompt_version=PromptConfig.get_current_version(),
            mixed_query_type=True
        )
        
        try:
            # Run both course search and general retrieval in parallel
            print(f"🔍 Enhanced RAG Service: Running parallel search...")
            
            # Search for courses
            course_task = self.course_service.search_courses(
                query=query,
                use_vector=True,
                limit=3  # Fewer courses for mixed queries
            )
            
            # Retrieve general context
            context_task = self.retrieval_service.retrieve_context(
                query=query,
                top_k=top_k
            )
            
            # Wait for both
            course_result = await course_task
            context_result = await context_task
            
            # Combine results
            courses = course_result.get('results', [])
            
            # Format course information
            course_info = ""
            if courses:
                course_info = "Relevant courses found:\n"
                for i, course in enumerate(courses, 1):
                    course_info += f"{i}. {course.get('title')} ({course.get('difficulty', 'Unknown')} level)\n"
                    course_info += f"   Duration: {course.get('duration', 'Unknown')}\n"
                    if course.get('topics'):
                        course_info += f"   Topics: {', '.join(course.get('topics', [])[:3])}\n"
                    course_info += "\n"
            else:
                course_info = "No specific courses found for this topic.\n"
            
            # Build combined prompt
            prompt = self.COMBINED_CONTEXT_TEMPLATE.format(
                course_info=course_info,
                general_context=context_result["context_text"],
                query=query
            )
            
            # Generate response
            print(f"🤖 Enhanced RAG Service: Generating combined response...")
            completion = await self.llm_service.generate_completion(
                prompt=prompt,
                system_prompt=PromptConfig.get_learning_system_prompt()
            )
            
            # Combine sources
            sources = context_result["sources"].copy()
            for course in courses:
                sources.append({
                    "type": "course",
                    "id": course.get("id"),
                    "title": course.get("title"),
                    "url": course.get("url"),
                    "difficulty": course.get("difficulty"),
                    "duration": course.get("duration"),
                    "topics": course.get("topics", [])
                })
            
            return {
                "response": completion["text"],
                "sources": sources,
                "metadata": {
                    "query_type": "mixed",
                    "classification": classification,
                    "course_search": course_result,
                    "context_retrieval": {
                        "num_chunks": context_result["num_chunks"],
                        "num_sources": context_result["num_sources"]
                    },
                    "num_courses": len(courses),
                    "num_context_chunks": context_result["num_chunks"],
                    "llm_tokens": completion.get("tokens", 0)
                }
            }
            
        except Exception as e:
            print(f"❌ Enhanced RAG Service: Mixed query processing failed: {str(e)}")
            # Fall back to general RAG on error
            return await self._process_general_query(query, session_id, top_k, classification)
    
    @weave.op()
    async def _process_general_query(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int,
        classification: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a general query using standard RAG pipeline.
        
        Args:
            query: The user query
            session_id: Session ID for tracking
            top_k: Number of context chunks to retrieve
            classification: Query classification results
            
        Returns:
            Standard RAG response dictionary
        """
        print(f"📚 Enhanced RAG Service: Processing general query")
        
        add_session_metadata(
            operation_type="general_query_processing",
            classification_confidence=classification["confidence"],
            # Track general system prompt version
            general_system_prompt_version=PromptConfig.get_current_version(),
            general_prompt_used=True
        )
        
        # Use standard RAG pipeline
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )
        
        # Build prompt with context
        prompt = f"""Context: {context_result["context_text"]}

Question: {query}

Please provide a helpful and accurate answer based on the context provided."""
        
        # Generate response
        completion = await self.llm_service.generate_completion(
            prompt=prompt,
            system_prompt=PromptConfig.get_general_system_prompt()
        )
        
        return {
            "response": completion["text"],
            "sources": context_result["sources"],
            "metadata": {
                "query_type": "general",
                "classification": classification,
                "context_retrieval": {
                    "num_chunks": context_result["num_chunks"],
                    "num_sources": context_result["num_sources"]
                },
                "num_chunks": context_result["num_chunks"],
                "llm_tokens": completion.get("tokens", 0)
            }
        }

    @weave.op()
    async def process_query_streaming(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
        storage_service=None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        TURN-LEVEL OPERATION: Process a query through the enhanced RAG pipeline with streaming.
        This represents one conversation turn in the thread.

        Args:
            query: The user query
            session_id: Optional session ID for tracking (used as thread_id)
            top_k: Number of context chunks to retrieve
            storage_service: Optional storage service for saving messages

        Yields:
            Dictionaries with 'type' and 'data' keys for streaming response
        """
        print(f"🔍 Enhanced RAG Service: Starting streaming query processing")

        add_session_metadata(
            session_id=session_id,
            operation_type="enhanced_rag_streaming",
            query_length=len(query),
            top_k=top_k,
            # Track streaming-specific prompt version usage
            streaming_operation=True,
            general_system_prompt_version=PromptConfig.get_current_version(),
            conversation_history_enabled=True
        )

        # Store user message at the beginning if storage service is provided
        user_message_id = None
        if storage_service:
            print(f"💾 Enhanced RAG Service: Storing user message")
            user_message = storage_service.create_chat_message(
                message_data={
                    "sessionId": session_id,
                    "sender": "user",
                    "message": query,
                    "thinking": "",
                },
                session_id=session_id or "default"
            )
            user_message_id = user_message.get("id")

        # Step 1: Classify the query
        classification = self.query_classifier.classify_query(query)
        query_type = classification["query_type"]

        # Send classification info
        yield {
            "type": "classification",
            "data": {
                "query_type": query_type,
                "confidence": classification["confidence"]
            }
        }

        # Route to appropriate streaming handler based on query type
        if query_type == "learning":
            print(f"📚 Enhanced RAG Service: Using streaming course search for learning query")
            async for event in self._process_learning_query_streaming(query, session_id, top_k, classification, storage_service):
                yield event
            return
        elif query_type == "mixed":
            print(f"📚 Enhanced RAG Service: Using streaming mixed query processing")
            async for event in self._process_mixed_query_streaming(query, session_id, top_k, classification, storage_service):
                yield event
            return
        else:
            print(f"📚 Enhanced RAG Service: Using standard RAG streaming for general query")

        # Use standard RAG pipeline for general queries
        context_result = await self.retrieval_service.retrieve_context(
            query=query,
            top_k=top_k
        )

        # Send context info
        yield {
            "type": "context",
            "data": {
                "num_chunks": context_result["num_chunks"],
                "num_sources": context_result["num_sources"]
            }
        }

        # Step 3: Get conversation history if storage service is available
        history_section = ""
        history_pairs = []
        if storage_service and session_id:
            print(f"📚 Enhanced RAG Service: Fetching conversation history...")
            history_pairs = storage_service.get_recent_conversation_history(
                session_id=session_id,
                num_pairs=3
            )
            history_section = self._format_conversation_history(history_pairs)
            print(f"📚 Enhanced RAG Service: Found {len(history_pairs)} conversation pairs")

        # Send history info
        yield {
            "type": "history",
            "data": {
                "num_pairs": len(history_pairs),
                "has_history": len(history_pairs) > 0
            }
        }

        # Build prompt with history and context
        prompt = PromptConfig.get_general_prompt_template().format(
            history_section=history_section,
            context=context_result["context_text"],
            query=query
        )

        # Stream LLM response with thinking process separation
        full_response = ""
        response_content = ""
        in_thinking = False
        thinking_complete = False

        async for chunk in self.llm_service.generate_streaming(
            prompt=prompt,
            system_prompt=PromptConfig.get_general_system_prompt()
        ):
            full_response += chunk

            # Check for thinking tags
            if "<think>" in full_response and not in_thinking:
                in_thinking = True
                # Send any content before <think> as response
                pre_think = full_response.split("<think>")[0]
                if pre_think.strip() and len(pre_think) > len(response_content):
                    new_pre_think = pre_think[len(response_content):]
                    response_content += new_pre_think
                    yield {
                        "type": "response",
                        "data": {"text": new_pre_think}
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
                    if len(full_response) > len(response_content):
                        new_chunk = full_response[len(response_content):]
                        response_content += new_chunk
                        yield {
                            "type": "response",
                            "data": {"text": new_chunk}
                        }

        # Post-process and yield final response
        response_text = self._post_process_response(full_response)

        # Store AI message at the end if storage service is provided
        ai_message_id = None
        if storage_service:
            print(f"💾 Enhanced RAG Service: Storing AI response")

            # Extract thinking content for storage
            thinking_content = ""
            if "<think>" in full_response and "</think>" in full_response:
                think_start = full_response.find("<think>") + 7
                think_end = full_response.find("</think>")
                thinking_content = full_response[think_start:think_end].strip()

            ai_message = storage_service.create_chat_message(
                message_data={
                    "sessionId": session_id,
                    "sender": "ai",
                    "message": response_text,
                    "thinking": thinking_content,
                    "metadata": {
                        "query_type": query_type,
                        "classification": classification,
                        "num_chunks": context_result["num_chunks"],
                        "num_sources": context_result["num_sources"],
                        "response_length": len(full_response),
                        "streaming": True
                    }
                },
                session_id=session_id or "default"
            )
            ai_message_id = ai_message.get("id")

        yield {
            "type": "done",
            "data": {
                "response": response_text,
                "sources": context_result["sources"],
                "metadata": {
                    "session_id": session_id,
                    "query_type": query_type,
                    "classification": classification,
                    "num_chunks": context_result["num_chunks"],
                    "num_sources": context_result["num_sources"],
                    "response_length": len(full_response),
                    "user_message_id": user_message_id,
                    "ai_message_id": ai_message_id
                }
            }
        }

    def _post_process_response(self, response: str) -> str:
        """
        Post-process the LLM response to remove thinking tags and clean up.

        Args:
            response: Raw LLM response

        Returns:
            Cleaned response without thinking tags
        """
        import re

        # Remove thinking tags using regex to handle multiple blocks
        response = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)

        # Remove "Answer:" prefix if present
        if response.startswith("Answer:"):
            response = response[7:].strip()

        # Remove leading/trailing whitespace
        response = response.strip()

        return response

    async def _process_learning_query_streaming(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int,
        classification: Dict[str, Any],
        storage_service: Optional[Any] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a learning query with streaming course search.

        Args:
            query: The user query
            session_id: Session ID for tracking
            top_k: Number of context chunks to retrieve
            classification: Query classification result
            storage_service: Optional storage service for saving messages

        Yields:
            Streaming events for course search and response
        """
        print(f"🎓 Enhanced RAG Service: Starting streaming course search")

        # Step 1: Search for courses
        yield {
            "type": "course_search_start",
            "data": {"query": query}
        }

        try:
            course_result = await self.course_service.search_courses(
                query=query,
                use_vector=True,
                limit=5
            )

            courses = []
            if course_result.get("success") and course_result.get("data", {}).get("results"):
                courses = course_result["data"]["results"]

            # Send course search results
            yield {
                "type": "course_search_result",
                "data": {
                    "num_courses": len(courses),
                    "search_method": course_result.get("data", {}).get("searchMethod", "unknown"),
                    "success": course_result.get("success", False)
                }
            }

            if courses:
                # Step 2: Get additional context from knowledge base
                yield {
                    "type": "context_search_start",
                    "data": {"query": query}
                }

                context_result = await self.retrieval_service.retrieve_context(
                    query=query,
                    top_k=top_k
                )

                yield {
                    "type": "context",
                    "data": {
                        "num_chunks": context_result["num_chunks"],
                        "num_sources": context_result["num_sources"]
                    }
                }

                # Step 3: Get conversation history
                history_section = ""
                history_pairs = []
                if storage_service and session_id:
                    history_pairs = storage_service.get_recent_conversation_history(
                        session_id=session_id,
                        num_pairs=3
                    )
                    history_section = self._format_conversation_history(history_pairs)

                yield {
                    "type": "history",
                    "data": {
                        "num_pairs": len(history_pairs),
                        "has_history": len(history_pairs) > 0
                    }
                }

                # Step 4: Build combined prompt with courses and context
                course_info = self._format_courses_for_prompt(courses)

                prompt = PromptConfig.get_combined_context_template().format(
                    course_info=course_info,
                    general_context=context_result["context_text"],
                    query=query
                )

                if history_section:
                    prompt = f"{history_section}\n\n{prompt}"

                # Step 5: Stream LLM response
                yield {
                    "type": "response_start",
                    "data": {"has_courses": True, "num_courses": len(courses)}
                }

                full_response = ""
                response_content = ""
                thinking_content = ""
                in_thinking = False
                thinking_complete = False

                async for chunk in self.llm_service.generate_streaming(
                    prompt=prompt,
                    system_prompt=PromptConfig.get_learning_system_prompt()
                ):
                    full_response += chunk

                    # Handle thinking process separation with better logic
                    current_text = full_response

                    # Check if we're entering thinking mode
                    if "<think>" in current_text and not in_thinking:
                        in_thinking = True
                        # Extract any content before <think> tag
                        think_start = current_text.find("<think>")
                        if think_start > len(full_response) - len(chunk):
                            # The <think> tag is in this chunk, send any content before it
                            pre_think = chunk[:think_start - (len(full_response) - len(chunk))]
                            if pre_think and not in_thinking:
                                response_content += pre_think
                                yield {
                                    "type": "response",
                                    "data": {"text": pre_think}
                                }
                        continue

                    # Check if we're exiting thinking mode
                    if "</think>" in current_text and in_thinking:
                        in_thinking = False
                        thinking_complete = True
                        # Extract any content after </think> tag
                        think_end = current_text.find("</think>") + 8
                        if think_end < len(current_text):
                            post_think = current_text[think_end:]
                            # Only send the part that's in this chunk
                            chunk_start = len(current_text) - len(chunk)
                            if think_end > chunk_start:
                                post_think_chunk = chunk[think_end - chunk_start:]
                                if post_think_chunk:
                                    response_content += post_think_chunk
                                    yield {
                                        "type": "response",
                                        "data": {"text": post_think_chunk}
                                    }
                        continue

                    # If we're in thinking mode, collect thinking content but don't send
                    if in_thinking:
                        thinking_content += chunk
                        continue

                    # If thinking is complete or no thinking tags, send the chunk
                    if thinking_complete or "<think>" not in current_text:
                        response_content += chunk
                        yield {
                            "type": "response",
                            "data": {"text": chunk}
                        }

                # Clean up final response
                final_response = self._post_process_response(full_response)

                # Step 6: Store AI response if storage service is provided
                ai_message_id = None
                if storage_service:
                    ai_message = storage_service.create_chat_message(
                        message_data={
                            "sessionId": session_id,
                            "sender": "ai",
                            "message": final_response,
                            "thinking": thinking_content,
                            "metadata": {
                                "query_type": "learning",
                                "classification": classification,
                                "course_search": course_result,
                                "num_courses": len(courses),
                                "search_method": course_result.get("data", {}).get("searchMethod"),
                                "context_chunks": context_result["num_chunks"],
                                "sources": context_result["sources"]
                            }
                        },
                        session_id=session_id or "default"
                    )
                    ai_message_id = ai_message.get("id")

                # Send completion event
                yield {
                    "type": "done",
                    "data": {
                        "query_type": "learning",
                        "num_courses": len(courses),
                        "num_context_chunks": context_result["num_chunks"],
                        "response_length": len(final_response),
                        "metadata": {
                            "ai_message_id": ai_message_id,
                            "course_search_success": True
                        }
                    }
                }

            else:
                # No courses found, fall back to general RAG
                print(f"⚠️ Enhanced RAG Service: No courses found, falling back to general RAG streaming")
                yield {
                    "type": "fallback_to_general",
                    "data": {"reason": "no_courses_found"}
                }

                # Continue with general RAG processing...
                # (This would be the same as the general query processing)

        except Exception as e:
            print(f"❌ Enhanced RAG Service: Course search streaming failed: {str(e)}")
            yield {
                "type": "error",
                "data": {"error": f"Course search failed: {str(e)}"}
            }

    async def _process_mixed_query_streaming(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int,
        classification: Dict[str, Any],
        storage_service: Optional[Any] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a mixed query with streaming course search and general context.

        Args:
            query: The user query
            session_id: Session ID for tracking
            top_k: Number of context chunks to retrieve
            classification: Query classification result
            storage_service: Optional storage service for saving messages

        Yields:
            Streaming events for mixed query processing
        """
        print(f"🔀 Enhanced RAG Service: Starting streaming mixed query processing")

        # Step 1: Start parallel search
        yield {
            "type": "mixed_search_start",
            "data": {"query": query}
        }

        try:
            # Run course search and context retrieval in parallel
            import asyncio

            course_task = self.course_service.search_courses(
                query=query,
                use_vector=True,
                limit=3  # Fewer courses for mixed queries
            )

            context_task = self.retrieval_service.retrieve_context(
                query=query,
                top_k=top_k
            )

            course_result, context_result = await asyncio.gather(
                course_task, context_task, return_exceptions=True
            )

            # Handle course search results
            courses = []
            if not isinstance(course_result, Exception) and course_result.get("success"):
                courses = course_result.get("data", {}).get("results", [])

            # Handle context results
            if isinstance(context_result, Exception):
                context_result = {"context_text": "", "num_chunks": 0, "num_sources": 0, "sources": []}

            # Send search results
            yield {
                "type": "mixed_search_result",
                "data": {
                    "num_courses": len(courses),
                    "num_context_chunks": context_result["num_chunks"],
                    "course_search_success": not isinstance(course_result, Exception) and course_result.get("success", False),
                    "context_search_success": not isinstance(context_result, Exception)
                }
            }

            # Step 2: Get conversation history
            history_section = ""
            history_pairs = []
            if storage_service and session_id:
                history_pairs = storage_service.get_recent_conversation_history(
                    session_id=session_id,
                    num_pairs=3
                )
                history_section = self._format_conversation_history(history_pairs)

            yield {
                "type": "history",
                "data": {
                    "num_pairs": len(history_pairs),
                    "has_history": len(history_pairs) > 0
                }
            }

            # Step 3: Build combined prompt
            if courses:
                course_info = self._format_courses_for_prompt(courses)
                prompt = PromptConfig.get_combined_context_template().format(
                    course_info=course_info,
                    general_context=context_result["context_text"],
                    query=query
                )
            else:
                # No courses, use general template
                prompt = PromptConfig.get_general_prompt_template().format(
                    history_section="",
                    context=context_result["context_text"],
                    query=query
                )

            if history_section:
                prompt = f"{history_section}\n\n{prompt}"

            # Step 4: Stream LLM response
            yield {
                "type": "response_start",
                "data": {
                    "has_courses": len(courses) > 0,
                    "num_courses": len(courses),
                    "has_context": context_result["num_chunks"] > 0
                }
            }

            full_response = ""
            response_content = ""
            thinking_content = ""
            in_thinking = False
            thinking_complete = False

            # Use learning prompt if we have courses, otherwise general prompt
            system_prompt = PromptConfig.get_learning_system_prompt() if courses else PromptConfig.get_general_system_prompt()

            async for chunk in self.llm_service.generate_streaming(
                prompt=prompt,
                system_prompt=system_prompt
            ):
                full_response += chunk

                # Handle thinking process separation with better logic
                current_text = full_response

                # Check if we're entering thinking mode
                if "<think>" in current_text and not in_thinking:
                    in_thinking = True
                    # Extract any content before <think> tag
                    think_start = current_text.find("<think>")
                    if think_start > len(full_response) - len(chunk):
                        # The <think> tag is in this chunk, send any content before it
                        pre_think = chunk[:think_start - (len(full_response) - len(chunk))]
                        if pre_think and not in_thinking:
                            response_content += pre_think
                            yield {
                                "type": "response",
                                "data": {"text": pre_think}
                            }
                    continue

                # Check if we're exiting thinking mode
                if "</think>" in current_text and in_thinking:
                    in_thinking = False
                    thinking_complete = True
                    # Extract any content after </think> tag
                    think_end = current_text.find("</think>") + 8
                    if think_end < len(current_text):
                        post_think = current_text[think_end:]
                        # Only send the part that's in this chunk
                        chunk_start = len(current_text) - len(chunk)
                        if think_end > chunk_start:
                            post_think_chunk = chunk[think_end - chunk_start:]
                            if post_think_chunk:
                                response_content += post_think_chunk
                                yield {
                                    "type": "response",
                                    "data": {"text": post_think_chunk}
                                }
                    continue

                # If we're in thinking mode, collect thinking content but don't send
                if in_thinking:
                    thinking_content += chunk
                    continue

                # If thinking is complete or no thinking tags, send the chunk
                if thinking_complete or "<think>" not in current_text:
                    response_content += chunk
                    yield {
                        "type": "response",
                        "data": {"text": chunk}
                    }

            # Clean up final response
            final_response = self._post_process_response(full_response)

            # Step 5: Store AI response if storage service is provided
            ai_message_id = None
            if storage_service:
                ai_message = storage_service.create_chat_message(
                    message_data={
                        "sessionId": session_id,
                        "sender": "ai",
                        "message": final_response,
                        "thinking": thinking_content,
                        "metadata": {
                            "query_type": "mixed",
                            "classification": classification,
                            "course_search": course_result if not isinstance(course_result, Exception) else None,
                            "num_courses": len(courses),
                            "context_chunks": context_result["num_chunks"],
                            "sources": context_result.get("sources", [])
                        }
                    },
                    session_id=session_id or "default"
                )
                ai_message_id = ai_message.get("id")

            # Send completion event
            yield {
                "type": "done",
                "data": {
                    "query_type": "mixed",
                    "num_courses": len(courses),
                    "num_context_chunks": context_result["num_chunks"],
                    "response_length": len(final_response),
                    "metadata": {
                        "ai_message_id": ai_message_id,
                        "mixed_query_success": True
                    }
                }
            }

        except Exception as e:
            print(f"❌ Enhanced RAG Service: Mixed query streaming failed: {str(e)}")
            yield {
                "type": "error",
                "data": {"error": f"Mixed query processing failed: {str(e)}"}
            }
