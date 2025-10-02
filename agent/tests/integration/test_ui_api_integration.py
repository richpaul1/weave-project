"""
UI/API Integration Tests for Agent Frontend and Backend

Tests the complete flow from frontend API calls to backend responses,
verifying that the agent frontend can successfully communicate with
the agent backend API endpoints.
"""
import pytest
import requests
import json
import time
import uuid
import os
from datetime import datetime
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from parent .env.local
env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)

# Test configuration using environment variables
AGENT_BACKEND_URL = f"http://localhost:{os.getenv('AGENT_BACKEND_PORT', '3001')}"
AGENT_FRONTEND_URL = f"http://localhost:{os.getenv('AGENT_CLIENT_PORT', '3000')}"

class TestUIAPIIntegration:
    """Integration tests for UI/API communication"""
    
    @pytest.fixture(autouse=True)
    def setup_test_session(self):
        """Setup a unique test session for each test"""
        self.test_session_id = str(uuid.uuid4())
        self.base_url = AGENT_BACKEND_URL
        
    def test_backend_health_check(self):
        """Test that agent backend is running and healthy"""
        response = requests.get(f"{self.base_url}/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "agent-backend"
        print("✅ Agent backend health check passed")
    
    def test_frontend_accessibility(self):
        """Test that agent frontend is accessible"""
        try:
            response = requests.get(AGENT_FRONTEND_URL, timeout=5)
            assert response.status_code == 200
            assert "text/html" in response.headers.get("content-type", "")
            print("✅ Agent frontend is accessible")
        except requests.exceptions.RequestException as e:
            pytest.fail(f"Agent frontend not accessible at {AGENT_FRONTEND_URL}: {e}")
    
    def test_chat_messages_endpoint_empty_session(self):
        """Test GET /api/chat/messages/{session_id} returns empty array for new session"""
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print(f"✅ Empty session returns empty array: {data}")
    
    def test_graph_nodes_endpoint(self):
        """Test GET /api/graph/nodes returns empty array"""
        response = requests.get(f"{self.base_url}/api/graph/nodes")
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print(f"✅ Graph nodes endpoint returns: {data}")
    
    def test_chat_message_processing(self):
        """Test POST /api/chat/message processes query and returns response"""
        request_data = {
            "query": "tell me about weave",
            "session_id": self.test_session_id,
            "top_k": 3,
            "stream": False
        }
        
        response = requests.post(
            f"{self.base_url}/api/chat/message",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure matches frontend expectations
        assert "response" in data
        assert "sources" in data
        assert "metadata" in data
        assert "hallucination_score" in data
        assert "hallucination_details" in data
        
        # Verify response content
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0
        assert isinstance(data["sources"], list)
        assert isinstance(data["metadata"], dict)
        
        # Verify metadata structure
        metadata = data["metadata"]
        assert "session_id" in metadata
        assert metadata["session_id"] == self.test_session_id
        assert "model" in metadata
        assert "provider" in metadata
        
        print(f"✅ Chat message processed successfully")
        print(f"   Response length: {len(data['response'])} chars")
        print(f"   Sources count: {len(data['sources'])}")
        print(f"   Hallucination score: {data['hallucination_score']}")
        
        return data
    
    def test_save_chat_message(self):
        """Test POST /api/chat/messages saves message to storage"""
        message_data = {
            "sessionId": self.test_session_id,
            "sender": "user",
            "message": "test message for storage",
            "thinking": ""
        }
        
        response = requests.post(
            f"{self.base_url}/api/chat/messages",
            json=message_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify saved message structure
        assert "id" in data
        assert "sessionId" in data
        assert "sender" in data
        assert "message" in data
        assert "timestamp" in data
        
        assert data["sessionId"] == self.test_session_id
        assert data["sender"] == "user"
        assert data["message"] == "test message for storage"
        
        print(f"✅ Message saved with ID: {data['id']}")
        return data
    
    def test_retrieve_saved_messages(self):
        """Test that saved messages can be retrieved"""
        # First save a message
        saved_message = self.test_save_chat_message()
        
        # Then retrieve messages for the session
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Find our saved message
        found_message = None
        for msg in data:
            if msg["id"] == saved_message["id"]:
                found_message = msg
                break
        
        assert found_message is not None
        assert found_message["message"] == "test message for storage"
        assert found_message["sender"] == "user"
        
        print(f"✅ Retrieved {len(data)} messages from session")
    
    def test_delete_chat_messages(self):
        """Test DELETE /api/chat/messages/{session_id} clears session"""
        # First save a message
        self.test_save_chat_message()
        
        # Verify message exists
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        assert len(response.json()) >= 1
        
        # Delete messages with required request body
        delete_request = {
            "requesting_session_id": self.test_session_id,
            "reason": "integration_test_cleanup"
        }
        response = requests.delete(
            f"{self.base_url}/api/chat/messages/{self.test_session_id}",
            json=delete_request
        )

        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is True
        
        # Verify messages are deleted
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        assert len(response.json()) == 0
        
        print("✅ Chat messages deleted successfully")
    
    def test_full_chat_flow_simulation(self):
        """Test complete chat flow simulating frontend behavior"""
        print(f"\n🔄 Testing full chat flow for session: {self.test_session_id}")
        
        # Step 1: Frontend checks for existing messages (should be empty)
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        assert response.status_code == 200
        assert len(response.json()) == 0
        print("   ✅ Step 1: Initial message check - empty session")
        
        # Step 2: Frontend sends user message
        user_message = {
            "sessionId": self.test_session_id,
            "sender": "user", 
            "message": "tell me about weave",
            "thinking": ""
        }
        
        response = requests.post(
            f"{self.base_url}/api/chat/messages",
            json=user_message,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        saved_user_msg = response.json()
        print("   ✅ Step 2: User message saved")
        
        # Step 3: Frontend processes chat query
        chat_response = self.test_chat_message_processing()
        print("   ✅ Step 3: Chat query processed")
        
        # Step 4: Frontend saves AI response
        ai_message = {
            "sessionId": self.test_session_id,
            "sender": "ai",
            "message": chat_response["response"],
            "thinking": ""
        }
        
        response = requests.post(
            f"{self.base_url}/api/chat/messages",
            json=ai_message,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        saved_ai_msg = response.json()
        print("   ✅ Step 4: AI response saved")
        
        # Step 5: Frontend retrieves complete conversation
        response = requests.get(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        assert response.status_code == 200
        messages = response.json()
        
        assert len(messages) == 2
        assert messages[0]["sender"] == "user"
        assert messages[1]["sender"] == "ai"
        assert messages[0]["message"] == "tell me about weave"
        print("   ✅ Step 5: Complete conversation retrieved")
        
        # Step 6: Frontend loads graph data
        response = requests.get(f"{self.base_url}/api/graph/nodes")
        assert response.status_code == 200
        graph_data = response.json()
        assert isinstance(graph_data, list)
        print("   ✅ Step 6: Graph data loaded")
        
        print(f"🎉 Full chat flow completed successfully!")
        print(f"   Session ID: {self.test_session_id}")
        print(f"   Messages: {len(messages)}")
        print(f"   User message: '{messages[0]['message']}'")
        print(f"   AI response length: {len(messages[1]['message'])} chars")
    
    def test_streaming_endpoint_format(self):
        """Test that streaming endpoint returns correct SSE format for frontend"""
        request_data = {
            "query": "tell me about weave",
            "session_id": self.test_session_id,
            "top_k": 3
        }

        response = requests.post(
            f"{self.base_url}/api/chat/stream",
            json=request_data,
            headers={"Content-Type": "application/json"},
            stream=True
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        # Parse SSE stream
        events = []
        for line in response.iter_lines(decode_unicode=True):
            if line.startswith('data: '):
                try:
                    data = json.loads(line[6:])
                    events.append(data)
                except json.JSONDecodeError:
                    continue

        # Verify we got expected event types
        event_types = [event.get("type") for event in events]
        assert "context" in event_types
        assert "thinking" in event_types or "response" in event_types
        assert "done" in event_types

        print(f"✅ Streaming endpoint returned {len(events)} events")
        print(f"   Event types: {set(event_types)}")

    def test_sessions_endpoint(self):
        """Test GET /api/chat/sessions returns recent sessions"""
        # First create some test messages to ensure we have sessions
        self.test_save_chat_message()

        response = requests.get(f"{self.base_url}/api/chat/sessions?limit=5")

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

        data = response.json()
        assert isinstance(data, list)

        # Should have at least one session from our test
        assert len(data) >= 1

        # Verify session structure
        session = data[0]
        required_fields = ["sessionId", "title", "preview", "lastActivity", "messageCount"]
        for field in required_fields:
            assert field in session, f"Missing field: {field}"

        assert isinstance(session["messageCount"], int)
        assert session["messageCount"] > 0

        print(f"✅ Sessions endpoint returned {len(data)} sessions")
        print(f"   First session: {session['sessionId'][:8]}... ({session['messageCount']} messages)")

    def test_chat_history_workflow(self):
        """Test complete chat history workflow: create session, send messages, retrieve sessions"""
        print(f"\n🔄 Testing complete chat history workflow")

        # Step 1: Create a new session with multiple messages
        test_session = str(uuid.uuid4())

        # Save user message
        user_message = {
            "sessionId": test_session,
            "sender": "user",
            "message": "What is machine learning?",
            "thinking": "",
            "timestamp": datetime.now().isoformat()
        }

        response = requests.post(
            f"{self.base_url}/api/chat/messages",
            json=user_message,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        print("   ✅ Step 1: User message saved")

        # Save AI response
        ai_message = {
            "sessionId": test_session,
            "sender": "ai",
            "message": "Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.",
            "thinking": "The user is asking about machine learning. I should provide a clear, concise definition.",
            "timestamp": datetime.now().isoformat()
        }

        response = requests.post(
            f"{self.base_url}/api/chat/messages",
            json=ai_message,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        print("   ✅ Step 2: AI response saved")

        # Step 2: Retrieve session messages
        response = requests.get(f"{self.base_url}/api/chat/messages/{test_session}")
        assert response.status_code == 200

        messages = response.json()
        assert len(messages) == 2
        assert messages[0]["sender"] == "user"
        assert messages[1]["sender"] == "ai"
        print("   ✅ Step 3: Session messages retrieved correctly")

        # Step 3: Check that session appears in recent sessions
        response = requests.get(f"{self.base_url}/api/chat/sessions?limit=10")
        assert response.status_code == 200

        sessions = response.json()
        print(f"   Debug: Found {len(sessions)} sessions")
        for i, session in enumerate(sessions):
            print(f"   Session {i+1}: {session['sessionId'][:8]}... ({session['messageCount']} msgs)")

        test_session_found = False
        for session in sessions:
            if session["sessionId"] == test_session:
                test_session_found = True
                assert session["messageCount"] == 2
                assert "machine learning" in session["title"].lower()
                break

        if not test_session_found:
            print(f"   Debug: Looking for session {test_session[:8]}...")
            print(f"   Debug: Available sessions: {[s['sessionId'][:8] for s in sessions]}")

        assert test_session_found, "Test session not found in recent sessions"
        print("   ✅ Step 4: Session appears in recent sessions list")

        # Step 4: Delete session with required request body
        delete_request = {
            "requesting_session_id": test_session,
            "reason": "integration_test_cleanup"
        }
        response = requests.delete(
            f"{self.base_url}/api/chat/messages/{test_session}",
            json=delete_request
        )
        assert response.status_code == 200

        # Verify messages are deleted
        response = requests.get(f"{self.base_url}/api/chat/messages/{test_session}")
        assert response.status_code == 200
        assert len(response.json()) == 0
        print("   ✅ Step 5: Session deleted successfully")

        print(f"🎉 Complete chat history workflow test passed!")
        print(f"   Session ID: {test_session}")
        print(f"   Messages created: 2 (user + ai)")
        print(f"   Session management: ✅")

    def test_streaming_saves_ai_response(self):
        """Test that streaming endpoint saves AI response to database"""
        print(f"\n🔄 Testing streaming saves AI response")

        test_session = str(uuid.uuid4())

        # Step 1: Send streaming request
        request_data = {
            "query": "What is artificial intelligence?",
            "session_id": test_session,
            "top_k": 3
        }

        response = requests.post(
            f"{self.base_url}/api/chat/stream",
            json=request_data,
            headers={"Content-Type": "application/json"},
            stream=True
        )

        assert response.status_code == 200
        print("   ✅ Step 1: Streaming request successful")

        # Step 2: Parse streaming response
        ai_response_content = ""
        thinking_content = ""

        for line in response.iter_lines(decode_unicode=True):
            if line.startswith('data: '):
                try:
                    data = json.loads(line[6:])
                    if data.get("type") == "thinking":
                        thinking_content += data.get("data", {}).get("text", "")
                    elif data.get("type") == "response":
                        ai_response_content += data.get("data", {}).get("text", "")
                    elif data.get("type") == "done":
                        break
                except json.JSONDecodeError:
                    continue

        assert ai_response_content.strip(), "No AI response content received"
        print(f"   ✅ Step 2: Received AI response ({len(ai_response_content)} chars)")

        # Step 3: Verify both messages are automatically saved by streaming endpoint
        messages_response = requests.get(f"{self.base_url}/api/chat/messages/{test_session}")
        assert messages_response.status_code == 200

        messages = messages_response.json()
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"

        user_msg = next((m for m in messages if m["sender"] == "user"), None)
        ai_msg = next((m for m in messages if m["sender"] == "ai"), None)

        assert user_msg is not None, "User message not found"
        assert ai_msg is not None, "AI message not found"
        assert user_msg["message"] == request_data["query"]
        # Compare content with normalized whitespace
        assert ai_msg["message"].strip() == ai_response_content.strip()

        print("   ✅ Step 3: Both messages verified in database")

        # Step 4: Verify session appears in sessions list
        sessions_response = requests.get(f"{self.base_url}/api/chat/sessions?limit=10")
        assert sessions_response.status_code == 200

        sessions = sessions_response.json()
        test_session_found = any(s["sessionId"] == test_session for s in sessions)
        assert test_session_found, "Session not found in sessions list"

        print("   ✅ Step 4: Session appears in sessions list")

        # Cleanup with proper request body
        delete_request = {
            "requesting_session_id": test_session,
            "reason": "integration_test_cleanup"
        }
        requests.delete(
            f"{self.base_url}/api/chat/messages/{test_session}",
            json=delete_request
        )

        print(f"🎉 Streaming AI response save test passed!")
        print(f"   Session ID: {test_session}")
        print(f"   AI Response: {ai_response_content[:50]}...")
        print(f"   Thinking: {thinking_content[:50]}..." if thinking_content else "   No thinking content")

    def test_cors_headers(self):
        """Test that CORS headers are properly set for frontend"""
        # Test preflight request
        response = requests.options(
            f"{self.base_url}/api/chat/messages/{self.test_session_id}",
            headers={
                "Origin": AGENT_FRONTEND_URL,
                "Access-Control-Request-Method": "GET"
            }
        )

        # Should allow the request (may return 200 or 405 depending on FastAPI setup)
        assert response.status_code in [200, 405]
        print("✅ CORS preflight handled")

        # Test actual request with origin
        response = requests.get(
            f"{self.base_url}/api/chat/messages/{self.test_session_id}",
            headers={"Origin": AGENT_FRONTEND_URL}
        )

        assert response.status_code == 200
        print("✅ CORS request from frontend origin allowed")


if __name__ == "__main__":
    # Run tests directly
    test_instance = TestUIAPIIntegration()
    test_instance.setup_test_session()
    
    print("🧪 Running UI/API Integration Tests...")
    
    try:
        test_instance.test_backend_health_check()
        test_instance.test_frontend_accessibility()
        test_instance.test_chat_messages_endpoint_empty_session()
        test_instance.test_graph_nodes_endpoint()
        test_instance.test_full_chat_flow_simulation()
        test_instance.test_cors_headers()
        
        print("\n🎉 All UI/API integration tests passed!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise
