/**
 * ContentIndexerService
 *
 * Scans Base chain for Elacity content events (ChannelCreated, DigitalAssetRegistered,
 * AssetCreated) and builds a local content catalog in SQLite. This replaces the
 * dependency on Elacity's centralized GraphQL API for content discovery.
 *
 * Design: versioned contract support — when v3 contracts deploy, add a new entry
 * to config.content_indexer.contracts and the indexer picks them up automatically.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';
import type { Config } from '../config/loader.js';
import type { DatabaseManager, ContentCatalogItem } from '../storage/database.js';
import type { IPFSStorage } from '../storage/ipfs.js';
import { getWASMRuntime } from './wasm/WASMRuntime.js';
import type WASMRuntime from './wasm/WASMRuntime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MULTICALL_WASM_PATH = pathResolve(__dirname, '../../wasm-apps/evm-multicall/evm-multicall.wasm');
let cachedMulticallWasm: ArrayBuffer | null = null;

function loadMulticallWasm(): ArrayBuffer {
  if (cachedMulticallWasm) return cachedMulticallWasm;
  if (!existsSync(MULTICALL_WASM_PATH)) {
    throw new Error(`evm-multicall WASM not found: ${MULTICALL_WASM_PATH}`);
  }
  cachedMulticallWasm = readFileSync(MULTICALL_WASM_PATH).buffer;
  return cachedMulticallWasm;
}

const log = createLogger('content-indexer');

interface IndexerConfig {
  enabled: boolean;
  scanIntervalMinutes: number;
  rpcUrls: string[];
  maxBlocksPerScan: number;
  metadataFetchConcurrency: number;
  metadataGatewayUrls: string[];
  contracts: Record<string, ContractVersionConfig>;
}

interface ContractVersionConfig {
  channelFactory?: string;
  centralStorage?: string;
  authorityGateway?: string;
  eventHub?: string;
  fromBlock: number;
}

// Precomputed keccak256 topic hashes for contract events
const TOPICS = {
  ChannelCreated: '0x4ae6ef95ddade103ca67593cd4cf68dda177aa1054ad4eeb4963d2c3df44702e',
  DigitalAssetRegistered: '0x1b24f7763272894608506beba5887c374d345cd231bf52bd03f40bc2d0508d7b',
  AssetCreated: '0xc0a995e4052be044599af577ab2f3382d67bd34df95a76226e7c464e9d4dba46',
} as const;

const TOKEN_URI_SELECTOR = '0xc87b56dd';

// AuthorityGateway function selectors (precomputed from keccak256 of signature)
//   sellersOf(address operative, uint256 tokenId) → address[]
//   listings(address operative, uint256 tokenId, address seller) → (uint256, uint256, address)
const SELLERS_OF_SELECTOR = '0x997eab2d';
const LISTINGS_SELECTOR = '0x6bd3a64b';

// V3 access tokens always use this fixed operative-internal tokenId (TOKEN_ID_ACCESS).
// AuthorityGateway sellersOf/listings are queried against this id, NOT the
// content-hash tokenId from the ledger. See wallet.js for the same convention.
const ACCESS_TOKEN_ID = 1;

// Zero address — operative may be 0x000…000 for some legacy entries
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function toHex(n: number): string {
  return '0x' + n.toString(16);
}

function fromHex(hex: string): number {
  return parseInt(hex, 16);
}

function padAddress(hex: string): string {
  const clean = hex.toLowerCase().replace('0x', '');
  return '0x' + clean.padStart(64, '0');
}

function unpadAddress(hex: string): string {
  return '0x' + hex.slice(-40);
}

function padUint256(n: number): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

function decodeAbiString(hex: string): string {
  const clean = hex.replace('0x', '');
  if (clean.length < 128) return '';
  const offset = fromHex(clean.slice(0, 64));
  const dataStart = offset * 2;
  if (dataStart + 64 > clean.length) return '';
  const length = fromHex(clean.slice(dataStart, dataStart + 64));
  const strHex = clean.slice(dataStart + 64, dataStart + 64 + length * 2);
  const bytes = new Uint8Array(strHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
}

function classifyAssetType(mimeType: string | null | undefined): string {
  if (!mimeType) return 'unknown';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType === 'application/pdf') return 'document';
  if (['application/javascript', 'application/json', 'application/xml', 'application/x-yaml', 'application/toml', 'application/x-sh'].includes(mimeType)) return 'code';
  if (mimeType.includes('model') || mimeType.includes('gguf') || mimeType.includes('safetensors') || mimeType.includes('onnx')) return 'ai-model';
  if (mimeType.includes('font')) return 'font';
  if (mimeType.includes('gltf') || mimeType.includes('fbx') || mimeType.includes('obj')) return '3d';
  if (mimeType.includes('csv') || mimeType.includes('parquet') || mimeType.includes('jsonl')) return 'dataset';
  return 'other';
}

/**
 * Snapshot of indexer state for /api/catalog/indexer-status.
 * Lets the Elacity Market UI render a "Catalog indexing X%" banner
 * during the initial backfill window (15 min on a fresh install).
 */
export interface IndexerStatusSnapshot {
  enabled: boolean;
  scanning: boolean;
  lastChainBlock: number;
  lastScanCompletedAt: number | null;
  isInitialBackfill: boolean;
  versions: Record<string, {
    fromBlock: number;
    lastScannedBlock: number;
    blocksRemaining: number;
    progressPct: number;
    isBackfilled: boolean;
    lastScanInserted: number;
    lastScanErrors: number;
  }>;
  estimatedSecondsRemaining: number | null;
}

