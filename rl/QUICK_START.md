# Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide will get you up and running with the multimodal agent training pipeline quickly.

## Prerequisites

- Python 3.10+
- Access to your existing markdown documentation
- (Optional) OpenAI API key for evaluation
- (Optional) Weights & Biases account for training monitoring

## Step 1: Test Current Setup

```bash
cd rl

# Test image search functionality
python image_search_tool.py
```

**Expected Output**: Should find and index 13 images from your README.md and show search results for test queries.

## Step 2: Analyze Your Training Data

```bash
# Extract training pairs from your documentation
python analyze_training_data.py \
  --storage-path ./storage/content \
  --docs-path ./docs \
  --output training_data.json \
  --min-confidence 0.4
```

**Expected Output**: 
- 13 high-quality text-image pairs extracted
- Average confidence score: 0.92
- Training data saved to `training_data.json`

## Step 3: Review Training Data

```bash
# View the first few training examples
head -50 training_data.json

# Count high-quality examples
cat training_data.json | jq '.[] | select(.confidence_score > 0.7) | .training_id' | wc -l
```

## Step 4: Install Training Dependencies (Optional)

Only needed if you want to run the actual model training:

```bash
pip install openpipe-art[backend,langgraph]
pip install weave wandb litellm tenacity
```

## Step 5: Configure Environment (Optional)

```bash
# For training monitoring
export WANDB_API_KEY="your-wandb-key"
export WANDB_PROJECT="multimodal-agent-training"

# For evaluation (optional)
export OPENAI_API_KEY="your-openai-key"
```

## Step 6: Run Training Pipeline

### Option A: Full Pipeline (Requires OpenPipe ART)
```bash
python run_training.py
```

### Option B: Data Analysis Only
```bash
python run_training.py --data-only
```

### Option C: Test Image Search Only
```bash
python run_training.py --test-only
```

## What You Get

### ✅ **Working Components**
- **Image Search Tool**: Indexes and searches 13 images from your documentation
- **Training Data Extractor**: Extracts high-quality text-image pairs
- **Configuration System**: Comprehensive training configuration
- **Pipeline Orchestrator**: Manages the complete training workflow

### 📊 **Current Training Data**
- **13 text-image pairs** extracted from README.md
- **0.92 average confidence** score (very high quality)
- **12 high-quality pairs** (≥0.7 confidence)
- **Diverse image types**: Screenshots, diagrams, badges, charts

### 🎯 **Training Examples Include**
- Content ingestion screenshots (`docs/images/content1.png`)
- Chat interface examples (`docs/images/chat1.png`, `docs/images/chat2.png`)
- Weave dashboard screenshots (`docs/images/weave1.png`)
- Graph visualizations (`docs/images/graph.png`)
- Technology badges (Weave, Node.js, Python, etc.)

## Next Steps

### Immediate (No Additional Setup Required)
1. **Test the image search**: `python image_search_tool.py`
2. **Review training data**: `cat training_data.json | jq '.'`
3. **Understand the pipeline**: Read `README.md` and `STRATEGY_AND_EXECUTION.md`

### Short-term (Expand Training Data)
1. **Add more documentation**: Crawl additional websites with images
2. **Manual curation**: Add high-quality text-image examples
3. **Improve confidence scoring**: Adjust the scoring algorithm

### Long-term (Full Training)
1. **Install OpenPipe ART**: Set up the training environment
2. **Run training**: Execute the full RL training pipeline
3. **Deploy model**: Integrate trained model into your agent

## File Structure

```
rl/
├── README.md                      # Comprehensive documentation
├── STRATEGY_AND_EXECUTION.md     # Detailed strategy guide
├── QUICK_START.md                # This file
├── analyze_training_data.py       # Extract text-image pairs
├── train_multimodal_agent.py     # OpenPipe ART training script
├── image_search_tool.py          # Image search functionality
├── run_training.py               # Main pipeline orchestrator
├── multimodal_agent_config.json  # Training configuration
└── training_data.json            # Extracted training data (13 pairs)
```

## Troubleshooting

### Image Search Returns No Results
- Check that `docs/images/` directory exists
- Verify README.md contains image references
- Run with debug: `python image_search_tool.py`

### Training Data Extraction Fails
- Ensure markdown files exist in specified paths
- Check file permissions
- Verify image syntax in markdown files

### OpenPipe ART Import Errors
- This is expected if you haven't installed the training dependencies
- Use `--data-only` or `--test-only` flags to skip training components

## Success Indicators

✅ **Image search finds 13 images**  
✅ **Training data extraction succeeds with 0.92 confidence**  
✅ **Pipeline runs without errors in test mode**  
✅ **Configuration files are valid JSON**  

## Support

- **Documentation**: See `README.md` for detailed information
- **Strategy**: See `STRATEGY_AND_EXECUTION.md` for implementation plan
- **Issues**: Check the troubleshooting section above

---

**You're ready to start training multimodal agents!** 🎉

The foundation is solid with high-quality training data and working tools. You can begin with data analysis and image search testing, then progress to full model training when ready.
