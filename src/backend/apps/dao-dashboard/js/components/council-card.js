/**
 * Council Card Component
 * Renders a council member card
 */

class CouncilCard {
    /**
     * Create council member row HTML (list view)
     * @param {Object} member - Council member data
     * @returns {string} HTML string
     */
    static render(member) {
        const name = member.didName || member.nickname || 'Council Member';
        const did = member.did || '';
        const shortDid = DAOApiClient.truncateDID(did);
        const deposit = DAOApiClient.formatELA(member.depositAmount || 0);
        const impeachRatio = member.impeachmentRatio || 0;
        const impeachPercent = Math.min(impeachRatio * 100, 100);
        const location = this.getLocationName(member.location);
        
        // Avatar initial
        const initial = name.charAt(0).toUpperCase();

        return `
            <div class="proposal-row council-row" data-did="${did}">
                <div class="proposal-col proposal-col-id">
                    <span class="council-avatar-small">${initial}</span>
                </div>
                <div class="proposal-col proposal-col-title">${this.escapeHtml(name)}</div>
                <div class="proposal-col proposal-col-type">
                    <span class="council-did-inline" title="${did}">${shortDid}</span>
                    <button class="copy-btn-small" onclick="CouncilCard.copyAddress('${did}')" title="Copy DID">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="proposal-col proposal-col-proposer">${location}</div>
                <div class="proposal-col proposal-col-votes">
                    <div class="impeachment-bar-inline" title="${impeachPercent.toFixed(1)}%">
                        <div class="impeachment-fill" style="width: ${impeachPercent}%"></div>
                    </div>
                    <span class="impeach-text">${impeachPercent.toFixed(1)}%</span>
                </div>
                <div class="proposal-col proposal-col-status">
                    <span class="status-badge voteragreed">MEMBER</span>
                </div>
            </div>
        `;
    }

    /**
     * Render Secretary General row
     */
    static renderSecretary(secretary) {
        const name = secretary.didName || secretary.nickname || 'Secretary General';
        const did = secretary.did || '';
        const shortDid = DAOApiClient.truncateDID(did);
        
        const initial = name.charAt(0).toUpperCase();

        return `
            <div class="proposal-row council-row secretary-row" data-did="${did}">
                <div class="proposal-col proposal-col-id">
                    <span class="council-avatar-small secretary-avatar">${initial}</span>
                </div>
                <div class="proposal-col proposal-col-title">${this.escapeHtml(name)}</div>
                <div class="proposal-col proposal-col-type">
                    <span class="council-did-inline" title="${did}">${shortDid}</span>
                    <button class="copy-btn-small" onclick="CouncilCard.copyAddress('${did}')" title="Copy DID">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="proposal-col proposal-col-proposer">--</div>
                <div class="proposal-col proposal-col-votes">--</div>
                <div class="proposal-col proposal-col-status">
                    <span class="status-badge registered">SECRETARY</span>
                </div>
            </div>
        `;
    }

    /**
     * Copy address to clipboard
     */
    static copyAddress(address) {
        if (!address) return;
        
        navigator.clipboard.writeText(address).then(() => {
            // Show brief feedback
            const btn = event.target.closest('.copy-btn');
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                }, 1500);
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    /**
     * Render skeleton loading card
     */
    static renderSkeleton() {
        return `
            <div class="council-card">
                <div class="council-avatar skeleton" style="width: 64px; height: 64px; margin: 0 auto 16px;"></div>
                <div class="skeleton" style="width: 120px; height: 18px; margin: 0 auto 4px;"></div>
                <div class="skeleton" style="width: 100px; height: 14px; margin: 0 auto 16px;"></div>
                <div class="council-stats">
                    <div class="skeleton" style="width: 60px; height: 30px;"></div>
                    <div class="skeleton" style="width: 60px; height: 30px;"></div>
                </div>
            </div>
        `;
    }

    /**
     * Get location name from country code
     */
    static getLocationName(code) {
        const locations = {
            1: 'China',
            33: 'France',
            44: 'UK',
            49: 'Germany',
            65: 'Singapore',
            81: 'Japan',
            82: 'S. Korea',
            86: 'China',
            91: 'India',
            1001: 'USA',
            // Add more as needed
        };
        return locations[code] || 'Unknown';
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
window.CouncilCard = CouncilCard;
