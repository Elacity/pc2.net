/**
 * AmneziaWG Service
 * 
 * Manages an obfuscated WireGuard tunnel (AmneziaWG) to the PC2 supernode.
 * Used as a stealth fallback when standard WireGuard is blocked by DPI systems.
 * 
 * AmneziaWG uses the same cryptographic core as WireGuard (ChaCha20-Poly1305)
 * but adds transport-layer obfuscation: randomized headers, padded packets,
 * and junk traffic that make the tunnel undetectable by Deep Packet Inspection.
 * 
 * Runs on a separate interface (awg0) and subnet (10.101.x.x) to coexist
 * with the standard WireGuard tunnel (wg0, 10.100.x.x).
 * 
 * Flow:
 *   1. Check if AmneziaWG tools (awg, awg-quick, amneziawg-go) are installed
 *   2. Generate or load a persistent keypair (same curve25519 as WireGuard)
 *   3. Call the supernode's AWG provisioning API to receive IP + obfuscation params
 *   4. Configure and bring up the awg0 interface with obfuscation
 *   5. Periodically verify tunnel health via ping
 *   6. Register http://<awg-ip>:4200 with the gateway
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync, exec } from 'child_process';
import { logger } from '../../utils/logger.js';

export interface AmneziaWGConfig {
  dataDir: string;
  gatewayUrl: string;
  nodeId: string;
  localPort: number;
}

export interface AWGObfuscationParams {
  Jc: number;
  Jmin: number;
  Jmax: number;
  S1: number;
  S2: number;
  S3: number;
  S4: number;
  H1: number;
  H2: number;
  H3: number;
  H4: number;
  I1?: string;
}

export interface AWGProvisionResponse {
  assignedIP: string;
  serverPublicKey: string;
  serverEndpoint: string;
  serverIP: string;
  obfuscation: AWGObfuscationParams;
}

export interface AmneziaWGStatus {
  available: boolean;
  connected: boolean;
  assignedIP: string | null;
  serverEndpoint: string | null;
  lastHandshake: number | null;
  transferRx: number;
  transferTx: number;
}

const AWG_INTERFACE = 'awg0';
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const PROVISION_TIMEOUT_MS = 10_000;
const HEALTH_FAILURE_THRESHOLD = 3;

export class AmneziaWGService {
  private config: AmneziaWGConfig;
  private awgDir: string;
  private privateKeyPath: string;
  private publicKeyPath: string;
  private provisionPath: string;
  private assignedIP: string | null = null;
  private serverEndpoint: string | null = null;
  private connected = false;
  private healthTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private onTunnelDown: (() => void) | null = null;
  private _available: boolean | null = null;

  constructor(config: AmneziaWGConfig) {
    this.config = config;
    this.awgDir = join(config.dataDir, 'amneziawg');
    this.privateKeyPath = join(this.awgDir, 'private.key');
    this.publicKeyPath = join(this.awgDir, 'public.key');
    this.provisionPath = join(this.awgDir, 'provision.json');
  }

  private static isMacOS = process.platform === 'darwin';

  /**
   * Check if AmneziaWG tools are installed.
   * Requires amneziawg-go (userspace daemon) and awg-quick (interface manager).
   * Falls back to checking if awg tool is available for key generation.
   */
  isAvailable(): boolean {
    if (this._available !== null) return this._available;

    const awgGoPaths = 'which amneziawg-go || test -x /usr/local/bin/amneziawg-go';

    try {
      execSync(awgGoPaths, { stdio: 'pipe', shell: '/bin/sh' });
    } catch {
      this._available = false;
      return false;
    }

    // awg-quick may be installed as awg-quick or at /usr/local/bin/awg-quick
    const awgQuickPaths = 'which awg-quick || test -x /usr/local/bin/awg-quick';
    try {
      execSync(awgQuickPaths, { stdio: 'pipe', shell: '/bin/sh' });
    } catch {
      this._available = false;
      return false;
    }

    this._available = true;
    logger.info('[AmneziaWG] Stealth transport tools detected');
    return true;
  }

  /**
   * Build the awg-quick command string.
   * Sets WG_QUICK_USERSPACE_IMPLEMENTATION to amneziawg-go so awg-quick
   * uses the obfuscated userspace implementation instead of the kernel module.
   */
  private awgQuickCmd(action: 'up' | 'down', confPath: string): string {
    const absConf = resolve(confPath);
    return `sudo awg-quick ${action} ${absConf}`;
  }

  /**
   * Force cleanup of stale AmneziaWG state: bring down the interface,
   * kill orphaned amneziawg-go processes, and remove stale runtime files.
   */
  private forceCleanup(confPath: string): void {
    try {
      execSync(`${this.awgQuickCmd('down', confPath)} 2>/dev/null`, { stdio: 'pipe', shell: '/bin/sh' });
    } catch { /* may not be up */ }
    try {
      execSync('sudo killall amneziawg-go 2>/dev/null', { stdio: 'pipe', shell: '/bin/sh' });
    } catch { /* may not exist */ }
    try {
      execSync('sudo rm -rf /var/run/amneziawg/ 2>/dev/null', { stdio: 'pipe', shell: '/bin/sh' });
    } catch { /* may not exist */ }
  }

  /**
   * Generate or load a persistent keypair.
   * Uses standard wg tools for key generation (same curve25519 format).
   */
  ensureKeypair(): { publicKey: string; privateKey: string } {
    if (!existsSync(this.awgDir)) {
      mkdirSync(this.awgDir, { recursive: true });
    }

    if (existsSync(this.privateKeyPath) && existsSync(this.publicKeyPath)) {
      return {
        privateKey: readFileSync(this.privateKeyPath, 'utf8').trim(),
        publicKey: readFileSync(this.publicKeyPath, 'utf8').trim(),
      };
    }

    logger.info('[AmneziaWG] Generating new keypair...');
    // AmneziaWG uses the same key format as WireGuard
    const keygenTool = this.findTool('awg') || 'wg';
    const privateKey = execSync(`${keygenTool} genkey`, { stdio: 'pipe' }).toString().trim();
    const publicKey = execSync(`echo "${privateKey}" | ${keygenTool} pubkey`, {
      stdio: 'pipe',
      shell: '/bin/sh',
    }).toString().trim();

    writeFileSync(this.privateKeyPath, privateKey + '\n', { mode: 0o600 });
    writeFileSync(this.publicKeyPath, publicKey + '\n', { mode: 0o644 });
    logger.info(`[AmneziaWG] Keypair generated (pubkey: ${publicKey.slice(0, 8)}...)`);

    return { publicKey, privateKey };
  }

  /**
   * Register with the supernode's AmneziaWG provisioning API.
   * Returns connection parameters including obfuscation params.
   */
  async provision(): Promise<AWGProvisionResponse> {
    const { publicKey } = this.ensureKeypair();

    if (existsSync(this.provisionPath)) {
      try {
        const cached = JSON.parse(readFileSync(this.provisionPath, 'utf8')) as AWGProvisionResponse;
        if (cached.assignedIP && cached.serverPublicKey && cached.serverEndpoint && cached.obfuscation) {
          logger.info(`[AmneziaWG] Using cached provision: ${cached.assignedIP}`);
          return cached;
        }
      } catch {
        logger.warn('[AmneziaWG] Invalid cached provision, re-provisioning...');
      }
    }

    const url = `${this.config.gatewayUrl}/api/awg/register`;
    logger.info(`[AmneziaWG] Provisioning via ${url}...`);

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
      throw new Error(`AWG provisioning failed (${response.status}): ${errBody}`);
    }

    const data = await response.json() as AWGProvisionResponse;
    if (!data.assignedIP || !data.serverPublicKey || !data.serverEndpoint || !data.obfuscation) {
      throw new Error('Invalid AWG provisioning response');
    }

    writeFileSync(this.provisionPath, JSON.stringify(data, null, 2));
    logger.info(`[AmneziaWG] Provisioned: ${data.assignedIP} via ${data.serverEndpoint}`);

    return data;
  }

  /**
   * Configure and bring up the AmneziaWG interface with obfuscation params.
   */
  async connect(provision?: AWGProvisionResponse, options?: { endpointOverride?: string }): Promise<void> {
    if (!provision) {
      provision = await this.provision();
    }

    const { privateKey } = this.ensureKeypair();
    const confPath = join(this.awgDir, `${AWG_INTERFACE}.conf`);
    const obf = provision.obfuscation;
    const endpoint = options?.endpointOverride || provision.serverEndpoint;

    const interfaceLines = [
      '[Interface]',
      `Address = ${provision.assignedIP}/32`,
      `PrivateKey = ${privateKey}`,
      'MTU = 1280',
      `Jc = ${obf.Jc}`,
      `Jmin = ${obf.Jmin}`,
      `Jmax = ${obf.Jmax}`,
      `S1 = ${obf.S1}`,
      `S2 = ${obf.S2}`,
      `S3 = ${obf.S3}`,
      `S4 = ${obf.S4}`,
      `H1 = ${obf.H1}`,
      `H2 = ${obf.H2}`,
      `H3 = ${obf.H3}`,
      `H4 = ${obf.H4}`,
    ];

    if (obf.I1) {
      interfaceLines.push(`I1 = ${obf.I1}`);
    }

    const conf = [
      ...interfaceLines,
      '',
      '[Peer]',
      `PublicKey = ${provision.serverPublicKey}`,
      `Endpoint = ${endpoint}`,
      `AllowedIPs = ${provision.serverIP}/32`,
      'PersistentKeepalive = 25',
    ].join('\n');

    writeFileSync(confPath, conf + '\n', { mode: 0o600 });

    // Clean up any existing interface and stale state from previous attempts
    this.forceCleanup(confPath);

    try {
      execSync(this.awgQuickCmd('up', confPath), { stdio: 'pipe', timeout: 15_000, shell: '/bin/sh' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to bring up AmneziaWG interface: ${msg}`);
    }

    this.assignedIP = provision.assignedIP;
    this.serverEndpoint = provision.serverEndpoint;
    this.connected = true;

    logger.info(`[AmneziaWG] Interface ${AWG_INTERFACE} up (stealth mode): ${provision.assignedIP}`);

    const reachable = await this.pingServer(provision.serverIP);
    if (!reachable) {
      logger.warn('[AmneziaWG] Server not reachable through tunnel (may need a moment to establish)');
    } else {
      logger.info('[AmneziaWG] Stealth tunnel verified - server reachable');
    }
  }

  setOnTunnelDown(callback: () => void): void {
    this.onTunnelDown = callback;
  }

  startHealthCheck(serverIP: string): void {
    if (this.healthTimer) return;
    this.consecutiveFailures = 0;

    this.healthTimer = setInterval(async () => {
      if (!this.connected) return;

      const ok = await this.pingServer(serverIP);
      if (ok) {
        if (this.consecutiveFailures > 0) {
          logger.info(`[AmneziaWG] Health check recovered after ${this.consecutiveFailures} failure(s)`);
        }
        this.consecutiveFailures = 0;
        return;
      }

      this.consecutiveFailures++;
      logger.warn(`[AmneziaWG] Health check failed (${this.consecutiveFailures}/${HEALTH_FAILURE_THRESHOLD})`);

      if (this.consecutiveFailures >= HEALTH_FAILURE_THRESHOLD) {
        logger.error('[AmneziaWG] Stealth tunnel declared dead after consecutive failures');
        this.connected = false;
        this.consecutiveFailures = 0;
        if (this.onTunnelDown) {
          this.onTunnelDown();
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  async disconnect(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    const confPath = join(this.awgDir, `${AWG_INTERFACE}.conf`);
    try {
      execSync(`${this.awgQuickCmd('down', confPath)} 2>/dev/null`, { stdio: 'pipe', shell: '/bin/sh' });
    } catch {
      // May not be up
    }

    this.connected = false;
    logger.info('[AmneziaWG] Disconnected');
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

  getStatus(): AmneziaWGStatus {
    return {
      available: this._available === true,
      connected: this.connected,
      assignedIP: this.assignedIP,
      serverEndpoint: this.serverEndpoint,
      lastHandshake: null,
      transferRx: 0,
      transferTx: 0,
    };
  }

  private pingServer(serverIP: string): Promise<boolean> {
    const timeoutFlag = AmneziaWGService.isMacOS ? '-t 3' : '-W 3';
    return new Promise((resolve) => {
      exec(`ping -c 1 ${timeoutFlag} ${serverIP}`, { timeout: 5000 }, (error) => {
        resolve(!error);
      });
    });
  }

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
    throw new Error('No username registered - register a username before enabling AmneziaWG');
  }

  private findTool(name: string): string | null {
    const paths = [`/usr/local/bin/${name}`, `/usr/bin/${name}`, `/opt/homebrew/bin/${name}`];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
    try {
      return execSync(`which ${name} 2>/dev/null`, { stdio: 'pipe' }).toString().trim() || null;
    } catch {
      return null;
    }
  }
}
