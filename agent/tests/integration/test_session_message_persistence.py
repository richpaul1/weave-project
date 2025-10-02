"""
Integration test for complete session flow: create session, ask LLM question, verify message persistence

This test verifies the complete end-to-end flow:
1. Create a new session
2. Send a question to the LLM via streaming endpoint
3. Verify user message is saved in session history
4. Verify LLM response is saved in session history
5. Verify message content and metadata are correct
"""
import pytest
import logging
import json
import uuid
from fastapi.testclient import TestClient
from app.main import app

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


@pytest.fixture
def test_session_id():
    """Generate a unique session ID for testing"""
    return f"integration-test-{uuid.uuid4()}"


class TestSessionMessagePersistence:
    """Integration tests for complete session message flow"""
    
    def test_complete_session_flow(self, client, test_session_id):
        """
        Test complete flow: session creation, LLM interaction, message persistence
        
        This is the main integration test that verifies:
        1. Session is created implicitly when first message is sent
        2. User question is saved to database
        3. LLM processes the question and generates response
        4. LLM response is saved to database
        5. Both messages are retrievable from session history
        """
        logger.info(f"🧪 Starting complete session flow test with session: {test_session_id}")
        
        # Step 1: Verify session doesn't exist initially
        logger.info("📋 Step 1: Verify session doesn't exist initially")
        response = client.get(f"/api/chat/messages/{test_session_id}")
        assert response.status_code == 200
        initial_messages = response.json()
        assert initial_messages == []
        logger.info("✅ Confirmed session is empty initially")
        
        # Step 2: Send a question via streaming endpoint (this should save both user and AI messages)
        logger.info("📋 Step 2: Send question via streaming endpoint")
        test_question = "What is Weave and how does it help with ML observability?"
        
        request_data = {
            "query": test_question,
            "session_id": test_session_id,
            "top_k": 3
        }
        
        logger.info(f"Sending request: {request_data}")
        response = client.post("/api/chat/stream", json=request_data)
        
        # Verify streaming response is successful
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
        logger.info("✅ Streaming request successful")
        
        # Parse streaming response to verify events
        response_content = response.content.decode('utf-8')
        logger.info(f"Streaming response length: {len(response_content)} characters")
        
        # Verify we received expected events
        events = []
        for line in response_content.split('\n'):
            if line.startswith('data: '):
                try:
                    event_data = json.loads(line[6:])  # Remove 'data: ' prefix
                    events.append(event_data)
                except json.JSONDecodeError:
                    continue
        
        logger.info(f"Parsed {len(events)} events from stream")
        
        # Verify we got the expected event types
        event_types = [event.get('type') for event in events]
        logger.info(f"Event types received: {event_types}")
        
        # Should have user_saved, thinking/response events, and complete
        assert 'user_saved' in event_types, f"Missing user_saved event. Got: {event_types}"
        assert 'complete' in event_types, f"Missing complete event. Got: {event_types}"
        
        # Find the completion event to get message IDs
        completion_event = None
        for event in events:
            if event.get('type') == 'complete':
                completion_event = event
                break
        
        assert completion_event is not None, "No completion event found"
        assert 'user_message_id' in completion_event, f"Missing user_message_id in completion: {completion_event}"
        assert 'ai_message_id' in completion_event, f"Missing ai_message_id in completion: {completion_event}"
        
        user_message_id = completion_event['user_message_id']
        ai_message_id = completion_event['ai_message_id']
        logger.info(f"✅ Got message IDs - User: {user_message_id}, AI: {ai_message_id}")
        
        # Step 3: Verify messages are saved in session history
        logger.info("📋 Step 3: Verify messages are saved in session history")
        response = client.get(f"/api/chat/messages/{test_session_id}")
        assert response.status_code == 200
        
        messages = response.json()
        logger.info(f"Retrieved {len(messages)} messages from session")
        
        # Should have exactly 2 messages (user + AI)
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}: {messages}"
        
        # Sort messages by timestamp to ensure correct order
        messages.sort(key=lambda x: x.get('timestamp', ''))
        
        user_message = messages[0]
        ai_message = messages[1]
        
        # Step 4: Verify user message content and metadata
        logger.info("📋 Step 4: Verify user message content and metadata")
        assert user_message['id'] == user_message_id, f"User message ID mismatch: {user_message['id']} != {user_message_id}"
        assert user_message['sender'] == 'user', f"Expected sender 'user', got '{user_message['sender']}'"
        assert user_message['message'] == test_question, f"User message content mismatch: '{user_message['message']}' != '{test_question}'"
        assert user_message['sessionId'] == test_session_id, f"Session ID mismatch: {user_message['sessionId']} != {test_session_id}"
        assert 'timestamp' in user_message, "User message missing timestamp"
        logger.info("✅ User message verified successfully")
        
        # Step 5: Verify AI message content and metadata
        logger.info("📋 Step 5: Verify AI message content and metadata")
        assert ai_message['id'] == ai_message_id, f"AI message ID mismatch: {ai_message['id']} != {ai_message_id}"
        assert ai_message['sender'] == 'ai', f"Expected sender 'ai', got '{ai_message['sender']}'"
        assert len(ai_message['message']) > 0, "AI message is empty"
        assert user_message['sessionId'] == test_session_id, f"Session ID mismatch: {ai_message['sessionId']} != {test_session_id}"
        assert 'timestamp' in ai_message, "AI message missing timestamp"
        
        # Verify AI response contains relevant content about Weave
        ai_response = ai_message['message'].lower()
        assert any(keyword in ai_response for keyword in ['weave', 'observability', 'ml', 'machine learning']), \
            f"AI response doesn't seem relevant to Weave: {ai_message['message'][:200]}..."
        
        logger.info("✅ AI message verified successfully")
        logger.info(f"AI response preview: {ai_message['message'][:200]}...")
        
        # Step 6: Verify session appears in sessions list
        logger.info("📋 Step 6: Verify session appears in sessions list")
        response = client.get("/api/chat/sessions")
        assert response.status_code == 200
        
        sessions = response.json()
        session_ids = [session['sessionId'] for session in sessions]
        assert test_session_id in session_ids, f"Test session {test_session_id} not found in sessions list"
        
        # Find our test session
        test_session = next(session for session in sessions if session['sessionId'] == test_session_id)
        assert 'lastMessage' in test_session, "Session missing lastMessage"
        # Check for either lastTimestamp or lastActivity (different implementations may use different field names)
        assert 'lastTimestamp' in test_session or 'lastActivity' in test_session, "Session missing timestamp field"
        assert test_session['messageCount'] == 2, f"Expected 2 messages in session, got {test_session['messageCount']}"
        
        logger.info("✅ Session verified in sessions list")
        
        logger.info("🎉 Complete session flow test PASSED!")
        
        return {
            'session_id': test_session_id,
            'user_message_id': user_message_id,
            'ai_message_id': ai_message_id,
            'user_message': user_message,
            'ai_message': ai_message,
            'events': events
        }
    
    def test_message_persistence_after_restart(self, client, test_session_id):
        """
        Test that messages persist after service restart (simulated by new client)
        
        This test verifies that messages saved to the database are truly persistent
        and not just held in memory.
        """
        logger.info(f"🧪 Testing message persistence with session: {test_session_id}")
        
        # First, create some messages
        test_question = "Tell me about Weave's key features"
        
        request_data = {
            "query": test_question,
            "session_id": test_session_id,
            "top_k": 2
        }
        
        response = client.post("/api/chat/stream", json=request_data)
        assert response.status_code == 200
        
        # Wait for completion and get message count
        response = client.get(f"/api/chat/messages/{test_session_id}")
        assert response.status_code == 200
        messages_before = response.json()
        assert len(messages_before) == 2  # user + ai
        
        # Create a new client instance (simulates restart)
        new_client = TestClient(app)
        
        # Verify messages are still there
        response = new_client.get(f"/api/chat/messages/{test_session_id}")
        assert response.status_code == 200
        messages_after = response.json()
        
        assert len(messages_after) == len(messages_before), "Message count changed after 'restart'"
        assert messages_after[0]['id'] == messages_before[0]['id'], "User message ID changed"
        assert messages_after[1]['id'] == messages_before[1]['id'], "AI message ID changed"
        assert messages_after[0]['message'] == messages_before[0]['message'], "User message content changed"
        assert messages_after[1]['message'] == messages_before[1]['message'], "AI message content changed"
        
        logger.info("✅ Messages persisted correctly after simulated restart")


if __name__ == "__main__":
    # Allow running this test file directly
    pytest.main([__file__, "-v", "-s"])
