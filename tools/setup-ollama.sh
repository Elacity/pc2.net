#!/bin/bash
# Auto-install Ollama for PC2
# This script installs Ollama and downloads the DeepSeek model

set -e

echo "🤖 PC2 AI Setup - Installing Ollama..."
echo ""

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    echo "✅ Ollama is already installed"
    ollama --version
else
    echo "📥 Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    
    if [ $? -eq 0 ]; then
        echo "✅ Ollama installed successfully"
    else
        echo "❌ Failed to install Ollama"
        echo "💡 Please install manually from: https://ollama.com/download"
        exit 1
    fi
fi

echo ""
echo "🔄 Starting Ollama service..."
# Start Ollama in background if not running
if ! pgrep -x "ollama" > /dev/null; then
    ollama serve > /dev/null 2>&1 &
    sleep 3
    echo "✅ Ollama service started"
else
    echo "✅ Ollama service is already running"
fi

echo ""
echo "📥 Downloading DeepSeek-R1-Distill-Qwen-1.5B model..."
echo "⏳ This may take a few minutes (model size: ~1.1GB)..."
ollama pull deepseek-r1:1.5b

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete! AI features are ready."
    echo ""
    echo "You can now start the PC2 server and AI features will work."
else
    echo ""
    echo "⚠️  Model download failed. You can retry with:"
    echo "   ollama pull deepseek-r1:1.5b"
    exit 1
fi
























