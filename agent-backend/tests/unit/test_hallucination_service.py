"""
Unit tests for HallucinationService

Mocks LLM service to test hallucination detection.
"""
import pytest
from unittest.mock import Mock, AsyncMock
from app.services.hallucination_service import HallucinationService


class TestHallucinationService:
    """Test cases for HallucinationService"""
    
    def test_init(self, mock_llm_service):
        """Test HallucinationService initialization"""
        hallucination = HallucinationService(llm_service=mock_llm_service)
        assert hallucination.llm_service == mock_llm_service
    
    @pytest.mark.asyncio
    async def test_detect_hallucination_no_facts(self, mock_llm_service):
        """Test hallucination detection when no facts are found"""
        # Mock LLM to return no facts
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "",
            "model": "test",
            "tokens": 0
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        result = await hallucination.detect_hallucination(
            response="This is a response with no facts.",
            context="Some context"
        )
        
        assert result["score"] == 0.0
        assert len(result["supported_claims"]) == 0
        assert len(result["unsupported_claims"]) == 0
        assert "No factual claims" in result["details"]
    
    @pytest.mark.asyncio
    async def test_detect_hallucination_all_supported(self, mock_llm_service):
        """Test hallucination detection when all claims are supported"""
        # Mock fact extraction
        fact_extraction_response = {
            "text": "Fact 1\nFact 2",
            "model": "test",
            "tokens": 10
        }
        
        # Mock fact verification (all supported)
        verification_response = {
            "text": "SUPPORTED",
            "model": "test",
            "tokens": 5
        }
        
        mock_llm_service.generate_completion = AsyncMock(
            side_effect=[fact_extraction_response, verification_response, verification_response]
        )
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        result = await hallucination.detect_hallucination(
            response="Response with facts",
            context="Context supporting facts"
        )
        
        assert result["score"] == 0.0  # No hallucinations
        assert len(result["supported_claims"]) == 2
        assert len(result["unsupported_claims"]) == 0
    
    @pytest.mark.asyncio
    async def test_detect_hallucination_all_unsupported(self, mock_llm_service):
        """Test hallucination detection when all claims are unsupported"""
        # Mock fact extraction
        fact_extraction_response = {
            "text": "Fact 1\nFact 2",
            "model": "test",
            "tokens": 10
        }
        
        # Mock fact verification (all unsupported)
        verification_response = {
            "text": "NOT_SUPPORTED",
            "model": "test",
            "tokens": 5
        }
        
        mock_llm_service.generate_completion = AsyncMock(
            side_effect=[fact_extraction_response, verification_response, verification_response]
        )
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        result = await hallucination.detect_hallucination(
            response="Response with hallucinations",
            context="Context not supporting facts"
        )
        
        assert result["score"] == 1.0  # All hallucinations
        assert len(result["supported_claims"]) == 0
        assert len(result["unsupported_claims"]) == 2
    
    @pytest.mark.asyncio
    async def test_detect_hallucination_mixed(self, mock_llm_service):
        """Test hallucination detection with mixed support"""
        # Mock fact extraction
        fact_extraction_response = {
            "text": "Fact 1\nFact 2\nFact 3",
            "model": "test",
            "tokens": 10
        }
        
        # Mock fact verification (mixed)
        verification_responses = [
            {"text": "SUPPORTED", "model": "test", "tokens": 5},
            {"text": "PARTIALLY_SUPPORTED", "model": "test", "tokens": 5},
            {"text": "NOT_SUPPORTED", "model": "test", "tokens": 5}
        ]
        
        mock_llm_service.generate_completion = AsyncMock(
            side_effect=[fact_extraction_response] + verification_responses
        )
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        result = await hallucination.detect_hallucination(
            response="Response with mixed claims",
            context="Context partially supporting facts"
        )
        
        # Score = (1 unsupported + 0.5 * 1 partially) / 3 = 0.5
        assert result["score"] == 0.5
        assert len(result["supported_claims"]) == 1
        assert len(result["partially_supported_claims"]) == 1
        assert len(result["unsupported_claims"]) == 1
        assert result["total_claims"] == 3
    
    @pytest.mark.asyncio
    async def test_extract_facts(self, mock_llm_service):
        """Test extracting facts from text"""
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "- Fact 1\n- Fact 2\n- Fact 3",
            "model": "test",
            "tokens": 10
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        facts = await hallucination._extract_facts("Some text with facts")
        
        assert len(facts) == 3
        assert "Fact 1" in facts
        assert "Fact 2" in facts
        assert "Fact 3" in facts
    
    @pytest.mark.asyncio
    async def test_extract_facts_with_bullets(self, mock_llm_service):
        """Test extracting facts with different bullet styles"""
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "• Fact 1\n* Fact 2\n- Fact 3",
            "model": "test",
            "tokens": 10
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        facts = await hallucination._extract_facts("Some text")
        
        assert len(facts) == 3
        # Bullets should be stripped
        assert all(not f.startswith(("-", "•", "*")) for f in facts)
    
    @pytest.mark.asyncio
    async def test_extract_facts_error_handling(self, mock_llm_service):
        """Test error handling in fact extraction"""
        mock_llm_service.generate_completion = AsyncMock(
            side_effect=Exception("LLM error")
        )
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        facts = await hallucination._extract_facts("Some text")
        
        # Should return empty list on error
        assert facts == []
    
    @pytest.mark.asyncio
    async def test_verify_fact_supported(self, mock_llm_service):
        """Test verifying a supported fact"""
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "SUPPORTED",
            "model": "test",
            "tokens": 5
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        status = await hallucination._verify_fact(
            claim="Test claim",
            context="Context supporting the claim"
        )
        
        assert status == "SUPPORTED"
    
    @pytest.mark.asyncio
    async def test_verify_fact_partially_supported(self, mock_llm_service):
        """Test verifying a partially supported fact"""
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "PARTIALLY_SUPPORTED",
            "model": "test",
            "tokens": 5
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        status = await hallucination._verify_fact(
            claim="Test claim",
            context="Context partially supporting the claim"
        )
        
        assert status == "PARTIALLY_SUPPORTED"
    
    @pytest.mark.asyncio
    async def test_verify_fact_not_supported(self, mock_llm_service):
        """Test verifying an unsupported fact"""
        mock_llm_service.generate_completion = AsyncMock(return_value={
            "text": "NOT_SUPPORTED",
            "model": "test",
            "tokens": 5
        })
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        status = await hallucination._verify_fact(
            claim="Test claim",
            context="Context not supporting the claim"
        )
        
        assert status == "NOT_SUPPORTED"
    
    @pytest.mark.asyncio
    async def test_verify_fact_error_handling(self, mock_llm_service):
        """Test error handling in fact verification"""
        mock_llm_service.generate_completion = AsyncMock(
            side_effect=Exception("LLM error")
        )
        
        hallucination = HallucinationService(llm_service=mock_llm_service)
        
        status = await hallucination._verify_fact(
            claim="Test claim",
            context="Context"
        )
        
        # Should default to NOT_SUPPORTED on error (conservative)
        assert status == "NOT_SUPPORTED"
    
    def test_calculate_score_all_supported(self):
        """Test score calculation with all supported claims"""
        hallucination = HallucinationService(llm_service=Mock())
        
        results = [
            {"status": "SUPPORTED"},
            {"status": "SUPPORTED"},
            {"status": "SUPPORTED"}
        ]
        
        score = hallucination._calculate_score(results)
        assert score == 0.0
    
    def test_calculate_score_all_unsupported(self):
        """Test score calculation with all unsupported claims"""
        hallucination = HallucinationService(llm_service=Mock())
        
        results = [
            {"status": "NOT_SUPPORTED"},
            {"status": "NOT_SUPPORTED"},
            {"status": "NOT_SUPPORTED"}
        ]
        
        score = hallucination._calculate_score(results)
        assert score == 1.0
    
    def test_calculate_score_mixed(self):
        """Test score calculation with mixed claims"""
        hallucination = HallucinationService(llm_service=Mock())
        
        results = [
            {"status": "SUPPORTED"},
            {"status": "PARTIALLY_SUPPORTED"},
            {"status": "NOT_SUPPORTED"}
        ]
        
        # Score = (1 + 0.5) / 3 = 0.5
        score = hallucination._calculate_score(results)
        assert score == 0.5
    
    def test_calculate_score_empty(self):
        """Test score calculation with no results"""
        hallucination = HallucinationService(llm_service=Mock())
        
        score = hallucination._calculate_score([])
        assert score == 0.0

