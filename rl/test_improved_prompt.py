#!/usr/bin/env python3
"""
Test with improved system prompt that encourages image inclusion.
"""

import os
from dotenv import load_dotenv

load_dotenv('../.env.local')
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')

from openpipe import OpenAI

client = OpenAI(openpipe={"api_key": OPENPIPE_API_KEY})

# Original system prompt
original_prompt = "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"

# Improved system prompt (more explicit)
improved_prompt = """You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework.

IMPORTANT: Always include relevant screenshots and diagrams in your responses using markdown format: ![alt text](image_url)

When answering questions:
1. Provide clear text explanations
2. Include at least one relevant image/screenshot from the Weave documentation
3. Use the format: ![description](https://weave-docs.wandb.ai/assets/images/...)
4. Explain why the image is relevant

Example response format:
"Here's how to use Weave tracing:

[Your explanation here]

![Weave Trace UI](https://weave-docs.wandb.ai/assets/images/trace-example.png)

This screenshot shows the trace interface where you can see..."
"""

test_queries = [
    "How do I trace my LLM calls with Weave?",
    "What is a Weave Dataset?",
    "Show me the evaluation playground"
]

print("🧪 Testing with Improved System Prompt\n")
print("="*80)

for i, query in enumerate(test_queries, 1):
    print(f"\n📝 Test {i}: {query}")
    print("-"*80)
    
    # Test with improved prompt
    completion = client.chat.completions.create(
        model="openpipe:multimodal-agent-v1",
        messages=[
            {"role": "system", "content": improved_prompt},
            {"role": "user", "content": query}
        ],
        temperature=0.3,
        max_tokens=600
    )
    
    response = completion.choices[0].message.content
    has_image = '![' in response and '](' in response
    
    print(f"\n✅ Response:")
    print(response[:400] + "..." if len(response) > 400 else response)
    print(f"\n🖼️  Includes image: {'✅ YES' if has_image else '❌ NO'}")
    
    if has_image:
        import re
        images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response)
        print(f"📸 Images found: {len(images)}")
        for alt, url in images:
            print(f"   - {alt}: {url[:60]}...")
    
    print("-"*80)

print("\n" + "="*80)
print("🎯 Result: Check if improved prompt increases image inclusion")
print("="*80)

