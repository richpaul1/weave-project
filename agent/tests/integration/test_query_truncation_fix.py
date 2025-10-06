"""
Integration tests for query truncation fix in Ollama tool calling simulation.

Tests that full queries are preserved when using course search tools.
"""
import pytest
from unittest.mock import Mock
from app.services.llm_service import LLMService


@pytest.mark.integration
class TestQueryTruncationFix:
    """Integration tests for query truncation fix."""

    @pytest.fixture
    def llm_service(self):
        """Create an LLM service configured for Ollama."""
        return LLMService(provider="ollama")

    @pytest.mark.asyncio
    async def test_course_search_preserves_full_query(self, llm_service):
        """Test that course search queries are not truncated."""
        # Test query that was previously truncated
        query = "What courses can help me learn weights & biases (w&b) weave framework?"
        
        messages = [{"role": "user", "content": query}]
        tools = [{"name": "search_courses"}]  # Simplified for test
        
        result = await llm_service._simulate_tool_calling_ollama(
            messages=messages,
            tools=tools,
            system_prompt=None
        )
        
        # Verify tool call was made
        assert "tool_calls" in result
        assert len(result["tool_calls"]) > 0
        
        tool_call = result["tool_calls"][0]
        assert tool_call["function"]["name"] == "search_courses"
        
        # Parse the arguments
        import json
        arguments = json.loads(tool_call["function"]["arguments"])
        
        # Verify the full query is preserved (minus question mark)
        expected_query = "What courses can help me learn weights & biases (w&b) weave framework"
        assert arguments["query"] == expected_query
        
        # Verify it's not truncated
        assert "What courses" in arguments["query"]
        assert "weights & biases" in arguments["query"]
        assert "weave framework" in arguments["query"]

    @pytest.mark.asyncio
    async def test_course_search_with_different_patterns(self, llm_service):
        """Test course search with different query patterns."""
        test_cases = [
            {
                "query": "Find courses about machine learning and data science",
                "expected": "Find courses about machine learning and data science"
            },
            {
                "query": "What training programs are available for Python programming?",
                "expected": "What training programs are available for Python programming"
            },
            {
                "query": "I need tutorials on web development frameworks",
                "expected": "I need tutorials on web development frameworks"
            },
            {
                "query": "Show me certification courses for cloud computing",
                "expected": "Show me certification courses for cloud computing"
            }
        ]
        
        for test_case in test_cases:
            messages = [{"role": "user", "content": test_case["query"]}]
            tools = [{"name": "search_courses"}]
            
            result = await llm_service._simulate_tool_calling_ollama(
                messages=messages,
                tools=tools,
                system_prompt=None
            )
            
            # Verify tool call was made
            assert "tool_calls" in result
            assert len(result["tool_calls"]) > 0
            
            tool_call = result["tool_calls"][0]
            assert tool_call["function"]["name"] == "search_courses"
            
            # Parse the arguments
            import json
            arguments = json.loads(tool_call["function"]["arguments"])
            
            # Verify the full query is preserved
            assert arguments["query"] == test_case["expected"]

    @pytest.mark.asyncio
    async def test_other_tools_still_extract_topics(self, llm_service):
        """Test that other tools still extract topics correctly."""
        # Test learning path recommendation
        query = "How to learn machine learning step by step?"

        messages = [{"role": "user", "content": query}]
        tools = [{"name": "recommend_learning_path"}]

        result = await llm_service._simulate_tool_calling_ollama(
            messages=messages,
            tools=tools,
            system_prompt=None
        )

        # Verify tool call was made
        assert "tool_calls" in result
        assert len(result["tool_calls"]) > 0

        tool_call = result["tool_calls"][0]
        assert tool_call["function"]["name"] == "recommend_learning_path"

        # Parse the arguments
        import json
        arguments = json.loads(tool_call["function"]["arguments"])

        # For learning path, topic should be extracted (just verify it exists)
        assert "topic" in arguments
        assert len(arguments["topic"]) > 0  # Just verify some topic was extracted

    @pytest.mark.asyncio
    async def test_complex_query_with_special_characters(self, llm_service):
        """Test complex queries with special characters are preserved."""
        query = "What courses cover AI/ML, NLP & computer vision (CV) frameworks?"
        
        messages = [{"role": "user", "content": query}]
        tools = [{"name": "search_courses"}]
        
        result = await llm_service._simulate_tool_calling_ollama(
            messages=messages,
            tools=tools,
            system_prompt=None
        )
        
        # Verify tool call was made
        assert "tool_calls" in result
        tool_call = result["tool_calls"][0]
        
        # Parse the arguments
        import json
        arguments = json.loads(tool_call["function"]["arguments"])
        
        # Verify special characters are preserved
        expected_query = "What courses cover AI/ML, NLP & computer vision (CV) frameworks"
        assert arguments["query"] == expected_query
        assert "AI/ML" in arguments["query"]
        assert "NLP &" in arguments["query"]
        assert "(CV)" in arguments["query"]

    @pytest.mark.asyncio
    async def test_query_cleaning_removes_punctuation(self, llm_service):
        """Test that query cleaning removes question marks and periods."""
        test_cases = [
            {
                "input": "What courses are available for Python?",
                "expected": "What courses are available for Python"
            },
            {
                "input": "Find me tutorials on JavaScript.",
                "expected": "Find me tutorials on JavaScript"
            },
            {
                "input": "Show courses for data science?!",
                "expected": "Show courses for data science!"  # Only ? and . are removed
            }
        ]

        for test_case in test_cases:
            messages = [{"role": "user", "content": test_case["input"]}]
            tools = [{"name": "search_courses"}]

            result = await llm_service._simulate_tool_calling_ollama(
                messages=messages,
                tools=tools,
                system_prompt=None
            )

            tool_call = result["tool_calls"][0]
            import json
            arguments = json.loads(tool_call["function"]["arguments"])

            # Verify punctuation is cleaned appropriately
            assert arguments["query"] == test_case["expected"]

    @pytest.mark.asyncio
    async def test_no_truncation_regression(self, llm_service):
        """Regression test to ensure the original truncation issue doesn't return."""
        # This was the original problematic query
        query = "What courses can help me learn weights & biases (w&b) weave framework?"
        
        messages = [{"role": "user", "content": query}]
        tools = [{"name": "search_courses"}]
        
        result = await llm_service._simulate_tool_calling_ollama(
            messages=messages,
            tools=tools,
            system_prompt=None
        )
        
        tool_call = result["tool_calls"][0]
        import json
        arguments = json.loads(tool_call["function"]["arguments"])
        
        # Verify it's NOT the truncated version
        truncated_query = "s can help me learn weights & biases (w&b) weave framework"
        assert arguments["query"] != truncated_query
        
        # Verify it IS the full version (minus question mark)
        full_query = "What courses can help me learn weights & biases (w&b) weave framework"
        assert arguments["query"] == full_query
