export type LitBackend = 'chipotle' | 'datil';

export interface DecryptParams {
  litCiphertext: string;
  dataToEncryptHash: string;
  iv: string;
  encryptedDataCid: string;
  kid: string;
  actionCid?: string;
  authority?: string;
  chain?: string;
  chainId?: number;
  rpc?: string;
  buyerAddress: string;
  litBackend?: LitBackend;
  /** V3 protection data: PKP issuer address (checksummed). Optional for legacy assets. */
  issuer?: string;
  /** V3 protection data: PKP signature over composite hash. Optional for legacy assets. */
  signature?: string;
}

export interface CEKRecoveryResult {
  cekBase64: string;
  encryptedBytes: Buffer;
}

export interface WASMRenderResult {
  contentType: string;
  rendered: Buffer;
  totalPages?: number;
  executionTimeMs: number;
  /** EPUB: total spine chapters. */
  totalChapters?: number;
  /** EPUB: table of contents (cached on first chapter request). */
  chapters?: Array<{ title: string; chapter_index: number; href: string }>;
  /** EPUB: `true` when rendition:layout=pre-paginated (fall back to pixel-lock). */
  fixedLayout?: boolean;
  /** EPUB: publication title from OPF metadata. */
  epubTitle?: string;
  /** EPUB: publication author from OPF metadata. */
  epubAuthor?: string;
}

// ── Secure-View renderer contracts ───────────────────────────────────

export interface RenderContext {
  effectiveBody: DecryptParams;
  mime: string;
  maxWidth: number;
  page?: number;
  chapter?: number;
  viewportWidth?: number;
  buyerAddress: string;
  ipfsService: any;
  requestStart: number;
}

export interface RenderOutput {
  /** HTTP status code. */
  status: number;
  /** Content-Type for 2xx responses. */
  contentType?: string;
  /** Binary body for 2xx responses. */
  body?: Buffer;
  /** JSON body for non-2xx responses. */
  errorBody?: unknown;
  /** Additional response headers (X-Renderer, X-Asset-Pages, CSP, etc.). */
  headers: Record<string, string>;
}

/** Rendering dependencies injected by the route handler to avoid circular imports. */
export interface RenderDeps {
  renderViaWASM(
    params: DecryptParams,
    mime: string,
    maxWidth: number,
    page?: number,
    ipfsService?: any,
    chapter?: number,
    viewportWidth?: number,
  ): Promise<WASMRenderResult | null>;
  decryptAssetTwoLayer(params: DecryptParams, ipfsService?: any): Promise<Buffer>;
}

export interface ContentRenderer {
  canHandle(mime: string): boolean;
  render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput>;
}
