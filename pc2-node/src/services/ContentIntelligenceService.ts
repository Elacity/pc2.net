/**
 * Content Intelligence Service
 *
 * Analyzes content before publishing to generate machine-readable
 * intelligence reports for compliance, trust, and agent-to-agent commerce.
 *
 * All analysis runs locally on the user's node via Ollama.
 * Content never leaves the machine.
 *
 * Capabilities:
 *   - Classification: topic, language, complexity
 *   - Quality: resolution, bitrate, production score (via FFprobe)
 *   - Safety: adult content, violence, copyright risk (via vision model)
 *   - Provenance: content hash, perceptual hash, first-published timestamp
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { AIChatService } from './ai/AIChatService.js';
import { computePerceptualHash, hammingDistance } from './media/fingerprint.js';
import type { DatabaseManager } from '../storage/database.js';
import { logger } from '../utils/logger.js';
import type {
  ContentIntelligenceReport,
  ContentClassification,
  QualityAssessment,
  SafetyAssessment,
  ContentProvenance,
  ContentAnalysisParams,
  PerceptualHashResult,
} from '../sdk/types.js';

const execFileAsync = promisify(execFile);

const SIMILARITY_THRESHOLD = 10;
const VISION_MODEL_PATTERNS = ['llava', 'bakllava', 'vision', 'multimodal'];

export class ContentIntelligenceService {
  private aiService: AIChatService;
  private db: DatabaseManager;

  constructor(aiService: AIChatService, db: DatabaseManager) {
    this.aiService = aiService;
    this.db = db;
  }

  /**
   * Full content analysis pipeline.
   * Returns a ContentIntelligenceReport suitable for embedding in metadata.
   */
  async analyze(params: ContentAnalysisParams): Promise<ContentIntelligenceReport> {
    const startTime = Date.now();
    logger.info(`[ContentIntelligence] Starting analysis: ${params.mimeType}, ${formatBytes(params.fileSize)}`);

    const [classification, quality, provenance] = await Promise.all([
      this.classifyContent(params).catch(err => {
        logger.warn(`[ContentIntelligence] Classification failed: ${err.message}`);
        return fallbackClassification(params.mimeType);
      }),
      this.assessQuality(params).catch(err => {
        logger.warn(`[ContentIntelligence] Quality assessment failed: ${err.message}`);
        return fallbackQuality();
      }),
      this.analyzeProvenance(params).catch(err => {
        logger.warn(`[ContentIntelligence] Provenance analysis failed: ${err.message}`);
        return fallbackProvenance(params.existingHash);
      }),
    ]);

    const safety = await this.assessSafety(params, classification).catch(err => {
      logger.warn(`[ContentIntelligence] Safety assessment failed: ${err.message}`);
      return fallbackSafety();
    });

    const elapsed = Date.now() - startTime;
    logger.info(`[ContentIntelligence] Analysis complete in ${elapsed}ms — safety: ${safety.safetyScore}, quality: ${quality.productionScore}`);

    return {
      classification,
      quality,
      safety,
      provenance,
      analyzedAt: new Date().toISOString(),
      analyzedBy: 'pc2-node/ContentIntelligenceService',
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Classification
  // ────────────────────────────────────────────────────────────────

  private async classifyContent(params: ContentAnalysisParams): Promise<ContentClassification> {
    const { filePath, mimeType } = params;
    const baseType = getBaseType(mimeType);

    if (baseType === 'text' || mimeType === 'application/json') {
      return this.classifyText(filePath, mimeType);
    }

    if (baseType === 'image') {
      return this.classifyWithVision(filePath, mimeType, 'image');
    }

    if (baseType === 'video') {
      return this.classifyWithVision(filePath, mimeType, 'video');
    }

    if (baseType === 'audio') {
      return {
        topics: ['audio'],
        language: 'unknown',
        complexity: 0.5,
        contentType: 'audio',
      };
    }

    return {
      topics: [baseType],
      language: 'unknown',
      complexity: 0.5,
      contentType: baseType,
    };
  }

  private async classifyText(filePath: string, mimeType: string): Promise<ContentClassification> {
    const content = await readFile(filePath, 'utf-8');
    const sample = content.slice(0, 4000);

    const prompt = `Analyze this text content and respond ONLY with a JSON object (no markdown, no explanation):
{
  "topics": ["topic1", "topic2"],
  "language": "en",
  "complexity": 0.7,
  "genre": "article",
  "keywords": ["keyword1", "keyword2"]
}

Topics: 2-5 descriptive topic labels.
Language: ISO 639-1 code.
Complexity: 0-1 scale (0=simple, 1=highly technical).
Genre: One of article, documentation, fiction, code, data, academic, legal, creative.
Keywords: 3-8 key terms.

Text sample:
${sample}`;

    try {
      const result = await this.aiService.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
      });

      const parsed = parseJsonResponse(result.message.content);
      return {
        topics: parsed.topics || ['text'],
        language: parsed.language || 'unknown',
        complexity: clamp(parsed.complexity ?? 0.5, 0, 1),
        contentType: 'text',
        genre: parsed.genre,
        keywords: parsed.keywords,
      };
    } catch (err: any) {
      logger.warn(`[ContentIntelligence] Text classification via AI failed: ${err.message}`);
      return {
        topics: ['text'],
        language: detectLanguageHeuristic(content),
        complexity: estimateComplexity(content),
        contentType: 'text',
      };
    }
  }

  private async classifyWithVision(filePath: string, mimeType: string, mediaKind: 'image' | 'video'): Promise<ContentClassification> {
    let imageBase64: string;

    if (mediaKind === 'video') {
      imageBase64 = await extractVideoFrame(filePath, 3);
    } else {
      const buf = await readFile(filePath);
      imageBase64 = buf.toString('base64');
    }

    const prompt = `Analyze this ${mediaKind} and respond ONLY with a JSON object (no markdown):
{
  "topics": ["topic1", "topic2"],
  "language": "unknown",
  "complexity": 0.5,
  "genre": "photography"
}

Topics: 2-5 descriptive labels of what the content depicts.
Complexity: 0-1 (0=simple snapshot, 1=complex professional production).
Genre: One of photography, illustration, animation, cinematic, documentary, tutorial, music_video, gameplay, presentation, art.`;

    try {
      const result = await this.aiService.complete({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 500,
      });

      const parsed = parseJsonResponse(result.message.content);
      return {
        topics: parsed.topics || [mediaKind],
        language: parsed.language || 'unknown',
        complexity: clamp(parsed.complexity ?? 0.5, 0, 1),
        contentType: mediaKind,
        genre: parsed.genre,
      };
    } catch (err: any) {
      logger.warn(`[ContentIntelligence] Vision classification failed: ${err.message}`);
      return {
        topics: [mediaKind],
        language: 'unknown',
        complexity: 0.5,
        contentType: mediaKind,
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Quality Assessment
  // ────────────────────────────────────────────────────────────────

  private async assessQuality(params: ContentAnalysisParams): Promise<QualityAssessment> {
    const { filePath, mimeType, fileSize } = params;
    const baseType = getBaseType(mimeType);

    if (baseType === 'video' || baseType === 'audio') {
      return this.assessMediaQuality(filePath);
    }

    if (baseType === 'image') {
      return this.assessImageQuality(filePath, fileSize);
    }

    if (baseType === 'text' || mimeType === 'application/json' || mimeType === 'application/pdf') {
      return this.assessTextQuality(filePath, fileSize);
    }

    return {
      productionScore: 0.5,
      technicalNotes: [`File type: ${mimeType}`, `Size: ${formatBytes(fileSize)}`],
    };
  }

  private async assessMediaQuality(filePath: string): Promise<QualityAssessment> {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-of', 'json',
      filePath,
    ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');
    const duration = parseFloat(info.format?.duration || '0');
    const bitrate = parseInt(info.format?.bit_rate || '0', 10);

    let resolution: string | undefined;
    let productionScore = 0.5;
    const notes: string[] = [];

    if (videoStream) {
      const w = videoStream.width || 0;
      const h = videoStream.height || 0;
      resolution = `${w}x${h}`;

      if (w >= 3840) { productionScore = 0.95; notes.push('4K resolution'); }
      else if (w >= 1920) { productionScore = 0.8; notes.push('1080p'); }
      else if (w >= 1280) { productionScore = 0.65; notes.push('720p'); }
      else if (w >= 854) { productionScore = 0.5; notes.push('480p'); }
      else { productionScore = 0.3; notes.push('Low resolution'); }
    }

    if (audioStream) {
      const sampleRate = parseInt(audioStream.sample_rate || '0', 10);
      if (sampleRate >= 48000) notes.push('High-quality audio (48kHz+)');
      else if (sampleRate >= 44100) notes.push('CD-quality audio (44.1kHz)');
    }

    return {
      resolution,
      bitrate: bitrate || undefined,
      duration: duration || undefined,
      sampleRate: audioStream ? parseInt(audioStream.sample_rate || '0', 10) : undefined,
      channels: audioStream ? parseInt(audioStream.channels || '0', 10) : undefined,
      productionScore,
      technicalNotes: notes,
    };
  }

  private async assessImageQuality(filePath: string, fileSize: number): Promise<QualityAssessment> {
    try {
      const sharpModule = await import('sharp');
      const sharpFn = sharpModule.default || sharpModule;
      const metadata = await sharpFn(filePath).metadata();
      const w = metadata.width || 0;
      const h = metadata.height || 0;
      const megapixels = (w * h) / 1_000_000;

      let productionScore = 0.5;
      const notes: string[] = [];

      if (megapixels >= 20) { productionScore = 0.95; notes.push('Ultra-high resolution'); }
      else if (megapixels >= 8) { productionScore = 0.8; notes.push('High resolution'); }
      else if (megapixels >= 2) { productionScore = 0.6; notes.push('Standard resolution'); }
      else { productionScore = 0.3; notes.push('Low resolution'); }

      return {
        resolution: `${w}x${h}`,
        productionScore,
        technicalNotes: notes,
      };
    } catch {
      return { productionScore: 0.5 };
    }
  }

  private async assessTextQuality(filePath: string, fileSize: number): Promise<QualityAssessment> {
    const content = await readFile(filePath, 'utf-8');
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const lines = content.split('\n');

    let productionScore = 0.5;
    const notes: string[] = [`${words.length} words`, `${lines.length} lines`];

    if (words.length > 10000) { productionScore = 0.8; notes.push('Substantial document'); }
    else if (words.length > 1000) { productionScore = 0.6; notes.push('Medium document'); }
    else { productionScore = 0.4; notes.push('Short document'); }

    return { productionScore, technicalNotes: notes };
  }

  // ────────────────────────────────────────────────────────────────
  // Safety Assessment
  // ────────────────────────────────────────────────────────────────

  private async assessSafety(
    params: ContentAnalysisParams,
    classification: ContentClassification,
  ): Promise<SafetyAssessment> {
    const { filePath, mimeType } = params;
    const baseType = getBaseType(mimeType);
    const flags: string[] = [];
    const warnings: string[] = [];
    let adultContent = false;
    let violence = false;
    let copyrightRisk = 0;

    if (baseType === 'image' || baseType === 'video') {
      try {
        const visionResult = await this.assessSafetyWithVision(filePath, baseType);
        adultContent = visionResult.adultContent;
        violence = visionResult.violence;
        copyrightRisk = visionResult.copyrightRisk;
        if (adultContent) flags.push('adult_content');
        if (violence) flags.push('violence');
        if (copyrightRisk > 0.7) flags.push('high_copyright_risk');
      } catch (err: any) {
        warnings.push(`Vision safety check unavailable: ${err.message}`);
      }
    }

    // Check for duplicate content via perceptual hash
    try {
      const hashResult = await computePerceptualHash(filePath, mimeType);
      if (hashResult.dominantHash) {
        const existing = this.db.findSimilarHashes(hashResult.dominantHash, hashResult.algorithm);
        for (const record of existing) {
          const dist = hammingDistance(hashResult.dominantHash, record.phash);
          if (dist <= SIMILARITY_THRESHOLD) {
            flags.push('potential_duplicate');
            warnings.push(`Similar content found (distance: ${dist}, token: ${record.token_id || 'unknown'})`);
            break;
          }
        }
      }
    } catch (err: any) {
      warnings.push(`Duplicate check unavailable: ${err.message}`);
    }

    const safetyScore = calculateSafetyScore(adultContent, violence, copyrightRisk, flags);

    return {
      adultContent,
      violence,
      copyrightRisk,
      safetyScore,
      flags,
      blocked: safetyScore < 0.1,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private async assessSafetyWithVision(filePath: string, mediaKind: 'image' | 'video'): Promise<{
    adultContent: boolean;
    violence: boolean;
    copyrightRisk: number;
  }> {
    let imageBase64: string;

    if (mediaKind === 'video') {
      imageBase64 = await extractVideoFrame(filePath, 3);
    } else {
      const buf = await readFile(filePath);
      imageBase64 = buf.toString('base64');
    }

    const prompt = `You are a content safety classifier. Analyze this ${mediaKind} and respond ONLY with a JSON object (no markdown):
{
  "adult_content": false,
  "violence": false,
  "copyright_risk": 0.1
}

adult_content: true if nudity, pornography, or sexually explicit material.
violence: true if graphic violence, gore, or disturbing imagery.
copyright_risk: 0-1 (0=original, 1=clearly copyrighted material like movie screenshots, brand logos, etc.)

Be conservative — only flag clear violations.`;

    const result = await this.aiService.complete({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const parsed = parseJsonResponse(result.message.content);
    return {
      adultContent: !!parsed.adult_content,
      violence: !!parsed.violence,
      copyrightRisk: clamp(parsed.copyright_risk ?? 0, 0, 1),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Provenance
  // ────────────────────────────────────────────────────────────────

  private async analyzeProvenance(params: ContentAnalysisParams): Promise<ContentProvenance> {
    const { filePath, mimeType, existingHash } = params;

    let originalHash = existingHash || '';
    if (!originalHash) {
      const buf = await readFile(filePath);
      originalHash = createHash('sha256').update(buf).digest('hex');
    }

    let perceptualHash: string | undefined;
    let audioFingerprint: string | undefined;

    try {
      const hashResult = await computePerceptualHash(filePath, mimeType);
      perceptualHash = hashResult.dominantHash || undefined;
      audioFingerprint = hashResult.audioFingerprint;
    } catch (err: any) {
      logger.warn(`[ContentIntelligence] Perceptual hash failed: ${err.message}`);
    }

    // Check for similar existing content
    let similarContentFound = false;
    let similarityScore = 0;

    if (perceptualHash) {
      const existing = this.db.findSimilarHashes(perceptualHash);
      for (const record of existing) {
        const dist = hammingDistance(perceptualHash, record.phash);
        if (dist <= SIMILARITY_THRESHOLD) {
          similarContentFound = true;
          similarityScore = 1 - (dist / 64);
          break;
        }
      }
    }

    return {
      originalHash,
      perceptualHash,
      audioFingerprint,
      firstPublished: new Date().toISOString(),
      similarContentFound,
      similarityScore: similarContentFound ? similarityScore : undefined,
    };
  }
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

async function extractVideoFrame(filePath: string, timestampSec: number): Promise<string> {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-ss', String(timestampSec),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', 'scale=512:-1',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    '-',
  ], { timeout: 15_000, maxBuffer: 50 * 1024 * 1024, encoding: 'buffer' as any });

  return Buffer.from(stdout as any).toString('base64');
}

function parseJsonResponse(content: string): any {
  const text = typeof content === 'string' ? content : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}

function getBaseType(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/pdf') return 'text';
  return 'binary';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function calculateSafetyScore(adult: boolean, violence: boolean, copyrightRisk: number, flags: string[]): number {
  let score = 1.0;
  if (adult) score -= 0.4;
  if (violence) score -= 0.3;
  score -= copyrightRisk * 0.2;
  if (flags.includes('potential_duplicate')) score -= 0.1;
  return clamp(score, 0, 1);
}

function detectLanguageHeuristic(text: string): string {
  const sample = text.slice(0, 2000);
  if (/[\u4e00-\u9fff]/.test(sample)) return 'zh';
  if (/[\u3040-\u30ff]/.test(sample)) return 'ja';
  if (/[\uac00-\ud7af]/.test(sample)) return 'ko';
  if (/[\u0600-\u06ff]/.test(sample)) return 'ar';
  if (/[\u0400-\u04ff]/.test(sample)) return 'ru';
  return 'en';
}

function estimateComplexity(text: string): number {
  const words = text.split(/\s+/);
  if (words.length === 0) return 0;
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;
  return clamp((avgWordLength / 10 + uniqueRatio) / 2, 0, 1);
}

function fallbackClassification(mimeType: string): ContentClassification {
  return {
    topics: [getBaseType(mimeType)],
    language: 'unknown',
    complexity: 0.5,
    contentType: getBaseType(mimeType),
  };
}

function fallbackQuality(): QualityAssessment {
  return { productionScore: 0.5 };
}

function fallbackSafety(): SafetyAssessment {
  return {
    adultContent: false,
    violence: false,
    copyrightRisk: 0,
    safetyScore: 0.5,
    flags: ['analysis_unavailable'],
    blocked: false,
    warnings: ['Safety analysis was not available — manual review recommended'],
  };
}

function fallbackProvenance(existingHash?: string): ContentProvenance {
  return {
    originalHash: existingHash || '',
    firstPublished: new Date().toISOString(),
    similarContentFound: false,
  };
}
