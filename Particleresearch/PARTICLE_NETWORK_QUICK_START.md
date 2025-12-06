# Particle Network Quick Start Guide

**For Engineers**: Fast-track implementation in 30 minutes

---

## Quick Setup (5 Steps)

### 1️⃣ Install Dependencies (2 minutes)

```bash
npm install @particle-network/connectkit@^2.1.3 \
  @particle-network/connector-core@^2.1.0 \
  @particle-network/universal-account-sdk@^1.0.7 \
  @ethersproject/providers@^5.6.6 \
  @ethersproject/address@^5.4.0
```

### 2️⃣ Get Particle Credentials (5 minutes)

1. Visit: https://dashboard.particle.network
2. Create project: "PuterOS"
3. Copy these values:
   - Project ID
   - Client Key  
   - App ID

### 3️⃣ Create `.env` File (1 minute)

```bash
REACT_APP_PARTICLE_PROJECT_ID="paste-project-id-here"
REACT_APP_PARTICLE_CLIENT_KEY="paste-client-key-here"
REACT_APP_PARTICLE_APP_ID="paste-app-id-here"
REACT_APP_TX_EXECUTOR="ua"
REACT_APP_ENABLE_WEB3="true"
```

### 4️⃣ Copy Core Files (10 minutes)

Create these files from the full guide (`PARTICLE_NETWORK_IMPLEMENTATION_GUIDE.md`):

```
src/lib/particle-network/
├── index.ts
├── Provider.tsx
├── contexts/
│   ├── connectkit.tsx
│   └── ParticleNetworkContext.tsx
├── hooks/
│   └── index.ts
├── components/
│   └── ConnectorSelect.tsx
└── web3/
    └── web3-provider.ts
```

### 5️⃣ Integrate into App (5 minutes)

**Wrap your app:**

```typescript
// src/App.tsx
import { ParticleNetworkProvider } from './lib/particle-network';

function App() {
  return (
    <ParticleNetworkProvider transactionHandler="ua">
      {/* Your app components */}
    </ParticleNetworkProvider>
  );
}
```

**Add login button:**

```typescript
import { ConnectorSelect } from './lib/particle-network';

function Header() {
  return (
    <header>
      <h1>PuterOS</h1>
      <ConnectorSelect />
    </header>
  );
}
```

---

## Test Login (2 minutes)

1. Start dev server: `npm run dev`
2. Click "Login" button
3. Try email authentication
4. Check console for `UniversalAccount initialized` message
5. See your wallet address displayed

---

## Next Steps

✅ **Working?** → Read full guide for advanced features  
❌ **Not working?** → Check troubleshooting in main guide  
🚀 **Ready for production?** → Follow production checklist

---

## Common Issues (Quick Fixes)

| Issue | Fix |
|-------|-----|
| "Particle not initializing" | Check `.env` credentials |
| "Modal not opening" | Clear browser cache, check console |
| "Balance shows $0" | Wait 5 seconds, or set `TX_EXECUTOR="eoa"` |
| "Build errors" | Check Vite config (see full guide) |

---

## Full Documentation

See `PARTICLE_NETWORK_IMPLEMENTATION_GUIDE.md` for:
- Complete code examples
- Security best practices  
- Production deployment
- Advanced features
- Troubleshooting details

---

**Total Setup Time:** ~30 minutes  
**Difficulty:** Intermediate  
**Support:** Particle Discord or docs.particle.network
