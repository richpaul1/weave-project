"""
Configuration package for the agent application.

This package contains configuration files for various aspects of the application,
including prompts, settings, and other configurable parameters.

This module re-exports all configuration from the original config.py file
to maintain backward compatibility while adding new prompt configuration.
"""

# Import all configuration from the original config.py file using absolute import
import importlib.util
import os

# Get the path to the original config.py file
config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.py')
spec = importlib.util.spec_from_file_location("app_config", config_path)
app_config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app_config)

# Re-export all configuration variables
# Server Configuration
AGENT_BACKEND_PORT = app_config.AGENT_BACKEND_PORT
AGENT_CLIENT_PORT = app_config.AGENT_CLIENT_PORT

# Neo4j Configuration
NEO4J_URI = app_config.NEO4J_URI
NEO4J_USER = app_config.NEO4J_USER
NEO4J_PASSWORD = app_config.NEO4J_PASSWORD
NEO4J_DB_NAME = app_config.NEO4J_DB_NAME

# LLM Configuration
OLLAMA_BASE_URL = app_config.OLLAMA_BASE_URL
OLLAMA_MODEL = app_config.OLLAMA_MODEL
OLLAMA_EMBEDDING_MODEL = app_config.OLLAMA_EMBEDDING_MODEL
OPENAI_API_KEY = app_config.OPENAI_API_KEY
OPENAI_MODEL = app_config.OPENAI_MODEL
OPENAI_EMBEDDING_MODEL = app_config.OPENAI_EMBEDDING_MODEL

# Weave Configuration
WANDB_PROJECT = app_config.WANDB_PROJECT
WANDB_ENTITY = app_config.WANDB_ENTITY
WANDB_API_KEY = app_config.WANDB_API_KEY

# RAG Configuration
DEFAULT_TOP_K = app_config.DEFAULT_TOP_K
MAX_CONTEXT_LENGTH = app_config.MAX_CONTEXT_LENGTH
MIN_RELEVANCE_SCORE = app_config.MIN_RELEVANCE_SCORE
MAX_TOKENS = app_config.MAX_TOKENS
TEMPERATURE = app_config.TEMPERATURE

# Import new prompt configuration
from .prompts import PromptConfig

__all__ = [
    # Server Configuration
    "AGENT_BACKEND_PORT",
    "AGENT_CLIENT_PORT",

    # Neo4j Configuration
    "NEO4J_URI",
    "NEO4J_USER",
    "NEO4J_PASSWORD",
    "NEO4J_DB_NAME",

    # LLM Configuration
    "OLLAMA_BASE_URL",
    "OLLAMA_MODEL",
    "OLLAMA_EMBEDDING_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_EMBEDDING_MODEL",

    # Weave Configuration
    "WANDB_PROJECT",
    "WANDB_ENTITY",
    "WANDB_API_KEY",

    # RAG Configuration
    "DEFAULT_TOP_K",
    "MAX_CONTEXT_LENGTH",
    "MIN_RELEVANCE_SCORE",
    "MAX_TOKENS",
    "TEMPERATURE",

    # Prompt Configuration
    "PromptConfig",
]
