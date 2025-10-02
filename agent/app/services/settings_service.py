"""
Settings Service for Agent Backend

Manages chat settings using Neo4j database with defaults from environment/config.
"""
from typing import Dict, Any, Optional
import weave
import os
import json
import asyncio
from .storage import StorageService


# Module-level cache and lock to prevent infinite loops
_cached_settings: Optional[Dict[str, Any]] = None
_settings_lock = asyncio.Lock()


class SettingsService:
    """
    Service for managing chat settings using Neo4j database.
    """

    def __init__(self):
        self.storage = StorageService()
        # Default settings from environment and config
        self._default_settings = {
            "search_score_threshold": float(os.getenv("CHAT_SEARCH_SCORE_THRESHOLD", "0.9")),
            "enable_title_matching": os.getenv("CHAT_ENABLE_TITLE_MATCHING", "true").lower() == "true",
            "enable_full_page_content": os.getenv("CHAT_ENABLE_FULL_PAGE_CONTENT", "true").lower() == "true",
            "max_pages": int(os.getenv("CHAT_MAX_PAGES", "5")),
            "empty_search_default_response": os.getenv(
                "CHAT_EMPTY_SEARCH_DEFAULT_RESPONSE",
                "I apologize, but I couldn't find any relevant information in the "
                "knowledge base to answer your question. Please try rephrasing your "
                "question or asking about a different topic that might be covered "
                "in the available documentation."
            ),
            "chat_service_prompt": os.getenv(
                "CHAT_SERVICE_PROMPT",
                "You are a helpful AI assistant. Use the provided context to answer "
                "questions accurately and comprehensively. If you cannot find relevant "
                "information in the context, say so clearly.\n\n"
                "Context:\n{context}\n\n"
                "Question: {query}\n\n"
                "Answer:"
            ),
            "enable_full_validation_testing": os.getenv("CHAT_ENABLE_FULL_VALIDATION_TESTING", "false").lower() == "true"
        }

    async def get_chat_settings(self) -> Dict[str, Any]:
        """
        Get chat settings from Neo4j database with module-level caching.

        Returns:
            Dictionary containing chat settings
        """
        global _cached_settings

        # Return cached settings if available (without lock for performance)
        if _cached_settings is not None:
            print(f"✅ Returning cached settings")
            return _cached_settings

        # Use lock to prevent multiple concurrent requests
        async with _settings_lock:
            # Double-check pattern: another coroutine might have fetched while we waited
            if _cached_settings is not None:
                print(f"✅ Returning cached settings (acquired during lock wait)")
                return _cached_settings

            print(f"⚠️ Cache miss - loading from database")

            try:
                # Connect to storage
                self.storage.connect()

                # Get all settings from database
                all_settings = self.storage.get_settings()

                # Build settings dictionary from database values
                settings = {}
                for setting in all_settings:
                    key = setting["key"]
                    value = setting["value"]

                    # Parse chat-related settings
                    if key == "chat_search_score_threshold":
                        settings["search_score_threshold"] = float(value)
                    elif key == "chat_enable_title_matching":
                        settings["enable_title_matching"] = value.lower() == "true"
                    elif key == "chat_enable_full_page_content":
                        settings["enable_full_page_content"] = value.lower() == "true"
                    elif key == "chat_max_pages":
                        settings["max_pages"] = int(value)
                    elif key == "chat_empty_search_default_response":
                        settings["empty_search_default_response"] = value
                    elif key == "chat_service_prompt":
                        settings["chat_service_prompt"] = value
                    elif key == "chat_enable_full_validation_testing":
                        settings["enable_full_validation_testing"] = value.lower() == "true"

                # Fill in any missing settings with defaults
                for key, default_value in self._default_settings.items():
                    if key not in settings:
                        settings[key] = default_value
                        # Save the default to database for future use
                        db_key = f"chat_{key}"
                        db_value = str(default_value)
                        self.storage.create_or_update_setting(db_key, db_value)

                # Cache the settings
                _cached_settings = settings
                print(f"✅ Loaded and cached chat settings from database: {settings}")
                return settings

            except Exception as e:
                print(f"❌ Could not load settings from database: {e}")
                # Use defaults and cache them to prevent repeated requests
                _cached_settings = self._default_settings.copy()
                print(f"✅ Using default settings: {_cached_settings}")
                return _cached_settings
            finally:
                # Always close storage connection
                try:
                    self.storage.close()
                except:
                    pass
    
    async def save_chat_settings(self, settings: Dict[str, Any]) -> None:
        """
        Save chat settings to Neo4j database.

        Args:
            settings: Dictionary containing chat settings to save
        """
        global _cached_settings

        try:
            # Connect to storage
            self.storage.connect()

            # Save each setting to database
            for key, value in settings.items():
                db_key = f"chat_{key}"
                db_value = str(value)
                self.storage.create_or_update_setting(db_key, db_value)

            # Update cache
            _cached_settings = settings.copy()
            print(f"✅ Saved chat settings to database: {settings}")

        except Exception as e:
            print(f"❌ Could not save settings to database: {e}")
            raise e
        finally:
            # Always close storage connection
            try:
                self.storage.close()
            except:
                pass
    
    def clear_cache(self) -> None:
        """Clear the settings cache to force reload from database."""
        global _cached_settings
        _cached_settings = None
        print("✅ Settings cache cleared")


# Global settings service instance
_settings_service: Optional[SettingsService] = None


def get_settings_service() -> SettingsService:
    """Get or create the global settings service instance."""
    global _settings_service
    if _settings_service is None:
        _settings_service = SettingsService()
    return _settings_service
