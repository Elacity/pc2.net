/**
 * Vote Modal Component
 * Renders voting interface for proposals
 */

class VoteModal {
    /**
     * Render vote form
     * @param {Object} proposal - Proposal to vote on
     * @param {Object} wallet - Wallet status
     */
    static render(proposal, wallet) {
        if (!wallet.connected) {
            return this.renderConnectPrompt();
        }

        return `
            <div class="vote-form">
                <div class="vote-proposal-title">${this.escapeHtml(proposal.title)}</div>
                
                <div class="vote-options" id="voteOptions">
                    <div class="vote-option approve" data-vote="approve">
                        <div class="vote-option-icon">✓</div>
                        <div>
                            <div class="vote-option-label">Approve</div>
                            <div class="vote-option-desc">Support this proposal</div>
                        </div>
                    </div>
                    
                    <div class="vote-option reject" data-vote="reject">
                        <div class="vote-option-icon">✗</div>
                        <div>
                            <div class="vote-option-label">Reject</div>
                            <div class="vote-option-desc">Vote against this proposal</div>
                        </div>
                    </div>
                    
                    <div class="vote-option abstain" data-vote="abstain">
                        <div class="vote-option-icon">−</div>
                        <div>
                            <div class="vote-option-label">Abstain</div>
                            <div class="vote-option-desc">Neither approve nor reject</div>
                        </div>
                    </div>
                </div>

                <div class="vote-amount-section">
                    <div class="vote-amount-label">
                        <span>Vote Amount (ELA)</span>
                        <span>Balance: ${DAOWalletService.formatELA(wallet.balance)} ELA</span>
                    </div>
                    <input type="number" 
                           class="vote-amount-input" 
                           id="voteAmount" 
                           placeholder="Enter amount"
                           min="1"
                           max="${wallet.balance || 0}"
                           step="0.01">
                </div>

                <div id="voteMessage"></div>

                <button class="vote-submit-btn" id="submitVoteBtn" disabled>
                    Select a vote option
                </button>
            </div>
        `;
    }

    /**
     * Render connect wallet prompt
     */
    static renderConnectPrompt() {
        return `
            <div class="vote-connect-prompt">
                <div class="empty-icon">🔐</div>
                <h3>Connect Your Wallet</h3>
                <p>You need to connect your ELA wallet to vote on proposals</p>
                <button class="vote-connect-btn" id="voteConnectBtn">
                    Connect Wallet
                </button>
            </div>
        `;
    }

    /**
     * Render loading state
     */
    static renderLoading() {
        return `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <span>Submitting vote...</span>
            </div>
        `;
    }

    /**
     * Render success state
     */
    static renderSuccess(txid) {
        return `
            <div class="vote-success">
                <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                <h3 style="margin-bottom: 8px;">Vote Submitted!</h3>
                <p style="margin-bottom: 16px;">Your vote has been recorded on the blockchain.</p>
                ${txid ? `
                    <p style="font-size: 11px; color: var(--text-muted); word-break: break-all;">
                        TX: ${txid}
                    </p>
                ` : ''}
                <button class="vote-submit-btn" onclick="document.getElementById('voteModal').classList.remove('active')" style="margin-top: 16px;">
                    Close
                </button>
            </div>
        `;
    }

    /**
     * Render error state
     */
    static renderError(message) {
        return `
            <div class="vote-error">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h3 style="margin-bottom: 8px;">Vote Failed</h3>
                <p>${this.escapeHtml(message)}</p>
                <button class="vote-submit-btn" onclick="window.daoApp.retryVote()" style="margin-top: 16px;">
                    Try Again
                </button>
            </div>
        `;
    }

    /**
     * Escape HTML
     */
    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export
window.VoteModal = VoteModal;
