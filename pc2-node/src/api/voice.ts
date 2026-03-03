/**
 * Voice API
 * 
 * Full voice interaction pipeline:
 * Browser audio (webm/opus) -> ffmpeg (wav) -> Whisper STT -> Ollama LLM -> Piper TTS -> audio response
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import multer from 'multer';
import { spawn, execFile, exec } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max audio
});

const WHISPER_URL = 'http://127.0.0.1:8080/inference';
const PIPER_MODEL_NAME = 'en_US-ryan-high';

let piperBinaryPath: string | null = null;

function findPiperBinary(): string {
  if (piperBinaryPath) return piperBinaryPath;

  const candidates = [
    '/usr/local/bin/piper',
    '/usr/bin/piper',
    `${process.env.HOME || '/root'}/piper/piper`,
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/piper',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/piper',
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/piper',
    '/opt/homebrew/bin/piper',
  ];

  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        piperBinaryPath = p;
        logger.info(`[Voice] Found Piper at: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }

  piperBinaryPath = 'piper';
  return 'piper';
}

function findPiperModel(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
  const candidates = [
    `${homeDir}/piper-voices/${PIPER_MODEL_NAME}.onnx`,
    `${homeDir}/piper/voices/${PIPER_MODEL_NAME}.onnx`,
    `/usr/share/piper-voices/${PIPER_MODEL_NAME}.onnx`,
    PIPER_MODEL_NAME,
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return PIPER_MODEL_NAME;
}

interface VoiceResponse {
  transcript: string;
  response: string;
  audio?: string;
  duration_ms: number;
  fallback?: string;
}

/**
 * Convert webm/opus audio to 16-bit PCM WAV via ffmpeg.
 * Returns path to the output WAV file.
 */
async function convertToWav(inputBuffer: Buffer): Promise<string> {
  const inputPath = join(tmpdir(), `voice-in-${randomUUID()}.webm`);
  const outputPath = join(tmpdir(), `voice-out-${randomUUID()}.wav`);

  await writeFile(inputPath, inputBuffer);

  return new Promise((resolve, reject) => {
    const proc = execFile('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-sample_fmt', 's16',
      '-f', 'wav',
      '-y',
      outputPath,
    ], { timeout: 15000 }, async (error) => {
      // Clean up input file regardless
      await unlink(inputPath).catch(() => {});
      if (error) {
        await unlink(outputPath).catch(() => {});
        reject(new Error(`ffmpeg conversion failed: ${error.message}`));
      } else {
        resolve(outputPath);
      }
    });
  });
}

/**
 * Send WAV audio to whisper.cpp server for transcription.
 */
