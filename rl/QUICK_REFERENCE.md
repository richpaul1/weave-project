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
OpenPipe API Key: opk_6ac7c97c7c6fac2e88ffd0e0ed4eb4d38364e85957
WANDB API Key:    07d1775877b89b133aa54a7c47bb7b570c9d98ae
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
3. **Create new fine-tune**
4. **Upload**: `rl/openpipe_training_data.jsonl`
5. **Select model**: Qwen/Qwen2.5-7B-Instruct
6. **Set epochs**: 3-5
7. **Set learning rate**: 1e-5
8. **Name**: weave-multimodal-agent-v1
9. **Start training**
10. **Wait**: 1-3 hours

## Test Prompts

After training, test with:

```
1. "How do I trace my LLM calls with Weave?"
2. "What is a Weave Dataset?"
3. "Show me how to use the evaluation playground"
```

Expected: Text + relevant images

## Estimated Cost

- Training: $0.10-$0.50
- Time: 1-3 hours

## Need Help?

- Full guide: `OPENPIPE_WEB_GUIDE.md`
- OpenPipe docs: https://docs.openpipe.ai

