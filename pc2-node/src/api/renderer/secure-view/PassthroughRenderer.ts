import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';

const PASSTHROUGH_PREFIXES = ['model/', 'font/'];
const PASSTHROUGH_EXACT = new Set([
  'text/csv',
  'text/tab-separated-values',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/vnd.ms-fontobject',
]);

export class PassthroughRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return PASSTHROUGH_PREFIXES.some(p => mime.startsWith(p)) || PASSTHROUGH_EXACT.has(mime);
  }

  async render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput> {
    const { effectiveBody, mime, ipfsService, buyerAddress, requestStart } = ctx;
    const decryptedBytes = await deps.decryptAssetTwoLayer(effectiveBody, ipfsService);

    const body = Buffer.from(decryptedBytes);
    decryptedBytes.fill(0);

    logger.info(
      `[SecureView] Passthrough: ${mime}, ${body.length} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
    );
    return {
      status: 200,
      contentType: mime,
      body,
      headers: { 'X-Renderer': 'passthrough', 'X-Asset-Type': mime.split('/')[0] },
    };
  }
}
