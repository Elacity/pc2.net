/**
 * Resources API Endpoints
 * 
 * Exposes system resources and allows configuration of resource limits.
 * Scope: Node-global (applies to entire PC2 node, not per-account)
 * Access: Any authenticated user can view and modify limits
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { 
    getResourceMonitor, 
    parseSizeToBytes, 
    formatBytes,
    ResourceLimits,
    EffectiveLimits
} from '../services/resources/ResourceMonitor.js';

const router = Router();

// Get database instance for settings persistence
function getDb(): any {
    return (global as any).db;
}

// Get config for reading configured limits
function getConfig(): any {
    return (global as any).pc2Config || {};
}

/**
 * Parse config limits into ResourceLimits format
 */
function getConfiguredLimits(): Partial<ResourceLimits> {
    const config = getConfig();
    const db = getDb();
    
    // Database settings override config file
    const dbStorageLimit = db?.getSetting('storage_limit');
    const dbMaxConcurrentWasm = db?.getSetting('max_concurrent_wasm');
    const dbMaxMemoryMb = db?.getSetting('max_memory_mb');
    const dbWasmTimeoutMs = db?.getSetting('wasm_timeout_ms');
    
    const resourcesConfig = config.resources || {};
    const storageConfig = resourcesConfig.storage || {};
    const computeConfig = resourcesConfig.compute || {};
    
    // Parse storage limit
    let storageLimit = 0; // 0 = auto
    const storageLimitValue = dbStorageLimit || storageConfig.limit || 'auto';
    if (storageLimitValue === 'auto') {
        storageLimit = 0;
    } else if (storageLimitValue === 'unlimited') {
        storageLimit = -1;
    } else if (typeof storageLimitValue === 'string') {
        storageLimit = parseSizeToBytes(storageLimitValue);
    } else {
        storageLimit = storageLimitValue;
    }
    
    // Parse reserve free space
    const reserveFreeSpace = parseSizeToBytes(storageConfig.reserve_free_space || '10GB');
    
    // Parse memory limit
    let maxMemoryMb = 0; // 0 = auto
    const memoryValue = dbMaxMemoryMb || computeConfig.max_memory_mb || 'auto';
    if (memoryValue === 'auto') {
        maxMemoryMb = 0;
    } else if (typeof memoryValue === 'string') {
        // Parse "512MB" or "2GB" format
        const match = memoryValue.match(/^(\d+)\s*(MB|GB)?$/i);
        if (match) {
            const value = parseInt(match[1], 10);
            const unit = (match[2] || 'MB').toUpperCase();
            maxMemoryMb = unit === 'GB' ? value * 1024 : value;
        }
    } else {
        maxMemoryMb = memoryValue;
    }
    
    return {
        storage: {
            limit: storageLimit,
            reserveFreeSpace,
        },
        compute: {
            maxCpuPercent: computeConfig.max_cpu_percent ?? 80,
            maxMemoryMb,
            maxConcurrentWasm: dbMaxConcurrentWasm ?? computeConfig.max_concurrent_wasm ?? 4,
            wasmTimeoutMs: dbWasmTimeoutMs ?? computeConfig.wasm_timeout_ms ?? 30000,
        },
    };
}

/**
 * GET /api/resources
 * Returns current system resources and effective limits
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const monitor = getResourceMonitor();
        const systemResources = monitor.getSystemResources();
        const configuredLimits = getConfiguredLimits();
        const effectiveLimits = monitor.getEffectiveLimits(configuredLimits);
        
        res.json({
            success: true,
            system: {
                disk: {
                    ...systemResources.disk,
                    totalFormatted: formatBytes(systemResources.disk.total),
                    freeFormatted: formatBytes(systemResources.disk.free),
                    usedFormatted: formatBytes(systemResources.disk.used),
                },
                memory: {
                    ...systemResources.memory,
                    totalFormatted: formatBytes(systemResources.memory.total),
                    freeFormatted: formatBytes(systemResources.memory.free),
                    usedFormatted: formatBytes(systemResources.memory.used),
                },
                cpu: systemResources.cpu,
                platform: systemResources.platform,
                hostname: systemResources.hostname,
                uptime: systemResources.uptime,
                uptimeFormatted: formatUptime(systemResources.uptime),
            },
            limits: {
                storage: {
                    configured: effectiveLimits.storage.limit === 0 ? 'auto' : 
                               effectiveLimits.storage.limit === -1 ? 'unlimited' :
                               formatBytes(effectiveLimits.storage.limit),
                    effective: formatBytes(effectiveLimits.storage.effectiveLimit),
                    effectiveBytes: effectiveLimits.storage.effectiveLimit,
                    autoDetected: effectiveLimits.storage.autoDetected,
                    reserveFreeSpace: formatBytes(effectiveLimits.storage.reserveFreeSpace),
                },
                compute: {
                    maxCpuPercent: effectiveLimits.compute.maxCpuPercent,
                    maxMemoryMb: effectiveLimits.compute.maxMemoryMb === 0 ? 'auto' : effectiveLimits.compute.maxMemoryMb,
                    effectiveMemoryMb: effectiveLimits.compute.effectiveMemoryMb,
                    effectiveMemoryFormatted: formatBytes(effectiveLimits.compute.effectiveMemoryMb * 1024 * 1024),
                    autoDetected: effectiveLimits.compute.autoDetected,
                    maxConcurrentWasm: effectiveLimits.compute.maxConcurrentWasm,
                    wasmTimeoutMs: effectiveLimits.compute.wasmTimeoutMs,
                    wasmTimeoutFormatted: `${effectiveLimits.compute.wasmTimeoutMs / 1000}s`,
                },
            },
        });
    } catch (error: any) {
        logger.error('[Resources API] Error getting resources:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get system resources',
        });
    }
});

/**
 * GET /api/resources/limits
 * Returns only the configured limits (for Settings UI)
 */
