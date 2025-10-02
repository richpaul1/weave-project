"""
Retrieval Service for RAG Pipeline

Handles context retrieval using vector search and graph expansion.
All methods are decorated with @weave.op() for observability.
"""
from typing import List, Dict, Any
import weave
from app.services.storage import StorageService
from app.services.llm_service import LLMService
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
        Retrieve relevant context for a query.
        
        Args:
            query: The user query
            top_k: Number of top chunks to retrieve
            min_score: Minimum relevance score threshold
            expand_context: Whether to expand context with related chunks
            
        Returns:
            Dictionary with 'chunks', 'sources', 'context_text' keys
        """
        # Generate query embedding
        query_embedding = await self.llm_service.generate_embedding(query)
        
        # Search for relevant chunks
        chunks = self.storage.search_by_vector(
            embedding=query_embedding,
            limit=top_k,
            min_score=min_score
        )
        
        # Expand context if requested
        if expand_context and chunks:
            chunks = await self._expand_context_graph(chunks, max_additional=top_k)
        
        # Rank and filter chunks
        ranked_chunks = self._rank_context(chunks, query)
        
        # Build context text
        context_text = self._build_context_text(ranked_chunks)
        
        # Extract unique sources
        sources = self._extract_sources(ranked_chunks)
        
        return {
            "chunks": ranked_chunks,
            "sources": sources,
            "context_text": context_text,
            "num_chunks": len(ranked_chunks),
            "num_sources": len(sources)
        }
    
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
        Retrieve context using full page content, similar to parent ChatService pattern.

        Args:
            query: The user query
            top_k: Number of top pages to retrieve

        Returns:
            Dictionary with 'pages', 'sources', 'context_text' keys
        """
        # Get settings from admin backend
        settings_service = get_settings_service()
        settings = await settings_service.get_chat_settings()

        score_threshold = settings.get("search_score_threshold", 0.9)
        max_pages = settings.get("max_pages", 5)

        # Generate query embedding
        query_embedding = await self.llm_service.generate_embedding(query)

        # Get relevant pages with score filtering
        pages = self.storage.get_relevant_pages(
            embedding=query_embedding,
            limit=max_pages,
            score_threshold=score_threshold
        )

        # Load markdown content for each page
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

