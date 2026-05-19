/**
 * Media Encoder Service for PC2 Node.
 *
 * Orchestrates local video/audio encoding:
 *   FFprobe analysis -> transcode plan -> FFmpeg execution -> mp4fragment
 *
 * Adapts codec selection to available hardware (NVIDIA GPU, SVT-AV1, x264).
 * Single rendition for v1 (matching cloud behavior).
 */

import { execFile, spawn, execSync, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { stat as fsStat, existsSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger.js';

const execFileAsync = promisify(execFile);
const fsStatAsync = promisify(fsStat);

// ─── Input Validation Limits ────────────────────────────────────────────────

const LIMITS = {
  maxFileSize: 4 * 1024 * 1024 * 1024,   // 4 GB
  maxDuration: 4 * 60 * 60,                // 4 hours (seconds)
  minDiskSpaceMultiplier: 4,                // need 4x input size as free disk space
  supportedVideoCodecs: ['h264', 'hevc', 'vp9', 'av1', 'prores', 'mpeg4', 'mjpeg', 'vp8'],
  supportedAudioCodecs: ['aac', 'mp3', 'flac', 'opus', 'vorbis', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'alac', 'wmav2'],
};

// ─── Encoding Profiles ──────────────────────────────────────────────────────

interface EncodingProfile {
  resolution: number;
  quality: string;
  crf: { x264: number; svtav1: number; nvenc: number };
  maxBitrate: { x264: string; svtav1: string; nvenc: string };
  bufsize: { x264: string; svtav1: string; nvenc: string };
  profile: string;
  level: string;
}

const PROFILES: EncodingProfile[] = [
  {
    resolution: 1920, quality: '1080p',
    crf: { x264: 23, svtav1: 30, nvenc: 15 },
    maxBitrate: { x264: '4500k', svtav1: '3500k', nvenc: '5000k' },
    bufsize: { x264: '9000k', svtav1: '7000k', nvenc: '10000k' },
    profile: 'main', level: '4.0',
  },
  {
    resolution: 1280, quality: '720p',
    crf: { x264: 24, svtav1: 32, nvenc: 16 },
    maxBitrate: { x264: '2500k', svtav1: '2000k', nvenc: '2500k' },
    bufsize: { x264: '5000k', svtav1: '4000k', nvenc: '5000k' },
    profile: 'main', level: '4.0',
  },
  {
    resolution: 854, quality: '480p',
    crf: { x264: 26, svtav1: 35, nvenc: 18 },
    maxBitrate: { x264: '1200k', svtav1: '1000k', nvenc: '1200k' },
    bufsize: { x264: '2400k', svtav1: '2000k', nvenc: '2400k' },
    profile: 'main', level: '4.0',
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StreamInfo {
  index: number;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  codec_name: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  disposition?: { attached_pic?: number };
}

export interface FormatInfo {
  filename: string;
  duration: string;
  size: string;
  bit_rate: string;
  format_name: string;
}

export interface MediaInfo {
  streams: StreamInfo[];
  format: FormatInfo;
}

export interface TranscodeResult {
  outputPath: string;
  resolution: string;
  codec: string;
  duration: number;
}

export type ProgressCallback = (progress: {
  percent: number;
  fps: number;
  speed: string;
  time: string;
}) => void;

type CodecType = 'x264' | 'svtav1' | 'nvenc';

// ─── Concurrency Control ────────────────────────────────────────────────────

const MAX_CONCURRENT_ENCODES = os.cpus().length >= 8 ? 2 : 1;
let activeEncodes = 0;
const encodeQueue: Array<{ resolve: () => void }> = [];

async function acquireEncodeSemaphore(): Promise<void> {
  if (activeEncodes < MAX_CONCURRENT_ENCODES) {
    activeEncodes++;
    return;
  }
  return new Promise<void>((resolve) => {
    encodeQueue.push({ resolve });
  });
}

function releaseEncodeSemaphore(): void {
  activeEncodes--;
  const next = encodeQueue.shift();
  if (next) {
    activeEncodes++;
    next.resolve();
  }
}

// ─── FFprobe / FFmpeg Detection ─────────────────────────────────────────────

let detectedCodec: CodecType | null = null;

export async function detectAvailableCodec(): Promise<CodecType> {
  if (detectedCodec) return detectedCodec;

  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-hide_banner', '-encoders'], { timeout: 5000 });
    // Check NVIDIA GPU
    try {
      await execFileAsync('nvidia-smi', [], { timeout: 5000 });
      if (stdout.includes('av1_nvenc')) {
        detectedCodec = 'nvenc';
        logger.info('[Encoder] Detected NVIDIA GPU with av1_nvenc support');
        return detectedCodec;
      }
    } catch { /* no nvidia */ }

    // Check SVT-AV1
    try {
      if (stdout.includes('libsvtav1')) {
        detectedCodec = 'svtav1';
        logger.info('[Encoder] Detected SVT-AV1 (CPU) encoder');
        return detectedCodec;
      }
    } catch { /* fallback */ }
  } catch { /* fallback */ }

  detectedCodec = 'x264';
  logger.info('[Encoder] Using libx264 (universal fallback)');
  return detectedCodec;
}

export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    await execFileAsync('ffprobe', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Analyze Media ──────────────────────────────────────────────────────────

export async function analyzeMedia(filePath: string): Promise<MediaInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-find_stream_info',
    '-of', 'json',
    '-i', filePath,
  ], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });

  const info: MediaInfo = JSON.parse(stdout);

  if (!info.streams || info.streams.length === 0) {
    throw new Error('No media streams found in file');
  }

  return info;
}

