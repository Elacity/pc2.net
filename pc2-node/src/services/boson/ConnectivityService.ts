/**
 * Connectivity Service
 * 
 * Manages connection to super nodes for NAT traversal.
 * - Connects to Active Proxy on super nodes when behind NAT
 * - Maintains persistent connection for relay
 * - Handles reconnection on failure
 * - Supports direct mode for VPS/public IP deployments
 */

import { logger } from '../../utils/logger.js';
import { UsernameService } from './UsernameService.js';
import { NetworkDetector, type NATType } from './NetworkDetector.js';
import { ActiveProxyClient, ConnectionState, type ProxyConnection } from './ActiveProxyClient.js';
import { fromBase58 } from './IdentityService.js';
import net, { type Server, type Socket } from 'net';
import { request as httpRequest } from 'http';

export interface SuperNode {
  id: string;
  address: string;
  port: number;
  proxyPort: number;
  gatewayUrl: string;
}

export interface ConnectivityConfig {
  superNodes: SuperNode[];
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  localPort: number;
  privacyMode: boolean; // When true, always use Active Proxy even with public IP
}

export interface ConnectionStatus {
  connected: boolean;
  superNode: SuperNode | null;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  publicEndpoint: string | null;
  natType: 'direct' | 'upnp' | 'relay' | 'unknown';
}

// Default super nodes - multiple nodes for failover
// These are fallbacks; prefer dynamic discovery via fetchSuperNodes()
const DEFAULT_SUPER_NODES: SuperNode[] = [
  {
    id: 'J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E',
    address: '69.164.241.210',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://69.164.241.210',
  },
  // Contabo VPS - secondary node for failover
  {
    id: 'CONTABO_NODE_01',
    address: '38.242.211.112',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://38.242.211.112',
  },
];

// Well-known endpoint for dynamic supernode discovery
const SUPERNODE_DISCOVERY_URLS = [
  'https://demo.ela.city/api/supernodes',
  'https://api.ela.city/supernodes',
];

// Cache for discovered supernodes
let cachedSuperNodes: SuperNode[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the list of active supernodes from the network
 * Falls back to defaults if fetch fails
 */
export async function fetchSuperNodes(): Promise<SuperNode[]> {
  // Return cached if still valid
  if (cachedSuperNodes && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSuperNodes;
  }
  
  for (const url of SUPERNODE_DISCOVERY_URLS) {
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        const data = await response.json() as { supernodes: SuperNode[] };
        if (data.supernodes && data.supernodes.length > 0) {
          cachedSuperNodes = data.supernodes;
          cacheTimestamp = Date.now();
          logger.info(`[Connectivity] Discovered ${data.supernodes.length} supernodes from ${url}`);
          return data.supernodes;
        }
      }
    } catch (error) {
      logger.debug(`[Connectivity] Failed to fetch supernodes from ${url}: ${error}`);
    }
  }
  
  // Fallback to defaults
  logger.info('[Connectivity] Using default supernode list');
  return DEFAULT_SUPER_NODES;
}

export class ConnectivityService {
  private config: ConnectivityConfig;
  private status: ConnectionStatus;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private usernameService: UsernameService | null = null;
  private nodeId: string | null = null;
  private publicKey: Buffer | null = null;
  private privateKey: Buffer | null = null;
  private isRunning: boolean = false;
  private networkDetector: NetworkDetector;
  private activeProxyClient: ActiveProxyClient | null = null;
  private currentSuperNodeIndex: number = 0;
  private failedSuperNodes: Set<string> = new Set();
  private proxyConnections: Map<number, Socket> = new Map();

  constructor(config?: Partial<ConnectivityConfig>) {
    this.config = {
      superNodes: config?.superNodes || DEFAULT_SUPER_NODES,
      reconnectIntervalMs: config?.reconnectIntervalMs || 30000,
      heartbeatIntervalMs: config?.heartbeatIntervalMs || 60000,
      localPort: config?.localPort || 4200,
      privacyMode: config?.privacyMode || false,
    };
    
    this.networkDetector = new NetworkDetector();

    this.status = {
      connected: false,
      superNode: null,
      connectedAt: null,
      lastHeartbeat: null,
      publicEndpoint: null,
      natType: 'unknown',
    };
  }

