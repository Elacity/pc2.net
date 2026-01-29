/**
 * PC2 Web Gateway
 * 
 * Routes *.ela.city subdomains to PC2 nodes.
 * Supports both direct HTTP proxying and Active Proxy relay for NAT traversal.
 * 
 * Endpoint formats:
 * - http://ip:port - Direct HTTP proxy
 * - proxy://host:port/sessionId - Relay through Active Proxy
 */

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import net from "net";
import httpProxy from "http-proxy";
const { createProxyServer } = httpProxy;

// Configuration (supports environment variables for multi-gateway deployment)
const CONFIG = {
  // Gateway identity for multi-instance deployments
  gatewayId: process.env.GATEWAY_ID || 'gateway-1',
  
  // Network settings
  httpPort: parseInt(process.env.PORT || '80', 10),
  httpsPort: parseInt(process.env.HTTPS_PORT || '443', 10),
  domain: process.env.DOMAIN || 'ela.city',
  dataDir: process.env.DATA_DIR || './data',
  registryFile: process.env.REGISTRY_FILE || './data/registry.json',
  
  // Multi-gateway sync
  registrySync: {
    enabled: process.env.REGISTRY_SYNC === 'true',
    syncIntervalMs: 30000,  // Sync every 30 seconds
  },
  
  // Security settings
  enableHttpsRedirect: process.env.HTTPS_REDIRECT !== 'false',
  rateLimits: {
    register: { windowMs: 60000, max: 5 },   // 5 registrations per minute per IP
    api: { windowMs: 60000, max: 100 },       // 100 API calls per minute per IP
    proxy: { windowMs: 60000, max: 500 },     // 500 proxy requests per minute per IP
  },
  allowedOrigins: [
    /^https?:\/\/.*\.ela\.city$/,
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ],
  
  // Phase 1 Performance Optimizations
  cache: {
    registryTtlMs: 30000,        // 30 second TTL for registry lookups
    maxEntries: 10000,           // Max cached entries
  },
  proxyPool: {
    maxConnections: 1000,        // Max Active Proxy sessions
    idleTimeoutMs: 300000,       // 5 minutes idle timeout
    healthCheckIntervalMs: 30000, // Health check every 30s
  },
};

// In-memory registry with file persistence
const registry = new Map();

// Rate limiting store
const rateLimitStore = new Map();

// ============================================================================
// Phase 1: LRU Cache for Registry Lookups
// ============================================================================

/**
 * Simple LRU Cache with TTL
 * Reduces redundant registry lookups for frequently accessed usernames
 */
class LRUCache {
  constructor(maxSize = 1000, ttlMs = 30000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) + '%' : '0%',
      size: this.cache.size,
    };
  }
}

// Registry lookup cache (30s TTL)
const registryCache = new LRUCache(
  CONFIG.cache.maxEntries,
  CONFIG.cache.registryTtlMs
);

// ============================================================================
// Phase 3: DHT-backed Registry
// ============================================================================

// DHT configuration
const DHT_CONFIG = {
  enabled: true,
  // Supernodes to query for DHT lookups
  supernodeEndpoints: [
    'http://69.164.241.210:8080',
    'http://155.138.245.211:8080',
  ],
  queryTimeoutMs: 3000,
  // Use local registry as fallback
  fallbackToLocal: true,
};

/**
 * Query DHT for a username registration
 * Returns nodeInfo if found, null otherwise
 */
async function queryDHT(username) {
  if (!DHT_CONFIG.enabled) {
    return null;
  }
  
  // The DHT stores registrations under the key: pc2:user:<username>
  const dhtKey = `pc2:user:${username.toLowerCase()}`;
  
  for (const endpoint of DHT_CONFIG.supernodeEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DHT_CONFIG.queryTimeoutMs);
      
      const response = await fetch(`${endpoint}/dht/get?key=${encodeURIComponent(dhtKey)}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.value) {
          console.log(`[DHT] Found ${username} via ${endpoint}`);
          return data.value;
        }
      }
    } catch (error) {
      // Continue to next endpoint
    }
  }
  
  return null;
}

/**
 * Store registration in DHT
 */
async function storeToDHT(username, nodeInfo) {
  if (!DHT_CONFIG.enabled) {
    return;
  }
  
  const dhtKey = `pc2:user:${username.toLowerCase()}`;
  
  // Try to store in all supernodes for redundancy
  const storePromises = DHT_CONFIG.supernodeEndpoints.map(async (endpoint) => {
    try {
      const response = await fetch(`${endpoint}/dht/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: dhtKey, value: nodeInfo }),
        signal: AbortSignal.timeout(DHT_CONFIG.queryTimeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  });
  
  const results = await Promise.allSettled(storePromises);
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
  
  if (successCount > 0) {
    console.log(`[DHT] Stored ${username} to ${successCount}/${DHT_CONFIG.supernodeEndpoints.length} supernodes`);
  }
}

/**
 * Get user from registry with DHT + caching
 * Priority: Cache > DHT > Local Registry
 */
async function getCachedUserAsync(username) {
  // Check cache first
  let nodeInfo = registryCache.get(username);
  if (nodeInfo !== undefined) {
    return nodeInfo;
  }
  
  // Try DHT
  if (DHT_CONFIG.enabled) {
    nodeInfo = await queryDHT(username);
    if (nodeInfo) {
      registryCache.set(username, nodeInfo);
      // Also update local registry
      registry.set(username.toLowerCase(), nodeInfo);
      return nodeInfo;
    }
  }
  
  // Fallback to local registry
  if (DHT_CONFIG.fallbackToLocal) {
    nodeInfo = registry.get(username) || null;
    registryCache.set(username, nodeInfo);
    return nodeInfo;
  }
  
  return null;
}

/**
 * Synchronous version for backwards compatibility
 * Uses cache + local registry only (no DHT query)
 */
