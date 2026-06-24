# PC2 App Manifest Specification (app.json)

> **Version:** 1.0
> **Created:** 2026-03-08
> **Status:** Formal spec — all dApps and registry entries must conform

---

## Overview

Every PC2 dApp ships with an `app.json` manifest at the root of its bundle. This file declares the app's identity, capabilities it requires, services it exposes, and how it should be displayed. The manifest is the contract between the app and the PC2 host.

The manifest format is designed to be **forward-compatible** with:
- **Elacity dDRM SDK** -- access token verification for digital asset marketplaces
- **ElastOS Runtime** -- capsule-based execution with capability tokens
- **ERC-8004 Agent Registry** -- on-chain agent discovery and trust

---

## Quick Examples

### Minimal App

```json
{
  "name": "hello-world",
  "title": "Hello World",
  "version": "1.0.0",
  "entry": "index.html"
}
```

### Full dDRM Media App

```json
{
  "name": "elacity-market",
  "title": "Elacity Market",
  "version": "0.2.0",
  "description": "Browse, purchase, and stream dDRM-protected digital assets on Base.",
  "author": {
    "name": "Elacity Labs",
    "url": "https://ela.city",
    "wallet": "0x1234...abcd"
  },
  "license": "proprietary",
  "icon": "assets/favicon.png",
  "screenshots": ["screenshots/browse.png", "screenshots/player.png"],
  "entry": "index.html",
  "type": "web",
  "category": "media",

  "capabilities": {
    "wallet": true,
    "network": true,
    "ipfs": { "pin": true, "fetch": true },
    "ipc": ["launchApp", "openFolder"],
    "drm": true
  },

  "requirements": {
    "minVersion": "1.1.0"
  },

  "display": {
    "maximize": true,
    "resizable": true,
    "titlebar": true,
    "taskbar": true
  },

  "services": [
    {
      "name": "marketplace",
      "protocol": "https",
      "description": "Elacity decentralized digital asset marketplace"
    }
  ],

  "distribution": {
    "channel": "stable",
    "cid": "QmXk8r9vW...",
    "size": 2097152
  }
}
```

---

## Field Reference

### Core Fields (Required)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique identifier. Lowercase alphanumeric + hyphens. Must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`. Max 64 chars. |
| `title` | `string` | Human-readable display name. Max 128 chars. |
| `version` | `string` | Semantic version (`MAJOR.MINOR.PATCH`). |
| `entry` | `string` | Relative path to the entry file (default: `index.html`). Must not contain `..` or start with `/`. |

### Metadata Fields (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | One-line description for the dApp Center listing. Max 500 chars. |
| `author` | `string \| AppAuthor` | Creator info. String for simple name, object for full details. |
| `license` | `string` | SPDX license identifier (e.g., `MIT`, `proprietary`). |
| `icon` | `string` | Relative path to icon file within the app bundle. Or a keyword for built-in icons. |
| `screenshots` | `string[]` | Relative paths to screenshot images for the dApp Center listing. |
| `type` | `AppType` | Execution model. Default: `web`. See App Types below. |
| `category` | `AppCategory` | Primary category for dApp Center filtering. |
| `system` | `boolean` | If true, app is a system utility (shown in System category regardless of `category`). |

#### App Types

| Value | Description | Status |
|-------|-------------|--------|
| `web` | HTML/JS/CSS running in an iframe. Standard web app model. | Supported |
| `wasm` | WebAssembly module with WASI interface. | Supported |
| `data` | Content bundle with a declared viewer (no code execution). | Supported |
| `microvm` | Runs inside a Firecracker microVM. Requires KVM. | Reserved (Runtime) |
| `agent` | LLM-based agent capsule with memory and tools. | Reserved (Runtime) |

#### App Categories

| Value | Description |
|-------|-------------|
| `media` | Media players, content browsers, streaming, DRM-protected content |
| `blockchain` | Wallets, DEXes, DAOs, staking, node management |
| `tools` | Utilities, editors, file managers, developer tools |
| `system` | Node management, network config, system monitoring |
| `games` | Games, puzzles, entertainment |
| `social` | Chat, messaging, social networks, community |
| `ai` | AI assistants, agents, model management, prompt tools |
| `marketplace` | Digital asset marketplaces, storefronts, trading platforms |
| `other` | Anything that doesn't fit above |

#### AppAuthor Object

