#!/usr/bin/env python3
"""
Create the qwen3-weave:0.6b model using Ollama.
This script builds a Weave-specialized model from the base qwen3:0.6b.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime

def check_prerequisites():
    """Check if all prerequisites are met"""
    print("🔍 Checking prerequisites...")
    
    # Check if Ollama is running
    try:
        result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Ollama is not running. Please start with: ollama serve")
            return False
        print("✅ Ollama is running")
    except FileNotFoundError:
        print("❌ Ollama not found. Please install from: https://ollama.ai")
        return False
    
    # Check if base model exists
    try:
        result = subprocess.run(['ollama', 'show', 'qwen3:0.6b'], capture_output=True, text=True)
        if result.returncode != 0:
            print("⚠️  Base model qwen3:0.6b not found. Pulling...")
            pull_result = subprocess.run(['ollama', 'pull', 'qwen3:0.6b'], capture_output=True, text=True)
            if pull_result.returncode != 0:
                print(f"❌ Failed to pull qwen3:0.6b: {pull_result.stderr}")
                return False
            print("✅ Successfully pulled qwen3:0.6b")
        else:
            print("✅ Base model qwen3:0.6b is available")
    except Exception as e:
        print(f"❌ Error checking base model: {e}")
        return False
    
    # Check if Modelfile exists
    if not Path("WeaveModelfile").exists():
        print("❌ WeaveModelfile not found. Run convert_training_data.py first")
        return False
    print("✅ WeaveModelfile found")
    
    return True

def backup_existing_model():
    """Backup existing qwen3-weave model if it exists"""
    try:
        result = subprocess.run(['ollama', 'show', 'qwen3-weave:0.6b'], capture_output=True, text=True)
        if result.returncode == 0:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"qwen3-weave-backup-{timestamp}:0.6b"
            
            print(f"⚠️  Existing qwen3-weave:0.6b found. Creating backup as {backup_name}")
            
            # Create backup by copying the model
            copy_result = subprocess.run([
                'ollama', 'cp', 'qwen3-weave:0.6b', backup_name
            ], capture_output=True, text=True)
            
            if copy_result.returncode == 0:
                print(f"✅ Backup created: {backup_name}")
                return backup_name
            else:
                print(f"⚠️  Failed to create backup: {copy_result.stderr}")
                return None
    except Exception as e:
        print(f"⚠️  Error checking for existing model: {e}")
    
    return None

def create_model():
    """Create the qwen3-weave:0.6b model"""
    print("\n🚀 Creating qwen3-weave:0.6b model...")
    
    try:
        # Remove existing model if it exists (after backup)
        subprocess.run(['ollama', 'rm', 'qwen3-weave:0.6b'], capture_output=True)
        
        # Create the new model
        result = subprocess.run([
            'ollama', 'create', 'qwen3-weave:0.6b', '-f', 'WeaveModelfile'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Successfully created qwen3-weave:0.6b")
            print(f"Output: {result.stdout}")
            return True
        else:
            print(f"❌ Failed to create model: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error creating model: {e}")
        return False

def test_model():
    """Test the newly created model with a simple query"""
    print("\n🧪 Testing qwen3-weave:0.6b model...")
    
    test_queries = [
        "What is Weave?",
        "How do I use @weave.op() decorator?",
        "Show me how to create a Weave dataset"
    ]
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n📝 Test {i}: {query}")
        try:
            result = subprocess.run([
                'ollama', 'run', 'qwen3-weave:0.6b', query
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                response = result.stdout.strip()
                print(f"✅ Response ({len(response)} chars): {response[:200]}...")
                
                # Check for Weave-specific content
                weave_keywords = ['weave', 'observability', '@weave.op', 'weave.Model']
                found_keywords = [kw for kw in weave_keywords if kw.lower() in response.lower()]
                
                if found_keywords:
                    print(f"🎯 Weave keywords found: {found_keywords}")
                else:
                    print("⚠️  No Weave-specific keywords detected")
            else:
                print(f"❌ Test failed: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            print("⏰ Test timed out (30s)")
        except Exception as e:
            print(f"❌ Test error: {e}")

def get_model_info():
    """Get information about the created model"""
    print("\n📊 Model Information:")
    
    try:
        # Get model details
        result = subprocess.run(['ollama', 'show', 'qwen3-weave:0.6b'], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout)
        
        # Get model size
        list_result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if list_result.returncode == 0:
            lines = list_result.stdout.split('\n')
            for line in lines:
                if 'qwen3-weave:0.6b' in line:
                    print(f"📦 Model entry: {line}")
                    break
                    
    except Exception as e:
        print(f"❌ Error getting model info: {e}")

def save_creation_log():
    """Save creation log and metadata"""
    log_data = {
        "model_name": "qwen3-weave:0.6b",
        "base_model": "qwen3:0.6b",
        "created_at": datetime.now().isoformat(),
        "training_data_source": "../training_data.json",
        "modelfile": "WeaveModelfile",
        "purpose": "Weave LLM observability framework specialist",
        "expected_improvements": [
            "Better Weave-specific responses",
            "Improved code examples",
            "Enhanced multimodal capabilities",
            "Domain-specific knowledge"
        ]
    }
    
    with open("logs/model_creation_log.json", 'w') as f:
        json.dump(log_data, f, indent=2)
    
    print("✅ Creation log saved to logs/model_creation_log.json")

def main():
    """Main model creation function"""
    print("🚀 Creating qwen3-weave:0.6b - Weave-Specialized Model")
    print("=" * 60)
    
    # Create logs directory
    Path("logs").mkdir(exist_ok=True)
    
    # Check prerequisites
    if not check_prerequisites():
        print("\n❌ Prerequisites not met. Please resolve issues and try again.")
        sys.exit(1)
    
    # Backup existing model
    backup_name = backup_existing_model()
    
    # Create the model
    if create_model():
        print("\n🎉 Model creation successful!")
        
        # Test the model
        test_model()
        
        # Get model information
        get_model_info()
        
        # Save creation log
        save_creation_log()
        
        print("\n" + "=" * 60)
        print("✅ qwen3-weave:0.6b CREATED SUCCESSFULLY!")
        print("=" * 60)
        print("\n🎯 NEXT STEPS:")
        print("1. Test with: ollama run qwen3-weave:0.6b")
        print("2. Evaluate with: python test_local_model.py")
        print("3. Compare performance: python ../evaluate_models/model_comparison_eval.py")
        
        if backup_name:
            print(f"\n📦 Backup available: {backup_name}")
            print(f"   Restore with: ollama cp {backup_name} qwen3-weave:0.6b")
        
    else:
        print("\n❌ Model creation failed. Check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
