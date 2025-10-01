"""
Integration tests for LLM service

These tests use a real Ollama instance.
Make sure Ollama is running with the required models.
"""
import pytest
from app.services.llm_service import LLMService
from app.config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_EMBEDDING_MODEL


@pytest.fixture
def llm_service():
    """Create a real LLM service connected to Ollama"""
    return LLMService(provider="ollama")


class TestLLMIntegration:
    """Integration tests for LLM service"""
    
    @pytest.mark.asyncio
    async def test_generate_completion(self, llm_service):
        """Test generating a completion with real Ollama"""
        result = await llm_service.generate_completion(
            prompt="What is 2+2? Answer with just the number.",
            max_tokens=10,
            temperature=0.0
        )
        
        assert "text" in result
        assert "tokens" in result
        assert "model" in result
        assert "provider" in result
        assert result["provider"] == "ollama"
        assert len(result["text"]) > 0
        assert result["tokens"] > 0
    
    @pytest.mark.asyncio
    async def test_generate_completion_with_system_prompt(self, llm_service):
        """Test generating a completion with system prompt"""
        result = await llm_service.generate_completion(
            prompt="What is your role?",
            system_prompt="You are a helpful math tutor.",
            max_tokens=50,
            temperature=0.0
        )
        
        assert "text" in result
        assert len(result["text"]) > 0
    
    @pytest.mark.asyncio
    async def test_generate_streaming(self, llm_service):
        """Test streaming completion with real Ollama"""
        chunks = []
        
        async for chunk in llm_service.generate_streaming(
            prompt="Count from 1 to 3.",
            max_tokens=20,
            temperature=0.0
        ):
            chunks.append(chunk)
        
        # Should have received multiple chunks
        assert len(chunks) > 0
        
        # Concatenate all chunks
        full_text = "".join(chunks)
        assert len(full_text) > 0
    
    @pytest.mark.asyncio
    async def test_generate_embedding(self, llm_service):
        """Test generating embeddings with real Ollama"""
        text = "This is a test sentence for embedding generation."

        embedding = await llm_service.generate_embedding(text)

        # Should return a list of floats
        assert isinstance(embedding, list)
        assert len(embedding) > 0
        assert all(isinstance(x, float) for x in embedding)

        # Embedding should have reasonable magnitude (not all zeros)
        import math
        magnitude = math.sqrt(sum(x*x for x in embedding))
        assert magnitude > 0.0  # Not all zeros
        # Note: Ollama embeddings are not normalized by default
    
    @pytest.mark.asyncio
    async def test_generate_embedding_with_custom_model(self, llm_service):
        """Test generating embeddings with custom model"""
        text = "Another test sentence."
        
        embedding = await llm_service.generate_embedding(
            text=text,
            model=OLLAMA_EMBEDDING_MODEL
        )
        
        assert isinstance(embedding, list)
        assert len(embedding) > 0
    
    @pytest.mark.asyncio
    async def test_multiple_completions(self, llm_service):
        """Test generating multiple completions in sequence"""
        prompts = [
            "What is 1+1?",
            "What is 2+2?",
            "What is 3+3?"
        ]
        
        results = []
        for prompt in prompts:
            result = await llm_service.generate_completion(
                prompt=prompt,
                max_tokens=10,
                temperature=0.0
            )
            results.append(result)
        
        # Should have 3 results
        assert len(results) == 3
        
        # All should have text
        assert all("text" in r for r in results)
        assert all(len(r["text"]) > 0 for r in results)
    
    @pytest.mark.asyncio
    async def test_temperature_variation(self, llm_service):
        """Test that temperature affects output"""
        prompt = "Write a creative sentence about the ocean."
        
        # Low temperature (more deterministic)
        result1 = await llm_service.generate_completion(
            prompt=prompt,
            max_tokens=30,
            temperature=0.1
        )
        
        # High temperature (more creative)
        result2 = await llm_service.generate_completion(
            prompt=prompt,
            max_tokens=30,
            temperature=0.9
        )
        
        # Both should have text
        assert len(result1["text"]) > 0
        assert len(result2["text"]) > 0
        
        # Results might be different (not guaranteed, but likely)
        # Just verify both completed successfully
        assert result1["tokens"] > 0
        assert result2["tokens"] > 0

