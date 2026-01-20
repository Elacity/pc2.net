/**
 * Sandbox Types and Interfaces
 * 
 * Type definitions for the unified sandbox system supporting
 * multiple isolation levels: none, namespace (bubblewrap), and firecracker.
 */

// ============================================================================
// Isolation Levels
// ============================================================================

export type IsolationLevel = 'none' | 'namespace' | 'firecracker';

export interface IsolationCapabilities {
  level: IsolationLevel;
  available: boolean;
  reason?: string;
  
  // Level-specific capabilities
  hasKernelIsolation: boolean;    // true for firecracker
  hasMemoryIsolation: boolean;    // true for firecracker
  hasNamespaceIsolation: boolean; // true for namespace, firecracker
  hasCgroupLimits: boolean;       // true if systemd-run available
  hasNetworkIsolation: boolean;   // true if network disabled
}

// ============================================================================
// Resource Limits
// ============================================================================

export interface ResourceLimits {
  /** Memory limit in MB */
  memoryMB: number;
  
  /** CPU weight (1-1024, 1024 = normal) */
  cpuShares: number;
  
  /** Maximum number of processes/tasks */
  maxProcesses: number;
  
  /** Maximum file descriptors */
  maxFDs: number;
  
  /** Maximum disk usage in MB (for firecracker) */
  maxDiskMB?: number;
  
  /** Maximum network bandwidth in Mbps (for firecracker) */
  maxNetworkMbps?: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  memoryMB: 512,
  cpuShares: 512,
  maxProcesses: 100,
  maxFDs: 1024,
  maxDiskMB: 1024,
  maxNetworkMbps: 10,
};

// ============================================================================
// Firecracker Configuration
// ============================================================================

export interface FirecrackerConfig {
  /** Enable Firecracker isolation (requires KVM) */
  enabled: boolean;
  
  /** Path to Firecracker binary */
  binaryPath: string;
  
  /** Path to jailer binary (optional, for additional isolation) */
  jailerPath?: string;
  
  /** Use jailer for VMM isolation (recommended for production) */
  useJailer: boolean;
  
  /** Path to kernel image (vmlinux) */
  kernelPath: string;
  
  /** Kernel boot arguments */
  kernelArgs?: string;
  
  /** Path to root filesystem image (ext4) */
  rootfsPath: string;
  
  /** Number of virtual CPUs per VM */
  vcpuCount: number;
  
  /** Memory size per VM in MiB */
  memSizeMib: number;
  
  /** Enable network for VMs */
  enableNetwork: boolean;
  
  /** Host network interface for TAP (if enableNetwork) */
  hostInterface?: string;
  
  /** VM boot timeout in milliseconds */
  bootTimeoutMs: number;
  
  /** Idle timeout before VM termination in milliseconds */
  idleTimeoutMs: number;
  
  /** Pre-warm pool size (number of ready VMs to keep) */
  poolSize: number;
  
  /** Maximum VMs per user */
  maxVmsPerUser: number;
}

export const DEFAULT_FIRECRACKER_CONFIG: FirecrackerConfig = {
  enabled: false,
  binaryPath: '/usr/local/bin/firecracker',
  jailerPath: '/usr/local/bin/jailer',
  useJailer: true,
  kernelPath: '/var/lib/pc2/firecracker/vmlinux',
  kernelArgs: 'console=ttyS0 reboot=k panic=1 pci=off',
  rootfsPath: '/var/lib/pc2/firecracker/rootfs.ext4',
  vcpuCount: 1,
  memSizeMib: 512,
  enableNetwork: false,
  bootTimeoutMs: 5000,
  idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
  poolSize: 0,
  maxVmsPerUser: 2,
};

// ============================================================================
// VM State and Lifecycle
// ============================================================================

export type VMState = 
  | 'creating'
  | 'booting'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface VMInfo {
  id: string;
  walletAddress: string;
  state: VMState;
  
  // Configuration
  vcpuCount: number;
  memSizeMib: number;
  enableNetwork: boolean;
  
  // Timing
  createdAt: Date;
  bootedAt?: Date;
  lastActivity: Date;
  
  // Resources
  cpuUsagePercent?: number;
  memoryUsedMib?: number;
  
  // Communication
  apiSocket?: string;
  consoleSocket?: string;
  
  // Error info
  error?: string;
}

// ============================================================================
// Sandbox Session
// ============================================================================

export interface SandboxSession {
  id: string;
  walletAddress: string;
  isolationLevel: IsolationLevel;
  
  // Timing
  createdAt: Date;
  lastActivity: Date;
  
  // State
  state: 'active' | 'idle' | 'terminated';
  
  // Resources used
  resourceLimits: ResourceLimits;
  
