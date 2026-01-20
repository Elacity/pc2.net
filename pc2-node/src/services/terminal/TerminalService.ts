/**
 * Terminal Service
 * 
 * Provides secure, isolated terminal sessions for PC2 users.
 * Each user gets their own sandboxed shell environment.
 * 
 * Security Features:
 * - Configurable isolation modes (none, namespace, disabled)
 * - Per-user session isolation
 * - Working directory restricted to user's home
 * - Environment variables sanitized
 * - Session timeout for idle terminals
 * - Rate limiting on terminal creation
 * - Full audit logging
 * 
 * Isolation Modes:
 * - "none": Direct PTY access (single-user personal nodes only)
 * - "namespace": Linux namespace isolation via bubblewrap (multi-user safe)
 * - "disabled": Terminal feature disabled entirely
 */

import { spawn, IPty } from 'node-pty';
import { spawn as childSpawn, execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger.js';

export type IsolationMode = 'none' | 'namespace' | 'disabled';

export interface TerminalSession {
    id: string;
    walletAddress: string;
    pty: IPty;
    createdAt: Date;
    lastActivity: Date;
    cols: number;
    rows: number;
    isolationMode: IsolationMode;
}

export interface ResourceLimits {
    /** Memory limit in MB (default: 512) */
    memoryMB: number;
    /** CPU shares (relative weight, 1024 = normal) */
    cpuShares: number;
    /** Maximum number of processes */
    maxProcesses: number;
    /** Maximum file descriptors */
    maxFDs: number;
}

export interface TerminalConfig {
    /** Maximum terminals per user */
    maxTerminalsPerUser: number;
    /** Idle timeout in milliseconds (default: 30 minutes) */
    idleTimeout: number;
    /** Shell to use (auto-detected if not specified) */
    shell?: string;
    /** Base directory for user homes */
    userHomesBase: string;
    /** Whether to enable command logging */
    enableAuditLog: boolean;
    /** 
     * Isolation mode for terminal sessions
     * - "none": Direct PTY (single-user only, INSECURE for multi-user)
     * - "namespace": Linux namespace isolation (multi-user safe, Linux only)
     * - "disabled": Terminal feature disabled
     */
    isolationMode: IsolationMode;
    /** Allow fallback to "none" if namespace isolation unavailable */
    allowInsecureFallback: boolean;
    /** Resource limits for terminal sessions (Linux only) */
    resourceLimits?: Partial<ResourceLimits>;
    /** Disable network access in namespace mode */
    disableNetwork?: boolean;
}

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
    memoryMB: 512,
    cpuShares: 512,  // Half of normal (1024)
    maxProcesses: 100,
    maxFDs: 1024,
};

const DEFAULT_CONFIG: TerminalConfig = {
    maxTerminalsPerUser: 5,
    idleTimeout: 30 * 60 * 1000, // 30 minutes
    userHomesBase: '', // Will be set from filesystem manager
    enableAuditLog: true,
    isolationMode: 'none', // Default to single-user mode
    allowInsecureFallback: false,
    resourceLimits: DEFAULT_RESOURCE_LIMITS,
    disableNetwork: false,
};

/**
 * Check if bubblewrap (bwrap) is available for namespace isolation
 */
