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
            return this.cache.get(cacheKey);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
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
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || 'RPC Error');
            }

            this.cache.set(cacheKey, data.result);
            return data.result;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('[DAO API] RPC timeout:', method);
            } else {
                console.error('[DAO API] RPC failed:', method, error.message);
            }
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
        
        try {
            const response = await this.httpGet(url, cacheKey);
            console.log('[DAO API] Suggestions raw response:', response);
            
            // Handle various response formats
            if (response.data) {
                return response.data;
            }
            if (response.list) {
                return response;
            }
            if (Array.isArray(response)) {
                return { list: response, total: response.length };
            }
            
            // Try list_search endpoint as fallback
            console.log('[DAO API] Trying fallback suggestions endpoint...');
            const fallbackUrl = `${this.crApiBase}/api/v2/suggestion/list?page=${page}&results=${results}`;
            const fallbackResponse = await this.httpGet(fallbackUrl);
            console.log('[DAO API] Fallback response:', fallbackResponse);
            
            if (fallbackResponse.data) {
                return fallbackResponse.data;
            }
            return fallbackResponse || { list: [], total: 0 };
            
        } catch (error) {
            console.error('[DAO API] Suggestions fetch failed:', error);
            return { list: [], total: 0 };
        }
    }

    /**
     * Fetch suggestion details
     * Uses /api/suggestion/:id/show endpoint (same as CyberRepublic)
     */
    async getSuggestionDetail(suggestionId) {
        const cacheKey = `suggestion_${suggestionId}`;
        // CyberRepublic uses /api/suggestion/:id/show endpoint
        const url = `${this.crApiBase}/api/suggestion/${suggestionId}/show`;
        
        try {
            const response = await this.httpGet(url, cacheKey);
            console.log('[DAO API] Suggestion detail raw response:', JSON.stringify(response, null, 2));
            
            // Extract the suggestion data - may be nested in different ways
            let suggestion = null;
            if (response && typeof response === 'object') {
                // Check various response structures
                if (response._id && response.title) {
                    // Direct suggestion object
                    suggestion = response;
                } else if (response.data && response.data._id) {
                    // Wrapped in data
                    suggestion = response.data;
                } else if (response.suggestion) {
                    // Wrapped in suggestion key
                    suggestion = response.suggestion;
                } else {
                    // Just return as-is
                    suggestion = response;
                }
            }
            
            console.log('[DAO API] Extracted suggestion:', suggestion ? suggestion.title : 'null');
            return suggestion;
        } catch (error) {
            console.error('[DAO API] Failed to fetch suggestion detail:', error);
            // Try fallback endpoint
            try {
                const fallbackUrl = `${this.crApiBase}/api/v2/suggestion/${suggestionId}`;
                const fallbackResponse = await this.httpGet(fallbackUrl);
                console.log('[DAO API] Fallback response:', JSON.stringify(fallbackResponse, null, 2));
                return fallbackResponse.data || fallbackResponse || null;
            } catch (fallbackError) {
                console.error('[DAO API] Fallback also failed:', fallbackError);
                throw error;
            }
        }
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
     * Based on CyberRepublic status flow:
     * - registered: Council voting (7 days)
     * - cragreed: Community veto period (7 days) 
     * - voteragreed: Passed (active proposal)
     * - finished: Completed
     * - crcanceled: Rejected by council
     * - votercanceled: Vetoed by community
     */
    static getStatusInfo(status) {
        const statusMap = {
            'registered': { label: 'Voting', class: 'registered', isFinal: false },
            'cragreed': { label: 'Veto Period', class: 'cragreed', isFinal: false },
            'voteragreed': { label: 'Passed', class: 'voteragreed', isFinal: true },
            'finished': { label: 'Completed', class: 'finished', isFinal: true },
            'crcanceled': { label: 'Rejected', class: 'crcanceled', isFinal: true },
            'votercanceled': { label: 'Vetoed', class: 'votercanceled', isFinal: true }
        };
        return statusMap[status] || { label: status, class: 'unknown', isFinal: false };
    }

    /**
     * Calculate time remaining for a proposal
     * CyberRepublic API returns different fields depending on endpoint:
     * - List endpoint: voteEndIn (minutes remaining as string)
     * - Detail endpoint: duration (seconds), proposedEnds/notificationEnds (Date)
     * @param {Object} proposal - Proposal object
     * @param {number} currentHeight - Current blockchain height (optional)
     * @returns {Object} { blocks, minutes, display }
     */
    static calculateTimeRemaining(proposal, currentHeight) {
        let secondsRemaining = 0;
        let endBlockHeight = proposal.proposedEndsHeight || proposal.notificationEndsHeight || 0;
        
        // Priority 1: Use voteEndIn from list API (in SECONDS - calculated as blocks * 2min * 60sec)
        if (proposal.voteEndIn) {
            secondsRemaining = parseInt(proposal.voteEndIn) || 0;
        }
        // Priority 2: Use duration (seconds) from detail API
        else if (proposal.duration && proposal.duration > 0) {
            secondsRemaining = proposal.duration;
        }
        // Priority 3: Calculate from proposedEnds/notificationEnds (Date/timestamp)
        else if (proposal.proposedEnds) {
            const endTime = new Date(proposal.proposedEnds).getTime();
            const now = Date.now();
            secondsRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        }
        else if (proposal.notificationEnds) {
            const endTime = new Date(proposal.notificationEnds).getTime();
            const now = Date.now();
            secondsRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        }
        // Priority 4: Calculate from block heights (2 min = 120 sec per block)
        else if (proposal.proposedEndsHeight && currentHeight) {
            const blocksRemaining = proposal.proposedEndsHeight - currentHeight;
            secondsRemaining = Math.max(0, blocksRemaining * 120);
        }
        else if (proposal.notificationEndsHeight && currentHeight) {
            const blocksRemaining = proposal.notificationEndsHeight - currentHeight;
            secondsRemaining = Math.max(0, blocksRemaining * 120);
        }
        
        if (secondsRemaining <= 0) {
            return { blocks: endBlockHeight, minutes: 0, display: 'Ended' };
        }
        
        const minutesRemaining = Math.floor(secondsRemaining / 60);
        const hoursRemaining = Math.floor(secondsRemaining / 3600);
        const daysRemaining = Math.floor(secondsRemaining / 86400);
        
        let display;
        if (daysRemaining > 0) {
            const hours = Math.floor((secondsRemaining % 86400) / 3600);
            const mins = Math.floor((secondsRemaining % 3600) / 60);
            display = `${daysRemaining}d ${hours}h ${mins}m`;
        } else if (hoursRemaining > 0) {
            const mins = Math.floor((secondsRemaining % 3600) / 60);
            display = `${hoursRemaining}h ${mins}m`;
        } else {
            display = `${minutesRemaining}m`;
        }
        
        return { blocks: endBlockHeight, minutes: minutesRemaining, display };
    }

    /**
     * Check if proposal status is final (can be cached permanently)
     */
    static isFinalStatus(status) {
        const finalStatuses = ['voteragreed', 'finished', 'crcanceled', 'votercanceled'];
        return finalStatuses.includes(status);
    }

    /**
     * Calculate council vote counts from proposal object
     * Handles multiple API response formats
     */
    static calculateVotes(proposal) {
        let approve = 0, reject = 0, abstain = 0;
        
        if (!proposal) {
            return { approve, reject, abstain, total: 12 };
        }

        // Check for crVotes object (CyberRepublic API format)
        if (proposal.crVotes) {
            approve = proposal.crVotes.approve || 0;
            reject = proposal.crVotes.reject || 0;
            abstain = proposal.crVotes.abstain || 0;
            return { approve, reject, abstain, total: 12 };
        }
        
        // Check for numeric counts
        if (proposal.votesFor !== undefined || proposal.approveNum !== undefined) {
            approve = proposal.votesFor || proposal.approveNum || 0;
            reject = proposal.votesAgainst || proposal.rejectNum || proposal.opposeNum || 0;
            abstain = proposal.abstentions || proposal.abstainNum || 0;
            return { approve, reject, abstain, total: 12 };
        }
        
        // Check for voteResult array
        const voteResult = proposal.voteResult || proposal.councilVote || proposal.voteStatus;
        
        if (Array.isArray(voteResult)) {
            voteResult.forEach(vote => {
                const value = (vote.value || vote.vote || vote.status || '').toLowerCase();
                if (value === 'support' || value === 'approve' || value === 'yes') approve++;
                else if (value === 'reject' || value === 'oppose' || value === 'no') reject++;
                else if (value === 'abstain' || value === 'abstention') abstain++;
            });
        }
        
        // Check for voteResultMap object
        if (approve === 0 && reject === 0 && abstain === 0 && proposal.voteResultMap) {
            Object.values(proposal.voteResultMap).forEach(vote => {
                const value = (typeof vote === 'string' ? vote : vote?.value || '').toLowerCase();
                if (value === 'support' || value === 'approve' || value === 'yes') approve++;
                else if (value === 'reject' || value === 'oppose' || value === 'no') reject++;
                else if (value === 'abstain' || value === 'abstention') abstain++;
            });
        }

        return { approve, reject, abstain, total: 12 };
    }
}

// Create global instance
window.daoApi = new DAOApiClient();
