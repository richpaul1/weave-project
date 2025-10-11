# Local Model Training Strategy: From OpenPipe to Ollama

## 🎯 **Strategic Overview**

Based on our comprehensive model evaluation, we've identified an opportunity to create a local version of our OpenPipe-trained model that can run efficiently on local infrastructure while maintaining domain-specific knowledge about Weave.

### **Why Local Training?**

| Benefit | Description | Impact |
|---------|-------------|---------|
| **Cost Efficiency** | No per-token API costs | 💰 Significant savings for high-volume usage |
| **Speed** | No network latency | ⚡ Faster response times (3-15s vs API calls) |
| **Privacy** | Data stays local | 🔒 Enhanced security for sensitive queries |
| **Offline Capability** | Works without internet | 🌐 Reliable operation in any environment |
| **Customization** | Full control over model behavior | 🎛️ Fine-tune for specific use cases |

## 📊 **Current Model Performance Baseline**

From our evaluation (`rl/evaluate_models/EVALUATION_SUMMARY.md`):

| Model | Quality | Relevance | Images | Overall | Latency |
|-------|---------|-----------|--------|---------|---------|
| **OpenPipe (Target)** | 68.3% | 95.0% | 50.0% | 71.1% | 14.1s |
| **Ollama (Base)** | 58.3% | 100.0% | 66.7% | 75.0% | 15.5s |
| **OpenAI (Reference)** | 85.0% | 100.0% | 50.0% | 78.3% | 12.0s |

