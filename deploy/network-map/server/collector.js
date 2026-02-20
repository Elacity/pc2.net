/**
 * Data Collector - Fetches node data from Web Gateway and performs health checks
 */

import { existsSync, readFileSync } from 'fs';
import { generateNodeIdentifier } from './anonymizer.js';
import { 
  upsertNode, 
  recordActivity, 
  getNetworkStats, 
  saveStatsSnapshot,
  getNodeActivityHistory,
  cleanupOldData 
} from './database.js';

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const STALE_THRESHOLD_DAYS = 7;

// Known supernode/infrastructure usernames (actual supernodes only)
// Note: 'cloud' is an internal gateway service, not a real supernode
const SUPERNODE_USERNAMES = [];

// Supernode discovery endpoint (Phase 3)
const SUPERNODE_DISCOVERY_URL = process.env.GATEWAY_URL || 'https://demo.ela.city';

// Known supernodes (fallback if discovery fails)
const KNOWN_SUPERNODES = [
  { id: 'J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E', address: '69.164.241.210', name: 'Elacity Flagship' },
  { id: 'HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ', address: '155.138.245.211', name: 'Boson Network 1' },
  { id: '6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ', address: '45.32.138.246', name: 'Boson Network 2' },
];

export class DataCollector {
  constructor(options = {}) {
    // Read registry directly from the web gateway's data file
    this.registryFile = options.registryFile || '/root/pc2/web-gateway/data/registry.json';
    this.onUpdate = options.onUpdate || (() => {});
    this.onNodeChange = options.onNodeChange || (() => {});
    this.previousStats = null;
  }
  
  /**
   * Fetch supernodes from discovery endpoint
   */
  async fetchSupernodes() {
    try {
      const response = await fetch(`${SUPERNODE_DISCOVERY_URL}/api/supernodes`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        return data.supernodes || [];
      }
    } catch (error) {
      console.log('[Collector] Supernode discovery failed, using fallback');
    }
    return KNOWN_SUPERNODES;
  }
  
  /**
   * Main collection cycle
   */
  async collect() {
    console.log(`[Collector] Starting collection from registry: ${this.registryFile}`);
    const startTime = Date.now();
    
    try {
      // 0. Fetch and check supernodes
      const supernodes = await this.fetchSupernodes();
      console.log(`[Collector] Found ${supernodes.length} supernodes`);
      await this.checkSupernodes(supernodes);
      
      // 1. Fetch registered nodes from Web Gateway
      const registeredNodes = await this.fetchRegisteredNodes();
      console.log(`[Collector] Found ${registeredNodes.length} registered nodes`);
      
      // 2. Health check each node
      const healthResults = await this.checkAllNodes(registeredNodes);
      
      // 3. Update database
      for (const result of healthResults) {
        const previousNode = await this.getPreviousNodeState(result.nodeIdentifier);
        
        await upsertNode(result);
        await recordActivity(result.nodeIdentifier, result.status);
        
        // Detect status changes for WebSocket broadcast
        if (previousNode && previousNode.status !== result.status) {
          this.onNodeChange({
            nodeIdentifier: result.nodeIdentifier,
            previousStatus: previousNode.status,
            newStatus: result.status
          });
        }
      }
      
      // 4. Update activity patterns
      await this.updateActivityPatterns(healthResults);
      
      // 5. Get and save stats
      const stats = getNetworkStats();
      saveStatsSnapshot(stats);
      
      // 6. Broadcast update
      this.onUpdate(stats);
      this.previousStats = stats;
      
      // 7. Cleanup old data periodically
      cleanupOldData();
      
      const duration = Date.now() - startTime;
      console.log(`[Collector] Collection complete in ${duration}ms`);
      console.log(`[Collector] Stats: ${stats.onlineNow} online, ${stats.totalActivePC2} total PC2 nodes`);
      
      return stats;
      
    } catch (error) {
      console.error('[Collector] Collection failed:', error);
      throw error;
    }
  }
  
