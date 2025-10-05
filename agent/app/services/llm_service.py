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
    async def generate_completion_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate completion with tool calling support.

        Args:
            messages: Conversation messages
            tools: Available tools in OpenAI format
            system_prompt: System prompt
            session_id: Session ID for tracking

        Returns:
            Response with potential tool calls
        """
        print(f"🤖 LLM Service: Generating completion with tools")
        print(f"   Provider: {self.provider}")
        print(f"   Available tools: {len(tools)}")

        add_session_metadata(
            session_id=session_id,
            operation_type="llm_tool_calling",
            provider=self.provider,
            num_tools=len(tools),
            num_messages=len(messages)
        )

        if self.provider == "openai":
            return await self._generate_openai_completion_with_tools(
                messages, tools, system_prompt
            )
        else:
            # For Ollama, we'll simulate tool calling since it doesn't support it natively
            return await self._simulate_tool_calling_ollama(
                messages, tools, system_prompt
            )

    async def _generate_openai_completion_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate completion with tools using OpenAI."""
        try:
            # Add system message if provided
            if system_prompt and (not messages or messages[0]["role"] != "system"):
                messages = [{"role": "system", "content": system_prompt}] + messages

            response = await self.openai_client.chat.completions.create(
                model=self.openai_model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE
            )

            message = response.choices[0].message

            result = {
                "content": message.content,
                "tool_calls": []
            }

            if message.tool_calls:
                for tool_call in message.tool_calls:
                    result["tool_calls"].append({
                        "id": tool_call.id,
                        "type": tool_call.type,
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments
                        }
                    })

            return result

        except Exception as e:
            print(f"❌ LLM Service: OpenAI tool calling failed: {str(e)}")
            return {
                "content": f"I apologize, but I encountered an error: {str(e)}",
                "tool_calls": []
            }

    async def _simulate_tool_calling_ollama(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Simulate tool calling for Ollama by analyzing the query."""
        # Get the user's latest message
        user_message = ""
        for msg in reversed(messages):
            if msg["role"] == "user":
                user_message = msg["content"]
                break

        user_lower = user_message.lower()

        # Enhanced tool selection logic

        # 1. Learning path recommendation patterns
        learning_path_patterns = [
            "how to learn", "learning path", "roadmap", "where to start", "step by step",
            "i want to learn", "how do i learn", "learning plan", "study plan"
        ]

        if any(pattern in user_lower for pattern in learning_path_patterns):
            topic = self._extract_topic_from_query(user_message, learning_path_patterns)
            return {
                "content": None,
                "tool_calls": [{
                    "id": "simulated_call_1",
                    "type": "function",
                    "function": {
                        "name": "recommend_learning_path",
                        "arguments": f'{{"topic": "{topic}", "current_level": "unknown"}}'
                    }
                }]
            }

        # 2. Skill assessment patterns
        assessment_patterns = [
            "what level am i", "assess my", "where am i at", "what should i learn next",
            "i know", "i have experience", "my background", "skill level"
        ]

        if any(pattern in user_lower for pattern in assessment_patterns):
            topic = self._extract_topic_from_query(user_message, assessment_patterns)
            return {
                "content": None,
                "tool_calls": [{
                    "id": "simulated_call_1",
                    "type": "function",
                    "function": {
                        "name": "assess_skill_level",
                        "arguments": f'{{"topic": "{topic}", "user_description": "{user_message}"}}'
                    }
                }]
            }

        # 3. Course comparison patterns
        comparison_patterns = [
            "compare", "which course", "best course", "difference between", "vs",
            "better", "choose between", "recommend course"
        ]

        if any(pattern in user_lower for pattern in comparison_patterns):
            topic = self._extract_topic_from_query(user_message, comparison_patterns)
            return {
                "content": None,
                "tool_calls": [{
                    "id": "simulated_call_1",
                    "type": "function",
                    "function": {
                        "name": "compare_courses",
                        "arguments": f'{{"topic": "{topic}"}}'
                    }
                }]
            }

        # 4. Course search patterns
        course_search_patterns = [
            "course", "courses", "tutorial", "training", "class", "certification"
        ]

        if any(pattern in user_lower for pattern in course_search_patterns):
            topic = self._extract_topic_from_query(user_message, course_search_patterns)
            return {
                "content": None,
                "tool_calls": [{
                    "id": "simulated_call_1",
                    "type": "function",
                    "function": {
                        "name": "search_courses",
                        "arguments": f'{{"query": "{topic}", "limit": 5}}'
                    }
                }]
            }

        # 5. General learning patterns
        general_learning_patterns = [
            "learn", "study", "education", "teach", "skill", "knowledge"
        ]

        if any(pattern in user_lower for pattern in general_learning_patterns):
            topic = self._extract_topic_from_query(user_message, general_learning_patterns)
            return {
                "content": None,
                "tool_calls": [{
                    "id": "simulated_call_1",
                    "type": "function",
                    "function": {
                        "name": "search_courses",
                        "arguments": f'{{"query": "{topic}", "limit": 5}}'
                    }
                }]
            }

        # 6. Default to knowledge search for general questions
        return {
            "content": None,
            "tool_calls": [{
                "id": "simulated_call_1",
                "type": "function",
                "function": {
                    "name": "search_knowledge",
                    "arguments": f'{{"query": "{user_message}", "context_limit": 5}}'
                }
            }]
        }

    def _extract_topic_from_query(self, query: str, trigger_patterns: List[str]) -> str:
        """Extract the main topic from a query by removing trigger patterns."""
        query_lower = query.lower()

        # Remove trigger patterns to isolate the topic
        for pattern in trigger_patterns:
            if pattern in query_lower:
                # Split on the pattern and take the part after it
                parts = query_lower.split(pattern)
                if len(parts) > 1:
                    topic = parts[1].strip()
                    # Clean up common words
                    topic = topic.replace("about", "").replace("for", "").replace("in", "")
                    topic = topic.replace("?", "").replace(".", "").strip()
                    if topic:
                        return topic

        # If no clear topic found, return the original query
        return query

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
        default_model = self.ollama_model if self.provider == "ollama" else self.openai_model
        add_session_metadata(
            operation_type="llm_completion",
            model=model or default_model,
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
        default_model = self.ollama_model if self.provider == "ollama" else self.openai_model
        add_session_metadata(
            operation_type="llm_streaming",
            model=model or default_model,
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
        print(f"🧮 LLM Service: Generating embedding")
        print(f"   Text length: {len(text)}")
        print(f"   Text preview: '{text[:100]}...'")
        print(f"   Provider: {self.provider}")
        print(f"   Model: {model or (self.ollama_embedding_model if self.provider == 'ollama' else self.openai_embedding_model)}")

        if self.provider == "ollama":
            embedding = await self._generate_embedding_ollama(text, model)
        else:
            embedding = await self._generate_embedding_openai(text, model)

        print(f"✅ LLM Service: Embedding generated")
        print(f"   Embedding length: {len(embedding)}")
        print(f"   Embedding sample: {embedding[:5]}...")

        return embedding
    
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

