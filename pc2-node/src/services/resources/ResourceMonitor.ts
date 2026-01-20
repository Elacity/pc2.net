/**
 * Resource Monitor Service
 * 
 * Detects and monitors system resources for the PC2 node.
 * Completely self-contained - uses only Node.js built-in modules.
 * 
 * Scope: Node-global (applies to entire PC2 node, not per-account)
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

export interface DiskStats {
    total: number;      // Total disk space in bytes
    free: number;       // Free disk space in bytes
    used: number;       // Used disk space in bytes
    usedPercent: number; // Percentage used (0-100)
}

export interface MemoryStats {
    total: number;      // Total system RAM in bytes
    free: number;       // Free RAM in bytes
    used: number;       // Used RAM in bytes
    usedPercent: number; // Percentage used (0-100)
}

export interface CpuStats {
    cores: number;      // Number of CPU cores
    model: string;      // CPU model name
    speed: number;      // CPU speed in MHz
}

export interface SystemResources {
    disk: DiskStats;
    memory: MemoryStats;
    cpu: CpuStats;
    platform: string;
    hostname: string;
    uptime: number;         // PC2 node process uptime in seconds
    systemUptime: number;   // System uptime in seconds (for reference)
}

export interface ResourceLimits {
    storage: {
        limit: number;              // Max storage in bytes (0 = unlimited)
        reserveFreeSpace: number;   // Reserved free space in bytes
    };
    compute: {
        maxCpuPercent: number;      // Max CPU usage (0-100)
        maxMemoryMb: number;        // Max memory in MB (0 = auto)
        maxConcurrentWasm: number;  // Max concurrent WASM executions
        wasmTimeoutMs: number;      // WASM execution timeout in ms
    };
}

export interface EffectiveLimits extends ResourceLimits {
    storage: ResourceLimits['storage'] & {
        effectiveLimit: number;     // Actual limit after auto-detection
        autoDetected: boolean;
    };
    compute: ResourceLimits['compute'] & {
        effectiveMemoryMb: number;  // Actual memory limit after auto-detection
        autoDetected: boolean;
    };
}

/**
 * Parse size string (e.g., "10GB", "512MB") to bytes
 */
