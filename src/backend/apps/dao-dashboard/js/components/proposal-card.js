/**
 * Proposal Card Component
 * Renders a proposal row in list view (CyberRepublic style)
 */

class ProposalCard {
    /**
     * Create proposal row HTML (list view for desktop)
     * @param {Object} proposal - Proposal data
     * @returns {string} HTML string
     */
    static render(proposal) {
        const statusInfo = DAOApiClient.getStatusInfo(proposal.status);
        const votes = this.parseVoteResult(proposal.voteResult);
        const votePercent = votes.total > 0 ? ((votes.approve / votes.total) * 100).toFixed(1) : '0.0';
        
        const proposerName = proposal.proposer || proposal.proposerName || 'Unknown';
        const proposalId = proposal.vid || proposal.id || '--';
        const proposalType = proposal.type || 'New Motion';
        
        // Format date
        const dateStr = proposal.createdAt ? DAOApiClient.formatDate(proposal.createdAt) : '--';

        // Generate 12 vote bars
        const voteBarsHtml = this.renderVoteBars(votes.individual);

        return `
            <div class="proposal-row" data-hash="${proposal.proposalHash || proposal._id}" data-id="${proposalId}">
                <div class="proposal-col proposal-col-id">#${proposalId}</div>
                <div class="proposal-col proposal-col-title">
                    <a href="#" class="proposal-link">${this.escapeHtml(proposal.title || 'Untitled')}</a>
                </div>
                <div class="proposal-col proposal-col-type">${this.escapeHtml(proposalType)}</div>
                <div class="proposal-col proposal-col-proposer">${this.escapeHtml(proposerName)}</div>
                <div class="proposal-col proposal-col-votes">
                    <div class="vote-percent">${votePercent}%</div>
                    <div class="vote-bars">${voteBarsHtml}</div>
                </div>
                <div class="proposal-col proposal-col-date">${dateStr}</div>
                <div class="proposal-col proposal-col-status">
                    <span class="status-badge ${statusInfo.class}">${statusInfo.label.toUpperCase()}</span>
                </div>
            </div>
        `;
    }

    /**
     * Parse vote result into individual votes
     */
    static parseVoteResult(voteResult) {
        const result = { approve: 0, reject: 0, abstain: 0, total: 12, individual: [] };
        
        if (!voteResult || !Array.isArray(voteResult)) {
            // No votes yet - all gray
            for (let i = 0; i < 12; i++) {
                result.individual.push('pending');
            }
            return result;
        }

        // Parse each vote
        voteResult.forEach(vote => {
            const value = vote.value?.toLowerCase() || '';
            if (value === 'support' || value === 'approve') {
                result.approve++;
                result.individual.push('approve');
            } else if (value === 'reject') {
                result.reject++;
                result.individual.push('reject');
            } else if (value === 'abstain' || value === 'abstention') {
                result.abstain++;
                result.individual.push('abstain');
            } else {
                result.individual.push('pending');
            }
        });

        // Fill remaining slots as pending
        while (result.individual.length < 12) {
            result.individual.push('pending');
        }

        return result;
    }

    /**
     * Render 12 vote bars with colors
     */
    static renderVoteBars(votes) {
        return votes.map(vote => {
            let colorClass = 'vote-bar-pending';
            if (vote === 'approve') colorClass = 'vote-bar-approve';
            else if (vote === 'reject') colorClass = 'vote-bar-reject';
            else if (vote === 'abstain') colorClass = 'vote-bar-abstain';
            return `<div class="vote-bar ${colorClass}"></div>`;
        }).join('');
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