  // VM info (for firecracker level)
  vmId?: string;
  vmInfo?: VMInfo;
  
  // PTY info (for none/namespace level)
  ptyPid?: number;
}

// ============================================================================
// Execution Request/Response
// ============================================================================

export interface SandboxExecRequest {
  /** Command to execute */
  command: string;
  
  /** Command arguments */
  args?: string[];
  
  /** Working directory (relative to user home) */
  cwd?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Execution timeout in milliseconds */
  timeout?: number;
  
  /** Run command in shell */
  shell?: boolean;
  
  /** Sandbox options */
  sandbox?: {
    /** Isolation level (auto-selects best available if not specified) */
    level?: IsolationLevel;
    
    /** Keep session alive between calls (for firecracker) */
    persistent?: boolean;
    
    /** Session ID to reuse (if persistent) */
    sessionId?: string;
    
    /** Custom resource limits */
    limits?: Partial<ResourceLimits>;
  };
}

export interface SandboxExecResponse {
  /** Whether command succeeded (exit code 0) */
  success: boolean;
  
  /** Exit code of the command */
  exitCode: number | null;
  
  /** Standard output */
  stdout: string;
  
  /** Standard error */
  stderr: string;
  
  /** Execution duration in milliseconds */
  duration: number;
  
  /** True if killed due to timeout */
  killed?: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** Sandbox info */
  sandbox: {
    /** Isolation level used */
    level: IsolationLevel;
    
    /** Session ID (for persistent sessions) */
    sessionId: string;
    
    /** VM ID (for firecracker) */
    vmId?: string;
    
    /** VM boot time in ms (for firecracker) */
    bootTime?: number;
    
    /** Whether session is persistent */
    persistent: boolean;
  };
}

// ============================================================================
// Sandbox Manager Interface
// ============================================================================

export interface ISandboxManager {
  /** Get available isolation capabilities */
  getCapabilities(): Promise<IsolationCapabilities[]>;
  
  /** Get the best available isolation level */
  getBestAvailableLevel(): IsolationLevel;
  
  /** Execute a command in sandbox */
  exec(request: SandboxExecRequest, walletAddress: string): Promise<SandboxExecResponse>;
  
  /** Create a persistent session */
  createSession(walletAddress: string, level?: IsolationLevel): Promise<SandboxSession>;
  
  /** Get session info */
  getSession(sessionId: string): SandboxSession | undefined;
  
  /** List user's sessions */
  getUserSessions(walletAddress: string): SandboxSession[];
  
  /** Terminate a session */
  terminateSession(sessionId: string): Promise<boolean>;
  
  /** Terminate all user sessions */
  terminateAllUserSessions(walletAddress: string): Promise<number>;
  
  /** Get service stats */
  getStats(): {
    totalSessions: number;
    totalVMs: number;
    vmPoolSize: number;
    capabilities: IsolationCapabilities[];
  };
  
  /** Shutdown the sandbox manager */
  shutdown(): Promise<void>;
}

// ============================================================================
// Firecracker API Types (for VMM communication)
// ============================================================================

/** Firecracker machine configuration */
export interface FCMachineConfig {
  vcpu_count: number;
  mem_size_mib: number;
  smt?: boolean;
  track_dirty_pages?: boolean;
}

/** Firecracker boot source configuration */
export interface FCBootSource {
  kernel_image_path: string;
  boot_args?: string;
  initrd_path?: string;
}

/** Firecracker drive configuration */
export interface FCDrive {
  drive_id: string;
  path_on_host: string;
  is_root_device: boolean;
  is_read_only: boolean;
  partuuid?: string;
  cache_type?: 'Unsafe' | 'Writeback';
}

/** Firecracker network interface configuration */
export interface FCNetworkInterface {
  iface_id: string;
  guest_mac?: string;
  host_dev_name: string;
  rx_rate_limiter?: FCRateLimiter;
  tx_rate_limiter?: FCRateLimiter;
}

/** Firecracker rate limiter */
export interface FCRateLimiter {
  bandwidth?: {
    size: number;
    refill_time: number;
    one_time_burst?: number;
  };
  ops?: {
    size: number;
    refill_time: number;
    one_time_burst?: number;
  };
}

/** Firecracker vsock configuration */
export interface FCVsock {
  guest_cid: number;
  uds_path: string;
}

/** Firecracker instance info response */
export interface FCInstanceInfo {
  id: string;
  state: 'Not started' | 'Running' | 'Paused';
  vmm_version: string;
  app_name: string;
}

/** Firecracker action request */
export interface FCInstanceAction {
  action_type: 'FlushMetrics' | 'InstanceStart' | 'SendCtrlAltDel';
}
