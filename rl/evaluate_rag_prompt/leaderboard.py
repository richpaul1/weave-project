#!/usr/bin/env python3
"""
RAG Comparison Leaderboard
Creates and publishes a leaderboard for comparing model performance on RAG prompts.
"""

import weave
from weave.flow import leaderboard
from weave.trace.ref_util import get_ref
from typing import List, Dict, Any


def create_rag_comparison_leaderboard(evaluations: List[Any], project_name: str = "rl-demo") -> str:
    """
    Create and publish a leaderboard for RAG comparison evaluation results.
    
    Args:
        evaluations: List of Weave evaluation objects
        project_name: Weave project name
        
    Returns:
        str: Reference URI of the published leaderboard
    """
    
    # Ensure we have the expected number of evaluations
    if len(evaluations) < 1:
        raise ValueError("At least one evaluation is required to create a leaderboard")
    
    # Create columns for each evaluation (one per model)
    columns = []
    
    for i, evaluation in enumerate(evaluations):
        eval_ref = get_ref(evaluation).uri()
        
        # Add image count column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="image_count.mean",
                display_name="Image Count"
            )
        )
        
        # Add word count column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response", 
                summary_metric_path="word_count.mean",
                display_name="Word Count"
            )
        )
        
        # Add keyword count column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="keyword_count.mean",
                display_name="Keyword Count"
            )
        )
        
        # Add code blocks column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="code_blocks.mean",
                display_name="Code Blocks"
            )
        )
        
        # Add has images rate column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="has_images.true_fraction",
                display_name="Image Inclusion Rate"
            )
        )
        
        # Add has keywords rate column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="has_keywords.true_fraction",
                display_name="Keyword Inclusion Rate"
            )
        )
        
        # Add error rate column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="evaluate_model_response",
                summary_metric_path="error.true_fraction",
                should_minimize=True,
                display_name="Error Rate"
            )
        )
    
    # Create leaderboard specification
    spec = leaderboard.Leaderboard(
        name="RAG_Comparison",
        description="""
This leaderboard compares the performance of different LLM models on RAG (Retrieval-Augmented Generation) prompts:

### Models Compared
- **qwen3:0.6b**: Baseline Ollama model with RAG context
- **qwen3-weave:0.6b**: Weave-trained model with RAG context
- **gpt-4**: OpenAI GPT-4 with RAG context
- **openpipe:multimodal-agent-v1**: Custom OpenPipe model with RAG context

### RAG Context
All models receive the same retrieved context from the knowledge base before generating responses.

### Evaluation Metrics

1. **Image Count**: Number of images included in the response
2. **Word Count**: Number of words in the response
3. **Keyword Count**: Number of Weave-related keywords found
4. **Code Blocks**: Number of code blocks in the response
5. **Image Inclusion Rate**: Fraction of responses that include images
6. **Keyword Inclusion Rate**: Fraction of responses that include Weave keywords
7. **Error Rate**: Fraction of responses that contain errors (lower is better)

### Scoring
- Higher values are better for most metrics (except Error Rate)
- Error Rate should be minimized (lower is better)
- Rates are shown as fractions (0.0 to 1.0)
- RAG context helps models provide more accurate and relevant responses
""",
        columns=columns,
    )
    
    # Publish the leaderboard
    ref = weave.publish(spec)
    return ref.uri()


def print_leaderboard_info(leaderboard_uri: str, leaderboard_name: str):
    """Print information about the created leaderboard."""
    print(f"\n🏆 {leaderboard_name} Created!")
    print(f"📊 Leaderboard URI: {leaderboard_uri}")
    print(f"🔗 View at: https://wandb.ai/your-entity/rl-demo/weave")
    print("="*80)
