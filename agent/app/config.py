"""
Configuration management for Agent Backend

Reads from weave-project/.env.local with no default values.
Throws helpful errors for missing required variables.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from parent .env.local
env_path = Path(__file__).parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded environment configuration from: {env_path.absolute()}")
else:
    print(f"⚠️  Warning: .env.local not found at {env_path.absolute()}")


def get_required_env(key: str, description: str) -> str:
    """
    Get a required environment variable.
    Throws an error with helpful message if not found.
    """
    value = os.getenv(key)
    if not value:
        print(f"\n❌ Missing required environment variable: {key}")
        print(f"   Description: {description}")
        print(f"   Please add this to weave-project/.env.local file.")
        print(f"   Example: {key}=your-value-here\n")
        raise ValueError(f"Missing required environment variable: {key}")
    return value


def get_optional_env(key: str, default_value: str) -> str:
    """Get an optional environment variable with a default value."""
    return os.getenv(key, default_value)


# ============================================================================
# Server Configuration
# ============================================================================
AGENT_PORT = int(get_optional_env("AGENT_PORT", "8000"))
CLIENT_PORT = int(get_optional_env("CLIENT_PORT", "5174"))

# ============================================================================
# Neo4j Configuration
# ============================================================================
NEO4J_URI = get_required_env("NEO4J_URI", "Neo4j database URI (e.g., neo4j://localhost:7687)")
NEO4J_USER = get_required_env("NEO4J_USER", "Neo4j database username")
NEO4J_PASSWORD = get_required_env("NEO4J_PASSWORD", "Neo4j database password")
NEO4J_DB_NAME = get_required_env("NEO4J_DB_NAME", "Neo4j database name")

# ============================================================================
# LLM Configuration
# ============================================================================
# Ollama (local LLM)
OLLAMA_BASE_URL = get_optional_env("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = get_optional_env("OLLAMA_MODEL", "qwen3:0.6b")
OLLAMA_EMBEDDING_MODEL = get_optional_env("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")

# OpenAI (alternative)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # Optional
OPENAI_MODEL = get_optional_env("OPENAI_MODEL", "gpt-4")
OPENAI_EMBEDDING_MODEL = get_optional_env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# ============================================================================
# Weave Configuration
# ============================================================================
WEAVE_PROJECT_NAME = get_optional_env("WEAVE_PROJECT_NAME", "weave-rag-demo")
WANDB_API_KEY = os.getenv("WANDB_API_KEY")  # Optional

# ============================================================================
# RAG Configuration
# ============================================================================
# Retrieval settings
DEFAULT_TOP_K = int(get_optional_env("RAG_TOP_K", "5"))
MAX_CONTEXT_LENGTH = int(get_optional_env("RAG_MAX_CONTEXT_LENGTH", "4000"))
MIN_RELEVANCE_SCORE = float(get_optional_env("RAG_MIN_RELEVANCE_SCORE", "0.7"))

# LLM settings
MAX_TOKENS = int(get_optional_env("LLM_MAX_TOKENS", "2000"))
TEMPERATURE = float(get_optional_env("LLM_TEMPERATURE", "0.7"))

