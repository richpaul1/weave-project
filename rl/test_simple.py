#!/usr/bin/env python3
"""
Simple test script for the trained Weave multimodal agent model.
Based on the user's example code.
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

print(f"✅ Using OpenPipe API key: {OPENPIPE_API_KEY[:20]}...")

# pip install openpipe
from openpipe import OpenAI

client = OpenAI(
    openpipe={"api_key": OPENPIPE_API_KEY}
)

print("\n🧪 Testing model: openpipe:multimodal-agent-v1\n")

completion = client.chat.completions.create(
    model="openpipe:multimodal-agent-v1",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
        },
        {
            "role": "user",
            "content": "View and delete feedback from the call details feedback table. Delete feedback by clicking the trashcan icon in the rightmost column of the appropriate feedback row."
        }
    ],
    temperature=0,
    openpipe={
        "tags": {
            "prompt_id": "counting",
            "any_key": "any_value"
        }
    },
)

print("📝 Response:")
print("="*80)
print(completion.choices[0].message.content)
print("="*80)

# Check if response includes images
response = completion.choices[0].message.content
has_image = '![' in response and '](' in response

print(f"\n🖼️  Includes image: {'✅ Yes' if has_image else '❌ No'}")
print(f"📊 Length: {len(response.split())} words")