  /**
   * Set node identity keys for Active Proxy authentication
   */
  setNodeKeys(publicKey: Buffer, privateKey: Buffer): void {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  /**
   * Set the username service for registration
   */
  setUsernameService(service: UsernameService): void {
    this.usernameService = service;
  }

  /**
   * Set node identity
   */
  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  /**
   * Start connectivity service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Connectivity service already running');
      return;
    }

    this.isRunning = true;
    logger.info('🌐 Starting connectivity service...');

    // Detect network configuration
    const networkInfo = await this.networkDetector.detect();
    
    const needsProxy = this.config.privacyMode || !networkInfo.hasPublicIP;
    
    if (this.config.privacyMode) {
      logger.info('🔒 Privacy mode enabled - will use Active Proxy');
      this.status.natType = 'relay';
    } else if (networkInfo.hasPublicIP) {
      logger.info(`📡 Direct public IP detected: ${networkInfo.publicIP}`);
      this.status.natType = 'direct';
    } else {
      logger.info(`🔀 Behind NAT (${networkInfo.natType}) - will use Active Proxy`);
      this.status.natType = 'relay';
    }

    // Attempt initial connection
    if (needsProxy && this.publicKey && this.privateKey && this.nodeId) {
      try {
        await this.connectViaActiveProxy();
      } catch (error) {
        logger.warn(`⚠️ Active Proxy connection failed: ${error}. Node will run in local-only mode.`);
        // Fall back to direct connection attempt
        await this.connect();
      }
    } else {
      await this.connect();
    }

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Connect via Active Proxy for NAT traversal
   * 
   * Phase 1 Optimization: Parallel supernode queries
   * Tries all supernodes simultaneously and uses the first successful connection.
   * This significantly reduces connection time when some supernodes are slow/down.
   */
  private async connectViaActiveProxy(): Promise<boolean> {
    const validSuperNodes = this.config.superNodes.filter(superNode => {
      try {
        const serverPublicKey = fromBase58(superNode.id);
        return serverPublicKey.length === 32;
      } catch {
        logger.warn(`[Connectivity] Invalid supernode ID '${superNode.id}', skipping`);
        return false;
      }
    });

    if (validSuperNodes.length === 0) {
      logger.error('No valid supernodes available');
      return false;
    }

    logger.info(`🔗 Connecting to Active Proxy (parallel: ${validSuperNodes.length} supernodes)...`);

    // Create connection attempts for all supernodes in parallel
    const connectionAttempts = validSuperNodes.map(superNode => 
      this.tryConnectToSuperNode(superNode)
    );

    // Race: use first successful connection
    try {
      const result = await Promise.any(connectionAttempts);
      if (result.success) {
        this.activeProxyClient = result.client;
        this.setupClientEventHandlers(result.superNode);
        return true;
      }
    } catch (error) {
      // All connections failed (Promise.any throws AggregateError)
      logger.warn('⚠️ All parallel supernode connections failed');
    }

    logger.warn('⚠️ Could not connect via Active Proxy to any super node');
    this.scheduleReconnect();
    return false;
  }

  /**
   * Try to connect to a single supernode
   * Returns a promise that resolves with connection result
   */
  private async tryConnectToSuperNode(superNode: SuperNode): Promise<{
    success: boolean;
    client: ActiveProxyClient | null;
    superNode: SuperNode;
  }> {
    const startTime = Date.now();
    
    try {
      logger.debug(`[Connectivity] Trying ${superNode.address}:${superNode.proxyPort}...`);

      const serverPublicKey = fromBase58(superNode.id);
      
      const client = new ActiveProxyClient({
        host: superNode.address,
        port: superNode.proxyPort,
        nodeId: this.nodeId!,
        publicKey: this.publicKey!,
        privateKey: this.privateKey!,
        serverPublicKey: serverPublicKey,
        localPort: this.config.localPort,
        keepaliveIntervalMs: 30000,
        reconnectIntervalMs: this.config.reconnectIntervalMs,
        maxReconnectAttempts: 10,
      });

      await client.connect();
      
      const elapsed = Date.now() - startTime;
      logger.info(`✅ Connected to ${superNode.address} in ${elapsed}ms`);
      
      return { success: true, client, superNode };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logger.debug(`[Connectivity] Failed to connect to ${superNode.address} after ${elapsed}ms: ${error}`);
      
      // Throw to signal failure to Promise.any
      throw error;
    }
  }

  /**
   * Set up event handlers for the active proxy client
   */
  private setupClientEventHandlers(superNode: SuperNode): void {
    if (!this.activeProxyClient) return;

    this.activeProxyClient.on('connected', (sessionId: string, allocatedPort: number) => {
      this.status.connected = true;
      this.status.superNode = superNode;
      this.status.connectedAt = new Date().toISOString();
      
      logger.info(`✅ Active Proxy connected! Session: ${sessionId}, Port: ${allocatedPort}`);
      
      // Register proxy endpoint with gateway
      this.registerProxyEndpoint(superNode, sessionId);
    });

    this.activeProxyClient.on('disconnected', (reason: string) => {
      logger.warn(`⚠️ Active Proxy disconnected: ${reason}`);
      this.status.connected = false;
    });

    this.activeProxyClient.on('error', (error: Error) => {
      logger.error(`❌ Active Proxy error: ${error.message}`);
    });

    this.activeProxyClient.on('connection', (conn: ProxyConnection) => {
      this.handleProxyConnection(conn);
    });

    this.activeProxyClient.on('data', (connectionId: number, data: Buffer) => {
      this.handleProxyData(connectionId, data);
    });

    this.activeProxyClient.on('connectionClosed', (connectionId: number) => {
      this.handleProxyConnectionClosed(connectionId);
    });
  }

  /**
   * Register proxy endpoint with the gateway
   */
  private async registerProxyEndpoint(superNode: SuperNode, sessionId: string): Promise<void> {
    if (!this.usernameService || !this.usernameService.hasUsername()) {
      logger.warn('No username registered, skipping proxy endpoint registration');
      return;
    }

    // Format: proxy://host:port/sessionId
    const endpoint = `proxy://${superNode.address}:${superNode.proxyPort}/${sessionId}`;
    
    const result = await this.usernameService.updateEndpoint(endpoint);
    
    if (result.success) {
      this.status.publicEndpoint = this.usernameService.getPublicUrl();
      logger.info(`📍 Registered proxy endpoint: ${this.status.publicEndpoint}`);
    } else {
      logger.warn(`Failed to register proxy endpoint: ${result.error}`);
    }
  }

  /**
   * Handle new proxied connection
   */
  private handleProxyConnection(conn: ProxyConnection): void {
    logger.info(`🔌 New proxied connection ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);

    // Create a local socket to the PC2 node
    const localSocket = new net.Socket();
    
    localSocket.connect(this.config.localPort, '127.0.0.1', () => {
      logger.debug(`[Proxy] Connected to local server for connection ${conn.connectionId}`);
      this.proxyConnections.set(conn.connectionId, localSocket);
    });

    localSocket.on('data', (data: Buffer) => {
      // Send response back through the proxy
      if (this.activeProxyClient) {
        this.activeProxyClient.sendData(conn.connectionId, data);
      }
    });

    localSocket.on('error', (error: Error) => {
      logger.error(`[Proxy] Local socket error for ${conn.connectionId}: ${error.message}`);
      this.proxyConnections.delete(conn.connectionId);
      if (this.activeProxyClient) {
        this.activeProxyClient.closeConnection(conn.connectionId);
      }
    });

    localSocket.on('close', () => {
      logger.debug(`[Proxy] Local socket closed for connection ${conn.connectionId}`);
      this.proxyConnections.delete(conn.connectionId);
      if (this.activeProxyClient) {
        this.activeProxyClient.closeConnection(conn.connectionId);
      }
    });
  }

  /**
   * Handle incoming data from proxy
   */
  private handleProxyData(connectionId: number, data: Buffer): void {
    const localSocket = this.proxyConnections.get(connectionId);
    
    if (localSocket) {
      try {
        localSocket.write(data);
      } catch (error) {
        logger.error(`[Proxy] Failed to write data to local socket: ${error}`);
      }
    } else {
      logger.warn(`[Proxy] No local socket for connection ${connectionId}`);
    }
  }

  /**
   * Handle proxy connection closed
   */
  private handleProxyConnectionClosed(connectionId: number): void {
    const localSocket = this.proxyConnections.get(connectionId);
    
    if (localSocket) {
      localSocket.destroy();
      this.proxyConnections.delete(connectionId);
    }
  }

  /**
   * Get Active Proxy client (for testing/debugging)
   */
  getActiveProxyClient(): ActiveProxyClient | null {
    return this.activeProxyClient;
  }
  
  /**
   * Get network detector for external access
   */
  getNetworkDetector(): NetworkDetector {
    return this.networkDetector;
  }
  
  /**
   * Check if privacy mode is enabled
   */
  isPrivacyMode(): boolean {
    return this.config.privacyMode;
  }

  /**
   * Stop connectivity service
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Stop Active Proxy client
    if (this.activeProxyClient) {
      await this.activeProxyClient.disconnect();
      this.activeProxyClient = null;
    }

    // Close all proxy connections
    for (const [connectionId, socket] of this.proxyConnections) {
      socket.destroy();
    }
    this.proxyConnections.clear();

    this.status.connected = false;
    logger.info('🔌 Connectivity service stopped');
  }

  /**
   * Connect to a super node with failover support
   */
  private async connect(): Promise<boolean> {
    const superNodes = this.config.superNodes;
    const totalNodes = superNodes.length;
    
    // Try each super node starting from current index
    for (let i = 0; i < totalNodes; i++) {
      const index = (this.currentSuperNodeIndex + i) % totalNodes;
      const superNode = superNodes[index];
      
      // Skip recently failed nodes (unless we've tried all)
      if (this.failedSuperNodes.has(superNode.id) && this.failedSuperNodes.size < totalNodes) {
        continue;
      }
      
      try {
        logger.info(`🔗 Attempting connection to super node ${index + 1}/${totalNodes}: ${superNode.address}`);

        // Check if super node gateway is reachable
        const healthCheck = await this.checkGatewayHealth(superNode);
        
        if (healthCheck) {
          this.status.connected = true;
          this.status.superNode = superNode;
          this.status.connectedAt = new Date().toISOString();
          this.status.natType = 'direct';
          this.currentSuperNodeIndex = index;
          
          // Clear this node from failed list on success
          this.failedSuperNodes.delete(superNode.id);

          // Register with gateway if username service is available
          if (this.usernameService && this.usernameService.hasUsername()) {
            await this.registerWithGateway(superNode);
          }

          logger.info(`✅ Connected to super node: ${superNode.address}`);
          return true;
        } else {
          this.markSuperNodeFailed(superNode);
        }
      } catch (error) {
        logger.warn(`Failed to connect to ${superNode.address}: ${error}`);
        this.markSuperNodeFailed(superNode);
      }
    }

    logger.warn('⚠️ Could not connect to any super node');
    this.scheduleReconnect();
    return false;
  }

  /**
   * Mark a super node as failed and move to next
   */
  private markSuperNodeFailed(superNode: SuperNode): void {
    this.failedSuperNodes.add(superNode.id);
    this.currentSuperNodeIndex = (this.currentSuperNodeIndex + 1) % this.config.superNodes.length;
    
    // Clear failed nodes periodically (every 5 minutes worth of failures)
    if (this.failedSuperNodes.size >= this.config.superNodes.length) {
      setTimeout(() => {
        this.failedSuperNodes.clear();
        logger.info('🔄 Cleared failed super node list for retry');
      }, 300000); // 5 minutes
    }
  }

  /**
   * Force failover to next super node
   */
  async failover(): Promise<boolean> {
    logger.info('🔄 Initiating failover to next super node...');
    
    if (this.status.superNode) {
      this.markSuperNodeFailed(this.status.superNode);
    }
    
    this.status.connected = false;
    
    // Stop current Active Proxy client
    if (this.activeProxyClient) {
      await this.activeProxyClient.disconnect();
      this.activeProxyClient = null;
    }
    
    return await this.connect();
  }

  /**
   * Check if gateway is healthy
   */
  private async checkGatewayHealth(superNode: SuperNode): Promise<boolean> {
    try {
      const response = await fetch(`${superNode.gatewayUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        return data.status === 'ok';
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Register this node's endpoint with the gateway
   */
  private async registerWithGateway(superNode: SuperNode): Promise<void> {
    if (!this.usernameService) return;

    let endpoint: string;
    
    if (this.status.natType === 'direct' && !this.config.privacyMode) {
      // Direct mode: Use public IP
      const networkInfo = await this.networkDetector.detect();
      if (networkInfo.publicIP) {
        endpoint = `http://${networkInfo.publicIP}:${this.config.localPort}`;
        logger.info(`📡 Direct mode: registering public IP endpoint`);
      } else {
        // Fallback to localhost
        endpoint = `http://127.0.0.1:${this.config.localPort}`;
        logger.warn('Could not detect public IP, using localhost');
      }
    } else {
      // NAT/Privacy mode: Use local endpoint (will be proxied via Active Proxy)
      // In full implementation, this would be: proxy://${superNode.address}:${superNode.proxyPort}/${sessionId}
      endpoint = `http://127.0.0.1:${this.config.localPort}`;
      logger.info(`🔒 Privacy/NAT mode: using proxied endpoint`);
    }
    
    const result = await this.usernameService.updateEndpoint(endpoint);
    
    if (result.success) {
      this.status.publicEndpoint = this.usernameService.getPublicUrl();
      logger.info(`📍 Registered endpoint: ${this.status.publicEndpoint}`);
    } else {
      logger.warn(`Failed to register endpoint: ${result.error}`);
    }
  }

  /**
   * Start heartbeat to maintain connection
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) return;

      if (this.status.connected && this.status.superNode) {
        const healthy = await this.checkGatewayHealth(this.status.superNode);
        
        if (healthy) {
          this.status.lastHeartbeat = new Date().toISOString();
        } else {
          logger.warn('⚠️ Lost connection to super node');
          this.status.connected = false;
          this.scheduleReconnect();
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.isRunning) return;

    logger.info(`🔄 Scheduling reconnect in ${this.config.reconnectIntervalMs / 1000}s`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, this.config.reconnectIntervalMs);
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status.connected;
  }

  /**
   * Get the current super node
   */
  getSuperNode(): SuperNode | null {
    return this.status.superNode;
  }

  /**
   * Get public endpoint URL
   */
  getPublicEndpoint(): string | null {
    return this.status.publicEndpoint;
  }

  /**
   * Force reconnection
   */
  async reconnect(): Promise<boolean> {
    this.status.connected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    return await this.connect();
  }
}
