/**
 * Username Service
 *
 * Registers and manages username with the PC2 Web Gateway.
 * - Registers username.ela.city → this node
 * - Handles registration, update, and lookup
 * - Persists username locally
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import type { GatewayTokenStore } from '../gateway/GatewayTokenStore.js';

export interface UsernameConfig {
    dataDir: string; // Directory to store username config
    gatewayUrl: string; // Web Gateway URL (e.g., https://demo.ela.city)
    secondaryGatewayUrls?: string[]; // Additional gateways for dual-write registration
    publicDomain?: string; // Public domain for URLs (e.g., ela.city)
    nodeEndpoint?: string; // This node's endpoint (for super node registration)
    gatewayTokenStore?: GatewayTokenStore; // SEC-INFRA-GW-AUTH (Wave 3): per-gateway provisioning tokens
}

export interface UsernameInfo {
    username: string;
    nodeId: string;
    endpoint: string;
    registeredAt: string;
    gatewayUrl: string;
    publicUrl: string; // e.g., https://alice.ela.city
}

interface UsernameStorage {
    username: string | null;
    registeredAt: string | null;
}

export class UsernameService {
    private config: UsernameConfig;
    private storagePath: string;
    private storage: UsernameStorage;
    private nodeId: string | null = null;

    constructor (config: UsernameConfig) {
        this.config = config;
        this.storagePath = join(config.dataDir, 'username.json');
        this.storage = this.loadStorage();
    }

    /**
   * Initialize with node identity
   */
    setNodeId (nodeId: string): void {
        this.nodeId = nodeId;
    }

    /**
   * Load username storage
   */
    private loadStorage (): UsernameStorage {
        if ( existsSync(this.storagePath) ) {
            try {
                const content = readFileSync(this.storagePath, 'utf8');
                return JSON.parse(content);
            } catch ( error ) {
                logger.warn('Failed to load username storage, starting fresh');
            }
        }
        return { username: null, registeredAt: null };
    }

    /**
   * Save username storage
   */
    private saveStorage (): void {
        writeFileSync(this.storagePath, JSON.stringify(this.storage, null, 2));
    }

    /**
   * Register a username with the Web Gateway
   */
    async register (username: string): Promise<{ success: boolean; error?: string; publicUrl?: string }> {
        if ( ! this.nodeId ) {
            return { success: false, error: 'Node identity not initialized' };
        }

        // Validate username
        const validation = this.validateUsername(username);
        if ( ! validation.valid ) {
            return { success: false, error: validation.error };
        }

        try {
            const url = `${this.config.gatewayUrl}/api/register`;
            logger.info(`[UsernameService] Registering at URL: ${url}`);

            // SEC-INFRA-GW-AUTH (Wave 3): include any previously stored
            // provisioning token for this gateway. On the very first
            // registration the store will be empty (header omitted) and the
            // gateway will mint + return a fresh token in the response body.
            // On subsequent boots the gateway re-verifies the token before
            // accepting the (nodeId, endpoint) update.
            const jsonHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            const headers = this.config.gatewayTokenStore
                ? this.config.gatewayTokenStore.headersFor(this.config.gatewayUrl, jsonHeaders)
                : jsonHeaders;

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    username: username.toLowerCase(),
                    nodeId: this.nodeId,
                    endpoint: this.config.nodeEndpoint || 'http://127.0.0.1:4200',
                }),
            });

            logger.info(`[UsernameService] Response status: ${response.status}`);
            const data = await response.json() as any;
            // Avoid logging the plaintext token if the gateway returned one.
            const dataForLog = data && data.provisioningToken
                ? { ...data, provisioningToken: '[redacted]' }
                : data;
            logger.info(`[UsernameService] Response data: ${JSON.stringify(dataForLog)}`);

            if ( response.ok && data.success ) {
                this.storage.username = username.toLowerCase();
                this.storage.registeredAt = new Date().toISOString();
                this.saveStorage();

                // Persist the freshly minted token (if any) before returning.
                if ( data.provisioningToken && this.config.gatewayTokenStore ) {
                    this.config.gatewayTokenStore.set(this.config.gatewayUrl, data.provisioningToken);
                }

                const publicUrl = this.getPublicUrl(username);
                logger.info(`✅ Username registered: ${publicUrl}`);

                this.dualWriteToSecondaries({
                    username: username.toLowerCase(),
                    nodeId: this.nodeId,
                    endpoint: this.config.nodeEndpoint || 'http://127.0.0.1:4200',
                });

                return { success: true, publicUrl };
            } else {
                return { success: false, error: data.error || 'Registration failed' };
            }
        } catch ( error ) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to register username: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
   * Update endpoint for existing username
   */
    async updateEndpoint (endpoint: string): Promise<{ success: boolean; error?: string }> {
        if ( ! this.storage.username ) {
            return { success: false, error: 'No username registered' };
        }

        if ( ! this.nodeId ) {
            return { success: false, error: 'Node identity not initialized' };
        }

        try {
            const jsonHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            const headers = this.config.gatewayTokenStore
                ? this.config.gatewayTokenStore.headersFor(this.config.gatewayUrl, jsonHeaders)
                : jsonHeaders;

            const response = await fetch(`${this.config.gatewayUrl}/api/register`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    username: this.storage.username,
                    nodeId: this.nodeId,
                    endpoint: endpoint,
                }),
            });

            const data = await response.json() as any;

            if ( response.ok && data.success ) {
                // Defensive: if the gateway returned a token (Case D grandfather
                // path), capture it so the next boot uses the new credentials.
                if ( data.provisioningToken && this.config.gatewayTokenStore ) {
                    this.config.gatewayTokenStore.set(this.config.gatewayUrl, data.provisioningToken);
                }
                logger.info(`✅ Endpoint updated for ${this.storage.username}`);

                this.dualWriteToSecondaries({
                    username: this.storage.username,
                    nodeId: this.nodeId!,
                    endpoint,
                });

                return { success: true };
            } else {
                return { success: false, error: data.error || 'Update failed' };
            }
        } catch ( error ) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }

    /**
   * Fire-and-forget registration to all secondary gateways.
   * Failures are logged but never block the caller.
   */
    private dualWriteToSecondaries (payload: { username: string; nodeId: string; endpoint: string }): void {
        const urls = this.config.secondaryGatewayUrls;
        if ( !urls || urls.length === 0 ) return;

        for ( const baseUrl of urls ) {
            // SEC-INFRA-GW-AUTH (Wave 3): each supernode mints its own token
            // independently. Send any token we already have for this baseUrl
            // (re-registration), then capture any new token returned (first-
            // ever registration on this secondary).
            const jsonHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            const headers = this.config.gatewayTokenStore
                ? this.config.gatewayTokenStore.headersFor(baseUrl, jsonHeaders)
                : jsonHeaders;

            fetch(`${baseUrl}/api/register`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000),
            })
                .then(async (res) => {
                    if ( res.ok ) {
                        try {
                            const data = await res.json() as any;
                            if ( data && data.provisioningToken && this.config.gatewayTokenStore ) {
                                this.config.gatewayTokenStore.set(baseUrl, data.provisioningToken);
                            }
                        } catch {
                            // Body parse failures are harmless here — the token (if any)
                            // will be re-issued on the next dual-write attempt.
                        }
                        logger.info(`[DualWrite] Replicated ${payload.username} to ${baseUrl}`);
                    } else {
                        logger.warn(`[DualWrite] ${baseUrl} responded ${res.status}`);
                    }
                })
                .catch((err) => {
                    logger.warn(`[DualWrite] ${baseUrl} unreachable: ${err instanceof Error ? err.message : err}`);
                });
        }
    }

    /**
   * Look up a username
   */
    async lookup (username: string): Promise<UsernameInfo | null> {
        try {
            const response = await fetch(`${this.config.gatewayUrl}/api/lookup/${username.toLowerCase()}`);

            if ( ! response.ok ) {
                return null;
            }

            const data = await response.json() as any;

            return {
                username: data.username,
                nodeId: data.nodeId,
                endpoint: data.endpoint,
                registeredAt: data.registered,
                gatewayUrl: this.config.gatewayUrl,
                publicUrl: this.getPublicUrl(data.username),
            };
        } catch ( error ) {
            logger.error(`Failed to lookup username: ${error}`);
            return null;
        }
    }

    /**
   * Check if a username is available
   */
    async isAvailable (username: string): Promise<boolean> {
        const existing = await this.lookup(username);
        return existing === null;
    }

    /**
   * Validate username format
   */
    validateUsername (username: string): { valid: boolean; error?: string } {
        if ( ! username ) {
            return { valid: false, error: 'Username is required' };
        }

        if ( username.length < 3 ) {
            return { valid: false, error: 'Username must be at least 3 characters' };
        }

        if ( username.length > 30 ) {
            return { valid: false, error: 'Username must be at most 30 characters' };
        }

        if ( !/^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/.test(username) && username.length > 2 ) {
            return { valid: false, error: 'Username must start and end with alphanumeric, can contain _ and -' };
        }

        if ( ! /^[a-zA-Z0-9_-]+$/.test(username) ) {
            return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
        }

        // Reserved usernames
        const reserved = ['admin', 'api', 'www', 'mail', 'ftp', 'localhost', 'root', 'system'];
        if ( reserved.includes(username.toLowerCase()) ) {
            return { valid: false, error: 'This username is reserved' };
        }

        return { valid: true };
    }

    /**
   * Get the registered username
   */
    getUsername (): string | null {
        return this.storage.username;
    }

    /**
   * Get the public URL for a username
   */
    getPublicUrl (username?: string): string {
        const name = username || this.storage.username;
        if ( ! name ) return '';

        // Use publicDomain if specified, otherwise extract from gateway URL
        const domain = this.config.publicDomain || new URL(this.config.gatewayUrl).hostname;
        return `https://${name.toLowerCase()}.${domain}`;
    }

    /**
   * Check if username is registered
   */
    hasUsername (): boolean {
        return this.storage.username !== null;
    }

    /**
   * Get registration info
   */
    getInfo (): { username: string | null; publicUrl: string | null; registeredAt: string | null } {
        return {
            username: this.storage.username,
            publicUrl: this.storage.username ? this.getPublicUrl() : null,
            registeredAt: this.storage.registeredAt,
        };
    }
}
