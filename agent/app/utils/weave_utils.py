"""
Weave Utilities

Helper functions for Weave tracing and metadata management.
Enhanced with tool execution tracing capabilities and prompt version tracking.
"""
from typing import Optional, Dict, Any
import weave
import time


def format_session_metadata(call) -> str:
    """
    Custom attribute formatter for session-based operations.
    
    Args:
        call: Weave call object with attributes
        
    Returns:
        Formatted string with session and operation info
    """
    if not hasattr(call, 'attributes'):
        return "unknown_operation"
    
    attrs = call.attributes
    session_id = attrs.get("session_id", "default")
    operation_type = attrs.get("operation_type", "unknown")
    
    # Truncate session ID for readability
    short_session = session_id[:8] if len(session_id) > 8 else session_id
    
    return f"{operation_type}__{short_session}"


def format_llm_metadata(call) -> str:
    """
    Custom attribute formatter for LLM operations.
    
    Args:
        call: Weave call object with attributes
        
    Returns:
        Formatted string with LLM operation details
    """
    if not hasattr(call, 'attributes'):
        return "unknown_llm_operation"
    
    attrs = call.attributes
    operation_type = attrs.get("operation_type", "llm")
    model = attrs.get("model", "unknown_model")
    temperature = attrs.get("temperature", 0.0)
    
    # Extract model name (remove version/tag if present)
    model_name = model.split(":")[0] if ":" in model else model
    
    return f"{operation_type}__{model_name}__temp{temperature}"


def format_retrieval_metadata(call) -> str:
    """
    Custom attribute formatter for retrieval operations.
    
    Args:
        call: Weave call object with attributes
        
    Returns:
        Formatted string with retrieval operation details
    """
    if not hasattr(call, 'attributes'):
        return "unknown_retrieval_operation"
    
    attrs = call.attributes
    operation_type = attrs.get("operation_type", "retrieval")
    top_k = attrs.get("top_k", 0)
    query_length = attrs.get("query_length", 0)
    
    return f"{operation_type}__k{top_k}__q{query_length}"


def get_prompt_version_metadata() -> Dict[str, Any]:
    """
    Get prompt version metadata for Weave tracking.

    Returns:
        Dictionary with prompt version information
    """
    try:
        from app.prompts import PromptConfig
        return {
            "prompt_version": PromptConfig.get_current_version(),
            "prompt_version_date": PromptConfig.get_version_info().get("version_date"),
            "supported_prompt_versions": PromptConfig.get_supported_versions()
        }
    except ImportError:
        # Fallback if prompts config is not available
        return {
            "prompt_version": "unknown",
            "prompt_version_date": "unknown",
            "supported_prompt_versions": []
        }


def add_session_metadata(
    session_id: Optional[str] = None,
    operation_type: str = "unknown",
    include_prompt_version: bool = True,
    **kwargs
) -> None:
    """
    Helper function to add session metadata to current Weave call.
    Automatically includes prompt version information for tracking.

    Args:
        session_id: Session identifier
        operation_type: Type of operation being performed
        include_prompt_version: Whether to include prompt version metadata (default: True)
        **kwargs: Additional metadata key-value pairs
    """
    try:
        import weave

        if hasattr(weave, 'get_current_call') and weave.get_current_call():
            current_call = weave.get_current_call()
            if current_call and hasattr(current_call, 'attributes'):
                # Add core metadata
                current_call.attributes["session_id"] = session_id or "default_session"
                current_call.attributes["operation_type"] = operation_type

                # Add prompt version metadata
                if include_prompt_version:
                    prompt_metadata = get_prompt_version_metadata()
                    for key, value in prompt_metadata.items():
                        current_call.attributes[key] = value

                # Add additional metadata
                for key, value in kwargs.items():
                    current_call.attributes[key] = value
                    
    except Exception as e:
        # Silently fail if Weave is not available or configured
        pass


