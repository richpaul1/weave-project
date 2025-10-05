"""
Tool Strategy Service

This service orchestrates the tool calling strategy, deciding when and how
to use tools based on query analysis and configuration.
"""

import weave
from typing import Dict, List, Any, Optional, AsyncGenerator
from app.services.query_classifier import QueryClassifier
from app.services.tool_calling_service import ToolCallingService
from app.services.enhanced_rag_service import EnhancedRAGService
from app.tool_config_pkg.tool_config import (
    ToolStrategyConfig, ToolStrategy, DEFAULT_TOOL_STRATEGY_CONFIG,
    classify_query_for_tools, get_tools_for_query_type
)
from app.utils.weave_utils import add_session_metadata


class ToolStrategyService:
    """
    Service that implements intelligent tool strategy selection.
    
    This service decides whether to use:
    1. Pure tool calling (LLM decides tools)
    2. Classification-based routing (classifier decides)
    3. Hybrid approach (both)
    """
    
    def __init__(
        self,
        query_classifier: QueryClassifier,
        tool_calling_service: ToolCallingService,
        enhanced_rag_service: EnhancedRAGService,
        config: ToolStrategyConfig = None
    ):
        self.query_classifier = query_classifier
        self.tool_calling_service = tool_calling_service
        self.enhanced_rag_service = enhanced_rag_service
        self.config = config or DEFAULT_TOOL_STRATEGY_CONFIG
        
        print(f"🛠️ Tool Strategy Service initialized with strategy: {self.config.strategy.value}")

    @weave.op()
    async def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
        force_strategy: Optional[ToolStrategy] = None
    ) -> Dict[str, Any]:
        """
        Process a query using the configured tool strategy.
        
        Args:
            query: User query
            session_id: Session ID for tracking
            top_k: Number of results to return
            force_strategy: Override the configured strategy
            
        Returns:
            Response with tool usage metadata
        """
        strategy = force_strategy or self.config.strategy
        
        print(f"🎯 Tool Strategy: Processing query with strategy '{strategy.value}'")
        print(f"   Query: '{query}'")
        
        # Add strategy metadata
        add_session_metadata(
            session_id=session_id,
            operation_type="tool_strategy",
            strategy=strategy.value,
            query_length=len(query)
        )
        
        if strategy == ToolStrategy.LLM_DRIVEN:
            return await self._process_llm_driven(query, session_id, top_k)
        elif strategy == ToolStrategy.CLASSIFICATION_BASED:
            return await self._process_classification_based(query, session_id, top_k)
        elif strategy == ToolStrategy.HYBRID:
            return await self._process_hybrid(query, session_id, top_k)
        else:
            # Fallback to enhanced RAG
            return await self.enhanced_rag_service.process_query(query, session_id, top_k)

    @weave.op()
    async def process_query_streaming(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
        force_strategy: Optional[ToolStrategy] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a query with streaming using the configured tool strategy.
        """
        strategy = force_strategy or self.config.strategy
        
        print(f"🎯 Tool Strategy Streaming: Processing with strategy '{strategy.value}'")
        
        if strategy == ToolStrategy.LLM_DRIVEN:
            async for event in self._process_llm_driven_streaming(query, session_id, top_k):
                yield event
        elif strategy == ToolStrategy.CLASSIFICATION_BASED:
            async for event in self._process_classification_based_streaming(query, session_id, top_k):
                yield event
        elif strategy == ToolStrategy.HYBRID:
            async for event in self._process_hybrid_streaming(query, session_id, top_k):
                yield event
        else:
            # Fallback to enhanced RAG streaming
            async for event in self.enhanced_rag_service.process_query_streaming(query, session_id, top_k):
                yield event

    @weave.op()
    async def _process_llm_driven(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> Dict[str, Any]:
        """Process query using pure LLM-driven tool calling."""
        print("🤖 Using LLM-driven tool strategy")
        
        try:
            result = await self.tool_calling_service.process_query_with_tools(
                query=query,
                session_id=session_id,
                max_tool_calls=self.config.max_tool_calls_per_query
            )
            
            # Enhance metadata
            result["metadata"]["strategy_used"] = "llm_driven"
            result["metadata"]["tool_strategy_config"] = {
                "max_tool_calls": self.config.max_tool_calls_per_query,
                "enable_chaining": self.config.enable_tool_chaining
            }
            
            return result
            
        except Exception as e:
            print(f"❌ LLM-driven strategy failed: {str(e)}")
            if self.config.fallback_to_rag:
                print("🔄 Falling back to Enhanced RAG")
                return await self.enhanced_rag_service.process_query(query, session_id, top_k)
            raise

    @weave.op()
    async def _process_classification_based(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> Dict[str, Any]:
        """Process query using classification-based tool selection."""
        print("📊 Using classification-based tool strategy")
        
        # Classify the query
        classification = self.query_classifier.classify_query(query)
        query_type = classification["query_type"]
        confidence = classification.get("confidence", 0.0)
        
        print(f"   Classification: {query_type} (confidence: {confidence:.2f})")
        
        # Determine tools based on classification
        if query_type == "learning" and confidence >= self.config.confidence_threshold:
            # Use learning-focused tools
            query_tool_type = classify_query_for_tools(query)
            tool_config = get_tools_for_query_type(query_tool_type)
            
            # Use tool calling with specific tools
            result = await self.tool_calling_service.process_query_with_tools(
                query=query,
                session_id=session_id,
                max_tool_calls=self.config.max_tool_calls_per_query,
                preferred_tools=tool_config.get("primary_tools", [])
            )
        else:
            # Use enhanced RAG for general queries
            result = await self.enhanced_rag_service.process_query(query, session_id, top_k)
        
        # Enhance metadata
        result["metadata"]["strategy_used"] = "classification_based"
        result["metadata"]["classification"] = classification
        result["metadata"]["confidence_threshold"] = self.config.confidence_threshold
        
        return result

    @weave.op()
    async def _process_hybrid(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> Dict[str, Any]:
        """Process query using hybrid strategy (classification + LLM)."""
        print("🔀 Using hybrid tool strategy")
        
        # First, classify the query
        classification = self.query_classifier.classify_query(query)
        query_type = classification["query_type"]
        learning_score = classification.get("learning_score", 0.0)
        confidence = classification.get("confidence", 0.0)
        
        print(f"   Classification: {query_type} (learning_score: {learning_score:.2f}, confidence: {confidence:.2f})")
        
        # Decide strategy based on classification confidence
        if confidence >= self.config.confidence_threshold:
            # High confidence - use classification-based approach
            print("   High confidence - using classification-based routing")
            result = await self._process_classification_based(query, session_id, top_k)
        else:
            # Low confidence - let LLM decide
            print("   Low confidence - letting LLM decide tools")
            result = await self._process_llm_driven(query, session_id, top_k)
        
        # Enhance metadata
        result["metadata"]["strategy_used"] = "hybrid"
        result["metadata"]["classification"] = classification
        result["metadata"]["decision_reason"] = (
            "classification_based" if confidence >= self.config.confidence_threshold 
            else "llm_driven"
        )
        
        return result

    async def _process_llm_driven_streaming(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream LLM-driven tool calling."""
        try:
            async for event in self.tool_calling_service.process_query_with_tools_streaming(
                query=query,
                session_id=session_id,
                max_tool_calls=self.config.max_tool_calls_per_query
            ):
                # Add strategy metadata to events
                if event.get("type") == "metadata":
                    event["data"]["strategy_used"] = "llm_driven"
                yield event
        except Exception as e:
            if self.config.fallback_to_rag:
                async for event in self.enhanced_rag_service.process_query_streaming(query, session_id, top_k):
                    if event.get("type") == "metadata":
                        event["data"]["strategy_used"] = "llm_driven_fallback"
                    yield event
            else:
                yield {
                    "type": "error",
                    "data": {"error": f"LLM-driven streaming failed: {str(e)}"}
                }

    async def _process_classification_based_streaming(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream classification-based tool selection."""
        # Emit classification event
        classification = self.query_classifier.classify_query(query)
        yield {
            "type": "classification",
            "data": {
                "classification": classification,
                "strategy": "classification_based"
            }
        }
        
        query_type = classification["query_type"]
        confidence = classification.get("confidence", 0.0)
        
        if query_type == "learning" and confidence >= self.config.confidence_threshold:
            async for event in self.tool_calling_service.process_query_with_tools_streaming(
                query=query,
                session_id=session_id,
                max_tool_calls=self.config.max_tool_calls_per_query
            ):
                if event.get("type") == "metadata":
                    event["data"]["strategy_used"] = "classification_based"
                yield event
        else:
            async for event in self.enhanced_rag_service.process_query_streaming(query, session_id, top_k):
                if event.get("type") == "metadata":
                    event["data"]["strategy_used"] = "classification_based"
                yield event

    async def _process_hybrid_streaming(
        self,
        query: str,
        session_id: Optional[str],
        top_k: int
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream hybrid strategy processing."""
        # Emit classification event
        classification = self.query_classifier.classify_query(query)
        confidence = classification.get("confidence", 0.0)
        
        decision = "classification_based" if confidence >= self.config.confidence_threshold else "llm_driven"
        
        yield {
            "type": "strategy_decision",
            "data": {
                "classification": classification,
                "strategy": "hybrid",
                "decision": decision,
                "confidence_threshold": self.config.confidence_threshold
            }
        }
        
        # Route based on decision
        if decision == "classification_based":
            async for event in self._process_classification_based_streaming(query, session_id, top_k):
                if event.get("type") == "metadata":
                    event["data"]["strategy_used"] = "hybrid"
                    event["data"]["decision_reason"] = "classification_based"
                yield event
        else:
            async for event in self._process_llm_driven_streaming(query, session_id, top_k):
                if event.get("type") == "metadata":
                    event["data"]["strategy_used"] = "hybrid"
                    event["data"]["decision_reason"] = "llm_driven"
                yield event

    def get_strategy_info(self) -> Dict[str, Any]:
        """Get information about the current strategy configuration."""
        return {
            "strategy": self.config.strategy.value,
            "max_tool_calls_per_query": self.config.max_tool_calls_per_query,
            "max_tool_iterations": self.config.max_tool_iterations,
            "enable_tool_chaining": self.config.enable_tool_chaining,
            "enable_parallel_tools": self.config.enable_parallel_tools,
            "fallback_to_rag": self.config.fallback_to_rag,
            "enabled_tools": self.config.get_enabled_tools(),
            "high_priority_tools": self.config.get_high_priority_tools(),
            "learning_score_threshold": self.config.learning_score_threshold,
            "confidence_threshold": self.config.confidence_threshold
        }
