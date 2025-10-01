"""
Quality Monitor

Tracks hallucination rate and response quality metrics.
"""
import weave
import asyncio
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
from app.services.hallucination_service import HallucinationService


class QualityMonitor:
    """Monitor for tracking quality metrics"""
    
    def __init__(self):
        self.metrics: List[Dict[str, Any]] = []
    
    @weave.op()
    async def measure_hallucination_rate(
        self,
        rag_service: RAGService,
        hallucination_service: HallucinationService,
        queries: List[str]
    ) -> Dict[str, Any]:
        """
        Measure hallucination rate across multiple queries.
        
        Args:
            rag_service: The RAG service
            hallucination_service: The hallucination detection service
            queries: List of queries to test
            
        Returns:
            Dictionary with hallucination metrics
        """
        total_queries = len(queries)
        hallucination_scores = []
        high_hallucination_count = 0
        
        for query in queries:
            # Generate response
            result = await rag_service.process_query(query=query, top_k=5)
            
            # Detect hallucinations
            context = "\n".join([chunk["text"] for chunk in result.get("chunks", [])])
            hallucination_result = await hallucination_service.detect_hallucination(
                response=result["response"],
                context=context
            )
            
            score = hallucination_result["score"]
            hallucination_scores.append(score)
            
            if score > 0.5:  # High hallucination threshold
                high_hallucination_count += 1
        
        avg_score = sum(hallucination_scores) / len(hallucination_scores) if hallucination_scores else 0.0
        hallucination_rate = high_hallucination_count / total_queries if total_queries > 0 else 0.0
        
        return {
            "operation": "hallucination_rate",
            "total_queries": total_queries,
            "avg_hallucination_score": avg_score,
            "hallucination_rate": hallucination_rate,
            "high_hallucination_count": high_hallucination_count,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_response_quality(
        self,
        rag_service: RAGService,
        queries: List[str]
    ) -> Dict[str, Any]:
        """
        Measure response quality metrics.
        
        Args:
            rag_service: The RAG service
            queries: List of queries to test
            
        Returns:
            Dictionary with quality metrics
        """
        total_queries = len(queries)
        response_lengths = []
        context_usage = []
        source_counts = []
        
        for query in queries:
            result = await rag_service.process_query(query=query, top_k=5)
            
            response_lengths.append(len(result["response"]))
            context_usage.append(result["metadata"]["num_chunks"])
            source_counts.append(result["metadata"]["num_sources"])
        
        return {
            "operation": "response_quality",
            "total_queries": total_queries,
            "avg_response_length": sum(response_lengths) / len(response_lengths) if response_lengths else 0,
            "min_response_length": min(response_lengths) if response_lengths else 0,
            "max_response_length": max(response_lengths) if response_lengths else 0,
            "avg_chunks_used": sum(context_usage) / len(context_usage) if context_usage else 0,
            "avg_sources_used": sum(source_counts) / len(source_counts) if source_counts else 0,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_retrieval_quality(
        self,
        retrieval_service: RetrievalService,
        queries: List[str]
    ) -> Dict[str, Any]:
        """
        Measure retrieval quality metrics.
        
        Args:
            retrieval_service: The retrieval service
            queries: List of queries to test
            
        Returns:
            Dictionary with retrieval quality metrics
        """
        total_queries = len(queries)
        chunk_counts = []
        source_counts = []
        empty_results = 0
        
        for query in queries:
            result = await retrieval_service.retrieve_context(query=query, top_k=5)
            
            num_chunks = result["num_chunks"]
            num_sources = result["num_sources"]
            
            chunk_counts.append(num_chunks)
            source_counts.append(num_sources)
            
            if num_chunks == 0:
                empty_results += 1
        
        return {
            "operation": "retrieval_quality",
            "total_queries": total_queries,
            "avg_chunks_retrieved": sum(chunk_counts) / len(chunk_counts) if chunk_counts else 0,
            "avg_sources_retrieved": sum(source_counts) / len(source_counts) if source_counts else 0,
            "empty_result_rate": empty_results / total_queries if total_queries > 0 else 0,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_context_relevance(
        self,
        retrieval_service: RetrievalService,
        queries_with_keywords: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Measure context relevance by checking for expected keywords.
        
        Args:
            retrieval_service: The retrieval service
            queries_with_keywords: List of dicts with 'query' and 'keywords' keys
            
        Returns:
            Dictionary with relevance metrics
        """
        total_queries = len(queries_with_keywords)
        relevance_scores = []
        
        for item in queries_with_keywords:
            query = item["query"]
            expected_keywords = item["keywords"]
            
            result = await retrieval_service.retrieve_context(query=query, top_k=5)
            context = result["context_text"].lower()
            
            # Count how many keywords appear in context
            keywords_found = sum(1 for keyword in expected_keywords if keyword.lower() in context)
            relevance = keywords_found / len(expected_keywords) if expected_keywords else 0.0
            relevance_scores.append(relevance)
        
        return {
            "operation": "context_relevance",
            "total_queries": total_queries,
            "avg_relevance_score": sum(relevance_scores) / len(relevance_scores) if relevance_scores else 0,
            "min_relevance_score": min(relevance_scores) if relevance_scores else 0,
            "max_relevance_score": max(relevance_scores) if relevance_scores else 0,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    def log_metric(self, metric: Dict[str, Any]):
        """Log a metric to the monitor"""
        self.metrics.append(metric)
        print(f"📊 {metric['operation']}: {metric}")
    
    @weave.op()
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all quality metrics"""
        if not self.metrics:
            return {"message": "No metrics collected"}
        
        summary = {}
        for metric in self.metrics:
            op = metric["operation"]
            summary[op] = {k: v for k, v in metric.items() if k != "operation"}
        
        return summary


async def run_quality_monitoring():
    """Run quality monitoring"""
    print("📊 Starting Quality Monitoring...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    storage = StorageService()
    llm_service = LLMService()
    retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
    rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)
    hallucination_service = HallucinationService(llm_service=llm_service)
    
    # Create monitor
    monitor = QualityMonitor()
    
    # Test queries
    test_queries = [
        "What is Weave?",
        "How do I use Weave?",
        "What is RAG?"
    ]
    
    # Queries with expected keywords for relevance testing
    queries_with_keywords = [
        {
            "query": "What is Weave?",
            "keywords": ["weave", "toolkit", "llm"]
        },
        {
            "query": "What is RAG?",
            "keywords": ["rag", "retrieval", "generation"]
        }
    ]
    
    print("\n1️⃣ Measuring Hallucination Rate...")
    metric = await monitor.measure_hallucination_rate(rag_service, hallucination_service, test_queries)
    monitor.log_metric(metric)
    
    print("\n2️⃣ Measuring Response Quality...")
    metric = await monitor.measure_response_quality(rag_service, test_queries)
    monitor.log_metric(metric)
    
    print("\n3️⃣ Measuring Retrieval Quality...")
    metric = await monitor.measure_retrieval_quality(retrieval_service, test_queries)
    monitor.log_metric(metric)
    
    print("\n4️⃣ Measuring Context Relevance...")
    metric = await monitor.measure_context_relevance(retrieval_service, queries_with_keywords)
    monitor.log_metric(metric)
    
    print("\n📈 Quality Summary:")
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
    
    print("\n✅ Quality Monitoring Complete!")
    return summary


if __name__ == "__main__":
    asyncio.run(run_quality_monitoring())

