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
    restart_delay: 5000,      // Wait 5 seconds between restarts
    max_restarts: 10,         // Max 10 restarts before giving up
    min_uptime: 10000,        // Must run 10s to count as successful start
    kill_timeout: 10000,      // Wait 10s for graceful shutdown
    
    // Environment
    env: {
      NODE_ENV: "production",
      PORT: "4200"
    },
    
    // Logging
    error_file: "./logs/pc2-error.log",
    out_file: "./logs/pc2-out.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
};
