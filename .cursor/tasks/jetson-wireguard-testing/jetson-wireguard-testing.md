# Task: Jetson WireGuard Testing

**Task ID**: jetson-wireguard-testing
**Created**: 2026-02-20
**Status**: Proposed
**Priority**: High

## Description

Test the WireGuard userspace fallback (wireguard-go) on actual Jetson hardware. The code has been written, verified via code trace, and the non-Jetson path has been confirmed working on a real VPS (38.242.211.112). The Jetson-specific path still needs hardware validation.

## Background

NVIDIA Jetson ships a custom kernel that does NOT include the WireGuard module. Our setup script now:
1. Detects Jetson via `/etc/nv_tegra_release`
2. Installs `wireguard-tools` (userspace tools only)
3. Attempts to install `wireguard-go` (userspace WireGuard implementation)
4. Falls back gracefully to Boson relay if nothing works

The node's `WireGuardService` detects the mode (`kernel` vs `userspace` vs `none`) and passes `WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go` through `sudo -E` when in userspace mode.

Community reference: EverlastingOS confirmed Jetson requires manual kernel module compilation.
See: https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson

## Test Checklist

### Prerequisites
- [ ] Fresh Jetson device (or one where you can temporarily test)
- [ ] Internet connection
- [ ] Branch: `feature/jetson-gpu-acceleration`

### Test 1: Setup Script (Fresh Jetson, no kernel module)

```bash
cd ~/pc2.net
git checkout feature/jetson-gpu-acceleration
git pull origin feature/jetson-gpu-acceleration
sudo bash scripts/setup-node.sh
```

**Expected output:**
- [ ] "Platform: NVIDIA Jetson (JetPack X.X.X)"
- [ ] "NVIDIA Jetson detected -- installing tools only (custom kernel)"
- [ ] "Jetson custom kernel does not include WireGuard module"
- [ ] "Installing wireguard-go (userspace WireGuard)..." (attempts apt, then Go build)
- [ ] "WireGuard will use userspace mode (wireguard-go)" OR fallback message
- [ ] "Sudoers rule configured: passwordless wg-quick for all users"
- [ ] Final: "WireGuard (userspace/wireguard-go) is ready." OR "WireGuard is NOT available."

**Verify after setup:**
```bash
which wg && which wg-quick        # Should find both
which wireguard-go                 # Should find it (if install succeeded)
cat /etc/sudoers.d/pc2-wireguard   # Should contain SETENV
lsmod | grep wireguard             # Should NOT find anything (no kernel module)
```

### Test 2: Node Startup + WireGuard Tunnel

```bash
cd ~/pc2.net/pc2-node
npm run build
pm2 start ecosystem.config.cjs   # or pm2 restart all
```

Open http://localhost:4200, complete the setup wizard (register username).

**Check logs:**
```bash
pm2 logs pc2 --lines 50
```

**Expected log lines (if wireguard-go installed):**
- [ ] "[WireGuard] Kernel module unavailable, using wireguard-go (userspace)"
- [ ] "[WireGuard] Provisioning via https://69.164.241.210/api/wg/register..."
- [ ] "[WireGuard] Provisioned: 10.100.X.X via ..."
- [ ] "[WireGuard] Interface wg0 up (userspace mode): 10.100.X.X"
- [ ] "Connected via WireGuard tunnel (high-performance mode)"
- [ ] "Public URL: https://USERNAME.ela.city"

**Expected log lines (if wireguard-go NOT installed):**
- [ ] "[WireGuard] Neither kernel module nor wireguard-go available"
- [ ] Falls back to Boson Active Proxy
- [ ] Site still accessible but slower

### Test 3: Verify Site Access

```bash
curl -I https://USERNAME.ela.city/
```

- [ ] Returns HTTP 200
- [ ] Page loads in a browser from an external device

### Test 4: Check Status API

```bash
curl http://localhost:4200/api/status 2>/dev/null | python3 -m json.tool | grep -A5 wireguard
```

**Expected:**
```json
{
  "available": true,
  "mode": "userspace",
  "connected": true,
  "assignedIP": "10.100.X.X",
  ...
}
```

### Test 5: wireguard-go Build Failure Path (Optional)

If you want to test the fallback path where wireguard-go can't be installed:
```bash
# Temporarily hide wireguard-go
sudo mv /usr/local/bin/wireguard-go /usr/local/bin/wireguard-go.bak
pm2 restart all
pm2 logs pc2 --lines 30
```

- [ ] Node falls back to Boson Active Proxy
- [ ] Site still loads (slower)
- [ ] Restore: `sudo mv /usr/local/bin/wireguard-go.bak /usr/local/bin/wireguard-go`

### Test 6: Jetson with Compiled Kernel Module (EverlastingOS path)

For Jetsons that already have the kernel module compiled per the kinesis guide:

```bash
lsmod | grep wireguard   # Should show wireguard module
sudo bash scripts/setup-node.sh
```

- [ ] Setup detects "WireGuard kernel module already loaded"
- [ ] WG_MODE = kernel (best performance)
- [ ] Node logs: mode = "kernel" (not "userspace")

### Test 7: Large File Upload (100MB+)

- [ ] Upload a 100MB file through the UI
- [ ] Upload completes without crashing (was OOM before)
- [ ] File is accessible via IPFS CID

## Files Changed (This Session)

| File | Change |
|------|--------|
| `scripts/setup-node.sh` | Jetson detection, wireguard-go install, SETENV sudoers, WG_MODE fix |
| `pc2-node/src/services/wireguard/WireGuardService.ts` | Mode detection, wgQuickCmd with sudo -E, modinfo instead of modprobe |
| `pc2-node/src/services/wireguard/index.ts` | Export WireGuardMode type |

## Bugs Fixed (Verified by Code Trace, Untested on Jetson)

1. **sudo strips env vars** -- wireguard-go was never invoked because `WG_QUICK_USERSPACE_IMPLEMENTATION` was lost through sudo
2. **WG_MODE stays "kernel"** -- incorrect success message when both kernel and wireguard-go fail
3. **detectMode() uses sudo modprobe** -- not in sudoers, noisy errors. Replaced with modinfo.
4. **Old sudoers without SETENV** -- returning users get their sudoers regenerated

## VPS Test Results (Already Confirmed)

Tested on 38.242.211.112 (Ubuntu 20.04, kernel 5.4, x86_64):
- setup-node.sh: PASS (installed wireguard, loaded kernel module, configured sudoers)
- TypeScript build: PASS (zero errors)
- Node restart: PASS (clean startup, registered endpoint)
- Site access: PASS (HTTP 200 on test29.ela.city)
- Rollback to main: PASS

## Notes

- wireguard-go build requires Go compiler (~200MB). The setup script tries to install it automatically.
- If Go isn't available and apt doesn't have wireguard-go, the node falls back to Boson (still works, just slower).
- For best performance on Jetson, users can optionally compile the kernel module: https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson
