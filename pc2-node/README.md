# PC2 Node - Production Package

**Self-hosted personal cloud with ElastOS frontend built-in**

## Overview

PC2 Node is a production-ready package that combines the ElastOS frontend with a PC2 backend, creating a self-contained personal cloud solution that users can install on their own hardware.

## Features

- ✅ **Built-in Frontend**: ElastOS UI served from the same process
- ✅ **Persistent Storage**: SQLite database + IPFS for file storage
- ✅ **Real-time Updates**: WebSocket support via Socket.io
- ✅ **Wallet Authentication**: Particle Auth integration
- ✅ **Owner Verification**: Secure wallet-based ownership
- ✅ **Single Process**: Everything runs in one Node.js process

## Quick Start

### Prerequisites

- Node.js 20.18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Build frontend and backend
npm run build

# Start the server
npm start
```

The server will start on `http://localhost:4200`

### Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev
```

## Project Structure

```
pc2-node/
├── src/                    # TypeScript source code
│   ├── api/               # API endpoints
│   ├── storage/           # Storage layer (IPFS, SQLite)
│   ├── auth/             # Authentication
│   ├── websocket/         # WebSocket server
│   ├── config/           # Configuration loader
│   ├── server.ts         # Main HTTP server
│   ├── static.ts         # Static file serving
│   └── index.ts          # Entry point
├── frontend/              # Built ElastOS frontend (copied from src/gui/dist)
├── data/                  # Runtime data
│   ├── pc2.db           # SQLite database
│   └── ipfs/            # IPFS repository
├── config/                # Configuration files
│   └── default.json      # Default configuration
└── dist/                  # Compiled JavaScript (build output)
```

## Build Process

The build process:

1. **Frontend Build**: Builds ElastOS frontend from `../src/gui/`
2. **Copy Frontend**: Copies built files to `frontend/` directory
3. **Backend Build**: Compiles TypeScript to `dist/` directory

```bash
npm run build              # Build both frontend and backend
npm run build:frontend     # Build only frontend
npm run build:backend     # Build only backend
```

## Configuration

Configuration is loaded from `config/config.json` (user-specific) with defaults from `config/default.json`.

Key configuration options:

- `server.port`: HTTP server port (default: 4200)
- `owner.wallet_address`: Owner wallet address (set during setup)
- `storage.ipfs_repo_path`: Path to IPFS repository
- `storage.database_path`: Path to SQLite database

## Development Workflow

### Making Frontend Changes

1. Edit files in `../src/gui/`
2. Rebuild: `cd ../src/gui && npm run build`
3. Or use the integrated build: `npm run build:frontend`
4. Restart server: `npm start`

### Making Backend Changes

1. Edit TypeScript files in `src/`
2. Rebuild: `npm run build:backend`
3. Or use watch mode: `npm run dev`
4. Server auto-restarts on changes

## API Endpoints

### Public Endpoints
- `GET /health` - Health check (database, IPFS, WebSocket status)
- `GET /version` - Server version
- `POST /auth/particle` - Particle Auth authentication

### Authenticated Endpoints
- `GET /whoami` - Get current user info
- `GET /os/user` - Alias for /whoami
- `GET /stat` - Get file/folder metadata
- `POST /readdir` - List directory contents
- `GET /read` - Read file content
- `POST /write` - Write/create file
- `POST /mkdir` - Create directory
- `POST /delete` - Delete files/directories
- `POST /move` - Move/rename files
- `POST /sign` - Sign files for app access
- `GET/POST/DELETE /kv/:key` - Key-value store
- `POST /rao` - Record app open
- `POST /contactUs` - Contact form

### Frontend
- `GET /*` - Frontend SPA (serves index.html)

## Testing

Run the comprehensive test suite:

```bash
npm test
```

This tests all API endpoints, filesystem operations, authentication, and security features.

See [docs/TESTING.md](docs/TESTING.md) for detailed testing information.

## API Documentation

Complete API documentation is available in [docs/API.md](docs/API.md).

## Status

**Phase 2 - Complete ✅**

- [x] Package structure
- [x] Build process
- [x] Static file serving (production-ready)
- [x] SQLite database
- [x] IPFS integration
- [x] Owner wallet verification
- [x] WebSocket real-time updates
- [x] API endpoints extraction
- [x] Main server integration
- [x] Logging system
- [x] Testing & validation
- [x] API documentation

## License

AGPL-3.0