function getCachedUser(username) {
  // Check cache first
  let nodeInfo = registryCache.get(username);
  if (nodeInfo !== undefined) {
    return nodeInfo;
  }
  
  // Cache miss - lookup in registry
  nodeInfo = registry.get(username) || null;
  registryCache.set(username, nodeInfo);
  return nodeInfo;
}

// Log cache stats every 5 minutes
setInterval(() => {
  const stats = registryCache.getStats();
  if (stats.hits + stats.misses > 0) {
    console.log(`[Cache] Registry cache stats: ${stats.hits} hits, ${stats.misses} misses (${stats.hitRate}), ${stats.size} entries`);
  }
}, 5 * 60 * 1000);

/**
 * Rate limiter middleware
 * @param {string} key - Unique key for this rate limit (e.g., 'register', 'api')
 * @param {string} ip - Client IP address
 * @returns {boolean} - true if allowed, false if rate limited
 */
function checkRateLimit(key, ip) {
  const config = CONFIG.rateLimits[key] || CONFIG.rateLimits.api;
  const now = Date.now();
  const storeKey = `${key}:${ip}`;
  
  let entry = rateLimitStore.get(storeKey);
  
  if (!entry || now - entry.windowStart > config.windowMs) {
    // New window
    entry = { windowStart: now, count: 1 };
    rateLimitStore.set(storeKey, entry);
    return true;
  }
  
  entry.count++;
  
  if (entry.count > config.max) {
    return false;
  }
  
  return true;
}

/**
 * Get client IP from request
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.socket?.remoteAddress || 
         'unknown';
}

/**
 * Add security headers to response
 * Note: X-Frame-Options set to SAMEORIGIN to allow iframes within the same domain
 * (needed for video player, terminal, and other embedded apps)
 */
function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');  // Allow iframes from same origin
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS for HTTPS connections
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/**
 * Check if origin is allowed for CORS
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // Same-origin requests
  return CONFIG.allowedOrigins.some(pattern => pattern.test(origin));
}

/**
 * Set CORS headers based on origin
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin or no origin (e.g., curl)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    const config = CONFIG.rateLimits.api; // Use default window
    if (now - entry.windowStart > config.windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// Phase 3: Dynamic Supernode Registry
// ============================================================================

// Supernode registry with health status
// New supernodes can be added via API or configuration
const supernodeRegistry = new Map();

// Default supernodes - these are the bootstrap nodes
const DEFAULT_SUPERNODES = [
  {
    id: 'J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E',
    address: '69.164.241.210',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://69.164.241.210',
    name: 'Elacity Flagship',
    region: 'US',
    status: 'active',
    addedAt: new Date().toISOString(),
  },
  {
    id: 'HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ',
    address: '155.138.245.211',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://155.138.245.211',
    name: 'Boson Network 1',
    region: 'US',
    status: 'active',
    addedAt: new Date().toISOString(),
  },
  {
    id: '6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ',
    address: '45.32.138.246',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://45.32.138.246',
    name: 'Boson Network 2',
    region: 'US',
    status: 'active',
    addedAt: new Date().toISOString(),
  },
];

// Initialize supernode registry
for (const node of DEFAULT_SUPERNODES) {
  supernodeRegistry.set(node.id, node);
}

/**
 * Get list of active supernodes for client discovery
 */
function getActiveSuperNodes() {
  const active = [];
  for (const [id, node] of supernodeRegistry) {
    if (node.status === 'active') {
      active.push({
        id: node.id,
        address: node.address,
        port: node.port,
        proxyPort: node.proxyPort,
        gatewayUrl: node.gatewayUrl,
        name: node.name,
        region: node.region,
      });
    }
  }
  return active;
}

/**
 * Health check supernodes periodically
 */
