from weave import Evaluation, Model
import weave
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# Get project name from environment
wandb_project = os.getenv("WANDB_PROJECT", "intro-example")
print(f"📊 Using Weave project: {wandb_project}")

weave.init(wandb_project)

examples = [
    {"question": "What is the capital of France?", "expected": "Paris"},
    {"question": "Who wrote 'To Kill a Mockingbird'?", "expected": "Harper Lee"},
    {"question": "What is the square root of 64?", "expected": "8"},
]

@weave.op()
def match_score1(expected: str, output: dict) -> dict:
    return {'match': expected == output['generated_text']}

@weave.op()
def match_score2(expected: dict, output: dict) -> dict:
    return {'match': expected == output['generated_text']}

class MyModel(Model):
    prompt: str

    @weave.op()
    def predict(self, question: str):
        # here's where you would add your LLM call and return the output
        return {'generated_text': 'Hello, ' + question + self.prompt}

model = MyModel(prompt='World')
evaluation = Evaluation(dataset=examples, scorers=[match_score1, match_score2])

asyncio.run(evaluation.evaluate(model))

@weave.op()
def function_to_evaluate(question: str):
    # here's where you would add your LLM call and return the output
    return  {'generated_text': 'some response' + question}

asyncio.run(evaluation.evaluate(function_to_evaluate))
