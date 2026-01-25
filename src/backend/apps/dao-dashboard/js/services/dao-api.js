/**
 * DAO API Client
 * Handles communication with CyberRepublic API and Elastos RPC
 */

class DAOApiClient {
    constructor() {
        this.crApiBase = 'https://api.cyberrepublic.org';
        this.elaRpcUrl = 'https://api.elastos.io/ela';
        this.cache = new CacheService(120000); // 2 minute TTL
    }

    /**
     * Generic HTTP GET with error handling and caching
     */
    async httpGet(url, cacheKey = null) {
        if (cacheKey && this.cache.has(cacheKey)) {
            console.log('[DAO API] Cache hit:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (cacheKey) {
                this.cache.set(cacheKey, data);
            }

            return data;
        } catch (error) {
            console.error('[DAO API] Request failed:', url, error);
            throw error;
        }
    }

    /**
     * JSON-RPC call to Elastos mainchain
     */
    async rpcCall(method, params = {}) {
        const cacheKey = `rpc_${method}_${JSON.stringify(params)}`;
        
        if (this.cache.has(cacheKey)) {
            console.log('[DAO API] RPC cache hit:', method);
            return this.cache.get(cacheKey);
        }

        try {
            const response = await fetch(this.elaRpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: method,
                    params: params,
                    id: Date.now()
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || 'RPC Error');
            }

            this.cache.set(cacheKey, data.result);
            return data.result;
        } catch (error) {
            console.error('[DAO API] RPC failed:', method, error);
            throw error;
        }
    }

    // ==================== PROPOSALS ====================

    /**
     * Fetch proposals with filtering
     * @param {string} status - all, registered, cragreed, voteragreed, finished, crcanceled
     * @param {number} page - Page number (1-based)
     * @param {number} results - Results per page
     */
    async getProposals(status = 'all', page = 1, results = 10) {
        const cacheKey = `proposals_${status}_${page}_${results}`;
        const url = `${this.crApiBase}/api/v2/proposal/all_search?status=${status}&page=${page}&results=${results}`;
        
        const response = await this.httpGet(url, cacheKey);
        return response.data || { proposals: [], total: 0 };
    }

    /**
     * Fetch proposal details by hash
     */
    async getProposalDetail(proposalHash) {
        const cacheKey = `proposal_${proposalHash}`;
        const url = `${this.crApiBase}/api/v2/proposal/get_proposal/${proposalHash}`;
        
        const response = await this.httpGet(url, cacheKey);
        return response.data || null;
    }

    /**
     * Search proposals by query
     */
    async searchProposals(query, page = 1, results = 10) {
        const url = `${this.crApiBase}/api/v2/proposal/all_search?search=${encodeURIComponent(query)}&page=${page}&results=${results}`;
        const response = await this.httpGet(url);
        return response.data || { proposals: [], total: 0 };
    }

    // ==================== COUNCIL ====================

    /**
     * Fetch current council members from CyberRepublic API
     */
    async getCouncilMembers() {
        const cacheKey = 'council_members';
        const url = `${this.crApiBase}/api/council/list`;
        
        try {
            const response = await this.httpGet(url, cacheKey);
            return response.data || { council: [] };
        } catch (error) {
            // Fallback to RPC
            console.log('[DAO API] Falling back to RPC for council members');
            return this.getCouncilMembersRPC();
        }
    }

    /**
     * Fetch council members directly from blockchain RPC
     */
    async getCouncilMembersRPC() {
        const result = await this.rpcCall('listcurrentcrs', { state: 'all' });
        return {
            council: result.crmembersinfo || [],
            secretariat: result.secretarygeneralinfo ? [result.secretarygeneralinfo] : []
        };
    }

    /**
     * Fetch council term information
     */
    async getCouncilTerm() {
        const cacheKey = 'council_term';
        const url = `${this.crApiBase}/api/council/term`;
        
        try {
            const response = await this.httpGet(url, cacheKey);
            return response.data || null;
        } catch (error) {
            console.error('[DAO API] Failed to get council term:', error);
            return null;
        }
    }

    // ==================== SUGGESTIONS ====================

    /**
     * Fetch suggestions
     */
    async getSuggestions(page = 1, results = 10) {
        const cacheKey = `suggestions_${page}_${results}`;
        const url = `${this.crApiBase}/api/v2/suggestion/all_search?page=${page}&results=${results}`;
        
        const response = await this.httpGet(url, cacheKey);
        return response.data || { list: [], total: 0 };
    }

    /**
     * Fetch suggestion details
     */
    async getSuggestionDetail(suggestionId) {
        const cacheKey = `suggestion_${suggestionId}`;
        const url = `${this.crApiBase}/api/v2/suggestion/get_suggestion/${suggestionId}`;
        
        const response = await this.httpGet(url, cacheKey);
        return response.data || null;
    }

    // ==================== GOVERNANCE STAGE ====================

    /**
     * Get current CR governance stage
     * Returns: { onduty, ondutystartheight, ondutyendheight, invoting, votingstartheight, votingendheight }
     */
    async getCRStage() {
        const result = await this.rpcCall('getcrrelatedstage');
        return result;
    }

    /**
     * Get current block height
     */
    async getBlockHeight() {
        const result = await this.rpcCall('getblockcount');
        return result;
    }

    /**
     * Get Secretary General info
     */
    async getSecretaryGeneral() {
        const result = await this.rpcCall('getsecretarygeneral');
        return result;
    }

    // ==================== HELPERS ====================

    /**
     * Format ELA amount from SELA
     */
    static formatELA(sela) {
        if (!sela) return '0';
        const ela = parseInt(sela) / 100000000;
        return ela.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    /**
     * Format date from timestamp
     */
    static formatDate(timestamp) {
        if (!timestamp) return '--';
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Truncate DID for display
     */
    static truncateDID(did) {
        if (!did) return '--';
        if (did.length <= 16) return did;
        return `${did.slice(0, 8)}...${did.slice(-6)}`;
    }

    /**
     * Get status display info
     */
    static getStatusInfo(status) {
        const statusMap = {
            'registered': { label: 'In Review', class: 'registered' },
            'cragreed': { label: 'Council Agreed', class: 'cragreed' },
            'voteragreed': { label: 'Active', class: 'voteragreed' },
            'finished': { label: 'Finished', class: 'finished' },
            'crcanceled': { label: 'Rejected', class: 'crcanceled' },
            'votercanceled': { label: 'Vetoed', class: 'votercanceled' }
        };
        return statusMap[status] || { label: status, class: 'unknown' };
    }

    /**
     * Calculate council vote counts
     */
    static calculateVotes(voteResult) {
        if (!voteResult || !Array.isArray(voteResult)) {
            return { approve: 0, reject: 0, abstain: 0, total: 12 };
        }

        let approve = 0, reject = 0, abstain = 0;
        
        voteResult.forEach(vote => {
            if (vote.value === 'support' || vote.value === 'approve') approve++;
            else if (vote.value === 'reject') reject++;
            else if (vote.value === 'abstain' || vote.value === 'abstention') abstain++;
        });

        return { approve, reject, abstain, total: 12 };
    }
}

// Create global instance
window.daoApi = new DAOApiClient();
