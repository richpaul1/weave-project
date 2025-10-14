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
import weave

# =============================================================================
# VERSION CONFIGURATION
# =============================================================================

# Allow version override via environment variable
PROMPT_VERSION = os.getenv("PROMPT_VERSION", "1.4.0")
PROMPT_VERSION_DATE = "2024-10-10"

# Version compatibility mapping
SUPPORTED_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"]
DEFAULT_VERSION = "1.4.0"

# =============================================================================
# VERSIONED SYSTEM PROMPTS
# =============================================================================

# Version 1.4.0 - Enhanced prompts with image hint
PROMPTS_V1_4_0 = {
    "general_system": """You are a helpful AI assistant that answers questions based on the provided context and conversation history.

Instructions:
1. **HISTORY**: Use the conversation history to understand the context and flow of our discussion
2. **NEW_CONTEXT**: Use the provided context/sources to answer the user's current question accurately and comprehensively
3. Reference previous parts of our conversation when relevant to provide continuity
4. If the context doesn't contain enough information to fully answer the question, say so clearly
5. Always cite your sources when possible
6. Be conversational and helpful in your responses
7. Maintain consistency with previous answers while incorporating new information
8. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url). IMPORTANT if the image_url ends with .png return these urls.


When you see **HISTORY** sections, use them to understand what we've discussed before.
When you see **NEW_CONTEXT** sections, prioritize this information for factual accuracy.""",

    "learning_system": """You are a helpful AI learning assistant that helps users find courses and educational content.

When processing information:
- **HISTORY**: Review previous learning discussions and recommendations
- **NEW_CONTEXT**: Use current course and educational content information

When users ask about learning, courses, or education:
1. First check if there are relevant courses available in **NEW_CONTEXT**
2. Consider previous recommendations from **HISTORY** to avoid repetition
3. Recommend specific courses that match their interests and build on previous discussions
4. Provide helpful learning guidance and next steps
5. Use both course information and general knowledge to give comprehensive advice

Be encouraging and supportive in helping users with their learning journey.""",

    "tool_calling_system": """You are a helpful AI assistant with access to tools for learning and knowledge search.

IMPORTANT: Use <think> tags for your internal reasoning and planning. Only your final response should be outside the thinking tags.

You have access to our conversation history. Use this context to:
- **HISTORY**: Understand what the user has previously asked about
- **NEW_CONTEXT**: Process fresh information from tool results
- Avoid repeating information already provided
- Build upon previous recommendations
- Provide more personalized and contextual responses
- When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url). IMPORTANT if the image_url ends with .png return these urls.


<think>
Think through which tools to use and why. Consider our conversation history when planning your approach.
Review any **HISTORY** sections to understand context.
Plan how to use **NEW_CONTEXT** information effectively.
</think>

Then provide your final response to the user.

Use the available tools to provide comprehensive answers. When you have the information needed, provide a natural, conversational response that builds on our conversation history.

Tool Selection Guidelines:
1. For "I want to learn X" → use recommend_learning_path
2. For "What courses are available for X" → use search_courses
3. For "I know some X, what should I learn next" → use assess_skill_level
4. For "Which X course is better" → use compare_courses
5. For "What is X" or factual questions → use search_knowledge
6. You can call multiple tools if the question has multiple aspects
7. Always provide a natural, conversational response after using tools
8. Include specific recommendations and actionable advice from tool results
9. Reference our conversation history when relevant to provide better context
10. If the user is asking follow-up questions, consider their previous interests and skill level"""
}

