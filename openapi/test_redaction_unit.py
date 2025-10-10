"""
Unit tests for the redaction functionality
"""
import pytest
from test_openai_weave import redact_inputs
from environment_utils import EnvironmentUtils


class TestRedactionFunctionality:
    """Unit tests for input redaction"""
    
    def test_email_redaction(self):
        """Test that email addresses are redacted"""
        inputs = {"email": "user@example.com", "name": "John"}
        result = redact_inputs(inputs)
        assert result["email"] == "[REDACTED]"
        assert result["name"] == "John"  # Should be preserved
    
    def test_password_redaction(self):
        """Test that passwords are redacted"""
        inputs = {"password": "secret123", "username": "john"}
        result = redact_inputs(inputs)
        assert result["password"] == "[REDACTED]"
        assert result["username"] == "john"  # Should be preserved
    
    def test_api_key_redaction(self):
        """Test that API keys are redacted"""
        inputs = {"api_key": "sk-1234567890abcdef", "model": "gpt-4"}
        result = redact_inputs(inputs)
        assert result["api_key"] == "[REDACTED]"
        assert result["model"] == "gpt-4"  # Should be preserved
    
    def test_multiple_sensitive_fields(self):
        """Test redaction of multiple sensitive fields"""
        inputs = {
            "email": "user@example.com",
            "password": "secret123",
            "api_key": "sk-1234567890abcdef",
            "token": "abc123",
            "secret": "mysecret",
            "ssn": "123-45-6789",
            "credit_card": "4111-1111-1111-1111",
            "name": "John Doe",
            "message": "Hello world"
        }
        result = redact_inputs(inputs)
        
        # Check that sensitive fields are redacted
        sensitive_fields = ["email", "password", "api_key", "token", "secret", "ssn", "credit_card"]
        for field in sensitive_fields:
            assert result[field] == "[REDACTED]", f"{field} should be redacted"
        
        # Check that non-sensitive fields are preserved
        assert result["name"] == "John Doe"
        assert result["message"] == "Hello world"
    
    def test_phone_number_redaction(self):
        """Test that phone numbers are redacted"""
        test_cases = [
            {"phone": "(555) 123-4567", "expected": "[REDACTED_PHONE]"},
            {"phone": "555-123-4567", "expected": "[REDACTED_PHONE]"},
            {"contact": "(123) 456-7890", "expected": "[REDACTED_PHONE]"},
            {"short_number": "123", "expected": "123"},  # Should not be redacted
            {"text": "Call me", "expected": "Call me"}  # Should not be redacted
        ]
        
        for case in test_cases:
            inputs = {list(case.keys())[0]: case[list(case.keys())[0]]}
            result = redact_inputs(inputs)
            field_name = list(case.keys())[0]
            assert result[field_name] == case["expected"], f"Failed for {case}"
    
    def test_original_inputs_not_modified(self):
        """Test that the original inputs dictionary is not modified"""
        original_inputs = {
            "email": "user@example.com",
            "password": "secret123",
            "name": "John Doe"
        }
        original_copy = original_inputs.copy()
        
        result = redact_inputs(original_inputs)
        
        # Original should be unchanged
        assert original_inputs == original_copy
        
        # Result should have redacted values
        assert result["email"] == "[REDACTED]"
        assert result["password"] == "[REDACTED]"
        assert result["name"] == "John Doe"
    
    def test_empty_inputs(self):
        """Test redaction with empty inputs"""
        result = redact_inputs({})
        assert result == {}
    
    def test_no_sensitive_data(self):
        """Test redaction when no sensitive data is present"""
        inputs = {"name": "John", "age": 30, "city": "New York"}
        result = redact_inputs(inputs)
        assert result == inputs


class TestEnvironmentUtils:
    """Unit tests for EnvironmentUtils"""
    
    def test_environment_utils_initialization(self):
        """Test that EnvironmentUtils can be initialized"""
        env_utils = EnvironmentUtils()
        assert env_utils is not None
        assert env_utils.env_file_path.name == ".env.local"
    
    def test_get_openai_config(self):
        """Test getting OpenAI configuration"""
        env_utils = EnvironmentUtils()
        config = env_utils.get_openai_config()
        
        assert "api_key" in config
        assert "model" in config
        assert "max_tokens" in config
        assert "temperature" in config
        
        # Check types
        assert isinstance(config["max_tokens"], int)
        assert isinstance(config["temperature"], float)
    
    def test_get_weave_config(self):
        """Test getting Weave configuration"""
        env_utils = EnvironmentUtils()
        config = env_utils.get_weave_config()
        
        assert "enabled" in config
        assert "project" in config
        assert "api_key" in config
        assert "entity" in config
        
        # Check types
        assert isinstance(config["enabled"], bool)
    
    def test_validate_required_keys(self):
        """Test validation of required environment keys"""
        env_utils = EnvironmentUtils()
        validation = env_utils.validate_required_keys()
        
        assert "OPEN_API_KEY" in validation
        assert "WANDB_API_KEY" in validation
        assert "WANDB_PROJECT" in validation
        
        # All values should be boolean
        for key, value in validation.items():
            assert isinstance(value, bool)


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v"])
