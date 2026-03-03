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
import { WireGuardService } from '../wireguard/WireGuardService.js';
import { AmneziaWGService } from '../wireguard/AmneziaWGService.js';
import { VLESSRealityService } from '../vless/VLESSRealityService.js';
import { fromBase58 } from './IdentityService.js';
import { execSync } from 'child_process';
import net, { type Server, type Socket } from 'net';
import https from 'https';
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
  natType: 'direct' | 'upnp' | 'relay' | 'wireguard' | 'amnezia-wireguard' | 'vless-reality' | 'unknown';
  stealthMode: boolean;
  forcedTransport: 'amnezia-wireguard' | 'vless-reality' | null;
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

// Well-known endpoints for dynamic supernode discovery.
// Each gateway exposes /api/supernodes, so we query the known supernodes themselves.
const SUPERNODE_DISCOVERY_URLS = [
  'https://69.164.241.210/api/supernodes',
  'https://38.242.211.112/api/supernodes',
];

// Cache for discovered supernodes
let cachedSuperNodes: SuperNode[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch JSON from an HTTPS URL, tolerating self-signed certs
 * (supernodes serve HTTPS on raw IPs with self-signed certificates).
 */
function httpsGetJson<T>(url: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body) as T); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export async function fetchSuperNodes(): Promise<SuperNode[]> {
  if (cachedSuperNodes && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSuperNodes;
  }
  
  for (const url of SUPERNODE_DISCOVERY_URLS) {
    try {
      const data = await httpsGetJson<{ supernodes: SuperNode[] }>(url);
      if (data.supernodes && data.supernodes.length > 0) {
        cachedSuperNodes = data.supernodes;
        cacheTimestamp = Date.now();
        logger.info(`[Connectivity] Discovered ${data.supernodes.length} supernodes from ${url}`);
        return data.supernodes;
      }
    } catch (error) {
      logger.debug(`[Connectivity] Failed to fetch supernodes from ${url}: ${error}`);
    }
  }
  
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
  private wireGuardService: WireGuardService | null = null;
  private amneziaWGService: AmneziaWGService | null = null;
  private vlessRealityService: VLESSRealityService | null = null;
  private wireGuardRetryTimer: NodeJS.Timeout | null = null;
  private wireGuardRetryAttempts: number = 0;
  private wgBlockedByDPI: boolean = false;
  private stealthMode: boolean = false;
  private forcedTransport: 'amnezia-wireguard' | 'vless-reality' | null = null;
  private lastGatewayIP: string | null = null;
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
      stealthMode: false,
      forcedTransport: null,
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
   * Set WireGuard service for high-performance NAT traversal
   */
  setWireGuardService(service: WireGuardService): void {
    this.wireGuardService = service;
  }

  setAmneziaWGService(service: AmneziaWGService): void {
    this.amneziaWGService = service;
  }

  setVLESSRealityService(service: VLESSRealityService): void {
    this.vlessRealityService = service;
  }

  async setStealthMode(enabled: boolean, forceTransport?: 'amnezia-wireguard' | 'vless-reality'): Promise<void> {
    const wasEnabled = this.stealthMode;
    this.stealthMode = enabled;
    this.forcedTransport = forceTransport || null;

    if (!this.isRunning || (enabled === wasEnabled && !forceTransport)) return;

    if (enabled) {
      logger.info(`🔒 Stealth mode activated${forceTransport ? ` (forced: ${forceTransport})` : ''}`);
      // Disconnect current transports
      if (this.wireGuardService?.isConnected()) {
        await this.wireGuardService.disconnect();
      }
      if (this.vlessRealityService?.isConnected()) {
        await this.vlessRealityService.disconnect();
      }
      if (this.amneziaWGService?.isConnected()) {
        await this.amneziaWGService.disconnect();
      }

      // Force VLESS Reality (Tier 3): AWG over VLESS tunnel
      if (forceTransport === 'vless-reality' && this.vlessRealityService?.isAvailable() && this.amneziaWGService?.isAvailable()) {
        const ok = await this.connectViaVLESSReality();
        if (ok) {
          logger.info('🛡️ Stealth mode: connected via VLESS Reality (TCP stealth)');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }
        logger.warn('⚠️ Forced VLESS Reality failed, falling back to ActiveProxy');
        this.fallbackToActiveProxy();
        return;
      }

      // Default stealth: try AWG direct first, then VLESS Reality
      if (this.amneziaWGService && this.amneziaWGService.isAvailable()) {
        const ok = await this.connectViaAmneziaWG();
        if (ok) {
          logger.info('🕵️ Stealth mode: now connected via AmneziaWG');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }

        if (this.vlessRealityService?.isAvailable()) {
          const vlessOk = await this.connectViaVLESSReality();
          if (vlessOk) {
            logger.info('🛡️ Stealth mode: connected via VLESS Reality (TCP stealth)');
            if (this.activeProxyClient) {
              await this.activeProxyClient.disconnect();
              this.activeProxyClient = null;
            }
            return;
          }
        }
      }
      logger.warn('⚠️ Stealth mode: stealth transports unavailable, falling back to ActiveProxy');
      this.fallbackToActiveProxy();
    } else {
      logger.info('🔓 Stealth mode deactivated -- switching back to WireGuard');
      // Disconnect AmneziaWG and VLESS Reality if active
      if (this.vlessRealityService?.isConnected()) {
        await this.vlessRealityService.disconnect();
      }
      if (this.amneziaWGService?.isConnected()) {
        await this.amneziaWGService.disconnect();
      }
      this.wgBlockedByDPI = false;
      // Reconnect via WireGuard
      if (this.wireGuardService && this.wireGuardService.isAvailable()) {
        const ok = await this.connectViaWireGuard();
        if (ok) {
          logger.info('🚀 Stealth mode off: reconnected via WireGuard');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }
      }
      logger.warn('⚠️ WireGuard unavailable after disabling stealth, falling back');
      this.fallbackToActiveProxy();
    }
  }

  /**
   * Attempt to connect via WireGuard tunnel.
   * Returns true if the tunnel is established and the endpoint is registered.
   */
  private async connectViaWireGuard(): Promise<boolean> {
    if (!this.wireGuardService || !this.wireGuardService.isAvailable()) {
      return false;
    }

    if (!this.usernameService || !this.usernameService.hasUsername()) {
      logger.debug('[WireGuard] No username registered, skipping WireGuard');
      return false;
    }

    try {
      logger.info('[Connectivity] Attempting WireGuard tunnel...');
      await this.wireGuardService.connect();

      const wgIP = this.wireGuardService.getAssignedIP();
      if (!wgIP) {
        throw new Error('No IP assigned after WireGuard connect');
      }

      // Register the WireGuard IP as a direct HTTP endpoint with the gateway
      const endpoint = `http://${wgIP}:${this.config.localPort}`;
      const result = await this.usernameService.updateEndpoint(endpoint);

      if (result.success) {
        this.status.connected = true;
        this.status.natType = 'wireguard';
        this.status.publicEndpoint = this.usernameService.getPublicUrl();
        this.status.connectedAt = new Date().toISOString();
        this.wireGuardRetryAttempts = 0;
        logger.info(`[Connectivity] WireGuard tunnel active: ${endpoint}`);
        logger.info(`[Connectivity] Public URL: ${this.status.publicEndpoint}`);

        const serverIP = this.wireGuardService.getServerIP();
        if (serverIP) {
          this.wireGuardService.setOnTunnelDown(() => this.handleWireGuardDown());
          this.wireGuardService.startHealthCheck(serverIP);
        }
        return true;
      }

      logger.warn(`[Connectivity] WireGuard connected but endpoint registration failed: ${result.error}`);
      return false;
    } catch (error) {
      logger.warn(`[Connectivity] WireGuard failed: ${error}`);
      return false;
    }
  }

  /**
   * Attempt to connect via AmneziaWG stealth tunnel.
   * Used when standard WireGuard is blocked by DPI or stealth mode is enabled.
   */
  private async connectViaAmneziaWG(): Promise<boolean> {
    if (!this.amneziaWGService || !this.amneziaWGService.isAvailable()) {
      return false;
    }

    if (!this.usernameService || !this.usernameService.hasUsername()) {
      logger.debug('[AmneziaWG] No username registered, skipping');
      return false;
    }

    try {
      logger.info('[Connectivity] Attempting AmneziaWG stealth tunnel...');
      await this.amneziaWGService.connect();

      const awgIP = this.amneziaWGService.getAssignedIP();
      if (!awgIP) {
        throw new Error('No IP assigned after AmneziaWG connect');
      }

      const endpoint = `http://${awgIP}:${this.config.localPort}`;
      const result = await this.usernameService.updateEndpoint(endpoint);

      if (!result.success) {
        logger.warn(`[Connectivity] AmneziaWG tunnel up but endpoint registration failed -- continuing anyway: ${result.error}`);
      }

      this.status.connected = true;
      this.status.natType = 'amnezia-wireguard';
      this.status.publicEndpoint = this.usernameService.getPublicUrl();
      this.status.connectedAt = new Date().toISOString();
      logger.info(`[Connectivity] AmneziaWG stealth tunnel active: ${endpoint}`);
      logger.info(`[Connectivity] Public URL: ${this.status.publicEndpoint}`);

      const serverIP = this.amneziaWGService.getServerIP();
      if (serverIP) {
        this.amneziaWGService.setOnTunnelDown(() => this.handleAmneziaWGDown());
        this.amneziaWGService.startHealthCheck(serverIP);
      }
      return true;
    } catch (error) {
      logger.warn(`[Connectivity] AmneziaWG failed: ${error}`);
      return false;
    }
  }

  /**
   * Attempt VLESS Reality + AmneziaWG chained tunnel (Tier 3).
   * Wraps AWG traffic inside a VLESS Reality TLS tunnel for TCP-based stealth
   * when all UDP is blocked. DPI sees HTTPS to www.microsoft.com.
   */
  private async connectViaVLESSReality(): Promise<boolean> {
    if (!this.vlessRealityService || !this.vlessRealityService.isAvailable()) {
      return false;
    }
    if (!this.amneziaWGService || !this.amneziaWGService.isAvailable()) {
      return false;
    }
    if (!this.usernameService || !this.usernameService.hasUsername()) {
      return false;
    }

    try {
      logger.info('[Connectivity] Attempting VLESS Reality + AmneziaWG chained tunnel...');
      await this.vlessRealityService.connect();

      const localPort = this.vlessRealityService.getTunnelLocalPort();
      const endpointOverride = `127.0.0.1:${localPort}`;
      await this.amneziaWGService.connect(undefined, { endpointOverride });

      const awgIP = this.amneziaWGService.getAssignedIP();
      if (!awgIP) {
        throw new Error('No IP assigned after AWG-over-VLESS connect');
      }

      const endpoint = `http://${awgIP}:${this.config.localPort}`;
      const result = await this.usernameService.updateEndpoint(endpoint);

      if (!result.success) {
        logger.warn('[Connectivity] VLESS Reality tunnel up but endpoint registration failed -- continuing anyway (AWG IP unchanged)');
      }

      this.status.connected = true;
      this.status.natType = 'vless-reality';
      this.status.publicEndpoint = this.usernameService.getPublicUrl();
      this.status.connectedAt = new Date().toISOString();
      logger.info(`[Connectivity] VLESS Reality chained tunnel active: ${endpoint}`);

      const serverIP = this.amneziaWGService.getServerIP();
      if (serverIP) {
        this.amneziaWGService.setOnTunnelDown(() => this.handleVLESSRealityDown());
        this.amneziaWGService.startHealthCheck(serverIP);
      }
      this.vlessRealityService.startHealthCheck();
      return true;
    } catch (error) {
      logger.warn(`[Connectivity] VLESS Reality chained tunnel failed: ${error}`);
      try { await this.amneziaWGService?.disconnect(); } catch {}
      try { await this.vlessRealityService?.disconnect(); } catch {}
      return false;
    }
  }

  private handleVLESSRealityDown(): void {
    logger.warn('[Connectivity] VLESS Reality tunnel down');
    this.status.connected = false;
    this.status.natType = 'unknown';
    try { this.vlessRealityService?.disconnect(); } catch {}
    this.fallbackToActiveProxy();
    this.scheduleWireGuardRetry();
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

    // Try dynamic supernode discovery to get the latest list.
    // Falls back to config-provided or hardcoded defaults.
    try {
      const discovered = await fetchSuperNodes();
      if (discovered.length > 0) {
        this.config.superNodes = discovered;
      }
    } catch {
      logger.debug('[Connectivity] Dynamic supernode discovery unavailable, using configured list');
    }

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

    // Three-tier transport cascade: WireGuard > AmneziaWG > ActiveProxy
    if (needsProxy) {
      let connected = false;

      // Stealth mode skips standard WireGuard entirely
      if (!this.stealthMode) {
        if (this.wireGuardService && this.wireGuardService.isAvailable()) {
          connected = await this.connectViaWireGuard();
          if (connected) {
            logger.info('🚀 Connected via WireGuard tunnel (high-performance mode)');
          } else {
            this.wgBlockedByDPI = true;
            logger.info('[Connectivity] WireGuard failed, flagging potential DPI block');
          }
        }
      } else {
        logger.info('🔒 Stealth mode enabled - skipping standard WireGuard');
      }

      // Tier 2: AmneziaWG stealth tunnel (fallback or primary in stealth mode)
      if (!connected && this.amneziaWGService && this.amneziaWGService.isAvailable()) {
        connected = await this.connectViaAmneziaWG();
        if (connected) {
          logger.info('🕵️ Connected via AmneziaWG stealth tunnel (DPI-resistant)');
        }
      }

      // Tier 3: VLESS Reality + AmneziaWG chained (TCP stealth when all UDP blocked)
      if (!connected && this.vlessRealityService?.isAvailable() && this.amneziaWGService?.isAvailable()) {
        connected = await this.connectViaVLESSReality();
        if (connected) {
          logger.info('🛡️ Connected via VLESS Reality chained tunnel (TCP stealth)');
        }
      }

      // Tier 4: Boson ActiveProxy
      if (!connected && this.publicKey && this.privateKey && this.nodeId) {
        try {
          await this.connectViaActiveProxy();
        } catch (error) {
          logger.warn(`⚠️ Active Proxy connection failed: ${error}. Will retry via heartbeat.`);
          await this.connect();
        }
      } else if (!connected) {
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
      if (!superNode.address || !superNode.proxyPort) {
        logger.warn(`[Connectivity] Invalid supernode config (missing address/port), skipping`);
        return false;
      }
      // Validate server public key for CryptoBox handshake
      try {
        const serverPublicKey = fromBase58(superNode.id);
        if (serverPublicKey.length !== 32) {
          logger.warn(`[Connectivity] Invalid supernode ID length for '${superNode.id}', skipping`);
          return false;
        }
      } catch {
        logger.warn(`[Connectivity] Invalid supernode ID '${superNode.id}', skipping`);
        return false;
      }
      return true;
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
        // 'connected' handler was set up pre-connect() in tryConnectToSuperNode().
        // Set up remaining runtime handlers (disconnected, data, connection, etc.)
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
      
      // Pass domain (username) so the server registers the nginx virtual host
      const domain = this.usernameService?.getUsername() ?? undefined;
      logger.info(`[Connectivity] Username service available: ${!!this.usernameService}, hasUsername: ${this.usernameService?.hasUsername()}, domain: ${domain || '(none)'}`);

      const client = new ActiveProxyClient({
        host: superNode.address,
        port: superNode.proxyPort,
        nodeId: this.nodeId!,
        publicKey: this.publicKey!,
        privateKey: this.privateKey!,
        serverPublicKey: serverPublicKey,
        localPort: this.config.localPort,
        domain,
        keepaliveIntervalMs: 30000,
        reconnectIntervalMs: this.config.reconnectIntervalMs,
        maxReconnectAttempts: 10,
      });

      // Register endpoint on 'connected' event BEFORE connect() resolves.
      // connect() emits 'connected' during AUTH_ACK processing; if we wait
      // until after connect() resolves, the event is already consumed by once().
      client.on('connected', (sessionId: string, allocatedPort: number) => {
        this.status.connected = true;
        this.status.superNode = superNode;
        this.status.connectedAt = new Date().toISOString();
        logger.info(`✅ Active Proxy connected! Session: ${sessionId}, Allocated Port: ${allocatedPort}`);
        this.registerProxyEndpoint(superNode, sessionId, allocatedPort);
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
   * Set up runtime event handlers for the active proxy client.
   * 
   * Note: The 'connected' event handler is registered in tryConnectToSuperNode()
   * BEFORE client.connect() so it fires during AUTH_ACK processing. This method
   * sets up remaining handlers that fire after connection is established.
   */
  private setupClientEventHandlers(superNode: SuperNode): void {
    if (!this.activeProxyClient) return;

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
   * 
   * Uses the allocatedPort from Boson's AUTH_ACK (e.g., 25001) instead of the
   * static proxyPort (8090). The allocated port is where the gateway should
   * send ATTACH packets for relay connections.
   * 
   * Skips registration if WireGuard is the active transport -- Active Proxy
   * must not overwrite a working WireGuard endpoint.
   */
  private async registerProxyEndpoint(superNode: SuperNode, sessionId: string, allocatedPort: number): Promise<void> {
    if (!this.usernameService || !this.usernameService.hasUsername()) {
      logger.warn('No username registered, skipping proxy endpoint registration');
      return;
    }

    if (this.status.natType === 'wireguard' && this.status.connected) {
      logger.info(`[Connectivity] WireGuard is active -- skipping Active Proxy endpoint registration`);
      return;
    }

    const endpoint = `proxy://${superNode.address}:${allocatedPort}/${sessionId}`;
    logger.info(`[Connectivity] Registering proxy endpoint with allocated port ${allocatedPort} (not static ${superNode.proxyPort})`);
    
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
    
    // Register immediately so data arriving before connect completes can be buffered
    // Node.js net.Socket buffers writes before connection is established
    this.proxyConnections.set(conn.connectionId, localSocket);
    
    localSocket.connect(this.config.localPort, '127.0.0.1', () => {
      logger.debug(`[Proxy] Connected to local server for connection ${conn.connectionId}`);
    });

    // Auto-close idle relay connections. The Boson protocol handles one connection
    // at a time — if HTTP keep-alive holds this socket open, all other browser
    // requests queue indefinitely on the allocated port. 15s is enough for any
    // single HTTP response while preventing keep-alive from blocking the relay.
    localSocket.setTimeout(15000);
    localSocket.on('timeout', () => {
      logger.debug(`[Proxy] Local socket idle timeout for connection ${conn.connectionId}, closing to free relay`);
      localSocket.destroy();
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

    if (this.wireGuardRetryTimer) {
      clearTimeout(this.wireGuardRetryTimer);
      this.wireGuardRetryTimer = null;
    }

    // Stop WireGuard tunnel
    if (this.wireGuardService && this.wireGuardService.isConnected()) {
      await this.wireGuardService.disconnect();
    }

    // Stop AmneziaWG tunnel
    if (this.amneziaWGService?.isConnected()) {
      await this.amneziaWGService.disconnect();
    }

    // Stop VLESS Reality tunnel
    if (this.vlessRealityService?.isConnected()) {
      await this.vlessRealityService.disconnect();
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
          // IMPORTANT: Do NOT overwrite natType if already set to 'relay'.
          // A NAT node that falls back to direct gateway check is still behind NAT
          // and should not register with an unreachable public IP.
          if (this.status.natType !== 'relay') {
            this.status.natType = 'direct';
          }
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
   * 
   * Only registers direct HTTP endpoints for nodes with verified public IPs.
   * NAT nodes should NOT register here - they register via registerProxyEndpoint()
   * when ActiveProxy connects and provides an allocated port.
   */
  private async registerWithGateway(superNode: SuperNode): Promise<void> {
    if (!this.usernameService) return;

    let endpoint: string;
    
    if (this.status.natType === 'direct' && !this.config.privacyMode) {
      // Direct mode: Use public IP (VPS users with actual public IPs)
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
      // NAT/Privacy mode: Do NOT register an unreachable public IP.
      // ActiveProxy will handle registration via registerProxyEndpoint() when connected.
      // If ActiveProxy failed, registering a public IP that's behind NAT is useless
      // and causes "Bad Gateway" / "ETIMEDOUT" errors for other users.
      logger.info(`🔒 NAT/Privacy mode: skipping direct endpoint registration (waiting for Active Proxy)`);
      return;
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

      // Detect network changes (WiFi switch, location change) by monitoring default gateway
      this.checkNetworkChange();

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
   * Detect network changes by monitoring the default gateway IP.
   * When a laptop moves between WiFi networks, the gateway changes.
   * This triggers an immediate reconnection instead of waiting for
   * health check timeouts (~90s for WireGuard).
   */
  private checkNetworkChange(): void {
    try {
      const cmd = process.platform === 'darwin'
        ? "route -n get default 2>/dev/null | awk '/gateway:/{print $2}'"
        : "ip route show default 2>/dev/null | awk '/default/{print $3}'";
      const currentGateway = execSync(cmd, { stdio: 'pipe', shell: '/bin/sh', timeout: 3000 }).toString().trim();

      if (!currentGateway) return;

      if (this.lastGatewayIP && this.lastGatewayIP !== currentGateway) {
        logger.info(`[Network] Gateway changed: ${this.lastGatewayIP} → ${currentGateway} -- triggering reconnect`);
        this.networkDetector.clearCache();
        this.wgBlockedByDPI = false;

        if (this.vlessRealityService?.isConnected()) {
          this.vlessRealityService.disconnect().catch(() => {});
        }
        if (this.amneziaWGService?.isConnected()) {
          this.amneziaWGService.disconnect().catch(() => {});
          this.handleAmneziaWGDown();
        } else if (this.wireGuardService?.isConnected()) {
          this.wireGuardService.disconnect().catch(() => {});
          this.handleWireGuardDown();
        } else if (this.status.connected) {
          this.status.connected = false;
          this.scheduleReconnect();
        }
      }

      this.lastGatewayIP = currentGateway;
    } catch {
      // Network detection failed -- not critical
    }
  }

  /**
   * Schedule reconnection attempt.
   * Priority: WireGuard > ActiveProxy > direct.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.isRunning) return;

    logger.info(`🔄 Scheduling reconnect in ${this.config.reconnectIntervalMs / 1000}s`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      // Try WireGuard first (skip if DPI blocked or stealth mode)
      if (!this.stealthMode && !this.wgBlockedByDPI && this.wireGuardService && this.wireGuardService.isAvailable()) {
        const wgConnected = await this.connectViaWireGuard();
        if (wgConnected) {
          logger.info('🚀 Reconnected via WireGuard tunnel');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }
      }

      // Try AmneziaWG stealth tunnel
      if (this.amneziaWGService && this.amneziaWGService.isAvailable()) {
        const awgConnected = await this.connectViaAmneziaWG();
        if (awgConnected) {
          logger.info('🕵️ Reconnected via AmneziaWG stealth tunnel');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }
      }

      // Try VLESS Reality chained tunnel
      if (this.vlessRealityService?.isAvailable() && this.amneziaWGService?.isAvailable()) {
        const vlessConnected = await this.connectViaVLESSReality();
        if (vlessConnected) {
          logger.info('🛡️ Reconnected via VLESS Reality chained tunnel');
          if (this.activeProxyClient) {
            await this.activeProxyClient.disconnect();
            this.activeProxyClient = null;
          }
          return;
        }
      }
      
      // Fall back to ActiveProxy for NAT nodes
      if ((this.status.natType === 'relay' || this.status.natType === 'unknown') && this.publicKey && this.privateKey && this.nodeId) {
        try {
          logger.info('🔄 Retrying Active Proxy connection...');
          await this.connectViaActiveProxy();
          return;
        } catch (error) {
          logger.warn(`⚠️ Active Proxy reconnect failed: ${error}. Falling back to direct.`);
        }
      }
      
      await this.connect();
    }, this.config.reconnectIntervalMs);
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return { ...this.status, stealthMode: this.stealthMode, forcedTransport: this.forcedTransport };
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
   * Called by WireGuardService when the tunnel is declared dead after
   * consecutive health check failures. Falls back to Boson immediately
   * and schedules a background WireGuard retry with exponential backoff.
   */
  private handleWireGuardDown(): void {
    logger.warn('⚠️ WireGuard tunnel lost -- falling back to AmneziaWG/Boson');
    this.status.connected = false;
    this.status.natType = 'unknown';
    this.wgBlockedByDPI = true;

    // Cascade: AWG > VLESS Reality > ActiveProxy
    if (this.amneziaWGService && this.amneziaWGService.isAvailable()) {
      this.connectViaAmneziaWG().then((ok) => {
        if (ok) {
          logger.info('🕵️ Fell back to AmneziaWG stealth tunnel after WireGuard loss');
        } else if (this.vlessRealityService?.isAvailable()) {
          return this.connectViaVLESSReality().then((vlessOk) => {
            if (vlessOk) {
              logger.info('🛡️ Fell back to VLESS Reality after WireGuard + AWG loss');
            } else {
              this.fallbackToActiveProxy();
            }
          });
        } else {
          this.fallbackToActiveProxy();
        }
      }).catch(() => {
        this.fallbackToActiveProxy();
      });
    } else {
      this.fallbackToActiveProxy();
    }

    // Schedule a background WireGuard retry with exponential backoff
    this.wireGuardRetryAttempts = 0;
    this.scheduleWireGuardRetry();
  }

  private handleAmneziaWGDown(): void {
    logger.warn('⚠️ AmneziaWG stealth tunnel lost');
    this.status.connected = false;
    this.status.natType = 'unknown';

    // Try VLESS Reality chaining before falling to ActiveProxy
    if (this.vlessRealityService?.isAvailable() && this.amneziaWGService?.isAvailable()) {
      this.connectViaVLESSReality().then((ok) => {
        if (ok) {
          logger.info('🛡️ Recovered via VLESS Reality chained tunnel');
        } else {
          this.fallbackToActiveProxy();
        }
      }).catch(() => {
        this.fallbackToActiveProxy();
      });
    } else {
      this.fallbackToActiveProxy();
    }

    this.wireGuardRetryAttempts = 0;
    this.scheduleWireGuardRetry();
  }

  private fallbackToActiveProxy(): void {
    if (this.publicKey && this.privateKey && this.nodeId) {
      this.connectViaActiveProxy().then((ok) => {
        if (ok) {
          logger.info('🔄 Fell back to Boson Active Proxy');
        } else {
          this.scheduleReconnect();
        }
      }).catch(() => {
        this.scheduleReconnect();
      });
    } else {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a WireGuard reconnect attempt with exponential backoff.
   * Starts at 15s, doubles each attempt, caps at 5 minutes.
   * Keeps retrying indefinitely until the tunnel is re-established or the service stops.
   */
  private scheduleWireGuardRetry(): void {
    if (this.wireGuardRetryTimer) clearTimeout(this.wireGuardRetryTimer);
    if (!this.isRunning) return;

    const WG_RETRY_BASE_MS = 15_000;
    const WG_RETRY_MAX_MS = 300_000;
    const delayMs = Math.min(WG_RETRY_BASE_MS * (2 ** this.wireGuardRetryAttempts), WG_RETRY_MAX_MS);

    logger.info(`[Connectivity] Transport upgrade retry scheduled in ${delayMs / 1000}s (attempt ${this.wireGuardRetryAttempts + 1})`);

    this.wireGuardRetryTimer = setTimeout(async () => {
      this.wireGuardRetryTimer = null;
      if (!this.isRunning) return;

      // Try WireGuard first (unless stealth mode or DPI-blocked)
      if (!this.stealthMode && !this.wgBlockedByDPI && this.wireGuardService) {
        logger.info('🔄 Attempting WireGuard re-establishment...');
        try {
          await this.wireGuardService.disconnect();
          const connected = await this.connectViaWireGuard();
          if (connected) {
            if (this.activeProxyClient) {
              await this.activeProxyClient.disconnect();
              this.activeProxyClient = null;
            }
            if (this.amneziaWGService?.isConnected()) {
              await this.amneziaWGService.disconnect();
            }
            logger.info('🚀 WireGuard tunnel re-established');
            return;
          }
        } catch (error) {
          logger.warn(`[Connectivity] WireGuard retry error: ${error}`);
        }
      }

      // Try AmneziaWG
      if (this.amneziaWGService && this.amneziaWGService.isAvailable() && !this.amneziaWGService.isConnected()) {
        logger.info('🔄 Attempting AmneziaWG stealth tunnel...');
        try {
          const connected = await this.connectViaAmneziaWG();
          if (connected) {
            if (this.activeProxyClient) {
              await this.activeProxyClient.disconnect();
              this.activeProxyClient = null;
            }
            logger.info('🕵️ AmneziaWG stealth tunnel established');
            return;
          }
        } catch (error) {
          logger.warn(`[Connectivity] AmneziaWG retry error: ${error}`);
        }
      }

      // Try VLESS Reality chained tunnel
      if (this.vlessRealityService?.isAvailable() && this.amneziaWGService?.isAvailable()) {
        logger.info('🔄 Attempting VLESS Reality chained tunnel...');
        try {
          const connected = await this.connectViaVLESSReality();
          if (connected) {
            if (this.activeProxyClient) {
              await this.activeProxyClient.disconnect();
              this.activeProxyClient = null;
            }
            logger.info('🛡️ VLESS Reality chained tunnel established');
            return;
          }
        } catch (error) {
          logger.warn(`[Connectivity] VLESS Reality retry error: ${error}`);
        }
      }

      this.wireGuardRetryAttempts++;
      logger.info('[Connectivity] Transport upgrade retry failed, staying on current transport');
      this.scheduleWireGuardRetry();
    }, delayMs);
  }

  /**
   * Force reconnection with transport upgrade.
   * 
   * Called after username registration to activate the best available
   * transport. Tries WireGuard first (if available and username is now
   * registered), which may succeed where it previously failed at startup
   * due to no username. Falls back to ActiveProxy, then direct.
   */
  async reconnect(): Promise<boolean> {
    this.status.connected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Stop existing ActiveProxy connection before upgrading
    if (this.activeProxyClient) {
      await this.activeProxyClient.disconnect();
      this.activeProxyClient = null;
    }

    // Try WireGuard first -- this is the key path after username registration.
    // On initial startup, WireGuard was skipped because no username existed.
    // Now that the wizard has completed, it can provision and activate.
    if (this.wireGuardService && this.wireGuardService.isAvailable()) {
      const connected = await this.connectViaWireGuard();
      if (connected) {
        logger.info('🚀 Upgraded to WireGuard tunnel (high-performance mode)');
        return true;
      }
    }

    // Fall back to ActiveProxy for NAT nodes
    if (this.status.natType === 'relay' && this.publicKey && this.privateKey && this.nodeId) {
      try {
        const connected = await this.connectViaActiveProxy();
        if (connected) return true;
      } catch (error) {
        logger.warn(`[Connectivity] ActiveProxy reconnect failed: ${error}`);
      }
    }

    return await this.connect();
  }
}
