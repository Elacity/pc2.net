# Mobile "Invalid App Configuration" (Particle / WalletConnect)

If login works on **desktop** but shows **"Invalid App Configuration"** on **mobile** (e.g. on `test7.ela.city`), it is usually due to **domain/origin allowlists** or **WalletConnect project configuration**, not missing credentials.

**You should not have to add every subdomain or every user’s URL by hand.** Wildcards are the right approach for scale; the problem is making them work on mobile and handling IP-only access.

---

## 1. Scalable approach: use wildcards

### WalletConnect Cloud (https://cloud.walletconnect.com)

- WalletConnect **supports wildcards** in the project allowlist.
- Add **one** entry so all subdomains work:
  - `https://*.ela.city` — allows `https://test7.ela.city`, `https://test9.ela.city`, `https://anything.ela.city`, etc.
  - Does **not** allow apex `https://ela.city`; if you need that, add `https://ela.city` as well.
- Format: include scheme (`https://`). Allowlist changes can take ~15 minutes to apply.
- **localhost** and **127.0.0.1** are always allowed; no need to add them.

### Particle Dashboard (https://dashboard.particle.network)

- Add a **wildcard** for your domain (e.g. `*.ela.city` or whatever format Particle’s UI accepts for “any subdomain”).
- Particle’s docs don’t clearly specify wildcard rules; if `*.ela.city` doesn’t work on mobile, treat it as a platform bug and use the workaround below while asking Particle support to confirm wildcard + mobile behavior.

**Goal:** One Particle project + one WalletConnect project, with **one wildcard each** (e.g. `*.ela.city` / `https://*.ela.city`), so every new subdomain works without manual allowlisting.

---

## 2. If mobile still fails with wildcards (workaround)

Sometimes wildcards work on desktop but mobile (or the wallet’s in-app browser) fails. Common causes:

- Mobile/in-app browser sending a different `Referer` or origin.
- Particle or WalletConnect applying allowlist rules differently on mobile.

**Temporary workaround:** Add the **exact** origin that fails (e.g. `https://test7.ela.city`) explicitly in both Particle and WalletConnect allowlists. That fixes that one hostname only; it’s not scalable, but it unblocks mobile while you chase wildcard/mobile support with Particle/WalletConnect.

**Long-term:** Confirm with Particle/WalletConnect that wildcards are supported for web + mobile and that no extra steps are needed on mobile. If they don’t support wildcards for your use case, you may need a different auth strategy (e.g. gateway pattern below).

---

## 3. IP addresses: allowlists don’t scale

Allowlists are **domain/origin** based. For IPs:

- You can allow a **specific** origin, e.g. `http://192.168.1.50:4200`, but then **every** node IP (and port) would need to be added by hand. That does **not** scale for “every person who registers” or every new node.
- There is no wildcard for “any IP” in Particle/WalletConnect.

**Practical options:**

1. **Give every node a hostname under one domain (recommended)**  
   - Use a single domain you control (e.g. `ela.city`) and point subdomains at nodes:
     - `node1.ela.city` → node 1  
     - `test7.ela.city` → test7  
     - Dynamic DNS or your own DNS/proxy can assign `something.ela.city` → IP.
   - Then use **one** wildcard in Particle and WalletConnect (e.g. `*.ela.city` / `https://*.ela.city`). No per-user allowlist; new nodes get a new subdomain and work automatically.

2. **Auth gateway / single front-door**  
   - One canonical hostname (e.g. `app.ela.city`) does Particle/WalletConnect login; after auth, redirect or deep-link the user to their actual node (by IP or path). Only `app.ela.city` (and maybe `*.ela.city`) need to be in the allowlist. This requires backend/gateway work (session, redirect, etc.).

3. **Document the limitation**  
   - “WalletConnect / Particle login requires accessing your node via a hostname (e.g. `mynode.ela.city`). IP-only access (e.g. `http://192.168.1.100:4200`) may not support wallet login.” Rely on email/phone or other flows for IP-only usage if Particle supports them.

So: **fix for IPs at scale = hostnames (e.g. *.ela.city) + wildcards**, not adding IPs one by one.

---

## 4. Checklist (scalable setup)

| Step | Action |
|------|--------|
| **WalletConnect Cloud** | Create one project; add **one** allowlist entry: `https://*.ela.city` (and `https://ela.city` if you use apex). Set `VITE_WALLETCONNECT_PROJECT_ID` in `packages/particle-auth/.env` and rebuild. |
| **Particle Dashboard** | In your project allowlist, add **wildcard** for your domain (e.g. `*.ela.city`). Ensure Project ID / Client Key / App ID match `packages/particle-auth/.env`. |
| **Mobile still “Invalid App Configuration”?** | Add the **exact** failing origin (e.g. `https://test7.ela.city`) once as a workaround; then ask Particle/WalletConnect support why wildcard works on desktop but not mobile. |
| **IP-only nodes** | Don’t rely on allowlisting every IP. Prefer: hostname per node (e.g. `*.ela.city`) + wildcard allowlist, or auth gateway, or document that wallet login needs a hostname. |

---

## 5. Where credentials live in this repo

- **Particle**: `packages/particle-auth/.env` — `VITE_PARTICLE_PROJECT_ID`, `VITE_PARTICLE_CLIENT_KEY`, `VITE_PARTICLE_APP_ID`.
- **WalletConnect**: same file — `VITE_WALLETCONNECT_PROJECT_ID` (default: `0d1ac2ba93587a74b54f92189bdc341e`).
- These are **build-time** values; change `.env` then rebuild (e.g. `npm run build:particle-auth` or full frontend build).

**Custom WalletConnect Setup (for users):**
Users can also configure their own WalletConnect project ID at runtime:
1. Click "Having trouble connecting your wallet?" on the login page, OR
2. Go to Settings > Security > WalletConnect Configuration
3. Enter a custom project ID (stored in localStorage, passed to particle-auth via URL param)

---

## 6. Debug: what origin does the auth iframe see?

The login UI loads Particle in an iframe at `/particle-auth` on the same origin as the page (e.g. `https://test7.ela.city/particle-auth`). After a frontend build, the iframe sets `window.__PC2_PARTICLE_ORIGIN` so you can confirm the origin:

- **Desktop:** DevTools → select the `particle-auth` iframe → Console → run `window.__PC2_PARTICLE_ORIGIN`.
- **Mobile:** Safari Web Inspector (Mac) → connect the phone → select the page/iframe and check the same.

The value you see there **must** be covered by your Particle and WalletConnect allowlists (either by wildcard or by an explicit entry).
