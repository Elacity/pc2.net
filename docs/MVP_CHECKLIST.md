# PC2 MVP Production Release Checklist

**Target:** Next Week Demo  
**Branch:** `feature/mvp-production-release`  
**Goal:** Others can download, run, and test PC2

---

## 🔴 High Priority (Must Have for Demo)

### 1. HTTPS Setup Documentation
- [ ] Document why HTTPS is required (wallets refuse HTTP)
- [ ] nginx reverse proxy example config
- [ ] Caddy example config (simplest)
- [ ] Cloudflare Tunnel quick start (zero-config)
- [ ] Let's Encrypt certificate setup

**Files to create:**
- `docs/DEPLOYMENT_GUIDE.md`

### 2. Production Build Script
- [ ] Single command: `npm run build:production`
- [ ] Builds GUI bundle
- [ ] Builds backend TypeScript
- [ ] Copies all assets to `dist/`
- [ ] Creates version file

**Files to modify:**
- `pc2-node/package.json` - add build:production script
- `pc2-node/scripts/build-production.js` - new script

### 3. Docker Containerization
- [ ] Create `Dockerfile` for pc2-node
- [ ] Create `docker-compose.yml` for easy deployment
- [ ] Multi-arch build (amd64, arm64 for Raspberry Pi)
- [ ] Volume mounts for persistent data
- [ ] Environment variable configuration

**Files to create:**
- `pc2-node/Dockerfile`
- `pc2-node/docker-compose.yml`
- `pc2-node/.dockerignore`

---

## 🟡 Medium Priority (Should Have)

### 4. Logout Flow
- [ ] Clear Particle session on logout
- [ ] Clear localStorage auth data
- [ ] Return to login screen cleanly
- [ ] No auto-reconnect after logout

**Files to check:**
- `src/gui/src/UI/UIDesktop.js` - logout handler
- `packages/particle-auth/src/App.tsx` - session cleanup

### 5. Error Handling
- [ ] Particle Network unreachable error
- [ ] Wallet connection rejection handling
- [ ] Session expiry detection and re-auth
- [ ] Network offline indicator

**Files to modify:**
- `packages/particle-auth/src/particle/contexts/ParticleNetworkContext.tsx`
- `src/gui/src/UI/UIWindowParticleLogin.js`

### 6. Mobile Responsiveness
- [ ] Test login modal on mobile Safari
- [ ] Test login modal on mobile Chrome
- [ ] Touch-friendly buttons
- [ ] Responsive desktop layout

---

## 🟢 Lower Priority (Nice to Have)

### 7. Alternative Login (RainbowKit)
- [ ] Maintain RainbowKit branch as option
- [ ] Document when to use each
- [ ] No Particle dependency path

### 8. Offline Mode Detection
- [ ] Detect when internet unavailable
- [ ] Show "Local Only" indicator
- [ ] Queue operations for when online

---

## 📋 Quick Start Guide for Testers

```bash
# Option 1: Docker (Recommended)
docker run -d -p 4200:4200 -v pc2-data:/app/data elastos/pc2-node
# Then setup HTTPS reverse proxy

# Option 2: From Source
git clone https://github.com/Elacity/pc2.net
cd pc2.net/pc2-node
npm install
npm run build
npm start
# Then setup HTTPS reverse proxy

# Option 3: Cloudflare Tunnel (Easiest for testing)
# After starting PC2:
cloudflared tunnel --url http://localhost:4200
# Gives you: https://random-name.trycloudflare.com
```

---

## 📊 Progress Tracking

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| HTTPS Documentation | 🔲 Todo | | |
| Production Build Script | 🔲 Todo | | |
| Docker Setup | 🔲 Todo | | |
| Logout Flow | 🔲 Todo | | |
| Error Handling | 🔲 Todo | | |
| Mobile Testing | 🔲 Todo | | |

---

## 🎯 Demo Day Checklist

Before the demo:
- [ ] PC2 running on test server with HTTPS
- [ ] Multiple testers can access via browser
- [ ] Login with MetaMask works
- [ ] Login with WalletConnect works
- [ ] File upload/download works
- [ ] Desktop icons visible after login
- [ ] Logout works cleanly

---

**Last Updated:** 2025-01-18
