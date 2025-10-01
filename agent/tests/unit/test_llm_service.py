"""
Unit tests for LLMService

Mocks HTTP clients to test LLM operations.
"""
import pytest
from unittest.mock import Mock, patch, AsyncMock
from app.services.llm_service import LLMService


class TestLLMService:
    """Test cases for LLMService"""
    
    def test_init_ollama(self):
        """Test LLMService initialization with Ollama"""
        llm = LLMService(provider="ollama")
        assert llm.provider == "ollama"
        assert llm.ollama_model is not None
    
    @patch('app.config.OPENAI_API_KEY', 'test-key')
    @patch('openai.AsyncOpenAI')
    def test_init_openai(self, mock_openai):
        """Test LLMService initialization with OpenAI"""
        llm = LLMService(provider="openai")
        assert llm.provider == "openai"

    def test_init_openai_no_key(self):
        """Test LLMService initialization with OpenAI but no API key"""
        # Temporarily set OPENAI_API_KEY to None in the config module
        import app.config as config
        original_key = config.OPENAI_API_KEY
        try:
            config.OPENAI_API_KEY = None
            # Also need to patch it in llm_service since it imports from config
            with patch('app.services.llm_service.OPENAI_API_KEY', None):
                with pytest.raises(ValueError, match="OPENAI_API_KEY not set"):
                    LLMService(provider="openai")
        finally:
            config.OPENAI_API_KEY = original_key
    
    @pytest.mark.asyncio
    async def test_generate_completion_ollama(self):
        """Test generating completion with Ollama"""
        llm = LLMService(provider="ollama")
        
        # Mock httpx client
        mock_response = Mock()
        mock_response.json.return_value = {
            "message": {"content": "Test response"},
            "eval_count": 10
        }
        mock_response.raise_for_status = Mock()
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock()
            mock_client.return_value.__aexit__ = AsyncMock()
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            result = await llm.generate_completion(
                prompt="Test prompt",
                system_prompt="Test system"
            )
            
            assert result["text"] == "Test response"
            assert result["model"] == llm.ollama_model
            assert result["tokens"] == 10
            assert result["provider"] == "ollama"
    
    @pytest.mark.asyncio
    @patch('app.config.OPENAI_API_KEY', 'test-key')
    @patch('openai.AsyncOpenAI')
    async def test_generate_completion_openai(self, mock_openai):
        """Test generating completion with OpenAI"""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.usage.completion_tokens = 10

        mock_client = Mock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai.return_value = mock_client

        llm = LLMService(provider="openai")
        result = await llm.generate_completion(
            prompt="Test prompt",
            system_prompt="Test system"
        )

        assert result["text"] == "Test response"
        assert result["tokens"] == 10
        assert result["provider"] == "openai"
    
    @pytest.mark.asyncio
    async def test_generate_streaming_ollama(self):
        """Test generating streaming completion with Ollama"""
        llm = LLMService(provider="ollama")
        
        # Mock streaming response
        async def mock_aiter_lines():
            import json
            lines = [
                json.dumps({"message": {"content": "Test "}}),
                json.dumps({"message": {"content": "response"}})
            ]
            for line in lines:
                yield line
        
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.aiter_lines = mock_aiter_lines
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock()
            mock_client.return_value.__aexit__ = AsyncMock()
            mock_stream = Mock()
            mock_stream.__aenter__ = AsyncMock(return_value=mock_response)
            mock_stream.__aexit__ = AsyncMock()
            mock_client.return_value.__aenter__.return_value.stream = Mock(
                return_value=mock_stream
            )
            
            chunks = []
            async for chunk in llm.generate_streaming(prompt="Test prompt"):
                chunks.append(chunk)
            
            assert len(chunks) == 2
            assert chunks[0] == "Test "
            assert chunks[1] == "response"
    
    @pytest.mark.asyncio
    @patch('app.config.OPENAI_API_KEY', 'test-key')
    @patch('openai.AsyncOpenAI')
    async def test_generate_streaming_openai(self, mock_openai):
        """Test generating streaming completion with OpenAI"""
        # Mock streaming response
        async def mock_stream():
            mock_chunk1 = Mock()
            mock_chunk1.choices = [Mock()]
            mock_chunk1.choices[0].delta.content = "Test "

            mock_chunk2 = Mock()
            mock_chunk2.choices = [Mock()]
            mock_chunk2.choices[0].delta.content = "response"

            for chunk in [mock_chunk1, mock_chunk2]:
                yield chunk

        mock_client = Mock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_stream())
        mock_openai.return_value = mock_client

        llm = LLMService(provider="openai")

        chunks = []
        async for chunk in llm.generate_streaming(prompt="Test prompt"):
            chunks.append(chunk)

        assert len(chunks) == 2
        assert chunks[0] == "Test "
        assert chunks[1] == "response"
    
    @pytest.mark.asyncio
    async def test_generate_embedding_ollama(self, sample_embedding):
        """Test generating embedding with Ollama"""
        llm = LLMService(provider="ollama")
        
        # Mock httpx client
        mock_response = Mock()
        mock_response.json.return_value = {"embedding": sample_embedding}
        mock_response.raise_for_status = Mock()
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock()
            mock_client.return_value.__aexit__ = AsyncMock()
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            result = await llm.generate_embedding("Test text")
            
            assert result == sample_embedding
            assert len(result) == 768
    
    @pytest.mark.asyncio
    @patch('app.config.OPENAI_API_KEY', 'test-key')
    @patch('openai.AsyncOpenAI')
    async def test_generate_embedding_openai(self, mock_openai, sample_embedding):
        """Test generating embedding with OpenAI"""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.data = [Mock()]
        mock_response.data[0].embedding = sample_embedding

        mock_client = Mock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_response)
        mock_openai.return_value = mock_client

        llm = LLMService(provider="openai")
        result = await llm.generate_embedding("Test text")

        assert result == sample_embedding
        assert len(result) == 768
    
    @pytest.mark.asyncio
    async def test_generate_completion_with_custom_params(self):
        """Test generating completion with custom parameters"""
        llm = LLMService(provider="ollama")
        
        # Mock httpx client
        mock_response = Mock()
        mock_response.json.return_value = {
            "message": {"content": "Test response"},
            "eval_count": 20
        }
        mock_response.raise_for_status = Mock()
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock()
            mock_client.return_value.__aexit__ = AsyncMock()
            mock_post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value.post = mock_post
            
            result = await llm.generate_completion(
                prompt="Test prompt",
                model="custom-model",
                max_tokens=500,
                temperature=0.5
            )
            
            assert result["text"] == "Test response"
            
            # Verify custom parameters were passed
            call_args = mock_post.call_args
            assert call_args[1]["json"]["model"] == "custom-model"
            assert call_args[1]["json"]["options"]["num_predict"] == 500
            assert call_args[1]["json"]["options"]["temperature"] == 0.5

