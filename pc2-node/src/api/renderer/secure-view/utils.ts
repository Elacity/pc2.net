import type { WASMRenderResult, RenderOutput } from '../types.js';

/**
 * Build the common X-* response headers from a WASM render result.
 * Extra headers (e.g. CSP, X-Asset-Layout) are merged on top.
 */
export function buildWasmHeaders(
  result: WASMRenderResult,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { 'X-Renderer': 'wasm' };
  if (result.totalPages) headers['X-Asset-Pages'] = String(result.totalPages);
  if (result.totalChapters) headers['X-Asset-Chapters'] = String(result.totalChapters);
  if (result.epubTitle) headers['X-Asset-Title'] = encodeURIComponent(result.epubTitle);
  if (result.epubAuthor) headers['X-Asset-Author'] = encodeURIComponent(result.epubAuthor);
  if (result.chapters?.length) {
    headers['X-Asset-TOC'] = Buffer.from(JSON.stringify(result.chapters), 'utf8').toString('base64');
  }
  return { ...headers, ...extra };
}

/** Wrap a WASM render result into a successful RenderOutput. */
export function wasmSuccess(result: WASMRenderResult, extraHeaders: Record<string, string> = {}): RenderOutput {
  return {
    status: 200,
    contentType: result.contentType,
    body: result.rendered,
    headers: buildWasmHeaders(result, extraHeaders),
  };
}

/** Build a truncated watermark string from a buyer address. */
export function watermarkText(buyerAddress: string): string {
  return `${buyerAddress.substring(0, 10)}...${buyerAddress.substring(buyerAddress.length - 6)}`;
}
