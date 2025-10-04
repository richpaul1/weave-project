"""
Query Classification Service

Classifies user queries to determine the appropriate handler:
- Learning queries -> Course search tool
- General queries -> RAG pipeline
- Mixed queries -> Both systems

All methods are decorated with @weave.op() for observability.
"""
from typing import Dict, Any, List, Optional
import re
import weave
from app.services.llm_service import LLMService
from app.utils.weave_utils import add_session_metadata


class QueryClassifier:
    """
    Service for classifying user queries to route them to appropriate handlers.
    """
    
    # Keywords that indicate learning/course-related queries
    LEARNING_KEYWORDS = [
        "learn", "learning", "course", "courses", "tutorial", "tutorials",
        "training", "education", "educational", "study", "studying",
        "teach", "teaching", "lesson", "lessons", "workshop", "workshops",
        "certification", "certificate", "skill", "skills", "practice",
        "beginner", "intermediate", "advanced", "guide", "guides",
        "how to", "getting started", "introduction", "intro",
        "mlops", "machine learning", "deep learning", "ai", "artificial intelligence",
        "data science", "python", "programming", "coding"
    ]
    
    # Phrases that strongly indicate course search intent
    STRONG_LEARNING_PHRASES = [
        "i want to learn",
        "how do i learn",
        "teach me",
        "show me how to",
        "getting started with",
        "introduction to",
        "course on",
        "courses about",
        "training on",
        "tutorial for",
        "learn about",
        "study",
        "practice"
    ]
    
    def __init__(self, llm_service: Optional[LLMService] = None):
        """
        Initialize query classifier.
        
        Args:
            llm_service: Optional LLM service for advanced classification
        """
        self.llm_service = llm_service
    
    @weave.op()
    def classify_query(self, query: str) -> Dict[str, Any]:
        """
        Classify a user query to determine the appropriate handler.
        
        Args:
            query: The user query to classify
            
        Returns:
            Dictionary with classification results:
            - query_type: "learning", "general", or "mixed"
            - confidence: float between 0 and 1
            - learning_score: float indicating learning intent strength
            - keywords_found: list of learning keywords found
            - reasoning: explanation of the classification
        """
        print(f"🔍 Query Classifier: Classifying query")
        print(f"   Query: '{query}'")
        
        add_session_metadata(
            operation_type="query_classification",
            query_length=len(query),
            query_preview=query[:50]
        )
        
        # Normalize query for analysis
        normalized_query = query.lower().strip()
        
        # Find learning keywords
        keywords_found = []
        for keyword in self.LEARNING_KEYWORDS:
            if keyword in normalized_query:
                keywords_found.append(keyword)
        
        # Check for strong learning phrases
        strong_phrases_found = []
        for phrase in self.STRONG_LEARNING_PHRASES:
            if phrase in normalized_query:
                strong_phrases_found.append(phrase)
        
        # Calculate learning score
        learning_score = self._calculate_learning_score(
            normalized_query, keywords_found, strong_phrases_found
        )
        
        # Determine query type and confidence
        query_type, confidence, reasoning = self._determine_query_type(
            learning_score, keywords_found, strong_phrases_found, normalized_query
        )
        
        result = {
            "query_type": query_type,
            "confidence": confidence,
            "learning_score": learning_score,
            "keywords_found": keywords_found,
            "strong_phrases_found": strong_phrases_found,
            "reasoning": reasoning
        }
        
        print(f"📊 Query Classifier: Classification results:")
        print(f"   Query type: {query_type}")
        print(f"   Confidence: {confidence:.2f}")
        print(f"   Learning score: {learning_score:.2f}")
        print(f"   Keywords found: {keywords_found[:5]}")  # Show first 5
        print(f"   Strong phrases: {strong_phrases_found}")
        
        return result
    
    @weave.op()
    def _calculate_learning_score(
        self,
        normalized_query: str,
        keywords_found: List[str],
        strong_phrases_found: List[str]
    ) -> float:
        """
        Calculate a learning intent score for the query.
        
        Args:
            normalized_query: Normalized query text
            keywords_found: List of learning keywords found
            strong_phrases_found: List of strong learning phrases found
            
        Returns:
            Learning score between 0 and 1
        """
        score = 0.0
        
        # Base score from keywords (max 0.4)
        keyword_score = min(len(keywords_found) * 0.1, 0.4)
        score += keyword_score
        
        # Strong phrases give high score (max 0.6)
        if strong_phrases_found:
            phrase_score = min(len(strong_phrases_found) * 0.3, 0.6)
            score += phrase_score
        
        # Question patterns that suggest learning intent
        question_patterns = [
            r"how\s+(do\s+i|can\s+i|to)\s+learn",
            r"what\s+(course|courses|training)",
            r"where\s+(can\s+i|to)\s+(learn|study)",
            r"best\s+(course|tutorial|way\s+to\s+learn)",
            r"recommend.*course",
            r"getting\s+started"
        ]
        
        for pattern in question_patterns:
            if re.search(pattern, normalized_query):
                score += 0.2
                break
        
        # Cap at 1.0
        return min(score, 1.0)
    
    @weave.op()
    def _determine_query_type(
        self,
        learning_score: float,
        keywords_found: List[str],
        strong_phrases_found: List[str],
        normalized_query: str
    ) -> tuple[str, float, str]:
        """
        Determine the query type based on analysis.
        
        Args:
            learning_score: Calculated learning score
            keywords_found: Learning keywords found
            strong_phrases_found: Strong learning phrases found
            normalized_query: Normalized query text
            
        Returns:
            Tuple of (query_type, confidence, reasoning)
        """
        # High learning score or strong phrases = learning query
        if learning_score >= 0.6 or strong_phrases_found:
            return (
                "learning",
                min(learning_score + 0.2, 1.0),
                f"Strong learning intent detected. Score: {learning_score:.2f}, "
                f"phrases: {strong_phrases_found}, keywords: {len(keywords_found)}"
            )
        
        # Medium learning score with multiple keywords = mixed query
        elif learning_score >= 0.3 and len(keywords_found) >= 2:
            return (
                "mixed",
                learning_score,
                f"Mixed intent detected. Learning score: {learning_score:.2f}, "
                f"keywords: {keywords_found[:3]}"
            )
        
        # Low learning score but some keywords = might be learning
        elif learning_score >= 0.1 and keywords_found:
            return (
                "mixed",
                learning_score * 0.8,  # Lower confidence
                f"Possible learning intent. Score: {learning_score:.2f}, "
                f"keywords: {keywords_found[:2]}"
            )
        
        # No learning indicators = general query
        else:
            return (
                "general",
                0.9,  # High confidence for general queries
                f"No significant learning intent detected. Score: {learning_score:.2f}"
            )
    
    @weave.op()
    async def classify_with_llm(self, query: str) -> Dict[str, Any]:
        """
        Use LLM for advanced query classification (optional enhancement).
        
        Args:
            query: The user query to classify
            
        Returns:
            Enhanced classification results
        """
        if not self.llm_service:
            # Fallback to rule-based classification
            return self.classify_query(query)
        
        print(f"🤖 Query Classifier: Using LLM for advanced classification")
        
        add_session_metadata(
            operation_type="llm_classification",
            query_length=len(query)
        )
        
        # Get rule-based classification first
        rule_based = self.classify_query(query)
        
        # LLM classification prompt
        classification_prompt = f"""
Analyze this user query and determine if it's asking about learning, courses, or education:

Query: "{query}"

Consider:
1. Is the user asking about learning something new?
2. Are they looking for courses, tutorials, or educational content?
3. Do they want to develop skills or knowledge?
4. Are they asking "how to learn" or "where to study"?

Respond with just one word:
- "learning" if they want educational content/courses
- "general" if it's a regular question about existing knowledge
- "mixed" if it has both learning and general aspects

Classification:"""
        
        try:
            completion = await self.llm_service.generate_completion(
                prompt=classification_prompt,
                max_tokens=10,
                temperature=0.1
            )
            
            llm_classification = completion["text"].strip().lower()
            
            # Combine rule-based and LLM results
            if llm_classification in ["learning", "general", "mixed"]:
                # If LLM agrees with rule-based, increase confidence
                if llm_classification == rule_based["query_type"]:
                    rule_based["confidence"] = min(rule_based["confidence"] + 0.1, 1.0)
                    rule_based["reasoning"] += f" (LLM confirmed: {llm_classification})"
                else:
                    # If they disagree, use LLM result with medium confidence
                    rule_based["query_type"] = llm_classification
                    rule_based["confidence"] = 0.7
                    rule_based["reasoning"] += f" (LLM override: {llm_classification})"
            
            rule_based["llm_classification"] = llm_classification
            
        except Exception as e:
            print(f"⚠️ Query Classifier: LLM classification failed: {str(e)}")
            rule_based["llm_error"] = str(e)
        
        return rule_based