async function checkSupernodeHealth(node) {
  try {
    // Try to connect to the Active Proxy port
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      
      socket.connect(node.proxyPort, node.address, () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

// Periodic supernode health checks (every 5 minutes)
setInterval(async () => {
  console.log('[Supernodes] Running health checks...');
  for (const [id, node] of supernodeRegistry) {
    const healthy = await checkSupernodeHealth(node);
    if (healthy && node.status !== 'active') {
      node.status = 'active';
      node.lastHealthy = new Date().toISOString();
      console.log(`[Supernodes] ${node.name} (${node.address}) is now active`);
    } else if (!healthy && node.status === 'active') {
      node.status = 'unhealthy';
      node.lastUnhealthy = new Date().toISOString();
      console.log(`[Supernodes] ${node.name} (${node.address}) is now unhealthy`);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// Phase 1: Active Proxy Connection Pool with Limits and Health Checks
// ============================================================================

// Active Proxy connection pool (for proxy:// endpoints)
const proxyConnections = new Map();

// Pool statistics
const poolStats = {
  created: 0,
  reused: 0,
  evicted: 0,
  healthChecksFailed: 0,
};

/**
 * Check if pool is at capacity
 */
function isPoolFull() {
  return proxyConnections.size >= CONFIG.proxyPool.maxConnections;
}

/**
 * Evict oldest idle connection from pool
 */
function evictOldestConnection() {
  let oldest = null;
  let oldestTime = Infinity;
  
  for (const [key, session] of proxyConnections) {
    if (session.lastUsed < oldestTime) {
      oldest = key;
      oldestTime = session.lastUsed;
    }
  }
  
  if (oldest) {
    const session = proxyConnections.get(oldest);
    if (session) {
      session.close();
    }
    proxyConnections.delete(oldest);
    poolStats.evicted++;
    console.log(`[Pool] Evicted oldest connection: ${oldest}`);
  }
}

/**
 * Clean up idle connections
 */
function cleanupIdleConnections() {
  const now = Date.now();
  const idleTimeout = CONFIG.proxyPool.idleTimeoutMs;
  
  for (const [key, session] of proxyConnections) {
    if (now - session.lastUsed > idleTimeout) {
      console.log(`[Pool] Removing idle connection: ${key}`);
      session.close();
      proxyConnections.delete(key);
      poolStats.evicted++;
    }
  }
}

// Clean up idle connections every minute
setInterval(cleanupIdleConnections, 60000);

// Log pool stats every 5 minutes
setInterval(() => {
  console.log(`[Pool] Stats: ${proxyConnections.size} active, ${poolStats.created} created, ${poolStats.reused} reused, ${poolStats.evicted} evicted, ${poolStats.healthChecksFailed} health failed`);
}, 5 * 60 * 1000);

// Packet types for Active Proxy protocol
const PacketType = {
  AUTH: 0x00,
  AUTH_ACK: 0x01,
  ATTACH: 0x08,
  ATTACH_ACK: 0x09,
  PING: 0x10,
  PONG: 0x11,
  CONNECT: 0x20,
  CONNECT_ACK: 0x21,
  DISCONNECT: 0x30,
  DATA: 0x40,
  ERROR: 0x70,
};

/**
 * Parse a proxy:// endpoint URL
 * Format: proxy://host:port/sessionId
 */
function parseProxyEndpoint(endpoint) {
  if (!endpoint.startsWith("proxy://")) {
    return null;
  }

  try {
    const url = new URL(endpoint.replace("proxy://", "http://"));
    const sessionId = url.pathname.slice(1); // Remove leading /

    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 8090,
      sessionId,
    };
  } catch (e) {
    console.error(`[Gateway] Failed to parse proxy endpoint: ${endpoint}`, e);
    return null;
  }
}

/**
 * Encode a packet for Active Proxy protocol
 */
function encodePacket(type, payload = Buffer.alloc(0)) {
  const length = 1 + payload.length;
  const packet = Buffer.alloc(4 + length);

  packet.writeUInt32BE(length, 0);
  packet.writeUInt8(type, 4);

  if (payload.length > 0) {
    payload.copy(packet, 5);
  }

  return packet;
}

/**
 * Decode packets from a buffer
 */
function decodePackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset + 5 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 4 + length > buffer.length) break;

    const type = buffer.readUInt8(offset + 4);
    const payload = buffer.slice(offset + 5, offset + 4 + length);

    packets.push({ type, payload });
    offset += 4 + length;
  }

  return { packets, remaining: buffer.slice(offset) };
}

/**
 * Create an Active Proxy session for relaying requests
 * This implements the gateway side of the protocol
 * 
 * Phase 2 Enhancement: Connection pooling for better throughput
 * - Maintains pool of 2-4 TCP connections per session
 * - Round-robin requests across connections
 * - Each connection created via ATTACH (40x faster than AUTH)
 */
class ActiveProxySession {
  constructor(host, port, sessionId) {
    this.host = host;
    this.port = port;
    this.sessionId = sessionId;
    this.socket = null;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    this.pendingRequests = new Map();
    this.nextConnectionId = 1;
    this.keepaliveTimer = null;
    
    // Phase 2: Connection pool settings
    this.poolConfig = {
      minConnections: 1,
      maxConnections: 4,
      targetConnections: 2,  // Maintain 2 connections by default
    };
    this.connectionPool = [];  // Array of {socket, buffer, connected, busy}
    this.poolRoundRobin = 0;   // Current index for round-robin selection
    this.poolStats = { created: 0, reused: 0, busy: 0 };
  }
  
  /**
   * Get an available connection from the pool
   * Uses round-robin selection among non-busy connections
   */
  getAvailableConnection() {
    if (this.connectionPool.length === 0) {
      // Fall back to primary socket
      return { socket: this.socket, isPrimary: true };
    }
    
    // Try round-robin selection
    const startIndex = this.poolRoundRobin;
    for (let i = 0; i < this.connectionPool.length; i++) {
      const index = (startIndex + i) % this.connectionPool.length;
      const conn = this.connectionPool[index];
      if (conn.connected && !conn.busy) {
        this.poolRoundRobin = (index + 1) % this.connectionPool.length;
        this.poolStats.reused++;
        return { socket: conn.socket, isPrimary: false, poolIndex: index };
      }
    }
    
    // All connections busy - use primary
    this.poolStats.busy++;
    return { socket: this.socket, isPrimary: true };
  }
  
  /**
   * Mark a pooled connection as busy/free
   */
  setConnectionBusy(poolIndex, busy) {
    if (poolIndex !== undefined && this.connectionPool[poolIndex]) {
      this.connectionPool[poolIndex].busy = busy;
    }
  }
  
  /**
   * Log pool stats periodically
   */
  logPoolStats() {
    if (this.poolStats.created + this.poolStats.reused > 0) {
      console.log(`[Pool:${this.sessionId.slice(0, 8)}] Connections: ${this.connectionPool.length + 1}, ` +
        `Created: ${this.poolStats.created}, Reused: ${this.poolStats.reused}, Busy fallbacks: ${this.poolStats.busy}`);
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("Connection timeout"));
      }, 10000);

      this.socket.connect(this.port, this.host, () => {
        clearTimeout(timeout);
        console.log(
          `[ActiveProxy] Connected to ${this.host}:${this.port} for session ${this.sessionId}`
        );

        // Send ATTACH packet to join the session
        this.sendAttach();
      });

      this.socket.on("data", (data) => {
        this.handleData(data);
      });

      this.socket.on("error", (error) => {
        clearTimeout(timeout);
        console.error(`[ActiveProxy] Socket error: ${error.message}`);
        this.connected = false;
        reject(error);
      });

      this.socket.on("close", () => {
        console.log(`[ActiveProxy] Connection closed for session ${this.sessionId}`);
        this.connected = false;
        this.stopKeepalive();
      });

      // Wait for ATTACH_ACK
      this.once("attached", () => {
        this.connected = true;
        this.startKeepalive();
        resolve();
      });

      this.once("error", (error) => {
        reject(error);
      });
    });
  }

  sendAttach() {
    const sessionBytes = Buffer.from(this.sessionId, "utf8");
    const payload = Buffer.alloc(2 + sessionBytes.length);

    payload.writeUInt16BE(sessionBytes.length, 0);
    sessionBytes.copy(payload, 2);

    const packet = encodePacket(PacketType.ATTACH, payload);
    this.socket.write(packet);
  }

  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);

    const { packets, remaining } = decodePackets(this.buffer);
    this.buffer = remaining;

    for (const packet of packets) {
      this.handlePacket(packet);
    }
  }

  handlePacket(packet) {
    switch (packet.type) {
      case PacketType.ATTACH_ACK:
        console.log(`[ActiveProxy] Attached to session ${this.sessionId}`);
        this.emit("attached");
        break;

      case PacketType.ATTACH_ERROR:
        const errorMsg = packet.payload.toString("utf8");
        console.error(`[ActiveProxy] Attach error: ${errorMsg}`);
        this.emit("error", new Error(errorMsg));
        break;

      case PacketType.PONG:
        // Keepalive response
        break;

      case PacketType.DATA:
        this.handleDataPacket(packet.payload);
        break;

      case PacketType.DISCONNECT:
        this.handleDisconnect(packet.payload);
        break;

      default:
        console.log(`[ActiveProxy] Unknown packet type: 0x${packet.type.toString(16)}`);
    }
  }

  handleDataPacket(payload) {
    const connectionId = payload.readUInt32BE(0);
    const data = payload.slice(4);

    const request = this.pendingRequests.get(connectionId);
    if (request) {
      // Phase 2: WebSocket streaming - use onData callback if present
      if (request.isWebSocket && request.onData) {
        request.onData(data);
        return;
      }
      
      // Standard HTTP response handling
      request.responseChunks.push(data);

      // Check if we've received the full HTTP response
      // This is a simplified check - in production, parse HTTP headers
      const fullData = Buffer.concat(request.responseChunks);

      // Check for end of HTTP response (double CRLF + content-length based)
      if (this.isResponseComplete(fullData)) {
        request.resolve(fullData);
        this.pendingRequests.delete(connectionId);
      }
    }
  }

  isResponseComplete(data) {
    const str = data.toString("utf8");

    // Find header/body separator
    const headerEnd = str.indexOf("\r\n\r\n");
    if (headerEnd === -1) return false;

    // Check for Content-Length
    const headers = str.slice(0, headerEnd).toLowerCase();
    const contentLengthMatch = headers.match(/content-length:\s*(\d+)/);

    if (contentLengthMatch) {
      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyLength = data.length - bodyStart;
      return bodyLength >= contentLength;
    }

    // Check for chunked transfer
    if (headers.includes("transfer-encoding: chunked")) {
      // Look for final chunk (0\r\n\r\n)
      return str.endsWith("0\r\n\r\n");
    }

    // For responses without Content-Length (like connection close)
    // Wait a bit - this is imperfect but functional for basic cases
    return false;
  }

  handleDisconnect(payload) {
    const connectionId = payload.readUInt32BE(0);
    const request = this.pendingRequests.get(connectionId);

    if (request) {
      if (request.responseChunks.length > 0) {
        request.resolve(Buffer.concat(request.responseChunks));
      } else {
        request.reject(new Error("Connection closed by server"));
      }
      this.pendingRequests.delete(connectionId);
    }
  }

  /**
   * Relay an HTTP request through the Active Proxy
   * 
   * Phase 2 Enhancement:
   * - Uses connection pool for parallel requests
   * - Streams request body for file uploads
   */
  async relayRequest(req, res) {
    if (!this.connected || !this.socket) {
      throw new Error("Not connected to Active Proxy");
    }

    const connectionId = this.nextConnectionId++;
    
    // Phase 2: Get connection from pool (round-robin)
    const conn = this.getAvailableConnection();
    const targetSocket = conn.socket;
    
    if (!targetSocket || targetSocket.destroyed) {
      throw new Error("No available connection");
    }
    
    // Mark pooled connection as busy
    if (!conn.isPrimary) {
      this.setConnectionBusy(conn.poolIndex, true);
    }

    // Build HTTP request headers
    const httpRequestHeaders = this.buildHttpRequest(req);

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(connectionId);
        if (!conn.isPrimary) {
          this.setConnectionBusy(conn.poolIndex, false);
        }
        reject(new Error("Request timeout"));
      }, 30000);

      this.pendingRequests.set(connectionId, {
        resolve: (data) => {
          clearTimeout(timeout);
          if (!conn.isPrimary) {
            this.setConnectionBusy(conn.poolIndex, false);
          }
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          if (!conn.isPrimary) {
            this.setConnectionBusy(conn.poolIndex, false);
          }
          reject(error);
        },
        responseChunks: [],
      });

      // Send CONNECT packet
      const connectPayload = this.buildConnectPayload(connectionId, req);
      const connectPacket = encodePacket(PacketType.CONNECT, connectPayload);
      targetSocket.write(connectPacket);

      // Phase 2: Stream request body for file uploads
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      
      if (contentLength > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
        // Stream request: first send headers, then body chunks
        const headersPayload = Buffer.alloc(4 + httpRequestHeaders.length);
        headersPayload.writeUInt32BE(connectionId, 0);
        httpRequestHeaders.copy(headersPayload, 4);
        const headersPacket = encodePacket(PacketType.DATA, headersPayload);
        targetSocket.write(headersPacket);
        
        // Stream body data as it arrives
        req.on('data', (chunk) => {
          const bodyPayload = Buffer.alloc(4 + chunk.length);
          bodyPayload.writeUInt32BE(connectionId, 0);
          chunk.copy(bodyPayload, 4);
          const bodyPacket = encodePacket(PacketType.DATA, bodyPayload);
          targetSocket.write(bodyPacket);
        });
        
        req.on('end', () => {
          // Body complete - server will process the full request
          console.log(`[ActiveProxy] Streamed ${contentLength} bytes for connection ${connectionId}`);
        });
        
        req.on('error', (error) => {
          console.error(`[ActiveProxy] Request body stream error: ${error.message}`);
          this.pendingRequests.delete(connectionId);
          if (!conn.isPrimary) {
            this.setConnectionBusy(conn.poolIndex, false);
          }
          reject(error);
        });
      } else {
        // No body or GET/HEAD - send complete request
        const dataPayload = Buffer.alloc(4 + httpRequestHeaders.length);
        dataPayload.writeUInt32BE(connectionId, 0);
        httpRequestHeaders.copy(dataPayload, 4);
        const dataPacket = encodePacket(PacketType.DATA, dataPayload);
        targetSocket.write(dataPacket);
      }
    });
  }

  buildConnectPayload(connectionId, req) {
    const sourceAddr = req.socket.remoteAddress || "0.0.0.0";
    const sourcePort = req.socket.remotePort || 0;
    const addrBytes = Buffer.from(sourceAddr, "utf8");

    const payload = Buffer.alloc(4 + 2 + addrBytes.length + 2);
    let offset = 0;

    payload.writeUInt32BE(connectionId, offset);
    offset += 4;

    payload.writeUInt16BE(addrBytes.length, offset);
    offset += 2;

    addrBytes.copy(payload, offset);
    offset += addrBytes.length;

    payload.writeUInt16BE(sourcePort, offset);

    return payload;
  }

  buildHttpRequest(req) {
    // Rebuild HTTP request
    const lines = [`${req.method} ${req.url} HTTP/1.1`];

    // Copy headers
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          lines.push(`${key}: ${v}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push("");
    lines.push("");

    const headerBuffer = Buffer.from(lines.join("\r\n"), "utf8");

    // For now, we don't handle request body - that would require buffering
    return headerBuffer;
  }

  startKeepalive() {
    this.keepaliveTimer = setInterval(() => {
      if (this.connected && this.socket) {
        const packet = encodePacket(PacketType.PING);
        this.socket.write(packet);
        
        // Phase 2: Also ping pooled connections to keep them alive
        for (const conn of this.connectionPool) {
          if (conn.connected && conn.socket && !conn.socket.destroyed) {
            conn.socket.write(packet);
          }
        }
      }
    }, 30000);
    
    // Log pool stats periodically
    this.poolStatsTimer = setInterval(() => {
      this.logPoolStats();
    }, 5 * 60 * 1000);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.poolStatsTimer) {
      clearInterval(this.poolStatsTimer);
      this.poolStatsTimer = null;
    }
  }

  disconnect() {
    this.stopKeepalive();
    
    // Close primary socket
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    // Phase 2: Close all pooled connections
    for (const conn of this.connectionPool) {
      if (conn.socket) {
        conn.socket.destroy();
      }
    }
    this.connectionPool = [];
    
    this.connected = false;
  }

  // Alias for pool management
  close() {
    this.disconnect();
  }

  // Simple event emitter
  _events = {};
  on(event, handler) {
    this._events[event] = this._events[event] || [];
    this._events[event].push(handler);
  }
  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };
    this.on(event, wrapped);
  }
  off(event, handler) {
    if (this._events[event]) {
      this._events[event] = this._events[event].filter((h) => h !== handler);
    }
  }
  emit(event, ...args) {
    if (this._events[event]) {
      for (const handler of this._events[event]) {
        handler(...args);
      }
    }
  }
}

/**
 * Get or create an Active Proxy session for an endpoint
 * With pool limits, health checks, and idle management
 */
async function getProxySession(endpoint) {
  const parsed = parseProxyEndpoint(endpoint);
  if (!parsed) {
    throw new Error(`Invalid proxy endpoint: ${endpoint}`);
  }

  const key = `${parsed.host}:${parsed.port}/${parsed.sessionId}`;

  // Check for existing session
  if (proxyConnections.has(key)) {
    const session = proxyConnections.get(key);
    
    // Health check: verify session is still connected
    if (session.connected && session.socket && !session.socket.destroyed) {
      session.lastUsed = Date.now();
      poolStats.reused++;
      return session;
    }
    
    // Remove stale/dead connection
    console.log(`[Pool] Removing dead connection: ${key}`);
    session.close();
    proxyConnections.delete(key);
    poolStats.healthChecksFailed++;
  }

  // Check pool capacity before creating new connection
  if (isPoolFull()) {
    console.warn(`[Pool] At capacity (${CONFIG.proxyPool.maxConnections}), evicting oldest`);
    evictOldestConnection();
  }

  // Create new session
  const session = new ActiveProxySession(parsed.host, parsed.port, parsed.sessionId);
  session.lastUsed = Date.now();
  
  await session.connect();
  
  proxyConnections.set(key, session);
  poolStats.created++;
  
  console.log(`[Pool] Created new connection: ${key} (pool size: ${proxyConnections.size})`);

  return session;
}

// Load registry from disk
function loadRegistry() {
  try {
    if (!fs.existsSync(CONFIG.dataDir)) {
      fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }

    if (fs.existsSync(CONFIG.registryFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.registryFile, "utf8"));
      for (const [username, info] of Object.entries(data)) {
        registry.set(username, info);
      }
      console.log(`[Gateway] Loaded ${registry.size} users from registry`);
    }
  } catch (error) {
    console.error("[Gateway] Failed to load registry:", error);
  }
}

// Save registry to disk
function saveRegistry() {
  try {
    const data = {};
    for (const [username, info] of registry) {
      data[username] = info;
    }
    fs.writeFileSync(CONFIG.registryFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[Gateway] Failed to save registry:", error);
  }
}

// Create proxy server for direct HTTP endpoints
const proxy = createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

// Network Map proxy (map.ela.city → localhost:3100)
const networkMapProxy = createProxyServer({
  target: "http://127.0.0.1:3100",
  ws: true,
  changeOrigin: true,
});

networkMapProxy.on("error", (err, req, res) => {
  console.error("[Gateway] Network Map proxy error:", err.message);
  if (res.writeHead) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Network Map service unavailable" }));
  }
});

// Handle proxy errors
proxy.on("error", (err, req, res) => {
  console.error("[Proxy] Error:", err.message);
  if (res.writeHead) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad Gateway", message: err.message }));
  }
});

// Extract username from hostname
function extractUsername(hostname) {
  if (!hostname) return null;
  const parts = hostname.toLowerCase().split(".");
  if (parts.length >= 2 && parts.slice(-2).join(".") === CONFIG.domain) {
    return parts.slice(0, -2).join(".") || null;
  }
  return null;
}

// Request handler
async function handleRequest(req, res) {
  const hostname = req.headers.host?.split(":")[0];
  const username = extractUsername(hostname);
  const clientIP = getClientIP(req);

  // Network Map routing (map.ela.city)
  if (hostname === "map.ela.city" || hostname === `map.${CONFIG.domain}`) {
    return networkMapProxy.web(req, res);
  }

  // API routes (main domain + demo subdomain which hosts the gateway UI)
  // demo.ela.city serves both as the gateway UI and the main API endpoint
  if (!username || hostname === CONFIG.domain || hostname === `www.${CONFIG.domain}` || hostname === `demo.${CONFIG.domain}`) {
    return handleApiRequest(req, res);
  }

  // Rate limiting for proxy requests
  if (!checkRateLimit('proxy', clientIP)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      error: "Too Many Requests", 
      message: "Rate limit exceeded. Please slow down.",
      retryAfter: 60
    }));
    return;
  }

  // Look up user in registry (with caching)
  const nodeInfo = getCachedUser(username);

  if (!nodeInfo) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "User not found", username }));
    return;
  }

  // Status check
  if (req.url === "/?status" || req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        gateway: "PC2 Web Gateway",
        username,
        nodeInfo: {
          nodeId: nodeInfo.nodeId,
          endpoint: nodeInfo.endpoint,
          registered: nodeInfo.registered,
        },
        status: "Ready to proxy",
      })
    );
    return;
  }

  // Check if this is a proxy:// endpoint
  if (nodeInfo.endpoint.startsWith("proxy://")) {
    // Relay through Active Proxy
    try {
      console.log(`[Gateway] Relaying ${username} via Active Proxy: ${nodeInfo.endpoint}`);
      const session = await getProxySession(nodeInfo.endpoint);
      const responseData = await session.relayRequest(req, res);

      // Parse and send HTTP response
      const responseStr = responseData.toString("utf8");
      const headerEnd = responseStr.indexOf("\r\n\r\n");

      if (headerEnd !== -1) {
        const headerLines = responseStr.slice(0, headerEnd).split("\r\n");
        const statusLine = headerLines[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;

        // Parse headers
        const headers = {};
        for (let i = 1; i < headerLines.length; i++) {
          const colonIdx = headerLines[i].indexOf(":");
          if (colonIdx > 0) {
            const key = headerLines[i].slice(0, colonIdx).trim();
            const value = headerLines[i].slice(colonIdx + 1).trim();
            headers[key] = value;
          }
        }

        // Send response
        res.writeHead(statusCode, headers);
        res.end(responseData.slice(headerEnd + 4));
      } else {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid response from node" }));
      }
    } catch (error) {
      console.error(`[Gateway] Proxy relay error: ${error.message}`);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Gateway", message: error.message }));
    }
    return;
  }

  // Direct HTTP proxy
  console.log(`[Gateway] Proxying ${username} -> ${nodeInfo.endpoint}`);
  proxy.web(req, res, { target: nodeInfo.endpoint });
}

// API request handler
async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientIP = getClientIP(req);

  // Add security headers
  addSecurityHeaders(res);
  
  // CORS headers
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Rate limiting for API
  if (!checkRateLimit('api', clientIP)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      error: "Too Many Requests", 
      message: "Rate limit exceeded. Please try again later.",
      retryAfter: 60
    }));
    return;
  }

  // Health check (enhanced for multi-gateway)
  if (url.pathname === "/api/health") {
    const cacheStats = registryCache.getStats();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      status: "ok", 
      gatewayId: CONFIG.gatewayId,
      uptime: process.uptime(),
      registrySize: registry.size,
      cacheHitRate: cacheStats.hitRate,
      proxyConnections: proxyConnections.size,
      supernodes: getActiveSuperNodes().length,
    }));
    return;
  }

  // Phase 3: Registry sync endpoint (for multi-gateway deployment)
  // Other gateways can fetch the full registry for synchronization
  if (url.pathname === "/api/registry/sync" && req.method === "GET") {
    const entries = [];
    for (const [username, info] of registry) {
      entries.push({ username, ...info });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      gatewayId: CONFIG.gatewayId,
      timestamp: new Date().toISOString(),
      entries,
    }));
    return;
  }

  // Phase 3: Supernode discovery endpoint
  // PC2 nodes fetch this to discover active supernodes dynamically
  if (url.pathname === "/api/supernodes" && req.method === "GET") {
    const supernodes = getActiveSuperNodes();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      supernodes,
      updated: new Date().toISOString(),
      version: "1.0"
    }));
    return;
  }

  // List users
  if (url.pathname === "/api/users" && req.method === "GET") {
    const users = [];
    for (const [username, info] of registry) {
      users.push({ username, ...info });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ users }));
    return;
  }

  // Lookup user (with DHT integration)
  if (url.pathname.startsWith("/api/lookup/") && req.method === "GET") {
    const username = url.pathname.slice("/api/lookup/".length);
    
    // Use async DHT lookup
    try {
      const nodeInfo = await getCachedUserAsync(username);
      
      if (nodeInfo) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ username, ...nodeInfo, source: 'dht' }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User not found" }));
      }
    } catch (error) {
      console.error(`[Gateway] DHT lookup error: ${error.message}`);
      // Fallback to local
      const nodeInfo = registry.get(username);
      if (nodeInfo) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ username, ...nodeInfo, source: 'local' }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User not found" }));
      }
    }
    return;
  }

  // Check availability
  if (url.pathname === "/api/available" && req.method === "GET") {
    const username = url.searchParams.get("username");
    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Username required" }));
      return;
    }

    const available = !registry.has(username.toLowerCase());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ username, available }));
    return;
  }

  // Register user
  if (url.pathname === "/api/register" && req.method === "POST") {
    // Stricter rate limiting for registration
    if (!checkRateLimit('register', clientIP)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        error: "Too Many Requests", 
        message: "Registration rate limit exceeded. Please try again in a minute.",
        retryAfter: 60
      }));
      return;
    }
    
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const { username, nodeId, endpoint } = data;

        if (!username || !nodeId || !endpoint) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields" }));
          return;
        }

        // Validate username
        const usernameRegex = /^[a-z0-9][a-z0-9_-]{2,29}$/;
        if (!usernameRegex.test(username.toLowerCase())) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Invalid username. Must be 3-30 characters, lowercase alphanumeric with _ and -",
            })
          );
          return;
        }

        // Store registration
        const normalizedUsername = username.toLowerCase();
        const nodeInfo = {
          nodeId,
          endpoint,
          registered: new Date().toISOString(),
        };
        
        registry.set(normalizedUsername, nodeInfo);

        // Invalidate cache for this user
        registryCache.delete(normalizedUsername);

        saveRegistry();
        
        // Phase 3: Also store in DHT (async, don't block response)
        storeToDHT(normalizedUsername, nodeInfo).catch(err => {
          console.warn(`[DHT] Failed to store ${normalizedUsername}: ${err.message}`);
        });

        console.log(`[Gateway] Registered: ${username} -> ${endpoint}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, username: username.toLowerCase() }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // Default: 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

// WebSocket upgrade handler
async function handleUpgrade(req, socket, head) {
  const hostname = req.headers.host?.split(":")[0];
  
  // Network Map WebSocket (map.ela.city)
  if (hostname === "map.ela.city" || hostname === `map.${CONFIG.domain}`) {
    return networkMapProxy.ws(req, socket, head);
  }
  
  const username = extractUsername(hostname);

  if (!username) {
    socket.destroy();
    return;
  }

  const nodeInfo = getCachedUser(username);

  if (!nodeInfo) {
    socket.destroy();
    return;
  }

  // Phase 2: WebSocket via Active Proxy
  if (nodeInfo.endpoint.startsWith("proxy://")) {
    console.log(`[Gateway] WebSocket via Active Proxy for ${username}`);
    
    try {
      await handleWebSocketViaProxy(req, socket, head, nodeInfo.endpoint, username);
    } catch (error) {
      console.error(`[Gateway] WebSocket proxy error for ${username}: ${error.message}`);
      socket.destroy();
    }
    return;
  }

  console.log(`[Gateway] WS upgrade for ${username} -> ${nodeInfo.endpoint}`);
  proxy.ws(req, socket, head, { target: nodeInfo.endpoint });
}

/**
 * Handle WebSocket connection via Active Proxy tunnel
 * 
 * Flow:
 * 1. Get/create Active Proxy session
 * 2. Create tunnel connection via CONNECT packet
 * 3. Send WebSocket upgrade request through tunnel
 * 4. Pipe bidirectional data between client and tunnel
 */
async function handleWebSocketViaProxy(req, clientSocket, head, endpoint, username) {
  const session = await getProxySession(endpoint);
  
  if (!session || !session.connected) {
    throw new Error('Active Proxy session not available');
  }
  
  const connectionId = session.nextConnectionId++;
  
  // Build the WebSocket upgrade request
  const upgradeRequest = buildWebSocketUpgradeRequest(req);
  
  console.log(`[Gateway] WebSocket tunnel ${connectionId} for ${username}`);
  
  // Set up bidirectional data handlers
  const wsConnection = {
    connectionId,
    clientSocket,
    responseStarted: false,
    destroyed: false,
  };
  
  // Handle data from Active Proxy to client
  session.pendingRequests.set(connectionId, {
    isWebSocket: true,
    resolve: () => {},
    reject: () => {},
    responseChunks: [],
    onData: (data) => {
      if (!wsConnection.destroyed && clientSocket.writable) {
        // For WebSocket, we need to pass through the raw data
        // First chunk will be HTTP upgrade response, then WebSocket frames
        if (!wsConnection.responseStarted) {
          // First data - should be HTTP 101 Switching Protocols
          wsConnection.responseStarted = true;
        }
        clientSocket.write(data);
      }
    },
  });
  
  // Handle data from client to Active Proxy
  clientSocket.on('data', (data) => {
    if (!wsConnection.destroyed && session.connected && session.socket) {
      const dataPayload = Buffer.alloc(4 + data.length);
      dataPayload.writeUInt32BE(connectionId, 0);
      data.copy(dataPayload, 4);
      const dataPacket = encodePacket(PacketType.DATA, dataPayload);
      session.socket.write(dataPacket);
    }
  });
  
  // Handle client disconnect
  clientSocket.on('close', () => {
    wsConnection.destroyed = true;
    session.pendingRequests.delete(connectionId);
    
    // Send DISCONNECT to Active Proxy
    if (session.connected && session.socket) {
      const disconnectPayload = Buffer.alloc(4);
      disconnectPayload.writeUInt32BE(connectionId, 0);
      const disconnectPacket = encodePacket(PacketType.DISCONNECT, disconnectPayload);
      session.socket.write(disconnectPacket);
    }
    console.log(`[Gateway] WebSocket tunnel ${connectionId} closed for ${username}`);
  });
  
  clientSocket.on('error', (error) => {
    console.error(`[Gateway] WebSocket client error: ${error.message}`);
    wsConnection.destroyed = true;
    session.pendingRequests.delete(connectionId);
  });
  
  // Send CONNECT packet to establish tunnel
  const connectPayload = buildConnectPayloadForWebSocket(connectionId, req);
  const connectPacket = encodePacket(PacketType.CONNECT, connectPayload);
  session.socket.write(connectPacket);
  
  // Send upgrade request through tunnel
  const requestPayload = Buffer.alloc(4 + upgradeRequest.length);
  requestPayload.writeUInt32BE(connectionId, 0);
  upgradeRequest.copy(requestPayload, 4);
  const requestPacket = encodePacket(PacketType.DATA, requestPayload);
  session.socket.write(requestPacket);
  
  // Also send head data if present
  if (head && head.length > 0) {
    const headPayload = Buffer.alloc(4 + head.length);
    headPayload.writeUInt32BE(connectionId, 0);
    head.copy(headPayload, 4);
    const headPacket = encodePacket(PacketType.DATA, headPayload);
    session.socket.write(headPacket);
  }
}

/**
 * Build WebSocket upgrade HTTP request
 */
function buildWebSocketUpgradeRequest(req) {
  let request = `${req.method} ${req.url} HTTP/1.1\r\n`;
  
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        request += `${key}: ${v}\r\n`;
      }
    } else {
      request += `${key}: ${value}\r\n`;
    }
  }
  
  request += '\r\n';
  return Buffer.from(request, 'utf8');
}

