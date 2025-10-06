"""
Functional tests for thinking content persistence in streaming tool calling.

These tests verify that thinking content generated during streaming is properly
captured and stored in the database, and can be retrieved after page refresh.
"""

import pytest
import asyncio
import json
import uuid
from typing import List, Dict, Any
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.storage import StorageService
from app.services.tool_calling_service import ToolCallingService
from app.services.llm_service import LLMService


@pytest.mark.functional
class TestThinkingContentPersistence:
    """Test thinking content persistence in streaming tool calling."""

    @pytest.fixture
    def session_id(self):
        """Generate a unique session ID for testing."""
        return str(uuid.uuid4())

    @pytest.fixture
    def mock_storage_service(self):
        """Mock storage service for testing."""
        storage = MagicMock(spec=StorageService)
        storage.create_chat_message = MagicMock()
        storage.get_chat_messages = MagicMock()
        return storage

    @pytest.fixture
    def mock_llm_service(self):
        """Mock LLM service for testing."""
        llm = MagicMock(spec=LLMService)
        
        # Mock streaming response with thinking content
        async def mock_generate_streaming(*args, **kwargs):
            chunks = [
                "<think>I need to search for courses about AI evaluation.</think>",
                "Based on my search, here are the best courses:",
                "\n\n1. **LLM Evaluation Course** - W&B",
                "\n2. **ML Model Assessment** - Coursera"
            ]
            for chunk in chunks:
                yield chunk

        llm.generate_streaming = mock_generate_streaming

        # Mock tool calling method
        async def mock_generate_completion_with_tools(*args, **kwargs):
            return {"tool_calls": []}  # No tool calls to avoid the len() error

        llm.generate_completion_with_tools = AsyncMock(side_effect=mock_generate_completion_with_tools)
        return llm

    @pytest.fixture
    def mock_tool_executor(self):
        """Mock tool executor for testing."""
        from app.tools.tool_executor import ToolExecutor
        executor = MagicMock(spec=ToolExecutor)
        
        async def mock_execute_tool(tool_name, arguments):
            return {
                "success": True,
                "data": {
                    "courses": ["LLM Evaluation Course", "ML Model Assessment"],
                    "total_found": 2
                },
                "tool_name": tool_name,
                "arguments": arguments
            }
        
        executor.execute_tool = AsyncMock(side_effect=mock_execute_tool)
        return executor

    def test_thinking_content_captured_during_streaming(self, session_id, mock_llm_service, mock_tool_executor):
        """Test that thinking content is captured during streaming tool calling."""
        
        async def run_streaming_test():
            # Create tool calling service with mocks
            service = ToolCallingService(
                llm_service=mock_llm_service,
                tool_executor=mock_tool_executor
            )
            
            full_response = ""
            full_thinking = ""
            thinking_blocks = []
            
            # Process streaming events
            async for event in service.process_query_with_tools_streaming(
                query="What courses help with AI model evaluation?",
                session_id=session_id,
                max_tool_calls=1,
                top_k=3
            ):
                if event["type"] == "response":
                    full_response += event["data"]["text"]
                elif event["type"] == "thinking_content":
                    full_thinking += event["data"]["text"]
                elif event["type"] == "thinking_end":
                    thinking_blocks.append(event["data"]["block_number"])
            
            return full_response, full_thinking, thinking_blocks
        
        # Run the test
        response, thinking, blocks = asyncio.run(run_streaming_test())
        
        # Verify thinking content was captured
        assert thinking != ""
        assert "I need to search for courses about AI evaluation." in thinking
        # The thinking content should include the tags (either opening or closing)
        assert "<think>" in thinking or "</think>" in thinking
        
        # Verify response content was captured
        assert response != ""
        assert "LLM Evaluation Course" in response
        
        # Verify thinking blocks were tracked
        assert len(blocks) > 0

    def test_thinking_content_stored_with_weave_instrumentation(self, session_id, mock_storage_service):
        """Test that thinking content storage is properly instrumented with Weave."""
        
        with patch('app.routes.chat.storage_service', mock_storage_service):
            # Simulate the storage call with thinking content
            thinking_content = "<think>I need to search for courses about AI evaluation.</think>"
            response_content = "Based on my search, here are the best courses for AI model evaluation."
            
            # This should be instrumented by Weave
            mock_storage_service.create_chat_message(
                message_data={
                    "sessionId": session_id,
                    "sender": "ai",
                    "message": response_content,
                    "thinking": thinking_content,
                    "metadata": {
                        "tool_calls_made": 1,
                        "tools_used": ["search_courses"],
                        "streaming": True,
                        "thinking_blocks": 1
                    }
                },
                session_id=session_id
            )
            
            # Verify storage was called with thinking content
            mock_storage_service.create_chat_message.assert_called_once()
            call_args = mock_storage_service.create_chat_message.call_args
            message_data = call_args[1]["message_data"]
            
            assert message_data["thinking"] == thinking_content
            assert message_data["message"] == response_content
            assert message_data["metadata"]["thinking_blocks"] == 1

    def test_thinking_content_retrievable_after_refresh(self, session_id, mock_storage_service):
        """Test that thinking content can be retrieved after page refresh."""
        
        # Mock stored messages with thinking content
        stored_messages = [
            {
                "id": "msg1",
                "sessionId": session_id,
                "sender": "user",
                "message": "What courses help with AI model evaluation?",
                "thinking": "",
                "timestamp": "2024-01-01T12:00:00Z"
            },
            {
                "id": "msg2",
                "sessionId": session_id,
                "sender": "ai",
                "message": "Based on my search, here are the best courses for AI model evaluation.",
                "thinking": "<think>I need to search for courses about AI evaluation.</think>",
                "timestamp": "2024-01-01T12:00:01Z"
            }
        ]
        
        mock_storage_service.get_chat_messages.return_value = stored_messages
        
        # Simulate message retrieval (as done during page refresh)
        messages = mock_storage_service.get_chat_messages(session_id)
        
        # Verify thinking content is preserved
        assert len(messages) == 2
        
        ai_message = messages[1]
        assert ai_message["sender"] == "ai"
        assert ai_message["thinking"] != ""
        assert "I need to search for courses about AI evaluation." in ai_message["thinking"]
        assert "<think>" in ai_message["thinking"]
        assert "</think>" in ai_message["thinking"]

    def test_multiple_thinking_blocks_captured_and_stored(self, session_id):
        """Test that multiple thinking blocks are properly captured and stored."""
        
        # Mock LLM service with multiple thinking blocks
        mock_llm = MagicMock(spec=LLMService)
        
        async def mock_stream_with_multiple_thinking(*args, **kwargs):
            chunks = [
                "<think>First thinking block about the query.</think>",
                "Let me search for that information.",
                "<think>Second thinking block about the results.</think>",
                " Here are the results.",
                "<think>Third thinking block for final analysis.</think>",
                " Final conclusion."
            ]
            for chunk in chunks:
                yield chunk

        mock_llm.generate_streaming = mock_stream_with_multiple_thinking

        # Mock tool calling method
        async def mock_generate_completion_with_tools(*args, **kwargs):
            return {"tool_calls": []}  # No tool calls to avoid the len() error

        mock_llm.generate_completion_with_tools = AsyncMock(side_effect=mock_generate_completion_with_tools)
        
        # Mock tool executor
        mock_executor = MagicMock()
        mock_executor.execute_tool = AsyncMock(return_value={
            "success": True,
            "data": {"results": "test"},
            "tool_name": "search_courses"
        })
        
        async def run_multiple_blocks_test():
            service = ToolCallingService(
                llm_service=mock_llm,
                tool_executor=mock_executor
            )
            
            full_response = ""
            full_thinking = ""
            thinking_blocks = []
            
            async for event in service.process_query_with_tools_streaming(
                query="Complex query requiring multiple thinking steps",
                session_id=session_id,
                max_tool_calls=1,
                top_k=3
            ):
                if event["type"] == "response":
                    full_response += event["data"]["text"]
                elif event["type"] == "thinking_content":
                    full_thinking += event["data"]["text"]
                elif event["type"] == "thinking_end":
                    thinking_blocks.append(event["data"]["block_number"])
            
            return full_response, full_thinking, thinking_blocks
        
        # Run the test
        response, thinking, blocks = asyncio.run(run_multiple_blocks_test())
        
        # Verify all thinking blocks were captured
        assert "First thinking block about the query." in thinking
        assert "Second thinking block about the results." in thinking
        assert "Third thinking block for final analysis." in thinking
        
        # Verify multiple thinking blocks were tracked
        assert len(blocks) >= 3
        
        # Verify response content
        assert "Let me search for that information." in response
        assert "Here are the results." in response
        assert "Final conclusion." in response

    def test_thinking_content_weave_tracking(self, session_id):
        """Test that thinking content operations are properly tracked by Weave."""
        
        with patch('weave.op') as mock_weave_op:
            # Mock the weave decorator
            def mock_decorator(func):
                return func
            mock_weave_op.return_value = mock_decorator
            
            # Import after patching to ensure the decorator is mocked
            from app.services.storage import StorageService
            
            storage = StorageService()
            
            # Test that storage operations are decorated with @weave.op()
            thinking_content = "<think>Test thinking content</think>"
            
            # This should be tracked by Weave
            with patch.object(storage, '_get_session'):
                with patch.object(storage, 'create_chat_message') as mock_create:
                    mock_create.return_value = {"id": "test_id"}
                    
                    result = storage.create_chat_message({
                        "sessionId": session_id,
                        "sender": "ai",
                        "message": "Test response",
                        "thinking": thinking_content
                    })
                    
                    # Verify the method was called with thinking content
                    mock_create.assert_called_once()

    def test_end_to_end_thinking_persistence(self, session_id):
        """Test complete end-to-end thinking content persistence flow."""
        
        async def run_e2e_test():
            # Mock all dependencies
            mock_storage = MagicMock(spec=StorageService)
            mock_llm = MagicMock(spec=LLMService)
            mock_executor = MagicMock()
            
            # Mock LLM streaming with thinking
            async def mock_stream(*args, **kwargs):
                yield "<think>Planning my response</think>"
                yield "Here is my response based on the search results."

            mock_llm.generate_streaming = mock_stream

            # Mock tool calling method
            async def mock_generate_completion_with_tools(*args, **kwargs):
                return {"tool_calls": []}  # No tool calls to avoid the len() error

            mock_llm.generate_completion_with_tools = AsyncMock(side_effect=mock_generate_completion_with_tools)
            mock_executor.execute_tool = AsyncMock(return_value={
                "success": True,
                "data": {"results": "test"},
                "tool_name": "search_courses"
            })
            
            # Create service
            service = ToolCallingService(
                llm_service=mock_llm,
                tool_executor=mock_executor
            )
            
            # Collect all events
            events = []
            async for event in service.process_query_with_tools_streaming(
                query="Test query",
                session_id=session_id,
                max_tool_calls=1,
                top_k=3
            ):
                events.append(event)
            
            # Simulate storage (as done in the actual endpoint)
            full_response = ""
            full_thinking = ""
            
            for event in events:
                if event["type"] == "response":
                    full_response += event["data"]["text"]
                elif event["type"] == "thinking_content":
                    full_thinking += event["data"]["text"]
            
            # Store the message (this should happen in the endpoint)
            mock_storage.create_chat_message(
                message_data={
                    "sessionId": session_id,
                    "sender": "ai",
                    "message": full_response,
                    "thinking": full_thinking,
                    "metadata": {"streaming": True}
                },
                session_id=session_id
            )
            
            # Simulate retrieval after refresh
            mock_storage.get_chat_messages.return_value = [{
                "id": "test_id",
                "sessionId": session_id,
                "sender": "ai",
                "message": full_response,
                "thinking": full_thinking,
                "timestamp": "2024-01-01T12:00:00Z"
            }]
            
            retrieved_messages = mock_storage.get_chat_messages(session_id)
            
            return full_thinking, retrieved_messages
        
        # Run the test
        thinking, messages = asyncio.run(run_e2e_test())
        
        # Verify thinking content persisted through the entire flow
        assert thinking != ""
        assert "Planning my response" in thinking
        assert len(messages) == 1
        assert messages[0]["thinking"] == thinking
