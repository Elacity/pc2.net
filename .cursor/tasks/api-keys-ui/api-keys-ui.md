# Task: API Keys Management UI in Security Settings

**Task ID**: api-keys-ui
**Created**: 2026-01-20
**Status**: Proposed
**Priority**: High

## Description

Add API Keys management interface to the Security tab in Settings.

## Requirements

1. List API Keys - Display all keys with name, scopes, dates
2. Create API Key - Modal with name, scope checkboxes, expiration
3. Revoke API Key - Revoke button with confirmation
4. PC2 Mode Only - Section only visible in self-hosted mode

## Implementation Plan

- [ ] Add API Keys section HTML to UITabSecurity.js
- [ ] Add CSS styles matching settings-card pattern
- [ ] Implement loadApiKeys() fetching from /api/keys
- [ ] Implement create key modal with scope checkboxes
- [ ] Implement key display modal with copy button
- [ ] Implement revoke key with confirmation dialog
- [ ] Add error handling and loading states

## Files to Modify

- src/gui/src/UI/Settings/UITabSecurity.js

## Backend Endpoints (Already Implemented)

- GET /api/keys - List all keys
- POST /api/keys - Create new key  
- POST /api/keys/:id/revoke - Revoke key
- GET /api/keys/scopes - Get available scopes
