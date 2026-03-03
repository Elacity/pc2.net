# Weekly Shipping Report Template

> **Purpose:** Framework for generating weekly ElastOS ecosystem updates. When asked "give me my weekly report," follow this guide to produce a polished markdown file with embedded HTML for the Elastos blog.
> **Last Updated:** 2026-02-24

---

## How to Generate a Weekly Report

### Step 1: Audit the Branch (MANDATORY — DO THIS FIRST)

Before writing ANYTHING, run a full audit of every commit on the branch since the last report. Do NOT skip this. Do NOT summarize from memory. Read every single commit.

Run these commands:

- git log --oneline --since="7 days ago" --until="now" (commits this week)
- git diff --stat HEAD~{n}...HEAD (files changed)
- git diff --shortstat HEAD~{n}...HEAD (total lines)
- git log --oneline feature/jetson-gpu-acceleration --not main (full branch history if needed)

Read each commit message. Check the actual code changes if the message is ambiguous. Understand the FULL scope before writing a single word.

### Step 2: Check External Context

- Community feedback from Telegram / Discord
- EverlastingOS or other tester reports
- Any supernode fixes or deployments (SSH into supernode if needed)
- Proposal / governance updates on Cyber Republic
- Any articles published or media appearances
- Any community questions or criticism that should be addressed

### Step 3: Write TWO Outputs

Produce a single markdown file containing:

1. **GitHub Shipping Report** — concise bullet-point format with commit hashes for developer verification
2. **Blog Article (HTML)** — polished, 9th-grader friendly, SEO-optimized HTML for pasting into the Elastos blog CMS at blog.elastos.net

Save to: docs/updates/WCI_Update_[Month]_[Day]_[Year].md

### Step 4: Post GitHub Discussion (MANDATORY)

After writing the report, automatically post the GitHub shipping report to GitHub Discussions:

- Use the GraphQL API via gh cli
- Repository ID: R_kgDOOfDR3g
- Category: Announcements (ID: DIC_kwDOOfDR3s4C3ILe)
- Title format: "ElastOS Weekly Shipping Report — Week of [Date Range]"
- Body: The GitHub shipping report content (markdown format with linked commit hashes)
- Share the discussion URL with the user after posting

Command pattern:
gh api graphql -f query='mutation { createDiscussion(input: { repositoryId: "R_kgDOOfDR3g", categoryId: "DIC_kwDOOfDR3s4C3ILe", title: "[TITLE]", body: "[BODY]" }) { discussion { url } } }'

---

## Output 1: GitHub Shipping Report

Post this to GitHub Discussions or the repo wiki. Short, verifiable, developer-focused.

Format:

**ElastOS Weekly Shipping Report — Week of [Date Range]**

