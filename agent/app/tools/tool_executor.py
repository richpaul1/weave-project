"""
Tool executor for LLM function calling.

Executes tools that the LLM decides to call.
"""
import json
import time
from typing import Dict, Any, Optional
import weave
from app.services.independent_course_service import IndependentCourseService
from app.services.retrieval_service import RetrievalService
from app.tools.tool_definitions import get_tool_definition
from app.utils.weave_utils import add_session_metadata


class ToolExecutor:
    """Executes tools called by the LLM."""
    
    def __init__(self, course_service: IndependentCourseService, retrieval_service: RetrievalService):
        """Initialize the tool executor."""
        self.course_service = course_service
        self.retrieval_service = retrieval_service
    
    @weave.op()
    async def execute_tool(
        self,
        tool_name: str,
        tool_arguments: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute a tool with the given arguments.

        Args:
            tool_name: Name of the tool to execute
            tool_arguments: Arguments to pass to the tool
            session_id: Session ID for tracking

        Returns:
            Tool execution result with comprehensive tracing metadata
        """
        print(f"🔧 Tool Executor: Executing tool '{tool_name}'")
        print(f"   Arguments: {tool_arguments}")

        # Enhanced metadata for Weave tracing
        tool_metadata = {
            "session_id": session_id,
            "operation_type": "tool_execution",
            "tool_name": tool_name,
            "tool_arguments": tool_arguments,
            "tool_category": self._get_tool_category(tool_name),
            "execution_timestamp": int(time.time()),
            "tool_executed": True,  # Flag for easy filtering in Weave UI
            f"{tool_name}_executed": True,  # Specific tool flag
        }

        add_session_metadata(**tool_metadata)
        
        try:
            # Execute the tool and capture detailed results
            if tool_name == "search_courses":
                result = await self._execute_course_search(tool_arguments)
            elif tool_name == "search_knowledge":
                result = await self._execute_knowledge_search(tool_arguments)
            else:
                result = {
                    "success": False,
                    "error": f"Unknown tool: {tool_name}",
                    "tool_name": tool_name
                }

            # Enhance result with tracing metadata
            enhanced_result = {
                **result,
                "tool_execution_metadata": {
                    "tool_name": tool_name,
                    "tool_arguments": tool_arguments,
                    "tool_category": self._get_tool_category(tool_name),
                    "execution_success": result.get("success", False),
                    "session_id": session_id,
                    "tool_executed": True,
                    f"{tool_name}_executed": True,
                }
            }

            # Log execution summary for Weave
            execution_summary = self._create_execution_summary(tool_name, tool_arguments, enhanced_result)
            print(f"📊 Tool Execution Summary: {execution_summary}")

            return enhanced_result

        except Exception as e:
            print(f"❌ Tool Executor: Tool execution failed: {str(e)}")
            error_result = {
                "success": False,
                "error": f"Tool execution failed: {str(e)}",
                "tool_name": tool_name,
                "tool_execution_metadata": {
                    "tool_name": tool_name,
                    "tool_arguments": tool_arguments,
                    "tool_category": self._get_tool_category(tool_name),
                    "execution_success": False,
                    "error": str(e),
                    "session_id": session_id,
                    "tool_executed": True,
                    f"{tool_name}_executed": True,
                }
            }
            return error_result
    
    @weave.op()
    async def _execute_course_search(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute course search tool."""
        query = arguments.get("query", "")
        difficulty = arguments.get("difficulty")
        limit = arguments.get("limit", 5)
        
        print(f"🎓 Tool Executor: Searching courses for '{query}'")
        
        try:
            # Call the course service
            result = await self.course_service.search_courses(
                query=query,
                difficulty=difficulty,
                limit=limit,
                use_vector=True
            )
            
            # Format the result for the LLM
            courses = result.get("results", [])
            formatted_courses = []
            
            for course in courses:
                formatted_courses.append({
                    "id": course.get("id"),
                    "title": course.get("title"),
                    "description": course.get("description"),
                    "url": course.get("url"),
                    "difficulty": course.get("difficulty"),
                    "duration": course.get("duration"),
                    "topics": course.get("topics", []),
                    "instructor": course.get("instructor")
                })
            
            # Enhanced result with detailed tool output for Weave tracing
            tool_output = {
                "query": query,
                "total_found": result.get("total", 0),
                "search_method": result.get("searchMethod", "unknown"),
                "courses": formatted_courses,
                "course_titles": [course.get("title", "Unknown") for course in formatted_courses],
                "course_difficulties": [course.get("difficulty", "Unknown") for course in formatted_courses],
                "course_topics": [topic for course in formatted_courses for topic in course.get("topics", [])],
                "filters_applied": {
                    "difficulty": difficulty,
                    "limit": limit
                }
            }

            return {
                "success": True,
                "tool_name": "search_courses",
                "data": tool_output,
                "tool_output": tool_output  # Duplicate for easy Weave filtering
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Course search failed: {str(e)}",
                "tool_name": "search_courses"
            }
    
    @weave.op()
    async def _execute_knowledge_search(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute knowledge search tool."""
        query = arguments.get("query", "")
        context_limit = arguments.get("context_limit", 5)
        
        print(f"📚 Tool Executor: Searching knowledge for '{query}'")
        
        try:
            # Call the retrieval service
            result = await self.retrieval_service.retrieve_context(
                query=query,
                top_k=context_limit
            )
            
            # Enhanced result with detailed tool output for Weave tracing
            tool_output = {
                "query": query,
                "context_text": result["context_text"],
                "num_chunks": result["num_chunks"],
                "num_sources": result["num_sources"],
                "sources": result["sources"],
                "source_titles": [source.get("title", "Unknown") for source in result["sources"]],
                "context_length": len(result["context_text"]),
                "filters_applied": {
                    "context_limit": context_limit
                }
            }

            return {
                "success": True,
                "tool_name": "search_knowledge",
                "data": tool_output,
                "tool_output": tool_output  # Duplicate for easy Weave filtering
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Knowledge search failed: {str(e)}",
                "tool_name": "search_knowledge"
            }
    
    def format_tool_result_for_llm(self, tool_result: Dict[str, Any]) -> str:
        """
        Format tool execution result for LLM consumption.
        
        Args:
            tool_result: Result from tool execution
            
        Returns:
            Formatted string for LLM
        """
        if not tool_result.get("success", False):
            return f"Tool execution failed: {tool_result.get('error', 'Unknown error')}"
        
        tool_name = tool_result.get("tool_name")
        data = tool_result.get("data", {})
        
        if tool_name == "search_courses":
            courses = data.get("courses", [])
            if not courses:
                return f"No courses found for query: {data.get('query')}"
            
            result = f"Found {len(courses)} courses for '{data.get('query')}':\n\n"
            for i, course in enumerate(courses, 1):
                result += f"{i}. **{course.get('title', 'Unknown Title')}**\n"
                result += f"   - Difficulty: {course.get('difficulty', 'Unknown')}\n"
                result += f"   - Duration: {course.get('duration', 'Unknown')}\n"
                result += f"   - Topics: {', '.join(course.get('topics', []))}\n"
                if course.get('description'):
                    result += f"   - Description: {course.get('description')}\n"
                result += f"   - URL: {course.get('url', 'N/A')}\n\n"
            
            return result
            
        elif tool_name == "search_knowledge":
            context = data.get("context_text", "")
            sources = data.get("sources", [])
            
            result = f"Knowledge search results for '{data.get('query')}':\n\n"
            result += f"Context: {context}\n\n"
            
            if sources:
                result += "Sources:\n"
                for source in sources:
                    result += f"- {source.get('title', 'Unknown')}: {source.get('url', 'N/A')}\n"
            
            return result

        return f"Tool '{tool_name}' executed successfully with data: {json.dumps(data, indent=2)}"

    def _get_tool_category(self, tool_name: str) -> str:
        """Get the category of a tool for filtering purposes."""
        tool_categories = {
            "search_courses": "learning",
            "search_knowledge": "general",
        }
        return tool_categories.get(tool_name, "unknown")

    def _create_execution_summary(
        self,
        tool_name: str,
        tool_arguments: Dict[str, Any],
        result: Dict[str, Any]
    ) -> str:
        """Create a concise execution summary for logging."""
        success = result.get("success", False)

        if tool_name == "search_courses":
            data = result.get("data", {})
            courses_found = len(data.get("courses", []))
            query = tool_arguments.get("query", "unknown")
            return f"search_courses('{query}') → {courses_found} courses found, success={success}"

        elif tool_name == "search_knowledge":
            data = result.get("data", {})
            chunks_found = data.get("num_chunks", 0)
            query = tool_arguments.get("query", "unknown")
            return f"search_knowledge('{query}') → {chunks_found} chunks found, success={success}"

        return f"{tool_name}({tool_arguments}) → success={success}"
