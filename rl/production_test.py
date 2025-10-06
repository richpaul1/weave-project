#!/usr/bin/env python3
"""
Production-ready test script for Weave Multimodal Agent.
Uses the optimized system prompt that ensures image inclusion.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('../.env.local')
OPENPIPE_API_KEY = os.getenv('OPEN_PIPE_API_KEY')

from openpipe import OpenAI

# Initialize client
client = OpenAI(openpipe={"api_key": OPENPIPE_API_KEY})

# Production system prompt (optimized for image inclusion)
PRODUCTION_SYSTEM_PROMPT = """You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework.

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

def query_weave_agent(user_query, temperature=0.3, max_tokens=800):
    """
    Query the Weave multimodal agent with optimized settings.
    
    Args:
        user_query: The user's question
        temperature: Sampling temperature (0.3 recommended for factual responses)
        max_tokens: Maximum response length
    
    Returns:
        Response text
    """
    completion = client.chat.completions.create(
        model="openpipe:multimodal-agent-v1",
        messages=[
            {"role": "system", "content": PRODUCTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_query}
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        openpipe={
            "tags": {
                "environment": "production",
                "version": "v1"
            }
        }
    )
    
    return completion.choices[0].message.content


if __name__ == "__main__":
    print("🚀 Weave Multimodal Agent - Production Test")
    print("="*80)
    print(f"\nModel: openpipe:multimodal-agent-v1")
    print(f"Temperature: 0.3 (factual responses)")
    print(f"System Prompt: Optimized for image inclusion")
    print("\n" + "="*80)
    
    # Production test cases
    test_cases = [
        {
            "query": "How do I trace my LLM calls with Weave?",
            "expected": "Text explanation + trace UI screenshot"
        },
        {
            "query": "What is a Weave Dataset and how do I use it?",
            "expected": "Dataset explanation + dataset UI screenshot"
        },
        {
            "query": "Show me how to use the evaluation playground",
            "expected": "Playground guide + playground screenshot"
        },
        {
            "query": "How do I use weave.Model to track my models?",
            "expected": "Model tracking explanation + model UI screenshot"
        }
    ]
    
    results = []
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n{'='*80}")
        print(f"📝 Test {i}/{len(test_cases)}")
        print(f"{'='*80}")
        print(f"\n💬 Query: {test['query']}")
        print(f"🎯 Expected: {test['expected']}")
        print(f"\n⏳ Calling model...")
        
        try:
            response = query_weave_agent(test['query'])
            
            # Check for images
            has_image = '![' in response and '](' in response
            
            # Extract images
            import re
            images = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', response)
            
            # Store results
            results.append({
                "test": i,
                "query": test['query'],
                "has_image": has_image,
                "image_count": len(images),
                "word_count": len(response.split()),
                "success": has_image  # Success = includes at least one image
            })
            
            print(f"\n✅ Response received:")
            print(f"\n{'-'*80}")
            print(response)
            print(f"{'-'*80}")
            
            print(f"\n📊 Analysis:")
            print(f"   - Word count: {len(response.split())}")
            print(f"   - Includes images: {'✅ YES' if has_image else '❌ NO'}")
            print(f"   - Image count: {len(images)}")
            
            if images:
                print(f"\n📸 Images:")
                for alt, url in images:
                    print(f"   - {alt}")
                    print(f"     URL: {url}")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            results.append({
                "test": i,
                "query": test['query'],
                "has_image": False,
                "image_count": 0,
                "word_count": 0,
                "success": False
            })
    
    # Summary
    print(f"\n\n{'='*80}")
    print("📊 PRODUCTION TEST SUMMARY")
    print(f"{'='*80}")
    
    total_tests = len(results)
    successful_tests = sum(1 for r in results if r['success'])
    success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
    
    print(f"\nTotal tests: {total_tests}")
    print(f"Successful (with images): {successful_tests}")
    print(f"Success rate: {success_rate:.1f}%")
    
    print(f"\n{'='*80}")
    
    if success_rate >= 75:
        print("✅ PASS: Model is production-ready!")
        print("\n💡 Next steps:")
        print("   1. Deploy to production")
        print("   2. Monitor performance with Weave")
        print("   3. Collect user feedback")
    elif success_rate >= 50:
        print("⚠️  PARTIAL: Model works but needs improvement")
        print("\n💡 Recommendations:")
        print("   1. Retrain with more epochs (try 10)")
        print("   2. Use higher learning rate (5e-5)")
        print("   3. Add more training examples")
    else:
        print("❌ FAIL: Model needs retraining")
        print("\n💡 Recommendations:")
        print("   1. Check training logs for errors")
        print("   2. Increase epochs to 10")
        print("   3. Increase learning rate to 5e-5")
        print("   4. Verify training data quality")
    
    print(f"\n{'='*80}\n")

