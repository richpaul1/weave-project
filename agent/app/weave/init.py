"""
Weave initialization and configuration
"""
import os
import weave

_weave_initialized = False
_weave_client = None

def init_weave():
    """
    Initialize Weave for LLM observability

    Reads WANDB_API_KEY, WANDB_PROJECT, and WANDB_ENTITY from environment variables
    """
    global _weave_initialized, _weave_client

    if _weave_initialized:
        return _weave_client

    # Get configuration from environment
    project_name = os.getenv("WANDB_PROJECT", "support-app")
    entity = os.getenv("WANDB_ENTITY", "")
    api_key = os.getenv("WANDB_API_KEY")

    # Build full project name
    full_project = f"{entity}/{project_name}" if entity else project_name

    # Check if WANDB_API_KEY is set
    if not api_key:
        print("Warning: WANDB_API_KEY not set. Weave tracking will be disabled.")
        print("Set WANDB_API_KEY in .env.local to enable Weave tracking.")
        return None

    try:
        # Initialize Weave
        _weave_client = weave.init(full_project)
        print(f"✓ Weave initialized successfully")
        print(f"  Project: {full_project}")
        print(f"  API Key: {api_key[:8]}...")
        _weave_initialized = True
        return _weave_client
    except Exception as e:
        print(f"Warning: Failed to initialize Weave: {e}")
        print("Continuing without Weave tracking...")
        return None

def get_weave_client():
    """Get the Weave client instance"""
    if not _weave_initialized:
        return init_weave()
    return _weave_client

