import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { wasmSuccess, watermarkText } from './utils.js';

export class PdfRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime === 'application/pdf';
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

    // Node.js PDF.js + Canvas fallback
    let pdfjsMod: any;
    let canvasMod: any;
    let sharpMod: any;
    try {
      pdfjsMod = await import('pdfjs-dist/legacy/build/pdf.mjs');
      canvasMod = await import('canvas');
      const smod = await import('sharp');
      sharpMod = smod.default || smod;
    } catch (e: any) {
      logger.error('[SecureView] Error loading PDF.js/Canvas/Sharp:', e);
      return { status: 500, errorBody: { error: 'PDF.js/Canvas/Sharp not available for PDF rendering' }, headers: {} };
    }

    const decryptedBytes = await deps.decryptAssetTwoLayer(effectiveBody, ipfsService);
    try {
      const { createCanvas, registerFont } = canvasMod;
      const uint8 = new Uint8Array(decryptedBytes);

      const pdfjsResolved = fileURLToPath(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
      const fontDir = join(dirname(pdfjsResolved), '..', '..', 'standard_fonts');

      if (registerFont) {
        const fonts = [
          { file: 'LiberationSans-Regular.ttf', family: 'LiberationSans' },
          { file: 'LiberationSans-Bold.ttf', family: 'LiberationSans', weight: 'bold' },
          { file: 'LiberationSans-Italic.ttf', family: 'LiberationSans', style: 'italic' },
          { file: 'LiberationSans-BoldItalic.ttf', family: 'LiberationSans', weight: 'bold', style: 'italic' },
        ];
        for (const f of fonts) {
          try { registerFont(join(fontDir, f.file), { family: f.family, weight: f.weight, style: f.style }); } catch { /* already registered */ }
        }
      }

      class NodeCanvasFactory {
        create(w: number, h: number) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }
        reset(cc: any, w: number, h: number) { cc.canvas.width = w; cc.canvas.height = h; }
        destroy(cc: any) { cc.canvas.width = 0; cc.canvas.height = 0; }
      }

      const pdfDoc = await pdfjsMod.getDocument({
        data: uint8,
        canvasFactory: new NodeCanvasFactory(),
        useSystemFonts: true,
        disableFontFace: true,
      }).promise;

      const totalPages = pdfDoc.numPages;
      const requestedPage = Math.max(1, Math.min(page || 1, totalPages));
      const pdfPage = await pdfDoc.getPage(requestedPage);
      const viewport = pdfPage.getViewport({ scale: 1.0 });
      const scale = Math.min(maxWidth / viewport.width, 2.0);
      const scaledVp = pdfPage.getViewport({ scale });

      const cvs = createCanvas(scaledVp.width, scaledVp.height);
      const ctx2d = cvs.getContext('2d');
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(0, 0, scaledVp.width, scaledVp.height);
      await pdfPage.render({ canvasContext: ctx2d, viewport: scaledVp }).promise;

      const textContent = await pdfPage.getTextContent();
      ctx2d.fillStyle = '#000000';
      for (const item of textContent.items as any[]) {
        if (!item.str || !item.transform) continue;
        const tx = item.transform;
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) * scale;
        ctx2d.font = `${fontSize}px LiberationSans, Helvetica, Arial, sans-serif`;
        ctx2d.fillText(item.str, tx[4] * scale, scaledVp.height - tx[5] * scale);
      }

      const wm = watermarkText(buyerAddress);
      ctx2d.save();
      ctx2d.globalAlpha = 0.08;
      ctx2d.font = '18px monospace';
      ctx2d.fillStyle = '#888';
      ctx2d.translate(scaledVp.width / 2, scaledVp.height / 2);
      ctx2d.rotate(-Math.PI / 6);
      for (let y = -scaledVp.height; y < scaledVp.height; y += 120) {
        for (let x = -scaledVp.width; x < scaledVp.width; x += 280) {
          ctx2d.fillText(wm, x, y);
        }
      }
      ctx2d.restore();

      const pngBuf = cvs.toBuffer('image/png');
      decryptedBytes.fill(0);
      const rendered = await sharpMod(pngBuf).jpeg({ quality: 85 }).toBuffer();

      logger.info(
        `[SecureView] PDF page ${requestedPage}/${totalPages} rendered: ${rendered.length} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
      );
      return {
        status: 200,
        contentType: 'image/jpeg',
        body: rendered,
        headers: {
          'X-Renderer': 'nodejs-pdfjs',
          'X-Asset-Pages': String(totalPages),
          'X-Asset-Page': String(requestedPage),
        },
      };
    } catch (err) {
      decryptedBytes.fill(0);
      throw err;
    }
  }
}
