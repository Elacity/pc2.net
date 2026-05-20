import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { wasmSuccess, watermarkText } from './utils.js';

export class TextRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime.startsWith('text/');
  }

  async render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput> {
    const { effectiveBody, mime, maxWidth, page, ipfsService, buyerAddress, requestStart } = ctx;

    try {
      const wasmResult = await deps.renderViaWASM(effectiveBody, mime, maxWidth, page, ipfsService);
      if (wasmResult) {
        logger.info(
          `[SecureView] WASM rendered ${mime}: ${wasmResult.rendered.length} bytes (wasm: ${wasmResult.executionTimeMs}ms, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
        );
        return wasmSuccess(wasmResult);
      }
    } catch (wasmErr: any) {
      logger.warn(`[SecureView] WASM renderer failed, falling back to Node.js: ${wasmErr.message}`);
    }

    // Node.js Canvas fallback
    let canvasMod: any;
    let sharpMod: any;
    try {
      canvasMod = await import('canvas');
      const smod = await import('sharp');
      sharpMod = smod.default || smod;
    } catch {
      return { status: 500, errorBody: { error: 'Canvas/Sharp not available for text rendering' }, headers: {} };
    }

    const decryptedBytes = await deps.decryptAssetTwoLayer(effectiveBody, ipfsService);
    const { createCanvas } = canvasMod;
    const text = decryptedBytes.toString('utf8');
    decryptedBytes.fill(0);

    const fontSize = 14;
    const lineHeight = 20;
    const padding = 24;
    const canvasW = 640;
    const maxCharsPerLine = Math.floor((canvasW - padding * 2) / (fontSize * 0.6));
    const maxOutputLines = 2000;

    const wrappedLines: string[] = [];
    for (const rawLine of text.split('\n')) {
      if (wrappedLines.length >= maxOutputLines) break;
      if (rawLine.trim() === '') { wrappedLines.push(''); continue; }
      const words = rawLine.split(/\s+/);
      let current = '';
      for (const word of words) {
        if (wrappedLines.length >= maxOutputLines) break;
        if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
          wrappedLines.push(current);
          current = '';
        }
        if (word.length > maxCharsPerLine && current.length === 0) {
          for (let s = 0; s < word.length && wrappedLines.length < maxOutputLines; s += maxCharsPerLine) {
            wrappedLines.push(word.substring(s, s + maxCharsPerLine));
          }
          continue;
        }
        current = current.length > 0 ? `${current} ${word}` : word;
      }
      if (current.length > 0 && wrappedLines.length < maxOutputLines) wrappedLines.push(current);
    }

    const canvasH = Math.max(200, padding * 2 + wrappedLines.length * lineHeight);
    const cvs = createCanvas(canvasW, canvasH);
    const ctx2d = cvs.getContext('2d');

    ctx2d.fillStyle = '#1e1e1e';
    ctx2d.fillRect(0, 0, canvasW, canvasH);
    ctx2d.fillStyle = '#d4d4d4';
    ctx2d.font = `${fontSize}px monospace`;
    ctx2d.textBaseline = 'top';

    let y = padding;
    for (const line of wrappedLines) {
      if (y + lineHeight > canvasH - padding) break;
      ctx2d.fillText(line, padding, y);
      y += lineHeight;
    }

    const wm = watermarkText(buyerAddress);
    ctx2d.save();
    ctx2d.globalAlpha = 0.06;
    ctx2d.font = '16px monospace';
    ctx2d.fillStyle = '#aaa';
    ctx2d.translate(canvasW / 2, canvasH / 2);
    ctx2d.rotate(-Math.PI / 6);
    for (let wy = -canvasH; wy < canvasH; wy += 100) {
      for (let wx = -canvasW; wx < canvasW; wx += 260) {
        ctx2d.fillText(wm, wx, wy);
      }
    }
    ctx2d.restore();

    const pngBuf = cvs.toBuffer('image/png');
    const rendered = await sharpMod(pngBuf).jpeg({ quality: 85 }).toBuffer();

    logger.info(
      `[SecureView] Text rendered (fallback): ${rendered.length} bytes (${wrappedLines.length} lines, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
    );
    return { status: 200, contentType: 'image/jpeg', body: rendered, headers: { 'X-Renderer': 'nodejs-canvas' } };
  }
}
