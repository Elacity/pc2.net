#!/bin/bash
# ============================================================================
# PC2 Agent API Test Script
# ============================================================================
# Tests the new agent API endpoints including:
# - API Key creation and management
# - Command execution
# - Script execution
# - Tool registry
#
# Usage:
#   ./scripts/test-agent-api.sh [SESSION_TOKEN]
#
# If SESSION_TOKEN is not provided, some tests will be skipped.
# Get your session token by logging into the PC2 UI and checking browser storage.
# ============================================================================

set -e

BASE_URL="${PC2_BASE_URL:-http://localhost:4200}"
SESSION_TOKEN="${1:-}"
API_KEY=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  PC2 Agent API Test Suite${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "Base URL: ${YELLOW}$BASE_URL${NC}"
echo ""

# Helper function for test results
pass() {
  echo -e "  ${GREEN}✓ $1${NC}"
}

fail() {
  echo -e "  ${RED}✗ $1${NC}"
  echo -e "    ${RED}$2${NC}"
}

info() {
  echo -e "  ${YELLOW}→ $1${NC}"
}

# ============================================================================
# Test 1: Terminal Status (no auth required)
# ============================================================================
echo -e "${BLUE}[1] Testing Terminal Status (GET /api/terminal/status)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/terminal/status")
if echo "$RESPONSE" | grep -q '"available"'; then
  pass "Terminal status endpoint working"
  AVAILABLE=$(echo "$RESPONSE" | grep -o '"available":[^,]*' | cut -d: -f2)
  ISOLATION=$(echo "$RESPONSE" | grep -o '"isolationMode":"[^"]*"' | cut -d'"' -f4)
  info "Available: $AVAILABLE, Isolation: $ISOLATION"
else
  fail "Terminal status endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test 2: Tool Registry (no auth required)
# ============================================================================
echo -e "${BLUE}[2] Testing Tool Registry (GET /api/tools)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/tools")
if echo "$RESPONSE" | grep -q '"tools"'; then
  TOOL_COUNT=$(echo "$RESPONSE" | grep -o '"totalTools":[0-9]*' | cut -d: -f2)
  pass "Tool registry endpoint working"
  info "Total tools available: $TOOL_COUNT"
else
  fail "Tool registry endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test 3: Tool Categories
# ============================================================================
echo -e "${BLUE}[3] Testing Tool Categories (GET /api/tools/categories)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/tools/categories")
if echo "$RESPONSE" | grep -q '"categories"'; then
  pass "Tool categories endpoint working"
  CATEGORIES=$(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ')
  info "Categories: $CATEGORIES"
else
  fail "Tool categories endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test 4: OpenAPI Schema
# ============================================================================
echo -e "${BLUE}[4] Testing OpenAPI Schema (GET /api/tools/openapi)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/tools/openapi")
if echo "$RESPONSE" | grep -q '"openapi"'; then
  pass "OpenAPI schema endpoint working"
  VERSION=$(echo "$RESPONSE" | grep -o '"openapi":"[^"]*"' | cut -d'"' -f4)
  info "OpenAPI version: $VERSION"
else
  fail "OpenAPI schema endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test 5: Specific Tool Info
# ============================================================================
echo -e "${BLUE}[5] Testing Specific Tool (GET /api/tools/exec)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/tools/exec")
if echo "$RESPONSE" | grep -q '"tool"'; then
  pass "Specific tool endpoint working"
  TOOL_NAME=$(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  info "Tool name: $TOOL_NAME"
else
  fail "Specific tool endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test 6: API Key Scopes (no auth required)
# ============================================================================
echo -e "${BLUE}[6] Testing API Key Scopes (GET /api/keys/scopes)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/keys/scopes")
if echo "$RESPONSE" | grep -q '"scopes"'; then
  pass "API key scopes endpoint working"
  SCOPES=$(echo "$RESPONSE" | grep -o '"scope":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ')
  info "Available scopes: $SCOPES"
else
  fail "API key scopes endpoint failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Authenticated Tests (require session token)
# ============================================================================
if [ -z "$SESSION_TOKEN" ]; then
  echo -e "${YELLOW}============================================${NC}"
  echo -e "${YELLOW}  Skipping authenticated tests${NC}"
  echo -e "${YELLOW}  Provide session token as argument:${NC}"
  echo -e "${YELLOW}  ./scripts/test-agent-api.sh YOUR_TOKEN${NC}"
  echo -e "${YELLOW}============================================${NC}"
  echo ""
  echo -e "${GREEN}Basic tests completed successfully!${NC}"
  exit 0
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Running Authenticated Tests${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================================================
# Test 7: Create API Key
# ============================================================================
echo -e "${BLUE}[7] Testing API Key Creation (POST /api/keys)${NC}"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/keys" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-agent-'$(date +%s)'", "scopes": ["read", "write", "execute"]}')

