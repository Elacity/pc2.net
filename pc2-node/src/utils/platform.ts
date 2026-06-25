/**
 * Platform Detection Utility
 * Detects hardware capabilities for AI inference optimization.
 * Identifies Jetson devices, CUDA availability, GPU info, and system memory.
 * Results are cached at module level (run once at startup).
 */

import os from 'os';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { logger } from './logger.js';

export interface PlatformInfo {
  platform: string;
  arch: string;
  isMacOS: boolean;
  isJetson: boolean;
  isConstrainedDevice: boolean;
  jetsonModel?: string;
  cudaAvailable: boolean;
  gpuInfo?: string;
  totalMemoryMB: number;
  estimatedAvailableVRAM?: number;
}

/**
 * Declarative platform requirement an app publishes in its manifest under
 * `requirements.platform`. Every present field is an allow-list (os/arch) or a
 * minimum (memory); an absent/empty field means "no constraint". A host is
 * compatible only if it satisfies EVERY present constraint.
 *
 * Example (Elastos Node Manager — Linux-only, needs a real node host):
 *   "requirements": { "platform": { "os": ["linux"], "minMemoryMB": 4096 } }
 * That allows Jetson/Raspberry Pi (linux/arm64) and Linux/x64 servers, and
 * blocks macOS / Windows desktops in the dApp Centre.
 */
export interface PlatformRequirement {
  /** Allowed `os.platform()` values, e.g. ['linux']. Absent = any OS. */
  os?: string[];
  /** Allowed `os.arch()` values, e.g. ['x64','arm64']. Absent = any arch. */
  arch?: string[];
  /** Minimum total RAM in MB. Absent = no minimum. */
  minMemoryMB?: number;
  /** Operator-facing reason shown when incompatible (overrides the generated text). */
  reason?: string;
}

/** Verdict for a (requirement, host) pair. */
export interface PlatformCompatibility {
  compatible: boolean;
  /** Short human reason when incompatible; undefined when compatible. */
  reason?: string;
}

/** Normalised host facts the compatibility check + dApp Centre UI consume. */
export interface HostPlatformSummary {
  os: string;        // os.platform(): 'linux' | 'darwin' | 'win32' | ...
  arch: string;      // os.arch(): 'x64' | 'arm64' | ...
  totalMemoryMB: number;
  isJetson: boolean;
  isConstrainedDevice: boolean;
  jetsonModel?: string;
}

const OS_LABELS: Record<string, string> = {
  linux: 'Linux',
  darwin: 'macOS',
  win32: 'Windows',
};

/**
 * Compact, UI-friendly view of the host for device-compatibility gating.
 * Backed by the cached detectPlatform() result.
 */
export function getHostPlatformSummary(): HostPlatformSummary {
  const info = detectPlatform();
  return {
    os: info.platform,
    arch: info.arch,
    totalMemoryMB: info.totalMemoryMB,
    isJetson: info.isJetson,
    isConstrainedDevice: info.isConstrainedDevice,
    jetsonModel: info.jetsonModel,
  };
}

/**
 * Pure compatibility check between a manifest's `requirements.platform` and a
 * host summary. Returns { compatible, reason }.
 *
 * IMPORTANT: the dApp Centre mirrors this logic in JS (isHostCompatible() in
 * src/backend/apps/app-center/index.html) for the client-side gate. Keep the
 * two implementations in sync — this server copy is the authoritative one and
 * is also enforced at install time as defense-in-depth.
 */
export function evaluatePlatformCompatibility(
  req: PlatformRequirement | undefined,
  host: HostPlatformSummary,
): PlatformCompatibility {
  if (!req) return { compatible: true };

  if (Array.isArray(req.os) && req.os.length > 0 && !req.os.includes(host.os)) {
    const want = req.os.map((o) => OS_LABELS[o] ?? o).join(' or ');
    const have = OS_LABELS[host.os] ?? host.os;
    return { compatible: false, reason: req.reason ?? `Requires ${want} (this device runs ${have})` };
  }
  if (Array.isArray(req.arch) && req.arch.length > 0 && !req.arch.includes(host.arch)) {
    return { compatible: false, reason: req.reason ?? `Requires ${req.arch.join(' or ')} CPU (this device is ${host.arch})` };
  }
  if (typeof req.minMemoryMB === 'number' && host.totalMemoryMB < req.minMemoryMB) {
    const needGB = (req.minMemoryMB / 1024).toFixed(1);
    const haveGB = (host.totalMemoryMB / 1024).toFixed(1);
    return { compatible: false, reason: req.reason ?? `Requires at least ${needGB} GB RAM (this device has ${haveGB} GB)` };
  }
  return { compatible: true };
}

