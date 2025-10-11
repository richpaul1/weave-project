# Single Prompt Evaluation System

This evaluation system tests **the same prompt** across multiple models to compare how different models respond to the image-generating prompt that performed best in our previous evaluations.

## 🎯 Purpose

- **Single Prompt Focus**: Tests the prompt that generated the most images: *"How do I trace my LLM calls with Weave? Please include relevant images and examples."*
- **Model Comparison**: Compares responses across 4 different models
- **Detailed Analysis**: Provides full response text, image analysis, and quality metrics
- **Image Generation Focus**: Specifically analyzes which models generate the most images

## 📁 Files

### `single_prompt_eval.py`
Main evaluation script that:
- Tests the same prompt across all models
- Measures response quality, image generation, and Weave-specific content
- Saves results with timestamps
- Provides summary statistics

### `detailed_response_analyzer.py`
Analysis script that:
- Shows full responses from each model
- Analyzes image generation patterns
- Compares response quality metrics
- Identifies best-performing models

### `README.md`
This documentation file

## 🚀 Quick Start

### 1. Run the Evaluation
```bash
cd rl/evaluate_best_prompt
python single_prompt_eval.py
```

### 2. Analyze Results
```bash
python detailed_response_analyzer.py
```

## 📊 Models Tested

| Model | Type | Description |
|-------|------|-------------|
| **qwen3:0.6b** | Baseline | Original Ollama model |
| **qwen3-weave:0.6b** | Trained | Our Weave-specialized model |
| **gpt-4** | OpenAI | Commercial API model |
| **openpipe:multimodal-agent-v1** | Custom | Our OpenPipe-trained model |

## 🎯 Test Prompt

**"How do I trace my LLM calls with Weave? Please include relevant images and examples."**

This prompt was selected because:
- ✅ It generated the most images (2) in our baseline testing
- ✅ It explicitly requests visual content
- ✅ It focuses on Weave functionality
- ✅ It asks for practical examples

## 📈 Metrics Analyzed

### Image Generation
- **Image Count**: Number of markdown images in response
- **Image URLs**: Actual image links provided
- **Image Alt Text**: Descriptive text for images

### Response Quality
- **Word Count**: Total words in response
- **Character Count**: Total characters
- **Weave Keywords**: Domain-specific terminology
- **Code Blocks**: Number of code examples
- **Error Rate**: Models that failed to respond

### Content Analysis
- **Weave-Specific Keywords**: `weave`, `@weave.op`, `tracing`, etc.
- **Code Examples**: Practical implementation snippets
- **Step-by-Step Instructions**: Structured guidance
- **Visual References**: Screenshots, diagrams, UI elements

## 📋 Expected Results

Based on our previous evaluations:

| Model | Expected Images | Expected Quality | Expected Keywords |
|-------|----------------|------------------|-------------------|
| **qwen3:0.6b** | 2 images | Good | 2-3 keywords |
| **qwen3-weave:0.6b** | 0-1 images | Good | 3-4 keywords |
| **gpt-4** | 0 images | Excellent | 3-4 keywords |
| **openpipe:multimodal-agent-v1** | 0 images | Good | 2-3 keywords |

## 🔍 Analysis Features

### Summary Table
Quick overview of all models' performance:
```
Model                     Images  Words  Keywords  Code  Error
Ollama Baseline           2       450    3         1     No
Weave Trained            0       380    4         2     No
OpenAI GPT-4             0       320    3         1     No
OpenPipe Custom          0       290    2         1     No
```

### Detailed Responses
Full text of each model's response with:
- Complete response content
- Image extraction and analysis
- Keyword highlighting
- Code block identification
- Error detection

### Comparative Analysis
- Best image generator
- Most Weave-specific content
- Longest/shortest responses
- Error rates and patterns

## 🛠️ Technical Details

### Environment Requirements
- Python 3.8+
- Weave SDK
- OpenAI API access
- OpenPipe API access
- Local Ollama installation

### Dependencies
```bash
pip install weave openai httpx
```

### Configuration
Uses `.env.local` file in project root:
```
OPEN_API_KEY=your_openai_key
OPEN_PIPE_API_KEY=your_openpipe_key
WANDB_API_KEY=your_wandb_key
WANDB_PROJECT=your_project
WANDB_ENTITY=your_entity
```

## 📊 Output Files

### `single_prompt_results_YYYYMMDD_HHMMSS.json`
Complete evaluation results including:
- Timestamp and prompt used
- Full responses from each model
- Detailed metrics and analysis
- Summary statistics

### Console Output
Real-time progress and summary table showing:
- Model testing progress
- Immediate results (images, words, keywords)
- Final comparison table
- File save location

## 🎯 Use Cases

### Model Selection
- Choose the best model for image-rich responses
- Identify models with strongest Weave knowledge
- Compare response quality and completeness

### Training Evaluation
- Assess if our Weave-trained model improved
- Compare against baseline and commercial models
- Identify areas for further training

### Prompt Optimization
- Understand how different models interpret the same prompt
- Identify successful patterns for image generation
- Refine prompts for better visual content

## 🔄 Next Steps

1. **Run Evaluation**: Execute the scripts to get current results
2. **Analyze Patterns**: Use the detailed analyzer to understand differences
3. **Iterate Training**: Use insights to improve model training
4. **Test Variations**: Try different prompts that request images
5. **Optimize Prompts**: Refine prompts based on successful patterns

## 📝 Notes

- The evaluation focuses on the single best-performing prompt from our previous testing
- Results are saved with timestamps for historical comparison
- All models are tested with identical prompts and parameters
- Image generation is the primary focus, but overall quality is also measured
- The system handles model errors gracefully and reports them in results
