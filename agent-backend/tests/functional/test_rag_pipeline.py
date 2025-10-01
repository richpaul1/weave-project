"""
Functional tests for the complete RAG pipeline

These tests verify the full RAG workflow with mocked external services.
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService
from app.services.hallucination_service import HallucinationService


@pytest.fixture
def mock_storage():
    """Create a mock storage service"""
    storage = Mock(spec=StorageService)

    # Mock search_by_vector to return sample chunks
    storage.search_by_vector = Mock(return_value=[
        {
            "chunk_id": "chunk1",
            "text": "Weave is a lightweight toolkit for tracking and evaluating LLM applications.",
            "chunk_index": 0,
            "page_id": "page1",
            "url": "https://example.com/weave",
            "title": "Weave Documentation",
            "domain": "example.com",
            "score": 0.95
        },
        {
            "chunk_id": "chunk2",
            "text": "Weave provides automatic logging of LLM calls and traces.",
            "chunk_index": 1,
            "page_id": "page1",
            "url": "https://example.com/weave",
            "title": "Weave Documentation",
            "domain": "example.com",
            "score": 0.90
        }
    ])

    # Mock get_related_chunks to return empty list (no expansion)
    storage.get_related_chunks = Mock(return_value=[])

    return storage


@pytest.fixture
def mock_llm():
    """Create a mock LLM service"""
    llm = Mock(spec=LLMService)
    
    # Mock generate_embedding
    llm.generate_embedding = AsyncMock(return_value=[0.1] * 768)
    
    # Mock generate_completion
    llm.generate_completion = AsyncMock(return_value={
        "text": "Weave is a lightweight toolkit for tracking and evaluating LLM applications. It provides automatic logging of LLM calls and traces.",
        "tokens": 25,
        "model": "qwen3:0.6b",
        "provider": "ollama"
    })
    
    # Mock generate_streaming
    async def mock_streaming(*args, **kwargs):
        chunks = ["Weave ", "is ", "a ", "toolkit."]
        for chunk in chunks:
            yield chunk
    
    llm.generate_streaming = mock_streaming
    
    return llm


class TestRAGPipeline:
    """Functional tests for the complete RAG pipeline"""
    
    @pytest.mark.asyncio
    async def test_full_rag_pipeline(self, mock_storage, mock_llm):
        """Test the complete RAG pipeline from query to response"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query
        result = await rag.process_query(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        )
        
        # Verify result structure
        assert "response" in result
        assert "sources" in result
        assert "metadata" in result
        
        # Verify response content
        assert len(result["response"]) > 0
        assert "Weave" in result["response"]
        
        # Verify sources
        assert len(result["sources"]) > 0
        assert result["sources"][0]["url"] == "https://example.com/weave"
        
        # Verify metadata
        assert result["metadata"]["session_id"] == "test-session"
        assert result["metadata"]["num_chunks"] == 2
        assert result["metadata"]["model"] == "qwen3:0.6b"
    
    @pytest.mark.asyncio
    async def test_rag_pipeline_with_streaming(self, mock_storage, mock_llm):
        """Test RAG pipeline with streaming response"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query with streaming
        events = []
        async for event in rag.process_query_streaming(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        ):
            events.append(event)
        
        # Verify events
        assert len(events) > 0
        
        # First event should be context
        assert events[0]["type"] == "context"
        assert "sources" in events[0]["data"]
        
        # Middle events should be chunks
        chunk_events = [e for e in events if e["type"] == "chunk"]
        assert len(chunk_events) > 0
        
        # Last event should be done
        assert events[-1]["type"] == "done"
        assert "metadata" in events[-1]["data"]
    
    @pytest.mark.asyncio
    async def test_rag_pipeline_with_hallucination_detection(self, mock_storage, mock_llm):
        """Test RAG pipeline with hallucination detection"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        hallucination = HallucinationService(llm_service=mock_llm)
        
        # Mock hallucination detection
        mock_llm.generate_completion = AsyncMock(side_effect=[
            # First call: RAG response
            {
                "text": "Weave is a toolkit for LLM applications.",
                "tokens": 10,
                "model": "qwen3:0.6b",
                "provider": "ollama"
            },
            # Second call: Extract facts
            {
                "text": "Weave is a toolkit for LLM applications.",
                "tokens": 10,
                "model": "qwen3:0.6b",
                "provider": "ollama"
            },
            # Third call: Verify fact
            {
                "text": "SUPPORTED",
                "tokens": 5,
                "model": "qwen3:0.6b",
                "provider": "ollama"
            }
        ])
        
        # Process query
        result = await rag.process_query(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        )
        
        # Run hallucination detection
        hallucination_result = await hallucination.detect_hallucination(
            response=result["response"],
            context="Weave is a toolkit for LLM applications."
        )
        
        # Verify hallucination detection
        assert "score" in hallucination_result
        assert "supported_claims" in hallucination_result
        assert "unsupported_claims" in hallucination_result
        assert hallucination_result["score"] == 0.0  # All supported
    
    @pytest.mark.asyncio
    async def test_rag_pipeline_with_no_context(self, mock_storage, mock_llm):
        """Test RAG pipeline when no relevant context is found"""
        # Mock empty search results
        mock_storage.search_by_vector = Mock(return_value=[])
        
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query
        result = await rag.process_query(
            query="What is XYZ?",
            session_id="test-session",
            top_k=5
        )
        
        # Verify result
        assert "response" in result
        assert "sources" in result
        assert len(result["sources"]) == 0
        assert result["metadata"]["num_chunks"] == 0
    
    @pytest.mark.asyncio
    async def test_rag_pipeline_error_handling(self, mock_storage, mock_llm):
        """Test RAG pipeline error handling"""
        # Mock LLM error
        mock_llm.generate_completion = AsyncMock(
            side_effect=Exception("LLM service unavailable")
        )

        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)

        # Process query should raise exception
        with pytest.raises(Exception):
            await rag.process_query(
                query="What is Weave?",
                session_id="test-session",
                top_k=5
            )
    
    @pytest.mark.asyncio
    async def test_rag_pipeline_with_multiple_sources(self, mock_storage, mock_llm):
        """Test RAG pipeline with chunks from multiple sources"""
        # Mock search results from multiple pages
        mock_storage.search_by_vector = Mock(return_value=[
            {
                "chunk_id": "chunk1",
                "text": "Weave is a toolkit.",
                "chunk_index": 0,
                "page_id": "page1",
                "url": "https://example.com/weave",
                "title": "Weave Docs",
                "domain": "example.com",
                "score": 0.95
            },
            {
                "chunk_id": "chunk2",
                "text": "Weave provides logging.",
                "chunk_index": 0,
                "page_id": "page2",
                "url": "https://example.com/features",
                "title": "Weave Features",
                "domain": "example.com",
                "score": 0.90
            }
        ])
        
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query
        result = await rag.process_query(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        )
        
        # Verify multiple sources
        assert len(result["sources"]) == 2
        assert result["sources"][0]["url"] != result["sources"][1]["url"]
        assert result["metadata"]["num_sources"] == 2

