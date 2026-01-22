/**
 * Network Detector
 * 
 * Detects network configuration to determine optimal connectivity strategy:
 * - Public IP detection via external services
 * - NAT type detection
 * - Port reachability check
 * 
 * Used by ConnectivityService to decide between:
 * - Direct mode (public IP, register HTTP endpoint)
 * - Privacy mode (use Active Proxy even with public IP)
 * - NAT mode (behind NAT, must use Active Proxy)
 */

import { logger } from '../../utils/logger.js';

export type NATType = 'direct' | 'symmetric' | 'restricted' | 'unknown';

export interface NetworkInfo {
  publicIP: string | null;
  localIP: string | null;
  hasPublicIP: boolean;
  natType: NATType;
  portReachable: boolean;
  detectedAt: string;
}

export interface NetworkDetectorConfig {
  ipCheckUrls: string[];
  timeoutMs: number;
}

const DEFAULT_CONFIG: NetworkDetectorConfig = {
  ipCheckUrls: [
    'https://api.ipify.org?format=json',
    'https://api.my-ip.io/v2/ip.json',
    'https://ipinfo.io/json',
  ],
  timeoutMs: 5000,
};

export class NetworkDetector {
  private config: NetworkDetectorConfig;
  private cachedInfo: NetworkInfo | null = null;
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes
  private lastDetection: number = 0;

  constructor(config?: Partial<NetworkDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect public IP address using external services
   */
  async detectPublicIP(): Promise<string | null> {
    for (const url of this.config.ipCheckUrls) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (!response.ok) continue;

        const data = await response.json() as Record<string, unknown>;
        
        // Handle different response formats
        const ip = (data.ip || data.query || data.origin) as string | undefined;
        
        if (ip && this.isValidIPv4(ip)) {
          logger.debug(`Detected public IP: ${ip} (via ${new URL(url).hostname})`);
          return ip;
        }
      } catch (error) {
        logger.debug(`IP check failed for ${url}: ${error}`);
      }
    }

    logger.warn('Could not detect public IP from any service');
    return null;
  }

  /**
   * Detect local network IP address
   */
  async detectLocalIP(): Promise<string | null> {
    try {
      // Use Node.js os module to get network interfaces
      const os = await import('os');
      const interfaces = os.networkInterfaces();
      
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        
        for (const addr of addrs) {
          // Skip internal/loopback addresses
          if (addr.internal) continue;
          
          // Skip IPv6 for now
          if (addr.family !== 'IPv4') continue;
          
          // Skip link-local addresses
          if (addr.address.startsWith('169.254.')) continue;
          
          logger.debug(`Detected local IP: ${addr.address} (${name})`);
          return addr.address;
        }
      }
    } catch (error) {
      logger.warn(`Failed to detect local IP: ${error}`);
    }

    return null;
  }

  /**
   * Check if we have a public IP (not behind NAT)
   */
  async hasPublicIP(): Promise<boolean> {
    const publicIP = await this.detectPublicIP();
    const localIP = await this.detectLocalIP();

    if (!publicIP || !localIP) {
      return false;
    }

    // If public IP matches local IP, we have direct public IP
    if (publicIP === localIP) {
      logger.info(`Direct public IP detected: ${publicIP}`);
      return true;
    }

    // Check if we're on a VPS (common private IP ranges indicate NAT)
    if (this.isPrivateIP(localIP)) {
      logger.info(`Behind NAT: local=${localIP}, public=${publicIP}`);
      return false;
    }

    // If local IP is public but different from detected, still direct
    if (!this.isPrivateIP(localIP)) {
      logger.info(`Public IP on interface: ${localIP}`);
      return true;
    }

    return false;
  }

  /**
   * Detect NAT type
   */
  async detectNATType(): Promise<NATType> {
    const publicIP = await this.detectPublicIP();
    const localIP = await this.detectLocalIP();

    if (!publicIP) {
      return 'unknown';
    }

    if (!localIP) {
      return 'unknown';
    }

    // Direct public IP
    if (publicIP === localIP || !this.isPrivateIP(localIP)) {
      return 'direct';
    }

    // Behind NAT - simplified detection
    // Full NAT type detection requires STUN server
    return 'restricted';
  }

  /**
   * Check if a specific port is reachable from the internet
   */
  async checkPortReachable(port: number, publicIP?: string): Promise<boolean> {
    const ip = publicIP || await this.detectPublicIP();
    
    if (!ip) {
      return false;
    }

    try {
      // Use a port check service or direct connection test
      // For now, we'll assume the port is reachable if we have a public IP
      // In production, this should use a callback-based check via super node
      logger.debug(`Port reachability check for ${ip}:${port} - assuming true for direct IP`);
      
      const hasDirect = await this.hasPublicIP();
      return hasDirect;
    } catch (error) {
      logger.warn(`Port reachability check failed: ${error}`);
      return false;
    }
  }

  /**
   * Get full network information
   */
  async detect(): Promise<NetworkInfo> {
    // Check cache
    const now = Date.now();
    if (this.cachedInfo && (now - this.lastDetection) < this.cacheExpiryMs) {
      return this.cachedInfo;
    }

    logger.info('🔍 Detecting network configuration...');

    const [publicIP, localIP, hasPublic, natType] = await Promise.all([
      this.detectPublicIP(),
      this.detectLocalIP(),
      this.hasPublicIP(),
      this.detectNATType(),
    ]);

    // Port reachability is determined by NAT type
    const portReachable = natType === 'direct';

    this.cachedInfo = {
      publicIP,
      localIP,
      hasPublicIP: hasPublic,
      natType,
      portReachable,
      detectedAt: new Date().toISOString(),
    };

    this.lastDetection = now;

    logger.info(`📡 Network detected: ${JSON.stringify({
      publicIP,
      localIP,
      hasPublicIP: hasPublic,
      natType,
      portReachable,
    })}`);

    return this.cachedInfo;
  }

  /**
   * Clear cached network info
   */
  clearCache(): void {
    this.cachedInfo = null;
    this.lastDetection = 0;
  }

  /**
   * Validate IPv4 address format
   */
  private isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  /**
   * Check if IP is in private range
   */
  private isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;

    return false;
  }
}
