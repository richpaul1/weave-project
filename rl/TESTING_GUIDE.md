# Testing Guide for Weave Multimodal Agent

Complete guide for testing your trained model.

---

## 🚀 Quick Start

### 1. Simple Test (Fastest)
```bash
cd rl
source venv/bin/activate
python test_simple.py
```

**What it does**: Tests one query, shows if model includes images  
**Time**: ~10 seconds  
**Use when**: Quick validation after training

---

## 📊 All Test Scripts

### Test 1: `test_simple.py` - Single Query Test

**Purpose**: Quick validation  
**Queries**: 1  
**Time**: ~10 seconds

```bash
python test_simple.py
```

**Output**:
```
✅ Using OpenPipe API key: opk_6ac7c97c7c6fac2e...
🧪 Testing model: openpipe:multimodal-agent-v1

📝 Response:
================================================================================
[Model response here]
================================================================================

🖼️  Includes image: ✅ Yes / ❌ No
📊 Length: XXX words
```

**What to check**:
- ✅ Model responds without errors
- ✅ Response is coherent
- ⚠️ May not include images (depends on prompt)

---

### Test 2: `test_multiple.py` - Multiple Queries

**Purpose**: Check image inclusion rate  
**Queries**: 5  
**Time**: ~30-60 seconds

```bash
python test_multiple.py
```

**Output**:
```
🧪 Testing model with multiple queries
================================================================================

📝 Test 1: How do I trace my LLM calls with Weave?
--------------------------------------------------------------------------------
✅ Response (299 words):
[Response preview...]
🖼️  Includes image: ❌ NO
--------------------------------------------------------------------------------
[... 4 more tests ...]

🎯 Summary: Check how many responses included images
```

**What to check**:
- Image inclusion rate (should be 0% with simple prompt)
- Response quality
- Consistency across queries

---

### Test 3: `production_test.py` - Production Readiness ⭐

**Purpose**: Full production validation  
**Queries**: 4  
**Time**: ~60-90 seconds  
**Recommended**: ✅ Use this before deploying

```bash
python production_test.py
```

**Output**:
```
🚀 Weave Multimodal Agent - Production Test
================================================================================

Model: openpipe:multimodal-agent-v1
Temperature: 0.3 (factual responses)
System Prompt: Optimized for image inclusion

================================================================================

📝 Test 1/4
================================================================================
💬 Query: How do I trace my LLM calls with Weave?
🎯 Expected: Text explanation + trace UI screenshot

⏳ Calling model...

✅ Response received:
--------------------------------------------------------------------------------
[Full response]
--------------------------------------------------------------------------------

📊 Analysis:
   - Word count: 214
   - Includes images: ✅ YES
   - Image count: 1

📸 Images:
   - Weave Trace Dashboard
     URL: https://weave-docs.wandb.ai/assets/images/trace-dashboard.png

[... 3 more tests ...]

================================================================================
📊 PRODUCTION TEST SUMMARY
================================================================================

Total tests: 4
Successful (with images): 4
Success rate: 100.0%

================================================================================
✅ PASS: Model is production-ready!

💡 Next steps:
   1. Deploy to production
   2. Monitor performance with Weave
   3. Collect user feedback
```

**What to check**:
- ✅ Success rate should be ≥75% for production
- ✅ All responses should include images
- ✅ Response quality is high

---

### Test 4: `diagnose_model.py` - Troubleshooting

**Purpose**: Diagnose issues  
**Queries**: 4 diagnostic tests  
**Time**: ~60-90 seconds

```bash
python diagnose_model.py
```

**Output**:
```
🔍 Diagnostic Tests for Multimodal Agent
================================================================================

📝 Test 1: Explicitly ask for an image
--------------------------------------------------------------------------------
[Response]
🖼️  Has image: ✅ YES

📝 Test 2: Use text from actual training data
--------------------------------------------------------------------------------
Using training example from: tutorial-weave_models.md
Expected to include: [image URL]
[Response]
🖼️  Has image: ❌ NO

📝 Test 3: Ask model about its capabilities
--------------------------------------------------------------------------------
[Response]
🖼️  Has image: ✅ YES

📝 Test 4: Same query with higher temperature (0.8)
--------------------------------------------------------------------------------
[Response]
🖼️  Has image: ❌ NO

================================================================================
🎯 Diagnosis Summary
================================================================================

If NO images in any test:
  → Model didn't learn to generate images
  → Need to retrain with more epochs or higher learning rate

If images only in Test 2:
  → Model memorized training data but didn't generalize
  → Need more diverse training data

If images in Test 3 or 4:
  → Model knows about images but needs stronger prompting
  → Adjust system prompt or temperature
```

**What to check**:
- Which tests include images?
- Does model know about images at all?
- Is it a prompt issue or training issue?

---

### Test 5: `test_improved_prompt.py` - Complex Prompt Test

**Purpose**: Test with optimized prompt  
**Queries**: 3  
**Time**: ~30-45 seconds

```bash
python test_improved_prompt.py
```

