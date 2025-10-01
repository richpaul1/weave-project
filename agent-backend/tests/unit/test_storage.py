"""
Unit tests for StorageService

Mocks Neo4j driver to test storage operations.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from app.services.storage import StorageService


class TestStorageService:
    """Test cases for StorageService"""
    
    def test_init(self):
        """Test StorageService initialization"""
        storage = StorageService()
        assert storage.driver is None
        assert storage.database == "weave"
    
    @patch('app.services.storage.GraphDatabase')
    def test_connect(self, mock_graph_db):
        """Test connecting to Neo4j"""
        mock_driver = Mock()
        mock_graph_db.driver.return_value = mock_driver
        
        storage = StorageService()
        storage.connect()
        
        assert storage.driver == mock_driver
        mock_graph_db.driver.assert_called_once()
    
    @patch('app.services.storage.GraphDatabase')
    def test_close(self, mock_graph_db):
        """Test closing Neo4j connection"""
        mock_driver = Mock()
        mock_graph_db.driver.return_value = mock_driver
        
        storage = StorageService()
        storage.connect()
        storage.close()
        
        assert storage.driver is None
        mock_driver.close.assert_called_once()
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_all_pages(self, mock_graph_db, sample_page):
        """Test retrieving all pages"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock record
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: {
            "id": sample_page["id"],
            "url": sample_page["url"],
            "domain": sample_page["domain"],
            "slug": sample_page["slug"],
            "title": sample_page["title"],
            "createdAt": sample_page["createdAt"]
        }[key]
        mock_record.get = lambda key, default=None: sample_page.get(key, default)
        
        mock_result.__iter__ = lambda self: iter([mock_record])
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        pages = storage.get_all_pages()
        
        assert len(pages) == 1
        assert pages[0]["id"] == sample_page["id"]
        assert pages[0]["url"] == sample_page["url"]
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_page_by_id(self, mock_graph_db, sample_page):
        """Test retrieving a page by ID"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock record
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: sample_page[key]
        mock_record.get = lambda key, default=None: sample_page.get(key, default)
        
        mock_result.single.return_value = mock_record
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        page = storage.get_page_by_id("page-123")
        
        assert page is not None
        assert page["id"] == sample_page["id"]
        assert page["url"] == sample_page["url"]
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_page_by_id_not_found(self, mock_graph_db):
        """Test retrieving a non-existent page"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        mock_result.single.return_value = None
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        page = storage.get_page_by_id("non-existent")
        
        assert page is None
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_page_chunks(self, mock_graph_db, sample_chunk):
        """Test retrieving chunks for a page"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock record
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: {
            "id": sample_chunk["chunk_id"],
            "text": sample_chunk["text"],
            "index": sample_chunk["chunk_index"],
            "embedding": [0.1] * 768
        }[key]
        mock_record.get = lambda key, default=None: [0.1] * 768 if key == "embedding" else default
        
        mock_result.__iter__ = lambda self: iter([mock_record])
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        chunks = storage.get_page_chunks("page-123")
        
        assert len(chunks) == 1
        assert chunks[0]["id"] == sample_chunk["chunk_id"]
        assert chunks[0]["text"] == sample_chunk["text"]
    
    @patch('app.services.storage.GraphDatabase')
    def test_search_by_vector(self, mock_graph_db, sample_chunk, sample_embedding):
        """Test vector similarity search"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock record
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: {
            "chunk_id": sample_chunk["chunk_id"],
            "text": sample_chunk["text"],
            "chunk_index": sample_chunk["chunk_index"],
            "page_id": sample_chunk["page_id"],
            "url": sample_chunk["url"],
            "title": sample_chunk["title"],
            "domain": sample_chunk["domain"],
            "score": sample_chunk["score"]
        }[key]
        mock_record.get = lambda key, default=None: sample_chunk.get(key, default)
        
        mock_result.__iter__ = lambda self: iter([mock_record])
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        results = storage.search_by_vector(sample_embedding, limit=5)
        
        assert len(results) == 1
        assert results[0]["chunk_id"] == sample_chunk["chunk_id"]
        assert results[0]["score"] == sample_chunk["score"]
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_chunk_by_id(self, mock_graph_db, sample_chunk):
        """Test retrieving a chunk by ID"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock record
        mock_record = Mock()
        mock_record.__getitem__ = lambda self, key: {
            "chunk_id": sample_chunk["chunk_id"],
            "text": sample_chunk["text"],
            "chunk_index": sample_chunk["chunk_index"],
            "embedding": [0.1] * 768,
            "page_id": sample_chunk["page_id"],
            "url": sample_chunk["url"],
            "title": sample_chunk["title"],
            "domain": sample_chunk["domain"]
        }[key]
        mock_record.get = lambda key, default=None: [0.1] * 768 if key == "embedding" else sample_chunk.get(key, default)
        
        mock_result.single.return_value = mock_record
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        chunk = storage.get_chunk_by_id("chunk-123")
        
        assert chunk is not None
        assert chunk["chunk_id"] == sample_chunk["chunk_id"]
        assert chunk["text"] == sample_chunk["text"]
    
    @patch('app.services.storage.GraphDatabase')
    def test_get_related_chunks(self, mock_graph_db, sample_chunks):
        """Test retrieving related chunks"""
        # Setup mock
        mock_driver = Mock()
        mock_session = Mock()
        mock_result = Mock()
        
        # Mock records
        mock_records = []
        for chunk in sample_chunks[1:]:  # Skip first chunk
            mock_record = Mock()
            mock_record.__getitem__ = lambda self, key, c=chunk: {
                "chunk_id": c["chunk_id"],
                "text": c["text"],
                "chunk_index": c["chunk_index"],
                "page_id": c["page_id"],
                "url": c["url"],
                "title": c["title"],
                "relation_type": "same_page"
            }[key]
            mock_record.get = lambda key, default=None, c=chunk: c.get(key, default)
            mock_records.append(mock_record)
        
        mock_result.__iter__ = lambda self: iter(mock_records)
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value.__enter__ = Mock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = Mock(return_value=None)
        mock_graph_db.driver.return_value = mock_driver
        
        # Test
        storage = StorageService()
        storage.connect()
        related = storage.get_related_chunks("chunk-123", limit=3)
        
        assert len(related) == 2
        assert related[0]["relation_type"] == "same_page"