router.get('/limits', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getDb();
        const config = getConfig();
        const resourcesConfig = config.resources || {};
        
        // Get values from database (takes precedence) or config
        const storageLimit = db?.getSetting('storage_limit') || resourcesConfig.storage?.limit || 'auto';
        const maxConcurrentWasm = db?.getSetting('max_concurrent_wasm') ?? resourcesConfig.compute?.max_concurrent_wasm ?? 4;
        const maxMemoryMb = db?.getSetting('max_memory_mb') || resourcesConfig.compute?.max_memory_mb || 'auto';
        const wasmTimeoutMs = db?.getSetting('wasm_timeout_ms') ?? resourcesConfig.compute?.wasm_timeout_ms ?? 30000;
        
        res.json({
            success: true,
            limits: {
                storage: {
                    limit: storageLimit,
                    reserve_free_space: resourcesConfig.storage?.reserve_free_space || '10GB',
                },
                compute: {
                    max_cpu_percent: resourcesConfig.compute?.max_cpu_percent ?? 80,
                    max_memory_mb: maxMemoryMb,
                    max_concurrent_wasm: maxConcurrentWasm,
                    wasm_timeout_ms: wasmTimeoutMs,
                },
            },
        });
    } catch (error: any) {
        logger.error('[Resources API] Error getting limits:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get resource limits',
        });
    }
});

/**
 * POST /api/resources/limits
 * Update resource limits (persists to database)
 */
router.post('/limits', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getDb();
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'Database not available',
            });
        }
        
        const { storage, compute } = req.body;
        const updated: string[] = [];
        
        // Update storage limits
        if (storage) {
            if (storage.limit !== undefined) {
                // Validate storage limit
                const validLimits = ['auto', 'unlimited', '10GB', '25GB', '50GB', '100GB', '250GB', '500GB'];
                if (typeof storage.limit === 'string' && !validLimits.includes(storage.limit)) {
                    // Check if it's a valid size format
                    if (!storage.limit.match(/^\d+(GB|MB|TB)$/i)) {
                        return res.status(400).json({
                            success: false,
                            error: `Invalid storage limit. Valid options: ${validLimits.join(', ')} or custom size like "200GB"`,
                        });
                    }
                }
                db.setSetting('storage_limit', storage.limit);
                updated.push('storage_limit');
                logger.info(`[Resources API] Storage limit set to: ${storage.limit}`);
            }
        }
        
        // Update compute limits
        if (compute) {
            if (compute.max_concurrent_wasm !== undefined) {
                const value = parseInt(compute.max_concurrent_wasm, 10);
                if (isNaN(value) || value < 1 || value > 32) {
                    return res.status(400).json({
                        success: false,
                        error: 'max_concurrent_wasm must be between 1 and 32',
                    });
                }
                db.setSetting('max_concurrent_wasm', value);
                updated.push('max_concurrent_wasm');
                logger.info(`[Resources API] Max concurrent WASM set to: ${value}`);
            }
            
            if (compute.max_memory_mb !== undefined) {
                const validMemory = ['auto', 256, 512, 1024, 2048, 4096, 8192];
                if (!validMemory.includes(compute.max_memory_mb) && 
                    !(typeof compute.max_memory_mb === 'number' && compute.max_memory_mb >= 128)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid max_memory_mb. Valid options: ${validMemory.join(', ')} or custom value >= 128`,
                    });
                }
                db.setSetting('max_memory_mb', compute.max_memory_mb);
                updated.push('max_memory_mb');
                logger.info(`[Resources API] Max memory MB set to: ${compute.max_memory_mb}`);
            }
            
            if (compute.wasm_timeout_ms !== undefined) {
                const value = parseInt(compute.wasm_timeout_ms, 10);
                if (isNaN(value) || value < 1000 || value > 300000) {
                    return res.status(400).json({
                        success: false,
                        error: 'wasm_timeout_ms must be between 1000 (1s) and 300000 (5min)',
                    });
                }
                db.setSetting('wasm_timeout_ms', value);
                updated.push('wasm_timeout_ms');
                logger.info(`[Resources API] WASM timeout set to: ${value}ms`);
            }
        }
        
        if (updated.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid limits provided to update',
            });
        }
        
        res.json({
            success: true,
            message: `Updated: ${updated.join(', ')}`,
            updated,
        });
    } catch (error: any) {
        logger.error('[Resources API] Error updating limits:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update resource limits',
        });
    }
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export default router;
