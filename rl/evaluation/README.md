# Evaluation Suite

This folder contains evaluation scripts for the Weave Multimodal Agent.

## Files

### `prompt_comparison_eval.py`
Compares the performance of two different system prompts:
- **Simple Prompt**: Basic instruction to include images
- **Complex Prompt**: Detailed instructions with examples

**Metrics tracked:**
- Image inclusion rate
- Response quality score
- Word count
- Image count

**Usage:**
```bash
cd rl/evaluation
source ../venv/bin/activate
python prompt_comparison_eval.py
```

**Output:**
- Console summary with scores and metrics
- JSON file with detailed results
- Weave tracking for all queries and responses

## Evaluation Criteria

Each response is scored on:
1. **Image Inclusion (40 points)**: Does the response include images?
2. **Response Length (20 points)**: Is the response appropriately sized (150-500 words)?
3. **Image Count (20 points)**: Does it include at least one image?
4. **Expectation Match (20 points)**: Does it meet the expected behavior?

**Total: 100 points**

## Results

Results are saved as JSON files with timestamp:
- `evaluation_results_YYYYMMDD_HHMMSS.json`

Each result includes:
- Query and response pairs
- Evaluation scores
- Summary statistics
- Comparison metrics

## Weave Integration

All evaluations are tracked in Weave:
- Project: `rl-demo`
- Entity: `richpaul1-stealth`
- View at: https://wandb.ai/richpaul1-stealth/rl-demo

## Next Steps

After running the evaluation:
1. Review the summary statistics
2. Check individual query results
3. Decide which prompt to use in production
4. Monitor performance in Weave dashboard

