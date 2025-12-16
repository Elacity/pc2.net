#!/bin/bash
# Quick test script for AI features

echo "🧪 PC2 AI Quick Test"
echo ""

# Check Ollama
if command -v ollama &> /dev/null; then
    echo "✅ Ollama installed"
    if pgrep -x "ollama" > /dev/null; then
        echo "✅ Ollama running"
    else
        echo "⚠️  Starting Ollama..."
        ollama serve > /dev/null 2>&1 &
        sleep 3
    fi
    
    # Check model
    if ollama list | grep -q "deepseek-r1:1.5b"; then
        echo "✅ Model available"
    else
        echo "⚠️  Model missing, downloading..."
        ollama pull deepseek-r1:1.5b
    fi
else
    echo "❌ Ollama not installed"
    echo "Run: ./tools/setup-ollama.sh"
    exit 1
fi

echo ""
echo "✅ AI is ready! Start server with: node tools/mock-pc2-server.cjs"
