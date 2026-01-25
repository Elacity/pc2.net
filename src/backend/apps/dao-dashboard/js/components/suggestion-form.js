/**
 * Suggestion Form Component
 * Form for creating new suggestions
 */

class SuggestionForm {
    /**
     * Render the full suggestion form
     * @param {Object} draft - Optional draft data to pre-fill
     */
    static render(draft = {}) {
        return `
            <form class="suggestion-form" id="suggestionForm">
                <!-- Title -->
                <div class="form-group">
                    <label class="form-label" for="suggestionTitle">
                        Title <span class="required">*</span>
                    </label>
                    <input type="text" 
                           class="form-input" 
                           id="suggestionTitle" 
                           name="title"
                           placeholder="A clear, concise title for your suggestion"
                           maxlength="200"
                           value="${this.escapeHtml(draft.title || '')}"
                           required>
                    <div class="form-hint">Max 200 characters</div>
                </div>

                <!-- Type -->
                <div class="form-group">
                    <label class="form-label" for="suggestionType">
                        Type <span class="required">*</span>
                    </label>
                    <select class="form-select" id="suggestionType" name="type" required>
                        <option value="normal" ${draft.type === 'normal' ? 'selected' : ''}>Normal Proposal</option>
                        <option value="elip" ${draft.type === 'elip' ? 'selected' : ''}>ELIP (Technical Improvement)</option>
                        <option value="changeproposalowner" ${draft.type === 'changeproposalowner' ? 'selected' : ''}>Change Proposal Owner</option>
                        <option value="closeproposal" ${draft.type === 'closeproposal' ? 'selected' : ''}>Close Proposal</option>
                        <option value="secretarygeneral" ${draft.type === 'secretarygeneral' ? 'selected' : ''}>Secretary General Election</option>
                    </select>
                </div>

                <!-- Abstract -->
                <div class="form-group">
                    <label class="form-label" for="suggestionAbstract">
                        Abstract <span class="required">*</span>
                    </label>
                    <textarea class="form-textarea" 
                              id="suggestionAbstract" 
                              name="abstract"
                              placeholder="A brief summary of your suggestion (1-2 paragraphs)"
                              rows="4"
                              required>${this.escapeHtml(draft.abstract || '')}</textarea>
                    <div class="form-hint">Provide a high-level overview</div>
                </div>

                <!-- Goal -->
                <div class="form-group">
                    <label class="form-label" for="suggestionGoal">
                        Goal <span class="required">*</span>
                    </label>
                    <textarea class="form-textarea" 
                              id="suggestionGoal" 
                              name="goal"
                              placeholder="What are the specific goals this suggestion aims to achieve?"
                              rows="4"
                              required>${this.escapeHtml(draft.goal || '')}</textarea>
                </div>

                <!-- Motivation -->
                <div class="form-group">
                    <label class="form-label" for="suggestionMotivation">
                        Motivation <span class="required">*</span>
                    </label>
                    <textarea class="form-textarea" 
                              id="suggestionMotivation" 
                              name="motivation"
                              placeholder="Why is this suggestion important? What problem does it solve?"
                              rows="4"
                              required>${this.escapeHtml(draft.motivation || '')}</textarea>
                </div>

                <!-- Relevance -->
                <div class="form-group">
                    <label class="form-label">Relevance to Elastos</label>
                    <div id="relevanceItems">
                        ${this.renderRelevanceItems(draft.relevance || [])}
                    </div>
                    <button type="button" class="form-btn-secondary" id="addRelevanceBtn">
                        + Add Relevance Item
                    </button>
                </div>

                <!-- Budget Section -->
                <div class="form-section">
                    <h3 class="form-section-title">Budget</h3>
                    
                    <div class="form-group">
                        <label class="form-label" for="suggestionBudgetAmount">
                            Total Budget Amount (ELA)
                        </label>
                        <input type="number" 
                               class="form-input" 
                               id="suggestionBudgetAmount" 
                               name="budgetAmount"
                               placeholder="0"
                               min="0"
                               step="0.01"
                               value="${draft.budgetAmount || ''}">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="suggestionBudgetIntro">
                            Budget Breakdown
                        </label>
                        <textarea class="form-textarea" 
                                  id="suggestionBudgetIntro" 
                                  name="budgetIntro"
                                  placeholder="Describe how the budget will be allocated..."
                                  rows="3">${this.escapeHtml(draft.budgetIntro || '')}</textarea>
                    </div>
                </div>

                <!-- Implementation Plan -->
                <div class="form-section">
                    <h3 class="form-section-title">Implementation Plan</h3>
                    
                    <div class="form-group">
                        <label class="form-label" for="suggestionPlanIntro">
                            Plan Overview
                        </label>
                        <textarea class="form-textarea" 
                                  id="suggestionPlanIntro" 
                                  name="planIntro"
                                  placeholder="Describe the implementation plan and milestones..."
                                  rows="4">${this.escapeHtml(draft.planIntro || '')}</textarea>
                    </div>

                    <div id="milestoneItems">
                        ${this.renderMilestoneItems(draft.plan || [])}
                    </div>
                    <button type="button" class="form-btn-secondary" id="addMilestoneBtn">
                        + Add Milestone
                    </button>
                </div>

                <!-- Actions -->
                <div class="form-actions">
                    <button type="button" class="form-btn-secondary" id="saveDraftBtn">
                        Save Draft
                    </button>
                    <button type="button" class="form-btn-secondary" id="aiAssistBtn">
                        ✨ AI Assist
                    </button>
                    <button type="submit" class="form-btn-primary" id="submitSuggestionBtn">
                        Submit Suggestion
                    </button>
                </div>

                <div id="formMessage"></div>
            </form>
        `;
    }

