import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import coseBilkent from 'cytoscape-cose-bilkent';
import { GraphNode, GraphEdge, CONTENT_NODE_TYPES, normalizeToContentNodeType } from '@/types/graph';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, X, Activity } from "lucide-react";

// Register layout algorithms
cytoscape.use(dagre);
cytoscape.use(coseBilkent);

interface CytoscapeGraphProps {
  onNodeSelect?: (node: GraphNode) => void;
  selectedNode?: GraphNode | null;
  onCenterNode?: (centerFunction: (nodeId: string) => void) => void;
  onLayoutComplete?: (isComplete: boolean) => void;
  nodes: GraphNode[];
  edges: GraphEdge[];
  isIsolated?: boolean;
  searchTerm?: string;
}

export default function CytoscapeGraph({
  onNodeSelect,
  selectedNode,
  onCenterNode,
  onLayoutComplete,
  nodes,
  edges,
  isIsolated = false,
  searchTerm = ""
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(true);
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<string[]>(
    Object.keys(CONTENT_NODE_TYPES)
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentLayout, setCurrentLayout] = useState('cose-bilkent');
  const [showLayoutOptions, setShowLayoutOptions] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [showFontOptions, setShowFontOptions] = useState(false);
  const [showConnectionLabels, setShowConnectionLabels] = useState(true);

  // Convert nodes and edges to Cytoscape format
  const cytoscapeElements = React.useMemo(() => {
    // Filter nodes based on visible types
    const filteredNodes = nodes.filter(node =>
      visibleNodeTypes.includes(normalizeToContentNodeType(node.type))
    );

    const cyNodes = filteredNodes.map(node => ({
      data: {
        id: node.id,
        label: node.label,
        type: normalizeToContentNodeType(node.type),
        originalType: node.type,
        properties: node.properties
      }
    }));

    // Create a set of valid node IDs for validation
    const validNodeIds = new Set(filteredNodes.map(node => node.id));

    // Filter edges to only include those with valid source and target nodes
    const validEdges = edges.filter(edge =>
      validNodeIds.has(edge.sourceId) && validNodeIds.has(edge.targetId)
    );

    const cyEdges = validEdges.map(edge => ({
      data: {
        id: `${edge.sourceId}-${edge.targetId}`,
        source: edge.sourceId,
        target: edge.targetId,
        relationship: edge.relationship,
        weight: edge.weight || 1
      }
    }));

    console.log(`🔍 Data validation: ${filteredNodes.length}/${nodes.length} nodes, ${edges.length} total edges, ${validEdges.length} valid edges`);

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges, visibleNodeTypes]);

  // Get node color based on type
  const getNodeColor = (type: string) => {
    const normalizedType = normalizeToContentNodeType(type);
    return CONTENT_NODE_TYPES[normalizedType]?.color || '#64748B';
  };

  // Get node size based on type
  const getNodeSize = (type: string) => {
    const normalizedType = normalizeToContentNodeType(type);
    const baseSizes = {
      'page': 40,
      'video': 35,
      'transcript': 30,
      'chunk': 25,
      'entity': 30,
      'topic': 35
    };
    return baseSizes[normalizedType] || 30;
  };

  // Layout configurations
  const layoutConfigs = {
    'cose-bilkent': {
      name: 'cose-bilkent',
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      nodeRepulsion: 8000,
      idealEdgeLength: 100,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.25,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 10,
      tilingPaddingHorizontal: 10,
      gravityRangeCompound: 1.5,
      gravityCompound: 1.0,
      gravityRange: 3.8
    },
    'dagre': {
      name: 'dagre',
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      rankDir: 'TB',
      ranker: 'longest-path',
      nodeSep: 50,
      edgeSep: 10,
      rankSep: 100
    },
    'circle': {
      name: 'circle',
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      radius: 200,
      startAngle: -Math.PI / 2,
      sweep: Math.PI * 2,
      clockwise: true
    },
    'grid': {
      name: 'grid',
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      rows: undefined,
      cols: undefined
    },
    'breadthfirst': {
      name: 'breadthfirst',
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 50,
      directed: false,
      circle: false,
      spacingFactor: 1.75
    }
  };

  const layoutNames = {
    'cose-bilkent': 'Force-Directed (COSE)',
    'dagre': 'Hierarchical (Dagre)',
    'circle': 'Circular',
    'grid': 'Grid',
    'breadthfirst': 'Breadth-First Tree'
  };

  // Font options
  const fontOptions = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Verdana',
    'Trebuchet MS',
    'Courier New',
    'Monaco',
    'Roboto',
    'Open Sans'
  ];

  const fontSizeOptions = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing instance if it exists
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: cytoscapeElements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => getNodeColor(ele.data('type')),
            'width': (ele: any) => getNodeSize(ele.data('type')),
            'height': (ele: any) => getNodeSize(ele.data('type')),
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': `${fontSize}px`,
            'font-family': fontFamily,
            'font-weight': 'normal',
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'border-width': 2,
            'border-color': '#ffffff',
            'border-opacity': 0.5
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#10b981',
            'border-opacity': 1
          }
        },

        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#64748B',
            'target-arrow-color': '#64748B',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.7,
            'label': showConnectionLabels ? 'data(relationship)' : '',
            'font-size': '9px',
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
            'color': '#64748b',
            'text-background-opacity': 0
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#10b981',
            'target-arrow-color': '#10b981',
            'width': 3,
            'opacity': 1
          }
        },
        {
          selector: 'node.search-highlighted',
          style: {
            'border-width': 4,
            'border-color': '#ff6b6b',
            'border-opacity': 1,
            'opacity': 1
          }
        },
        {
          selector: 'node.search-dimmed',
          style: {
            'opacity': 0.3
          }
        }
      ],
      layout: layoutConfigs[currentLayout as keyof typeof layoutConfigs],
      minZoom: 0.1,
      maxZoom: 3
    });

    cyRef.current = cy;

    // Handle node selection
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      const nodeData = node.data();
      
      if (onNodeSelect) {
        const graphNode: GraphNode = {
          id: nodeData.id,
          label: nodeData.label,
          type: nodeData.originalType,
          properties: nodeData.properties
        };
        onNodeSelect(graphNode);
      }
    });

    // Handle layout completion
    cy.on('layoutstop', () => {
      setIsLayoutRunning(false);
      if (onLayoutComplete) {
        onLayoutComplete(true);
      }
    });

    // Handle layout start
    cy.on('layoutstart', () => {
      setIsLayoutRunning(true);
      if (onLayoutComplete) {
        onLayoutComplete(false);
      }
    });

    // Track zoom and pan changes
    cy.on('zoom pan', () => {
      setZoom(cy.zoom());
      setPan(cy.pan());
    });

    // Provide center function to parent
    if (onCenterNode) {
      onCenterNode((nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) {
          cy.center(node);
          cy.fit(node, 100);
        }
      });
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [nodes, edges, visibleNodeTypes, currentLayout]); // Recreate when data, filters, or layout change

  // Handle callback registration without recreating the graph
  useEffect(() => {
    if (!cyRef.current) return;

    // Update event handlers
    cyRef.current.removeAllListeners('tap');
    cyRef.current.on('tap', 'node', (event) => {
      const node = event.target;
      const nodeData = node.data();

      if (onNodeSelect) {
        const graphNode: GraphNode = {
          id: nodeData.id,
          label: nodeData.label,
          type: nodeData.originalType,
          properties: nodeData.properties
        };
        onNodeSelect(graphNode);
      }
    });

    // Update center function
    if (onCenterNode) {
      onCenterNode((nodeId: string) => {
        if (!cyRef.current) return;
        const node = cyRef.current.getElementById(nodeId);
        if (node.length > 0) {
          cyRef.current.center(node);
          cyRef.current.fit(node, 100);
        }
      });
    }
  }, [onNodeSelect, onCenterNode]);

  // Update selected node styling
  useEffect(() => {
    if (!cyRef.current) return;

    // Clear previous selection
    cyRef.current.nodes().removeClass('selected');
    
    // Highlight selected node
    if (selectedNode) {
      const node = cyRef.current.getElementById(selectedNode.id);
      if (node.length > 0) {
        node.addClass('selected');
      }
    }
  }, [selectedNode]);

  // Handle search highlighting
  useEffect(() => {
    if (!cyRef.current) return;

    // Clear previous search highlighting
    cyRef.current.nodes().removeClass('search-highlighted');
    cyRef.current.nodes().removeClass('search-dimmed');

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      const matchingNodes = cyRef.current.nodes().filter((node) => {
        const nodeData = node.data();
        // Search in label
        if (nodeData.label.toLowerCase().includes(searchLower)) return true;
        // Search in type
        if (nodeData.type.toLowerCase().includes(searchLower)) return true;
        // Search in original type
        if (nodeData.originalType.toLowerCase().includes(searchLower)) return true;
        return false;
      });

      // Highlight matching nodes
      matchingNodes.addClass('search-highlighted');

      // Dim non-matching nodes
      const nonMatchingNodes = cyRef.current.nodes().difference(matchingNodes);
      nonMatchingNodes.addClass('search-dimmed');

      // Center on first matching node if any
      if (matchingNodes.length > 0) {
        cyRef.current.center(matchingNodes.first());
        cyRef.current.fit(matchingNodes, 100);
      }
    }
  }, [searchTerm]);

  // Update font styles when font settings change
  useEffect(() => {
    updateFontStyles();
  }, [fontSize, fontFamily]);

  // Update edge labels when connection label setting changes
  useEffect(() => {
    updateEdgeLabels();
  }, [showConnectionLabels]);

  // Handle viewport dragging
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingViewport(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleViewportMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingViewport || !cyRef.current) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // Convert mouse movement to pan coordinates
    const panDeltaX = -deltaX * zoom * 2;
    const panDeltaY = -deltaY * zoom * 2;

    const newPan = {
      x: pan.x + panDeltaX,
      y: pan.y + panDeltaY
    };

    cyRef.current.pan(newPan);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleViewportMouseUp = () => {
    setIsDraggingViewport(false);
  };

  // Add global mouse event listeners for viewport dragging
  React.useEffect(() => {
    if (isDraggingViewport) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!cyRef.current) return;

        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;

        const panDeltaX = -deltaX * zoom * 2;
        const panDeltaY = -deltaY * zoom * 2;

        const newPan = {
          x: pan.x + panDeltaX,
          y: pan.y + panDeltaY
        };

        cyRef.current.pan(newPan);
        setDragStart({ x: e.clientX, y: e.clientY });
      };

      const handleGlobalMouseUp = () => {
        setIsDraggingViewport(false);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDraggingViewport, dragStart, pan, zoom]);

  // Apply layout to selected nodes only
  const applyLayoutToSelected = () => {
    if (!cyRef.current) return;

    const selectedNodes = cyRef.current.nodes(':selected');
    if (selectedNodes.length === 0) {
      // If no nodes are selected, show a message or select all
      console.log('No nodes selected. Applying layout to all visible nodes.');
      cyRef.current.nodes().select();
      return;
    }

    // Get connected edges to selected nodes
    const connectedEdges = selectedNodes.connectedEdges();
    const layoutElements = selectedNodes.union(connectedEdges);

    // Apply layout only to selected elements
    const layout = layoutElements.layout(layoutConfigs[currentLayout as keyof typeof layoutConfigs]);
    layout.run();
  };

  // Apply layout to all nodes
  const applyLayoutToAll = () => {
    if (!cyRef.current) return;

    const layout = cyRef.current.layout(layoutConfigs[currentLayout as keyof typeof layoutConfigs]);
    layout.run();
  };

  // Change layout algorithm
  const changeLayout = (newLayout: string) => {
    setCurrentLayout(newLayout);
    // Layout will be applied when the component re-renders due to dependency change
  };

  // Update font styles
  const updateFontStyles = () => {
    if (!cyRef.current) return;

    cyRef.current.style()
      .selector('node')
      .style({
        'font-size': `${fontSize}px`,
        'font-family': fontFamily
      })
      .update();
  };

  // Update edge label visibility
  const updateEdgeLabels = () => {
    if (!cyRef.current) return;

    cyRef.current.style()
      .selector('edge')
      .style({
        'label': showConnectionLabels ? 'data(relationship)' : ''
      })
      .update();
  };

  return (
    <div className="relative w-full h-full" data-testid="cytoscape-container">
      {/* Loading overlay */}
      {isLayoutRunning && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Calculating graph layout...</p>
              <p className="text-xs text-muted-foreground">Using stable Cytoscape.js algorithm</p>
            </div>
          </div>
        </div>
      )}

      {/* Cytoscape container */}
      <div
        ref={containerRef}
        className="w-full h-full bg-background"
        style={{ minHeight: '400px' }}
        data-testid="cytoscape-graph"
      />

      {/* Mini-map / Zoom Window */}
      {isMiniMapVisible && cyRef.current && (
        <div className="absolute bottom-4 right-4 bg-surface rounded-lg border border-border p-2 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Overview</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMiniMapVisible(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="relative">
            <div
              className="border border-border/50 rounded bg-background/50 hover:bg-background/70 transition-colors"
              style={{
                width: '200px',
                height: '150px',
                cursor: 'crosshair',
                background: `radial-gradient(circle at ${50 + pan.x/10}% ${50 + pan.y/10}%, rgba(59, 130, 246, 0.1) 0%, transparent 70%)`
              }}
              onClick={(e) => {
                if (!cyRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width - 0.5) * 800;
                const y = ((e.clientY - rect.top) / rect.height - 0.5) * 600;
                cyRef.current.pan({ x: -x, y: -y });
              }}
            >
              {/* Viewport indicator */}
              <div
                className="absolute border-2 border-primary bg-primary/20 rounded cursor-move hover:bg-primary/30 transition-colors"
                style={{
                  left: `${Math.max(0, Math.min(85, 50 - (pan.x / zoom / 8)))}%`,
                  top: `${Math.max(0, Math.min(85, 50 - (pan.y / zoom / 8)))}%`,
                  width: `${Math.min(15, 100 / zoom)}%`,
                  height: `${Math.min(15, 100 / zoom)}%`,
                }}
                onMouseDown={handleViewportMouseDown}
                onMouseMove={handleViewportMouseMove}
                onMouseUp={handleViewportMouseUp}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1 text-center">
              Zoom: {zoom.toFixed(1)}x
            </div>
          </div>
        </div>
      )}

      {/* Layout Controls */}
      <div className="absolute top-4 left-4 space-y-2" data-testid="graph-controls">
        {/* Font Controls */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFontOptions(!showFontOptions)}
          className="bg-surface border-border hover:bg-accent shadow-sm"
          title="Font Options"
        >
          <span className="mr-1 font-bold text-sm flex items-center">Aa</span>
          Font: {fontFamily} {fontSize}px
        </Button>

        {showFontOptions && (
          <div className="bg-surface rounded-lg border border-border p-3 max-w-xs">
            <h4 className="text-sm font-medium text-foreground mb-3">Font Settings</h4>

            {/* Font Family Selection */}
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-foreground">Font Family</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-2 text-xs border border-border rounded bg-background text-foreground"
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size Selection */}
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-foreground">Font Size</span>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="8"
                  max="32"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-foreground w-8">{fontSize}px</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {fontSizeOptions.map((size) => (
                  <Button
                    key={size}
                    variant={fontSize === size ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFontSize(size)}
                    className="h-6 text-xs p-1"
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            {/* Font Preview */}
            <div className="pt-3 border-t border-border">
              <span className="text-xs font-medium text-foreground mb-2 block">Preview</span>
              <div
                className="p-2 border border-border rounded bg-background/50 text-center"
                style={{
                  fontFamily: fontFamily,
                  fontSize: `${fontSize}px`,
                  color: '#ffffff',
                  backgroundColor: '#374151'
                }}
              >
                Sample Node Text
              </div>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLayoutOptions(!showLayoutOptions)}
          className="bg-surface border-border hover:bg-accent shadow-sm"
          title="Layout Options"
        >
          <Activity className="h-3 w-3 mr-1" />
          Layout: {layoutNames[currentLayout as keyof typeof layoutNames]}
        </Button>

        {showLayoutOptions && (
          <div className="bg-surface rounded-lg border border-border p-3 max-w-xs">
            <h4 className="text-sm font-medium text-foreground mb-3">Layout Options</h4>

            {/* Layout Algorithm Selection */}
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-foreground">Algorithm</span>
              <div className="space-y-1">
                {Object.entries(layoutNames).map(([key, name]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id={`layout-${key}`}
                      name="layout"
                      checked={currentLayout === key}
                      onChange={() => changeLayout(key)}
                      className="w-3 h-3"
                    />
                    <label
                      htmlFor={`layout-${key}`}
                      className="text-xs text-foreground cursor-pointer flex-1"
                    >
                      {name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Layout Actions */}
            <div className="space-y-2 pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={applyLayoutToAll}
                className="w-full"
                title="Apply current layout to all visible nodes"
              >
                Apply to All Nodes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={applyLayoutToSelected}
                className="w-full"
                title="Apply current layout to selected nodes only"
              >
                Apply to Selected
              </Button>
            </div>

            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              <p>• Select nodes first, then "Apply to Selected"</p>
              <p>• Use Ctrl+Click to select multiple nodes</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsLegendVisible(!isLegendVisible)}
          className="mb-2 bg-surface border-border hover:bg-accent shadow-sm"
          title={isLegendVisible ? "Hide Legend" : "Show Legend"}
        >
          {isLegendVisible ? (
            <>
              <EyeOff className="h-3 w-3 mr-1" />
              Hide Legend
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" />
              Show Legend
            </>
          )}
        </Button>

        {/* Legend Content */}
        {isLegendVisible && (
          <div className="bg-surface rounded-lg border border-border p-4 max-w-xs">
            <h4 className="text-sm font-medium text-foreground mb-3">Graph Legend</h4>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Node Types</span>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleNodeTypes(Object.keys(CONTENT_NODE_TYPES))}
                    className="h-6 px-2 text-xs"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleNodeTypes([])}
                    className="h-6 px-2 text-xs"
                  >
                    None
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                {Object.entries(CONTENT_NODE_TYPES).map(([type, config]) => (
                  <div key={type} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`legend-${type}`}
                      checked={visibleNodeTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setVisibleNodeTypes(prev => [...prev, type]);
                        } else {
                          setVisibleNodeTypes(prev => prev.filter(t => t !== type));
                        }
                      }}
                      className="w-3 h-3"
                    />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                    <label
                      htmlFor={`legend-${type}`}
                      className="text-xs text-foreground cursor-pointer flex-1"
                    >
                      {config.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection Labels Toggle */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">Display Options</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="connection-labels"
                  checked={showConnectionLabels}
                  onChange={(e) => setShowConnectionLabels(e.target.checked)}
                  className="w-3 h-3"
                />
                <label
                  htmlFor="connection-labels"
                  className="text-xs text-foreground cursor-pointer flex-1"
                >
                  Show Connection Labels
                </label>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              <p>• Click nodes to select</p>
              <p>• Drag to pan around</p>
              <p>• Scroll to zoom in/out</p>
            </div>
          </div>
        )}
      </div>

      {/* Show mini-map toggle if hidden */}
      {!isMiniMapVisible && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMiniMapVisible(true)}
          className="absolute bottom-4 right-4 bg-surface border-border hover:bg-accent shadow-sm"
          title="Show Overview"
        >
          <Eye className="h-3 w-3 mr-1" />
          Overview
        </Button>
      )}
    </div>
  );
}
