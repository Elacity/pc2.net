# Task: Phase 1 - Upstream Puter Infrastructure Sync

**Task ID**: update-puter-upstream
**Created**: 2025-12-01
**Status**: InProgress
**Priority**: High
**Criticality**: MAXIMUM - $10B consequence level

## Description

Execute Phase 1 of the Layered Sync Strategy to merge upstream Puter improvements while preserving 100% of Elacity's custom Elastos wallet authentication and branding.

## Background

- Elacity/pc2.net is a fork of HeyPuter/puter
- Currently ~1200 commits behind upstream/main
- Last sync: August 4, 2025 (4 months ago)
- Elacity has custom Particle Auth integration, Elastos branding, and wallet features
- Upstream has security fixes, infrastructure improvements, and bug fixes we need

## Requirements

### MUST Preserve (Zero Changes Allowed)
- ✅ All Particle Auth integration code
- ✅ All Elastos branding (favicons, CSS, logos)
- ✅ Custom database schema (wallet_address)
- ✅ Custom routes (particle.js, auth modifications)
- ✅ Custom services (ParticleAuthService, ParticleAuthGUIService)
- ✅ Custom UI components (UIWindowParticleLogin)
- ✅ Build process for particle-auth submodule

### MUST Merge (Infrastructure Only)
- ✅ Security fixes in unmodified files
- ✅ CI/CD improvements (Docker, package management)
- ✅ Bug fixes in core Puter files we haven't touched
- ✅ Testing infrastructure improvements
- ✅ ESLint and tooling fixes

### MUST Avoid
- ❌ Breaking changes to auth system
- ❌ Database migration conflicts
- ❌ Changes to any file we've customized
- ❌ Scope creep beyond infrastructure sync

## Implementation Plan

### Pre-Flight Checks
- [x] Verify current branch: update-to-latest-puter-version
- [x] Confirm upstream is fetched and current
- [ ] Create backup branch with timestamp
- [ ] Document all custom files that must be protected
- [ ] Verify clean working directory

### Phase 1A: Safety Backup
- [ ] Create backup branch: `backup-pre-update-20251201`
- [ ] Push backup to remote for safety
- [ ] Verify backup integrity

### Phase 1B: Identify Protected Files
- [ ] Generate complete list of Elacity-modified files
- [ ] Cross-reference with upstream changes
- [ ] Create protection strategy for each file

### Phase 1C: Controlled Merge
- [ ] Checkout main branch
- [ ] Merge upstream/main with --no-commit --no-ff
- [ ] Analyze merge conflicts
- [ ] Revert ALL changes to protected custom files
- [ ] Manually resolve package.json (preserve yarn config)
- [ ] Manually resolve docker-compose.yml (preserve custom setup)

### Phase 1D: Verification
- [ ] Verify no changes to Particle Auth files
- [ ] Verify no changes to custom services
- [ ] Verify no changes to custom UI components
- [ ] Verify branding intact
- [ ] Check for unintended changes with git diff

### Phase 1E: Build Verification
- [ ] npm install (check for dependency issues)
- [ ] Build particle-auth submodule
- [ ] Build GUI
- [ ] Start server and verify no errors

### Phase 1F: Functional Testing
- [ ] Server starts successfully
- [ ] Puter loads at localhost:4100
- [ ] Particle Auth iframe loads
- [ ] Wallet login functional
- [ ] User session management works
- [ ] File operations work
- [ ] No console errors
- [ ] No server errors

### Phase 1G: Commit and Push
- [ ] Review all changes one final time
- [ ] Create detailed commit message
- [ ] Commit to update-to-latest-puter-version branch
- [ ] Push to remote
- [ ] Update task status to Review

## Acceptance Criteria

### Code Quality (10/10 Standard)
- [ ] Zero changes to custom Elacity code
- [ ] All merged changes are infrastructure/bug fixes only
- [ ] No code duplication introduced
- [ ] No TypeScript errors
- [ ] No ESLint warnings in merged code
- [ ] Package.json properly merged (preserving yarn config)
- [ ] Docker-compose properly merged (preserving custom setup)

### Functional Verification (10/10 Standard)
- [ ] All existing Elastos features work identically
- [ ] Particle Auth login works perfectly
- [ ] Wallet integration functional
- [ ] User sessions persist correctly
- [ ] File system operations work
- [ ] No regression in any feature
- [ ] No new console errors
- [ ] No new server errors

