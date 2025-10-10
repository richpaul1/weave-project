# OpenAI + Weave Integration Test

This folder contains a simple test demonstrating OpenAI integration with Weave instrumentation, specifically showcasing the `postprocess_inputs` functionality for redacting sensitive information.

## Files

- `environment_utils.py` - Utility class for reading configuration from `.env.local`
- `test_openai_weave.py` - Main test file demonstrating OpenAI + Weave integration
- `requirements.txt` - Python dependencies
- `README.md` - This file

## Features Demonstrated

### 1. Environment Configuration
The `EnvironmentUtils` class reads configuration from the project's `.env.local` file:
- OpenAI API key and settings
- Weave/W&B configuration
- Validation of required environment variables

### 2. Weave Instrumentation with Input Redaction
The test demonstrates Weave's `autopatch_settings` with `postprocess_inputs`:

```python
def redact_inputs(inputs: dict) -> dict:
    if "email" in inputs:
        inputs["email"] = "[REDACTED]"
    return inputs

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
```

### 3. Sensitive Data Redaction
The `redact_inputs` function automatically redacts:
- Email addresses
- Passwords
- API keys
- Phone numbers
- SSNs
- Credit card numbers

### 4. OpenAI Integration Testing
- Simple chat completion with sensitive data
- Token usage tracking
- Error handling

## Setup

1. **Install dependencies:**
   ```bash
   cd openapi
   pip install -r requirements.txt
   ```

2. **Ensure your `.env.local` file has the required keys:**
   ```
   OPEN_API_KEY=your-openai-api-key
   WANDB_API_KEY=your-wandb-api-key
   WANDB_PROJECT=your-project-name
   WANDB_ENTITY=your-wandb-entity
   ```

## Running the Test

```bash
cd openapi
python test_openai_weave.py
```

## Expected Output

The test will:
1. Load configuration from `.env.local`
2. Initialize Weave with input redaction
3. Initialize OpenAI client
4. Test the redaction functionality
5. Make an OpenAI API call with sensitive data
6. Show that sensitive information is redacted in Weave logs

## Viewing Results

After running the test, you can view the results in your Weave dashboard:
- Go to `https://wandb.ai/{your-entity}/{your-project}`
- Look for the OpenAI operations
- Verify that sensitive information has been redacted

## Key Benefits

1. **Privacy Protection**: Sensitive data is automatically redacted before logging
2. **Observability**: Full visibility into OpenAI API calls and performance
3. **Debugging**: Easy to trace issues with LLM interactions
4. **Compliance**: Helps meet data privacy requirements

## Customization

You can customize the `redact_inputs` function to:
- Add more sensitive field patterns
- Use regex for more sophisticated detection
- Apply different redaction strategies (partial masking, hashing, etc.)
- Add logging of redaction actions
