"""
Tool Strategy Configuration

This module defines configuration for the tool calling strategy,
including tool selection rules, priorities, and behavior settings.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
from enum import Enum


class ToolStrategy(Enum):
    """Tool calling strategies."""
    CLASSIFICATION_BASED = "classification_based"  # Use query classifier to route
    LLM_DRIVEN = "llm_driven"  # Let LLM decide which tools to use
    HYBRID = "hybrid"  # Combine both approaches


class ToolPriority(Enum):
    """Tool priority levels."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class ToolConfig:
    """Configuration for individual tools."""
    name: str
    enabled: bool = True
    priority: ToolPriority = ToolPriority.MEDIUM
    max_calls_per_session: int = 10
    timeout_seconds: int = 30
    fallback_tools: List[str] = None
    
    def __post_init__(self):
        if self.fallback_tools is None:
            self.fallback_tools = []


@dataclass
class ToolStrategyConfig:
    """Configuration for the overall tool strategy."""
    strategy: ToolStrategy = ToolStrategy.LLM_DRIVEN
    max_tool_calls_per_query: int = 3
    max_tool_iterations: int = 5
    enable_tool_chaining: bool = True
    enable_parallel_tools: bool = False
    fallback_to_rag: bool = True
    
    # Tool-specific configurations
    tools: Dict[str, ToolConfig] = None
    
    # Classification thresholds (for hybrid strategy)
    learning_score_threshold: float = 0.6
    confidence_threshold: float = 0.7
    
    def __post_init__(self):
        if self.tools is None:
            self.tools = self._get_default_tool_configs()
    
    def _get_default_tool_configs(self) -> Dict[str, ToolConfig]:
        """Get default tool configurations."""
        return {
            "search_courses": ToolConfig(
                name="search_courses",
                enabled=True,
                priority=ToolPriority.HIGH,
                max_calls_per_session=5,
                fallback_tools=["search_knowledge"]
            ),
            "search_knowledge": ToolConfig(
                name="search_knowledge",
                enabled=True,
                priority=ToolPriority.HIGH,
                max_calls_per_session=8,
                fallback_tools=[]
            ),
            "recommend_learning_path": ToolConfig(
                name="recommend_learning_path",
                enabled=True,
                priority=ToolPriority.HIGH,
                max_calls_per_session=3,
                timeout_seconds=45,
                fallback_tools=["search_courses"]
            ),
            "assess_skill_level": ToolConfig(
                name="assess_skill_level",
                enabled=True,
                priority=ToolPriority.MEDIUM,
                max_calls_per_session=3,
                fallback_tools=["search_courses"]
            ),
            "compare_courses": ToolConfig(
                name="compare_courses",
                enabled=True,
                priority=ToolPriority.MEDIUM,
                max_calls_per_session=2,
                timeout_seconds=45,
                fallback_tools=["search_courses"]
            )
        }
    
    def get_enabled_tools(self) -> List[str]:
        """Get list of enabled tool names."""
        return [name for name, config in self.tools.items() if config.enabled]
    
    def get_high_priority_tools(self) -> List[str]:
        """Get list of high priority tool names."""
        return [
            name for name, config in self.tools.items() 
            if config.enabled and config.priority == ToolPriority.HIGH
        ]
    
    def is_tool_enabled(self, tool_name: str) -> bool:
        """Check if a tool is enabled."""
        return self.tools.get(tool_name, ToolConfig(tool_name)).enabled
    
    def get_tool_config(self, tool_name: str) -> ToolConfig:
        """Get configuration for a specific tool."""
        return self.tools.get(tool_name, ToolConfig(tool_name))


# Global configuration instance
DEFAULT_TOOL_STRATEGY_CONFIG = ToolStrategyConfig()


# Tool selection rules for different query types
TOOL_SELECTION_RULES = {
    "learning_path": {
        "primary_tools": ["recommend_learning_path"],
        "secondary_tools": ["search_courses", "assess_skill_level"],
        "patterns": [
            "how to learn", "learning path", "roadmap", "where to start",
            "step by step", "i want to learn", "study plan"
        ]
    },
    "skill_assessment": {
        "primary_tools": ["assess_skill_level"],
        "secondary_tools": ["recommend_learning_path", "search_courses"],
        "patterns": [
            "what level", "assess my", "where am i", "what should i learn next",
            "my background", "skill level", "i know", "experience"
        ]
    },
    "course_comparison": {
        "primary_tools": ["compare_courses"],
        "secondary_tools": ["search_courses"],
        "patterns": [
            "compare", "which course", "best course", "vs", "better",
            "choose between", "difference between"
        ]
    },
    "course_search": {
        "primary_tools": ["search_courses"],
        "secondary_tools": ["recommend_learning_path"],
        "patterns": [
            "course", "courses", "tutorial", "training", "class",
            "certification", "find course"
        ]
    },
    "general_learning": {
        "primary_tools": ["search_courses"],
        "secondary_tools": ["search_knowledge"],
        "patterns": [
            "learn", "study", "education", "teach", "skill", "knowledge"
        ]
    },
    "general_knowledge": {
        "primary_tools": ["search_knowledge"],
        "secondary_tools": [],
        "patterns": [
            "what is", "explain", "define", "how does", "why", "when"
        ]
    }
}


def get_tools_for_query_type(query_type: str) -> Dict[str, List[str]]:
    """Get recommended tools for a query type."""
    return TOOL_SELECTION_RULES.get(query_type, {
        "primary_tools": ["search_knowledge"],
        "secondary_tools": []
    })


def classify_query_for_tools(query: str) -> str:
    """Classify query to determine appropriate tools."""
    query_lower = query.lower()
    
    # Check each rule type
    for rule_type, rule_config in TOOL_SELECTION_RULES.items():
        patterns = rule_config.get("patterns", [])
        if any(pattern in query_lower for pattern in patterns):
            return rule_type
    
    # Default to general knowledge
    return "general_knowledge"
