# 🌐 OpenPipe Web Platform Training Guide

**Complete step-by-step guide for training your multimodal agent using OpenPipe's web platform**

---

## ✅ Prerequisites Completed

- ✅ Training data extracted: 103 examples
- ✅ Data converted to OpenPipe format: `openpipe_training_data.jsonl`
- ✅ OpenPipe API key configured: `opk_6ac7c97c7c6fac2e88ffd0e0ed4eb4d38364e85957`
- ✅ Weave monitoring configured: WANDB project `rl-demo`

---

## 📋 Step-by-Step Instructions

### Step 1: Access OpenPipe Platform

1. **Open your browser** and go to: https://openpipe.ai
2. **Sign in** with your account
   - If you don't have an account, click "Sign Up"
   - Use the same email associated with your API key

### Step 2: Navigate to Fine-Tuning

1. Once logged in, look for the **"Fine-Tuning"** or **"Training"** section in the navigation
2. Click **"Create New Fine-Tune"** or **"New Training Job"**

### Step 3: Upload Training Data

1. **Upload your training file**:
   - Click "Upload Training Data" or drag-and-drop
   - Select file: `rl/openpipe_training_data.jsonl`
   - Wait for upload to complete (103 examples, ~500KB)

2. **Verify the upload**:
   - OpenPipe will validate the format
   - You should see: "✅ 103 training examples loaded"
   - Preview a few examples to ensure they look correct

### Step 4: Configure Base Model

1. **Select base model**:
   - Model: `Qwen/Qwen2.5-7B-Instruct`
   - Or search for: "Qwen2.5-7B-Instruct"
   
2. **Alternative models** (if Qwen not available):
   - `meta-llama/Llama-3.1-8B-Instruct`
   - `mistralai/Mistral-7B-Instruct-v0.3`
   - `google/gemma-2-9b-it`

### Step 5: Configure Training Parameters

Set the following parameters:

#### Basic Settings
```
Training Method: Fine-Tuning (or RLHF if available)
Number of Epochs: 3-5
Learning Rate: 1e-5 to 5e-5
Batch Size: 4-8
```

#### Advanced Settings (if available)
```
Max Sequence Length: 2048
Warmup Steps: 100
Weight Decay: 0.01
Gradient Accumulation Steps: 2
LoRA Rank: 16 (if using LoRA)
LoRA Alpha: 32
```

#### Recommended Configuration
```yaml
epochs: 3
learning_rate: 1e-5
batch_size: 4
max_length: 2048
warmup_ratio: 0.1
lora_r: 16
lora_alpha: 32
```

### Step 6: Configure Validation Split

1. **Validation split**: 10-20% (OpenPipe may do this automatically)
2. **Evaluation strategy**: "epoch" (evaluate after each epoch)
3. **Save strategy**: "best" (save best checkpoint based on validation loss)

### Step 7: Set Model Name and Description

1. **Model name**: `weave-multimodal-agent-v1`
2. **Description**: 
   ```
   Multimodal agent fine-tuned on Weave documentation.
   Trained to provide text responses with relevant images.
   103 high-quality examples from Weave docs.
   ```

### Step 8: Configure Monitoring (Optional but Recommended)

If OpenPipe supports external monitoring:

1. **Enable Weave tracking**:
   - Weave project: `rl-demo`
   - Entity: `richpaul1-stealth`
   - API key: (use your WANDB_API_KEY from .env.local)

2. **Metrics to track**:
   - Training loss
   - Validation loss
   - Learning rate
   - Gradient norm

### Step 9: Review and Start Training

1. **Review configuration**:
   - Training data: 103 examples ✅
   - Base model: Qwen2.5-7B-Instruct ✅
   - Epochs: 3-5 ✅
   - Learning rate: 1e-5 ✅

2. **Estimate costs** (if shown):
   - Training time: ~1-3 hours
   - Compute cost: Check OpenPipe pricing
   - Storage cost: Minimal

3. **Click "Start Training"** or "Launch Fine-Tune"

### Step 10: Monitor Training Progress

1. **Training dashboard**:
   - Watch training loss decrease
   - Monitor validation metrics
   - Check for overfitting (validation loss increasing)

2. **Expected timeline**:
   - Epoch 1: ~20-40 minutes
   - Epoch 2: ~20-40 minutes
   - Epoch 3: ~20-40 minutes
   - Total: 1-3 hours

3. **What to watch for**:
   - ✅ Training loss steadily decreasing
   - ✅ Validation loss decreasing or stable
   - ⚠️ Validation loss increasing = overfitting (stop early)
   - ⚠️ Training loss not decreasing = learning rate too low

### Step 11: Training Complete

