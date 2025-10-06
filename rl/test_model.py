#!/usr/bin/env python3
"""
Test script for the trained Weave multimodal agent model.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('../.env.local')

# Get API key
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')

if not OPENPIPE_API_KEY:
    print("❌ Error: OPEN_PIPE_API_KEY not found in .env.local")
    exit(1)

print(f"✅ Loaded OpenPipe API key: {OPENPIPE_API_KEY[:20]}...")

# Import OpenPipe
try:
    from openpipe import OpenAI
    print("✅ OpenPipe library imported successfully")
except ImportError:
    print("❌ OpenPipe library not found. Installing...")
    import subprocess
    subprocess.run(["pip", "install", "openpipe"], check=True)
    from openpipe import OpenAI
    print("✅ OpenPipe library installed and imported")

# Create client
client = OpenAI(
    openpipe={"api_key": OPENPIPE_API_KEY}
)

print("\n" + "="*80)
print("🧪 Testing Weave Multimodal Agent Model")
print("="*80 + "\n")

# Test cases
test_cases = [
    {
        "name": "Test 1: Feedback Table",
        "user_message": "View and delete feedback from the call details feedback table. Delete feedback by clicking the trashcan icon in the rightmost column of the appropriate feedback row.",
        "expected": "Should return text explanation + relevant screenshot"
    },
    {
        "name": "Test 2: Tracing LLM Calls",
        "user_message": "How do I trace my LLM calls with Weave?",
        "expected": "Should return text explanation + trace UI screenshot"
    },
    {
        "name": "Test 3: Weave Dataset",
        "user_message": "What is a Weave Dataset?",
        "expected": "Should return text explanation + dataset visualization"
    },
    {
        "name": "Test 4: Evaluation Playground",
        "user_message": "Show me how to use the evaluation playground",
        "expected": "Should return text guide + playground screenshot"
    }
]

# System prompt (same as training)
system_prompt = "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"

# Run tests
for i, test in enumerate(test_cases, 1):
    print(f"\n{'='*80}")
    print(f"📝 {test['name']}")
    print(f"{'='*80}")
    print(f"\n💬 User Query:")
    print(f"   {test['user_message'][:100]}...")
    print(f"\n🎯 Expected:")
    print(f"   {test['expected']}")
    print(f"\n⏳ Calling model...")
    
    try:
        completion = client.chat.completions.create(
            model="openpipe:multimodal-agent-v1",  # Your trained model
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": test['user_message']
                }
            ],
            temperature=0.3,  # Low temperature for consistent, factual responses
            max_tokens=2000,
            openpipe={
                "tags": {
                    "prompt_id": f"test_{i}",
                    "test_name": test['name']
                }
            },
        )
        
        response = completion.choices[0].message.content
        
        print(f"\n✅ Response received:")
        print(f"\n{'-'*80}")
        print(response)
        print(f"{'-'*80}")
        
        # Check if response contains images
        has_image = '![' in response and '](' in response
        if has_image:
            print(f"\n🖼️  Response includes image(s): ✅")
        else:
            print(f"\n🖼️  Response includes image(s): ❌")
        
        # Count words
        word_count = len(response.split())
        print(f"📊 Response length: {word_count} words")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print(f"\nFull error details:")
        import traceback
        traceback.print_exc()
    
    print(f"\n{'='*80}\n")

print("\n" + "="*80)
print("🎉 Testing Complete!")
print("="*80)
print("\n📊 Summary:")
print("   - Check if responses include relevant images")
print("   - Verify text quality and accuracy")
print("   - Compare with base model performance")
print("\n💡 Next steps:")
print("   - If quality is good: Deploy to production")
print("   - If quality is poor: Retrain with more epochs or better data")
print("   - Monitor performance with Weave tracking")