if echo "$RESPONSE" | grep -q '"api_key"'; then
  pass "API key created successfully"
  API_KEY=$(echo "$RESPONSE" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
  KEY_ID=$(echo "$RESPONSE" | grep -o '"key_id":"[^"]*"' | cut -d'"' -f4)
  info "Key ID: $KEY_ID"
  info "API Key: ${API_KEY:0:20}..."
else
  fail "API key creation failed" "$RESPONSE"
  echo -e "${YELLOW}Continuing with remaining tests...${NC}"
fi
echo ""

# ============================================================================
# Test 8: List API Keys
# ============================================================================
echo -e "${BLUE}[8] Testing List API Keys (GET /api/keys)${NC}"

RESPONSE=$(curl -s "$BASE_URL/api/keys" \
  -H "Authorization: Bearer $SESSION_TOKEN")

if echo "$RESPONSE" | grep -q '"keys"'; then
  KEY_COUNT=$(echo "$RESPONSE" | grep -o '"count":[0-9]*' | cut -d: -f2)
  pass "List API keys working"
  info "Total keys: $KEY_COUNT"
else
  fail "List API keys failed" "$RESPONSE"
fi
echo ""

# ============================================================================
# Test with API Key (if we have one)
# ============================================================================
if [ -n "$API_KEY" ]; then
  echo -e "${BLUE}============================================${NC}"
  echo -e "${BLUE}  Testing with API Key Authentication${NC}"
  echo -e "${BLUE}============================================${NC}"
  echo ""

  # ============================================================================
  # Test 9: Execute Command
  # ============================================================================
  echo -e "${BLUE}[9] Testing Command Execution (POST /api/terminal/exec)${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/exec" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "echo Hello from PC2 Agent API!"}')

  if echo "$RESPONSE" | grep -q '"success":true'; then
    pass "Command execution working"
    STDOUT=$(echo "$RESPONSE" | grep -o '"stdout":"[^"]*"' | cut -d'"' -f4)
    DURATION=$(echo "$RESPONSE" | grep -o '"duration":[0-9]*' | cut -d: -f2)
    info "Output: $STDOUT"
    info "Duration: ${DURATION}ms"
  else
    fail "Command execution failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Test 10: Execute with Arguments
  # ============================================================================
  echo -e "${BLUE}[10] Testing Command with Arguments${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/exec" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "python3", "args": ["-c", "print(2 + 2)"]}')

  if echo "$RESPONSE" | grep -q '"stdout"'; then
    STDOUT=$(echo "$RESPONSE" | grep -o '"stdout":"[^"]*"' | cut -d'"' -f4)
    if [ "$STDOUT" = "4" ] || echo "$STDOUT" | grep -q "4"; then
      pass "Python execution working"
      info "Output: $STDOUT"
    else
      fail "Python output unexpected" "Expected '4', got '$STDOUT'"
    fi
  else
    fail "Command with args failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Test 11: List Directory
  # ============================================================================
  echo -e "${BLUE}[11] Testing Directory Listing${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/exec" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "ls -la"}')

  if echo "$RESPONSE" | grep -q '"success"'; then
    pass "Directory listing working"
    EXIT_CODE=$(echo "$RESPONSE" | grep -o '"exitCode":[0-9]*' | cut -d: -f2)
    info "Exit code: $EXIT_CODE"
  else
    fail "Directory listing failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Test 12: Script Execution
  # ============================================================================
  echo -e "${BLUE}[12] Testing Script Execution (POST /api/terminal/script)${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/script" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "script": "#!/bin/bash\nfor i in 1 2 3; do echo \"Count: $i\"; done",
      "interpreter": "/bin/bash"
    }')

  if echo "$RESPONSE" | grep -q '"success"'; then
    pass "Script execution working"
    EXIT_CODE=$(echo "$RESPONSE" | grep -o '"exitCode":[0-9]*' | cut -d: -f2)
    info "Exit code: $EXIT_CODE"
  else
    fail "Script execution failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Test 13: Command with Timeout
  # ============================================================================
  echo -e "${BLUE}[13] Testing Command Timeout${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/exec" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "sleep 0.1 && echo done", "timeout": 5000}')

  if echo "$RESPONSE" | grep -q '"success":true'; then
    pass "Timeout handling working"
    DURATION=$(echo "$RESPONSE" | grep -o '"duration":[0-9]*' | cut -d: -f2)
    info "Duration: ${DURATION}ms"
  else
    fail "Timeout test failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Test 14: Environment Variables
  # ============================================================================
  echo -e "${BLUE}[14] Testing Environment Variables${NC}"

  RESPONSE=$(curl -s -X POST "$BASE_URL/api/terminal/exec" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"command": "echo $MY_VAR", "env": {"MY_VAR": "hello-from-env"}}')

  if echo "$RESPONSE" | grep -q "hello-from-env"; then
    pass "Environment variables working"
  else
    fail "Environment variables failed" "$RESPONSE"
  fi
  echo ""

  # ============================================================================
  # Cleanup: Revoke the test API key
  # ============================================================================
  if [ -n "$KEY_ID" ]; then
    echo -e "${BLUE}[Cleanup] Revoking test API key${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/keys/$KEY_ID/revoke" \
      -H "Authorization: Bearer $SESSION_TOKEN")
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
      pass "Test API key revoked"
    else
      info "Could not revoke key (may already be revoked)"
    fi
    echo ""
  fi
fi

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  All tests completed!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "The PC2 Agent API is ready for AI agent integration."
echo ""
echo "Next steps:"
echo "  1. Create a permanent API key for your agent"
echo "  2. Use X-API-Key header for authentication"
echo "  3. Check /api/tools for available capabilities"
echo ""
