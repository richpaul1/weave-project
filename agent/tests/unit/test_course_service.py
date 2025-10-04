"""
Unit tests for CourseService.

Tests the course search service with mocked dependencies.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, Mock, patch
import json

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services.course_service import CourseService


class TestCourseService:
    """Test suite for CourseService."""

    @pytest.fixture
    def course_service(self):
        """Create CourseService instance with mocked admin URL."""
        return CourseService("http://localhost:8001")

    @pytest.fixture
    def sample_course_data(self):
        """Sample course data for testing."""
        return {
            "searchMethod": "vector",
            "total": 2,
            "results": [
                {
                    "id": "course-1",
                    "title": "Machine Learning Basics",
                    "description": "Learn the fundamentals of ML",
                    "url": "https://example.com/ml-basics",
                    "difficulty": "beginner",
                    "duration": "4 hours",
                    "topics": ["machine learning", "python", "data science"],
                    "instructor": "Dr. Smith"
                },
                {
                    "id": "course-2", 
                    "title": "Advanced Deep Learning",
                    "description": "Deep dive into neural networks",
                    "url": "https://example.com/deep-learning",
                    "difficulty": "advanced",
                    "duration": "8 hours",
                    "topics": ["deep learning", "neural networks", "tensorflow"],
                    "instructor": "Prof. Johnson"
                }
            ]
        }

    @pytest.mark.asyncio
    async def test_search_courses_success(self, course_service, sample_course_data):
        """Test successful course search."""
        with patch('httpx.AsyncClient') as mock_client:
            # Mock the HTTP response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_course_data

            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            # Test the search
            result = await course_service.search_courses(
                query="machine learning",
                limit=5,
                use_vector=True
            )

            # Verify the result (direct admin backend response)
            assert result["searchMethod"] == "vector"
            assert result["total"] == 2
            assert len(result["results"]) == 2
            assert result["results"][0]["title"] == "Machine Learning Basics"

    @pytest.mark.asyncio
    async def test_search_courses_with_filters(self, course_service, sample_course_data):
        """Test course search with filters."""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_course_data

            mock_get = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value.get = mock_get

            # Test search with filters
            result = await course_service.search_courses(
                query="deep learning",
                limit=3,
                difficulty="advanced",
                instructor="Prof. Johnson"
            )

            # Verify the call was made with correct parameters
            mock_get.assert_called_once()
            call_args = mock_get.call_args
            assert call_args[0][0] == "http://localhost:8001/api/courses/search"
            params = call_args[1]["params"]
            assert params["difficulty"] == "advanced"
            assert params["instructor"] == "Prof. Johnson"

    @pytest.mark.asyncio
    async def test_search_courses_http_error(self, course_service):
        """Test course search with HTTP error."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 500
            mock_response.text = AsyncMock(return_value="Internal Server Error")
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test the search
            result = await course_service.search_courses(query="test")

            # Verify error handling
            assert result["success"] is False
            assert "HTTP 500" in result["error"]

    @pytest.mark.asyncio
    async def test_search_courses_connection_error(self, course_service):
        """Test course search with connection error."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_get.side_effect = Exception("Connection failed")

            # Test the search
            result = await course_service.search_courses(query="test")

            # Verify error handling
            assert result["success"] is False
            assert "Connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_get_course_details_success(self, course_service):
        """Test successful course details retrieval."""
        course_data = {
            "id": "course-1",
            "title": "Machine Learning Basics",
            "description": "Learn the fundamentals of ML",
            "difficulty": "beginner",
            "duration": "4 hours",
            "topics": ["machine learning", "python"]
        }

        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value=course_data)
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test getting course details
            result = await course_service.get_course_details("course-1")

            # Verify the result
            assert result["success"] is True
            assert result["data"]["title"] == "Machine Learning Basics"
            assert result["data"]["difficulty"] == "beginner"

    @pytest.mark.asyncio
    async def test_get_course_details_not_found(self, course_service):
        """Test course details retrieval for non-existent course."""
        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 404
            mock_response.text = AsyncMock(return_value="Course not found")
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test getting course details
            result = await course_service.get_course_details("non-existent")

            # Verify error handling
            assert result["success"] is False
            assert "HTTP 404" in result["error"]

    @pytest.mark.asyncio
    async def test_get_course_stats_success(self, course_service):
        """Test successful course statistics retrieval."""
        stats_data = {
            "total_courses": 12,
            "active_courses": 10,
            "difficulties": {
                "beginner": 4,
                "intermediate": 3,
                "advanced": 3
            },
            "topics": ["machine learning", "deep learning", "data science"]
        }

        with patch('aiohttp.ClientSession.get') as mock_get:
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json = AsyncMock(return_value=stats_data)
            mock_get.return_value.__aenter__.return_value = mock_response

            # Test getting course stats
            result = await course_service.get_course_stats()

            # Verify the result
            assert result["success"] is True
            assert result["data"]["total_courses"] == 12
            assert result["data"]["active_courses"] == 10

    def test_format_course_response_with_results(self, course_service, sample_course_data):
        """Test formatting course response with results."""
        result = course_service.format_course_response(
            query="machine learning",
            search_result=sample_course_data
        )

        # Verify the formatted response
        assert "2 courses related to 'machine learning'" in result
        assert "Machine Learning Basics" in result
        assert "Advanced Deep Learning" in result
        assert "Difficulty: beginner" in result
        assert "Difficulty: advanced" in result
        assert "semantic similarity search" in result

    def test_format_course_response_no_results(self, course_service):
        """Test formatting course response with no results."""
        empty_data = {
            "searchMethod": "text",
            "total": 0,
            "results": []
        }

        result = course_service.format_course_response(
            query="nonexistent topic",
            search_result=empty_data
        )

        # Verify the formatted response
        assert "No courses found" in result
        assert "nonexistent topic" in result

    def test_format_course_response_error(self, course_service):
        """Test formatting course response with error."""
        result = course_service.format_course_response(
            query="test",
            search_result=None,
            error="Connection failed"
        )

        # Verify the error response
        assert "I apologize" in result
        assert "Connection failed" in result

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
            query="ai",
            search_result=partial_data
        )

        # Verify it handles missing fields gracefully
        assert "Incomplete Course" in result
        assert "Difficulty: Unknown" in result
        assert "Duration: Unknown" in result
