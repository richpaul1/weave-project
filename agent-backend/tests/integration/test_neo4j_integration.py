"""
Integration tests for Neo4j storage service

These tests use a real Neo4j database connection.
Make sure Neo4j is running and the database has content from admin-backend.
"""
import pytest
from app.services.storage import StorageService
from app.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DB_NAME


@pytest.fixture
def storage_service():
    """Create a real storage service connected to Neo4j"""
    service = StorageService()
    service.connect()
    yield service
    service.close()


class TestNeo4jIntegration:
    """Integration tests for Neo4j storage"""

    def test_connect_to_neo4j(self, storage_service):
        """Test connecting to real Neo4j database"""
        # If we got here, connection was successful
        assert storage_service.driver is not None

    def test_get_all_pages(self, storage_service):
        """Test retrieving all pages from Neo4j"""
        pages = storage_service.get_all_pages()

        # Should return a list (may be empty if no data)
        assert isinstance(pages, list)

        # If there are pages, check structure
        if len(pages) > 0:
            page = pages[0]
            assert "id" in page
            assert "url" in page
            assert "title" in page

    def test_get_page_by_id(self, storage_service):
        """Test retrieving a specific page by ID"""
        # First get all pages to find a valid ID
        pages = storage_service.get_all_pages()

        if len(pages) > 0:
            page_id = pages[0]["id"]
            page = storage_service.get_page_by_id(page_id)

            assert page is not None
            assert page["id"] == page_id
            assert "url" in page
            assert "title" in page

    def test_get_page_chunks(self, storage_service):
        """Test retrieving chunks for a page"""
        # First get all pages to find a valid ID
        pages = storage_service.get_all_pages()

        if len(pages) > 0:
            page_id = pages[0]["id"]
            chunks = storage_service.get_page_chunks(page_id)

            # Should return a list (may be empty)
            assert isinstance(chunks, list)

            # If there are chunks, check structure
            if len(chunks) > 0:
                chunk = chunks[0]
                assert "id" in chunk
                assert "text" in chunk
                assert "page_id" in chunk

    def test_search_by_vector(self, storage_service):
        """Test vector similarity search"""
        # Create a dummy embedding (768 dimensions)
        embedding = [0.1] * 768

        results = storage_service.search_by_vector(
            embedding=embedding,
            limit=5,
            min_score=0.0
        )

        # Should return a list (may be empty)
        assert isinstance(results, list)

        # Results should be limited to 5
        assert len(results) <= 5

        # If there are results, check structure
        if len(results) > 0:
            result = results[0]
            assert "chunk" in result
            assert "score" in result
            assert "page" in result

    def test_get_chunk_by_id(self, storage_service):
        """Test retrieving a specific chunk by ID"""
        # First search for chunks
        embedding = [0.1] * 768
        results = storage_service.search_by_vector(
            embedding=embedding,
            limit=1,
            min_score=0.0
        )

        if len(results) > 0:
            chunk_id = results[0]["chunk"]["id"]
            chunk = storage_service.get_chunk_by_id(chunk_id)

            assert chunk is not None
            assert chunk["id"] == chunk_id
            assert "text" in chunk

    def test_get_related_chunks(self, storage_service):
        """Test retrieving related chunks"""
        # First search for a chunk
        embedding = [0.1] * 768
        results = storage_service.search_by_vector(
            embedding=embedding,
            limit=1,
            min_score=0.0
        )

        if len(results) > 0:
            chunk_id = results[0]["chunk"]["id"]
            related = storage_service.get_related_chunks(
                chunk_id=chunk_id,
                limit=3
            )

            # Should return a list
            assert isinstance(related, list)

            # Should be limited to 3
            assert len(related) <= 3

            # If there are related chunks, check structure
            if len(related) > 0:
                chunk = related[0]
                assert "id" in chunk
                assert "text" in chunk

