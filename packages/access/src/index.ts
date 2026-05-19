/**
 * @elacity-js/access
 *
 * Universal access layer for Elacity dDRM.
 * Verify ownership, acquire decryption keys, encrypt/decrypt any digital asset
 * via Lit Protocol with on-chain ACCESS_TOKEN gating.
 *
 * Usage:
 *   import { ElacityAccess } from '@elacity-js/access';
 *
 *   const access = new ElacityAccess();
 *   await access.connect(walletProvider, { chainId: 8453 });
 *
 *   const result = await access.verifyAccess({
 *     ledger: '0x...',
 *     tokenId: '42',
 *   });
 */

// Main client
export { ElacityAccess } from './client.js';

// Types
export type {
  EthereumProvider,
  DrmSystemType,
  DrmSystemConfig,
  ConnectOptions,
  AccessVerification,
  VerifyAccessParams,
  AcquireKeyParams,
  DecryptionKey,
  EncryptParams,
  EncryptResult,
  FetchDecryptParams,
  LicensePayload,
  AcquireLicenseParams,
  AccessEvent,
  AccessEventHandler,
  UnifiedAccessControlCondition,
} from './types.js';

// Low-level modules for advanced usage
export { verifyAccess } from './verify/access-token.js';
export { buildAccessTokenCondition, buildCreatorOrAccessCondition, type ConditionOperator, type AccessConditionArray } from './lit/conditions.js';
export { acquireKey, acquireLicense } from './lit/key-retrieval.js';
export { encryptBuffer, encryptWithKey } from './crypto/encrypt.js';
export { decryptWithLit, decryptWithKey } from './crypto/decrypt.js';
export { fetchFromIpfs } from './fetch/ipfs.js';
export { parseLicensePayload, selectDrmSystem, getPsshData } from './crypto/payload.js';

// Constants
export {
  BASE_CHAIN_ID,
  BASE_CHAIN_NAME,
  DEFAULT_AUTHORITY_GATEWAY,
  DEFAULT_LIT_NETWORK,
  CAPACITY_TOKEN_ID,
  DRM_SYSTEM_IDS,
  DEFAULT_IPFS_GATEWAY,
  LOCAL_IPFS_GATEWAY,
} from './constants.js';

// Contract ABIs, addresses, and mint encoding helpers
export {
  DIGITAL_ASSET_ABI,
  CENTRAL_STORAGE_ABI,
  CHANNEL_FACTORY_ABI,
  AUTHORITY_GATEWAY_ABI,
  OPERATIVE_BUYABLE_ABI,
  BASE_CONTRACTS,
  OP_TYPES,
  ROLE_TYPES,
  BASE_USDC,
  PUBLIC_ELACITY_CHANNEL,
  ELACITY_ROYALTY_ADDRESS,
  ELACITY_ROYALTY_PERCENT,
  encodeOpRawData,
  encodeSellRawData,
  kidToContentId,
  /** @deprecated use {@link kidToContentId} — removed next minor */
  hashToContentId,
  type MintDataParams,
  CORE_STORAGE_ABI,
  CHANNEL_CORE_ABI,
} from './contracts/index.js';

// Events
export { AccessEventEmitter } from './events.js';

// Utilities
export { base64ToUint8Array, uint8ArrayToBase64 } from './utils.js';
