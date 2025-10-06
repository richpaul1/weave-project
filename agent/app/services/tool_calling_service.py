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
from app.config.prompts import PromptConfig


class ToolCallingService:
    """Service that enables LLM to call tools autonomously."""
    
    def __init__(self, llm_service: LLMService, tool_executor: ToolExecutor):
        """Initialize the tool calling service."""
        self.llm_service = llm_service
        self.tool_executor = tool_executor

    @weave.op()
    async def process_query_with_tools(
        self,
        query: str,
        session_id: Optional[str] = None,
        max_tool_calls: int = 1
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
            # Track tool calling prompt version
            "tool_calling_prompt_version": PromptConfig.get_current_version(),
            "tool_calling_service": True,
            "prompt_type": "tool_calling_system"
        }

        add_session_metadata(**session_metadata)
        
        # Get available tools
        tools = get_tools_for_llm()
        
        # Build messages for LLM
        messages = [
            {"role": "system", "content": PromptConfig.get_tool_calling_system_prompt()},
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
                system_prompt=PromptConfig.get_tool_calling_system_prompt()
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

                # Execute the tool with error handling
                try:
                    tool_result = await self.tool_executor.execute_tool(
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        session_id=session_id
                    )
                except Exception as e:
                    print(f"❌ Tool execution failed: {str(e)}")
                    tool_result = {
                        "success": False,
                        "error": str(e),
                        "data": {}
                    }

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
            system_prompt=PromptConfig.get_tool_calling_system_prompt()
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
        max_tool_calls: int = 1
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
        system_prompt = PromptConfig.get_tool_calling_system_prompt()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]

        print(f"🔍 PROMPT LOGGING - Initial System Prompt:")
        print(f"   Length: {len(system_prompt)} chars")
        print(f"   Content: {system_prompt[:200]}...")
        print(f"🔍 PROMPT LOGGING - Initial User Query:")
        print(f"   Query: '{query}'")
        print(f"🔍 PROMPT LOGGING - Initial Messages Array:")
        for i, msg in enumerate(messages):
            print(f"   Message {i}: role={msg['role']}, content_length={len(msg['content'])}")
            if msg['role'] == 'user':
                print(f"      Content: '{msg['content']}'")
            elif msg['role'] == 'system':
                print(f"      Content: '{msg['content'][:100]}...'")
        
        tool_calls_made = []
        
        for call_iteration in range(max_tool_calls):
            # Send iteration event
            yield {
                "type": "tool_iteration",
                "data": {"iteration": call_iteration + 1}
            }
            
            # Log messages before LLM call
            print(f"🔍 PROMPT LOGGING - Before LLM Call (Iteration {call_iteration + 1}):")
            print(f"   Total messages: {len(messages)}")
            for i, msg in enumerate(messages):
                role = msg['role']
                content = msg.get('content', '')
                tool_calls = msg.get('tool_calls', [])
                tool_call_id = msg.get('tool_call_id', '')
                name = msg.get('name', '')

                if role == 'system':
                    print(f"   Message {i}: SYSTEM - {len(content)} chars")
                    print(f"      Content: '{content[:100]}...'")
                elif role == 'user':
                    print(f"   Message {i}: USER - {len(content)} chars")
                    print(f"      Content: '{content}'")
                elif role == 'assistant':
                    print(f"   Message {i}: ASSISTANT - content={len(content) if content else 0} chars, tool_calls={len(tool_calls)}")
                    if content:
                        print(f"      Content: '{content[:100]}...'")
                    if tool_calls:
                        for tc in tool_calls:
                            print(f"      Tool Call: {tc.get('function', {}).get('name', 'unknown')}")
                elif role == 'tool':
                    print(f"   Message {i}: TOOL - name={name}, tool_call_id={tool_call_id}, content={len(content)} chars")
                    print(f"      Content: '{content[:200]}...'")

            # Call LLM with tools
            llm_response = await self.llm_service.generate_completion_with_tools(
                messages=messages,
                tools=tools,
                system_prompt=PromptConfig.get_tool_calling_system_prompt()
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
                
                # Execute the tool with error handling
                try:
                    tool_result = await self.tool_executor.execute_tool(
                        tool_name=tool_name,
                        tool_arguments=tool_arguments,
                        session_id=session_id
                    )
                except Exception as e:
                    print(f"❌ Tool execution failed: {str(e)}")
                    tool_result = {
                        "success": False,
                        "error": str(e),
                        "data": {}
                    }
                
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

                print(f"🔍 PROMPT LOGGING - Tool Result Formatting:")
                print(f"   Tool: {tool_name}")
                print(f"   Raw result success: {tool_result.get('success', False)}")
                print(f"   Raw result data keys: {list(tool_result.get('data', {}).keys())}")
                print(f"   Formatted result length: {len(formatted_result)} chars")
                print(f"   Formatted result preview: '{formatted_result[:300]}...'")

                assistant_message = {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [tool_call]
                }
                tool_message = {
                    "role": "tool",
                    "tool_call_id": tool_call.get("id", "unknown"),
                    "name": tool_name,
                    "content": formatted_result
                }

                messages.append(assistant_message)
                messages.append(tool_message)

                print(f"🔍 PROMPT LOGGING - Added to conversation:")
                print(f"   Assistant message: tool_calls={len(assistant_message['tool_calls'])}")
                print(f"   Tool message: name={tool_message['name']}, content_length={len(tool_message['content'])}")
        
        # Send final response generation event
        yield {
            "type": "final_response_start",
            "data": {
                "total_tool_calls": len(tool_calls_made)
            }
        }
        
        # Add final instruction to conversation for comprehensive response
        messages.append({
            "role": "user",
            "content": f"Based on the tool results above, provide a comprehensive answer to my original question: {query}"
        })

        print(f"🔍 PROMPT LOGGING - Final Response Generation:")
        print(f"   Using full conversation context with {len(messages)} messages")
        print(f"🔍 PROMPT LOGGING - Full conversation context:")
        for i, msg in enumerate(messages):
            role = msg['role']
            content = msg.get('content', '')
            if role == 'tool':
                print(f"   Message {i}: TOOL ({msg.get('name', 'unknown')}) - {len(content)} chars")
                print(f"      Content preview: '{content[:200]}...'")
            elif role == 'user':
                print(f"   Message {i}: USER - {len(content)} chars")
                print(f"      Content: '{content}'")
            elif role == 'assistant':
                tool_calls = msg.get('tool_calls', [])
                print(f"   Message {i}: ASSISTANT - content={len(content) if content else 0} chars, tool_calls={len(tool_calls)}")
            else:
                print(f"   Message {i}: {role.upper()} - {len(content) if content else 0} chars")

        # Stream final response from LLM using conversation context
        print(f"🔍 PROMPT LOGGING - Starting streaming final response with conversation context")
        full_response = ""
        response_content = ""
        thinking_blocks = []
        current_thinking = ""
        in_thinking = False

        # Convert messages to a format suitable for streaming
        conversation_prompt = self._build_conversation_prompt(messages)

        print(f"🔍 PROMPT LOGGING - Built conversation prompt:")
        print(f"   Prompt length: {len(conversation_prompt)} chars")
        print(f"   Prompt preview: '{conversation_prompt[:300]}...'")

        async for chunk in self.llm_service.generate_streaming(
            prompt=conversation_prompt,
            system_prompt=PromptConfig.get_tool_calling_system_prompt()
        ):
            full_response += chunk

            # Enhanced thinking tag processing with multiple thinking blocks
            if "<think>" in chunk:
                in_thinking = True
                # Send thinking start event
                yield {
                    "type": "thinking_start",
                    "data": {"block_number": len(thinking_blocks) + 1}
                }

            if in_thinking:
                current_thinking += chunk
                # Send thinking content
                yield {
                    "type": "thinking_content",
                    "data": {
                        "text": chunk,
                        "block_number": len(thinking_blocks) + 1
                    }
                }

            if "</think>" in chunk and in_thinking:
                in_thinking = False
                thinking_blocks.append(current_thinking)
                current_thinking = ""
                # Send thinking end event
                yield {
                    "type": "thinking_end",
                    "data": {"block_number": len(thinking_blocks)}
                }

            # Process non-thinking content
            if not in_thinking:
                # Remove any thinking tags from the chunk
                import re
                clean_chunk = re.sub(r'</?think>', '', chunk)

                if clean_chunk:
                    response_content += clean_chunk
                    yield {
                        "type": "response",
                        "data": {"text": clean_chunk}
                    }
        
        # Send completion event
        yield {
            "type": "done",
            "data": {
                "tool_calls_made": len(tool_calls_made),
                "tools_used": list(set(call["tool_name"] for call in tool_calls_made)),
                "response_length": len(response_content),
                "thinking_blocks": len(thinking_blocks)
            }
        }

    def _build_conversation_prompt(self, messages: List[Dict[str, Any]]) -> str:
        """Build a conversation prompt from messages array for streaming."""
        prompt_parts = []

        for msg in messages:
            role = msg['role']
            content = msg.get('content', '')

            if role == 'user':
                prompt_parts.append(f"User: {content}")
            elif role == 'assistant':
                tool_calls = msg.get('tool_calls', [])
                if tool_calls:
                    for tool_call in tool_calls:
                        tool_name = tool_call.get('function', {}).get('name', 'unknown')
                        tool_args = tool_call.get('function', {}).get('arguments', {})
                        prompt_parts.append(f"Assistant: I'll use the {tool_name} tool with arguments: {tool_args}")
                elif content:
                    prompt_parts.append(f"Assistant: {content}")
            elif role == 'tool':
                tool_name = msg.get('name', 'unknown')
                prompt_parts.append(f"Tool Result ({tool_name}): {content}")

        conversation = "\n\n".join(prompt_parts)

        print(f"🔍 PROMPT LOGGING - Conversation prompt built:")
        print(f"   Total parts: {len(prompt_parts)}")
        print(f"   Final conversation: '{conversation[:500]}...'")

        return conversation

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
