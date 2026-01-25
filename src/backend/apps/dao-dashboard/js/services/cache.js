/**
 * Simple Cache Service with TTL
 * Supports in-memory cache and persistent localStorage for final proposals
 */

class CacheService {
    constructor(defaultTTL = 120000) { // 2 minutes default
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.STORAGE_KEY = 'dao_proposal_cache';
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
     * Clear all cache (memory only, not localStorage)
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

    // ==================== PERSISTENT STORAGE ====================

    /**
     * Save a proposal to persistent localStorage (for final statuses)
     * @param {Object} proposal - Proposal data
     */
    saveProposalPersistent(proposal) {
        if (!proposal || !proposal.proposalHash) return;
        
        try {
            const stored = this.getStoredProposals();
            stored[proposal.proposalHash] = {
                ...proposal,
                cachedAt: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
            console.log('[Cache] Saved proposal to persistent storage:', proposal.proposalHash);
        } catch (e) {
            console.warn('[Cache] Failed to save to localStorage:', e);
        }
    }

    /**
     * Get a proposal from persistent localStorage
     * @param {string} proposalHash - Proposal hash
     * @returns {Object|null}
     */
    getProposalPersistent(proposalHash) {
        try {
            const stored = this.getStoredProposals();
            return stored[proposalHash] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if proposal exists in persistent storage
     * @param {string} proposalHash - Proposal hash
     * @returns {boolean}
     */
    hasProposalPersistent(proposalHash) {
        try {
            const stored = this.getStoredProposals();
            return !!stored[proposalHash];
        } catch (e) {
            return false;
        }
    }

    /**
     * Get all stored proposals from localStorage
     * @returns {Object} Map of proposalHash -> proposal
     */
    getStoredProposals() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Get count of persistently cached proposals
     * @returns {number}
     */
    getPersistentCount() {
        return Object.keys(this.getStoredProposals()).length;
    }

    /**
     * Clear persistent storage
     */
    clearPersistent() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('[Cache] Failed to clear localStorage:', e);
        }
    }
}

// Export for use in other scripts
window.CacheService = CacheService;
