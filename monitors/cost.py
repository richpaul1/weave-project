"""
Cost Monitor

Tracks token usage and estimated costs for LLM operations.
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


# Cost estimates (per 1M tokens)
# These are approximate costs for different providers
COST_PER_MILLION_TOKENS = {
    "ollama": 0.0,  # Local models are free
    "openai-gpt-4": 30.0,  # $30 per 1M tokens (input)
    "openai-gpt-3.5-turbo": 0.5,  # $0.50 per 1M tokens (input)
}


class CostMonitor:
    """Monitor for tracking cost metrics"""
    
    def __init__(self):
        self.metrics: List[Dict[str, Any]] = []
        self.total_tokens = 0
        self.total_cost = 0.0
    
    @weave.op()
    async def measure_query_cost(
        self,
        rag_service: RAGService,
        query: str
    ) -> Dict[str, Any]:
        """
        Measure cost of processing a single query.
        
        Args:
            rag_service: The RAG service
            query: The query to process
            
        Returns:
            Dictionary with cost metrics
        """
        result = await rag_service.process_query(query=query, top_k=5)
        
        tokens = result["metadata"]["tokens"]
        provider = result["metadata"]["provider"]
        model = result["metadata"]["model"]
        
        # Estimate cost based on provider
        cost_key = f"{provider}-{model}" if provider == "openai" else provider
        cost_per_million = COST_PER_MILLION_TOKENS.get(cost_key, COST_PER_MILLION_TOKENS.get(provider, 0.0))
        estimated_cost = (tokens / 1_000_000) * cost_per_million
        
        self.total_tokens += tokens
        self.total_cost += estimated_cost
        
        return {
            "operation": "query_cost",
            "query": query,
            "tokens": tokens,
            "provider": provider,
            "model": model,
            "estimated_cost_usd": estimated_cost,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def measure_batch_cost(
        self,
        rag_service: RAGService,
        queries: List[str]
    ) -> Dict[str, Any]:
        """
        Measure cost of processing a batch of queries.
        
        Args:
            rag_service: The RAG service
            queries: List of queries to process
            
        Returns:
            Dictionary with batch cost metrics
        """
        total_tokens = 0
        total_cost = 0.0
        query_costs = []
        
        for query in queries:
            cost_metric = await self.measure_query_cost(rag_service, query)
            query_costs.append(cost_metric)
            total_tokens += cost_metric["tokens"]
            total_cost += cost_metric["estimated_cost_usd"]
        
        return {
            "operation": "batch_cost",
            "total_queries": len(queries),
            "total_tokens": total_tokens,
            "total_cost_usd": total_cost,
            "avg_tokens_per_query": total_tokens / len(queries) if queries else 0,
            "avg_cost_per_query_usd": total_cost / len(queries) if queries else 0,
            "query_costs": query_costs,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    async def estimate_monthly_cost(
        self,
        rag_service: RAGService,
        sample_queries: List[str],
        estimated_queries_per_day: int
    ) -> Dict[str, Any]:
        """
        Estimate monthly cost based on sample queries.
        
        Args:
            rag_service: The RAG service
            sample_queries: Sample queries to estimate from
            estimated_queries_per_day: Estimated number of queries per day
            
        Returns:
            Dictionary with monthly cost estimate
        """
        # Measure cost for sample queries
        batch_result = await self.measure_batch_cost(rag_service, sample_queries)
        
        avg_cost_per_query = batch_result["avg_cost_per_query_usd"]
        avg_tokens_per_query = batch_result["avg_tokens_per_query"]
        
        # Estimate monthly costs
        daily_cost = avg_cost_per_query * estimated_queries_per_day
        monthly_cost = daily_cost * 30
        
        daily_tokens = avg_tokens_per_query * estimated_queries_per_day
        monthly_tokens = daily_tokens * 30
        
        return {
            "operation": "monthly_cost_estimate",
            "sample_size": len(sample_queries),
            "avg_cost_per_query_usd": avg_cost_per_query,
            "avg_tokens_per_query": avg_tokens_per_query,
            "estimated_queries_per_day": estimated_queries_per_day,
            "estimated_daily_cost_usd": daily_cost,
            "estimated_monthly_cost_usd": monthly_cost,
            "estimated_daily_tokens": daily_tokens,
            "estimated_monthly_tokens": monthly_tokens,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    def measure_token_efficiency(
        self,
        tokens: int,
        response_length: int,
        num_chunks: int
    ) -> Dict[str, Any]:
        """
        Measure token efficiency metrics.
        
        Args:
            tokens: Number of tokens used
            response_length: Length of response in characters
            num_chunks: Number of context chunks used
            
        Returns:
            Dictionary with efficiency metrics
        """
        chars_per_token = response_length / tokens if tokens > 0 else 0
        tokens_per_chunk = tokens / num_chunks if num_chunks > 0 else 0
        
        return {
            "operation": "token_efficiency",
            "tokens": tokens,
            "response_length": response_length,
            "num_chunks": num_chunks,
            "chars_per_token": chars_per_token,
            "tokens_per_chunk": tokens_per_chunk,
            "timestamp": datetime.now().isoformat()
        }
    
    @weave.op()
    def log_metric(self, metric: Dict[str, Any]):
        """Log a metric to the monitor"""
        self.metrics.append(metric)
        print(f"💰 {metric['operation']}: {metric}")
    
    @weave.op()
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all cost metrics"""
        return {
            "total_tokens": self.total_tokens,
            "total_cost_usd": self.total_cost,
            "total_metrics_logged": len(self.metrics)
        }


