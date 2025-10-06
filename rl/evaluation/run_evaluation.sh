#!/bin/bash
# Quick script to run the prompt comparison evaluation

echo "🧪 Running Prompt Comparison Evaluation"
echo "========================================"
echo ""

# Activate virtual environment
source ../venv/bin/activate

# Run evaluation
echo "📊 Running evaluation..."
python prompt_comparison_eval.py

# Check if successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Evaluation completed successfully!"
    echo ""
    echo "📁 View detailed results:"
    echo "   python view_results.py"
    echo ""
    echo "📖 Read summary:"
    echo "   cat EVALUATION_SUMMARY.md"
    echo ""
    echo "🔗 View in Weave:"
    echo "   https://wandb.ai/richpaul1-stealth/rl-demo"
    echo ""
else
    echo ""
    echo "❌ Evaluation failed!"
    echo "Check the error messages above."
    exit 1
fi

