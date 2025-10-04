import { Router, Request, Response } from 'express';
import { StorageService } from '../services/storageService.js';

const router = Router();

/**
 * GET /api/graph/nodes
 * Get all graph nodes
 */
router.get('/nodes', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const nodes = await storage.getGraphNodes();
    res.json(nodes);
  } catch (error: any) {
    console.error('Error getting graph nodes:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/graph/edges
 * Get all graph edges
 */
router.get('/edges', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const edges = await storage.getGraphEdges();
    res.json(edges);
  } catch (error: any) {
    console.error('Error getting graph edges:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/graph/search
 * Search graph nodes by label
 */
router.get('/search', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const query = req.query.q as string || '';
    const limit = parseInt(req.query.limit as string) || 50;
    
    const results = await storage.searchGraphNodes(query, limit);
    res.json(results);
  } catch (error: any) {
    console.error('Error searching graph nodes:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/graph/node-types
 * Get node type statistics
 */
router.get('/node-types', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const stats = await storage.getNodeTypeStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting node type stats:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * DELETE /api/graph/nodes/:id
 * Delete a graph node
 */
router.delete('/nodes/:id', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    const { id } = req.params;
    const cascade = req.query.cascade === 'true';
    
    const result = await storage.deleteGraphNode(id, cascade);
    
    res.json({
      success: true,
      deletedNodes: result.deletedNodes,
      deletedEdges: result.deletedEdges,
      message: `Successfully deleted node ${id}${cascade ? ' and connected nodes' : ''}`,
    });
  } catch (error: any) {
    console.error('Error deleting graph node:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

/**
 * GET /api/duplicates
 * Analyze duplicate nodes and edges
 */
router.get('/duplicates', async (req: Request, res: Response) => {
  const storage = StorageService.getInstance();
  
  try {
    // Get all nodes and edges
    const nodes = await storage.getGraphNodes();
    const edges = await storage.getGraphEdges();

    // Find duplicate nodes (same label + type)
    const nodeMap = new Map<string, any[]>();
    nodes.forEach(node => {
      const key = `${node.label}_${node.type}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, []);
      }
      nodeMap.get(key)!.push(node);
    });

    const nodeGroups = Array.from(nodeMap.entries())
      .filter(([_, items]) => items.length > 1)
      .map(([key, items]) => ({
        key,
        count: items.length,
        items: items.map(node => ({
          id: node.id,
          title: node.label,
          type: node.type,
          properties: node.properties,
        })),
      }));

    // Find duplicate edges (same source + target + relationship)
    const edgeMap = new Map<string, any[]>();
    edges.forEach(edge => {
      const key = `${edge.sourceId}_${edge.targetId}_${edge.relationship}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }
      edgeMap.get(key)!.push(edge);
    });

    const edgeGroups = Array.from(edgeMap.entries())
      .filter(([_, items]) => items.length > 1)
      .map(([key, items]) => ({
        key,
        count: items.length,
        items: items.map(edge => ({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relationship: edge.relationship,
          properties: edge.properties,
        })),
      }));

    const analysis = {
      nodeGroups,
      edgeGroups,
      summary: {
        duplicateNodeCount: nodeGroups.reduce((sum, group) => sum + group.count - 1, 0),
        duplicateEdgeCount: edgeGroups.reduce((sum, group) => sum + group.count - 1, 0),
        nodeGroupCount: nodeGroups.length,
        edgeGroupCount: edgeGroups.length,
      },
    };

    res.json({ data: analysis });
  } catch (error: any) {
    console.error('Error analyzing duplicates:', error);
    res.status(500).json({ error: error.message });
  } finally {
  }
});

export default router;

