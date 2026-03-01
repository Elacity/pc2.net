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

export type WireGuardMode = 'kernel' | 'userspace' | 'none';

export interface WireGuardStatus {
  available: boolean;
  mode: WireGuardMode;
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
const HEALTH_FAILURE_THRESHOLD = 3;

export class WireGuardService {
  private config: WireGuardConfig;
  private wgDir: string;
  private privateKeyPath: string;
  private publicKeyPath: string;
  private provisionPath: string;
  private assignedIP: string | null = null;
  private serverEndpoint: string | null = null;
  private connected = false;
  private externalInterface = false;
  private healthTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private onTunnelDown: (() => void) | null = null;
  private _mode: WireGuardMode = 'none';

  constructor(config: WireGuardConfig) {
    this.config = config;
    this.wgDir = join(config.dataDir, 'wireguard');
    this.privateKeyPath = join(this.wgDir, 'private.key');
    this.publicKeyPath = join(this.wgDir, 'public.key');
    this.provisionPath = join(this.wgDir, 'provision.json');
  }

  private static isMacOS = process.platform === 'darwin';

  /**
   * Check if WireGuard tools (wg, wg-quick) are installed on this system.
   * Also detects whether WireGuard runs in kernel mode or userspace.
   * Checks additional paths for macOS (Homebrew on Apple Silicon + Intel).
   */
  isAvailable(): boolean {
    const wgPaths = 'which wg || test -x /usr/bin/wg || test -x /opt/homebrew/bin/wg || test -x /usr/local/bin/wg';
    const wgQuickPaths = 'which wg-quick || test -x /usr/bin/wg-quick || test -x /opt/homebrew/bin/wg-quick || test -x /usr/local/bin/wg-quick';

    try {
      execSync(wgPaths, { stdio: 'pipe', shell: '/bin/sh' });
      execSync(wgQuickPaths, { stdio: 'pipe', shell: '/bin/sh' });
    } catch {
      this._mode = 'none';
      return false;
    }

    this._mode = this.detectMode();
    return this._mode !== 'none';
  }

  /**
   * Determine whether WireGuard will use the kernel module or userspace.
   *
   * - macOS: always userspace (uses built-in utun driver via wg-quick)
   * - Linux: kernel module preferred, wireguard-go as fallback
   */
  private detectMode(): WireGuardMode {
    if (WireGuardService.isMacOS) {
      logger.info('[WireGuard] macOS detected, using userspace mode (utun driver)');
      return 'userspace';
    }

    // Linux: check if kernel module is already loaded
    try {
      const result = execSync('lsmod 2>/dev/null | grep -q wireguard && echo yes || echo no', {
        stdio: 'pipe', shell: '/bin/sh',
      }).toString().trim();
      if (result === 'yes') return 'kernel';
    } catch {
      // lsmod unavailable
    }

    // Check if kernel module exists (loadable or built-in) without requiring root.
    try {
      execSync('modinfo wireguard 2>/dev/null', { stdio: 'pipe' });
      return 'kernel';
    } catch {
      // Module not found -- expected on Jetson with NVIDIA custom kernel
    }

    // Fall back to userspace if wireguard-go is installed
    try {
      execSync('which wireguard-go || test -x /usr/local/bin/wireguard-go', { stdio: 'pipe', shell: '/bin/sh' });
      logger.info('[WireGuard] Kernel module unavailable, using wireguard-go (userspace)');
      return 'userspace';
    } catch {
      logger.warn('[WireGuard] Neither kernel module nor wireguard-go available');
      return 'none';
    }
  }