/**
 * Build CONNECT payload for WebSocket tunnel
 */
function buildConnectPayloadForWebSocket(connectionId, req) {
  // Extract target from Host header
  const host = req.headers.host || 'localhost:4200';
  const [hostname, portStr] = host.split(':');
  const port = parseInt(portStr, 10) || 4200;
  
  // CONNECT payload: [connectionId:4][addressType:1][address:variable][port:2]
  // For now, use simple format
  const hostBytes = Buffer.from(hostname, 'utf8');
  const payload = Buffer.alloc(4 + 1 + hostBytes.length + 2);
  
  let offset = 0;
  payload.writeUInt32BE(connectionId, offset);
  offset += 4;
  
  payload.writeUInt8(hostBytes.length, offset);
  offset += 1;
  
  hostBytes.copy(payload, offset);
  offset += hostBytes.length;
  
  payload.writeUInt16BE(port, offset);
  
  return payload;
}

// Load SSL certificates
function loadSSL() {
  // Try wildcard cert first, then fall back to demo cert
  const wildcardDir = "/etc/letsencrypt/live/ela.city";
  const sslDir = "/etc/letsencrypt/live/demo.ela.city";
  const fallbackDir = "./certs";
  
  // Prefer wildcard certificate for *.ela.city
  if (fs.existsSync(path.join(wildcardDir, "fullchain.pem"))) {
    console.log("[Gateway] Using wildcard SSL certificate (*.ela.city)");
    return {
      key: fs.readFileSync(path.join(wildcardDir, "privkey.pem")),
      cert: fs.readFileSync(path.join(wildcardDir, "fullchain.pem")),
    };
  }

  try {
    if (fs.existsSync(path.join(sslDir, "fullchain.pem"))) {
      return {
        key: fs.readFileSync(path.join(sslDir, "privkey.pem")),
        cert: fs.readFileSync(path.join(sslDir, "fullchain.pem")),
      };
    }
  } catch (error) {
    console.warn("[Gateway] Could not load Let's Encrypt certs, trying fallback");
  }

  try {
    if (fs.existsSync(path.join(fallbackDir, "server.key"))) {
      return {
        key: fs.readFileSync(path.join(fallbackDir, "server.key")),
        cert: fs.readFileSync(path.join(fallbackDir, "server.crt")),
      };
    }
  } catch (error) {
    console.warn("[Gateway] Could not load fallback certs");
  }

  return null;
}

