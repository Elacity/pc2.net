import type { ContentRenderer } from '../types.js';
import { ImageRenderer } from './ImageRenderer.js';
import { PdfRenderer } from './PdfRenderer.js';
import { TextRenderer } from './TextRenderer.js';
import { EpubRenderer } from './EpubRenderer.js';
import { CbzRenderer } from './CbzRenderer.js';
import { CodeRenderer } from './CodeRenderer.js';
import { AudioRenderer } from './AudioRenderer.js';
import { PassthroughRenderer } from './PassthroughRenderer.js';

/**
 * Ordered renderer registry for /lit/secure-view.
 *
 * Evaluation order matters: more specific MIME checks (exact match) must
 * come before prefix checks to avoid, e.g., EpubRenderer shadowing a
 * hypothetical broader application/* renderer.
 *
 * Current priority:
 *   EPUB > CBZ > PDF > Code types > Image > Text > Audio > Passthrough
 */
const RENDERERS: readonly ContentRenderer[] = [
  new EpubRenderer(),
  new CbzRenderer(),
  new PdfRenderer(),
  new CodeRenderer(),
  new ImageRenderer(),
  new TextRenderer(),
  new AudioRenderer(),
  new PassthroughRenderer(),
];

/**
 * Return the first renderer that declares it can handle the given MIME type,
 * or `null` if no renderer matches (caller should respond 415).
 */
export function resolveRenderer(mime: string): ContentRenderer | null {
  return RENDERERS.find(r => r.canHandle(mime)) ?? null;
}
