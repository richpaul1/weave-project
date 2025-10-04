"""
Enhanced RAG Service with Course Integration

Orchestrates the full RAG pipeline with intelligent query routing:
- Learning queries -> Course search + RAG
- General queries -> Standard RAG
- Mixed queries -> Both systems

All methods are decorated with @weave.op() for observability.
Uses Weave threads to track conversation sessions.
"""
from typing import Dict, Any, AsyncGenerator, Optional
import weave
from app.services.retrieval_service import RetrievalService
from app.services.llm_service import LLMService
from app.services.course_service import CourseService
from app.services.query_classifier import QueryClassifier
from app.utils.weave_utils import add_session_metadata


class EnhancedRAGService:
    """
    Enhanced RAG service that intelligently routes queries to appropriate handlers.
    """
    
    # System prompt for general RAG
    GENERAL_SYSTEM_PROMPT = """You are a helpful AI assistant that answers questions based on the provided context.

Use the context provided to answer the user's question accurately and comprehensively.
If the context doesn't contain enough information to fully answer the question, say so clearly.
Always cite your sources when possible.

Be conversational and helpful in your responses."""

    # System prompt for learning/course queries
    LEARNING_SYSTEM_PROMPT = """You are a helpful AI learning assistant that helps users find courses and educational content.

When users ask about learning, courses, or education:
1. First check if there are relevant courses available
2. Recommend specific courses that match their interests
3. Provide helpful learning guidance and next steps
4. Use both course information and general knowledge to give comprehensive advice

Be encouraging and supportive in helping users with their learning journey."""

    # Template for combining course and context information
    COMBINED_CONTEXT_TEMPLATE = """Based on the available courses and knowledge base, here's what I found:

AVAILABLE COURSES:
{course_info}

ADDITIONAL CONTEXT:
{general_context}

User Question: {query}

Please provide a comprehensive response that includes course recommendations and additional helpful information."""

    def __init__(
        self,
        retrieval_service: RetrievalService,
        llm_service: LLMService,
        course_service: Optional[CourseService] = None
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
        self.course_service = course_service or CourseService()
        self.query_classifier = QueryClassifier(llm_service)
    
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
            top_k=top_k
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
            classification_confidence=classification["confidence"]
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
            classification_confidence=classification["confidence"]
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
                system_prompt=self.LEARNING_SYSTEM_PROMPT
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
                    "context_retrieval": context_result["metadata"],
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
            classification_confidence=classification["confidence"]
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
            system_prompt=self.GENERAL_SYSTEM_PROMPT
        )
        
        return {
            "response": completion["text"],
            "sources": context_result["sources"],
            "metadata": {
                "query_type": "general",
                "classification": classification,
                "context_retrieval": context_result["metadata"],
                "num_chunks": context_result["num_chunks"],
                "llm_tokens": completion.get("tokens", 0)
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
        TURN-LEVEL OPERATION: Process a query through the enhanced RAG pipeline with streaming.
        This represents one conversation turn in the thread.

        Args:
            query: The user query
            session_id: Optional session ID for tracking (used as thread_id)
            top_k: Number of context chunks to retrieve

        Yields:
            Dictionaries with 'type' and 'data' keys for streaming response
        """
        print(f"🔍 Enhanced RAG Service: Starting streaming query processing")

        add_session_metadata(
            session_id=session_id,
            operation_type="enhanced_rag_streaming",
            query_length=len(query),
            top_k=top_k
        )

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

        # For now, fall back to standard RAG streaming for all query types
        # TODO: Implement streaming for course search and mixed queries
        print(f"📚 Enhanced RAG Service: Using standard RAG streaming (streaming course search not yet implemented)")

        # Use standard RAG pipeline
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

        # Build prompt
        prompt = f"""Context: {context_result["context_text"]}

Question: {query}

Please provide a helpful and accurate answer based on the context provided."""

        # Stream LLM response
        full_response = ""
        async for chunk in self.llm_service.generate_streaming(
            prompt=prompt,
            system_prompt=self.GENERAL_SYSTEM_PROMPT
        ):
            full_response += chunk
            yield {
                "type": "response",
                "data": {"text": chunk}
            }

        # Send completion
        yield {
            "type": "done",
            "data": {
                "sources": context_result["sources"],
                "metadata": {
                    "query_type": query_type,
                    "classification": classification,
                    "num_chunks": context_result["num_chunks"],
                    "response_length": len(full_response)
                }
            }
        }
