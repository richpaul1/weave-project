# 🚀 Quick Reference Card

## Files You Need

```
📁 rl/
  ├── openpipe_training_data.jsonl  ← Upload this to OpenPipe (103 examples)
  ├── OPENPIPE_WEB_GUIDE.md         ← Detailed instructions
  └── .env.local                     ← Your API keys
```

**File Details:**
- Format: JSONL (JSON Lines) - ✅ Validated
- Examples: 103 (92 train, 11 test)
- Split: 90/10 train/test
- All metadata values: strings ✅

## Your Credentials

```bash
OpenPipe API Key: opk_.....
WANDB API Key:    07........
WANDB Project:    rl-demo
WANDB Entity:     richpaul1-stealth
```

## Training Configuration

```yaml
File to upload:   openpipe_training_data.jsonl
Examples:         103
Base Model: Qwen/Qwen2.5-1.5B-Instruct
Model Name: weave-multimodal-agent-v1

# Training Parameters (OPTIMIZED FOR 1.5B)
Epochs: 3-5                  ← Good balance for 1.5B model
Learning Rate: 3e-5          ← Between 0.5B (5e-5) and 7B (1e-5)
Batch Size: 8                ← Optimal for 1.5B
Max Sequence Length: 2048

# Advanced (if available)
LoRA Rank: 16                ← Standard for 1.5B+
LoRA Alpha: 32               ← Standard for 1.5B+
Warmup Ratio: 0.1
Weight Decay: 0.01
Gradient Accumulation: 2
```

## Quick Steps

1. **Go to**: https://openpipe.ai
2. **Sign in** with your account
3. **Create new dataset** → Upload `openpipe_training_data.jsonl`
4. **Create fine-tune job** from dataset
5. **Select model**: Qwen/Qwen2.5-1.5B-Instruct
6. **Training type**: Standard Fine-Tuning (NOT DPO)
7. **Set epochs**: 3-5
8. **Set learning rate**: 3e-5
9. **Set batch size**: 8
10. **Name**: weave-multimodal-agent-v1
11. **Start training**
12. **Wait**: 30-100 minutes

## Testing Your Trained Model

### Quick Test (Single Query)
```bash
cd rl
source venv/bin/activate
python test_simple.py
```
**Output**: Single query response with image check

### Multiple Queries Test
```bash
cd rl
source venv/bin/activate
python test_multiple.py
```
**Output**: 5 queries, image inclusion rate

### Production Test (Recommended)
```bash
cd rl
source venv/bin/activate
python production_test.py
```
**Output**: 4 queries with detailed analysis, success rate

### Diagnostic Test (Troubleshooting)
```bash
cd rl
source venv/bin/activate
python diagnose_model.py
```
**Output**: 4 diagnostic tests to identify issues

### Improved Prompt Test
```bash
cd rl
source venv/bin/activate
python test_improved_prompt.py
```
**Output**: Tests with complex prompt (better results)

### Full Evaluation (Compare Prompts)
```bash
cd ../evaluation
./run_evaluation.sh
```
**Output**: Complete comparison, Weave tracking, JSON results

## Test Scripts Overview

| Script | Queries | Purpose | Weave Tracked |
|--------|---------|---------|---------------|
| `test_simple.py` | 1 | Quick validation | ❌ |
| `test_multiple.py` | 5 | Image inclusion check | ❌ |
| `production_test.py` | 4 | Production readiness | ❌ |
| `diagnose_model.py` | 4 | Troubleshooting | ❌ |
| `test_improved_prompt.py` | 3 | Complex prompt test | ❌ |
| `../evaluation/prompt_comparison_eval.py` | 6 | Full evaluation | ✅ |

## System Prompts

### Simple Prompt (Low Performance)
```python
"You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework. When appropriate, include relevant images in your responses using markdown format: ![alt text](image_url)"
```
**Result**: 0% image inclusion ❌

### Complex Prompt (Recommended) ✅
```python
"""You are a helpful AI assistant that provides information about Weave, W&B's LLM observability framework.

IMPORTANT: Always include relevant screenshots and diagrams in your responses using markdown format: ![alt text](image_url)

When answering questions:
1. Provide clear text explanations
2. Include at least one relevant image/screenshot from the Weave documentation
3. Use the format: ![description](https://weave-docs.wandb.ai/assets/images/...)
4. Explain why the image is relevant

Example response format:
"Here's how to use Weave tracing:

[Your explanation here]

![Weave Trace UI](https://weave-docs.wandb.ai/assets/images/trace-example.png)

This screenshot shows the trace interface where you can see..."
"""
```
**Result**: 83.3% image inclusion ✅

## Test Prompts

Example queries to test:

```
1. "How do I trace my LLM calls with Weave?"
2. "What is a Weave Dataset?"
3. "Show me how to use the evaluation playground"
4. "How do I use weave.Model to track my models?"
5. "Explain Weave tracing and show me an example"
6. "How do I create a dataset in Weave?"
```

**Expected**: Text explanation + relevant images

## Model Settings

```python
model = "openpipe:multimodal-agent-v1"
temperature = 0.3  # For consistent, factual responses
max_tokens = 600-800  # Allows detailed explanations + images
```

## Evaluation Results

**Latest Evaluation** (2025-10-06):

| Metric | Simple Prompt | Complex Prompt | Improvement |
|--------|---------------|----------------|-------------|
| Avg Score | 19.2% | 86.7% | **+67.5%** |
| Image Rate | 0.0% | 83.3% | **+83.3%** |
| Images | 0/6 | 5/6 | **+5** |

**Recommendation**: ✅ Use complex prompt in production

## Estimated Cost

- Training: $0.08-$0.30 (1.5B model)
- Time: 30-100 minutes
- Inference: ~$0.001 per query

## Need Help?

- **Full guide**: `OPENPIPE_WEB_GUIDE.md`
- **Evaluation guide**: `../evaluation/QUICK_START.md`
- **Evaluation summary**: `../evaluation/EVALUATION_SUMMARY.md`
- **OpenPipe docs**: https://docs.openpipe.ai
- **Weave dashboard**: https://wandb.ai/richpaul1-stealth/rl-demo

