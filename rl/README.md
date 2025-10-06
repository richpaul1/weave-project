# RL Project: Training Multimodal Agents

This directory contains reinforcement learning algorithms and training scripts for improving AI agents, with a focus on training agents to return both text and images when appropriate.

## Project Overview

The goal is to train a custom model (similar to qwen3:0.6b) that can intelligently decide when to include images alongside text responses, creating a more comprehensive and helpful user experience.

## Directory Structure

```
rl/
├── README.md                           # This file
├── STRATEGY_AND_EXECUTION.md          # Detailed strategy and execution guide
├── analyze_training_data.py            # Extract text-image pairs from markdown
├── train_multimodal_agent.py          # OpenPipe ART training script
├── image_search_tool.py               # Tool implementation for image search
├── run_training.py                    # Main orchestration script
├── multimodal_agent_config.json       # Configuration for training
└── training_data.json                 # Generated training data
```

## Training Pipeline

### Phase 1: Data Collection and Analysis

1. **Extract Training Data**
   ```bash
   cd rl
   python analyze_training_data.py \
     --storage-path ../admin/storage/content \
     --docs-path ../docs \
     --output training_data.json \
     --min-confidence 0.4
   ```

   This script:
   - **Scans only storage/content directory** (excludes README.md and other root files)
   - Extracts text-image pairs from markdown files
   - Extracts context around images
   - Calculates confidence scores for training quality
   - **Filters out badge URLs** (shields.io, colab badges, CI/CD badges)
   - Exports structured training data

2. **Excluded Image Patterns**

   The analyzer automatically filters out non-informative images:
   - `img.shields.io/badge` - GitHub badges
   - `colab.research.google.com/assets/colab-badge` - Colab badges
   - `badge.fury.io`, `travis-ci.org`, `circleci.com` - CI/CD badges
   - `codecov.io`, `mybinder.org/badge` - Coverage/deployment badges

3. **Data Quality Assessment**
   - High quality pairs (≥0.7): Rich context, descriptive alt text
   - Medium quality pairs (0.4-0.7): Some context, basic descriptions
   - Low quality pairs (<0.4): Minimal context, poor descriptions

### Phase 2: Model Training with OpenPipe ART

1. **Install Dependencies**
   ```bash
   pip install openpipe-art[backend,langgraph]
   pip install weave
   pip install litellm
   pip install tenacity
   ```

2. **Configure Training**
   Edit `multimodal_agent_config.json` to adjust:
   - Learning rate
   - Number of epochs
   - Batch sizes
   - Model selection

3. **Run Training**
   ```bash
   python train_multimodal_agent.py
   ```

   The training process:
   - Uses OpenPipe ART's reinforcement learning framework
   - Employs RULER for automatic reward scoring
   - Integrates with Weave for observability
   - Trains the model to output structured JSON with text and images

### Phase 3: Integration and Deployment

1. **Tool Integration**
   - The `image_search_tool.py` provides the agent with image search capabilities
   - Integrated into the existing tool calling system
   - Allows the agent to find relevant images dynamically

2. **Agent Enhancement**
   - Modified prompts to encourage multimodal responses
   - Updated response parsing to handle text + image outputs
   - Enhanced evaluation metrics for multimodal quality

## Key Features

### Intelligent Image Selection
- **Context-Aware**: Analyzes query context to determine when images are helpful
- **Relevance Scoring**: Uses confidence scores to select the best images
- **Type Classification**: Categorizes images (screenshots, diagrams, charts, etc.)

### Training Data Quality
- **Automated Extraction**: Finds text-image pairs from existing documentation
- **Confidence Scoring**: Rates training examples based on context richness
- **Filtering**: Removes low-quality pairs to improve training efficiency

### OpenPipe ART Integration
- **RULER Scoring**: Automatic evaluation without manual labeling
- **Weave Observability**: Full training visibility and debugging
- **LangGraph Compatibility**: Works with existing agent frameworks

## Configuration

### Training Parameters
```json
{
  "model_name": "Qwen/Qwen2.5-7B-Instruct",
  "training": {
    "groups_per_step": 2,
    "num_epochs": 5,
    "rollouts_per_group": 4,
    "learning_rate": 1e-5,
    "max_steps": 10
  },
  "evaluation": {
    "min_confidence": 0.4,
    "judge_model": "openai/gpt-4o-mini",
    "criteria": ["text_quality", "image_relevance", "image_completeness"]
  }
}
```

### Environment Variables
```bash
# Required for OpenPipe ART
export WANDB_API_KEY="your-wandb-key"
export WANDB_PROJECT="multimodal-agent-training"

# Optional: OpenAI for evaluation
export OPENAI_API_KEY="your-openai-key"
```

## Usage Examples

### 1. Analyze Existing Data
```bash
python analyze_training_data.py \
  --storage-path ./storage/content \
  --docs-path ./docs \
  --output training_data.json \
  --min-confidence 0.5
```

### 2. Train Multimodal Agent
```bash
# Basic training
python train_multimodal_agent.py

# With custom config
python train_multimodal_agent.py --config multimodal_agent_config.json
```

### 3. Run Complete Pipeline
```bash
# Full pipeline
python run_training.py

# Data analysis only
python run_training.py --data-only

# Test image search only
python run_training.py --test-only
```

### 4. Test Trained Model
```python
from train_multimodal_agent import MultimodalAgentTrainer

trainer = MultimodalAgentTrainer()
response = await trainer.generate_response(
    "How do I set up Weave monitoring?",
    context="Documentation about Weave setup and configuration"
)
print(f"Text: {response.text}")
print(f"Images: {response.images}")
```

## Expected Outcomes

### Before Training
- Agent returns only text responses
- No visual aids or illustrations
- Limited helpfulness for visual concepts

### After Training
- Agent intelligently includes relevant images
- Provides both text explanations and visual aids
- Enhanced user experience with multimodal responses
- Better comprehension of complex topics

## Monitoring and Evaluation

### Weave Integration
- Track training progress in real-time
- Monitor reward scores and convergence
- Debug failed training examples
- Visualize agent improvement over time

### Quality Metrics
- **Text Quality**: Relevance and accuracy of text responses
- **Image Relevance**: How well images match the content
- **Image Completeness**: Whether all helpful images are included
- **Overall Score**: Combined multimodal response quality

## Next Steps

1. **Data Expansion**: Crawl more websites to increase training data
2. **Model Variants**: Experiment with different base models
3. **Fine-tuning**: Adjust hyperparameters based on initial results
4. **Production Deployment**: Integrate trained model into the main agent
5. **User Feedback**: Collect real-world usage data for further improvement

## Troubleshooting

### Common Issues
- **Low Training Data**: Increase crawling depth or add more sources
- **Poor Image Quality**: Adjust confidence thresholds
- **Training Convergence**: Modify learning rate or batch size
- **Memory Issues**: Reduce batch size or use gradient checkpointing

### Debug Commands
```bash
# Check training data quality
python analyze_training_data.py --output debug_data.json --min-confidence 0.0

# Validate OpenPipe ART setup
python -c "import art; print('ART installed successfully')"

# Test Weave connection
python -c "import weave; weave.init('test-project')"
```

This RL project represents a significant step toward more intelligent, multimodal AI agents that can provide richer, more helpful responses to users.
