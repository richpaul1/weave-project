"""
Chat API Routes

Handles chat requests for the RAG pipeline.
Uses Weave threads to track conversation sessions.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json
import time
import weave

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService
from app.services.enhanced_rag_service import EnhancedRAGService
from app.services.independent_course_service import IndependentCourseService
from app.services.query_classifier import QueryClassifier
from app.services.hallucination_service import HallucinationService
from app.services.tool_calling_service import ToolCallingService
from app.services.tool_strategy_service import ToolStrategyService
from app.tools.tool_executor import ToolExecutor
from app.utils.weave_utils import create_tool_trace_summary
from app.config.tool_config import ToolStrategy, DEFAULT_TOOL_STRATEGY_CONFIG
from app import config


# Request/Response models
class ChatRequest(BaseModel):
    """Chat message request"""
    query: str = Field(..., description="The user query")
    session_id: Optional[str] = Field(None, description="Session ID for tracking")
    top_k: int = Field(5, description="Number of context chunks to retrieve", ge=1, le=20)
    stream: bool = Field(False, description="Whether to stream the response")


class ChatResponse(BaseModel):
    """Chat message response"""
    response: str = Field(..., description="The generated response")
    sources: list = Field(..., description="List of source documents")
    metadata: dict = Field(..., description="Response metadata")
    hallucination_score: Optional[float] = Field(None, description="Hallucination detection score")
    hallucination_details: Optional[dict] = Field(None, description="Hallucination detection details")


# Create router
router = APIRouter()

# Initialize services (will be set by dependency injection)
storage_service: Optional[StorageService] = None
llm_service: Optional[LLMService] = None
retrieval_service: Optional[RetrievalService] = None
rag_service: Optional[RAGService] = None
enhanced_rag_service: Optional[EnhancedRAGService] = None
course_service: Optional[IndependentCourseService] = None
hallucination_service: Optional[HallucinationService] = None
tool_calling_service: Optional[ToolCallingService] = None
tool_strategy_service: Optional[ToolStrategyService] = None


def init_services():
    """Initialize all services"""
    global storage_service, llm_service, retrieval_service, rag_service, enhanced_rag_service, course_service, hallucination_service, tool_calling_service, tool_strategy_service

    if storage_service is None:
        storage_service = StorageService()
        storage_service.connect()

        llm_service = LLMService(provider="ollama")

        retrieval_service = RetrievalService(
            storage=storage_service,
            llm_service=llm_service
        )

        # Initialize both standard and enhanced RAG services
        rag_service = RAGService(
            retrieval_service=retrieval_service,
            llm_service=llm_service
        )

        course_service = IndependentCourseService()

        enhanced_rag_service = EnhancedRAGService(
            retrieval_service=retrieval_service,
            llm_service=llm_service,
            course_service=course_service
        )

        hallucination_service = HallucinationService(
            llm_service=llm_service
        )

        # Initialize tool calling service
        tool_executor = ToolExecutor(
            course_service=course_service,
            retrieval_service=retrieval_service
        )

        tool_calling_service = ToolCallingService(
            llm_service=llm_service,
            tool_executor=tool_executor
        )

        # Initialize tool strategy service
        tool_strategy_service = ToolStrategyService(
            query_classifier=enhanced_rag_service.query_classifier,
            tool_calling_service=tool_calling_service,
            enhanced_rag_service=enhanced_rag_service,
            config=DEFAULT_TOOL_STRATEGY_CONFIG
        )


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest):
    """
    Process a chat message and return a response.
    Uses Weave thread context to track the conversation session.

    Args:
        request: Chat request with query and options

    Returns:
        Chat response with answer, sources, and metadata
    """
    print(f"🚀 Chat API: Received message request")
    print(f"   Query: '{request.query}'")
    print(f"   Session ID: {request.session_id}")
    print(f"   Top K: {request.top_k}")
    print(f"   Stream: {request.stream}")

    init_services()

    try:
        # Use session_id as thread_id to track conversation context
        thread_id = request.session_id or "default_session"

        with weave.thread(thread_id) as thread_ctx:
            print(f"🧵 Processing message in thread: {thread_ctx.thread_id}")

            # Process query through Enhanced RAG pipeline (this becomes a turn in the thread)
            print(f"🔄 Chat API: Starting Enhanced RAG pipeline...")
            result = await enhanced_rag_service.process_query(
                query=request.query,
                session_id=request.session_id,
                top_k=request.top_k
            )

            print(f"📊 Chat API: RAG pipeline results:")
            print(f"   Response length: {len(result['response'])}")
            print(f"   Sources count: {len(result['sources'])}")
            print(f"   Metadata: {result['metadata']}")

            # Run hallucination detection (nested call within the thread)
            hallucination_result = await hallucination_service.detect_hallucination(
                response=result["response"],
                context="\n".join([
                    chunk.get("text", "")
                    for chunk in result.get("chunks", [])
                ]) if "chunks" in result else ""
            )

            return ChatResponse(
                response=result["response"],
                sources=result["sources"],
                metadata=result["metadata"],
                hallucination_score=hallucination_result["score"],
                hallucination_details={
                    "supported_claims": hallucination_result["supported_claims"],
                    "unsupported_claims": hallucination_result["unsupported_claims"],
                    "total_claims": hallucination_result["total_claims"]
                }
            )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Process a chat message with complete server-side storage and stream the response.

    Flow:
    1. Save user message to database
    2. Process AI response through RAG pipeline
    3. Save AI response to database
    4. Stream the response back to client

    Uses Weave thread context to track the conversation session.

    Args:
        request: Chat request with query and options

    Returns:
        Server-Sent Events stream with response chunks
    """
    init_services()

    async def event_generator():
        """Generate SSE events with complete server-side storage"""
        user_message_id = None
        ai_message_id = None
        accumulated_response = ""
        accumulated_thinking = ""

        try:
            # Use session_id as thread_id to track conversation context
            thread_id = request.session_id or "default_session"

            with weave.thread(thread_id) as thread_ctx:
                print(f"🧵 Processing message in thread: {thread_ctx.thread_id}")

                # Step 1: Save user message to database first
                print(f"💾 Saving user message to database...")
                from datetime import datetime
                user_message_data = {
                    "sessionId": request.session_id,
                    "sender": "user",
                    "message": request.query,
                    "thinking": "",
                    "timestamp": datetime.utcnow().isoformat()
                }

                user_message = storage_service.create_chat_message(user_message_data, request.session_id)
                user_message_id = user_message.get("id")
                print(f"✅ User message saved with ID: {user_message_id}")

                # Send user message confirmation
                yield f"data: {json.dumps({'type': 'user_saved', 'message_id': user_message_id})}\n\n"

                # Step 2: Process AI response through Enhanced RAG pipeline
                print(f"🧠 Starting Enhanced AI processing...")
                async for event in enhanced_rag_service.process_query_streaming(
                    query=request.query,
                    session_id=request.session_id,
                    top_k=request.top_k
                ):
                    # Accumulate response content for database storage
                    if event.get("type") == "thinking":
                        # Thinking events have structure: {"type": "thinking", "data": {"text": "..."}}
                        thinking_data = event.get("data", {})
                        accumulated_thinking += thinking_data.get("text", "")
                    elif event.get("type") == "response":
                        # Response events have structure: {"type": "response", "data": {"text": "..."}}
                        response_data = event.get("data", {})
                        accumulated_response += response_data.get("text", "")

                    # Stream event to client
                    yield f"data: {json.dumps(event)}\n\n"

                # Step 3: Save AI response to database after processing complete
                print(f"💾 Saving AI response to database...")
                ai_message_data = {
                    "sessionId": request.session_id,
                    "sender": "ai",
                    "message": accumulated_response,
                    "thinking": accumulated_thinking,
                    "timestamp": datetime.utcnow().isoformat()
                }

                ai_message = storage_service.create_chat_message(ai_message_data, request.session_id)
                ai_message_id = ai_message.get("id")
                print(f"✅ AI response saved with ID: {ai_message_id}")

                # Send completion confirmation with message IDs
                completion_event = {
                    "type": "complete",
                    "user_message_id": user_message_id,
                    "ai_message_id": ai_message_id,
                    "session_id": request.session_id
                }
                yield f"data: {json.dumps(completion_event)}\n\n"

        except Exception as e:
            print(f"❌ Error in chat stream: {str(e)}")
            error_event = {
                "type": "error",
                "data": {"error": str(e)},
                "user_message_id": user_message_id,
                "ai_message_id": ai_message_id
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


@router.get("/health")
async def health_check():
    """
    Health check endpoint for chat service.
    
    Returns:
        Health status
    """
    init_services()
    
    try:
        # Check if we can connect to Neo4j
        pages = storage_service.get_all_pages()
        
        return {
            "status": "healthy",
            "service": "chat",
            "neo4j_connected": True,
            "pages_count": len(pages)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "chat",
            "neo4j_connected": False,
            "error": str(e)
        }


@router.get("/messages/{session_id}")
async def get_chat_messages(session_id: str):
    """
    Get all chat messages for a session.

    Args:
        session_id: Session ID to retrieve messages for

    Returns:
        List of chat messages
    """
    init_services()

    try:
        messages = storage_service.get_chat_messages(session_id)
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages")
async def save_chat_message(message_data: dict):
    """
    Save a chat message to storage.

    Args:
        message_data: Message data to save

    Returns:
        Saved message with ID
    """
    init_services()

    try:
        # Extract session_id for Weave tracking
        session_id = message_data.get("sessionId")
        saved_message = storage_service.create_chat_message(message_data, session_id)
        return saved_message
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DeleteSessionRequest(BaseModel):
    """Request model for deleting a chat session"""
    requesting_session_id: Optional[str] = Field(None, description="Session ID of the user making the delete request")
    reason: Optional[str] = Field(None, description="Reason for deletion (optional)")


@router.delete("/messages/{session_id}")
async def delete_chat_messages(session_id: str, request: DeleteSessionRequest):
    """
    Delete all chat messages for a session with proper logging and session tracking.

    Args:
        session_id: Session ID to delete messages for
        request: Delete request with requesting user's session ID and optional reason

    Returns:
        Success status with deletion details
    """
    init_services()

    try:
        # Use requesting session ID as thread ID for Weave tracking
        requesting_session = request.requesting_session_id or "unknown_session"

        with weave.thread(requesting_session) as thread_ctx:
            print(f"🧵 Processing delete request in thread: {thread_ctx.thread_id}")

            # Add session metadata for the delete operation
            from app.utils.weave_utils import add_session_metadata
            add_session_metadata(
                session_id=requesting_session,
                operation_type="session_delete",
                target_session_id=session_id,
                reason=request.reason or "user_requested"
            )

            # Log the delete operation
            print(f"🗑️ Delete request details:")
            print(f"   Requesting session: {requesting_session}")
            print(f"   Target session to delete: {session_id}")
            print(f"   Reason: {request.reason or 'user_requested'}")

            # Get message count before deletion for logging
            try:
                messages = storage_service.get_chat_messages(session_id)
                message_count = len(messages)
                print(f"   Messages to delete: {message_count}")
            except Exception as e:
                message_count = "unknown"
                print(f"   Could not count messages: {str(e)}")

            # Perform the deletion
            deleted = storage_service.delete_chat_messages(session_id)

            if deleted:
                print(f"✅ Successfully deleted session {session_id} (requested by {requesting_session})")
                return {
                    "success": True,
                    "message": f"Deleted messages for session {session_id}",
                    "details": {
                        "deleted_session_id": session_id,
                        "requesting_session_id": requesting_session,
                        "message_count": message_count,
                        "reason": request.reason or "user_requested"
                    }
                }
            else:
                print(f"⚠️ No messages found to delete for session {session_id}")
                return {
                    "success": False,
                    "message": f"No messages found for session {session_id}",
                    "details": {
                        "deleted_session_id": session_id,
                        "requesting_session_id": requesting_session,
                        "message_count": 0,
                        "reason": request.reason or "user_requested"
                    }
                }

    except Exception as e:
        print(f"❌ Error deleting session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def get_recent_sessions(limit: int = 10):
    """
    Get recent chat sessions with their latest message.

    Args:
        limit: Maximum number of sessions to return (default: 10)

    Returns:
        List of recent sessions with metadata
    """
    init_services()

    try:
        sessions = storage_service.get_recent_sessions(limit)
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message-with-tools", response_model=ChatResponse)
async def chat_message_with_tools(request: ChatRequest):
    """
    Process a chat message using LLM tool calling.
    The LLM decides which tools to use based on the query.

    Args:
        request: Chat request with query and options

    Returns:
        Chat response with answer, sources, and metadata including tool usage
    """
    print(f"🔧 Chat API: Received tool calling request")
    print(f"   Query: '{request.query}'")
    print(f"   Session ID: {request.session_id}")

    init_services()

    try:
        # Use session_id as thread_id to track conversation context
        thread_id = request.session_id or "default_session"

        with weave.thread(thread_id) as thread_ctx:
            print(f"🧵 Processing tool calling in thread: {thread_ctx.thread_id}")

            # Process query with tool calling
            result = await tool_calling_service.process_query_with_tools(
                query=request.query,
                session_id=request.session_id,
                max_tool_calls=3
            )

            # Create comprehensive tool trace summary for Weave
            tool_trace_summary = create_tool_trace_summary(result["tool_calls_made"])

            # Store the interaction with enhanced tool metadata
            storage_service.create_chat_message(
                message_data={
                    "query": request.query,
                    "response": result["response"],
                    "sources": [],  # Tools provide their own context
                    "metadata": {
                        "tool_calls": result["tool_calls_made"],
                        "tools_used": result["metadata"]["tools_used"],
                        "num_tool_calls": result["metadata"]["num_tool_calls"],
                        "tool_trace_summary": tool_trace_summary,
                        "tool_calling_session": True,
                    }
                },
                session_id=request.session_id or "default"
            )

            return ChatResponse(
                response=result["response"],
                sources=[],
                metadata={
                    "session_id": request.session_id,
                    "thread_id": thread_ctx.thread_id,
                    "tool_calling": True,
                    "tool_calls_made": result["metadata"]["num_tool_calls"],
                    "tools_used": result["metadata"]["tools_used"],
                    "llm_tokens": result["metadata"]["llm_tokens"],
                    "tool_trace_summary": tool_trace_summary,
                    # Enhanced flags for Weave filtering
                    "search_courses_used": result["metadata"].get("search_courses_used", False),
                    "search_knowledge_used": result["metadata"].get("search_knowledge_used", False),
                    "learning_query": result["metadata"].get("learning_query", False),
                    "general_query": result["metadata"].get("general_query", False),
                }
            )

    except Exception as e:
        print(f"❌ Chat API: Tool calling failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Tool calling failed: {str(e)}")


@router.post("/stream-with-tools")
async def stream_chat_with_tools(request: ChatRequest):
    """
    Stream a chat response using LLM tool calling.
    The LLM decides which tools to use and streams the process.

    Args:
        request: Chat request with query and options

    Returns:
        Streaming response with tool execution and final answer
    """
    print(f"🔧 Chat API: Received streaming tool calling request")
    print(f"   Query: '{request.query}'")
    print(f"   Session ID: {request.session_id}")

    init_services()

    async def generate_tool_calling_stream():
        """Generate streaming response with tool calling."""
        try:
            # Use session_id as thread_id to track conversation context
            thread_id = request.session_id or "default_session"

            with weave.thread(thread_id) as thread_ctx:
                print(f"🧵 Processing streaming tool calling in thread: {thread_ctx.thread_id}")

                full_response = ""
                tool_calls_made = 0
                tools_used = []

                # Stream tool calling process
                async for event in tool_calling_service.process_query_with_tools_streaming(
                    query=request.query,
                    session_id=request.session_id,
                    max_tool_calls=3
                ):
                    # Send event to client
                    yield f"data: {json.dumps(event)}\n\n"

                    # Track response and tool usage
                    if event["type"] == "response":
                        full_response += event["data"]["text"]
                    elif event["type"] == "tool_execution_result":
                        tool_calls_made += 1
                        tool_name = event["data"]["tool_name"]
                        if tool_name not in tools_used:
                            tools_used.append(tool_name)

                # Store the interaction
                storage_service.create_chat_message(
                    message_data={
                        "query": request.query,
                        "response": full_response,
                        "sources": [],  # Tools provide their own context
                        "metadata": {
                            "tool_calls_made": tool_calls_made,
                            "tools_used": tools_used,
                            "streaming": True
                        }
                    },
                    session_id=request.session_id or "default"
                )

                # Send final completion event
                yield f"data: {json.dumps({'type': 'complete', 'data': {'session_id': request.session_id, 'thread_id': thread_ctx.thread_id}})}\n\n"

        except Exception as e:
            print(f"❌ Chat API: Streaming tool calling failed: {str(e)}")
            error_event = {
                "type": "error",
                "data": {"error": f"Streaming failed: {str(e)}"}
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        generate_tool_calling_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream"
        }
    )


@router.post("/message-with-strategy", response_model=ChatResponse)
async def chat_message_with_strategy(request: ChatRequest):
    """
    Process a chat message using the intelligent tool strategy.
    The system decides the best approach based on query analysis and configuration.

    Args:
        request: Chat request with query and options

    Returns:
        Chat response with answer, sources, and metadata including strategy used
    """
    print(f"🧠 Chat API: Received tool strategy request")
    print(f"   Query: '{request.query}'")
    print(f"   Session ID: {request.session_id}")

    init_services()

    try:
        # Use session_id as thread_id to track conversation context
        thread_id = request.session_id or "default_session"

        with weave.thread(thread_id) as thread_ctx:
            print(f"🧵 Processing tool strategy in thread: {thread_ctx.thread_id}")

            # Process query with tool strategy
            result = await tool_strategy_service.process_query(
                query=request.query,
                session_id=request.session_id,
                top_k=request.top_k
            )

            # Store the interaction with strategy metadata
            storage_service.create_chat_message(
                message_data={
                    "query": request.query,
                    "response": result["response"],
                    "sources": result.get("sources", []),
                    "metadata": {
                        **result["metadata"],
                        "tool_strategy_session": True,
                        "strategy_info": tool_strategy_service.get_strategy_info()
                    }
                },
                session_id=request.session_id or "default"
            )

            return ChatResponse(
                response=result["response"],
                sources=result.get("sources", []),
                metadata={
                    "session_id": request.session_id,
                    "thread_id": thread_ctx.thread_id,
                    "tool_strategy": True,
                    **result["metadata"]
                }
            )

    except Exception as e:
        print(f"❌ Chat API: Tool strategy failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Tool strategy failed: {str(e)}")


@router.post("/stream-with-strategy")
async def stream_chat_with_strategy(request: ChatRequest):
    """
    Stream a chat response using the intelligent tool strategy.
    The system decides the best approach and streams the process.

    Args:
        request: Chat request with query and options

    Returns:
        Streaming response with strategy decisions and execution
    """
    print(f"🧠 Chat API: Received streaming tool strategy request")
    print(f"   Query: '{request.query}'")
    print(f"   Session ID: {request.session_id}")

    init_services()

    async def generate_tool_strategy_stream():
        """Generate streaming response with tool strategy."""
        try:
            # Use session_id as thread_id to track conversation context
            thread_id = request.session_id or "default_session"

            with weave.thread(thread_id) as thread_ctx:
                print(f"🧵 Processing streaming tool strategy in thread: {thread_ctx.thread_id}")

                full_response = ""
                strategy_metadata = {}

                # Stream tool strategy process
                async for event in tool_strategy_service.process_query_streaming(
                    query=request.query,
                    session_id=request.session_id,
                    top_k=request.top_k
                ):
                    # Send event to client
                    yield f"data: {json.dumps(event)}\n\n"

                    # Track response and strategy usage
                    if event["type"] == "response":
                        full_response += event["data"]["text"]
                    elif event["type"] in ["classification", "strategy_decision", "metadata"]:
                        strategy_metadata.update(event["data"])

                # Store the interaction
                storage_service.create_chat_message(
                    message_data={
                        "query": request.query,
                        "response": full_response,
                        "sources": [],
                        "metadata": {
                            **strategy_metadata,
                            "streaming": True,
                            "tool_strategy_session": True,
                            "strategy_info": tool_strategy_service.get_strategy_info()
                        }
                    },
                    session_id=request.session_id or "default"
                )

                # Send final completion event
                yield f"data: {json.dumps({'type': 'complete', 'data': {'session_id': request.session_id, 'thread_id': thread_ctx.thread_id, 'strategy_info': tool_strategy_service.get_strategy_info()}})}\n\n"

        except Exception as e:
            print(f"❌ Chat API: Streaming tool strategy failed: {str(e)}")
            error_event = {
                "type": "error",
                "data": {"error": f"Streaming failed: {str(e)}"}
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        generate_tool_strategy_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream"
        }
    )


@router.get("/tool-strategy-info")
async def get_tool_strategy_info():
    """
    Get information about the current tool strategy configuration.

    Returns:
        Tool strategy configuration and status
    """
    init_services()

    try:
        strategy_info = tool_strategy_service.get_strategy_info()

        return {
            "status": "active",
            "configuration": strategy_info,
            "available_strategies": [strategy.value for strategy in ToolStrategy],
            "endpoints": {
                "strategy_chat": "/message-with-strategy",
                "strategy_stream": "/stream-with-strategy",
                "tool_chat": "/message-with-tools",
                "tool_stream": "/stream-with-tools",
                "enhanced_rag": "/message",
                "enhanced_rag_stream": "/stream"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get strategy info: {str(e)}")

