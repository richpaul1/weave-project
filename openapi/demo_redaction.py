#!/usr/bin/env python3
"""
Simple demonstration of Weave postprocess_inputs functionality
"""
import weave
from openai import OpenAI
from environment_utils import get_env_utils
import tiktoken
encoding = tiktoken.encoding_for_model("gpt-4")



def redact_inputs(inputs: dict) -> dict:
    """
    Redact sensitive information from inputs before logging to Weave
    """
    redacted = inputs.copy()
    
    # Redact email addresses
    if "email" in redacted:
        redacted["email"] = "[REDACTED]"
    
    # Redact other sensitive fields
    sensitive_fields = ["password", "api_key", "token", "secret", "ssn", "credit_card"]
    for field in sensitive_fields:
        if field in redacted:
            redacted[field] = "[REDACTED]"
    
    return redacted


def main():
    """Main demonstration"""
    print("🔒 Weave Input Redaction Demo")
    print("=" * 40)
    
    # Load environment
    env_utils = get_env_utils()
    openai_config = env_utils.get_openai_config()
    weave_config = env_utils.get_weave_config()
    
    # Initialize Weave with input redaction
    project_name = f"{weave_config['entity']}/{weave_config['project']}"
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
    
    print(f"✓ Weave initialized with input redaction")
    print(f"  Project: {project_name}")
    
    # Initialize OpenAI
    client = OpenAI(api_key=openai_config["api_key"])
    print(f"✓ OpenAI client initialized")
    
    # Make a call with sensitive data
    print("\n📞 Making OpenAI call with sensitive data...")
    
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system", 
                "content": "You are a helpful assistant."
            },
            {
                "role": "user", 
                "content": """
                Please create a welcome message for:
                - Email: john.doe@example.com
                - Password: secret123
                - API Key: sk-1234567890abcdef
                
                Keep it professional and don't include the sensitive data.
                """
            }
        ],
        max_tokens=150,
        temperature=0.7
    )

    text = "You are a helpful assistant."
    tokens = encoding.encode(text)
    print(f"Token count: {len(tokens)}")
    print(f"Tokens: {tokens}")
    
    print("✓ OpenAI call completed")
    # Print the full response object for inspection
    print(f"\n📋 Full Response Object:")
    print(f"  Response: {response}")
    print(f"\n💬 Message Content:")
    print(f"  {response.choices[0].message.content}")
    # Token usage breakdown:
    # - prompt_tokens: tokens in the input messages (system + user prompts)
    # - completion_tokens: tokens in the generated response
    # - total_tokens: sum of prompt_tokens + completion_tokens
    print(f"\n📊 Token Usage:")
    print(f"  Prompt tokens: {response.usage.prompt_tokens}")
    print(f"  Completion tokens: {response.usage.completion_tokens}")
    print(f"  Total tokens: {response.usage.total_tokens}")
    
    print(f"\n🔍 Check your Weave dashboard:")
    print(f"   https://wandb.ai/{weave_config['entity']}/{weave_config['project']}")
    print(f"   The sensitive data should be redacted in the logs!")


if __name__ == "__main__":
    main()
