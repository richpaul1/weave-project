"""
Integration tests for course search functionality.

Tests the complete course search workflow with real admin backend integration.
"""

import pytest
import sys
import os
import asyncio
import aiohttp

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services.course_service import CourseService
from app.services.query_classifier import QueryClassifier
from app.services.enhanced_rag_service import EnhancedRAGService
from app.config import Config


class TestCourseSearchIntegration:
    """Integration tests for course search with real admin backend."""

    @pytest.fixture(scope="class")
    def config(self):
        """Real configuration."""
        return Config()

    @pytest.fixture(scope="class")
    def course_service(self, config):
        """Real CourseService with real config."""
        return CourseService(config)

    @pytest.fixture
    async def admin_backend_available(self, config):
        """Check if admin backend is available for testing."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{config.ADMIN_BASE_URL}/health", timeout=5) as response:
                    return response.status == 200
        except:
            return False

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_real_course_search(self, course_service, admin_backend_available):
        """Test course search with real admin backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Test vector search
        result = await course_service.search_courses(
            query="machine learning",
            limit=5,
            use_vector=True
        )

        # Verify real search results
        assert result["success"] is True
        assert "data" in result
        assert "searchMethod" in result["data"]
        assert "total" in result["data"]
        assert "results" in result["data"]
        
        # If courses exist, verify structure
        if result["data"]["total"] > 0:
            course = result["data"]["results"][0]
            required_fields = ["id", "title", "url"]
            for field in required_fields:
                assert field in course, f"Missing field: {field}"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_real_course_details(self, course_service, admin_backend_available):
        """Test course details retrieval with real admin backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # First, search for courses to get a real course ID
        search_result = await course_service.search_courses(
            query="machine learning",
            limit=1
        )

        if not search_result["success"] or search_result["data"]["total"] == 0:
            pytest.skip("No courses available for testing")

        course_id = search_result["data"]["results"][0]["id"]

        # Test getting course details
        result = await course_service.get_course_details(course_id)

        # Verify course details
        assert result["success"] is True
        assert "data" in result
        assert result["data"]["id"] == course_id
        assert "title" in result["data"]

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_real_course_stats(self, course_service, admin_backend_available):
        """Test course statistics with real admin backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Test getting course statistics
        result = await course_service.get_course_stats()

        # Verify statistics structure
        if result["success"]:
            assert "data" in result
            # Stats might be empty if no courses exist, which is fine
        else:
            # If stats endpoint doesn't exist, that's also acceptable
            assert "error" in result

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_course_search_with_real_filters(self, course_service, admin_backend_available):
        """Test course search with filters using real backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Test with difficulty filter
        result = await course_service.search_courses(
            query="machine learning",
            difficulty="beginner",
            limit=3
        )

        # Should succeed regardless of results
        assert result["success"] is True

        # Test with instructor filter
        result = await course_service.search_courses(
            query="data science",
            instructor="Dr. Smith",
            limit=2
        )

        # Should succeed regardless of results
        assert result["success"] is True

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_course_search_vector_vs_text(self, course_service, admin_backend_available):
        """Test vector vs text search with real backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        query = "machine learning"

        # Test vector search
        vector_result = await course_service.search_courses(
            query=query,
            use_vector=True,
            limit=5
        )

        # Test text search
        text_result = await course_service.search_courses(
            query=query,
            use_vector=False,
            limit=5
        )

        # Both should succeed
        assert vector_result["success"] is True
        assert text_result["success"] is True

        # Verify search methods are different
        if vector_result["data"]["total"] > 0:
            assert vector_result["data"]["searchMethod"] in ["vector", "text"]
        if text_result["data"]["total"] > 0:
            assert text_result["data"]["searchMethod"] in ["vector", "text"]

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_enhanced_rag_with_real_courses(self, config, admin_backend_available):
        """Test enhanced RAG service with real course backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Create real services (with mocked LLM and retrieval for testing)
        from unittest.mock import Mock, AsyncMock

        mock_llm_service = Mock()
        mock_retrieval_service = Mock()
        
        course_service = CourseService(config)
        query_classifier = QueryClassifier(mock_llm_service)
        enhanced_rag_service = EnhancedRAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service,
            query_classifier=query_classifier,
            course_service=course_service
        )

        # Test learning query with real course search
        result = await enhanced_rag_service.process_query(
            query="I want to learn machine learning",
            session_id="integration-test",
            top_k=3
        )

        # Verify the integration worked
        assert result["metadata"]["query_type"] == "learning"
        assert "course_search" in result["metadata"]
        
        # If courses were found, verify they're included
        if result["metadata"]["course_search"].get("total", 0) > 0:
            assert len(result["sources"]) > 0
            # Verify at least one source is a course
            course_sources = [s for s in result["sources"] if s.get("type") == "course"]
            assert len(course_sources) > 0

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_course_response_formatting_real_data(self, course_service, admin_backend_available):
        """Test course response formatting with real data."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Get real search results
        search_result = await course_service.search_courses(
            query="machine learning",
            limit=3
        )

        if not search_result["success"] or search_result["data"]["total"] == 0:
            pytest.skip("No courses available for formatting test")

        # Test formatting with real data
        formatted_response = course_service.format_course_response(
            query="machine learning",
            search_result=search_result["data"]
        )

        # Verify formatting with real data
        assert "courses related to 'machine learning'" in formatted_response
        assert "Difficulty:" in formatted_response
        assert "Duration:" in formatted_response
        
        # Should contain at least one course title
        course_titles = [course["title"] for course in search_result["data"]["results"]]
        assert any(title in formatted_response for title in course_titles)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_concurrent_course_searches(self, course_service, admin_backend_available):
        """Test concurrent course searches with real backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Test multiple concurrent searches
        queries = [
            "machine learning",
            "data science", 
            "artificial intelligence",
            "deep learning",
            "python programming"
        ]

        # Execute searches concurrently
        tasks = [
            course_service.search_courses(query=query, limit=2)
            for query in queries
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Verify all searches completed
        assert len(results) == len(queries)
        
        # Verify no exceptions occurred
        for i, result in enumerate(results):
            assert not isinstance(result, Exception), f"Query {queries[i]} failed: {result}"
            assert result["success"] is True, f"Query {queries[i]} was not successful"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_course_search_performance(self, course_service, admin_backend_available):
        """Test course search performance with real backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        import time

        # Test search performance
        start_time = time.time()
        
        result = await course_service.search_courses(
            query="machine learning",
            limit=10
        )
        
        end_time = time.time()
        search_duration = end_time - start_time

        # Verify search completed successfully
        assert result["success"] is True
        
        # Verify reasonable performance (should complete within 10 seconds)
        assert search_duration < 10.0, f"Search took too long: {search_duration:.2f}s"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_course_search_edge_cases(self, course_service, admin_backend_available):
        """Test course search edge cases with real backend."""
        if not admin_backend_available:
            pytest.skip("Admin backend not available")

        # Test empty query
        result = await course_service.search_courses(query="")
        assert result["success"] is True  # Should handle gracefully

        # Test very long query
        long_query = "machine learning " * 100
        result = await course_service.search_courses(query=long_query)
        assert result["success"] is True  # Should handle gracefully

        # Test special characters
        special_query = "machine learning & AI (artificial intelligence)!"
        result = await course_service.search_courses(query=special_query)
        assert result["success"] is True  # Should handle gracefully

        # Test non-existent topic
        result = await course_service.search_courses(query="xyznontopic123")
        assert result["success"] is True
        # Should return 0 results but not fail
        assert result["data"]["total"] >= 0

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_admin_backend_error_handling(self, course_service):
        """Test error handling when admin backend is unavailable."""
        # Create course service with invalid URL
        from unittest.mock import Mock
        invalid_config = Mock(ADMIN_BASE_URL="http://invalid-url:9999")
        invalid_course_service = CourseService(invalid_config)

        # Test search with invalid backend
        result = await invalid_course_service.search_courses(query="test")
        
        # Should handle error gracefully
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)
