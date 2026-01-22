/**
 * Update Service
 * 
 * Checks for updates to the PC2 node software and notifies the user.
 * Follows macOS-style user-initiated updates (notify, don't auto-install).
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface VersionInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
  downloadUrl?: string;
  dockerImage?: string;
  checksums?: {
    sha256?: string;
  };
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseDate?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  dockerImage?: string;
}

export interface UpdateServiceConfig {
  checkUrl?: string;
  checkInterval?: number; // milliseconds
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<UpdateServiceConfig> = {
  checkUrl: 'https://ela.city/api/pc2/version',
  checkInterval: 24 * 60 * 60 * 1000, // 24 hours
  enabled: true,
};

export class UpdateService {
  private config: Required<UpdateServiceConfig>;
  private currentVersion: string;
  private latestVersion: VersionInfo | null = null;
  private lastCheck: Date | null = null;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(config: UpdateServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentVersion = this.loadCurrentVersion();
    
    logger.info(`[UpdateService] Initialized with version ${this.currentVersion}`);
  }

  /**
   * Load current version from package.json or environment
   */
  private loadCurrentVersion(): string {
    // Check environment variable first (set in Docker)
    if (process.env.PC2_VERSION) {
      return process.env.PC2_VERSION;
    }

    // Try to read from package.json
    const packagePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(process.cwd(), '..', 'package.json'),
      path.join(process.cwd(), '..', '..', 'package.json'),
    ];

    for (const packagePath of packagePaths) {
      if (existsSync(packagePath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
          if (packageJson.version) {
            return packageJson.version;
          }
        } catch (error) {
          logger.debug(`[UpdateService] Failed to read ${packagePath}:`, error);
        }
      }
    }

    return '0.0.0-dev';
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get latest version info
   */
  getLatestVersion(): VersionInfo | null {
    return this.latestVersion;
  }

  /**
   * Get last check timestamp
   */
  getLastCheck(): Date | null {
    return this.lastCheck;
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.config.enabled) {
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
        latestVersion: this.currentVersion,
      };
    }

    try {
      logger.info('[UpdateService] Checking for updates...');
      
      const response = await fetch(this.config.checkUrl, {
        headers: {
          'User-Agent': `PC2-Node/${this.currentVersion}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const versionInfo: VersionInfo = await response.json();
      this.latestVersion = versionInfo;
      this.lastCheck = new Date();

      const updateAvailable = this.compareVersions(this.currentVersion, versionInfo.version) < 0;

      if (updateAvailable) {
        logger.info(`[UpdateService] Update available: ${this.currentVersion} → ${versionInfo.version}`);
      } else {
        logger.info(`[UpdateService] Already up to date (${this.currentVersion})`);
      }

      return {
        updateAvailable,
        currentVersion: this.currentVersion,
        latestVersion: versionInfo.version,
        releaseDate: versionInfo.releaseDate,
        releaseNotes: versionInfo.releaseNotes,
        downloadUrl: versionInfo.downloadUrl,
        dockerImage: versionInfo.dockerImage,
      };
    } catch (error) {
      logger.error('[UpdateService] Failed to check for updates:', error);
      
      // Return current state without update
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
        latestVersion: this.latestVersion?.version || this.currentVersion,
      };
    }
  }

  /**
   * Compare semantic versions
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    // Handle dev/snapshot versions
    const cleanA = a.replace(/-.*$/, '');
    const cleanB = b.replace(/-.*$/, '');

    const partsA = cleanA.split('.').map(Number);
    const partsB = cleanB.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;

      if (numA < numB) return -1;
      if (numA > numB) return 1;
    }

    // If base versions are equal, check pre-release
    // dev < alpha < beta < rc < release
    const preReleaseOrder: Record<string, number> = {
      'dev': 0,
      'alpha': 1,
      'beta': 2,
      'rc': 3,
    };

    const getPreRelease = (v: string) => {
      const match = v.match(/-(\w+)/);
      return match ? preReleaseOrder[match[1]] ?? 2.5 : 100;
    };

    const preA = getPreRelease(a);
    const preB = getPreRelease(b);

    return preA - preB;
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks(): void {
    if (!this.config.enabled) {
      logger.info('[UpdateService] Periodic checks disabled');
      return;
    }

    // Check immediately
    this.checkForUpdates().catch(err => {
      logger.error('[UpdateService] Initial check failed:', err);
    });

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch(err => {
        logger.error('[UpdateService] Periodic check failed:', err);
      });
    }, this.config.checkInterval);

    logger.info(`[UpdateService] Periodic checks enabled (every ${this.config.checkInterval / 1000 / 60 / 60} hours)`);
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      logger.info('[UpdateService] Periodic checks stopped');
    }
  }

  /**
   * Get update status for API response
   */
  getStatus(): {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    lastCheck: string | null;
    releaseNotes: string | null;
    downloadUrl: string | null;
    dockerImage: string | null;
  } {
    const updateAvailable = this.latestVersion 
      ? this.compareVersions(this.currentVersion, this.latestVersion.version) < 0
      : false;

    return {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion?.version || null,
      updateAvailable,
      lastCheck: this.lastCheck?.toISOString() || null,
      releaseNotes: this.latestVersion?.releaseNotes || null,
      downloadUrl: this.latestVersion?.downloadUrl || null,
      dockerImage: this.latestVersion?.dockerImage || null,
    };
  }
}

// Singleton instance
let updateServiceInstance: UpdateService | null = null;

export function getUpdateService(): UpdateService {
  if (!updateServiceInstance) {
    updateServiceInstance = new UpdateService();
  }
  return updateServiceInstance;
}

export function initUpdateService(config: UpdateServiceConfig = {}): UpdateService {
  updateServiceInstance = new UpdateService(config);
  return updateServiceInstance;
}
