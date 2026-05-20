import { logger } from '../../../utils/logger.js';
import type { ContentRenderer, RenderContext, RenderDeps, RenderOutput } from '../types.js';

export class AudioRenderer implements ContentRenderer {
  canHandle(mime: string): boolean {
    return mime.startsWith('audio/');
  }

  async render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput> {
    const { effectiveBody, mime, ipfsService, buyerAddress, requestStart } = ctx;
    const decryptedBytes = await deps.decryptAssetTwoLayer(effectiveBody, ipfsService);

    const body = Buffer.from(decryptedBytes);
    decryptedBytes.fill(0);

    logger.info(
      `[SecureView] Audio passthrough: ${mime}, ${body.length} bytes (total: ${Date.now() - requestStart}ms) for ${buyerAddress}`,
    );
    return {
      status: 200,
      contentType: mime,
      body,
      headers: { 'X-Renderer': 'passthrough', 'X-Asset-Type': 'audio' },
    };
  }
}