export class ContentIndexerService {
  private db: DatabaseManager | null = null;
  private ipfs: IPFSStorage | null = null;
  private wasmRuntime: WASMRuntime | null = null;
  private config: IndexerConfig;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private isScanning = false;
  private currentRpcIndex = 0;

  /**
   * v1.2.7.3: live state snapshot for the new /api/catalog/indexer-status
   * endpoint. Updated on every scan cycle so the market UI can render a
   * "Catalog indexing X%" banner during the 15-minute fresh-install warmup.
   * Also tracks per-scan error counts so a future silent-failure-mode
   * (like the pre-Migration-32 channel_metadata bug) gets noticed immediately.
   */
  private lastChainBlock = 0;
  private lastScanCompletedAt: number | null = null;
  private versionStats: Record<string, { lastScanInserted: number; lastScanErrors: number }> = {};

  constructor(rawConfig: Config) {
    const c = rawConfig.content_indexer ?? {};
    const sharedRpcUrls = rawConfig.blockchain?.rpc_urls;
    this.config = {
      enabled: c.enabled ?? true,
      scanIntervalMinutes: c.scan_interval_minutes ?? 30,
      rpcUrls: c.rpc_urls ?? sharedRpcUrls ?? ['https://mainnet.base.org'],
      maxBlocksPerScan: c.max_blocks_per_scan ?? 10000,
      metadataFetchConcurrency: c.metadata_fetch_concurrency ?? 3,
      metadataGatewayUrls: c.metadata_gateway_urls ?? ['https://ipfs.ela.city/ipfs/', 'https://dweb.link/ipfs/'],
      contracts: {},
    };

    if (c.contracts) {
      for (const [version, cfg] of Object.entries(c.contracts)) {
        this.config.contracts[version] = {
          channelFactory: cfg.channel_factory ?? cfg.channel_core,
          centralStorage: cfg.central_storage ?? cfg.core_storage,
          authorityGateway: cfg.authority_gateway,
          eventHub: cfg.event_hub,
          fromBlock: cfg.from_block ?? 0,
        };
      }
    }
  }

  initialize(db: DatabaseManager, ipfs?: IPFSStorage | null, wasmRuntime?: WASMRuntime): void {
    this.db = db;
    this.ipfs = ipfs ?? null;

    try {
      // Phase 2-C: prefer constructor-injected wasmRuntime (explicit
      // dependency); fall back to getWASMRuntime() ambient singleton only
      // if not provided, preserving legacy behavior for callers that
      // haven't migrated yet.
      this.wasmRuntime = wasmRuntime ?? getWASMRuntime();
      loadMulticallWasm();
      log.info('WASM ABI decoder loaded (evm-multicall)');
    } catch (error: any) {
      log.warn(`WASM ABI decoder not available, using JS fallback: ${error.message}`);
    }

    if (!this.config.enabled) {
      log.info('Content indexer disabled in config');
      return;
    }

    if (Object.keys(this.config.contracts).length === 0) {
      log.warn('No contracts configured for content indexer');
      return;
    }

    log.info(`Content indexer initialized (scan every ${this.config.scanIntervalMinutes}m, ${Object.keys(this.config.contracts).length} contract version(s))`);

    setTimeout(() => this.runScanCycle(), 5000);

    this.scanTimer = setInterval(
      () => this.runScanCycle(),
      this.config.scanIntervalMinutes * 60 * 1000
    );
  }

  shutdown(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    log.info('Content indexer shut down');
  }

  getStats(): { enabled: boolean; config: IndexerConfig; scanning: boolean } {
    return { enabled: this.config.enabled, config: this.config, scanning: this.isScanning };
  }

  /**
   * v1.2.7.3: live indexer state for the /api/catalog/indexer-status endpoint.
   * Used by the Elacity Market UI to render a "Catalog indexing X%" progress
   * banner during the 15-minute fresh-install warmup window.
   *
   * Estimation assumes the same throughput we observed on a Mac during the
   * v1.2.7.2 smoke test: ~1.6M blocks / 15 min = ~110k blocks per minute on
   * public Base RPCs. Conservative — slower hardware will overshoot the
   * estimate but we never want to under-promise.
   */
  getIndexerStatus(): IndexerStatusSnapshot {
    const versions: IndexerStatusSnapshot['versions'] = {};
    let isInitialBackfill = false;
    let totalBlocksRemaining = 0;

    if (this.db) {
      for (const [version, cfg] of Object.entries(this.config.contracts)) {
        const lastScannedRaw = this.db.getSetting(`indexer_last_block_${version}`) || '0';
        const lastScannedBlock = parseInt(lastScannedRaw, 10) || 0;
        const isBackfilled = this.db.getSetting(`indexer_channels_backfilled_${version}`) === '1';

        const fromBlock = cfg.fromBlock;
        const head = this.lastChainBlock || lastScannedBlock || fromBlock;
        const totalBlocks = Math.max(0, head - fromBlock);
        const scanned = Math.max(0, lastScannedBlock - fromBlock);
        const blocksRemaining = Math.max(0, head - Math.max(lastScannedBlock, fromBlock));
        const progressPct = totalBlocks > 0 ? Math.min(100, (scanned / totalBlocks) * 100) : 0;

        if (!isBackfilled || lastScannedBlock < head - this.config.maxBlocksPerScan) {
          isInitialBackfill = true;
        }
        totalBlocksRemaining += blocksRemaining;

        const stats = this.versionStats[version] || { lastScanInserted: 0, lastScanErrors: 0 };

        versions[version] = {
          fromBlock,
          lastScannedBlock,
          blocksRemaining,
          progressPct: Math.round(progressPct * 10) / 10,
          isBackfilled,
          lastScanInserted: stats.lastScanInserted,
          lastScanErrors: stats.lastScanErrors,
        };
      }
    }

    // ~110k blocks/min on public Base RPCs (observed). Round to whole seconds.
    const estimatedSecondsRemaining = totalBlocksRemaining > 0
      ? Math.ceil((totalBlocksRemaining / 110000) * 60)
      : null;

    return {
      enabled: this.config.enabled,
      scanning: this.isScanning,
      lastChainBlock: this.lastChainBlock,
      lastScanCompletedAt: this.lastScanCompletedAt,
      isInitialBackfill,
      versions,
      estimatedSecondsRemaining,
    };
  }

