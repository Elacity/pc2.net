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
        
        // Initialize wallet
        await this.initWallet();
        
        // Load initial data
        await this.loadCRStage();
        await this.loadProposals();
        
        console.log('[DAO Dashboard] Ready');
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

        // Proposal row/card clicks (delegated)
        document.getElementById('proposalsGrid')?.addEventListener('click', (e) => {
            // Prevent link click from propagating
            if (e.target.classList.contains('proposal-link')) {
                e.preventDefault();
            }
            const row = e.target.closest('.proposal-row') || e.target.closest('.proposal-card');
            if (row) {
                this.openProposalDetail(row.dataset.hash);
            }
        });

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

        // Show loading with progress bar
        loading.style.display = 'flex';
        empty.style.display = 'none';
        grid.innerHTML = '';
        this.updateProgress('proposals', 0, '0%');

        try {
            // Progress: 20% - starting request
            this.updateProgress('proposals', 20, '20%');
            
            let data;
            if (this.searchQuery) {
                data = await window.daoApi.searchProposals(this.searchQuery, this.currentPage, this.resultsPerPage);
            } else {
                data = await window.daoApi.getProposals(this.currentStatus, this.currentPage, this.resultsPerPage);
            }
            
            // Progress: 60% - data received
            this.updateProgress('proposals', 60, '60%');

            this.totalProposals = data.total || 0;
            const proposals = data.proposals || [];

            // Filter by type if needed
            let filteredProposals = proposals;
            if (this.currentType !== 'all') {
                filteredProposals = proposals.filter(p => p.type === this.currentType);
            }
            
            // Progress: 80% - processing complete
            this.updateProgress('proposals', 80, '80%');

            // Progress: 100% - done
            this.updateProgress('proposals', 100, '100%');
            
            // Small delay so user sees 100%
            await new Promise(r => setTimeout(r, 150));
            
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
                <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
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

            // Store proposal for voting
            this.currentDetailProposal = proposal;

            modalTitle.textContent = proposal.title || 'Proposal Details';
            modalBody.innerHTML = ProposalDetail.render(proposal);

            // Bind vote button
            const voteBtn = modalBody.querySelector('.vote-now-btn');
            if (voteBtn) {
                voteBtn.addEventListener('click', () => {
                    this.closeModal();
                    this.openVoteModal(proposal);
                });
            }

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

    async loadSuggestions() {
        const grid = document.getElementById('suggestionsGrid');
        const loading = document.getElementById('suggestionsLoading');

        if (!grid) return;

        loading.style.display = 'flex';
        grid.innerHTML = '';
        this.updateProgress('suggestions', 0, '0%');

        try {
            this.updateProgress('suggestions', 30, '30%');
            
            const data = await window.daoApi.getSuggestions(1, 20);
            console.log('[DAO Dashboard] Suggestions API response:', data);
            
            this.updateProgress('suggestions', 70, '70%');
            
            // Try multiple response formats
            const suggestions = data.list || data.suggestions || data.data?.list || [];
            console.log('[DAO Dashboard] Parsed suggestions:', suggestions.length);

            this.updateProgress('suggestions', 100, '100%');
            await new Promise(r => setTimeout(r, 150));
            
            loading.style.display = 'none';

            if (suggestions.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6m-5 4h4m-2-15a6 6 0 016 6c0 2.22-1.21 4.16-3 5.19V20H9v-1.81C7.21 17.16 6 15.22 6 13a6 6 0 016-6z"/></svg></div>
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
                    <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
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
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" style="vertical-align: middle;"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg> ${likes}</span>
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" style="vertical-align: middle;"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"/></svg> ${dislikes}</span>
                    <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg> ${ProposalCard.escapeHtml(suggestion.proposer || 'Unknown')}</span>
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
