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
import zlib from "zlib";
import { execSync, execFileSync } from "child_process";
import httpProxy from "http-proxy";
import {
  ProvisioningTokenStore,
  getProvisioningTokenFromRequest,
} from "./lib/provisioning-token.js";
import { peerRequest } from "./lib/peer-request.js";
const { createProxyServer } = httpProxy;

// ============================================================================
// Performance: Keep-alive agent for WireGuard / direct HTTP proxy targets.
// Reuses TCP connections to PC2 nodes instead of opening one per request.
// NOT used for Boson ActiveProxy (requires Connection: close).
// ============================================================================
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 8,
  timeout: 30_000,
  freeSocketTimeout: 15_000,
});

// Periodically destroy free (idle) sockets so stale connections from
// rebooted WireGuard peers do not accumulate and block new requests.
setInterval(() => {
  const freeSockets = keepAliveAgent.freeSockets;
  let destroyed = 0;
  for (const [key, sockets] of Object.entries(freeSockets)) {
    for (const sock of sockets) {
      sock.destroy();
      destroyed++;
    }
  }
  if (destroyed > 0) {
    console.log(`[Gateway] Evicted ${destroyed} idle keep-alive sockets`);
  }
}, 30_000);

// Tunnel peer health-check: probe registered WireGuard (10.100) and AmneziaWG (10.101) endpoints every 60s.
// If a peer is unreachable (connection refused / timeout), destroy its pooled
// sockets so the next real request gets a clean connection or a fast 502.
setInterval(() => {
  for (const [username, info] of registry) {
    if (!info.endpoint || !(info.endpoint.startsWith("http://10.100.") || info.endpoint.startsWith("http://10.101."))) continue;

    const url = new URL(info.endpoint);
    const probe = http.request({
      hostname: url.hostname,
      port: url.port || 4200,
      path: "/?healthcheck=gateway",
      method: "HEAD",
      timeout: 5000,
    }, (res) => {
      res.resume();
    });

    probe.on("error", () => {
      // Peer is down -- flush any pooled sockets for this host
      const hostKey = url.hostname + ":" + (url.port || 4200) + ":";
      const freeSockets = keepAliveAgent.freeSockets;
      for (const [key, sockets] of Object.entries(freeSockets)) {
        if (key.includes(hostKey)) {
          for (const sock of sockets) sock.destroy();
          console.log(`[Gateway] Health-check: flushed stale sockets for ${username} (${info.endpoint})`);
        }
      }
    });

    probe.on("timeout", () => {
      probe.destroy();
    });

    probe.end();
  }
}, 60_000);

// ============================================================================
// Performance: Compression + cache header configuration
// ============================================================================
const COMPRESSIBLE_TYPES = /^text\/|\/json|\/javascript|\/xml|\+xml|\/svg/;
const MIN_COMPRESS_SIZE = 1024; // Don't compress responses under 1KB

const STATIC_CACHE_RULES = {
  long:  { maxAge: 604800, extensions: /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot)$/i },
  medium: { maxAge: 86400, extensions: /\.(js|css|svg|map)$/i },
};

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
// SEC-INFRA-GW-AUTH (PC2 Security Triage 2026-04-21, Wave 3)
//
// Per-node provisioning token store. First /api/register call for a username
// mints a 256-bit token (returned ONCE in the response body); every subsequent
// gateway call that acts on that username must include the plaintext token in
// the X-Provisioning-Token header.
//
// GW_AUTH_REQUIRED env-var kill-switch:
//   - undefined / 'false'  →  log-only mode. Verify if token present, log
//                              the result for telemetry, but do NOT 401.
//                              Lets operators deploy the gateway change before
//                              every PC2 node has rolled out the client side.
//   - 'true'               →  strict enforcement. Missing or wrong token = 401.
//
// Telemetry log format (greppable):
//   [gw-auth] handler=<route> username=<u> token=<present|missing|wrong>
//             enforce=<true|false> action=<allow|deny>
// ============================================================================
const PROVISIONING_TOKEN_FILE =
  process.env.PROVISIONING_TOKEN_FILE ||
  path.join(CONFIG.dataDir, 'provisioning-tokens.json');
const provisioningTokenStore = new ProvisioningTokenStore(PROVISIONING_TOKEN_FILE);
const GW_AUTH_REQUIRED = process.env.GW_AUTH_REQUIRED === 'true';

console.log(`[gw-auth] Provisioning-token store loaded from ${PROVISIONING_TOKEN_FILE} (${provisioningTokenStore.toJSON().count} records). Enforcement: ${GW_AUTH_REQUIRED ? 'STRICT' : 'log-only'}.`);

// Per-username delete throttle (SEC-9). Independent from the per-IP rate-limit
// store above so a legit owner cannot lock themselves out by hammering wg/peer
// delete from many client IPs.
const perUsernameDeleteWindow = new Map(); // username -> { windowStart, count }
const PER_USERNAME_DELETE_WINDOW_MS = 60_000;
const PER_USERNAME_DELETE_MAX = 3;

function checkPerUsernameDeleteRate(username) {
  const now = Date.now();
  const entry = perUsernameDeleteWindow.get(username);
  if (!entry || now - entry.windowStart > PER_USERNAME_DELETE_WINDOW_MS) {
    perUsernameDeleteWindow.set(username, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= PER_USERNAME_DELETE_MAX;
}

/**
 * SEC-INFRA-GW-AUTH guard for any handler that acts on a per-user resource.
 *
 * Behaviour:
 *   - In log-only mode (GW_AUTH_REQUIRED=false): always returns true. Logs
 *     telemetry so operators can see the rollout completion rate before
 *     flipping the kill-switch.
 *   - In strict mode (GW_AUTH_REQUIRED=true): returns true only if the
 *     X-Provisioning-Token header matches the registered token for the
 *     named username. Otherwise responds with 401 and returns false (the
 *     caller MUST `return` immediately when it sees false).
 *
 * Returns boolean: true = continue, false = response already sent.
 */
function requireProvisioningToken(req, res, username, handlerLabel) {
  const token = getProvisioningTokenFromRequest(req);
  const known = provisioningTokenStore.has(username);
  const verified = token && known && provisioningTokenStore.verify(token, username);

  let tokenState = 'missing';
  if (token && verified) tokenState = 'present';
  else if (token && !verified) tokenState = 'wrong';

  const action = (!GW_AUTH_REQUIRED || verified) ? 'allow' : 'deny';
  console.log(`[gw-auth] handler=${handlerLabel} username=${username} token=${tokenState} enforce=${GW_AUTH_REQUIRED} action=${action}`);

  if (action === 'allow') return true;

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'unauthorized',
    message: known
      ? 'X-Provisioning-Token header missing or does not match this username'
      : 'no provisioning token has been issued for this username; call /api/register first',
  }));
  return false;
}

// ============================================================================
// WireGuard Peer Management
// ============================================================================

