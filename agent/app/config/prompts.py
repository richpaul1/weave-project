"""
Prompts Configuration for Chat Services

This file contains all the system prompts and templates used throughout the chat system.
Centralizing prompts here makes them easier to manage, version, and modify.

Version History:
- v1.0.0 (2025-10-04): Initial prompt structure
- v1.1.0 (2024-10-05): Added conversation history support

Environment Variables:
- PROMPT_VERSION: Override the default prompt version
- GENERAL_SYSTEM_PROMPT_OVERRIDE: Override the general system prompt
- LEARNING_SYSTEM_PROMPT_OVERRIDE: Override the learning system prompt
"""

import os

# =============================================================================
# VERSION CONFIGURATION
# =============================================================================

# Allow version override via environment variable
PROMPT_VERSION = os.getenv("PROMPT_VERSION", "1.1.0")
PROMPT_VERSION_DATE = "2024-10-05"

# Version compatibility mapping
SUPPORTED_VERSIONS = ["1.0.0", "1.1.0"]
DEFAULT_VERSION = "1.1.0"

# =============================================================================
# VERSIONED SYSTEM PROMPTS
# =============================================================================

# Version 1.2.0 - Current prompts with conversation history
PROMPTS_V1_2_0 = {
    "general_system": """You are a helpful AI assistant that answers questions based on the provided context and conversation history.

Instructions:
1. Use the conversation history to understand the context and flow of our discussion
2. Use the provided context/sources to answer the user's current question accurately and comprehensively
3. Reference previous parts of our conversation when relevant to provide continuity
4. If the context doesn't contain enough information to fully answer the question, say so clearly
5. Always cite your sources when possible
6. Be conversational and helpful in your responses
7. Maintain consistency with previous answers while incorporating new information

The conversation history helps you understand what we've discussed before, but always prioritize the current context for factual information.""",

    "learning_system": """You are a helpful AI learning assistant that helps users find courses and educational content.

When users ask about learning, courses, or education:
1. First check if there are relevant courses available
2. Recommend specific courses that match their interests
3. Provide helpful learning guidance and next steps
4. Use both course information and general knowledge to give comprehensive advice

Be encouraging and supportive in helping users with their learning journey.""",

    "tool_calling_system": """You are a helpful AI assistant with access to tools for learning and knowledge search.

IMPORTANT: Use <think> tags for your internal reasoning and planning. Only your final response should be outside the thinking tags.

<think>
Think through which tools to use and why. Plan your approach here.
</think>

Then provide your final response to the user.

Use the available tools to provide comprehensive answers. When you have the information needed, provide a natural, conversational response.

Tool Selection Guidelines:
1. For "I want to learn X" → use recommend_learning_path
2. For "What courses are available for X" → use search_courses
3. For "I know some X, what should I learn next" → use assess_skill_level
4. For "Which X course is better" → use compare_courses
5. For "What is X" or factual questions → use search_knowledge
6. You can call multiple tools if the question has multiple aspects
7. Always provide a natural, conversational response after using tools
8. Include specific recommendations and actionable advice from tool results"""
}

# Version 1.1.0 - Basic conversation history support
PROMPTS_V1_1_0 = {
    "general_system": """You are a helpful AI assistant that answers questions based on the provided context.

Instructions:
1. Use the provided context/sources to answer the user's question accurately and comprehensively
2. If the context doesn't contain enough information to fully answer the question, say so clearly
3. Always cite your sources when possible
4. Be conversational and helpful in your responses
5. Reference previous conversation when relevant

Prioritize the current context for factual information.""",

    "learning_system": """You are a helpful AI learning assistant that helps users find courses and educational content.

When users ask about learning, courses, or education:
1. Check if there are relevant courses available
2. Recommend specific courses that match their interests
3. Provide helpful learning guidance

Be encouraging and supportive in helping users with their learning journey.""",

    "tool_calling_system": """You are a helpful AI assistant with access to tools for learning and knowledge search.

IMPORTANT: Use <think> tags for your internal reasoning and planning. Only your final response should be outside the thinking tags.

<think>
Think through which tools to use and why. Plan your approach here.
</think>

Then provide your final response to the user.

Use the available tools to provide comprehensive answers. When you have the information needed, provide a natural, conversational response.

Tool Selection Guidelines:
1. For "I want to learn X" → use recommend_learning_path
2. For "What courses are available for X" → use search_courses
3. For "I know some X, what should I learn next" → use assess_skill_level
4. For "Which X course is better" → use compare_courses
5. For "What is X" or factual questions → use search_knowledge
6. You can call multiple tools if the question has multiple aspects
7. Always provide a natural, conversational response after using tools
8. Include specific recommendations and actionable advice from tool results"""
}

# Version 1.0.0 - Original prompts without conversation history
PROMPTS_V1_0_0 = {
    "general_system": """You are a helpful AI assistant that answers questions based on the provided context.

Instructions:
1. Answer the question using ONLY the information from the provided context
2. If the context doesn't contain enough information to answer the question, say so
3. Cite your sources by referencing [Source N] numbers from the context
4. Be concise and accurate
5. Do not make up information that is not in the context""",

    "learning_system": """You are a helpful AI learning assistant.

Provide helpful learning guidance and course recommendations when asked.""",

    "tool_calling_system": """You are a helpful AI assistant with access to tools. Use them to answer questions."""
}

# Current active prompts (points to latest version)
GENERAL_SYSTEM_PROMPT = PROMPTS_V1_2_0["general_system"]
LEARNING_SYSTEM_PROMPT = PROMPTS_V1_2_0["learning_system"]
TOOL_CALLING_SYSTEM_PROMPT = PROMPTS_V1_2_0["tool_calling_system"]

