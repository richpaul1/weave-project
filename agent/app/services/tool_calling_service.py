"""
LLM Tool-Calling Service

Implements true LLM tool calling where the LLM decides which tools to use.
"""
import json
from typing import Dict, Any, List, Optional, AsyncGenerator
import weave
from weave.trace import weave_client
from app.services.llm_service import LLMService
from app.tools.tool_definitions import get_tools_for_llm
from app.tools.tool_executor import ToolExecutor
from app.utils.weave_utils import add_session_metadata
from app.prompts import PromptConfig


class ToolCallingService:
    """Service that enables LLM to call tools autonomously."""

    def __init__(self, llm_service: LLMService, tool_executor: ToolExecutor, storage_service=None):
        """Initialize the tool calling service."""
        self.llm_service = llm_service
        self.tool_executor = tool_executor
        self.storage_service = storage_service

    @weave.op()
    async def process_query_with_tools(
        self,
        query: str,
        session_id: Optional[str] = None,
        max_tool_calls: int = 1,
        top_k: int = 3
    ) -> Dict[str, Any]:
        """
        Process a query using LLM tool calling.

        Args:
            query: User query
            session_id: Session ID for tracking
            max_tool_calls: Maximum number of tool calls allowed
            top_k: Number of context chunks to retrieve (default: 3)

        Returns:
            Response with tool usage information
        """
        print(f"🤖 Tool Calling Service: Processing query with tools")
        print(f"   Query: '{query}'")
        print(f"   Max tool calls: {max_tool_calls}")
        print(f"   Top K: {top_k}")
        
        # Enhanced metadata for tool calling session
        # Get system prompt to track its details
        system_prompt = PromptConfig.get_tool_calling_system_prompt()

        session_metadata = {
            "session_id": session_id,
            "operation_type": "tool_calling_query",
            "query": query,
            "query_length": len(query),
            "max_tool_calls": max_tool_calls,
            "tool_calling_enabled": True,
            "llm_tool_usage": True,  # Flag for filtering tool-calling queries
            # Enhanced prompt version tracking
            "tool_calling_prompt_version": PromptConfig.get_current_version(),
            "prompt_version_date": "2024-10-06",  # Use constant for now
            "system_prompt_length": len(system_prompt),
            "supported_versions": ["1.0.0", "1.1.0", "1.2.0", "1.3.0"],  # Use constant for now
            "default_version": "1.3.0",  # Use constant for now
            "tool_calling_service": True,
            "prompt_type": "tool_calling_system",
            "prompt_has_section_markers": "1.3.0" in PromptConfig.get_current_version(),
            "top_k": top_k
        }

        add_session_metadata(**session_metadata)
        
        # Get available tools
        tools = get_tools_for_llm()
        
        # Build messages for LLM (reuse the system_prompt we already fetched)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]

        print(f"🔍 PROMPT LOGGING - Initial System Prompt:")
        print(f"   Version: {PromptConfig.get_current_version()}")
        print(f"   Length: {len(system_prompt)} chars")
        print(f"   Content: {system_prompt[:200]}...")

        print(f"🔍 PROMPT LOGGING - Initial User Query:")
        print(f"   Query: '{query}'")

        print(f"🔍 PROMPT LOGGING - Initial Messages Array:")
        for i, msg in enumerate(messages):
            content = msg.get('content', '')
            print(f"   Message {i}: role={msg['role']}, content_length={len(content)}")
            if msg['role'] == 'system':
                print(f"       Content: '{content[:100]}...'")
            else:
                print(f"       Content: '{content}'")

        # Add additional metadata after building messages
        add_session_metadata(
            operation_type="prompt_usage_detailed",
            messages_count=len(messages),
            system_message_length=len(system_prompt),
            user_message_length=len(query),
            prompt_version_used=PromptConfig.get_current_version()
        )
        
        tool_calls_made = []
        tool_results = []
        
        for call_iteration in range(max_tool_calls):
            print(f"🔄 Tool Calling Service: Iteration {call_iteration + 1}")
            
            # Call LLM with tools (use the same system_prompt for consistency)
            llm_response = await self.llm_service.generate_completion_with_tools(
                messages=messages,
                tools=tools,
                system_prompt=system_prompt
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
        max_tool_calls: int = 1,
        top_k: int = 3
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a query using LLM tool calling with streaming.

        Args:
            query: User query
            session_id: Session ID for tracking
            max_tool_calls: Maximum number of tool calls allowed
            top_k: Number of context chunks to retrieve (default: 3)

        Yields:
            Streaming events for tool calls and responses
        """
        print(f"🤖 Tool Calling Service: Starting streaming tool calling")
        print(f"   Query: '{query}'")
        print(f"   Session ID: {session_id}")
        print(f"   Max tool calls: {max_tool_calls}")
        print(f"   Top K: {top_k}")

        # Get system prompt first for version tracking
        system_prompt = PromptConfig.get_tool_calling_system_prompt()

        # Add comprehensive Weave metadata including prompt version
        add_session_metadata(
            operation_type="tool_calling_streaming",
            query=query,
            query_length=len(query),
            session_id=session_id,
            max_tool_calls=max_tool_calls,
            top_k=top_k,
            context_retrieval_limit=top_k,
            # Enhanced prompt version tracking
            streaming_prompt_version=PromptConfig.get_current_version(),
            streaming_prompt_date="2024-10-06",  # Use constant for now
            streaming_system_prompt_length=len(system_prompt),
            streaming_supported_versions=["1.0.0", "1.1.0", "1.2.0", "1.3.0"],  # Use constant for now
            streaming_default_version="1.3.0",  # Use constant for now
            streaming_has_section_markers="1.3.0" in PromptConfig.get_current_version()
        )

        # Send initial event
        yield {
            "type": "tool_calling_start",
            "data": {
                "query": query,
                "max_tool_calls": max_tool_calls,
                "top_k": top_k
            }
        }

        # Get available tools
        tools = get_tools_for_llm()

        # Build messages for LLM starting with system prompt
        messages = [
            {"role": "system", "content": system_prompt}
        ]

        print(f"🔍 PROMPT LOGGING - Initial System Prompt:")
        print(f"   Version: {PromptConfig.get_current_version()}")
        print(f"   Length: {len(system_prompt)} chars")
        print(f"   Content: {system_prompt[:200]}...")

        print(f"🔍 PROMPT LOGGING - Initial User Query:")
        print(f"   Query: '{query}'")

        # Get chat history if session_id is provided
        if session_id and self.storage_service:
            print(f"📚 Tool Calling Service: Fetching conversation history...")
            try:
                history_pairs = self.storage_service.get_recent_conversation_history(
                    session_id=session_id,
                    num_pairs=3  # Get last 3 Q&A pairs
                )

                print(f"📚 Tool Calling Service: Found {len(history_pairs)} conversation pairs")

                # Add conversation history to messages
                for pair in history_pairs:
                    messages.append({"role": "user", "content": pair["question"]})
                    messages.append({"role": "assistant", "content": pair["answer"]})

                # Send history info event
                yield {
                    "type": "history_loaded",
                    "data": {
                        "num_pairs": len(history_pairs),
                        "has_history": len(history_pairs) > 0
                    }
                }

            except Exception as e:
                print(f"⚠️ Tool Calling Service: Error fetching history: {e}")
                # Continue without history

        # Add current user query
        messages.append({"role": "user", "content": query})

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

                # Inject top_k parameter for knowledge search tools
                if tool_name == "search_knowledge" and "context_limit" not in tool_arguments:
                    tool_arguments["context_limit"] = top_k
                    print(f"🔧 Tool Calling Service: Injected context_limit={top_k} for {tool_name}")

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

        # Initialize output tracking for Weave instrumentation
        output_metrics = {
            "chunks_processed": 0,
            "response_chunks": 0,
            "thinking_chunks": 0,
            "streaming_response_length": 0,
            "streaming_thinking_length": 0,
            "thinking_blocks_started": 0,
            "thinking_blocks_completed": 0
        }

        # Convert messages to a format suitable for streaming
        conversation_prompt = self._build_conversation_prompt(messages)

        print(f"🔍 PROMPT LOGGING - Built conversation prompt:")
        print(f"   Prompt length: {len(conversation_prompt)} chars")
        print(f"   Prompt preview: '{conversation_prompt[:300]}...'")

        # Add Weave metadata for final prompt usage
        add_session_metadata(
            operation_type="final_prompt_streaming",
            prompt_version="1.3.0",
            conversation_prompt_length=len(conversation_prompt),
            system_prompt_length=len(PromptConfig.get_tool_calling_system_prompt()),
            enhanced_section_markers=True,
            streaming_response=True,
            final_prompt_preview=conversation_prompt[:200]
        )

        async for chunk in self.llm_service.generate_streaming(
            prompt=conversation_prompt,
            system_prompt=PromptConfig.get_tool_calling_system_prompt()
        ):
            full_response += chunk
            output_metrics["chunks_processed"] += 1

            # Enhanced thinking tag processing with multiple thinking blocks
            import re

            # Process chunk for thinking tags and content
            remaining_chunk = chunk

            while remaining_chunk:
                if not in_thinking:
                    # Look for start of thinking
                    think_start = remaining_chunk.find("<think>")
                    if think_start >= 0:
                        # Process content before thinking tag
                        if think_start > 0:
                            pre_think_content = remaining_chunk[:think_start]
                            response_content += pre_think_content
                            output_metrics["response_chunks"] += 1
                            output_metrics["streaming_response_length"] += len(pre_think_content)
                            yield {
                                "type": "response",
                                "data": {"text": pre_think_content}
                            }

                        # Start thinking mode
                        in_thinking = True
                        output_metrics["thinking_blocks_started"] += 1
                        yield {
                            "type": "thinking_start",
                            "data": {"block_number": len(thinking_blocks) + 1}
                        }

                        # Continue with content after <think>
                        remaining_chunk = remaining_chunk[think_start + 7:]  # Skip "<think>"
                        current_thinking = "<think>"
                    else:
                        # No thinking tags, process as regular content
                        response_content += remaining_chunk
                        output_metrics["response_chunks"] += 1
                        output_metrics["streaming_response_length"] += len(remaining_chunk)
                        yield {
                            "type": "response",
                            "data": {"text": remaining_chunk}
                        }
                        break
                else:
                    # We're in thinking mode, look for end tag
                    think_end = remaining_chunk.find("</think>")
                    if think_end >= 0:
                        # Process thinking content including the end tag
                        thinking_content = remaining_chunk[:think_end + 8]  # Include "</think>"
                        current_thinking += thinking_content
                        output_metrics["thinking_chunks"] += 1
                        output_metrics["streaming_thinking_length"] += len(thinking_content)

                        yield {
                            "type": "thinking_content",
                            "data": {
                                "text": thinking_content,
                                "block_number": len(thinking_blocks) + 1
                            }
                        }

                        # End thinking mode
                        in_thinking = False
                        thinking_blocks.append(current_thinking)
                        current_thinking = ""
                        output_metrics["thinking_blocks_completed"] += 1
                        yield {
                            "type": "thinking_end",
                            "data": {"block_number": len(thinking_blocks)}
                        }

                        # Continue with content after </think>
                        remaining_chunk = remaining_chunk[think_end + 8:]
                    else:
                        # Still in thinking mode, process all as thinking content
                        current_thinking += remaining_chunk
                        output_metrics["thinking_chunks"] += 1
                        output_metrics["streaming_thinking_length"] += len(remaining_chunk)
                        yield {
                            "type": "thinking_content",
                            "data": {
                                "text": remaining_chunk,
                                "block_number": len(thinking_blocks) + 1
                            }
                        }
                        break
        
        # Create comprehensive output summary for Weave instrumentation
        tool_execution_summary = self._create_tool_execution_summary(tool_calls_made)

        # Capture final message content and metadata
        final_message_data = {
            "final_response": response_content,
            "final_response_length": len(response_content),
            "thinking_content": "\n".join(thinking_blocks) if thinking_blocks else "",
            "thinking_blocks_count": len(thinking_blocks),
            "total_thinking_length": sum(len(block) for block in thinking_blocks),
            "has_thinking": len(thinking_blocks) > 0,
            "response_has_content": len(response_content.strip()) > 0
        }

        # Add comprehensive Weave metadata for final output
        add_session_metadata(
            operation_type="tool_calling_streaming_completion",
            query=query,
            session_id=session_id,
            # Tool execution summary
            **tool_execution_summary,
            # Final message data
            **final_message_data,
            # Output processing metrics
            **output_metrics,
            # Additional metadata
            prompt_version=PromptConfig.get_current_version(),
            streaming_completed=True,
            total_events_yielded="calculated_by_consumer",  # This would be counted by the consumer
            conversation_context_used=len(messages) > 2,  # More than system + user means context was used
            final_prompt_length=len(conversation_prompt) if 'conversation_prompt' in locals() else 0,
            # Validation metrics
            response_content_matches_length=len(response_content) == output_metrics["streaming_response_length"],
            thinking_content_matches_length=sum(len(block) for block in thinking_blocks) == output_metrics["streaming_thinking_length"]
        )

        print(f"🎯 TOOL CALLING STREAMING COMPLETION:")
        print(f"   Final response length: {len(response_content)} chars")
        print(f"   Thinking blocks: {len(thinking_blocks)}")
        print(f"   Tool calls made: {len(tool_calls_made)}")
        print(f"   Tools used: {list(set(call['tool_name'] for call in tool_calls_made))}")
        print(f"   Response preview: '{response_content[:200]}...'")
        if thinking_blocks:
            total_thinking = "\n".join(thinking_blocks)
            print(f"   Thinking preview: '{total_thinking[:200]}...'")

        # Send completion event with enhanced data
        yield {
            "type": "done",
            "data": {
                "tool_calls_made": len(tool_calls_made),
                "tools_used": list(set(call["tool_name"] for call in tool_calls_made)),
                "response_length": len(response_content),
                "thinking_blocks": len(thinking_blocks),
                # Enhanced output capture
                "final_response": response_content,
                "thinking_content": "\n".join(thinking_blocks) if thinking_blocks else "",
                "tool_execution_summary": tool_execution_summary,
                "output_metrics": output_metrics,
                "session_metadata": {
                    "query": query,
                    "session_id": session_id,
                    "prompt_version": PromptConfig.get_current_version(),
                    "completion_timestamp": "2024-10-06T00:00:00Z"  # Would use actual timestamp in production
                }
            }
        }

    @weave.op()
    def _build_conversation_prompt(self, messages: List[Dict[str, Any]]) -> str:
        """Build a conversation prompt from messages array for streaming with enhanced section markers."""
        from app.prompts import PromptConfig
        from app.utils.weave_utils import add_session_metadata

        # Separate history from current interaction
        history_parts = []
        current_parts = []
        tool_results = []
        current_query = ""

        # Find the original user query (first user message)
        original_query_found = False

        for msg in messages:
            role = msg['role']
            content = msg.get('content', '')

            if role == 'system':
                continue  # Skip system messages in conversation building
            elif role == 'user':
                if not original_query_found:
                    # This is the original query
                    current_query = content
                    original_query_found = True
                else:
                    # This is a follow-up or history
                    history_parts.append(f"User: {content}")
            elif role == 'assistant':
                tool_calls = msg.get('tool_calls', [])
                if tool_calls:
                    for tool_call in tool_calls:
                        tool_name = tool_call.get('function', {}).get('name', 'unknown')
                        tool_args = tool_call.get('function', {}).get('arguments', {})
                        current_parts.append(f"Assistant: I'll use the {tool_name} tool with arguments: {tool_args}")
                elif content:
                    if original_query_found:
                        current_parts.append(f"Assistant: {content}")
                    else:
                        history_parts.append(f"Assistant: {content}")
            elif role == 'tool':
                tool_name = msg.get('name', 'unknown')
                tool_results.append(f"Tool Result ({tool_name}): {content}")

        # Build enhanced prompt with section markers
        prompt_sections = []

        # Add history section if we have history
        if history_parts:
            history_section = "\n\n".join(history_parts)
            prompt_sections.append(f"**HISTORY:**\n{history_section}")
            print(f"🔍 ENHANCED PROMPT - History section built:")
            print(f"   History parts: {len(history_parts)}")
            print(f"   History preview: '{history_section[:200]}...'")

        # Add new context section if we have tool results
        if tool_results:
            new_context = "\n\n".join(tool_results)
            prompt_sections.append(f"**NEW_CONTEXT:**\n{new_context}")
            print(f"🔍 ENHANCED PROMPT - New context section built:")
            print(f"   Tool results: {len(tool_results)}")
            print(f"   Context preview: '{new_context[:200]}...'")

        # Add current interaction
        if current_parts:
            current_interaction = "\n\n".join(current_parts)
            prompt_sections.append(current_interaction)

        # Add current question
        if current_query:
            prompt_sections.append(f"**CURRENT_QUESTION:** {current_query}")

        # Join all sections
        enhanced_prompt = "\n\n".join(prompt_sections)

        print(f"🔍 ENHANCED PROMPT LOGGING - Full enhanced prompt built:")
        print(f"   Total sections: {len(prompt_sections)}")
        print(f"   Has history: {len(history_parts) > 0}")
        print(f"   Has new context: {len(tool_results) > 0}")
        print(f"   Enhanced prompt length: {len(enhanced_prompt)} chars")
        print(f"   Enhanced prompt preview: '{enhanced_prompt[:300]}...'")

        # Add Weave metadata for prompt building
        add_session_metadata(
            operation_type="enhanced_prompt_building",
            prompt_version="1.3.0",
            prompt_template_type="enhanced_conversation_prompt",
            total_messages=len(messages),
            total_sections=len(prompt_sections),
            has_history=len(history_parts) > 0,
            has_new_context=len(tool_results) > 0,
            history_parts_count=len(history_parts),
            tool_results_count=len(tool_results),
            enhanced_prompt_length=len(enhanced_prompt),
            section_markers_used=True,
            current_query=current_query[:100] if current_query else "",
            enhanced_prompt_preview=enhanced_prompt[:200]
        )

        return enhanced_prompt

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
