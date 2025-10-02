"""
LLM Service for generating completions and embeddings

Supports both Ollama (local) and OpenAI (cloud) providers.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx
import weave
from app.config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_EMBEDDING_MODEL,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    OPENAI_EMBEDDING_MODEL,
    MAX_TOKENS,
    TEMPERATURE
)
from app.utils.weave_utils import add_session_metadata


class LLMService:
    """
    LLM service supporting Ollama and OpenAI providers.
    """
    
    def __init__(self, provider: str = "ollama"):
        """
        Initialize LLM service.
        
        Args:
            provider: "ollama" or "openai"
        """
        self.provider = provider
        self.ollama_base_url = OLLAMA_BASE_URL
        self.ollama_model = OLLAMA_MODEL
        self.ollama_embedding_model = OLLAMA_EMBEDDING_MODEL
        
        if provider == "openai":
            if not OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY not set in environment")
            from openai import AsyncOpenAI
            self.openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
            self.openai_model = OPENAI_MODEL
            self.openai_embedding_model = OPENAI_EMBEDDING_MODEL
    
    @weave.op()
    async def generate_completion(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = MAX_TOKENS,
        temperature: float = TEMPERATURE,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        NESTED CALL: Generate a text completion.
        This is a nested operation within a conversation turn.

        Args:
            prompt: The user prompt
            model: Model to use (defaults to configured model)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            system_prompt: Optional system prompt

        Returns:
            Dictionary with 'text', 'model', 'tokens' keys
        """
        # Add LLM operation metadata
        add_session_metadata(
            operation_type="llm_completion",
            model=model or self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            prompt_length=len(prompt),
            has_system_prompt=system_prompt is not None
        )
        if self.provider == "ollama":
            return await self._generate_completion_ollama(
                prompt, model, max_tokens, temperature, system_prompt
            )
        else:
            return await self._generate_completion_openai(
                prompt, model, max_tokens, temperature, system_prompt
            )
    
    async def _generate_completion_ollama(
        self,
        prompt: str,
        model: Optional[str],
        max_tokens: int,
        temperature: float,
        system_prompt: Optional[str]
    ) -> Dict[str, Any]:
        """Generate completion using Ollama"""
        model = model or self.ollama_model
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.ollama_base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": temperature
                    }
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return {
                "text": data["message"]["content"],
                "model": model,
                "tokens": data.get("eval_count", 0),
                "provider": "ollama"
            }
    
    async def _generate_completion_openai(
        self,
        prompt: str,
        model: Optional[str],
        max_tokens: int,
        temperature: float,
        system_prompt: Optional[str]
    ) -> Dict[str, Any]:
        """Generate completion using OpenAI"""
        model = model or self.openai_model
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = await self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return {
            "text": response.choices[0].message.content,
            "model": model,
            "tokens": response.usage.completion_tokens,
            "provider": "openai"
        }
    
    @weave.op()
    async def generate_streaming(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = MAX_TOKENS,
        temperature: float = TEMPERATURE,
        system_prompt: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        NESTED CALL: Generate a streaming text completion.
        This is a nested operation within a conversation turn.

        Args:
            prompt: The user prompt
            model: Model to use (defaults to configured model)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            system_prompt: Optional system prompt

        Yields:
            Text chunks as they are generated
        """
        # Add LLM streaming operation metadata
        add_session_metadata(
            operation_type="llm_streaming",
            model=model or self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            prompt_length=len(prompt),
            has_system_prompt=system_prompt is not None
        )
        if self.provider == "ollama":
            async for chunk in self._generate_streaming_ollama(
                prompt, model, max_tokens, temperature, system_prompt
            ):
                yield chunk
        else:
            async for chunk in self._generate_streaming_openai(
                prompt, model, max_tokens, temperature, system_prompt
            ):
                yield chunk
    
    async def _generate_streaming_ollama(
        self,
        prompt: str,
        model: Optional[str],
        max_tokens: int,
        temperature: float,
        system_prompt: Optional[str]
    ) -> AsyncGenerator[str, None]:
        """Generate streaming completion using Ollama"""
        model = model or self.ollama_model
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{self.ollama_base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": temperature
                    }
                }
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        import json
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
    
    async def _generate_streaming_openai(
        self,
        prompt: str,
        model: Optional[str],
        max_tokens: int,
        temperature: float,
        system_prompt: Optional[str]
    ) -> AsyncGenerator[str, None]:
        """Generate streaming completion using OpenAI"""
        model = model or self.openai_model
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        stream = await self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    @weave.op()
    async def generate_embedding(
        self,
        text: str,
        model: Optional[str] = None
    ) -> List[float]:
        """
        Generate an embedding vector for text.
        
        Args:
            text: Text to embed
            model: Embedding model to use (defaults to configured model)
            
        Returns:
            Embedding vector as list of floats
        """
        if self.provider == "ollama":
            return await self._generate_embedding_ollama(text, model)
        else:
            return await self._generate_embedding_openai(text, model)
    
    async def _generate_embedding_ollama(
        self,
        text: str,
        model: Optional[str]
    ) -> List[float]:
        """Generate embedding using Ollama"""
        model = model or self.ollama_embedding_model
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.ollama_base_url}/api/embeddings",
                json={
                    "model": model,
                    "prompt": text
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["embedding"]
    
    async def _generate_embedding_openai(
        self,
        text: str,
        model: Optional[str]
    ) -> List[float]:
        """Generate embedding using OpenAI"""
        model = model or self.openai_embedding_model
        
        response = await self.openai_client.embeddings.create(
            model=model,
            input=text
        )
        
        return response.data[0].embedding

