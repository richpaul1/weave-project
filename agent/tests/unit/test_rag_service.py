"""
Unit tests for RAGService

Mocks retrieval and LLM services to test RAG operations.
"""
import pytest
from unittest.mock import Mock, AsyncMock
from app.services.rag_service import RAGService


class TestRAGService:
    """Test cases for RAGService"""
    
    def test_init(self, mock_retrieval_service, mock_llm_service):
        """Test RAGService initialization"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        assert rag.retrieval_service == mock_retrieval_service
        assert rag.llm_service == mock_llm_service
    
    @pytest.mark.asyncio
    async def test_process_query(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test processing a query through RAG pipeline"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        result = await rag.process_query(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        )
        
        assert "response" in result
        assert "sources" in result
        assert "metadata" in result
        
        # Verify retrieval service was called
        mock_retrieval_service.retrieve_context.assert_called_once()
        
        # Verify LLM service was called
        mock_llm_service.generate_completion.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_process_query_streaming(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test processing a query with streaming response"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        events = []
        async for event in rag.process_query_streaming(
            query="What is Weave?",
            session_id="test-session",
            top_k=5
        ):
            events.append(event)
        
        # Should have context, response, and done events
        assert len(events) > 0
        assert any(e["type"] == "context" for e in events)
        assert any(e["type"] == "response" for e in events)
        assert any(e["type"] == "done" for e in events)

        # Verify retrieval service was called
        mock_retrieval_service.retrieve_context.assert_called_once()
    
    def test_build_prompt(
        self,
        mock_retrieval_service,
        mock_llm_service,
        sample_context_text
    ):
        """Test building prompt with context"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        prompt = rag._build_prompt(
            query="What is Weave?",
            context=sample_context_text
        )
        
        assert "What is Weave?" in prompt
        assert sample_context_text in prompt
        assert "Context:" in prompt
        assert "Question:" in prompt
    
    def test_post_process_response(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test post-processing LLM response"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        # Test removing leading/trailing whitespace
        response = rag._post_process_response("  Test response  ")
        assert response == "Test response"
        
        # Test removing "Answer:" prefix
        response = rag._post_process_response("Answer: Test response")
        assert response == "Test response"
        
        # Test case-insensitive "answer:" removal
        response = rag._post_process_response("answer: Test response")
        assert response == "Test response"
    
    @pytest.mark.asyncio
    async def test_process_query_with_metadata(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test that metadata is properly included in response"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        result = await rag.process_query(
            query="Test query",
            session_id="test-session-123",
            top_k=3
        )
        
        assert result["metadata"]["session_id"] == "test-session-123"
        assert "num_chunks" in result["metadata"]
        assert "num_sources" in result["metadata"]
        assert "model" in result["metadata"]
        assert "tokens" in result["metadata"]
    
    @pytest.mark.asyncio
    async def test_process_query_no_session_id(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test processing query without session ID"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        result = await rag.process_query(
            query="Test query",
            top_k=5
        )
        
        assert result["metadata"]["session_id"] is None
    
    @pytest.mark.asyncio
    async def test_process_query_custom_top_k(
        self,
        mock_retrieval_service,
        mock_llm_service
    ):
        """Test processing query with custom top_k"""
        rag = RAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service
        )
        
        await rag.process_query(
            query="Test query",
            top_k=10
        )
        
        # Verify retrieval was called with correct top_k
        call_args = mock_retrieval_service.retrieve_context.call_args
        assert call_args[1]["top_k"] == 10