  /**
   * Run a scan cycle immediately (out-of-band). Called by API after user actions
   * (channel creation, mint) so users don't wait up to scanIntervalMinutes to see
   * their own content. Safe to call repeatedly — isScanning guard prevents overlap.
   */
  async triggerScan(): Promise<{ started: boolean; reason?: string }> {
    if (!this.config.enabled) return { started: false, reason: 'indexer_disabled' };
    if (this.isScanning) return { started: false, reason: 'already_scanning' };
    // Fire-and-forget so HTTP caller gets a fast response
    this.runScanCycle().catch(err => log.error(`Triggered scan failed: ${err.message}`));
    return { started: true };
  }

  // ── RPC helpers ────────────────────────────────────────────

  private getRpcUrl(): string {
    return this.config.rpcUrls[this.currentRpcIndex % this.config.rpcUrls.length];
  }

  private rotateRpc(): void {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.config.rpcUrls.length;
    log.debug(`Rotated to RPC: ${this.getRpcUrl()}`);
  }

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const maxAttempts = this.config.rpcUrls.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(this.getRpcUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`RPC HTTP ${response.status}`);
        }

        const json = await response.json() as any;
        if (json.error) {
          throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
        }

        return json.result;
      } catch (error: any) {
        lastError = error;
        log.debug(`RPC call failed on ${this.getRpcUrl()}: ${error.message}`);
        this.rotateRpc();
      }
    }

    throw lastError || new Error('All RPC endpoints failed');
  }

  private async getLatestBlock(): Promise<number> {
    const result = await this.rpcCall('eth_blockNumber', []);
    return fromHex(result);
  }

  private async getLogs(address: string | string[], topics: (string | null)[], fromBlock: number, toBlock: number): Promise<any[]> {
    return this.rpcCall('eth_getLogs', [{
      address,
      topics,
      fromBlock: toHex(fromBlock),
      toBlock: toHex(toBlock),
    }]);
  }

  private async ethCall(to: string, data: string): Promise<string> {
    return this.rpcCall('eth_call', [{ to, data }, 'latest']);
  }

  // ── WASM ABI decoder ─────────────────────────────────────────

  private async abiDecode(dataHex: string, types: string[]): Promise<string[] | null> {
    if (!this.wasmRuntime || !cachedMulticallWasm) return null;

    try {
      const command = JSON.stringify({ mode: 'abi_decode', data: dataHex, types });
      const result = await this.wasmRuntime.executeMulticall(cachedMulticallWasm, command, { timeoutMs: 5000 });
      if (result.success && result.values) {
        return result.values;
      }
      log.debug(`WASM abi_decode failed: ${result.error}`);
      return null;
    } catch {
      return null;
    }
  }

  // ── Listing price fetcher (AuthorityGateway sellersOf + listings) ──
  //
  // For each PAID asset (op_type > 0), query the AuthorityGateway to find the
  // current cheapest active listing of its access token. Stores the lowest
  // pricePerToken + payToken into the catalog row's price/payment_token columns
  // so feed cards can display real prices instead of just "Buy & Resell" tier
  // labels.
  //
  // Skipped for: op_type=0 (free), zero operative address (no business model),
  // and rows with metadata_status != 'resolved' (stay aligned with the rest of
  // the indexer's "only operate on resolved rows" invariant).
  //
  // Listings change over time (sellers list/delist/reprice), so this runs every
  // scan cycle after metadata resolution to keep prices fresh.

  private decodeAddressArray(hex: string): string[] {
    const clean = (hex || '').replace('0x', '');
    if (clean.length < 128) return [];
    const offset = fromHex(clean.slice(0, 64));
    const dataStart = offset * 2;
    if (dataStart + 64 > clean.length) return [];
    const length = fromHex(clean.slice(dataStart, dataStart + 64));
    const arr: string[] = [];
    for (let i = 0; i < length; i++) {
      const start = dataStart + 64 + i * 64;
      if (start + 64 > clean.length) break;
      arr.push(unpadAddress('0x' + clean.slice(start, start + 64)));
    }
    return arr;
  }

  private decodeListing(hex: string): { quantity: bigint; pricePerToken: bigint; payToken: string } | null {
    const clean = (hex || '').replace('0x', '');
    if (clean.length < 192) return null;
    try {
      const quantity = BigInt('0x' + clean.slice(0, 64));
      const pricePerToken = BigInt('0x' + clean.slice(64, 128));
      const payToken = unpadAddress('0x' + clean.slice(128, 192));
      return { quantity, pricePerToken, payToken };
    } catch {
      return null;
    }
  }

  private encodeSellersOfCall(operativeAddress: string, tokenId: number): string {
    return SELLERS_OF_SELECTOR +
      padAddress(operativeAddress).slice(2) +
      padUint256(tokenId).slice(2);
  }

  private encodeListingsCall(operativeAddress: string, tokenId: number, sellerAddress: string): string {
    return LISTINGS_SELECTOR +
      padAddress(operativeAddress).slice(2) +
      padUint256(tokenId).slice(2) +
      padAddress(sellerAddress).slice(2);
  }

  /**
   * Fetch the cheapest active listing for a given operative's access token
   * via the AuthorityGateway. Returns { price, paymentToken } as strings, or
   * { price: null, paymentToken: null } if no active listing exists or if any
   * RPC call fails (transient — will retry next cycle).
   *
   * Both values are returned as decimal strings (not bigint / not hex) since
   * the catalog row's price column is TEXT and we want safe round-trip without
   * losing precision on values larger than Number.MAX_SAFE_INTEGER.
   */
  private async fetchLowestListing(
    authorityGatewayAddress: string,
    operativeAddress: string,
  ): Promise<{ price: string | null; paymentToken: string | null }> {
    const empty = { price: null, paymentToken: null };
    if (!operativeAddress || operativeAddress.toLowerCase() === ZERO_ADDRESS) return empty;

    try {
      const sellersData = this.encodeSellersOfCall(operativeAddress, ACCESS_TOKEN_ID);
      const sellersResult = await this.ethCall(authorityGatewayAddress, sellersData);
      if (!sellersResult || sellersResult === '0x') return empty;

      const sellers = this.decodeAddressArray(sellersResult);
      if (sellers.length === 0) return empty;

      let lowestPrice: bigint | null = null;
      let lowestPayToken: string | null = null;

      for (const seller of sellers) {
        try {
          const listingData = this.encodeListingsCall(operativeAddress, ACCESS_TOKEN_ID, seller);
          const listingResult = await this.ethCall(authorityGatewayAddress, listingData);
          if (!listingResult || listingResult === '0x') continue;

          const listing = this.decodeListing(listingResult);
          if (!listing || listing.quantity === BigInt(0)) continue;

          if (lowestPrice === null || listing.pricePerToken < lowestPrice) {
            lowestPrice = listing.pricePerToken;
            lowestPayToken = listing.payToken;
          }
        } catch (err: any) {
          log.debug(`Listing query failed for ${operativeAddress}/${seller}: ${err.message}`);
        }
      }

      if (lowestPrice === null || lowestPayToken === null) return empty;

      return { price: lowestPrice.toString(), paymentToken: lowestPayToken };
    } catch (err: any) {
      log.debug(`sellersOf failed for ${operativeAddress}: ${err.message}`);
      return empty;
    }
  }

  /**
   * Refresh price/payment_token columns for all paid catalog rows. Runs after
   * metadata resolution in each scan cycle so the feed always sees current
   * prices. Concurrency-limited (matches metadata fetch concurrency) to stay
   * gentle on the RPC budget — even with 1k paid assets this completes well
   * within the scan-interval window.
   */
  private async refreshListingsForPaidAssets(): Promise<void> {
    if (!this.db) return;

    // The AuthorityGateway address is per contract version. Today we ship one
    // (v3) but iterate explicitly so future versions Just Work.
    const authorityByVersion: Record<string, string> = {};
    for (const [version, cfg] of Object.entries(this.config.contracts)) {
      if (cfg.authorityGateway) authorityByVersion[version] = cfg.authorityGateway;
    }
    if (Object.keys(authorityByVersion).length === 0) {
      log.debug('No authority_gateway configured — skipping listing refresh');
      return;
    }

    const rows = this.db.getPaidCatalogItemsForListingRefresh(500);
    if (rows.length === 0) return;

    log.info(`Refreshing listings for ${rows.length} paid asset(s)...`);

    const concurrency = Math.max(1, this.config.metadataFetchConcurrency);
    let updated = 0;
    let cleared = 0;
    let unchanged = 0;

    for (let i = 0; i < rows.length; i += concurrency) {
      const chunk = rows.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (row) => {
          const authority = authorityByVersion[row.contract_version || 'v3'] ?? authorityByVersion.v3;
          if (!authority) return null;
          const { price, paymentToken } = await this.fetchLowestListing(authority, row.operative_address || '');
          return { row, price, paymentToken };
        }),
      );

      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const { row, price, paymentToken } = r.value;
        const prevPrice = row.price ?? null;
        const prevToken = row.payment_token ?? null;
        if (price === prevPrice && paymentToken === prevToken) {
          unchanged++;
          continue;
        }
        this.db.updateCatalogMetadata(row.channel_address, row.token_id, row.chain_id, {
          price,
          payment_token: paymentToken,
        });
        if (price === null) cleared++;
        else updated++;
      }
    }

    if (updated > 0 || cleared > 0) {
      log.info(`Listing refresh: ${updated} priced, ${cleared} cleared (unlisted), ${unchanged} unchanged`);
    }
  }

  // ── Scan cycle ─────────────────────────────────────────────

  private async runScanCycle(): Promise<void> {
    if (this.isScanning || !this.db) return;
    this.isScanning = true;

    try {
      const latestBlock = await this.getLatestBlock();
      this.lastChainBlock = latestBlock; // v1.2.7.3: cache for indexer-status API
      log.info(`Starting scan cycle (latest block: ${latestBlock})`);

      for (const [version, contractCfg] of Object.entries(this.config.contracts)) {
        await this.scanContractVersion(version, contractCfg, latestBlock);
      }

      await this.resolveMetadata();

      // Refresh listing prices for paid assets so feed cards show current prices
      // instead of just tier labels. Wrapped to never bring down a scan cycle.
      try {
        await this.refreshListingsForPaidAssets();
      } catch (err: any) {
        log.warn(`Listing refresh failed (non-fatal): ${err.message}`);
      }

      this.lastScanCompletedAt = Date.now(); // v1.2.7.3: timestamp for status API

      const stats = this.db.getCatalogStats();
      log.info(`Scan cycle complete — catalog: ${stats.total} total, ${stats.resolved} resolved, ${stats.pending} pending`);
    } catch (error: any) {
      // v1.2.7.2: silence the "Database not initialized" noise produced when
      // a scan races with shutdown (e.g. SIGKILL from the launcher closes
      // the DB while runScanCycle is mid-flight, then this finally block
      // tries to log against a closed handle). Real errors still log loud.
      const msg = String(error?.message || error);
      if (/database not initialized|database is closed|database connection is closed/i.test(msg)) {
        log.debug(`Scan cycle aborted — database shutting down (${msg})`);
      } else {
        log.error(`Scan cycle failed: ${msg}`);
      }
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * One-shot historical backfill for ChannelCreated events. Existing installs
   * running before Migration 28 only indexed channels implicitly via asset events,
   * leaving channel_metadata without creator_address. This scans the factory once
   * to retroactively populate those rows so the Creator app sees old channels.
   */
  private async backfillChannelsIfNeeded(version: string, cfg: ContractVersionConfig, latestBlock: number): Promise<void> {
    if (!this.db || !cfg.channelFactory) return;

    const backfillKey = `indexer_channels_backfilled_${version}`;
    if (this.db.getSetting(backfillKey) === '1') return;

    log.info(`[${version}] Running one-time ChannelCreated backfill from block ${cfg.fromBlock}…`);

    let totalInserted = 0;
    let totalErrors = 0;
    for (let from = cfg.fromBlock; from <= latestBlock; from += this.config.maxBlocksPerScan) {
      const to = Math.min(from + this.config.maxBlocksPerScan - 1, latestBlock);
      const result = await this.scanChannelCreated(cfg.channelFactory, version, from, to);
      totalInserted += result.inserted;
      totalErrors += result.errors;
    }

    // v1.2.7.3: don't stamp backfill complete if every event failed to insert.
    // Pre-32 we ALWAYS stamped, which let the missing-channel_metadata bug
    // permanently mark the catalog as "backfilled = 0 channels" and never retry.
    // Now: if we encountered events but none succeeded, leave the stamp off so
    // the next scan cycle (after the user fixes whatever's broken) retries.
    if (totalInserted === 0 && totalErrors > 0) {
      log.error(
        `[${version}] Backfill found ${totalErrors} ChannelCreated event(s) but ZERO were successfully indexed. ` +
        `This typically means a missing table (channel_metadata?) or schema mismatch — see warnings above for the first error. ` +
        `NOT marking backfill complete — will retry on next scan cycle so catalog auto-recovers once the underlying cause is fixed. ` +
        `Run /api/diagnose for full state.`
      );
      return;
    }

    this.db.setSetting(backfillKey, '1');
    if (totalErrors > 0) {
      log.warn(`[${version}] Backfill complete — indexed ${totalInserted} channel(s), but ${totalErrors} event(s) failed (see warnings above)`);
    } else {
      log.info(`[${version}] Backfill complete — indexed ${totalInserted} channel(s)`);
    }
  }

  private async scanContractVersion(version: string, cfg: ContractVersionConfig, latestBlock: number): Promise<void> {
    if (!this.db) return;

    // One-time backfill so pre-existing installs pick up all historical channels
    await this.backfillChannelsIfNeeded(version, cfg, latestBlock);

    const settingKey = `indexer_last_block_${version}`;
    const lastScanned = parseInt(this.db.getSetting(settingKey) || '0', 10);
    const startBlock = Math.max(lastScanned + 1, cfg.fromBlock);

    if (startBlock > latestBlock) {
      log.debug(`[${version}] Already up to date (block ${lastScanned})`);
      return;
    }

    const totalBlocks = latestBlock - startBlock;
    log.info(`[${version}] Scanning blocks ${startBlock} → ${latestBlock} (${totalBlocks} blocks)`);

    let scannedTo = startBlock - 1;
    let newAssets = 0;
    let newChannels = 0;
    let totalErrors = 0;

    for (let from = startBlock; from <= latestBlock; from += this.config.maxBlocksPerScan) {
      const to = Math.min(from + this.config.maxBlocksPerScan - 1, latestBlock);

      // Scan factory for new channels FIRST so they exist before any asset events
      // reference them. Critical for the Creator app UX (channels must be visible
      // immediately after creation, not only after first mint).
      if (cfg.channelFactory) {
        const channelResult = await this.scanChannelCreated(cfg.channelFactory, version, from, to);
        newChannels += channelResult.inserted;
        totalErrors += channelResult.errors;
      }

      const eventSource = cfg.eventHub ?? cfg.centralStorage;
      if (eventSource) {
        const legacyResult = await this.scanDigitalAssetRegistered(eventSource, version, from, to);
        const v3Result = await this.scanAssetCreated(eventSource, version, from, to);
        newAssets += legacyResult.inserted + v3Result.inserted;
        totalErrors += legacyResult.errors + v3Result.errors;
      }

      scannedTo = to;

      if (totalBlocks > this.config.maxBlocksPerScan) {
        const progress = ((to - startBlock) / totalBlocks * 100).toFixed(1);
        log.debug(`[${version}] Progress: ${progress}% (block ${to})`);
      }
    }

    this.db.setSetting(settingKey, String(scannedTo));

    // v1.2.7.3: track per-version stats for the indexer-status API
    this.versionStats[version] = { lastScanInserted: newChannels + newAssets, lastScanErrors: totalErrors };

    if (newChannels > 0 || newAssets > 0) {
      log.info(`[${version}] Indexed ${newChannels} new channel(s), ${newAssets} new asset(s) up to block ${scannedTo}`);
    }
  }

  /**
   * Scan V3 Channel Factory for ChannelCreated events.
   *
   * ChannelCreated(uint8 indexed channelType, uint8 indexed scope,
   *                address indexed creator, address channel, address factoryAddr)
   *
   *   topics[0] = event sig
   *   topics[1] = channelType (indexed)
   *   topics[2] = scope (indexed)
   *   topics[3] = creator (indexed)
   *   data = abi.encode(address channel, address factoryAddr)
   *
   * We do NOT fetch on-chain name() here (keeps scan fast at scale). Names are
   * resolved lazily by the API endpoint and cached — so even with 1M channels
   * the scan stays O(blocks) not O(channels * RPC calls).
   */
  private async scanChannelCreated(factoryAddress: string, version: string, fromBlock: number, toBlock: number): Promise<{ inserted: number; errors: number }> {
    if (!this.db) return { inserted: 0, errors: 0 };

    const logs = await this.getLogs(
      factoryAddress,
      [TOPICS.ChannelCreated],
      fromBlock,
      toBlock
    );

    let inserted = 0;
    let errors = 0;
    let firstError: string | null = null;

    for (const entry of logs) {
      try {
        if (!entry.topics || entry.topics.length < 4) continue;

        const creatorAddress = unpadAddress(entry.topics[3]);
        const blockNumber = fromHex(entry.blockNumber);

        const dataHex = entry.data ?? '0x';
        const data = dataHex.replace('0x', '');
        if (data.length < 64) continue;
        const channelAddress = unpadAddress('0x' + data.slice(0, 64));

        this.db.upsertChannelFromFactory({
          address: channelAddress,
          creator_address: creatorAddress,
          contract_version: version,
          block_number: blockNumber,
          tx_hash: entry.transactionHash || null,
        });

        inserted++;
      } catch (error: any) {
        // v1.2.7.3: surface swallowed errors. The pre-32 catch logged at
        // log.debug, which let the missing-channel_metadata bug stay
        // invisible — every ChannelCreated event silently failed to insert
        // and the indexer reported "0 channels found". Now: warn LOUDLY on
        // first error per scan so it appears in launcher logs / pc2-diagnose,
        // and emit a summary at end of scan if any failed.
        errors++;
        if (errors === 1) {
          firstError = error?.message || String(error);
          log.warn(`scanChannelCreated [${version}]: first error indexing ChannelCreated event (block ${entry.blockNumber}): ${firstError}`);
        }
        log.debug(`scanChannelCreated [${version}] error #${errors}: ${error?.message || error}`);
      }
    }

    if (errors > 0) {
      log.warn(
        `scanChannelCreated [${version}]: ${inserted} inserted, ${errors} failed (first error: ${firstError}). ` +
        `Likely missing tables, schema drift, or DB write contention. Check /api/diagnose.`
      );
    }

    return { inserted, errors };
  }

  private async scanDigitalAssetRegistered(eventSourceAddress: string, version: string, fromBlock: number, toBlock: number): Promise<{ inserted: number; errors: number }> {
    if (!this.db) return { inserted: 0, errors: 0 };

    const logs = await this.getLogs(
      eventSourceAddress,
      [TOPICS.DigitalAssetRegistered],
      fromBlock,
      toBlock
    );

    let inserted = 0;
    let errors = 0;
    let firstError: string | null = null;

    for (const entry of logs) {
      try {
        // DigitalAssetRegistered(address indexed channel, uint256 indexed tokenId,
        //   address creator, string tokenURI, uint16 opType, bytes16 contentId)
        const channelAddress = unpadAddress(entry.topics[1]);
        const tokenIdHex = entry.topics[2]; // keep as hex — uint256 overflows JS numbers
        const blockNumber = fromHex(entry.blockNumber);

        // Non-indexed params in data: creator (address), tokenURI (string), opType (uint16), contentId (bytes16)
        const data = entry.data?.replace('0x', '') ?? '';
        const creatorAddress = data.length >= 64 ? unpadAddress('0x' + data.slice(0, 64)) : '';

        if (this.db.catalogItemExists(channelAddress, tokenIdHex, 8453)) {
          continue;
        }

        const item: ContentCatalogItem = {
          content_id: null,
          channel_address: channelAddress,
          token_id: tokenIdHex,
          operative_address: '',
          creator_address: creatorAddress,
          name: null,
          description: null,
          image_url: null,
          content_cid: null,
          metadata_cid: null,
          mime_type: null,
          asset_type: null,
          price: null,
          payment_token: null,
          op_type: null,
          chain_id: 8453,
          block_number: blockNumber,
          tx_hash: entry.transactionHash || null,
          contract_version: version,
          metadata_status: 'pending',
          indexed_at: Date.now(),
          metadata_json: null,
        };

        this.db.upsertCatalogItem(item);
        inserted++;
      } catch (error: any) {
        // v1.2.7.3: same surfacing pattern as scanChannelCreated.
        errors++;
        if (errors === 1) {
          firstError = error?.message || String(error);
          log.warn(`scanDigitalAssetRegistered [${version}]: first error indexing event (block ${entry.blockNumber}): ${firstError}`);
        }
        log.debug(`scanDigitalAssetRegistered [${version}] error #${errors}: ${error?.message || error}`);
      }
    }

    if (errors > 0) {
      log.warn(
        `scanDigitalAssetRegistered [${version}]: ${inserted} inserted, ${errors} failed (first error: ${firstError}). ` +
        `Likely missing tables, schema drift, or DB write contention. Check /api/diagnose.`
      );
    }

    return { inserted, errors };
  }

  /**
   * Scan V3 EventHub AssetCreated events.
   *
   * AssetCreated(address indexed _to, address indexed _channel, uint256 _tokenId,
   *              string _tokenUri, uint16 _opType, address indexed opContract)
   *
   *   topics[0] = event sig, topics[1] = _to (creator), topics[2] = _channel, topics[3] = opContract
   *   data = abi.encode(uint256 _tokenId, string _tokenUri, uint16 _opType)
   */
  private async scanAssetCreated(eventSourceAddress: string, version: string, fromBlock: number, toBlock: number): Promise<{ inserted: number; errors: number }> {
    if (!this.db) return { inserted: 0, errors: 0 };

    const logs = await this.getLogs(
      eventSourceAddress,
      [TOPICS.AssetCreated],
      fromBlock,
      toBlock
    );

    let inserted = 0;
    let errors = 0;
    let firstError: string | null = null;

    for (const entry of logs) {
      try {
        const creatorAddress = unpadAddress(entry.topics[1]);
        const channelAddress = unpadAddress(entry.topics[2]);
        const operativeAddress = unpadAddress(entry.topics[3]);
        const blockNumber = fromHex(entry.blockNumber);

        const dataHex = entry.data ?? '0x';
        const data = dataHex.replace('0x', '');
        if (data.length < 128) continue;

        // V3 token IDs are full 256-bit hashes — store as hex to avoid JS number overflow
        const tokenIdHex = '0x' + data.slice(0, 64);

        if (this.db.catalogItemExists(channelAddress, tokenIdHex, 8453)) {
          continue;
        }

        // Try WASM ABI decode to extract tokenUri directly from event data
        // data = abi.encode(uint256 _tokenId, string _tokenUri, uint16 _opType)
        let eventTokenUri: string | null = null;
        let eventOpType: number | null = null;
        const decoded = await this.abiDecode(dataHex, ['uint256', 'string', 'uint16']);
        if (decoded && decoded.length === 3) {
          eventTokenUri = decoded[1] || null;
          eventOpType = parseInt(decoded[2], 10) || null;
        }

        const metadataCid = eventTokenUri ? this.extractCid(eventTokenUri) : null;

        const item: ContentCatalogItem = {
          content_id: null,
          channel_address: channelAddress,
          token_id: tokenIdHex,
          operative_address: operativeAddress,
          creator_address: creatorAddress,
          name: null,
          description: null,
          image_url: null,
          content_cid: null,
          metadata_cid: metadataCid,
          mime_type: null,
          asset_type: null,
          price: null,
          payment_token: null,
          op_type: eventOpType,
          chain_id: 8453,
          block_number: blockNumber,
          tx_hash: entry.transactionHash || null,
          contract_version: version,
          metadata_status: 'pending',
          indexed_at: Date.now(),
          metadata_json: null,
        };

        this.db.upsertCatalogItem(item);
        inserted++;
      } catch (error: any) {
        // v1.2.7.3: same surfacing pattern as scanChannelCreated.
        errors++;
        if (errors === 1) {
          firstError = error?.message || String(error);
          log.warn(`scanAssetCreated [${version}]: first error indexing AssetCreated event (block ${entry.blockNumber}): ${firstError}`);
        }
        log.debug(`scanAssetCreated [${version}] error #${errors}: ${error?.message || error}`);
      }
    }

    if (errors > 0) {
      log.warn(
        `scanAssetCreated [${version}]: ${inserted} inserted, ${errors} failed (first error: ${firstError}). ` +
        `Likely missing tables, schema drift, or DB write contention. Check /api/diagnose.`
      );
    }

    return { inserted, errors };
  }

  // ── Metadata resolution ────────────────────────────────────

  private async resolveMetadata(): Promise<void> {
    if (!this.db) return;

    const pending = this.db.getCatalogItemsPendingMetadata(this.config.metadataFetchConcurrency * 10);
    if (pending.length === 0) return;

    log.info(`Resolving metadata for ${pending.length} asset(s)...`);

    const chunks = [];
    for (let i = 0; i < pending.length; i += this.config.metadataFetchConcurrency) {
      chunks.push(pending.slice(i, i + this.config.metadataFetchConcurrency));
    }

    let resolved = 0;
    let failed = 0;

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(item => this.resolveItemMetadata(item))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          resolved++;
        } else {
          failed++;
        }
      }
    }

    if (resolved > 0 || failed > 0) {
      log.info(`Metadata resolution: ${resolved} resolved, ${failed} failed`);
    }
  }

  private async resolveItemMetadata(item: ContentCatalogItem): Promise<boolean> {
    if (!this.db) return false;

    try {
      let tokenURI: string | null = null;

      // If metadata_cid was extracted from event data, build the URI directly
      if (item.metadata_cid) {
        tokenURI = `ipfs://${item.metadata_cid}`;
      }

      // Otherwise, fetch tokenURI from the channel contract
      if (!tokenURI) {
        const tokenIdPadded = item.token_id.replace('0x', '').padStart(64, '0');
        const callData = TOKEN_URI_SELECTOR + tokenIdPadded;
        const uriResult = await this.ethCall(item.channel_address, callData);

        if (!uriResult || uriResult === '0x') {
          this.db.updateCatalogMetadata(item.channel_address, item.token_id, item.chain_id, { metadata_status: 'failed' });
          return false;
        }

        // Try WASM decoder first, fall back to JS
        const decoded = await this.abiDecode(uriResult, ['string']);
        tokenURI = decoded?.[0] ?? decodeAbiString(uriResult);
      }

      if (!tokenURI) {
        this.db.updateCatalogMetadata(item.channel_address, item.token_id, item.chain_id, { metadata_status: 'failed' });
        return false;
      }

      // Step 2: Extract CID from tokenURI and fetch metadata
      const metadataCid = item.metadata_cid ?? this.extractCid(tokenURI);
      const metadata = await this.fetchMetadata(tokenURI);

      if (!metadata) {
        this.db.updateCatalogMetadata(item.channel_address, item.token_id, item.chain_id, {
          metadata_cid: metadataCid,
          metadata_status: 'failed',
        });
        return false;
      }

      // Step 3: Parse metadata and update catalog
      const contentCid = metadata.media?.uri
        ? this.extractCid(metadata.media.uri)
        : null;
      const mimeType = metadata.media?.contentType || null;
      const kid = metadata.kid || metadata.properties?.kid || null;
      const creator = metadata.properties?.publisher || item.creator_address;

      // Asset metadata typically sets `image` for the card thumbnail, but some
      // schemas (notably elacity-asset-envelope-v1) leave `image` empty when
      // the publisher relies on `media.previewURL` for preview images. Falling
      // back to `media.previewURL` salvages the thumbnail in those cases —
      // assets with neither field will still surface the type-icon placeholder.
      const thumbnailCandidate = metadata.image || metadata.media?.previewURL || null;

      this.db.updateCatalogMetadata(item.channel_address, item.token_id, item.chain_id, {
        content_id: kid,
        name: metadata.name || null,
        description: metadata.description || null,
        image_url: thumbnailCandidate,
        content_cid: contentCid,
        metadata_cid: metadataCid,
        mime_type: mimeType,
        asset_type: classifyAssetType(mimeType),
        creator_address: creator,
        metadata_status: 'resolved',
        metadata_json: JSON.stringify(metadata),
      });

      return true;
    } catch (error: any) {
      log.debug(`Metadata resolution failed for ${item.channel_address}:${item.token_id}: ${error.message}`);
      this.db?.updateCatalogMetadata(item.channel_address, item.token_id, item.chain_id, {
        metadata_status: 'failed',
      });
      return false;
    }
  }

  private extractCid(uri: string): string | null {
    if (uri.startsWith('ipfs://')) {
      return uri.replace('ipfs://', '').split('/')[0];
    }
    const ipfsMatch = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (ipfsMatch) return ipfsMatch[1];
    if (uri.startsWith('Qm') || uri.startsWith('bafy')) return uri.split('/')[0];
    return null;
  }

  private async fetchMetadata(tokenURI: string): Promise<any | null> {
    const cid = this.extractCid(tokenURI);

    // Try local IPFS first (fast path for flat-file metadata).
    //
    // NOTE: this only works for *flat* metadata JSON CIDs. For UnixFS
    // *directory* CIDs (which is what the current Elacity Creator uploads —
    // metadata.json + content.json + …), getFile() throws "is not a file
    // (type: directory)". The catch swallows that and we fall through to
    // the HTTP gateway list below, which DOES include path-scoped URLs.
    //
    // Importantly, that gateway list includes our OWN local HTTP gateway
    // (`http://127.0.0.1:PORT/ipfs/CID/metadata.json`) which serves data
    // from the same locally-pinned blockstore but DOES handle directories
    // properly. Without that, freshly-uploaded mints would fail to resolve
    // because remote gateways (ipfs.ela.city, dweb.link) hadn't yet
    // replicated the content (typical lag: 30s-5min). v1.2.6 fix.
    if (cid && this.ipfs) {
      try {
        const buf = await this.ipfs.getFile(cid);
        if (buf && buf.length > 0) {
          return JSON.parse(buf.toString('utf8'));
        }
      } catch {
        // Local IPFS didn't have it (or it's a directory) — fall through to gateways
      }
    }

    // Try HTTP gateways
    const urls: string[] = [];

    if (tokenURI.startsWith('http://') || tokenURI.startsWith('https://')) {
      urls.push(tokenURI);
    }

    if (cid) {
      // Build the gateway list with our LOCAL IPFS gateway first, then any
      // configured remote gateways. This guarantees freshly-uploaded
      // metadata (still pinned only on this node) resolves immediately,
      // without waiting for replication to ipfs.ela.city or dweb.link.
      const localPort = process.env.PORT || '4200';
      const allGateways = [
        `http://127.0.0.1:${localPort}/ipfs/`,
        ...this.config.metadataGatewayUrls,
      ];

      for (const gateway of allGateways) {
        // Legacy format: the metadata CID points directly at a JSON file.
        urls.push(`${gateway}${cid}`);
        // Current Elacity Creator (from 2026-04-17) uploads metadata as a
        // UnixFS directory containing metadata.json, content.json, etc.
        // Fetching the bare CID returns an HTML directory index from most
        // gateways, which breaks JSON.parse. Try the path-scoped URL second.
        urls.push(`${gateway}${cid}/metadata.json`);
      }
    }

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) continue;

        // Guard against gateways that return HTTP 200 + HTML for directory CIDs
        // (IPFS directory index pages). Parse via text() so a non-JSON body
        // doesn't throw — we just skip to the next candidate URL.
        const body = await response.text();
        if (body.trimStart().startsWith('<')) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch {
          continue;
        }

        // Reject directory-listing JSON. PC2's local IPFS gateway and some
        // other gateways return JSON of the form:
        //   { cid, path, isDirectory: true, parent, entries: [...] }
        // when asked for a UnixFS directory CID without a sub-path. That's
        // NOT the metadata file — it's a description of the directory. We
        // need to keep trying URLs until we find the actual metadata.json.
        if (parsed && typeof parsed === 'object' && parsed.isDirectory === true) continue;

        // Sanity-check: real Elacity metadata has at least one of these
        // top-level fields (schema | name | media | properties | asset).
        // If none are present, this isn't usable metadata; skip.
        const looksLikeMetadata = parsed && typeof parsed === 'object' && (
          parsed.schema || parsed.name || parsed.media || parsed.properties || parsed.asset
        );
        if (!looksLikeMetadata) continue;

        return parsed;
      } catch {
        continue;
      }
    }

    return null;
  }
}
