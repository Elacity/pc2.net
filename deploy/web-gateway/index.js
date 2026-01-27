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

// Configuration
const CONFIG = {
  httpPort: 80,
  httpsPort: 443,
  domain: "ela.city",
  dataDir: "./data",
  registryFile: "./data/registry.json",
  // Security settings
  enableHttpsRedirect: true,
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
};

// In-memory registry with file persistence
const registry = new Map();

// Rate limiting store
const rateLimitStore = new Map();

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
 */
function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
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

// Active Proxy connection pool (for proxy:// endpoints)
const proxyConnections = new Map();

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
      request.responseChunks.push(data);

      // Check if we've received the full HTTP response
      // This is a simplified check - in production, parse HTTP headers
      const fullData = Buffer.concat(request.responseChunks);
      const responseStr = fullData.toString("utf8");

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
   */
  async relayRequest(req, res) {
    if (!this.connected || !this.socket) {
      throw new Error("Not connected to Active Proxy");
    }

    const connectionId = this.nextConnectionId++;

    // Build HTTP request to send through tunnel
    const httpRequest = this.buildHttpRequest(req);

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(connectionId);
        reject(new Error("Request timeout"));
      }, 30000);

      this.pendingRequests.set(connectionId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        responseChunks: [],
      });

      // Send CONNECT packet
      const connectPayload = this.buildConnectPayload(connectionId, req);
      const connectPacket = encodePacket(PacketType.CONNECT, connectPayload);
      this.socket.write(connectPacket);

      // Send DATA packet with HTTP request
      const dataPayload = Buffer.alloc(4 + httpRequest.length);
      dataPayload.writeUInt32BE(connectionId, 0);
      httpRequest.copy(dataPayload, 4);
      const dataPacket = encodePacket(PacketType.DATA, dataPayload);
      this.socket.write(dataPacket);
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
      }
    }, 30000);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  disconnect() {
    this.stopKeepalive();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
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
 */
async function getProxySession(endpoint) {
  const parsed = parseProxyEndpoint(endpoint);
  if (!parsed) {
    throw new Error(`Invalid proxy endpoint: ${endpoint}`);
  }

  const key = `${parsed.host}:${parsed.port}/${parsed.sessionId}`;

  if (proxyConnections.has(key)) {
    const session = proxyConnections.get(key);
    if (session.connected) {
      return session;
    }
    // Remove stale connection
    proxyConnections.delete(key);
  }

  // Create new session
  const session = new ActiveProxySession(parsed.host, parsed.port, parsed.sessionId);
  await session.connect();
  proxyConnections.set(key, session);

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

  // API routes (main domain only)
  if (!username || hostname === CONFIG.domain || hostname === `www.${CONFIG.domain}`) {
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

  // Look up user in registry
  const nodeInfo = registry.get(username);

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
function handleApiRequest(req, res) {
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

  // Health check
  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
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

  // Lookup user
  if (url.pathname.startsWith("/api/lookup/") && req.method === "GET") {
    const username = url.pathname.slice("/api/lookup/".length);
    const nodeInfo = registry.get(username);

    if (nodeInfo) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ username, ...nodeInfo }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "User not found" }));
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
        registry.set(username.toLowerCase(), {
          nodeId,
          endpoint,
          registered: new Date().toISOString(),
        });

        saveRegistry();

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
function handleUpgrade(req, socket, head) {
  const hostname = req.headers.host?.split(":")[0];
  const username = extractUsername(hostname);

  if (!username) {
    socket.destroy();
    return;
  }

  const nodeInfo = registry.get(username);

  if (!nodeInfo) {
    socket.destroy();
    return;
  }

  // For proxy:// endpoints, WebSocket proxying is not yet supported
  if (nodeInfo.endpoint.startsWith("proxy://")) {
    console.warn(`[Gateway] WebSocket proxying via Active Proxy not yet supported: ${username}`);
    socket.destroy();
    return;
  }

  console.log(`[Gateway] WS upgrade for ${username} -> ${nodeInfo.endpoint}`);
  proxy.ws(req, socket, head, { target: nodeInfo.endpoint });
}

// Load SSL certificates
function loadSSL() {
  const sslDir = "/etc/letsencrypt/live/demo.ela.city";
  const fallbackDir = "./certs";

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