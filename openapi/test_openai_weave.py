"""
Test OpenAI integration with Weave instrumentation and postprocess_inputs functionality
"""
import asyncio
import weave
from openai import OpenAI
from typing import Dict, Any
from environment_utils import get_env_utils


def redact_inputs(inputs: dict) -> dict:
    """
    Redact sensitive information from inputs before logging to Weave
    
    This function demonstrates the postprocess_inputs functionality
    that can be used to sanitize data before it's logged to Weave.
    """
    # Create a copy to avoid modifying the original
    redacted = inputs.copy()
    
    # Redact email addresses
    if "email" in redacted:
        redacted["email"] = "[REDACTED]"
    
    # Redact other sensitive fields
    sensitive_fields = ["password", "api_key", "token", "secret", "ssn", "credit_card"]
    for field in sensitive_fields:
        if field in redacted:
            redacted[field] = "[REDACTED]"
    
    # Redact phone numbers (simple pattern)
    for key, value in redacted.items():
        if isinstance(value, str) and any(char.isdigit() for char in value):
            # Simple phone number detection
            if len(value.replace("-", "").replace("(", "").replace(")", "").replace(" ", "")) >= 10:
                if value.count("-") >= 2 or "(" in value:
                    redacted[key] = "[REDACTED_PHONE]"
    
    return redacted