// Start servers
loadRegistry();

// Load SSL first to know if we should redirect
const sslOptions = loadSSL();
const httpsAvailable = !!sslOptions;

// HTTP server - redirect to HTTPS if available, otherwise serve directly
const httpServer = http.createServer((req, res) => {
  // Always add security headers
  addSecurityHeaders(res);
  
  // Redirect to HTTPS if SSL is available and redirect is enabled
  if (httpsAvailable && CONFIG.enableHttpsRedirect) {
    const host = req.headers.host?.split(':')[0] || CONFIG.domain;
    const redirectUrl = `https://${host}${req.url}`;
    
    res.writeHead(301, {
      'Location': redirectUrl,
      'Cache-Control': 'no-cache',
    });
    res.end(`Redirecting to ${redirectUrl}`);
    return;
  }
  
  // No HTTPS, serve directly
  handleRequest(req, res);
});

httpServer.on("upgrade", (req, socket, head) => {
  // For WebSocket, we can't redirect, so handle directly
  handleUpgrade(req, socket, head);
});

httpServer.listen(CONFIG.httpPort, () => {
  console.log(`[Gateway] HTTP server listening on port ${CONFIG.httpPort}`);
  if (httpsAvailable && CONFIG.enableHttpsRedirect) {
    console.log(`[Gateway] HTTP requests will redirect to HTTPS`);
  }
});

// HTTPS server
if (httpsAvailable) {
  const httpsServer = https.createServer(sslOptions, (req, res) => {
    addSecurityHeaders(res);
    handleRequest(req, res);
  });
  httpsServer.on("upgrade", handleUpgrade);
  httpsServer.listen(CONFIG.httpsPort, () => {
    console.log(`[Gateway] HTTPS server listening on port ${CONFIG.httpsPort}`);
  });
} else {
  console.warn("[Gateway] No SSL certificates found, HTTPS disabled");
}

console.log(`[Gateway] PC2 Web Gateway started for *.${CONFIG.domain}`);
console.log(`[Gateway] Proxy endpoint support: http://, proxy://`);
console.log(`[Gateway] Security: Rate limiting enabled, CORS restricted to *.ela.city`);