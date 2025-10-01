"""
Hallucination Detection Service

Detects potential hallucinations in LLM responses by comparing against context.
All methods are decorated with @weave.op() for observability.
"""
from typing import Dict, Any, List
import weave
from app.services.llm_service import LLMService


class HallucinationService:
    """
    Service for detecting hallucinations in LLM responses.
    
    Uses LLM-based fact checking to compare response claims against context.
    """
    
    # Prompt for fact extraction
    FACT_EXTRACTION_PROMPT = """Extract all factual claims from the following text.
List each claim on a separate line.

Text:
{text}

Factual claims:"""

    # Prompt for fact verification
    FACT_VERIFICATION_PROMPT = """Given the following context and a claim, determine if the claim is supported by the context.

Context:
{context}

Claim:
{claim}

Is this claim supported by the context? Answer with one of:
- SUPPORTED: The claim is directly supported by the context
- PARTIALLY_SUPPORTED: The claim is partially supported but contains unsupported details
- NOT_SUPPORTED: The claim is not supported by the context

Answer:"""
    
    def __init__(self, llm_service: LLMService):
        """
        Initialize hallucination detection service.
        
        Args:
            llm_service: LLM service for fact checking
        """
        self.llm_service = llm_service
    
    @weave.op()
    async def detect_hallucination(
        self,
        response: str,
        context: str
    ) -> Dict[str, Any]:
        """
        Detect potential hallucinations in a response.
        
        Args:
            response: The LLM response to check
            context: The context that was provided to the LLM
            
        Returns:
            Dictionary with 'score', 'supported_claims', 'unsupported_claims', 'details'
        """
        # Extract facts from response
        facts = await self._extract_facts(response)
        
        if not facts:
            # No facts to verify
            return {
                "score": 0.0,
                "supported_claims": [],
                "unsupported_claims": [],
                "details": "No factual claims found in response"
            }
        
        # Verify each fact against context
        verification_results = []
        for fact in facts:
            result = await self._verify_fact(fact, context)
            verification_results.append({
                "claim": fact,
                "status": result
            })
        
        # Calculate hallucination score
        score = self._calculate_score(verification_results)
        
        # Separate supported and unsupported claims
        supported = [r["claim"] for r in verification_results if r["status"] == "SUPPORTED"]
        partially_supported = [
            r["claim"] for r in verification_results 
            if r["status"] == "PARTIALLY_SUPPORTED"
        ]
        unsupported = [
            r["claim"] for r in verification_results 
            if r["status"] == "NOT_SUPPORTED"
        ]
        
        return {
            "score": score,
            "supported_claims": supported,
            "partially_supported_claims": partially_supported,
            "unsupported_claims": unsupported,
            "total_claims": len(facts),
            "details": verification_results
        }
    
    @weave.op()
    async def _extract_facts(self, text: str) -> List[str]:
        """
        Extract factual claims from text.
        
        Args:
            text: Text to extract facts from
            
        Returns:
            List of factual claims
        """
        prompt = self.FACT_EXTRACTION_PROMPT.format(text=text)
        
        try:
            result = await self.llm_service.generate_completion(
                prompt=prompt,
                max_tokens=500,
                temperature=0.0  # Use low temperature for consistency
            )
            
            # Parse facts from response
            facts_text = result["text"].strip()
            facts = [
                line.strip().lstrip("-•*").strip()
                for line in facts_text.split("\n")
                if line.strip() and not line.strip().startswith("#")
            ]
            
            return facts
        except Exception as e:
            print(f"Error extracting facts: {e}")
            return []
    
    @weave.op()
    async def _verify_fact(self, claim: str, context: str) -> str:
        """
        Verify a single fact against context.
        
        Args:
            claim: The claim to verify
            context: The context to verify against
            
        Returns:
            Verification status: "SUPPORTED", "PARTIALLY_SUPPORTED", or "NOT_SUPPORTED"
        """
        prompt = self.FACT_VERIFICATION_PROMPT.format(
            context=context,
            claim=claim
        )
        
        try:
            result = await self.llm_service.generate_completion(
                prompt=prompt,
                max_tokens=50,
                temperature=0.0  # Use low temperature for consistency
            )
            
            # Parse verification result
            response = result["text"].strip().upper()
            
            if "SUPPORTED" in response and "NOT" not in response and "PARTIALLY" not in response:
                return "SUPPORTED"
            elif "PARTIALLY" in response:
                return "PARTIALLY_SUPPORTED"
            else:
                return "NOT_SUPPORTED"
                
        except Exception as e:
            print(f"Error verifying fact: {e}")
            return "NOT_SUPPORTED"  # Conservative default
    
    def _calculate_score(self, verification_results: List[Dict[str, str]]) -> float:
        """
        Calculate hallucination score from verification results.
        
        Score is between 0.0 (no hallucinations) and 1.0 (all hallucinations).
        
        Args:
            verification_results: List of verification results
            
        Returns:
            Hallucination score (0.0 to 1.0)
        """
        if not verification_results:
            return 0.0
        
        total = len(verification_results)
        unsupported = sum(
            1 for r in verification_results 
            if r["status"] == "NOT_SUPPORTED"
        )
        partially_supported = sum(
            1 for r in verification_results 
            if r["status"] == "PARTIALLY_SUPPORTED"
        )
        
        # Weight: unsupported = 1.0, partially = 0.5, supported = 0.0
        score = (unsupported + (partially_supported * 0.5)) / total
        
        return round(score, 3)