    /**
     * Render relevance items
     */
    static renderRelevanceItems(items) {
        if (!items || items.length === 0) {
            return `<div class="empty-items">No relevance items added</div>`;
        }

        return items.map((item, index) => `
            <div class="relevance-item" data-index="${index}">
                <input type="text" 
                       class="form-input" 
                       name="relevance[${index}][title]" 
                       placeholder="Title"
                       value="${this.escapeHtml(item.title || '')}">
                <textarea class="form-textarea" 
                          name="relevance[${index}][relevanceDetail]" 
                          placeholder="How is this relevant to Elastos?"
                          rows="2">${this.escapeHtml(item.relevanceDetail || '')}</textarea>
                <button type="button" class="remove-item-btn" data-index="${index}">×</button>
            </div>
        `).join('');
    }

    /**
     * Render milestone items
     */
    static renderMilestoneItems(items) {
        if (!items || items.length === 0) {
            return `<div class="empty-items">No milestones added</div>`;
        }

        return items.map((item, index) => `
            <div class="milestone-item" data-index="${index}">
                <div class="milestone-header">
                    <span class="milestone-number">Milestone ${index + 1}</span>
                    <button type="button" class="remove-item-btn" data-index="${index}">×</button>
                </div>
                <input type="text" 
                       class="form-input" 
                       name="plan[${index}][version]" 
                       placeholder="Goal/Version"
                       value="${this.escapeHtml(item.version || '')}">
                <textarea class="form-textarea" 
                          name="plan[${index}][content]" 
                          placeholder="Description of this milestone..."
                          rows="2">${this.escapeHtml(item.content || '')}</textarea>
                <div class="milestone-budget">
                    <label>Budget (ELA):</label>
                    <input type="number" 
                           class="form-input" 
                           name="plan[${index}][amount]" 
                           placeholder="0"
                           min="0"
                           step="0.01"
                           value="${item.amount || ''}">
                </div>
            </div>
        `).join('');
    }

    /**
     * Render AI assist panel
     */
    static renderAIAssist() {
        return `
            <div class="ai-assist-panel">
                <div class="ai-assist-header">
                    <span>✨ AI Assistant</span>
                    <button type="button" class="close-ai-btn" id="closeAIBtn">×</button>
                </div>
                <div class="ai-assist-body">
                    <p>Describe your idea and let AI help fill in the form fields:</p>
                    <textarea class="form-textarea" 
                              id="aiPrompt" 
                              placeholder="Describe your suggestion idea in natural language..."
                              rows="4"></textarea>
                    <button type="button" class="form-btn-primary" id="generateWithAIBtn">
                        Generate Fields
                    </button>
                </div>
                <div id="aiLoading" style="display: none;">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                        <span>Generating...</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Collect form data
     */
    static collectFormData() {
        const form = document.getElementById('suggestionForm');
        if (!form) return null;

        const formData = new FormData(form);
        const data = {
            title: formData.get('title'),
            type: formData.get('type'),
            abstract: formData.get('abstract'),
            goal: formData.get('goal'),
            motivation: formData.get('motivation'),
            budgetAmount: parseFloat(formData.get('budgetAmount')) || 0,
            budgetIntro: formData.get('budgetIntro'),
            planIntro: formData.get('planIntro'),
            relevance: [],
            plan: []
        };

        // Collect relevance items
        document.querySelectorAll('.relevance-item').forEach((item, index) => {
            const title = item.querySelector(`[name="relevance[${index}][title]"]`)?.value;
            const detail = item.querySelector(`[name="relevance[${index}][relevanceDetail]"]`)?.value;
            if (title || detail) {
                data.relevance.push({ title, relevanceDetail: detail });
            }
        });

        // Collect milestone items
        document.querySelectorAll('.milestone-item').forEach((item, index) => {
            const version = item.querySelector(`[name="plan[${index}][version]"]`)?.value;
            const content = item.querySelector(`[name="plan[${index}][content]"]`)?.value;
            const amount = parseFloat(item.querySelector(`[name="plan[${index}][amount]"]`)?.value) || 0;
            if (version || content) {
                data.plan.push({ version, content, amount });
            }
        });

        return data;
    }

    /**
     * Validate form data
     */
    static validateFormData(data) {
        const errors = [];

        if (!data.title || data.title.trim().length < 10) {
            errors.push('Title must be at least 10 characters');
        }

        if (!data.abstract || data.abstract.trim().length < 50) {
            errors.push('Abstract must be at least 50 characters');
        }

        if (!data.goal || data.goal.trim().length < 50) {
            errors.push('Goal must be at least 50 characters');
        }

        if (!data.motivation || data.motivation.trim().length < 50) {
            errors.push('Motivation must be at least 50 characters');
        }

        return errors;
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
window.SuggestionForm = SuggestionForm;
