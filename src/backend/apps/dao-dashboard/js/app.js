/**
 * Elastos DAO Dashboard - Main Application
 */

class DAODashboard {
    constructor() {
        this.currentTab = 'suggestions';
        this.currentStatus = 'all';
        this.currentType = 'all';
        this.currentPage = 1;
        this.resultsPerPage = 20; // Load more per page for lazy loading
        this.totalProposals = 0;
        this.searchQuery = '';
        this.searchTimeout = null;
        this.currentBlockHeight = null;
        
        // Lazy loading state
        this.loadedProposals = [];
        this.isLoadingMore = false;
        this.hasMoreProposals = true;
        
        // Suggestions lazy loading
        this.suggestionsPage = 1;
        this.loadedSuggestions = [];
        this.hasMoreSuggestions = true;
        this.isLoadingSuggestions = false;
        this.totalSuggestions = 0;
        
        // Voting state
        this.currentVoteProposal = null;
        this.selectedVoteType = null;
        
        this.init();
    }

    // ==================== PROGRESS BAR ====================

    updateProgress(elementPrefix, percentage, text = null) {
        const bar = document.getElementById(`${elementPrefix}ProgressBar`);
        const textEl = document.getElementById(`${elementPrefix}ProgressText`);
        
        if (bar) {
            bar.style.width = `${percentage}%`;
        }
        if (textEl) {
            textEl.textContent = text || `${percentage}%`;
        }
    }

    async init() {
        console.log('[DAO Dashboard] Initializing...');
        
        // Bind event handlers
        this.bindEvents();
        
        // Initialize wallet (non-blocking)
        this.initWallet();
        
        // Load stage indicator first (fast, important for user)
        this.loadCRStage().catch(e => console.warn('[DAO Dashboard] Stage load error:', e));
        
        // Load suggestions first (default tab)
        await this.loadSuggestions();
        
        // Hide sidebar on suggestions tab (filters are for proposals only)
        this.updateSidebarVisibility('suggestions');
        
        // Set up infinite scroll after first load
        this.setupInfiniteScroll();
        
        // Load status counts in background (for proposals)
        this.loadStatusCounts().catch(e => console.warn('[DAO Dashboard] Status counts error:', e));
        
        // Preload council and proposals in background for faster tab switching
        setTimeout(() => {
            this.preloadCouncil();
            this.preloadProposals();
        }, 500);
        
        console.log('[DAO Dashboard] Ready');
    }

    async preloadCouncil() {
        try {
            // Preload council data into cache
            await window.daoApi.getCouncilMembers();
            console.log('[DAO Dashboard] Council preloaded');
        } catch (e) {
            console.warn('[DAO Dashboard] Council preload failed:', e);
        }
    }

    async preloadSuggestions() {
        try {
            // Preload first page of suggestions into cache
            await window.daoApi.getSuggestions(1, 20);
            console.log('[DAO Dashboard] Suggestions preloaded');
        } catch (e) {
            console.warn('[DAO Dashboard] Suggestions preload failed:', e);
        }
    }

    async preloadProposals() {
        try {
            // Preload first page of proposals into cache
            await window.daoApi.getProposals(1, 20);
            console.log('[DAO Dashboard] Proposals preloaded');
        } catch (e) {
            console.warn('[DAO Dashboard] Proposals preload failed:', e);
        }
    }