**Shipped:**
- [One-line description] ([commit hash linked to GitHub](https://github.com/Elacity/pc2.net/commit/HASH))
- [One-line description] ([commit hash](https://github.com/Elacity/pc2.net/commit/HASH))
- [One-line description] ([commit hash](https://github.com/Elacity/pc2.net/commit/HASH))

**In Progress:**
- [Item — current status]

**Community Testing:**
- [Feedback received and status]

**Next Week:**
- [Planned item 1]
- [Planned item 2]

---

## Output 2: Blog Article (HTML)

### Title Format
Elastos WCI Team Ecosystem Report, [Month] [Day], [Year]

### Sections (in order)

1. **Opening Summary** (2-3 sentences)
   - What was the theme of this week?
   - One punchy line that captures the overall progress
   - Reference the current milestone from the [roadmap](https://github.com/Elacity/pc2.net/blob/main/docs/core/ROADMAP.md)

2. **What We Shipped** (the bulk of the report)
   - Group by theme, not by commit
   - Each item: what changed, why it matters (in plain English)
   - Use numbered items (1, 2, 3...) for major features
   - Use bullet lists for bug fixes and polish
   - Include "Why it matters:" after major items

3. **Community Testing** (if applicable)
   - What did testers report?
   - What was fixed based on their feedback?
   - Highlight the feedback loop: report → fix → ship

4. **Proposal / Governance Updates** (if applicable)
   - [Keystone Fund proposal](https://elastos.com/suggestion/699c045de3bb57006e75463e) status
   - Any council activity
   - Community discussion highlights

5. **What's Next**
   - 3-5 bullet points of upcoming work
   - Reference the roadmap milestone

6. **Try ElastOS Today**
   - Install links (always include, always hyperlinked)
   - Documentation link
   - GitHub link

7. **Yoast SEO Block** (always include at the bottom — see SEO section below)

---

## Writing Guidelines

### Tone
- Confident but not arrogant
- Transparent — include what's broken, not just what's fixed
- Educational — explain WHY, not just WHAT
- Accessible — a 9th grader should understand every sentence

### Language Rules
- No internal file names (say "the connection manager" not "ConnectivityService.ts")
- No line counts or code metrics in the blog article (say "a complete rewrite" not "332 lines added") — save numbers for the GitHub report
- Always say "Elacity dDRM" not just "dDRM" (it's a separate protocol built by [Elacity Labs](http://elacitylabs.com))
- Use "[ElastOS](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/)" not "PC2" in public-facing content
- Explain technical concepts in one phrase: "WireGuard (a high-speed encrypted tunnel)" on first mention, then just "WireGuard" after
- NEVER use code tags or backtick formatting in the HTML output — it doesn't render in the blog CMS

### Hyperlinking (CRITICAL for SEO)
- Hyperlink aggressively — every mention of a key term should link somewhere
- First mention of "ElastOS" → link to the [launch article](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/)
- First mention of "Elacity Labs" → link to [elacitylabs.com](http://elacitylabs.com)
- First mention of the proposal → link to the [Keystone Fund proposal](https://elastos.com/suggestion/699c045de3bb57006e75463e)
- Mention of GitHub → link to [the repo](https://github.com/Elacity/pc2.net)
- Mention of documentation → link to [docs.ela.city](https://docs.ela.city)
- Mention of previous reports → link to their blog posts
- Mention of Elastos ecosystem → link to [elastos.org](https://elastos.org) or relevant pages
- Mention of Rong Chen → link to the [launch article](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/) or relevant interview
- Mention of the DAO → link to [Cyber Republic](https://www.cyberrepublic.org)
- Mention of ELA → link to [ELA utility page](https://elastos.org/ela) or [buy ELA](https://elastos.org/buy-ela)
- Mention of any previous blog post → link to it on blog.elastos.net
- External references (Bitcoin, IPFS, WireGuard, etc.) → link to their official sites on first mention

### Formatting Rules
- Bold key phrases so scanners get the story
- Use strong tags in HTML, ** in markdown
- Section headers: h3 for main sections, h4 for sub-sections, h5 for numbered items
- Include images where available (screenshots of features, terminal output)
- Links: always inline a href tags, never bare URLs
- NEVER use code tags — they don't render properly in the WordPress CMS
- Use &amp; for ampersands in HTML

---

## HTML Structure Reference

### Opening

<strong>[Title — one line capturing the week]</strong>
<h3><strong>[First Major Section]</strong></h3>
[2-3 sentence summary paragraph with <strong>bold key phrases</strong> and <a href="...">inline links</a>.]

### Feature Items

<h5>1) <strong>[Feature Name]</strong></h5>
[2-3 sentence plain-English explanation of what was built and what it does.]
<strong>Why it matters:</strong> [One sentence connecting this to the bigger picture.]

### Bug Fix Lists

<h4><strong>Bug Fixes &amp; Polish</strong></h4>
<ul>
  <li><strong>[Fix name]</strong> — [one line explanation]</li>
  <li><strong>[Fix name]</strong> — [one line explanation]</li>
</ul>

### Closing (always include)

<h3><strong>Try <a href="https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/">ElastOS</a> Today</strong></h3>
<ul>
  <li><strong>Desktop Launcher (Mac):</strong> <a href="https://docs.ela.city">Download ElastOS</a></li>
  <li><strong>Terminal Install:</strong> curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash</li>
  <li><strong>Documentation:</strong> <a href="https://docs.ela.city">docs.ela.city</a></li>
  <li><strong>GitHub:</strong> <a href="https://github.com/Elacity/pc2.net">github.com/Elacity/pc2.net</a></li>
</ul>

<h3><strong>What's Next</strong></h3>
<ul>
  <li>[Item 1]</li>
  <li>[Item 2]</li>
  <li>[Item 3]</li>
</ul>

---

## Yoast SEO Block (10/10 — Always Include at Bottom)

Include this at the very end of every report markdown file so it can be copy-pasted into the WordPress Yoast SEO fields:

### SEO Template

**SEO Title:** ElastOS Weekly Update [Date] — [Key Feature or Theme] | Elastos World Computer
**Meta Description:** [150-160 characters summarizing the week's progress. Include "ElastOS," "Elastos," and one key feature. End with a call to action.]
**Focus Keyphrase:** ElastOS weekly update
**Slug:** elastos-wci-update-[month]-[day]-[year]

**Secondary Keyphrases:**
- Elastos World Computer
- ElastOS personal cloud
- sovereign AI operating system
- decentralized personal cloud
- Elastos ELA

**Internal Links (must include at least 3):**
- [ElastOS V1 Launch](https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/)
- [Previous weekly update](link to most recent prior update)
- [Elastos Roadmap](https://elastos.org/roadmap) or [ELA Utility](https://elastos.org/ela)

**External Links (include 1-2):**
- [GitHub Repository](https://github.com/Elacity/pc2.net)
- [Keystone Fund Proposal](https://elastos.com/suggestion/699c045de3bb57006e75463e)

**Open Graph:**
- og:title = SEO Title
- og:description = Meta Description
- og:image = Featured image from the article (screenshot of ElastOS desktop or relevant feature)

### Example SEO Block (Feb 24, 2026)

**SEO Title:** ElastOS Weekly Update Feb 24 — V1 Live, WCI Audit Passed, Keystone Proposal | Elastos World Computer
**Meta Description:** ElastOS V1 is live with 7,229 commits. WCI v1 audit passed. Keystone Fund proposal published for continuous development. Try the sovereign personal cloud today.
**Focus Keyphrase:** ElastOS weekly update
**Slug:** elastos-wci-update-feb-24-2026
**Secondary Keyphrases:** Elastos World Computer, sovereign AI operating system, ElastOS personal cloud, Elastos ELA, decentralized personal cloud

---

## Recurring Links (use these every report)

| Name | URL |
|------|-----|
| ElastOS Launch Article | https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/ |
| Keystone Fund Proposal | https://elastos.com/suggestion/699c045de3bb57006e75463e |
| Elacity Labs Website | http://elacitylabs.com |
| GitHub Repository | https://github.com/Elacity/pc2.net |
| Documentation | https://docs.ela.city |
| WCI v1 Proposal (CRC) | https://www.cyberrepublic.org/proposals/180 |
| Keystone Fund Wallet | 0x52bA882916f11f96f9DC996ACf31926D09c38391 |
| Elastos Website | https://elastos.org |
| Elastos Roadmap | https://elastos.org/roadmap |
| ELA Utility | https://elastos.org/ela |
| Buy ELA | https://elastos.org/buy-ela |
| Elastos DAO | https://www.cyberrepublic.org |
| Elastos Blog | https://blog.elastos.net |
| Previous Update (Jan 29) | https://blog.elastos.net/wci-ecosystem-report-jan-29-2026/ |
| Previous Update (Feb 24) | docs/updates/WCI_Update_Feb_24_2026.md |

---

## Gold Standard Reference

The Feb 24 update is saved at docs/updates/WCI_Update_Feb_24_2026.md. Use this as the quality benchmark for all future reports.

Key qualities that made it effective:
- Opened with V1 being live and the WCI audit passing (credibility first)
- Connected to the Keystone Fund proposal (strategic context)
- Showed continued shipping despite WCI v1 concluding (momentum)
- 9 numbered features, each with "Why it matters" (educational)
- Community testing section proving the feedback loop works (accountability)
- Ended with install links and clear next steps (call to action)
- Aggressive hyperlinking throughout for SEO
- No code tags or backtick formatting
- Every key term linked on first mention

---

## Previous Reports

| Date | File | Blog URL | Key Theme |
|------|------|----------|-----------|
| 2026-02-24 | docs/updates/WCI_Update_Feb_24_2026.md | TBD | V1 Live, WCI Audit Passed, Keystone Proposal, v1.1 Preview |

**GitHub Discussions (shipping reports):**

| Week | Discussion | Commits | Key Theme |
|------|-----------|---------|-----------|
| Feb 3-9 | [#2](https://github.com/Elacity/pc2.net/discussions/2) | 18 | GPU acceleration, Active Proxy protocol rewrite, gateway relay |
| Feb 10-16 | — | 0 | No commits on this branch |
| Feb 17-23 | [#3](https://github.com/Elacity/pc2.net/discussions/3) | 28 | WireGuard, video streaming, gateway perf, ARM installer, IPFS privacy, community bugs |
| Feb 24-28 | [#4](https://github.com/Elacity/pc2.net/discussions/4) | 34 | Voice AI, desktop UI upgrades, ARM installer hardening, WireGuard improvements |
| 2026-01-29 | Published on blog | https://blog.elastos.net/wci-ecosystem-report-jan-29-2026/ | IPFS Sharing, NAT Traversal, AI Agents, DAO Dashboard |

*Add new reports to this table as they're created.*
