/**
 * Wallet Service for DAO Dashboard
 * Integrates with PC2's existing DID tethering mechanism
 */

class DAOWalletService {
    constructor() {
        this.connected = false;
        this.did = null;
        this.address = null;
        this.balance = null;
        this.wallets = null;
        
        // Check for Essentials in-app browser
        this.isEssentials = this.detectEssentials();
        this.essentialsAPI = window.essentialsIntentAPI || null;
    }

    /**
     * Detect if running inside Essentials wallet browser
     */
    detectEssentials() {
        const ua = navigator.userAgent.toLowerCase();
        return ua.includes('elastos') || ua.includes('essentials') || !!window.essentialsIntentAPI;
    }

    /**
     * Initialize - check for existing tethered DID from PC2
     */
    async init() {
        console.log('[DAO Wallet] Initializing...');
        
        // First, try to get tethered DID from parent PC2 window
        try {
            const didStatus = await this.sendToParent('getTetheredDID');
            console.log('[DAO Wallet] Tethered DID status:', didStatus);
            
            if (didStatus && didStatus.did) {
                this.connected = true;
                this.did = didStatus.did;
                this.wallets = didStatus.wallets || {};
                this.address = didStatus.wallets?.ela || null;
                console.log('[DAO Wallet] Connected via tethered DID:', this.did);
                return true;
            }
        } catch (error) {
            console.log('[DAO Wallet] No tethered DID available:', error.message);
        }
        
        // If inside Essentials, try direct connection
        if (this.isEssentials) {
            console.log('[DAO Wallet] Essentials detected, trying direct connection');
            await this.connectEssentials();
        }

        return this.connected;
    }

    /**
     * Connect via Essentials Intent API (for in-app browser)
     */
    async connectEssentials() {
        try {
            if (!this.essentialsAPI) {
                console.warn('[DAO Wallet] Essentials API not available');
                return false;
            }

            // Request DID and wallet info
            const result = await this.essentialsAPI.sendIntent('https://did.web3essentials.io/credaccess', {
                claims: {
                    elaaddress: true
                }
            });

            if (result && result.presentation) {
                // Extract ELA address from credentials
                const credentials = result.presentation.verifiableCredential || [];
                for (const cred of credentials) {
                    if (cred.credentialSubject?.elaaddress) {
                        this.address = cred.credentialSubject.elaaddress;
                        break;
                    }
                }
            }

            if (this.address) {
                this.connected = true;
                await this.fetchBalance();
                console.log('[DAO Wallet] Connected via Essentials:', this.address);
            }

            return this.connected;
        } catch (error) {
            console.error('[DAO Wallet] Essentials connection failed:', error);
            return false;
        }
    }

    /**
     * Check for existing Web3 connection (MetaMask, etc.)
     */
    async checkWeb3Connection() {
        try {
            // Check if there's a connected wallet in parent window
            if (window.parent && window.parent !== window) {
                // Try to communicate with parent PC2 window
                const response = await this.sendToParent('getWalletStatus');
                if (response && response.connected) {
                    this.address = response.address;
                    this.balance = response.balance;
                    this.connected = true;
                    console.log('[DAO Wallet] Connected via parent:', this.address);
                }
            }
        } catch (error) {
            console.log('[DAO Wallet] No parent wallet connection');
        }

        return this.connected;
    }

    /**
     * Request DID connection - opens PC2's DID tether modal
     */
    async connect() {
        if (this.isEssentials) {
            return await this.connectEssentials();
        }

        // Request parent PC2 to open DID tether modal
        try {
            console.log('[DAO Wallet] Requesting DID tether from parent...');
            const response = await this.sendToParent('openDIDTether');
            
            if (response && response.did) {
                this.connected = true;
                this.did = response.did;
                this.wallets = response.wallets || {};
                this.address = response.wallets?.ela || null;
                console.log('[DAO Wallet] DID tethered successfully:', this.did);
                return true;
            }
        } catch (error) {
            console.error('[DAO Wallet] DID tether failed:', error);
        }

        return false;
    }

    /**
     * Disconnect / untether DID
     */
    disconnect() {
        this.connected = false;
        this.did = null;
        this.address = null;
        this.balance = null;
        this.wallets = null;
    }

