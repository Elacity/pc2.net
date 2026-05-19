/**
 * @elacity-js/access — Mint data encoding helpers
 *
 * Encodes the opRawData and sellRawData parameters for the
 * DigitalAsset.mint() function, matching the exact format used
 * by the Elacity frontend's formatMintData() in src/lib/drm/utils.ts.
 *
 * Key encoding rules (from Elacity smart contracts):
 * - Royalties are stored as per-1000 values (95% = 950, 5% = 50)
 * - Elacity platform royalty (5%) is auto-added for paid content
 * - Creator appears twice in addresses: once for AccessToken, once for RoyaltyShare
 * - resellerCut is only included for opType=2 (buy_and_resell)
 * - contentId is bytes16 (first 16 bytes of the hash, hex-prefixed)
 */

import { ethers } from 'ethers';
import { OP_TYPES, ROLE_TYPES } from './abis.js';

/**
 * Elacity platform royalty recipient on Base.
 * Auto-added at 5% for all paid content.
 */
export const ELACITY_ROYALTY_ADDRESS = '0x0917Aa260359670F7855a5454c630993ce40C52D';
export const ELACITY_ROYALTY_PERCENT = 5;

export interface MintDataParams {
  /**
   * Canonical 16-byte KID for the asset (32 hex chars, with or without
   * `0x` prefix). For media: the value emitted by the encryption step
   * (pc2-node's `dashPackager::generateCEK().kid`). For non-media: the
   * value returned by `/api/storage/lit/encrypt` (`kid` field, 16-byte
   * UUID-derived).
   *
   * Must NOT be a `dataToEncryptHash` slice — see `kidToContentId` and
   * `docs/core/MEDIA_DRM_PACKAGING.md` §5.
   */
  contentId: string;
  /** IPFS CID of the metadata envelope/directory */
  metadataCID: string;
  /** Creator wallet address */
  creatorAddress: string;
  /** Number of access token copies available */
  copies: number;
  /** Price per token in payment token's smallest unit (e.g. USDC 6 decimals) */
  priceInWei: bigint;
  /** ERC-20 payment token address */
  payTokenAddress: string;
  /** 0=free, 1=buy_once, 2=buy_and_resell */
  opType: number;
  /** Creator's royalty percentage (0-95). Elacity 5% is auto-added. */
  creatorRoyaltyPercent?: number;
  /** Per-1000 reseller cut, only for opType=2 (default 900 = 90%) */
  resellerCut?: number;
}

/**
 * Convert a canonical 16-byte KID (32 hex chars, with or without `0x`
 * prefix or dashes) into the `0x`-prefixed bytes16 contentId expected
 * by the DigitalAsset contract.
 *
 * The V3 contract maintains a `KID => (Channel, TokenId)` mapping, so
 * the on-chain bytes16 MUST be the canonical KID of the asset — the
 * same value embedded in the PSSH `cenc:lit-aes-gcm-v3` Data[] JSON
 * and in tenc.default_KID. Throws on malformed input — there is NO
 * valid contentId that isn't a 16-byte KID.
 *
 * See docs/core/MEDIA_DRM_PACKAGING.md §5 for the KID identity contract
 * and docs/core/CENC_PACKAGING_COMPLIANCE.md for the 2026-05-18
 * post-mortem of the bug we hit by deriving contentIds from hashes.
 */
export function kidToContentId(kidHex: string): string {
  const clean = (kidHex.startsWith('0x') ? kidHex.slice(2) : kidHex)
    .replace(/-/g, '')
    .toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) {
    throw new Error(
      `kidToContentId: expected 32 hex chars (16-byte KID), got ${JSON.stringify(kidHex)}`,
    );
  }
  return '0x' + clean;
}

