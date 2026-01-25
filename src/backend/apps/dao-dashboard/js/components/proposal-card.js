/**
 * Proposal Card Component
 * Renders a proposal row in list view (CyberRepublic style)
 */

class ProposalCard {
    /**
     * Create proposal row HTML (list view for desktop)
     * @param {Object} proposal - Proposal data
     * @param {number} currentHeight - Current blockchain height (optional)
     * @returns {string} HTML string
     */
    static render(proposal, currentHeight = null) {
        const statusInfo = DAOApiClient.getStatusInfo(proposal.status);
        const votes = this.parseVoteResult(proposal);
        
        const proposerName = proposal.proposer || proposal.proposerName || 'Unknown';
        const proposalId = proposal.vid || proposal.id || '--';
        const proposalType = proposal.type || 'New Motion';
        
        // Always show the date
        const dateStr = proposal.createdAt ? DAOApiClient.formatDate(proposal.createdAt) : '--';
        
        // Calculate time remaining for active voting periods (like CyberRepublic)
        // CyberRepublic API returns:
        // - proposedEndsHeight: the actual end block height
        // - proposedEnds: minutes remaining (already calculated by backend)
        const timeRemaining = DAOApiClient.calculateTimeRemaining(proposal, currentHeight);
        const showTimeRemaining = !statusInfo.isFinal && timeRemaining.minutes > 0;
        
        // Build time remaining display for status column (below status badge)
        let timeRemainingHtml = '';
        if (showTimeRemaining) {
            timeRemainingHtml = `<div class="time-remaining-inline">Ends in: ${timeRemaining.display}</div>`;
        }

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
                    <div class="vote-bars">${voteBarsHtml}</div>
                </div>
                <div class="proposal-col proposal-col-date">${dateStr}</div>
                <div class="proposal-col proposal-col-status">
                    <span class="status-badge ${statusInfo.class}">${statusInfo.label.toUpperCase()}</span>
                    ${timeRemainingHtml}
                </div>
            </div>
        `;
    }

    /**
     * Parse vote result into individual votes
     * Handles multiple API response formats:
     * - voteResult: array of {value: 'support'|'reject'|'abstain'}
     * - voteResultMap: object with council member votes
     * - votesFor/votesAgainst/abstentions: numeric counts
     */
    static parseVoteResult(proposal) {
        const result = { approve: 0, reject: 0, abstain: 0, total: 12, individual: [] };
        
        // Handle null/undefined proposal
        if (!proposal) {
            for (let i = 0; i < 12; i++) {
                result.individual.push('pending');
            }
            return result;
        }

        // Try different vote data formats
        const voteResult = proposal.voteResult || proposal.councilVote || proposal.voteStatus;
        
        // Format 1: Array of vote objects
        if (Array.isArray(voteResult) && voteResult.length > 0) {
            voteResult.forEach(vote => {
                const value = (vote.value || vote.vote || vote.status || '').toLowerCase();
                if (value === 'support' || value === 'approve' || value === 'yes') {
                    result.approve++;
                    result.individual.push('approve');
                } else if (value === 'reject' || value === 'oppose' || value === 'no') {
                    result.reject++;
                    result.individual.push('reject');
                } else if (value === 'abstain' || value === 'abstention') {
                    result.abstain++;
                    result.individual.push('abstain');
                } else {
                    result.individual.push('pending');
                }
            });
        }
        
        // Format 2: crVotes object (from CyberRepublic API)
        if (result.individual.length === 0 && proposal.crVotes) {
            const approveNum = proposal.crVotes.approve || 0;
            const rejectNum = proposal.crVotes.reject || 0;
            const abstainNum = proposal.crVotes.abstain || 0;
            
            result.approve = approveNum;
            result.reject = rejectNum;
            result.abstain = abstainNum;
            
            // Build individual array from counts
            for (let i = 0; i < approveNum; i++) result.individual.push('approve');
            for (let i = 0; i < rejectNum; i++) result.individual.push('reject');
            for (let i = 0; i < abstainNum; i++) result.individual.push('abstain');
        }
        
        // Format 3: Numeric counts (votesFor, votesAgainst, abstentions)
        if (result.individual.length === 0 && (proposal.votesFor !== undefined || proposal.approveNum !== undefined)) {
            const approveNum = proposal.votesFor || proposal.approveNum || 0;
            const rejectNum = proposal.votesAgainst || proposal.rejectNum || proposal.opposeNum || 0;
            const abstainNum = proposal.abstentions || proposal.abstainNum || 0;
            
            result.approve = approveNum;
            result.reject = rejectNum;
            result.abstain = abstainNum;
            
            // Build individual array from counts
            for (let i = 0; i < approveNum; i++) result.individual.push('approve');
            for (let i = 0; i < rejectNum; i++) result.individual.push('reject');
            for (let i = 0; i < abstainNum; i++) result.individual.push('abstain');
        }
        
        // Format 3: voteResultMap object
        if (result.individual.length === 0 && proposal.voteResultMap) {
            Object.values(proposal.voteResultMap).forEach(vote => {
                const value = (typeof vote === 'string' ? vote : vote?.value || '').toLowerCase();
                if (value === 'support' || value === 'approve' || value === 'yes') {
                    result.approve++;
                    result.individual.push('approve');
                } else if (value === 'reject' || value === 'oppose' || value === 'no') {
                    result.reject++;
                    result.individual.push('reject');
                } else if (value === 'abstain' || value === 'abstention') {
                    result.abstain++;
                    result.individual.push('abstain');
                } else {
                    result.individual.push('pending');
                }
            });
        }

        // Fill remaining slots as pending (12 council members total)
        while (result.individual.length < 12) {
            result.individual.push('pending');
        }
        
        // Trim to 12 if more
        if (result.individual.length > 12) {
            result.individual = result.individual.slice(0, 12);
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