Once training finishes:

1. **Download the model** (if available):
   - Model weights
   - Training logs
   - Evaluation metrics

2. **Get model endpoint**:
   - OpenPipe will provide an API endpoint
   - Or download for local deployment

3. **Test the model**:
   - Use OpenPipe's playground
   - Or test via API

---

## 🧪 Testing Your Trained Model

### Option A: OpenPipe Playground

1. Go to your model in OpenPipe dashboard
2. Click "Playground" or "Test"
3. Try these prompts:

```
Prompt 1: "How do I trace my LLM calls with Weave?"
Expected: Text explanation + trace UI screenshot

Prompt 2: "What is a Weave Dataset?"
Expected: Text explanation + dataset visualization

Prompt 3: "Show me how to use the evaluation playground"
Expected: Text explanation + playground screenshot
```

### Option B: API Testing

Use the OpenPipe API endpoint:

```python
import openai

client = openai.OpenAI(
    api_key="opk_6ac7c97c7c6fac2e88ffd0e0ed4eb4d38364e85957",
    base_url="https://api.openpipe.ai/v1"  # OpenPipe endpoint
)

response = client.chat.completions.create(
    model="weave-multimodal-agent-v1",  # Your model name
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant..."},
        {"role": "user", "content": "How do I trace my LLM calls with Weave?"}
    ]
)

print(response.choices[0].message.content)
```

### Option C: Download and Deploy Locally

If OpenPipe allows model download:

```bash
# Download model
openpipe download weave-multimodal-agent-v1

# Load with transformers
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("./weave-multimodal-agent-v1")
tokenizer = AutoTokenizer.from_pretrained("./weave-multimodal-agent-v1")

# Use in your RAG application
```

---

## 📊 Expected Results

### Training Metrics
- **Final training loss**: 0.5-1.5 (lower is better)
- **Final validation loss**: 0.6-1.8 (should be close to training loss)
- **Perplexity**: 2-6 (lower is better)

### Quality Indicators
- ✅ Model generates coherent text about Weave
- ✅ Model includes relevant images in responses
- ✅ Model explains why images are helpful
- ✅ Model follows the system prompt format

### Comparison to Base Model
- **Before**: Generic responses, no images
- **After**: Weave-specific responses with relevant images

---

## 🔧 Troubleshooting

### Issue: Upload Failed
- **Check file format**: Must be JSONL (one JSON per line)
- **Check file size**: Should be ~500KB
- **Verify JSON**: Each line must be valid JSON

### Issue: Training Not Starting
- **Check credits**: Ensure you have OpenPipe credits
- **Check model availability**: Qwen2.5 might not be available
- **Try different model**: Use Llama or Mistral instead

### Issue: High Validation Loss
- **Reduce learning rate**: Try 5e-6 instead of 1e-5
- **Reduce epochs**: Stop at 2-3 epochs
- **Increase data**: Add more training examples

### Issue: Model Not Generating Images
- **Check training data**: Verify images are in assistant responses
- **Check format**: Images should be in markdown: `![alt](url)`
- **Retrain**: May need more epochs or different hyperparameters

---

## 💰 Cost Estimation

OpenPipe pricing (approximate):
- **Training**: $0.50-$2.00 per 1000 examples
- **Your cost**: ~$0.05-$0.20 for 103 examples
- **Inference**: $0.001-$0.01 per 1000 tokens
- **Storage**: Minimal

**Total estimated cost**: $0.10-$0.50 for training

---

## 🎯 Success Criteria

Your training is successful if:

1. ✅ Training completes without errors
2. ✅ Validation loss < 2.0
3. ✅ Model generates Weave-specific responses
4. ✅ Model includes relevant images
5. ✅ Model explains image relevance

---

## 📝 Next Steps After Training

1. **Test thoroughly** with various prompts
2. **Compare to baseline** (qwen3:0.6b)
3. **Integrate into RAG app** (replace current model)
4. **Monitor performance** in production
5. **Collect feedback** for next iteration
6. **Retrain** with additional data if needed

---

## 🆘 Need Help?

- **OpenPipe Docs**: https://docs.openpipe.ai
- **OpenPipe Discord**: Check their community
- **Your training data**: `rl/openpipe_training_data.jsonl`
- **Configuration**: `rl/multimodal_agent_config.json`

---

## 📁 Files Reference

- `openpipe_training_data.jsonl` - Training data (103 examples)
- `training_data.json` - Original extracted data
- `multimodal_agent_config.json` - Training configuration
- `convert_to_openpipe_format.py` - Conversion script
- `.env.local` - API keys and configuration

---

**Ready to start?** Open https://openpipe.ai and follow the steps above! 🚀

