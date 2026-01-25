/**
 * Simple Cache Service with TTL
 */

class CacheService {
    constructor(defaultTTL = 120000) { // 2 minutes default
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
    }

    /**
     * Set a value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in ms (optional)
     */
    set(key, value, ttl = this.defaultTTL) {
        const expiry = Date.now() + ttl;
        this.cache.set(key, {
            value,
            expiry
        });
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any} Cached value or undefined
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return undefined;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return undefined;
        }

        return item.value;
    }

    /**
     * Check if key exists and is valid
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return false;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete a key from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Clear expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get cache size
     */
    get size() {
        return this.cache.size;
    }
}

// Export for use in other scripts
window.CacheService = CacheService;
