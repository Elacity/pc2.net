import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { buildWasmHeaders } from './utils.js';

const EPUB_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';";

export class EpubRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime === 'application/epub+zip' || mime === 'application/epub';
  }

  async render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput> {
    const { effectiveBody, mime, maxWidth, page, chapter, viewportWidth, ipfsService, buyerAddress, requestStart } = ctx;

    try {
      const wasmResult = await deps.renderViaWASM(
        effectiveBody, mime, maxWidth, page, ipfsService, chapter, viewportWidth,
      );

      if (!wasmResult) throw new Error('WASM renderer produced no output');

      // Pre-paginated EPUB: client must retry each chapter as pixel-lock.
      if (wasmResult.fixedLayout && wasmResult.rendered.length === 0) {
        logger.info(
          `[SecureView] EPUB fixed-layout detected (${wasmResult.totalChapters} chapters) for ${buyerAddress}`,
        );
        return {
          status: 409,
          errorBody: {
            error: 'epub-fixed-layout',
            message: 'Pre-paginated EPUB detected — use pixel-lock tier per chapter.',
            totalChapters: wasmResult.totalChapters || 0,
          },
          headers: buildWasmHeaders(wasmResult, { 'X-Asset-Layout': 'fixed' }),
        };
      }

      logger.info(
        `[SecureView] WASM rendered EPUB: ${wasmResult.rendered.length} bytes (wasm: ${wasmResult.executionTimeMs}ms, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
      );
      return {
        status: 200,
        contentType: wasmResult.contentType,
        body: wasmResult.rendered,
        headers: buildWasmHeaders(wasmResult, { 'Content-Security-Policy': EPUB_CSP }),
      };
    } catch (wasmErr: any) {
      return { status: 500, errorBody: { error: `Ebook render failed: ${wasmErr.message}` }, headers: {} };
    }
  }
}
