"""
Neo4j Storage Service for RAG Pipeline

Handles reading content from Neo4j database populated by admin backend.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase, Driver, Session
from neo4j.time import DateTime
from datetime import datetime
import uuid
import weave
import os
import aiofiles
from pathlib import Path
from app.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DB_NAME


class StorageService:
    """
    Neo4j storage service for retrieving content for RAG pipeline.
    
    This service READS from Neo4j (admin backend WRITES to it).
    """
    
    def __init__(self):
        """Initialize Neo4j connection"""
        self.driver: Optional[Driver] = None
        self.database = NEO4J_DB_NAME

    def _convert_neo4j_datetime(self, dt) -> str:
        """Convert Neo4j datetime object to ISO string"""
        if dt is None:
            return None
        if isinstance(dt, DateTime):
            # Neo4j DateTime object - convert to Python datetime then to ISO
            native_dt = dt.to_native()
            if native_dt.tzinfo is None:
                return native_dt.isoformat() + 'Z'
            else:
                return native_dt.isoformat()
        elif hasattr(dt, 'isoformat'):
            # Python datetime object
            return dt.isoformat() + 'Z' if dt.tzinfo is None else dt.isoformat()
        else:
            # Fallback - convert to string
            return str(dt)
        
    def connect(self):
        """Connect to Neo4j database"""
        if not self.driver:
            self.driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD)
            )
            print(f"✓ Connected to Neo4j database: {self.database}")
    
    def close(self):
        """Close Neo4j connection"""
        if self.driver:
            self.driver.close()
            self.driver = None
            print("✓ Closed Neo4j connection")
    
    def _get_session(self) -> Session:
        """Get a Neo4j session"""
        if not self.driver:
            self.connect()
        return self.driver.session(database=self.database)
    
    @weave.op()
    def get_all_pages(self) -> List[Dict[str, Any]]:
        """
        Retrieve all page metadata from Neo4j.
        
        Returns:
            List of page dictionaries with metadata
        """
        with self._get_session() as session:
            result = session.run("""
                MATCH (p:Page)
                RETURN p.id as id, p.url as url, p.domain as domain, 
                       p.slug as slug, p.title as title, p.createdAt as createdAt
                ORDER BY p.createdAt DESC
            """)
            
            pages = []
            for record in result:
                pages.append({
                    "id": record["id"],
                    "url": record["url"],
                    "domain": record["domain"],
                    "slug": record["slug"],
                    "title": record.get("title"),
                    "createdAt": record.get("createdAt")
                })
            
            return pages
    
    @weave.op()
    def get_page_by_id(self, page_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific page by ID.
        
        Args:
            page_id: The page ID
            
        Returns:
            Page dictionary or None if not found
        """
        with self._get_session() as session:
            result = session.run("""
                MATCH (p:Page {id: $page_id})
                RETURN p.id as id, p.url as url, p.domain as domain,
                       p.slug as slug, p.title as title, p.createdAt as createdAt
            """, page_id=page_id)
            
            record = result.single()
            if not record:
                return None
            
            return {
                "id": record["id"],
                "url": record["url"],
                "domain": record["domain"],
                "slug": record["slug"],
                "title": record.get("title"),
                "createdAt": record.get("createdAt")
            }
    
    @weave.op()
    def get_page_chunks(self, page_id: str) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific page.
        
        Args:
            page_id: The page ID
            
        Returns:
            List of chunk dictionaries
        """
        with self._get_session() as session:
            result = session.run("""
                MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
                RETURN c.id as id, c.text as text, c.index as index,
                       c.embedding as embedding
                ORDER BY c.index
            """, page_id=page_id)
            
            chunks = []
            for record in result:
                chunks.append({
                    "id": record["id"],
                    "text": record["text"],
                    "index": record["index"],
                    "embedding": record.get("embedding")
                })
            
            return chunks
    
    @weave.op()
    def search_by_vector(
        self, 
        embedding: List[float], 
        limit: int = 5,
        min_score: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Perform vector similarity search on chunk embeddings.
        
        Args:
            embedding: Query embedding vector
            limit: Maximum number of results to return
            min_score: Minimum similarity score threshold
            
        Returns:
            List of chunks with similarity scores and page metadata
        """
        with self._get_session() as session:
            # Note: This uses cosine similarity (built-in Neo4j 5.x function)
            # In production, you'd use a vector index for better performance
            result = session.run("""
                MATCH (c:Chunk)<-[:HAS_CHUNK]-(p:Page)
                WHERE c.embedding IS NOT NULL
                WITH c, p,
                     vector.similarity.cosine(c.embedding, $embedding) as score
                WHERE score >= $min_score
                RETURN c.id as chunk_id, c.text as text, c.index as chunk_index,
                       p.id as page_id, p.url as url, p.title as title,
                       p.domain as domain, score
                ORDER BY score DESC
                LIMIT $limit
            """, embedding=embedding, limit=limit, min_score=min_score)
            
            results = []
            for record in result:
                results.append({
                    "chunk_id": record["chunk_id"],
                    "text": record["text"],
                    "chunk_index": record["chunk_index"],
                    "page_id": record["page_id"],
                    "url": record["url"],
                    "title": record.get("title"),
                    "domain": record["domain"],
                    "score": record["score"]
                })
            
            return results
    
    @weave.op()
    def get_chunk_by_id(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific chunk by ID with its page metadata.
        
        Args:
            chunk_id: The chunk ID
            
        Returns:
            Chunk dictionary with page metadata or None if not found
        """
        with self._get_session() as session:
            result = session.run("""
                MATCH (c:Chunk {id: $chunk_id})<-[:HAS_CHUNK]-(p:Page)
                RETURN c.id as chunk_id, c.text as text, c.index as chunk_index,
                       c.embedding as embedding,
                       p.id as page_id, p.url as url, p.title as title,
                       p.domain as domain
            """, chunk_id=chunk_id)
            
            record = result.single()
            if not record:
                return None
            
            return {
                "chunk_id": record["chunk_id"],
                "text": record["text"],
                "chunk_index": record["chunk_index"],
                "embedding": record.get("embedding"),
                "page_id": record["page_id"],
                "url": record["url"],
                "title": record.get("title"),
                "domain": record["domain"]
            }
    
    @weave.op()
    def get_related_chunks(
        self, 
        chunk_id: str, 
        limit: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Get chunks related to a given chunk (from same page or linked pages).
        
        Args:
            chunk_id: The source chunk ID
            limit: Maximum number of related chunks to return
            
        Returns:
            List of related chunks with metadata
        """
        with self._get_session() as session:
            # Get chunks from the same page
            result = session.run("""
                MATCH (c1:Chunk {id: $chunk_id})<-[:HAS_CHUNK]-(p:Page)-[:HAS_CHUNK]->(c2:Chunk)
                WHERE c1.id <> c2.id
                RETURN c2.id as chunk_id, c2.text as text, c2.index as chunk_index,
                       p.id as page_id, p.url as url, p.title as title,
                       'same_page' as relation_type
                ORDER BY abs(c2.index - c1.index)
                LIMIT $limit
            """, chunk_id=chunk_id, limit=limit)
            
            chunks = []
            for record in result:
                chunks.append({
                    "chunk_id": record["chunk_id"],
                    "text": record["text"],
                    "chunk_index": record["chunk_index"],
                    "page_id": record["page_id"],
                    "url": record["url"],
                    "title": record.get("title"),
                    "relation_type": record["relation_type"]
                })
            
            return chunks

    @weave.op()
    def create_chat_message(self, message_data: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new chat message in Neo4j.

        Args:
            message_data: Dictionary containing message data
            session_id: Optional session ID for Weave tracking

        Returns:
            Created message with ID and timestamp
        """
        # Extract session_id from message_data if not provided
        if not session_id:
            session_id = message_data.get("sessionId")

        with self._get_session() as session:
            message_id = str(uuid.uuid4())
            timestamp = datetime.utcnow()

            query = """
            CREATE (m:ChatMessage {
                id: $id,
                sessionId: $sessionId,
                sender: $sender,
                message: $message,
                thinking: $thinking,
                timestamp: datetime($timestamp)
            })
            RETURN m
            """

            result = session.run(query, {
                "id": message_id,
                "sessionId": message_data.get("sessionId"),
                "sender": message_data.get("sender"),
                "message": message_data.get("message"),
                "thinking": message_data.get("thinking", ""),
                "timestamp": timestamp.isoformat()
            })

            record = result.single()
            if record:
                props = record["m"]
                return {
                    "id": props["id"],
                    "sessionId": props["sessionId"],
                    "sender": props["sender"],
                    "message": props["message"],
                    "thinking": props["thinking"],
                    "timestamp": props["timestamp"]
                }

            return {}

    @weave.op()
    def get_chat_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve all chat messages for a session.

        Args:
            session_id: Session ID to retrieve messages for (also tracked by Weave)

        Returns:
            List of chat messages ordered by timestamp
        """
        with self._get_session() as session:
            query = """
            MATCH (m:ChatMessage {sessionId: $sessionId})
            RETURN m
            ORDER BY m.timestamp ASC
            """

            result = session.run(query, {"sessionId": session_id})
            messages = []

            for record in result:
                props = record["m"]
                messages.append({
                    "id": props["id"],
                    "sessionId": props["sessionId"],
                    "sender": props["sender"],
                    "message": props["message"],
                    "thinking": props.get("thinking", ""),
                    "timestamp": self._convert_neo4j_datetime(props["timestamp"])
                })

            return messages

    @weave.op()
    def delete_chat_messages(self, session_id: str) -> bool:
        """
        Delete all chat messages for a session.

        Args:
            session_id: Session ID to delete messages for (also tracked by Weave)

        Returns:
            True if messages were deleted
        """
        with self._get_session() as session:
            query = """
            MATCH (m:ChatMessage {sessionId: $sessionId})
            DETACH DELETE m
            RETURN count(m) as deletedCount
            """

            result = session.run(query, {"sessionId": session_id})
            record = result.single()
            deleted_count = record["deletedCount"] if record else 0

            return deleted_count > 0

    @weave.op()
    def get_recent_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent chat sessions with their latest message and metadata.

        Args:
            limit: Maximum number of sessions to return

        Returns:
            List of session dictionaries with metadata
        """
        with self._get_session() as session:
            # First get session summaries
            summary_query = """
            MATCH (m:ChatMessage)
            WITH m.sessionId as sessionId,
                 max(m.timestamp) as lastActivity,
                 count(m) as messageCount
            RETURN sessionId, lastActivity, messageCount
            ORDER BY lastActivity DESC
            LIMIT $limit
            """

            summary_result = session.run(summary_query, {"limit": limit})
            session_summaries = list(summary_result)

            sessions = []

            for summary in session_summaries:
                session_id = summary["sessionId"]
                last_activity = summary["lastActivity"]
                message_count = summary["messageCount"]

                # Get latest message
                latest_query = """
                MATCH (m:ChatMessage {sessionId: $sessionId})
                RETURN m.message as message, m.sender as sender, m.timestamp as timestamp
                ORDER BY m.timestamp DESC
                LIMIT 1
                """

                latest_result = session.run(latest_query, {"sessionId": session_id})
                latest_record = latest_result.single()

                # Get first message
                first_query = """
                MATCH (m:ChatMessage {sessionId: $sessionId})
                RETURN m.message as message, m.timestamp as timestamp
                ORDER BY m.timestamp ASC
                LIMIT 1
                """

                first_result = session.run(first_query, {"sessionId": session_id})
                first_record = first_result.single()

                # Create session data
                first_message = first_record["message"] if first_record else ""
                preview = first_message[:100] + "..." if len(first_message) > 100 else first_message
                title = preview if preview else f"Chat {session_id[:8]}"

                sessions.append({
                    "sessionId": session_id,
                    "title": title,
                    "preview": preview,
                    "lastActivity": self._convert_neo4j_datetime(last_activity),
                    "createdAt": self._convert_neo4j_datetime(first_record["timestamp"]) if first_record else None,
                    "messageCount": message_count,
                    "lastMessage": latest_record["message"] if latest_record else "",
                    "lastSender": latest_record["sender"] if latest_record else ""
                })

            return sessions

    @weave.op()
    def get_relevant_pages(self, embedding: List[float], limit: int = 5, score_threshold: float = 0.9) -> List[Dict[str, Any]]:
        """
        Get relevant pages with score filtering, similar to parent ChatService pattern.

        Args:
            embedding: Query embedding vector
            limit: Maximum number of pages to return
            score_threshold: Minimum score threshold for filtering

        Returns:
            List of relevant pages with scores above threshold
        """
        with self._get_session() as session:
            # Query for pages with vector similarity using manual cosine similarity
            query = """
            MATCH (p:Page)
            WHERE p.embedding IS NOT NULL
            WITH p,
                 reduce(dot = 0.0, i in range(0, size(p.embedding)-1) | dot + p.embedding[i] * $embedding[i]) as dotProduct,
                 sqrt(reduce(norm1 = 0.0, i in range(0, size(p.embedding)-1) | norm1 + p.embedding[i] * p.embedding[i])) as norm1,
                 sqrt(reduce(norm2 = 0.0, i in range(0, size($embedding)-1) | norm2 + $embedding[i] * $embedding[i])) as norm2
            WITH p, dotProduct / (norm1 * norm2) AS score
            WHERE score >= $score_threshold
            RETURN p.id as id, p.url as url, p.title as title, p.domain as domain,
                   p.slug as slug, p.createdAt as createdAt, score
            ORDER BY score DESC
            LIMIT $limit
            """

            result = session.run(query, {
                "embedding": embedding,
                "score_threshold": score_threshold,
                "limit": limit
            })

            pages = []
            for record in result:
                pages.append({
                    "id": record["id"],
                    "url": record["url"],
                    "title": record["title"],
                    "domain": record["domain"],
                    "slug": record["slug"],
                    "createdAt": self._convert_neo4j_datetime(record["createdAt"]),
                    "score": record["score"]
                })

            return pages

    def _generate_safe_filename(self, page_id: str) -> str:
        """
        Generate a safe filename for a page ID.

        Args:
            page_id: The page ID

        Returns:
            Safe filename with .md extension
        """
        # Replace unsafe characters and add .md extension
        safe_name = "".join(c for c in page_id if c.isalnum() or c in ('-', '_')).rstrip()
        return f"{safe_name}.md"

    async def load_markdown_from_file(self, page_id: str) -> Optional[str]:
        """
        Load markdown content from file, similar to parent ChatService pattern.

        Args:
            page_id: The page ID to load markdown for

        Returns:
            Markdown content as string, or None if not found
        """
        try:
            # Get the pages directory path (similar to parent implementation)
            # This should be configurable, but for now use a default path
            pages_dir = Path("data/pages")  # Adjust path as needed

            filename = self._generate_safe_filename(page_id)
            file_path = pages_dir / filename

            if file_path.exists():
                async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    print(f"Loaded markdown for page ID {page_id} from {file_path}")
                    return content
            else:
                print(f"Markdown file not found for page ID {page_id} at {file_path}")
                return None

        except Exception as e:
            print(f"Error loading markdown for page ID {page_id}: {e}")
            return None

    @weave.op()
    def get_settings(self) -> List[Dict[str, str]]:
        """
        Get all settings from Neo4j database.

        Returns:
            List of setting dictionaries with key and value
        """
        with self._get_session() as session:
            result = session.run(
                "MATCH (s:Setting) RETURN s ORDER BY s.key ASC"
            )

            settings = []
            for record in result:
                props = record["s"]
                settings.append({
                    "key": props["key"],
                    "value": props["value"]
                })

            return settings

    @weave.op()
    def get_setting(self, key: str) -> Optional[Dict[str, str]]:
        """
        Get a specific setting by key from Neo4j database.

        Args:
            key: The setting key

        Returns:
            Setting dictionary with key and value, or None if not found
        """
        with self._get_session() as session:
            result = session.run(
                "MATCH (s:Setting {key: $key}) RETURN s",
                {"key": key}
            )

            record = result.single()
            if record:
                props = record["s"]
                return {
                    "key": props["key"],
                    "value": props["value"]
                }

            return None

    @weave.op()
    def create_or_update_setting(self, key: str, value: str) -> Dict[str, str]:
        """
        Create or update a setting in Neo4j database.

        Args:
            key: The setting key
            value: The setting value

        Returns:
            Setting dictionary with key and value
        """
        with self._get_session() as session:
            session.run(
                """
                MERGE (s:Setting {key: $key})
                ON CREATE SET s.value = $value
                ON MATCH SET s.value = $value
                RETURN s
                """,
                {"key": key, "value": value}
            )

            print(f"✅ Setting {key} updated/created in database")
            return {"key": key, "value": value}

