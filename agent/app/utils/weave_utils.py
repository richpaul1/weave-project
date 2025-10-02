"""
Weave Utilities

Helper functions for Weave tracing and metadata management.
"""
from typing import Optional, Dict, Any


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


def add_session_metadata(
    session_id: Optional[str] = None,
    operation_type: str = "unknown",
    **kwargs
) -> None:
    """
    Helper function to add session metadata to current Weave call.
    
    Args:
        session_id: Session identifier
        operation_type: Type of operation being performed
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
                
                # Add additional metadata
                for key, value in kwargs.items():
                    current_call.attributes[key] = value
                    
    except Exception as e:
        # Silently fail if Weave is not available or configured
        pass


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
