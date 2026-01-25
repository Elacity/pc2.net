/**
 * Nodes API - Public endpoints for node information
 * 
 * CRITICAL: All responses use anonymized node identifiers only.
 * Never expose: usernames, URLs, endpoints, IPs, timestamps
 */

import { Router } from 'express';
import { getPublicNodes, getPublicNode } from '../database.js';
import { isValidNodeIdentifier, toPublicNodeInfo } from '../anonymizer.js';

export function createNodesRouter() {
  const router = Router();
  
  /**
   * GET /api/nodes
   * List all PC2 nodes (anonymized)
   * 
   * Query params:
   * - status: filter by status (online, offline, stale)
   * - activityType: filter by activity (always-on, intermittent, occasional, inactive)
   * - limit: max results (default 100)
   */
  router.get('/', (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        activityType: req.query.activityType,
        limit: Math.min(parseInt(req.query.limit) || 100, 500)
      };
      
      const nodes = getPublicNodes(filters);
      
      res.json({
        nodes,
        count: nodes.length,
        // Never include: usernames, URLs, endpoints, timestamps
      });
      
    } catch (error) {
      console.error('Error fetching nodes:', error);
      res.status(500).json({ error: 'Failed to fetch nodes' });
    }
  });
  
  /**
   * GET /api/nodes/:nodeId
   * Get a specific node by anonymized identifier
   */
  router.get('/:nodeId', (req, res) => {
    try {
      const { nodeId } = req.params;
      
      if (!isValidNodeIdentifier(nodeId)) {
        return res.status(400).json({ error: 'Invalid node identifier format' });
      }
      
      const node = getPublicNode(nodeId);
      
      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }
      
      res.json({
        node: toPublicNodeInfo(node)
        // Never include: username, URL, endpoint, timestamps
      });
      
    } catch (error) {
      console.error('Error fetching node:', error);
      res.status(500).json({ error: 'Failed to fetch node' });
    }
  });
  
  return router;
}
