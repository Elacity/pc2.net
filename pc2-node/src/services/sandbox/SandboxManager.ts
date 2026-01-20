/**
 * Sandbox Manager
 * 
 * Unified sandbox management for PC2 Node.
 * Provides a single interface for all isolation levels:
 * - Level 0: None (direct PTY, single-user only)
 * - Level 1: Namespace (bubblewrap, multi-user safe)
 * - Level 2: Firecracker (hardware isolation, highest security)
 * 
 * This is a POC implementation. Full Firecracker support requires:
 * - KVM available on host
 * - Firecracker binary installed
 * - Kernel and rootfs images prepared
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import {
  IsolationLevel,
  IsolationCapabilities,
  ResourceLimits,
  FirecrackerConfig,
  SandboxSession,
  SandboxExecRequest,
  SandboxExecResponse,
  ISandboxManager,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_FIRECRACKER_CONFIG,
} from './types.js';

// ============================================================================
// Capability Detection
// ============================================================================

function isLinux(): boolean {
  return os.platform() === 'linux';
}

function checkBubblewrapAvailable(): boolean {
  try {
    execSync('which bwrap', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkKvmAvailable(): boolean {
  if (!isLinux()) return false;
  try {
    return existsSync('/dev/kvm');
  } catch {
    return false;
  }
}

function checkFirecrackerAvailable(config: FirecrackerConfig): boolean {
  if (!config.enabled) return false;
  if (!checkKvmAvailable()) return false;
  
  try {
    // Check binary exists
    if (!existsSync(config.binaryPath)) return false;
    
    // Check kernel and rootfs exist
    if (!existsSync(config.kernelPath)) return false;
    if (!existsSync(config.rootfsPath)) return false;
    
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Sandbox Manager Implementation
// ============================================================================

export class SandboxManager implements ISandboxManager {
  private sessions: Map<string, SandboxSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private capabilities: IsolationCapabilities[] = [];
  private firecrackerConfig: FirecrackerConfig;
  private resourceLimits: ResourceLimits;
  private bestLevel: IsolationLevel = 'none';

  constructor(
    firecrackerConfig: Partial<FirecrackerConfig> = {},
    resourceLimits: Partial<ResourceLimits> = {}
  ) {
    this.firecrackerConfig = { ...DEFAULT_FIRECRACKER_CONFIG, ...firecrackerConfig };
    this.resourceLimits = { ...DEFAULT_RESOURCE_LIMITS, ...resourceLimits };
    
    // Detect capabilities
    this.detectCapabilities();
    
    logger.info('[SandboxManager] Initialized', {
      capabilities: this.capabilities.map(c => ({ level: c.level, available: c.available })),
      bestLevel: this.bestLevel,
      firecrackerEnabled: this.firecrackerConfig.enabled,
    });
  }

  private detectCapabilities(): void {
    const noneAvailable = true; // Always available
    const namespaceAvailable = isLinux() && checkBubblewrapAvailable();
    const firecrackerAvailable = checkFirecrackerAvailable(this.firecrackerConfig);

    this.capabilities = [
      {
        level: 'none',
        available: noneAvailable,
        hasKernelIsolation: false,
        hasMemoryIsolation: false,
        hasNamespaceIsolation: false,
        hasCgroupLimits: false,
        hasNetworkIsolation: false,
      },
      {
        level: 'namespace',
        available: namespaceAvailable,
        reason: !namespaceAvailable 
          ? (isLinux() ? 'bubblewrap not installed' : 'requires Linux') 
          : undefined,
        hasKernelIsolation: false,
        hasMemoryIsolation: false,
        hasNamespaceIsolation: true,
        hasCgroupLimits: this.checkSystemdRunAvailable(),
        hasNetworkIsolation: true, // Can disable network
      },
      {
        level: 'firecracker',
        available: firecrackerAvailable,
        reason: this.getFirecrackerUnavailableReason(),
        hasKernelIsolation: true,
        hasMemoryIsolation: true,
        hasNamespaceIsolation: true,
        hasCgroupLimits: true,
        hasNetworkIsolation: true,
      },
    ];

    // Determine best available level
    if (firecrackerAvailable) {
      this.bestLevel = 'firecracker';
    } else if (namespaceAvailable) {
      this.bestLevel = 'namespace';
    } else {
      this.bestLevel = 'none';
    }
  }

  private checkSystemdRunAvailable(): boolean {
    try {
      execSync('systemd-run --user --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private getFirecrackerUnavailableReason(): string | undefined {
    if (!this.firecrackerConfig.enabled) {
      return 'Firecracker disabled in configuration';
    }
    if (!isLinux()) {
      return 'Firecracker requires Linux';
    }
    if (!checkKvmAvailable()) {
      return 'KVM not available (/dev/kvm)';
    }
    if (!existsSync(this.firecrackerConfig.binaryPath)) {
      return `Firecracker binary not found: ${this.firecrackerConfig.binaryPath}`;
    }
    if (!existsSync(this.firecrackerConfig.kernelPath)) {
      return `Kernel image not found: ${this.firecrackerConfig.kernelPath}`;
    }
    if (!existsSync(this.firecrackerConfig.rootfsPath)) {
      return `Root filesystem not found: ${this.firecrackerConfig.rootfsPath}`;
    }
    return undefined;
  }

  // ============================================================================
  // ISandboxManager Implementation
  // ============================================================================

  async getCapabilities(): Promise<IsolationCapabilities[]> {
    return [...this.capabilities];
  }

  getBestAvailableLevel(): IsolationLevel {
    return this.bestLevel;
  }

  async exec(request: SandboxExecRequest, walletAddress: string): Promise<SandboxExecResponse> {
    const startTime = Date.now();
    const requestedLevel = request.sandbox?.level || this.bestLevel;
    
    // Check if requested level is available
    const capability = this.capabilities.find(c => c.level === requestedLevel);
    if (!capability?.available) {
      // Fall back to best available
      logger.warn(`[SandboxManager] Requested level ${requestedLevel} unavailable, falling back to ${this.bestLevel}`);
    }
    
    const effectiveLevel = capability?.available ? requestedLevel : this.bestLevel;
    const sessionId = request.sandbox?.sessionId || uuidv4();

    try {
      // For POC, we only implement namespace and none levels
      // Firecracker would require full VM lifecycle management
      
      if (effectiveLevel === 'firecracker') {
        // TODO: Implement Firecracker execution
        return {
          success: false,
          exitCode: null,
          stdout: '',
          stderr: 'Firecracker execution not yet implemented',
          duration: Date.now() - startTime,
          error: 'Firecracker support is a proof-of-concept - see FIRECRACKER_POC.md',
          sandbox: {
            level: effectiveLevel,
            sessionId,
            persistent: false,
          },
        };
      }

      // For namespace and none levels, delegate to TerminalService
      // This is a placeholder - actual implementation would use TerminalService
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: 'Use /api/terminal/exec for namespace/none level execution',
        duration: Date.now() - startTime,
        error: 'SandboxManager.exec delegates to TerminalService for namespace/none levels',
        sandbox: {
          level: effectiveLevel,
          sessionId,
          persistent: false,
        },
      };

    } catch (error: any) {
      logger.error('[SandboxManager] Exec error:', error);
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        duration: Date.now() - startTime,
        error: error.message,
        sandbox: {
          level: effectiveLevel,
          sessionId,
          persistent: false,
        },
      };
    }
  }

  async createSession(walletAddress: string, level?: IsolationLevel): Promise<SandboxSession> {
    const effectiveLevel = level || this.bestLevel;
    const sessionId = uuidv4();
    
    const session: SandboxSession = {
      id: sessionId,
      walletAddress: walletAddress.toLowerCase(),
      isolationLevel: effectiveLevel,
      createdAt: new Date(),
      lastActivity: new Date(),
      state: 'active',
      resourceLimits: this.resourceLimits,
    };

    this.sessions.set(sessionId, session);
    
    // Track by user
    if (!this.userSessions.has(walletAddress.toLowerCase())) {
      this.userSessions.set(walletAddress.toLowerCase(), new Set());
    }
    this.userSessions.get(walletAddress.toLowerCase())!.add(sessionId);

    logger.info(`[SandboxManager] Created session ${sessionId} for ${walletAddress.substring(0, 10)}...`);
    
    return session;
  }

  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(walletAddress: string): SandboxSession[] {
    const sessionIds = this.userSessions.get(walletAddress.toLowerCase());
    if (!sessionIds) return [];
    
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is SandboxSession => s !== undefined);
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Clean up based on level
    if (session.isolationLevel === 'firecracker' && session.vmId) {
      // TODO: Terminate Firecracker VM
      logger.info(`[SandboxManager] Would terminate Firecracker VM ${session.vmId}`);
    }

    session.state = 'terminated';
    this.sessions.delete(sessionId);
    
    // Remove from user sessions
    this.userSessions.get(session.walletAddress)?.delete(sessionId);

    logger.info(`[SandboxManager] Terminated session ${sessionId}`);
    return true;
  }

  async terminateAllUserSessions(walletAddress: string): Promise<number> {
    const sessions = this.getUserSessions(walletAddress);
    let terminated = 0;
    
    for (const session of sessions) {
      if (await this.terminateSession(session.id)) {
        terminated++;
      }
    }
    
    return terminated;
  }

  getStats(): {
    totalSessions: number;
    totalVMs: number;
    vmPoolSize: number;
    capabilities: IsolationCapabilities[];
  } {
    const firecrackerSessions = Array.from(this.sessions.values())
      .filter(s => s.isolationLevel === 'firecracker' && s.vmId);

    return {
      totalSessions: this.sessions.size,
      totalVMs: firecrackerSessions.length,
      vmPoolSize: 0, // TODO: Implement VM pool
      capabilities: this.capabilities,
    };
  }

  async shutdown(): Promise<void> {
    logger.info('[SandboxManager] Shutting down...');
    
    // Terminate all sessions
    for (const session of this.sessions.values()) {
      await this.terminateSession(session.id);
    }
    
    logger.info('[SandboxManager] Shutdown complete');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sandboxManagerInstance: SandboxManager | null = null;

export function initSandboxManager(
  firecrackerConfig?: Partial<FirecrackerConfig>,
  resourceLimits?: Partial<ResourceLimits>
): SandboxManager {
  if (sandboxManagerInstance) {
    return sandboxManagerInstance;
  }
  
  sandboxManagerInstance = new SandboxManager(firecrackerConfig, resourceLimits);
  return sandboxManagerInstance;
}

export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    // Initialize with defaults
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}

export function shutdownSandboxManager(): Promise<void> {
  if (sandboxManagerInstance) {
    const instance = sandboxManagerInstance;
    sandboxManagerInstance = null;
    return instance.shutdown();
  }
  return Promise.resolve();
}
