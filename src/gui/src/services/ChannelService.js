/**
 * Channel Service
 * 
 * Frontend service for managing messaging channel connections.
 * Communicates with the PC2 node's Gateway API.
 */

class ChannelService {
    constructor() {
        this.channels = new Map();
        this.listeners = new Set();
        this.pollingInterval = null;
    }

    /**
     * Get API origin
     */
    getAPIOrigin() {
        return window.api_origin || window.location.origin;
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        if (window.auth_token) {
            return window.auth_token;
        }
        try {
            const savedSession = localStorage.getItem('pc2_session');
            if (savedSession) {
                const sessionData = JSON.parse(savedSession);
                return sessionData.session?.token || null;
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(endpoint, method = 'GET', body = null) {
        const apiOrigin = this.getAPIOrigin();
        const url = new URL(endpoint, apiOrigin);
        const authToken = this.getAuthToken();

        const headers = {
            'Content-Type': 'application/json'
        };
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const options = {
            method,
            headers
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url.toString(), options);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'API request failed');
        }

        return data.data;
    }

    /**
     * Get gateway status
     */
    async getStatus() {
        return this.apiRequest('/api/gateway/status');
    }

    /**
     * Get all channels
     */
    async getChannels() {
        const channels = await this.apiRequest('/api/gateway/channels');
        
        // Update local cache
        this.channels.clear();
        for (const channel of channels) {
            this.channels.set(channel.type, channel);
        }
        
        return channels;
    }

    /**
     * Get specific channel
     */
    async getChannel(channelType) {
        return this.apiRequest(`/api/gateway/channels/${channelType}`);
    }

    /**
     * Update channel configuration
     */
    async updateChannel(channelType, config) {
        return this.apiRequest(`/api/gateway/channels/${channelType}`, 'PUT', config);
    }

    /**
     * Connect a channel
     */
    async connectChannel(channelType, config = {}) {
        return this.apiRequest(`/api/gateway/channels/${channelType}/connect`, 'POST', config);
    }

    /**
     * Disconnect a channel
     */
    async disconnectChannel(channelType) {
        return this.apiRequest(`/api/gateway/channels/${channelType}/disconnect`, 'POST');
    }

    /**
     * Get all agents
     */
    async getAgents() {
        return this.apiRequest('/api/gateway/agents');
    }

    /**
     * Get specific agent
     */
    async getAgent(agentId) {
        return this.apiRequest(`/api/gateway/agents/${agentId}`);
    }

    /**
     * Create or update agent
     */
    async upsertAgent(agent) {
        if (agent.id) {
            // Update existing
            return this.apiRequest(`/api/gateway/agents/${agent.id}`, 'PUT', agent);
        } else {
            // Create new
            return this.apiRequest('/api/gateway/agents', 'POST', agent);
        }
    }

    /**
     * Delete agent
     */
    async deleteAgent(agentId) {
        return this.apiRequest(`/api/gateway/agents/${agentId}`, 'DELETE');
    }

    /**
     * Get pending pairing requests
     */
    async getPairings() {
        return this.apiRequest('/api/gateway/pairings');
    }

    /**
     * Approve a pairing request
     */
    async approvePairing(channel, senderId) {
        return this.apiRequest(`/api/gateway/pairings/${channel}/${encodeURIComponent(senderId)}/approve`, 'POST');
    }

    /**
     * Enable or disable gateway
     */
    async setEnabled(enabled) {
        return this.apiRequest('/api/gateway/enable', 'POST', { enabled });
    }

    /**
     * Add status change listener
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * Remove status change listener
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of status change
     */
    notifyListeners(event, data) {
        for (const listener of this.listeners) {
            try {
                listener(event, data);
            } catch (e) {
                console.error('[ChannelService] Listener error:', e);
            }
        }
    }

    /**
     * Start polling for status updates
     */
    startPolling(intervalMs = 30000) {
        if (this.pollingInterval) {
            return;
        }

        this.pollingInterval = setInterval(async () => {
            try {
                const status = await this.getStatus();
                this.notifyListeners('status', status);
            } catch (e) {
                // Ignore polling errors
            }
        }, intervalMs);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

// Singleton instance
let channelServiceInstance = null;

/**
 * Get or create channel service instance
 */
export function getChannelService() {
    if (!channelServiceInstance) {
        channelServiceInstance = new ChannelService();
    }
    return channelServiceInstance;
}

export default ChannelService;