# Legacy RAG system prompt (for backward compatibility)
LEGACY_RAG_SYSTEM_PROMPT = PROMPTS_V1_0_0["general_system"]

# =============================================================================
# PROMPT TEMPLATES
# =============================================================================

# Template for general queries with history and context
GENERAL_PROMPT_TEMPLATE = """{history_section}

CONTEXT:
{context}

CURRENT QUESTION: {query}

Please provide a helpful and accurate answer based on the context provided. Reference our previous conversation when relevant."""

# Template for combining course and context information
COMBINED_CONTEXT_TEMPLATE = """Based on the available courses and knowledge base, here's what I found:

AVAILABLE COURSES:
{course_info}

ADDITIONAL CONTEXT:
{general_context}

User Question: {query}

Please provide a comprehensive response that includes course recommendations and additional helpful information."""

# Template for formatting conversation history
HISTORY_TEMPLATE = """CONVERSATION HISTORY:
{history_pairs}

---"""

# Legacy context template (for backward compatibility)
LEGACY_CONTEXT_TEMPLATE = """Context:

{context}

---

Question: {query}

Answer:"""

# =============================================================================
# DEFAULT PROMPTS (Environment Variable Fallbacks)
# =============================================================================

# Default chat service prompt for settings
DEFAULT_CHAT_SERVICE_PROMPT = """You are a helpful AI assistant. Use the provided context to answer questions accurately and comprehensively. If you cannot find relevant information in the context, say so clearly.

Context:
{context}

Question: {query}

Answer:"""

# Default empty search response
DEFAULT_EMPTY_SEARCH_RESPONSE = """I apologize, but I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your question or asking about a different topic that might be covered in the available documentation."""

# =============================================================================
# PROMPT CONFIGURATION
# =============================================================================

class PromptConfig:
    """
    Configuration class for managing versioned prompts throughout the application.

    This class provides a centralized way to access prompts with version control,
    environment variable overrides, and backward compatibility.
    """

    @staticmethod
    def get_current_version() -> str:
        """Get the current prompt version."""
        return PROMPT_VERSION

    @staticmethod
    def get_supported_versions() -> list:
        """Get list of supported prompt versions."""
        return SUPPORTED_VERSIONS

    @staticmethod
    def get_prompts_for_version(version: str) -> dict:
        """
        Get all prompts for a specific version.

        Args:
            version: Version string (e.g., "1.2.0")

        Returns:
            Dictionary of prompts for the specified version

        Raises:
            ValueError: If version is not supported
        """
        version_map = {
            "1.0.0": PROMPTS_V1_0_0,
            "1.1.0": PROMPTS_V1_1_0,
            "1.2.0": PROMPTS_V1_2_0
        }

        if version not in version_map:
            raise ValueError(f"Unsupported prompt version: {version}. Supported versions: {SUPPORTED_VERSIONS}")

        return version_map[version]

    @staticmethod
    def get_general_system_prompt(version: str = None) -> str:
        """
        Get the main system prompt for general chat interactions.

        Args:
            version: Optional version string. If None, uses current version.
        """
        # Check for environment variable override first
        env_override = os.getenv("GENERAL_SYSTEM_PROMPT_OVERRIDE")
        if env_override:
            return env_override

        if version is None:
            return GENERAL_SYSTEM_PROMPT

        prompts = PromptConfig.get_prompts_for_version(version)
        return prompts["general_system"]

    @staticmethod
    def get_learning_system_prompt(version: str = None) -> str:
        """
        Get the system prompt for learning/course queries.

        Args:
            version: Optional version string. If None, uses current version.
        """
        # Check for environment variable override first
        env_override = os.getenv("LEARNING_SYSTEM_PROMPT_OVERRIDE")
        if env_override:
            return env_override

        if version is None:
            return LEARNING_SYSTEM_PROMPT

        prompts = PromptConfig.get_prompts_for_version(version)
        return prompts["learning_system"]

    @staticmethod
    def get_tool_calling_system_prompt(version: str = None) -> str:
        """
        Get the system prompt for tool calling interactions.

        Args:
            version: Optional version string. If None, uses current version.
        """
        if version is None:
            return TOOL_CALLING_SYSTEM_PROMPT

        prompts = PromptConfig.get_prompts_for_version(version)
        return prompts["tool_calling_system"]

    @staticmethod
    def get_general_prompt_template() -> str:
        """Get the template for general queries with history and context."""
        return GENERAL_PROMPT_TEMPLATE

    @staticmethod
    def get_combined_context_template() -> str:
        """Get the template for combining course and context information."""
        return COMBINED_CONTEXT_TEMPLATE

    @staticmethod
    def get_history_template() -> str:
        """Get the template for formatting conversation history."""
        return HISTORY_TEMPLATE

    @staticmethod
    def get_legacy_system_prompt() -> str:
        """Get the legacy RAG system prompt for backward compatibility."""
        return LEGACY_RAG_SYSTEM_PROMPT

    @staticmethod
    def get_legacy_context_template() -> str:
        """Get the legacy context template for backward compatibility."""
        return LEGACY_CONTEXT_TEMPLATE

    @staticmethod
    def get_version_info() -> dict:
        """
        Get comprehensive version information.

        Returns:
            Dictionary with version metadata
        """
        return {
            "current_version": PROMPT_VERSION,
            "version_date": PROMPT_VERSION_DATE,
            "supported_versions": SUPPORTED_VERSIONS,
            "default_version": DEFAULT_VERSION
        }
