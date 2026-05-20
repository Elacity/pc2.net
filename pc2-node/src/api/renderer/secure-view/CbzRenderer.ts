import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { wasmSuccess } from './utils.js';

export class CbzRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime === 'application/vnd.comicbook+zip' || mime === 'application/x-cbz';
  }

  async render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput> {
    const { effectiveBody, mime, maxWidth, page, ipfsService, buyerAddress, requestStart } = ctx;

    try {
      const wasmResult = await deps.renderViaWASM(effectiveBody, mime, maxWidth, page, ipfsService);
      if (!wasmResult) throw new Error('WASM renderer produced no output');

      logger.info(
        `[SecureView] WASM rendered CBZ: ${wasmResult.rendered.length} bytes (wasm: ${wasmResult.executionTimeMs}ms, total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
      );
      return wasmSuccess(wasmResult);
    } catch (wasmErr: any) {
      return { status: 500, errorBody: { error: `Comic render failed: ${wasmErr.message}` }, headers: {} };
    }
  }
}
