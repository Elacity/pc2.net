# "We Care About Your Privacy" / 960 Partners Popup

## Only Solitaire — not every app

**This popup appears in one app only: Solitaire FRVR.** No other bundled app (Editor, Viewer, Player, Camera, dApp Centre, PDF, Recorder, DAO Dashboard, etc.) includes CookiePro, Google Ads, or the "960 partners" consent dialog. The rest of the platform has no such Web2 consent or ad-tech. If someone said "every app," they were likely referring only to having seen it in Solitaire.

## Where it comes from

**The popup is not from PC2 or Elastos.** It is injected by the **Solitaire FRVR** game app.

- **App:** Solitaire FRVR (launched from the app launcher / Games)
- **Source:** Third-party game from **FRVR** (frvr.com), bundled under `src/backend/apps/solitaire-frvr/`
- **What triggers it:** The game bundles a **consent management platform (CMP)** – CookiePro (OneTrust) – and ad/analytics scripts. When the game loads, that CMP shows the "We Care About Your Privacy" / "We and our 960 partners…" dialog to comply with GDPR/CCPA.

So this is classic **Web2 ad-tech**: the game is ad-supported and includes:

- CookiePro consent (the popup)
- Google Ads (interstitial/rewarded)
- Google Analytics (e.g. G-8CR3QVSC2J)
- FRVR analytics (e.g. coeus.frvr.com)

None of this is in the PC2 core, whoami, or Particle Auth; it lives entirely inside the Solitaire FRVR app.

## Why it feels wrong for ElastOS

- ElastOS/PC2 is about **your node, your data, your identity**.
- A generic "960 partners" consent dialog conflicts with that message and feels like Web2 data collection.
- Community feedback is valid: this popup should not be the face of the platform.

## Options

1. **Document only**  
   Make it clear in the launcher or docs that "Solitaire FRVR" is a third-party, ad-supported game and may show consent/ads (this doc does that).

2. **Remove or replace the game**  
   - Remove Solitaire FRVR from the default app list so the CMP never loads on a fresh install, or  
   - Replace it with a privacy-friendly game (no CMP, no ad/analytics scripts).

3. **Load with consent disabled (if the game allows)**  
   The Solitaire FRVR bundle has logic like `forceConsent` and `advertisementIsDisabled` via query params. We could try launching it with e.g. `?ads=off` so the CMP and ads stay off when opened from PC2. This would require testing and might not be officially supported by FRVR.

4. **Sandbox / iframe**  
   Keep the game in an iframe or separate origin so it’s clear it’s a third-party experience; this doesn’t remove the popup but separates it from the “PC2 core” UX.

## Recommendation

- **Short term:** Add a one-line note in the app launcher for Solitaire FRVR: e.g. "Third-party game; may show consent and ads."
- **Medium term:** Prefer a default game that has no CMP and no ad/analytics (or make Solitaire optional / behind a "More games" section).
- **Long term:** Curate a "privacy-friendly" app list and document which apps are first-party vs third-party and what they load.

## Technical reference

- App path: `src/backend/apps/solitaire-frvr/` (and copied to frontend when building).
- Consent is configured in the game’s inline script: `providerName:"cookiepro"`, `websiteKey:"acd0a7d3-539e-483c-8c17-484beca00b4d"` (CookiePro/OneTrust).
- Ads: `adsbygoogle-interstitial`, `adsbygoogle-reward`, `frvr.com` property IDs.
