/**
 * Elastos DAO Dashboard - Main Application
 */

class DAODashboard {
    constructor() {
        this.currentTab = 'proposals';
        this.currentStatus = 'all';
        this.currentType = 'all';
        this.currentPage = 1;
        this.resultsPerPage = 12;
        this.totalProposals = 0;
        this.searchQuery = '';
        this.searchTimeout = null;
        
        this.init();
    }

    async init() {
        console.log('[DAO Dashboard] Initializing...');
        
        // Bind event handlers
        this.bindEvents();
        
        // Load initial data
        await this.loadCRStage();
        await this.loadProposals();
        
        console.log('[DAO Dashboard] Ready');
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab, .mobile-nav-item').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Status filters
        document.querySelectorAll('#statusFilters .filter-item').forEach(filter => {
            filter.addEventListener('click', (e) => this.setStatusFilter(e.currentTarget.dataset.status));
        });

        // Type filters
        document.querySelectorAll('#typeFilters .filter-item').forEach(filter => {
            filter.addEventListener('click', (e) => this.setTypeFilter(e.currentTarget.dataset.type));
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        // Pagination
        document.getElementById('prevPage')?.addEventListener('click', () => this.prevPage());
        document.getElementById('nextPage')?.addEventListener('click', () => this.nextPage());

        // Modal
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
        document.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());

        // Proposal card clicks (delegated)
        document.getElementById('proposalsGrid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.proposal-card');
            if (card) {
                this.openProposalDetail(card.dataset.hash);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    // ==================== TAB MANAGEMENT ====================

    switchTab(tab) {
        if (!tab || tab === this.currentTab) return;

        this.currentTab = tab;

        // Update tab UI
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll(`[data-tab="${tab}"]`).forEach(t => t.classList.add('active'));

        // Update content panels
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tab}-content`)?.classList.add('active');

        // Load data for tab
        if (tab === 'proposals') {
            this.loadProposals();
        } else if (tab === 'council') {
            this.loadCouncil();
        } else if (tab === 'suggestions') {
            this.loadSuggestions();
        }
    }

    // ==================== PROPOSALS ====================

    async loadProposals() {
        const grid = document.getElementById('proposalsGrid');
        const loading = document.getElementById('proposalsLoading');
        const empty = document.getElementById('proposalsEmpty');

        if (!grid) return;

        // Show loading
        loading.style.display = 'flex';
        empty.style.display = 'none';
        grid.innerHTML = '';

        try {
            let data;
            if (this.searchQuery) {
                data = await window.daoApi.searchProposals(this.searchQuery, this.currentPage, this.resultsPerPage);
            } else {
                data = await window.daoApi.getProposals(this.currentStatus, this.currentPage, this.resultsPerPage);
            }

            this.totalProposals = data.total || 0;
            const proposals = data.proposals || [];

            // Filter by type if needed
            let filteredProposals = proposals;
            if (this.currentType !== 'all') {
                filteredProposals = proposals.filter(p => p.type === this.currentType);
            }

            loading.style.display = 'none';

            if (filteredProposals.length === 0) {
                empty.style.display = 'block';
                return;
            }

            // Render proposal cards
            grid.innerHTML = filteredProposals.map(p => ProposalCard.render(p)).join('');

            // Update pagination
            this.updatePagination();

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load proposals:', error);
            loading.style.display = 'none';
            empty.innerHTML = `
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load proposals</h3>
                <p>${error.message}</p>
                <button onclick="window.daoApp.loadProposals()" style="margin-top: 16px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Try Again
                </button>
            `;
            empty.style.display = 'block';
        }
    }

    setStatusFilter(status) {
        this.currentStatus = status;
        this.currentPage = 1;

        // Update UI
        document.querySelectorAll('#statusFilters .filter-item').forEach(f => {
            f.classList.toggle('active', f.dataset.status === status);
        });

        this.loadProposals();
    }

    setTypeFilter(type) {
        this.currentType = type;
        this.currentPage = 1;

        // Update UI
        document.querySelectorAll('#typeFilters .filter-item').forEach(f => {
            f.classList.toggle('active', f.dataset.type === type);
        });

        this.loadProposals();
    }

    handleSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.searchQuery = query.trim();
            this.currentPage = 1;
            this.loadProposals();
        }, 300);
    }

    updatePagination() {
        const totalPages = Math.ceil(this.totalProposals / this.resultsPerPage);
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${totalPages || 1}`;
        }
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadProposals();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.totalProposals / this.resultsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.loadProposals();
        }
    }

    // ==================== PROPOSAL DETAIL ====================

    async openProposalDetail(proposalHash) {
        if (!proposalHash) return;

        const modal = document.getElementById('proposalModal');
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');

        modal.classList.add('active');
        modalBody.innerHTML = ProposalDetail.renderLoading();

        try {
            const proposal = await window.daoApi.getProposalDetail(proposalHash);
            
            if (!proposal) {
                throw new Error('Proposal not found');
            }

            modalTitle.textContent = proposal.title || 'Proposal Details';
            modalBody.innerHTML = ProposalDetail.render(proposal);

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load proposal detail:', error);
            modalBody.innerHTML = ProposalDetail.renderError(error.message);
        }
    }

    closeModal() {
        const modal = document.getElementById('proposalModal');
        modal.classList.remove('active');
    }

