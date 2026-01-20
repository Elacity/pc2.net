# Firecracker Integration Proof-of-Concept

## Overview

This document outlines the integration of [Firecracker microVMs](https://firecracker-microvm.github.io/) into PC2 Node for secure, hardware-isolated agent sandboxing. Firecracker provides lightweight virtual machines with minimal overhead, ideal for running untrusted AI agent code.

## Why Firecracker for PC2?

### Current Isolation Hierarchy

```
Level 0: None (single-user mode)
  └── No isolation, direct PTY access
  
Level 1: Namespace (bubblewrap)
  └── Linux namespaces (user, net, mount, pid, ipc, uts)
  └── chroot-like filesystem isolation
  └── Resource limits via cgroups
  
Level 2: Firecracker microVM (NEW)
  └── Full hardware virtualization via KVM
  └── Separate kernel instance
  └── Memory and CPU hardware isolation
  └── Network namespace with virtual NICs
  └── Storage via block devices
```

### Benefits for PC2

1. **Agent Sandboxing**: Run AI agents (Claude Code, GPT-4, etc.) with full isolation
2. **WASM/dDRM Execution**: Secure execution of decentralized content
3. **Multi-Tenant Safety**: Hardware-level isolation between users
4. **Rapid Boot**: ~125ms boot time for microVMs
5. **Low Overhead**: Minimal memory footprint (~5MB per VM)
6. **Security**: Each VM has its own kernel - bugs/exploits are contained

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PC2 Node Server                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  Terminal API   │  │   Agent API     │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│  ┌────────▼────────────────────▼────────┐                  │
│  │         Sandbox Manager              │                  │
│  │  (selects isolation level)           │                  │
│  └────────┬─────────┬──────────┬────────┘                  │
│           │         │          │                            │
│  ┌────────▼───┐ ┌───▼────┐ ┌───▼──────────┐                │
│  │ Direct PTY │ │ Bwrap  │ │ Firecracker  │                │
│  │ (Level 0)  │ │(Lvl 1) │ │  (Level 2)   │                │
│  └────────────┘ └────────┘ └──────┬───────┘                │
│                                   │                         │
│  ┌────────────────────────────────▼─────────────────────┐  │
│  │              Firecracker VMM Process                 │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │              microVM (Agent Sandbox)           │  │  │
│  │  │  ┌─────────────┐  ┌─────────────────────────┐  │  │  │
│  │  │  │ Linux Kernel│  │     User Workspace      │  │  │  │
│  │  │  │  (minimal)  │  │  /home/agent (9p mount) │  │  │  │
│  │  │  └─────────────┘  └─────────────────────────┘  │  │  │
│  │  │  ┌─────────────┐  ┌─────────────────────────┐  │  │  │
│  │  │  │ virtio-net  │  │    Agent Process       │  │  │  │
│  │  │  │   (tap0)    │  │  (Claude Code, etc.)   │  │  │  │
│  │  │  └─────────────┘  └─────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Host Requirements

1. **Linux with KVM**: `/dev/kvm` must be accessible
2. **Firecracker Binary**: Download from [releases](https://github.com/firecracker-microvm/firecracker/releases)
3. **jailer Binary**: Optional but recommended for additional isolation
4. **Root Filesystem**: Alpine or Ubuntu-based minimal rootfs
5. **Kernel Image**: Minimal Linux kernel (5.10+ recommended)

### Check KVM Availability

```bash
# Check if KVM is available
ls -la /dev/kvm

# Check if current user can access KVM
[ -w /dev/kvm ] && echo "KVM accessible" || echo "Need permissions"
```

## Configuration

### SandboxConfig Interface

```typescript
interface FirecrackerConfig {
  // Enable Firecracker isolation (requires KVM)
  enabled: boolean;
  
  // Path to Firecracker binary
  binaryPath: string;
  
  // Path to jailer binary (optional, for additional isolation)
  jailerPath?: string;
  
  // Path to kernel image
  kernelPath: string;
  
  // Path to root filesystem image
  rootfsPath: string;
  
  // VM resource limits
  vcpuCount: number;      // Default: 1
  memSizeMib: number;     // Default: 512
  
  // Network configuration
  enableNetwork: boolean;
  networkInterface?: string;  // Host TAP interface
  
  // Storage configuration
  userDataPath: string;   // Path to user data directory (9p mount)
  
  // Timeouts
  bootTimeoutMs: number;  // Default: 5000
  idleTimeoutMs: number;  // Default: 1800000 (30 min)
}
```

### Example Node Configuration

```yaml
# config.yaml
sandbox:
  # Default isolation level for new sessions
  defaultLevel: namespace  # none | namespace | firecracker
  
  # Firecracker configuration
  firecracker:
    enabled: true
    binaryPath: /usr/local/bin/firecracker
    jailerPath: /usr/local/bin/jailer
    kernelPath: /var/lib/pc2/firecracker/vmlinux
    rootfsPath: /var/lib/pc2/firecracker/rootfs.ext4
    
    # Resource limits per VM
    vcpuCount: 1
    memSizeMib: 512
    
    # Network (disabled by default for security)
    enableNetwork: false
    
    # Timeouts
    bootTimeoutMs: 5000
    idleTimeoutMs: 1800000
  
  # Resource limits (applies to all levels)
  limits:
    memoryMB: 512
    cpuShares: 512
    maxProcesses: 100
    maxFDs: 1024
```

## API Design

### Enhanced Terminal/Exec API

```typescript
// POST /api/sandbox/exec
interface SandboxExecRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  
  // Sandbox options
  sandbox?: {
    level: 'none' | 'namespace' | 'firecracker';
    persistent?: boolean;  // Keep VM alive between calls
  };
}

interface SandboxExecResponse {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  
  // Sandbox info
  sandbox: {
    level: string;
    vmId?: string;       // For Firecracker
    bootTime?: number;   // VM boot time in ms
  };
}
```

### VM Lifecycle API

```typescript
// POST /api/sandbox/vm/create
interface CreateVMRequest {
  walletAddress: string;
  vcpuCount?: number;
  memSizeMib?: number;
  enableNetwork?: boolean;
}

interface CreateVMResponse {
  vmId: string;
  status: 'booting' | 'ready' | 'error';
  bootTime?: number;
  consoleSocket?: string;
}

// DELETE /api/sandbox/vm/:vmId
// Terminate a running VM

// GET /api/sandbox/vm/:vmId/status
// Get VM status and resource usage
```

## Implementation Plan

### Phase 1: Foundation (Current)
- [x] Bubblewrap namespace isolation
- [x] Resource limits via cgroups/systemd-run
- [x] API key authentication for agents
- [x] Tool registry for agent discovery

### Phase 2: Firecracker Integration
- [ ] Firecracker binary detection and initialization
- [ ] VM lifecycle management (create, start, stop, destroy)
- [ ] Root filesystem preparation
- [ ] Kernel image management

### Phase 3: Agent Integration
- [ ] 9p filesystem passthrough for user data
- [ ] virtio-net configuration for network access
- [ ] Agent-specific VM templates (Claude Code, etc.)
- [ ] Persistent VM sessions for interactive use

### Phase 4: Production Hardening
- [ ] jailer integration for additional isolation
- [ ] Rate limiting and quota management
- [ ] Metrics and monitoring
- [ ] VM pool for faster startup

## Usage Examples

### Running an Agent in Firecracker

```bash
# Create API key with execute scope
curl -X POST http://localhost:4200/api/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "claude-agent", "scopes": ["read", "write", "execute"]}'

# Execute command in Firecracker sandbox
curl -X POST http://localhost:4200/api/sandbox/exec \
  -H "X-API-Key: pc2_..." \
  -H "Content-Type: application/json" \
  -d '{
    "command": "python3",
    "args": ["-c", "import os; print(os.listdir())"],
    "sandbox": {
      "level": "firecracker",
      "persistent": true
    }
  }'
```

### Claude Code Integration

```json
{
  "mcp": {
    "servers": {
      "pc2-sandbox": {
        "url": "http://localhost:4200/api/tools/openapi",
        "auth": {
          "type": "header",
          "name": "X-API-Key",
          "value": "${PC2_API_KEY}"
        },
        "sandbox": {
          "level": "firecracker"
        }
      }
    }
  }
}
```

## Security Considerations

### Attack Surface

| Component | Bubblewrap | Firecracker |
|-----------|------------|-------------|
| Kernel | Shared (host) | Isolated (guest) |
| Filesystem | Namespaced | Virtualized |
| Network | Namespaced | Virtualized (TAP) |
| Memory | Shared (cgroups) | Hardware isolated |
| CPU | Shared (cgroups) | Hardware isolated |
| Escape Risk | Kernel exploits | Hypervisor exploits |

### Firecracker Security Model

1. **seccomp filtering**: VMM has minimal syscall allowlist
2. **jailer**: Additional namespace and chroot isolation for VMM
3. **KVM isolation**: Each VM has separate address space
4. **No disk passthrough**: Only block devices (no direct disk access)

### Recommendations

1. **Use jailer**: Always run Firecracker through jailer in production
2. **Disable network by default**: Enable only when required
3. **Read-only rootfs**: Mount rootfs read-only, use overlayfs for changes
4. **Time-limited VMs**: Auto-terminate idle VMs after timeout
5. **Resource quotas**: Enforce per-user VM limits

## Files Structure

```
pc2-node/
├── src/
│   └── services/
│       └── sandbox/
│           ├── SandboxManager.ts      # Unified sandbox management
│           ├── FirecrackerVM.ts       # Firecracker VM lifecycle
│           ├── VMPool.ts              # Pre-warmed VM pool
│           └── FIRECRACKER_POC.md     # This document
├── firecracker/
│   ├── kernel/
│   │   └── vmlinux                    # Minimal Linux kernel
│   ├── rootfs/
│   │   └── rootfs.ext4                # Root filesystem image
│   └── configs/
│       └── vm-config.json             # VM configuration template
```

## Next Steps

1. **Test Environment**: Set up KVM-enabled server for testing
2. **Kernel Build**: Create minimal kernel with required features
3. **Rootfs Image**: Build Alpine-based rootfs with tools
4. **Integration**: Implement SandboxManager with Firecracker support
5. **Testing**: Validate isolation with adversarial tests

## References

- [Firecracker GitHub](https://github.com/firecracker-microvm/firecracker)
- [Firecracker Getting Started](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md)
- [Production Host Setup](https://github.com/firecracker-microvm/firecracker/blob/main/docs/prod-host-setup.md)
- [jailer Documentation](https://github.com/firecracker-microvm/firecracker/blob/main/docs/jailer.md)
