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
            elif tool_name == "recommend_learning_path":
                result = await self._execute_learning_path_recommendation(tool_arguments)
            elif tool_name == "assess_skill_level":
                result = await self._execute_skill_assessment(tool_arguments)
            elif tool_name == "compare_courses":
                result = await self._execute_course_comparison(tool_arguments)
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
            data = result.get("data", {})
            courses = data.get("results", [])
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
                "total_found": data.get("total", 0),
                "search_method": data.get("searchMethod", "unknown"),
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

        elif tool_name == "recommend_learning_path":
            topic = data.get("topic", "Unknown")
            learning_path = data.get("learning_path", {})
            steps = learning_path.get("steps", [])

            result = f"Learning Path Recommendation for '{topic}':\n\n"
            result += f"**Estimated Duration:** {learning_path.get('estimated_duration', 'Unknown')}\n"
            result += f"**Current Level:** {data.get('current_level', 'Unknown')}\n\n"

            for i, step in enumerate(steps, 1):
                result += f"**Phase {i}: {step.get('phase', 'Unknown')}** ({step.get('duration', 'Unknown')})\n"
                courses = step.get('courses', [])
                for course in courses[:3]:  # Show top 3 courses per phase
                    result += f"  • {course.get('title', 'Unknown')} ({course.get('difficulty', 'Unknown')})\n"
                result += "\n"

            if learning_path.get('learning_style_notes'):
                result += f"**Learning Style Notes:** {learning_path['learning_style_notes']}\n"

            return result

        elif tool_name == "assess_skill_level":
            topic = data.get("topic", "Unknown")
            level = data.get("assessed_level", "Unknown")
            confidence = data.get("confidence", 0)

            result = f"Skill Assessment for '{topic}':\n\n"
            result += f"**Assessed Level:** {level.title()} (Confidence: {confidence:.1%})\n"
            result += f"**Reasoning:** {data.get('reasoning', 'No reasoning provided')}\n\n"

            strengths = data.get("strengths", [])
            if strengths:
                result += f"**Strengths:**\n"
                for strength in strengths:
                    result += f"  • {strength}\n"
                result += "\n"

            gaps = data.get("gaps", [])
            if gaps:
                result += f"**Areas to Develop:**\n"
                for gap in gaps:
                    result += f"  • {gap}\n"
                result += "\n"

            next_steps = data.get("next_steps", {})
            goals = next_steps.get("immediate_goals", [])
            if goals:
                result += f"**Immediate Goals:**\n"
                for goal in goals:
                    result += f"  • {goal}\n"
                result += "\n"

            courses = next_steps.get("courses", [])
            if courses:
                result += f"**Recommended Courses:**\n"
                for course in courses:
                    result += f"  • {course.get('title', 'Unknown')} ({course.get('difficulty', 'Unknown')})\n"

            return result

        elif tool_name == "compare_courses":
            topic = data.get("topic", "Unknown")
            courses_compared = data.get("courses_compared", 0)
            comparison_matrix = data.get("comparison_matrix", [])

            result = f"Course Comparison for '{topic}' ({courses_compared} courses):\n\n"

            # Show top courses
            for i, course in enumerate(comparison_matrix[:5], 1):  # Show top 5
                result += f"**{i}. {course.get('title', 'Unknown')}**\n"
                result += f"   - Difficulty: {course.get('difficulty', 'Unknown')}\n"
                result += f"   - Duration: {course.get('duration', 'Unknown')}\n"
                result += f"   - Topics: {', '.join(course.get('topics', [])[:3])}\n"
                result += f"   - Instructor: {course.get('instructor', 'Unknown')}\n\n"

            # Show recommendations
            recommendations = data.get("recommendations", [])
            if recommendations:
                result += "**Recommendations:**\n"
                for rec in recommendations:
                    result += f"  • {rec}\n"
                result += "\n"

            # Show best options
            best_for_beginners = data.get("best_for_beginners")
            if best_for_beginners:
                result += f"**Best for Beginners:** {best_for_beginners.get('title', 'Unknown')}\n"

            best_overall = data.get("best_overall")
            if best_overall:
                result += f"**Best Overall:** {best_overall.get('title', 'Unknown')}\n"

            return result

        return f"Tool '{tool_name}' executed successfully with data: {json.dumps(data, indent=2)}"

    @weave.op()
    async def _execute_learning_path_recommendation(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute learning path recommendation tool."""
        topic = arguments.get("topic", "")
        current_level = arguments.get("current_level", "unknown")
        time_commitment = arguments.get("time_commitment", "unknown")
        learning_style = arguments.get("learning_style", "unknown")

        print(f"🎯 Tool Executor: Generating learning path for '{topic}'")

        try:
            # Search for relevant courses first
            course_result = await self.course_service.search_courses(
                query=topic,
                limit=10,
                use_vector=True
            )

            courses = course_result.get("data", {}).get("results", [])

            # Create a structured learning path
            learning_path = self._create_learning_path(
                topic=topic,
                courses=courses,
                current_level=current_level,
                time_commitment=time_commitment,
                learning_style=learning_style
            )

            tool_output = {
                "topic": topic,
                "current_level": current_level,
                "time_commitment": time_commitment,
                "learning_style": learning_style,
                "learning_path": learning_path,
                "total_courses": len(courses),
                "estimated_duration": learning_path.get("estimated_duration", "Unknown"),
                "difficulty_progression": learning_path.get("difficulty_progression", [])
            }

            return {
                "success": True,
                "tool_name": "recommend_learning_path",
                "data": tool_output,
                "tool_output": tool_output
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Learning path recommendation failed: {str(e)}",
                "tool_name": "recommend_learning_path"
            }

    @weave.op()
    async def _execute_skill_assessment(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute skill assessment tool."""
        topic = arguments.get("topic", "")
        user_description = arguments.get("user_description", "")

        print(f"📊 Tool Executor: Assessing skill level for '{topic}'")

        try:
            # Analyze user description and determine skill level
            assessment = self._analyze_skill_level(topic, user_description)

            # Get relevant next steps based on assessment
            next_steps = await self._get_next_learning_steps(topic, assessment["level"])

            tool_output = {
                "topic": topic,
                "user_description": user_description,
                "assessed_level": assessment["level"],
                "confidence": assessment["confidence"],
                "reasoning": assessment["reasoning"],
                "strengths": assessment["strengths"],
                "gaps": assessment["gaps"],
                "next_steps": next_steps,
                "recommended_courses": next_steps.get("courses", [])
            }

            return {
                "success": True,
                "tool_name": "assess_skill_level",
                "data": tool_output,
                "tool_output": tool_output
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Skill assessment failed: {str(e)}",
                "tool_name": "assess_skill_level"
            }

    @weave.op()
    async def _execute_course_comparison(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute course comparison tool."""
        topic = arguments.get("topic", "")
        comparison_criteria = arguments.get("comparison_criteria", ["difficulty", "duration", "rating"])

        print(f"⚖️ Tool Executor: Comparing courses for '{topic}'")

        try:
            # Search for courses to compare
            course_result = await self.course_service.search_courses(
                query=topic,
                limit=8,
                use_vector=True
            )

            courses = course_result.get("data", {}).get("results", [])

            if len(courses) < 2:
                return {
                    "success": False,
                    "error": f"Not enough courses found for comparison (found {len(courses)}, need at least 2)",
                    "tool_name": "compare_courses"
                }

            # Create comparison matrix
            comparison = self._create_course_comparison(courses, comparison_criteria)

            tool_output = {
                "topic": topic,
                "comparison_criteria": comparison_criteria,
                "courses_compared": len(courses),
                "comparison_matrix": comparison["matrix"],
                "recommendations": comparison["recommendations"],
                "best_for_beginners": comparison.get("best_for_beginners"),
                "best_overall": comparison.get("best_overall"),
                "most_comprehensive": comparison.get("most_comprehensive")
            }

            return {
                "success": True,
                "tool_name": "compare_courses",
                "data": tool_output,
                "tool_output": tool_output
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Course comparison failed: {str(e)}",
                "tool_name": "compare_courses"
            }

    def _create_learning_path(
        self,
        topic: str,
        courses: list,
        current_level: str,
        time_commitment: str,
        learning_style: str
    ) -> Dict[str, Any]:
        """Create a structured learning path from available courses."""
        # Sort courses by difficulty
        beginner_courses = [c for c in courses if c.get("difficulty", "").lower() == "beginner"]
        intermediate_courses = [c for c in courses if c.get("difficulty", "").lower() == "intermediate"]
        advanced_courses = [c for c in courses if c.get("difficulty", "").lower() == "advanced"]

        # Create progression based on current level
        path_steps = []

        if current_level in ["beginner", "unknown"]:
            path_steps.extend([
                {"phase": "Foundation", "courses": beginner_courses[:3], "duration": "2-4 weeks"},
                {"phase": "Intermediate", "courses": intermediate_courses[:2], "duration": "4-6 weeks"},
                {"phase": "Advanced", "courses": advanced_courses[:1], "duration": "3-4 weeks"}
            ])
        elif current_level == "intermediate":
            path_steps.extend([
                {"phase": "Intermediate", "courses": intermediate_courses[:3], "duration": "3-5 weeks"},
                {"phase": "Advanced", "courses": advanced_courses[:2], "duration": "4-6 weeks"}
            ])
        else:  # advanced
            path_steps.extend([
                {"phase": "Advanced", "courses": advanced_courses[:3], "duration": "4-8 weeks"}
            ])

        # Adjust for time commitment
        total_duration = "8-12 weeks"
        if time_commitment in ["1-2 hours/week"]:
            total_duration = "12-20 weeks"
        elif time_commitment in ["10+ hours/week"]:
            total_duration = "4-8 weeks"

        return {
            "steps": path_steps,
            "estimated_duration": total_duration,
            "difficulty_progression": [step["phase"] for step in path_steps],
            "total_courses": sum(len(step["courses"]) for step in path_steps),
            "learning_style_notes": self._get_learning_style_notes(learning_style)
        }

    def _analyze_skill_level(self, topic: str, user_description: str) -> Dict[str, Any]:
        """Analyze user's skill level based on their description."""
        description_lower = user_description.lower()

        # Simple heuristic-based assessment
        beginner_indicators = ["new to", "just started", "beginner", "never", "first time", "basic"]
        intermediate_indicators = ["some experience", "familiar with", "worked with", "intermediate", "moderate"]
        advanced_indicators = ["expert", "advanced", "years of experience", "professional", "lead", "senior"]

        beginner_score = sum(1 for indicator in beginner_indicators if indicator in description_lower)
        intermediate_score = sum(1 for indicator in intermediate_indicators if indicator in description_lower)
        advanced_score = sum(1 for indicator in advanced_indicators if indicator in description_lower)

        if advanced_score > 0:
            level = "advanced"
            confidence = 0.8
        elif intermediate_score > 0:
            level = "intermediate"
            confidence = 0.7
        elif beginner_score > 0:
            level = "beginner"
            confidence = 0.8
        else:
            level = "beginner"  # Default assumption
            confidence = 0.5

        return {
            "level": level,
            "confidence": confidence,
            "reasoning": f"Based on keywords and description patterns, assessed as {level} level",
            "strengths": self._extract_strengths(description_lower, topic),
            "gaps": self._identify_learning_gaps(level, topic)
        }

    async def _get_next_learning_steps(self, topic: str, level: str) -> Dict[str, Any]:
        """Get recommended next learning steps based on assessed level."""
        # Search for appropriate courses
        course_result = await self.course_service.search_courses(
            query=topic,
            difficulty=level if level != "unknown" else None,
            limit=5,
            use_vector=True
        )

        courses = course_result.get("data", {}).get("results", [])

        return {
            "immediate_goals": self._get_immediate_goals(level, topic),
            "courses": courses[:3],  # Top 3 recommendations
            "skills_to_develop": self._get_skills_to_develop(level, topic),
            "estimated_timeline": self._get_learning_timeline(level)
        }

    def _create_course_comparison(self, courses: list, criteria: list) -> Dict[str, Any]:
        """Create a comparison matrix for courses."""
        comparison_matrix = []

        for course in courses:
            course_data = {
                "title": course.get("title", "Unknown"),
                "difficulty": course.get("difficulty", "Unknown"),
                "duration": course.get("duration", "Unknown"),
                "topics": course.get("topics", []),
                "url": course.get("url", ""),
                "instructor": course.get("instructor", "Unknown")
            }

            # Add scoring for each criterion
            if "difficulty" in criteria:
                course_data["difficulty_score"] = self._score_difficulty(course.get("difficulty", ""))
            if "duration" in criteria:
                course_data["duration_score"] = self._score_duration(course.get("duration", ""))

            comparison_matrix.append(course_data)

        # Generate recommendations
        recommendations = self._generate_course_recommendations(comparison_matrix)

        return {
            "matrix": comparison_matrix,
            "recommendations": recommendations,
            "best_for_beginners": self._find_best_for_beginners(comparison_matrix),
            "best_overall": self._find_best_overall(comparison_matrix),
            "most_comprehensive": self._find_most_comprehensive(comparison_matrix)
        }

    def _get_tool_category(self, tool_name: str) -> str:
        """Get the category of a tool for filtering purposes."""
        tool_categories = {
            "search_courses": "learning",
            "search_knowledge": "general",
            "recommend_learning_path": "learning",
            "assess_skill_level": "learning",
            "compare_courses": "learning"
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

        elif tool_name == "recommend_learning_path":
            data = result.get("data", {})
            topic = tool_arguments.get("topic", "unknown")
            total_courses = data.get("total_courses", 0)
            return f"recommend_learning_path('{topic}') → {total_courses} courses in path, success={success}"

        elif tool_name == "assess_skill_level":
            data = result.get("data", {})
            topic = tool_arguments.get("topic", "unknown")
            level = data.get("assessed_level", "unknown")
            return f"assess_skill_level('{topic}') → assessed as {level}, success={success}"

        elif tool_name == "compare_courses":
            data = result.get("data", {})
            topic = tool_arguments.get("topic", "unknown")
            courses_compared = data.get("courses_compared", 0)
            return f"compare_courses('{topic}') → {courses_compared} courses compared, success={success}"

        return f"{tool_name}({tool_arguments}) → success={success}"

    # Helper methods for the new tools
    def _get_learning_style_notes(self, learning_style: str) -> str:
        """Get notes based on learning style preference."""
        notes = {
            "hands-on": "Focus on practical projects and coding exercises",
            "theoretical": "Emphasize conceptual understanding and theory",
            "mixed": "Balance theory with practical application",
            "unknown": "Recommended to try both theoretical and practical approaches"
        }
        return notes.get(learning_style, notes["unknown"])

    def _extract_strengths(self, description: str, topic: str) -> list:
        """Extract mentioned strengths from user description."""
        # Simple keyword extraction - could be enhanced with NLP
        strengths = []
        if "experience" in description:
            strengths.append("Has relevant experience")
        if "project" in description:
            strengths.append("Has worked on projects")
        if "familiar" in description:
            strengths.append("Familiar with basics")
        return strengths or ["Motivation to learn"]

    def _identify_learning_gaps(self, level: str, topic: str) -> list:
        """Identify potential learning gaps based on level."""
        gaps = {
            "beginner": ["Fundamental concepts", "Basic terminology", "Practical application"],
            "intermediate": ["Advanced techniques", "Best practices", "Real-world application"],
            "advanced": ["Cutting-edge developments", "Leadership skills", "Teaching others"]
        }
        return gaps.get(level, gaps["beginner"])

    def _get_immediate_goals(self, level: str, topic: str) -> list:
        """Get immediate learning goals based on level."""
        goals = {
            "beginner": [f"Understand {topic} fundamentals", "Complete first project", "Learn basic terminology"],
            "intermediate": [f"Master {topic} best practices", "Build complex projects", "Learn advanced techniques"],
            "advanced": [f"Stay current with {topic} trends", "Mentor others", "Contribute to community"]
        }
        return goals.get(level, goals["beginner"])

    def _get_skills_to_develop(self, level: str, topic: str) -> list:
        """Get skills to develop based on level."""
        skills = {
            "beginner": ["Basic concepts", "Hands-on practice", "Problem-solving"],
            "intermediate": ["Advanced techniques", "System design", "Optimization"],
            "advanced": ["Innovation", "Leadership", "Knowledge sharing"]
        }
        return skills.get(level, skills["beginner"])

    def _get_learning_timeline(self, level: str) -> str:
        """Get estimated learning timeline based on level."""
        timelines = {
            "beginner": "3-6 months for solid foundation",
            "intermediate": "2-4 months for advanced skills",
            "advanced": "1-3 months for specialization"
        }
        return timelines.get(level, timelines["beginner"])

    def _score_difficulty(self, difficulty: str) -> int:
        """Score difficulty level (1-3)."""
        scores = {"beginner": 1, "intermediate": 2, "advanced": 3}
        return scores.get(difficulty.lower(), 1)

    def _score_duration(self, duration: str) -> int:
        """Score duration (1-3, shorter is higher score)."""
        if "week" in duration.lower():
            weeks = int(''.join(filter(str.isdigit, duration)) or 4)
            return 3 if weeks <= 4 else 2 if weeks <= 8 else 1
        return 2  # Default score

    def _generate_course_recommendations(self, courses: list) -> list:
        """Generate recommendations based on course comparison."""
        recommendations = []

        # Find beginner-friendly course
        beginner_courses = [c for c in courses if c.get("difficulty", "").lower() == "beginner"]
        if beginner_courses:
            recommendations.append(f"For beginners: {beginner_courses[0]['title']}")

        # Find comprehensive course (most topics)
        if courses:
            comprehensive = max(courses, key=lambda c: len(c.get("topics", [])))
            recommendations.append(f"Most comprehensive: {comprehensive['title']}")

        return recommendations

    def _find_best_for_beginners(self, courses: list) -> Optional[Dict[str, Any]]:
        """Find the best course for beginners."""
        beginner_courses = [c for c in courses if c.get("difficulty", "").lower() == "beginner"]
        return beginner_courses[0] if beginner_courses else None

    def _find_best_overall(self, courses: list) -> Optional[Dict[str, Any]]:
        """Find the best overall course."""
        # Simple scoring: prefer intermediate difficulty with good topic coverage
        if not courses:
            return None

        def score_course(course):
            score = 0
            if course.get("difficulty", "").lower() == "intermediate":
                score += 2
            score += len(course.get("topics", [])) * 0.5
            return score

        return max(courses, key=score_course)

    def _find_most_comprehensive(self, courses: list) -> Optional[Dict[str, Any]]:
        """Find the most comprehensive course."""
        if not courses:
            return None
        return max(courses, key=lambda c: len(c.get("topics", [])))
