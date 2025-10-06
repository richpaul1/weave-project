# 🎯 START HERE - OpenPipe Web Training

**Everything you need to train your multimodal agent is ready!**

---

## ✅ What's Ready

- ✅ **103 training examples** extracted from Weave docs
- ✅ **Converted to OpenPipe format**: `openpipe_training_data.jsonl`
- ✅ **API keys configured** in `.env.local`
- ✅ **Training configuration** prepared
- ✅ **Documentation** complete

---

## 🚀 Next Action: Upload to OpenPipe

### 1. Open OpenPipe
Manually open your browser and go to:
```
https://openpipe.ai
```

### 2. Sign In
Use your OpenPipe account credentials

### 3. Upload Training File
Upload this file:
```
/Users/richard/work/weave-setup/rl/openpipe_training_data.jsonl
```

**File details:**
- Format: JSONL (JSON Lines)
- Size: ~500KB
- Examples: 103
- Quality: 88% high-confidence

---

## ⚙️ Training Settings

When configuring your training job, use these settings:

### Basic Configuration
```
Base Model:      Qwen/Qwen2.5-7B-Instruct
Model Name:      weave-multimodal-agent-v1
Training Method: Fine-Tuning
```

### Hyperparameters
```
Epochs:          3-5
Learning Rate:   1e-5 (0.00001)
Batch Size:      4-8
Max Length:      2048
```

### Advanced (if available)
```
LoRA Rank:       16
LoRA Alpha:      32
Warmup Ratio:    0.1
Weight Decay:    0.01
```

---

## 📊 What to Expect

### Training Time
- **Duration**: 1-3 hours
- **Cost**: $0.10-$0.50 (estimated)

### Progress
- Epoch 1: ~20-40 minutes
- Epoch 2: ~20-40 minutes  
- Epoch 3: ~20-40 minutes

### Success Indicators
- ✅ Training loss decreasing
- ✅ Validation loss < 2.0
- ✅ No errors during training

---

## 🧪 After Training: Test Your Model

Try these prompts in OpenPipe's playground:

### Test 1: Tracing
```
Prompt: "How do I trace my LLM calls with Weave?"

Expected Response:
- Text explanation of Weave tracing
- Screenshot of trace UI
- Explanation of why the image is helpful
```

### Test 2: Datasets
```
Prompt: "What is a Weave Dataset?"

Expected Response:
- Text explanation of datasets
- Dataset visualization image
- Context about the image
```

### Test 3: Playground
```
Prompt: "Show me how to use the evaluation playground"

Expected Response:
- Text guide to playground
- Playground screenshot
- Description of the interface
```

---

## 📁 Important Files

### Training Data
- `openpipe_training_data.jsonl` - **Upload this file**
- `training_data.json` - Original extracted data

### Documentation
- `OPENPIPE_WEB_GUIDE.md` - **Detailed step-by-step guide**
- `QUICK_REFERENCE.md` - Quick reference card
- `TRAINING_READY.md` - Complete status report

### Configuration
- `.env.local` - Your API keys
- `multimodal_agent_config.json` - Training config

---

## 🔑 Your Credentials

```bash
# OpenPipe
API Key: opk_6ac7c97c7c6fac2e88ffd0e0ed4eb4d38364e85957

# Weights & Biases (for monitoring)
WANDB_API_KEY: 07d1775877b89b133aa54a7c47bb7b570c9d98ae
WANDB_PROJECT: rl-demo
WANDB_ENTITY: richpaul1-stealth
```

---

## 📖 Documentation Guide

1. **START_HERE.md** (this file) - Quick start
2. **QUICK_REFERENCE.md** - One-page reference
3. **OPENPIPE_WEB_GUIDE.md** - Detailed walkthrough
4. **TRAINING_READY.md** - Complete status report

---

## 🎓 Training Data Overview

### Quality Breakdown
```
Total examples:        103
High quality (≥0.7):   91 (88.3%)
Medium quality:        12 (11.7%)
Average confidence:    0.88
```

### Top Sources
1. intro_notebook.md - 12 examples
2. tracking-tracing.md - 10 examples
3. datasets.md - 10 examples
4. comparison.md - 8 examples
5. playground.md - 7 examples

### Content Types
- UI screenshots with explanations
- Diagrams with context
- Code examples with outputs
- Feature demonstrations

---

## 🎯 Success Criteria

Your model is ready when:

1. ✅ Training completes without errors
2. ✅ Validation loss < 2.0
3. ✅ Model generates Weave-specific text
4. ✅ Model includes relevant images
5. ✅ Model explains image relevance

---

## 🔄 Integration Plan

After successful training:

### Step 1: Test Thoroughly
- Use OpenPipe playground
- Test with various Weave questions
- Verify image inclusion

### Step 2: Get API Endpoint
- OpenPipe will provide an endpoint
- Or download model for local use

### Step 3: Update RAG Application
Replace current model (qwen3:0.6b) with new model:

```python
# Before
model = "qwen3:0.6b"

# After
model = "weave-multimodal-agent-v1"
# Use OpenPipe endpoint or local deployment
```

### Step 4: Monitor Performance
- Track response quality
- Monitor image relevance
- Collect user feedback

### Step 5: Iterate
- Gather more training examples
- Retrain with improved data
- Fine-tune hyperparameters

---

## 🆘 Troubleshooting

### Can't upload file?
- Check file format (must be .jsonl)
- Verify file size (~500KB)
- Try different browser

### Training fails?
- Check OpenPipe credits
- Verify model availability
- Try different base model

### Model not generating images?
- Check training data format
- Increase epochs
- Adjust learning rate

### Need more help?
- Read: `OPENPIPE_WEB_GUIDE.md`
- Visit: https://docs.openpipe.ai
- Check: OpenPipe Discord/Support

---

## 💡 Pro Tips

1. **Start with 3 epochs** - You can always train more
2. **Monitor validation loss** - Stop if it increases
3. **Test early and often** - Check after each epoch
4. **Save checkpoints** - Keep best performing version
5. **Document results** - Track what works

---

## 🎉 You're Ready!

Everything is prepared. Just:

1. Open https://openpipe.ai in your browser
2. Sign in
3. Upload `openpipe_training_data.jsonl`
4. Configure with settings above
5. Start training!

**Good luck! Your multimodal agent training starts now! 🚀**

---

## 📞 Questions?

If you need clarification on any step, refer to:
- **OPENPIPE_WEB_GUIDE.md** for detailed instructions
- **QUICK_REFERENCE.md** for quick lookup
- **TRAINING_READY.md** for technical details

**File location**: `/Users/richard/work/weave-setup/rl/`

