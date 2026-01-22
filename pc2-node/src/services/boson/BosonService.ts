/**
 * Boson Service
 * 
 * Main orchestration service for PC2 node identity and connectivity.
 * Integrates:
 * - IdentityService: Node identity management
 * - UsernameService: Username registration with gateway
 * - ConnectivityService: Super node connection
 */

import { IdentityService, IdentityConfig } from './IdentityService.js';
import { UsernameService, UsernameConfig } from './UsernameService.js';
import { ConnectivityService, ConnectivityConfig, ConnectionStatus } from './ConnectivityService.js';
import { logger } from '../../utils/logger.js';

export interface BosonConfig {
  dataDir: string;
  gatewayUrl?: string;
  publicDomain?: string;
  localPort?: number;
  autoConnect?: boolean;
  superNodes?: ConnectivityConfig['superNodes'];
}

export interface BosonStatus {
  initialized: boolean;
  identity: {
    nodeId: string | null;
    did: string | null;
    isNew: boolean;
  };
  username: {
    registered: boolean;
    username: string | null;
    publicUrl: string | null;
  };
  connectivity: ConnectionStatus;
}

export class BosonService {
  private config: BosonConfig;
  private identityService: IdentityService;
  private usernameService: UsernameService;
  private connectivityService: ConnectivityService;
  private initialized: boolean = false;
  private firstRunMnemonic: string | null = null;

  constructor(config: BosonConfig) {
    this.config = {
      gatewayUrl: 'https://ela.city',
      localPort: 4200,
      autoConnect: true,
      ...config,
    };

    // Initialize sub-services
    this.identityService = new IdentityService({
      dataDir: config.dataDir,
      identityFile: 'identity.json',
    });

    this.usernameService = new UsernameService({
      dataDir: config.dataDir,
      gatewayUrl: this.config.gatewayUrl!,
      publicDomain: this.config.publicDomain,
      nodeEndpoint: `http://127.0.0.1:${this.config.localPort}`,
    });

    this.connectivityService = new ConnectivityService({
      superNodes: this.config.superNodes,
      localPort: this.config.localPort,
    });
  }

  /**
   * Initialize Boson service
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Boson service...');

    // 1. Initialize identity
    await this.identityService.initialize();
    
    const nodeId = this.identityService.getNodeId();
    if (!nodeId) {
      throw new Error('Failed to initialize node identity');
    }

    // Check if this is first run (new identity)
    if (this.identityService.isNewIdentity()) {
      this.firstRunMnemonic = this.identityService.getMnemonic();
      logger.info('🆕 New node identity created');
      logger.info('📝 IMPORTANT: Save your recovery phrase securely!');
    }

    // 2. Initialize username service with node ID
    this.usernameService.setNodeId(nodeId);

    // 3. Initialize connectivity with node ID
    this.connectivityService.setNodeId(nodeId);
    this.connectivityService.setUsernameService(this.usernameService);

    // 4. Auto-connect if enabled
    if (this.config.autoConnect) {
      await this.connectivityService.start();
    }

    this.initialized = true;
    logger.info('✅ Boson service initialized');
  }

  /**
   * Stop Boson service
   */
  async stop(): Promise<void> {
    await this.connectivityService.stop();
    logger.info('✅ Boson service stopped');
  }

  /**
   * Register a username
   */
  async registerUsername(username: string): Promise<{ success: boolean; error?: string; publicUrl?: string }> {
    if (!this.initialized) {
      return { success: false, error: 'Boson service not initialized' };
    }

    const result = await this.usernameService.register(username);
    
    if (result.success) {
      // Re-register with gateway to update endpoint
      await this.connectivityService.reconnect();
    }

    return result;
  }

