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
import { IPty } from 'node-pty';
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
}
export declare class TerminalService {
    private sessions;
    private userSessions;
    private config;
    private cleanupInterval;
    private effectiveIsolationMode;
    private bubblewrapAvailable;
    constructor(config?: Partial<TerminalConfig>);
    /**
     * Determine the effective isolation mode based on platform and availability
     */
    private determineEffectiveIsolationMode;
    /**
     * Log security warnings based on configuration
     */
    private logSecurityWarnings;
    /**
     * Get the effective isolation mode
     */
    getEffectiveIsolationMode(): IsolationMode;
    /**
     * Check if terminal is available
     */
    isAvailable(): boolean;
    /**
     * Get the shell to use for terminals
     */
    private getShell;
    /**
     * Get the user's home directory within PC2
     */
    private getUserHome;
    /**
     * Create sanitized environment for terminal
     * Removes sensitive variables and sets secure defaults
     */
    private createSafeEnvironment;
    /**
     * Build bubblewrap (bwrap) command for namespace isolation
     */
    private buildBwrapCommand;
    /**
     * Create a new terminal session for a user
     */
    createSession(walletAddress: string, cols?: number, rows?: number): Promise<{
        sessionId: string;
        success: boolean;
        error?: string;
        isolationMode?: IsolationMode;
    }>;
    /**
     * Get a session, verifying ownership
     */
    getSession(sessionId: string, walletAddress: string): TerminalSession | null;
    /**
     * Write data to a terminal
     */
    write(sessionId: string, walletAddress: string, data: string): boolean;
    /**
     * Resize a terminal
     */
    resize(sessionId: string, walletAddress: string, cols: number, rows: number): boolean;
    /**
     * Set up data handler for a terminal
     */
    onData(sessionId: string, walletAddress: string, callback: (data: string) => void): boolean;
    /**
     * Set up exit handler for a terminal
     */
    onExit(sessionId: string, walletAddress: string, callback: (exitCode: number, signal?: number) => void): boolean;
    /**
     * Destroy a terminal session
     */
    destroySession(sessionId: string, walletAddress: string): boolean;
    /**
     * Get all sessions for a user
     */
    getUserSessions(walletAddress: string): TerminalSession[];
    /**
     * Clean up idle sessions
     */
    private cleanupIdleSessions;
    /**
     * Destroy all sessions for a user (on logout)
     */
    destroyAllUserSessions(walletAddress: string): number;
    /**
     * Audit logging
     */
    private logAudit;
    /**
     * Shutdown the service
     */
    shutdown(): void;
    /**
     * Get service statistics
     */
    getStats(): {
        totalSessions: number;
        totalUsers: number;
        sessionsPerUser: Record<string, number>;
        isolationMode: IsolationMode;
        isAvailable: boolean;
    };
}
export declare function getTerminalService(config?: Partial<TerminalConfig>): TerminalService;
export declare function shutdownTerminalService(): void;
//# sourceMappingURL=TerminalService.d.ts.map