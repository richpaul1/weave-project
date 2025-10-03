"""
LLM Tool-Calling Service

Implements true LLM tool calling where the LLM decides which tools to use.
"""
import json
from typing import Dict, Any, List, Optional, AsyncGenerator
import weave
from app.services.llm_service import LLMService
from app.tools.tool_definitions import get_tools_for_llm
from app.tools.tool_executor import ToolExecutor
from app.utils.weave_utils import add_session_metadata


class ToolCallingService:
    """Service that enables LLM to call tools autonomously."""
    
    def __init__(self, llm_service: LLMService, tool_executor: ToolExecutor):
        """Initialize the tool calling service."""
        self.llm_service = llm_service
        self.tool_executor = tool_executor
        
        # System prompt for tool-calling
        self.TOOL_CALLING_SYSTEM_PROMPT = """You are a helpful AI assistant with access to tools. You can call tools to help answer user questions.

Available tools:
- search_courses: Use this when users ask about learning, studying, courses, tutorials, or want educational recommendations
- search_knowledge: Use this for general factual questions, explanations, or information requests

When you need information to answer a question, call the appropriate tool(s). After getting tool results, provide a comprehensive and helpful response to the user.

Guidelines:
1. If a user asks about learning something, use search_courses
2. For general questions, use search_knowledge  
3. You can call multiple tools if needed
4. Always provide a natural, conversational response after using tools
5. Include relevant details from tool results in your response"""

    @weave.op()
    async def process_query_with_tools(
        self,
        query: str,
        session_id: Optional[str] = None,
        max_tool_calls: int = 3
    ) -> Dict[str, Any]:
        """
        Process a query using LLM tool calling.
        
        Args:
            query: User query
            session_id: Session ID for tracking
            max_tool_calls: Maximum number of tool calls allowed
            
        Returns:
            Response with tool usage information
        """
        print(f"🤖 Tool Calling Service: Processing query with tools")
        print(f"   Query: '{query}'")
        print(f"   Max tool calls: {max_tool_calls}")
        
        # Enhanced metadata for tool calling session
        session_metadata = {
            "session_id": session_id,
            "operation_type": "tool_calling_query",
            "query": query,
            "query_length": len(query),
            "max_tool_calls": max_tool_calls,
            "tool_calling_enabled": True,
            "llm_tool_usage": True,  # Flag for filtering tool-calling queries
        }

        add_session_metadata(**session_metadata)
        
        # Get available tools
        tools = get_tools_for_llm()
        
        # Build messages for LLM
        messages = [
            {"role": "system", "content": self.TOOL_CALLING_SYSTEM_PROMPT},
            {"role": "user", "content": query}
        ]
        
        tool_calls_made = []
        tool_results = []
        
        for call_iteration in range(max_tool_calls):
            print(f"🔄 Tool Calling Service: Iteration {call_iteration + 1}")
            
            # Call LLM with tools
            llm_response = await self.llm_service.generate_completion_with_tools(
                messages=messages,
                tools=tools,
                system_prompt=self.TOOL_CALLING_SYSTEM_PROMPT
            )
            
            # Check if LLM wants to call tools
            tool_calls = llm_response.get("tool_calls", [])
            
            if not tool_calls:
                # No more tool calls, LLM has final response
                print("✅ Tool Calling Service: LLM provided final response")
                break
            
            print(f"🔧 Tool Calling Service: LLM requested {len(tool_calls)} tool call(s)")
            
            # Execute each tool call
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name")
                tool_arguments = tool_call.get("function", {}).get("arguments", {})
                
                # Parse arguments if they're a string
                if isinstance(tool_arguments, str):
                    try:
                        tool_arguments = json.loads(tool_arguments)
                    except json.JSONDecodeError:
                        tool_arguments = {}
                
                print(f"   Executing: {tool_name} with {tool_arguments}")
                
                # Execute the tool
                tool_result = await self.tool_executor.execute_tool(
                    tool_name=tool_name,
                    tool_arguments=tool_arguments,
                    session_id=session_id
                )
                
                tool_calls_made.append({
                    "tool_name": tool_name,
                    "arguments": tool_arguments,
                    "result": tool_result
                })
                
                # Format result for LLM
                formatted_result = self.tool_executor.format_tool_result_for_llm(tool_result)
                tool_results.append(formatted_result)
                
                # Add tool result to conversation
                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [tool_call]
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.get("id", "unknown"),
                    "name": tool_name,
                    "content": formatted_result
                })
        
        # Get final response from LLM
        final_response = await self.llm_service.generate_completion(
            prompt=f"Based on the tool results, provide a comprehensive answer to: {query}",
            system_prompt=self.TOOL_CALLING_SYSTEM_PROMPT
        )
        
        # Create comprehensive tool usage summary for Weave
        tools_used = list(set(call["tool_name"] for call in tool_calls_made))
        tool_execution_summary = self._create_tool_execution_summary(tool_calls_made)

        # Enhanced metadata with detailed tool tracing
        enhanced_metadata = {
            "query": query,
            "num_tool_calls": len(tool_calls_made),
            "tools_used": tools_used,
            "llm_tokens": final_response.get("tokens", 0),
            "tool_execution_summary": tool_execution_summary,
            "tool_categories_used": list(set(self._get_tool_category(tool) for tool in tools_used)),
            "session_id": session_id,
            # Flags for easy Weave filtering
            "tool_calling_completed": True,
            "search_courses_used": "search_courses" in tools_used,
            "search_knowledge_used": "search_knowledge" in tools_used,
            "learning_query": "search_courses" in tools_used,
            "general_query": "search_knowledge" in tools_used and "search_courses" not in tools_used,
        }

        return {
            "response": final_response["text"],
            "tool_calls_made": tool_calls_made,
            "tool_results": tool_results,
            "metadata": enhanced_metadata,
            "tool_execution_metadata": enhanced_metadata  # Duplicate for easy access
        }
    
    @weave.op()
    async def process_query_with_tools_streaming(
        self,
        query: str,
        session_id: Optional[str] = None,
        max_tool_calls: int = 3
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a query using LLM tool calling with streaming.
        
        Args:
            query: User query
            session_id: Session ID for tracking
            max_tool_calls: Maximum number of tool calls allowed
            
        Yields:
            Streaming events for tool calls and responses
        """
        print(f"🤖 Tool Calling Service: Starting streaming tool calling")
        
        # Send initial event
        yield {
            "type": "tool_calling_start",
            "data": {
                "query": query,
                "max_tool_calls": max_tool_calls
            }
        }
        
        # Get available tools
        tools = get_tools_for_llm()
        
        # Build messages for LLM
        messages = [
            {"role": "system", "content": self.TOOL_CALLING_SYSTEM_PROMPT},
            {"role": "user", "content": query}
        ]
        
        tool_calls_made = []
        
        for call_iteration in range(max_tool_calls):
            # Send iteration event
            yield {
                "type": "tool_iteration",
                "data": {"iteration": call_iteration + 1}
            }
            
            # Call LLM with tools
            llm_response = await self.llm_service.generate_completion_with_tools(
                messages=messages,
                tools=tools,
                system_prompt=self.TOOL_CALLING_SYSTEM_PROMPT
            )
            
            # Check if LLM wants to call tools
            tool_calls = llm_response.get("tool_calls", [])
            
            if not tool_calls:
                # No more tool calls, break to final response
                break
            
            # Send tool calls event
            yield {
                "type": "tool_calls_requested",
                "data": {
                    "num_calls": len(tool_calls),
                    "tools": [call.get("function", {}).get("name") for call in tool_calls]
                }
            }
            
            # Execute each tool call
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name")
                tool_arguments = tool_call.get("function", {}).get("arguments", {})
                
                # Parse arguments if they're a string
                if isinstance(tool_arguments, str):
                    try:
                        tool_arguments = json.loads(tool_arguments)
                    except json.JSONDecodeError:
                        tool_arguments = {}
                
                # Send tool execution start event
                yield {
                    "type": "tool_execution_start",
                    "data": {
                        "tool_name": tool_name,
                        "arguments": tool_arguments
                    }
                }
                
                # Execute the tool
                tool_result = await self.tool_executor.execute_tool(
                    tool_name=tool_name,
                    tool_arguments=tool_arguments,
                    session_id=session_id
                )
                
                tool_calls_made.append({
                    "tool_name": tool_name,
                    "arguments": tool_arguments,
                    "result": tool_result
                })
                
                # Send tool execution result event
                yield {
                    "type": "tool_execution_result",
                    "data": {
                        "tool_name": tool_name,
                        "success": tool_result.get("success", False),
                        "result_summary": f"Found {len(tool_result.get('data', {}).get('courses', []))} courses" if tool_name == "search_courses" else "Knowledge retrieved"
                    }
                }
                
                # Format result for LLM and add to conversation
                formatted_result = self.tool_executor.format_tool_result_for_llm(tool_result)
                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [tool_call]
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.get("id", "unknown"),
                    "name": tool_name,
                    "content": formatted_result
                })
        
        # Send final response generation event
        yield {
            "type": "final_response_start",
            "data": {
                "total_tool_calls": len(tool_calls_made)
            }
        }
        
        # Stream final response from LLM
        full_response = ""
        async for chunk in self.llm_service.generate_streaming(
            prompt=f"Based on the tool results, provide a comprehensive answer to: {query}",
            system_prompt=self.TOOL_CALLING_SYSTEM_PROMPT
        ):
            full_response += chunk
            yield {
                "type": "response",
                "data": {"text": chunk}
            }
        
        # Send completion event
        yield {
            "type": "done",
            "data": {
                "tool_calls_made": len(tool_calls_made),
                "tools_used": list(set(call["tool_name"] for call in tool_calls_made)),
                "response_length": len(full_response)
            }
        }

    def _get_tool_category(self, tool_name: str) -> str:
        """Get the category of a tool for filtering purposes."""
        tool_categories = {
            "search_courses": "learning",
            "search_knowledge": "general",
        }
        return tool_categories.get(tool_name, "unknown")

    def _create_tool_execution_summary(self, tool_calls_made: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create a comprehensive summary of tool executions for Weave tracing."""
        summary = {
            "total_calls": len(tool_calls_made),
            "tools_breakdown": {},
            "successful_calls": 0,
            "failed_calls": 0,
            "courses_found": 0,
            "knowledge_chunks_found": 0,
        }

        for call in tool_calls_made:
            tool_name = call["tool_name"]
            result = call["result"]

            # Count tool usage
            if tool_name not in summary["tools_breakdown"]:
                summary["tools_breakdown"][tool_name] = 0
            summary["tools_breakdown"][tool_name] += 1

            # Count success/failure
            if result.get("success", False):
                summary["successful_calls"] += 1

                # Extract specific metrics
                if tool_name == "search_courses":
                    data = result.get("data", {})
                    summary["courses_found"] += len(data.get("courses", []))
                elif tool_name == "search_knowledge":
                    data = result.get("data", {})
                    summary["knowledge_chunks_found"] += data.get("num_chunks", 0)
            else:
                summary["failed_calls"] += 1

        return summary
