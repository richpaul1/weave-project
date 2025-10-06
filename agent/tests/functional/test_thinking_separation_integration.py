import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.enhanced_rag_service import EnhancedRAGService
from app.services.rag_service import RAGService


class TestThinkingSeparationIntegration:
    """Integration tests for thinking process separation in both RAG services."""

    @pytest.fixture
    def mock_dependencies(self):
        """Create mock dependencies for both services."""
        retrieval_service = MagicMock()
        retrieval_service.retrieve_context = AsyncMock(return_value={
            "context_text": "Machine learning is a subset of artificial intelligence.",
            "sources": [{"title": "ML Guide", "url": "https://example.com/ml"}],
            "num_chunks": 1,
            "num_sources": 1
        })

        llm_service = MagicMock()
        
        query_classifier = MagicMock()
        query_classifier.classify_query.return_value = {
            "query_type": "general",
            "confidence": 0.9,
            "learning_score": 0.1,
            "keywords_found": [],
            "reasoning": "General query"
        }

        course_service = MagicMock()

        return {
            "retrieval_service": retrieval_service,
            "llm_service": llm_service,
            "query_classifier": query_classifier,
            "course_service": course_service
        }

    @pytest.fixture
    def rag_service(self, mock_dependencies):
        """Create RAG service with mocked dependencies."""
        return RAGService(
            retrieval_service=mock_dependencies["retrieval_service"],
            llm_service=mock_dependencies["llm_service"]
        )

    @pytest.fixture
    def enhanced_rag_service(self, mock_dependencies):
        """Create Enhanced RAG service with mocked dependencies."""
        service = EnhancedRAGService(
            retrieval_service=mock_dependencies["retrieval_service"],
            llm_service=mock_dependencies["llm_service"],
            course_service=mock_dependencies["course_service"]
        )
        # Replace the internally created query_classifier with our mock
        service.query_classifier = mock_dependencies["query_classifier"]
        return service

    @pytest.mark.asyncio
    async def test_both_services_handle_thinking_consistently(self, rag_service, enhanced_rag_service):
        """Test that both RAG and Enhanced RAG services handle thinking tags consistently."""
        
        # Mock LLM response with thinking
        async def mock_streaming_with_thinking(*args, **kwargs):
            chunks = [
                "Let me consider this question. ",
                "<think>",
                "The user is asking about machine learning. ",
                "I should provide a clear definition and mention key concepts. ",
                "I'll also explain how it relates to AI.",
                "</think>",
                "Machine learning is a subset of artificial intelligence ",
                "that enables computers to learn from data without being explicitly programmed."
            ]
            for chunk in chunks:
                yield chunk

        # Test RAG service
        rag_service.llm_service.generate_streaming = mock_streaming_with_thinking

        rag_results = []
        async for result in rag_service.process_query_streaming(
            query="What is machine learning?",
            session_id="test-session"
        ):
            rag_results.append(result)

        # Test Enhanced RAG service
        enhanced_rag_service.llm_service.generate_streaming = mock_streaming_with_thinking

        enhanced_results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="What is machine learning?",
            session_id="test-session"
        ):
            enhanced_results.append(result)

        # Both services should separate thinking from response
        rag_thinking = [r for r in rag_results if r["type"] == "thinking"]
        enhanced_thinking = [r for r in enhanced_results if r["type"] == "thinking"]

        assert len(rag_thinking) == 1
        assert len(enhanced_thinking) == 1

        # Thinking content should be similar
        rag_thinking_text = rag_thinking[0]["data"]["text"]
        enhanced_thinking_text = enhanced_thinking[0]["data"]["text"]

        assert "The user is asking about machine learning" in rag_thinking_text
        assert "The user is asking about machine learning" in enhanced_thinking_text

        # Final responses should not contain thinking tags
        rag_done = [r for r in rag_results if r["type"] == "done"][0]
        enhanced_done = [r for r in enhanced_results if r["type"] == "done"][0]

        assert "<think>" not in rag_done["data"]["response"]
        assert "</think>" not in rag_done["data"]["response"]
        assert "<think>" not in enhanced_done["data"]["response"]
        assert "</think>" not in enhanced_done["data"]["response"]

    @pytest.mark.asyncio
    async def test_enhanced_service_classification_with_thinking(self, enhanced_rag_service):
        """Test that Enhanced RAG service properly handles classification and thinking together."""
        
        # Mock different query types
        test_cases = [
            {
                "query": "I want to learn machine learning",
                "classification": {
                    "query_type": "learning",
                    "confidence": 0.95,
                    "learning_score": 0.9,
                    "keywords_found": ["learn"],
                    "reasoning": "Learning intent detected"
                }
            },
            {
                "query": "What is machine learning?",
                "classification": {
                    "query_type": "general",
                    "confidence": 0.9,
                    "learning_score": 0.1,
                    "keywords_found": [],
                    "reasoning": "General query"
                }
            },
            {
                "query": "I want to learn about ML and what is it?",
                "classification": {
                    "query_type": "mixed",
                    "confidence": 0.85,
                    "learning_score": 0.7,
                    "keywords_found": ["learn"],
                    "reasoning": "Mixed intent"
                }
            }
        ]

        for test_case in test_cases:
            # Setup classification
            enhanced_rag_service.query_classifier.classify_query.return_value = test_case["classification"]

            # Mock LLM response with thinking
            async def mock_streaming(*args, **kwargs):
                chunks = [
                    "<think>",
                    f"This is a {test_case['classification']['query_type']} query. ",
                    "I should respond appropriately.",
                    "</think>",
                    f"Based on your {test_case['classification']['query_type']} question, ",
                    "here's my response."
                ]
                for chunk in chunks:
                    yield chunk

            enhanced_rag_service.llm_service.generate_streaming = mock_streaming

            # Process query
            results = []
            async for result in enhanced_rag_service.process_query_streaming(
                query=test_case["query"],
                session_id="test-session"
            ):
                results.append(result)

            # Verify classification is sent first
            classification_result = results[0]
            assert classification_result["type"] == "classification"
            assert classification_result["data"]["query_type"] == test_case["classification"]["query_type"]

            # Verify thinking is separated
            thinking_chunks = [r for r in results if r["type"] == "thinking"]
            assert len(thinking_chunks) == 1
            
            thinking_text = thinking_chunks[0]["data"]["text"]
            assert test_case["classification"]["query_type"] in thinking_text

            # Verify final response doesn't contain thinking
            done_result = [r for r in results if r["type"] == "done"][0]
            final_response = done_result["data"]["response"]
            assert "<think>" not in final_response
            assert "</think>" not in final_response
            assert test_case["classification"]["query_type"] in final_response

    @pytest.mark.asyncio
    async def test_streaming_error_handling_with_thinking(self, enhanced_rag_service):
        """Test error handling when thinking tags are malformed."""
        
        # Mock LLM response with malformed thinking tags
        async def mock_streaming_malformed(*args, **kwargs):
            chunks = [
                "Starting response ",
                "<think>",
                "This thinking section is never closed...",
                "More content here."
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_streaming_malformed

        # Process query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="Test malformed thinking",
            session_id="test-session"
        ):
            results.append(result)

        # Should handle gracefully - no thinking chunks should be sent
        # since the thinking section is never closed
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        assert len(thinking_chunks) == 0

        # Response chunks should be minimal (only pre-think content)
        response_chunks = [r for r in results if r["type"] == "response"]
        if response_chunks:
            first_response = response_chunks[0]["data"]["text"]
            assert "Starting response " in first_response

    @pytest.mark.asyncio
    async def test_performance_comparison_with_thinking(self, rag_service, enhanced_rag_service):
        """Test that thinking separation doesn't significantly impact performance."""
        
        # Mock a longer response with thinking
        async def mock_long_streaming(*args, **kwargs):
            chunks = ["Chunk " + str(i) + " " for i in range(50)]
            chunks.insert(25, "<think>")
            chunks.insert(27, "Thinking content here")
            chunks.insert(29, "</think>")
            for chunk in chunks:
                yield chunk

        # Time RAG service
        rag_service.llm_service.generate_streaming = mock_long_streaming

        import time
        start_time = time.time()
        rag_results = []
        async for result in rag_service.process_query_streaming(
            query="Long response test",
            session_id="test-session"
        ):
            rag_results.append(result)
        rag_duration = time.time() - start_time

        # Time Enhanced RAG service
        enhanced_rag_service.llm_service.generate_streaming = mock_long_streaming

        start_time = time.time()
        enhanced_results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="Long response test",
            session_id="test-session"
        ):
            enhanced_results.append(result)
        enhanced_duration = time.time() - start_time

        # Performance should be reasonable (enhanced service may be slower due to classification)
        # Allow up to 5x difference since enhanced service has additional classification step
        performance_ratio = enhanced_duration / rag_duration
        assert 0.2 <= performance_ratio <= 5.0, f"Performance ratio: {performance_ratio}"

        # Both should produce thinking chunks
        rag_thinking = [r for r in rag_results if r["type"] == "thinking"]
        enhanced_thinking = [r for r in enhanced_results if r["type"] == "thinking"]
        
        assert len(rag_thinking) == 1
        assert len(enhanced_thinking) == 1

    @pytest.mark.asyncio
    async def test_real_world_scenario_simulation(self, enhanced_rag_service):
        """Simulate a real-world scenario like the one described in the issue."""
        
        # Mock the exact scenario from the issue
        async def mock_weave_description_response(*args, **kwargs):
            chunks = [
                "<think>",
                "Okay, the user asked to describe \"Weave\" based on the provided context. ",
                "Let me look through the sources.\n\n",
                "First, the context mentions W&B Weave as a framework for tracking, experimenting, ",
                "evaluating, deploying, and improving LLM applications. It's flexible and scalable, ",
                "supporting various stages of development. Then there's the integration part with ",
                "Python, TypeScript, and Service API references. The user also got a TypeScript ",
                "quickstart link.\n\n",
                "So the answer should summarize W&B Weave's purpose, features, and integration options. ",
                "Need to mention it's for LLMs, flexibility, and the API integrations. Also, include ",
                "the key points from each source to make it comprehensive. Make sure to cite all ",
                "sources properly, even though some have relevance 0.83, but they're all part of ",
                "the context. Avoid any markdown and keep it conversational.",
                "</think>",
                "\n\nW&B Weave is a framework designed to track, experiment with, evaluate, deploy, ",
                "and improve LLM-based applications. It supports all stages of development, including ",
                "experimentation, evaluation, and deployment, making it flexible and scalable. Key ",
                "features include integration with Python, TypeScript, and service APIs, as well as ",
                "support for various LLM providers, local models, frameworks, and third-party services. ",
                "It's built to streamline the workflow for LLM applications."
            ]
            for chunk in chunks:
                yield chunk

        enhanced_rag_service.llm_service.generate_streaming = mock_weave_description_response

        # Process the query
        results = []
        async for result in enhanced_rag_service.process_query_streaming(
            query="Describe Weave based on the provided context",
            session_id="test-session"
        ):
            results.append(result)

        # Verify thinking is properly separated
        thinking_chunks = [r for r in results if r["type"] == "thinking"]
        response_chunks = [r for r in results if r["type"] == "response"]

        assert len(thinking_chunks) == 1
        
        # Thinking should contain the analysis
        thinking_text = thinking_chunks[0]["data"]["text"]
        assert "Okay, the user asked to describe" in thinking_text
        assert "Let me look through the sources" in thinking_text
        assert "So the answer should summarize" in thinking_text

        # Response should only contain the final answer
        response_text = "".join([r["data"]["text"] for r in response_chunks])
        assert "W&B Weave is a framework designed to track" in response_text
        assert "It's built to streamline the workflow" in response_text
        
        # Response should NOT contain thinking content
        assert "Okay, the user asked to describe" not in response_text
        assert "Let me look through the sources" not in response_text

        # Final done response should be clean
        done_result = [r for r in results if r["type"] == "done"][0]
        final_response = done_result["data"]["response"]
        assert "<think>" not in final_response
        assert "</think>" not in final_response
        assert "W&B Weave is a framework designed" in final_response
