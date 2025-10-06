#!/usr/bin/env python3
"""
Convert training data to OpenPipe format for web platform upload.

OpenPipe expects JSONL format with messages in OpenAI chat format:
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
"""

import json
from pathlib import Path

def convert_to_openpipe_format(input_file: str, output_file: str):
    """Convert training data to OpenPipe JSONL format"""

    # Load training data
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"📥 Loaded {len(data)} training examples from {input_file}")

    # Convert to OpenPipe format
    openpipe_data = []

    system_prompt = "You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"

    # Split data into train/test (90/10)
    train_count = int(len(data) * 0.9)

    for idx, item in enumerate(data):
        # Determine split
        split = "TRAIN" if idx < train_count else "TEST"

        # Create user query from context
        # Use text_before as the question context
        user_query = item['text_before'].strip()
        if not user_query:
            user_query = f"Explain this concept from the Weave documentation."

        # Create assistant response with text and image
        assistant_response = item['text_after'].strip()

        # Add image if present
        if item['image_path']:
            if assistant_response:
                assistant_response += f"\n\n![{item['image_alt']}]({item['image_path']})"
            else:
                # If no text_after, create a response around the image
                assistant_response = f"Here's a visual representation:\n\n![{item['image_alt']}]({item['image_path']})"

        # Skip if we have no meaningful response
        if not assistant_response:
            continue

        # Create OpenPipe format (matching their example exactly)
        # Note: All metadata values must be strings per OpenPipe requirements
        # Note: Removed 'split' field - let OpenPipe auto-split 90/10
        openpipe_example = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query},
                {"role": "assistant", "content": assistant_response}
            ],
            "metadata": {
                "source_file": str(item['source_file']),
                "confidence_score": str(item['confidence_score']),
                "training_id": str(item['training_id'])
            }
        }

        openpipe_data.append(openpipe_example)
    
    # Write to JSONL file (one JSON object per line)
    with open(output_file, 'w', encoding='utf-8') as f:
        for example in openpipe_data:
            f.write(json.dumps(example) + '\n')
    
    print(f"✅ Converted {len(openpipe_data)} examples to OpenPipe format")
    print(f"💾 Saved to: {output_file}")
    
    # Print statistics
    print(f"\n📊 Statistics:")
    print(f"   Total examples: {len(openpipe_data)}")
    print(f"   Examples with images: {sum(1 for item in data if item['image_path'])}")
    print(f"   Average confidence: {sum(item['confidence_score'] for item in data) / len(data):.2f}")
    
    # Print first example
    print(f"\n📝 First example preview:")
    first = openpipe_data[0]
    print(f"   User: {first['messages'][1]['content'][:100]}...")
    print(f"   Assistant: {first['messages'][2]['content'][:100]}...")
    
    return output_file

if __name__ == "__main__":
    input_file = "training_data.json"
    output_file = "openpipe_training_data.jsonl"
    
    convert_to_openpipe_format(input_file, output_file)
    
    print(f"\n🚀 Next steps:")
    print(f"   1. Go to https://openpipe.ai")
    print(f"   2. Sign in with your account")
    print(f"   3. Create a new fine-tuning job")
    print(f"   4. Upload: {output_file}")
    print(f"   5. Configure training parameters")
    print(f"   6. Start training!")

