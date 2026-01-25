/**
 * Detail View Component
 * Renders full proposal/suggestion detail page (not modal)
 */

class DetailView {
    /**
     * Render proposal detail view
     */
    static renderProposal(proposal) {
        const statusInfo = DAOApiClient.getStatusInfo(proposal.status);
        const dateStr = proposal.createdAt ? this.formatTimestamp(proposal.createdAt) : '--';
        
        // Calculate time remaining if in voting
        let timeRemainingHtml = '';
        if (proposal.duration && proposal.duration > 0) {
            const days = Math.floor(proposal.duration / 86400);
            const hours = Math.floor((proposal.duration % 86400) / 3600);
            const mins = Math.floor((proposal.duration % 3600) / 60);
            timeRemainingHtml = `<span class="time-remaining-badge">${days}d ${hours}h ${mins}m remaining</span>`;
        }
        
        return `
            <div class="detail-view">
                <div class="detail-header">
                    <button class="back-btn" onclick="window.daoApp.closeDetailView('proposals')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back to Proposals
                    </button>
                    <div class="detail-header-right">
                        ${timeRemainingHtml}
                        <span class="status-badge ${statusInfo.class}">${statusInfo.label.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="detail-content">
                    <div class="detail-main">
                        <h1 class="detail-title">${this.escapeHtml(proposal.title || 'Untitled')}</h1>
                        
                        <div class="detail-meta">
                            <div class="meta-item">
                                <span class="meta-label">Proposal ID</span>
                                <span class="meta-value">#${proposal.id || proposal.vid || '--'}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Type</span>
                                <span class="meta-value">${this.capitalize(proposal.type) || 'Normal'}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Proposer</span>
                                <span class="meta-value">${this.escapeHtml(proposal.proposer || 'Unknown')}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Created</span>
                                <span class="meta-value">${dateStr}</span>
                            </div>
                            ${proposal.recipient ? `
                            <div class="meta-item">
                                <span class="meta-label">Recipient</span>
                                <span class="meta-value recipient-address">${this.truncateAddress(proposal.recipient)}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        ${this.renderHtmlSection('Abstract', proposal.abstract)}
                        ${this.renderHtmlSection('Motivation', proposal.motivation)}
                        ${this.renderHtmlSection('Goal', proposal.goal)}
                        ${this.renderPlanSection(proposal)}
                        ${this.renderBudgetSection(proposal)}
                        ${this.renderMilestoneSection(proposal.milestone)}
                        ${this.renderTeamSection(proposal.implementationTeam)}
                        ${this.renderVoteResults(proposal.crVotes)}
                    </div>
                    
                    <div class="detail-sidebar">
                        ${this.renderVoteSummary(proposal.crVotes, statusInfo)}
                        ${this.renderNavigation(proposal)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render suggestion detail view
     */
    static renderSuggestion(suggestion) {
        // Debug: log all keys to understand structure
        console.log('[DetailView] Suggestion keys:', Object.keys(suggestion || {}));
        console.log('[DetailView] Suggestion data:', suggestion);
        
        // Extract fields with fallbacks for different API response structures
        const title = suggestion.title || suggestion.name || 'Untitled';
        const displayId = suggestion.displayId || suggestion.vid || suggestion._id || '--';
        const createdAt = suggestion.createdAt || suggestion.createdDate || suggestion.created;
        const dateStr = createdAt ? this.formatTimestamp(createdAt) : '--';
        const likes = suggestion.likesNum || suggestion.likes || suggestion.likeCount || 0;
        const dislikes = suggestion.dislikesNum || suggestion.dislikes || suggestion.dislikeCount || 0;
        const status = suggestion.status || 'active';
        
        // Author can be in different structures
        let authorName = 'Unknown';
        if (suggestion.createdBy) {
            if (typeof suggestion.createdBy === 'string') {
                authorName = suggestion.createdBy;
            } else if (suggestion.createdBy.profile) {
                authorName = suggestion.createdBy.profile.firstName || 
                             suggestion.createdBy.profile.lastName ||
                             suggestion.createdBy.username || 'Unknown';
            } else if (suggestion.createdBy.username) {
                authorName = suggestion.createdBy.username;
            } else if (suggestion.createdBy.email) {
                authorName = suggestion.createdBy.email.split('@')[0];
            }
        } else if (suggestion.author) {
            authorName = suggestion.author;
        } else if (suggestion.proposer) {
            authorName = suggestion.proposer;
        }
        
        // Content fields
        const abstract = suggestion.abstract || suggestion.shortDesc || suggestion.description || suggestion.desc || '';
        const motivation = suggestion.motivation || '';
        const goal = suggestion.goal || '';
        
        // Plan can be a string or object - use planIntro for intro text
        let planContent = '';
        if (suggestion.planIntro) {
            planContent = suggestion.planIntro;
        } else if (suggestion.plan && typeof suggestion.plan === 'string') {
            planContent = suggestion.plan;
        }
        
        // Budget intro
        const budgetIntro = suggestion.budgetIntro || '';
        
        // Relevance is an array - extract relevanceDetail from each item
        let relevanceContent = '';
        if (Array.isArray(suggestion.relevance) && suggestion.relevance.length > 0) {
            relevanceContent = suggestion.relevance.map(r => {
                const title = r.title || 'Related Proposal';
                const detail = r.relevanceDetail || '';
                return `<div class="relevance-item"><h4>${this.escapeHtml(title)}</h4>${detail}</div>`;
            }).join('');
        } else if (typeof suggestion.relevance === 'string') {
            relevanceContent = suggestion.relevance;
        }
        
        const comments = suggestion.comments || [];
        
        return `
            <div class="detail-view">
                <div class="detail-header">
                    <button class="back-btn" onclick="window.daoApp.closeDetailView('suggestions')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back to Suggestions
                    </button>
                    <div class="suggestion-likes">
                        <span class="likes-count"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg> ${likes}</span>
                        <span class="dislikes-count"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg> ${dislikes}</span>
                    </div>
                </div>
                
                <div class="detail-content">
                    <div class="detail-main">
                        <h1 class="detail-title">${this.escapeHtml(title)}</h1>
                        
                        <div class="detail-meta">
                            <div class="meta-item">
                                <span class="meta-label">ID</span>
                                <span class="meta-value">#${displayId}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Author</span>
                                <span class="meta-value">${this.escapeHtml(authorName)}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Created</span>
                                <span class="meta-value">${dateStr}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Status</span>
                                <span class="meta-value">${this.capitalize(status)}</span>
                            </div>
                        </div>
                        
                        ${this.renderHtmlSection('Abstract', abstract)}
                        ${this.renderHtmlSection('Motivation', motivation)}
                        ${this.renderHtmlSection('Goal', goal)}
                        ${planContent ? this.renderHtmlSection('Plan', planContent) : ''}
                        ${budgetIntro ? this.renderHtmlSection('Budget', budgetIntro) : ''}
                        ${this.renderSuggestionMilestones(suggestion.plan)}
                        ${this.renderSuggestionTeam(suggestion.plan)}
                        ${relevanceContent ? this.renderHtmlSection('Relevance', relevanceContent) : ''}
                        ${this.renderComments(comments)}
                    </div>
                    
                    <div class="detail-sidebar">
                        ${this.renderSuggestionNavFromData(suggestion, abstract, motivation, goal, planContent, budgetIntro, relevanceContent, comments)}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render suggestion milestones from plan object
     */
    static renderSuggestionMilestones(plan) {
        if (!plan || !plan.milestone || plan.milestone.length === 0) return '';
        
        const items = plan.milestone.map((m, index) => {
            const date = m.date ? this.formatTimestamp(new Date(m.date).getTime()) : 'TBD';
            const description = m.version || m.goal || 'No description';
            return `
                <div class="milestone-card">
                    <div class="milestone-header">
                        <span class="milestone-stage-badge">Milestone ${index + 1}</span>
                        <span class="milestone-date">${date}</span>
                    </div>
                    <div class="milestone-goal">${this.escapeHtml(description)}</div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="detail-section" id="section-milestones">
                <h2 class="section-title">Milestones</h2>
                <div class="milestones-grid">${items}</div>
            </div>
        `;
    }
    
    /**
     * Render suggestion team from plan object
     */
    static renderSuggestionTeam(plan) {
        if (!plan || !plan.teamInfo || plan.teamInfo.length === 0) return '';
        
        const items = plan.teamInfo.map(t => {
            const responsibility = t.responsibility || '';
            return `
                <div class="team-card">
                    <div class="team-card-header">
                        <span class="team-member-name">${this.escapeHtml(t.member || 'Unknown')}</span>
                        <span class="team-member-role">${this.escapeHtml(t.role || '')}</span>
                    </div>
                    ${responsibility ? `<div class="team-card-body html-content">${responsibility}</div>` : ''}
                </div>
            `;
        }).join('');
        
        return `
            <div class="detail-section" id="section-team">
                <h2 class="section-title">Team</h2>
                <div class="team-grid">${items}</div>
            </div>
        `;
    }

    /**
     * Render suggestion navigation with explicit data
     */
    static renderSuggestionNavFromData(suggestion, abstract, motivation, goal, plan, budget, relevance, comments) {
        const sections = [];
        
        if (abstract) sections.push('Abstract');
        if (motivation) sections.push('Motivation');
        if (goal) sections.push('Goal');
        if (plan) sections.push('Plan');
        if (budget) sections.push('Budget');
        if (suggestion.plan?.milestone?.length) sections.push('Milestones');
        if (suggestion.plan?.teamInfo?.length) sections.push('Team');
        if (relevance) sections.push('Relevance');
        if (comments && comments.length > 0) sections.push('Comments');
        
        if (sections.length === 0) return '';
        
        const links = sections.map(s => 
            `<a href="#section-${s.toLowerCase()}" class="nav-link">${s}</a>`
        ).join('');
        
        return `
            <div class="sidebar-card">
                <h3 class="sidebar-title">Navigation</h3>
                <div class="section-nav">
                    ${links}
                </div>
            </div>
        `;
    }

    /**
     * Render HTML content section (content may contain HTML or plain text)
     */
    static renderHtmlSection(title, content) {
        if (!content) return '';
        
        // Parse and format the content properly
        const formattedContent = this.formatTextContent(content);
        
        return `
            <div class="detail-section" id="section-${title.toLowerCase()}">
                <h2 class="section-title">${title}</h2>
                <div class="section-content html-content">
                    ${formattedContent}
                </div>
            </div>
        `;
    }

    /**
     * Format text content - convert plain text with dashes/bullets to proper HTML
     */
    static formatTextContent(content) {
        if (!content) return '';
        
        // If content is not a string (e.g., array or object), return empty
        if (typeof content !== 'string') {
            console.log('[DetailView] formatTextContent received non-string:', typeof content);
            return '';
        }
        
        // If content already contains proper HTML list tags, return as-is
        if (content.includes('<ul>') || content.includes('<ol>') || content.includes('<li>')) {
            return content;
        }
        
        // Check if content has bullet-style lines (- or •)
        const lines = content.split(/\n/);
        const hasBullets = lines.some(line => /^\s*[-•]\s/.test(line.trim()));
        
        if (hasBullets) {
            // Parse into bullet list structure
            let html = '';
            let inList = false;
            let currentParagraph = '';
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                if (/^[-•]\s/.test(trimmed)) {
                    // This is a bullet point
                    if (currentParagraph) {
                        html += `<p>${currentParagraph}</p>`;
                        currentParagraph = '';
                    }
                    if (!inList) {
                        html += '<ul>';
                        inList = true;
                    }
                    const bulletContent = trimmed.replace(/^[-•]\s*/, '');
                    html += `<li>${bulletContent}</li>`;
                } else if (trimmed === '') {
                    // Empty line - close list if open, add paragraph break
                    if (inList) {
                        html += '</ul>';
                        inList = false;
                    }
                    if (currentParagraph) {
                        html += `<p>${currentParagraph}</p>`;
                        currentParagraph = '';
                    }
                } else {
                    // Regular text
                    if (inList) {
                        html += '</ul>';
                        inList = false;
                    }
                    if (currentParagraph) {
                        currentParagraph += ' ' + trimmed;
                    } else {
                        currentParagraph = trimmed;
                    }
                }
            }
            
            // Close any remaining open tags
            if (inList) {
                html += '</ul>';
            }
            if (currentParagraph) {
                html += `<p>${currentParagraph}</p>`;
            }
            
            return html;
        }
        
        // No bullets - split by double newlines for paragraphs
        const paragraphs = content.split(/\n\n+/);
        if (paragraphs.length > 1) {
            return paragraphs.map(p => `<p>${p.replace(/\n/g, ' ').trim()}</p>`).join('');
        }
        
        // Single paragraph - just wrap with <p> and preserve single line breaks
        return `<p>${content.replace(/\n/g, '<br>')}</p>`;
    }

    /**
     * Render plan section with statement
     */
    static renderPlanSection(proposal) {
        if (!proposal.planStatement) return '';
        
        return `
            <div class="detail-section" id="section-plan">
                <h2 class="section-title">Plan</h2>
                <div class="section-content html-content">
                    ${proposal.planStatement}
                </div>
            </div>
        `;
    }

    /**
     * Render budget section with statement and breakdown
     */
    static renderBudgetSection(proposal) {
        if (!proposal.budgetStatement && !proposal.budgets?.length) return '';
        
        let budgetTableHtml = '';
        if (proposal.budgets && proposal.budgets.length > 0) {
            const rows = proposal.budgets.map(b => {
                const amount = this.formatELA(b.amount);
                return `
                    <tr>
                        <td>Stage ${b.stage}</td>
                        <td>${b.type}</td>
                        <td class="amount">${amount} ELA</td>
                        <td><span class="budget-status ${b.status?.toLowerCase()}">${b.status}</span></td>
                    </tr>
                `;
            }).join('');
            
            budgetTableHtml = `
                <table class="budget-table">
                    <thead>
                        <tr>
                            <th>Stage</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        }
        
        // Format the budget statement properly
        const formattedStatement = proposal.budgetStatement 
            ? this.formatTextContent(proposal.budgetStatement) 
            : '';
        
        return `
            <div class="detail-section" id="section-budget">
                <h2 class="section-title">Budget</h2>
                ${budgetTableHtml}
                ${formattedStatement ? `<div class="section-content html-content budget-statement">${formattedStatement}</div>` : ''}
            </div>
        `;
    }

    /**
     * Render milestone section
     */
    static renderMilestoneSection(milestones) {
        if (!milestones || milestones.length === 0) return '';
        
        const items = milestones.map((m, index) => {
            const date = m.timestamp ? this.formatTimestamp(m.timestamp) : 'TBD';
            return `
                <div class="milestone-card">
                    <div class="milestone-header">
                        <span class="milestone-stage-badge">Stage ${m.stage}</span>
                        <span class="milestone-date">${date}</span>
                    </div>
                    <div class="milestone-goal">${this.escapeHtml(m.goal || 'No goal specified')}</div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="detail-section" id="section-milestones">
                <h2 class="section-title">Milestones</h2>
                <div class="milestones-grid">${items}</div>
            </div>
        `;
    }

    /**
     * Render implementation team section
     */
    static renderTeamSection(team) {
        if (!team || team.length === 0) return '';
        
        const items = team.map(t => {
            // Format the responsibility text properly
            const formattedResponsibility = t.responsibility 
                ? this.formatTextContent(t.responsibility) 
                : '';
            
            return `
                <div class="team-card">
                    <div class="team-card-header">
                        <span class="team-member-name">${this.escapeHtml(t.member || 'Unknown')}</span>
                        <span class="team-member-role">${this.escapeHtml(t.role || '')}</span>
                    </div>
                    ${formattedResponsibility ? `<div class="team-card-body html-content">${formattedResponsibility}</div>` : ''}
                </div>
            `;
        }).join('');
        
        return `
            <div class="detail-section" id="section-team">
                <h2 class="section-title">Implementation Team</h2>
                <div class="team-grid">${items}</div>
            </div>
        `;
    }

    /**
     * Render vote results for proposals
     */
    static renderVoteResults(crVotes) {
        if (!crVotes || crVotes.length === 0) {
            return `
                <div class="detail-section" id="section-votes">
                    <h2 class="section-title">Council Votes</h2>
                    <div class="no-votes">No votes recorded yet</div>
                </div>
            `;
        }
        
        const approveVotes = [];
        const rejectVotes = [];
        const abstainVotes = [];
        
        crVotes.forEach(vote => {
            const result = (vote.result || '').toLowerCase();
            const voterName = vote.name || 'Council Member';
            const opinion = vote.opinion || '';
            
            const voteItem = { name: voterName, opinion };
            
            if (result === 'approve' || result === 'support') {
                approveVotes.push(voteItem);
            } else if (result === 'reject' || result === 'oppose') {
                rejectVotes.push(voteItem);
            } else if (result === 'abstain' || result === 'abstention') {
                abstainVotes.push(voteItem);
            }
        });
        
        return `
            <div class="detail-section" id="section-votes">
                <h2 class="section-title">Council Votes (${crVotes.length})</h2>
                <div class="vote-groups">
                    ${this.renderVoteGroup('Approve', approveVotes, 'approve')}
                    ${this.renderVoteGroup('Reject', rejectVotes, 'reject')}
                    ${this.renderVoteGroup('Abstain', abstainVotes, 'abstain')}
                </div>
            </div>
        `;
    }

    /**
     * Render a vote group
     */
    static renderVoteGroup(label, votes, type) {
        if (votes.length === 0) return '';
        
        const votesHtml = votes.map(v => `
            <div class="vote-card ${type}">
                <div class="vote-card-header">
                    <span class="voter-name">${this.escapeHtml(v.name)}</span>
                </div>
                ${v.opinion ? `<div class="vote-opinion">${this.escapeHtml(v.opinion)}</div>` : ''}
            </div>
        `).join('');
        
        return `
            <div class="vote-group ${type}">
                <h3 class="vote-group-title">${label} (${votes.length})</h3>
                <div class="vote-cards">${votesHtml}</div>
            </div>
        `;
    }

    /**
     * Render vote summary sidebar
     */
    static renderVoteSummary(crVotes, statusInfo) {
        const votes = { approve: 0, reject: 0, abstain: 0 };
        
        if (crVotes && crVotes.length > 0) {
            crVotes.forEach(v => {
                const result = (v.result || '').toLowerCase();
                if (result === 'approve' || result === 'support') votes.approve++;
                else if (result === 'reject' || result === 'oppose') votes.reject++;
                else if (result === 'abstain' || result === 'abstention') votes.abstain++;
            });
        }
        
        const total = votes.approve + votes.reject + votes.abstain;
        const approvePercent = (votes.approve / 12) * 100;
        const rejectPercent = (votes.reject / 12) * 100;
        const abstainPercent = (votes.abstain / 12) * 100;
        
        return `
            <div class="sidebar-card">
                <h3 class="sidebar-title">Vote Summary</h3>
                <div class="vote-summary">
                    <div class="vote-bar-large">
                        <div class="vote-bar-fill approve" style="width: ${approvePercent}%"></div>
                        <div class="vote-bar-fill reject" style="width: ${rejectPercent}%"></div>
                        <div class="vote-bar-fill abstain" style="width: ${abstainPercent}%"></div>
                    </div>
                    <div class="vote-counts">
                        <div class="vote-count approve"><span>${votes.approve}</span> Approve</div>
                        <div class="vote-count reject"><span>${votes.reject}</span> Reject</div>
                        <div class="vote-count abstain"><span>${votes.abstain}</span> Abstain</div>
                    </div>
                    <div class="vote-total">${total} of 12 council members voted</div>
                </div>
            </div>
        `;
    }

    /**
     * Render navigation sidebar
     */
    static renderNavigation(proposal) {
        const sections = [];
        
        if (proposal.abstract) sections.push('Abstract');
        if (proposal.motivation) sections.push('Motivation');
        if (proposal.goal) sections.push('Goal');
        if (proposal.planStatement) sections.push('Plan');
        if (proposal.budgetStatement || proposal.budgets?.length) sections.push('Budget');
        if (proposal.milestone?.length) sections.push('Milestones');
        if (proposal.implementationTeam?.length) sections.push('Team');
        sections.push('Votes');
        
        const links = sections.map(s => 
            `<a href="#section-${s.toLowerCase()}" class="nav-link">${s}</a>`
        ).join('');
        
        return `
            <div class="sidebar-card">
                <h3 class="sidebar-title">Navigation</h3>
                <div class="section-nav">
                    ${links}
                </div>
            </div>
        `;
    }

    /**
     * Render suggestion navigation sidebar
     */
    static renderSuggestionNav(suggestion) {
        const sections = [];
        
        if (suggestion.abstract) sections.push('Abstract');
        if (suggestion.motivation) sections.push('Motivation');
        if (suggestion.goal) sections.push('Goal');
        if (suggestion.plan) sections.push('Plan');
        if (suggestion.relevance) sections.push('Relevance');
        if (suggestion.comments?.length) sections.push('Comments');
        
        if (sections.length === 0) return '';
        
        const links = sections.map(s => 
            `<a href="#section-${s.toLowerCase()}" class="nav-link">${s}</a>`
        ).join('');
        
        return `
            <div class="sidebar-card">
                <h3 class="sidebar-title">Navigation</h3>
                <div class="section-nav">
                    ${links}
                </div>
            </div>
        `;
    }

    /**
     * Render comments section
     */
    static renderComments(comments) {
        const commentsArray = comments || [];
        
        let commentsHtml = '';
        if (commentsArray.length === 0) {
            commentsHtml = '<p class="no-comments">No comments yet</p>';
        } else {
            commentsHtml = commentsArray.map(c => this.renderComment(c)).join('');
        }
        
        return `
            <div class="detail-section" id="section-comments">
                <h2 class="section-title">Comments (${commentsArray.length})</h2>
                <div class="comments-list">
                    ${commentsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Render a single comment
     */
    static renderComment(comment) {
        if (Array.isArray(comment)) {
            return comment.map(c => this.renderSingleComment(c)).join('');
        }
        return this.renderSingleComment(comment);
    }

    /**
     * Render single comment item
     */
    static renderSingleComment(comment) {
        const author = comment.createdBy?.profile?.firstName || comment.createdBy?.username || 'Anonymous';
        const date = comment.createdAt ? this.formatTimestamp(comment.createdAt) : '';
        const content = comment.content || comment.comment || '';
        const initial = author.charAt(0).toUpperCase();
        
        return `
            <div class="comment-item">
                <div class="comment-avatar">${initial}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${this.escapeHtml(author)}</span>
                        <span class="comment-date">${date}</span>
                    </div>
                    <div class="comment-content">${this.escapeHtml(content)}</div>
                </div>
            </div>
        `;
    }

    /**
     * Format timestamp (seconds or ms)
     */
    static formatTimestamp(ts) {
        if (!ts) return '--';
        // If timestamp is in seconds (< year 3000 in seconds), convert to ms
        const ms = ts < 100000000000 ? ts * 1000 : ts;
        const date = new Date(ms);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    /**
     * Format ELA amount (from smallest unit)
     */
    static formatELA(amount) {
        if (!amount) return '0';
        // Amount is in sELA (10^-8 ELA)
        const ela = parseFloat(amount) / 100000000;
        return ela.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    /**
     * Truncate address
     */
    static truncateAddress(addr) {
        if (!addr) return '';
        if (addr.length <= 16) return addr;
        return addr.slice(0, 8) + '...' + addr.slice(-8);
    }

    /**
     * Capitalize first letter
     */
    static capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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
window.DetailView = DetailView;
