import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';
import { wasmSuccess } from './utils.js';

const CODE_MIME_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/toml',
  'application/x-sh',
]);

export class CodeRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return CODE_MIME_TYPES.has(mime);
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
      logger.warn(`[SecureView] WASM renderer failed for code type ${mime}: ${wasmErr.message}`);
    }

    // No Node.js fallback for code types — preserve existing behaviour.
    return {
      status: 415,
      errorBody: {
        error: `Secure viewing not yet supported for ${mime}. Use /lit/decrypt for raw access.`,
        mimeType: mime,
      },
      headers: {},
    };
  }
}
