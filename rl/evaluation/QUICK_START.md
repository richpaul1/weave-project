# Evaluation Quick Start Guide

## 🚀 Running the Evaluation

### Option 1: Quick Run (Recommended)
```bash
cd rl/evaluation
./run_evaluation.sh
```

### Option 2: Manual Run
```bash
cd rl/evaluation
source ../venv/bin/activate
python prompt_comparison_eval.py
```

---

## 📊 Viewing Results

### View Detailed Analysis
```bash
python view_results.py
```

### Read Summary
```bash
cat EVALUATION_SUMMARY.md
```

### View in Weave
Open: https://wandb.ai/richpaul1-stealth/rl-demo

---

## 📁 Files in This Folder

| File | Description |
|------|-------------|
| `prompt_comparison_eval.py` | Main evaluation script |
| `view_results.py` | Detailed results viewer |
| `run_evaluation.sh` | Quick run script |
| `README.md` | Documentation |
| `EVALUATION_SUMMARY.md` | Latest evaluation summary |
| `evaluation_results_*.json` | Evaluation results (timestamped) |
| `weave_export.json` | Data export for Weave |

---

## 🎯 What Gets Evaluated

### Two Prompts Compared:

**Simple Prompt:**
- Basic instruction to include images
- Minimal guidance

**Complex Prompt:**
- Detailed instructions with examples
- Explicit formatting requirements
- Step-by-step guidance

### Test Queries (6 total):
1. How do I trace my LLM calls with Weave?
2. What is a Weave Dataset?
3. Show me how to use the evaluation playground
4. How do I use weave.Model to track my models?
5. Explain Weave tracing and show me an example
6. How do I create a dataset in Weave?

### Scoring Criteria (100 points):
- **Image Inclusion** (40 pts): Does response include images?
- **Response Length** (20 pts): Is it 150-500 words?
- **Image Count** (20 pts): At least one image?
- **Expectation Match** (20 pts): Meets expected behavior?

---

## 📈 Latest Results

**Date**: 2025-10-06

| Metric | Simple | Complex | Improvement |
|--------|--------|---------|-------------|
| Avg Score | 19.2% | 86.7% | **+67.5%** |
| Image Rate | 0.0% | 83.3% | **+83.3%** |
| Images | 0/6 | 5/6 | **+5** |

**Conclusion**: ✅ Complex prompt is **significantly better**

---

## 💡 Next Steps

1. **Review Results**
   ```bash
   python view_results.py
   ```

2. **Check Weave Dashboard**
   - All queries tracked with Weave
   - View at: https://wandb.ai/richpaul1-stealth/rl-demo

3. **Deploy to Production**
   - Use complex prompt from `EVALUATION_SUMMARY.md`
   - Reference: `../rl/production_test.py`

4. **Monitor Performance**
   - Run evaluation weekly
   - Track user feedback
   - Adjust prompt as needed

---

## 🔧 Customizing the Evaluation

### Add More Test Queries

Edit `prompt_comparison_eval.py`:

```python
TEST_QUERIES = [
    {
        "id": "q7",
        "query": "Your new query here",
        "category": "your_category",
        "expected_image": True
    },
    # ... add more
]
```

### Adjust Scoring Criteria

Edit the `evaluate_response()` function in `prompt_comparison_eval.py`

### Change Temperature

Modify the `query_model()` function:

```python
temperature=0.3  # Change this value
```

---

## 📞 Troubleshooting

### Error: "OPEN_PIPE_API_KEY not found"
- Check `../../.env.local` file exists (workspace root)
- Verify API key is set: `OPEN_PIPE_API_KEY=opk_...`

### Error: "openpipe module not found"
```bash
source ../venv/bin/activate
pip install openpipe
```

### Error: "weave module not found"
```bash
source ../venv/bin/activate
pip install weave
```

---

## 🎓 Understanding the Results

### High Score (80-100%)
- ✅ Includes images
- ✅ Good response length
- ✅ Meets expectations
- **Action**: Prompt is working well

### Medium Score (40-79%)
- ⚠️ May include images inconsistently
- ⚠️ Response length varies
- **Action**: Review and adjust prompt

### Low Score (0-39%)
- ❌ No images included
- ❌ Poor response quality
- **Action**: Prompt needs major revision

---

## 📚 Additional Resources

- **Production Test**: `../rl/production_test.py`
- **Training Config**: `../rl/multimodal_agent_config.json`
- **Training Data**: `../rl/training_data.json`
- **Weave Docs**: https://weave-docs.wandb.ai

---

**Last Updated**: 2025-10-06  
**Status**: ✅ Evaluation system ready