    // ==================== COUNCIL ====================

    async loadCouncil() {
        const grid = document.getElementById('councilGrid');
        const loading = document.getElementById('councilLoading');

        if (!grid) return;

        loading.style.display = 'flex';
        grid.innerHTML = '';

        try {
            const data = await window.daoApi.getCouncilMembers();
            const members = data.council || data.crmembersinfo || [];
            const secretary = data.secretariat?.[0] || data.secretarygeneralinfo;

            loading.style.display = 'none';

            if (members.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon">👥</div>
                        <h3>No council members found</h3>
                    </div>
                `;
                return;
            }

            // Render Secretary General first if available
            let html = '';
            if (secretary) {
                html += CouncilCard.renderSecretary(secretary);
            }

            // Render council members
            html += members.map(m => CouncilCard.render(m)).join('');
            grid.innerHTML = html;

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load council:', error);
            loading.style.display = 'none';
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load council</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    // ==================== SUGGESTIONS ====================

    async loadSuggestions() {
        const grid = document.getElementById('suggestionsGrid');
        const loading = document.getElementById('suggestionsLoading');

        if (!grid) return;

        loading.style.display = 'flex';
        grid.innerHTML = '';

        try {
            const data = await window.daoApi.getSuggestions(1, 20);
            const suggestions = data.list || [];

            loading.style.display = 'none';

            if (suggestions.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon">💡</div>
                        <h3>No suggestions found</h3>
                    </div>
                `;
                return;
            }

            // Render suggestion cards (reuse proposal card structure)
            grid.innerHTML = suggestions.map(s => this.renderSuggestionCard(s)).join('');

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load suggestions:', error);
            loading.style.display = 'none';
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load suggestions</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    renderSuggestionCard(suggestion) {
        const likes = suggestion.likesNum || 0;
        const dislikes = suggestion.dislikesNum || 0;
        const status = suggestion.status || 'active';

        return `
            <div class="proposal-card suggestion-card" data-id="${suggestion._id}">
                <div class="proposal-header">
                    <span class="proposal-status ${status === 'active' ? 'voteragreed' : 'finished'}">${status}</span>
                    <span class="proposal-id">#${suggestion.displayId || '--'}</span>
                </div>
                <h3 class="proposal-title">${ProposalCard.escapeHtml(suggestion.title || 'Untitled')}</h3>
                <div class="proposal-meta">
                    <span>👍 ${likes}</span>
                    <span>👎 ${dislikes}</span>
                    <span>👤 ${ProposalCard.escapeHtml(suggestion.proposer || 'Unknown')}</span>
                </div>
            </div>
        `;
    }

    // ==================== CR STAGE ====================

    async loadCRStage() {
        try {
            const stage = await window.daoApi.getCRStage();
            const height = await window.daoApi.getBlockHeight();
            
            this.updateStageIndicator(stage, height);
        } catch (error) {
            console.error('[DAO Dashboard] Failed to load CR stage:', error);
            this.updateStageIndicator(null, null);
        }
    }

    updateStageIndicator(stage, currentHeight) {
        const nameEl = document.getElementById('stageName');
        const blockEl = document.getElementById('stageBlock');
        const timeEl = document.getElementById('stageTime');
        const progressBar = document.getElementById('stageProgressBar');

        if (!stage) {
            nameEl.textContent = 'Unable to load stage';
            blockEl.textContent = '';
            timeEl.textContent = '';
            progressBar.style.width = '0%';
            return;
        }

        // Determine current stage
        let stageName, startHeight, endHeight;
        
        if (stage.invoting) {
            stageName = 'CR Voting Period';
            startHeight = stage.votingstartheight;
            endHeight = stage.votingendheight;
        } else if (stage.onduty) {
            stageName = 'CR Council On Duty';
            startHeight = stage.ondutystartheight;
            endHeight = stage.ondutyendheight;
        } else {
            stageName = 'Idle Period';
            startHeight = 0;
            endHeight = 0;
        }

        nameEl.textContent = stageName;
        blockEl.textContent = `Block: ${currentHeight?.toLocaleString() || '--'}`;

        // Calculate progress and time remaining
        if (startHeight && endHeight && currentHeight) {
            const total = endHeight - startHeight;
            const elapsed = currentHeight - startHeight;
            const progress = Math.min(Math.max((elapsed / total) * 100, 0), 100);
            
            const blocksRemaining = endHeight - currentHeight;
            const minutesRemaining = blocksRemaining * 2; // ~2 min per block
            const daysRemaining = Math.floor(minutesRemaining / 60 / 24);
            const hoursRemaining = Math.floor((minutesRemaining / 60) % 24);

            progressBar.style.width = `${progress}%`;
            timeEl.textContent = `${daysRemaining}d ${hoursRemaining}h remaining`;
        } else {
            progressBar.style.width = '0%';
            timeEl.textContent = '';
        }
    }

    // ==================== UTILITIES ====================

    async refresh() {
        // Clear cache
        window.daoApi.cache.clear();

        // Reload current tab
        await this.loadCRStage();
        
        if (this.currentTab === 'proposals') {
            await this.loadProposals();
        } else if (this.currentTab === 'council') {
            await this.loadCouncil();
        } else if (this.currentTab === 'suggestions') {
            await this.loadSuggestions();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.daoApp = new DAODashboard();
});