### Process Compliance (10/10 Standard)
- [ ] Task document created before implementation
- [ ] All steps documented and checked off
- [ ] Backup created before any changes
- [ ] No scope creep - only Phase 1 scope
- [ ] Proper git commit messages
- [ ] Changes pushed to correct branch
- [ ] Task updated to Review status

### Security & Stability (10/10 Standard)
- [ ] No security regressions
- [ ] Auth system unchanged and functional
- [ ] Database integrity maintained
- [ ] All upstream security fixes successfully applied
- [ ] No new vulnerabilities introduced

## Files to Protect (MUST NOT CHANGE)

### Backend Auth & Services
```
src/backend/src/routers/auth/particle.js
src/backend/src/services/auth/ParticleAuthService.js
src/backend/src/services/ParticleAuthGUIService.js
src/backend/src/services/GetUserService.js
src/backend/src/services/PuterAPIService.js
src/backend/src/routers/whoami.js
src/backend/src/routers/auth/delete-own-user.js
```

### Backend Core & Config
```
src/backend/src/CoreModule.js
src/backend/src/config.js
src/backend/src/helpers.js
src/backend/src/boot/RuntimeEnvironment.js
```

### Database Schema
```
src/backend/src/services/database/SqliteDatabaseAccessService.js
src/backend/src/services/database/sqlite_setup/0038_user_wallet_address.sql
```

### Frontend UI Components
```
src/gui/src/UI/UIWindowParticleLogin.js
src/gui/src/UI/Settings/UITabAccount.js
src/gui/src/UI/Settings/UIWindowFinalizeUserDeletion.js
src/gui/src/UI/UIAlert.js
src/gui/src/UI/UIDesktop.js
src/gui/src/UI/UIWindow.js
src/gui/src/extensions/modify-user-options-menu.js
```

### Branding & Assets
```
src/gui/src/css/normalize.css
src/gui/src/css/style.css
src/gui/src/favicon.ico
src/gui/src/favicons/* (all 40+ files)
```

### Recommended Apps
```
src/backend/src/modules/apps/RecommendedAppsService.js
```

## Files to Merge Carefully (Hybrid)

### Package Management
```
package.json - Preserve packageManager field, merge dependencies carefully
docker-compose.yml - Preserve custom configuration, merge improvements
```

## Testing Strategy

### Automated Checks
- Build process completes without errors
- No TypeScript compilation errors
- No ESLint warnings (existing warnings OK)
- Dependencies install cleanly

### Manual Testing
1. **Server Start**: `npm start` succeeds, no errors in logs
2. **GUI Load**: http://puter.localhost:4100 loads correctly
3. **Particle Auth**: Wallet login button appears and functions
4. **Authentication Flow**: Complete wallet login successfully
5. **Session Persistence**: Refresh page, session maintained
6. **File Operations**: Create, read, update, delete files
7. **Settings Panel**: Account settings accessible
8. **User Deletion**: Deletion flow works (if applicable)

### Regression Testing
- Compare behavior before/after merge
- Verify no features broken
- Verify no new bugs introduced
- Verify performance unchanged or improved

## Rollback Plan

If anything fails:
```bash
# Immediate rollback
git checkout backup-pre-update-20251201

# Verify rollback successful
npm start
# Test all features

# If rollback needed on remote
git push origin backup-pre-update-20251201:update-to-latest-puter-version --force
```

## Success Metrics

### Technical Success
- ✅ ~1200 upstream commits reduced to ~20 diverged commits
- ✅ All security fixes from upstream applied
- ✅ All bug fixes from upstream applied
- ✅ 100% of custom Elacity code preserved
- ✅ Zero regressions
- ✅ Zero new errors

### Process Success
- ✅ All task management rules followed
- ✅ All code quality rules followed
- ✅ All testing completed successfully
- ✅ Documentation complete and accurate
- ✅ 10/10 quality standard achieved

## Notes

- This is Phase 1 of 3 in the Layered Sync Strategy
- Phase 2 (Selective Feature Adoption) and Phase 3 (Deep Integration) are future tasks
- Conservative approach: Better to skip uncertain changes than risk breaking production
- Every change must be verified against the "zero impact to Elastos features" requirement
- When in doubt, preserve Elacity version

## Risk Assessment

**Overall Risk Level**: MEDIUM (mitigated to LOW by protective measures)

**Mitigations**:
- Backup branch created before any changes
- Selective merge with manual verification
- Protected file list prevents accidental overwrites
- Comprehensive testing before commit
- Rollback plan ready

**Residual Risks**:
- Package.json conflicts (managed manually)
- Subtle runtime changes in core Puter (testing will catch)
- Dependency version conflicts (npm install will reveal)


