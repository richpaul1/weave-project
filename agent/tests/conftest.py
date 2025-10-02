"""
Pytest configuration and fixtures for all tests
"""
import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from typing import List, Dict, Any
from fastapi.testclient import TestClient


# ============================================================================
# Mock Data Fixtures
# ============================================================================

@pytest.fixture
def sample_embedding() -> List[float]:
    """Sample embedding vector"""
    return [0.1] * 768  # Typical embedding dimension


@pytest.fixture
def sample_page() -> Dict[str, Any]:
    """Sample page data"""
    return {
        "id": "page-123",
        "url": "https://example.com/test",
        "domain": "example.com",
        "slug": "test",
        "title": "Test Page",
        "createdAt": "2024-01-01T00:00:00Z"
    }


@pytest.fixture
def sample_chunk() -> Dict[str, Any]:
    """Sample chunk data"""
    return {
        "chunk_id": "chunk-123",
        "text": "This is a test chunk with some content.",
        "chunk_index": 0,
        "page_id": "page-123",
        "url": "https://example.com/test",
        "title": "Test Page",
        "domain": "example.com",
        "score": 0.95
    }


@pytest.fixture
def sample_chunks(sample_chunk) -> List[Dict[str, Any]]:
    """Sample list of chunks"""
    return [
        sample_chunk,
        {
            **sample_chunk,
            "chunk_id": "chunk-124",
            "text": "Another test chunk with different content.",
            "chunk_index": 1,
            "score": 0.85
        },
        {
            **sample_chunk,
            "chunk_id": "chunk-125",
            "text": "Third test chunk with more information.",
            "chunk_index": 2,
            "score": 0.75
        }
    ]


@pytest.fixture
def sample_context_text() -> str:
    """Sample context text"""
    return """[Source 1] Test Page (https://example.com/test)
Relevance: 0.95
This is a test chunk with some content.

---

[Source 2] Test Page (https://example.com/test)
Relevance: 0.85
Another test chunk with different content."""


# ============================================================================
# Mock Service Fixtures
# ============================================================================

@pytest.fixture
def mock_neo4j_driver():
    """Mock Neo4j driver"""
    driver = Mock()
    session = Mock()
    
    # Mock session context manager
    driver.session.return_value.__enter__ = Mock(return_value=session)
    driver.session.return_value.__exit__ = Mock(return_value=None)
    
    return driver


@pytest.fixture
def mock_neo4j_session(mock_neo4j_driver):
    """Mock Neo4j session"""
    return mock_neo4j_driver.session.return_value.__enter__.return_value


@pytest.fixture
def mock_storage_service(sample_page, sample_chunks):
    """Mock StorageService"""
    storage = Mock()
    storage.connect = Mock()
    storage.close = Mock()
    storage.get_all_pages = Mock(return_value=[sample_page])
    storage.get_page_by_id = Mock(return_value=sample_page)
    storage.get_page_chunks = Mock(return_value=sample_chunks)
    storage.search_by_vector = Mock(return_value=sample_chunks)
    storage.get_chunk_by_id = Mock(return_value=sample_chunks[0])
    storage.get_related_chunks = Mock(return_value=sample_chunks[1:])

    # Add get_relevant_pages for functional tests
    storage.get_relevant_pages = Mock(return_value=[sample_page])

    # Add load_markdown_from_file for functional tests
    storage.load_markdown_from_file = AsyncMock(return_value="Test markdown content for Weave testing.")

    return storage


@pytest.fixture
def mock_llm_service(sample_embedding):
    """Mock LLMService"""
    llm = Mock()
    
    # Mock async methods
    llm.generate_completion = AsyncMock(return_value={
        "text": "This is a test response.",
        "model": "test-model",
        "tokens": 10,
        "provider": "test"
    })
    
    llm.generate_embedding = AsyncMock(return_value=sample_embedding)
    
    async def mock_streaming():
        """Mock streaming generator"""
        for chunk in ["This ", "is ", "a ", "test ", "response."]:
            yield chunk
    
    llm.generate_streaming = Mock(return_value=mock_streaming())
    
    return llm


@pytest.fixture
def mock_retrieval_service(sample_chunks):
    """Mock RetrievalService"""
    retrieval = Mock()

    retrieval.retrieve_context = AsyncMock(return_value={
        "chunks": sample_chunks,
        "sources": [
            {
                "url": "https://example.com/test",
                "title": "Test Page",
                "domain": "example.com"
            }
        ],
        "context_text": "Test context",
        "num_chunks": len(sample_chunks),
        "num_sources": 1
    })

    # Also mock retrieve_page_context for streaming tests
    sample_pages = [
        {
            "id": "test-page-1",
            "url": "https://example.com/test",
            "title": "Test Page",
            "domain": "example.com",
            "score": 0.95,
            "content": "This is test page content for Weave testing."
        }
    ]

    retrieval.retrieve_page_context = AsyncMock(return_value={
        "pages": sample_pages,
        "sources": [
            {
                "url": "https://example.com/test",
                "title": "Test Page",
                "domain": "example.com"
            }
        ],
        "context_text": "Test context",
        "num_pages": len(sample_pages),
        "num_sources": 1
    })

    return retrieval


@pytest.fixture
def mock_rag_service():
    """Mock RAGService"""
    rag = Mock()
    
    rag.process_query = AsyncMock(return_value={
        "response": "This is a test response.",
        "sources": [
            {
                "url": "https://example.com/test",
                "title": "Test Page",
                "domain": "example.com"
            }
        ],
        "metadata": {
            "session_id": "test-session",
            "num_chunks": 3,
            "num_sources": 1,
            "model": "test-model",
            "tokens": 10,
            "provider": "test"
        }
    })
    
    async def mock_streaming():
        """Mock streaming generator"""
        yield {"type": "context", "data": {"sources": [], "num_chunks": 3}}
        yield {"type": "chunk", "data": {"text": "Test "}}
        yield {"type": "chunk", "data": {"text": "response"}}
        yield {
            "type": "done",
            "data": {
                "response": "Test response",
                "sources": [],
                "metadata": {}
            }
        }
    
    rag.process_query_streaming = Mock(return_value=mock_streaming())
    
    return rag


@pytest.fixture
def mock_hallucination_service():
    """Mock HallucinationService"""
    hallucination = Mock()
    
    hallucination.detect_hallucination = AsyncMock(return_value={
        "score": 0.0,
        "supported_claims": ["Claim 1", "Claim 2"],
        "partially_supported_claims": [],
        "unsupported_claims": [],
        "total_claims": 2,
        "details": []
    })
    
    return hallucination


# ============================================================================
# FastAPI Test Client Fixture
# ============================================================================

@pytest.fixture
def test_client():
    """FastAPI test client"""
    from app.main import app
    return TestClient(app)


# ============================================================================
# Integration Test Fixtures
# ============================================================================

@pytest.fixture
def real_storage_service():
    """Real StorageService for integration tests"""
    from app.services.storage import StorageService
    storage = StorageService()
    storage.connect()
    yield storage
    storage.close()


@pytest.fixture
def real_llm_service():
    """Real LLMService for integration tests"""
    from app.services.llm_service import LLMService
    return LLMService(provider="ollama")