    updateSidebarVisibility(tab) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        
        // Only show sidebar on proposals tab (filters are proposal-specific)
        if (tab === 'proposals') {
            sidebar.style.display = '';
        } else {
            sidebar.style.display = 'none';
        }
    }

    async initWallet() {
        try {
            await window.daoWallet.init();
            this.updateWalletUI();
        } catch (error) {
            console.error('[DAO Dashboard] Wallet init failed:', error);
        }
    }

    updateWalletUI() {
        const walletBtn = document.getElementById('walletBtn');
        const walletLabel = document.getElementById('walletLabel');
        
        if (!walletBtn || !walletLabel) return;

        const status = window.daoWallet.getStatus();
        
        if (status.connected) {
            walletBtn.classList.add('connected');
            // Show truncated DID if available, otherwise address
            if (status.did) {
                walletLabel.textContent = DAOWalletService.truncateDID(status.did);
            } else if (status.address) {
                walletLabel.textContent = DAOWalletService.truncateAddress(status.address);
            } else {
                walletLabel.textContent = 'Connected';
            }
        } else {
            walletBtn.classList.remove('connected');
            walletLabel.textContent = 'Connect DID';
        }
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeVoteModal();
                this.closeSuggestionModal();
                this.closeAIAssist();
            }
        });

        // Wallet button
        document.getElementById('walletBtn')?.addEventListener('click', () => this.handleWalletClick());

        // Vote modal
        document.getElementById('closeVoteModal')?.addEventListener('click', () => this.closeVoteModal());
        document.querySelector('#voteModal .modal-backdrop')?.addEventListener('click', () => this.closeVoteModal());

        // Create suggestion button
        document.getElementById('createSuggestionBtn')?.addEventListener('click', () => this.openSuggestionForm());

        // Proposal/Suggestion click handlers (delegated)
        document.addEventListener('click', (e) => {
            // Proposal link click
            const proposalLink = e.target.closest('.proposal-link:not(.suggestion-link)');
            if (proposalLink) {
                e.preventDefault();
                const row = proposalLink.closest('.proposal-row');
                if (row) {
                    const hash = row.dataset.hash;
                    if (hash) this.openProposalDetail(hash);
                }
            }
            
            // Suggestion link click
            const suggestionLink = e.target.closest('.suggestion-link');
            if (suggestionLink) {
                e.preventDefault();
                const row = suggestionLink.closest('.suggestion-row');
                if (row) {
                    const id = row.dataset.id;
                    if (id) this.openSuggestionDetail(id);
                }
            }
        });
    }

    // ==================== DETAIL VIEW ====================

    async openProposalDetail(proposalHash) {
        const mainContent = document.querySelector('.dao-main');
        if (!mainContent) return;
        
        // Store that we're viewing a detail and save original content
        this.viewingDetail = true;
        if (!this.originalMainContent) {
            this.originalMainContent = mainContent.innerHTML;
        }
        
        // Show loading in main content area
        mainContent.innerHTML = `
            <div class="detail-view">
                <div class="loading-container" style="display: flex;">
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-track">
                            <div class="progress-bar-fill" style="width: 50%"></div>
                        </div>
                    </div>
                    <div class="progress-text">Loading proposal...</div>
                </div>
            </div>
        `;
        
        try {
            // Fetch full proposal details
            const proposal = await window.daoApi.getProposalDetail(proposalHash);
            
            if (!proposal) {
                throw new Error('Proposal not found');
            }
            
            // Render detail view
            mainContent.innerHTML = DetailView.renderProposal(proposal);
            
            // Scroll to top
            window.scrollTo(0, 0);
            
        } catch (error) {
            console.error('[DAO Dashboard] Failed to load proposal:', error);
            mainContent.innerHTML = `
                <div class="detail-view">
                    <div class="detail-header">
                        <button class="back-btn" onclick="window.daoApp.closeDetailView('proposals')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                            Back to Proposals
                        </button>
                    </div>
                    <div class="empty-state">
                        <h3>Failed to load proposal</h3>
                        <p>${error.message}</p>
                    </div>
                </div>
            `;
        }
    }

    async openSuggestionDetail(suggestionId) {
        const mainContent = document.querySelector('.dao-main');
        if (!mainContent) return;
        
        // Store that we're viewing a detail and save original content
        this.viewingDetail = true;
        if (!this.originalMainContent) {
            this.originalMainContent = mainContent.innerHTML;
        }
        
        // Show loading
        mainContent.innerHTML = `
            <div class="detail-view">
                <div class="loading-container" style="display: flex;">
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-track">
                            <div class="progress-bar-fill" style="width: 50%"></div>
                        </div>
                    </div>
                    <div class="progress-text">Loading suggestion...</div>
                </div>
            </div>
        `;
        
        try {
            // Fetch full suggestion details
            const suggestion = await window.daoApi.getSuggestionDetail(suggestionId);
            
            console.log('[DAO Dashboard] Suggestion detail data:', JSON.stringify(suggestion, null, 2));
            
            if (!suggestion) {
                throw new Error('Suggestion not found');
            }
            
            // Render detail view
            mainContent.innerHTML = DetailView.renderSuggestion(suggestion);
            
            // Scroll to top
            window.scrollTo(0, 0);
            
        } catch (error) {
            console.error('[DAO Dashboard] Failed to load suggestion:', error);
            mainContent.innerHTML = `
                <div class="detail-view">
                    <div class="detail-header">
                        <button class="back-btn" onclick="window.daoApp.closeDetailView('suggestions')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                            Back to Suggestions
                        </button>
                    </div>
                    <div class="empty-state">
                        <h3>Failed to load suggestion</h3>
                        <p>${error.message}</p>
                    </div>
                </div>
            `;
        }
    }

    closeDetailView(tab = 'proposals') {
        console.log('[DAO Dashboard] Closing detail view, returning to:', tab);
        this.viewingDetail = false;
        
        // Restore original main content HTML
        const mainContent = document.querySelector('.dao-main');
        if (mainContent && this.originalMainContent) {
            console.log('[DAO Dashboard] Restoring original content');
            mainContent.innerHTML = this.originalMainContent;
        }
        
        // Clear saved content so next detail view saves fresh content
        this.originalMainContent = null;
        
        // Force reload the tab content - we need to bypass the currentTab check
        // by temporarily clearing it
        this.currentTab = null;
        
        // Now switch to the tab (this will reload the content)
        this.switchTab(tab);
        
        // Scroll to top
        window.scrollTo(0, 0);
    }

    // ==================== WALLET ====================

    async handleWalletClick() {
        const status = window.daoWallet.getStatus();
        
        if (status.connected) {
            // Show wallet info or disconnect option
            if (confirm(`Connected: ${status.address}\n\nDisconnect wallet?`)) {
                window.daoWallet.disconnect();
                this.updateWalletUI();
            }
        } else {
            // Connect wallet
            const connected = await window.daoWallet.connect();
            this.updateWalletUI();
            
            if (!connected) {
                alert('Failed to connect wallet. Please try again or use Essentials wallet.');
            }
        }
    }

    // ==================== VOTING ====================

    openVoteModal(proposal) {
        this.currentVoteProposal = proposal;
        this.selectedVoteType = null;
        
        const modal = document.getElementById('voteModal');
        const modalBody = document.getElementById('voteModalBody');
        
        const walletStatus = window.daoWallet.getStatus();
        modalBody.innerHTML = VoteModal.render(proposal, walletStatus);
        
        modal.classList.add('active');

        // Bind vote option clicks
        this.bindVoteModalEvents();
    }

    bindVoteModalEvents() {
        // Vote options
        document.querySelectorAll('#voteOptions .vote-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const voteType = e.currentTarget.dataset.vote;
                this.selectVoteOption(voteType);
            });
        });

        // Submit button
        document.getElementById('submitVoteBtn')?.addEventListener('click', () => this.submitVote());

        // Connect button in modal
        document.getElementById('voteConnectBtn')?.addEventListener('click', async () => {
            await window.daoWallet.connect();
            this.updateWalletUI();
            // Re-render modal if connected
            if (window.daoWallet.connected && this.currentVoteProposal) {
                this.openVoteModal(this.currentVoteProposal);
            }
        });
    }

    selectVoteOption(voteType) {
        this.selectedVoteType = voteType;

        // Update UI
        document.querySelectorAll('#voteOptions .vote-option').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.vote === voteType) {
                option.classList.add('selected');
            }
        });

        // Update submit button
        const submitBtn = document.getElementById('submitVoteBtn');
        if (submitBtn) {
            submitBtn.disabled = false;
            const labels = { approve: 'Vote Approve', reject: 'Vote Reject', abstain: 'Vote Abstain' };
            submitBtn.textContent = labels[voteType] || 'Submit Vote';
        }
    }

    async submitVote() {
        if (!this.currentVoteProposal || !this.selectedVoteType) {
            return;
        }

        const amountInput = document.getElementById('voteAmount');
        const amount = parseFloat(amountInput?.value || 0);

        if (!amount || amount <= 0) {
            this.showVoteMessage('Please enter a valid vote amount', 'error');
            return;
        }

        const walletStatus = window.daoWallet.getStatus();
        if (amount > walletStatus.balance) {
            this.showVoteMessage('Insufficient balance', 'error');
            return;
        }

        // Show loading
        const modalBody = document.getElementById('voteModalBody');
        modalBody.innerHTML = VoteModal.renderLoading();

        try {
            const result = await window.daoWallet.voteOnProposal(
                this.currentVoteProposal.proposalHash,
                this.selectedVoteType,
                amount
            );

            if (result.success) {
                modalBody.innerHTML = VoteModal.renderSuccess(result.txid);
                // Refresh wallet balance
                await window.daoWallet.fetchBalance();
                this.updateWalletUI();
            } else {
                throw new Error(result.error || 'Vote failed');
            }
        } catch (error) {
            console.error('[DAO Dashboard] Vote failed:', error);
            modalBody.innerHTML = VoteModal.renderError(error.message);
        }
    }

    retryVote() {
        if (this.currentVoteProposal) {
            this.openVoteModal(this.currentVoteProposal);
        }
    }

    showVoteMessage(message, type = 'error') {
        const messageEl = document.getElementById('voteMessage');
        if (messageEl) {
            messageEl.innerHTML = `<div class="vote-${type}">${message}</div>`;
        }
    }

    closeVoteModal() {
        const modal = document.getElementById('voteModal');
        modal.classList.remove('active');
        this.currentVoteProposal = null;
        this.selectedVoteType = null;
    }

    // ==================== SUGGESTIONS ====================

    openSuggestionForm() {
        const modal = document.getElementById('suggestionModal');
        const modalBody = document.getElementById('suggestionModalBody');

        // Load draft if exists
        const draft = this.loadDraft();
        modalBody.innerHTML = SuggestionForm.render(draft);
        modal.classList.add('active');

        // Bind form events
        this.bindSuggestionFormEvents();
    }

    bindSuggestionFormEvents() {
        // Close button
        document.getElementById('closeSuggestionModal')?.addEventListener('click', () => this.closeSuggestionModal());
        document.querySelector('#suggestionModal .modal-backdrop')?.addEventListener('click', () => this.closeSuggestionModal());

        // Add relevance item
        document.getElementById('addRelevanceBtn')?.addEventListener('click', () => this.addRelevanceItem());

        // Add milestone
        document.getElementById('addMilestoneBtn')?.addEventListener('click', () => this.addMilestoneItem());

        // Save draft
        document.getElementById('saveDraftBtn')?.addEventListener('click', () => this.saveDraft());

        // AI assist
        document.getElementById('aiAssistBtn')?.addEventListener('click', () => this.openAIAssist());

        // Form submit
        document.getElementById('suggestionForm')?.addEventListener('submit', (e) => this.submitSuggestion(e));

        // Remove item buttons (delegated)
        document.getElementById('suggestionForm')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-item-btn')) {
                e.target.closest('.relevance-item, .milestone-item')?.remove();
            }
        });
    }

    addRelevanceItem() {
        const container = document.getElementById('relevanceItems');
        const emptyMsg = container.querySelector('.empty-items');
        if (emptyMsg) emptyMsg.remove();

        const index = container.querySelectorAll('.relevance-item').length;
        const html = `
            <div class="relevance-item" data-index="${index}">
                <input type="text" class="form-input" name="relevance[${index}][title]" placeholder="Title">
                <textarea class="form-textarea" name="relevance[${index}][relevanceDetail]" placeholder="How is this relevant to Elastos?" rows="2"></textarea>
                <button type="button" class="remove-item-btn" data-index="${index}">×</button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    }

    addMilestoneItem() {
        const container = document.getElementById('milestoneItems');
        const emptyMsg = container.querySelector('.empty-items');
        if (emptyMsg) emptyMsg.remove();

        const index = container.querySelectorAll('.milestone-item').length;
        const html = `
            <div class="milestone-item" data-index="${index}">
                <div class="milestone-header">
                    <span class="milestone-number">Milestone ${index + 1}</span>
                    <button type="button" class="remove-item-btn" data-index="${index}">×</button>
                </div>
                <input type="text" class="form-input" name="plan[${index}][version]" placeholder="Goal/Version">
                <textarea class="form-textarea" name="plan[${index}][content]" placeholder="Description of this milestone..." rows="2"></textarea>
                <div class="milestone-budget">
                    <label>Budget (ELA):</label>
                    <input type="number" class="form-input" name="plan[${index}][amount]" placeholder="0" min="0" step="0.01">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    }

    saveDraft() {
        const data = SuggestionForm.collectFormData();
        if (data) {
            localStorage.setItem('dao_suggestion_draft', JSON.stringify(data));
            this.showFormMessage('Draft saved successfully!', 'success');
        }
    }

    loadDraft() {
        try {
            const saved = localStorage.getItem('dao_suggestion_draft');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    clearDraft() {
        localStorage.removeItem('dao_suggestion_draft');
    }

    openAIAssist() {
        // Show AI assist panel
        const panel = document.createElement('div');
        panel.id = 'aiAssistOverlay';
        panel.innerHTML = SuggestionForm.renderAIAssist();
        document.body.appendChild(panel);

        // Bind AI events
        document.getElementById('closeAIBtn')?.addEventListener('click', () => this.closeAIAssist());
        document.getElementById('generateWithAIBtn')?.addEventListener('click', () => this.generateWithAI());
    }

    closeAIAssist() {
        document.getElementById('aiAssistOverlay')?.remove();
    }

    async generateWithAI() {
        const prompt = document.getElementById('aiPrompt')?.value;
        if (!prompt || prompt.trim().length < 20) {
            alert('Please describe your idea in more detail (at least 20 characters)');
            return;
        }

        const loading = document.getElementById('aiLoading');
        const btn = document.getElementById('generateWithAIBtn');
        
        if (loading) loading.style.display = 'block';
        if (btn) btn.disabled = true;

        try {
            // Try to communicate with parent PC2 AI
            const result = await this.requestAIGeneration(prompt);
            
            if (result) {
                // Fill form fields with AI-generated content
                if (result.title) document.getElementById('suggestionTitle').value = result.title;
                if (result.abstract) document.getElementById('suggestionAbstract').value = result.abstract;
                if (result.goal) document.getElementById('suggestionGoal').value = result.goal;
                if (result.motivation) document.getElementById('suggestionMotivation').value = result.motivation;
                if (result.planIntro) document.getElementById('suggestionPlanIntro').value = result.planIntro;
                if (result.budgetIntro) document.getElementById('suggestionBudgetIntro').value = result.budgetIntro;

                this.closeAIAssist();
                this.showFormMessage('Fields generated by AI. Please review and edit.', 'success');
            }
        } catch (error) {
            console.error('[DAO Dashboard] AI generation failed:', error);
            alert('AI generation failed. Please try again or fill in the fields manually.');
        } finally {
            if (loading) loading.style.display = 'none';
            if (btn) btn.disabled = false;
        }
    }

    async requestAIGeneration(prompt) {
        // Send request to parent PC2 window for AI processing
        return new Promise((resolve, reject) => {
            if (!window.parent || window.parent === window) {
                reject(new Error('AI not available - not running in PC2'));
                return;
            }

            const messageId = `ai_${Date.now()}`;
            
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

            setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('AI request timeout'));
            }, 60000);

            window.parent.postMessage({
                type: 'dao-ai-request',
                messageId,
                action: 'generateSuggestion',
                data: {
                    prompt,
                    context: 'Elastos DAO proposal suggestion'
                }
            }, '*');
        });
    }

    async submitSuggestion(e) {
        e.preventDefault();

        const data = SuggestionForm.collectFormData();
        const errors = SuggestionForm.validateFormData(data);

        if (errors.length > 0) {
            this.showFormMessage(errors.join('<br>'), 'error');
            return;
        }

        const walletStatus = window.daoWallet.getStatus();
        if (!walletStatus.connected) {
            this.showFormMessage('Please connect your wallet first', 'error');
            return;
        }

        const submitBtn = document.getElementById('submitSuggestionBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
        }

        try {
            // Sign the suggestion with DID
            const signature = await this.signSuggestion(data);
            
            // Submit to API
            const result = await this.sendSuggestionToAPI(data, signature);

            if (result.success) {
                this.clearDraft();
                this.closeSuggestionModal();
                alert('Suggestion submitted successfully!');
                this.loadSuggestions(); // Refresh list
            } else {
                throw new Error(result.error || 'Submission failed');
            }
        } catch (error) {
            console.error('[DAO Dashboard] Suggestion submission failed:', error);
            this.showFormMessage(error.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Suggestion';
            }
        }
    }

    async signSuggestion(data) {
        // Use Essentials or wallet to sign the suggestion
        if (window.daoWallet.isEssentials && window.daoWallet.essentialsAPI) {
            const digest = this.hashSuggestionData(data);
            const result = await window.daoWallet.essentialsAPI.sendIntent('https://did.web3essentials.io/signdigest', {
                data: digest
            });
            return result?.signature || null;
        }
        
        // For non-Essentials, return null (API may not require signature)
        return null;
    }

    hashSuggestionData(data) {
        // Simple hash of the data for signing
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    async sendSuggestionToAPI(data, signature) {
        // Note: This would require JWT auth in production
        // For now, just log the attempt
        console.log('[DAO Dashboard] Would submit suggestion:', data, 'with signature:', signature);
        
        // Return mock success for now - actual API integration would need auth
        return {
            success: false,
            error: 'Suggestion submission requires authentication via CyberRepublic website. Draft saved locally.'
        };
    }

    showFormMessage(message, type = 'error') {
        const messageEl = document.getElementById('formMessage');
        if (messageEl) {
            const className = type === 'success' ? 'vote-success' : 'vote-error';
            messageEl.innerHTML = `<div class="${className}">${message}</div>`;
        }
    }

    closeSuggestionModal() {
        const modal = document.getElementById('suggestionModal');
        modal.classList.remove('active');
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

        // Update sidebar visibility (filters only apply to proposals)
        this.updateSidebarVisibility(tab);

        // Load data for tab
        if (tab === 'proposals') {
            this.loadProposals();
        } else if (tab === 'council') {
            this.loadCouncil();
        } else if (tab === 'suggestions') {
            this.loadSuggestions();
        }
    }

    // ==================== STATUS COUNTS ====================

    async loadStatusCounts() {
        console.log('[DAO Dashboard] Loading status counts...');
        try {
            // Fetch counts for each status
            const statuses = ['all', 'registered', 'cragreed', 'voteragreed', 'finished', 'crcanceled'];
            const counts = {};
            
            // Fetch all proposals first to get total count
            const allData = await window.daoApi.getProposals('all', 1, 1);
            console.log('[DAO Dashboard] All data response:', allData);
            counts.all = allData.total || 0;
            
            // Fetch counts for each status in parallel
            const statusPromises = statuses.slice(1).map(async (status) => {
                const data = await window.daoApi.getProposals(status, 1, 1);
                return { status, count: data.total || 0 };
            });
            
            const statusResults = await Promise.all(statusPromises);
            statusResults.forEach(result => {
                counts[result.status] = result.count;
            });
            
            console.log('[DAO Dashboard] Status counts:', counts);
            
            // Update UI
            this.updateStatusCounts(counts);
            
        } catch (error) {
            console.error('[DAO Dashboard] Failed to load status counts:', error);
        }
    }

    updateStatusCounts(counts) {
        const countElements = {
            'all': document.getElementById('count-all'),
            'registered': document.getElementById('count-registered'),
            'cragreed': document.getElementById('count-cragreed'),
            'voteragreed': document.getElementById('count-voteragreed'),
            'finished': document.getElementById('count-finished'),
            'crcanceled': document.getElementById('count-crcanceled')
        };
        
        Object.entries(countElements).forEach(([status, element]) => {
            if (element) {
                element.textContent = counts[status] || 0;
            }
        });
    }

    // ==================== PROPOSALS ====================

    async loadProposals(append = false) {
        const grid = document.getElementById('proposalsGrid');
        const loading = document.getElementById('proposalsLoading');
        const empty = document.getElementById('proposalsEmpty');

        if (!grid) return;

        // Reset state if not appending (new filter/search)
        if (!append) {
            this.currentPage = 1;
            this.loadedProposals = [];
            this.hasMoreProposals = true;
            grid.innerHTML = '';
            loading.style.display = 'flex';
            empty.style.display = 'none';
            this.updateProgress('proposals', 0, '0%');
        }

        if (this.isLoadingMore) return;
        this.isLoadingMore = true;

        try {
            // Progress: 20% - starting request
            if (!append) this.updateProgress('proposals', 20, '20%');
            
            // Get current block height for time remaining calculations
            let currentHeight = this.currentBlockHeight;
            if (!currentHeight) {
                try {
                    currentHeight = await window.daoApi.getBlockHeight();
                    this.currentBlockHeight = currentHeight;
                } catch (e) {
                    console.warn('[DAO Dashboard] Could not get block height:', e);
                }
            }
            
            let data;
            if (this.searchQuery) {
                data = await window.daoApi.searchProposals(this.searchQuery, this.currentPage, this.resultsPerPage);
            } else {
                data = await window.daoApi.getProposals(this.currentStatus, this.currentPage, this.resultsPerPage);
            }
            
            // Progress: 60% - data received
            if (!append) this.updateProgress('proposals', 60, '60%');

            this.totalProposals = data.total || 0;
            const proposals = data.proposals || [];

            // Filter by type if needed
            let filteredProposals = proposals;
            if (this.currentType !== 'all') {
                filteredProposals = proposals.filter(p => p.type === this.currentType);
            }
            
            // Cache final proposals to localStorage for sovereign storage
            filteredProposals.forEach(p => {
                if (DAOApiClient.isFinalStatus(p.status)) {
                    window.daoApi.cache.saveProposalPersistent(p);
                }
            });
            
            // Add to loaded proposals
            this.loadedProposals = this.loadedProposals.concat(filteredProposals);
            
            // Check if more pages available
            this.hasMoreProposals = this.loadedProposals.length < this.totalProposals;
            
            // Progress: 100% - done
            if (!append) {
                this.updateProgress('proposals', 100, '100%');
                await new Promise(r => setTimeout(r, 150));
            }
            
            loading.style.display = 'none';

            if (this.loadedProposals.length === 0) {
                empty.style.display = 'block';
                this.isLoadingMore = false;
                return;
            }

            // Render proposal cards with current block height for time remaining
            if (append) {
                // Append new proposals
                const newHtml = filteredProposals.map(p => ProposalCard.render(p, currentHeight)).join('');
                grid.insertAdjacentHTML('beforeend', newHtml);
            } else {
                grid.innerHTML = this.loadedProposals.map(p => ProposalCard.render(p, currentHeight)).join('');
            }

            // Update load more button
            this.updateLoadMoreButton('proposals');

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load proposals:', error);
            loading.style.display = 'none';
            if (!append) {
                empty.innerHTML = `
                    <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                    <h3>Failed to load proposals</h3>
                    <p>${error.message}</p>
                    <button onclick="window.daoApp.loadProposals()" style="margin-top: 16px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Try Again
                    </button>
                `;
                empty.style.display = 'block';
            }
        } finally {
            this.isLoadingMore = false;
        }
    }

    async loadMoreProposals() {
        if (!this.hasMoreProposals || this.isLoadingMore) return;
        this.currentPage++;
        await this.loadProposals(true);
    }

    setupInfiniteScroll() {
        // Create sentinel elements for intersection observer
        const proposalsGrid = document.getElementById('proposalsGrid');
        const suggestionsGrid = document.getElementById('suggestionsGrid');
        
        if (proposalsGrid && !document.getElementById('proposalsSentinel')) {
            const sentinel = document.createElement('div');
            sentinel.id = 'proposalsSentinel';
            sentinel.className = 'scroll-sentinel';
            proposalsGrid.parentElement.appendChild(sentinel);
        }
        
        if (suggestionsGrid && !document.getElementById('suggestionsSentinel')) {
            const sentinel = document.createElement('div');
            sentinel.id = 'suggestionsSentinel';
            sentinel.className = 'scroll-sentinel';
            suggestionsGrid.parentElement.appendChild(sentinel);
        }
        
        // Set up intersection observer for proposals
        this.proposalsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.hasMoreProposals && !this.isLoadingMore && this.currentTab === 'proposals') {
                    this.loadMoreProposals();
                }
            });
        }, { rootMargin: '200px' });
        
        const proposalsSentinel = document.getElementById('proposalsSentinel');
        if (proposalsSentinel) {
            this.proposalsObserver.observe(proposalsSentinel);
        }
        
        // Set up intersection observer for suggestions
        this.suggestionsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.hasMoreSuggestions && !this.isLoadingSuggestions && this.currentTab === 'suggestions') {
                    this.loadMoreSuggestions();
                }
            });
        }, { rootMargin: '200px' });
        
        const suggestionsSentinel = document.getElementById('suggestionsSentinel');
        if (suggestionsSentinel) {
            this.suggestionsObserver.observe(suggestionsSentinel);
        }
    }

    updateLoadMoreButton(type) {
        // No longer using load more buttons - using infinite scroll instead
        // Just ensure sentinel exists
        this.setupInfiniteScroll();
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

    // ==================== COUNCIL ====================

    async loadCouncil() {
        const grid = document.getElementById('councilGrid');
        const loading = document.getElementById('councilLoading');

        if (!grid) return;

        loading.style.display = 'flex';
        grid.innerHTML = '';
        this.updateProgress('council', 0, '0%');

        try {
            this.updateProgress('council', 30, '30%');
            
            const data = await window.daoApi.getCouncilMembers();
            
            this.updateProgress('council', 70, '70%');
            
            const members = data.council || data.crmembersinfo || [];
            const secretary = data.secretariat?.[0] || data.secretarygeneralinfo;

            this.updateProgress('council', 100, '100%');
            await new Promise(r => setTimeout(r, 150));
            
            loading.style.display = 'none';

            if (members.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="11" r="3"/><path d="M23 21v-1.5a3 3 0 00-3-3h-1"/></svg></div>
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
                    <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                    <h3>Failed to load council</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    // ==================== SUGGESTIONS ====================

    async loadSuggestions(append = false) {
        const grid = document.getElementById('suggestionsGrid');
        const loading = document.getElementById('suggestionsLoading');

        if (!grid) return;

        // Reset state if not appending
        if (!append) {
            this.suggestionsPage = 1;
            this.loadedSuggestions = [];
            this.hasMoreSuggestions = true;
            grid.innerHTML = '';
            loading.style.display = 'flex';
            this.updateProgress('suggestions', 0, '0%');
        }

        if (this.isLoadingSuggestions) return;
        this.isLoadingSuggestions = true;

        try {
            if (!append) this.updateProgress('suggestions', 30, '30%');
            
            // Fetch more suggestions per page (50 instead of 20)
            const data = await window.daoApi.getSuggestions(this.suggestionsPage, 50);
            console.log('[DAO Dashboard] Suggestions API response:', data);
            
            if (!append) this.updateProgress('suggestions', 70, '70%');
            
            // Try multiple response formats
            const suggestions = data.list || data.suggestions || data.data?.list || [];
            this.totalSuggestions = data.total || suggestions.length;
            
            // Add to loaded suggestions
            this.loadedSuggestions = this.loadedSuggestions.concat(suggestions);
            
            // Check if more pages available
            this.hasMoreSuggestions = suggestions.length >= 50 && this.loadedSuggestions.length < this.totalSuggestions;
            
            console.log('[DAO Dashboard] Parsed suggestions:', suggestions.length, 'Total loaded:', this.loadedSuggestions.length);

            if (!append) {
                this.updateProgress('suggestions', 100, '100%');
                await new Promise(r => setTimeout(r, 150));
            }
            
            loading.style.display = 'none';

            if (this.loadedSuggestions.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6m-5 4h4m-2-15a6 6 0 016 6c0 2.22-1.21 4.16-3 5.19V20H9v-1.81C7.21 17.16 6 15.22 6 13a6 6 0 016-6z"/></svg></div>
                        <h3>No suggestions found</h3>
                    </div>
                `;
                this.isLoadingSuggestions = false;
                return;
            }

            // Render as list (like proposals) - add header if first load
            if (append) {
                const newHtml = suggestions.map(s => this.renderSuggestionRow(s)).join('');
                grid.insertAdjacentHTML('beforeend', newHtml);
            } else {
                grid.innerHTML = this.renderSuggestionsHeader() + 
                    this.loadedSuggestions.map(s => this.renderSuggestionRow(s)).join('');
            }

            // Update load more button
            this.updateLoadMoreButton('suggestions');

        } catch (error) {
            console.error('[DAO Dashboard] Failed to load suggestions:', error);
            loading.style.display = 'none';
            if (!append) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                        <h3>Failed to load suggestions</h3>
                        <p>${error.message}</p>
                    </div>
                `;
            }
        } finally {
            this.isLoadingSuggestions = false;
        }
    }

    async loadMoreSuggestions() {
        if (!this.hasMoreSuggestions || this.isLoadingSuggestions) return;
        this.suggestionsPage++;
        await this.loadSuggestions(true);
    }

    renderSuggestionsHeader() {
        // Return empty - we'll use inline header row like proposals
        return '';
    }

    renderSuggestionRow(suggestion) {
        // Note: CyberRepublic API's suggestion list endpoint doesn't return likesNum/dislikesNum
        // Those fields are only available in the detail view
        const status = suggestion.status || 'active';
        const id = suggestion.displayId || suggestion.id || '--';
        const title = suggestion.title || 'Untitled';
        const author = suggestion.createdBy?.username || suggestion.proposer || 'Unknown';
        const type = suggestion.type || 'Suggestion';
        const dateStr = suggestion.createdAt ? DAOApiClient.formatDate(suggestion.createdAt) : '--';
        
        // Status mapping for suggestions
        const statusMap = {
            'active': { label: 'Active', class: 'registered' },
            'proposed': { label: 'Proposed', class: 'cragreed' },
            'signed': { label: 'Signed', class: 'voteragreed' },
            'unsigned': { label: 'Unsigned', class: 'unknown' },
            'archived': { label: 'Archived', class: 'finished' },
            'rejected': { label: 'Rejected', class: 'crcanceled' }
        };
        const statusInfo = statusMap[status] || { label: status, class: 'unknown' };

        // Use sid (MongoDB ObjectId) for the API, fall back to _id
        const suggestionId = suggestion.sid || suggestion._id;
        
        return `
            <div class="proposal-row suggestion-row" data-id="${suggestionId}">
                <div class="proposal-col proposal-col-id">#${id}</div>
                <div class="proposal-col proposal-col-title">
                    <a href="#" class="proposal-link suggestion-link">${this.escapeHtml(title)}</a>
                </div>
                <div class="proposal-col proposal-col-type">${this.escapeHtml(type)}</div>
                <div class="proposal-col proposal-col-proposer">${this.escapeHtml(author)}</div>
                <div class="proposal-col proposal-col-date">${dateStr}</div>
                <div class="proposal-col proposal-col-status">
                    <span class="status-badge ${statusInfo.class}">${statusInfo.label.toUpperCase()}</span>
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderSuggestionCard(suggestion) {
        // Note: Likes/dislikes not available in list API, only in detail view
        const status = suggestion.status || 'active';
        // Use sid (MongoDB ObjectId) for the API, fall back to _id
        const suggestionId = suggestion.sid || suggestion._id;
        const author = suggestion.createdBy?.username || suggestion.proposer || 'Unknown';
        const dateStr = suggestion.createdAt ? DAOApiClient.formatDate(suggestion.createdAt) : '--';

        return `
            <div class="proposal-card suggestion-card" data-id="${suggestionId}">
                <div class="proposal-header">
                    <span class="proposal-status ${status === 'active' ? 'voteragreed' : 'finished'}">${status}</span>
                    <span class="proposal-id">#${suggestion.displayId || suggestion.id || '--'}</span>
                </div>
                <h3 class="proposal-title">${ProposalCard.escapeHtml(suggestion.title || 'Untitled')}</h3>
                <div class="proposal-meta">
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg> ${ProposalCard.escapeHtml(author)}</span>
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${dateStr}</span>
                </div>
            </div>
        `;
    }

    // ==================== CR STAGE ====================

    async loadCRStage() {
        const nameEl = document.getElementById('stageNameCompact');
        const timeEl = document.getElementById('stageTimeCompact');
        const progressBar = document.getElementById('stageProgressBarCompact');
        
        if (nameEl) nameEl.textContent = 'Loading...';
        
        try {
            // Get stage info
            const stage = await window.daoApi.getCRStage();
            const height = await window.daoApi.getBlockHeight();
            
            if (stage && height) {
                this.updateStageIndicator(stage, height);
            } else {
                throw new Error('Invalid response');
            }
        } catch (error) {
            console.error('[DAO Dashboard] Stage load error:', error);
            // Show fallback with estimated values
            if (nameEl) nameEl.textContent = 'Council Active';
            if (timeEl) timeEl.textContent = '~141d';
            if (progressBar) progressBar.style.width = '50%';
        }
    }

    updateStageIndicator(stage, currentHeight) {
        // Store current height for proposal time calculations
        this.currentBlockHeight = currentHeight;
        
        // Compact stage indicator elements
        const nameEl = document.getElementById('stageNameCompact');
        const timeEl = document.getElementById('stageTimeCompact');
        const progressBar = document.getElementById('stageProgressBarCompact');

        if (!nameEl) return; // Elements not found

        if (!stage) {
            nameEl.textContent = 'Unable to load';
            if (timeEl) timeEl.textContent = '';
            if (progressBar) progressBar.style.width = '0%';
            return;
        }

        // Determine current stage
        let stageName, startHeight, endHeight;
        
        if (stage.invoting) {
            stageName = 'CR Voting';
            startHeight = stage.votingstartheight;
            endHeight = stage.votingendheight;
        } else if (stage.onduty) {
            stageName = 'Council Active';
            startHeight = stage.ondutystartheight;
            endHeight = stage.ondutyendheight;
        } else {
            stageName = 'Idle';
            startHeight = 0;
            endHeight = 0;
        }

        nameEl.textContent = stageName;

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
        await this.loadStatusCounts();
        
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
