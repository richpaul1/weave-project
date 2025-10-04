"""
Unit tests for EnhancedRAGService.

Tests the enhanced RAG service with mocked dependencies.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, Mock, patch

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services.enhanced_rag_service import EnhancedRAGService


class TestEnhancedRAGService:
    """Test suite for EnhancedRAGService."""

    @pytest.fixture
    def mock_retrieval_service(self):
        """Mock retrieval service."""
        return Mock()

    @pytest.fixture
    def mock_llm_service(self):
        """Mock LLM service."""
        return Mock()

    @pytest.fixture
    def mock_query_classifier(self):
        """Mock query classifier."""
        return Mock()

    @pytest.fixture
    def mock_course_service(self):
        """Mock course service."""
        return Mock()

    @pytest.fixture
    def enhanced_rag_service(self, mock_retrieval_service, mock_llm_service, 
                           mock_query_classifier, mock_course_service):
        """Create EnhancedRAGService with mocked dependencies."""
        return EnhancedRAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service,
            query_classifier=mock_query_classifier,
            course_service=mock_course_service
        )

    @pytest.fixture
    def sample_classification_learning(self):
        """Sample learning classification result."""
        return {
            "query_type": "learning",
            "confidence": 0.95,
            "learning_score": 0.9,
            "keywords_found": ["learn", "course"],
            "reasoning": "Strong learning intent detected"
        }

    @pytest.fixture
    def sample_classification_general(self):
        """Sample general classification result."""
        return {
            "query_type": "general",
            "confidence": 0.9,
            "learning_score": 0.0,
            "keywords_found": [],
            "reasoning": "No learning intent detected"
        }

    @pytest.fixture
    def sample_course_search_result(self):
        """Sample course search result."""
        return {
            "success": True,
            "data": {
                "searchMethod": "vector",
                "total": 2,
                "results": [
                    {
                        "id": "course-1",
                        "title": "Machine Learning Basics",
                        "description": "Learn ML fundamentals",
                        "difficulty": "beginner",
                        "duration": "4 hours",
                        "topics": ["machine learning", "python"]
                    }
                ]
            }
        }

    @pytest.fixture
    def sample_context_result(self):
        """Sample context retrieval result."""
        return {
            "context_text": "Machine learning is a subset of AI...",
            "sources": [
                {
                    "type": "page",
                    "title": "ML Introduction",
                    "url": "https://example.com/ml-intro"
                }
            ],
            "num_chunks": 3,
            "num_sources": 1,
            "metadata": {"retrieval_time": 0.5}
        }

    @pytest.mark.asyncio
    async def test_process_learning_query(self, enhanced_rag_service, sample_classification_learning,
                                        sample_course_search_result):
        """Test processing of learning queries."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_learning
        enhanced_rag_service.course_service.search_courses = AsyncMock(return_value=sample_course_search_result)
        enhanced_rag_service.course_service.format_course_response.return_value = "Found 2 courses..."

        # Test the query processing
        result = await enhanced_rag_service.process_query(
            query="I want to learn machine learning",
            session_id="test-session",
            top_k=5
        )

        # Verify the result
        assert result["response"] == "Found 2 courses..."
        assert result["metadata"]["query_type"] == "learning"
        assert result["metadata"]["classification"]["confidence"] == 0.95
        assert result["metadata"]["course_search"]["searchMethod"] == "vector"

        # Verify service calls
        enhanced_rag_service.course_service.search_courses.assert_called_once_with(
            query="I want to learn machine learning",
            limit=5,
            use_vector=True
        )

    @pytest.mark.asyncio
    async def test_process_general_query(self, enhanced_rag_service, sample_classification_general,
                                       sample_context_result):
        """Test processing of general queries."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_general
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value=sample_context_result)
        enhanced_rag_service.llm_service.generate_completion = AsyncMock(return_value={
            "text": "Machine learning is indeed a subset of artificial intelligence...",
            "tokens": 150
        })

        # Test the query processing
        result = await enhanced_rag_service.process_query(
            query="What is machine learning?",
            session_id="test-session",
            top_k=5
        )

        # Verify the result
        assert "Machine learning is indeed" in result["response"]
        assert result["metadata"]["query_type"] == "general"
        assert result["metadata"]["num_chunks"] == 3
        assert len(result["sources"]) == 1

        # Verify service calls
        enhanced_rag_service.retrieval_service.retrieve_context.assert_called_once()
        enhanced_rag_service.llm_service.generate_completion.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_mixed_query(self, enhanced_rag_service, sample_course_search_result,
                                     sample_context_result):
        """Test processing of mixed queries."""
        # Setup classification for mixed query (high learning score)
        mixed_classification = {
            "query_type": "learning",  # Will be treated as learning due to high score
            "confidence": 0.85,
            "learning_score": 0.75,
            "keywords_found": ["learn", "what"],
            "reasoning": "Mixed intent with learning focus"
        }

        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = mixed_classification
        enhanced_rag_service.course_service.search_courses = AsyncMock(return_value=sample_course_search_result)
        enhanced_rag_service.course_service.format_course_response.return_value = "Found courses..."

        # Test the query processing
        result = await enhanced_rag_service.process_query(
            query="I want to learn about ML and what is it?",
            session_id="test-session",
            top_k=5
        )

        # Verify it's processed as learning query
        assert result["metadata"]["query_type"] == "learning"
        enhanced_rag_service.course_service.search_courses.assert_called_once()

    @pytest.mark.asyncio
    async def test_course_search_failure_fallback(self, enhanced_rag_service, sample_classification_learning,
                                                 sample_context_result):
        """Test fallback to general RAG when course search fails."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_learning
        enhanced_rag_service.course_service.search_courses = AsyncMock(return_value={
            "success": False,
            "error": "Course service unavailable"
        })
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value=sample_context_result)
        enhanced_rag_service.llm_service.generate_completion = AsyncMock(return_value={
            "text": "I apologize, course search is unavailable...",
            "tokens": 100
        })

        # Test the query processing
        result = await enhanced_rag_service.process_query(
            query="I want to learn machine learning",
            session_id="test-session"
        )

        # Verify fallback to general RAG
        assert "I apologize" in result["response"]
        assert result["metadata"]["query_type"] == "learning"
        enhanced_rag_service.retrieval_service.retrieve_context.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_query_streaming_classification(self, enhanced_rag_service, 
                                                        sample_classification_learning):
        """Test streaming query processing classification step."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_learning
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value={
            "context_text": "Test context",
            "sources": [],
            "num_chunks": 1,
            "num_sources": 1
        })
        enhanced_rag_service.llm_service.generate_streaming = AsyncMock()
        enhanced_rag_service.llm_service.generate_streaming.return_value = iter(["Test", " response"])

        # Test streaming
        events = []
        async for event in enhanced_rag_service.process_query_streaming(
            query="I want to learn Python",
            session_id="test-session"
        ):
            events.append(event)

        # Verify classification event
        classification_event = events[0]
        assert classification_event["type"] == "classification"
        assert classification_event["data"]["query_type"] == "learning"
        assert classification_event["data"]["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_process_query_streaming_context(self, enhanced_rag_service, 
                                                 sample_classification_general,
                                                 sample_context_result):
        """Test streaming query processing context step."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_general
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value=sample_context_result)
        enhanced_rag_service.llm_service.generate_streaming = AsyncMock()
        enhanced_rag_service.llm_service.generate_streaming.return_value = iter(["Test"])

        # Test streaming
        events = []
        async for event in enhanced_rag_service.process_query_streaming(
            query="What is Python?",
            session_id="test-session"
        ):
            events.append(event)

        # Verify context event
        context_event = events[1]  # Second event after classification
        assert context_event["type"] == "context"
        assert context_event["data"]["num_chunks"] == 3
        assert context_event["data"]["num_sources"] == 1

    @pytest.mark.asyncio
    async def test_process_query_streaming_response(self, enhanced_rag_service,
                                                  sample_classification_general,
                                                  sample_context_result):
        """Test streaming query processing response generation."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_general
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value=sample_context_result)
        enhanced_rag_service.llm_service.generate_streaming = AsyncMock()
        enhanced_rag_service.llm_service.generate_streaming.return_value = iter(["Hello", " world", "!"])

        # Test streaming
        events = []
        async for event in enhanced_rag_service.process_query_streaming(
            query="Test query",
            session_id="test-session"
        ):
            events.append(event)

        # Verify response events
        response_events = [e for e in events if e["type"] == "response"]
        assert len(response_events) == 3
        assert response_events[0]["data"]["text"] == "Hello"
        assert response_events[1]["data"]["text"] == " world"
        assert response_events[2]["data"]["text"] == "!"

    @pytest.mark.asyncio
    async def test_process_query_streaming_completion(self, enhanced_rag_service,
                                                    sample_classification_general,
                                                    sample_context_result):
        """Test streaming query processing completion event."""
        # Setup mocks
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_general
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value=sample_context_result)
        enhanced_rag_service.llm_service.generate_streaming = AsyncMock()
        enhanced_rag_service.llm_service.generate_streaming.return_value = iter(["Complete"])

        # Test streaming
        events = []
        async for event in enhanced_rag_service.process_query_streaming(
            query="Test query",
            session_id="test-session"
        ):
            events.append(event)

        # Verify completion event
        done_event = events[-1]
        assert done_event["type"] == "done"
        assert done_event["data"]["sources"] == sample_context_result["sources"]
        assert done_event["data"]["metadata"]["query_type"] == "general"
        assert done_event["data"]["metadata"]["num_chunks"] == 3

    @pytest.mark.asyncio
    async def test_error_handling_in_learning_query(self, enhanced_rag_service, 
                                                  sample_classification_learning):
        """Test error handling in learning query processing."""
        # Setup mocks with error
        enhanced_rag_service.query_classifier.classify_query.return_value = sample_classification_learning
        enhanced_rag_service.course_service.search_courses = AsyncMock(
            side_effect=Exception("Course service error")
        )

        # Mock fallback to general RAG
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value={
            "context_text": "Fallback context",
            "sources": [],
            "num_chunks": 0,
            "num_sources": 0,
            "metadata": {}
        })
        enhanced_rag_service.llm_service.generate_completion = AsyncMock(return_value={
            "text": "Fallback response",
            "tokens": 50
        })

        # Test error handling
        result = await enhanced_rag_service.process_query(
            query="I want to learn Python",
            session_id="test-session"
        )

        # Should fallback to general RAG
        assert result["response"] == "Fallback response"
        assert result["metadata"]["query_type"] == "general"