# Version 1.3.0 - Enhanced prompts with clear section markers
PROMPTS_V1_3_0 = {
    "general_system": """You are a helpful AI assistant that answers questions based on the provided context and conversation history.

Instructions:
1. **HISTORY**: Use the conversation history to understand the context and flow of our discussion
2. **NEW_CONTEXT**: Use the provided context/sources to answer the user's current question accurately and comprehensively
3. Reference previous parts of our conversation when relevant to provide continuity
4. If the context doesn't contain enough information to fully answer the question, say so clearly
5. Always cite your sources when possible
6. Be conversational and helpful in your responses
7. Maintain consistency with previous answers while incorporating new information

When you see **HISTORY** sections, use them to understand what we've discussed before.
When you see **NEW_CONTEXT** sections, prioritize this information for factual accuracy.""",

    "learning_system": """You are a helpful AI learning assistant that helps users find courses and educational content.

When processing information:
- **HISTORY**: Review previous learning discussions and recommendations
- **NEW_CONTEXT**: Use current course and educational content information

When users ask about learning, courses, or education:
1. First check if there are relevant courses available in **NEW_CONTEXT**
2. Consider previous recommendations from **HISTORY** to avoid repetition
3. Recommend specific courses that match their interests and build on previous discussions
4. Provide helpful learning guidance and next steps
5. Use both course information and general knowledge to give comprehensive advice

Be encouraging and supportive in helping users with their learning journey.""",

    "tool_calling_system": """You are a helpful AI assistant with access to tools for learning and knowledge search.

IMPORTANT: Use <think> tags for your internal reasoning and planning. Only your final response should be outside the thinking tags.

You have access to our conversation history. Use this context to:
- **HISTORY**: Understand what the user has previously asked about
- **NEW_CONTEXT**: Process fresh information from tool results
- Avoid repeating information already provided
- Build upon previous recommendations
- Provide more personalized and contextual responses

<think>
Think through which tools to use and why. Consider our conversation history when planning your approach.
Review any **HISTORY** sections to understand context.
Plan how to use **NEW_CONTEXT** information effectively.
</think>

Then provide your final response to the user.

Use the available tools to provide comprehensive answers. When you have the information needed, provide a natural, conversational response that builds on our conversation history.

Tool Selection Guidelines:
1. For "I want to learn X" → use recommend_learning_path
2. For "What courses are available for X" → use search_courses
3. For "I know some X, what should I learn next" → use assess_skill_level
4. For "Which X course is better" → use compare_courses
5. For "What is X" or factual questions → use search_knowledge
6. You can call multiple tools if the question has multiple aspects
7. Always provide a natural, conversational response after using tools
8. Include specific recommendations and actionable advice from tool results
9. Reference our conversation history when relevant to provide better context
10. If the user is asking follow-up questions, consider their previous interests and skill level"""
}

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

    "tool_calling_system": """You are a helpful AI assistant with access to tools for learning and knowledge search.

CRITICAL FORMATTING REQUIREMENT: You MUST use thinking tags for internal reasoning. Follow this EXACT format:

<think>
Let me analyze this query and determine which tools to use...
[Your detailed internal reasoning here]
</think>

Based on my analysis, here is my response to help you...
[Your final answer to the user here]

RULES:
1. ALWAYS start with <think> tags for your reasoning
2. ALWAYS end thinking with </think> before your final response
3. Your final response should be helpful and comprehensive
4. NEVER show thinking content to the user - only your final answer
5. You can have multiple <think> blocks if you need to reason through different aspects

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

# Current active prompts (will be set dynamically after PromptConfig class definition)
GENERAL_SYSTEM_PROMPT = None
LEARNING_SYSTEM_PROMPT = None
TOOL_CALLING_SYSTEM_PROMPT = None

# Legacy RAG system prompt (for backward compatibility)
LEGACY_RAG_SYSTEM_PROMPT = PROMPTS_V1_0_0["general_system"]

# =============================================================================
# PROMPT TEMPLATES
# =============================================================================

# Template for general queries with history and context
GENERAL_PROMPT_TEMPLATE = """{history_section}

**NEW_CONTEXT:**
{context}

**CURRENT_QUESTION:** {query}

Please provide a helpful and accurate answer based on the context provided. Reference our previous conversation when relevant."""

# Enhanced template with clear section markers (v1.3.0+)
ENHANCED_PROMPT_TEMPLATE = """{history_section}

**NEW_CONTEXT:**
{context}

**CURRENT_QUESTION:** {query}