// ─── Validate Media Input ───────────────────────────────────────────────────

export async function validateMediaInput(filePath: string, info: MediaInfo): Promise<void> {
  const fileStat = await fsStatAsync(filePath);

  if (fileStat.size > LIMITS.maxFileSize) {
    throw new Error(`File too large: ${(fileStat.size / (1024 * 1024 * 1024)).toFixed(1)}GB (max ${LIMITS.maxFileSize / (1024 * 1024 * 1024)}GB)`);
  }

  const duration = parseFloat(info.format.duration || '0');
  if (duration > LIMITS.maxDuration) {
    throw new Error(`Duration too long: ${(duration / 3600).toFixed(1)}h (max ${LIMITS.maxDuration / 3600}h)`);
  }

  const videoStream = info.streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audioStream = info.streams.find(s => s.codec_type === 'audio');

  if (!videoStream && !audioStream) {
    throw new Error('No processable video or audio stream found');
  }

  if (videoStream && !LIMITS.supportedVideoCodecs.includes(videoStream.codec_name)) {
    throw new Error(`Unsupported video codec: ${videoStream.codec_name}. Supported: ${LIMITS.supportedVideoCodecs.join(', ')}`);
  }

  if (audioStream && !LIMITS.supportedAudioCodecs.includes(audioStream.codec_name)) {
    throw new Error(`Unsupported audio codec: ${audioStream.codec_name}. Supported: ${LIMITS.supportedAudioCodecs.join(', ')}`);
  }

  // Check free disk space
  const requiredSpace = fileStat.size * LIMITS.minDiskSpaceMultiplier;
  try {
    const freeSpace = getFreeDiskSpace(filePath);
    if (freeSpace < requiredSpace) {
      throw new Error(`Insufficient disk space: ${(freeSpace / (1024 * 1024 * 1024)).toFixed(1)}GB free, need ${(requiredSpace / (1024 * 1024 * 1024)).toFixed(1)}GB`);
    }
  } catch (e: any) {
    if (e.message.includes('Insufficient')) throw e;
    logger.warn('[Encoder] Could not check disk space:', e.message);
  }
}

function getFreeDiskSpace(path: string): number {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const output = execSync(`df -k "${path}" | tail -1`, { encoding: 'utf-8' });
      const parts = output.trim().split(/\s+/);
      return parseInt(parts[3], 10) * 1024;
    }
  } catch { /* ignore */ }
  return Infinity;
}

// ─── Build Transcode Plan ───────────────────────────────────────────────────

export interface TranscodePlan {
  args: string[];
  outputPath: string;
  resolution: string;
  codec: CodecType;
  isAudioOnly: boolean;
}