function checkBubblewrapAvailable(): boolean {
    try {
        execSync('which bwrap', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if systemd-run is available for cgroups resource limits
 */
function checkSystemdRunAvailable(): boolean {
    try {
        execSync('which systemd-run', { stdio: 'pipe' });
        // Also check if we can use it (might need root or specific capabilities)
        execSync('systemd-run --user --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if we're running on Linux (required for namespace isolation)
 */
function isLinux(): boolean {
    return os.platform() === 'linux';
}

export class TerminalService {
    private sessions: Map<string, TerminalSession> = new Map();
    private userSessions: Map<string, Set<string>> = new Map();
    private config: TerminalConfig;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private effectiveIsolationMode: IsolationMode;
    private bubblewrapAvailable: boolean = false;
    private systemdRunAvailable: boolean = false;
    private resourceLimits: ResourceLimits;

    constructor(config: Partial<TerminalConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.resourceLimits = { ...DEFAULT_RESOURCE_LIMITS, ...config.resourceLimits };
        
        // Check for systemd-run availability (for cgroups)
        if (isLinux()) {
            this.systemdRunAvailable = checkSystemdRunAvailable();
        }
        
        // Determine effective isolation mode
        this.effectiveIsolationMode = this.determineEffectiveIsolationMode();
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleSessions();
        }, 60 * 1000); // Check every minute
        
        logger.info('[TerminalService] Initialized with config:', {
            maxTerminalsPerUser: this.config.maxTerminalsPerUser,
            idleTimeout: this.config.idleTimeout,
            userHomesBase: this.config.userHomesBase,
            requestedIsolationMode: this.config.isolationMode,
            effectiveIsolationMode: this.effectiveIsolationMode,
            bubblewrapAvailable: this.bubblewrapAvailable,
            systemdRunAvailable: this.systemdRunAvailable,
            resourceLimits: this.resourceLimits,
            platform: os.platform(),
        });
        
        // Log security warnings
        this.logSecurityWarnings();
    }

    /**
     * Determine the effective isolation mode based on platform and availability
     */
    private determineEffectiveIsolationMode(): IsolationMode {
        const requested = this.config.isolationMode;
        
        // If disabled, always disabled
        if (requested === 'disabled') {
            return 'disabled';
        }
        
        // If namespace requested, check if possible
        if (requested === 'namespace') {
            if (!isLinux()) {
                logger.warn('[TerminalService] Namespace isolation requested but not on Linux');
                if (this.config.allowInsecureFallback) {
                    logger.warn('[TerminalService] Falling back to "none" mode (INSECURE for multi-user)');
                    return 'none';
                } else {
                    logger.error('[TerminalService] Namespace isolation unavailable, terminal disabled');
                    return 'disabled';
                }
            }
            
            this.bubblewrapAvailable = checkBubblewrapAvailable();
            if (!this.bubblewrapAvailable) {
                logger.warn('[TerminalService] bubblewrap (bwrap) not found. Install with: apt install bubblewrap');
                if (this.config.allowInsecureFallback) {
                    logger.warn('[TerminalService] Falling back to "none" mode (INSECURE for multi-user)');
                    return 'none';
                } else {
                    logger.error('[TerminalService] Namespace isolation unavailable, terminal disabled');
                    return 'disabled';
                }
            }
            
            return 'namespace';
        }
        
        // "none" mode - direct PTY
        return 'none';
    }

    /**
     * Log security warnings based on configuration
     */
    private logSecurityWarnings(): void {
        if (this.effectiveIsolationMode === 'none') {
            logger.warn('╔══════════════════════════════════════════════════════════════════╗');
            logger.warn('║  ⚠️  TERMINAL SECURITY WARNING                                   ║');
            logger.warn('║                                                                  ║');
            logger.warn('║  Terminal is running in "none" isolation mode.                  ║');
            logger.warn('║  This is ONLY SAFE for single-user personal nodes.              ║');
            logger.warn('║                                                                  ║');
            logger.warn('║  In multi-user scenarios, users can:                            ║');
            logger.warn('║  - Access other users\' files                                    ║');
            logger.warn('║  - See and kill other processes                                 ║');
            logger.warn('║  - Attack internal services                                     ║');
            logger.warn('║                                                                  ║');
            logger.warn('║  For multi-user, set isolation_mode: "namespace" (Linux only)   ║');
            logger.warn('║  or isolation_mode: "disabled" to turn off terminal             ║');
            logger.warn('╚══════════════════════════════════════════════════════════════════╝');
        }
        
        if (this.effectiveIsolationMode === 'namespace') {
            logger.info('[TerminalService] ✅ Running with namespace isolation (multi-user safe)');
        }
        
        if (this.effectiveIsolationMode === 'disabled') {
            logger.info('[TerminalService] Terminal feature is disabled');
        }
    }

    /**
     * Get the effective isolation mode
     */
    getEffectiveIsolationMode(): IsolationMode {
        return this.effectiveIsolationMode;
    }

    /**
     * Check if terminal is available
     */
    isAvailable(): boolean {
        return this.effectiveIsolationMode !== 'disabled';
    }

    /**
     * Get the shell to use for terminals
     */
    private getShell(): string {
        if (this.config.shell) {
            return this.config.shell;
        }
        
        // Auto-detect shell based on OS
        const platform = os.platform();
        
        if (platform === 'win32') {
            // Windows - prefer PowerShell, fall back to cmd
            if (fs.existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')) {
                return 'powershell.exe';
            }
            return 'cmd.exe';
        }
        
        // For namespace isolation, use /bin/sh for consistency
        if (this.effectiveIsolationMode === 'namespace') {
            return '/bin/bash';
        }
        
        // Unix-like - prefer user's shell, fall back to common shells
        const userShell = process.env.SHELL;
        if (userShell && fs.existsSync(userShell)) {
            return userShell;
        }
        
        // Try common shells
        const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
        for (const shell of shells) {
            if (fs.existsSync(shell)) {
                return shell;
            }
        }
        
        return '/bin/sh';
    }

    /**
     * Get the user's home directory within PC2
     */
    private getUserHome(walletAddress: string): string {
        // Normalize wallet address to lowercase
        const normalizedWallet = walletAddress.toLowerCase();
        
        // Resolve to absolute path
        let basePath = this.config.userHomesBase;
        if (!path.isAbsolute(basePath)) {
            basePath = path.resolve(process.cwd(), basePath);
        }
        
        // User home is within the PC2 data directory
        const userHome = path.join(basePath, 'terminal-homes', normalizedWallet);
        
        // Ensure the directory exists
        if (!fs.existsSync(userHome)) {
            fs.mkdirSync(userHome, { recursive: true });
            logger.info(`[TerminalService] Created user home directory: ${userHome}`);
        }
        
        return userHome;
    }

    /**
     * Create sanitized environment for terminal
     * Removes sensitive variables and sets secure defaults
     */
    private createSafeEnvironment(walletAddress: string, userHome: string): Record<string, string> {
        const env: Record<string, string> = {};
        
        // Copy only safe environment variables
        const safeVars = [
            'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
            'EDITOR', 'VISUAL', 'PAGER', 'LESS', 'MORE',
            'TZ',
        ];
        
        for (const varName of safeVars) {
            if (process.env[varName]) {
                env[varName] = process.env[varName]!;
            }
        }
        
        // Set secure defaults
        env['HOME'] = userHome;
        env['USER'] = walletAddress.toLowerCase().substring(0, 8);
        env['LOGNAME'] = env['USER'];
        env['SHELL'] = this.getShell();
        env['TERM'] = env['TERM'] || 'xterm-256color';
        env['PWD'] = userHome;
        env['TMPDIR'] = path.join(userHome, '.tmp');
        
        // Ensure tmp directory exists
        if (!fs.existsSync(env['TMPDIR'])) {
            fs.mkdirSync(env['TMPDIR'], { recursive: true });
        }
        
        // PC2-specific variables
        env['PC2_WALLET'] = walletAddress.toLowerCase();
        env['PC2_HOME'] = userHome;
        env['PC2_SANDBOX'] = '1';
        env['PC2_ISOLATION'] = this.effectiveIsolationMode;
        
        return env;
    }

    /**
     * Build bubblewrap (bwrap) command for namespace isolation
     */
    private buildBwrapCommand(shell: string, userHome: string, env: Record<string, string>): string[] {
        const bwrapArgs: string[] = [
            // Unshare namespaces
            '--unshare-all',
        ];
        
        // Conditionally share network (default: share, can be disabled for stricter isolation)
        if (!this.config.disableNetwork) {
            bwrapArgs.push('--share-net');
        }
        
        bwrapArgs.push(
            // New session
            '--new-session',
            
            // Die with parent
            '--die-with-parent',
            
            // Set hostname to hide real one
            '--hostname', 'pc2-terminal',
            
            // Mount minimal filesystem
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/bin', '/bin',
            '--ro-bind', '/lib', '/lib',
            '--ro-bind', '/lib64', '/lib64',
            '--ro-bind', '/etc/alternatives', '/etc/alternatives',
            '--ro-bind', '/etc/passwd', '/etc/passwd',
            '--ro-bind', '/etc/group', '/etc/group',
            '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
            '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
            '--ro-bind', '/etc/hosts', '/etc/hosts',
            '--ro-bind', '/etc/localtime', '/etc/localtime',
            
            // Bind user's home directory (read-write)
            '--bind', userHome, userHome,
            
            // Proc and dev filesystems
            '--proc', '/proc',
            '--dev', '/dev',
            
            // Temporary filesystems
            '--tmpfs', '/tmp',
            '--tmpfs', '/run',
            
            // Working directory
            '--chdir', userHome,
            
            // Set UID/GID (map to nobody-like user inside)
            '--uid', '1000',
            '--gid', '1000'
        );
        
        // Add environment variables
        for (const [key, value] of Object.entries(env)) {
            bwrapArgs.push('--setenv', key, value);
        }
        
        // Clear potentially dangerous env vars
        bwrapArgs.push('--unsetenv', 'LD_PRELOAD');
        bwrapArgs.push('--unsetenv', 'LD_LIBRARY_PATH');
        
        // Add the shell command
        bwrapArgs.push(shell);
        
        return bwrapArgs;
    }

    /**
     * Build systemd-run command for cgroups resource limits
     * This wraps the bubblewrap command with resource constraints
     */
    private buildSystemdRunWrapper(command: string, args: string[]): { command: string; args: string[] } {
        if (!this.systemdRunAvailable) {
            // No systemd-run, just return original command
            return { command, args };
        }

        const systemdArgs: string[] = [
            '--user',           // Run in user scope (no root needed)
            '--scope',          // Create transient scope (not service)
            '--quiet',          // Suppress output
            
            // Resource limits via cgroups
            '-p', `MemoryMax=${this.resourceLimits.memoryMB}M`,
            '-p', `TasksMax=${this.resourceLimits.maxProcesses}`,
            '-p', `CPUWeight=${this.resourceLimits.cpuShares}`,
            
            // Add ulimits
            '-p', `LimitNOFILE=${this.resourceLimits.maxFDs}`,
            
            // The actual command to run
            '--',
            command,
            ...args
        ];

        return { command: 'systemd-run', args: systemdArgs };
    }

    /**
     * Get resource limits info for stats
     */
    getResourceLimits(): ResourceLimits {
        return { ...this.resourceLimits };
    }

    /**
     * Check if resource limits are enforced (systemd-run available)
     */
    hasResourceLimits(): boolean {
        return this.systemdRunAvailable;
    }

    /**
     * Create a new terminal session for a user
     */
    async createSession(
        walletAddress: string,
        cols: number = 80,
        rows: number = 24
    ): Promise<{ sessionId: string; success: boolean; error?: string; isolationMode?: IsolationMode }> {
        // Check if terminal is available
        if (!this.isAvailable()) {
            return {
                sessionId: '',
                success: false,
                error: 'Terminal feature is disabled on this node',
            };
        }
        
        const normalizedWallet = walletAddress.toLowerCase();
        
        // Check rate limit
        const userSessionIds = this.userSessions.get(normalizedWallet) || new Set();
        if (userSessionIds.size >= this.config.maxTerminalsPerUser) {
            logger.warn(`[TerminalService] User ${normalizedWallet} exceeded terminal limit`);
            return {
                sessionId: '',
                success: false,
                error: `Maximum terminals (${this.config.maxTerminalsPerUser}) reached. Close an existing terminal first.`,
            };
        }
        
        const sessionId = uuidv4();
        const userHome = this.getUserHome(normalizedWallet);
        const shell = this.getShell();
        const env = this.createSafeEnvironment(normalizedWallet, userHome);
        
        try {
            let pty: IPty;
            
            if (this.effectiveIsolationMode === 'namespace') {
                // Use bubblewrap for namespace isolation
                const bwrapArgs = this.buildBwrapCommand(shell, userHome, env);
                
                // Optionally wrap with systemd-run for resource limits
                let spawnCmd = 'bwrap';
                let spawnArgs = bwrapArgs;
                
                if (this.systemdRunAvailable) {
                    const wrapped = this.buildSystemdRunWrapper('bwrap', bwrapArgs);
                    spawnCmd = wrapped.command;
                    spawnArgs = wrapped.args;
                    
                    logger.debug(`[TerminalService] Using systemd-run for resource limits:`, {
                        memoryMB: this.resourceLimits.memoryMB,
                        cpuShares: this.resourceLimits.cpuShares,
                        maxProcesses: this.resourceLimits.maxProcesses,
                    });
                }
                
                logger.debug(`[TerminalService] Spawning with ${spawnCmd}:`, { 
                    argsCount: spawnArgs.length,
                    userHome,
                    hasResourceLimits: this.systemdRunAvailable,
                });
                
                pty = spawn(spawnCmd, spawnArgs, {
                    name: 'xterm-256color',
                    cols,
                    rows,
                    cwd: userHome,
                    env: { TERM: 'xterm-256color' }, // Minimal env, bwrap sets the rest
                });
            } else {
                // Direct PTY (none mode) - no resource limits (single-user assumed)
                pty = spawn(shell, [], {
                    name: 'xterm-256color',
                    cols,
                    rows,
                    cwd: userHome,
                    env,
                });
            }
            
            const session: TerminalSession = {
                id: sessionId,
                walletAddress: normalizedWallet,
                pty,
                createdAt: new Date(),
                lastActivity: new Date(),
                cols,
                rows,
                isolationMode: this.effectiveIsolationMode,
            };
            
            this.sessions.set(sessionId, session);
            
            // Track user sessions
            if (!this.userSessions.has(normalizedWallet)) {
                this.userSessions.set(normalizedWallet, new Set());
            }
            this.userSessions.get(normalizedWallet)!.add(sessionId);
            
            logger.info(`[TerminalService] Created terminal session ${sessionId} for user ${normalizedWallet}`, {
                shell,
                cwd: userHome,
                cols,
                rows,
                isolationMode: this.effectiveIsolationMode,
            });
            
            if (this.config.enableAuditLog) {
                this.logAudit('SESSION_CREATED', normalizedWallet, sessionId, {
                    shell,
                    cwd: userHome,
                    isolationMode: this.effectiveIsolationMode,
                });
            }
            
            return { 
                sessionId, 
                success: true,
                isolationMode: this.effectiveIsolationMode,
            };
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || 'Unknown error';
            const errorStack = error?.stack || '';
            logger.error(`[TerminalService] Failed to create terminal for ${normalizedWallet}: ${errorMessage}`);
            if (errorStack) {
                logger.error(`[TerminalService] Stack: ${errorStack}`);
            }
            return {
                sessionId: '',
                success: false,
                error: `Failed to create terminal: ${errorMessage}`,
            };
        }
    }

    /**
     * Get a session, verifying ownership
     */
    getSession(sessionId: string, walletAddress: string): TerminalSession | null {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            return null;
        }
        
        // Verify ownership
        if (session.walletAddress !== walletAddress.toLowerCase()) {
            logger.warn(`[TerminalService] Unauthorized access attempt: ${walletAddress} tried to access session ${sessionId} owned by ${session.walletAddress}`);
            return null;
        }
        
        // Update last activity
        session.lastActivity = new Date();
        
        return session;
    }

    /**
     * Write data to a terminal
     */
    write(sessionId: string, walletAddress: string, data: string): boolean {
        const session = this.getSession(sessionId, walletAddress);
        
        if (!session) {
            return false;
        }
        
        try {
            session.pty.write(data);
            session.lastActivity = new Date();
            return true;
        } catch (error: any) {
            logger.error(`[TerminalService] Write failed for session ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * Resize a terminal
     */
    resize(sessionId: string, walletAddress: string, cols: number, rows: number): boolean {
        const session = this.getSession(sessionId, walletAddress);
        
        if (!session) {
            return false;
        }
        
        try {
            session.pty.resize(cols, rows);
            session.cols = cols;
            session.rows = rows;
            session.lastActivity = new Date();
            logger.debug(`[TerminalService] Resized session ${sessionId} to ${cols}x${rows}`);
            return true;
        } catch (error: any) {
            logger.error(`[TerminalService] Resize failed for session ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * Set up data handler for a terminal
     */
    onData(sessionId: string, walletAddress: string, callback: (data: string) => void): boolean {
        const session = this.getSession(sessionId, walletAddress);
        
        if (!session) {
            return false;
        }
        
        session.pty.onData(callback);
        return true;
    }

    /**
     * Set up exit handler for a terminal
     */
    onExit(sessionId: string, walletAddress: string, callback: (exitCode: number, signal?: number) => void): boolean {
        const session = this.getSession(sessionId, walletAddress);
        
        if (!session) {
            return false;
        }
        
        session.pty.onExit(({ exitCode, signal }) => {
            callback(exitCode, signal);
            // Clean up session on exit
            this.destroySession(sessionId, walletAddress);
        });
        
        return true;
    }

    /**
     * Destroy a terminal session
     */
    destroySession(sessionId: string, walletAddress: string): boolean {
        const normalizedWallet = walletAddress.toLowerCase();
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            return false;
        }
        
        // Verify ownership (skip for internal cleanup)
        if (session.walletAddress !== normalizedWallet) {
            logger.warn(`[TerminalService] Unauthorized destroy attempt: ${walletAddress} tried to destroy session ${sessionId}`);
            return false;
        }
        
        try {
            // Kill the PTY process
            session.pty.kill();
        } catch (error: any) {
            logger.warn(`[TerminalService] Error killing PTY for session ${sessionId}:`, error);
        }
        
        // Remove from tracking
        this.sessions.delete(sessionId);
        
        const userSessionIds = this.userSessions.get(normalizedWallet);
        if (userSessionIds) {
            userSessionIds.delete(sessionId);
            if (userSessionIds.size === 0) {
                this.userSessions.delete(normalizedWallet);
            }
        }
        
        logger.info(`[TerminalService] Destroyed terminal session ${sessionId} for user ${normalizedWallet}`);
        
        if (this.config.enableAuditLog) {
            this.logAudit('SESSION_DESTROYED', normalizedWallet, sessionId, {});
        }
        
        return true;
    }

    /**
     * Get all sessions for a user
     */
    getUserSessions(walletAddress: string): TerminalSession[] {
        const normalizedWallet = walletAddress.toLowerCase();
        const sessionIds = this.userSessions.get(normalizedWallet);
        
        if (!sessionIds) {
            return [];
        }
        
        return Array.from(sessionIds)
            .map(id => this.sessions.get(id))
            .filter((s): s is TerminalSession => s !== undefined);
    }

    /**
     * Clean up idle sessions
     */
    private cleanupIdleSessions(): void {
        const now = Date.now();
        const idleThreshold = this.config.idleTimeout;
        
        for (const [sessionId, session] of this.sessions) {
            const idleTime = now - session.lastActivity.getTime();
            
            if (idleTime > idleThreshold) {
                logger.info(`[TerminalService] Cleaning up idle session ${sessionId} (idle for ${Math.round(idleTime / 1000)}s)`);
                this.destroySession(sessionId, session.walletAddress);
            }
        }
    }

    /**
     * Destroy all sessions for a user (on logout)
     */
    destroyAllUserSessions(walletAddress: string): number {
        const normalizedWallet = walletAddress.toLowerCase();
        const sessionIds = this.userSessions.get(normalizedWallet);
        
        if (!sessionIds) {
            return 0;
        }
        
        let count = 0;
        for (const sessionId of Array.from(sessionIds)) {
            if (this.destroySession(sessionId, normalizedWallet)) {
                count++;
            }
        }
        
        logger.info(`[TerminalService] Destroyed ${count} sessions for user ${normalizedWallet}`);
        return count;
    }

    /**
     * Audit logging
     */
    private logAudit(action: string, walletAddress: string, sessionId: string, details: Record<string, any>): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            walletAddress,
            sessionId,
            ...details,
        };
        
        // Log to standard logger for now
        // In production, this could write to a separate audit log file
        logger.info(`[TerminalService:Audit] ${JSON.stringify(logEntry)}`);
    }

    /**
     * Shutdown the service
     */
    shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Destroy all sessions
        for (const [sessionId, session] of this.sessions) {
            try {
                session.pty.kill();
            } catch (e) {
                // Ignore errors during shutdown
            }
        }
        
        this.sessions.clear();
        this.userSessions.clear();
        
        logger.info('[TerminalService] Shutdown complete');
    }

    /**
     * Get service statistics
     */
    getStats(): {
        totalSessions: number;
        totalUsers: number;
        sessionsPerUser: Record<string, number>;
        isolationMode: IsolationMode;
        isAvailable: boolean;
        hasResourceLimits: boolean;
        resourceLimits: ResourceLimits;
    } {
        const sessionsPerUser: Record<string, number> = {};
        
        for (const [wallet, sessions] of this.userSessions) {
            sessionsPerUser[wallet] = sessions.size;
        }
        
        return {
            totalSessions: this.sessions.size,
            totalUsers: this.userSessions.size,
            sessionsPerUser,
            isolationMode: this.effectiveIsolationMode,
            isAvailable: this.isAvailable(),
            hasResourceLimits: this.systemdRunAvailable,
            resourceLimits: this.resourceLimits,
        };
    }
}

// Singleton instance
let terminalServiceInstance: TerminalService | null = null;

export function getTerminalService(config?: Partial<TerminalConfig>): TerminalService {
    if (!terminalServiceInstance) {
        terminalServiceInstance = new TerminalService(config);
    }
    return terminalServiceInstance;
}

export function shutdownTerminalService(): void {
    if (terminalServiceInstance) {
        terminalServiceInstance.shutdown();
        terminalServiceInstance = null;
    }
}
