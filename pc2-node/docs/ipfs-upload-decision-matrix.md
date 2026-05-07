# IPFS Upload Decision Matrix

This matrix captures the consolidated upload routing after removing client-side dual-writes (`/add` + `/upload-elacity*`).

| # | Callsite | Old path(s) | New target endpoint | Scope | Legacy fallback retained | Progress text change |
|---|---|---|---|---|---|---|
| 1 | Creator `uploadDataUrlToIpfs` (profile/cover) | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_data` | Removed | No functional change |
| 2 | Creator `uploadJsonToIpfs` (plan metadata JSON) | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_metadata` | Removed | No functional change |
| 3 | Creator asset bytes upload (non-media) | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_data` | Removed | `Pinning to Elacity IPFS...` -> `Pinning to IPFS...` |
| 4 | Creator thumbnail upload | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_data` | Removed | No functional change |
| 5 | Creator metadata directory upload | `/ipfs/upload-elacity-directory` | `/ipfs/add-directory` | `asset_metadata` | Removed | No functional change |
| 6 | Market `uploadToIpfs` (channel image) | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_data` | Removed | No functional change |
| 7 | Market `uploadJsonToIpfs` (plan metadata) | `/ipfs/add` + `/ipfs/upload-elacity` | `/ipfs/add` | `asset_metadata` | Removed | No functional change |

## Additional normalization applied

- Channel creation metadata directory upload in Creator was normalized to use a single canonical endpoint:
  - Old: `/ipfs/add-directory` with base64 file map
  - New: `/ipfs/add-directory` with object map + `replicationScope: "channel_metadata"`

## Legacy endpoint telemetry

Server keeps legacy endpoints operational for backward compatibility, but now logs warnings when they are used:

- `/api/storage/ipfs/upload-elacity`
- `/api/storage/ipfs/upload-elacity-directory`

These warning logs are intended to help detect stragglers during rollout.
