import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.enhanced_rag_service import EnhancedRAGService


class TestEnhancedRAGThinkingSeparation:
    """Test thinking process separation in Enhanced RAG Service streaming."""

    @pytest.fixture
    def mock_retrieval_service(self):
        """Mock retrieval service."""
        mock = MagicMock()
        mock.retrieve_context = AsyncMock(return_value={
            "context_text": "Test context about machine learning",
            "sources": [{"title": "ML Guide", "url": "https://example.com/ml"}],
            "num_chunks": 1,
            "num_sources": 1
        })
        return mock

    @pytest.fixture
    def mock_llm_service(self):
        """Mock LLM service."""
        return MagicMock()

    @pytest.fixture
    def mock_query_classifier(self):
        """Mock query classifier."""
        mock = MagicMock()
        mock.classify_query.return_value = {
            "query_type": "general",
            "confidence": 0.9,
            "learning_score": 0.1,
            "keywords_found": [],
            "reasoning": "General query"
        }
        return mock

    @pytest.fixture
    def mock_course_service(self):
        """Mock course service."""
        return MagicMock()

    @pytest.fixture
    def enhanced_rag_service(self, mock_retrieval_service, mock_llm_service,
                           mock_query_classifier, mock_course_service):
        """Create EnhancedRAGService with mocked dependencies."""
        service = EnhancedRAGService(
            retrieval_service=mock_retrieval_service,
            llm_service=mock_llm_service,
            course_service=mock_course_service
        )
        # Replace the internally created query_classifier with our mock
        service.query_classifier = mock_query_classifier
        return service

    @pytest.mark.asyncio
    async def test_streaming_without_thinking_tags(self, enhanced_rag_service):
        """Test streaming response without thinking tags."""
        # Mock LLM streaming response without thinking
        async def mock_streaming(*args, **kwargs):
            chunks = ["Machine", " learning", " is", " a", " subset", " of", " AI."]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="What is machine learning?",
            session_id="test-session"
        ):
            results.append(result)

        # Verify results
        classification_result = results[0]
        assert classification_result["type"] == "classification"
        assert classification_result["data"]["query_type"] == "general"

        context_result = results[1]
        assert context_result["type"] == "context"

        # All response chunks should be type "response"
        response_chunks = [r for r in results if r["type"] == "response"]
        assert len(response_chunks) == 7  # All chunks should be sent as response

        # Verify no thinking chunks
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        assert len(thinking_chunks) == 0

        # Verify done message
        done_result = results[-1]
        assert done_result["type"] == "done"
        assert "response" in done_result["data"]

    @pytest.mark.asyncio
    async def test_streaming_with_thinking_tags(self, enhanced_rag_service):
        """Test streaming response with thinking tags."""
        # Mock LLM streaming response with thinking
        async def mock_streaming(*args, **kwargs):
            chunks = [
                "Let me think about this. ",
                "<think>",
                "The user is asking about machine learning. ",
                "I should explain it clearly and mention it's a subset of AI. ",
                "I'll also mention some key concepts.",
                "</think>",
                "Machine learning is a subset of artificial intelligence ",
                "that enables computers to learn and improve from experience."
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="What is machine learning?",
            session_id="test-session"
        ):
            results.append(result)

        # Verify results
        classification_result = results[0]
        assert classification_result["type"] == "classification"

        context_result = results[1]
        assert context_result["type"] == "context"

        # Find thinking and response chunks
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        response_chunks = [r for r in results if r["type"] == "response"]

        # Should have exactly one thinking chunk
        assert len(thinking_chunks) == 1
        thinking_content = thinking_chunks[0]["data"]["text"]
        assert "The user is asking about machine learning" in thinking_content
        assert "I should explain it clearly" in thinking_content

        # Should have response chunks before and after thinking
        assert len(response_chunks) >= 2

        # First response should be before thinking
        first_response = response_chunks[0]["data"]["text"]
        assert "Let me think about this. " in first_response

        # Last responses should be after thinking
        final_responses = "".join([r["data"]["text"] for r in response_chunks[1:]])
        # The post-think content should contain the AI-related content
        assert "artificial intelligence" in final_responses
        assert "computers to learn" in final_responses

        # Verify done message doesn't contain thinking tags
        done_result = results[-1]
        assert done_result["type"] == "done"
        final_response = done_result["data"]["response"]
        assert "<think>" not in final_response
        assert "</think>" not in final_response

    @pytest.mark.asyncio
    async def test_streaming_with_multiple_thinking_sections(self, enhanced_rag_service):
        """Test streaming response with multiple thinking sections (should handle first one)."""
        # Mock LLM streaming response with multiple thinking sections
        async def mock_streaming(*args, **kwargs):
            chunks = [
                "<think>First thought</think>",
                "Initial response. ",
                "<think>Second thought</think>",
                "Final response."
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="Test query",
            session_id="test-session"
        ):
            results.append(result)

        # Find thinking chunks
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        
        # Should handle the first thinking section
        assert len(thinking_chunks) >= 1
        assert "First thought" in thinking_chunks[0]["data"]["text"]

        # Response should not contain thinking tags
        response_chunks = [r for r in results if r["type"] == "response"]
        all_response_text = "".join([r["data"]["text"] for r in response_chunks])
        
        # The second thinking section might still be in the response
        # but the first one should be properly separated
        assert "First thought" not in all_response_text

    @pytest.mark.asyncio
    async def test_streaming_thinking_at_beginning(self, enhanced_rag_service):
        """Test streaming response that starts with thinking."""
        # Mock LLM streaming response starting with thinking
        async def mock_streaming(*args, **kwargs):
            chunks = [
                "<think>",
                "Let me analyze this question carefully. ",
                "The user wants to know about AI.",
                "</think>",
                "Artificial intelligence is the simulation of human intelligence."
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="What is AI?",
            session_id="test-session"
        ):
            results.append(result)

        # Find thinking and response chunks
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        response_chunks = [r for r in results if r["type"] == "response"]

        # Should have thinking content
        assert len(thinking_chunks) == 1
        thinking_content = thinking_chunks[0]["data"]["text"]
        assert "Let me analyze this question" in thinking_content

        # Should have response after thinking
        assert len(response_chunks) >= 1
        response_text = "".join([r["data"]["text"] for r in response_chunks])
        assert "Artificial intelligence is the simulation" in response_text

        # Response should not contain thinking tags
        assert "<think>" not in response_text
        assert "</think>" not in response_text

    @pytest.mark.asyncio
    async def test_streaming_thinking_at_end(self, enhanced_rag_service):
        """Test streaming response that ends with thinking."""
        # Mock LLM streaming response ending with thinking
        async def mock_streaming(*args, **kwargs):
            chunks = [
                "Machine learning is a powerful technology. ",
                "<think>",
                "I should mention some applications too.",
                "</think>"
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="Tell me about ML",
            session_id="test-session"
        ):
            results.append(result)

        # Find thinking and response chunks
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        response_chunks = [r for r in results if r["type"] == "response"]

        # Should have thinking content
        assert len(thinking_chunks) == 1
        thinking_content = thinking_chunks[0]["data"]["text"]
        assert "I should mention some applications" in thinking_content

        # Should have response before thinking
        assert len(response_chunks) >= 1
        response_text = "".join([r["data"]["text"] for r in response_chunks])
        assert "Machine learning is a powerful technology" in response_text

        # Final response should not contain thinking tags
        done_result = [r for r in results if r["type"] == "done"][0]
        final_response = done_result["data"]["response"]
        assert "<think>" not in final_response
        assert "</think>" not in final_response

    @pytest.mark.asyncio
    async def test_post_process_response_removes_thinking_tags(self, enhanced_rag_service):
        """Test that _post_process_response removes thinking tags."""
        # Test with thinking tags
        response_with_thinking = "Hello <think>I should be helpful</think> How can I help you?"
        cleaned = enhanced_rag_service._post_process_response(response_with_thinking)
        assert cleaned == "Hello  How can I help you?"
        assert "<think>" not in cleaned
        assert "</think>" not in cleaned

        # Test without thinking tags
        response_without_thinking = "Hello! How can I help you?"
        cleaned = enhanced_rag_service._post_process_response(response_without_thinking)
        assert cleaned == "Hello! How can I help you?"

        # Test with Answer: prefix
        response_with_prefix = "Answer: Machine learning is a subset of AI."
        cleaned = enhanced_rag_service._post_process_response(response_with_prefix)
        assert cleaned == "Machine learning is a subset of AI."

    def test_post_process_response_edge_cases(self, enhanced_rag_service):
        """Test _post_process_response with edge cases."""
        # Empty response
        assert enhanced_rag_service._post_process_response("") == ""
        
        # Only whitespace
        assert enhanced_rag_service._post_process_response("   \n  ") == ""
        
        # Only thinking tags
        response = "<think>Just thinking</think>"
        cleaned = enhanced_rag_service._post_process_response(response)
        assert cleaned == ""
        
        # Malformed thinking tags
        response = "<think>Incomplete thinking"
        cleaned = enhanced_rag_service._post_process_response(response)
        assert cleaned == "<think>Incomplete thinking"
        
        # Multiple thinking sections
        response = "Start <think>first</think> middle <think>second</think> end"
        cleaned = enhanced_rag_service._post_process_response(response)
        # Should only remove the first thinking section
        assert "first" not in cleaned
        assert "Start" in cleaned
        assert "middle" in cleaned
