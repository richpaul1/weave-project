"""
Tool definitions for LLM function calling.

Defines available tools that the LLM can choose to call based on user queries.
"""
from typing import Dict, Any, List
from dataclasses import dataclass


@dataclass
class ToolParameter:
    """Definition of a tool parameter."""
    name: str
    type: str
    description: str
    required: bool = True
    enum: List[str] = None


@dataclass
class ToolDefinition:
    """Definition of a tool that the LLM can call."""
    name: str
    description: str
    parameters: List[ToolParameter]
    
    def to_openai_format(self) -> Dict[str, Any]:
        """Convert to OpenAI function calling format."""
        properties = {}
        required = []
        
        for param in self.parameters:
            prop = {
                "type": param.type,
                "description": param.description
            }
            if param.enum:
                prop["enum"] = param.enum
            
            properties[param.name] = prop
            if param.required:
                required.append(param.name)
        
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
        }


# Define available tools
COURSE_SEARCH_TOOL = ToolDefinition(
    name="search_courses",
    description="Search for educational courses based on a learning topic or skill. Use this when users ask about learning, studying, or want course recommendations.",
    parameters=[
        ToolParameter(
            name="query",
            type="string",
            description="The learning topic or skill to search for (e.g., 'machine learning', 'python programming', 'data science')"
        ),
        ToolParameter(
            name="difficulty",
            type="string",
            description="Preferred difficulty level",
            required=False,
            enum=["beginner", "intermediate", "advanced"]
        ),
        ToolParameter(
            name="limit",
            type="integer",
            description="Maximum number of courses to return (default: 5)",
            required=False
        )
    ]
)

GENERAL_SEARCH_TOOL = ToolDefinition(
    name="search_knowledge",
    description="Search the general knowledge base for information on any topic. Use this for factual questions, explanations, or general information requests.",
    parameters=[
        ToolParameter(
            name="query",
            type="string",
            description="The question or topic to search for information about"
        ),
        ToolParameter(
            name="context_limit",
            type="integer",
            description="Maximum number of context chunks to retrieve (default: 5)",
            required=False
        )
    ]
)

COURSE_RECOMMENDATION_TOOL = ToolDefinition(
    name="recommend_learning_path",
    description="Generate a personalized learning path based on user's goals, current level, and preferences. Use this when users ask for learning roadmaps or structured learning plans.",
    parameters=[
        ToolParameter(
            name="topic",
            type="string",
            description="The main topic or skill the user wants to learn (e.g., 'machine learning', 'web development')"
        ),
        ToolParameter(
            name="current_level",
            type="string",
            description="User's current knowledge level",
            required=False,
            enum=["beginner", "intermediate", "advanced", "unknown"]
        ),
        ToolParameter(
            name="time_commitment",
            type="string",
            description="How much time user can dedicate to learning",
            required=False,
            enum=["1-2 hours/week", "3-5 hours/week", "6-10 hours/week", "10+ hours/week", "unknown"]
        ),
        ToolParameter(
            name="learning_style",
            type="string",
            description="Preferred learning approach",
            required=False,
            enum=["hands-on", "theoretical", "mixed", "unknown"]
        )
    ]
)

SKILL_ASSESSMENT_TOOL = ToolDefinition(
    name="assess_skill_level",
    description="Assess user's current skill level in a topic by analyzing their questions and providing appropriate next steps. Use when users want to know their level or what to learn next.",
    parameters=[
        ToolParameter(
            name="topic",
            type="string",
            description="The topic or skill to assess (e.g., 'Python programming', 'data analysis')"
        ),
        ToolParameter(
            name="user_description",
            type="string",
            description="User's description of their current knowledge or experience"
        )
    ]
)

COURSE_COMPARISON_TOOL = ToolDefinition(
    name="compare_courses",
    description="Compare multiple courses on similar topics to help users choose the best option. Use when users are deciding between different learning options.",
    parameters=[
        ToolParameter(
            name="topic",
            type="string",
            description="The topic to find and compare courses for"
        ),
        ToolParameter(
            name="comparison_criteria",
            type="array",
            description="Criteria to compare courses by (e.g., difficulty, duration, cost, rating)",
            required=False
        )
    ]
)

# Registry of all available tools
AVAILABLE_TOOLS = {
    "search_courses": COURSE_SEARCH_TOOL,
    "search_knowledge": GENERAL_SEARCH_TOOL,
    "recommend_learning_path": COURSE_RECOMMENDATION_TOOL,
    "assess_skill_level": SKILL_ASSESSMENT_TOOL,
    "compare_courses": COURSE_COMPARISON_TOOL
}


def get_tools_for_llm() -> List[Dict[str, Any]]:
    """Get all tools in OpenAI function calling format."""
    return [tool.to_openai_format() for tool in AVAILABLE_TOOLS.values()]


def get_tool_definition(tool_name: str) -> ToolDefinition:
    """Get a specific tool definition."""
    return AVAILABLE_TOOLS.get(tool_name)
