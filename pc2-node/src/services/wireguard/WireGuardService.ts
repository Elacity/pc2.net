/**
 * WireGuard Service
 * 
 * Manages a WireGuard tunnel to the PC2 supernode for high-performance
 * NAT traversal. When available, this replaces the Boson ActiveProxy relay
 * with a kernel-level encrypted UDP tunnel that delivers near-localhost speed.
 * 
 * Flow:
 *   1. Check if WireGuard tools are installed on the system
 *   2. Generate or load a persistent keypair
 *   3. Call the supernode's provisioning API to receive an IP assignment
 *   4. Configure and bring up the wg0 interface
 *   5. Periodically verify tunnel health via ping
 *   6. Register http://<wg-ip>:4200 with the gateway
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync, exec } from 'child_process';
import { logger } from '../../utils/logger.js';

export interface WireGuardConfig {
  dataDir: string;
  gatewayUrl: string;
  nodeId: string;
  localPort: number;
}

export interface WGProvisionResponse {
  assignedIP: string;
  serverPublicKey: string;
  serverEndpoint: string;
  serverIP: string;
}

export interface WireGuardStatus {
  available: boolean;
  connected: boolean;
  assignedIP: string | null;
  serverEndpoint: string | null;
  lastHandshake: number | null;
  transferRx: number;
  transferTx: number;
}

const WG_INTERFACE = 'wg0';
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const PROVISION_TIMEOUT_MS = 10_000;

export class WireGuardService {
  private config: WireGuardConfig;
  private wgDir: string;
  private privateKeyPath: string;
  private publicKeyPath: string;
  private provisionPath: string;
  private assignedIP: string | null = null;
  private serverEndpoint: string | null = null;
  private connected = false;
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(config: WireGuardConfig) {
    this.config = config;
    this.wgDir = join(config.dataDir, 'wireguard');
    this.privateKeyPath = join(this.wgDir, 'private.key');
    this.publicKeyPath = join(this.wgDir, 'public.key');
    this.provisionPath = join(this.wgDir, 'provision.json');
  }

  /**
   * Check if WireGuard tools (wg, wg-quick) are installed on this system
   */
  isAvailable(): boolean {
    try {
      execSync('which wg', { stdio: 'pipe' });
      execSync('which wg-quick', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate or load a persistent WireGuard keypair.
   * Keys are stored in the node's data directory and survive reboots.
   */
  ensureKeypair(): { publicKey: string; privateKey: string } {
    if (!existsSync(this.wgDir)) {
      mkdirSync(this.wgDir, { recursive: true });
    }

    if (existsSync(this.privateKeyPath) && existsSync(this.publicKeyPath)) {
      return {
        privateKey: readFileSync(this.privateKeyPath, 'utf8').trim(),
        publicKey: readFileSync(this.publicKeyPath, 'utf8').trim(),
      };
    }

    logger.info('[WireGuard] Generating new keypair...');
    const privateKey = execSync('wg genkey', { stdio: 'pipe' }).toString().trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
      stdio: 'pipe',
      shell: '/bin/sh',
    }).toString().trim();

    writeFileSync(this.privateKeyPath, privateKey + '\n', { mode: 0o600 });
    writeFileSync(this.publicKeyPath, publicKey + '\n', { mode: 0o644 });
    logger.info(`[WireGuard] Keypair generated (pubkey: ${publicKey.slice(0, 8)}...)`);

    return { publicKey, privateKey };
  }

  /**
   * Register with the supernode's WireGuard provisioning API.
   * Returns connection parameters (assigned IP, server public key, endpoint).
   * 
   * Caches provisioning result to disk so a restart doesn't re-allocate IPs.
   */
  async provision(): Promise<WGProvisionResponse> {
    const { publicKey } = this.ensureKeypair();

    // Check cached provision (IP assignment is persistent)
    if (existsSync(this.provisionPath)) {
      try {
        const cached = JSON.parse(readFileSync(this.provisionPath, 'utf8')) as WGProvisionResponse;
        if (cached.assignedIP && cached.serverPublicKey && cached.serverEndpoint) {
          logger.info(`[WireGuard] Using cached provision: ${cached.assignedIP}`);
          return cached;
        }
      } catch {
        logger.warn('[WireGuard] Invalid cached provision, re-provisioning...');
      }
    }

    const url = `${this.config.gatewayUrl}/api/wg/register`;
    logger.info(`[WireGuard] Provisioning via ${url}...`);

    const body = JSON.stringify({
      username: await this.getUsername(),
      nodeId: this.config.nodeId,
      publicKey,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(PROVISION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Provisioning failed (${response.status}): ${errBody}`);
    }

    const data = await response.json() as WGProvisionResponse;
    if (!data.assignedIP || !data.serverPublicKey || !data.serverEndpoint) {
      throw new Error('Invalid provisioning response');
    }

    // Cache for subsequent restarts
    writeFileSync(this.provisionPath, JSON.stringify(data, null, 2));
    logger.info(`[WireGuard] Provisioned: ${data.assignedIP} via ${data.serverEndpoint}`);

    return data;
  }

  /**
   * Configure and bring up the WireGuard interface.
   * 
   * Creates a temporary wg-quick config and activates the tunnel.
   * PersistentKeepalive = 25 keeps the NAT mapping alive.
   */
  async connect(provision?: WGProvisionResponse): Promise<void> {
    if (!provision) {
      provision = await this.provision();
    }

    const { privateKey } = this.ensureKeypair();
    const confPath = join(this.wgDir, `${WG_INTERFACE}.conf`);

    const conf = [
      '[Interface]',
      `Address = ${provision.assignedIP}/32`,
      `PrivateKey = ${privateKey}`,
      '',
      '[Peer]',
      `PublicKey = ${provision.serverPublicKey}`,
      `Endpoint = ${provision.serverEndpoint}`,
      // Only route traffic destined for the supernode's WireGuard subnet
      `AllowedIPs = ${provision.serverIP}/32`,
      'PersistentKeepalive = 25',
    ].join('\n');

    writeFileSync(confPath, conf + '\n', { mode: 0o600 });

    // Bring down any existing interface first
    try {
      execSync(`wg-quick down ${confPath} 2>/dev/null`, { stdio: 'pipe' });
    } catch {
      // Interface may not be up, that's fine
    }

    try {
      execSync(`wg-quick up ${confPath}`, { stdio: 'pipe', timeout: 15_000 });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to bring up WireGuard interface: ${msg}`);
    }

    this.assignedIP = provision.assignedIP;
    this.serverEndpoint = provision.serverEndpoint;
    this.connected = true;

    logger.info(`[WireGuard] Interface ${WG_INTERFACE} up: ${provision.assignedIP}`);

    // Verify tunnel with a ping to the server
    const reachable = await this.pingServer(provision.serverIP);
    if (!reachable) {
      logger.warn('[WireGuard] Server not reachable through tunnel (may need a moment to establish)');
    } else {
      logger.info('[WireGuard] Tunnel verified - server reachable');
    }
  }

  /**
   * Start periodic health monitoring.
   * Pings the supernode through the tunnel every 30s.
   * On failure, marks the tunnel as disconnected so ConnectivityService can fall back.
   */
  startHealthCheck(serverIP: string): void {
    if (this.healthTimer) return;

    this.healthTimer = setInterval(async () => {
      if (!this.connected) return;

      const ok = await this.pingServer(serverIP);
      if (!ok) {
        logger.warn('[WireGuard] Health check failed - tunnel may be down');
        this.connected = false;
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Tear down the WireGuard interface
   */
  async disconnect(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    const confPath = join(this.wgDir, `${WG_INTERFACE}.conf`);
    try {
      execSync(`wg-quick down ${confPath} 2>/dev/null`, { stdio: 'pipe' });
    } catch {
      // May not be up
    }

    this.connected = false;
    logger.info('[WireGuard] Interface down');
  }

  getAssignedIP(): string | null {
    return this.assignedIP;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): WireGuardStatus {
    const status: WireGuardStatus = {
      available: this.isAvailable(),
      connected: this.connected,
      assignedIP: this.assignedIP,
      serverEndpoint: this.serverEndpoint,
      lastHandshake: null,
      transferRx: 0,
      transferTx: 0,
    };

    if (this.connected) {
      try {
        const dump = execSync(`wg show ${WG_INTERFACE} dump`, { stdio: 'pipe' }).toString();
        const lines = dump.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split('\t');
          status.lastHandshake = parts[4] ? parseInt(parts[4], 10) : null;
          status.transferRx = parts[5] ? parseInt(parts[5], 10) : 0;
          status.transferTx = parts[6] ? parseInt(parts[6], 10) : 0;
        }
      } catch {
        // wg show may fail if interface is down
      }
    }

    return status;
  }

  /**
   * Ping the server IP through the tunnel to verify connectivity
   */
  private pingServer(serverIP: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`ping -c 1 -W 3 ${serverIP}`, { timeout: 5000 }, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Read the username from the stored username.json in the data directory.
   * The UsernameService manages this file.
   */
  private async getUsername(): Promise<string> {
    const usernamePath = join(this.config.dataDir, 'username.json');
    if (existsSync(usernamePath)) {
      try {
        const data = JSON.parse(readFileSync(usernamePath, 'utf8'));
        if (data.username) return data.username;
      } catch {
        // Fall through
      }
    }
    throw new Error('No username registered - register a username before enabling WireGuard');
  }
}
