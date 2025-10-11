# Model Comparison Evaluation

This directory contains evaluation scripts to compare different models on the same prompts used for training the custom OpenPipe model.

## Models Compared

1. **Local Ollama Model**: `qwen3:0.6b` (from `.env.local`)
2. **OpenAI Model**: `gpt-4` (using `OPEN_API_KEY` from `.env.local`)
3. **Custom OpenPipe Model**: `openpipe:multimodal-agent-v1` (trained model)

## Test Queries

The evaluation uses representative prompts from the training data, covering:
- Weave tracing functionality
- Dataset creation and management
- Model tracking and versioning
- Evaluation framework usage
- Playground interface
- Operations and decorators

## Evaluation Metrics

### 1. Response Quality Scorer
- **Good (1.0)**: 50-300 words, no errors
- **Too Short (0.3)**: < 50 words
- **Too Long (0.7)**: > 300 words
- **Error (0.0)**: API errors or failures

### 2. Weave Relevance Scorer
- **High (1.0)**: 3+ Weave-related keywords
- **Medium (0.7)**: 1-2 Weave-related keywords
- **Low (0.3)**: 0 Weave-related keywords

Keywords: weave, wandb, trace, model, dataset, evaluation, op

### 3. Image Inclusion Scorer
- **With Images (1.0+)**: Bonus for multimodal responses
- **Without Images (0.5)**: Not penalized heavily
- **Bonus**: +0.1 per additional image (max +0.5)

## Setup

1. **Install dependencies:**
   ```bash
   cd rl/evaluate_models
   pip install -r requirements.txt
   ```

2. **Ensure your `.env.local` file has the required keys:**
   ```
   OPEN_API_KEY=your-openai-api-key
   OPEN_PIPE_API_KEY=your-openpipe-api-key
   WANDB_API_KEY=your-wandb-api-key
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen3:0.6b
   ```

3. **Make sure Ollama is running locally:**
   ```bash
   ollama serve
   ollama pull qwen3:0.6b
   ```

## Running the Evaluation

```bash
cd rl/evaluate_models
python model_comparison_eval.py
```

## Expected Output

The evaluation will:
1. Test each model with the same set of prompts
2. Score responses on quality, relevance, and image inclusion
3. Generate a comparison summary showing:
   - Average scores per model
   - Quality distribution (good/too_short/too_long/error)
   - Relevance distribution (high/medium/low)
   - Image inclusion rates
4. Save detailed results to a JSON file
5. Log all interactions to Weave for detailed analysis

## Sample Output

```
📊 MODEL COMPARISON SUMMARY
================================================================================

Model                Quality     Relevance    Images       Overall     
--------------------------------------------------------------------------------
Ollama (Local)          75.0%        85.0%        50.0%        70.0%
OpenAI (GPT-4)          95.0%        90.0%        60.0%        81.7%
OpenPipe (Custom)       88.0%        95.0%        80.0%        87.7%

📈 DETAILED ANALYSIS
================================================================================

🔍 Ollama (Local):
  Quality Distribution:
    good: 4
    too_short: 2
  Relevance Distribution:
    high: 5
    medium: 1
  Image Inclusion:
    With images: 3
    Without images: 3

🔍 OpenAI (GPT-4):
  Quality Distribution:
    good: 6
  Relevance Distribution:
    high: 5
    medium: 1
  Image Inclusion:
    With images: 4
    Without images: 2

🔍 OpenPipe (Custom):
  Quality Distribution:
    good: 5
    too_long: 1
  Relevance Distribution:
    high: 6
  Image Inclusion:
    With images: 5
    Without images: 1
```

## Viewing Results

After running the evaluation:
1. **Console Output**: Immediate summary and analysis
2. **JSON File**: Detailed results saved locally
3. **Weave Dashboard**: Full interaction logs at `https://wandb.ai/{entity}/{project}`

## Key Benefits

1. **Objective Comparison**: Same prompts, same metrics across all models
2. **Training Validation**: See how the custom model performs vs baselines
3. **Cost Analysis**: Compare local vs cloud model performance
4. **Multimodal Assessment**: Evaluate image inclusion capabilities
5. **Weave Integration**: Full observability of all model interactions

## Customization

You can customize the evaluation by:
- Adding more test queries from `training_data.json`
- Adjusting scoring criteria in the scorer functions
- Adding new metrics (latency, cost, etc.)
- Testing different model configurations
- Comparing different system prompts
