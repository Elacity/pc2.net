# Weekly Shipping Report Template

> **Purpose:** Framework for generating weekly ElastOS ecosystem updates. When asked "give me my weekly report," follow this guide to produce a polished markdown file with embedded HTML for the Elastos blog.
> **Last Updated:** 2026-02-24

---

## How to Generate a Weekly Report

### Step 1: Gather Data

Run these commands to collect what happened this week:

```bash
# Commits this week
git log --oneline --since="7 days ago" --until="now"

# Files changed
git diff --stat HEAD~{number_of_commits}...HEAD

# Total lines added/removed
git diff --shortstat HEAD~{number_of_commits}...HEAD
```

Also check:
- Community feedback from Telegram / Discord
- EverlastingOS or other tester reports
- Any supernode fixes or deployments
- Proposal / governance updates
- Any articles published or media appearances

### Step 2: Write the Report

Use the structure below. Keep it **simple enough for a 9th grader** — no jargon, no internal code references, explain the "why" for each item. Bold the key phrases so someone scanning gets the story in 10 seconds.

### Step 3: Output Format

Produce TWO outputs in a single markdown file:
1. **The readable markdown version** (for GitHub, internal reference)
2. **The HTML version** (for pasting into the Elastos blog CMS at blog.elastos.net)

---

## Report Structure

### Title Format
`Elastos WCI Team Ecosystem Report, [Month] [Day], [Year]`

### Sections (in order)

1. **Opening Summary** (2-3 sentences)
   - What was the theme of this week?
   - One punchy line that captures the overall progress
   - Reference the current milestone from the roadmap

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
   - Keystone Fund proposal status
   - Any council activity
   - Community discussion highlights

5. **What's Next**
   - 3-5 bullet points of upcoming work
   - Reference the roadmap milestone

6. **Try ElastOS Today**
   - Install links (always include)
   - Documentation link
   - GitHub link

---

## Writing Guidelines

### Tone
- Confident but not arrogant
- Transparent — include what's broken, not just what's fixed
- Educational — explain WHY, not just WHAT
- Accessible — a 9th grader should understand every sentence

### Language Rules
- No internal file names (say "the connection manager" not "ConnectivityService.ts")
- No line counts or code metrics (say "a complete rewrite" not "332 lines added")
- Always say "Elacity dDRM" not just "dDRM" (it's a separate protocol built by Elacity Labs)
- Use "ElastOS" not "PC2" in public-facing content
- Explain technical concepts in one phrase: "WireGuard (a high-speed encrypted tunnel)" on first mention, then just "WireGuard" after

### Formatting
- Bold key phrases so scanners get the story
- Use `<strong>` in HTML, `**` in markdown
- Section headers: `<h3>` for main sections, `<h4>` for sub-sections, `<h5>` for numbered items
- Include images where available (screenshots of features, terminal output)
- Links: always inline `<a href="...">text</a>`, never bare URLs

---

## HTML Style Reference

This is the proven format used for the Feb 24, 2026 update (the gold standard):

### Opening
```html
<strong>[Title — one line capturing the week]</strong>
<h3><strong>[First Major Section]</strong></h3>
[2-3 sentence summary paragraph with <strong>bold key phrases</strong> and <a href="...">inline links</a>.]
```

### Feature Items
```html
<h5>1) <strong>[Feature Name]</strong></h5>
[2-3 sentence plain-English explanation of what was built and what it does.]
<strong>Why it matters:</strong> [One sentence connecting this to the bigger picture.]
```

### Bug Fix Lists
```html
<h4><strong>Bug Fixes &amp; Polish</strong></h4>
<ul>
  <li><strong>[Fix name]</strong> — [one line explanation]</li>
  <li><strong>[Fix name]</strong> — [one line explanation]</li>
</ul>
```

### Closing
```html
<h3><strong>Try ElastOS Today</strong></h3>
<ul>
  <li><strong>Desktop Launcher (Mac):</strong> <a href="https://docs.ela.city">Download ElastOS</a></li>
  <li><strong>Terminal Install:</strong> <code>curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash</code></li>
  <li><strong>Documentation:</strong> <a href="https://docs.ela.city">docs.ela.city</a></li>
  <li><strong>GitHub:</strong> <a href="https://github.com/Elacity/pc2.net">github.com/Elacity/pc2.net</a></li>
</ul>

<h3><strong>What's Next</strong></h3>
<ul>
  <li>[Item 1]</li>
  <li>[Item 2]</li>
  <li>[Item 3]</li>
</ul>
```

---

## Recurring Links (copy-paste ready)

```
ElastOS Launch Article:    https://blog.elastos.net/announcement/elastos-world-computer-v1-launches/
Keystone Fund Proposal:    https://elastos.com/suggestion/699c045de3bb57006e75463e
Elacity Labs Website:      http://elacitylabs.com
GitHub Repository:         https://github.com/Elacity/pc2.net
Documentation:             https://docs.ela.city
WCI v1 Proposal (CRC):     https://www.cyberrepublic.org/proposals/180
Keystone Fund Wallet:      0x52bA882916f11f96f9DC996ACf31926D09c38391
```

---

## Example: Feb 24, 2026 Report (Gold Standard)

The Feb 24 update is saved at `docs/updates/WCI_Update_Feb_24_2026.md` with both markdown and HTML versions. Use this as the quality benchmark for all future reports.

Key qualities that made it effective:
- Opened with V1 being live and the WCI audit passing (credibility first)
- Connected to the Keystone Fund proposal (strategic context)
- Showed continued shipping despite WCI v1 concluding (momentum)
- 9 numbered features, each with "Why it matters" (educational)
- Community testing section proving the feedback loop works (accountability)
- Ended with install links and clear next steps (call to action)

---

## Previous Reports

| Date | File | Key Theme |
|------|------|-----------|
| 2026-02-24 | `docs/updates/WCI_Update_Feb_24_2026.md` | V1 Live, WCI Audit Passed, Keystone Proposal, v1.1 Preview |
| 2026-01-29 | Published on blog.elastos.net | IPFS Sharing, NAT Traversal, AI Agents, DAO Dashboard |

*Add new reports to this table as they're created.*
