#!/usr/bin/env python3
"""
Main runner script for multimodal agent training pipeline.

This script orchestrates the complete training process:
1. Data analysis and extraction
2. Training data preparation
3. Model training with OpenPipe ART
4. Evaluation and validation
"""

import asyncio
import json
import argparse
import sys
from pathlib import Path
from typing import Dict, Any

# Import our training modules
from analyze_training_data import TrainingDataAnalyzer
from train_multimodal_agent import MultimodalAgentTrainer
from image_search_tool import ImageSearchTool

def load_config(config_path: str = "multimodal_agent_config.json") -> Dict[str, Any]:
    """Load training configuration from JSON file"""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Config file {config_path} not found. Using default configuration.")
        return get_default_config()

def get_default_config() -> Dict[str, Any]:
    """Get default configuration if config file is not found"""
    return {
        "model_config": {
            "base_model": "Qwen/Qwen2.5-7B-Instruct"
        },
        "training_config": {
            "groups_per_step": 2,
            "num_epochs": 3,
            "rollouts_per_group": 2,
            "learning_rate": 1e-5,
            "max_steps": 5
        },
        "data_config": {
            "min_confidence_threshold": 0.4,
            "storage_paths": {
                "content": "./storage/content",
                "docs": "./docs"
            }
        }
    }

async def run_data_analysis(config: Dict[str, Any]) -> str:
    """Run data analysis and extraction phase"""
    print("=" * 60)
    print("PHASE 1: DATA ANALYSIS AND EXTRACTION")
    print("=" * 60)
    
    data_config = config.get("data_config", {})
    storage_paths = data_config.get("storage_paths", {})
    
    analyzer = TrainingDataAnalyzer(
        storage_path=storage_paths.get("content", "./storage/content"),
        docs_path=storage_paths.get("docs", "./docs")
    )
    
    print("Analyzing markdown files for text-image pairs...")
    stats = analyzer.analyze_all_files()
    
    print(f"\n📊 Analysis Results:")
    print(f"   Total files analyzed: {stats['total_files']}")
    print(f"   Total text-image pairs found: {stats['total_pairs']}")
    print(f"   High quality pairs (≥0.7): {stats['high_quality_pairs']}")
    print(f"   Medium quality pairs (0.4-0.7): {stats['medium_quality_pairs']}")
    print(f"   Low quality pairs (<0.4): {stats['low_quality_pairs']}")
    print(f"   Average confidence score: {stats['avg_confidence']:.2f}")
    
    # Export training data
    output_file = data_config.get("training_data_path", "training_data.json")
    min_confidence = data_config.get("min_confidence_threshold", 0.4)
    
    training_data = analyzer.export_training_data(output_file, min_confidence)
    
    print(f"\n💾 Training Data Export:")
    print(f"   Exported {len(training_data)} pairs with confidence ≥ {min_confidence}")
    print(f"   Training data saved to: {output_file}")
    
    return output_file

async def run_model_training(config: Dict[str, Any], training_data_path: str):
    """Run model training phase"""
    print("\n" + "=" * 60)
    print("PHASE 2: MODEL TRAINING WITH OPENPIPE ART")
    print("=" * 60)
    
    try:
        model_config = config.get("model_config", {})
        training_config = config.get("training_config", {})
        
        trainer = MultimodalAgentTrainer(
            model_name=model_config.get("base_model", "Qwen/Qwen2.5-7B-Instruct")
        )
        
        print(f"🤖 Training Model: {model_config.get('base_model')}")
        print(f"📚 Training Data: {training_data_path}")
        print(f"⚙️  Configuration: {training_config}")
        
        await trainer.train(training_data_path, training_config)
        
        print("✅ Training completed successfully!")
        
    except ImportError as e:
        print(f"❌ OpenPipe ART not available: {e}")
        print("   Install with: pip install openpipe-art[backend,langgraph]")
        return False
    except Exception as e:
        print(f"❌ Training failed: {e}")
        return False
    
    return True

def run_image_search_test(config: Dict[str, Any]):
    """Test the image search functionality"""
    print("\n" + "=" * 60)
    print("PHASE 3: IMAGE SEARCH TOOL TESTING")
    print("=" * 60)
    
    data_config = config.get("data_config", {})
    storage_paths = data_config.get("storage_paths", {})
    
    tool = ImageSearchTool(
        storage_path=storage_paths.get("content", "./storage/content"),
        docs_path=storage_paths.get("docs", "./docs")
    )
    
    test_queries = [
        "weave dashboard",
        "chat interface", 
        "graph visualization",
        "setup instructions",
        "monitoring"
    ]
    
    print("🔍 Testing image search with sample queries:")
    
    for query in test_queries:
        results = tool.search_images(query, max_results=2)
        print(f"\n   Query: '{query}'")
        if results:
            for result in results:
                print(f"     📸 {result.path} (score: {result.relevance_score:.2f})")
                print(f"        Alt: {result.alt_text}")
        else:
            print("     No images found")

async def main():
    """Main training pipeline"""
    parser = argparse.ArgumentParser(description="Run multimodal agent training pipeline")
    parser.add_argument("--config", default="multimodal_agent_config.json", 
                       help="Path to configuration file")
    parser.add_argument("--skip-training", action="store_true",
                       help="Skip the training phase (useful for testing)")
    parser.add_argument("--data-only", action="store_true",
                       help="Only run data analysis phase")
    parser.add_argument("--test-only", action="store_true",
                       help="Only run image search testing")
    
    args = parser.parse_args()
    
    # Load configuration
    config = load_config(args.config)
    
    print("🚀 Starting Multimodal Agent Training Pipeline")
    print(f"📋 Configuration: {args.config}")
    
    if args.test_only:
        run_image_search_test(config)
        return
    
    # Phase 1: Data Analysis
    training_data_path = await run_data_analysis(config)
    
    if args.data_only:
        print("\n✅ Data analysis completed. Use --test-only to test image search.")
        return
    
    # Phase 2: Model Training (if not skipped)
    if not args.skip_training:
        success = await run_model_training(config, training_data_path)
        if not success:
            print("\n❌ Training failed. You can still test the image search tool with --test-only")
            sys.exit(1)
    else:
        print("\n⏭️  Skipping training phase as requested")
    
    # Phase 3: Image Search Testing
    run_image_search_test(config)
    
    print("\n" + "=" * 60)
    print("🎉 PIPELINE COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Review training results in Weave dashboard")
    print("2. Test the trained model with sample queries")
    print("3. Integrate the image search tool into your agent")
    print("4. Deploy the enhanced multimodal agent")

if __name__ == "__main__":
    asyncio.run(main())
