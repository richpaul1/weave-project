#!/usr/bin/env python3
"""
Test multiple queries to see if model includes images.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('../.env.local')

# Get API key
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')

from openpipe import OpenAI

client = OpenAI(
    openpipe={"api_key": OPENPIPE_API_KEY}
)

system_prompt = "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"

# Test queries that should definitely have images in training data
test_queries = [
    "How do I trace my LLM calls with Weave?",
    "What is a Weave Dataset?",
    "Show me the evaluation playground",
    "How do I use weave.Model?",
    "Explain Weave tracing"
]

print("🧪 Testing model with multiple queries\n")
print("="*80)

for i, query in enumerate(test_queries, 1):
    print(f"\n📝 Test {i}: {query}")
    print("-"*80)
    
    try:
        completion = client.chat.completions.create(
            model="openpipe:multimodal-agent-v1",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.3,
            max_tokens=500
        )
        
        response = completion.choices[0].message.content
        has_image = '![' in response and '](' in response
        
        print(f"\n✅ Response ({len(response.split())} words):")
        print(response[:200] + "..." if len(response) > 200 else response)
        print(f"\n🖼️  Includes image: {'✅ YES' if has_image else '❌ NO'}")
        
        if has_image:
            # Extract image URLs
            import re
            images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response)
            print(f"📸 Images found: {len(images)}")
            for alt, url in images:
                print(f"   - {alt}: {url[:60]}...")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("-"*80)

print("\n" + "="*80)
print("🎯 Summary: Check how many responses included images")
print("="*80)

