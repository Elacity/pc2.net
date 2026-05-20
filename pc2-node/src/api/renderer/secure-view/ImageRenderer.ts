import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { wasmSuccess, watermarkText } from './utils.js';

export class ImageRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime.startsWith('image/');
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

    // Node.js Sharp fallback
    let sharpMod: any;
    try {
      const mod = await import('sharp');
      sharpMod = mod.default || mod;
    } catch {
      return { status: 500, errorBody: { error: 'Sharp not available for image rendering' }, headers: {} };
    }

    const decryptedBytes = await deps.decryptAssetTwoLayer(effectiveBody, ipfsService);
    try {
      const wm = watermarkText(buyerAddress);
      const timestamp = new Date().toISOString().split('T')[0];
      const metadata = await sharpMod(decryptedBytes).metadata();
      const imgW = Math.min(metadata.width || 800, maxWidth);
      const imgH = metadata.height ? Math.round(metadata.height * (imgW / (metadata.width || 800))) : 600;

      const watermarkSvg = Buffer.from(
        `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="wm" x="0" y="0" width="320" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
              <text x="10" y="30" font-family="monospace" font-size="13" fill="rgba(255,255,255,0.18)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5">${wm}</text>
              <text x="10" y="52" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.12)">${timestamp}</text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm)"/>
        </svg>`,
      );

      const rendered = await sharpMod(decryptedBytes)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .composite([{ input: watermarkSvg, gravity: 'centre' }])
        .jpeg({ quality: 82 })
        .toBuffer();

      decryptedBytes.fill(0);
      logger.info(
        `[SecureView] Image rendered (fallback): ${rendered.length} bytes (${imgW}x${imgH}, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
      );
      return { status: 200, contentType: 'image/jpeg', body: rendered, headers: { 'X-Renderer': 'nodejs-sharp' } };
    } catch (err) {
      decryptedBytes.fill(0);
      throw err;
    }
  }
}
