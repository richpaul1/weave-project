import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Network, Database, Users, FileText, Search, X, BarChart3, Play, Hash, MessageSquare, Building2, Lightbulb, Trash2, Loader2, Activity, Eye } from "lucide-react";
import { GraphNode, GraphEdge, normalizeToContentNodeType } from "@/types/graph";
import CytoscapeGraph from "@/components/cytoscape-graph";
import GraphSearchResults from "@/components/graph-search-results";
import { useDebounce } from "@/hooks/use-debounce";

export default function GraphPage() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "search">("overview");
  const [currentView, setCurrentView] = useState<"graph" | "report">("graph");
  const centerNodeFunctionRef = useRef<((nodeId: string) => void) | null>(null);
  const [centerNodeFunction, setCenterNodeFunction] = useState<((nodeId: string) => void) | null>(null);

  // Center function registration
  const handleCenterNodeCallback = useCallback((fn: (nodeId: string) => void) => {
    centerNodeFunctionRef.current = fn;
    setCenterNodeFunction(() => fn);
  }, []);

  const handleLayoutComplete = useCallback((isComplete: boolean) => {
    setIsInitialLayoutComplete(isComplete);
  }, []);


  const [simulationNodes, setSimulationNodes] = useState<GraphNode[]>([]);

  // Filtering state
  const [isFiltered, setIsFiltered] = useState(false);
  const [filteredNodes, setFilteredNodes] = useState<GraphNode[]>([]);
  const [filteredEdges, setFilteredEdges] = useState<GraphEdge[]>([]);

  // Reports state
  const [activeReportTab, setActiveReportTab] = useState<"statistics" | "duplicates">("statistics");

  // Duplicate detection state
  const [duplicateStats, setDuplicateStats] = useState<any>(null);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);

  // Duplicate detail modal state
  const [selectedDuplicateGroup, setSelectedDuplicateGroup] = useState<any>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Auto-centering state
  const [showAutoCenterMessage, setShowAutoCenterMessage] = useState(false);
  const [isInitialLayoutComplete, setIsInitialLayoutComplete] = useState(false);


  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: nodes = [], isLoading: nodesLoading, refetch: refetchNodes } = useQuery<GraphNode[]>({
    queryKey: ['/api/graph/nodes'],
  });

  const { data: edges = [], isLoading: edgesLoading, refetch: refetchEdges } = useQuery<GraphEdge[]>({
    queryKey: ['/api/graph/edges'],
  });





  // Search query for nodes
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['/api/graph/search', debouncedSearchQuery],
    queryFn: async () => {
      if (!debouncedSearchQuery.trim()) return { results: [], total: 0, query: "" };

      const response = await fetch(`/api/graph/search?q=${encodeURIComponent(debouncedSearchQuery)}&limit=50`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: !!debouncedSearchQuery.trim(),
  });

  // Node type statistics query
  const { data: nodeTypeStats = {}, isLoading: isLoadingStats } = useQuery<{ [type: string]: number }>({
    queryKey: ['/api/graph/node-types'],
    queryFn: async () => {
      const response = await fetch('/api/graph/node-types');
      if (!response.ok) throw new Error('Failed to fetch node type statistics');
      return response.json();
    },
  });

  const connectedNodes = selectedNode
    ? edges
        .filter(edge => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id)
        .map(edge => {
          const connectedNodeId = edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
          return {
            node: nodes.find(n => n.id === connectedNodeId),
            relationship: edge.relationship,
            weight: edge.weight,
          };
        })
        .filter(item => item.node)
    : [];

  // Handle analyzing duplicates for reports
  const handleAnalyzeDuplicates = useCallback(async () => {
    setIsLoadingDuplicates(true);

    try {
      // Fetch duplicate analysis from API
      const response = await fetch('/api/duplicates');
      if (!response.ok) {
        throw new Error('Failed to fetch duplicate analysis');
      }

      const result = await response.json();
      const analysis = result.data;

      setDuplicateStats(analysis);

    } catch (error) {
      console.error('Error fetching duplicates:', error);
      alert('Failed to analyze duplicates. Please try again.');
    } finally {
      setIsLoadingDuplicates(false);
    }
  }, []);

  // Handle opening duplicate detail modal
  const handleViewDuplicateDetails = useCallback((group: any, type: 'node' | 'edge') => {
    setSelectedDuplicateGroup({ ...group, type });
    setIsDuplicateModalOpen(true);
  }, []);

  // Handle showing duplicates in graph view
  const handleShowDuplicatesInGraph = useCallback(() => {
    if (!duplicateStats) return;

    // Get all node IDs that are involved in duplicates
    const duplicateNodeIds = new Set<string>();

    // Add nodes from duplicate groups
    duplicateStats.nodeGroups.forEach((group: any) => {
      group.items.forEach((node: any) => {
        duplicateNodeIds.add(node.id);
      });
    });

    // Add nodes connected by duplicate edges
    duplicateStats.edgeGroups.forEach((group: any) => {
      group.items.forEach((edge: any) => {
        duplicateNodeIds.add(edge.sourceId);
        duplicateNodeIds.add(edge.targetId);
      });
    });

    // Filter to show only duplicate-related nodes and edges
    const filteredNodes = nodes.filter(node => duplicateNodeIds.has(node.id));
    const filteredEdges = edges.filter(edge =>
      duplicateNodeIds.has(edge.sourceId) && duplicateNodeIds.has(edge.targetId)
    );

    setFilteredNodes(filteredNodes);
    setFilteredEdges(filteredEdges);
    setIsFiltered(true);

    // Switch to graph view
    setCurrentView("graph");
  }, [duplicateStats, nodes, edges]);







  // Get the current position from simulation nodes
  const selectedSimulationNode = selectedNode
    ? simulationNodes.find(n => n.id === selectedNode.id)
    : null;

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'concept': return 'bg-primary/10 text-primary';
      case 'document': return 'bg-yellow-500/10 text-yellow-600';
      case 'person': return 'bg-red-500/10 text-red-600';
      case 'entity': return 'bg-accent/10 text-accent';
      case 'page': return 'bg-blue-500/10 text-blue-600';
      default: return 'bg-purple-500/10 text-purple-600';
    }
  };

  const getContentTypeIcon = (type: string) => {
    const contentType = normalizeToContentNodeType(type);
    switch (contentType) {
      case 'page':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'video':
        return <Play className="h-4 w-4 text-red-500" />;
      case 'transcript':
        return <MessageSquare className="h-4 w-4 text-orange-500" />;
      case 'chunk':
        return <Hash className="h-4 w-4 text-gray-500" />;
      case 'entity':
        return <Building2 className="h-4 w-4 text-green-500" />;
      case 'topic':
        return <Lightbulb className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleDeleteNode = async (nodeId: string, cascade: boolean = false) => {
    if (!confirm('Are you sure you want to delete this node and all its connections? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/graph/nodes/${nodeId}?cascade=${cascade}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete node');
      }

      const result = await response.json();

      // Refresh the graph data
      await Promise.all([
        refetchNodes(),
        refetchEdges()
      ]);

      // Clear selected node if it was deleted
      setSelectedNode(null);

      // Reset any filters
      setFilteredNodes([]);
      setFilteredEdges([]);
      setIsFiltered(false);

      alert(`Successfully deleted ${result.deletedNodes} node(s)${cascade ? ' and their connections' : ''}`);
    } catch (error) {
      console.error('Error deleting node:', error);
      alert('Failed to delete node. Please try again.');
    }
  };

  const handleNodeSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setActiveTab("overview");

    // Show auto-center message if this is the first selection (likely auto-selected)
    if (!selectedNode && !showAutoCenterMessage) {
      setShowAutoCenterMessage(true);
      setTimeout(() => setShowAutoCenterMessage(false), 4000);
    }
  }, [selectedNode, showAutoCenterMessage]);

  const handleSearchNodeSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setActiveTab("overview");
    // Clear search to return to normal view
    setSearchQuery("");
    // Center the node in the visualization
    if (centerNodeFunction) {
      centerNodeFunction(node.id);
    }
  }, [centerNodeFunction]);

  const clearSearch = () => {
    setSearchQuery("");
    setActiveTab("overview");
  };

  return (
    <div className="h-full flex flex-col">
      <header className="bg-surface border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Knowledge Graph</h2>
            <p className="text-sm text-muted-foreground">
              {currentView === "graph" ? "Visualize and explore your knowledge graph" : "View node type statistics and reports"}
            </p>
          </div>

          {/* Search Input - Only show in graph view */}
          {currentView === "graph" && (
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search nodes by name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) {
                      setActiveTab("search");
                    }
                  }}
                  className="pl-10 pr-8 w-96"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Button
              variant={currentView === "report" ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentView("report")}
              className="flex items-center space-x-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Reports</span>
            </Button>


          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {currentView === "graph" ? (
          <>
            {/* Graph Visualization */}
            <div className="flex-1 relative">
              {/* Loading spinner overlay */}
              {!isInitialLayoutComplete && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
                  <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Calculating graph layout...</p>
                      <p className="text-xs text-muted-foreground">This may take a few moments for large graphs</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Indicators */}
              {isFiltered && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                    Showing {filteredNodes.length} filtered nodes
                  </Badge>
                </div>
              )}

              {/* Auto-center notification */}
              {showAutoCenterMessage && selectedNode && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                    📍 Auto-centered on most connected node: {selectedNode.label}
                  </Badge>
                </div>
              )}

              <CytoscapeGraph
                onNodeSelect={handleNodeSelect}
                selectedNode={selectedNode}
                onCenterNode={handleCenterNodeCallback}
                onLayoutComplete={handleLayoutComplete}
                nodes={isFiltered ? filteredNodes : nodes}
                edges={isFiltered ? filteredEdges : edges}
                isIsolated={isFiltered}
                searchTerm={searchQuery}
              />
            </div>

            {/* Graph Details Panel */}
            <div className="w-80 bg-surface border-l border-border overflow-y-auto">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-foreground">Graph Explorer</h3>
            </div>


          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "search")} className="flex-1">
            <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="search" disabled={!searchQuery.trim()}>
                Search {searchResults?.total ? `(${searchResults.total})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="p-4 space-y-6 mt-0">

            

            
            {/* Selected Node Details */}
            {selectedNode && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-foreground">Selected Node</h4>
                  {getContentTypeIcon(selectedNode.type)}
                </div>
                <Card className="bg-background border-border">
                  <CardContent className="p-3">
                    <div className="flex items-start space-x-2 mb-2">
                      <Badge variant="outline" className={`${getNodeTypeColor(selectedNode.type)} flex-shrink-0`}>
                        {selectedNode.type}
                      </Badge>
                      <span className="text-xs font-medium text-foreground break-words min-w-0 flex-1">
                        {selectedNode.label}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>Connections: {connectedNodes.length}</div>
                      <div>Position: ({selectedSimulationNode?.x?.toFixed(0) || 'N/A'}, {selectedSimulationNode?.y?.toFixed(0) || 'N/A'})</div>
                      {selectedNode.properties && (
                        <div>
                          Properties: {Object.keys(selectedNode.properties).length}
                        </div>
                      )}
                    </div>

                    {/* Center Node Button */}
                    <div className="mt-3 space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (centerNodeFunction) {
                            centerNodeFunction(selectedNode.id);
                          }
                        }}
                        disabled={!centerNodeFunction}
                        title={!centerNodeFunction ? 'Center function not available' : 'Center this node in the graph'}
                        className="w-full"
                      >
                        <Search className="h-3 w-3 mr-1" />
                        Center in Graph
                      </Button>

                      {/* Isolate/Reset buttons */}
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedNode) {
                              // Get connected node IDs
                              const connectedNodeIds = new Set([selectedNode.id]);
                              connectedNodes.forEach(conn => {
                                if (conn.node) {
                                  connectedNodeIds.add(conn.node.id);
                                }
                              });

                              // Filter nodes and edges to show only connected ones
                              const filteredNodes = nodes.filter(node => connectedNodeIds.has(node.id));
                              const filteredEdges = edges.filter(edge =>
                                connectedNodeIds.has(edge.sourceId) && connectedNodeIds.has(edge.targetId)
                              );


                              setFilteredNodes(filteredNodes);
                              setFilteredEdges(filteredEdges);
                              setIsFiltered(true);
                            }
                          }}
                          disabled={!selectedNode || connectedNodes.length === 0}
                          className="flex-1"
                        >
                          Isolate ({connectedNodes.length})
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFilteredNodes([]);
                            setFilteredEdges([]);
                            setIsFiltered(false);
                            setDuplicateStats(null);
                          }}
                          disabled={!isFiltered}
                          className="flex-1"
                        >
                          Reset
                        </Button>
                      </div>



                      {/* Delete button */}
                      <div className="flex mt-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteNode(selectedNode!.id, false)}
                          disabled={!selectedNode}
                          className="w-full"
                          title="Delete this node and all its connections"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete Node
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Connected Nodes */}
            {selectedNode && connectedNodes.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Connected Nodes</h4>
                <div className="space-y-2">
                  {connectedNodes.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-accent rounded-full" />
                        <span className="text-muted-foreground">{item.node?.label}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-muted-foreground">{item.relationship}</span>
                        <Badge variant="outline" className="h-4 text-xs">
                          {item.weight}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}



            </TabsContent>

            <TabsContent value="search" className="p-4 mt-0">
              {isSearching ? (
                <div className="text-center py-8">
                  <div className="text-sm text-muted-foreground">Searching...</div>
                </div>
              ) : (
                <GraphSearchResults
                  results={searchResults?.results || []}
                  query={debouncedSearchQuery}
                  onNodeSelect={handleSearchNodeSelect}
                />
              )}
            </TabsContent>
          </Tabs>
            </div>
          </>
        ) : (
          /* Reports View */
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="space-y-3">
                <h3 className="text-2xl font-semibold text-foreground flex items-center">
                  <BarChart3 className="h-6 w-6 mr-3" />
                  Graph Reports
                </h3>
                <p className="text-muted-foreground">
                  Comprehensive analysis and management tools for your knowledge graph
                </p>
              </div>

              {/* Report Tabs */}
              <Tabs value={activeReportTab} onValueChange={(value) => setActiveReportTab(value as "statistics" | "duplicates")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="statistics" className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4" />
                    <span>Statistics</span>
                  </TabsTrigger>
                  <TabsTrigger value="duplicates" className="flex items-center space-x-2">
                    <Hash className="h-4 w-4" />
                    <span>Duplicates</span>
                  </TabsTrigger>
                </TabsList>

                {/* Statistics Tab */}
                <TabsContent value="statistics" className="mt-6">

              {isLoadingStats ? (
                <div className="text-center py-12">
                  <div className="text-lg text-muted-foreground">Loading statistics...</div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-background border-border">
                      <CardContent className="p-6 text-center">
                        <div className="text-3xl font-bold text-primary mb-2">
                          {Object.values(nodeTypeStats).reduce((sum, count) => sum + count, 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Nodes</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-background border-border">
                      <CardContent className="p-6 text-center">
                        <div className="text-3xl font-bold text-accent mb-2">
                          {Object.keys(nodeTypeStats).length}
                        </div>
                        <div className="text-sm text-muted-foreground">Node Types</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-background border-border">
                      <CardContent className="p-6 text-center">
                        <div className="text-3xl font-bold text-green-600 mb-2">
                          {nodeTypeStats['video'] || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Video Nodes</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Node Type Breakdown */}
                  <Card className="bg-background border-border">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">Type Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {Object.entries(nodeTypeStats)
                          .sort(([, a], [, b]) => b - a) // Sort by count descending
                          .map(([type, count]) => {
                            const isPageType = type === 'page';
                            const isVideoType = type === 'video';
                            const isImageType = type === 'image';
                            const isTranscriptType = type === 'transcript_chunk';
                            const isPeopleType = type.toLowerCase().includes('people') || type.toLowerCase().includes('person');

                            return (
                              <div key={type} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                <div className="flex items-center space-x-3">
                                  <div
                                    className={`w-4 h-4 rounded-full ${
                                      isPageType ? 'bg-blue-500' :
                                      isVideoType ? 'bg-green-500' :
                                      isImageType ? 'bg-purple-500' :
                                      isTranscriptType ? 'bg-orange-500' :
                                      isPeopleType ? 'bg-red-500' :
                                      'bg-gray-400'
                                    }`}
                                  />
                                  <span className="text-base text-foreground font-medium">{type}</span>
                                  {isPageType && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                      Pages ✓
                                    </Badge>
                                  )}
                                  {isVideoType && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                      Videos ✓
                                    </Badge>
                                  )}
                                  {isImageType && (
                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                      Images ✓
                                    </Badge>
                                  )}
                                  {isTranscriptType && (
                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                      Transcripts ✓
                                    </Badge>
                                  )}
                                  {isPeopleType && (
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                      People ⚠️
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center space-x-4">
                                  <span className="text-lg font-semibold text-foreground min-w-[60px] text-right">
                                    {count.toLocaleString()}
                                  </span>
                                  <div className="w-24 bg-gray-200 rounded-full h-3">
                                    <div
                                      className={`h-3 rounded-full ${
                                        isPageType ? 'bg-blue-500' :
                                        isVideoType ? 'bg-green-500' :
                                        isImageType ? 'bg-purple-500' :
                                        isTranscriptType ? 'bg-orange-500' :
                                        isPeopleType ? 'bg-red-500' :
                                        'bg-gray-400'
                                      }`}
                                      style={{
                                        width: `${Math.min(100, (count / Math.max(...Object.values(nodeTypeStats))) * 100)}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Validation Summary */}
                  <Card className="bg-background border-border">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">Validation Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center space-x-3">
                            <FileText className="h-5 w-5 text-blue-500" />
                            <span className="text-base text-foreground">Pages Present</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={nodeTypeStats['page'] > 0 ?
                              "bg-green-50 text-green-700 border-green-200" :
                              "bg-red-50 text-red-700 border-red-200"
                            }
                          >
                            {nodeTypeStats['page'] > 0 ? `✓ ${nodeTypeStats['page']} pages` : '✗ No pages found'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center space-x-3">
                            <Users className="h-5 w-5 text-red-500" />
                            <span className="text-base text-foreground">People Nodes</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              Object.keys(nodeTypeStats).some(type =>
                                type.toLowerCase().includes('people') || type.toLowerCase().includes('person')
                              ) ?
                              "bg-red-50 text-red-700 border-red-200" :
                              "bg-green-50 text-green-700 border-green-200"
                            }
                          >
                            {Object.keys(nodeTypeStats).some(type =>
                              type.toLowerCase().includes('people') || type.toLowerCase().includes('person')
                            ) ?
                            '⚠️ People nodes found' :
                            '✓ No people nodes'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center space-x-3">
                            <Activity className="h-5 w-5 text-green-500" />
                            <span className="text-base text-foreground">Video Content</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={nodeTypeStats['video'] > 0 ?
                              "bg-green-50 text-green-700 border-green-200" :
                              "bg-gray-50 text-gray-700 border-gray-200"
                            }
                          >
                            {nodeTypeStats['video'] > 0 ? `✓ ${nodeTypeStats['video']} videos` : '○ No videos'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center space-x-3">
                            <Database className="h-5 w-5 text-orange-500" />
                            <span className="text-base text-foreground">Transcript Chunks</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={nodeTypeStats['transcript_chunk'] > 0 ?
                              "bg-green-50 text-green-700 border-green-200" :
                              "bg-gray-50 text-gray-700 border-gray-200"
                            }
                          >
                            {nodeTypeStats['transcript_chunk'] > 0 ? `✓ ${nodeTypeStats['transcript_chunk']} chunks` : '○ No transcripts'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
                </TabsContent>

                {/* Duplicates Tab */}
                <TabsContent value="duplicates" className="mt-6">
                  <div className="space-y-6">
                    {/* Header with Analyze Button */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-foreground">Duplicate Detection</h4>
                        <p className="text-sm text-muted-foreground">
                          Find and manage duplicate nodes and relationships in your graph
                        </p>
                      </div>
                      <Button
                        onClick={handleAnalyzeDuplicates}
                        disabled={isLoadingDuplicates}
                        className="flex items-center space-x-2"
                      >
                        {isLoadingDuplicates ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Hash className="h-4 w-4" />
                        )}
                        <span>{isLoadingDuplicates ? 'Analyzing...' : 'Analyze Duplicates'}</span>
                      </Button>
                    </div>

                    {/* Results */}
                    {duplicateStats && (
                      <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <Card className="bg-background border-border">
                            <CardContent className="p-6 text-center">
                              <div className="text-3xl font-bold text-orange-600 mb-2">
                                {duplicateStats.summary?.duplicateNodeCount || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Duplicate Nodes</div>
                            </CardContent>
                          </Card>
                          <Card className="bg-background border-border">
                            <CardContent className="p-6 text-center">
                              <div className="text-3xl font-bold text-red-600 mb-2">
                                {duplicateStats.summary?.duplicateEdgeCount || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Duplicate Edges</div>
                            </CardContent>
                          </Card>
                          <Card className="bg-background border-border">
                            <CardContent className="p-6 text-center">
                              <div className="text-3xl font-bold text-blue-600 mb-2">
                                {(duplicateStats.summary?.nodeGroupCount || 0) + (duplicateStats.summary?.edgeGroupCount || 0)}
                              </div>
                              <div className="text-sm text-muted-foreground">Total Groups</div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Action Buttons */}
                        {(duplicateStats.summary?.duplicateNodeCount > 0 || duplicateStats.summary?.duplicateEdgeCount > 0) && (
                          <div className="flex items-center space-x-4">
                            <Button
                              onClick={handleShowDuplicatesInGraph}
                              variant="outline"
                              className="flex items-center space-x-2"
                            >
                              <Network className="h-4 w-4" />
                              <span>View in Graph</span>
                            </Button>
                            <Button
                              variant="destructive"
                              className="flex items-center space-x-2"
                              onClick={() => {
                                if (confirm('Are you sure you want to clean up all duplicates? This action cannot be undone.')) {
                                  // TODO: Implement cleanup functionality
                                  alert('Cleanup functionality coming soon!');
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Clean Up Duplicates</span>
                            </Button>
                          </div>
                        )}

                        {/* Detailed Results */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Node Duplicates */}
                          {duplicateStats.nodeGroups && duplicateStats.nodeGroups.length > 0 && (
                            <Card className="bg-background border-border">
                              <CardHeader>
                                <CardTitle className="text-lg font-semibold flex items-center">
                                  <Hash className="h-5 w-5 mr-2 text-orange-600" />
                                  Node Duplicates
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                  {duplicateStats.nodeGroups.map((group: any, index: number) => (
                                    <div key={index} className="p-3 rounded-lg border bg-gray-800 dark:bg-gray-800 border-gray-600 dark:border-gray-600">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                          <div className="font-medium text-white mb-1 break-all">
                                            {group.items[0]?.title || 'Untitled'}
                                          </div>
                                          <div className="text-xs text-gray-300 mb-1">
                                            Type: <span className="font-mono">{group.items[0]?.type}</span>
                                          </div>
                                          <div className="text-xs text-gray-300 mb-1">
                                            ID: <span className="font-mono text-blue-300 break-all">{group.items[0]?.id}</span>
                                          </div>
                                          <div className="text-xs text-gray-300 mb-1">
                                            Duplicate criteria: Same title + type
                                          </div>
                                          <div className="text-sm text-gray-300">
                                            {group.count} duplicates found
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleViewDuplicateDetails(group, 'node')}
                                          className="ml-2 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700 bg-transparent hover:bg-orange-100 dark:hover:bg-orange-900/20"
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          Details
                                        </Button>
                                      </div>
                                      <div className="space-y-1">
                                        {group.items.slice(0, 3).map((node: any, nodeIndex: number) => (
                                          <div key={nodeIndex} className="text-xs text-gray-300 font-mono bg-gray-700 px-2 py-1 rounded break-all">
                                            ID: {node.id}
                                          </div>
                                        ))}
                                        {group.items.length > 3 && (
                                          <div className="text-xs text-gray-300 italic">
                                            +{group.items.length - 3} more duplicates
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {/* Edge Duplicates */}
                          {duplicateStats.edgeGroups && duplicateStats.edgeGroups.length > 0 && (
                            <Card className="bg-background border-border">
                              <CardHeader>
                                <CardTitle className="text-lg font-semibold flex items-center">
                                  <Network className="h-5 w-5 mr-2 text-red-600" />
                                  Edge Duplicates
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                  {duplicateStats.edgeGroups.map((group: any, index: number) => (
                                    <div key={index} className="p-3 rounded-lg border bg-gray-800 dark:bg-gray-800 border-gray-600 dark:border-gray-600">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                          <div className="font-medium text-white mb-1">
                                            {group.items[0]?.relationship}
                                          </div>
                                          <div className="text-xs text-gray-300 mb-1">
                                            Duplicate criteria: Same source + target + relationship
                                          </div>
                                          <div className="text-sm text-gray-300 mb-2">
                                            {group.count} duplicate relationships
                                          </div>
                                          <div className="text-xs text-gray-300 mb-2">
                                            <div className="font-mono bg-gray-700 px-2 py-1 rounded mb-1 break-all">
                                              <span className="text-blue-300">Source:</span> {group.items[0]?.sourceId}
                                            </div>
                                            <div className="font-mono bg-gray-700 px-2 py-1 rounded break-all">
                                              <span className="text-green-300">Target:</span> {group.items[0]?.targetId}
                                            </div>
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleViewDuplicateDetails(group, 'edge')}
                                          className="ml-2 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 bg-transparent hover:bg-red-100 dark:hover:bg-red-900/20"
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          Details
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>

                        {/* No Duplicates Message */}
                        {duplicateStats.summary?.duplicateNodeCount === 0 && duplicateStats.summary?.duplicateEdgeCount === 0 && (
                          <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-6 text-center">
                              <div className="text-green-600 mb-2">
                                <Hash className="h-8 w-8 mx-auto mb-2" />
                                <div className="text-lg font-semibold">No Duplicates Found</div>
                              </div>
                              <div className="text-sm text-green-700">
                                Your graph is clean! No duplicate nodes or relationships were detected.
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}

                    {/* Initial State */}
                    {!duplicateStats && !isLoadingDuplicates && (
                      <Card className="bg-background border-border">
                        <CardContent className="p-12 text-center">
                          <Hash className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <div className="text-lg font-semibold text-foreground mb-2">
                            Duplicate Analysis
                          </div>
                          <div className="text-sm text-muted-foreground mb-6">
                            Click "Analyze Duplicates" to scan your graph for duplicate nodes and relationships.
                          </div>
                          <Button
                            onClick={handleAnalyzeDuplicates}
                            className="flex items-center space-x-2"
                          >
                            <Hash className="h-4 w-4" />
                            <span>Start Analysis</span>
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Details Modal */}
      <Dialog open={isDuplicateModalOpen} onOpenChange={setIsDuplicateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {selectedDuplicateGroup?.type === 'node' ? (
                <Hash className="h-5 w-5 mr-2 text-orange-600" />
              ) : (
                <Network className="h-5 w-5 mr-2 text-red-600" />
              )}
              {selectedDuplicateGroup?.type === 'node' ? 'Node' : 'Edge'} Duplicate Details
            </DialogTitle>
          </DialogHeader>

          {selectedDuplicateGroup && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="p-4 rounded-lg border bg-gray-800 border-gray-600">
                <h3 className="font-semibold mb-2 text-white">
                  Why are these duplicates?
                </h3>
                <p className="text-sm text-gray-300">
                  {selectedDuplicateGroup.type === 'node'
                    ? `These nodes have the same label "${selectedDuplicateGroup.items[0]?.title}" and type "${selectedDuplicateGroup.items[0]?.type}". In a knowledge graph, nodes with identical labels and types typically represent the same entity and should be merged.`
                    : `These edges have the same source node, target node, and relationship type "${selectedDuplicateGroup.items[0]?.relationship}". Multiple identical relationships between the same nodes are redundant and should be consolidated.`
                  }
                </p>
              </div>

              {/* Detailed Items */}
              <div>
                <h3 className="font-semibold mb-3">
                  All {selectedDuplicateGroup.count} Duplicate {selectedDuplicateGroup.type === 'node' ? 'Nodes' : 'Edges'}:
                </h3>
                <div className="space-y-3">
                  {selectedDuplicateGroup.items.map((item: any, index: number) => (
                    <div key={index} className="p-3 rounded-lg border bg-gray-800 border-gray-600">
                      {selectedDuplicateGroup.type === 'node' ? (
                        <div>
                          <div className="text-sm mb-2 text-gray-300">
                            <strong className="text-white">ID:</strong>
                            <div className="mt-1 p-2 bg-gray-700 rounded text-xs font-mono break-all">
                              {item.id}
                            </div>
                          </div>
                          <div className="text-sm mb-2 text-gray-300">
                            <strong className="text-white">Title:</strong>
                            <div className="mt-1 p-2 bg-gray-700 rounded text-xs break-all">
                              {item.title || 'Untitled'}
                            </div>
                          </div>
                          <div className="text-sm mb-2 text-gray-300">
                            <strong className="text-white">Type:</strong> {item.type}
                          </div>
                          {item.properties && (
                            <div className="text-sm text-gray-300">
                              <strong className="text-white">Properties:</strong>
                              <pre className="mt-1 p-2 bg-gray-700 text-gray-200 rounded text-xs overflow-x-auto">
                                {typeof item.properties === 'string'
                                  ? item.properties
                                  : JSON.stringify(item.properties, null, 2)
                                }
                              </pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-mono text-sm mb-2 text-gray-300">
                            <strong className="text-white">Source:</strong> {item.sourceId}
                          </div>
                          <div className="font-mono text-sm mb-2 text-gray-300">
                            <strong className="text-white">Target:</strong> {item.targetId}
                          </div>
                          <div className="text-sm mb-2 text-gray-300">
                            <strong className="text-white">Relationship:</strong> {item.relationship}
                          </div>
                          {item.properties && (
                            <div className="text-sm text-gray-300">
                              <strong className="text-white">Properties:</strong>
                              <pre className="mt-1 p-2 bg-gray-700 text-gray-200 rounded text-xs overflow-x-auto">
                                {typeof item.properties === 'string'
                                  ? item.properties
                                  : JSON.stringify(item.properties, null, 2)
                                }
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="p-4 rounded-lg border bg-gray-800 border-gray-600">
                <h3 className="font-semibold mb-2 text-white">
                  Recommended Actions:
                </h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  {selectedDuplicateGroup.type === 'node' ? (
                    <>
                      <li>• Merge duplicate nodes into a single node</li>
                      <li>• Consolidate all relationships to point to the merged node</li>
                      <li>• Preserve any unique properties from all duplicate nodes</li>
                      <li>• Update any references in the system to use the merged node ID</li>
                    </>
                  ) : (
                    <>
                      <li>• Remove redundant edge relationships</li>
                      <li>• Keep only one edge between the same source and target nodes</li>
                      <li>• Preserve any unique properties from all duplicate edges</li>
                      <li>• Verify that edge removal doesn't affect system functionality</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
