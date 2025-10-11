#!/usr/bin/env python3
"""
Setup script for local Weave model training.
Prepares environment and validates prerequisites.
"""

import os
import sys
import json
import subprocess
import requests
from pathlib import Path

def check_ollama_installation():
    """Check if Ollama is installed and running"""
    print("🔍 Checking Ollama installation...")
    
    try:
        result = subprocess.run(['ollama', 'list'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Ollama is installed and running")
            print(f"Available models:\n{result.stdout}")
            return True
        else:
            print("❌ Ollama is installed but not running")
            print("Please start Ollama: ollama serve")
            return False
    except FileNotFoundError:
        print("❌ Ollama not found. Please install from: https://ollama.ai")
        return False

def check_base_models():
    """Check and pull required base models"""
    print("\n🔍 Checking base models...")
    
    required_models = [
        "qwen3:0.6b",    # Current model (from .env.local)
        "qwen2.5:1.5b",  # Alternative model
    ]
    
    available_models = []
    
    for model in required_models:
        try:
            result = subprocess.run(['ollama', 'show', model], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ {model} is available")
                available_models.append(model)
            else:
                print(f"⚠️  {model} not found, pulling...")
                pull_result = subprocess.run(['ollama', 'pull', model], capture_output=True, text=True)
                if pull_result.returncode == 0:
                    print(f"✅ Successfully pulled {model}")
                    available_models.append(model)
                else:
                    print(f"❌ Failed to pull {model}: {pull_result.stderr}")
        except Exception as e:
            print(f"❌ Error checking {model}: {e}")
    
    return available_models

def validate_training_data():
    """Validate training data exists and is properly formatted"""
    print("\n🔍 Validating training data...")
    
    training_data_path = Path("../training_data.json")
    
    if not training_data_path.exists():
        print(f"❌ Training data not found at {training_data_path}")
        return False
    
    try:
        with open(training_data_path, 'r') as f:
            data = json.load(f)
        
        print(f"✅ Training data loaded: {len(data)} examples")
        
        # Validate data structure
        required_fields = ['text_before', 'text_after', 'context']
        sample = data[0] if data else {}
        
        missing_fields = [field for field in required_fields if field not in sample]
        if missing_fields:
            print(f"⚠️  Missing fields in training data: {missing_fields}")
        else:
            print("✅ Training data structure is valid")
        
        # Count examples with images
        with_images = sum(1 for item in data if item.get('image_path'))
        print(f"📊 Examples with images: {with_images}/{len(data)} ({with_images/len(data)*100:.1f}%)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error validating training data: {e}")
        return False

def check_system_resources():
    """Check system resources for training"""
    print("\n🔍 Checking system resources...")
    
    try:
        import psutil
        
        # Memory check
        memory = psutil.virtual_memory()
        memory_gb = memory.total / (1024**3)
        print(f"💾 Total RAM: {memory_gb:.1f} GB")
        
        if memory_gb < 8:
            print("⚠️  Warning: Less than 8GB RAM. Consider using smaller models.")
        else:
            print("✅ Sufficient RAM for training")
        
        # CPU check
        cpu_count = psutil.cpu_count()
        print(f"🖥️  CPU cores: {cpu_count}")
        
        # GPU check (if available)
        try:
            result = subprocess.run(['nvidia-smi'], capture_output=True, text=True)
            if result.returncode == 0:
                print("🎮 GPU detected - CUDA acceleration available")
            else:
                print("💻 No GPU detected - using CPU")
        except FileNotFoundError:
            print("💻 No NVIDIA GPU detected - using CPU")
            
    except ImportError:
        print("⚠️  psutil not available, skipping resource check")
        print("Install with: pip install psutil")

def create_directory_structure():
    """Create necessary directories"""
    print("\n📁 Creating directory structure...")
    
    directories = [
        "results",
        "models", 
        "logs",
        "data"
    ]
    
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        print(f"✅ Created/verified: {directory}/")

def test_image_urls():
    """Test a sample of image URLs from training data"""
    print("\n🔗 Testing image URL accessibility...")
    
    training_data_path = Path("../training_data.json")
    
    try:
        with open(training_data_path, 'r') as f:
            data = json.load(f)
        
        # Test first 5 image URLs
        image_examples = [item for item in data if item.get('image_path')][:5]
        
        working_urls = 0
        for item in image_examples:
            url = item['image_path']
            try:
                response = requests.head(url, timeout=5)
                if response.status_code == 200:
                    working_urls += 1
                    print(f"✅ {url[:50]}...")
                else:
                    print(f"⚠️  {url[:50]}... (Status: {response.status_code})")
            except Exception as e:
                print(f"❌ {url[:50]}... (Error: {str(e)[:30]})")
        
        print(f"📊 Working image URLs: {working_urls}/{len(image_examples)}")
        
    except Exception as e:
        print(f"❌ Error testing image URLs: {e}")

def main():
    """Main setup function"""
    print("🚀 Setting up Local Weave Model Training Environment")
    print("=" * 60)
    
    # Run all checks
    checks = [
        ("Ollama Installation", check_ollama_installation),
        ("Base Models", check_base_models),
        ("Training Data", validate_training_data),
        ("System Resources", check_system_resources),
        ("Directory Structure", create_directory_structure),
        ("Image URLs", test_image_urls),
    ]
    
    results = {}
    for name, check_func in checks:
        try:
            result = check_func()
            results[name] = result
        except Exception as e:
            print(f"❌ Error in {name}: {e}")
            results[name] = False
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 SETUP SUMMARY")
    print("=" * 60)
    
    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{name:<20} {status}")
    
    # Next steps
    print("\n🎯 NEXT STEPS:")
    if all(results.values()):
        print("✅ All checks passed! Ready to proceed with:")
        print("   1. python convert_training_data.py")
        print("   2. python create_weave_model.py")
        print("   3. python test_local_model.py")
    else:
        print("⚠️  Please resolve the failed checks before proceeding")
        print("   - Install missing dependencies")
        print("   - Fix data issues")
        print("   - Ensure Ollama is running")

if __name__ == "__main__":
    main()