async function transcribeAudio(wavPath: string): Promise<string> {
  const wavBuffer = await readFile(wavPath);

  const formData = new FormData();
  formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
  formData.append('temperature', '0.0');
  formData.append('response_format', 'json');

  const response = await fetch(WHISPER_URL, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Whisper STT error: HTTP ${response.status}`);
  }

  const result = await response.json() as any;

  // whisper.cpp returns { text: "..." } or { results: [{ text: "..." }] }
  if (result.text) return result.text.trim();
  if (result.results?.[0]?.text) return result.results[0].text.trim();

  throw new Error('Unexpected Whisper response format');
}

/**
 * Generate speech audio from text via Piper TTS subprocess.
 * Returns WAV audio as a Buffer.
 */
async function textToSpeech(text: string, model?: string): Promise<Buffer | null> {
  const piperModel = model || findPiperModel();

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    const piperBin = findPiperBinary();
    const piper = spawn(piperBin, [
      '--model', piperModel,
      '--output_raw',
    ], { timeout: 30000 });

    piper.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    piper.stderr.on('data', (data: Buffer) => {
      logger.debug(`[Voice] Piper stderr: ${data.toString()}`);
    });

    piper.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        const rawPcm = Buffer.concat(chunks);
        // Wrap raw PCM in a WAV header (16-bit, 22050Hz mono — Piper default)
        const wav = wrapPcmInWav(rawPcm, 22050, 1, 16);
        resolve(wav);
      } else {
        logger.warn(`[Voice] Piper exited with code ${code}`);
        resolve(null);
      }
    });

    piper.on('error', (err) => {
      logger.warn(`[Voice] Piper not available: ${err.message}`);
      resolve(null);
    });

    piper.stdin.write(text);
    piper.stdin.end();
  });
}

/**
 * Wrap raw PCM bytes in a minimal WAV header.
 */
function wrapPcmInWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Check if whisper-server is reachable.
 */
async function isWhisperAvailable(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 404; // Server is up even if / returns 404
  } catch {
    return false;
  }
}

/**
 * Check if Piper binary is available.
 */
async function isPiperAvailable(): Promise<boolean> {
  const piperBin = findPiperBinary();
  return new Promise((resolve) => {
    execFile(piperBin, ['--help'], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * POST /api/ai/voice
 * Accept audio blob, run full STT -> LLM -> TTS pipeline.
 */
router.post('/voice', authenticate, upload.single('audio'), async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();

  try {
    const wallet = req.user?.wallet_address;
    if (!wallet) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided. Send as multipart "audio" field.' });
    }

    const result: VoiceResponse = {
      transcript: '',
      response: '',
      duration_ms: 0,
    };

    // Step 1: Convert webm to WAV
    let wavPath: string;
    try {
      wavPath = await convertToWav(req.file.buffer);
    } catch (error: any) {
      return res.status(500).json({
        error: 'voice_conversion_failed',
        message: `Audio conversion failed: ${error.message}. Is ffmpeg installed?`,
      });
    }

    // Step 2: Transcribe via Whisper
    try {
      result.transcript = await transcribeAudio(wavPath);
    } catch (error: any) {
      await unlink(wavPath).catch(() => {});
      return res.status(503).json({
        error: 'voice_stt_unavailable',
        message: `Speech-to-text failed: ${error.message}. Is whisper-server running on port 8080?`,
      });
    }

    // Clean up WAV file
    await unlink(wavPath).catch(() => {});

    if (!result.transcript || result.transcript.length < 2) {
      result.duration_ms = Date.now() - startTime;
      return res.json({ ...result, response: '(No speech detected)' });
    }

    logger.info(`[Voice] Transcript: "${result.transcript.substring(0, 100)}..."`);

    // Step 3: Get AI response via AIChatService
    const aiService = req.app.locals.aiService;
    if (!aiService) {
      result.response = 'AI service not available';
      result.fallback = 'text_only';
      result.duration_ms = Date.now() - startTime;
      return res.json(result);
    }

    try {
      const completion = await aiService.complete({
        messages: [
          {
            role: 'system',
            content: 'The user is speaking to you via voice. Respond naturally and conversationally — keep answers concise, warm, and spoken-friendly. Do not over-explain or analyze the message structure. Just talk like a person would.',
          },
          { role: 'user', content: result.transcript },
        ],
        walletAddress: wallet,
        agentId: req.body?.agentId,
      });

      result.response = typeof completion.message?.content === 'string'
        ? completion.message.content
        : JSON.stringify(completion.message?.content || '');
    } catch (error: any) {
      logger.error(`[Voice] LLM error: ${error.message}`);
      result.response = 'I had trouble processing that. Please try again.';
      result.fallback = 'llm_error';
    }

    // Step 4: Generate speech from response via Piper
    try {
      const audioBuffer = await textToSpeech(result.response);
      if (audioBuffer) {
        result.audio = audioBuffer.toString('base64');
      } else {
        result.fallback = 'tts_unavailable';
      }
    } catch (error: any) {
      logger.warn(`[Voice] TTS failed: ${error.message}`);
      result.fallback = 'tts_error';
    }

    result.duration_ms = Date.now() - startTime;
    logger.info(`[Voice] Complete pipeline in ${result.duration_ms}ms`);

    res.json(result);
  } catch (error: any) {
    logger.error(`[Voice] Pipeline error: ${error.message}`);
    res.status(500).json({
      error: 'voice_pipeline_error',
      message: error.message,
      duration_ms: Date.now() - startTime,
    });
  }
});

/**
 * GET /api/ai/voice/status
 * Check if voice services (Whisper, Piper, ffmpeg) are available.
 */
router.get('/voice/status', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [whisper, piper] = await Promise.all([
      isWhisperAvailable(),
      isPiperAvailable(),
    ]);

    const ffmpeg = await new Promise<boolean>((resolve) => {
      execFile('ffmpeg', ['-version'], { timeout: 5000 }, (error) => resolve(!error));
    });

    res.json({
      whisper: { available: whisper, endpoint: WHISPER_URL },
      piper: { available: piper },
      ffmpeg: { available: ffmpeg },
      ready: whisper && piper && ffmpeg,
    });
  } catch (error: any) {
    logger.error('[Voice] Status check failed:', error?.message);
    res.status(500).json({ error: 'Voice status check failed', details: error?.message });
  }
});

const execAsync = promisify(exec);

/**
 * POST /api/ai/voice/enable
 * Start the whisper-server systemd service.
 */
router.post('/voice/enable', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await execAsync('sudo systemctl start whisper-server 2>/dev/null');
    // Give it a moment to start
    await new Promise(r => setTimeout(r, 2000));
    const available = await isWhisperAvailable();
    res.json({ success: true, whisperRunning: available });
  } catch (error: any) {
    logger.error('[Voice] Failed to enable whisper-server:', error?.message);
    res.status(500).json({ success: false, error: error?.message || 'Failed to start whisper-server' });
  }
});

/**
 * POST /api/ai/voice/disable
 * Stop the whisper-server systemd service.
 */
router.post('/voice/disable', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await execAsync('sudo systemctl stop whisper-server 2>/dev/null');
    res.json({ success: true, whisperRunning: false });
  } catch (error: any) {
    logger.error('[Voice] Failed to disable whisper-server:', error?.message);
    res.status(500).json({ success: false, error: error?.message || 'Failed to stop whisper-server' });
  }
});

/**
 * POST /api/ai/voice/install
 * Install Whisper + Piper + ffmpeg in the background.
 * Returns immediately; client should poll /voice/status.
 */
router.post('/voice/install', authenticate, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if already installed
    const whisperAvailable = await isWhisperAvailable();
    if (whisperAvailable) {
      return res.json({ success: true, message: 'Voice AI is already installed and running.' });
    }

    const homeDir = process.env.HOME || '/root';
    const whisperDir = `${homeDir}/whisper.cpp`;
    const whisperBinary = `${whisperDir}/build/bin/whisper-server`;

    if (existsSync(whisperBinary)) {
      // Binary exists but service isn't running -- just start it
      await execAsync('sudo systemctl start whisper-server 2>/dev/null').catch(() => {});
      return res.json({ success: true, message: 'Whisper found. Starting service...' });
    }

    // Run install in background
    const installScript = `
      set -e
      sudo apt-get install -y -qq ffmpeg cmake libcurl4-openssl-dev 2>/dev/null || true

      # Build whisper.cpp
      WHISPER_DIR="${whisperDir}"
      if [ ! -d "$WHISPER_DIR" ]; then
        git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
      fi
      cd "$WHISPER_DIR"
      mkdir -p build && cd build
      if command -v nvcc &>/dev/null || [ -d /usr/local/cuda ]; then
        cmake .. -DGGML_CUDA=ON -DWHISPER_BUILD_SERVER=ON
      else
        cmake .. -DWHISPER_BUILD_SERVER=ON
      fi
      cmake --build . --config Release -j$(nproc) 2>&1

      # Download model
      cd "$WHISPER_DIR"
      if [ ! -f "models/ggml-base.en.bin" ]; then
        bash models/download-ggml-model.sh base.en
      fi

      # Create systemd service
      WHISPER_MODEL="$WHISPER_DIR/models/ggml-base.en.bin"
      sudo tee /etc/systemd/system/whisper-server.service > /dev/null << WEOF
[Unit]
Description=Whisper.cpp STT Server
After=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=$WHISPER_DIR/build/bin/whisper-server -m $WHISPER_MODEL --host 127.0.0.1 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
WEOF

      sudo systemctl daemon-reload
      sudo systemctl enable whisper-server
      sudo systemctl start whisper-server

      # Install Piper TTS
      PIPER_DIR="${homeDir}/piper"
      if [ ! -f "$PIPER_DIR/piper" ]; then
        mkdir -p "$PIPER_DIR"
        cd "$PIPER_DIR"
        curl -sSL "https://github.com/rhasspy/piper/releases/latest/download/piper_linux_aarch64.tar.gz" | tar xz --strip-components=1 2>/dev/null || true
        if [ -f "$PIPER_DIR/piper" ]; then
          sudo ln -sf "$PIPER_DIR/piper" /usr/local/bin/piper
        fi
      fi

      # Download voice model
      PIPER_VOICE_DIR="$PIPER_DIR/voices"
      mkdir -p "$PIPER_VOICE_DIR"
      if [ ! -f "$PIPER_VOICE_DIR/en_US-ryan-high.onnx" ]; then
        curl -sSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx" -o "$PIPER_VOICE_DIR/en_US-ryan-high.onnx" 2>/dev/null || true
        curl -sSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx.json" -o "$PIPER_VOICE_DIR/en_US-ryan-high.onnx.json" 2>/dev/null || true
      fi
    `;

    // Fire and forget -- client polls /voice/status
    const child = spawn('bash', ['-c', installScript], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    logger.info('[Voice] Background install started');
    res.json({
      success: true,
      message: 'Voice AI installation started. This may take 10-15 minutes. Check status periodically.',
      installing: true,
    });
  } catch (error: any) {
    logger.error('[Voice] Install error:', error?.message);
    res.status(500).json({ success: false, error: error?.message || 'Failed to start installation' });
  }
});

export default router;
