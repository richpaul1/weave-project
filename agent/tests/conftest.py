"""
Pytest configuration and fixtures for all tests
"""
import pytest
import sys
import os
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from typing import List, Dict, Any
from fastapi.testclient import TestClient

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set environment variables before any imports to prevent import-time errors
os.environ.update({
    # Neo4j Configuration
    'NEO4J_URI': 'neo4j://localhost:7687',
    'NEO4J_USER': 'test_user',
    'NEO4J_PASSWORD': 'test_password',
    'NEO4J_DB_NAME': 'test_db',

    # LLM Configuration
    'OLLAMA_BASE_URL': 'http://localhost:11434',
    'OLLAMA_MODEL': 'test-model',
    'OLLAMA_EMBEDDING_MODEL': 'test-embedding-model',
    'OPENAI_API_KEY': 'test-openai-key',  # Set a test key to prevent validation errors
    'OPENAI_MODEL': 'gpt-4',
    'OPENAI_EMBEDDING_MODEL': 'text-embedding-3-small',

    # Weave Configuration
    'WANDB_PROJECT': 'test-project',
    'WANDB_ENTITY': 'test-entity',
    'WANDB_API_KEY': '',

    # RAG Configuration
    'RAG_TOP_K': '5',
    'RAG_MAX_CONTEXT_LENGTH': '4000',
    'RAG_MIN_RELEVANCE_SCORE': '0.7',
    'LLM_MAX_TOKENS': '2000',
    'LLM_TEMPERATURE': '0.7',

    # Server Configuration
    'AGENT_BACKEND_PORT': '8051',
    'AGENT_CLIENT_PORT': '8050'
})




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

    # Add context manager support for _get_session
    class MockSession:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            return None
        def run(self, query, params=None, **kwargs):
            # Mock result with records - return some sample courses for tests
            mock_result = Mock()

            # Create mock course records
            mock_records = []
            if "machine learning" in query.lower() or "python" in query.lower():
                course_data = [
                    {
                        "title": "Machine Learning Fundamentals",
                        "description": "Learn the basics of machine learning",
                        "difficulty": "Beginner",
                        "instructor": "Dr. Smith",
                        "url": "https://example.com/ml-course",
                        "isActive": True,
                        "topics": ["machine learning", "AI", "algorithms"]
                    },
                    {
                        "title": "Advanced Python Programming",
                        "description": "Master advanced Python concepts",
                        "difficulty": "Advanced",
                        "instructor": "Prof. Johnson",
                        "url": "https://example.com/python-course",
                        "isActive": True,
                        "topics": ["python", "programming", "advanced"]
                    },
                    {
                        "title": "Data Science with Python",
                        "description": "Learn data science using Python",
                        "difficulty": "Intermediate",
                        "instructor": "Dr. Brown",
                        "url": "https://example.com/ds-course",
                        "isActive": True,
                        "topics": ["data science", "python", "analytics"]
                    }
                ]

                for course_dict in course_data:
                    # Create a mock course node that behaves like a Neo4j node
                    class MockCourseNode:
                        def __init__(self, data):
                            self._data = data

                        def __iter__(self):
                            return iter(self._data.keys())

                        def __getitem__(self, key):
                            return self._data[key]

                        def keys(self):
                            return self._data.keys()

                        def values(self):
                            return self._data.values()

                        def items(self):
                            return self._data.items()

                    mock_course_node = MockCourseNode(course_dict)

                    # Create a mock record
                    mock_record = Mock()
                    mock_record.__getitem__ = Mock(side_effect=lambda key, node=mock_course_node: node if key == "c" else None)
                    mock_records.append(mock_record)

            mock_result.__iter__ = Mock(return_value=iter(mock_records))
            return mock_result
        def execute_read(self, query, params=None, **kwargs):
            mock_result = Mock()
            mock_result.__iter__ = Mock(return_value=iter([]))
            return mock_result
        def execute_write(self, query, params=None, **kwargs):
            mock_result = Mock()
            mock_result.__iter__ = Mock(return_value=iter([]))
            return mock_result

    storage._get_session = Mock(return_value=MockSession())

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
    
    # Mock async methods with AsyncMock for proper assertion support
    llm.generate_embedding = AsyncMock(return_value=sample_embedding)

    # Mock tool calling method
    llm.generate_completion_with_tools = AsyncMock(return_value={
        "tool_calls": []  # No tool calls by default
    })

    async def mock_generate(*args, **kwargs):
        """Mock text generation"""
        return "This is a mock response."

    async def mock_streaming(*args, **kwargs):
        """Mock streaming generator"""
        for chunk in ["This ", "is ", "a ", "test ", "response."]:
            yield chunk
    llm.generate = mock_generate
    llm.generate_streaming = mock_streaming
    
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


@pytest.fixture
def admin_backend_available():
    """Check if admin backend is available for testing"""
    import requests
    try:
        response = requests.get("http://localhost:8080/health", timeout=2)
        return response.status_code == 200
    except:
        return False


@pytest.fixture
def config():
    """Mock configuration for integration tests"""
    from unittest.mock import Mock
    config = Mock()
    config.ADMIN_BACKEND_URL = "http://localhost:8080"
    config.NEO4J_URI = "bolt://localhost:7687"
    config.NEO4J_USER = "neo4j"
    config.NEO4J_PASSWORD = "test-password"
    return config

