"""
Environment utilities for reading configuration from .env.local
"""
import os
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv


class EnvironmentUtils:
    """Utility class for reading environment variables from .env.local"""
    
    def __init__(self, env_file_path: Optional[str] = None):
        """
        Initialize environment utils
        
        Args:
            env_file_path: Path to .env file. If None, looks for .env.local in project root
        """
        if env_file_path is None:
            # Look for .env.local in the project root (parent of openapi folder)
            project_root = Path(__file__).parent.parent
            env_file_path = project_root / ".env.local"
        
        self.env_file_path = Path(env_file_path)
        self._load_environment()
    
    def _load_environment(self):
        """Load environment variables from the .env file"""
        if self.env_file_path.exists():
            load_dotenv(self.env_file_path)
            print(f"✓ Loaded environment from {self.env_file_path}")
        else:
            print(f"⚠ Environment file not found: {self.env_file_path}")
    
    def get_openai_config(self) -> Dict[str, Any]:
        """Get OpenAI configuration from environment"""
        return {
            "api_key": os.getenv("OPEN_API_KEY"),
            "model": os.getenv("OPENAI_MODEL", "gpt-4"),
            "embedding_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            "max_tokens": int(os.getenv("LLM_MAX_TOKENS", "2000")),
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.7"))
        }
    
    def get_weave_config(self) -> Dict[str, Any]:
        """Get Weave/W&B configuration from environment"""
        return {
            "enabled": os.getenv("WEAVE_ENABLED", "true").lower() == "true",
            "project": os.getenv("WANDB_PROJECT", "rl-demo"),
            "api_key": os.getenv("WANDB_API_KEY"),
            "entity": os.getenv("WANDB_ENTITY", "richpaul1-stealth")
        }
    
    def get_all_config(self) -> Dict[str, Any]:
        """Get all configuration as a dictionary"""
        return {
            "openai": self.get_openai_config(),
            "weave": self.get_weave_config(),
            "neo4j": {
                "uri": os.getenv("NEO4J_URI", "neo4j://localhost:7687"),
                "user": os.getenv("NEO4J_USER", "neo4j"),
                "password": os.getenv("NEO4J_PASSWORD", "password"),
                "database": os.getenv("NEO4J_DB_NAME", "weave-setup")
            },
            "ollama": {
                "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                "model": os.getenv("OLLAMA_MODEL", "qwen3:0.6b"),
                "embedding_model": os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")
            }
        }
    
    def validate_required_keys(self) -> Dict[str, bool]:
        """Validate that required environment variables are set"""
        required_keys = {
            "OPEN_API_KEY": os.getenv("OPEN_API_KEY") is not None,
            "WANDB_API_KEY": os.getenv("WANDB_API_KEY") is not None,
            "WANDB_PROJECT": os.getenv("WANDB_PROJECT") is not None,
        }
        return required_keys
    
    def print_config_summary(self):
        """Print a summary of the loaded configuration"""
        print("\n" + "="*50)
        print("ENVIRONMENT CONFIGURATION SUMMARY")
        print("="*50)
        
        # Validation
        validation = self.validate_required_keys()
        print("\nRequired Keys Validation:")
        for key, is_valid in validation.items():
            status = "✓" if is_valid else "✗"
            print(f"  {status} {key}")
        
        # OpenAI Config
        openai_config = self.get_openai_config()
        print(f"\nOpenAI Configuration:")
        print(f"  API Key: {'✓ Set' if openai_config['api_key'] else '✗ Missing'}")
        print(f"  Model: {openai_config['model']}")
        print(f"  Max Tokens: {openai_config['max_tokens']}")
        print(f"  Temperature: {openai_config['temperature']}")
        
        # Weave Config
        weave_config = self.get_weave_config()
        print(f"\nWeave Configuration:")
        print(f"  Enabled: {weave_config['enabled']}")
        print(f"  Project: {weave_config['project']}")
        print(f"  Entity: {weave_config['entity']}")
        print(f"  API Key: {'✓ Set' if weave_config['api_key'] else '✗ Missing'}")
        
        print("="*50)


# Convenience function for quick access
def get_env_utils() -> EnvironmentUtils:
    """Get a configured EnvironmentUtils instance"""
    return EnvironmentUtils()


if __name__ == "__main__":
    # Test the environment utils
    env_utils = EnvironmentUtils()
    env_utils.print_config_summary()
