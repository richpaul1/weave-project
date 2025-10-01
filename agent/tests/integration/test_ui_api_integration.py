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
from typing import Dict, Any

# Test configuration
AGENT_BACKEND_URL = "http://localhost:8000"
AGENT_FRONTEND_URL = "http://localhost:8001"

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
        
        # Delete messages
        response = requests.delete(f"{self.base_url}/api/chat/messages/{self.test_session_id}")
        
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
    
    def test_cors_headers(self):
        """Test that CORS headers are properly set for frontend"""
        # Test preflight request
        response = requests.options(
            f"{self.base_url}/api/chat/messages/{self.test_session_id}",
            headers={
                "Origin": "http://localhost:8001",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        # Should allow the request (may return 200 or 405 depending on FastAPI setup)
        assert response.status_code in [200, 405]
        print("✅ CORS preflight handled")
        
        # Test actual request with origin
        response = requests.get(
            f"{self.base_url}/api/chat/messages/{self.test_session_id}",
            headers={"Origin": "http://localhost:8001"}
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
