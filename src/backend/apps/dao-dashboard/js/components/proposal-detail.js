/**
 * Proposal Detail Component
 * Renders full proposal details in modal
 */

class ProposalDetail {
    /**
     * Render proposal detail HTML
     * @param {Object} proposal - Full proposal data
     * @returns {string} HTML string
     */
    static render(proposal) {
        const statusInfo = DAOApiClient.getStatusInfo(proposal.status);
        const votes = DAOApiClient.calculateVotes(proposal.voteResult);
        
        // Check if voting is possible (only for active proposals)
        const canVote = ['registered', 'cragreed', 'voteragreed'].includes(proposal.status);
        
        return `
            <div class="detail-header">
                <span class="proposal-status ${statusInfo.class}">${statusInfo.label}</span>
                <span class="proposal-id">#${proposal.vid || proposal.id}</span>
            </div>

            ${this.renderSection('Abstract', proposal.abstract)}
            
            ${this.renderSection('Goal', proposal.goal)}
            
            ${this.renderSection('Motivation', proposal.motivation)}
            
            ${this.renderBudgetSection(proposal.budgets)}
            
            ${this.renderCouncilVotes(proposal.voteResult)}
            
            ${this.renderSection('Proposer', `
                <div style="font-family: 'SF Mono', Monaco, monospace; font-size: 13px;">
                    ${proposal.proposer || '--'}
                    ${proposal.did ? `<br><span style="color: var(--text-muted);">${proposal.did}</span>` : ''}
                </div>
            `)}
            
            ${proposal.originalURL ? `
                <div class="detail-section">
                    <a href="${proposal.originalURL}" target="_blank" rel="noopener noreferrer" 
                       style="color: var(--primary); text-decoration: none; font-size: 13px;">
                        View on CyberRepublic →
                    </a>
                </div>
            ` : ''}

            ${canVote ? `
                <div class="detail-vote-section">
                    <button class="vote-now-btn" data-proposal-hash="${proposal.proposalHash || proposal._id}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Vote on This Proposal
                    </button>
                </div>
            ` : ''}
        `;
    }

    /**
     * Render a section with title and content
     */
    static renderSection(title, content) {
        if (!content) return '';
        
        return `
            <div class="detail-section">
                <h4 class="detail-section-title">${title}</h4>
                <div class="detail-section-content">${content}</div>
            </div>
        `;
    }

    /**
     * Render budget breakdown
     */
    static renderBudgetSection(budgets) {
        if (!budgets || !Array.isArray(budgets) || budgets.length === 0) {
            return '';
        }

        const budgetTypes = {
            'Imprest': 'Advance',
            'NormalPayment': 'Milestone',
            'FinalPayment': 'Completion'
        };

        const budgetItems = budgets.map(b => {
            const type = budgetTypes[b.type] || b.type || `Stage ${b.stage}`;
            const amount = DAOApiClient.formatELA(b.amount);
            const status = b.status || 'Pending';
            
            return `
                <div class="budget-item">
                    <span>${type}</span>
                    <span><strong>${amount} ELA</strong> - ${status}</span>
                </div>
            `;
        }).join('');

        const totalAmount = budgets.reduce((sum, b) => sum + parseInt(b.amount || 0), 0);

        return `
            <div class="detail-section">
                <h4 class="detail-section-title">Budget (${DAOApiClient.formatELA(totalAmount)} ELA total)</h4>
                <div class="budget-list">
                    ${budgetItems}
                </div>
            </div>
        `;
    }

    /**
     * Render council votes
     */
    static renderCouncilVotes(voteResult) {
        if (!voteResult || !Array.isArray(voteResult) || voteResult.length === 0) {
            return `
                <div class="detail-section">
                    <h4 class="detail-section-title">Council Votes</h4>
                    <div class="detail-section-content" style="color: var(--text-muted);">
                        No votes recorded yet
                    </div>
                </div>
            `;
        }

        const voteItems = voteResult.map(vote => {
            const name = vote.name || vote.didName || 'Council Member';
            const result = vote.value || vote.result || 'undecided';
            const resultClass = result === 'support' || result === 'approve' ? 'approve' 
                              : result === 'reject' ? 'reject' 
                              : 'abstain';
            const resultLabel = result === 'support' ? 'Approve' 
                              : result === 'approve' ? 'Approve'
                              : result === 'reject' ? 'Reject'
                              : result === 'abstain' || result === 'abstention' ? 'Abstain'
                              : 'Pending';
            
            const initial = name.charAt(0).toUpperCase();
            const avatarHtml = vote.avatar 
                ? `<img src="${vote.avatar}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : initial;

            return `
                <div class="vote-item">
                    <div class="vote-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--border-color);color:var(--text-muted);font-size:12px;font-weight:600;">
                        ${avatarHtml}
                    </div>
                    <span class="vote-name">${this.escapeHtml(name)}</span>
                    <span class="vote-result ${resultClass}">${resultLabel}</span>
                </div>
            `;
        }).join('');

        const counts = DAOApiClient.calculateVotes(voteResult);

        return `
            <div class="detail-section">
                <h4 class="detail-section-title">
                    Council Votes 
                    <span style="font-weight:normal;color:var(--text-muted);">
                        (${counts.approve} approve, ${counts.reject} reject, ${counts.abstain} abstain)
                    </span>
                </h4>
                <div class="council-votes-list">
                    ${voteItems}
                </div>
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
                <span>Loading proposal details...</span>
            </div>
        `;
    }

    /**
     * Render error state
     */
    static renderError(message) {
        return `
            <div class="empty-state">
                <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                <h3>Failed to load proposal</h3>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Escape HTML to prevent XSS
     */
    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export
window.ProposalDetail = ProposalDetail;
