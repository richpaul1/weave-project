#!/usr/bin/env python3
"""
Comprehensive test suite for the entire prompt versioning and Weave tracking system.

This script validates:
1. Configuration imports and exports
2. Prompt versioning system
3. Weave metadata tracking
4. Service integration
5. API functionality
6. CLI tools
"""

import sys
import os
import json
import subprocess
import requests
import time

# Change to the agent directory to ensure proper environment loading
script_dir = os.path.dirname(os.path.abspath(__file__))
agent_dir = os.path.dirname(script_dir)
os.chdir(agent_dir)
sys.path.append(agent_dir)

def test_configuration_imports():
    """Test that all configuration imports work correctly."""
    print("🔧 Testing Configuration Imports")
    print("=" * 50)
    
    try:
        # Test Neo4j config imports
        from app.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DB_NAME
        print(f"✅ Neo4j config: {NEO4J_URI[:20]}...")
        
        # Test LLM config imports
        from app.config import OLLAMA_MODEL, OPENAI_MODEL, TEMPERATURE
        print(f"✅ LLM config: {OLLAMA_MODEL}, temp={TEMPERATURE}")
        
        # Test prompt config imports
        from app.config import PromptConfig
        from app.prompts import PromptConfig as DirectPromptConfig
        print(f"✅ Prompt config: v{PromptConfig.get_current_version()}")
        
        return True
    except Exception as e:
        print(f"❌ Configuration import error: {e}")
        return False


def test_prompt_versioning():
    """Test the prompt versioning system."""
    print("\n📚 Testing Prompt Versioning System")
    print("=" * 50)
    
    try:
        from app.prompts import PromptConfig
        
        # Test version info
        version_info = PromptConfig.get_version_info()
        print(f"✅ Current version: {version_info['current_version']}")
        print(f"✅ Supported versions: {version_info['supported_versions']}")
        
        # Test prompt retrieval for all versions
        for version in PromptConfig.get_supported_versions():
            general = PromptConfig.get_general_system_prompt(version=version)
            learning = PromptConfig.get_learning_system_prompt(version=version)
            tool_calling = PromptConfig.get_tool_calling_system_prompt(version=version)
            print(f"✅ Version {version}: {len(general)}/{len(learning)}/{len(tool_calling)} chars")
        
        return True
    except Exception as e:
        print(f"❌ Prompt versioning error: {e}")
        return False


def test_weave_metadata():
    """Test Weave metadata functionality."""
    print("\n📊 Testing Weave Metadata")
    print("=" * 50)
    
    try:
        from app.utils.weave_utils import get_prompt_version_metadata, track_prompt_usage
        
        # Test metadata extraction
        metadata = get_prompt_version_metadata()
        print(f"✅ Metadata keys: {list(metadata.keys())}")
        print(f"✅ Prompt version: {metadata.get('prompt_version')}")
        
        # Test prompt usage tracking
        track_prompt_usage(
            prompt_type="test_prompt",
            prompt_content="This is a test prompt for validation",
            test_mode=True
        )
        print("✅ Prompt usage tracking completed")
        
        return True
    except Exception as e:
        print(f"❌ Weave metadata error: {e}")
        return False


def test_cli_tools():
    """Test CLI management tools."""
    print("\n🛠️ Testing CLI Tools")
    print("=" * 50)
    
    try:
        # Test prompt manager
        result = subprocess.run(
            ["python", "scripts/prompt_manager.py", "--version"],
            capture_output=True,
            text=True,
            cwd=agent_dir
        )
        if result.returncode == 0:
            print("✅ Prompt manager --version working")
        else:
            print(f"❌ Prompt manager error: {result.stderr}")
            return False
        
        # Test validation
        result = subprocess.run(
            ["python", "scripts/prompt_manager.py", "--validate"],
            capture_output=True,
            text=True,
            cwd=agent_dir
        )
        if result.returncode == 0:
            print("✅ Prompt manager --validate working")
        else:
            print(f"❌ Prompt validation error: {result.stderr}")
            return False
        
        return True
    except Exception as e:
        print(f"❌ CLI tools error: {e}")
        return False


def test_api_functionality():
    """Test API endpoints."""
    print("\n🌐 Testing API Functionality")
    print("=" * 50)
    
    try:
        # Test health endpoint
        response = requests.get("http://localhost:8083/health", timeout=5)
        if response.status_code == 200:
            print("✅ Health endpoint working")
        else:
            print(f"❌ Health endpoint error: {response.status_code}")
            return False
        
        # Test chat endpoint
        chat_data = {
            "query": "Test system integration",
            "session_id": "test-full-system",
            "top_k": 3
        }
        
        response = requests.post(
            "http://localhost:8083/api/chat/stream",
            json=chat_data,
            headers={"Content-Type": "application/json"},
            timeout=30,
            stream=True
        )
        
        if response.status_code == 200:
            # Check for expected event types
            events_found = set()
            for line in response.iter_lines():
                if line.startswith(b'data: '):
                    try:
                        data = json.loads(line[6:])
                        events_found.add(data.get('type'))
                        if data.get('type') == 'complete':
                            break
                    except json.JSONDecodeError:
                        continue
            
            expected_events = {'classification', 'context', 'history', 'response', 'done', 'complete'}
            if expected_events.issubset(events_found):
                print("✅ Chat streaming endpoint working")
                print(f"✅ Events found: {sorted(events_found)}")
            else:
                print(f"❌ Missing events: {expected_events - events_found}")
                return False
        else:
            print(f"❌ Chat endpoint error: {response.status_code}")
            return False
        
        return True
    except Exception as e:
        print(f"❌ API functionality error: {e}")
        return False


def test_service_integration():
    """Test service integration with prompt versioning."""
    print("\n🔗 Testing Service Integration")
    print("=" * 50)
    
    try:
        # Test that services can be imported without errors
        from app.services.enhanced_rag_service import EnhancedRAGService
        from app.services.rag_service import RAGService
        from app.services.tool_calling_service import ToolCallingService
        from app.services.llm_service import LLMService
        
        print("✅ All services import successfully")
        
        # Test that services can access prompt configuration
        from app.prompts import PromptConfig
        
        # Verify prompt access
        general_prompt = PromptConfig.get_general_system_prompt()
        learning_prompt = PromptConfig.get_learning_system_prompt()
        tool_prompt = PromptConfig.get_tool_calling_system_prompt()
        
        print(f"✅ Services can access prompts: {len(general_prompt)}/{len(learning_prompt)}/{len(tool_prompt)} chars")
        
        return True
    except Exception as e:
        print(f"❌ Service integration error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run the complete test suite."""
    print("🚀 Full System Test Suite")
    print("=" * 60)
    print()
    
    tests = [
        ("Configuration Imports", test_configuration_imports),
        ("Prompt Versioning", test_prompt_versioning),
        ("Weave Metadata", test_weave_metadata),
        ("CLI Tools", test_cli_tools),
        ("API Functionality", test_api_functionality),
        ("Service Integration", test_service_integration),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    passed = 0
    total = len(tests)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! System is fully functional.")
        return 0
    else:
        print("⚠️  Some tests failed. Please review the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
