#!/usr/bin/env python3
"""
Quick Runner for Single Prompt Evaluation
Runs both the evaluation and detailed analysis in sequence.
"""

import subprocess
import sys
import time
from pathlib import Path

def run_command(command: str, description: str) -> bool:
    """Run a command and return success status"""
    print(f"\n🚀 {description}")
    print("=" * 60)
    
    try:
        result = subprocess.run(
            command.split(),
            cwd=Path(__file__).parent,
            check=True,
            capture_output=False
        )
        print(f"✅ {description} completed successfully")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed with exit code {e.returncode}")
        return False
    except Exception as e:
        print(f"❌ {description} failed: {str(e)}")
        return False

def main():
    """Main runner function"""
    print("🎯 Single Prompt Evaluation Runner")
    print("=" * 60)
    print("This will run the evaluation and then analyze the results.")
    print("Make sure all models are available and environment is configured.")
    
    # Confirm before running
    response = input("\nProceed with evaluation? (y/N): ").strip().lower()
    if response != 'y':
        print("Evaluation cancelled.")
        sys.exit(0)
    
    start_time = time.time()
    
    # Step 1: Run the evaluation
    success = run_command(
        "python single_prompt_eval.py",
        "Running Single Prompt Evaluation"
    )
    
    if not success:
        print("\n❌ Evaluation failed. Check the error messages above.")
        sys.exit(1)
    
    # Step 2: Run the analysis
    print("\n⏳ Waiting 2 seconds before analysis...")
    time.sleep(2)
    
    success = run_command(
        "python detailed_response_analyzer.py",
        "Running Detailed Response Analysis"
    )
    
    if not success:
        print("\n❌ Analysis failed. Check the error messages above.")
        sys.exit(1)
    
    # Summary
    end_time = time.time()
    duration = end_time - start_time
    
    print("\n" + "=" * 60)
    print("🎉 EVALUATION COMPLETE!")
    print("=" * 60)
    print(f"Total time: {duration:.1f} seconds")
    print("\n📊 What was tested:")
    print("- Prompt: 'How do I trace my LLM calls with Weave? Please include relevant images and examples.'")
    print("- Models: qwen3:0.6b, qwen3-weave:0.6b, gpt-4, openpipe:multimodal-agent-v1")
    print("- Focus: Image generation and response quality")
    
    print("\n📁 Files created:")
    print("- single_prompt_results_YYYYMMDD_HHMMSS.json (detailed results)")
    print("- Console output above (analysis summary)")
    
    print("\n🎯 Key insights to look for:")
    print("- Which model generated the most images?")
    print("- Which model had the most Weave-specific content?")
    print("- How did our trained model compare to the baseline?")
    print("- What patterns can we use to improve future training?")

if __name__ == "__main__":
    main()
