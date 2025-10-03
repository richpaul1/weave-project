"""
Unit tests for QueryClassifier.

Tests the query classification logic with various input scenarios.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, Mock, patch

# Add the agent directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services.query_classifier import QueryClassifier


class TestQueryClassifier:
    """Test suite for QueryClassifier."""

    @pytest.fixture
    def mock_llm_service(self):
        """Mock LLM service."""
        return Mock()

    @pytest.fixture
    def query_classifier(self, mock_llm_service):
        """Create QueryClassifier instance with mocked LLM service."""
        return QueryClassifier(mock_llm_service)

    def test_classify_strong_learning_query(self, query_classifier):
        """Test classification of strong learning queries."""
        test_cases = [
            "I want to learn machine learning",
            "How do I learn Python programming?",
            "Teach me about data science",
            "What courses are available for deep learning?",
            "I need training in artificial intelligence"
        ]

        for query in test_cases:
            result = query_classifier.classify_query(query)
            
            assert result["query_type"] == "learning"
            assert result["confidence"] >= 0.8
            assert result["learning_score"] >= 0.7
            assert len(result["keywords_found"]) > 0

    def test_classify_general_query(self, query_classifier):
        """Test classification of general queries."""
        test_cases = [
            "What is the capital of France?",
            "How does photosynthesis work?",
            "What's the weather like today?",
            "Tell me about the history of Rome",
            "How do I cook pasta?"
        ]

        for query in test_cases:
            result = query_classifier.classify_query(query)
            
            assert result["query_type"] == "general"
            assert result["learning_score"] == 0.0
            assert len(result["keywords_found"]) == 0
            assert len(result["strong_phrases_found"]) == 0

    def test_classify_mixed_query(self, query_classifier):
        """Test classification of mixed queries."""
        test_cases = [
            "I want to learn about machine learning and what is Python?",
            "Can you teach me data science and also tell me about statistics?",
            "I need courses on AI but also want to know what neural networks are"
        ]

        for query in test_cases:
            result = query_classifier.classify_query(query)
            
            # Should be classified as learning due to strong learning intent
            assert result["query_type"] == "learning"
            assert result["learning_score"] > 0.5
            assert len(result["keywords_found"]) > 0

    def test_calculate_learning_score_keywords(self, query_classifier):
        """Test learning score calculation based on keywords."""
        # Test with multiple learning keywords
        query = "I want to study machine learning and take courses"
        result = query_classifier.classify_query(query)
        
        # Should have high score due to multiple keywords
        assert result["learning_score"] >= 0.6
        assert "study" in result["keywords_found"]
        assert "learning" in result["keywords_found"] 
        assert "courses" in result["keywords_found"]

    def test_calculate_learning_score_phrases(self, query_classifier):
        """Test learning score calculation based on strong phrases."""
        # Test with strong learning phrases
        query = "I want to learn about programming"
        result = query_classifier.classify_query(query)
        
        # Should have very high score due to strong phrase
        assert result["learning_score"] >= 0.8
        assert "i want to learn" in result["strong_phrases_found"]

    def test_calculate_learning_score_combined(self, query_classifier):
        """Test learning score with both keywords and phrases."""
        query = "How do I learn machine learning through online courses and tutorials?"
        result = query_classifier.classify_query(query)
        
        # Should have maximum score
        assert result["learning_score"] >= 0.9
        assert "how do i learn" in result["strong_phrases_found"]
        assert len(result["keywords_found"]) >= 3

    def test_determine_query_type_thresholds(self, query_classifier):
        """Test query type determination based on score thresholds."""
        # Test borderline cases
        test_cases = [
            ("I want to learn", "learning", 1.0),  # Strong phrase
            ("machine learning tutorial", "learning", 0.8),  # High score
            ("what is machine learning", "general", 0.9),  # No learning intent
            ("programming course", "learning", 0.8),  # Medium score
        ]

        for query, expected_type, expected_min_confidence in test_cases:
            result = query_classifier.classify_query(query)
            assert result["query_type"] == expected_type
            assert result["confidence"] >= expected_min_confidence

    def test_case_insensitive_classification(self, query_classifier):
        """Test that classification is case insensitive."""
        queries = [
            "I WANT TO LEARN MACHINE LEARNING",
            "i want to learn machine learning",
            "I Want To Learn Machine Learning"
        ]

        results = [query_classifier.classify_query(q) for q in queries]
        
        # All should have same classification
        for result in results:
            assert result["query_type"] == "learning"
            assert result["learning_score"] >= 0.8

    def test_empty_query(self, query_classifier):
        """Test classification of empty or whitespace queries."""
        test_cases = ["", "   ", "\n\t"]

        for query in test_cases:
            result = query_classifier.classify_query(query)
            
            assert result["query_type"] == "general"
            assert result["learning_score"] == 0.0
            assert result["confidence"] == 0.9

    def test_very_long_query(self, query_classifier):
        """Test classification of very long queries."""
        # Create a long query with learning intent
        long_query = "I want to learn " + "machine learning " * 50 + "and take courses"
        
        result = query_classifier.classify_query(long_query)
        
        assert result["query_type"] == "learning"
        assert result["learning_score"] >= 0.8

    def test_special_characters_query(self, query_classifier):
        """Test classification with special characters."""
        query = "I want to learn C++ & Python programming! How do I start???"
        
        result = query_classifier.classify_query(query)
        
        assert result["query_type"] == "learning"
        assert "i want to learn" in result["strong_phrases_found"]

    @pytest.mark.asyncio
    async def test_classify_with_llm_success(self, query_classifier):
        """Test LLM-based classification success."""
        # Mock LLM response
        llm_response = {
            "text": "learning",
            "confidence": 0.95
        }
        query_classifier.llm_service.generate_completion = AsyncMock(return_value=llm_response)

        result = await query_classifier.classify_with_llm("I want to learn Python")

        assert result["success"] is True
        assert result["query_type"] == "learning"
        assert result["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_classify_with_llm_invalid_response(self, query_classifier):
        """Test LLM-based classification with invalid response."""
        # Mock invalid LLM response
        llm_response = {
            "text": "invalid_type",
            "confidence": 0.8
        }
        query_classifier.llm_service.generate_completion = AsyncMock(return_value=llm_response)

        result = await query_classifier.classify_with_llm("test query")

        assert result["success"] is False
        assert "Invalid query type" in result["error"]

    @pytest.mark.asyncio
    async def test_classify_with_llm_error(self, query_classifier):
        """Test LLM-based classification with error."""
        # Mock LLM error
        query_classifier.llm_service.generate_completion = AsyncMock(
            side_effect=Exception("LLM service error")
        )

        result = await query_classifier.classify_with_llm("test query")

        assert result["success"] is False
        assert "LLM service error" in result["error"]

    def test_keyword_variations(self, query_classifier):
        """Test that keyword variations are detected."""
        # Test different forms of learning keywords
        test_cases = [
            ("I'm studying machine learning", ["studying"]),
            ("educational content about AI", ["educational"]),
            ("training materials for Python", ["training"]),
            ("tutorial on data science", ["tutorial"]),
            ("workshop about deep learning", ["workshop"])
        ]

        for query, expected_keywords in test_cases:
            result = query_classifier.classify_query(query)
            
            for keyword in expected_keywords:
                assert keyword in result["keywords_found"]
            assert result["query_type"] == "learning"

    def test_phrase_detection_accuracy(self, query_classifier):
        """Test accurate detection of strong learning phrases."""
        test_cases = [
            ("I want to learn Python", ["i want to learn"]),
            ("How do I learn machine learning?", ["how do i learn"]),
            ("Teach me about data science", ["teach me"]),
            ("I need to understand AI", ["i need to understand"]),
            ("Show me how to code", ["show me how"])
        ]

        for query, expected_phrases in test_cases:
            result = query_classifier.classify_query(query)
            
            for phrase in expected_phrases:
                assert phrase in result["strong_phrases_found"]
            assert result["learning_score"] >= 0.8

    def test_reasoning_generation(self, query_classifier):
        """Test that reasoning is properly generated."""
        query = "I want to learn machine learning and take courses"
        result = query_classifier.classify_query(query)
        
        reasoning = result["reasoning"]
        assert "learning intent detected" in reasoning.lower()
        assert "score:" in reasoning.lower()
        assert str(result["learning_score"])[:3] in reasoning
