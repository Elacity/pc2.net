/**
 * Council Card Component
 * Renders a council member card
 */

class CouncilCard {
    /**
     * Create council member card HTML
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
        
        // Avatar - use image if available, otherwise initial
        const initial = name.charAt(0).toUpperCase();
        const avatarHtml = member.avatar 
            ? `<img src="${member.avatar}" alt="${name}" onerror="this.style.display='none';this.parentElement.textContent='${initial}';">`
            : initial;

        return `
            <div class="council-card" data-did="${did}">
                <div class="council-avatar">
                    ${avatarHtml}
                </div>
                <h3 class="council-name">${this.escapeHtml(name)}</h3>
                <div class="council-did" title="${did}">${shortDid}</div>
                <div class="council-stats">
                    <div class="council-stat">
                        <div class="council-stat-value">${deposit}</div>
                        <div class="council-stat-label">ELA Deposit</div>
                    </div>
                    <div class="council-stat">
                        <div class="council-stat-value">${location}</div>
                        <div class="council-stat-label">Location</div>
                    </div>
                </div>
                <div class="impeachment-bar" title="Impeachment: ${impeachPercent.toFixed(1)}%">
                    <div class="impeachment-fill" style="width: ${impeachPercent}%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Render Secretary General card
     */
    static renderSecretary(secretary) {
        const name = secretary.didName || secretary.nickname || 'Secretary General';
        const did = secretary.did || '';
        const shortDid = DAOApiClient.truncateDID(did);
        
        const initial = name.charAt(0).toUpperCase();
        const avatarHtml = secretary.avatar 
            ? `<img src="${secretary.avatar}" alt="${name}" onerror="this.style.display='none';this.parentElement.textContent='${initial}';">`
            : initial;

        return `
            <div class="council-card secretary" data-did="${did}">
                <div class="council-avatar" style="background: linear-gradient(135deg, #f97316, #ea580c);">
                    ${avatarHtml}
                </div>
                <h3 class="council-name">${this.escapeHtml(name)}</h3>
                <div class="council-did" title="${did}">${shortDid}</div>
                <div class="council-stats">
                    <div class="council-stat">
                        <div class="council-stat-value">Secretary</div>
                        <div class="council-stat-label">Role</div>
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
