"""
Functional tests for chat conversation flow

These tests verify multi-turn conversations and session management.
"""
import pytest
from unittest.mock import Mock, AsyncMock
from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService


@pytest.fixture
def mock_storage():
    """Create a mock storage service"""
    storage = Mock(spec=StorageService)

    # Mock search_by_vector to return different results based on query
    def search_side_effect(embedding, limit, min_score):
        # Simulate different results for different queries
        return [
            {
                "chunk_id": "chunk1",
                "text": "Sample context text.",
                "chunk_index": 0,
                "page_id": "page1",
                "url": "https://example.com/doc",
                "title": "Documentation",
                "domain": "example.com",
                "score": 0.90
            }
        ]

    storage.search_by_vector = Mock(side_effect=search_side_effect)

    # Mock get_related_chunks to return empty list (no expansion)
    storage.get_related_chunks = Mock(return_value=[])

    return storage


@pytest.fixture
def mock_llm():
    """Create a mock LLM service"""
    llm = Mock(spec=LLMService)
    
    # Mock generate_embedding
    llm.generate_embedding = AsyncMock(return_value=[0.1] * 768)
    
    # Track call count for different responses
    call_count = {"count": 0}
    
    async def mock_completion(*args, **kwargs):
        call_count["count"] += 1
        responses = [
            "This is the first response.",
            "This is the second response.",
            "This is the third response."
        ]
        idx = min(call_count["count"] - 1, len(responses) - 1)
        return {
            "text": responses[idx],
            "tokens": 10,
            "model": "qwen3:0.6b",
            "provider": "ollama"
        }
    
    llm.generate_completion = mock_completion
    
    return llm


class TestChatFlow:
    """Functional tests for chat conversation flow"""
    
    @pytest.mark.asyncio
    async def test_single_turn_conversation(self, mock_storage, mock_llm):
        """Test a single-turn conversation"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Single query
        result = await rag.process_query(
            query="What is this?",
            session_id="session-1",
            top_k=3
        )
        
        # Verify response
        assert "response" in result
        assert len(result["response"]) > 0
        assert result["metadata"]["session_id"] == "session-1"
    
    @pytest.mark.asyncio
    async def test_multi_turn_conversation(self, mock_storage, mock_llm):
        """Test a multi-turn conversation with same session"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        session_id = "session-multi"
        
        # First turn
        result1 = await rag.process_query(
            query="What is Weave?",
            session_id=session_id,
            top_k=3
        )
        
        # Second turn
        result2 = await rag.process_query(
            query="How does it work?",
            session_id=session_id,
            top_k=3
        )
        
        # Third turn
        result3 = await rag.process_query(
            query="What are its features?",
            session_id=session_id,
            top_k=3
        )
        
        # Verify all responses
        assert result1["metadata"]["session_id"] == session_id
        assert result2["metadata"]["session_id"] == session_id
        assert result3["metadata"]["session_id"] == session_id
        
        # Verify different responses
        assert result1["response"] != result2["response"]
        assert result2["response"] != result3["response"]
    
    @pytest.mark.asyncio
    async def test_multiple_sessions(self, mock_storage, mock_llm):
        """Test multiple independent sessions"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Session 1
        result1 = await rag.process_query(
            query="Question 1",
            session_id="session-1",
            top_k=3
        )
        
        # Session 2
        result2 = await rag.process_query(
            query="Question 2",
            session_id="session-2",
            top_k=3
        )
        
        # Verify different sessions
        assert result1["metadata"]["session_id"] == "session-1"
        assert result2["metadata"]["session_id"] == "session-2"
    
    @pytest.mark.asyncio
    async def test_conversation_without_session_id(self, mock_storage, mock_llm):
        """Test conversation without session ID"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Query without session ID
        result = await rag.process_query(
            query="What is this?",
            session_id=None,
            top_k=3
        )
        
        # Verify response
        assert "response" in result
        assert result["metadata"]["session_id"] is None
    
    @pytest.mark.asyncio
    async def test_conversation_with_different_top_k(self, mock_storage, mock_llm):
        """Test conversation with different top_k values"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Query with top_k=1
        result1 = await rag.process_query(
            query="Question 1",
            session_id="session-1",
            top_k=1
        )
        
        # Query with top_k=5
        result2 = await rag.process_query(
            query="Question 2",
            session_id="session-1",
            top_k=5
        )
        
        # Verify both work
        assert "response" in result1
        assert "response" in result2
    
    @pytest.mark.asyncio
    async def test_conversation_context_retrieval(self, mock_storage, mock_llm):
        """Test that context is retrieved for each query"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query
        result = await rag.process_query(
            query="What is this?",
            session_id="session-1",
            top_k=3
        )
        
        # Verify context was retrieved
        assert result["metadata"]["num_chunks"] > 0
        assert len(result["sources"]) > 0
        
        # Verify storage was called
        assert mock_storage.search_by_vector.called
    
    @pytest.mark.asyncio
    async def test_conversation_llm_generation(self, mock_storage, mock_llm):
        """Test that LLM generates response for each query"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        # Process query
        result = await rag.process_query(
            query="What is this?",
            session_id="session-1",
            top_k=3
        )
        
        # Verify LLM was called
        assert result["metadata"]["tokens"] > 0
        assert result["metadata"]["model"] == "qwen3:0.6b"
        assert result["metadata"]["provider"] == "ollama"
    
    @pytest.mark.asyncio
    async def test_conversation_metadata_tracking(self, mock_storage, mock_llm):
        """Test that metadata is properly tracked across conversation"""
        # Create services
        retrieval = RetrievalService(storage=mock_storage, llm_service=mock_llm)
        rag = RAGService(retrieval_service=retrieval, llm_service=mock_llm)
        
        session_id = "session-metadata"
        
        # Multiple queries
        results = []
        for i in range(3):
            result = await rag.process_query(
                query=f"Question {i+1}",
                session_id=session_id,
                top_k=3
            )
            results.append(result)
        
        # Verify all have same session ID
        for result in results:
            assert result["metadata"]["session_id"] == session_id
        
        # Verify all have metadata
        for result in results:
            assert "num_chunks" in result["metadata"]
            assert "num_sources" in result["metadata"]
            assert "model" in result["metadata"]
            assert "tokens" in result["metadata"]
            assert "provider" in result["metadata"]