const WG_CONFIG = {
  enabled: process.env.WG_ENABLED !== 'false',
  interface: process.env.WG_INTERFACE || 'wg0',
  subnet: process.env.WG_SUBNET || '10.100.0.0/16',
  serverIP: process.env.WG_SERVER_IP || '10.100.0.1',
  listenPort: parseInt(process.env.WG_PORT || '51820', 10),
  peersFile: process.env.WG_PEERS_FILE || path.join(CONFIG.dataDir, 'wg-peers.json'),
  serverPubkeyFile: '/etc/wireguard/server-public.key',
};

const wgPeers = { nextIP: 2, peers: {} };

function loadWGPeers() {
  try {
    if (fs.existsSync(WG_CONFIG.peersFile)) {
      const data = JSON.parse(fs.readFileSync(WG_CONFIG.peersFile, 'utf8'));
      wgPeers.nextIP = data.nextIP || 2;
      wgPeers.peers = data.peers || {};
      console.log(`[WireGuard] Loaded ${Object.keys(wgPeers.peers).length} peers from ${WG_CONFIG.peersFile}`);
    }
  } catch (error) {
    console.error('[WireGuard] Failed to load peers:', error.message);
  }
}

function saveWGPeers() {
  try {
    fs.writeFileSync(WG_CONFIG.peersFile, JSON.stringify(wgPeers, null, 2));
  } catch (error) {
    console.error('[WireGuard] Failed to save peers:', error.message);
  }
}

function allocateWGIP() {
  const ip = wgPeers.nextIP;
  if (ip > 65534) {
    throw new Error('WireGuard IP pool exhausted (10.100.0.0/16 range full)');
  }
  wgPeers.nextIP = ip + 1;
  const octet3 = Math.floor(ip / 256);
  const octet4 = ip % 256;
  return `10.100.${octet3}.${octet4}`;
}

