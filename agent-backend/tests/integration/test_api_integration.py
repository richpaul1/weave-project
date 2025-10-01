"""
Integration tests for FastAPI endpoints

These tests use a real FastAPI test client with real services.
Make sure Neo4j and Ollama are running.
"""
import pytest
import logging
from fastapi.testclient import TestClient
from app.main import app

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


class TestAPIIntegration:
    """Integration tests for API endpoints"""
    
    def test_root_endpoint(self, client):
        """Test the root endpoint"""
        logger.info("Testing root endpoint...")
        response = client.get("/")
        logger.info(f"Response status: {response.status_code}")
        logger.info(f"Response data: {response.json()}")

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "docs" in data
        assert "health" in data
        assert data["message"] == "Weave Agent Backend API"
        logger.info("✅ Root endpoint test passed")
    
    def test_health_endpoint(self, client):
        """Test the health check endpoint"""
        logger.info("Testing health endpoint...")
        response = client.get("/health")
        logger.info(f"Response status: {response.status_code}")
        logger.info(f"Response data: {response.json()}")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        logger.info("✅ Health endpoint test passed")
    
    def test_chat_health_endpoint(self, client):
        """Test the chat health check endpoint"""
        logger.info("Testing chat health endpoint...")
        response = client.get("/api/chat/health")
        logger.info(f"Response status: {response.status_code}")
        logger.info(f"Response data: {response.json()}")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        logger.info("✅ Chat health endpoint test passed")
    
    def test_chat_message_endpoint(self, client):
        """Test the chat message endpoint with a simple query"""
        request_data = {
            "query": "What is Weave?",
            "session_id": "test-session-1",
            "top_k": 3,
            "stream": False
        }
        
        response = client.post("/api/chat/message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "response" in data
        assert "sources" in data
        assert "metadata" in data
        
        # Response should have text
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0
        
        # Sources should be a list
        assert isinstance(data["sources"], list)
        
        # Metadata should have required fields
        assert "session_id" in data["metadata"]
        assert "num_chunks" in data["metadata"]
        assert "num_sources" in data["metadata"]
        assert "model" in data["metadata"]
        assert "tokens" in data["metadata"]
        assert "provider" in data["metadata"]
        assert data["metadata"]["session_id"] == "test-session-1"
    
    def test_chat_message_without_session_id(self, client):
        """Test chat message endpoint without session ID"""
        request_data = {
            "query": "Tell me about machine learning.",
            "top_k": 3,
            "stream": False
        }
        
        response = client.post("/api/chat/message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should still work without session_id
        assert "response" in data
        assert len(data["response"]) > 0
    
    def test_chat_message_with_custom_top_k(self, client):
        """Test chat message endpoint with custom top_k"""
        request_data = {
            "query": "What is RAG?",
            "top_k": 5,
            "stream": False
        }
        
        response = client.post("/api/chat/message", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have response
        assert "response" in data
        assert len(data["response"]) > 0
        
        # Sources should be limited to top_k
        assert len(data["sources"]) <= 5
    
    def test_chat_message_missing_query(self, client):
        """Test chat message endpoint with missing query"""
        request_data = {
            "top_k": 3,
            "stream": False
        }
        
        response = client.post("/api/chat/message", json=request_data)
        
        # Should return 422 Unprocessable Entity (validation error)
        assert response.status_code == 422
    
    def test_chat_message_empty_query(self, client):
        """Test chat message endpoint with empty query"""
        request_data = {
            "query": "",
            "top_k": 3,
            "stream": False
        }

        response = client.post("/api/chat/message", json=request_data)

        # Empty query is technically valid, just returns a response
        # If we want to reject it, we need to add validation
        assert response.status_code == 200
    
    def test_chat_message_invalid_top_k(self, client):
        """Test chat message endpoint with invalid top_k"""
        request_data = {
            "query": "Test query",
            "top_k": 0,  # Invalid: must be >= 1
            "stream": False
        }
        
        response = client.post("/api/chat/message", json=request_data)
        
        # Should return 422 Unprocessable Entity (validation error)
        assert response.status_code == 422
    
    def test_chat_stream_endpoint(self, client):
        """Test the chat streaming endpoint"""
        request_data = {
            "query": "What is Weave?",
            "session_id": "test-session-stream",
            "top_k": 3,
            "stream": True
        }
        
        response = client.post("/api/chat/stream", json=request_data)
        
        # Should return 200 for streaming
        assert response.status_code == 200
        
        # Content type should be text/event-stream
        assert "text/event-stream" in response.headers.get("content-type", "")
        
        # Should have received some data
        assert len(response.content) > 0
    
    def test_multiple_chat_messages(self, client):
        """Test multiple chat messages in sequence"""
        session_id = "test-session-multi"
        
        queries = [
            "What is Weave?",
            "How does it work?",
            "What are its features?"
        ]
        
        for query in queries:
            request_data = {
                "query": query,
                "session_id": session_id,
                "top_k": 3,
                "stream": False
            }
            
            response = client.post("/api/chat/message", json=request_data)
            
            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert len(data["response"]) > 0
            assert data["metadata"]["session_id"] == session_id
    
    def test_chat_with_hallucination_detection(self, client):
        """Test that hallucination detection is included in response"""
        request_data = {
            "query": "What is Weave?",
            "top_k": 3,
            "stream": False
        }

        response = client.post("/api/chat/message", json=request_data)

        assert response.status_code == 200
        data = response.json()

        # Should have hallucination score and details
        assert "hallucination_score" in data
        assert "hallucination_details" in data

        # Score should be between 0 and 1
        assert 0.0 <= data["hallucination_score"] <= 1.0

        # Details should have required fields (not 'score' since that's at top level)
        details = data["hallucination_details"]
        assert "supported_claims" in details
        assert "unsupported_claims" in details
        assert "total_claims" in details