export function buildTranscodePlan(
  info: MediaInfo,
  inputPath: string,
  outputDir: string,
  codec: CodecType,
): TranscodePlan {
  const videoStream = info.streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audioStream = info.streams.find(s => s.codec_type === 'audio');

  // Audio-only path
  if (!videoStream && audioStream) {
    const outputPath = join(outputDir, 'output_audio.mp4');
    return {
      args: [
        '-v', 'info',
        '-i', inputPath,
        '-vn', '-sn',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        outputPath, '-y',
      ],
      outputPath,
      resolution: 'audio',
      codec,
      isAudioOnly: true,
    };
  }

  // Video path: select profile based on input resolution
  const inputWidth = videoStream?.width || 1920;
  const profile = PROFILES.find(p => p.resolution <= inputWidth) || PROFILES[PROFILES.length - 1];
  const outputPath = join(outputDir, `output_${profile.quality}.mp4`);

  const args: string[] = [
    '-v', 'info',
    '-i', inputPath,
    '-sn',
  ];

  // Video mapping (exclude attached pictures)
  args.push('-map', '0:v:0');

  // Codec-specific args
  if (codec === 'nvenc') {
    args.push(
      '-hwaccel', 'cuda',
      '-vf', `format=yuv420p,hwupload_cuda,scale_cuda=w=${profile.resolution}:h=-2`,
      '-c:v', 'av1_nvenc',
      '-rc:v', 'constqp',
      '-cq:v', profile.crf.nvenc.toString(),
      '-preset', 'p6',
      '-tune', 'hq',
    );
  } else if (codec === 'svtav1') {
    args.push(
      '-vf', `scale=${profile.resolution}:-2`,
      '-c:v', 'libsvtav1',
      '-crf', profile.crf.svtav1.toString(),
      '-preset', '6',
      '-svtav1-params', 'tune=0:enable-overlays=1',
      '-pix_fmt', 'yuv420p10le',
    );
  } else {
    args.push(
      '-vf', `scale=${profile.resolution}:-2`,
      '-c:v', 'libx264',
      '-profile:v', profile.profile,
      '-level', profile.level,
      '-crf', profile.crf.x264.toString(),
      '-preset', 'slow',
      '-pix_fmt', 'yuv420p',
    );
  }

  // Constrained VBR (maxrate + bufsize)
  args.push(
    '-maxrate', profile.maxBitrate[codec],
    '-bufsize', profile.bufsize[codec],
  );

  // Keyframe alignment for DASH segments
  args.push(
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-sc_threshold', '0',
  );

  // Audio
  if (audioStream) {
    args.push(
      '-map', '0:a:0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '2',
    );
  }

  args.push(outputPath, '-y');

  return {
    args,
    outputPath,
    resolution: profile.quality,
    codec,
    isAudioOnly: false,
  };
}

// ─── Transcode Execution ────────────────────────────────────────────────────

