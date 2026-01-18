#!/bin/bash
# Fresh Install Test Script
# Tests PC2 Node in a completely clean environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/test-fresh-install"
TEST_PORT=4202

echo "🧹 Creating fresh test environment..."
echo "   Test directory: $TEST_DIR"
echo "   Test port: $TEST_PORT"
echo ""

# Clean up any existing test directory
if [ -d "$TEST_DIR" ]; then
    echo "⚠️  Removing existing test directory..."
    rm -rf "$TEST_DIR"
fi

# Create fresh test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "📦 Setting up fresh PC2 Node installation..."
echo ""

# Copy necessary files
echo "1️⃣  Copying package files..."
cp "$PROJECT_ROOT/package.json" .
cp "$PROJECT_ROOT/tsconfig.json" .
cp -r "$PROJECT_ROOT/config" .
cp -r "$PROJECT_ROOT/scripts" .
cp -r "$PROJECT_ROOT/src" .

# Create fresh data directories
mkdir -p data
mkdir -p frontend

# Create minimal frontend for testing
echo "2️⃣  Creating minimal frontend..."
cat > frontend/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PC2 Node - Test Environment</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .info { background: #d1ecf1; color: #0c5460; }
        button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
        }
        button:hover { background: #0056b3; }
        pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 PC2 Node - Fresh Test Environment</h1>
        <p>This is a completely isolated test environment for PC2 Node.</p>
        
        <div id="status"></div>
        
        <h2>API Tests</h2>
        <button onclick="testHealth()">Test Health Check</button>
        <button onclick="testVersion()">Test Version</button>
        <button onclick="testAuth()">Test Authentication</button>
        <button onclick="testFileOps()">Test File Operations</button>
        
        <h2>Results</h2>
        <pre id="results">Click a button above to test...</pre>
    </div>

    <script>
        const API_BASE = window.location.origin;
        const resultsEl = document.getElementById('results');
        const statusEl = document.getElementById('status');
        
        function log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            resultsEl.textContent += `[${timestamp}] ${message}\n`;
            resultsEl.scrollTop = resultsEl.scrollHeight;
        }
        
        function setStatus(message, type) {
            statusEl.innerHTML = `<div class="status ${type}">${message}</div>`;
        }
        
        async function testHealth() {
            log('Testing /health endpoint...');
            try {
                const res = await fetch(`${API_BASE}/health`);
                const data = await res.json();
                log(`✅ Health check passed: ${JSON.stringify(data, null, 2)}`);
                setStatus('Health check: OK', 'success');
            } catch (error) {
                log(`❌ Health check failed: ${error.message}`);
                setStatus('Health check: FAILED', 'error');
            }
        }
        
        async function testVersion() {
            log('Testing /version endpoint...');
            try {
                const res = await fetch(`${API_BASE}/version`);
                const data = await res.json();
                log(`✅ Version check passed: ${JSON.stringify(data, null, 2)}`);
                setStatus('Version check: OK', 'success');
            } catch (error) {
                log(`❌ Version check failed: ${error.message}`);
                setStatus('Version check: FAILED', 'error');
            }
        }
        
        async function testAuth() {
            log('Testing /auth/particle endpoint...');
            const testWallet = '0x' + '1'.repeat(40);
            try {
                const res = await fetch(`${API_BASE}/auth/particle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet_address: testWallet })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    log(`✅ Authentication passed! Token: ${data.token.substring(0, 20)}...`);
                    log(`   User: ${data.user.wallet_address}`);
                    window.testToken = data.token;
                    setStatus('Authentication: OK', 'success');
                } else {
                    log(`❌ Authentication failed: ${JSON.stringify(data)}`);
                    setStatus('Authentication: FAILED', 'error');
                }
            } catch (error) {
                log(`❌ Authentication error: ${error.message}`);
                setStatus('Authentication: FAILED', 'error');
            }
        }
        
        async function testFileOps() {
            if (!window.testToken) {
                log('❌ Please authenticate first!');
                setStatus('File operations: Need authentication', 'error');
                return;
            }
            
            log('Testing file operations...');
            try {
                // Create directory
                log('Creating directory /test...');
                const mkdirRes = await fetch(`${API_BASE}/mkdir`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.testToken}`
                    },
                    body: JSON.stringify({ path: '/test' })
                });
                const mkdirData = await mkdirRes.json();
                log(`✅ Directory created: ${mkdirData.path}`);
                
                // Write file
                log('Writing file /test/hello.txt...');
                const writeRes = await fetch(`${API_BASE}/write`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.testToken}`
                    },
                    body: JSON.stringify({
                        path: '/test/hello.txt',
                        content: 'Hello from PC2 Node! 🚀'
                    })
                });
                const writeData = await writeRes.json();
                log(`✅ File written: ${writeData.path} (${writeData.size} bytes)`);
                
                // Read file
                log('Reading file /test/hello.txt...');
                const readRes = await fetch(`${API_BASE}/read?path=/test/hello.txt`, {
                    headers: { 'Authorization': `Bearer ${window.testToken}` }
                });
                const readData = await readRes.text();
                log(`✅ File read: "${readData}"`);
                
                // List directory
                log('Listing directory /test...');
                const listRes = await fetch(`${API_BASE}/readdir`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.testToken}`
                    },
                    body: JSON.stringify({ path: '/test' })
                });
                const listData = await listRes.json();
                log(`✅ Directory listed: ${listData.length} item(s)`);
                listData.forEach(item => {
                    log(`   - ${item.name} (${item.is_dir ? 'dir' : 'file'}, ${item.size} bytes)`);
                });
                
                setStatus('File operations: OK', 'success');
            } catch (error) {
                log(`❌ File operations failed: ${error.message}`);
                setStatus('File operations: FAILED', 'error');
            }
        }
        
        // Auto-test on load
        window.addEventListener('load', () => {
            log('🚀 PC2 Node test environment ready!');
            log('Click buttons above to test API endpoints.');
            testHealth();
        });
    </script>
</body>
</html>
EOF

# Install dependencies (if node_modules doesn't exist)
if [ ! -d "node_modules" ]; then
    echo "3️⃣  Installing dependencies..."
    npm install --production=false
else
    echo "3️⃣  Dependencies already installed"
fi

# Build the project
echo "4️⃣  Building PC2 Node..."
npm run build:backend

# Update config for test environment
echo "5️⃣  Configuring test environment..."
cat > config/config.json << EOF
{
  "server": {
    "port": $TEST_PORT,
    "host": "0.0.0.0"
  },
  "storage": {
    "ipfs_repo_path": "$TEST_DIR/data/ipfs",
    "database_path": "$TEST_DIR/data/pc2.db"
  }
}
EOF

echo ""
echo "✅ Fresh test environment ready!"
echo ""
echo "📋 To start the server:"
echo "   cd $TEST_DIR"
echo "   PORT=$TEST_PORT npm start"
echo ""
echo "🌐 Then open: http://localhost:$TEST_PORT"
echo ""
echo "🧪 Or run the automated test:"
echo "   cd $TEST_DIR"
echo "   npm test"
echo ""
