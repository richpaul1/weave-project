"""
Functional test for streaming response accumulation bug

This test specifically covers the bug where streaming responses were not being
accumulated correctly due to incorrect event structure parsing.

Bug: The streaming endpoint was looking for event.get("content") but the actual
events have structure {"type": "response", "data": {"text": "..."}}

This test mocks the RAG service to return events with the correct structure
and verifies that the accumulation works properly.
"""
import pytest
import json
import uuid
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


@pytest.fixture
def test_session_id():
    """Generate a unique session ID for testing"""
    return f"functional-test-{uuid.uuid4()}"


class TestStreamingResponseAccumulation:
    """Functional tests for streaming response accumulation"""
    
    @pytest.mark.asyncio
    async def test_response_accumulation_with_correct_event_structure(self, client, test_session_id):
        """
        Test that streaming responses are accumulated correctly with proper event structure
        
        This test specifically covers the bug where:
        - Events have structure {"type": "response", "data": {"text": "..."}}
        - But accumulation code was looking for event.get("content")
        - Result: AI messages were saved with empty content
        """
        
        # Mock the RAG service to return events with correct structure
        mock_events = [
            # Context event
            {
                "type": "context",
                "data": {
                    "sources": [],
                    "num_pages": 0,
                    "num_sources": 0
                }
            },
            # Thinking events with correct structure
            {
                "type": "thinking",
                "data": {
                    "text": "Let me think about this question. "
                }
            },
            {
                "type": "thinking", 
                "data": {
                    "text": "The user is asking about Weave. "
                }
            },
            {
                "type": "thinking",
                "data": {
                    "text": "I should provide a helpful response."
                }
            },
            # Response events with correct structure
            {
                "type": "response",
                "data": {
                    "text": "Weave is "
                }
            },
            {
                "type": "response",
                "data": {
                    "text": "a powerful tool "
                }
            },
            {
                "type": "response",
                "data": {
                    "text": "for ML observability "
                }
            },
            {
                "type": "response",
                "data": {
                    "text": "and experiment tracking."
                }
            },
            # Done event
            {
                "type": "done",
                "data": {
                    "response": "Weave is a powerful tool for ML observability and experiment tracking.",
                    "sources": [],
                    "metadata": {
                        "session_id": test_session_id,
                        "model": "test-model",
                        "provider": "test"
                    }
                }
            }
        ]
        
        async def mock_process_query_streaming(*args, **kwargs):
            """Mock RAG service that yields events with correct structure"""
            for event in mock_events:
                yield event
        
        # Mock the storage service to track what gets saved
        saved_messages = []
        
        def mock_create_chat_message(message_data, session_id):
            """Mock storage service that tracks saved messages"""
            message_id = str(uuid.uuid4())
            message = {
                "id": message_id,
                **message_data
            }
            saved_messages.append(message)
            return message
        
        # Apply mocks
        with patch('app.routes.chat.enhanced_rag_service') as mock_enhanced_rag_service, \
             patch('app.routes.chat.storage_service') as mock_storage_service:

            # Configure mocks
            mock_enhanced_rag_service.process_query_streaming = mock_process_query_streaming
            mock_storage_service.create_chat_message = mock_create_chat_message
            
            # Send streaming request
            request_data = {
                "query": "What is Weave?",
                "session_id": test_session_id,
                "top_k": 3
            }
            
            response = client.post("/api/chat/stream", json=request_data)
            
            # Verify streaming response is successful
            assert response.status_code == 200
            assert "text/event-stream" in response.headers.get("content-type", "")
            
            # Parse streaming response
            response_content = response.content.decode('utf-8')
            events = []
            for line in response_content.split('\n'):
                if line.startswith('data: '):
                    try:
                        event_data = json.loads(line[6:])
                        events.append(event_data)
                    except json.JSONDecodeError:
                        continue
            
            # Verify we got expected events
            event_types = [event.get('type') for event in events]
            assert 'user_saved' in event_types
            assert 'complete' in event_types
            
            # Verify messages were saved correctly
            assert len(saved_messages) == 2, f"Expected 2 messages, got {len(saved_messages)}"
            
            user_message = saved_messages[0]
            ai_message = saved_messages[1]
            
            # Verify user message
            assert user_message['sender'] == 'user'
            assert user_message['message'] == "What is Weave?"
            assert user_message['sessionId'] == test_session_id
            
            # Verify AI message - this is the key test for the bug
            assert ai_message['sender'] == 'ai'
            
            # The accumulated response should contain all the text chunks
            expected_response = "Weave is a powerful tool for ML observability and experiment tracking."
            assert ai_message['message'] == expected_response, \
                f"AI message content mismatch. Expected: '{expected_response}', Got: '{ai_message['message']}'"
            
            # The accumulated thinking should contain all thinking chunks
            expected_thinking = "Let me think about this question. The user is asking about Weave. I should provide a helpful response."
            assert ai_message['thinking'] == expected_thinking, \
                f"AI thinking content mismatch. Expected: '{expected_thinking}', Got: '{ai_message['thinking']}'"
            
            assert ai_message['sessionId'] == test_session_id
    
    @pytest.mark.asyncio
    async def test_response_accumulation_with_old_incorrect_structure(self, client, test_session_id):
        """
        Test that demonstrates the bug with incorrect event structure
        
        This test shows what would happen with the old incorrect accumulation logic
        that was looking for event.get("content") instead of event.get("data", {}).get("text")
        """
        
        # Mock events with the structure that was causing the bug
        mock_events = [
            # Events with incorrect structure (what the old code expected)
            {
                "type": "response",
                "content": "This would work with old code"  # Wrong structure
            },
            # Events with correct structure (what actually gets generated)
            {
                "type": "response", 
                "data": {
                    "text": "This is the actual structure"  # Correct structure
                }
            }
        ]
        
        async def mock_process_query_streaming(*args, **kwargs):
            for event in mock_events:
                yield event
        
        saved_messages = []
        
        def mock_create_chat_message(message_data, session_id):
            message_id = str(uuid.uuid4())
            message = {"id": message_id, **message_data}
            saved_messages.append(message)
            return message
        
        with patch('app.routes.chat.enhanced_rag_service') as mock_enhanced_rag_service, \
             patch('app.routes.chat.storage_service') as mock_storage_service:

            mock_enhanced_rag_service.process_query_streaming = mock_process_query_streaming
            mock_storage_service.create_chat_message = mock_create_chat_message
            
            request_data = {
                "query": "Test query",
                "session_id": test_session_id,
                "top_k": 3
            }
            
            response = client.post("/api/chat/stream", json=request_data)
            assert response.status_code == 200
            
            # With the fixed code, only the correctly structured event should be accumulated
            ai_message = saved_messages[1]  # Second message is AI response
            
            # Should only contain text from correctly structured events
            assert ai_message['message'] == "This is the actual structure"
            # Should NOT contain text from incorrectly structured events
            assert "This would work with old code" not in ai_message['message']
    
    @pytest.mark.asyncio 
    async def test_empty_response_accumulation(self, client, test_session_id):
        """
        Test that empty or malformed events don't break accumulation
        """
        
        mock_events = [
            # Empty data
            {"type": "response", "data": {}},
            # Missing text field
            {"type": "response", "data": {"other_field": "value"}},
            # Valid event
            {"type": "response", "data": {"text": "Valid response"}},
            # Malformed event
            {"type": "response"},
            # Another valid event
            {"type": "response", "data": {"text": " text"}}
        ]
        
        async def mock_process_query_streaming(*args, **kwargs):
            for event in mock_events:
                yield event
        
        saved_messages = []
        
        def mock_create_chat_message(message_data, session_id):
            message_id = str(uuid.uuid4())
            message = {"id": message_id, **message_data}
            saved_messages.append(message)
            return message
        
        with patch('app.routes.chat.enhanced_rag_service') as mock_enhanced_rag_service, \
             patch('app.routes.chat.storage_service') as mock_storage_service:

            mock_enhanced_rag_service.process_query_streaming = mock_process_query_streaming
            mock_storage_service.create_chat_message = mock_create_chat_message
            
            request_data = {
                "query": "Test query",
                "session_id": test_session_id,
                "top_k": 3
            }
            
            response = client.post("/api/chat/stream", json=request_data)
            assert response.status_code == 200
            
            # Should accumulate only valid text
            ai_message = saved_messages[1]
            assert ai_message['message'] == "Valid response text"


if __name__ == "__main__":
    # Allow running this test file directly
    pytest.main([__file__, "-v", "-s"])
