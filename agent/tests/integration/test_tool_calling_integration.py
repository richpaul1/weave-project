"""
Integration tests for tool calling functionality.

Tests the complete flow from user query to LLM tool selection to response.
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from app.services.tool_calling_service import ToolCallingService
from app.services.llm_service import LLMService
from app.tools.tool_executor import ToolExecutor
from app.services.independent_course_service import IndependentCourseService
from app.services.retrieval_service import RetrievalService


@pytest.mark.integration
class TestToolCallingIntegration:
    """Integration tests for tool calling system."""

    @pytest.fixture
    def mock_llm_service(self):
        """Create a mock LLM service that simulates tool calling decisions."""
        llm = Mock(spec=LLMService)
        
        # Mock tool calling response for course search
        async def mock_generate_completion_with_tools(*args, **kwargs):
            messages = kwargs.get('messages', [])
            last_message = messages[-1]['content'] if messages else ""
            
            if "course" in last_message.lower() or "learn" in last_message.lower():
                return {
                    "tool_calls": [{
                        "id": "call_123",
                        "function": {
                            "name": "search_courses",
                            "arguments": '{"query": "machine learning", "limit": 5}'
                        }
                    }]
                }
            else:
                return {"tool_calls": []}
        
        # Mock final response generation
        async def mock_generate_completion(*args, **kwargs):
            return {
                "text": "Based on the course search results, I found several machine learning courses available. Here are some recommendations...",
                "tokens": 150
            }

        # Mock streaming response generation
        async def mock_generate_streaming(*args, **kwargs):
            chunks = ["Based ", "on ", "the ", "course ", "search ", "results, ", "I ", "found ", "several ", "machine ", "learning ", "courses ", "available."]
            for chunk in chunks:
                yield chunk

        llm.generate_completion_with_tools = mock_generate_completion_with_tools
        llm.generate_completion = mock_generate_completion
        llm.generate_streaming = mock_generate_streaming
        
        return llm

    @pytest.fixture
    def mock_course_service(self):
        """Create a mock course service that returns sample courses."""
        service = Mock(spec=IndependentCourseService)
        
        async def mock_search_courses(*args, **kwargs):
            return {
                "success": True,
                "data": {
                    "searchMethod": "vector",
                    "total": 2,
                    "results": [
                        {
                            "title": "Machine Learning Fundamentals",
                            "description": "Learn the basics of machine learning",
                            "difficulty": "Beginner",
                            "instructor": "Dr. Smith",
                            "url": "https://example.com/ml-course"
                        },
                        {
                            "title": "Advanced ML Algorithms",
                            "description": "Deep dive into ML algorithms",
                            "difficulty": "Advanced", 
                            "instructor": "Prof. Johnson",
                            "url": "https://example.com/advanced-ml"
                        }
                    ]
                }
            }
        
        service.search_courses = mock_search_courses
        return service

    @pytest.fixture
    def mock_retrieval_service(self):
        """Create a mock retrieval service."""
        service = Mock(spec=RetrievalService)
        
        async def mock_retrieve_context(*args, **kwargs):
            return {
                "context_text": "Machine learning is a subset of artificial intelligence...",
                "num_chunks": 3,
                "num_sources": 2,
                "sources": ["ML Guide", "AI Handbook"]
            }
        
        service.retrieve_context = mock_retrieve_context
        return service

    @pytest.fixture
    def tool_executor(self, mock_course_service, mock_retrieval_service):
        """Create a tool executor with mocked services."""
        return ToolExecutor(
            course_service=mock_course_service,
            retrieval_service=mock_retrieval_service
        )

    @pytest.fixture
    def tool_calling_service(self, mock_llm_service, tool_executor):
        """Create a tool calling service with mocked dependencies."""
        return ToolCallingService(
            llm_service=mock_llm_service,
            tool_executor=tool_executor
        )

    @pytest.mark.asyncio
    async def test_course_search_tool_calling_flow(self, tool_calling_service):
        """Test complete flow: user asks about courses → LLM chooses search_courses → returns results."""
        # Test query that should trigger course search
        query = "What machine learning courses are available?"
        session_id = "test-integration-session"

        # Process query with tool calling
        result = await tool_calling_service.process_query_with_tools(
            query=query,
            session_id=session_id,
            max_tool_calls=3,
            top_k=3
        )
        
        # Verify the result structure
        assert "response" in result
        assert "tool_calls_made" in result
        assert "metadata" in result
        
        # Verify tool was called
        assert len(result["tool_calls_made"]) > 0
        tool_call = result["tool_calls_made"][0]
        assert tool_call["tool_name"] == "search_courses"
        assert "machine learning" in tool_call["arguments"]["query"]
        
        # Verify metadata
        metadata = result["metadata"]
        assert metadata["num_tool_calls"] > 0
        assert "search_courses" in metadata["tools_used"]
        assert metadata["search_courses_used"] is True
        assert metadata["learning_query"] is True
        
        # Verify response contains course information
        response = result["response"]
        assert "course" in response.lower()
        assert len(response) > 0

    @pytest.mark.asyncio
    async def test_general_query_no_tool_calling(self, tool_calling_service):
        """Test that general queries don't trigger unnecessary tool calls."""
        # Mock LLM to not call tools for general queries
        async def mock_no_tools(*args, **kwargs):
            return {"tool_calls": []}

        tool_calling_service.llm_service.generate_completion_with_tools = mock_no_tools

        query = "What is the weather today?"
        session_id = "test-general-session"

        result = await tool_calling_service.process_query_with_tools(
            query=query,
            session_id=session_id,
            max_tool_calls=3,
            top_k=3
        )
        
        # Verify no tools were called
        assert len(result["tool_calls_made"]) == 0
        assert result["metadata"]["num_tool_calls"] == 0
        assert result["metadata"]["tools_used"] == []

    @pytest.mark.asyncio
    async def test_streaming_tool_calling_flow(self, tool_calling_service):
        """Test streaming tool calling functionality."""
        query = "I want to learn data science"
        session_id = "test-streaming-session"
        
        events = []
        async for event in tool_calling_service.process_query_with_tools_streaming(
            query=query,
            session_id=session_id,
            max_tool_calls=3,
            top_k=3
        ):
            events.append(event)
        
        # Verify event sequence
        event_types = [event["type"] for event in events]
        
        # Should have these events in order
        assert "tool_calling_start" in event_types
        assert "tool_iteration" in event_types
        assert "tool_calls_requested" in event_types
        assert "tool_execution_start" in event_types
        assert "tool_execution_result" in event_types
        assert "final_response_start" in event_types
        assert "response" in event_types
        assert "done" in event_types
        
        # Verify tool execution events
        tool_execution_events = [e for e in events if e["type"] == "tool_execution_start"]
        assert len(tool_execution_events) > 0
        assert tool_execution_events[0]["data"]["tool_name"] == "search_courses"

    @pytest.mark.asyncio
    async def test_tool_calling_error_handling(self, tool_calling_service):
        """Test error handling in tool calling flow."""
        # Mock tool executor to raise an exception
        async def mock_failing_tool(*args, **kwargs):
            raise Exception("Tool execution failed")
        
        tool_calling_service.tool_executor.execute_tool = mock_failing_tool
        
        query = "What courses are available for Python?"
        session_id = "test-error-session"
        
        # Should not raise exception, but handle gracefully
        result = await tool_calling_service.process_query_with_tools(
            query=query,
            session_id=session_id,
            max_tool_calls=1
        )
        
        # Should still return a response even if tools fail
        assert "response" in result
        assert "tool_calls_made" in result

    @pytest.mark.asyncio
    async def test_max_tool_calls_limit(self, tool_calling_service):
        """Test that tool calling respects max_tool_calls limit."""
        # Mock LLM to always want to call tools
        async def mock_always_call_tools(*args, **kwargs):
            return {
                "tool_calls": [{
                    "id": "call_123",
                    "function": {
                        "name": "search_courses",
                        "arguments": '{"query": "test", "limit": 5}'
                    }
                }]
            }
        
        tool_calling_service.llm_service.generate_completion_with_tools = mock_always_call_tools

        query = "Tell me about courses"
        session_id = "test-limit-session"
        max_calls = 2

        result = await tool_calling_service.process_query_with_tools(
            query=query,
            session_id=session_id,
            max_tool_calls=max_calls,
            top_k=3
        )
        
        # Should not exceed max_tool_calls
        assert len(result["tool_calls_made"]) <= max_calls
        assert result["metadata"]["num_tool_calls"] <= max_calls

    @pytest.mark.asyncio
    async def test_tool_calling_metadata_tracking(self, tool_calling_service):
        """Test that tool calling properly tracks metadata for Weave."""
        query = "Find me Python programming courses"
        session_id = "test-metadata-session"
        
        result = await tool_calling_service.process_query_with_tools(
            query=query,
            session_id=session_id,
            max_tool_calls=3,
            top_k=3
        )
        
        metadata = result["metadata"]
        
        # Verify comprehensive metadata
        assert "query" in metadata
        assert "num_tool_calls" in metadata
        assert "tools_used" in metadata
        assert "tool_execution_summary" in metadata
        assert "tool_categories_used" in metadata
        assert "session_id" in metadata
        
        # Verify flags for Weave filtering
        assert "tool_calling_completed" in metadata
        assert "search_courses_used" in metadata
        assert "learning_query" in metadata
        
        # Verify tool execution summary
        summary = metadata["tool_execution_summary"]
        assert "total_calls" in summary
        assert "tools_breakdown" in summary
        assert "successful_calls" in summary
        assert "failed_calls" in summary