/**
 * The minimum shape of a per-arch distribution variant the resolver needs.
 * The real type (with `size`) lives in AppInstallService.AppDistributionVariant;
 * this generic keeps platform.ts free of a service-layer import.
 */
export interface VariantLike {
  cid?: string | null;
  signature?: string | null;
}

/**
 * Select the per-arch capsule for `host` from a `distribution.variants` map.
 *
 * - Returns `null` when there are no variants (single-arch app; caller uses the
 *   top-level cid as-is).
 * - Returns `{ key, variant }` for the host's own `"<os>-<arch>"` key.
 * - THROWS when variants exist but none matches the host arch, or the matched
 *   variant is missing cid/signature — there is no usable capsule, so the
 *   install must fail closed rather than fetch a wrong-arch bundle.
 *
 * Pure (host is passed in) so it is unit-testable independent of the real host;
 * AppInstallService wraps it with getHostPlatformSummary() and the app name.
 */
export function resolveHostVariant<T extends VariantLike>(
  variants: Record<string, T> | undefined | null,
  host: HostPlatformSummary,
): { key: string; variant: T } | null {
  if (!variants || Object.keys(variants).length === 0) return null;
  const key = `${host.os}-${host.arch}`;
  const variant = variants[key];
  if (!variant) {
    throw new Error(
      `no capsule for this device's architecture (${key}); available: ${Object.keys(variants).join(', ') || 'none'}`,
    );
  }
  if (!variant.cid || !variant.signature) {
    throw new Error(`variant "${key}" is missing cid or signature`);
  }
  return { key, variant };
}

/** Hardware override config that users can set in config.json */
export interface OllamaHardwareConfig {
  autoDetect?: boolean;
  num_gpu?: number;
  num_ctx?: number;
  num_batch?: number;
  num_thread?: number;
}

// Module-level cache -- detect once, reuse forever
let cachedPlatformInfo: PlatformInfo | null = null;

/**
 * Detect Jetson device by checking Tegra-specific files.
 * Returns the Jetson model name or undefined if not a Jetson.
 */
function detectJetson(): { isJetson: boolean; jetsonModel?: string } {
  // Only possible on Linux aarch64
  if (os.platform() !== 'linux' || os.arch() !== 'arm64') {
    return { isJetson: false };
  }

  // Primary check: /etc/nv_tegra_release exists on all Jetson devices
  if (existsSync('/etc/nv_tegra_release')) {
    let jetsonModel: string | undefined;

    // Parse device tree for specific model name
    try {
      if (existsSync('/proc/device-tree/model')) {
        const raw = readFileSync('/proc/device-tree/model', 'utf-8').replace(/\0/g, '').trim();
        jetsonModel = raw;
      }
    } catch {
      // Fallback: try to parse nv_tegra_release for chip info
      try {
        const tegraRelease = readFileSync('/etc/nv_tegra_release', 'utf-8');
        if (tegraRelease.includes('t194')) jetsonModel = 'Jetson Xavier NX / AGX Xavier';
        else if (tegraRelease.includes('t234')) jetsonModel = 'Jetson Orin';
        else if (tegraRelease.includes('t210')) jetsonModel = 'Jetson Nano / TX1';
        else if (tegraRelease.includes('t186')) jetsonModel = 'Jetson TX2';
      } catch {
        // Cannot determine model
      }
    }

    return { isJetson: true, jetsonModel };
  }

  return { isJetson: false };
}

/**
 * Detect CUDA availability and GPU information.
 * Works for both Jetson (integrated GPU) and desktop NVIDIA GPUs.
 */
function detectCuda(): { cudaAvailable: boolean; gpuInfo?: string; discreteVRAM?: number } {
  const platform = os.platform();

  // macOS: Ollama handles Metal automatically -- do not report CUDA
  if (platform === 'darwin') {
    return { cudaAvailable: false };
  }

  // Windows: not currently supported for CUDA detection
  if (platform === 'win32') {
    return { cudaAvailable: false };
  }

  // Linux: check for nvidia-smi or CUDA toolkit
  try {
    const stdout = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (stdout) {
      const lines = stdout.split('\n');
      const firstLine = lines[0].trim();
      const parts = firstLine.split(',').map(s => s.trim());
      const gpuName = parts[0] || 'NVIDIA GPU';
      const vramMB = parseInt(parts[1], 10) || undefined;

      return {
        cudaAvailable: true,
        gpuInfo: gpuName,
        discreteVRAM: vramMB,
      };
    }
  } catch {
    // nvidia-smi not available -- try checking for CUDA toolkit directly
  }

  // Fallback: check if nvcc or CUDA libraries exist
  const cudaPaths = [
    '/usr/local/cuda/bin/nvcc',
    '/usr/bin/nvcc',
    '/usr/local/cuda/lib64/libcudart.so',
  ];

  for (const cudaPath of cudaPaths) {
    if (existsSync(cudaPath)) {
      return { cudaAvailable: true, gpuInfo: 'CUDA device (nvidia-smi unavailable)' };
    }
  }

  return { cudaAvailable: false };
}

