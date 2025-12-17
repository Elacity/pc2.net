# Testing AI Features - Phase 1 Demo Server

## Quick Setup for Testing

### Step 1: Install Ollama (One-Time Setup)

**macOS/Linux:**
```bash
cd /Users/mtk/Documents/Cursor/pc2.net
./tools/setup-ollama.sh
```

**Or manually:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull deepseek-r1:1.5b
```

**Windows:**
```powershell
cd C:\path\to\pc2.net
.\tools\setup-ollama.ps1
```

### Step 2: Start PC2 Server

The server will automatically:
- ✅ Detect Ollama
- ✅ Start Ollama if needed
- ✅ Verify model is available
- ✅ Enable AI features

```bash
cd /Users/mtk/Documents/Cursor/pc2.net
node tools/mock-pc2-server.cjs
```

### Step 3: Test AI Features

1. **Open the Editor:**
   - Navigate to `http://127.0.0.1:4200`
   - Login with your wallet
   - Open the Editor app

2. **Test Each AI Feature:**
   - Type some text in the editor
   - Try each menu option:
     - **AI → Summarize** - Select text, click Summarize
     - **AI → Explain Like I'm 5!** - Select text, click Explain
     - **AI → Translate to...** - Select text, enter target language
     - **AI → Tone Analysis** - Select text, analyze tone
     - **AI → Generate Questions** - Select text, generate questions

3. **Verify It's Working:**
   - You should see a loading spinner
   - Response should appear in a dialog
   - Check server logs for: `🤖 AI Chat Request` and `✅ Response`

## What to Look For

### ✅ Success Indicators:
- Server logs show: `✅ Ollama is running`
- Server logs show: `✅ Model deepseek-r1:1.5b is available`
- AI features show loading spinner
- AI responses appear in dialog
- No errors in browser console

### ❌ Common Issues:

**"Ollama not installed"**
- Run: `./tools/setup-ollama.sh`
- Or install manually from https://ollama.com/download

**"Model not found"**
- Run: `ollama pull deepseek-r1:1.5b`
- Wait for download to complete (~1.1GB)

**"Cannot connect to Ollama"**
- Check if Ollama is running: `ollama list`
- Start Ollama: `ollama serve`
- Check port 11434 is not blocked

**"AI service unavailable"**
- Check server logs for AI configuration
- Verify `AI_ENABLED` is not set to `false`
- Restart the server

## Server Logs to Watch

When AI features are used, you should see:
```
🤖 AI Chat Request:
   Prompt: [your prompt text]
   Model: deepseek-r1:1.5b
   Ollama: http://localhost:11434
   ✅ Response: [AI response]
```

## Testing Checklist

- [ ] Ollama installed and running
- [ ] DeepSeek model downloaded
- [ ] PC2 server started successfully
- [ ] Server logs show AI is ready
- [ ] Editor opens without errors
- [ ] AI menu appears in editor
- [ ] Summarize feature works
- [ ] Explain Like I'm 5 works
- [ ] Translate feature works
- [ ] Tone Analysis works
- [ ] Generate Questions works
- [ ] All responses are local (no external API calls)

## Next Steps After Testing

Once AI features are confirmed working:
1. Document any issues found
2. Note performance characteristics
3. Test with different text lengths
4. Verify privacy (no external calls)
5. Ready for Phase 2 integration






