    /**
     * Fetch ELA balance
     */
    async fetchBalance() {
        if (!this.address) return null;

        try {
            const response = await fetch('https://api.elastos.io/ela', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'getreceivedbyaddress',
                    params: { address: this.address },
                    id: 1
                })
            });

            const data = await response.json();
            if (data.result) {
                this.balance = parseInt(data.result) / 100000000; // SELA to ELA
            }
        } catch (error) {
            console.error('[DAO Wallet] Balance fetch failed:', error);
        }

        return this.balance;
    }

    // ==================== VOTING TRANSACTIONS ====================

    /**
     * Vote on a proposal
     * @param {string} proposalHash - The proposal hash
     * @param {string} voteType - 'approve', 'reject', or 'abstain'
     * @param {number} amount - Vote amount in ELA
     */
    async voteOnProposal(proposalHash, voteType, amount) {
        if (!this.connected) {
            throw new Error('Wallet not connected');
        }

        console.log('[DAO Wallet] Voting on proposal:', proposalHash, voteType, amount);

        if (this.isEssentials) {
            return await this.voteViaEssentials(proposalHash, voteType, amount);
        } else {
            return await this.voteViaWeb3(proposalHash, voteType, amount);
        }
    }

    /**
     * Vote via Essentials Intent
     */
    async voteViaEssentials(proposalHash, voteType, amount) {
        if (!this.essentialsAPI) {
            throw new Error('Essentials API not available');
        }

        // Map vote type to Elastos format
        const voteTypeMap = {
            'approve': 'support',
            'reject': 'reject',
            'abstain': 'abstain'
        };

        try {
            // Use CR proposal voting intent
            const result = await this.essentialsAPI.sendIntent('https://did.web3essentials.io/crproposal', {
                command: 'voteproposal',
                data: {
                    proposalHash: proposalHash,
                    voteResult: voteTypeMap[voteType] || voteType,
                    amount: Math.floor(amount * 100000000) // ELA to SELA
                }
            });

            if (result && result.txid) {
                return {
                    success: true,
                    txid: result.txid,
                    message: 'Vote submitted successfully'
                };
            } else {
                throw new Error(result?.error || 'Vote failed');
            }
        } catch (error) {
            console.error('[DAO Wallet] Essentials vote failed:', error);
            throw error;
        }
    }

    /**
     * Vote via Web3 (parent window)
     */
    async voteViaWeb3(proposalHash, voteType, amount) {
        try {
            const response = await this.sendToParent('voteOnProposal', {
                proposalHash,
                voteType,
                amount
            });

            if (response && response.success) {
                return response;
            } else {
                throw new Error(response?.error || 'Vote failed');
            }
        } catch (error) {
            console.error('[DAO Wallet] Web3 vote failed:', error);
            throw error;
        }
    }

    /**
     * Vote for council member election
     * @param {string} candidateDID - The candidate's DID
     * @param {number} amount - Vote amount in ELA
     */
    async voteForCouncil(candidateDID, amount) {
        if (!this.connected) {
            throw new Error('Wallet not connected');
        }

        console.log('[DAO Wallet] Voting for council:', candidateDID, amount);

        if (this.isEssentials) {
            return await this.councilVoteViaEssentials(candidateDID, amount);
        } else {
            return await this.councilVoteViaWeb3(candidateDID, amount);
        }
    }

    /**
     * Council vote via Essentials
     */
    async councilVoteViaEssentials(candidateDID, amount) {
        if (!this.essentialsAPI) {
            throw new Error('Essentials API not available');
        }

        try {
            const result = await this.essentialsAPI.sendIntent('https://did.web3essentials.io/crproposal', {
                command: 'votecrcouncil',
                data: {
                    candidates: [candidateDID],
                    amount: Math.floor(amount * 100000000)
                }
            });

            if (result && result.txid) {
                return {
                    success: true,
                    txid: result.txid,
                    message: 'Council vote submitted successfully'
                };
            } else {
                throw new Error(result?.error || 'Vote failed');
            }
        } catch (error) {
            console.error('[DAO Wallet] Council vote failed:', error);
            throw error;
        }
    }

    /**
     * Council vote via Web3
     */
    async councilVoteViaWeb3(candidateDID, amount) {
        try {
            const response = await this.sendToParent('voteForCouncil', {
                candidateDID,
                amount
            });

            if (response && response.success) {
                return response;
            } else {
                throw new Error(response?.error || 'Vote failed');
            }
        } catch (error) {
            console.error('[DAO Wallet] Web3 council vote failed:', error);
            throw error;
        }
    }

    // ==================== COMMUNICATION ====================

    /**
     * Send message to parent PC2 window
     */
    sendToParent(action, data = {}) {
        return new Promise((resolve, reject) => {
            if (!window.parent || window.parent === window) {
                reject(new Error('No parent window'));
                return;
            }

            const messageId = `dao_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const handler = (event) => {
                if (event.data && event.data.messageId === messageId) {
                    window.removeEventListener('message', handler);
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else {
                        resolve(event.data.result);
                    }
                }
            };

            window.addEventListener('message', handler);

            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Request timeout'));
            }, 30000);

            window.parent.postMessage({
                type: 'dao-wallet-request',
                messageId,
                action,
                data
            }, '*');
        });
    }

    // ==================== HELPERS ====================

    /**
     * Format ELA amount for display
     */
    static formatELA(amount) {
        if (!amount) return '0';
        return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }

    /**
     * Truncate address for display
     */
    static truncateAddress(address) {
        if (!address) return '';
        if (address.length <= 12) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    /**
     * Truncate DID for display
     */
    static truncateDID(did) {
        if (!did) return '';
        if (did.length <= 20) return did;
        // Format: did:elastos:abcd...wxyz
        const parts = did.split(':');
        if (parts.length === 3) {
            const id = parts[2];
            return `did:...${id.slice(-8)}`;
        }
        return `${did.slice(0, 10)}...${did.slice(-6)}`;
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.connected,
            did: this.did,
            address: this.address,
            balance: this.balance,
            wallets: this.wallets,
            isEssentials: this.isEssentials
        };
    }
}

// Create global instance
window.daoWallet = new DAOWalletService();
