#!/usr/bin/env python3
"""
Convert OpenPipe training data to Ollama-compatible format.
Transforms the training data structure while preserving multimodal content.
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Any

def load_training_data() -> List[Dict[str, Any]]:
    """Load the original training data"""
    training_data_path = Path("../training_data.json")
    
    if not training_data_path.exists():
        raise FileNotFoundError(f"Training data not found at {training_data_path}")
    
    with open(training_data_path, 'r') as f:
        data = json.load(f)
    
    print(f"📊 Loaded {len(data)} training examples")
    return data

def create_system_prompt() -> str:
    """Create the system prompt based on our evaluation insights"""
    return """You are a helpful AI assistant specialized in Weave, W&B's LLM observability framework.

Key guidelines:
- Provide accurate, practical information about Weave features
- Include relevant images when appropriate using markdown format: ![alt text](image_url)
- Focus on code examples and step-by-step instructions
- Mention specific Weave concepts: @weave.op(), weave.Model, weave.Evaluation, weave.Dataset
- Be concise but comprehensive in responses
- Always include working code snippets when explaining functionality

When discussing Weave features:
- Explain the purpose and benefits
- Show practical implementation examples
- Include relevant documentation links from weave-docs.wandb.ai
- Highlight best practices and common patterns

Your responses should help users effectively implement Weave for LLM observability, evaluation, and model management."""

def convert_to_instruction_format(data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert training data to instruction-response format"""
    converted = []
    
    for i, item in enumerate(data):
        # Create instruction from context
        text_before = item.get('text_before', '').strip()
        text_after = item.get('text_after', '').strip()
        context = item.get('context', '').strip()
        
        # Skip items without sufficient content
        if not text_before or not text_after:
            continue
        
        # Create instruction
        instruction = f"Based on this Weave documentation context: {text_before}"
        
        # Create response with image if available
        response = text_after
        if item.get('image_path') and item.get('image_alt'):
            image_markdown = f"\n\n![{item['image_alt']}]({item['image_path']})"
            response += image_markdown
        
        # Add source context if helpful
        if item.get('source_file'):
            source_note = f"\n\n*Source: {item['source_file']}*"
            response += source_note
        
        converted_item = {
            "instruction": instruction,
            "response": response,
            "original_id": item.get('training_id', f"item_{i}"),
            "has_image": bool(item.get('image_path')),
            "confidence": item.get('confidence_score', 1.0)
        }
        
        converted.append(converted_item)
    
    print(f"✅ Converted {len(converted)} examples to instruction format")
    return converted

def create_ollama_examples(converted_data: List[Dict[str, Any]], max_examples: int = 50) -> List[str]:
    """Create example conversations for Ollama Modelfile"""
    examples = []
    
    # Select high-quality examples with good diversity
    high_quality = [item for item in converted_data if item['confidence'] >= 1.0]
    with_images = [item for item in high_quality if item['has_image']]
    without_images = [item for item in high_quality if not item['has_image']]
    
    # Balance examples with and without images
    selected_examples = []
    selected_examples.extend(with_images[:max_examples//2])
    selected_examples.extend(without_images[:max_examples//2])
    
    for item in selected_examples[:max_examples]:
        example = f"""USER: {item['instruction']}
ASSISTANT: {item['response']}"""
        examples.append(example)
    
    print(f"📝 Created {len(examples)} example conversations")
    return examples

def create_modelfile(system_prompt: str, examples: List[str]) -> str:
    """Create Ollama Modelfile content"""
    modelfile_content = f"""FROM qwen3:0.6b

# Model parameters optimized for Weave documentation
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1

# System prompt for Weave expertise
SYSTEM \"\"\"{system_prompt}\"\"\"

# Training examples to establish patterns
"""
    
    # Add a subset of examples as training patterns
    for i, example in enumerate(examples[:10]):  # Limit to avoid too large Modelfile
        modelfile_content += f"\n# Example {i+1}\n"
        modelfile_content += f'MESSAGE user "{example.split("USER: ")[1].split("ASSISTANT: ")[0].strip()}"\n'
        modelfile_content += f'MESSAGE assistant "{example.split("ASSISTANT: ")[1].strip()}"\n'
    
    return modelfile_content

def save_converted_data(converted_data: List[Dict[str, Any]], examples: List[str], modelfile_content: str):
    """Save all converted data to files"""
    
    # Save full converted dataset
    with open("data/ollama_training_format.json", 'w') as f:
        json.dump(converted_data, f, indent=2)
    print("✅ Saved full dataset to data/ollama_training_format.json")
    
    # Save examples for reference
    with open("data/training_examples.txt", 'w') as f:
        f.write("\n\n" + "="*80 + "\n\n".join(examples))
    print("✅ Saved examples to data/training_examples.txt")
    
    # Save Modelfile
    with open("WeaveModelfile", 'w') as f:
        f.write(modelfile_content)
    print("✅ Saved Modelfile to WeaveModelfile")
    
    # Save statistics
    stats = {
        "total_examples": len(converted_data),
        "with_images": sum(1 for item in converted_data if item['has_image']),
        "without_images": sum(1 for item in converted_data if not item['has_image']),
        "high_confidence": sum(1 for item in converted_data if item['confidence'] >= 1.0),
        "example_conversations": len(examples)
    }
    
    with open("data/conversion_stats.json", 'w') as f:
        json.dump(stats, f, indent=2)
    print("✅ Saved statistics to data/conversion_stats.json")
    
    return stats

def main():
    """Main conversion function"""
    print("🔄 Converting OpenPipe Training Data to Ollama Format")
    print("=" * 60)
    
    try:
        # Load original data
        original_data = load_training_data()
        
        # Convert to instruction format
        converted_data = convert_to_instruction_format(original_data)
        
        # Create system prompt
        system_prompt = create_system_prompt()
        
        # Create example conversations
        examples = create_ollama_examples(converted_data)
        
        # Create Modelfile
        modelfile_content = create_modelfile(system_prompt, examples)
        
        # Save everything
        stats = save_converted_data(converted_data, examples, modelfile_content)
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 CONVERSION SUMMARY")
        print("=" * 60)
        print(f"Total examples: {stats['total_examples']}")
        print(f"With images: {stats['with_images']} ({stats['with_images']/stats['total_examples']*100:.1f}%)")
        print(f"Without images: {stats['without_images']} ({stats['without_images']/stats['total_examples']*100:.1f}%)")
        print(f"High confidence: {stats['high_confidence']} ({stats['high_confidence']/stats['total_examples']*100:.1f}%)")
        print(f"Example conversations: {stats['example_conversations']}")
        
        print("\n🎯 NEXT STEPS:")
        print("1. Review the generated WeaveModelfile")
        print("2. Run: python create_weave_model.py")
        print("3. Test with: python test_local_model.py")
        
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        raise

if __name__ == "__main__":
    main()
