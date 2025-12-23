# AI Settings Tab Implementation Strategy

**Date:** 2025-12-23  
**Status:** Planning  
**Priority:** High - User Experience Enhancement

---

## Overview

Add a dedicated AI settings tab in the Settings window that allows users to:
1. View current AI model and system information
2. Configure API keys for cloud providers (OpenAI, Claude, etc.)
3. Switch between local (Ollama) and cloud providers
4. Test API key connections
5. View model capabilities and status

---

## Implementation Plan

### Phase 1: Backend API Endpoints

#### 1.1 Create AI Config API Routes

**File:** `pc2-node/test-fresh-install/src/api/ai.ts` (new file)

**Endpoints:**

1. **GET `/api/ai/config`** - Get current AI configuration
   - Returns: Current provider, model, available providers, API key status (masked)
   - Auth: Required (wallet-based)

2. **GET `/api/ai/models`** - Get available models for current provider
   - Returns: List of available models with capabilities
   - Auth: Required

3. **POST `/api/ai/config`** - Update AI configuration
   - Body: `{ provider: string, model?: string, apiKeys?: { [provider: string]: string } }`
   - Validates API keys before saving
   - Stores in database (wallet-scoped)
   - Auth: Required

4. **POST `/api/ai/test-key`** - Test API key for a provider
   - Body: `{ provider: string, apiKey: string }`
   - Returns: `{ valid: boolean, models?: string[], error?: string }`
   - Auth: Required

5. **GET `/api/ai/status`** - Get AI service status
   - Returns: Provider status, model info, capabilities, connection status
   - Auth: Required

#### 1.2 Database Schema for AI Config

**Table:** `ai_config` (wallet-scoped)

```sql
CREATE TABLE IF NOT EXISTS ai_config (
    wallet_address TEXT PRIMARY KEY,
    default_provider TEXT DEFAULT 'ollama',
    default_model TEXT,
    api_keys TEXT, -- JSON: { "openai": "sk-...", "claude": "sk-ant-..." }
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**Storage Strategy:**
- API keys encrypted at rest (use existing encryption utilities)
- Wallet-scoped isolation (each user has their own config)
- Default to Ollama if no config exists

#### 1.3 Update AIChatService to Read from Database

**File:** `pc2-node/test-fresh-install/src/services/ai/AIChatService.ts`

**Changes:**
- Add method: `loadConfigFromDatabase(walletAddress: string): Promise<AIConfig>`
- Update `initialize()` to accept wallet address and load config from DB
- Support dynamic provider registration based on API keys
- Add method: `testProviderAPIKey(provider: string, apiKey: string): Promise<boolean>`

---

### Phase 2: Frontend Settings Tab

#### 2.1 Create AI Settings Tab Component

**File:** `src/gui/src/UI/Settings/UITabAI.js` (new file)

**Structure:**
```javascript
export default {
    id: 'ai',
    title_i18n_key: 'ai_assistant',
    icon: 'sparkles.svg', // or 'ai.svg'
    html: () => {
        return `
            <h1>AI Assistant</h1>
            
            <!-- Current Provider Status -->
            <div class="settings-card">
                <strong>Current Provider</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ai-current-provider" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Current Model</strong>
                <div style="flex-grow:1; text-align: right;">
                    <span id="ai-current-model" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <div class="settings-card">
                <strong>Status</strong>
                <div style="flex-grow:1; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                    <span class="ai-status-dot" id="ai-status-dot"></span>
                    <span id="ai-status-text" style="font-size: 13px;">Loading...</span>
                </div>
            </div>
            
            <!-- Provider Selection -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Provider</h2>
            
            <div class="settings-card">
                <strong>Default Provider</strong>
                <select id="ai-provider-select" style="margin-left: 10px; max-width: 300px;">
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="gemini">Gemini (Google)</option>
                </select>
            </div>
            
            <!-- API Keys Section -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">API Keys</h2>
            
            <div class="settings-card">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <strong>OpenAI</strong>
                        <span id="ai-openai-status" style="font-size: 11px; color: #999; display: block; margin-top: 2px;">Not configured</span>
                    </div>
                    <button class="button" id="ai-openai-key-btn" style="font-size: 12px; padding: 0 12px; height: 28px;">Configure</button>
                </div>
            </div>
            
            <div class="settings-card">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <strong>Claude (Anthropic)</strong>
                        <span id="ai-claude-status" style="font-size: 11px; color: #999; display: block; margin-top: 2px;">Not configured</span>
                    </div>
                    <button class="button" id="ai-claude-key-btn" style="font-size: 12px; padding: 0 12px; height: 28px;">Configure</button>
                </div>
            </div>
            
            <!-- Model Information -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Model Information</h2>
            
            <div class="settings-card" style="flex-direction: column; align-items: flex-start;">
                <strong style="margin-bottom: 8px;">Capabilities</strong>
                <div id="ai-capabilities" style="font-size: 13px; color: #666;">
                    Loading...
                </div>
            </div>
            
            <!-- Advanced Settings -->
            <h2 style="font-size: 15px; margin: 20px 0 10px; color: #333;">Advanced</h2>
            
            <div class="settings-card">
                <strong>Ollama Base URL</strong>
                <input type="text" id="ai-ollama-url" value="http://localhost:11434" style="margin-left: 10px; max-width: 300px; padding: 4px 8px;">
            </div>
        `;
    },
    init: async function($el_window) {
        // Load current config
        await loadAIConfig($el_window);
        
        // Setup event handlers
        setupEventHandlers($el_window);
    },
    on_show: async function($content) {
        // Refresh config when tab is shown
        const $el_window = $content.closest('.window-settings');
        if ($el_window.length) {
            await loadAIConfig($el_window);
        }
    }
};
```

#### 2.2 Register Tab in Settings Service

**File:** `src/gui/src/services/SettingsService.js`

**Change:**
```javascript
import AITab from '../UI/Settings/UITabAI.js';