### **Goal**: Create a local model that achieves:
- ✅ **Quality**: 70%+ (match/exceed OpenPipe)
- ✅ **Relevance**: 95%+ (maintain domain knowledge)
- ✅ **Images**: 60%+ (leverage Ollama's multimodal strength)
- ✅ **Latency**: <10s (improve on current performance)

## 🗂️ **Training Data Assets**

### **Available Resources**
- **Primary Dataset**: `rl/training_data.json` (1,032 examples)
- **Domain**: Weave LLM observability framework
- **Format**: Multimodal (text + images)
- **Quality**: High-confidence, manually curated

### **Data Characteristics**
```json
{
  "total_examples": 1032,
  "with_images": "~40%",
  "topics": [
    "weave.op() decorators",
    "weave.Model usage", 
    "Evaluation framework",
    "Dataset creation",
    "Tracing and observability"
  ],
  "image_sources": "weave-docs.wandb.ai",
  "confidence_scores": "1.0 (high quality)"
}
```

## 🛠️ **Implementation Strategy**

### **Phase 1: Data Preparation**
1. **Convert OpenPipe Format to Ollama**
   - Transform training data structure
   - Preserve image references
   - Create instruction-response pairs

2. **Data Quality Enhancement**
   - Validate image URLs
   - Standardize response formats
   - Add system prompts

### **Phase 2: Base Model Selection**
Based on our evaluation, optimal base models:

| Model | Pros | Cons | Recommendation |
|-------|------|------|----------------|
| `qwen3:0.6b` | **Current setup**, excellent multimodal | Newer architecture | ✅ **Primary choice** |
| `qwen2.5:1.5b` | Balanced performance | Medium resource usage | 🔄 **Alternative** |
| `qwen2.5:7b` | High quality | Resource intensive | 🔄 **Future upgrade** |

### **Phase 3: Fine-tuning Approach**

#### **Option A: Ollama Native Fine-tuning**
```bash
# Create custom Modelfile with system prompt
# Use training data for context examples
# Leverage Ollama's built-in capabilities
```

#### **Option B: External Fine-tuning + Import**
```bash
# Use tools like Unsloth, LoRA, or QLoRA
# Fine-tune with our training data
# Convert to GGUF format
# Import into Ollama
```

#### **Option C: Hybrid Approach** (Recommended)
```bash
# Start with Ollama native (quick iteration)
# Upgrade to external fine-tuning (better results)
# Maintain both for different use cases
```

## 📋 **Step-by-Step Implementation Plan**

### **Step 1: Environment Setup**
```bash
# Ensure Ollama is running
ollama list

# Verify base model availability
ollama pull qwen2.5:1.5b

# Check system resources
nvidia-smi  # For GPU acceleration
```

### **Step 2: Data Conversion**
```python
# Create conversion script
python convert_training_data.py
# Input: rl/training_data.json
# Output: ollama_training_format.json
```

### **Step 3: Create Base Model**
```bash
# Create Modelfile with Weave-specific system prompt
# Include training examples as context
ollama create qwen3-weave:0.6b -f WeaveModelfile
```

### **Step 4: Iterative Testing**
```python
# Use existing evaluation framework
python ../evaluate_models/model_comparison_eval.py
# Compare: qwen3-weave:0.6b vs openpipe vs baseline
```

### **Step 5: Performance Optimization**
- Adjust temperature, top_p parameters
- Refine system prompt
- Add more training examples if needed
- Optimize for speed vs quality trade-offs

## 🎯 **Success Metrics**

### **Primary KPIs**
- **Quality Score**: Target 70%+ (vs OpenPipe 68.3%)
- **Relevance Score**: Target 95%+ (maintain domain expertise)
- **Image Inclusion**: Target 60%+ (leverage Ollama strength)
- **Response Time**: Target <10s (improve on 14.1s)

### **Secondary Metrics**
- **Cost Savings**: Calculate $/query reduction
- **Offline Reliability**: 100% uptime without internet
- **Resource Usage**: Monitor CPU/GPU/Memory consumption
- **User Satisfaction**: Qualitative feedback on responses

## 🔄 **Iteration Strategy**

### **Version 1.0: Quick Start**
- Basic Ollama Modelfile approach
- Simple system prompt
- Core training data subset
- **Timeline**: 1-2 days

### **Version 2.0: Enhanced Training**
- Full training data integration
- Optimized prompts and parameters
- Performance benchmarking
- **Timeline**: 1 week

### **Version 3.0: Advanced Fine-tuning**
- External fine-tuning tools
- Custom model architecture
- Production deployment
- **Timeline**: 2-3 weeks

## 🚀 **Getting Started**

### **Prerequisites**
- Ollama installed and running
- Python environment with required packages
- Access to training data (`rl/training_data.json`)
- Sufficient system resources (8GB+ RAM recommended)

### **Quick Start Commands**
```bash
# Navigate to training directory
cd rl/train_local

# 1. Setup environment and check prerequisites
python setup_local_training.py

# 2. Convert training data to Ollama format
python convert_training_data.py

# 3. Create qwen3-weave:0.6b model
python create_weave_model.py

# 4. Test the new model
python test_local_model.py

# 5. Use your model
ollama run qwen3-weave:0.6b "How do I trace LLM calls with Weave?"
```

## 📁 **File Structure**
```
rl/train_local/
├── LOCAL_TRAINING_STRATEGY.md     # This strategy document
├── setup_local_training.py        # Environment setup & prerequisites
├── convert_training_data.py       # Data format conversion
├── create_weave_model.py          # Creates qwen3-weave:0.6b model
├── test_local_model.py            # Comprehensive testing & validation
├── WeaveModelfile                 # Ollama model definition (generated)
├── data/
│   ├── ollama_training_format.json    # Converted training data
│   ├── training_examples.txt          # Example conversations
│   └── conversion_stats.json          # Conversion statistics
├── logs/
│   └── model_creation_log.json        # Model creation metadata
└── results/
    └── qwen3_weave_test_*.json         # Test results & comparisons
```

## 🔗 **Related Documentation**
- **Evaluation Results**: `../evaluate_models/EVALUATION_SUMMARY.md`
- **OpenPipe Integration**: `../evaluation/WEAVE_OPENPIPE_INTEGRATION.md`
- **Training Data**: `../training_data.json`
- **Model Comparison**: `../evaluate_models/model_comparison_eval.py`

---

**Next Steps**: 
1. Review this strategy
2. Run `setup_local_training.py` (to be created)
3. Begin with Version 1.0 implementation
4. Iterate based on evaluation results