class OpenAIWeaveTest:
    """Test class for OpenAI integration with Weave instrumentation"""
    
    def __init__(self):
        self.env_utils = get_env_utils()
        self.openai_config = self.env_utils.get_openai_config()
        self.weave_config = self.env_utils.get_weave_config()
        self.client = None
        
    def setup_weave(self):
        """Initialize Weave with autopatch settings including postprocess_inputs"""
        if not self.weave_config["api_key"]:
            print("⚠ WANDB_API_KEY not set. Weave tracking will be disabled.")
            return False
            
        try:
            # Build project name
            project_name = f"{self.weave_config['entity']}/{self.weave_config['project']}"
            
            # Initialize Weave with autopatch settings
            weave.init(
                project_name,
                autopatch_settings={
                    "openai": {
                        "op_settings": {
                            "postprocess_inputs": redact_inputs,
                        }
                    }
                }
            )
            
            print(f"✓ Weave initialized successfully")
            print(f"  Project: {project_name}")
            print(f"  Postprocess inputs: Enabled (redact_inputs function)")
            return True
            
        except Exception as e:
            print(f"✗ Failed to initialize Weave: {e}")
            return False
    
    def setup_openai(self):
        """Initialize OpenAI client"""
        if not self.openai_config["api_key"]:
            print("✗ OPEN_API_KEY not set. Cannot initialize OpenAI client.")
            return False
            
        try:
            self.client = OpenAI(api_key=self.openai_config["api_key"])
            print(f"✓ OpenAI client initialized")
            print(f"  Model: {self.openai_config['model']}")
            return True
            
        except Exception as e:
            print(f"✗ Failed to initialize OpenAI client: {e}")
            return False
    
    @weave.op()
    def test_simple_completion(self) -> Dict[str, Any]:
        """Test a simple completion with sensitive data to see redaction in action"""
        if not self.client:
            return {"error": "OpenAI client not initialized"}
        
        # Create a prompt with sensitive information
        test_prompt = """
        Please help me with the following user information:
        - Name: John Doe
        - Email: john.doe@example.com
        - Phone: (555) 123-4567
        - Password: secret123
        - API Key: sk-1234567890abcdef
        
        Generate a welcome message for this user.
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.openai_config["model"],
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": test_prompt}
                ],
                max_tokens=self.openai_config["max_tokens"],
                temperature=self.openai_config["temperature"]
            )
            
            result = {
                "success": True,
                "response": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "model": response.model
            }
            
            print("✓ Simple completion test successful")
            print(f"  Tokens used: {result['usage']['total_tokens']}")
            
            return result
            
        except Exception as e:
            print(f"✗ Simple completion test failed: {e}")
            return {"error": str(e)}
    
    @weave.op()
    def test_redaction_functionality(self) -> Dict[str, Any]:
        """Test the redaction functionality specifically"""
        print("\n" + "="*50)
        print("TESTING REDACTION FUNCTIONALITY")
        print("="*50)
        
        # Test data with sensitive information
        test_inputs = {
            "email": "user@example.com",
            "password": "secret123",
            "phone": "(555) 123-4567",
            "api_key": "sk-1234567890abcdef",
            "name": "John Doe",
            "message": "Hello world",
            "ssn": "123-45-6789",
            "credit_card": "4111-1111-1111-1111"
        }
        
        print("Original inputs:")
        for key, value in test_inputs.items():
            print(f"  {key}: {value}")
        
        # Apply redaction
        redacted = redact_inputs(test_inputs)
        
        print("\nRedacted inputs:")
        for key, value in redacted.items():
            print(f"  {key}: {value}")
        
        # Verify redaction worked
        redaction_results = {
            "email_redacted": redacted["email"] == "[REDACTED]",
            "password_redacted": redacted["password"] == "[REDACTED]",
            "api_key_redacted": redacted["api_key"] == "[REDACTED]",
            "name_preserved": redacted["name"] == test_inputs["name"],
            "message_preserved": redacted["message"] == test_inputs["message"],
            "ssn_redacted": redacted["ssn"] == "[REDACTED]",
            "credit_card_redacted": redacted["credit_card"] == "[REDACTED]"
        }
        
        print("\nRedaction verification:")
        for check, passed in redaction_results.items():
            status = "✓" if passed else "✗"
            print(f"  {status} {check}")
        
        all_passed = all(redaction_results.values())
        print(f"\nOverall redaction test: {'✓ PASSED' if all_passed else '✗ FAILED'}")
        
        return {
            "test_inputs": test_inputs,
            "redacted_inputs": redacted,
            "verification": redaction_results,
            "all_passed": all_passed
        }
    
    async def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("OPENAI + WEAVE INTEGRATION TEST")
        print("="*60)
        
        # Print environment summary
        self.env_utils.print_config_summary()
        
        print("\n" + "="*50)
        print("INITIALIZING SERVICES")
        print("="*50)
        
        # Setup Weave
        weave_ok = self.setup_weave()
        
        # Setup OpenAI
        openai_ok = self.setup_openai()
        
        if not openai_ok:
            print("\n✗ Cannot proceed without OpenAI client")
            return
        
        print("\n" + "="*50)
        print("RUNNING TESTS")
        print("="*50)
        
        # Test 1: Redaction functionality
        redaction_result = self.test_redaction_functionality()
        
        # Test 2: Simple completion (this will be logged to Weave with redacted inputs)
        print("\n" + "="*50)
        print("TESTING OPENAI COMPLETION WITH WEAVE LOGGING")
        print("="*50)
        
        completion_result = self.test_simple_completion()
        
        print("\n" + "="*50)
        print("TEST SUMMARY")
        print("="*50)
        
        print(f"Weave initialized: {'✓' if weave_ok else '✗'}")
        print(f"OpenAI client initialized: {'✓' if openai_ok else '✗'}")
        print(f"Redaction test: {'✓' if redaction_result.get('all_passed') else '✗'}")
        print(f"Completion test: {'✓' if completion_result.get('success') else '✗'}")
        
        if weave_ok:
            print(f"\n🔍 Check your Weave dashboard at:")
            print(f"   https://wandb.ai/{self.weave_config['entity']}/{self.weave_config['project']}")
            print(f"   You should see the OpenAI calls with redacted sensitive information!")
        
        return {
            "weave_initialized": weave_ok,
            "openai_initialized": openai_ok,
            "redaction_test": redaction_result,
            "completion_test": completion_result
        }


async def main():
    """Main test function"""
    test = OpenAIWeaveTest()
    results = await test.run_all_tests()
    return results


if __name__ == "__main__":
    # Run the test
    asyncio.run(main())
