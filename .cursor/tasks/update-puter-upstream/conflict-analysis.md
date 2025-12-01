# Conflict Analysis - Phase 1 Merge

## Summary
- **Total Elacity modifications**: 77 files
- **Potential conflicts**: 26 files (modified by both Elacity and upstream)
- **Safe new files**: 51 files (Elacity-only additions)

## HIGH RISK - Files Modified by BOTH Parties

### Infrastructure (4 files)
```
.github/workflows/test.yml
.gitignore
Dockerfile
package-lock.json
package.json
```
**Strategy**: Manual review. Preserve Elacity's packageManager config in package.json.

### Backend Core (9 files) - CRITICAL
```
src/backend/src/CoreModule.js
src/backend/src/boot/RuntimeEnvironment.js
src/backend/src/config.js
src/backend/src/helpers.js
src/backend/src/modules/apps/RecommendedAppsService.js
src/backend/src/routers/auth/delete-own-user.js
src/backend/src/services/GetUserService.js
src/backend/src/services/PuterAPIService.js
src/backend/src/services/database/SqliteDatabaseAccessService.js
```
**Strategy**: KEEP ELACITY VERSION. These contain Particle Auth integration.

### Frontend (13 files) - CRITICAL
```
src/gui/src/UI/Settings/UITabAccount.js
src/gui/src/UI/Settings/UIWindowFinalizeUserDeletion.js
src/gui/src/UI/UIAlert.js
src/gui/src/UI/UIDesktop.js
src/gui/src/UI/UIWindow.js
src/gui/src/css/style.css
src/gui/src/extensions/modify-user-options-menu.js
src/gui/src/globals.js
src/gui/src/helpers.js
src/gui/src/i18n/translations/en.js
src/gui/src/initgui.js
src/gui/src/services/ThemeService.js
```
**Strategy**: KEEP ELACITY VERSION. These contain branding and Particle Auth UI.

## SAFE - Elacity-Only Files (No Conflicts)

### Cursor Configuration (6 files)
```
.cursor/rules/cleancode.mdc
.cursor/rules/codequality.mdc
.cursor/rules/general.mdc
.cursor/rules/taskmanagement.mdc
.cursor/rules/typescript.mdc
.cursor/rules/workflow.mdc
```

### Documentation (2 files)
```
.github/workflows/README.md
SETUP_PARTICLE_AUTH.md
```

### Build Configuration (3 files)
```
.gitmodules
.google/toolkit/update-docker-image
cloudbuild.yaml
docker-compose.yml
```

### Backend Particle Auth (4 files) - PROTECTED
```
src/backend/src/routers/auth/particle.js
src/backend/src/routers/whoami.js
src/backend/src/services/ParticleAuthGUIService.js
src/backend/src/services/auth/ParticleAuthService.js
src/backend/src/services/database/sqlite_setup/0038_user_wallet_address.sql
```

### Frontend Particle Auth (1 file) - PROTECTED
```
src/gui/src/UI/UIWindowParticleLogin.js
```

### Branding CSS (2 files)
```
src/gui/src/css/normalize.css
```

### Favicons (25 files)
```
src/gui/src/favicon.ico
src/gui/src/favicons/* (24 files)
```

### Fonts (3 files)
```
src/gui/src/fonts/Telegraf-UltraBold-800.otf
src/gui/src/fonts/Telegraf-UltraLight-200.otf
src/gui/src/fonts/TelegrafRegular.otf
```

### Icons & Images (2 files)
```
src/gui/src/icons/elastos-logo.svg
src/gui/src/images/elastos-logo.webp
```

### Submodules (1 directory)
```
submodules/particle-auth
```

### Tools (1 file)
```
tools/build_relay.sh
```

## Merge Strategy

### Phase 1: Merge with No Commit
```bash
git checkout main
git merge upstream/main --no-commit --no-ff
```

### Phase 2: Handle Conflicts
For each of the 26 conflict files:
1. Check if it contains Particle Auth code → KEEP OURS
2. Check if it's infrastructure (package.json) → MANUAL MERGE
3. Default → KEEP OURS (Phase 1 is conservative)

### Phase 3: Verify Protected Files Unchanged
```bash
git diff HEAD -- src/backend/src/routers/auth/particle.js
git diff HEAD -- src/backend/src/services/auth/ParticleAuthService.js
git diff HEAD -- src/gui/src/UI/UIWindowParticleLogin.js
# (etc for all protected files)
```

### Phase 4: Accept Only Safe Upstream Changes
Files that upstream modified but we didn't touch = safe to accept.

## Decision Matrix

| File Type | Elacity Modified | Upstream Modified | Action |
|-----------|-----------------|-------------------|---------|
| Particle Auth | Yes | No | Keep Ours |
| Particle Auth | Yes | Yes | Keep Ours |
| Branding | Yes | No | Keep Ours |
| Branding | Yes | Yes | Keep Ours |
| Infrastructure | Yes | Yes | Manual Merge |
| Core Code | Yes | Yes | Keep Ours (Phase 1) |
| New File | Yes | No | Keep Ours |
| Upstream Only | No | Yes | Accept Theirs |


