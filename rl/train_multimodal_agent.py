#!/usr/bin/env python3
"""
Train a multimodal agent using OpenPipe ART to return text + images.
Based on the LangGraph integration example but adapted for multimodal responses.

This script is part of the RL project for training agents to return
both text and images when appropriate.
"""

import asyncio
import json
import uuid
import os
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pathlib import Path

import weave
from pydantic import BaseModel, Field

# OpenPipe ART imports
try:
    import art
    from art.langgraph import init_chat_model, wrap_rollout
    from art.utils import iterate_dataset
    from litellm import acompletion
    HAS_ART = True
except ImportError:
    print("OpenPipe ART not installed. Install with: pip install openpipe-art[backend,langgraph]")
    HAS_ART = False

# Tenacity imports (for retry logic)
try:
    from tenacity import retry, stop_after_attempt
    HAS_TENACITY = True
except ImportError:
    HAS_TENACITY = False
    # Create dummy decorator if tenacity not available
    def retry(*args, **kwargs):
        def decorator(func):
            return func
        return decorator
    def stop_after_attempt(n):
        return None

@dataclass
class MultimodalTrainingExample:
    """Training example for multimodal responses"""
    query: str
    expected_text: str
    expected_images: List[str]
    context: str
    source_file: str
    training_id: str

class MultimodalResponse(BaseModel):
    """Expected response format with text and images"""
    text: str = Field(description="The text response")
    images: List[str] = Field(description="List of image paths/URLs that should be included")
    reasoning: str = Field(description="Why these images are relevant")

# Create base class conditionally
if HAS_ART:
    _TrajectoryBase = art.Trajectory
else:
    _TrajectoryBase = object

class MultimodalTrajectory(_TrajectoryBase):
    """Custom trajectory for multimodal training"""
    def __init__(self, *args, **kwargs):
        if HAS_ART:
            super().__init__(*args, **kwargs)
        self.response: Optional[MultimodalResponse] = None
        self.expected_response: Optional[MultimodalResponse] = None

class MultimodalJudgeResponse(BaseModel):
    """Judge response for evaluating multimodal outputs"""
    text_quality: float = Field(description="Quality of text response (0-10)")
    image_relevance: float = Field(description="Relevance of included images (0-10)")
    image_completeness: float = Field(description="Whether all relevant images were included (0-10)")
    overall_score: float = Field(description="Overall quality score (0-10)")
    reasoning: str = Field(description="Explanation of the scoring")
    accept: bool = Field(description="Whether the response should be accepted")

