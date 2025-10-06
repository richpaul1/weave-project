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

            # Log the count of pages returned for debugging
            print(f"📊 Retrieved {len(pages)} pages from Neo4j")

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
        print(f"🔍 Storage Service: Starting vector search")
        print(f"   Embedding length: {len(embedding)}")
        print(f"   Limit: {limit}")
        print(f"   Min score: {min_score}")

        with self._get_session() as session:
            # First, let's check how many chunks exist in total
            count_result = session.run("MATCH (c:Chunk) RETURN count(c) as total_chunks")
            total_chunks = count_result.single()["total_chunks"]
            print(f"   Total chunks in database: {total_chunks}")

            # Check how many chunks have embeddings
            embedding_count_result = session.run("MATCH (c:Chunk) WHERE c.embedding IS NOT NULL RETURN count(c) as chunks_with_embeddings")
            chunks_with_embeddings = embedding_count_result.single()["chunks_with_embeddings"]
            print(f"   Chunks with embeddings: {chunks_with_embeddings}")

            # Note: This uses cosine similarity (built-in Neo4j 5.x function)
            # In production, you'd use a vector index for better performance
            print(f"🔎 Storage Service: Executing vector similarity query...")
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

            print(f"📊 Storage Service: Vector search results:")
            print(f"   Results found: {len(results)}")
            if results:
                print(f"   Top 3 scores: {[r['score'] for r in results[:3]]}")
                print(f"   Top 3 titles: {[r['title'][:50] if r['title'] else 'No title' for r in results[:3]]}")
            else:
                print(f"   ⚠️ No results found with min_score {min_score}")
                # Let's check what the best score would be without the threshold
                best_score_result = session.run("""
                    MATCH (c:Chunk)<-[:HAS_CHUNK]-(p:Page)
                    WHERE c.embedding IS NOT NULL
                    WITH c, p,
                         vector.similarity.cosine(c.embedding, $embedding) as score
                    RETURN max(score) as best_score
                """, embedding=embedding)
                best_score_record = best_score_result.single()
                if best_score_record and best_score_record["best_score"]:
                    print(f"   Best possible score: {best_score_record['best_score']}")
                else:
                    print(f"   No embeddings found to compare against")

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

            # Prepare metadata as JSON string if present
            metadata_json = None
            if message_data.get("metadata"):
                import json
                metadata_json = json.dumps(message_data["metadata"])

            query = """
            CREATE (m:ChatMessage {
                id: $id,
                sessionId: $sessionId,
                sender: $sender,
                message: $message,
                thinking: $thinking,
                metadata: $metadata,
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
                "metadata": metadata_json,
                "timestamp": timestamp.isoformat()
            })

            record = result.single()
            if record:
                props = record["m"]

                # Parse metadata if present
                metadata = None
                if props.get("metadata"):
                    import json
                    try:
                        metadata = json.loads(props["metadata"])
                    except json.JSONDecodeError:
                        metadata = None

                return {
                    "id": props["id"],
                    "sessionId": props["sessionId"],
                    "sender": props["sender"],
                    "message": props["message"],
                    "thinking": props["thinking"],
                    "metadata": metadata,
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

                # Parse metadata if present
                metadata = None
                if props.get("metadata"):
                    import json
                    try:
                        metadata = json.loads(props["metadata"])
                    except json.JSONDecodeError:
                        metadata = None

                messages.append({
                    "id": props["id"],
                    "sessionId": props["sessionId"],
                    "sender": props["sender"],
                    "message": props["message"],
                    "thinking": props.get("thinking", ""),
                    "metadata": metadata,
                    "timestamp": self._convert_neo4j_datetime(props["timestamp"])
                })

            return messages

    @weave.op()
    def get_recent_conversation_history(self, session_id: str, num_pairs: int = 3) -> List[Dict[str, Any]]:
        """
        Retrieve recent conversation history as Q&A pairs for LLM context.

        Gets the most recent N question-answer pairs, excluding the current conversation
        (since we don't want to include the question we're about to answer).

        Args:
            session_id: Session ID to retrieve history for
            num_pairs: Number of Q&A pairs to retrieve (default: 3)

        Returns:
            List of Q&A pair dictionaries with 'question' and 'answer' keys,
            ordered from oldest to newest
        """
        with self._get_session() as session:
            # Get recent messages, excluding the very last user message (current question)
            # We want pairs, so we get (num_pairs * 2) messages and pair them up
            query = """
            MATCH (m:ChatMessage {sessionId: $sessionId})
            WHERE m.sender IN ['user', 'ai']
            RETURN m.sender as sender, m.message as message, m.timestamp as timestamp
            ORDER BY m.timestamp DESC
            LIMIT $limit
            """

            # Get more messages than needed to ensure we have complete pairs
            limit = (num_pairs * 2) + 2  # Extra buffer for incomplete pairs
            result = session.run(query, {"sessionId": session_id, "limit": limit})
            messages = list(result)

            if len(messages) < 2:
                # Not enough history for any pairs
                return []

            # Skip the most recent message if it's a user message (current question)
            if messages and messages[0]["sender"] == "user":
                messages = messages[1:]

            # Group messages into Q&A pairs (user question + ai answer)
            pairs = []
            i = 0
            while i < len(messages) - 1 and len(pairs) < num_pairs:
                # Look for ai message followed by user message (reverse chronological order)
                if (messages[i]["sender"] == "ai" and
                    messages[i + 1]["sender"] == "user"):
                    pairs.append({
                        "question": messages[i + 1]["message"],
                        "answer": messages[i]["message"],
                        "timestamp": self._convert_neo4j_datetime(messages[i + 1]["timestamp"])
                    })
                    i += 2  # Skip both messages in the pair
                else:
                    i += 1  # Skip incomplete pair

            # Reverse to get chronological order (oldest to newest)
            pairs.reverse()

            print(f"📚 Retrieved {len(pairs)} conversation pairs for session {session_id}")
            return pairs

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
    def delete_orphaned_messages(self) -> int:
        """
        Delete all orphaned chat messages (messages with null sessionId).

        This is useful for cleaning up messages that were created before the session ID fix.

        Returns:
            Number of messages deleted
        """
        with self._get_session() as session:
            query = """
            MATCH (m:ChatMessage)
            WHERE m.sessionId IS NULL
            DETACH DELETE m
            RETURN count(m) as deletedCount
            """

            result = session.run(query)
            record = result.single()
            deleted_count = record["deletedCount"] if record else 0

            print(f"🧹 Deleted {deleted_count} orphaned messages with null sessionId")
            return deleted_count

    @weave.op()
    def delete_all_chat_messages(self) -> int:
        """
        Delete ALL chat messages from all sessions.

        This completely clears the chat history database.

        Returns:
            Number of messages deleted
        """
        with self._get_session() as session:
            # First count the messages
            count_query = """
            MATCH (m:ChatMessage)
            RETURN count(m) as totalCount
            """

            count_result = session.run(count_query)
            count_record = count_result.single()
            total_count = count_record["totalCount"] if count_record else 0

            print(f"🔍 Found {total_count} total chat messages to delete")

            if total_count == 0:
                print("✅ No messages to delete")
                return 0

            # Delete all messages
            delete_query = """
            MATCH (m:ChatMessage)
            DELETE m
            """

            session.run(delete_query)

            print(f"🧹 Deleted ALL {total_count} chat messages from database")
            return total_count

    def get_recent_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent chat sessions with their latest message and metadata.

        Args:
            limit: Maximum number of sessions to return

        Returns:
            List of session dictionaries with metadata
        """
        try:
            print(f"🔍 Getting recent sessions (limit: {limit})")
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
                    # Use proper Neo4j Record access
                    session_id = summary.get("sessionId") if summary else None
                    last_activity = summary.get("lastActivity") if summary else None
                    message_count = summary.get("messageCount", 0) if summary else 0

                    # Skip if session_id is None
                    if not session_id:
                        print(f"⚠️ Skipping session with None sessionId")
                        continue

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

                    # Create session data with safe access to record fields
                    first_message = first_record["message"] if first_record and "message" in first_record else ""
                    preview = first_message[:100] + "..." if len(first_message) > 100 else first_message
                    title = preview if preview else f"Chat {session_id[:8]}"

                    sessions.append({
                        "sessionId": session_id,
                        "title": title,
                        "preview": preview,
                        "lastActivity": self._convert_neo4j_datetime(last_activity),
                        "createdAt": self._convert_neo4j_datetime(first_record["timestamp"]) if first_record and first_record["timestamp"] else None,
                        "messageCount": message_count,
                        "lastMessage": latest_record["message"] if latest_record and latest_record["message"] else "",
                        "lastSender": latest_record["sender"] if latest_record and latest_record["sender"] else ""
                    })

                print(f"✅ Returning {len(sessions)} sessions")
                return sessions
        except Exception as e:
            print(f"❌ Error in get_recent_sessions: {e}")
            print(f"   Error type: {type(e)}")
            import traceback
            traceback.print_exc()
            raise e

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
            print(f"🔍 Storage Service: Starting page-level vector search")
            print(f"   Embedding length: {len(embedding)}")
            print(f"   Limit: {limit}")
            print(f"   Score threshold: {score_threshold}")

            # Count total pages and pages with embeddings
            total_pages_result = session.run("MATCH (p:Page) RETURN count(p) as total_pages")
            total_pages = total_pages_result.single()["total_pages"]

            pages_with_embeddings_result = session.run("MATCH (p:Page) WHERE p.embedding IS NOT NULL RETURN count(p) as pages_with_embeddings")
            pages_with_embeddings = pages_with_embeddings_result.single()["pages_with_embeddings"]

            print(f"   Total pages in database: {total_pages}")
            print(f"   Pages with embeddings: {pages_with_embeddings}")

            # Query for pages with vector similarity using Neo4j's built-in function
            print(f"🔎 Storage Service: Executing page-level vector similarity query...")
            query = """
            MATCH (p:Page)
            WHERE p.embedding IS NOT NULL
            WITH p, vector.similarity.cosine(p.embedding, $embedding) as score
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

            print(f"📊 Storage Service: Page-level vector search results:")
            print(f"   Results found: {len(pages)}")
            if pages:
                print(f"   Top 3 scores: {[p['score'] for p in pages[:3]]}")
                print(f"   Top 3 titles: {[p['title'] for p in pages[:3]]}")
            else:
                print(f"   ⚠️ No pages found with score >= {score_threshold}")
                # Check what the best possible score would be
                best_score_result = session.run("""
                    MATCH (p:Page)
                    WHERE p.embedding IS NOT NULL
                    WITH p, vector.similarity.cosine(p.embedding, $embedding) as score
                    RETURN max(score) as best_score
                """, embedding=embedding)
                best_score_record = best_score_result.single()
                if best_score_record and best_score_record["best_score"]:
                    print(f"   Best possible page score: {best_score_record['best_score']}")

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

