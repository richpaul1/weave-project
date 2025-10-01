"""
Chat API Routes

Handles chat requests for the RAG pipeline.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService
from app.services.hallucination_service import HallucinationService


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
hallucination_service: Optional[HallucinationService] = None


def init_services():
    """Initialize all services"""
    global storage_service, llm_service, retrieval_service, rag_service, hallucination_service
    
    if storage_service is None:
        storage_service = StorageService()
        storage_service.connect()
        
        llm_service = LLMService(provider="ollama")
        
        retrieval_service = RetrievalService(
            storage=storage_service,
            llm_service=llm_service
        )
        
        rag_service = RAGService(
            retrieval_service=retrieval_service,
            llm_service=llm_service
        )
        
        hallucination_service = HallucinationService(
            llm_service=llm_service
        )


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest):
    """
    Process a chat message and return a response.
    
    Args:
        request: Chat request with query and options
        
    Returns:
        Chat response with answer, sources, and metadata
    """
    init_services()
    
    try:
        # Process query through RAG pipeline
        result = await rag_service.process_query(
            query=request.query,
            session_id=request.session_id,
            top_k=request.top_k
        )
        
        # Run hallucination detection
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
    Process a chat message and stream the response.
    
    Args:
        request: Chat request with query and options
        
    Returns:
        Server-Sent Events stream with response chunks
    """
    init_services()
    
    async def event_generator():
        """Generate SSE events"""
        try:
            async for event in rag_service.process_query_streaming(
                query=request.query,
                session_id=request.session_id,
                top_k=request.top_k
            ):
                # Format as SSE
                yield f"data: {json.dumps(event)}\n\n"
                
        except Exception as e:
            error_event = {
                "type": "error",
                "data": {"error": str(e)}
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
        saved_message = storage_service.create_chat_message(message_data)
        return saved_message
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/messages/{session_id}")
async def delete_chat_messages(session_id: str):
    """
    Delete all chat messages for a session.

    Args:
        session_id: Session ID to delete messages for

    Returns:
        Success status
    """
    init_services()

    try:
        deleted = storage_service.delete_chat_messages(session_id)
        return {"success": deleted, "message": f"Deleted messages for session {session_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

