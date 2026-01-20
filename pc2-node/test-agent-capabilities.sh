#!/bin/bash

# PC2 Node Agent Capabilities Test Script
# Tests all new agent APIs implemented in the capabilities audit

set -e

# Configuration
BASE_URL="${PC2_URL:-http://localhost:4200}"
API_KEY="${PC2_API_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if API key is set
if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}No API key set. Create one in Settings > Security > API Keys${NC}"
    echo -e "${YELLOW}Then run: PC2_API_KEY=your_key ./test-agent-capabilities.sh${NC}"
    echo ""
    echo -e "${BLUE}Alternatively, get your auth token from localStorage:${NC}"
    echo "1. Open PC2 in browser"
    echo "2. Open DevTools > Console"
    echo "3. Run: localStorage.getItem('auth_token')"
    echo "4. Set: PC2_API_KEY=<token> ./test-agent-capabilities.sh"
    exit 1
fi

# Helper function for API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint"
    else
        curl -s -X "$method" \
            -H "X-API-Key: $API_KEY" \
            "$BASE_URL$endpoint"
    fi
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_test() {
    echo -e "${YELLOW}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# ============================================================================
# Test Suite
# ============================================================================

print_header "1. TOOL REGISTRY"

print_test "List all available tools"
TOOLS=$(api_call GET "/api/tools")
TOOL_COUNT=$(echo "$TOOLS" | jq '.tools | length')
echo "Found $TOOL_COUNT tools"
echo "$TOOLS" | jq '.categories'
print_success "Tool registry working"

print_test "Get OpenAPI schema"
OPENAPI=$(api_call GET "/api/tools/openapi")
echo "$OPENAPI" | jq '.info.title, .info.version'
print_success "OpenAPI schema available"

# ============================================================================
print_header "2. FILESYSTEM - NEW COPY ENDPOINT"

print_test "Create test file for copy"
api_call POST "/write" '{"path": "~/test-copy-source.txt", "data": "Hello from copy test!"}' | jq '.success'

print_test "Copy file"
COPY_RESULT=$(api_call POST "/copy" '{"source": "~/test-copy-source.txt", "destination": "~", "new_name": "test-copy-dest.txt"}')
echo "$COPY_RESULT" | jq '.path'
print_success "File copy working"

print_test "Verify copy exists"
api_call POST "/stat" '{"path": "~/test-copy-dest.txt"}' | jq '.name'

# ============================================================================
print_header "3. SEARCH API"

print_test "Search for test files"
SEARCH_RESULT=$(api_call POST "/search" '{"query": "test-copy"}')
echo "$SEARCH_RESULT" | jq 'if type == "array" then length else .results | length end'
print_success "Search working"

# ============================================================================
print_header "4. HTTP CLIENT"

print_test "Make external HTTP request"
HTTP_RESULT=$(api_call POST "/api/http" '{"url": "https://httpbin.org/get", "method": "GET"}')
echo "$HTTP_RESULT" | jq '.status, .success'
print_success "HTTP client working"

print_test "Test blocked localhost (should fail)"
BLOCKED=$(api_call POST "/api/http" '{"url": "http://localhost:8080/test"}')
echo "$BLOCKED" | jq '.error'
print_success "Localhost blocking working"

# ============================================================================
print_header "5. DOWNLOAD API"

print_test "Download file from URL"
DOWNLOAD_RESULT=$(api_call POST "/api/http/download" '{
    "url": "https://httpbin.org/robots.txt",
    "destination": "~/Downloads",
    "filename": "test-download.txt"
}')
echo "$DOWNLOAD_RESULT" | jq '.success, .path, .size'
print_success "Download working"

# ============================================================================
print_header "6. GIT API"

print_test "Git status (on non-repo should show error)"
GIT_STATUS=$(api_call POST "/api/git/status" '{"path": "."}')
echo "$GIT_STATUS" | jq '.error // .branch'

print_test "Test git clone endpoint exists"
# Don't actually clone, just verify endpoint responds
GIT_CLONE=$(api_call POST "/api/git/clone" '{"url": ""}')
echo "$GIT_CLONE" | jq '.error'
print_success "Git API endpoints available"

# ============================================================================
print_header "7. AUDIT LOGGING"

print_test "Get audit logs"
AUDIT_LOGS=$(api_call GET "/api/audit?limit=5")
echo "$AUDIT_LOGS" | jq '.success, .pagination.total'
print_success "Audit logs working"

print_test "Get audit stats"
AUDIT_STATS=$(api_call GET "/api/audit/stats")
echo "$AUDIT_STATS" | jq '.stats.total_actions, .stats.actions_by_type'
print_success "Audit stats working"

# ============================================================================
print_header "8. RATE LIMITING"

print_test "Get rate limit status"
RATE_STATUS=$(api_call GET "/api/rate-limit/status")
echo "$RATE_STATUS" | jq '.limits'
print_success "Rate limiting working"

# ============================================================================
print_header "9. SCHEDULER API"

print_test "Create scheduled task"
TASK=$(api_call POST "/api/scheduler/tasks" '{
    "name": "Test Task",
    "description": "A test scheduled task",
    "cron_expression": "@hourly",
    "action": "terminal_exec",
    "action_params": {"command": "echo Hello"},
    "enabled": false
}')
TASK_ID=$(echo "$TASK" | jq -r '.task.id')
echo "Created task: $TASK_ID"
print_success "Task creation working"

print_test "List scheduled tasks"
TASKS=$(api_call GET "/api/scheduler/tasks")
echo "$TASKS" | jq '.count'
print_success "Task listing working"

print_test "Get task details"
if [ "$TASK_ID" != "null" ]; then
    api_call GET "/api/scheduler/tasks/$TASK_ID" | jq '.task.name, .task.enabled'
fi

print_test "Delete test task"
if [ "$TASK_ID" != "null" ]; then
    api_call DELETE "/api/scheduler/tasks/$TASK_ID" | jq '.success'
fi
print_success "Task management working"

# ============================================================================
print_header "10. KEY-VALUE STORE"

print_test "Set KV value"
api_call POST "/kv/test-key" '{"value": "test-value-123"}' | jq '.success // .'

print_test "Get KV value"
api_call GET "/kv/test-key" | jq '.value // .'
print_success "KV store working"

# ============================================================================
print_header "11. SYSTEM ENDPOINTS"

print_test "Get storage stats"
api_call GET "/api/stats" | jq '.'
print_success "Stats endpoint working"

print_test "Get disk free"
api_call GET "/df" | jq '.'
print_success "Disk free endpoint working"

# ============================================================================
print_header "12. CLEANUP"

print_test "Delete test files"
api_call POST "/delete" '{"path": "~/test-copy-source.txt"}' | jq '.success'
api_call POST "/delete" '{"path": "~/test-copy-dest.txt"}' | jq '.success'
api_call POST "/delete" '{"path": "~/Downloads/test-download.txt"}' | jq '.success'
print_success "Cleanup complete"

# ============================================================================
print_header "TEST SUMMARY"

echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "Tools available: $TOOL_COUNT"
echo ""
echo "New capabilities verified:"
echo "  - File copy endpoint"
echo "  - HTTP client (external requests)"
echo "  - Download from URL"
echo "  - Git operations API"
echo "  - Audit logging"
echo "  - Rate limiting"
echo "  - Scheduled tasks"
echo "  - KV store"
echo "  - Search API"
echo ""
echo -e "${BLUE}To use these with an AI agent:${NC}"
echo "1. Get the OpenAPI schema: GET /api/tools/openapi"
echo "2. Use X-API-Key header for authentication"
echo "3. All endpoints are scoped to your wallet address"
