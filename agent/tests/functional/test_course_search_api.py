"""
Functional tests for course search API integration.

Tests the course search functionality with real services but mocked external dependencies.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, Mock, patch
import aiohttp

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services.course_service import CourseService
from app.services.query_classifier import QueryClassifier
from app.services.enhanced_rag_service import EnhancedRAGService


class TestCourseSearchAPI:
    """Functional tests for course search API integration."""

    @pytest.fixture
    def mock_config(self):
        """Mock configuration."""
        return Mock(ADMIN_BASE_URL="http://localhost:8001")

    @pytest.fixture
    def mock_llm_service(self):
        """Mock LLM service."""
        return Mock()

    @pytest.fixture
    def mock_retrieval_service(self):
        """Mock retrieval service."""
        return Mock()

    @pytest.fixture
    def course_service(self, mock_config):
        """Create real CourseService with mocked config."""
        return CourseService(mock_config)

    @pytest.fixture
    def query_classifier(self, mock_llm_service):
        """Create real QueryClassifier with mocked LLM service."""
        return QueryClassifier(mock_llm_service)

    @pytest.fixture
    def enhanced_rag_service(self, mock_retrieval_service, mock_llm_service, 
                           query_classifier, course_service):
        """Create real EnhancedRAGService with real and mocked dependencies."""
        return EnhancedRAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service,
            query_classifier=query_classifier,
            course_service=course_service
        )

    @pytest.fixture
    def sample_admin_response(self):
        """Sample response from admin backend."""
        return {
            "searchMethod": "vector",
            "total": 3,
            "results": [
                {
                    "id": "course-1",
                    "title": "Machine Learning Fundamentals",
                    "description": "Learn the basics of machine learning",
                    "url": "https://example.com/ml-fundamentals",
                    "difficulty": "beginner",
                    "duration": "6 hours",
                    "topics": ["machine learning", "python", "scikit-learn"],
                    "instructor": "Dr. Smith"
                },
                {
                    "id": "course-2",
                    "title": "Deep Learning with TensorFlow",
                    "description": "Advanced neural networks and deep learning",
                    "url": "https://example.com/deep-learning",
                    "difficulty": "advanced",
                    "duration": "12 hours",
                    "topics": ["deep learning", "tensorflow", "neural networks"],
                    "instructor": "Prof. Johnson"
                },
                {
                    "id": "course-3",
                    "title": "Data Science Pipeline",
                    "description": "End-to-end data science workflow",
                    "url": "https://example.com/data-science",
                    "difficulty": "intermediate",
                    "duration": "8 hours",
                    "topics": ["data science", "pandas", "visualization"],
                    "instructor": "Dr. Brown"
                }
            ]
        }

    @pytest.mark.asyncio
    async def test_course_search_integration(self, course_service, sample_admin_response):
        """Test course search integration with admin backend."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            # Mock successful HTTP response
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value=sample_admin_response)
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test course search
            result = await course_service.search_courses(
                query="machine learning",
                limit=5,
                use_vector=True
            )

            # Verify integration
            assert result["success"] is True
            assert result["data"]["total"] == 3
            assert len(result["data"]["results"]) == 3
            
            # Verify course data structure
            course = result["data"]["results"][0]
            assert course["title"] == "Machine Learning Fundamentals"
            assert course["difficulty"] == "beginner"
            assert "machine learning" in course["topics"]

    @pytest.mark.asyncio
    async def test_query_classification_accuracy(self, query_classifier):
        """Test query classification accuracy with various inputs."""
        test_cases = [
            # Learning queries
            ("I want to learn Python programming", "learning", 0.8),
            ("What courses are available for data science?", "learning", 0.8),
            ("How do I study machine learning?", "learning", 0.8),
            ("Teach me about neural networks", "learning", 0.8),
            
            # General queries
            ("What is the capital of France?", "general", 0.8),
            ("How does photosynthesis work?", "general", 0.8),
            ("What's the weather today?", "general", 0.8),
            
            # Mixed queries (should be classified as learning due to strong intent)
            ("I want to learn about AI and what is machine learning?", "learning", 0.7),
            ("Can you teach me Python and also explain what it is?", "learning", 0.7)
        ]

        for query, expected_type, min_confidence in test_cases:
            result = query_classifier.classify_query(query)
            
            assert result["query_type"] == expected_type, f"Failed for query: {query}"
            assert result["confidence"] >= min_confidence, f"Low confidence for query: {query}"

    @pytest.mark.asyncio
    async def test_enhanced_rag_learning_flow(self, enhanced_rag_service, sample_admin_response):
        """Test complete enhanced RAG flow for learning queries."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            # Mock admin backend response
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value=sample_admin_response)
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test learning query processing
            result = await enhanced_rag_service.process_query(
                query="I want to learn machine learning",
                session_id="test-session",
                top_k=5
            )

            # Verify the complete flow
            assert result["metadata"]["query_type"] == "learning"
            assert result["metadata"]["classification"]["confidence"] >= 0.8
            assert result["metadata"]["course_search"]["total"] == 3
            assert "Machine Learning Fundamentals" in result["response"]
            assert len(result["sources"]) == 3
            
            # Verify source structure
            source = result["sources"][0]
            assert source["type"] == "course"
            assert "id" in source
            assert "title" in source
            assert "url" in source

    @pytest.mark.asyncio
    async def test_enhanced_rag_general_flow(self, enhanced_rag_service):
        """Test enhanced RAG flow for general queries."""
        # Mock retrieval service for general queries
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value={
            "context_text": "Python is a programming language...",
            "sources": [
                {
                    "type": "page",
                    "title": "Python Documentation",
                    "url": "https://docs.python.org"
                }
            ],
            "num_chunks": 2,
            "num_sources": 1,
            "metadata": {"retrieval_time": 0.3}
        })

        # Mock LLM response
        enhanced_rag_service.llm_service.generate_completion = AsyncMock(return_value={
            "text": "Python is a high-level programming language known for its simplicity...",
            "tokens": 120
        })

        # Test general query processing
        result = await enhanced_rag_service.process_query(
            query="What is Python?",
            session_id="test-session",
            top_k=3
        )

        # Verify general RAG flow
        assert result["metadata"]["query_type"] == "general"
        assert "Python is a high-level" in result["response"]
        assert result["metadata"]["num_chunks"] == 2
        assert len(result["sources"]) == 1

    @pytest.mark.asyncio
    async def test_course_search_with_filters(self, course_service, sample_admin_response):
        """Test course search with various filters."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value=sample_admin_response)
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test with difficulty filter
            result = await course_service.search_courses(
                query="machine learning",
                difficulty="beginner",
                limit=3
            )

            # Verify the request was made with filters
            mock_get.assert_called_once()
            call_url = str(mock_get.call_args[0][0])
            assert "difficulty=beginner" in call_url
            assert "limit=3" in call_url

    @pytest.mark.asyncio
    async def test_course_search_error_handling(self, course_service):
        """Test course search error handling scenarios."""
        # Test HTTP error
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 500
            mock_response.text = AsyncMock(return_value="Internal Server Error")
            mock_get.return_value.__aenter__.return_value = mock_response

            result = await course_service.search_courses(query="test")
            
            assert result["success"] is False
            assert "HTTP 500" in result["error"]

        # Test connection error
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.side_effect = aiohttp.ClientError("Connection failed")

            result = await course_service.search_courses(query="test")
            
            assert result["success"] is False
            assert "Connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_course_response_formatting(self, course_service, sample_admin_response):
        """Test course response formatting with real data."""
        # Test with successful search results
        formatted_response = course_service.format_course_response(
            query="machine learning",
            search_result=sample_admin_response
        )

        # Verify formatting
        assert "3 courses related to 'machine learning'" in formatted_response
        assert "Machine Learning Fundamentals" in formatted_response
        assert "Deep Learning with TensorFlow" in formatted_response
        assert "Data Science Pipeline" in formatted_response
        assert "Difficulty: beginner" in formatted_response
        assert "Difficulty: advanced" in formatted_response
        assert "Difficulty: intermediate" in formatted_response
        assert "semantic similarity search" in formatted_response

        # Test with no results
        empty_result = {
            "searchMethod": "text",
            "total": 0,
            "results": []
        }
        
        formatted_empty = course_service.format_course_response(
            query="nonexistent",
            search_result=empty_result
        )
        
        assert "No courses found" in formatted_empty
        assert "nonexistent" in formatted_empty

    @pytest.mark.asyncio
    async def test_enhanced_rag_fallback_mechanism(self, enhanced_rag_service):
        """Test fallback mechanism when course search fails."""
        # Mock course search failure
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.side_effect = Exception("Admin backend unavailable")

            # Mock fallback to general RAG
            enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value={
                "context_text": "Fallback context about machine learning...",
                "sources": [],
                "num_chunks": 1,
                "num_sources": 0,
                "metadata": {}
            })
            
            enhanced_rag_service.llm_service.generate_completion = AsyncMock(return_value={
                "text": "I apologize, but the course search is currently unavailable...",
                "tokens": 80
            })

            # Test learning query with fallback
            result = await enhanced_rag_service.process_query(
                query="I want to learn machine learning",
                session_id="test-session"
            )

            # Verify fallback occurred
            assert "I apologize" in result["response"]
            assert result["metadata"]["query_type"] == "general"  # Fallback classification

    @pytest.mark.asyncio
    async def test_streaming_integration(self, enhanced_rag_service, sample_admin_response):
        """Test streaming integration with course search."""
        # Mock retrieval service for streaming
        enhanced_rag_service.retrieval_service.retrieve_context = AsyncMock(return_value={
            "context_text": "Test context",
            "sources": [],
            "num_chunks": 1,
            "num_sources": 1
        })

        # Mock streaming LLM response
        enhanced_rag_service.llm_service.generate_streaming = AsyncMock()
        enhanced_rag_service.llm_service.generate_streaming.return_value = iter([
            "I found", " some", " courses", " for you."
        ])

        # Test streaming
        events = []
        async for event in enhanced_rag_service.process_query_streaming(
            query="I want to learn Python",
            session_id="test-session"
        ):
            events.append(event)

        # Verify streaming events
        event_types = [event["type"] for event in events]
        assert "classification" in event_types
        assert "context" in event_types
        assert "response" in event_types
        assert "done" in event_types

        # Verify classification event
        classification_event = next(e for e in events if e["type"] == "classification")
        assert classification_event["data"]["query_type"] == "learning"
