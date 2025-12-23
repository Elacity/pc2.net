# AI Provider Configuration Guide

**Date:** 2025-01-20  
**Purpose:** How users configure AI providers (local vs cloud)

---

## 🎯 Configuration Philosophy

**PC2 Node AI follows a "Privacy-First, User-Controlled" model:**

1. **Default**: Ollama (local AI) - works out-of-the-box, no API keys needed
2. **Optional**: Cloud providers - only enabled if user adds their own API keys
3. **User Choice**: Users decide between privacy (local) or power (cloud)

---

## 📋 Configuration Options

### Default Configuration (Local AI Only)

**File:** `pc2-node/test-fresh-install/config/default.json`

```json
{
  "ai": {
    "enabled": true,
    "defaultProvider": "ollama",
    "providers": {
      "ollama": {
        "enabled": true,
        "baseUrl": "http://localhost:11434",
        "defaultModel": "deepseek-r1:1.5b"
      }
    }
  }
}
```

**Result:**
- ✅ AI works immediately (Ollama auto-detected)
- ✅ No external API calls
- ✅ Complete privacy
- ✅ Zero costs

---

### Optional: Add Cloud Providers (User API Keys)

**Users can optionally add their own API keys for cloud providers:**

```json
{
  "ai": {
    "enabled": true,
    "defaultProvider": "ollama",
    "providers": {
      "ollama": {
        "enabled": true,
        "baseUrl": "http://localhost:11434",
        "defaultModel": "deepseek-r1:1.5b"
      },
      "openai": {
        "enabled": true,
        "apiKey": "sk-user-provided-key-here"
      },
      "claude": {
        "enabled": true,
        "apiKey": "sk-ant-user-provided-key-here"
      },
      "gemini": {
        "enabled": true,
        "apiKey": "user-provided-key-here"
      }
    }
  }
}
```

**Result:**
- ✅ Ollama still works (default)
- ✅ Cloud providers available (if API keys valid)
- ✅ AI automatically selects best available provider
- ✅ User pays for their own cloud API usage

---

## 🔧 How Provider Registration Works

### Implementation Pattern

```typescript
// In AIChatService.registerProviders()

// 1. Ollama: Auto-detect (no API key needed)
const ollama_available = await checkOllamaAvailable(); // Check http://localhost:11434
if (ollama_available) {
  this.providers.set('ollama', new OllamaProvider({
    baseUrl: 'http://localhost:11434',
    defaultModel: 'deepseek-r1:1.5b'
  }));
}

// 2. Cloud Providers: Only if user provides API key
if (config.ai.providers.openai?.apiKey) {
  this.providers.set('openai', new OpenAiProvider({
    apiKey: config.ai.providers.openai.apiKey
  }));
}

if (config.ai.providers.claude?.apiKey) {
  this.providers.set('claude', new ClaudeProvider({
    apiKey: config.ai.providers.claude.apiKey
  }));
}

// ... etc for other providers
```

### Key Points

1. **Ollama**: Auto-detected, no config needed (but can be disabled)
2. **Cloud Providers**: Only registered if `apiKey` is provided
3. **No API Keys = Local Only**: If no cloud API keys, only Ollama works
4. **User Controls**: Users add their own API keys (we don't provide them)

---

## 🎯 Provider Selection Logic

### Automatic Provider Selection

```typescript
// AI service selects provider based on:
1. User preference (if specified in request)
2. Model availability (which provider has the requested model)
3. Fallback order: Ollama → OpenAI → Claude → etc.
```

### Example Scenarios

**Scenario 1: Ollama Only (Default)**
- User has no API keys configured
- Only Ollama provider available
- All AI requests use Ollama (local, private, free)

**Scenario 2: Ollama + OpenAI**
- User adds OpenAI API key
- Both providers available
- AI can use either (Ollama default, OpenAI for specific models)

**Scenario 3: Cloud Only**
- User disables Ollama: `"ollama": { "enabled": false }`
- User adds OpenAI/Claude API keys
- All AI requests use cloud providers (user pays for usage)

---

## 🔒 Security & Privacy

### API Key Storage

**Location:** `config/default.json` or `config/config.json`

**Security:**
- ✅ API keys stored in config file (user controls access)
- ✅ Not exposed in frontend
- ✅ Not logged in server logs
- ✅ User's responsibility to secure config file

**Best Practices:**
- Use environment variables for production
- Restrict config file permissions
- Don't commit API keys to git

### Privacy Guarantees

**Ollama (Default):**
- ✅ All processing local
- ✅ No data sent externally
- ✅ Complete privacy

**Cloud Providers (Optional):**
- ⚠️ Data sent to external APIs (user's choice)
- ⚠️ User pays for usage
- ⚠️ User controls which providers to enable

---

## 📊 Supported Providers

### Local (No API Key)

| Provider | Status | Model | Cost |
|----------|--------|-------|------|
| **Ollama** | ✅ Default | deepseek-r1:1.5b | Free |

### Cloud (Requires User API Key)

| Provider | API Key Required | Models | Cost |
|----------|-----------------|--------|------|
| **OpenAI** | ✅ User provides | GPT-4, GPT-5, etc. | User pays |
| **Claude** | ✅ User provides | Sonnet, Opus, Haiku | User pays |
| **Gemini** | ✅ User provides | Gemini 2.5 Pro, Flash | User pays |
| **Groq** | ✅ User provides | Llama, Mixtral, Gemma | User pays |
| **DeepSeek** | ✅ User provides | DeepSeek models | User pays |
| **Mistral** | ✅ User provides | Mistral models | User pays |
| **XAI** | ✅ User provides | Grok models | User pays |
| **Together AI** | ✅ User provides | Various models | User pays |
| **OpenRouter** | ✅ User provides | Aggregator | User pays |

---

## 🚀 User Experience

### Setup Flow

**1. Default (Ollama):**
```
User installs PC2 node
  ↓
Ollama auto-detected (if installed)
  ↓
AI works immediately (no setup needed)
```

**2. Optional (Cloud Providers):**
```
User wants more powerful models
  ↓
User gets API key from provider (OpenAI, Claude, etc.)
  ↓
User adds API key to config file
  ↓
Restart PC2 node
  ↓
Cloud provider now available
```

### Configuration UI (Future Enhancement)

**Settings → AI:**
- Toggle Ollama on/off
- Add/remove API keys for cloud providers
- Select default provider
- View available models per provider

---

## ✅ Summary

**Default Behavior:**
- ✅ Ollama (local AI) - works out-of-the-box
- ✅ No external API calls
- ✅ Complete privacy
- ✅ Zero costs

**Optional Enhancement:**
- ✅ Users can add their own API keys
- ✅ Cloud providers available if configured
- ✅ User controls what to use
- ✅ User pays for their own cloud usage

**Result:**
- ✅ Privacy-first by default
- ✅ User choice for power
- ✅ No forced external calls
- ✅ Perfect for self-hosted nodes

---

*This configuration model ensures PC2 nodes work locally by default, with optional cloud providers if users want more powerful models.*

