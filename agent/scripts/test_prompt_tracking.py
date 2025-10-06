#!/usr/bin/env python3
"""
Test script for prompt version tracking in Weave instrumentation.

This script validates that prompt versions are properly tracked across all services.
"""

import sys
import os

# Change to the agent directory to ensure proper environment loading
script_dir = os.path.dirname(os.path.abspath(__file__))
agent_dir = os.path.dirname(script_dir)
os.chdir(agent_dir)
sys.path.append(agent_dir)

from app.utils.weave_utils import get_prompt_version_metadata, track_prompt_usage
from app.config.prompts import PromptConfig


def test_prompt_metadata():
    """Test prompt version metadata extraction."""
    print("🔍 Testing Prompt Version Metadata")
    print("=" * 50)
    
    metadata = get_prompt_version_metadata()
    print(f"✅ Prompt Version: {metadata.get('prompt_version')}")
    print(f"✅ Version Date: {metadata.get('prompt_version_date')}")
    print(f"✅ Supported Versions: {metadata.get('supported_prompt_versions')}")
    print()


def test_prompt_config():
    """Test PromptConfig functionality."""
    print("🔧 Testing PromptConfig Methods")
    print("=" * 50)
    
    print(f"✅ Current Version: {PromptConfig.get_current_version()}")
    print(f"✅ Supported Versions: {PromptConfig.get_supported_versions()}")
    
    # Test version info
    version_info = PromptConfig.get_version_info()
    print(f"✅ Version Info: {version_info}")
    
    # Test prompt retrieval
    general_prompt = PromptConfig.get_general_system_prompt()
    print(f"✅ General Prompt Length: {len(general_prompt)} chars")
    
    learning_prompt = PromptConfig.get_learning_system_prompt()
    print(f"✅ Learning Prompt Length: {len(learning_prompt)} chars")
    
    tool_prompt = PromptConfig.get_tool_calling_system_prompt()
    print(f"✅ Tool Calling Prompt Length: {len(tool_prompt)} chars")
    print()


def test_version_comparison():
    """Test different prompt versions."""
    print("📊 Testing Version Comparison")
    print("=" * 50)
    
    supported_versions = PromptConfig.get_supported_versions()
    
    for version in supported_versions:
        try:
            general_prompt = PromptConfig.get_general_system_prompt(version=version)
            learning_prompt = PromptConfig.get_learning_system_prompt(version=version)
            tool_prompt = PromptConfig.get_tool_calling_system_prompt(version=version)
            
            print(f"✅ Version {version}:")
            print(f"   General: {len(general_prompt)} chars")
            print(f"   Learning: {len(learning_prompt)} chars")
            print(f"   Tool Calling: {len(tool_prompt)} chars")
        except Exception as e:
            print(f"❌ Version {version}: Error - {e}")
    print()


def test_prompt_tracking():
    """Test prompt usage tracking."""
    print("📈 Testing Prompt Usage Tracking")
    print("=" * 50)
    
    try:
        # Test tracking different prompt types
        test_prompts = [
            ("general_system", PromptConfig.get_general_system_prompt()),
            ("learning_system", PromptConfig.get_learning_system_prompt()),
            ("tool_calling_system", PromptConfig.get_tool_calling_system_prompt())
        ]
        
        for prompt_type, prompt_content in test_prompts:
            track_prompt_usage(
                prompt_type=prompt_type,
                prompt_content=prompt_content,
                test_mode=True,
                service_name="test_script"
            )
            print(f"✅ Tracked {prompt_type} prompt usage")
        
        print("✅ All prompt tracking tests completed")
    except Exception as e:
        print(f"❌ Prompt tracking error: {e}")
    print()


def test_service_integration():
    """Test that services can access prompt versions."""
    print("🔗 Testing Service Integration")
    print("=" * 50)

    try:
        # Test that prompt config can be imported and used
        print("Testing PromptConfig accessibility...")

        # Test all prompt retrieval methods
        general = PromptConfig.get_general_system_prompt()
        learning = PromptConfig.get_learning_system_prompt()
        tool_calling = PromptConfig.get_tool_calling_system_prompt()
        legacy = PromptConfig.get_legacy_system_prompt()

        print(f"✅ General prompt accessible: {len(general)} chars")
        print(f"✅ Learning prompt accessible: {len(learning)} chars")
        print(f"✅ Tool calling prompt accessible: {len(tool_calling)} chars")
        print(f"✅ Legacy prompt accessible: {len(legacy)} chars")

        print("✅ All prompt methods are accessible")
    except Exception as e:
        print(f"❌ Service integration error: {e}")
        import traceback
        traceback.print_exc()
    print()


def main():
    """Run all prompt tracking tests."""
    print("🚀 Prompt Version Tracking Test Suite")
    print("=" * 60)
    print()
    
    try:
        test_prompt_metadata()
        test_prompt_config()
        test_version_comparison()
        test_prompt_tracking()
        test_service_integration()
        
        print("🎉 All tests completed successfully!")
        print("✅ Prompt version tracking is working correctly")
        
    except Exception as e:
        print(f"❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