/**
 * Main platform detection function.
 * Results are cached -- safe to call multiple times.
 */
export function detectPlatform(): PlatformInfo {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  const platform = os.platform();
  const arch = os.arch();
  const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));
  const isMacOS = platform === 'darwin';

  // Detect Jetson
  const { isJetson, jetsonModel } = detectJetson();

  // Detect CUDA and GPU
  const { cudaAvailable, gpuInfo, discreteVRAM } = detectCuda();

  // Estimate available VRAM
  let estimatedAvailableVRAM: number | undefined;
  if (isJetson) {
    // Jetson uses unified memory -- ~75% usable for GPU after OS overhead
    estimatedAvailableVRAM = Math.round(totalMemoryMB * 0.75);
  } else if (discreteVRAM) {
    // Discrete GPU -- use reported VRAM (leave ~500MB for GPU overhead)
    estimatedAvailableVRAM = Math.max(0, discreteVRAM - 500);
  }

  // A device is "constrained" if it's a Jetson, Raspberry Pi, or has < 8GB RAM
  const isConstrainedDevice = isJetson || totalMemoryMB < 8192;

  cachedPlatformInfo = {
    platform,
    arch,
    isMacOS,
    isJetson,
    isConstrainedDevice,
    jetsonModel,
    cudaAvailable,
    gpuInfo,
    totalMemoryMB,
    estimatedAvailableVRAM,
  };

  // Log detection results at startup
  logger.info('[Platform] Detection complete:', {
    platform,
    arch,
    totalMemoryMB,
    isMacOS,
    isJetson,
    jetsonModel,
    cudaAvailable,
    gpuInfo,
    estimatedAvailableVRAM,
    isConstrainedDevice,
  });

  return cachedPlatformInfo;
}

/**
 * Build optimized environment variables for Ollama server on constrained/GPU devices.
 * These are set when PC2 spawns `ollama serve`, NOT per-request.
 * On non-constrained/non-GPU devices, returns empty object (no changes).
 */
export function getOllamaServerEnv(): Record<string, string> {
  const info = detectPlatform();
  const env: Record<string, string> = {};

  // Flash attention: reduces memory and speeds up inference on NVIDIA GPUs
  // Safe on all CUDA devices, no downside
  if (info.cudaAvailable && !info.isMacOS) {
    env.OLLAMA_FLASH_ATTENTION = '1';
  }

  // KV cache quantization: halves KV cache memory with minimal quality loss
  // Critical for constrained devices -- the difference between fitting a model or not
  if (info.isConstrainedDevice && info.cudaAvailable) {
    env.OLLAMA_KV_CACHE_TYPE = 'q8_0';
  }

  // Max loaded models: prevent memory exhaustion from multiple models on constrained devices
  if (info.isConstrainedDevice) {
    env.OLLAMA_MAX_LOADED_MODELS = '1';
  }

  if (Object.keys(env).length > 0) {
    logger.info('[Platform] Ollama server environment optimizations:', env);
  }

  return env;
}

/** Jetson diagnostic info for system health and optimization guidance */
export interface JetsonDiagnostics {
  powerMode?: string;
  powerModeId?: number;
  clocksMaxed: boolean;
  swapType: 'zram' | 'disk' | 'both' | 'none';
  swapTotalMB: number;
  desktopGuiRunning: boolean;
  recommendations: string[];
}

/**
 * Run Jetson-specific diagnostics: power mode, clock speed, swap config, GUI status.
 * Returns null on non-Jetson devices.
 */
