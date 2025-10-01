"""
Performance Monitor

Tracks latency and throughput metrics for the RAG pipeline.
"""
import weave
import asyncio
import time
from typing import Dict, Any, List
from datetime import datetime
import sys
import os

# Add parent directory to path to import agent-backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agent-backend'))

from app.services.storage import StorageService
from app.services.llm_service import LLMService
from app.services.retrieval_service import RetrievalService
from app.services.rag_service import RAGService


class PerformanceMonitor:
    """Monitor for tracking performance metrics"""
    
    def __init__(self):
        self.metrics: List[Dict[str, Any]] = []
    
    @weave.op()
    async def measure_retrieval_latency(
        self,
        retrieval_service: RetrievalService,
        query: str
    ) -> Dict[str, Any]:
        """
        Measure retrieval latency.
        
        Args:
            retrieval_service: The retrieval service
            query: The query to process
            
        Returns:
            Dictionary with latency metrics
        """
        start_time = time.time()
        
        result = await retrieval_service.retrieve_context(
            query=query,
            top_k=5
        )
        
        end_time = time.time()
        latency = end_time - start_time
        
        return {
            "operation": "retrieval",
            "latency_ms": latency * 1000,
            "num_chunks": result["num_chunks"],
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_llm_latency(
        self,
        llm_service: LLMService,
        prompt: str
    ) -> Dict[str, Any]:
        """
        Measure LLM generation latency.
        
        Args:
            llm_service: The LLM service
            prompt: The prompt to process
            
        Returns:
            Dictionary with latency metrics
        """
        start_time = time.time()
        
        result = await llm_service.generate_completion(
            prompt=prompt,
            max_tokens=500
        )
        
        end_time = time.time()
        latency = end_time - start_time
        
        return {
            "operation": "llm_generation",
            "latency_ms": latency * 1000,
            "tokens": result["tokens"],
            "tokens_per_second": result["tokens"] / latency if latency > 0 else 0,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_e2e_latency(
        self,
        rag_service: RAGService,
        query: str
    ) -> Dict[str, Any]:
        """
        Measure end-to-end RAG pipeline latency.
        
        Args:
            rag_service: The RAG service
            query: The query to process
            
        Returns:
            Dictionary with latency metrics
        """
        start_time = time.time()
        
        result = await rag_service.process_query(
            query=query,
            top_k=5
        )
        
        end_time = time.time()
        latency = end_time - start_time
        
        return {
            "operation": "e2e_rag",
            "latency_ms": latency * 1000,
            "num_chunks": result["metadata"]["num_chunks"],
            "tokens": result["metadata"]["tokens"],
            "response_length": len(result["response"]),
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_throughput(
        self,
        rag_service: RAGService,
        queries: List[str],
        duration_seconds: int = 60
    ) -> Dict[str, Any]:
        """
        Measure throughput (queries per second).
        
        Args:
            rag_service: The RAG service
            queries: List of queries to cycle through
            duration_seconds: How long to run the test
            
        Returns:
            Dictionary with throughput metrics
        """
        start_time = time.time()
        query_count = 0
        total_latency = 0.0
        
        while (time.time() - start_time) < duration_seconds:
            query = queries[query_count % len(queries)]
            
            query_start = time.time()
            await rag_service.process_query(query=query, top_k=5)
            query_end = time.time()
            
            total_latency += (query_end - query_start)
            query_count += 1
        
        end_time = time.time()
        total_duration = end_time - start_time
        
        return {
            "operation": "throughput_test",
            "duration_seconds": total_duration,
            "total_queries": query_count,
            "queries_per_second": query_count / total_duration,
            "avg_latency_ms": (total_latency / query_count) * 1000 if query_count > 0 else 0,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    def log_metric(self, metric: Dict[str, Any]):
        """Log a metric to the monitor"""
        self.metrics.append(metric)
        print(f"📊 {metric['operation']}: {metric}")
    
    @weave.op()
    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics of all metrics"""
        if not self.metrics:
            return {"message": "No metrics collected"}
        
        # Group by operation
        by_operation = {}
        for metric in self.metrics:
            op = metric["operation"]
            if op not in by_operation:
                by_operation[op] = []
            by_operation[op].append(metric)
        
        # Calculate summary for each operation
        summary = {}
        for op, metrics in by_operation.items():
            latencies = [m.get("latency_ms", 0) for m in metrics if "latency_ms" in m]
            
            if latencies:
                summary[op] = {
                    "count": len(metrics),
                    "avg_latency_ms": sum(latencies) / len(latencies),
                    "min_latency_ms": min(latencies),
                    "max_latency_ms": max(latencies),
                    "p50_latency_ms": sorted(latencies)[len(latencies) // 2],
                    "p95_latency_ms": sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) > 1 else latencies[0],
                    "p99_latency_ms": sorted(latencies)[int(len(latencies) * 0.99)] if len(latencies) > 1 else latencies[0]
                }
        
        return summary


async def run_performance_monitoring():
    """Run performance monitoring"""
    print("📊 Starting Performance Monitoring...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    storage = StorageService()
    llm_service = LLMService()
    retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
    rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)
    
    # Create monitor
    monitor = PerformanceMonitor()
    
    # Test queries
    test_queries = [
        "What is Weave?",
        "How do I use Weave?",
        "What is RAG?",
        "How does vector search work?",
        "What is hallucination detection?"
    ]
    
    print("\n1️⃣ Measuring Retrieval Latency...")
    for query in test_queries[:3]:
        metric = await monitor.measure_retrieval_latency(retrieval_service, query)
        monitor.log_metric(metric)
        await asyncio.sleep(0.5)  # Small delay between requests
    
    print("\n2️⃣ Measuring LLM Latency...")
    for query in test_queries[:3]:
        metric = await monitor.measure_llm_latency(llm_service, query)
        monitor.log_metric(metric)
        await asyncio.sleep(0.5)
    
    print("\n3️⃣ Measuring End-to-End Latency...")
    for query in test_queries[:3]:
        metric = await monitor.measure_e2e_latency(rag_service, query)
        monitor.log_metric(metric)
        await asyncio.sleep(0.5)
    
    print("\n4️⃣ Measuring Throughput (10 second test)...")
    metric = await monitor.measure_throughput(rag_service, test_queries, duration_seconds=10)
    monitor.log_metric(metric)
    
    print("\n📈 Performance Summary:")
    summary = monitor.get_summary()
    for operation, stats in summary.items():
        print(f"\n{operation}:")
        for key, value in stats.items():
            if isinstance(value, float):
                print(f"  {key}: {value:.2f}")
            else:
                print(f"  {key}: {value}")
    
    # Close connections
    storage.close()
    
    print("\n✅ Performance Monitoring Complete!")
    return summary


if __name__ == "__main__":
    asyncio.run(run_performance_monitoring())

