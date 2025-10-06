#!/usr/bin/env python3
"""
Prompt Version Management CLI Tool

This script helps manage prompt versions, view differences, and switch between versions.

Usage:
    python scripts/prompt_manager.py --version
    python scripts/prompt_manager.py --list-versions
    python scripts/prompt_manager.py --show-version 1.2.0
    python scripts/prompt_manager.py --diff 1.1.0 1.2.0
    python scripts/prompt_manager.py --validate
"""

import argparse
import sys
import os
from pathlib import Path

# Add the parent directory to the path so we can import from app
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from app.prompts import PromptConfig, PROMPT_VERSION, SUPPORTED_VERSIONS
except ImportError as e:
    print(f"Error importing prompt config: {e}")
    print("Make sure you're running this from the agent directory")
    sys.exit(1)


def show_current_version():
    """Display current prompt version information."""
    version_info = PromptConfig.get_version_info()
    
    print("🔧 Current Prompt Configuration:")
    print(f"   Version: {version_info['current_version']}")
    print(f"   Date: {version_info['version_date']}")
    print(f"   Default: {version_info['default_version']}")
    print()
    
    # Show environment overrides
    env_overrides = []
    if os.getenv("PROMPT_VERSION"):
        env_overrides.append(f"PROMPT_VERSION={os.getenv('PROMPT_VERSION')}")
    if os.getenv("GENERAL_SYSTEM_PROMPT_OVERRIDE"):
        env_overrides.append("GENERAL_SYSTEM_PROMPT_OVERRIDE=<custom>")
    if os.getenv("LEARNING_SYSTEM_PROMPT_OVERRIDE"):
        env_overrides.append("LEARNING_SYSTEM_PROMPT_OVERRIDE=<custom>")
    
    if env_overrides:
        print("🌍 Environment Overrides:")
        for override in env_overrides:
            print(f"   {override}")
    else:
        print("🌍 No environment overrides active")


def list_versions():
    """List all supported prompt versions."""
    print("📚 Supported Prompt Versions:")
    for version in SUPPORTED_VERSIONS:
        current_marker = " (current)" if version == PROMPT_VERSION else ""
        print(f"   • {version}{current_marker}")


def show_version_prompts(version: str):
    """Show all prompts for a specific version."""
    try:
        prompts = PromptConfig.get_prompts_for_version(version)
        
        print(f"📋 Prompts for Version {version}:")
        print("=" * 50)
        
        for prompt_type, prompt_text in prompts.items():
            print(f"\n🔸 {prompt_type.upper()}:")
            print("-" * 30)
            # Show first 200 characters + ellipsis if longer
            if len(prompt_text) > 200:
                print(f"{prompt_text[:200]}...")
                print(f"[... {len(prompt_text) - 200} more characters]")
            else:
                print(prompt_text)
        
    except ValueError as e:
        print(f"❌ Error: {e}")


def compare_versions(version1: str, version2: str):
    """Compare prompts between two versions."""
    try:
        prompts1 = PromptConfig.get_prompts_for_version(version1)
        prompts2 = PromptConfig.get_prompts_for_version(version2)
        
        print(f"🔍 Comparing Version {version1} vs {version2}:")
        print("=" * 50)
        
        all_keys = set(prompts1.keys()) | set(prompts2.keys())
        
        for key in sorted(all_keys):
            print(f"\n🔸 {key.upper()}:")
            print("-" * 30)
            
            if key not in prompts1:
                print(f"❌ Not present in {version1}")
                print(f"✅ Added in {version2}")
            elif key not in prompts2:
                print(f"✅ Present in {version1}")
                print(f"❌ Removed in {version2}")
            elif prompts1[key] == prompts2[key]:
                print("✅ No changes")
            else:
                print("🔄 Modified")
                print(f"   Length: {len(prompts1[key])} → {len(prompts2[key])} chars")
        
    except ValueError as e:
        print(f"❌ Error: {e}")


def validate_prompts():
    """Validate all prompt versions for consistency."""
    print("🔍 Validating Prompt Versions:")
    print("=" * 40)
    
    errors = []
    warnings = []
    
    # Check all versions are accessible
    for version in SUPPORTED_VERSIONS:
        try:
            prompts = PromptConfig.get_prompts_for_version(version)
            print(f"✅ Version {version}: {len(prompts)} prompts")
            
            # Check for empty prompts
            for prompt_type, prompt_text in prompts.items():
                if not prompt_text.strip():
                    errors.append(f"Empty prompt: {version}.{prompt_type}")
                elif len(prompt_text) < 50:
                    warnings.append(f"Very short prompt: {version}.{prompt_type} ({len(prompt_text)} chars)")
                    
        except Exception as e:
            errors.append(f"Failed to load version {version}: {e}")
    
    # Check current version is supported
    if PROMPT_VERSION not in SUPPORTED_VERSIONS:
        errors.append(f"Current version {PROMPT_VERSION} not in supported versions")
    
    print()
    if errors:
        print("❌ Errors found:")
        for error in errors:
            print(f"   • {error}")
    
    if warnings:
        print("⚠️  Warnings:")
        for warning in warnings:
            print(f"   • {warning}")
    
    if not errors and not warnings:
        print("✅ All prompt versions are valid!")
    
    return len(errors) == 0


def main():
    parser = argparse.ArgumentParser(description="Prompt Version Management Tool")
    parser.add_argument("--version", action="store_true", help="Show current version info")
    parser.add_argument("--list-versions", action="store_true", help="List all supported versions")
    parser.add_argument("--show-version", metavar="VERSION", help="Show prompts for specific version")
    parser.add_argument("--diff", nargs=2, metavar=("V1", "V2"), help="Compare two versions")
    parser.add_argument("--validate", action="store_true", help="Validate all prompt versions")
    
    args = parser.parse_args()
    
    if args.version:
        show_current_version()
    elif args.list_versions:
        list_versions()
    elif args.show_version:
        show_version_prompts(args.show_version)
    elif args.diff:
        compare_versions(args.diff[0], args.diff[1])
    elif args.validate:
        success = validate_prompts()
        sys.exit(0 if success else 1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
