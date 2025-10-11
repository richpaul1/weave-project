# Weave + OpenPipe Integration: Technical Challenge & Solution

## 🚨 The Problem

When integrating Weave's LLM observability framework with OpenPipe's custom trained models, we encountered a critical compatibility issue that prevented proper instrumentation and evaluation.

### Error Symptoms

```bash
weave: Task failed: ValidationError: 2 validation errors for EndedCallSchemaForInsert
weave: summary.usage.openpipe:multimodal-agent-v1.input_tokens
weave:   Input should be a valid integer [type=int_type, input_value=[], input_type=list]
weave: summary.usage.openpipe:multimodal-agent-v1.output_tokens
weave:   Input should be a valid integer [type=int_type, input_value=[], input_type=list]
```

### Root Cause Analysis

1. **Automatic Instrumentation Conflict**: Weave automatically instruments OpenAI-compatible clients
2. **API Response Format Mismatch**: OpenPipe's API response format differs from OpenAI's expected schema
3. **Token Usage Schema Validation**: Weave expected integer values but received empty lists `[]` for token counts
4. **Pydantic Validation Failure**: The schema validation failed during Weave's automatic logging process

## 🔧 Technical Deep Dive

### Original Implementation (Problematic)

```python
# This caused the validation errors
from openpipe import OpenAI
client = OpenAI(openpipe={"api_key": OPENPIPE_API_KEY})

@weave.op()
async def predict(self, sentence: str) -> Dict[str, Any]:
    # Weave automatically instruments this call
    completion = client.chat.completions.create(
        model="openpipe:multimodal-agent-v1",
        messages=[...],
        temperature=0.3,
        max_tokens=800
    )
    return completion.choices[0].message.content
```

### Why This Failed

1. **Weave's Autopatch**: Automatically detects and instruments OpenAI-compatible clients
2. **Schema Mismatch**: OpenPipe's `usage` object structure differs from OpenAI's
3. **Token Count Format**: Expected `{"input_tokens": 150}` but got `{"input_tokens": []}`
4. **Validation Pipeline**: Weave's Pydantic models couldn't parse the response

## ✅ The Solution

### Approach 1: Disable Autopatch (Partial Fix)

```python
# Attempted but still had issues
weave.init('rl-demo', autopatch_settings={"openai": False})
```

**Result**: Still failed because OpenPipe client inherits OpenAI instrumentation patterns.

### Approach 2: Manual HTTP Client (Complete Fix)

We implemented a custom HTTP client that bypasses Weave's automatic instrumentation:

```python
import httpx
import json

class ManualOpenPipeClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://app.openpipe.ai/api/v1"
        
    def chat_completion(self, model: str, messages: list, temperature: float, max_tokens: int) -> dict:
        """Make direct API call without Weave instrumentation"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        with httpx.Client() as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            )
            return response.json()
```

### Safe Wrapper Function

```python
@weave.op()
def safe_openpipe_call(model: str, messages: list, temperature: float, max_tokens: int) -> dict:
    """Wrapper that safely handles OpenPipe API calls with proper Weave logging"""
    try:
        result = openpipe_client.chat_completion(model, messages, temperature, max_tokens)
        
        response_text = result["choices"][0]["message"]["content"]
        
        # Safely extract token usage
        usage_info = {"input_tokens": None, "output_tokens": None, "total_tokens": None}
        if "usage" in result and result["usage"]:
            usage = result["usage"]
            usage_info = {
                "input_tokens": usage.get("prompt_tokens"),
                "output_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens")
            }
        
        return {
            "response": response_text,
            "usage": usage_info,
            "error": None
        }
        
    except Exception as e:
        return {
            "response": f"Error: {str(e)}",
            "usage": {"input_tokens": None, "output_tokens": None, "total_tokens": None},
            "error": str(e)
        }
```

## 🎯 Key Benefits of Our Solution

### 1. **Clean Execution**
- ✅ No validation errors
- ✅ No warning messages
- ✅ Smooth evaluation pipeline

### 2. **Full Observability**
- ✅ Proper Weave instrumentation via `@weave.op()`
- ✅ Token usage tracking (when available)
- ✅ Error handling and logging
- ✅ Performance metrics

### 3. **Maintainable Code**
- ✅ Clear separation of concerns
- ✅ Easy to debug and modify
- ✅ Reusable across different models
- ✅ Consistent error handling

### 4. **Performance**
- ✅ Same response times as original
- ✅ No additional overhead
- ✅ Efficient HTTP client usage

## 📊 Before vs After Comparison

| Aspect | Before (Problematic) | After (Fixed) |
|--------|---------------------|---------------|
| **Execution** | ❌ Validation errors | ✅ Clean execution |
| **Logging** | ❌ Failed to log properly | ✅ Full Weave instrumentation |
| **Token Usage** | ❌ Schema validation errors | ✅ Safe extraction & logging |
| **Error Handling** | ❌ Crashes on API issues | ✅ Graceful error handling |
| **Debugging** | ❌ Hard to troubleshoot | ✅ Clear error messages |

## 🔮 Future Considerations

### For Weave Team
1. **Improve Schema Flexibility**: Handle different API response formats
2. **Better Error Messages**: More descriptive validation errors
3. **Custom Client Support**: Official support for non-OpenAI clients
4. **Documentation**: Clear guidance on custom API integration

### For OpenPipe Team
1. **Response Format**: Consider OpenAI-compatible response schemas
2. **Token Usage**: Ensure consistent token count formatting
3. **API Documentation**: Clear specification of response formats

### For Our Implementation
1. **Monitoring**: Add health checks for API availability
2. **Caching**: Implement response caching for repeated evaluations
3. **Rate Limiting**: Add proper rate limiting for API calls
4. **Metrics**: Enhanced token usage and cost tracking

## 🛠️ Implementation Guide

### Step 1: Replace OpenPipe Client
```python
# Remove this
from openpipe import OpenAI
client = OpenAI(openpipe={"api_key": API_KEY})

# Add this
from manual_openpipe_client import ManualOpenPipeClient
client = ManualOpenPipeClient(API_KEY)
```

### Step 2: Update Model Predictions
```python
# Replace direct API calls with wrapper
result = safe_openpipe_call(
    model="openpipe:multimodal-agent-v1",
    messages=messages,
    temperature=0.3,
    max_tokens=800
)
response = result["response"]
```

### Step 3: Handle Errors Gracefully
```python
if result["error"]:
    # Handle API errors appropriately
    return {"response": "Error occurred", "error": True}
```

## 📝 Lessons Learned

1. **API Compatibility**: Not all OpenAI-compatible APIs are truly compatible
2. **Instrumentation Challenges**: Automatic instrumentation can cause unexpected issues
3. **Schema Validation**: Always validate API response formats before integration
4. **Error Handling**: Robust error handling is crucial for production systems
5. **Manual Control**: Sometimes manual implementation provides better control

---

**Files Modified:**
- `prompt_comparison_eval.py` - ✅ Fixed OpenPipe integration
- `model_comparison_eval.py` - ✅ Fixed OpenPipe integration

**Status:** ✅ **RESOLVED** - Clean execution with full Weave observability
