---
name: Upgrade Flint AI Agent
overview: Enhance the Flint AI agent soul.md to include comprehensive knowledge about Elacity Labs products, the exchange, Wealth Capsules, installation options (including the new Desktop Launcher), troubleshooting, and the broader vision - making it the definitive community support AI.
todos:
  - id: backup-soul
    content: Backup current soul.md before making changes
    status: pending
  - id: write-soul
    content: Write enhanced soul.md with all new sections (~800-1000 lines)
    status: pending
  - id: upload-contabo
    content: Upload updated soul.md to Contabo server
    status: pending
  - id: verify-flint
    content: Test Flint with sample questions to verify knowledge
    status: pending
isProject: false
---

# Upgrade Flint AI Agent to 10/10

## Current State Analysis

The existing [agents/flint/soul.md](agents/flint/soul.md) (336 lines) covers:

- Basic PC2 explanation and setup
- Three installation paths (local, VPS, Raspberry Pi)
- Common Q&A and troubleshooting
- Conversation guidelines and tone

**Missing critical knowledge:**

- Desktop Launcher (just released)
- Elacity Exchange and Wealth Capsules
- The Vision (Economic Singularity, UBE, Internet of Wealth)
- AI Agent Investment model
- Current version info and migration guide
- Comprehensive PM2/systemd commands
- Boson network infrastructure
- Community links and resources

---

## Proposed Enhancements

### 1. Add Desktop Launcher Section

```markdown
### Path 0: Desktop Launcher (Easiest - 2 minutes)

Download the ElastOS Desktop Launcher for one-click setup:
- **Mac**: ElastOS-0.1.1.dmg
- **Windows**: ElastOS.Setup.0.1.1.exe (requires WSL2)
- **Linux**: ElastOS-0.1.1.AppImage

Download: https://github.com/Elacity/elastos-launcher/releases

The launcher provides:
- One-click Start/Stop
- Status monitoring
- Log viewer
- Auto-installs PC2 if not present
```

### 2. Add Elacity Exchange Knowledge

Include comprehensive information about:

- What Wealth Capsules are
- How the exchange works
- Revenue model for creators
- The complete value loop

### 3. Add Vision and Philosophy

Include the "why" behind Elacity:

- Economic Singularity concept
- Universal Basic Equity (UBE) vs UBI
- Internet of Wealth vs Internet of Information
- Sovereignty First principles

### 4. Add AI Agent Investment Section

Explain:

- Agents as investable businesses
- How investment works
- Revenue distribution model
- Why this matters for users

### 5. Add Version and Migration Info

```markdown
## Current Version
- **Version**: 0.1.1 (v1.0.0 launching soon)
- **Migration**: Users on 2.6.x need one-time manual update
- **Migration Command**: [full command]
```

### 6. Expand Troubleshooting Section

Add comprehensive troubleshooting from docs:

- Installation issues
- Authentication issues
- Connection issues
- AI setup issues
- Performance issues

### 7. Add PM2 Command Reference

Complete command reference:

```markdown
pm2 status       # Check if running
pm2 logs pc2     # View logs
pm2 stop pc2     # Stop
pm2 start pc2    # Start
pm2 restart pc2  # Restart
pm2 monit        # Dashboard
```

### 8. Add Community Resources

```markdown
## Community
- **Telegram**: https://t.me/ArcadeCity
- **Documentation**: https://docs.ela.city
- **GitHub**: https://github.com/Elacity/pc2.net
- **Launcher**: https://github.com/Elacity/elastos-launcher
```

---

## Implementation

Update [agents/flint/soul.md](agents/flint/soul.md) on Contabo server at:
`/root/pc2.net/agents/flint/soul.md`

The updated soul.md will be approximately 800-1000 lines, organized as:

1. Identity and Mission (existing, keep)
2. **NEW: Quick Reference Card** (version, links, commands)
3. Knowledge Base - PC2 (existing, expand)
4. **NEW: Knowledge Base - Elacity Exchange**
5. **NEW: Knowledge Base - The Vision**
6. **NEW: Knowledge Base - AI Agent Economy**
7. Installation Guides (existing, add Desktop Launcher)
8. Managing PC2 (existing, expand with PM2/systemd)
9. Troubleshooting (existing, significantly expand)
10. Conversation Guidelines (existing, keep)
11. **NEW: Sample Interactions** (add more scenarios)
12. Resources (existing, update links)

---

## Files to Modify


| Location           | File                                 |
| ------------------ | ------------------------------------ |
| Contabo            | `/root/pc2.net/agents/flint/soul.md` |
| Local (for backup) | `agents/flint/soul.md`               |


---

## Verification

After update:

1. Test Flint in PC2 AI chat
2. Ask test questions about Exchange, Wealth Capsules, Desktop Launcher
3. Ask troubleshooting questions
4. Verify Telegram bot responds correctly

