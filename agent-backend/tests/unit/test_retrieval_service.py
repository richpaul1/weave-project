"""
Unit tests for RetrievalService

Mocks storage and LLM services to test retrieval operations.
"""
import pytest
from unittest.mock import Mock, AsyncMock
from app.services.retrieval_service import RetrievalService


class TestRetrievalService:
    """Test cases for RetrievalService"""
    
    def test_init(self, mock_storage_service, mock_llm_service):
        """Test RetrievalService initialization"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        assert retrieval.storage == mock_storage_service
        assert retrieval.llm_service == mock_llm_service
    
    @pytest.mark.asyncio
    async def test_retrieve_context(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks,
        sample_embedding
    ):
        """Test retrieving context for a query"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        result = await retrieval.retrieve_context(
            query="Test query",
            top_k=5,
            expand_context=False
        )
        
        assert "chunks" in result
        assert "sources" in result
        assert "context_text" in result
        assert "num_chunks" in result
        assert "num_sources" in result
        
        # Verify LLM service was called to generate embedding
        mock_llm_service.generate_embedding.assert_called_once_with("Test query")
        
        # Verify storage service was called to search
        mock_storage_service.search_by_vector.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_retrieve_context_with_expansion(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks
    ):
        """Test retrieving context with graph expansion"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        result = await retrieval.retrieve_context(
            query="Test query",
            top_k=5,
            expand_context=True
        )
        
        assert "chunks" in result
        # Should have called get_related_chunks for expansion
        assert mock_storage_service.get_related_chunks.called
    
    @pytest.mark.asyncio
    async def test_expand_context_graph(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks
    ):
        """Test expanding context using graph traversal"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        expanded = await retrieval._expand_context_graph(
            chunks=sample_chunks[:1],  # Start with one chunk
            max_additional=3
        )
        
        # Should have more chunks than we started with
        assert len(expanded) > 1
        
        # Verify get_related_chunks was called
        mock_storage_service.get_related_chunks.assert_called()
    
    def test_rank_context(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks
    ):
        """Test ranking and filtering chunks"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        ranked = retrieval._rank_context(
            chunks=sample_chunks,
            query="Test query"
        )
        
        # Should be sorted by score (descending)
        assert ranked[0]["score"] >= ranked[1]["score"]
        assert ranked[1]["score"] >= ranked[2]["score"]
    
    def test_rank_context_filters_low_scores(
        self,
        mock_storage_service,
        mock_llm_service
    ):
        """Test that low-scoring chunks are filtered out"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        chunks = [
            {"text": "High score", "score": 0.9},
            {"text": "Medium score", "score": 0.75},
            {"text": "Low score", "score": 0.3}  # Below MIN_RELEVANCE_SCORE
        ]
        
        ranked = retrieval._rank_context(chunks=chunks, query="Test")
        
        # Low score chunk should be filtered out
        assert len(ranked) < len(chunks)
        assert all(chunk["score"] >= 0.7 for chunk in ranked)
    
    def test_build_context_text(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks
    ):
        """Test building formatted context text"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        context_text = retrieval._build_context_text(sample_chunks)
        
        assert len(context_text) > 0
        assert "[Source 1]" in context_text
        assert sample_chunks[0]["text"] in context_text
        assert sample_chunks[0]["url"] in context_text
    
    def test_build_context_text_empty(
        self,
        mock_storage_service,
        mock_llm_service
    ):
        """Test building context text with no chunks"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        context_text = retrieval._build_context_text([])
        
        assert context_text == ""
    
    def test_extract_sources(
        self,
        mock_storage_service,
        mock_llm_service,
        sample_chunks
    ):
        """Test extracting unique sources from chunks"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        sources = retrieval._extract_sources(sample_chunks)
        
        # All sample chunks are from the same page, so should have 1 source
        assert len(sources) == 1
        assert sources[0]["url"] == sample_chunks[0]["url"]
        assert sources[0]["title"] == sample_chunks[0]["title"]
    
    def test_extract_sources_multiple_pages(
        self,
        mock_storage_service,
        mock_llm_service
    ):
        """Test extracting sources from chunks from multiple pages"""
        retrieval = RetrievalService(
            storage=mock_storage_service,
            llm_service=mock_llm_service
        )
        
        chunks = [
            {"url": "https://example.com/page1", "title": "Page 1", "domain": "example.com"},
            {"url": "https://example.com/page2", "title": "Page 2", "domain": "example.com"},
            {"url": "https://example.com/page1", "title": "Page 1", "domain": "example.com"}
        ]
        
        sources = retrieval._extract_sources(chunks)
        
        # Should have 2 unique sources
        assert len(sources) == 2
        assert any(s["url"] == "https://example.com/page1" for s in sources)
        assert any(s["url"] == "https://example.com/page2" for s in sources)

