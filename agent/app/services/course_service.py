"""
Course Search Service for Agent

Handles course discovery and recommendations for learning-related queries.
Integrates with the admin backend course API for course data.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any, Optional
import httpx
import weave
from app.utils.weave_utils import add_session_metadata


class CourseService:
    """
    Course service for searching and recommending courses.
    """

    def __init__(self, admin_base_url: str = None):
        """Initialize course service with admin backend URL."""
        if admin_base_url is None:
            from app.config import ADMIN_BASE_URL
            admin_base_url = ADMIN_BASE_URL
        self.admin_base_url = admin_base_url or "http://localhost:8001"
        
    @weave.op()
    async def search_courses(
        self,
        query: str,
        use_vector: bool = True,
        limit: int = 5,
        difficulty: Optional[str] = None,
        instructor: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Search for courses based on a query.
        
        Args:
            query: The search query
            use_vector: Whether to use vector similarity search
            limit: Maximum number of courses to return
            difficulty: Filter by difficulty level
            instructor: Filter by instructor
            
        Returns:
            Dictionary with search results and metadata
        """
        print(f"🎓 Course Service: Searching for courses")
        print(f"   Query: '{query}'")
        print(f"   Use vector: {use_vector}")
        print(f"   Limit: {limit}")
        print(f"   Difficulty: {difficulty}")
        print(f"   Instructor: {instructor}")
        
        # Add course search metadata
        add_session_metadata(
            operation_type="course_search",
            query_length=len(query),
            use_vector=use_vector,
            limit=limit,
            difficulty=difficulty,
            instructor=instructor
        )
        
        try:
            # Build search parameters
            params = {
                "q": query,
                "useVector": "true" if use_vector else "false",
                "limit": str(limit)
            }
            
            if difficulty:
                params["difficulty"] = difficulty
            if instructor:
                params["instructor"] = instructor
            
            # Make request to admin backend
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.admin_base_url}/api/courses/search",
                    params=params,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    raise Exception(f"Course search failed: {response.status_code} {response.text}")
                
                result = response.json()
                
                print(f"📊 Course Service: Search results:")
                print(f"   Search method: {result.get('searchMethod', 'unknown')}")
                print(f"   Total results: {result.get('total', 0)}")
                print(f"   Courses found: {len(result.get('results', []))}")
                
                return result
                
        except Exception as e:
            print(f"❌ Course Service: Search failed: {str(e)}")
            raise Exception(f"Failed to search courses: {str(e)}")
    
    @weave.op()
    async def get_course_details(self, course_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific course.
        
        Args:
            course_id: The course ID
            
        Returns:
            Course details dictionary
        """
        print(f"🎓 Course Service: Getting course details for ID: {course_id}")
        
        add_session_metadata(
            operation_type="course_details",
            course_id=course_id
        )
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.admin_base_url}/api/courses/{course_id}",
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    raise Exception(f"Course details failed: {response.status_code} {response.text}")
                
                course = response.json()
                
                print(f"📊 Course Service: Course details retrieved:")
                print(f"   Title: {course.get('title', 'Unknown')}")
                print(f"   Difficulty: {course.get('difficulty', 'Unknown')}")
                print(f"   Duration: {course.get('duration', 'Unknown')}")
                
                return course
                
        except Exception as e:
            print(f"❌ Course Service: Get details failed: {str(e)}")
            raise Exception(f"Failed to get course details: {str(e)}")
    
    @weave.op()
    async def get_course_stats(self) -> Dict[str, Any]:
        """
        Get course statistics from the admin backend.
        
        Returns:
            Course statistics dictionary
        """
        print(f"📊 Course Service: Getting course statistics")
        
        add_session_metadata(operation_type="course_stats")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.admin_base_url}/api/courses/stats",
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    raise Exception(f"Course stats failed: {response.status_code} {response.text}")
                
                stats = response.json()
                
                print(f"📊 Course Service: Statistics retrieved:")
                print(f"   Total courses: {stats.get('totalCourses', 0)}")
                print(f"   Difficulty breakdown: {stats.get('byDifficulty', {})}")
                
                return stats
                
        except Exception as e:
            print(f"❌ Course Service: Get stats failed: {str(e)}")
            raise Exception(f"Failed to get course stats: {str(e)}")
    
    @weave.op()
    def format_course_response(
        self,
        search_result: Dict[str, Any],
        query: str
    ) -> str:
        """
        Format course search results into a human-readable response.
        
        Args:
            search_result: The course search result from the API
            query: The original user query
            
        Returns:
            Formatted response string
        """
        print(f"📝 Course Service: Formatting course response")
        
        add_session_metadata(
            operation_type="course_formatting",
            query_length=len(query),
            num_courses=len(search_result.get('results', []))
        )
        
        courses = search_result.get('results', [])
        search_method = search_result.get('searchMethod', 'text')
        total = search_result.get('total', 0)
        
        if not courses:
            return f"I couldn't find any courses related to '{query}'. You might want to try a different search term or check out all available courses."
        
        # Build response
        response_parts = []
        
        # Header
        if total == 1:
            response_parts.append(f"I found 1 course related to '{query}':")
        else:
            response_parts.append(f"I found {total} courses related to '{query}':")
        
        # Course list
        for i, course in enumerate(courses, 1):
            title = course.get('title', 'Unknown Course')
            difficulty = course.get('difficulty', 'Unknown')
            duration = course.get('duration', 'Unknown duration')
            topics = course.get('topics', [])
            description = course.get('description', '')
            
            course_info = f"\n{i}. **{title}**"
            course_info += f"\n   - Difficulty: {difficulty.title()}"
            course_info += f"\n   - Duration: {duration}"
            
            if topics:
                topics_str = ", ".join(topics[:5])  # Limit to first 5 topics
                course_info += f"\n   - Topics: {topics_str}"
            
            if description and len(description) > 50:
                # Use first sentence or first 100 chars
                desc_preview = description.split('.')[0][:100]
                if len(desc_preview) < len(description):
                    desc_preview += "..."
                course_info += f"\n   - Description: {desc_preview}"
            
            response_parts.append(course_info)
        
        # Footer with search method info
        if search_method == "vector":
            response_parts.append(f"\n*These courses were found using semantic similarity search.*")
        
        response_parts.append(f"\nWould you like more details about any of these courses, or would you like me to search for something more specific?")
        
        return "\n".join(response_parts)