function isWireGuardAvailable() {
  if (!WG_CONFIG.enabled) return false;
  try {
    // SEC-2 (defence in depth): execFileSync — no shell, no template
    // interpretation. WG_CONFIG.interface is server-controlled (env var)
    // so this is low risk pre-fix, but cheap to harden.
    execFileSync('ip', ['link', 'show', WG_CONFIG.interface], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getServerPublicKey() {
  try {
    if (fs.existsSync(WG_CONFIG.serverPubkeyFile)) {
      return fs.readFileSync(WG_CONFIG.serverPubkeyFile, 'utf8').trim();
    }
  } catch (error) {
    console.error('[WireGuard] Failed to read server public key:', error.message);
  }
  return null;
}

function addWGPeer(publicKey, allowedIP) {
  try {
    execFileSync(
      'wg',
      ['set', WG_CONFIG.interface, 'peer', publicKey, 'allowed-ips', `${allowedIP}/32`],
      { stdio: 'pipe', timeout: 5000 }
    );
    return true;
  } catch (error) {
    console.error(`[WireGuard] Failed to add peer: ${error.message}`);
    return false;
  }
}

function removeWGPeer(publicKey) {
  try {
    execFileSync(
      'wg',
      ['set', WG_CONFIG.interface, 'peer', publicKey, 'remove'],
      { stdio: 'pipe', timeout: 5000 }
    );
    return true;
  } catch (error) {
    console.error(`[WireGuard] Failed to remove peer: ${error.message}`);
    return false;
  }
}

function syncWGPeers() {
  if (!isWireGuardAvailable()) {
    console.log('[WireGuard] Interface not available, skipping peer sync');
    return;
  }

  let synced = 0;
  for (const [username, peer] of Object.entries(wgPeers.peers)) {
    if (peer.publicKey && peer.assignedIP) {
      if (addWGPeer(peer.publicKey, peer.assignedIP)) {
        synced++;
      }
    }
  }
  console.log(`[WireGuard] Synced ${synced}/${Object.keys(wgPeers.peers).length} peers to interface`);
}

function isWireGuardIP(endpoint) {
  if (!endpoint) return false;
  const match = endpoint.match(/^https?:\/\/(10\.10[01]\.\d+\.\d+)/);
  return !!match;
}

// ============================================================================
// AmneziaWG (Stealth) Peer Management
// ============================================================================

const AWG_CONFIG = {
  enabled: process.env.AWG_ENABLED !== 'false',
  interface: process.env.AWG_INTERFACE || 'awg0',
  subnet: process.env.AWG_SUBNET || '10.101.0.0/16',
  serverIP: process.env.AWG_SERVER_IP || '10.101.0.1',
  listenPort: parseInt(process.env.AWG_PORT || '51821', 10),
  peersFile: process.env.AWG_PEERS_FILE || path.join(CONFIG.dataDir, 'awg-peers.json'),
  paramsFile: process.env.AWG_PARAMS_FILE || '/etc/amneziawg/obfuscation-params.json',
  serverPubkeyFile: '/etc/amneziawg/server-public.key',
};

const awgPeers = { nextIP: 2, peers: {} };
let awgObfuscationParams = null;

function loadAWGPeers() {
  try {
    if (fs.existsSync(AWG_CONFIG.peersFile)) {
      const data = JSON.parse(fs.readFileSync(AWG_CONFIG.peersFile, 'utf8'));
      awgPeers.nextIP = data.nextIP || 2;
      awgPeers.peers = data.peers || {};
      console.log(`[AmneziaWG] Loaded ${Object.keys(awgPeers.peers).length} peers from ${AWG_CONFIG.peersFile}`);
    }
  } catch (error) {
    console.error('[AmneziaWG] Failed to load peers:', error.message);
  }
}

function loadAWGParams() {
  try {
    if (fs.existsSync(AWG_CONFIG.paramsFile)) {
      awgObfuscationParams = JSON.parse(fs.readFileSync(AWG_CONFIG.paramsFile, 'utf8'));
      console.log('[AmneziaWG] Loaded obfuscation parameters');
    }
  } catch (error) {
    console.error('[AmneziaWG] Failed to load obfuscation params:', error.message);
  }
}

function saveAWGPeers() {
  try {
    fs.writeFileSync(AWG_CONFIG.peersFile, JSON.stringify(awgPeers, null, 2));
  } catch (error) {
    console.error('[AmneziaWG] Failed to save peers:', error.message);
  }
}

function allocateAWGIP() {
  const ip = awgPeers.nextIP;
  if (ip > 65534) {
    throw new Error('AmneziaWG IP pool exhausted (10.101.0.0/16 range full)');
  }
  awgPeers.nextIP = ip + 1;
  const octet3 = Math.floor(ip / 256);
  const octet4 = ip % 256;
  return `10.101.${octet3}.${octet4}`;
}

function isAmneziaWGAvailable() {
  if (!AWG_CONFIG.enabled) return false;
  try {
    execFileSync('ip', ['link', 'show', AWG_CONFIG.interface], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getAWGServerPublicKey() {
  try {
    if (fs.existsSync(AWG_CONFIG.serverPubkeyFile)) {
      return fs.readFileSync(AWG_CONFIG.serverPubkeyFile, 'utf8').trim();
    }
  } catch (error) {
    console.error('[AmneziaWG] Failed to read server public key:', error.message);
  }
  return null;
}

function addAWGPeer(publicKey, allowedIP) {
  try {
    const tool = fs.existsSync('/usr/local/bin/awg') ? 'awg' : 'wg';
    execFileSync(
      tool,
      ['set', AWG_CONFIG.interface, 'peer', publicKey, 'allowed-ips', `${allowedIP}/32`],
      { stdio: 'pipe', timeout: 5000 }
    );
    return true;
  } catch (error) {
    console.error(`[AmneziaWG] Failed to add peer: ${error.message}`);
    return false;
  }
}

function removeAWGPeer(publicKey) {
  try {
    const tool = fs.existsSync('/usr/local/bin/awg') ? 'awg' : 'wg';
    execFileSync(
      tool,
      ['set', AWG_CONFIG.interface, 'peer', publicKey, 'remove'],
      { stdio: 'pipe', timeout: 5000 }
    );
    return true;
  } catch (error) {
    console.error(`[AmneziaWG] Failed to remove peer: ${error.message}`);
    return false;
  }
}

function syncAWGPeers() {
  if (!isAmneziaWGAvailable()) {
    console.log('[AmneziaWG] Interface not available, skipping peer sync');
    return;
  }

  let synced = 0;
  for (const [username, peer] of Object.entries(awgPeers.peers)) {
    if (peer.publicKey && peer.assignedIP) {
      if (addAWGPeer(peer.publicKey, peer.assignedIP)) {
        synced++;
      }
    }
  }
  console.log(`[AmneziaWG] Synced ${synced}/${Object.keys(awgPeers.peers).length} peers to interface`);
}

let _cachedPublicIP = null;
function getPublicIP() {
  if (_cachedPublicIP) return _cachedPublicIP;
  // Use the first supernode address as the public IP (this gateway runs on the supernode)
  _cachedPublicIP = DEFAULT_SUPERNODES[0]?.address || '69.164.241.210';
  return _cachedPublicIP;
}

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
      const response = await peerRequest(`${endpoint}/dht/get?key=${encodeURIComponent(dhtKey)}`, {
        timeoutMs: DHT_CONFIG.queryTimeoutMs,
      });
      
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
      const response = await peerRequest(`${endpoint}/dht/put`, {
        method: 'POST',
        body: { key: dhtKey, value: nodeInfo },
        timeoutMs: DHT_CONFIG.queryTimeoutMs,
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
    id: 'EbfCHQUfwawec8Pyz9vdYTXJRoR1GpjNPgLc3vAhAoam',
    address: '38.242.211.112',
    port: 39001,
    proxyPort: 8090,
    gatewayUrl: 'https://38.242.211.112',
    name: 'Elacity Contabo',
    region: 'EU',
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

// Shared secret for supernode-to-supernode operations (env or default for dev)
const SUPERNODE_SECRET = process.env.SUPERNODE_SECRET || '';

/**
 * Validate a supernode registration payload.
 * Returns null if valid, or an error string.
 */
function validateSupernodePayload(data) {
  if (!data.id || typeof data.id !== 'string' || data.id.length < 20) return 'invalid id';
  if (!data.address || typeof data.address !== 'string') return 'invalid address';
  if (!data.port || typeof data.port !== 'number') return 'invalid port';
  if (!data.gatewayUrl || typeof data.gatewayUrl !== 'string') return 'invalid gatewayUrl';
  const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (!ipPattern.test(data.address)) return 'address must be an IP';
  return null;
}

/**
 * Register or update a supernode in the registry.
 * Used by /api/supernodes/register, /api/supernodes/heartbeat, and gossip.
 */
function upsertSupernode(data, source) {
  const existing = supernodeRegistry.get(data.id);
  if (existing) {
    existing.status = 'active';
    existing.lastHeartbeat = new Date().toISOString();
    if (data.name) existing.name = data.name;
    if (data.region) existing.region = data.region;
    if (data.gatewayUrl) existing.gatewayUrl = data.gatewayUrl;
    if (data.address) existing.address = data.address;
    if (data.proxyPort) existing.proxyPort = data.proxyPort;
    console.log(`[Supernodes] Updated ${existing.name || data.id} via ${source}`);
    return { action: 'updated', node: existing };
  }

  const newNode = {
    id: data.id,
    address: data.address,
    port: data.port || 39001,
    proxyPort: data.proxyPort || 8090,
    gatewayUrl: data.gatewayUrl,
    name: data.name || `Supernode-${data.address}`,
    region: data.region || 'unknown',
    status: 'active',
    addedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    dynamic: true,
  };
  supernodeRegistry.set(data.id, newNode);
  console.log(`[Supernodes] Registered new supernode ${newNode.name} (${newNode.address}) via ${source}`);
  return { action: 'registered', node: newNode };
}

// Mark supernodes as unhealthy if no heartbeat for 10 minutes
const HEARTBEAT_TTL_MS = 10 * 60 * 1000;

// Periodic supernode health checks (every 5 minutes)
setInterval(async () => {
  console.log('[Supernodes] Running health checks...');
  const now = Date.now();
  for (const [id, node] of supernodeRegistry) {
    // Dynamic nodes: check heartbeat TTL first
    if (node.dynamic && node.lastHeartbeat) {
      const age = now - new Date(node.lastHeartbeat).getTime();
      if (age > HEARTBEAT_TTL_MS) {
        if (node.status === 'active') {
          node.status = 'unhealthy';
          node.lastUnhealthy = new Date().toISOString();
          console.log(`[Supernodes] ${node.name} (${node.address}) heartbeat expired — marking unhealthy`);
        }
        continue;
      }
    }

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

/**
 * Gossip: share our supernode list with all known active supernodes.
 * Each supernode merges the received list into its own registry.
 */
async function gossipSupernodes() {
  const ourList = getActiveSuperNodes();
  const myAddress = process.env.PUBLIC_IP || '';

  for (const [id, node] of supernodeRegistry) {
    if (node.status !== 'active') continue;
    if (node.address === myAddress) continue;

    try {
      await peerRequest(`${node.gatewayUrl}/api/supernodes/gossip`, {
        method: 'POST',
        body: { supernodes: ourList, source: CONFIG.gatewayId },
        timeoutMs: 5000,
      }).catch(() => {});
    } catch {
      // Gossip failures are non-critical
    }
  }
}

// Gossip every 5 minutes
setInterval(gossipSupernodes, 5 * 60 * 1000);

/**
 * Registry sync consumer: pull user registry from other gateways periodically.
 */
async function syncRegistryFromPeers() {
  const myAddress = process.env.PUBLIC_IP || '';

  for (const [id, node] of supernodeRegistry) {
    if (node.status !== 'active') continue;
    if (node.address === myAddress) continue;

    try {
      const resp = await peerRequest(`${node.gatewayUrl}/api/registry/sync`, { timeoutMs: 10000 });

      if (!resp.ok) continue;

      const data = await resp.json();
      if (!data.entries || !Array.isArray(data.entries)) continue;

      let merged = 0;
      for (const entry of data.entries) {
        if (!entry.username || !entry.nodeId || !entry.endpoint) continue;

        const existing = registry.get(entry.username);
        if (!existing) {
          registry.set(entry.username, {
            nodeId: entry.nodeId,
            endpoint: entry.endpoint,
            registeredAt: entry.registeredAt || new Date().toISOString(),
            lastSeen: entry.lastSeen || new Date().toISOString(),
          });
          merged++;
        } else {
          const existingTime = new Date(existing.lastSeen || existing.registeredAt || 0).getTime();
          const incomingTime = new Date(entry.lastSeen || entry.registeredAt || 0).getTime();
          if (incomingTime > existingTime) {
            existing.endpoint = entry.endpoint;
            existing.lastSeen = entry.lastSeen || new Date().toISOString();
            merged++;
          }
        }
      }

      if (merged > 0) {
        saveRegistry();
        console.log(`[RegistrySync] Merged ${merged} entries from ${node.name} (${node.address})`);
      }
    } catch {
      // Sync failures are non-critical
    }
  }
}

// Registry sync every 60 seconds (if enabled or always for secondary gateways)
if (CONFIG.registrySync.enabled || process.env.REGISTRY_SYNC_AUTO === 'true') {
  setInterval(syncRegistryFromPeers, CONFIG.registrySync.syncIntervalMs || 30000);
  console.log('[RegistrySync] Registry sync enabled — pulling from peers every 30s');
}

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
  // Load entries from a JSON file into the in-memory registry; returns count.
  const loadFromFile = (file) => {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [username, info] of Object.entries(data)) {
      registry.set(username, info);
    }
    return registry.size;
  };
  try {
    if (!fs.existsSync(CONFIG.dataDir)) {
      fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }

    if (fs.existsSync(CONFIG.registryFile)) {
      try {
        const count = loadFromFile(CONFIG.registryFile);
        console.log(`[Gateway] Loaded ${count} users from registry`);
      } catch (parseErr) {
        // registry.json can be truncated by an ENOSPC/interrupted write. Recover
        // from the previous-good .bak instead of silently starting empty (which
        // would mark every node offline until each one re-registers).
        console.error("[Gateway] registry.json unreadable, trying backup:", parseErr.message);
        const bak = `${CONFIG.registryFile}.bak`;
        if (fs.existsSync(bak)) {
          const count = loadFromFile(bak);
          console.log(`[Gateway] Recovered ${count} users from registry .bak`);
        } else {
          console.error("[Gateway] No registry .bak available; starting empty");
        }
      }
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
    // Atomic write: keep the prior file as .bak, write to a temp, then rename.
    // A partial/ENOSPC write lands on the temp, never on the live registry, so
    // the live file is never left truncated/corrupt.
    const json = JSON.stringify(data, null, 2);
    const tmp = `${CONFIG.registryFile}.tmp`;
    if (fs.existsSync(CONFIG.registryFile)) {
      try { fs.copyFileSync(CONFIG.registryFile, `${CONFIG.registryFile}.bak`); } catch (e) { /* best-effort backup */ }
    }
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, CONFIG.registryFile);
  } catch (error) {
    console.error("[Gateway] Failed to save registry:", error);
  }
}

/**
 * Serve a user-friendly HTML page when a PC2 node is unreachable.
 * Replaces the infinite "initializing" hang with clear feedback and auto-retry.
 */
function serveNodeOfflinePage(res, username, errorDetail) {
  const safeUser = (username || 'unknown').replace(/[^a-z0-9-]/gi, '');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeUser}.ela.city — Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    .domain { color: #a78bfa; font-weight: 500; }
    .msg { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 16px 0 24px; }
    .retry { display: inline-flex; align-items: center; gap: 8px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; cursor: pointer; text-decoration: none; }
    .retry:hover { background: #6d28d9; }
    .countdown { color: #71717a; font-size: 12px; margin-top: 16px; }
    .hint { color: #52525b; font-size: 12px; margin-top: 24px; border-top: 1px solid #27272a; padding-top: 16px; line-height: 1.5; }
    .hint a { color: #a78bfa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">☁️</div>
    <h1>Node Offline</h1>
    <p class="msg">
      <span class="domain">${safeUser}.ela.city</span> is not reachable right now.<br>
      The node owner needs to have their PC2 running and connected for remote access to work.
    </p>
    <a class="retry" href="/" onclick="location.reload(); return false;">↻ Try Again</a>
    <p class="countdown" id="cd">Auto-retry in <span id="sec">15</span>s</p>
    <p class="hint">
      Node owner? Make sure your PC2 app is running and check your connection in
      <strong>Settings → PC2 Network</strong>.<br>
      Need help? Visit <a href="https://t.me/nicktomlin" target="_blank">Telegram support</a>.
    </p>
  </div>
  <script>
    let s = 15;
    const el = document.getElementById('sec');
    const t = setInterval(() => { s--; el.textContent = s; if (s <= 0) { clearInterval(t); location.reload(); } }, 1000);
  </script>
</body>
</html>`;
  res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Create proxy server for direct HTTP endpoints (Boson relay + WebSocket upgrades)
const proxy = createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

// Separate proxy for WireGuard/direct targets with response compression.
// selfHandleResponse gives us full control over the response stream so we
// can pipe through gzip without fighting http-proxy's internal pipe().
const compressingProxy = createProxyServer({
  changeOrigin: true,
  xfwd: true,
  selfHandleResponse: true,
});

compressingProxy.on("proxyRes", (proxyRes, req, res) => {
  const headers = { ...proxyRes.headers };
  const reqUrl = req.url || '';
  const contentType = headers['content-type'] || '';

  // Cache headers for static assets (only if node didn't set its own)
  if (!headers['cache-control']) {
    for (const rule of Object.values(STATIC_CACHE_RULES)) {
      if (rule.extensions.test(reqUrl)) {
        headers['cache-control'] = `public, max-age=${rule.maxAge}`;
        break;
      }
    }
  }

  const acceptEncoding = req.headers['accept-encoding'] || '';
  const alreadyEncoded = !!headers['content-encoding'];
  const isCompressible = COMPRESSIBLE_TYPES.test(contentType);
  const contentLength = parseInt(headers['content-length'] || '0', 10);
  const tooSmall = contentLength > 0 && contentLength < MIN_COMPRESS_SIZE;
  const supportsGzip = acceptEncoding.includes('gzip');

  if (!alreadyEncoded && isCompressible && !tooSmall && supportsGzip) {
    delete headers['content-length'];
    headers['content-encoding'] = 'gzip';
    headers['vary'] = 'Accept-Encoding';
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(zlib.createGzip({ level: 6 })).pipe(res);
  } else {
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  }
});

compressingProxy.on("error", (err, req, res) => {
  const hostname = req.headers.host?.split(":")[0] || '';
  const username = extractUsername(hostname);
  console.error(`[Proxy] Compressing proxy error for ${username || hostname}: ${err.message}`);

  // On connection-level failures, destroy all free sockets for the target
  // so the agent stops reusing dead connections from rebooted peers.
  if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET" || err.code === "EPIPE" || err.message.includes("socket hang up")) {
    const target = req._proxyTarget || "";
    const freeSockets = keepAliveAgent.freeSockets;
    let flushed = 0;
    for (const [key, sockets] of Object.entries(freeSockets)) {
      if (key.includes(target) || !target) {
        for (const sock of sockets) {
          sock.destroy();
          flushed++;
        }
      }
    }
    if (flushed > 0) {
      console.log(`[Gateway] Flushed ${flushed} stale sockets after ${err.code || err.message}`);
    }
  }

  if (res.writeHead) {
    serveNodeOfflinePage(res, username, err.message);
  }
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

// Handle proxy errors — serve a user-friendly "node offline" page instead of
// hanging on "initializing" or showing a raw JSON error.
proxy.on("error", (err, req, res) => {
  const hostname = req.headers.host?.split(":")[0] || '';
  const username = extractUsername(hostname);
  console.error(`[Proxy] Error for ${username || hostname}: ${err.message}`);
  if (res.writeHead) {
    serveNodeOfflinePage(res, username, err.message);
  }
});

// Cache headers for Boson ActiveProxy responses (no compression -- serial relay
// protocol doesn't benefit and the proxy uses selfHandleResponse:false)
proxy.on("proxyRes", (proxyRes, req) => {
  if (!proxyRes.headers['cache-control']) {
    const reqUrl = req.url || '';
    for (const rule of Object.values(STATIC_CACHE_RULES)) {
      if (rule.extensions.test(reqUrl)) {
        proxyRes.headers['cache-control'] = `public, max-age=${rule.maxAge}`;
        break;
      }
    }
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
  // The Java ActiveProxy server's allocated port accepts plain TCP connections
  // and transparently relays them through the encrypted tunnel to the PC2 node.
  // We just need to HTTP proxy to host:allocatedPort - no custom protocol needed.
  //
  // CRITICAL: Force Connection: close. The Boson ActiveProxy protocol handles one
  // TCP connection at a time per session (DATA packets have no connectionId).
  // HTTP keep-alive would hold the relay open indefinitely, blocking all subsequent
  // browser requests (CSS, JS, images) which queue on the allocated port.
  // Connection: close ensures each request completes its CONNECT→DATA→DISCONNECT
  // cycle so the next queued connection can proceed.
  if (nodeInfo.endpoint.startsWith("proxy://")) {
    const parsed = parseProxyEndpoint(nodeInfo.endpoint);
    if (!parsed) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid proxy endpoint" }));
      return;
    }
    const target = `http://${parsed.host}:${parsed.port}`;
    req.headers['connection'] = 'close';
    delete req.headers['keep-alive'];
    console.log(`[Gateway] Proxying ${username} via ActiveProxy relay: ${target}`);
    proxy.web(req, res, { target });
    return;
  }

  // Direct HTTP proxy (includes WireGuard tunnel endpoints at 10.100.x.x).
  // Uses compressingProxy (selfHandleResponse) for gzip + cache headers,
  // and keep-alive agent to reuse TCP connections to the PC2 node.
  const viaWG = isWireGuardIP(nodeInfo.endpoint);
  console.log(`[Gateway] Proxying ${username} -> ${nodeInfo.endpoint}${viaWG ? ' (WireGuard tunnel)' : ''}`);
  req._proxyTarget = nodeInfo.endpoint;
  compressingProxy.web(req, res, { target: nodeInfo.endpoint, agent: keepAliveAgent });
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
      wireguard: {
        available: isWireGuardAvailable(),
        peers: Object.keys(wgPeers.peers).length,
      },
    }));
    return;
  }

  // dDRM Provisioning: PC2 nodes fetch Chipotle config on first startup.
  // Returns the shared usage API key, PKP ID, API URL, and registered action CIDs.
  // The usage key is scoped to specific Lit Actions + a single PKP — it cannot
  // be used for anything outside the elacity-ddrm group.
  if (url.pathname === "/api/ddrm/provision" && req.method === "GET") {
    const configPath = path.join(process.cwd(), "ddrm-config.json");
    try {
      if (!fs.existsSync(configPath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "dDRM config not provisioned on this supernode" }));
        return;
      }
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(config));
    } catch (err) {
      console.error("[dDRM] Provision error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to read dDRM config" }));
    }
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
      version: "2.0"
    }));
    return;
  }

  // Supernode self-registration: new supernodes announce themselves
  if (url.pathname === "/api/supernodes/register" && req.method === "POST") {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (SUPERNODE_SECRET && data.secret !== SUPERNODE_SECRET) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid secret" }));
          return;
        }

        const err = validateSupernodePayload(data);
        if (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err }));
          return;
        }

        const result = upsertSupernode(data, 'register');
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          action: result.action,
          supernodes: getActiveSuperNodes(),
        }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
    });
    return;
  }

  // Supernode heartbeat: periodic keepalive from running supernodes
  if (url.pathname === "/api/supernodes/heartbeat" && req.method === "POST") {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (!data.id) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "id required" }));
          return;
        }

        const existing = supernodeRegistry.get(data.id);
        if (existing) {
          existing.status = 'active';
          existing.lastHeartbeat = new Date().toISOString();
          if (data.stats) existing.stats = data.stats;
        } else if (data.address && data.gatewayUrl) {
          upsertSupernode(data, 'heartbeat');
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ack: new Date().toISOString() }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
    });
    return;
  }

  // Supernode gossip: receive supernode lists from peers for mesh discovery
  if (url.pathname === "/api/supernodes/gossip" && req.method === "POST") {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (!data.supernodes || !Array.isArray(data.supernodes)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "supernodes array required" }));
          return;
        }

        let added = 0;
        for (const sn of data.supernodes) {
          if (!sn.id || !sn.address || !sn.gatewayUrl) continue;
          if (supernodeRegistry.has(sn.id)) continue;

          const err = validateSupernodePayload(sn);
          if (err) continue;

          upsertSupernode(sn, `gossip:${data.source || 'unknown'}`);
          added++;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          added,
          total: supernodeRegistry.size,
        }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
    });
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

        const normalizedUsername = username.toLowerCase();

        // ====================================================================
        // SEC-INFRA-GW-AUTH (Wave 3) — provisioning-token bootstrap.
        // Also incidentally closes SEC-3e (anyone could re-claim any
        // unused-but-known username pointing at any endpoint URL).
        //
        // Cases:
        //   A. First-ever registration for this username
        //        → mint token, store mapping, return token in response
        //   B. Re-registration WITH valid X-Provisioning-Token
        //        → update endpoint info, return success (token unchanged)
        //   C. Re-registration WITHOUT or WRONG X-Provisioning-Token
        //        → log-only mode: allow + telemetry
        //          strict mode  : 401 (refuse re-claim of someone else's name)
        //   D. Re-registration with NO token bound yet (legacy / pre-Wave 3)
        //        → log-only mode: auto-grandfather (mint + return; one-time
        //          attachment to the existing record so the legitimate owner
        //          gets their token on next boot)
        //          strict mode  : 401 (operator must run reset-token CLI)
        // ====================================================================
        const inboundToken = getProvisioningTokenFromRequest(req);
        const tokenAlreadyMinted = provisioningTokenStore.has(normalizedUsername);
        const usernameAlreadyRegistered = registry.has(normalizedUsername);
        let mintedToken = null;

        if (!usernameAlreadyRegistered && !tokenAlreadyMinted) {
          // Case A — first-ever registration
          mintedToken = provisioningTokenStore.mint(normalizedUsername);
          console.log(`[gw-auth] handler=register username=${normalizedUsername} action=mint-new`);
        } else if (tokenAlreadyMinted) {
          // Case B or C — token exists; verify the inbound matches
          const tokenOk = inboundToken && provisioningTokenStore.verify(inboundToken, normalizedUsername);
          if (!tokenOk) {
            const tokenState = inboundToken ? 'wrong' : 'missing';
            const action = GW_AUTH_REQUIRED ? 'deny' : 'allow';
            console.log(`[gw-auth] handler=register username=${normalizedUsername} token=${tokenState} enforce=${GW_AUTH_REQUIRED} action=${action}`);
            if (GW_AUTH_REQUIRED) {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                error: 'unauthorized',
                message: 'username already claimed; X-Provisioning-Token header required to re-register',
              }));
              return;
            }
          } else {
            console.log(`[gw-auth] handler=register username=${normalizedUsername} token=present action=allow`);
          }
        } else {
          // Case D — legacy registration without a token bound yet
          if (GW_AUTH_REQUIRED) {
            console.log(`[gw-auth] handler=register username=${normalizedUsername} legacy enforce=true action=deny`);
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: 'unauthorized',
              message: 'username has no provisioning token bound; operator must reset',
            }));
            return;
          }
          // Log-only grandfathering: mint a token now and return it once.
          mintedToken = provisioningTokenStore.mint(normalizedUsername);
          console.log(`[gw-auth] handler=register username=${normalizedUsername} action=mint-grandfather`);
        }

        // Store / refresh registration
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

        const responseBody = { success: true, username: normalizedUsername };
        if (mintedToken) {
          // SECURITY: this is the ONLY time the plaintext token leaves the
          // gateway. PC2 client must persist it to disk (mode 0600) before
          // calling any other gateway endpoint. Subsequent re-registrations
          // by the same node will not return the token (Case B above).
          responseBody.provisioningToken = mintedToken;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(responseBody));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // ========================================================================
  // WireGuard Peer Provisioning API
  // ========================================================================

  if (url.pathname === "/api/wg/register" && req.method === "POST") {
    if (!checkRateLimit('register', clientIP)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfter: 60 }));
      return;
    }

    if (!isWireGuardAvailable()) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WireGuard not available on this gateway" }));
      return;
    }

    const serverPubKey = getServerPublicKey();
    if (!serverPubKey) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "WireGuard server key not configured" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { username, nodeId, publicKey } = JSON.parse(body);

        if (!username || !publicKey) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields: username, publicKey" }));
          return;
        }

        // nodeId is optional -- look up from registry if not provided
        const resolvedNodeId = nodeId || (registry.get(username.toLowerCase()) || {}).nodeId || 'unknown';

        // Validate WireGuard public key format (base64, 44 chars with = padding)
        if (!/^[A-Za-z0-9+/]{42,43}=?$/.test(publicKey)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid WireGuard public key format" }));
          return;
        }

        const normalizedUsername = username.toLowerCase();

        // SEC-8 (2026-04 audit) + SEC-INFRA-GW-AUTH: gate every wg/register
        // call (both new and re-key) on the per-node provisioning token.
        // Pre-fix any caller who knew a victim's username could change the
        // peer's public key and steal their tunnel.
        if (!requireProvisioningToken(req, res, normalizedUsername, 'wg/register')) return;

        // Check if this node already has a WireGuard peer assignment
        const existingPeer = wgPeers.peers[normalizedUsername];
        if (existingPeer) {
          // Same node re-registering: update public key if changed
          if (existingPeer.publicKey !== publicKey) {
            removeWGPeer(existingPeer.publicKey);
            existingPeer.publicKey = publicKey;
            existingPeer.lastSeen = new Date().toISOString();
            addWGPeer(publicKey, existingPeer.assignedIP);
            saveWGPeers();
            console.log(`[WireGuard] Updated key for ${normalizedUsername} (${existingPeer.assignedIP})`);
          } else {
            existingPeer.lastSeen = new Date().toISOString();
            addWGPeer(publicKey, existingPeer.assignedIP);
            saveWGPeers();
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            assignedIP: existingPeer.assignedIP,
            serverPublicKey: serverPubKey,
            serverEndpoint: `${getPublicIP()}:${WG_CONFIG.listenPort}`,
            serverIP: WG_CONFIG.serverIP,
          }));
          return;
        }

        // New peer: allocate IP
        const assignedIP = allocateWGIP();

        wgPeers.peers[normalizedUsername] = {
          nodeId: resolvedNodeId,
          publicKey,
          assignedIP,
          registeredAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };

        if (!addWGPeer(publicKey, assignedIP)) {
          delete wgPeers.peers[normalizedUsername];
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to configure WireGuard peer" }));
          return;
        }

        saveWGPeers();
        console.log(`[WireGuard] Registered ${normalizedUsername}: ${assignedIP} (pubkey: ${publicKey.slice(0, 8)}...)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          assignedIP,
          serverPublicKey: serverPubKey,
          serverEndpoint: `${getPublicIP()}:${WG_CONFIG.listenPort}`,
          serverIP: WG_CONFIG.serverIP,
        }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  if (url.pathname === "/api/wg/status" && req.method === "GET") {
    const wgAvailable = isWireGuardAvailable();
    let wgDump = null;

    if (wgAvailable) {
      try {
        const raw = execFileSync('wg', ['show', WG_CONFIG.interface, 'dump'], { stdio: 'pipe', timeout: 5000 }).toString();
        const lines = raw.trim().split('\n');
        // First line is interface info, subsequent lines are peers
        const peers = lines.slice(1).map(line => {
          const parts = line.split('\t');
          return {
            publicKey: parts[0],
            endpoint: parts[2] || 'none',
            latestHandshake: parts[4] ? parseInt(parts[4], 10) : 0,
            transferRx: parts[5] ? parseInt(parts[5], 10) : 0,
            transferTx: parts[6] ? parseInt(parts[6], 10) : 0,
          };
        });
        wgDump = { peerCount: peers.length, peers };
      } catch (error) {
        wgDump = { error: error.message };
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      wireguard: {
        available: wgAvailable,
        interface: WG_CONFIG.interface,
        serverIP: WG_CONFIG.serverIP,
        listenPort: WG_CONFIG.listenPort,
        registeredPeers: Object.keys(wgPeers.peers).length,
        live: wgDump,
      },
    }));
    return;
  }

  if (url.pathname.startsWith("/api/wg/peer/") && req.method === "DELETE") {
    const targetUsername = url.pathname.slice("/api/wg/peer/".length).toLowerCase();

    // SEC-9 (2026-04 audit): pre-fix anyone who knew a victim's username
    // could DELETE their WG peer and boot them off the tunnel. Now the
    // caller must hold the token minted at /api/register time.
    if (!requireProvisioningToken(req, res, targetUsername, 'wg/peer/delete')) return;

    // Per-username delete throttle: even the legit owner is limited to
    // PER_USERNAME_DELETE_MAX deletes per PER_USERNAME_DELETE_WINDOW_MS so
    // a runaway script cannot churn the WG interface for itself either.
    if (!checkPerUsernameDeleteRate(targetUsername)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded for this username", retryAfter: Math.ceil(PER_USERNAME_DELETE_WINDOW_MS / 1000) }));
      return;
    }

    const peer = wgPeers.peers[targetUsername];

    if (!peer) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Peer not found" }));
      return;
    }

    removeWGPeer(peer.publicKey);
    delete wgPeers.peers[targetUsername];
    saveWGPeers();
    console.log(`[WireGuard] Removed peer ${targetUsername} (${peer.assignedIP})`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, removed: targetUsername }));
    return;
  }

  // SEC-9 / Wave 3 follow-up: symmetric DELETE for AmneziaWG. Pre-fix this
  // route did not exist; supernode operators had to SSH in to remove an awg
  // peer. Adding it now (gated identically) keeps the wg/awg surfaces
  // symmetric and stops future drift.
  if (url.pathname.startsWith("/api/awg/peer/") && req.method === "DELETE") {
    const targetUsername = url.pathname.slice("/api/awg/peer/".length).toLowerCase();

    if (!requireProvisioningToken(req, res, targetUsername, 'awg/peer/delete')) return;

    if (!checkPerUsernameDeleteRate(targetUsername)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded for this username", retryAfter: Math.ceil(PER_USERNAME_DELETE_WINDOW_MS / 1000) }));
      return;
    }

    const peer = awgPeers.peers[targetUsername];
    if (!peer) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Peer not found" }));
      return;
    }

    removeAWGPeer(peer.publicKey);
    delete awgPeers.peers[targetUsername];
    saveAWGPeers();
    console.log(`[AmneziaWG] Removed peer ${targetUsername} (${peer.assignedIP})`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, removed: targetUsername }));
    return;
  }

  // ========================================================================
  // AmneziaWG (Stealth) Peer Provisioning API
  // ========================================================================

  if (url.pathname === "/api/awg/register" && req.method === "POST") {
    if (!checkRateLimit('register', clientIP)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfter: 60 }));
      return;
    }

    if (!isAmneziaWGAvailable()) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "AmneziaWG not available on this gateway" }));
      return;
    }

    const awgServerPubKey = getAWGServerPublicKey();
    if (!awgServerPubKey) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "AmneziaWG server key not configured" }));
      return;
    }

    if (!awgObfuscationParams) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "AmneziaWG obfuscation parameters not configured" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { username, nodeId, publicKey } = JSON.parse(body);

        if (!username || !publicKey) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields: username, publicKey" }));
          return;
        }

        if (!/^[A-Za-z0-9+/]{42,43}=?$/.test(publicKey)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid public key format" }));
          return;
        }

        const normalizedUsername = username.toLowerCase();
        const resolvedNodeId = nodeId || (registry.get(normalizedUsername) || {}).nodeId || 'unknown';

        // SEC-8 (2026-04 audit) + SEC-INFRA-GW-AUTH: gate awg/register the
        // same way as wg/register. Same threat: stealing a stealth tunnel
        // is just as bad as stealing a regular one.
        if (!requireProvisioningToken(req, res, normalizedUsername, 'awg/register')) return;

        const existingPeer = awgPeers.peers[normalizedUsername];
        if (existingPeer) {
          if (existingPeer.publicKey !== publicKey) {
            removeAWGPeer(existingPeer.publicKey);
            existingPeer.publicKey = publicKey;
            existingPeer.lastSeen = new Date().toISOString();
            addAWGPeer(publicKey, existingPeer.assignedIP);
            saveAWGPeers();
            console.log(`[AmneziaWG] Updated key for ${normalizedUsername} (${existingPeer.assignedIP})`);
          } else {
            existingPeer.lastSeen = new Date().toISOString();
            addAWGPeer(publicKey, existingPeer.assignedIP);
            saveAWGPeers();
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            assignedIP: existingPeer.assignedIP,
            serverPublicKey: awgServerPubKey,
            serverEndpoint: `${getPublicIP()}:${AWG_CONFIG.listenPort}`,
            serverIP: AWG_CONFIG.serverIP,
            obfuscation: awgObfuscationParams,
          }));
          return;
        }

        const assignedIP = allocateAWGIP();

        awgPeers.peers[normalizedUsername] = {
          nodeId: resolvedNodeId,
          publicKey,
          assignedIP,
          registeredAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };

        if (!addAWGPeer(publicKey, assignedIP)) {
          delete awgPeers.peers[normalizedUsername];
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to configure AmneziaWG peer" }));
          return;
        }

        saveAWGPeers();
        console.log(`[AmneziaWG] Registered ${normalizedUsername}: ${assignedIP} (pubkey: ${publicKey.slice(0, 8)}...)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          assignedIP,
          serverPublicKey: awgServerPubKey,
          serverEndpoint: `${getPublicIP()}:${AWG_CONFIG.listenPort}`,
          serverIP: AWG_CONFIG.serverIP,
          obfuscation: awgObfuscationParams,
        }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  if (url.pathname === "/api/awg/status" && req.method === "GET") {
    const awgAvailable = isAmneziaWGAvailable();
    let awgDump = null;

    if (awgAvailable) {
      try {
        const tool = fs.existsSync('/usr/local/bin/awg') ? 'awg' : 'wg';
        const raw = execFileSync(tool, ['show', AWG_CONFIG.interface, 'dump'], { stdio: 'pipe', timeout: 5000 }).toString();
        const lines = raw.trim().split('\n');
        const peers = lines.slice(1).map(line => {
          const parts = line.split('\t');
          return {
            publicKey: parts[0],
            endpoint: parts[2] || 'none',
            latestHandshake: parts[4] ? parseInt(parts[4], 10) : 0,
            transferRx: parts[5] ? parseInt(parts[5], 10) : 0,
            transferTx: parts[6] ? parseInt(parts[6], 10) : 0,
          };
        });
        awgDump = { peerCount: peers.length, peers };
      } catch (error) {
        awgDump = { error: error.message };
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      amneziaWG: {
        available: awgAvailable,
        interface: AWG_CONFIG.interface,
        serverIP: AWG_CONFIG.serverIP,
        listenPort: AWG_CONFIG.listenPort,
        registeredPeers: Object.keys(awgPeers.peers).length,
        obfuscation: awgObfuscationParams ? true : false,
        live: awgDump,
      },
    }));
    return;
  }

  // ==========================================
  // VLESS Reality API
  // ==========================================

  if (url.pathname === "/api/vless/register" && req.method === "POST") {
    const credentialsFile = '/etc/vless-reality/credentials.json';
    if (!fs.existsSync(credentialsFile)) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "VLESS Reality not configured on this supernode" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { username } = JSON.parse(body);
        if (!username) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "username required" }));
          return;
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
        const normalizedUsername = username.toLowerCase().trim();

        // SEC-2 (2026-04 audit): defence in depth — even though execFileSync
        // below avoids shell interpretation, we still reject any username
        // that does not match the same regex as /api/register so the shell
        // script never sees a path-traversal / control-char payload.
        if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalizedUsername)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid username (must be 3-30 chars, lowercase alphanumeric with _ or -)" }));
          return;
        }

        // SEC-INFRA-GW-AUTH: verify caller owns this username before
        // mutating any per-user resource on this supernode.
        if (!requireProvisioningToken(req, res, normalizedUsername, 'vless/register')) return;

        let uuid;
        const peersFile = '/etc/vless-reality/peers.json';
        const peers = fs.existsSync(peersFile) ? JSON.parse(fs.readFileSync(peersFile, 'utf8')) : { peers: {} };

        if (peers.peers[normalizedUsername]) {
          uuid = peers.peers[normalizedUsername].uuid;
        } else {
          try {
            // SEC-2 fix: execFileSync passes args as an array — no shell, no
            // injection. The username already passed the regex above.
            uuid = execFileSync('/etc/vless-reality/manage-peers.sh', ['add', normalizedUsername], { stdio: 'pipe', timeout: 10000 }).toString().trim();
          } catch (err) {
            console.error('[VLESS] Failed to add peer:', err.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Failed to provision VLESS peer" }));
            return;
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          uuid,
          serverEndpoint: `69.164.241.210:${credentials.listen_port}`,
          serverPublicKey: credentials.public_key,
          shortId: credentials.short_id,
          serverName: credentials.server_name,
        }));
      } catch (err) {
        console.error('[VLESS] Register error:', err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/vless/status" && req.method === "GET") {
    const credentialsFile = '/etc/vless-reality/credentials.json';
    const available = fs.existsSync(credentialsFile) && fs.existsSync('/usr/local/bin/sing-box');
    let peerCount = 0;
    try {
      const peers = JSON.parse(fs.readFileSync('/etc/vless-reality/peers.json', 'utf8'));
      peerCount = Object.keys(peers.peers || {}).length;
    } catch {}

    let processRunning = false;
    try { execFileSync('pgrep', ['-x', 'sing-box'], { stdio: 'pipe' }); processRunning = true; } catch {}

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      vlessReality: {
        available,
        listenPort: 8443,
        registeredPeers: peerCount,
        processRunning,
        serverName: "www.microsoft.com",
      },
    }));
    return;
  }

  // ==========================================
  // dDRM Key Provisioning API
  // Distributes the shared Chipotle usage key + PKP ID to PC2 nodes.
  // The usage key is scoped to the elacity-ddrm group and can only execute
  // pre-registered Lit Actions with the registered PKP — it grants no
  // admin access. The on-chain access check in the Lit Action is the real
  // security gate, not this key.
  // ==========================================

  if (url.pathname === "/api/ddrm/provision" && req.method === "GET") {
    if (!checkRateLimit('register', clientIP)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfter: 60 }));
      return;
    }

    const keyFile = '/etc/pc2/ddrm-api-key';
    const pkpFile = '/etc/pc2/ddrm-pkp-id';

    try {
      if (!fs.existsSync(keyFile)) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "dDRM provisioning not configured on this supernode" }));
        return;
      }

      const apiKey = fs.readFileSync(keyFile, 'utf8').trim();
      const pkpId = fs.existsSync(pkpFile)
        ? fs.readFileSync(pkpFile, 'utf8').trim()
        : '0x68dcf3dc3c38d726e8a7cdca8ab318f49552c05d';

      console.log(`[dDRM] Provisioned API key to ${clientIP}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        version: 2,
        network: 'chipotle',
        apiUrl: 'https://api.chipotle.litprotocol.com',
        usageKey: apiKey,
        pkpId,
        authority: '0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D',
        chain: 'base',
        chainId: 8453,
        rpc: 'https://mainnet.base.org',
        actions: {
          nonMediaEncrypt: 'QmNayE5MYzXcoMS9nvRk6MUo8r4ESLa3i65vHXzuBsnC2b',
          nonMediaDecrypt: 'QmYuh3LQXcC5Ddk7xTV2eR8Xvp1xKNSzqoimqpyM1SSDMC',
          mediaEncrypt: 'QmXgZXJw9pzSeRkVZLtgNzgaxfErKhthv7j7Etge6WNG4u',
          mediaDecrypt: 'QmTPi2w7tSfGb7AzkMDCR6bCdSHkU5v5C6CGJC3sULTZN9',
        },
      }));
    } catch (err) {
      console.error('[dDRM] Provision error:', err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to read dDRM configuration" }));
    }
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

  // proxy:// endpoints: Java server's allocated port accepts plain TCP/WebSocket
  if (nodeInfo.endpoint.startsWith("proxy://")) {
    const parsed = parseProxyEndpoint(nodeInfo.endpoint);
    if (!parsed) {
      socket.destroy();
      return;
    }
    const target = `http://${parsed.host}:${parsed.port}`;
    console.log(`[Gateway] WS upgrade for ${username} via ActiveProxy relay: ${target}`);
    proxy.ws(req, socket, head, { target });
    return;
  }

  const viaWG = isWireGuardIP(nodeInfo.endpoint);
  console.log(`[Gateway] WS upgrade for ${username} -> ${nodeInfo.endpoint}${viaWG ? ' (WireGuard tunnel)' : ''}`);
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

// Initialize WireGuard peer management
loadWGPeers();
if (isWireGuardAvailable()) {
  syncWGPeers();
  console.log(`[WireGuard] Server ready on ${WG_CONFIG.interface} (${WG_CONFIG.serverIP})`);
} else {
  console.log('[WireGuard] Interface not detected - WireGuard endpoints will not be available');
  console.log('[WireGuard] Run scripts/setup-wireguard-server.sh on the supernode to enable');
}

// Initialize AmneziaWG (stealth transport) peer management
loadAWGPeers();
loadAWGParams();
if (isAmneziaWGAvailable()) {
  syncAWGPeers();
  console.log(`[AmneziaWG] Stealth transport ready on ${AWG_CONFIG.interface} (${AWG_CONFIG.serverIP})`);
} else {
  console.log('[AmneziaWG] Interface not detected - stealth endpoints will not be available');
  console.log('[AmneziaWG] Run scripts/setup-amneziawg-server.sh on the supernode to enable');
}

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
console.log(`[Gateway] Proxy endpoint support: http://, proxy://, wireguard (10.100.0.0/16), amneziawg (10.101.0.0/16), vless-reality (port 8443)`);
console.log(`[Gateway] Security: Rate limiting enabled, CORS restricted to *.ela.city`);