export function getJetsonDiagnostics(): JetsonDiagnostics | null {
  const info = detectPlatform();
  if (!info.isJetson) return null;

  const recommendations: string[] = [];

  // Check power mode via nvpmodel
  let powerMode: string | undefined;
  let powerModeId: number | undefined;
  try {
    const stdout = execSync('nvpmodel -q 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    // Output like: "NV Power Mode: MAXN" or "NV Power Mode: 15W"
    const modeMatch = stdout.match(/NV Power Mode:\s*(.+)/i);
    if (modeMatch) {
      powerMode = modeMatch[1].trim();
    }
    const idMatch = stdout.match(/(\d+)/);
    if (idMatch) {
      powerModeId = parseInt(idMatch[1], 10);
    }
    // MAXN mode is typically ID 0 -- recommend if not set
    if (powerModeId !== undefined && powerModeId !== 0) {
      recommendations.push('Run "sudo nvpmodel -m 0" to enable MAXN performance mode for fastest AI inference');
    }
  } catch {
    // nvpmodel not available
  }

  // Check if jetson_clocks has been run (clocks at max frequency)
  let clocksMaxed = false;
  try {
    const stdout = execSync('jetson_clocks --show 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    // If GPU and CPU are at max, clocks are maxed
    clocksMaxed = stdout.includes('Max') || !stdout.includes('scaling_governor: schedutil');
    if (!clocksMaxed) {
      recommendations.push('Run "sudo jetson_clocks" to lock CPU/GPU frequencies to maximum for consistent AI performance');
    }
  } catch {
    // jetson_clocks not available
  }

  // Check swap configuration
  let swapType: 'zram' | 'disk' | 'both' | 'none' = 'none';
  let swapTotalMB = 0;
  try {
    const stdout = execSync('swapon --show=NAME,SIZE,TYPE --noheadings 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    const lines = stdout.trim().split('\n').filter(Boolean);
    let hasZram = false;
    let hasDisk = false;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const name = parts[0] || '';
      const sizeStr = parts[1] || '0';
      // Parse size (e.g., "3.7G", "512M")
      let sizeMB = 0;
      if (sizeStr.endsWith('G')) sizeMB = parseFloat(sizeStr) * 1024;
      else if (sizeStr.endsWith('M')) sizeMB = parseFloat(sizeStr);
      swapTotalMB += sizeMB;

      if (name.includes('zram')) hasZram = true;
      else hasDisk = true;
    }

    if (hasZram && hasDisk) swapType = 'both';
    else if (hasZram) swapType = 'zram';
    else if (hasDisk) swapType = 'disk';

    // zram competes with GPU for physical RAM -- recommend disk swap on NVMe
    if (hasZram && !hasDisk) {
      recommendations.push('Swap is using zram (compressed RAM) which competes with GPU memory. For better AI performance, add NVMe SSD swap: "sudo fallocate -l 8G /ssd/swapfile && sudo mkswap /ssd/swapfile && sudo swapon /ssd/swapfile"');
    }
  } catch {
    // swapon not available
  }

  // Check if desktop GUI is running (uses ~800MB RAM)
  let desktopGuiRunning = false;
  try {
    execSync('pgrep -x gdm3 || pgrep -x lightdm || pgrep -x Xorg || pgrep -x gnome-shell 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    desktopGuiRunning = true;
    recommendations.push('Desktop GUI is running and using ~800MB RAM. For headless AI servers, disable it: "sudo systemctl set-default multi-user.target && sudo reboot"');
  } catch {
    // No GUI detected -- good
  }

  return {
    powerMode,
    powerModeId,
    clocksMaxed,
    swapType,
    swapTotalMB: Math.round(swapTotalMB),
    desktopGuiRunning,
    recommendations,
  };
}

/**
 * Calculate the optimal num_ctx (context window size) based on available memory.
 * Smaller context windows use less VRAM and process prompts faster.
 *
 * @param totalMemoryMB - Total system memory in MB
 * @param isJetson - Whether this is a Jetson device (unified memory)
 * @returns Recommended num_ctx value
 */
export function calculateOptimalNumCtx(totalMemoryMB: number, isJetson: boolean): number {
  // Reserve memory for OS and other processes
  const reservedMB = isJetson ? 1024 : 2048;
  const availableMB = Math.max(0, totalMemoryMB - reservedMB);

  // Rough heuristic: each 1024 context tokens needs ~50-100MB of KV cache
  // depending on model size. Use conservative estimate.
  // Jetson Nano (4GB): 3072MB available -> ~4096 ctx
  // Jetson Orin Nano (8GB): 7168MB available -> ~8192 ctx
  // Jetson AGX Orin (32GB): 31GB available -> ~16384 ctx (cap)
  // Desktop 16GB + discrete GPU: ~16384 ctx (cap)
  const calculated = Math.floor(availableMB / 768) * 1024;

  // Clamp between 2048 (minimum usable) and 16384 (diminishing returns)
  return Math.min(16384, Math.max(2048, calculated));
}