// In _init():
;[
    AccountTab,
    PC2Tab,
    StorageTab,
    AITab, // Add AI tab
    PersonalizationTab,
    LanguageTag,
    AboutTab,
].forEach(tab => {
    this.register_tab(tab);
});
```

#### 2.3 Add Icon

**File:** Add `sparkles.svg` or `ai.svg` to `src/gui/src/icons/` (or use existing icon)

---

### Phase 3: API Key Management UI

#### 3.1 API Key Input Dialog

**Component:** Modal dialog for entering API key
- Input field (password type for security)
- "Test Connection" button
- "Save" button
- Status indicator (valid/invalid)
- Mask existing keys (show only last 4 characters)

#### 3.2 Key Validation

**Flow:**
1. User enters API key
2. Click "Test Connection"
3. Backend validates key by making test API call
4. Show success/error message
5. Save if valid

---

### Phase 4: Integration with AIChatService

#### 4.1 Dynamic Provider Registration

**Update:** `AIChatService.initialize()`
- Load config from database based on wallet address
- Register providers based on available API keys
- Support hot-reloading when config changes

#### 4.2 Provider Selection Logic

**Priority:**
1. User-selected provider (from settings)
2. Default provider (Ollama if available)
3. Fallback to first available provider

---

## Technical Details

### API Key Storage

**Security:**
- Encrypt API keys at rest (use existing encryption)
- Never expose full keys in API responses (mask: `sk-...xxxx`)
- Store per-wallet (isolation)

**Database:**
```typescript
interface AIConfigRow {
    wallet_address: string;
    default_provider: string;
    default_model?: string;
    api_keys: string; // JSON encrypted
    updated_at: number;
}
```

### Provider Support

**Initial Providers:**
1. **Ollama** (Local) - Default, no API key needed
2. **OpenAI** - Requires API key
3. **Claude (Anthropic)** - Requires API key
4. **Gemini (Google)** - Requires API key (future)

**Extensibility:**
- Easy to add more providers
- Provider-specific configuration options

### Model Information Display

**Show:**
- Current model name
- Model capabilities (vision, function calling, etc.)
- Provider status (connected/disconnected)
- Model size/parameters (if available)

---

## UI/UX Considerations

### Visual Design
- Match existing Settings tab styling
- Use status indicators (green dot = connected, red = disconnected)
- Clear section headers
- Consistent button styling

### User Flow
1. User opens Settings → AI tab
2. Sees current provider and status
3. Can switch provider via dropdown
4. Can configure API keys for cloud providers
5. Test keys before saving
6. See model capabilities

### Error Handling
- Clear error messages for invalid API keys
- Connection status indicators
- Help text for each provider
- Links to provider documentation (if needed)

---

## Implementation Order

1. **Backend API Endpoints** (Phase 1)
   - Database schema
   - API routes
   - Config loading/saving

2. **Frontend Tab Component** (Phase 2)
   - Basic UI structure
   - Config loading/display
   - Provider selection

3. **API Key Management** (Phase 3)
   - Key input dialog
   - Validation flow
   - Secure storage

4. **Integration** (Phase 4)
   - Connect to AIChatService
   - Dynamic provider registration
   - Model switching

---

## Testing Checklist

- [ ] Load current AI config
- [ ] Switch between providers
- [ ] Add/update API keys
- [ ] Test API key validation
- [ ] Verify keys are encrypted
- [ ] Test wallet isolation (different users)
- [ ] Verify model switching works
- [ ] Test error handling (invalid keys, network errors)
- [ ] Verify UI updates on config change

---

## Future Enhancements

1. **Model Selection UI** - Dropdown to select specific model
2. **Usage Statistics** - Show API usage/costs
3. **Provider Comparison** - Compare capabilities
4. **Custom Models** - Support for custom Ollama models
5. **Rate Limiting** - Per-provider rate limit settings
6. **Cost Tracking** - Track API costs per provider

---

## Files to Create/Modify

### New Files:
- `pc2-node/test-fresh-install/src/api/ai.ts` - AI config API endpoints
- `src/gui/src/UI/Settings/UITabAI.js` - AI settings tab component
- `pc2-node/test-fresh-install/src/database/migrations/add_ai_config_table.sql` - Database migration

### Modified Files:
- `src/gui/src/services/SettingsService.js` - Register AI tab
- `pc2-node/test-fresh-install/src/api/index.ts` - Register AI routes
- `pc2-node/test-fresh-install/src/services/ai/AIChatService.ts` - Load config from DB
- `pc2-node/test-fresh-install/src/storage/database.ts` - Add AI config table methods

---

## Security Considerations

1. **API Key Encryption** - Encrypt at rest
2. **Wallet Isolation** - Each user's keys are isolated
3. **Input Validation** - Validate API key format
4. **Rate Limiting** - Prevent abuse of test endpoint
5. **Audit Logging** - Log config changes

---

*This document will be updated as implementation progresses.*

