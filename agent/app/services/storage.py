"""
Neo4j Storage Service for RAG Pipeline

Handles reading content from Neo4j database populated by admin backend.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase, Driver, Session
from datetime import datetime
import uuid
import weave
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
    def create_chat_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new chat message in Neo4j.

        Args:
            message_data: Dictionary containing message data

        Returns:
            Created message with ID and timestamp
        """
        with self._get_session() as session:
            message_id = str(uuid.uuid4())
            timestamp = datetime.now()

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
            session_id: Session ID to retrieve messages for

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
                    "timestamp": props["timestamp"]
                })

            return messages

    @weave.op()
    def delete_chat_messages(self, session_id: str) -> bool:
        """
        Delete all chat messages for a session.

        Args:
            session_id: Session ID to delete messages for

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