def track_prompt_usage(
    prompt_type: str,
    prompt_content: str,
    version: Optional[str] = None,
    **additional_metadata
) -> None:
    """
    Track specific prompt usage for detailed analysis in Weave.

    Args:
        prompt_type: Type of prompt (e.g., "general_system", "learning_system", "tool_calling")
        prompt_content: The actual prompt content being used
        version: Specific version if different from current
        **additional_metadata: Additional tracking metadata
    """
    try:
        prompt_metadata = get_prompt_version_metadata()

        add_session_metadata(
            operation_type="prompt_usage_tracking",
            include_prompt_version=False,  # We'll add it manually with more detail
            prompt_type=prompt_type,
            prompt_length=len(prompt_content),
            prompt_hash=hash(prompt_content) % 1000000,  # Simple hash for content tracking
            prompt_version_used=version or prompt_metadata.get("prompt_version"),
            prompt_content_preview=prompt_content[:100] + "..." if len(prompt_content) > 100 else prompt_content,
            **prompt_metadata,
            **additional_metadata
        )
    except Exception as e:
        print(f"Warning: Could not track prompt usage: {e}")


def get_session_from_call(call) -> Optional[str]:
    """
    Extract session ID from a Weave call object.
    
    Args:
        call: Weave call object
        
    Returns:
        Session ID if available, None otherwise
    """
    if hasattr(call, 'attributes') and 'session_id' in call.attributes:
        return call.attributes['session_id']
    return None


def get_operation_type_from_call(call) -> str:
    """
    Extract operation type from a Weave call object.
    
    Args:
        call: Weave call object
        
    Returns:
        Operation type if available, 'unknown' otherwise
    """
    if hasattr(call, 'attributes') and 'operation_type' in call.attributes:
        return call.attributes['operation_type']
    return 'unknown'


# Custom attribute name functions for different operation types
def session_operation_name(call):
    """Custom attribute name for session-based operations."""
    return format_session_metadata(call)


def llm_operation_name(call):
    """Custom attribute name for LLM operations."""
    return format_llm_metadata(call)


def retrieval_operation_name(call):
    """Custom attribute name for retrieval operations."""
    return format_retrieval_metadata(call)


def format_tool_metadata(call) -> str:
    """
    Custom attribute formatter for tool execution operations.

    Args:
        call: Weave call object with attributes

    Returns:
        Formatted string with tool execution details
    """
    if not hasattr(call, 'attributes'):
        return "unknown_tool_operation"

    attrs = call.attributes
    tool_name = attrs.get("tool_name", "unknown_tool")
    operation_type = attrs.get("operation_type", "tool")
    session_id = attrs.get("session_id", "default")

    # Truncate session ID for readability
    short_session = session_id[:8] if len(session_id) > 8 else session_id

    # Add success indicator if available
    success_indicator = ""
    if "execution_success" in attrs:
        success_indicator = "✅" if attrs["execution_success"] else "❌"

    return f"{operation_type}__{tool_name}__{short_session}{success_indicator}"


def tool_operation_name(call):
    """Custom attribute name for tool operations."""
    return format_tool_metadata(call)


def create_tool_trace_summary(tool_calls: list) -> Dict[str, Any]:
    """
    Create a comprehensive summary of tool executions for Weave dashboard filtering.

    Args:
        tool_calls: List of tool call results

    Returns:
        Dictionary with tool execution summary for easy filtering
    """
    summary = {
        "total_tool_calls": len(tool_calls),
        "tools_used": [],
        "tool_categories": [],
        "successful_calls": 0,
        "failed_calls": 0,
        "learning_tools_used": False,
        "general_tools_used": False,
        "courses_found_total": 0,
        "knowledge_chunks_total": 0,
    }

    for call in tool_calls:
        tool_name = call.get("tool_name", "unknown")
        result = call.get("result", {})

        # Track tools used
        if tool_name not in summary["tools_used"]:
            summary["tools_used"].append(tool_name)

        # Track tool categories
        if tool_name == "search_courses":
            summary["learning_tools_used"] = True
            if "learning" not in summary["tool_categories"]:
                summary["tool_categories"].append("learning")
        elif tool_name == "search_knowledge":
            summary["general_tools_used"] = True
            if "general" not in summary["tool_categories"]:
                summary["tool_categories"].append("general")

        # Track success/failure
        if result.get("success", False):
            summary["successful_calls"] += 1

            # Extract specific metrics
            data = result.get("data", {})
            if tool_name == "search_courses":
                summary["courses_found_total"] += len(data.get("courses", []))
            elif tool_name == "search_knowledge":
                summary["knowledge_chunks_total"] += data.get("num_chunks", 0)
        else:
            summary["failed_calls"] += 1

    return summary
