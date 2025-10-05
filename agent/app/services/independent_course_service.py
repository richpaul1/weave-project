"""
Independent Course Service for Agent

Handles course discovery and recommendations for learning-related queries.
Queries Neo4j directly instead of depending on admin backend.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any, Optional
import weave
from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.utils.weave_utils import add_session_metadata


class IndependentCourseService:
    """
    Independent course service that queries Neo4j directly.
    """

    def __init__(self, storage_service: StorageService = None, llm_service: LLMService = None):
        """Initialize independent course service with direct Neo4j access."""
        self.storage = storage_service or StorageService()
        self.llm_service = llm_service or LLMService()
        
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
        Search for courses based on a query using Neo4j directly.
        
        Args:
            query: The search query
            use_vector: Whether to use vector similarity search
            limit: Maximum number of courses to return
            difficulty: Filter by difficulty level
            instructor: Filter by instructor
            
        Returns:
            Dictionary with search results and metadata
        """
        print(f"🎓 Independent Course Service: Searching for courses")
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
            self.storage.connect()
            
            if use_vector:
                # Try vector search first
                try:
                    courses = await self._vector_search_courses(query, limit, difficulty, instructor)
                    search_method = "vector"
                except Exception as e:
                    print(f"⚠️ Vector search failed, falling back to text search: {e}")
                    courses = await self._text_search_courses(query, limit, difficulty, instructor)
                    search_method = "text"
            else:
                # Use text search
                courses = await self._text_search_courses(query, limit, difficulty, instructor)
                search_method = "text"
            
            result = {
                "searchMethod": search_method,
                "total": len(courses),
                "results": courses
            }
            
            print(f"📊 Independent Course Service: Search results:")
            print(f"   Search method: {search_method}")
            print(f"   Total results: {len(courses)}")
            print(f"   Courses found: {len(courses)}")
            
            return result
            
        except Exception as e:
            print(f"❌ Independent Course Service: Search failed: {str(e)}")
            raise Exception(f"Failed to search courses: {str(e)}")
        finally:
            self.storage.close()
    
    async def _vector_search_courses(
        self, 
        query: str, 
        limit: int, 
        difficulty: Optional[str] = None, 
        instructor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search courses using vector similarity."""
        # Generate query embedding
        query_embedding = await self.llm_service.generate_embedding(query)
        
        # Build Neo4j query with vector similarity
        cypher_query = """
        MATCH (c:Course)
        WHERE c.isActive = true
        """
        
        params = {"limit": limit}
        
        # Add filters
        if difficulty:
            cypher_query += " AND c.difficulty = $difficulty"
            params["difficulty"] = difficulty
            
        if instructor:
            cypher_query += " AND c.instructor = $instructor"
            params["instructor"] = instructor
        
        # Add vector similarity calculation using manual cosine similarity
        cypher_query += """
        WITH c,
             reduce(dot = 0.0, i IN range(0, size(c.embedding)-1) |
               dot + c.embedding[i] * $queryEmbedding[i]) AS dotProduct,
             sqrt(reduce(norm1 = 0.0, i IN range(0, size(c.embedding)-1) |
               norm1 + c.embedding[i] * c.embedding[i])) AS norm1,
             sqrt(reduce(norm2 = 0.0, i IN range(0, size($queryEmbedding)-1) |
               norm2 + $queryEmbedding[i] * $queryEmbedding[i])) AS norm2
        WITH c, dotProduct / (norm1 * norm2) AS score
        WHERE score > 0.7
        RETURN c, score
        ORDER BY score DESC
        LIMIT $limit
        """
        params["queryEmbedding"] = query_embedding
        
        with self.storage._get_session() as session:
            result = session.run(cypher_query, params)
            courses = []
            
            for record in result:
                course_node = record["c"]
                score = record["score"]
                
                course_data = dict(course_node)
                course_data["score"] = score
                courses.append(course_data)
            
            return courses
    
    async def _text_search_courses(
        self, 
        query: str, 
        limit: int, 
        difficulty: Optional[str] = None, 
        instructor: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search courses using text matching."""
        # Build Neo4j query with text search
        cypher_query = """
        MATCH (c:Course)
        WHERE c.isActive = true
        AND (
            toLower(c.title) CONTAINS toLower($query)
            OR toLower(c.description) CONTAINS toLower($query)
            OR any(topic IN c.topics WHERE toLower(topic) CONTAINS toLower($query))
        )
        """
        
        params = {"query": query, "limit": limit}
        
        # Add filters
        if difficulty:
            cypher_query += " AND c.difficulty = $difficulty"
            params["difficulty"] = difficulty
            
        if instructor:
            cypher_query += " AND c.instructor = $instructor"
            params["instructor"] = instructor
        
        cypher_query += """
        RETURN c
        ORDER BY c.createdAt DESC
        LIMIT $limit
        """
        
        with self.storage._get_session() as session:
            result = session.run(cypher_query, params)
            courses = []
            
            for record in result:
                course_node = record["c"]
                course_data = dict(course_node)
                courses.append(course_data)
            
            return courses
    
    @weave.op()
    async def get_course_details(self, course_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific course.
        
        Args:
            course_id: The course ID
            
        Returns:
            Course details dictionary
        """
        print(f"🎓 Independent Course Service: Getting course details for ID: {course_id}")
        
        add_session_metadata(
            operation_type="course_details",
            course_id=course_id
        )
        
        try:
            self.storage.connect()
            
            cypher_query = """
            MATCH (c:Course {id: $courseId})
            RETURN c
            """
            
            with self.storage._get_session() as session:
                result = session.run(cypher_query, {"courseId": course_id})
                record = result.single()
                
                if not record:
                    raise Exception(f"Course not found: {course_id}")
                
                course_node = record["c"]
                course_data = dict(course_node)
                
                print(f"📊 Independent Course Service: Course details retrieved:")
                print(f"   Title: {course_data.get('title', 'Unknown')}")
                print(f"   Difficulty: {course_data.get('difficulty', 'Unknown')}")
                print(f"   Duration: {course_data.get('duration', 'Unknown')}")
                
                return course_data
                
        except Exception as e:
            print(f"❌ Independent Course Service: Get details failed: {str(e)}")
            raise Exception(f"Failed to get course details: {str(e)}")
        finally:
            self.storage.close()
    
    @weave.op()
    async def get_course_stats(self) -> Dict[str, Any]:
        """
        Get course statistics from Neo4j.
        
        Returns:
            Course statistics dictionary
        """
        print(f"📊 Independent Course Service: Getting course statistics")
        
        add_session_metadata(operation_type="course_stats")
        
        try:
            self.storage.connect()
            
            cypher_query = """
            MATCH (c:Course)
            WITH 
                count(c) as totalCourses,
                count(CASE WHEN c.isActive = true THEN 1 END) as activeCourses,
                collect(c.difficulty) as difficulties,
                collect(c.topics) as allTopics
            UNWIND difficulties as difficulty
            WITH totalCourses, activeCourses, difficulty, allTopics,
                 count(difficulty) as difficultyCount
            WITH totalCourses, activeCourses, 
                 collect({difficulty: difficulty, count: difficultyCount}) as byDifficulty,
                 allTopics
            UNWIND allTopics as topicList
            UNWIND topicList as topic
            WITH totalCourses, activeCourses, byDifficulty, topic, count(topic) as topicCount
            RETURN totalCourses, activeCourses, 
                   apoc.map.fromPairs(collect([difficulty.difficulty, difficulty.count])) as byDifficulty,
                   collect({topic: topic, count: topicCount})[0..10] as topTopics
            """
            
            with self.storage._get_session() as session:
                result = session.run(cypher_query)
                record = result.single()
                
                if record:
                    stats = {
                        "totalCourses": record["totalCourses"],
                        "activeCourses": record["activeCourses"], 
                        "byDifficulty": record["byDifficulty"] or {},
                        "topTopics": record["topTopics"] or []
                    }
                else:
                    stats = {
                        "totalCourses": 0,
                        "activeCourses": 0,
                        "byDifficulty": {},
                        "topTopics": []
                    }
                
                print(f"📊 Independent Course Service: Statistics retrieved:")
                print(f"   Total courses: {stats['totalCourses']}")
                print(f"   Active courses: {stats['activeCourses']}")
                print(f"   Difficulty breakdown: {stats['byDifficulty']}")
                
                return stats
                
        except Exception as e:
            print(f"❌ Independent Course Service: Get stats failed: {str(e)}")
            raise Exception(f"Failed to get course stats: {str(e)}")
        finally:
            self.storage.close()

    @weave.op()
    def format_course_response(
        self,
        search_result: Dict[str, Any],
        query: str
    ) -> str:
        """
        Format course search results into a human-readable response.

        Args:
            search_result: The course search result from the search
            query: The original user query

        Returns:
            Formatted response string
        """
        print(f"📝 Independent Course Service: Formatting course response")

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
