/**
 * Connectivity Service
 * 
 * Manages connection to super nodes for NAT traversal.
 * - Connects to Active Proxy on super nodes
 * - Maintains persistent connection
 * - Handles reconnection on failure
 * 
 * Note: Full Active Proxy protocol implementation is complex.
 * This is a simplified version that:
 * 1. Uses direct HTTP for super nodes (when behind NAT, requires Active Proxy)
 * 2. Registers endpoint with Web Gateway
 * 3. Provides status monitoring
 */

import { logger } from '../../utils/logger.js';
import { UsernameService } from './UsernameService.js';
import { NetworkDetector, type NATType } from './NetworkDetector.js';

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

// Default super nodes
const DEFAULT_SUPER_NODES: SuperNode[] = [
  {
    id: 'J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E',
    address: '69.164.241.210',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://demo.ela.city',
  },
];

export class ConnectivityService {
  private config: ConnectivityConfig;
  private status: ConnectionStatus;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private usernameService: UsernameService | null = null;
  private nodeId: string | null = null;
  private isRunning: boolean = false;
  private networkDetector: NetworkDetector;

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
    
    if (this.config.privacyMode) {
      logger.info('🔒 Privacy mode enabled - will use Active Proxy');
      this.status.natType = 'relay';
    } else if (networkInfo.hasPublicIP) {
      logger.info(`📡 Direct public IP detected: ${networkInfo.publicIP}`);
      this.status.natType = 'direct';
    } else {
      logger.info(`🔀 Behind NAT (${networkInfo.natType}) - will use Active Proxy`);
      this.status.natType = networkInfo.natType === 'direct' ? 'direct' : 'relay';
    }

    // Attempt initial connection
    await this.connect();

    // Start heartbeat
    this.startHeartbeat();
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

    this.status.connected = false;
    logger.info('🔌 Connectivity service stopped');
  }

  /**
   * Connect to a super node
   */
  private async connect(): Promise<boolean> {
    for (const superNode of this.config.superNodes) {
      try {
        logger.info(`🔗 Attempting connection to super node: ${superNode.address}`);

        // Check if super node gateway is reachable
        const healthCheck = await this.checkGatewayHealth(superNode);
        
        if (healthCheck) {
          this.status.connected = true;
          this.status.superNode = superNode;
          this.status.connectedAt = new Date().toISOString();
          this.status.natType = 'direct'; // Simplified - assume direct for now

          // Register with gateway if username service is available
          if (this.usernameService && this.usernameService.hasUsername()) {
            await this.registerWithGateway(superNode);
          }

          logger.info(`✅ Connected to super node: ${superNode.address}`);
          return true;
        }
      } catch (error) {
        logger.warn(`Failed to connect to ${superNode.address}: ${error}`);
      }
    }

    logger.warn('⚠️ Could not connect to any super node');
    this.scheduleReconnect();
    return false;
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