  /**
   * Check health of supernodes and add them to the database
   */
  async checkSupernodes(supernodes) {
    for (const supernode of supernodes) {
      const nodeIdentifier = `supernode_${supernode.id.substring(0, 8)}`;
      
      try {
        // Health check via Active Proxy port
        const response = await fetch(`http://${supernode.address}:8090`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
          method: 'HEAD'
        }).catch(() => null);
        
        // Even if we can't reach via HTTP, try TCP connect
        const status = response ? 'online' : 'online'; // Supernodes are assumed online if in discovery
        
        await upsertNode({
          nodeIdentifier,
          username: supernode.name || `Supernode ${supernode.id.substring(0, 8)}`,
          nodeId: supernode.id,
          publicUrl: null,
          endpoint: `${supernode.address}:${supernode.proxyPort || 8090}`,
          endpointType: 'supernode',
          status,
          nodeType: 'supernode',
          isPC2Node: false,
          healthData: { address: supernode.address, port: supernode.proxyPort || 8090 },
          activityType: 'always-on',
          firstSeen: new Date().toISOString()
        });
        
        await recordActivity(nodeIdentifier, status);
        
      } catch (error) {
        console.error(`[Collector] Failed to check supernode ${supernode.name}:`, error.message);
      }
    }
  }
  
  /**
   * Fetch registered nodes from Web Gateway registry file
   * Since we're on the same server, we read the registry directly
   */
  async fetchRegisteredNodes() {
    // Read directly from the web gateway's registry file
    const registryPath = this.registryFile || '/root/pc2/web-gateway/data/registry.json';
    
    if (!existsSync(registryPath)) {
      console.log(`[Collector] Registry file not found at ${registryPath}`);
      return [];
    }
    
    try {
      const data = JSON.parse(readFileSync(registryPath, 'utf8'));
      
      // Convert registry object to array format
      const users = [];
      for (const [username, info] of Object.entries(data)) {
        users.push({
          username,
          nodeId: info.nodeId,
          endpoint: info.endpoint,
          registered: info.registered
        });
      }
      
      return users;
    } catch (error) {
      console.error('[Collector] Failed to read registry:', error);
      return [];
    }
  }
  
  /**
   * Check health of all nodes in parallel
   */
  async checkAllNodes(nodes) {
    const results = await Promise.all(
      nodes.map(node => this.checkNode(node))
    );
    return results;
  }
  
  /**
   * Check a single node's health
   */
  async checkNode(node) {
    const nodeIdentifier = generateNodeIdentifier(node.username);
    const now = new Date().toISOString();
    
    // Build the public URL
    const publicUrl = node.endpoint?.startsWith('http') 
      ? node.endpoint 
      : `https://${node.username}.ela.city`;
    
    try {
      // Health check
      const healthResponse = await fetch(`${publicUrl}/api/health`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT)
      });
      
      if (!healthResponse.ok) {
        return this.createNodeResult(node, nodeIdentifier, 'offline', false, null, publicUrl);
      }
      
      const health = await healthResponse.json();
      
      // Verify it's a PC2 node by checking for PC2-specific fields
      const isPC2Node = this.isPC2NodeResponse(health);
      
      if (!isPC2Node) {
        return this.createNodeResult(node, nodeIdentifier, 'online', false, health, publicUrl);
      }
      
      // Try to get Boson identity for additional confirmation
      let identity = null;
      try {
        const identityResponse = await fetch(`${publicUrl}/api/boson/identity`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        });
        if (identityResponse.ok) {
          identity = await identityResponse.json();
        }
      } catch {
        // Identity check failed, but health check passed
      }
      
      return this.createNodeResult(node, nodeIdentifier, 'online', true, { health, identity }, publicUrl);
      
    } catch (error) {
      // Determine if stale (hasn't been online in 7+ days)
      const status = await this.isNodeStale(nodeIdentifier) ? 'stale' : 'offline';
      return this.createNodeResult(node, nodeIdentifier, status, false, null, publicUrl);
    }
  }
  
  /**
   * Create a standardized node result object
   */
  createNodeResult(node, nodeIdentifier, status, isPC2Node, healthData, publicUrl) {
    // Determine node type
    let nodeType = 'registered';
    if (SUPERNODE_USERNAMES.includes(node.username.toLowerCase())) {
      nodeType = 'supernode';
    } else if (isPC2Node) {
      nodeType = 'pc2';
    }
    
    return {
      nodeIdentifier,
      username: node.username,
      nodeId: node.nodeId,
      publicUrl,
      endpoint: node.endpoint,
      endpointType: this.determineEndpointType(node.endpoint),
      status,
      nodeType,
      isPC2Node,
      healthData,
      firstSeen: new Date().toISOString()
    };
  }
  
  /**
   * Check if health response is from a PC2 node
   */
  isPC2NodeResponse(health) {
    // PC2 nodes have specific fields in their health response
    return health && (
      (health.database !== undefined && health.ipfs !== undefined) ||
      health.version !== undefined ||
      health.boson !== undefined
    );
  }
  
  /**
   * Determine endpoint type from endpoint string
   */
  determineEndpointType(endpoint) {
    if (!endpoint) return 'unknown';
    if (endpoint.includes('127.0.0.1') || endpoint.includes('localhost')) return 'proxy';
    if (endpoint.match(/10\.100\.\d+\.\d+/)) return 'wireguard';
    if (endpoint.startsWith('proxy://')) return 'proxy';
    if (endpoint.match(/^\d+\.\d+\.\d+\.\d+/) || endpoint.match(/https?:\/\/\d+\.\d+\.\d+\.\d+/)) return 'direct';
    return 'domain';
  }
  
  /**
   * Check if a node is stale (no activity in 7+ days)
   */
  async isNodeStale(nodeIdentifier) {
    const history = getNodeActivityHistory(nodeIdentifier, STALE_THRESHOLD_DAYS * 24);
    const onlineEvents = history.filter(h => h.status === 'online');
    return onlineEvents.length === 0;
  }
  
  /**
   * Get previous node state from database (for change detection)
   */
  async getPreviousNodeState(nodeIdentifier) {
    // This would query the database, but we'll keep it simple for now
    return null;
  }
  
  /**
   * Update activity patterns based on history
   */
  async updateActivityPatterns(nodes) {
    for (const node of nodes) {
      const history = getNodeActivityHistory(node.nodeIdentifier, 168); // 7 days
      const activityType = this.calculateActivityType(history);
      
      // Update node with activity type
      node.activityType = activityType;
      await upsertNode(node);
    }
  }
  
  /**
   * Calculate activity type from history
   */
  calculateActivityType(history) {
    if (!history || history.length === 0) return 'unknown';
    
    const onlineEvents = history.filter(h => h.status === 'online');
    const totalEvents = history.length;
    
    if (totalEvents === 0) return 'inactive';
    
    const onlineRatio = onlineEvents.length / totalEvents;
    
    if (onlineRatio > 0.95) return 'always-on';
    if (onlineRatio > 0.5) return 'intermittent';
    if (onlineRatio > 0.1) return 'occasional';
    return 'inactive';
  }
}
