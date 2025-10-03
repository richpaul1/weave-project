"""
Environment configuration utilities for Agent Backend

Provides centralized environment variable management with proper error handling
and validation. Reads from weave-project/.env.local file.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional


class EnvironmentConfig:
    """Centralized environment configuration management"""
    
    def __init__(self):
        """Initialize environment configuration by loading .env.local"""
        self._load_env_file()
    
    def _load_env_file(self) -> None:
        """Load environment variables from weave-project/.env.local"""
        # Path to weave-project/.env.local (parent of parent of parent directory)
        env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
        
        if env_path.exists():
            load_dotenv(env_path)
            print(f"✅ Environment configuration loaded from: {env_path.absolute()}")
        else:
            # Fallback to parent directory's .env.local
            parent_env = Path(__file__).parent.parent.parent.parent.parent / ".env.local"
            if parent_env.exists():
                load_dotenv(parent_env)
                print(f"✅ Environment configuration loaded from: {parent_env.absolute()}")
            else:
                print(f"⚠️  Warning: .env.local not found at {env_path.absolute()}")
    
    def get_required(self, key: str, description: str) -> str:
        """
        Get a required environment variable.
        Raises ValueError with helpful message if not found.
        
        Args:
            key: Environment variable name
            description: Human-readable description of the variable
            
        Returns:
            Environment variable value
            
        Raises:
            ValueError: If environment variable is not set
        """
        value = os.getenv(key)
        if not value:
            error_msg = f"""
❌ Missing required environment variable: {key}
   Description: {description}
   Please add this to weave-project/.env.local file.
   Example: {key}=your-value-here
"""
            print(error_msg)
            raise ValueError(f"Missing required environment variable: {key}")
        return value
    
    def get_optional(self, key: str, default_value: str) -> str:
        """
        Get an optional environment variable with a default value.
        
        Args:
            key: Environment variable name
            default_value: Default value if environment variable is not set
            
        Returns:
            Environment variable value or default value
        """
        return os.getenv(key, default_value)
    
    def get_int(self, key: str, default_value: int) -> int:
        """
        Get an integer environment variable with a default value.
        
        Args:
            key: Environment variable name
            default_value: Default value if environment variable is not set
            
        Returns:
            Environment variable value as integer or default value
        """
        value = os.getenv(key)
        if value is None:
            return default_value
        try:
            return int(value)
        except ValueError:
            print(f"⚠️  Warning: Invalid integer value for {key}: {value}, using default: {default_value}")
            return default_value
    
    def get_bool(self, key: str, default_value: bool) -> bool:
        """
        Get a boolean environment variable with a default value.
        
        Args:
            key: Environment variable name
            default_value: Default value if environment variable is not set
            
        Returns:
            Environment variable value as boolean or default value
        """
        value = os.getenv(key)
        if value is None:
            return default_value
        return value.lower() in ('true', '1', 'yes', 'on')


# Global environment configuration instance
env_config = EnvironmentConfig()

# Convenience functions for backward compatibility
def get_required_env(key: str, description: str) -> str:
    """Get a required environment variable (backward compatibility)"""
    return env_config.get_required(key, description)

def get_optional_env(key: str, default_value: str) -> str:
    """Get an optional environment variable (backward compatibility)"""
    return env_config.get_optional(key, default_value)