Please provide a helpful and accurate answer using the **NEW_CONTEXT** provided. Reference any relevant information from **HISTORY** when appropriate."""

# Template for combining course and context information
COMBINED_CONTEXT_TEMPLATE = """Based on the available courses and knowledge base, here's what I found:

**NEW_CONTEXT:**

**AVAILABLE_COURSES:**
{course_info}

**ADDITIONAL_CONTEXT:**
{general_context}

**USER_QUESTION:** {query}

Please provide a comprehensive response that includes course recommendations and additional helpful information."""

# Enhanced template for combining course and context information (v1.3.0+)
ENHANCED_COMBINED_CONTEXT_TEMPLATE = """{history_section}

**NEW_CONTEXT:**

**AVAILABLE_COURSES:**
{course_info}

**ADDITIONAL_CONTEXT:**
{general_context}

**CURRENT_QUESTION:** {query}

Please provide a comprehensive response using the **NEW_CONTEXT** provided. Include course recommendations and additional helpful information. Reference any relevant information from **HISTORY** when appropriate."""

# Template for formatting conversation history
HISTORY_TEMPLATE = """**HISTORY:**
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
            "1.2.0": PROMPTS_V1_2_0,
            "1.3.0": PROMPTS_V1_3_0,
            "1.4.0": PROMPTS_V1_4_0

        }

        if version not in version_map:
            raise ValueError(f"Unsupported prompt version: {version}. Supported versions: {SUPPORTED_VERSIONS}")

        return version_map[version]

    @staticmethod
    @weave.op()
    def get_general_system_prompt(version: str = None) -> str:
        """
        Get the main system prompt for general chat interactions.

        Args:
            version: Optional version string. If None, uses current version.
        """
        from app.utils.weave_utils import add_session_metadata

        # Check for environment variable override first
        env_override = os.getenv("GENERAL_SYSTEM_PROMPT_OVERRIDE")
        if env_override:
            add_session_metadata(
                operation_type="prompt_version_access",
                prompt_type="general_system",
                requested_version=version,
                effective_version="env_override",
                prompt_length=len(env_override),
                is_default_version=version is None,
                is_env_override=True,
                prompt_date=PROMPT_VERSION_DATE
            )
            return env_override

        effective_version = version or PROMPT_VERSION

        if version is None:
            prompt = GENERAL_SYSTEM_PROMPT
        else:
            prompts = PromptConfig.get_prompts_for_version(version)
            prompt = prompts["general_system"]

        add_session_metadata(
            operation_type="prompt_version_access",
            prompt_type="general_system",
            requested_version=version,
            effective_version=effective_version,
            prompt_length=len(prompt),
            is_default_version=version is None,
            is_env_override=False,
            prompt_date=PROMPT_VERSION_DATE
        )

        return prompt

    @staticmethod
    @weave.op()
    def get_learning_system_prompt(version: str = None) -> str:
        """
        Get the system prompt for learning/course queries.

        Args:
            version: Optional version string. If None, uses current version.
        """
        from app.utils.weave_utils import add_session_metadata

        # Check for environment variable override first
        env_override = os.getenv("LEARNING_SYSTEM_PROMPT_OVERRIDE")
        if env_override:
            add_session_metadata(
                operation_type="prompt_version_access",
                prompt_type="learning_system",
                requested_version=version,
                effective_version="env_override",
                prompt_length=len(env_override),
                is_default_version=version is None,
                is_env_override=True,
                prompt_date=PROMPT_VERSION_DATE
            )
            return env_override

        effective_version = version or PROMPT_VERSION

        if version is None:
            prompt = LEARNING_SYSTEM_PROMPT
        else:
            prompts = PromptConfig.get_prompts_for_version(version)
            prompt = prompts["learning_system"]

        add_session_metadata(
            operation_type="prompt_version_access",
            prompt_type="learning_system",
            requested_version=version,
            effective_version=effective_version,
            prompt_length=len(prompt),
            is_default_version=version is None,
            is_env_override=False,
            prompt_date=PROMPT_VERSION_DATE
        )

        return prompt

    @staticmethod
    @weave.op()
    def get_tool_calling_system_prompt(version: str = None) -> str:
        """
        Get the system prompt for tool calling interactions.

        Args:
            version: Optional version string. If None, uses current version.
        """
        from app.utils.weave_utils import add_session_metadata

        effective_version = version or PROMPT_VERSION

        if version is None:
            prompt = TOOL_CALLING_SYSTEM_PROMPT
        else:
            prompts = PromptConfig.get_prompts_for_version(version)
            prompt = prompts["tool_calling_system"]

        add_session_metadata(
            operation_type="prompt_version_access",
            prompt_type="tool_calling_system",
            requested_version=version,
            effective_version=effective_version,
            prompt_length=len(prompt),
            is_default_version=version is None,
            is_env_override=False,
            prompt_date=PROMPT_VERSION_DATE
        )

        return prompt

    @staticmethod
    @weave.op()
    def get_general_prompt_template() -> str:
        """Get the template for general queries with history and context."""
        from app.utils.weave_utils import add_session_metadata

        add_session_metadata(
            operation_type="prompt_template_access",
            template_type="general_prompt_template",
            template_version="1.3.0",
            has_section_markers=True,
            template_length=len(GENERAL_PROMPT_TEMPLATE)
        )
        return GENERAL_PROMPT_TEMPLATE

    @staticmethod
    @weave.op()
    def get_combined_context_template() -> str:
        """Get the template for combining course and context information."""
        from app.utils.weave_utils import add_session_metadata

        add_session_metadata(
            operation_type="prompt_template_access",
            template_type="combined_context_template",
            template_version="1.3.0",
            has_section_markers=True,
            template_length=len(COMBINED_CONTEXT_TEMPLATE)
        )
        return COMBINED_CONTEXT_TEMPLATE

    @staticmethod
    @weave.op()
    def get_history_template() -> str:
        """Get the template for formatting conversation history."""
        from app.utils.weave_utils import add_session_metadata

        add_session_metadata(
            operation_type="prompt_template_access",
            template_type="history_template",
            template_version="1.3.0",
            has_section_markers=True,
            template_length=len(HISTORY_TEMPLATE)
        )
        return HISTORY_TEMPLATE

    @staticmethod
    @weave.op()
    def get_enhanced_prompt_template() -> str:
        """Get the enhanced template for general queries with section markers (v1.3.0+)."""
        from app.utils.weave_utils import add_session_metadata

        add_session_metadata(
            operation_type="enhanced_prompt_template_access",
            template_type="enhanced_prompt_template",
            template_version="1.3.0",
            has_section_markers=True,
            enhanced_features=True,
            template_length=len(ENHANCED_PROMPT_TEMPLATE)
        )
        return ENHANCED_PROMPT_TEMPLATE

    @staticmethod
    @weave.op()
    def get_enhanced_combined_context_template() -> str:
        """Get the enhanced template for combining course and context with section markers (v1.3.0+)."""
        from app.utils.weave_utils import add_session_metadata

        add_session_metadata(
            operation_type="enhanced_prompt_template_access",
            template_type="enhanced_combined_context_template",
            template_version="1.3.0",
            has_section_markers=True,
            enhanced_features=True,
            template_length=len(ENHANCED_COMBINED_CONTEXT_TEMPLATE)
        )
        return ENHANCED_COMBINED_CONTEXT_TEMPLATE

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


# =============================================================================
# DYNAMIC PROMPT ASSIGNMENT
# =============================================================================

# Set active prompts dynamically based on PROMPT_VERSION
_current_prompts = PromptConfig.get_prompts_for_version(PROMPT_VERSION)
GENERAL_SYSTEM_PROMPT = _current_prompts["general_system"]
LEARNING_SYSTEM_PROMPT = _current_prompts["learning_system"]
TOOL_CALLING_SYSTEM_PROMPT = _current_prompts["tool_calling_system"]