export function parseSizeToBytes(size: string | number): number {
    if (typeof size === 'number') {
        return size;
    }
    
    const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) {
        return 0;
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers: Record<string, number> = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024,
    };
    
    return Math.floor(value * (multipliers[unit] || 1));
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export class ResourceMonitor {
    private dataPath: string;
    private cachedDiskStats: DiskStats | null = null;
    private diskStatsCacheTime: number = 0;
    private readonly DISK_CACHE_TTL_MS = 5000; // Cache disk stats for 5 seconds

    constructor(dataPath?: string) {
        this.dataPath = dataPath || process.cwd();
    }

    /**
     * Get disk statistics for the data directory
     */
    getDiskStats(): DiskStats {
        // Return cached stats if still valid
        const now = Date.now();
        if (this.cachedDiskStats && (now - this.diskStatsCacheTime) < this.DISK_CACHE_TTL_MS) {
            return this.cachedDiskStats;
        }

        try {
            // Use fs.statfsSync for disk stats (Node.js 18.15+)
            if (typeof fs.statfsSync === 'function') {
                const stats = fs.statfsSync(this.dataPath);
                const total = stats.blocks * stats.bsize;
                const free = stats.bfree * stats.bsize;
                const used = total - free;
                
                this.cachedDiskStats = {
                    total,
                    free,
                    used,
                    usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
                };
            } else {
                // Fallback for older Node.js versions
                logger.warn('[ResourceMonitor] fs.statfsSync not available, using defaults');
                this.cachedDiskStats = {
                    total: 100 * 1024 * 1024 * 1024, // Assume 100GB
                    free: 50 * 1024 * 1024 * 1024,   // Assume 50GB free
                    used: 50 * 1024 * 1024 * 1024,
                    usedPercent: 50,
                };
            }
            
            this.diskStatsCacheTime = now;
            return this.cachedDiskStats;
        } catch (error) {
            logger.error('[ResourceMonitor] Failed to get disk stats:', error);
            return {
                total: 100 * 1024 * 1024 * 1024,
                free: 50 * 1024 * 1024 * 1024,
                used: 50 * 1024 * 1024 * 1024,
                usedPercent: 50,
            };
        }
    }

    /**
     * Get memory statistics
     */
    getMemoryStats(): MemoryStats {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        
        return {
            total,
            free,
            used,
            usedPercent: Math.round((used / total) * 100),
        };
    }

    /**
     * Get CPU statistics
     */
    getCpuStats(): CpuStats {
        const cpus = os.cpus();
        const firstCpu = cpus[0] || { model: 'Unknown', speed: 0 };
        
        return {
            cores: cpus.length,
            model: firstCpu.model,
            speed: firstCpu.speed,
        };
    }

    /**
     * Get all system resources
     */
    getSystemResources(): SystemResources {
        return {
            disk: this.getDiskStats(),
            memory: this.getMemoryStats(),
            cpu: this.getCpuStats(),
            platform: os.platform(),
            hostname: os.hostname(),
            uptime: process.uptime(),        // PC2 node process uptime
            systemUptime: os.uptime(),       // System uptime (for reference)
        };
    }

    /**
     * Calculate effective limits based on config and auto-detection
     * @param configLimits - Limits from config/database
     */
    getEffectiveLimits(configLimits?: Partial<ResourceLimits>): EffectiveLimits {
        const disk = this.getDiskStats();
        const memory = this.getMemoryStats();
        
        // Default config values
        const storageLimit = configLimits?.storage?.limit ?? 0;
        const reserveFreeSpace = configLimits?.storage?.reserveFreeSpace ?? (10 * 1024 * 1024 * 1024); // 10GB default
        const maxCpuPercent = configLimits?.compute?.maxCpuPercent ?? 80;
        const maxMemoryMb = configLimits?.compute?.maxMemoryMb ?? 0;
        const maxConcurrentWasm = configLimits?.compute?.maxConcurrentWasm ?? 4;
        const wasmTimeoutMs = configLimits?.compute?.wasmTimeoutMs ?? 30000;

        // Calculate effective storage limit
        let effectiveStorageLimit: number;
        let storageAutoDetected = false;
        
        if (storageLimit === 0 || storageLimit === -1) {
            // Auto-detect: 80% of (total - reserve), max 500GB
            const availableForUse = Math.max(0, disk.total - reserveFreeSpace);
            effectiveStorageLimit = Math.min(
                Math.floor(availableForUse * 0.8),
                500 * 1024 * 1024 * 1024 // Max 500GB
            );
            // Ensure minimum 1GB
            effectiveStorageLimit = Math.max(effectiveStorageLimit, 1 * 1024 * 1024 * 1024);
            storageAutoDetected = true;
        } else {
            effectiveStorageLimit = storageLimit;
        }

        // Calculate effective memory limit
        let effectiveMemoryMb: number;
        let memoryAutoDetected = false;
        
        if (maxMemoryMb === 0 || maxMemoryMb === -1) {
            // Auto-detect: 50% of system RAM, min 256MB, max 8GB
            const halfRamMb = Math.floor(memory.total / (1024 * 1024) / 2);
            effectiveMemoryMb = Math.min(Math.max(halfRamMb, 256), 8192);
            memoryAutoDetected = true;
        } else {
            effectiveMemoryMb = maxMemoryMb;
        }

        return {
            storage: {
                limit: storageLimit,
                reserveFreeSpace,
                effectiveLimit: effectiveStorageLimit,
                autoDetected: storageAutoDetected,
            },
            compute: {
                maxCpuPercent,
                maxMemoryMb,
                maxConcurrentWasm,
                wasmTimeoutMs,
                effectiveMemoryMb,
                autoDetected: memoryAutoDetected,
            },
        };
    }

    /**
     * Check if there's enough storage for a given size
     */
    hasStorageCapacity(requiredBytes: number, configLimits?: Partial<ResourceLimits>): boolean {
        const disk = this.getDiskStats();
        const limits = this.getEffectiveLimits(configLimits);
        
        // Check against both free disk space and configured limit
        const availableDisk = disk.free - limits.storage.reserveFreeSpace;
        const remainingQuota = limits.storage.effectiveLimit - disk.used;
        
        return requiredBytes <= Math.min(availableDisk, remainingQuota);
    }

    /**
     * Check if there's enough memory for WASM execution
     */
    hasMemoryCapacity(requiredMb: number, configLimits?: Partial<ResourceLimits>): boolean {
        const memory = this.getMemoryStats();
        const limits = this.getEffectiveLimits(configLimits);
        
        const freeMemoryMb = Math.floor(memory.free / (1024 * 1024));
        const allowedMb = Math.min(freeMemoryMb, limits.compute.effectiveMemoryMb);
        
        return requiredMb <= allowedMb;
    }
}

// Singleton instance for the application
let resourceMonitorInstance: ResourceMonitor | null = null;

export function getResourceMonitor(dataPath?: string): ResourceMonitor {
    if (!resourceMonitorInstance) {
        resourceMonitorInstance = new ResourceMonitor(dataPath);
    }
    return resourceMonitorInstance;
}

export default ResourceMonitor;