  /**
   * Build a sudo wg-quick command string.
   * On Linux userspace mode, sets WG_QUICK_USERSPACE_IMPLEMENTATION via sudo -E
   * so wg-quick knows to use wireguard-go instead of the kernel module.
   * On macOS, wg-quick uses the built-in utun driver natively -- no env var needed.
   */
  private wgQuickCmd(action: 'up' | 'down', confPath: string): string {
    if (this._mode === 'userspace' && !WireGuardService.isMacOS) {
      return `WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go sudo -E wg-quick ${action} ${confPath}`;
    }
    return `sudo wg-quick ${action} ${confPath}`;
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
   * First checks if wg0 is already running (e.g. brought up by setup-wireguard-client.sh
   * as root). If so, reuses the existing tunnel without provisioning, which avoids
   * overwriting the registered public key on the supernode with a different keypair.
   * 
   * If the interface is not up, provisions with the supernode API, creates a
   * wg-quick config, and activates the tunnel.
   */
  async connect(provision?: WGProvisionResponse): Promise<void> {
    // Check if the interface is already up (e.g. brought up by setup script as root).
    // If so, skip provisioning entirely to avoid overwriting the registered key
    // with a different keypair from the node's data directory.
    const running = this.getRunningInterfaceInfo();
    if (running) {
      logger.info(`[WireGuard] Interface ${WG_INTERFACE} already up with ${running.assignedIP} -- reusing`);
      this.assignedIP = running.assignedIP;
      this.serverEndpoint = running.serverEndpoint;
      this.connected = true;
      this.externalInterface = true;

      const reachable = await this.pingServer(running.serverIP);
      if (reachable) {
        logger.info('[WireGuard] Tunnel verified - server reachable');
      } else {
        logger.warn('[WireGuard] Interface up but server not reachable via ping (may be filtered)');
      }
      return;
    }

    // Interface not up -- proceed with provisioning and setup
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
      `AllowedIPs = ${provision.serverIP}/32`,
      'PersistentKeepalive = 25',
    ].join('\n');

    writeFileSync(confPath, conf + '\n', { mode: 0o600 });

    try {
      execSync(`${this.wgQuickCmd('down', confPath)} 2>/dev/null`, { stdio: 'pipe', shell: '/bin/sh' });
    } catch {
      // Interface may not be up
    }

    try {
      execSync(this.wgQuickCmd('up', confPath), { stdio: 'pipe', timeout: 15_000, shell: '/bin/sh' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to bring up WireGuard interface: ${msg}`);
    }

    this.assignedIP = provision.assignedIP;
    this.serverEndpoint = provision.serverEndpoint;
    this.connected = true;
    this.externalInterface = false;

    logger.info(`[WireGuard] Interface ${WG_INTERFACE} up (${this._mode} mode): ${provision.assignedIP}`);

    const reachable = await this.pingServer(provision.serverIP);
    if (!reachable) {
      logger.warn('[WireGuard] Server not reachable through tunnel (may need a moment to establish)');
    } else {
      logger.info('[WireGuard] Tunnel verified - server reachable');
    }
  }

  /**
   * Read the current state of the WireGuard interface.
   * Returns connection info if an interface is up with a valid 10.100.x.x IP,
   * or null if no WireGuard interface is active.
   *
   * On Linux: checks wg0 via `ip addr show`
   * On macOS: uses `wg show` to find the active interface, then `ifconfig`
   */
  private getRunningInterfaceInfo(): { assignedIP: string; serverPublicKey: string; serverEndpoint: string; serverIP: string } | null {
    try {
      let assignedIP: string | null = null;
      let iface = WG_INTERFACE;

      if (WireGuardService.isMacOS) {
        // On macOS, wg show interfaces lists active WireGuard interface names (utunN)
        const interfaces = execSync('wg show interfaces 2>/dev/null', { stdio: 'pipe' }).toString().trim();
        if (!interfaces) return null;
        iface = interfaces.split(/\s+/)[0];

        const ifconfigOutput = execSync(`ifconfig ${iface} 2>/dev/null`, { stdio: 'pipe' }).toString();
        const ipMatch = ifconfigOutput.match(/inet (10\.100\.\d+\.\d+)/);
        if (!ipMatch) return null;
        assignedIP = ipMatch[1];
      } else {
        const addrOutput = execSync(`ip addr show ${WG_INTERFACE} 2>/dev/null`, { stdio: 'pipe' }).toString();
        const ipMatch = addrOutput.match(/inet (10\.100\.\d+\.\d+)/);
        if (!ipMatch) return null;
        assignedIP = ipMatch[1];
      }

      const wgOutput = execSync(`wg show ${iface} 2>/dev/null`, { stdio: 'pipe' }).toString();
      const peerKeyMatch = wgOutput.match(/peer:\s+(\S+)/);
      const endpointMatch = wgOutput.match(/endpoint:\s+(\S+)/);
      if (!peerKeyMatch || !endpointMatch) return null;

      const serverEndpoint = endpointMatch[1];
      const serverIP = serverEndpoint.split(':')[0];

      return {
        assignedIP,
        serverPublicKey: peerKeyMatch[1],
        serverEndpoint,
        serverIP,
      };
    } catch {
      return null;
    }
  }

  /**
   * Register a callback that fires when the tunnel is declared dead.
   * ConnectivityService uses this to fall back to Boson and schedule retry.
   */
  setOnTunnelDown(callback: () => void): void {
    this.onTunnelDown = callback;
  }

  /**
   * Start periodic health monitoring.
   * Pings the supernode through the tunnel every 30s.
   * Requires HEALTH_FAILURE_THRESHOLD consecutive failures before declaring
   * the tunnel dead -- a single dropped ping (network blip) won't kill it.
   */
  startHealthCheck(serverIP: string): void {
    if (this.healthTimer) return;
    this.consecutiveFailures = 0;

    this.healthTimer = setInterval(async () => {
      if (!this.connected) return;

      const ok = await this.pingServer(serverIP);
      if (ok) {
        if (this.consecutiveFailures > 0) {
          logger.info(`[WireGuard] Health check recovered after ${this.consecutiveFailures} failure(s)`);
        }
        this.consecutiveFailures = 0;
        return;
      }

      this.consecutiveFailures++;
      logger.warn(`[WireGuard] Health check failed (${this.consecutiveFailures}/${HEALTH_FAILURE_THRESHOLD})`);

      if (this.consecutiveFailures >= HEALTH_FAILURE_THRESHOLD) {
        logger.error('[WireGuard] Tunnel declared dead after consecutive failures');
        this.connected = false;
        this.consecutiveFailures = 0;
        if (this.onTunnelDown) {
          this.onTunnelDown();
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Tear down the WireGuard interface.
   * Skips teardown if the interface was brought up externally (e.g. by the
   * setup script as root) since the node process likely lacks permissions.
   */
  async disconnect(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    if (!this.externalInterface) {
      const confPath = join(this.wgDir, `${WG_INTERFACE}.conf`);
      try {
        execSync(`${this.wgQuickCmd('down', confPath)} 2>/dev/null`, { stdio: 'pipe', shell: '/bin/sh' });
      } catch {
        // May not be up
      }
    } else {
      logger.info('[WireGuard] Skipping interface teardown (externally managed)');
    }

    this.connected = false;
    this.externalInterface = false;
    logger.info('[WireGuard] Disconnected');
  }

  getAssignedIP(): string | null {
    return this.assignedIP;
  }

  getServerIP(): string | null {
    if (!this.serverEndpoint) return null;
    return this.serverEndpoint.split(':')[0];
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): WireGuardStatus {
    const status: WireGuardStatus = {
      available: this._mode !== 'none',
      mode: this._mode,
      connected: this.connected,
      assignedIP: this.assignedIP,
      serverEndpoint: this.serverEndpoint,
      lastHandshake: null,
      transferRx: 0,
      transferTx: 0,
    };

    if (this.connected) {
      try {
        const iface = this.getActiveInterface();
        const dump = execSync(`wg show ${iface} dump`, { stdio: 'pipe' }).toString();
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
   * Get the name of the active WireGuard interface.
   * On Linux this is always 'wg0'; on macOS it's a utunN interface.
   */
  private getActiveInterface(): string {
    if (WireGuardService.isMacOS) {
      try {
        const interfaces = execSync('wg show interfaces 2>/dev/null', { stdio: 'pipe' }).toString().trim();
        if (interfaces) return interfaces.split(/\s+/)[0];
      } catch { /* fall through */ }
    }
    return WG_INTERFACE;
  }

  /**
   * Ping the server IP through the tunnel to verify connectivity.
   * macOS uses -t for timeout in seconds; Linux uses -W.
   */
  private pingServer(serverIP: string): Promise<boolean> {
    const timeoutFlag = WireGuardService.isMacOS ? '-t 3' : '-W 3';
    return new Promise((resolve) => {
      exec(`ping -c 1 ${timeoutFlag} ${serverIP}`, { timeout: 5000 }, (error) => {
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