```json
{
  "name": "Elacity Labs",
  "url": "https://ela.city",
  "wallet": "0x1234...abcd"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Author's display name. Required. |
| `url` | `string` | Author's website. Optional. |
| `wallet` | `string` | Author's wallet address for royalties/verification. Optional. |

---

### Capabilities

Capabilities declare what permissions the app requires from the PC2 host. In PC2 v1, the host grants all requested capabilities at install time. In the ElastOS Runtime (v2), each capability maps to a capability token that the shell grants interactively.

```json
{
  "capabilities": {
    "wallet": true,
    "network": true,
    "storage": { "read": ["documents/"], "write": ["downloads/"] },
    "ipfs": { "pin": true, "fetch": true },
    "ipc": ["launchApp", "openFolder"],
    "drm": true
  }
}
```

| Capability | Type | Description |
|-----------|------|-------------|
| `wallet` | `boolean` | Access to the user's wallet (sign transactions, read address). Required for any on-chain interaction. |
| `network` | `boolean` | Access to external HTTP/WS endpoints. Required for API calls, GraphQL, etc. |
| `storage` | `StorageCaps` | Read/write access to specific filesystem paths. Scoped by directory. |
| `ipfs` | `IPFSCaps` | Access to IPFS operations. `fetch`: retrieve content by CID. `pin`: pin content to local node. |
| `ipc` | `string[]` | List of IPC message types the app can send to the host (e.g., `launchApp`, `openFolder`, `notify`). |
| `drm` | `boolean` | Access to dDRM decryption and license verification (Lit Protocol / Elacity SDK). Required for any dDRM-protected content. |
| `api_endpoints` | `string[]` | Explicit list of PC2 API routes the app uses (e.g., `"POST /api/drafts"`, `"GET /api/storage/ipfs/pins"`). Not enforced in v1.x — declarative only, maps to Runtime v2 capability tokens. |
| `postMessage_events` | `PostMessageCaps` | IPC events the app sends and receives via `window.parent.postMessage`. |
| `external_services` | `string[]` | External URLs the app communicates with (e.g., `"https://base.ela.city/api/2.0/graphql"`). Declares network dependencies for Runtime v2 network scoping. |
| `notes` | `string` | Free-text annotation explaining the app's API usage pattern. Optional. |

#### PostMessageCaps Object

```json
{
  "sends": ["mint-draft-saved", "mint-close-creator"],
  "receives": ["wallet-response"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sends` | `string[]` | Message types the app sends to the host shell. |
| `receives` | `string[]` | Message types the app listens for from the host shell. |

#### Runtime v2 Mapping

In v1.x, `api_endpoints`, `postMessage_events`, and `external_services` are metadata only. In Runtime v2:

- `api_endpoints` become scoped capability tokens — the capsule can only call declared endpoints
- `postMessage_events` become IPC channel grants — the capsule can only send/receive declared events
- `external_services` become network allowlist entries — the capsule cannot contact undeclared hosts

#### Reserved Capabilities (Future)

These are defined but not yet enforced. Including them in your manifest is valid but has no effect in PC2 v1.

| Capability | Type | Description | Target |
|-----------|------|-------------|--------|
| `audio` | `boolean` | Access to audio output/input devices. | Runtime |
| `camera` | `boolean` | Access to camera/video input. | Runtime |
| `compute` | `ComputeCaps` | Request GPU/CPU compute resources. | Runtime |
| `protocols` | `string[]` | Register as a provider for protocol handlers (`elastos://`, `localhost://`, custom). | Runtime |

#### StorageCaps Object

```json
{
  "read": ["documents/", "photos/"],
  "write": ["downloads/"]
}
```

Paths are relative to the user's storage root. Supports directory-level scoping. In PC2 v1, storage access is currently unscoped (session token grants all). In the Runtime, these become token-scoped resources.

#### IPFSCaps Object

```json
{
  "pin": true,
  "fetch": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pin` | `boolean` | Pin content to the local IPFS node (persist and seed). |
| `fetch` | `boolean` | Fetch content by CID from the IPFS network. |

---

### Requirements

Requirements declare what the PC2 host must provide for the app to function correctly. Unlike capabilities (which are permissions), requirements are environmental constraints.

```json
{
  "requirements": {
    "headers": ["cross-origin-isolation"],
    "popup": true,
    "minVersion": "1.1.0",
    "services": ["ipfs", "wallet"],
    "platform": {
      "os": ["linux"],
      "arch": ["x64", "arm64"],
      "minMemoryMB": 4096,
      "reason": "Elastos Node Manager runs Linux node binaries."
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `headers` | `string[]` | Special HTTP headers the host must serve. `cross-origin-isolation` enables `SharedArrayBuffer` (needed for DRM players, WASM codecs). |
| `popup` | `boolean` | If true, app must open in a dedicated popup window (not an iframe tab). Required when `cross-origin-isolation` is needed. |
| `minVersion` | `string` | Minimum PC2 version required. Semver string. |
| `services` | `string[]` | PC2 services that must be available (e.g., `ipfs`, `wallet`, `ai`). |
| `platform` | `object` | Device-compatibility gate. The host must satisfy every present field or the install is refused and the dApp Centre shows **"Not compatible with this device"**. Used by Linux-only service apps such as the Elastos Node Manager. |

**`requirements.platform` fields** (each is an allow-list / minimum; absent = no constraint):

| Field | Type | Description |
|-------|------|-------------|
| `os` | `string[]` | Allowed `os.platform()` values, e.g. `["linux"]`. Blocks macOS (`darwin`) / Windows (`win32`) when omitted from the list. |
| `arch` | `string[]` | Allowed `os.arch()` values, e.g. `["x64", "arm64"]`. `arm64` admits Jetson / Raspberry Pi-class devices. |
| `minMemoryMB` | `number` | Minimum total RAM in MB. |
| `reason` | `string` | Operator-facing message shown when incompatible (overrides the auto-generated text). |

Gating is two-layer: the dApp Centre evaluates this client-side to disable the Install button (`isHostCompatible()`), and `AppInstallService` re-evaluates it server-side at install time as defense-in-depth (`evaluatePlatformCompatibility()` in `utils/platform.ts`). The host exposes its facts at `GET /api/system/host-platform`.

---

### Display

Controls how the app window appears in the Puter desktop shell.

```json
{
  "display": {
    "maximize": true,
    "width": 1280,
    "height": 720,
    "resizable": true,
    "titlebar": true,
    "taskbar": true
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maximize` | `boolean` | `false` | Open maximized (fills the desktop). |
| `width` | `number` | `800` | Initial window width in pixels. Ignored if `maximize` is true. |
| `height` | `number` | `600` | Initial window height in pixels. Ignored if `maximize` is true. |
| `resizable` | `boolean` | `true` | Whether the user can resize the window. |
| `titlebar` | `boolean` | `true` | Show the window title bar. |
| `taskbar` | `boolean` | `true` | Show the app in the desktop taskbar. |

---

### Services

Declares what services the app exposes. This is used for inter-app communication and, in the future, for ERC-8004 agent registration.

```json
{
  "services": [
    {
      "name": "marketplace",
      "protocol": "https",
      "endpoint": "/apps/elacity-market/",
      "description": "Digital asset marketplace for browsing, purchasing, and trading"
    },
    {
      "name": "drm-player",
      "protocol": "https",
      "description": "DRM-protected media playback with Lit Protocol decryption"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Service identifier. Lowercase alphanumeric + hyphens. |
| `protocol` | `string` | Protocol the service speaks (`https`, `wss`, `grpc`, `mcp`, `a2a`). |
| `endpoint` | `string` | Relative or absolute URL for the service. Optional in v1 (resolved at runtime). |
| `description` | `string` | Human-readable description of the service. |

#### ERC-8004 Alignment

The `services` array is forward-compatible with the [ERC-8004 agent registration file](https://eips.ethereum.org/EIPS/eip-8004) format. When PC2 nodes are registered as on-chain agents, each app's `services` entries can be exported directly to the registration file:

```
app.json services[]  ->  ERC-8004 registration.services[]
  name               ->  name
  endpoint           ->  endpoint (resolved to full URL: https://node.ela.city/apps/...)
  protocol           ->  (mapped to endpoint scheme)
```

Service types like `mcp` (Model Context Protocol) and `a2a` (Agent-to-Agent) enable cross-agent discovery when the agent economy is live.

---

### Distribution

Controls how the app is packaged and delivered.

```json
{
  "distribution": {
    "channel": "stable",
    "cid": "QmXk8r9vW...",
    "size": 2097152,
    "signature": "0xabc...",
    "signedBy": "did:elastos:iXyz...",
    "updateUrl": "https://registry.ela.city/api/apps/elacity-market"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `channel` | `string` | Release channel: `stable`, `beta`, or `dev`. Default: `stable`. |
| `cid` | `string` | IPFS Content Identifier of the app bundle. Required for remote installation. |
| `size` | `number` | Bundle size in bytes (informational, for UI display). |
| `signature` | `string` | Cryptographic signature of the bundle CID. Not enforced in PC2 v1. |
| `signedBy` | `string` | Public key, DID, or wallet address of the signer. Paired with `signature`. |
| `updateUrl` | `string` | URL to check for updates. The host polls this to detect new versions. |

#### Signature Verification (Future)

In PC2 v1, `signature` and `signedBy` are informational. In the ElastOS Runtime, every capsule must be signed and verified before loading. The signature covers the `cid` field:

```
signature = Ed25519.sign(signedBy.privateKey, SHA256(cid))
```

The Runtime validates: `Ed25519.verify(signedBy.publicKey, signature, SHA256(cid))` before allowing the capsule to execute. This prevents tampering with app bundles in transit or at rest.

---

### Registry-Only Fields

These fields are added by the app registry server, not by the app developer. They appear in registry API responses but should NOT be included in the app's `app.json`.

```json
{
  "registry": {
    "status": "available",
    "category": "media",
    "badges": ["ddrm", "opensource"],
    "staffPick": true,
    "popular": true,
    "featured": true,
    "gradient": "gradient-purple",
    "website": "https://ela.city",
    "source": "https://github.com/nicktomlin/...",
    "compatibility": "PC2 1.1+"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `available` (installable) or `coming_soon` (listed but not yet installable). |
| `category` | `string` | Registry-level category override. Takes precedence over manifest `category`. |
| `badges` | `string[]` | Visual badges: `ddrm`, `opensource`, `wasm`, `system`, `verified`. |
| `staffPick` | `boolean` | Highlighted in the "Staff Picks" section of the dApp Center. |
| `popular` | `boolean` | Shown in the "Popular" section. |
| `featured` | `boolean` | Featured prominently on the Discover page. |
| `gradient` | `string` | CSS gradient class for the app card background. |
| `website` | `string` | External website URL for the app. |
| `source` | `string` | Source code repository URL. |
| `compatibility` | `string` | Human-readable compatibility note (e.g., "PC2 1.1+"). |

---

## Validation Rules

The PC2 host validates manifests at install time. Invalid manifests are rejected.

### Required Field Validation

1. `name` must exist, be a non-empty string, and match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
2. `title` must exist and be a non-empty string
3. `version` must exist and be a valid semver string (e.g., `1.0.0`, `0.2.0-beta.1`)

### Safety Validation

4. `entry` must not contain `..`, must not start with `/`, and must not contain `\`
5. `name` must be at most 64 characters
6. `title` must be at most 128 characters
7. `description` must be at most 500 characters (if present)

### Type Validation (Warnings)

These produce warnings in logs but do not block installation:

8. `type` should be one of: `web`, `wasm`, `data`, `microvm`, `agent`
9. `category` should be one of the defined categories
10. `distribution.channel` should be one of: `stable`, `beta`, `dev`
11. `capabilities` values should be the correct types (boolean, object, or array as defined)

---

## Asset Types and the Digital Marketplace Vision

> **Full strategy:** See [ELACITY_UNIVERSAL_ASSET_STRATEGY.md](./ELACITY_UNIVERSAL_ASSET_STRATEGY.md) for the complete universal asset protocol vision, SDK evolution, and marketplace verticals.

The manifest schema is designed to support Elacity's vision as the universal digital asset marketplace -- not limited to media, but encompassing all types of digital assets that humans and agents can create, trade, and consume. The goal is for Elacity to be the "Amazon of digital assets" where humans and agents trade AI models, code, datasets, templates, media, and agent skills -- all gated by dDRM ACCESS_TOKENs.

### Universal Asset Metadata (Channel-Level)

The `app.json` manifest declares what capabilities a marketplace app needs. The **content metadata** (stored in IPFS, referenced by Channel NFTs) declares what the individual asset is. The universal schema extends the existing media metadata to support any asset type:

```json
{
  "kid": "RFC-4122 content identifier",
  "name": "My AI Model",
  "asset": {
    "uri": "ipfs://encrypted-content-CID",
    "contentType": "application/x-ai-model",
    "assetType": "ai-model",
    "runtime": "wasm",
    "size": 1073741824,
    "protectionType": ["cenc:lit-drm-v1"]
  },
  "media": { "uri": "ipfs://...", "contentType": "video/mp4" },
  "properties": { "chainId": 8453, "channel": "0x...", "authority": "0x..." }
}
```

The `asset` field is universal. The `media` field is optional (backward compat for existing video content). Both use the same dDRM protection flow: `ACCESS_TOKEN` ownership check -> Lit Protocol key retrieval -> decryption.

#### Asset Types (assetType values)

| Value | Description | Decryption Consumer |
|-------|-------------|-------------------|
| `video` | Video/audio streaming content | `@elacity-js/media-player` |
| `audio` | Audio-only content | `@elacity-js/media-player` |
| `image` | Photography, illustrations, design assets | Image viewer |
| `document` | PDF, ePub, text documents | Document viewer |
| `ai-model` | LLM, vision, audio models (GGUF, ONNX, SafeTensors) | Ollama, WASM runtime |
| `code` | npm packages, plugins, themes, libraries | Package manager, sandbox |
| `dataset` | CSV, Parquet, JSON training data | Data pipeline, sandbox |
| `template` | Design templates, document templates | Template engine |
| `font` | OTF, TTF, WOFF font files | Font manager |
| `agent` | LLM agent capsules with tools and memory | Runtime agent framework |
| `software` | Executable applications, SaaS access keys | License manager, sandbox |
| `3d-model` | glTF, FBX 3D models | 3D viewer, game engine |

### Current Asset-Type Apps

| App Type | Example | Key Capabilities |
|----------|---------|-----------------|
| Media marketplace | Elacity Market | `wallet`, `ipfs`, `drm`, `network` |
| Media player | Elacity Player | `wallet`, `ipfs`, `drm` + `cross-origin-isolation` |
| DeFi / DEX | Uniswap | `wallet`, `network` |
| Node management | Supernode Manager | `network`, `ipc` |

### Future Asset-Type Apps

| App Type | Description | Key Capabilities |
|----------|-------------|-----------------|
| AI model marketplace | Trade, license, and run AI models | `wallet`, `ipfs`, `drm`, `compute` |
| Code/plugin marketplace | Buy and install verified code capsules | `wallet`, `ipfs`, `drm`, `protocols` |
| Dataset marketplace | Trade training datasets, knowledge bases | `wallet`, `ipfs`, `drm`, `storage` |
| Template marketplace | Design templates, document templates | `wallet`, `ipfs`, `drm` |
| Agent marketplace | Deploy, discover, hire autonomous agents | `wallet`, `network`, `drm`, `protocols` |

In all cases, the flow is:
1. App declares `capabilities.drm: true` in its manifest
2. Access is gated by dDRM access tokens (ERC-1155, verified via Lit Protocol)
3. The Runtime's capability token system ensures the app can only access what it's authorized to
4. Agents and humans use the same manifest format, same marketplace, same access tokens

The `type` field distinguishes how the asset is executed (`web`, `wasm`, `data`, `agent`). The `capabilities` and `services` fields declare what it needs and what it provides. The `distribution.cid` is the content address. The `distribution.signature` proves authenticity. This is the complete lifecycle of a digital asset in the Elacity ecosystem.

---

## Convergence Notes

### PC2 v1 -> v1.5 (Current -> Bridge)

- Capabilities are declared but granted implicitly (session token = full access)
- `type` is always `web` (iframe-based execution)
- Signature verification is not enforced
- Services are informational (no inter-app routing)

### v1.5 -> v2.0 (Bridge -> Runtime)

- Capabilities become capability tokens (scoped, signed, time-limited)
- `type` expands to `wasm` and `microvm` (sandboxed execution)
- Signature verification enforced before capsule loading
- Services become routable (capsules communicate via protocols)
- Shell capsule prompts users for capability grants
- Audit log records all capability usage

### ERC-8004 Integration (v2.0+)

- Apps/capsules registered as on-chain agents with Identity Registry (ERC-721)
- `services[]` exported to agent registration files
- dApp Store ratings feed into Reputation Registry
- Validation Registry verifies capsule signatures on-chain

---

*This specification is a living document. Updates will be versioned (1.0, 1.1, etc.) with backward compatibility maintained.*
