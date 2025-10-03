"""
Configuration management for Agent Backend

Reads from weave-project/.env.local with centralized environment utilities.
Provides all configuration constants for the agent application.
"""
from app.utils.env import env_config


# ============================================================================
# Server Configuration
# ============================================================================
AGENT_BACKEND_PORT = env_config.get_int("AGENT_BACKEND_PORT", 3001)
AGENT_CLIENT_PORT = env_config.get_int("AGENT_CLIENT_PORT", 3000)

# ============================================================================
# Neo4j Configuration
# ============================================================================
NEO4J_URI = env_config.get_required("NEO4J_URI", "Neo4j database URI (e.g., neo4j://localhost:7687)")
NEO4J_USER = env_config.get_required("NEO4J_USER", "Neo4j database username")
NEO4J_PASSWORD = env_config.get_required("NEO4J_PASSWORD", "Neo4j database password")
NEO4J_DB_NAME = env_config.get_required("NEO4J_DB_NAME", "Neo4j database name")

# ============================================================================
# LLM Configuration
# ============================================================================
# Ollama (local LLM)
OLLAMA_BASE_URL = env_config.get_optional("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = env_config.get_optional("OLLAMA_MODEL", "qwen3:0.6b")
OLLAMA_EMBEDDING_MODEL = env_config.get_optional("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")

# OpenAI (alternative)
OPENAI_API_KEY = env_config.get_optional("OPENAI_API_KEY", "")  # Optional
OPENAI_MODEL = env_config.get_optional("OPENAI_MODEL", "gpt-4")
OPENAI_EMBEDDING_MODEL = env_config.get_optional("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# ============================================================================
# Weave Configuration
# ============================================================================
WANDB_PROJECT = env_config.get_optional("WANDB_PROJECT", "support-app")
WANDB_ENTITY = env_config.get_optional("WANDB_ENTITY", "richpaul1-stealth")
WANDB_API_KEY = env_config.get_optional("WANDB_API_KEY", "")  # Optional

# ============================================================================
# RAG Configuration
# ============================================================================
# Retrieval settings
DEFAULT_TOP_K = env_config.get_int("RAG_TOP_K", 5)
MAX_CONTEXT_LENGTH = env_config.get_int("RAG_MAX_CONTEXT_LENGTH", 4000)
MIN_RELEVANCE_SCORE = float(env_config.get_optional("RAG_MIN_RELEVANCE_SCORE", "0.7"))

# LLM settings
MAX_TOKENS = env_config.get_int("LLM_MAX_TOKENS", 2000)
TEMPERATURE = float(env_config.get_optional("LLM_TEMPERATURE", "0.7"))

