"""
Unit tests for IndependentCourseService.

Tests the independent course search service with mocked dependencies.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, Mock, patch
import json

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Mock environment variables before importing
with patch.dict(os.environ, {
    'NEO4J_URI': 'neo4j://localhost:7687',
    'NEO4J_USER': 'neo4j',
    'NEO4J_PASSWORD': 'password',
    'NEO4J_DB_NAME': 'test',
    'OLLAMA_BASE_URL': 'http://localhost:11434',
    'OLLAMA_MODEL': 'test-model'
}):
    from app.services.independent_course_service import IndependentCourseService


class TestIndependentCourseService:
    """Test suite for IndependentCourseService."""

    @pytest.fixture
    def mock_storage_service(self):
        """Create mock storage service."""
        storage = Mock()
        storage.connect = Mock()
        storage.close = Mock()
        storage._get_session = Mock()
        return storage

    @pytest.fixture
    def mock_llm_service(self):
        """Create mock LLM service."""
        llm = Mock()
        llm.generate_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3, 0.4, 0.5])
        return llm

    @pytest.fixture
    def course_service(self, mock_storage_service, mock_llm_service):
        """Create IndependentCourseService instance with mocked dependencies."""
        return IndependentCourseService(
            storage_service=mock_storage_service,
            llm_service=mock_llm_service
        )

    @pytest.fixture
    def sample_course_data(self):
        """Sample course data for testing."""
        return [
            {
                "id": "course-1",
                "title": "Machine Learning Basics",
                "description": "Learn the fundamentals of ML",
                "url": "https://example.com/ml-basics",
                "difficulty": "beginner",
                "duration": "4 hours",
                "topics": ["machine learning", "python", "data science"],
                "instructor": "Dr. Smith",
                "isActive": True,
                "createdAt": "2024-01-01T00:00:00Z"
            },
            {
                "id": "course-2", 
                "title": "Advanced Deep Learning",
                "description": "Deep dive into neural networks",
                "url": "https://example.com/deep-learning",
                "difficulty": "advanced",
                "duration": "8 hours",
                "topics": ["deep learning", "neural networks", "tensorflow"],
                "instructor": "Prof. Johnson",
                "isActive": True,
                "createdAt": "2024-01-02T00:00:00Z"
            }
        ]

    @pytest.mark.asyncio
    async def test_vector_search_courses_success(self, course_service, mock_storage_service, sample_course_data):
        """Test successful vector search for courses."""
        # Mock Neo4j session and result
        mock_session = Mock()
        mock_result = Mock()
        mock_records = []

        for i, course in enumerate(sample_course_data):
            mock_record = Mock()
            # Create a proper closure for each course
            def make_getitem(course_data):
                return lambda self, key: course_data if key == "c" else 0.9
            mock_record.__getitem__ = make_getitem(course)
            mock_records.append(mock_record)

        mock_result.__iter__ = lambda self: iter(mock_records)
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None

        mock_storage_service._get_session.return_value = mock_session

        # Test vector search
        result = await course_service.search_courses(
            query="machine learning",
            use_vector=True,
            limit=5
        )

        # Verify the result
        assert result["success"] is True
        assert result["data"]["searchMethod"] == "vector"
        assert result["data"]["total"] == 2
        assert len(result["data"]["results"]) == 2
        # Don't assert specific order since it depends on the mock iteration
        titles = [course["title"] for course in result["data"]["results"]]
        assert "Machine Learning Basics" in titles
        assert "Advanced Deep Learning" in titles

    @pytest.mark.asyncio
    async def test_text_search_courses_success(self, course_service, mock_storage_service, sample_course_data):
        """Test successful text search for courses."""
        # Mock Neo4j session and result
        mock_session = Mock()
        mock_result = Mock()
        mock_records = []

        for course in sample_course_data:
            mock_record = Mock()
            # Create a proper closure for each course
            def make_getitem(course_data):
                return lambda self, key: course_data
            mock_record.__getitem__ = make_getitem(course)
            mock_records.append(mock_record)

        mock_result.__iter__ = lambda self: iter(mock_records)
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None

        mock_storage_service._get_session.return_value = mock_session

        # Test text search
        result = await course_service.search_courses(
            query="machine learning",
            use_vector=False,
            limit=5
        )

        # Verify the result
        assert result["success"] is True
        assert result["data"]["searchMethod"] == "text"
        assert result["data"]["total"] == 2
        assert len(result["data"]["results"]) == 2
        # Don't assert specific order since it depends on the mock iteration
        titles = [course["title"] for course in result["data"]["results"]]
        assert "Machine Learning Basics" in titles
        assert "Advanced Deep Learning" in titles

    @pytest.mark.asyncio
    async def test_search_courses_with_filters(self, course_service, mock_storage_service, sample_course_data):
        """Test course search with difficulty and instructor filters."""
        # Mock Neo4j session
        mock_session = Mock()
        mock_result = Mock()
        
        # Return only beginner course
        beginner_course = [c for c in sample_course_data if c["difficulty"] == "beginner"]
        mock_records = []
        for course in beginner_course:
            mock_record = Mock()
            # Create a proper closure for each course
            def make_getitem(course_data):
                return lambda self, key: course_data
            mock_record.__getitem__ = make_getitem(course)
            mock_records.append(mock_record)
        
        mock_result.__iter__ = lambda self: iter(mock_records)
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None
        
        mock_storage_service._get_session.return_value = mock_session

        # Test search with filters
        result = await course_service.search_courses(
            query="machine learning",
            use_vector=False,
            difficulty="beginner",
            instructor="Dr. Smith",
            limit=3
        )

        # Verify the call was made with correct parameters
        mock_session.run.assert_called_once()
        call_args = mock_session.run.call_args

        # The call structure is: session.run(cypher_query, params)
        # So params should be in args[1] or kwargs
        if len(call_args.args) > 1:
            params = call_args.args[1]
        else:
            params = call_args.kwargs

        assert "difficulty" in params
        assert "instructor" in params
        assert params["difficulty"] == "beginner"
        assert params["instructor"] == "Dr. Smith"

    @pytest.mark.asyncio
    async def test_vector_search_fallback_to_text(self, course_service, mock_storage_service, mock_llm_service, sample_course_data):
        """Test fallback from vector to text search when vector search fails."""
        # Make vector search fail
        mock_llm_service.generate_embedding.side_effect = Exception("Embedding failed")
        
        # Mock successful text search
        mock_session = Mock()
        mock_result = Mock()
        mock_records = []
        
        for course in sample_course_data:
            mock_record = Mock()
            mock_record.__getitem__ = lambda self, key: course
            mock_records.append(mock_record)
        
        mock_result.__iter__ = lambda self: iter(mock_records)
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None
        
        mock_storage_service._get_session.return_value = mock_session

        # Test search with vector=True but should fallback to text
        result = await course_service.search_courses(
            query="machine learning",
            use_vector=True,  # This should fallback to text
            limit=5
        )

        # Verify fallback occurred
        assert result["success"] is True
        assert result["data"]["searchMethod"] == "text"
        assert result["data"]["total"] == 2

    @pytest.mark.asyncio
    async def test_get_course_details_success(self, course_service, mock_storage_service, sample_course_data):
        """Test successful course details retrieval."""
        course_data = sample_course_data[0]

        # Mock Neo4j session and result
        mock_session = Mock()
        mock_result = Mock()
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: course_data
        mock_result.single.return_value = mock_record
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None
        
        mock_storage_service._get_session.return_value = mock_session

        # Test getting course details
        result = await course_service.get_course_details("course-1")

        # Verify the result
        assert result["title"] == "Machine Learning Basics"
        assert result["difficulty"] == "beginner"
        assert result["id"] == "course-1"

    @pytest.mark.asyncio
    async def test_get_course_details_not_found(self, course_service, mock_storage_service):
        """Test course details retrieval for non-existent course."""
        # Mock Neo4j session with no result
        mock_session = Mock()
        mock_result = Mock()
        mock_result.single.return_value = None
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None
        
        mock_storage_service._get_session.return_value = mock_session

        # Test getting course details for non-existent course
        with pytest.raises(Exception) as exc_info:
            await course_service.get_course_details("non-existent")
        
        assert "Course not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_course_stats_success(self, course_service, mock_storage_service):
        """Test successful course statistics retrieval."""
        stats_data = {
            "totalCourses": 12,
            "activeCourses": 10,
            "byDifficulty": {
                "beginner": 4,
                "intermediate": 3,
                "advanced": 3
            },
            "topTopics": [
                {"topic": "machine learning", "count": 5},
                {"topic": "deep learning", "count": 3}
            ]
        }

        # Mock Neo4j session and result
        mock_session = Mock()
        mock_result = Mock()
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: stats_data[key]
        mock_result.single.return_value = mock_record
        mock_session.run.return_value = mock_result
        mock_session.__enter__ = lambda self: mock_session
        mock_session.__exit__ = lambda self, *args: None
        
        mock_storage_service._get_session.return_value = mock_session

        # Test getting course stats
        result = await course_service.get_course_stats()

        # Verify the result
        assert result["totalCourses"] == 12
        assert result["activeCourses"] == 10
        assert result["byDifficulty"]["beginner"] == 4

    def test_format_course_response_with_results(self, course_service, sample_course_data):
        """Test formatting course response with results."""
        search_result = {
            "searchMethod": "vector",
            "total": 2,
            "results": sample_course_data
        }
        
        result = course_service.format_course_response(
            search_result=search_result,
            query="machine learning"
        )

        # Verify the formatted response
        assert "2 courses related to 'machine learning'" in result
        assert "Machine Learning Basics" in result
        assert "Advanced Deep Learning" in result
        assert "Difficulty: Beginner" in result
        assert "Difficulty: Advanced" in result
        assert "semantic similarity search" in result

    def test_format_course_response_no_results(self, course_service):
        """Test formatting course response with no results."""
        empty_data = {
            "searchMethod": "text",
            "total": 0,
            "results": []
        }

        result = course_service.format_course_response(
            search_result=empty_data,
            query="nonexistent topic"
        )

        # Verify the formatted response
        assert "couldn't find any courses" in result
        assert "nonexistent topic" in result

    def test_format_course_response_partial_data(self, course_service):
        """Test formatting course response with partial course data."""
        partial_data = {
            "searchMethod": "vector",
            "total": 1,
            "results": [
                {
                    "id": "course-1",
                    "title": "Incomplete Course",
                    # Missing some fields
                    "topics": ["ai"]
                }
            ]
        }

        result = course_service.format_course_response(
            search_result=partial_data,
            query="ai"
        )

        # Verify it handles missing fields gracefully
        assert "Incomplete Course" in result
        assert "Difficulty: Unknown" in result
        assert "Duration: Unknown" in result
