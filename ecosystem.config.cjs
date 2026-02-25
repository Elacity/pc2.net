/**
 * PM2 Ecosystem Configuration
 * 
 * This config runs node DIRECTLY instead of through npm to prevent
 * orphaned processes on restart. When PM2 kills the process, it kills
 * the actual node process, not just an npm wrapper.
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 stop pc2
 */
module.exports = {
  apps: [{
    name: "pc2",
    cwd: "./pc2-node",
    script: "dist/index.js",
    interpreter: "node",
    
    // Restart behavior - prevents port conflicts from rapid restarts
    restart_delay: 10000,     // Wait 10 seconds between restarts (ports need time to release)
    max_restarts: 10,         // Max 10 restarts before giving up
    min_uptime: 30000,        // Must run 30s to count as successful start
    kill_timeout: 15000,      // Wait 15s for graceful shutdown
    
    // Node.js options for large file handling and IPFS performance
    node_args: "--max-old-space-size=2048",
    
    // Environment
    env: {
      NODE_ENV: "production",
      PORT: "4200",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
    },
    
    // Logging - PM2 defaults are fine, logs go to ~/.pm2/logs/
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
};
