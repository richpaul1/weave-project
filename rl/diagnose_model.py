#!/usr/bin/env python3
"""
Diagnostic script to understand what the model learned.
"""

import os
import json
from dotenv import load_dotenv

load_dotenv('../.env.local')
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')

from openpipe import OpenAI

client = OpenAI(openpipe={"api_key": OPENPIPE_API_KEY})

print("🔍 Diagnostic Tests for Multimodal Agent\n")
print("="*80)

# Test 1: Direct prompt for image
print("\n📝 Test 1: Explicitly ask for an image")
print("-"*80)

completion = client.chat.completions.create(
    model="openpipe:multimodal-agent-v1",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
        },
        {
            "role": "user",
            "content": "Explain Weave tracing and include a screenshot showing the trace UI."
        }
    ],
    temperature=0,
    max_tokens=500
)

response1 = completion.choices[0].message.content
print(response1[:300])
print(f"\n🖼️  Has image: {'✅ YES' if '![' in response1 else '❌ NO'}")

# Test 2: Use exact training example
print("\n\n📝 Test 2: Use text from actual training data")
print("-"*80)

# Load a training example
with open('training_data.json') as f:
    training_data = json.load(f)

# Get first example
example = training_data[0]
print(f"Using training example from: {example['source_file']}")
print(f"Text before: {example['text_before'][:100]}...")

completion = client.chat.completions.create(
    model="openpipe:multimodal-agent-v1",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
        },
        {
            "role": "user",
            "content": example['text_before']
        }
    ],
    temperature=0,
    max_tokens=500
)

response2 = completion.choices[0].message.content
print(f"\nExpected to include: {example['image_path']}")
print(f"\nActual response:")
print(response2[:300])
print(f"\n🖼️  Has image: {'✅ YES' if '![' in response2 else '❌ NO'}")

# Test 3: Check if model knows about images at all
print("\n\n📝 Test 3: Ask model about its capabilities")
print("-"*80)

completion = client.chat.completions.create(
    model="openpipe:multimodal-agent-v1",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
        },
        {
            "role": "user",
            "content": "Can you include images in your responses? If yes, show me an example."
        }
    ],
    temperature=0,
    max_tokens=200
)

response3 = completion.choices[0].message.content
print(response3)
print(f"\n🖼️  Has image: {'✅ YES' if '![' in response3 else '❌ NO'}")

# Test 4: Try with higher temperature
print("\n\n📝 Test 4: Same query with higher temperature (0.8)")
print("-"*80)

completion = client.chat.completions.create(
    model="openpipe:multimodal-agent-v1",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
        },
        {
            "role": "user",
            "content": "How do I trace my LLM calls with Weave?"
        }
    ],
    temperature=0.8,
    max_tokens=500
)

response4 = completion.choices[0].message.content
print(response4[:300])
print(f"\n🖼️  Has image: {'✅ YES' if '![' in response4 else '❌ NO'}")

print("\n" + "="*80)
print("🎯 Diagnosis Summary")
print("="*80)
print("\nIf NO images in any test:")
print("  → Model didn't learn to generate images")
print("  → Need to retrain with:")
print("     - More epochs (try 10)")
print("     - Higher learning rate (try 5e-5)")
print("     - Or check training logs for errors")
print("\nIf images only in Test 2:")
print("  → Model memorized training data but didn't generalize")
print("  → Need more diverse training data")
print("\nIf images in Test 3 or 4:")
print("  → Model knows about images but needs stronger prompting")
print("  → Adjust system prompt or temperature")

