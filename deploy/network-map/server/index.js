/**
 * PC2 Network Map - Main Server
 * 
 * Provides network visualization and statistics for the PC2 decentralized network.
 * Runs on InterServer supernode alongside web-gateway.
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDatabase, getDatabase } from './database.js';
import { DataCollector } from './collector.js';
import { createNodesRouter } from './api/nodes.js';
import { createStatsRouter } from './api/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3100;
const REGISTRY_FILE = process.env.REGISTRY_FILE || '/root/pc2/web-gateway/data/registry.json';
const COLLECTION_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Initialize Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'pc2-network-map',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/nodes', createNodesRouter());
app.use('/api/stats', createStatsRouter());

// Serve static frontend files
app.use(express.static(join(__dirname, '../frontend/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/dist/index.html'));
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`WebSocket client connected. Total: ${clients.size}`);
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected. Total: ${clients.size}`);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast updates to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

// Initialize and start
async function start() {
  try {
    // Initialize database
    await initDatabase();
    console.log('Database initialized');
    
    // Create data collector
    const collector = new DataCollector({
      registryFile: REGISTRY_FILE,
      onUpdate: (stats) => {
        broadcast({ type: 'stats_update', data: stats });
      },
      onNodeChange: (change) => {
        broadcast({ type: 'node_change', data: change });
      }
    });
    
    // Initial collection
    console.log('Running initial data collection...');
    await collector.collect();
    
    // Schedule periodic collection
    setInterval(async () => {
      try {
        await collector.collect();
      } catch (error) {
        console.error('Collection error:', error);
      }
    }, COLLECTION_INTERVAL);
    
    // Start server
    server.listen(PORT, () => {
      console.log(`PC2 Network Map running on port ${PORT}`);
      console.log(`Registry file: ${REGISTRY_FILE}`);
      console.log(`Collection interval: ${COLLECTION_INTERVAL / 1000}s`);
    });
    
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