**Output**:
```
🧪 Testing with Improved System Prompt
================================================================================

📝 Test 1: How do I trace my LLM calls with Weave?
--------------------------------------------------------------------------------
✅ Response:
[Response with image]
🖼️  Includes image: ✅ YES
📸 Images found: 1
   - Weave Trace UI: https://weave-docs.wandb.ai/assets/images/trace-example.png

[... 2 more tests ...]

🎯 Result: Check if improved prompt increases image inclusion
```

**What to check**:
- ✅ Should have 100% image inclusion
- ✅ Better than simple prompt
- ✅ Ready for production

---

### Test 6: Full Evaluation - Prompt Comparison

**Purpose**: Complete evaluation with Weave tracking  
**Queries**: 6 (tested with 2 prompts = 12 total)  
**Time**: ~3-5 minutes  
**Weave Tracked**: ✅ Yes

```bash
cd ../evaluation
./run_evaluation.sh
```

**Output**:
```
🧪 Starting Prompt Comparison Evaluation
================================================================================

Model: openpipe:multimodal-agent-v1
Test queries: 6
Temperature: 0.3

📝 Testing with SIMPLE PROMPT
[6 tests...]

📝 Testing with COMPLEX PROMPT
[6 tests...]

================================================================================
📊 EVALUATION SUMMARY
================================================================================

Metric                         Simple Prompt        Complex Prompt      
--------------------------------------------------------------------------------
Average Score                                19.2%               86.7%
Image Inclusion Rate                          0.0%               83.3%

✅ RESULT: Complex prompt significantly outperforms simple prompt
💡 RECOMMENDATION: Use complex prompt in production

📁 Results saved to: evaluation_results_20251006_093417.json
🔗 View in Weave: https://wandb.ai/richpaul1-stealth/rl-demo
```

**What to check**:
- ✅ Complex prompt should score ≥80%
- ✅ Image inclusion rate ≥75%
- ✅ View detailed results in Weave

---

## 🎯 Which Test Should I Use?

| Scenario | Recommended Test | Why |
|----------|------------------|-----|
| Just finished training | `production_test.py` | Complete validation |
| Quick check | `test_simple.py` | Fast feedback |
| Model not including images | `diagnose_model.py` | Find the issue |
| Before production deploy | `production_test.py` | Full validation |
| Weekly monitoring | `../evaluation/run_evaluation.sh` | Track over time |
| Comparing prompts | `test_improved_prompt.py` | A/B testing |

---

## 📊 Understanding Results

### Success Criteria

**Production Ready** ✅:
- Image inclusion rate: ≥75%
- Success rate: ≥75%
- Response quality: Good (150-500 words)
- No errors

**Needs Improvement** ⚠️:
- Image inclusion rate: 25-74%
- Success rate: 50-74%
- Inconsistent quality

**Needs Retraining** ❌:
- Image inclusion rate: <25%
- Success rate: <50%
- Poor response quality
- Frequent errors

---

## 🔧 Troubleshooting

### Issue: Model doesn't include images

**Diagnosis**:
```bash
python diagnose_model.py
```

**Solutions**:
1. Use complex prompt (see `QUICK_REFERENCE.md`)
2. Increase temperature to 0.5-0.7
3. Explicitly ask for images in query
4. Retrain with more epochs

### Issue: Responses are too short/long

**Check**: Word count in test output

**Solutions**:
- Adjust `max_tokens` parameter
- Modify system prompt
- Check training data quality

### Issue: Model returns errors

**Check**: Error messages in test output

**Solutions**:
1. Verify API key is correct
2. Check model name: `openpipe:multimodal-agent-v1`
3. Ensure model training completed
4. Check OpenPipe dashboard for model status

---

## 📈 Monitoring in Production

### Track with Weave

All evaluation tests are tracked in Weave:
- **Project**: rl-demo
- **Entity**: richpaul1-stealth
- **URL**: https://wandb.ai/richpaul1-stealth/rl-demo

### Weekly Evaluation

Run weekly to track performance:
```bash
cd rl/evaluation
./run_evaluation.sh
```

Compare results over time to detect:
- Performance degradation
- Prompt effectiveness
- Model drift

---

## 🎓 Best Practices

1. **Always test after training**
   - Run `production_test.py` immediately
   - Verify image inclusion rate

2. **Use complex prompt in production**
   - 83.3% image inclusion vs 0%
   - Significantly better results

3. **Monitor with Weave**
   - Track all production queries
   - Analyze user feedback
   - Detect issues early

4. **Run evaluations weekly**
   - Track performance over time
   - Identify trends
   - Adjust prompts as needed

5. **Test before deploying changes**
   - New prompts
   - Model updates
   - Configuration changes

---

## 📚 Additional Resources

- **Quick Reference**: `QUICK_REFERENCE.md`
- **Evaluation Guide**: `../evaluation/QUICK_START.md`
- **Evaluation Summary**: `../evaluation/EVALUATION_SUMMARY.md`
- **Production Code**: `production_test.py`
- **Weave Dashboard**: https://wandb.ai/richpaul1-stealth/rl-demo

---

**Last Updated**: 2025-10-06  
**Status**: ✅ All tests ready for use

