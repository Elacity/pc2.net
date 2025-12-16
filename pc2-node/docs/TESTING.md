# PC2 Node Testing Guide

## Overview

PC2 Node includes comprehensive system integration tests that validate all major components and API endpoints.

## Running Tests

### Quick Test

```bash
npm test
```

This will:
1. Build the backend TypeScript code
2. Start a test server on port 4201
3. Run all integration tests
4. Clean up test data
5. Report results

### Test Coverage

The test suite covers:

#### ✅ Core Functionality
- Health check endpoint
- Version endpoint
- Authentication flow
- User information retrieval

#### ✅ Filesystem Operations
- Directory creation
- File writing
- File reading
- Directory listing
- File metadata (stat)
- File moving/renaming
- File deletion

#### ✅ Security
- Unauthorized access blocking
- Invalid token rejection
- Owner wallet verification

#### ✅ Additional Features
- Key-value store operations
- File signing for app access

## Test Structure

Tests are located in `scripts/test-system.js` and follow this pattern:

1. **Setup**: Initialize database, IPFS, and server
2. **Execution**: Run individual test cases
3. **Validation**: Check responses and state
4. **Cleanup**: Remove test data and stop server

## Manual Testing

### 1. Start the Server

```bash
npm start
```

Server will start on `http://localhost:4200`

### 2. Test Health Check

```bash
curl http://localhost:4200/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "...",
  "database": "connected",
  "ipfs": "available",
  "websocket": "active",
  "owner": {
    "set": false,
    "tethered_wallets": 0
  }
}
```

### 3. Test Authentication

```bash
curl -X POST http://localhost:4200/auth/particle \
  -H "Content-Type: application/json" \
  -d '{"wallet_address": "0x1234567890123456789012345678901234567890"}'
```

Save the `token` from the response.

### 4. Test File Operations

```bash
# Create directory
curl -X POST http://localhost:4200/mkdir \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"path": "/test"}'

# Write file
curl -X POST http://localhost:4200/write \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"path": "/test/file.txt", "content": "Hello, PC2!"}'

# Read file
curl http://localhost:4200/read?path=/test/file.txt \
  -H "Authorization: Bearer YOUR_TOKEN"

# List directory
curl -X POST http://localhost:4200/readdir \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"path": "/test"}'
```

## Test Data

Test data is stored in:
- Database: `data/test-pc2.db` (automatically cleaned up)
- IPFS: `data/test-ipfs/` (automatically cleaned up)

**Note**: Test data is isolated from production data and is automatically removed after tests complete.

## Continuous Integration

For CI/CD pipelines, run:

```bash
npm test
```

Exit code 0 indicates all tests passed, exit code 1 indicates failures.

## Performance Testing

### File Upload Performance

Test large file uploads:

```bash
# Create a test file
dd if=/dev/zero of=test-large.bin bs=1M count=100

# Upload via API
curl -X POST http://localhost:4200/write \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @- <<EOF
{
  "path": "/test-large.bin",
  "content": "$(base64 test-large.bin)",
  "encoding": "base64"
}
EOF
```

### Concurrent Requests

Test concurrent access:

```bash
# Run multiple requests in parallel
for i in {1..10}; do
  curl http://localhost:4200/health &
done
wait
```

## Troubleshooting

### Tests Fail with "Port Already in Use"

If port 4201 is already in use:
1. Stop any running PC2 Node instances
2. Check for processes: `lsof -i :4201`
3. Kill process if needed: `kill -9 <PID>`

### IPFS Initialization Fails

If IPFS fails to initialize:
- Check disk space: `df -h`
- Check permissions on `data/test-ipfs/`
- Review IPFS logs in test output

### Database Locked

If database is locked:
- Ensure no other processes are accessing the test database
- Check for stale lock files: `ls -la data/test-pc2.db*`

## Test Results

Test results are displayed in the console:

```
🧪 Starting PC2 Node System Tests

ℹ️  Initializing test components...
✅ IPFS initialized
ℹ️  Test server started on port 4201

📋 Running Tests

✅ Health check endpoint
✅ Version endpoint
✅ Authentication - first wallet becomes owner
✅ Whoami endpoint
✅ Create directory
✅ Write file
✅ Read file
✅ List directory
✅ Stat file
✅ Move file
✅ Delete file
✅ Key-value store
✅ Sign files
✅ Unauthorized access blocked
✅ Invalid token rejected

📊 Test Results

✅ Passed: 15
❌ Failed: 0
```

## Next Steps

After tests pass:
1. Review test output for any warnings
2. Check server logs for errors
3. Verify data persistence (restart server, check data)
4. Test WebSocket connections manually
5. Test with real frontend application

