# Weave Local Training with Ollama

This directory contains the files and configuration needed to create a specialized Ollama model for Weave documentation assistance.

## Overview

The goal is to create a local AI model that can provide expert-level assistance with Weave (W&B's LLM observability framework) by:
- Understanding Weave-specific terminology and concepts
- Generating responses with appropriate documentation images
- Following consistent formatting patterns
- Providing practical, code-focused answers

## Files in this Directory

- `WeaveModelfile` - Ollama model configuration file
- `ollama_training_format.json` - Training data in instruction-response format
- `README.md` - This documentation file

## How the WeaveModelfile Works

The `WeaveModelfile` is an Ollama configuration file that defines how to create a specialized AI model. It consists of several key components:

### 1. Base Model Selection
```
FROM qwen3:0.6b
```
- Uses Qwen 3 (0.6B parameters) as the foundation model
- Provides base language understanding capabilities
- Lightweight enough for local deployment

### 2. Model Parameters
```
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
```
- **Temperature 0.3**: Lower temperature for more focused, consistent responses
- **Top_p 0.9**: Nucleus sampling for balanced creativity vs. accuracy
- **Top_k 40**: Limits vocabulary choices for more coherent responses
- **Repeat_penalty 1.1**: Reduces repetitive text generation

### 3. System Prompt
Defines the AI's specialized behavior:
- Domain expertise in Weave framework
- Response formatting guidelines (including image embedding)
- Focus on code examples and step-by-step instructions
- Emphasis on specific Weave concepts (@weave.op(), weave.Model, etc.)

### 4. Few-Shot Training Examples
Contains 10 example instruction-response pairs that establish patterns:
- Input format: "Based on this Weave documentation context: [context]"
- Output format: Structured responses with images, markdown headers, and citations
- Proper image embedding using markdown format
- Consistent source attribution

## Building the WeaveModelfile

The WeaveModelfile is built from several sources:

### 1. Training Data Generation
The `ollama_training_format.json` file contains training examples extracted from Weave documentation. This data includes:
- Instruction-response pairs
- Image URLs from Weave documentation
- Confidence scores for each example
- Original IDs for tracking

### 2. Model Configuration
The parameters and system prompt are optimized for:
- Documentation assistance tasks
- Consistent response formatting
- Image-rich responses when appropriate
- Technical accuracy for Weave concepts

### 3. Few-Shot Examples Selection
The training examples in the Modelfile are carefully selected to demonstrate:
- Proper response structure
- Image embedding patterns
- Citation formatting
- Weave-specific terminology usage

## Creating and Using the Model

### Prerequisites
- Ollama installed locally
- Access to the base model (qwen3:0.6b)

### Build the Model
```bash
# Navigate to the train_local directory
cd rl/train_local/

# Create the model using the Modelfile
ollama create weave-assistant -f WeaveModelfile

# Verify the model was created
ollama list
```

### Run the Model
```bash
# Start an interactive session
ollama run weave-assistant

# Or use it programmatically
ollama run weave-assistant "How do I use @weave.op() decorator?"
```

### Test the Model
Try these example prompts to verify the model works correctly:

1. **Basic Weave concept:**
   ```
   "How do I track function calls with Weave?"
   ```

2. **Visual documentation request:**
   ```
   "How do I view traces in Weave? Can you show me what the trace interface looks like?"
   ```

3. **Code example request:**
   ```
   "Show me how to create a weave.Model for my LLM application"
   ```

## Expected Behavior

The trained model should:
- Provide accurate information about Weave features
- Include relevant images when discussing UI elements
- Show practical code examples
- Use proper Weave terminology
- Format responses consistently with documentation style
- Include source citations when appropriate

## Troubleshooting

### Model Creation Issues
- Ensure Ollama is running: `ollama serve`
- Check if base model is available: `ollama pull qwen3:0.6b`
- Verify Modelfile syntax is correct

### Response Quality Issues
- Check if the model is using the correct system prompt
- Verify training examples are representative of desired output
- Consider adjusting model parameters for different response styles

## Customization

To modify the model behavior:

1. **Update System Prompt**: Edit the SYSTEM section in WeaveModelfile
2. **Adjust Parameters**: Modify temperature, top_p, etc. for different response styles
3. **Add Training Examples**: Include more MESSAGE pairs to establish new patterns
4. **Change Base Model**: Use a different foundation model if needed

## Integration

This local model can be integrated with the main application by:
- Configuring the LLM service to use the local Ollama endpoint
- Setting the model name to "weave-assistant"
- Ensuring proper prompt formatting for optimal responses