export async function transcodeRendition(
  plan: TranscodePlan,
  onProgress?: ProgressCallback,
): Promise<TranscodeResult> {
  await acquireEncodeSemaphore();

  try {
    return await new Promise<TranscodeResult>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', plan.args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderrBuf = '';

      ffmpeg.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuf += chunk;

        if (onProgress) {
          const progress = parseFFmpegProgress(chunk);
          if (progress) onProgress(progress);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({
            outputPath: plan.outputPath,
            resolution: plan.resolution,
            codec: plan.codec,
            duration: 0,
          });
        } else {
          const lastLines = stderrBuf.split('\n').slice(-10).join('\n');
          reject(new Error(`FFmpeg exited with code ${code}: ${lastLines}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });
    });
  } finally {
    releaseEncodeSemaphore();
  }
}

function parseFFmpegProgress(line: string): { percent: number; fps: number; speed: string; time: string } | null {
  const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+x)/);

  if (!timeMatch) return null;

  return {
    percent: 0,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
    speed: speedMatch ? speedMatch[1] : '0x',
    time: timeMatch[1],
  };
}

// ─── mp4fragment ────────────────────────────────────────────────────────────

/**
 * Fragment an MP4 into a DASH-compatible fragmented MP4 (fMP4).
 *
 * Two backends:
 *   - Bento4's mp4fragment (preferred — Linux-x64, macOS)
 *   - ffmpeg (fallback for linux-arm64 where bok.net has no Bento4 prebuild)
 *
 * Pass `useFfmpeg: true` (or pass `'ffmpeg'` as the binary name) to use the
 * ffmpeg backend. Output structure is equivalent — both produce fMP4 with
 * `moof` segments suitable for the downstream DASH packager.
 */
export async function fragmentMedia(
  mp4Path: string,
  outputPath: string,
  fragmenterBin: string = 'mp4fragment',
  useFfmpeg: boolean = false,
): Promise<string> {
  const isFfmpeg = useFfmpeg || fragmenterBin === 'ffmpeg';

  if (isFfmpeg) {
    // ffmpeg fragmentation. Flags chosen to produce fMP4 segments with the SAME
    // box-level topology that Bento4's `mp4fragment` produces, so the downstream
    // CENC encrypt + MPD packager (mp4-split.wasm / cenc-encrypt.wasm) — both
    // written and tested only against Bento4 output — accept them unchanged.
    //
    //   -c copy                       don't re-encode (preserve quality + speed)
    //   -movflags +frag_keyframe      fragment at keyframe boundaries
    //   -movflags +empty_moov         empty initial moov, segments contain moof
    //   -movflags +default_base_moof  set tfhd default-base-is-moof (DASH-spec)
    //   -movflags +separate_moof      one traf per moof — see below
    //   -frag_duration 4000000        4s fragments (matches --fragment-duration 4000)
    //   -map_metadata 0               preserve metadata (matches --copy-udta)
    //
    // CRITICAL: `+separate_moof`. By default ffmpeg muxes ALL tracks (video +
    // audio) into a single moof with multiple [traf] children. Bento4 emits
    // ONE [traf] per [moof], alternating tracks across consecutive moofs:
    //
    //   ffmpeg default              Bento4 (and our WASMs assume this)
    //   ────────────────            ───────────────────────────────────
    //   [moof seq=1]                [moof seq=1]
    //     [traf track=1]              [traf track=1]   ← video
    //     [traf track=2]            [mdat]
    //   [mdat]                      [moof seq=2]
    //                                 [traf track=2]   ← audio
    //                               [mdat]
    //
    // The cenc-encrypt + mp4-split WASMs compute per-sample byte offsets
    // (senc/saio/saiz) assuming a single traf per moof. With ffmpeg's default
    // multi-traf moof, those offsets are wrong, and the resulting encrypted
    // segments fail with PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED in
    // Chrome's demuxer. `+separate_moof` forces one-traf-per-moof, restoring
    // Bento4-equivalent topology.
    //
    // (Note: tfhd/trun flag bits still differ slightly between Bento4 and
    // ffmpeg — Bento4 lists per-sample duration+size+flags in trun, ffmpeg
    // uses tfhd defaults where all samples are uniform. Both layouts carry
    // complete per-sample information, just via different fields, so a
    // spec-compliant parser will read both correctly.)
    const { stderr } = await execFileAsync('ffmpeg', [
      '-y',
      '-i', mp4Path,
      '-c', 'copy',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof+separate_moof',
      '-frag_duration', '4000000',
      '-map_metadata', '0',
      outputPath,
    ], { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });

    if (!existsSync(outputPath)) {
      throw new Error(`ffmpeg fragmentation failed to produce output: ${stderr}`);
    }
    logger.info(`[Encoder] Fragmented (ffmpeg) ${mp4Path} -> ${outputPath}`);
    return outputPath;
  }

  // Default: mp4fragment from Bento4
  const { stderr } = await execFileAsync(fragmenterBin, [
    '--fragment-duration', '4000',
    '--copy-udta',
    mp4Path,
    outputPath,
  ], { timeout: 600000 });

  if (!existsSync(outputPath)) {
    throw new Error(`mp4fragment failed to produce output: ${stderr}`);
  }

  logger.info(`[Encoder] Fragmented (mp4fragment) ${mp4Path} -> ${outputPath}`);
  return outputPath;
}
