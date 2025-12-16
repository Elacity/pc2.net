# Auto-install Ollama for PC2 (Windows PowerShell)
# This script installs Ollama and downloads the DeepSeek model

Write-Host "🤖 PC2 AI Setup - Installing Ollama..." -ForegroundColor Cyan
Write-Host ""

# Check if Ollama is already installed
$ollamaInstalled = Get-Command ollama -ErrorAction SilentlyContinue

if ($ollamaInstalled) {
    Write-Host "✅ Ollama is already installed" -ForegroundColor Green
    ollama --version
} else {
    Write-Host "📥 Please install Ollama from: https://ollama.com/download" -ForegroundColor Yellow
    Write-Host "   Or use winget: winget install Ollama.Ollama" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, run this script again to download the model." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔄 Starting Ollama service..." -ForegroundColor Cyan
# Check if Ollama is running
$ollamaRunning = Get-Process ollama -ErrorAction SilentlyContinue

if (-not $ollamaRunning) {
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "✅ Ollama service started" -ForegroundColor Green
} else {
    Write-Host "✅ Ollama service is already running" -ForegroundColor Green
}

Write-Host ""
Write-Host "📥 Downloading DeepSeek-R1-Distill-Qwen-1.5B model..." -ForegroundColor Cyan
Write-Host "⏳ This may take a few minutes (model size: ~1.1GB)..." -ForegroundColor Yellow
ollama pull deepseek-r1:1.5b

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Setup complete! AI features are ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now start the PC2 server and AI features will work." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  Model download failed. You can retry with:" -ForegroundColor Yellow
    Write-Host "   ollama pull deepseek-r1:1.5b" -ForegroundColor Yellow
    exit 1
}
















