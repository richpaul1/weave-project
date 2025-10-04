"""
Retrieval Service for RAG Pipeline

Handles context retrieval using vector search and graph expansion.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any
import weave
from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.utils.weave_utils import add_session_metadata
from app.services.settings_service import get_settings_service
from app.config import DEFAULT_TOP_K, MIN_RELEVANCE_SCORE, MAX_CONTEXT_LENGTH


class RetrievalService:
    """
    Service for retrieving relevant context for RAG queries.
    
    Uses vector similarity search and graph traversal to find relevant chunks.
    """
    
    def __init__(
        self,
        storage: StorageService,
        llm_service: LLMService
    ):
        """
        Initialize retrieval service.
        
        Args:
            storage: Storage service for Neo4j access
            llm_service: LLM service for generating embeddings
        """
        self.storage = storage
        self.llm_service = llm_service
    
    @weave.op()
    async def retrieve_context(
        self,
        query: str,
        top_k: int = DEFAULT_TOP_K,
        min_score: float = MIN_RELEVANCE_SCORE,
        expand_context: bool = True
    ) -> Dict[str, Any]:
        """
        NESTED CALL: Retrieve relevant context for a query.
        This is a nested operation within a conversation turn.

        Args:
            query: The user query
            top_k: Number of top chunks to retrieve
            min_score: Minimum relevance score threshold (if None, loads from settings)
            expand_context: Whether to expand context with related chunks

        Returns:
            Dictionary with 'chunks', 'sources', 'context_text' keys
        """
        # Load settings if min_score not provided
        if min_score is None:
            settings_service = get_settings_service()
            settings = await settings_service.get_chat_settings()
            min_score = settings.get("search_score_threshold", MIN_RELEVANCE_SCORE)

        print(f"🔍 Retrieval Service: Starting context retrieval")
        print(f"   Query: '{query}'")
        print(f"   Top K: {top_k}")
        print(f"   Min score: {min_score}")
        print(f"   Expand context: {expand_context}")

        # Add retrieval operation metadata
        add_session_metadata(
            operation_type="context_retrieval",
            query_length=len(query),
            top_k=top_k,
            min_score=min_score,
            expand_context=expand_context
        )

        # Generate query embedding
        print(f"🧮 Retrieval Service: Generating query embedding...")
        query_embedding = await self.llm_service.generate_embedding(query)
        print(f"   Embedding length: {len(query_embedding)}")
        print(f"   Embedding sample: {query_embedding[:5]}...")

        # Search for relevant chunks
        print(f"🔎 Retrieval Service: Searching for relevant chunks...")
        chunks = self.storage.search_by_vector(
            embedding=query_embedding,
            limit=top_k,
            min_score=min_score
        )
        print(f"   Initial chunks found: {len(chunks)}")
        if chunks:
            print(f"   Top chunk scores: {[chunk.get('score', 'N/A') for chunk in chunks[:3]]}")
            print(f"   Top chunk titles: {[chunk.get('title', 'N/A')[:50] for chunk in chunks[:3]]}")
        else:
            print(f"   ⚠️ No chunks found with min_score {min_score}")

        # Expand context if requested
        if expand_context and chunks:
            print(f"📈 Retrieval Service: Expanding context graph...")
            chunks = await self._expand_context_graph(chunks, max_additional=top_k)
            print(f"   Chunks after expansion: {len(chunks)}")

        # Rank and filter chunks
        print(f"📊 Retrieval Service: Ranking and filtering chunks...")
        ranked_chunks = self._rank_context(chunks, query)
        print(f"   Final ranked chunks: {len(ranked_chunks)}")

        # Build context text
        print(f"📝 Retrieval Service: Building context text...")
        context_text = self._build_context_text(ranked_chunks)
        print(f"   Context text length: {len(context_text)}")

        # Extract unique sources
        print(f"📚 Retrieval Service: Extracting sources...")
        sources = self._extract_sources(ranked_chunks)
        print(f"   Unique sources: {len(sources)}")
        print(f"   Source titles: {[s.get('title', 'N/A')[:50] for s in sources]}")

        result = {
            "chunks": ranked_chunks,
            "sources": sources,
            "context_text": context_text,
            "num_chunks": len(ranked_chunks),
            "num_sources": len(sources)
        }

        print(f"✅ Retrieval Service: Context retrieval complete")
        print(f"   Final result: {len(ranked_chunks)} chunks, {len(sources)} sources")

        return result
    
    @weave.op()
    async def _expand_context_graph(
        self,
        chunks: List[Dict[str, Any]],
        max_additional: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Expand context by retrieving related chunks from the graph.
        
        Args:
            chunks: Initial chunks from vector search
            max_additional: Maximum additional chunks to add per chunk
            
        Returns:
            Expanded list of chunks
        """
        expanded_chunks = list(chunks)  # Start with original chunks
        chunk_ids_seen = {chunk["chunk_id"] for chunk in chunks}
        
        # For each chunk, get related chunks
        for chunk in chunks[:3]:  # Only expand top 3 chunks to avoid explosion
            related = self.storage.get_related_chunks(
                chunk_id=chunk["chunk_id"],
                limit=max_additional
            )
            
            # Add related chunks that we haven't seen yet
            for related_chunk in related:
                if related_chunk["chunk_id"] not in chunk_ids_seen:
                    # Add a lower score for related chunks
                    related_chunk["score"] = chunk.get("score", 0.5) * 0.8
                    expanded_chunks.append(related_chunk)
                    chunk_ids_seen.add(related_chunk["chunk_id"])
        
        return expanded_chunks
    
    @weave.op()
    def _rank_context(
        self,
        chunks: List[Dict[str, Any]],
        query: str
    ) -> List[Dict[str, Any]]:
        """
        Rank and filter chunks by relevance.
        
        Args:
            chunks: List of chunks to rank
            query: The user query
            
        Returns:
            Ranked and filtered list of chunks
        """
        # Sort by score (descending)
        ranked = sorted(chunks, key=lambda x: x.get("score", 0), reverse=True)
        
        # Filter out low-quality chunks
        filtered = [
            chunk for chunk in ranked
            if chunk.get("score", 0) >= MIN_RELEVANCE_SCORE
        ]
        
        # Limit total context length
        total_length = 0
        final_chunks = []
        
        for chunk in filtered:
            chunk_length = len(chunk.get("text", ""))
            if total_length + chunk_length <= MAX_CONTEXT_LENGTH:
                final_chunks.append(chunk)
                total_length += chunk_length
            else:
                break
        
        return final_chunks
    
    @weave.op()
    def _build_context_text(self, chunks: List[Dict[str, Any]]) -> str:
        """
        Build formatted context text from chunks.
        
        Args:
            chunks: List of chunks
            
        Returns:
            Formatted context text
        """
        if not chunks:
            return ""
        
        context_parts = []
        
        for i, chunk in enumerate(chunks, 1):
            url = chunk.get("url", "Unknown")
            title = chunk.get("title") or chunk.get("domain", "Unknown")
            text = chunk.get("text", "")
            score = chunk.get("score", 0)
            
            context_parts.append(
                f"[Source {i}] {title} ({url})\n"
                f"Relevance: {score:.2f}\n"
                f"{text}\n"
            )
        
        return "\n---\n\n".join(context_parts)
    
    @weave.op()
    def _extract_sources(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Extract unique sources from chunks.
        
        Args:
            chunks: List of chunks
            
        Returns:
            List of unique sources with url and title
        """
        sources_dict = {}
        
        for chunk in chunks:
            url = chunk.get("url")
            if url and url not in sources_dict:
                sources_dict[url] = {
                    "url": url,
                    "title": chunk.get("title") or chunk.get("domain", "Unknown"),
                    "domain": chunk.get("domain", "Unknown")
                }
        
        return list(sources_dict.values())

    @weave.op()
    async def retrieve_page_context(
        self,
        query: str,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        NESTED CALL: Retrieve context using full page content, similar to parent ChatService pattern.
        This is a nested operation within a conversation turn.

        Args:
            query: The user query
            top_k: Number of top pages to retrieve

        Returns:
            Dictionary with 'pages', 'sources', 'context_text' keys
        """
        # Add page retrieval operation metadata
        add_session_metadata(
            operation_type="page_retrieval",
            query_length=len(query),
            top_k=top_k
        )
        print(f"🔍 Retrieval Service: Starting page-based context retrieval")
        print(f"   Query: '{query}'")
        print(f"   Top K: {top_k}")

        # Get settings from admin backend
        settings_service = get_settings_service()
        settings = await settings_service.get_chat_settings()

        score_threshold = settings.get("search_score_threshold", 0.9)
        max_pages = settings.get("max_pages", 5)

        print(f"   Score threshold: {score_threshold}")
        print(f"   Max pages: {max_pages}")

        # Generate query embedding
        print(f"🧮 Retrieval Service: Generating query embedding...")
        query_embedding = await self.llm_service.generate_embedding(query)
        print(f"   Embedding length: {len(query_embedding)}")

        # Get relevant pages with score filtering
        print(f"🔎 Retrieval Service: Searching for relevant pages...")
        pages = self.storage.get_relevant_pages(
            embedding=query_embedding,
            limit=max_pages,
            score_threshold=score_threshold
        )
        print(f"   Pages found: {len(pages)}")
        if pages:
            print(f"   Top page scores: {[p.get('score', 'N/A') for p in pages[:3]]}")
            print(f"   Top page titles: {[p.get('title', 'N/A')[:50] for p in pages[:3]]}")

        # Load markdown content for each page
        print(f"📄 Retrieval Service: Loading markdown content for pages...")
        page_contents = []
        sources = []

        for page in pages:
            # Load markdown content
            markdown_content = await self.storage.load_markdown_from_file(page["id"])

            if markdown_content:
                page_contents.append({
                    "id": page["id"],
                    "url": page["url"],
                    "title": page["title"],
                    "score": page["score"],
                    "content": markdown_content
                })

                sources.append({
                    "url": page["url"],
                    "title": page["title"],
                    "domain": page["domain"]
                })
                print(f"   ✅ Loaded: {page['title'][:50]} ({len(markdown_content)} chars)")
            else:
                print(f"   ❌ Failed to load: {page['title'][:50]}")

        # Build context text from full page contents
        context_text = self._build_page_context_text(page_contents)

        return {
            "pages": page_contents,
            "sources": sources,
            "context_text": context_text,
            "num_pages": len(page_contents),
            "num_sources": len(sources)
        }

    @weave.op()
    def _build_page_context_text(self, pages: List[Dict[str, Any]]) -> str:
        """
        Build formatted context text from full page contents.

        Args:
            pages: List of pages with markdown content

        Returns:
            Formatted context text
        """
        if not pages:
            return ""

        context_parts = []

        for page in pages:
            url = page.get("url", "Unknown")
            title = page.get("title", "Unknown")
            content = page.get("content", "")
            score = page.get("score", 0)
            page_id = page.get("id", "Unknown")

            context_parts.append(
                f"--- Full Page Content (Page ID: {page_id}, URL: {url}, "
                f"Relevance Score: {score:.4f}) ---\n"
                f"Title: {title}\n\n"
                f"{content}\n"
            )

        return "\n---\n\n".join(context_parts)