class MultimodalAgentTrainer:
    """Trainer for multimodal agents using OpenPipe ART"""
    
    def __init__(self, model_name: str = "Qwen/Qwen2.5-7B-Instruct"):
        if not HAS_ART:
            raise ImportError("OpenPipe ART is required. Install with: pip install openpipe-art[backend,langgraph]")
            
        self.model_name = model_name
        self.model = art.Model(name=model_name)
        self.backend = art.backends.SkyPilotBackend()
        
    def load_training_data(self, data_path: str) -> List[MultimodalTrainingExample]:
        """Load training data from JSON file"""
        with open(data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        examples = []
        for item in data:
            # Create training examples from text-image pairs
            query = f"Please provide information about: {item['text_before']}"
            expected_text = item['text_after'] if item['text_after'] else item['context']
            expected_images = [item['image_path']] if item['image_path'] else []
            
            example = MultimodalTrainingExample(
                query=query,
                expected_text=expected_text,
                expected_images=expected_images,
                context=item['context'],
                source_file=item['source_file'],
                training_id=item['training_id']
            )
            examples.append(example)
        
        return examples
    
    @weave.op
    async def rollout(self, model: Any, example: MultimodalTrainingExample) -> MultimodalTrajectory:
        """Execute a single training rollout"""
        traj = MultimodalTrajectory(
            reward=0.0,
            messages_and_choices=[],
            metadata={
                "training_id": example.training_id,
                "source_file": example.source_file,
            },
        )
        
        # System prompt for multimodal responses
        system_prompt = """You are a helpful assistant that provides comprehensive responses including both text and relevant images when appropriate.

When responding to queries:
1. Provide clear, informative text
2. If there are relevant images that would help illustrate your response, include them
3. Always explain why the images are relevant
4. Format your response as JSON with 'text', 'images', and 'reasoning' fields

Example response format:
{
    "text": "Your detailed text response here...",
    "images": ["path/to/relevant/image1.png", "path/to/relevant/image2.jpg"],
    "reasoning": "These images help illustrate the concepts discussed..."
}"""

        try:
            # Initialize chat model
            chat_model = init_chat_model(model.name, temperature=0.7)
            
            # Create messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context: {example.context}\n\nQuery: {example.query}"}
            ]
            
            # Get response from model
            response = await acompletion(
                model=model.name,
                messages=messages,
                response_format=MultimodalResponse,
                temperature=0.7
            )
            
            # Parse response
            response_content = response.choices[0].message.content
            if response_content:
                try:
                    response_data = json.loads(response_content)
                    traj.response = MultimodalResponse(**response_data)
                except json.JSONDecodeError:
                    # Fallback if JSON parsing fails
                    traj.response = MultimodalResponse(
                        text=response_content,
                        images=[],
                        reasoning="Failed to parse structured response"
                    )
            
            # Set expected response
            traj.expected_response = MultimodalResponse(
                text=example.expected_text,
                images=example.expected_images,
                reasoning="Expected response from training data"
            )
            
        except Exception as e:
            print(f"Error in rollout: {e}")
            traj.response = MultimodalResponse(
                text=f"Error: {str(e)}",
                images=[],
                reasoning="Error occurred during generation"
            )
        
        return traj
    
    @retry(stop=stop_after_attempt(3))
    async def judge_response(self, traj: MultimodalTrajectory) -> MultimodalJudgeResponse:
        """Judge the quality of a multimodal response"""
        if not traj.response or not traj.expected_response:
            return MultimodalJudgeResponse(
                text_quality=0.0,
                image_relevance=0.0,
                image_completeness=0.0,
                overall_score=0.0,
                reasoning="Missing response data",
                accept=False
            )
        
        judge_prompt = f"""
        Evaluate this multimodal response:
        
        Expected Text: {traj.expected_response.text}
        Expected Images: {traj.expected_response.images}
        
        Actual Text: {traj.response.text}
        Actual Images: {traj.response.images}
        Reasoning: {traj.response.reasoning}
        
        Rate on a scale of 0-10:
        1. Text Quality: How well does the text response match expectations?
        2. Image Relevance: How relevant are the included images?
        3. Image Completeness: Were all important images included?
        
        Provide an overall score and whether to accept this response.
        """
        
        response = await acompletion(
            model="openai/gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert evaluator of multimodal AI responses."},
                {"role": "user", "content": judge_prompt}
            ],
            response_format=MultimodalJudgeResponse,
        )
        
        return MultimodalJudgeResponse.model_validate_json(
            response.choices[0].message.content or "{}"
        )
    
    async def train(self, training_data_path: str, config: Dict[str, Any] = None):
        """Train the multimodal agent"""
        if config is None:
            config = {
                "groups_per_step": 2,
                "num_epochs": 5,
                "rollouts_per_group": 4,
                "learning_rate": 1e-5,
                "max_steps": 10,
            }
        
        # Load training data
        training_examples = self.load_training_data(training_data_path)
        print(f"Loaded {len(training_examples)} training examples")
        
        # Register model with backend
        await self.model.register(self.backend)
        
        # Training iterator
        training_iterator = iterate_dataset(
            training_examples,
            groups_per_step=config["groups_per_step"],
            num_epochs=config["num_epochs"],
            initial_step=await self.model.get_step(),
        )
        
        # Training loop
        for batch in training_iterator:
            print(f"Training step {batch.step}, epoch {batch.epoch}")
            
            # Create trajectory groups
            groups = []
            for example in batch.items:
                groups.append(
                    art.TrajectoryGroup([
                        wrap_rollout(self.model, self.rollout)(self.model, example)
                        for _ in range(config["rollouts_per_group"])
                    ])
                )
            
            # Gather trajectories
            finished_groups = await art.gather_trajectory_groups(
                groups,
                pbar_desc="gather",
                max_exceptions=config["rollouts_per_group"] * len(batch.items),
            )
            
            # Judge responses
            judged_groups = []
            for group in finished_groups:
                judged_trajectories = []
                for traj in group.trajectories:
                    judge_response = await self.judge_response(traj)
                    traj.reward = judge_response.overall_score / 10.0  # Normalize to 0-1
                    traj.metrics = {
                        "text_quality": judge_response.text_quality,
                        "image_relevance": judge_response.image_relevance,
                        "image_completeness": judge_response.image_completeness,
                        "accept": judge_response.accept
                    }
                    judged_trajectories.append(traj)
                
                judged_groups.append(art.TrajectoryGroup(judged_trajectories))
            
            # Train model
            await self.model.train(
                judged_groups,
                config=art.TrainConfig(learning_rate=config["learning_rate"]),
            )
            
            print(f"Completed training step {batch.step}")
            
            if batch.step >= config["max_steps"]:
                break

async def main():
    """Main training function"""
    # Initialize Weave tracking
    if os.getenv("WANDB_API_KEY"):
        weave.init("multimodal-agent-training")
    
    # Create trainer
    trainer = MultimodalAgentTrainer()
    
    # Training configuration
    config = {
        "groups_per_step": 2,
        "num_epochs": 3,
        "rollouts_per_group": 2,
        "learning_rate": 1e-5,
        "max_steps": 5,
    }
    
    # Train the model
    await trainer.train("training_data.json", config)
    
    print("Training completed!")

if __name__ == "__main__":
    if not HAS_ART:
        print("Please install OpenPipe ART first:")
        print("pip install openpipe-art[backend,langgraph]")
    else:
        asyncio.run(main())
