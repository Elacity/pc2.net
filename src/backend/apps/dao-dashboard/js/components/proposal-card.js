/**
 * Proposal Card Component
 * Renders a proposal card in the grid
 */

class ProposalCard {
    /**
     * Create proposal card HTML
     * @param {Object} proposal - Proposal data
     * @returns {string} HTML string
     */
    static render(proposal) {
        const statusInfo = DAOApiClient.getStatusInfo(proposal.status);
        const votes = DAOApiClient.calculateVotes(proposal.voteResult);
        const votePercent = Math.round((votes.approve / votes.total) * 100);
        
        // Calculate total budget
        let totalBudget = 0;
        if (proposal.budgets && Array.isArray(proposal.budgets)) {
            proposal.budgets.forEach(b => {
                totalBudget += parseInt(b.amount || 0);
            });
        } else if (proposal.budgetAmount) {
            totalBudget = parseInt(proposal.budgetAmount);
        }

        const proposerName = proposal.proposer || proposal.proposerName || 'Unknown';
        const proposalId = proposal.vid || proposal.id || '--';

        return `
            <div class="proposal-card" data-hash="${proposal.proposalHash || proposal._id}" data-id="${proposalId}">
                <div class="proposal-header">
                    <span class="proposal-status ${statusInfo.class}">${statusInfo.label}</span>
                    <span class="proposal-id">#${proposalId}</span>
                </div>
                <h3 class="proposal-title">${this.escapeHtml(proposal.title || 'Untitled')}</h3>
                <div class="proposal-meta">
                    <span class="proposal-budget">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-4-8h8m-6 4h4"/></svg> ${DAOApiClient.formatELA(totalBudget)} ELA
                    </span>
                    <span class="proposal-proposer">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg> ${this.escapeHtml(proposerName)}
                    </span>
                </div>
                <div class="proposal-votes">
                    <div class="votes-label">Council Votes</div>
                    <div class="votes-bar">
                        <div class="votes-fill" style="width: ${votePercent}%"></div>
                    </div>
                    <div class="votes-count">
                        <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> ${votes.approve} approve</span>
                        <span>${votes.approve}/${votes.total}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render skeleton loading card
     */
    static renderSkeleton() {
        return `
            <div class="proposal-card">
                <div class="proposal-header">
                    <div class="skeleton" style="width: 80px; height: 20px;"></div>
                    <div class="skeleton" style="width: 40px; height: 16px;"></div>
                </div>
                <div class="skeleton" style="width: 100%; height: 40px; margin: 8px 0;"></div>
                <div class="proposal-meta">
                    <div class="skeleton" style="width: 100px; height: 16px;"></div>
                    <div class="skeleton" style="width: 80px; height: 16px;"></div>
                </div>
                <div class="proposal-votes">
                    <div class="skeleton" style="width: 80px; height: 12px; margin-bottom: 4px;"></div>
                    <div class="skeleton" style="width: 100%; height: 6px;"></div>
                </div>
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
window.ProposalCard = ProposalCard;
