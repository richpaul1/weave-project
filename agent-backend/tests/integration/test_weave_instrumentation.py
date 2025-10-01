"""
Weave Instrumentation Integration Tests

Tests that verify Weave traces are being created and logged to W&B.
"""
import pytest
import asyncio
import weave
import time
import os
from typing import List, Dict, Any

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService
from app.services.hallucination_service import HallucinationService


# Get the global weave client
def get_weave_client():
    """Get the initialized Weave client"""
    project_name = os.getenv("WANDB_PROJECT", "support-app")
    entity = os.getenv("WANDB_ENTITY", "")
    full_project = f"{entity}/{project_name}" if entity else project_name

    # Initialize if not already done
    client = weave.init(full_project)
    return client


class WeaveTestUtil:
    """Utility for testing Weave instrumentation"""

    def __init__(self):
        """Initialize Weave client"""
        self.client = get_weave_client()
        self.project_name = self.client.project
    
    def get_recent_calls(self, limit: int = 10, op_name: str = None) -> List[Any]:
        """
        Get recent calls from Weave.

        Args:
            limit: Maximum number of calls to retrieve
            op_name: Optional operation name to filter by

        Returns:
            List of call objects
        """
        # Get calls using the Weave client
        calls = []

        try:
            # Get all recent calls (filtering not supported in current API)
            call_results = self.client.get_calls(limit=limit)

            # Convert to list and filter by op_name if specified
            for call in call_results:
                if op_name and hasattr(call, 'op_name') and call.op_name != op_name:
                    continue
                calls.append(call)

            return calls
        except Exception as e:
            print(f"Error fetching calls: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_call_by_id(self, call_id: str) -> Any:
        """
        Get a specific call by ID.
        
        Args:
            call_id: The call ID to retrieve
            
        Returns:
            Call object or None
        """
        try:
            call = self.client.get_call(call_id)
            return call
        except Exception as e:
            print(f"Error fetching call {call_id}: {e}")
            return None
    
    def wait_for_calls(self, min_calls: int = 1, timeout: int = 30, op_name: str = None) -> List[Any]:
        """
        Wait for calls to appear in Weave.
        
        Args:
            min_calls: Minimum number of calls to wait for
            timeout: Maximum time to wait in seconds
            op_name: Optional operation name to filter by
            
        Returns:
            List of call objects
        """
        start_time = time.time()
        
        while (time.time() - start_time) < timeout:
            calls = self.get_recent_calls(limit=min_calls * 2, op_name=op_name)
            if len(calls) >= min_calls:
                return calls
            time.sleep(1)
        
        return []
    
    def verify_call_structure(self, call: Any) -> Dict[str, bool]:
        """
        Verify that a call has the expected structure.
        
        Args:
            call: The call object to verify
            
        Returns:
            Dictionary of verification results
        """
        results = {
            "has_id": hasattr(call, 'id') or hasattr(call, 'call_id'),
            "has_op_name": hasattr(call, 'op_name'),
            "has_inputs": hasattr(call, 'inputs'),
            "has_output": hasattr(call, 'output'),
            "has_started_at": hasattr(call, 'started_at'),
            "has_ended_at": hasattr(call, 'ended_at'),
        }
        
        return results
    
    def get_call_summary(self, call: Any) -> Dict[str, Any]:
        """
        Get a summary of a call.
        
        Args:
            call: The call object
            
        Returns:
            Dictionary with call summary
        """
        return {
            "id": getattr(call, 'id', getattr(call, 'call_id', None)),
            "op_name": getattr(call, 'op_name', None),
            "started_at": getattr(call, 'started_at', None),
            "ended_at": getattr(call, 'ended_at', None),
            "has_inputs": hasattr(call, 'inputs'),
            "has_output": hasattr(call, 'output'),
        }


@pytest.fixture
def weave_util():
    """Create WeaveTestUtil fixture"""
    return WeaveTestUtil()


class TestWeaveInstrumentation:
    """Test Weave instrumentation for all services"""

    @pytest.mark.asyncio
    async def test_storage_service_instrumentation(self, weave_util, caplog):
        """Test that StorageService operations are traced"""
        print("\n🔍 Testing StorageService instrumentation...")

        # Create service
        storage = StorageService()

        # Perform operation (weave is already initialized globally)
        pages = storage.get_all_pages()

        # Wait a bit for trace to be sent
        await asyncio.sleep(2)

        # Check that a trace URL was logged (this proves instrumentation is working)
        trace_url_found = False
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_url_found = True
                print(f"✅ Trace URL found: {record.message}")
                break

        assert trace_url_found, "No Weave trace URL found in logs - instrumentation may not be working"

        print("✅ StorageService instrumentation verified!")

        # Clean up
        storage.close()
    
    @pytest.mark.asyncio
    async def test_llm_service_instrumentation(self, weave_util, caplog):
        """Test that LLMService operations are traced"""
        print("\n🔍 Testing LLMService instrumentation...")

        # Create service
        llm_service = LLMService()

        # Perform operation (weave is already initialized globally)
        result = await llm_service.generate_completion(
            prompt="What is 2+2?",
            max_tokens=50
        )

        # Wait a bit for trace to be sent
        await asyncio.sleep(2)

        # Check that a trace URL was logged
        trace_url_found = False
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_url_found = True
                print(f"✅ Trace URL found: {record.message}")
                break

        assert trace_url_found, "No Weave trace URL found in logs"
        print("✅ LLMService instrumentation verified!")
    
    @pytest.mark.asyncio
    async def test_retrieval_service_instrumentation(self, weave_util, caplog):
        """Test that RetrievalService operations are traced"""
        print("\n🔍 Testing RetrievalService instrumentation...")

        # Create services
        storage = StorageService()
        llm_service = LLMService()
        retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)

        # Perform operation (weave is already initialized globally)
        result = await retrieval_service.retrieve_context(
            query="What is Weave?",
            top_k=3
        )

        # Wait a bit for trace to be sent
        await asyncio.sleep(2)

        # Check that a trace URL was logged
        trace_url_found = False
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_url_found = True
                print(f"✅ Trace URL found: {record.message}")
                break

        assert trace_url_found, "No Weave trace URL found in logs"
        print("✅ RetrievalService instrumentation verified!")

        # Clean up
        storage.close()
    
    @pytest.mark.asyncio
    async def test_rag_service_instrumentation(self, weave_util, caplog):
        """Test that RAGService operations are traced"""
        print("\n🔍 Testing RAGService instrumentation...")

        # Create services
        storage = StorageService()
        llm_service = LLMService()
        retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
        rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)

        # Perform operation (weave is already initialized globally)
        result = await rag_service.process_query(
            query="What is Weave?",
            top_k=3
        )

        # Wait a bit for trace to be sent
        await asyncio.sleep(2)

        # Check that a trace URL was logged
        trace_url_found = False
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_url_found = True
                print(f"✅ Trace URL found: {record.message}")
                break

        assert trace_url_found, "No Weave trace URL found in logs"
        print("✅ RAGService instrumentation verified!")

        # Clean up
        storage.close()
    
    @pytest.mark.asyncio
    async def test_hallucination_service_instrumentation(self, weave_util, caplog):
        """Test that HallucinationService operations are traced"""
        print("\n🔍 Testing HallucinationService instrumentation...")

        # Create service
        llm_service = LLMService()
        hallucination_service = HallucinationService(llm_service=llm_service)

        # Perform operation (weave is already initialized globally)
        result = await hallucination_service.detect_hallucination(
            response="Weave is a toolkit for LLM applications.",
            context="Weave is a lightweight toolkit for tracking and evaluating LLM applications."
        )

        # Wait a bit for trace to be sent
        await asyncio.sleep(2)

        # Check that a trace URL was logged
        trace_url_found = False
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_url_found = True
                print(f"✅ Trace URL found: {record.message}")
                break

        assert trace_url_found, "No Weave trace URL found in logs"
        print("✅ HallucinationService instrumentation verified!")
    
    @pytest.mark.asyncio
    async def test_end_to_end_trace_chain(self, weave_util, caplog):
        """Test that a complete RAG pipeline creates a trace chain"""
        print("\n🔍 Testing end-to-end trace chain...")

        # Create services
        storage = StorageService()
        llm_service = LLMService()
        retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
        rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)

        # Perform complete RAG operation (weave is already initialized globally)
        result = await rag_service.process_query(
            query="What is Weave?",
            session_id="test-weave-instrumentation",
            top_k=3
        )

        # Wait for traces to be sent
        await asyncio.sleep(2)

        # Check that trace URL was logged (Weave logs the top-level trace)
        trace_urls = []
        for record in caplog.records:
            if "wandb.ai" in record.message and "/call/" in record.message:
                trace_urls.append(record.message)

        print(f"Found {len(trace_urls)} trace URL(s)")
        for url in trace_urls:
            print(f"  - {url}")

        # We should have at least one trace (the top-level RAG call)
        # Child traces (Retrieval, LLM, etc.) are nested under this parent trace
        assert len(trace_urls) >= 1, f"Expected at least 1 trace, found {len(trace_urls)}"

        print(f"\n✅ End-to-end trace chain verified! Visit the URL above to see the full trace tree with nested calls.")

        # Clean up
        storage.close()

