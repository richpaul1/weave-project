#!/usr/bin/env python3
"""
Prompt Comparison Leaderboard
Creates and publishes a leaderboard for comparing prompt performance across different metrics.
"""

import weave
from weave.flow import leaderboard
from weave.trace.ref_util import get_ref
from typing import List, Dict, Any


def create_prompts_leaderboard(evaluations: List[Any], project_name: str = "rl-demo") -> str:
    """
    Create and publish a leaderboard for prompt comparison evaluation results.
    
    Args:
        evaluations: List of Weave evaluation objects
        project_name: Weave project name
        
    Returns:
        str: Reference URI of the published leaderboard
    """
    
    # Ensure we have the expected number of evaluations
    if len(evaluations) < 1:
        raise ValueError("At least one evaluation is required to create a leaderboard")
    
    # Create columns for each evaluation (one per prompt type)
    columns = []
    
    for i, evaluation in enumerate(evaluations):
        eval_ref = get_ref(evaluation).uri()
        
        # Add overall quality score column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="overall_quality_scorer",
                summary_metric_path="score.mean",
                display_name="Overall Quality"
            )
        )

        # Add image inclusion score column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="image_inclusion_scorer",
                summary_metric_path="passed.true_fraction",
                display_name="Image Inclusion Rate"
            )
        )

        # Add response length score column for this evaluation
        columns.append(
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref,
                scorer_name="response_length_scorer",
                summary_metric_path="score.mean",
                display_name="Response Length Quality"
            )
        )
    
    # Create leaderboard specification
    spec = leaderboard.Leaderboard(
        name="Prompt_Comparison",
        description="""
This leaderboard compares the performance of different prompt types across multiple dimensions:

### Prompts Compared
- **Simple Prompt**: Basic question format
- **Complex Prompt**: Detailed instructions with context and examples

### Evaluation Metrics

1. **Overall Quality**: Combined score based on completeness, accuracy, and helpfulness (0-100%)
2. **Image Inclusion Rate**: Fraction of responses that include relevant images when expected
3. **Response Length Quality**: Score based on optimal response length (150-500 words ideal)

### Scoring
- Overall Quality and Response Length Quality are scored as percentages (0-100%)
- Image Inclusion Rate shows the fraction of responses that include images when expected
- Higher scores indicate better prompt performance
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
