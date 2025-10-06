"""
Integration tests for course search data structure fix.

Tests that the tool executor correctly processes course search results
from the Independent Course Service.
"""
import pytest
from unittest.mock import AsyncMock
from app.tools.tool_executor import ToolExecutor
from app.services.independent_course_service import IndependentCourseService
from app.services.retrieval_service import RetrievalService


@pytest.mark.integration
class TestCourseSearchDataStructureFix:
    """Integration tests for course search data structure fix."""

    @pytest.fixture
    def mock_course_service(self):
        """Create a mock course service that returns the correct data structure."""
        service = AsyncMock(spec=IndependentCourseService)
        
        # Mock the correct data structure returned by IndependentCourseService
        service.search_courses.return_value = {
            "success": True,
            "data": {
                "searchMethod": "vector",
                "total": 3,
                "results": [
                    {
                        "id": "course-1",
                        "title": "AI Model Evaluation Fundamentals",
                        "description": "Learn how to evaluate AI models effectively",
                        "url": "https://example.com/course-1",
                        "difficulty": "intermediate",
                        "duration": "4 weeks",
                        "topics": ["machine learning", "evaluation", "metrics"],
                        "instructor": "Dr. Smith"
                    },
                    {
                        "id": "course-2", 
                        "title": "Advanced Model Assessment Techniques",
                        "description": "Deep dive into model evaluation methods",
                        "url": "https://example.com/course-2",
                        "difficulty": "advanced",
                        "duration": "6 weeks",
                        "topics": ["evaluation", "validation", "testing"],
                        "instructor": "Prof. Johnson"
                    },
                    {
                        "id": "course-3",
                        "title": "Practical AI Evaluation",
                        "description": "Hands-on approach to evaluating AI systems",
                        "url": "https://example.com/course-3",
                        "difficulty": "beginner",
                        "duration": "3 weeks",
                        "topics": ["ai", "evaluation", "practical"],
                        "instructor": "Dr. Brown"
                    }
                ]
            }
        }
        
        return service

    @pytest.fixture
    def mock_retrieval_service(self):
        """Create a mock retrieval service."""
        return AsyncMock(spec=RetrievalService)

    @pytest.fixture
    def tool_executor(self, mock_course_service, mock_retrieval_service):
        """Create a tool executor with mocked services."""
        return ToolExecutor(mock_course_service, mock_retrieval_service)

    @pytest.mark.asyncio
    async def test_course_search_data_structure_fix(self, tool_executor, mock_course_service):
        """Test that course search correctly processes the nested data structure."""
        # Execute course search tool
        result = await tool_executor.execute_tool(
            tool_name="search_courses",
            tool_arguments={"query": "evaluate AI models", "limit": 5},
            session_id="test-session"
        )
        
        # Verify the tool execution was successful
        assert result["success"] is True
        assert result["tool_name"] == "search_courses"
        
        # Verify the data structure is correctly processed
        data = result["data"]
        assert "courses" in data
        assert "total_found" in data
        assert "search_method" in data
        
        # Verify courses were found (not 0)
        courses = data["courses"]
        assert len(courses) == 3
        assert data["total_found"] == 3
        assert data["search_method"] == "vector"
        
        # Verify course data is correctly formatted
        first_course = courses[0]
        assert first_course["id"] == "course-1"
        assert first_course["title"] == "AI Model Evaluation Fundamentals"
        assert first_course["difficulty"] == "intermediate"
        assert first_course["topics"] == ["machine learning", "evaluation", "metrics"]
        
        # Verify metadata fields
        assert data["course_titles"] == [
            "AI Model Evaluation Fundamentals",
            "Advanced Model Assessment Techniques", 
            "Practical AI Evaluation"
        ]
        assert data["course_difficulties"] == ["intermediate", "advanced", "beginner"]
        
        # Verify course service was called with correct arguments
        mock_course_service.search_courses.assert_called_once_with(
            query="evaluate AI models",
            difficulty=None,
            limit=5,
            use_vector=True
        )

    @pytest.mark.asyncio
    async def test_course_search_empty_results(self, mock_course_service, mock_retrieval_service):
        """Test course search with empty results."""
        # Mock empty results
        mock_course_service.search_courses.return_value = {
            "success": True,
            "data": {
                "searchMethod": "vector",
                "total": 0,
                "results": []
            }
        }
        
        tool_executor = ToolExecutor(mock_course_service, mock_retrieval_service)
        
        result = await tool_executor.execute_tool(
            tool_name="search_courses",
            tool_arguments={"query": "nonexistent topic", "limit": 5},
            session_id="test-session"
        )
        
        # Verify the tool execution was successful but found no courses
        assert result["success"] is True
        data = result["data"]
        assert len(data["courses"]) == 0
        assert data["total_found"] == 0
        assert data["search_method"] == "vector"

    @pytest.mark.asyncio
    async def test_course_search_error_handling(self, mock_course_service, mock_retrieval_service):
        """Test course search error handling."""
        # Mock service error
        mock_course_service.search_courses.side_effect = Exception("Database connection failed")
        
        tool_executor = ToolExecutor(mock_course_service, mock_retrieval_service)
        
        result = await tool_executor.execute_tool(
            tool_name="search_courses",
            tool_arguments={"query": "test query", "limit": 5},
            session_id="test-session"
        )
        
        # Verify error handling
        assert result["success"] is False
        assert "error" in result
        assert "Database connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_learning_path_recommendation_data_structure(self, tool_executor, mock_course_service):
        """Test that learning path recommendation also uses correct data structure."""
        result = await tool_executor.execute_tool(
            tool_name="recommend_learning_path",
            tool_arguments={"topic": "machine learning", "current_level": "beginner"},
            session_id="test-session"
        )
        
        # Verify the tool execution was successful
        assert result["success"] is True
        assert result["tool_name"] == "recommend_learning_path"
        
        # Verify that course service was called (learning path uses course search internally)
        mock_course_service.search_courses.assert_called()

    @pytest.mark.asyncio
    async def test_course_comparison_data_structure(self, tool_executor, mock_course_service):
        """Test that course comparison also uses correct data structure."""
        result = await tool_executor.execute_tool(
            tool_name="compare_courses",
            tool_arguments={"topic": "data science"},
            session_id="test-session"
        )
        
        # Verify the tool execution was successful
        assert result["success"] is True
        assert result["tool_name"] == "compare_courses"
        
        # Verify that course service was called
        mock_course_service.search_courses.assert_called()

    @pytest.mark.asyncio
    async def test_tool_result_formatting_for_llm(self, tool_executor, mock_course_service):
        """Test that tool results are correctly formatted for LLM consumption."""
        result = await tool_executor.execute_tool(
            tool_name="search_courses",
            tool_arguments={"query": "evaluate AI models", "limit": 5},
            session_id="test-session"
        )
        
        # Format the result for LLM
        formatted_result = tool_executor.format_tool_result_for_llm(result)
        
        # Verify the formatted result contains course information
        assert "Found 3 courses" in formatted_result
        assert "AI Model Evaluation Fundamentals" in formatted_result
        assert "Advanced Model Assessment Techniques" in formatted_result
        assert "Practical AI Evaluation" in formatted_result
        
        # Verify course details are included
        assert "intermediate" in formatted_result  # difficulty
        assert "4 weeks" in formatted_result  # duration
        assert "machine learning" in formatted_result  # topics

    @pytest.mark.asyncio
    async def test_regression_prevention(self, tool_executor, mock_course_service):
        """Regression test to ensure the original bug doesn't return."""
        # This test specifically checks that we don't regress to the old bug
        # where result.get("results", []) returned empty list instead of courses
        
        result = await tool_executor.execute_tool(
            tool_name="search_courses",
            tool_arguments={"query": "test query", "limit": 5},
            session_id="test-session"
        )
        
        # The bug was that courses would be empty even when the service found results
        # This should NOT happen anymore
        data = result["data"]
        courses = data["courses"]
        
        # Verify we get the actual courses, not an empty list
        assert len(courses) > 0, "Regression detected: courses list is empty despite service finding results"
        assert data["total_found"] > 0, "Regression detected: total_found is 0 despite service finding results"
        
        # Verify the execution summary would show correct count
        # (This was the visible symptom of the bug)
        formatted_result = tool_executor.format_tool_result_for_llm(result)
        assert "Found 3 courses" in formatted_result
        assert "No courses found" not in formatted_result