async def run_cost_monitoring():
    """Run cost monitoring"""
    print("💰 Starting Cost Monitoring...")
    
    # Initialize Weave
    weave.init("weave-rag-project")
    
    # Initialize services
    storage = StorageService()
    llm_service = LLMService()
    retrieval_service = RetrievalService(storage=storage, llm_service=llm_service)
    rag_service = RAGService(retrieval_service=retrieval_service, llm_service=llm_service)
    
    # Create monitor
    monitor = CostMonitor()
    
    # Test queries
    test_queries = [
        "What is Weave?",
        "How do I use Weave?",
        "What is RAG?",
        "How does vector search work?",
        "What is hallucination detection?"
    ]
    
    print("\n1️⃣ Measuring Individual Query Costs...")
    for query in test_queries[:3]:
        metric = await monitor.measure_query_cost(rag_service, query)
        monitor.log_metric(metric)
        await asyncio.sleep(0.5)
    
    print("\n2️⃣ Measuring Batch Cost...")
    metric = await monitor.measure_batch_cost(rag_service, test_queries)
    monitor.log_metric(metric)
    
    print("\n3️⃣ Estimating Monthly Cost...")
    # Estimate for 100 queries per day
    metric = await monitor.estimate_monthly_cost(rag_service, test_queries, estimated_queries_per_day=100)
    monitor.log_metric(metric)
    
    print("\n4️⃣ Measuring Token Efficiency...")
    # Get a sample response to measure efficiency
    result = await rag_service.process_query(query="What is Weave?", top_k=5)
    metric = monitor.measure_token_efficiency(
        tokens=result["metadata"]["tokens"],
        response_length=len(result["response"]),
        num_chunks=result["metadata"]["num_chunks"]
    )
    monitor.log_metric(metric)
    
    print("\n💰 Cost Summary:")
    summary = monitor.get_summary()
    print(f"  Total Tokens: {summary['total_tokens']}")
    print(f"  Total Cost: ${summary['total_cost_usd']:.4f}")
    print(f"  Total Metrics: {summary['total_metrics_logged']}")
    
    # Close connections
    storage.close()
    
    print("\n✅ Cost Monitoring Complete!")
    return summary


if __name__ == "__main__":
    asyncio.run(run_cost_monitoring())

