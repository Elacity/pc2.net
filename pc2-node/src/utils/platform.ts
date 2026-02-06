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
