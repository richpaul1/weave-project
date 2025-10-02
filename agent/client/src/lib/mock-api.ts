import { GraphNode, GraphEdge } from "@/types/schema";

export const mockGraphData = {
  nodes: [
    {
      id: 1,
      label: "Machine Learning",
      type: "concept",
      properties: { description: "Core AI concept", centrality: 0.8 },
      x: 400,
      y: 200
    },
    {
      id: 2,
      label: "Neural Networks",
      type: "concept",
      properties: { description: "Deep learning technique", centrality: 0.6 },
      x: 600,
      y: 150
    },
    {
      id: 3,
      label: "Research Papers",
      type: "document",
      properties: { count: 156, centrality: 0.7 },
      x: 300,
      y: 350
    },
    {
      id: 4,
      label: "Algorithms",
      type: "concept",
      properties: { description: "Computing methods", centrality: 0.5 },
      x: 200,
      y: 150
    },
    {
      id: 5,
      label: "Authors",
      type: "person",
      properties: { count: 89, centrality: 0.4 },
      x: 550,
      y: 400
    }
  ] as GraphNode[],
  
  edges: [
    { id: 1, sourceId: 1, targetId: 2, relationship: "uses", weight: 5 },
    { id: 2, sourceId: 1, targetId: 3, relationship: "discusses", weight: 3 },
    { id: 3, sourceId: 3, targetId: 5, relationship: "authored_by", weight: 2 },
    { id: 4, sourceId: 1, targetId: 4, relationship: "implements", weight: 4 },
    { id: 5, sourceId: 2, targetId: 4, relationship: "related_to", weight: 2 }
  ] as GraphEdge[]
};

export const mockChatResponses = {
  "machine learning": {
    thinking: [
      "→ Querying Neo4j graph database for machine learning entities...",
      "→ Found 23 related papers, 15 algorithms, 8 researchers",
      "→ Building context from graph relationships...",
      "→ Generating comprehensive response..."
    ],
    response: `Based on your knowledge graph, I found several key machine learning concepts and their relationships:

**Connected Entities:**
- 23 related concepts found in the graph
- 15 documents with relevant content
- 8 interconnected researchers and authors

**Key Algorithms Identified:**
- **Convolutional Neural Networks (CNNs)** - Used in 8 papers for image processing
- **Recurrent Neural Networks (RNNs)** - Applied in 5 papers for NLP tasks
- **Transformer Architecture** - Featured in 12 recent papers

**Graph Context Insights:**
The graph analysis reveals strong connections between ML concepts and your research corpus. The centrality analysis shows this topic is highly connected in your knowledge base.

Would you like me to explore any specific algorithm or researcher connections?`
  },
  
  "default": {
    thinking: [
      "→ Searching knowledge graph for relevant context...",
      "→ Analyzing document relationships...",
      "→ Preparing comprehensive response..."
    ],
    response: `I've searched through your knowledge graph and found relevant connections to your query. The graph contains interconnected concepts, documents, and entities that provide rich context for detailed responses.

**Available Knowledge:**
- 1,247 nodes across multiple domains
- 3,891 relationships between concepts
- 156 source documents with extracted content

How can I help you explore these connections further?`
  }
};

export const mockGraphStats = {
  nodes: 1247,
  edges: 3891,
  clusters: 23,
  sources: 156,
  nodeTypes: {
    concepts: 487,
    documents: 156,
    entities: 324,
    people: 89
  }
};
