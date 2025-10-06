"""
Integration tests for thinking content filtering in tool calling responses.

Tests that thinking content is properly filtered from user-facing responses.
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock
from app.services.tool_calling_service import ToolCallingService
from app.services.llm_service import LLMService
from app.tools.tool_executor import ToolExecutor


@pytest.mark.integration
class TestThinkingContentFiltering:
    """Integration tests for thinking content filtering."""

    @pytest.fixture
    def mock_llm_service_with_thinking(self):
        """Create a mock LLM service that generates thinking content."""
        llm = Mock(spec=LLMService)
        
        # Mock tool calling response
        async def mock_generate_completion_with_tools(*args, **kwargs):
            return {"tool_calls": []}  # No tools for this test
        
        # Mock streaming response with thinking content
        async def mock_generate_streaming(*args, **kwargs):
            chunks = [
                "<think>",
                "I need to think about this question. ",
                "The user is asking about the Weave framework. ",
                "Let me consider what I know about it.",
                "</think>",
                "The Weave framework is a powerful tool for ",
                "machine learning experiment tracking and ",
                "model management. It provides comprehensive ",
                "capabilities for monitoring ML workflows."
            ]
            for chunk in chunks:
                yield chunk
        
        llm.generate_completion_with_tools = mock_generate_completion_with_tools
        llm.generate_streaming = mock_generate_streaming
        
        return llm

    @pytest.fixture
    def mock_tool_executor_simple(self):
        """Create a simple mock tool executor."""
        executor = Mock(spec=ToolExecutor)
        
        async def mock_execute_tool(*args, **kwargs):
            return {"success": True, "data": {}}
        
        def mock_format_result(*args, **kwargs):
            return "Tool result formatted"
        
        executor.execute_tool = mock_execute_tool
        executor.format_tool_result_for_llm = mock_format_result
        
        return executor

    @pytest.fixture
    def tool_calling_service_with_thinking(self, mock_llm_service_with_thinking, mock_tool_executor_simple):
        """Create a tool calling service with thinking content generation."""
        return ToolCallingService(
            llm_service=mock_llm_service_with_thinking,
            tool_executor=mock_tool_executor_simple
        )

    @pytest.mark.asyncio
    async def test_thinking_content_filtered_from_streaming_response(self, tool_calling_service_with_thinking):
        """Test that thinking content is properly filtered from streaming responses."""
        query = "What is the Weave framework?"
        session_id = "test-thinking-filter-session"
        
        events = []
        response_chunks = []
        
        async for event in tool_calling_service_with_thinking.process_query_with_tools_streaming(
            query=query,
            session_id=session_id,
            max_tool_calls=1,
            top_k=3
        ):
            events.append(event)
            if event["type"] == "response":
                response_chunks.append(event["data"]["text"])
        
        # Verify that no thinking content appears in response chunks
        full_response = "".join(response_chunks)
        
        # Should not contain thinking tags or thinking content
        assert "<think>" not in full_response
        assert "</think>" not in full_response
        assert "I need to think about this question" not in full_response
        assert "Let me consider what I know" not in full_response
        
        # Should contain the actual response content
        assert "Weave framework" in full_response
        assert "machine learning" in full_response
        assert "experiment tracking" in full_response
        
        # Verify event structure
        response_events = [e for e in events if e["type"] == "response"]
        assert len(response_events) > 0
        
        # Verify no response event contains thinking content
        for event in response_events:
            chunk = event["data"]["text"]
            assert "<think>" not in chunk
            assert "</think>" not in chunk
            assert "I need to think" not in chunk

    @pytest.mark.asyncio
    async def test_thinking_content_with_split_tags(self, tool_calling_service_with_thinking):
        """Test thinking content filtering when tags are split across chunks."""
        # Mock LLM service with split thinking tags
        async def mock_generate_streaming_split(*args, **kwargs):
            chunks = [
                "Some initial content ",
                "<think>",
                "This is thinking content that should be filtered. ",
                "More thinking here.",
                "</think>",
                "This is the actual response content."
            ]
            for chunk in chunks:
                yield chunk
        
        tool_calling_service_with_thinking.llm_service.generate_streaming = mock_generate_streaming_split
        
        query = "Test split thinking tags"
        session_id = "test-split-tags-session"
        
        events = []
        response_chunks = []
        
        async for event in tool_calling_service_with_thinking.process_query_with_tools_streaming(
            query=query,
            session_id=session_id,
            max_tool_calls=1,
            top_k=3
        ):
            events.append(event)
            if event["type"] == "response":
                response_chunks.append(event["data"]["text"])
        
        full_response = "".join(response_chunks)
        
        # Should contain content before and after thinking tags
        assert "Some initial content" in full_response
        assert "This is the actual response content" in full_response
        
        # Should not contain thinking content
        assert "This is thinking content that should be filtered" not in full_response
        assert "More thinking here" not in full_response
        assert "<think>" not in full_response
        assert "</think>" not in full_response

    @pytest.mark.asyncio
    async def test_response_without_thinking_tags(self, tool_calling_service_with_thinking):
        """Test that responses without thinking tags work normally."""
        # Mock LLM service without thinking content
        async def mock_generate_streaming_no_thinking(*args, **kwargs):
            chunks = [
                "This is a normal response ",
                "without any thinking tags. ",
                "It should be streamed normally."
            ]
            for chunk in chunks:
                yield chunk
        
        tool_calling_service_with_thinking.llm_service.generate_streaming = mock_generate_streaming_no_thinking
        
        query = "Normal query without thinking"
        session_id = "test-no-thinking-session"
        
        events = []
        response_chunks = []
        
        async for event in tool_calling_service_with_thinking.process_query_with_tools_streaming(
            query=query,
            session_id=session_id,
            max_tool_calls=1,
            top_k=3
        ):
            events.append(event)
            if event["type"] == "response":
                response_chunks.append(event["data"]["text"])
        
        full_response = "".join(response_chunks)
        
        # Should contain all the content
        assert "This is a normal response" in full_response
        assert "without any thinking tags" in full_response
        assert "It should be streamed normally" in full_response
        
        # Should have multiple response events
        response_events = [e for e in events if e["type"] == "response"]
        assert len(response_events) == 3

    @pytest.mark.asyncio
    async def test_multiple_thinking_blocks(self, tool_calling_service_with_thinking):
        """Test filtering multiple thinking blocks in one response."""
        # Mock LLM service with multiple thinking blocks
        async def mock_generate_streaming_multiple(*args, **kwargs):
            chunks = [
                "Initial response. ",
                "<think>First thinking block.</think>",
                "Middle content. ",
                "<think>Second thinking block.</think>",
                "Final response content."
            ]
            for chunk in chunks:
                yield chunk
        
        tool_calling_service_with_thinking.llm_service.generate_streaming = mock_generate_streaming_multiple
        
        query = "Test multiple thinking blocks"
        session_id = "test-multiple-thinking-session"
        
        events = []
        response_chunks = []
        
        async for event in tool_calling_service_with_thinking.process_query_with_tools_streaming(
            query=query,
            session_id=session_id,
            max_tool_calls=1,
            top_k=3
        ):
            events.append(event)
            if event["type"] == "response":
                response_chunks.append(event["data"]["text"])
        
        full_response = "".join(response_chunks)
        
        # Should contain non-thinking content
        assert "Initial response" in full_response
        assert "Middle content" in full_response
        assert "Final response content" in full_response
        
        # Should not contain thinking content
        assert "First thinking block" not in full_response
        assert "Second thinking block" not in full_response
        assert "<think>" not in full_response
        assert "</think>" not in full_response