/**
 * @deprecated Use `kidToContentId(kid)` instead. Deriving the on-chain
 * `bytes16` contentId from a SHA-256 `dataToEncryptHash` produces a
 * value that has no relationship to the KID embedded in PSSH/tenc — the
 * contract's `KID => (Channel, TokenId)` mapping then breaks for any
 * libav-based consumer that extracts the KID from PSSH and looks the
 * asset up by it. The post-mortem at
 * `docs/core/CENC_PACKAGING_COMPLIANCE.md` (root cause #1) details the
 * fallout. This function is kept as a single-version compatibility shim
 * for callers that still construct contentIds from non-KID inputs;
 * REMOVE in the next minor bump.
 *
 * For non-media assets, the calling code should generate a 16-byte KID
 * (UUID-derived, matching the pc2-node `randomUUID().replace(/-/g, '')`
 * pattern) at encryption time and pass that here via `kidToContentId`.
 */
export function hashToContentId(hash: string): string {
  const clean = hash.startsWith('0x') ? hash.slice(2) : hash;
  const stripped = clean.replace(/-/g, '');
  return '0x' + stripped.slice(0, 32).padEnd(32, '0');
}

/**
 * Encode opRawData for the mint() call, matching Elacity's formatMintData().
 *
 * For paid content (opType 1 or 2):
 *   Layout: ['bytes16', 'string', 'address[]', 'uint256[]', 'uint256[]', ?'uint16']
 *   - addresses: [creator, creator, elacity]  (creator appears twice)
 *   - roleTypes: [1(AccessToken), 2(RoyaltyShare), 2(RoyaltyShare)]
 *   - amounts:   [copies, creatorPer1000, elacityPer1000]
 *   - resellerCut: only for opType=2
 *
 * For free content (opType 0): returns '0x'
 *
 * `params.contentId` MUST be a canonical KID (32 hex chars, or a
 * `0x`-prefixed 34-char bytes16 already in the contract format).
 * Anything else throws — see `kidToContentId` rationale.
 */
export function encodeOpRawData(params: MintDataParams): string {
  const {
    contentId,
    metadataCID,
    creatorAddress,
    copies,
    opType,
    creatorRoyaltyPercent = 95,
    resellerCut = 900,
  } = params;

  if (opType === OP_TYPES.FREE) return '0x';

  // Accept either a pre-formatted `0x`-prefixed bytes16 OR a raw 32-hex
  // KID; both route through kidToContentId so the validation is uniform.
  const cid16 = kidToContentId(contentId);
  const metadataUri = `ipfs://${metadataCID}`;

  const creatorPer1000 = Math.round(creatorRoyaltyPercent * 10);
  const elacityPer1000 = Math.round(ELACITY_ROYALTY_PERCENT * 10);

  const addresses = [creatorAddress, creatorAddress, ELACITY_ROYALTY_ADDRESS];
  const roleTypes = [
    ROLE_TYPES.ACCESS_TOKEN,
    ROLE_TYPES.ROYALTY_SHARE,
    ROLE_TYPES.ROYALTY_SHARE,
  ];
  const amounts = [copies, creatorPer1000, elacityPer1000];

  const isResellable = opType === OP_TYPES.BUY_AND_RESELL;

  const abiTypes = isResellable
    ? ['bytes16', 'string', 'address[]', 'uint256[]', 'uint256[]', 'uint16']
    : ['bytes16', 'string', 'address[]', 'uint256[]', 'uint256[]'];

  const abiValues: unknown[] = isResellable
    ? [cid16, metadataUri, addresses, roleTypes, amounts, resellerCut]
    : [cid16, metadataUri, addresses, roleTypes, amounts];

  return ethers.AbiCoder.defaultAbiCoder().encode(abiTypes, abiValues);
}

/**
 * Encode sellRawData for the mint() call.
 *
 * Layout: ['uint256', 'uint256', 'address']
 *
 * For free content (opType 0): returns '0x'
 */
export function encodeSellRawData(
  copies: number,
  priceInWei: bigint,
  payTokenAddress: string
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'uint256', 'address'],
    [copies, priceInWei, payTokenAddress]
  );
}