  /**
   * Get full service status
   */
  getStatus(): BosonStatus {
    const identityInfo = this.identityService.getPublicInfo();
    const usernameInfo = this.usernameService.getInfo();
    const connectivityStatus = this.connectivityService.getStatus();

    return {
      initialized: this.initialized,
      identity: {
        nodeId: identityInfo?.nodeId || null,
        did: identityInfo?.did || null,
        isNew: this.identityService.isNewIdentity(),
      },
      username: {
        registered: this.usernameService.hasUsername(),
        username: usernameInfo.username,
        publicUrl: usernameInfo.publicUrl,
      },
      connectivity: connectivityStatus,
    };
  }

  /**
   * Get the recovery mnemonic (only available on first run)
   */
  getFirstRunMnemonic(): string | null {
    return this.firstRunMnemonic;
  }

  /**
   * Clear mnemonic from memory (call after user has saved it)
   */
  clearMnemonic(): void {
    this.firstRunMnemonic = null;
  }

  /**
   * Check if this is first run
   */
  isFirstRun(): boolean {
    return this.identityService.isNewIdentity();
  }

  /**
   * Get node ID
   */
  getNodeId(): string | null {
    return this.identityService.getNodeId();
  }

  /**
   * Get DID
   */
  getDID(): string | null {
    return this.identityService.getDID();
  }

  /**
   * Get public URL
   */
  getPublicUrl(): string | null {
    return this.usernameService.getPublicUrl() || null;
  }

  /**
   * Check if connected to super node
   */
  isConnected(): boolean {
    return this.connectivityService.isConnected();
  }

  /**
   * Get identity service (for advanced use)
   */
  getIdentityService(): IdentityService {
    return this.identityService;
  }

  /**
   * Get username service (for advanced use)
   */
  getUsernameService(): UsernameService {
    return this.usernameService;
  }

  /**
   * Get connectivity service (for advanced use)
   */
  getConnectivityService(): ConnectivityService {
    return this.connectivityService;
  }

  /**
   * Encrypt and store the mnemonic using wallet signature.
   * This secures the mnemonic so user can view it later.
   * @param signature - Wallet signature for encryption
   * @param walletAddress - Wallet address used for signing
   * @returns true if successful
   */
  encryptAndStoreMnemonic(signature: string, walletAddress: string): boolean {
    // First, ensure the identity service has the mnemonic
    // If firstRunMnemonic is set, we need to temporarily set it on identity
    if (this.firstRunMnemonic && !this.identityService.getMnemonic()) {
      // This is a workaround - in production, handle this more cleanly
      const identity = this.identityService.getIdentity();
      if (identity) {
        (identity as any).mnemonic = this.firstRunMnemonic;
      }
    }

    const success = this.identityService.encryptAndStoreMnemonic(signature, walletAddress);
    
    if (success) {
      // Clear our copy too
      this.firstRunMnemonic = null;
    }
    
    return success;
  }

  /**
   * Decrypt mnemonic using wallet signature.
   * User must sign the same message to decrypt.
   * @param signature - Wallet signature for decryption
   * @returns decrypted mnemonic or null
   */
  decryptMnemonic(signature: string): string | null {
    return this.identityService.decryptMnemonic(signature);
  }

  /**
   * Get the message that should be signed for mnemonic operations
   * @param walletAddress - Wallet address to include in message
   */
  getMnemonicSignMessage(walletAddress: string): string {
    return this.identityService.getMnemonicSignMessage(walletAddress);
  }

  /**
   * Check if mnemonic has been encrypted and stored
   */
  hasMnemonicBackup(): boolean {
    return this.identityService.hasMnemonicBackup();
  }

  /**
   * Get admin wallet address
   */
  getAdminWalletAddress(): string | null {
    return this.identityService.getAdminWalletAddress();
  }

  /**
   * Check if an address is the admin wallet
   */
  isAdminWallet(address: string): boolean {
    return this.identityService.isAdminWallet(address);
  }

  /**
   * Set admin wallet address (first login becomes admin)
   */
  setAdminWallet(address: string): boolean {
    return this.identityService.setAdminWallet(address);
  }

  /**
   * Check if admin wallet has been set
   */
  hasAdminWallet(): boolean {
    return this.identityService.hasAdminWallet();
  }
}
