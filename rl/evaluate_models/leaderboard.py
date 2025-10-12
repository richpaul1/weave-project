#!/usr/bin/env python3
"""
Model Comparison Leaderboard
Creates and publishes a leaderboard for comparing model performance across different metrics.
"""

import weave
from weave.flow import leaderboard
from weave.trace.ref_util import get_ref
from typing import List, Dict, Any


def create_models_leaderboard(evaluations: List[Any], project_name: str = "rl-demo") -> str:
    """
    Create and publish a leaderboard for model comparison evaluation results.

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

        # Add quality score column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="response_quality_scorer",
                summary_metric_path="score.mean",
                display_name="Quality Score"
            )
        )

        # Add relevance score column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="weave_relevance_scorer",
                summary_metric_path="score.mean",
                display_name="Relevance Score"
            )
        )

        # Add image generation column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="image_inclusion_scorer",
                summary_metric_path="score.mean",
                display_name="Image Generation"
            )
        )

        # Add temperature column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="temperature_scorer",
                summary_metric_path="temperature.mean",
                display_name="Temperature"
            )
        )

    # Create leaderboard specification
    spec = leaderboard.Leaderboard(
        name="Models",
        description="""
This leaderboard compares the performance of different LLM models across multiple dimensions:

### Models Compared
- **local-qwen3:0.6b**: Baseline Ollama model
- **local-qwen3-weave:0.6b**: Weave-trained model
- **gpt-4**: OpenAI GPT-4
- **openpipe:multimodal-agent-v1**: Custom OpenPipe model

### Evaluation Metrics

1. **Quality Score**: Overall response quality based on completeness, accuracy, and helpfulness
2. **Relevance Score**: How well the response addresses the specific question asked
3. **Image Generation**: Ability to include relevant images and visual content in responses
4. **Temperature**: Model temperature setting (creativity vs determinism)

### Scoring
- Quality and Relevance are scored as percentages (0-100%)
- Image Generation shows the fraction of responses that include relevant visual content
- Temperature shows the exact temperature setting used by each model
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
