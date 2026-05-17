/**
 * Storage domain types.
 *
 * Extracted from database.ts per Phase 2-A (ticket
 * .cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-A-TYPES-EXTRACTION.md).
 *
 * These interfaces describe the shape of rows stored in pc2.db. They have
 * no runtime side effects — this file compiles to (essentially) nothing at
 * the JS level. The `Database` type alias depends on `@photostructure/sqlite`
 * type-only imports.
 *
 * `database.ts` re-exports all of these so existing consumers that import
 * `import { FileMetadata } from '../storage/database.js'` continue to work
 * unchanged. New code should prefer importing from this file directly.
 */

import {
  type DatabaseSyncInstance,
  type EnhancedDatabaseSync,
} from '@photostructure/sqlite';

// Local alias: enhanced @photostructure/sqlite instance with better-sqlite3-
// compatible .pragma() and .transaction() methods. Migration from
// `better-sqlite3` (v1.2.7) — both libraries link to SQLite 3.5x and the
// on-disk pc2.db format is unchanged. DatabaseSyncInstance is the type
// (the class shape); DatabaseSync is the value (constructor used at runtime).
export type Database = EnhancedDatabaseSync<DatabaseSyncInstance>;

export interface User {
  wallet_address: string;
  smart_account_address: string | null;
  created_at: number;
  last_login: number | null;
}

export interface Session {
  token: string;
  wallet_address: string;
  smart_account_address: string | null;
  created_at: number;
  expires_at: number;
  /**
   * NULL = unrestricted (owner/user session).
   * 'file' = ephemeral session bound to a specific file resource (SEC-3c, 2026-04 audit).
   * Future: other scope kinds may be added; middleware MUST fail-closed on unknown values.
   */
  scope?: string | null;
  /**
   * JSON-encoded metadata when scope IS NOT NULL. For scope='file':
   *   { "fileUid": string, "allowedPath"?: string }
   * Validated and consumed by isRequestInScope() in api/middleware/scope-check.ts.
   */
  scope_data?: string | null;
}

export interface FileMetadata {
  path: string;
  wallet_address: string;
  ipfs_hash: string | null;
  size: number;
  mime_type: string | null;
  thumbnail: string | null;
  content_text: string | null;
  is_dir: boolean;
  is_public: boolean;
  created_at: number;
  updated_at: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

export interface FileVersion {
  id: number;
  file_path: string;
  wallet_address: string;
  version_number: number;
  ipfs_hash: string;
  size: number;
  mime_type: string | null;
  created_at: number;
  created_by: string | null;
  comment: string | null;
}

export interface AIConfig {
  wallet_address: string;
  default_provider: string;
  default_model: string | null;
  api_keys: string; // JSON string: { "openai": "sk-...", "claude": "sk-ant-..." }
  ollama_base_url: string;
  updated_at: number;
}

export interface AIConversation {
  id: string;
  wallet_address: string;
  title: string;
  messages_json: string; // JSON string array of messages
  created_at: number;
  updated_at: number;
}

export interface ContentCatalogItem {
  id?: number;
  content_id: string | null;
  channel_address: string;
  token_id: string;
  operative_address: string | null;
  creator_address: string;
  name: string | null;
  description: string | null;
  image_url: string | null;
  content_cid: string | null;
  metadata_cid: string | null;
  mime_type: string | null;
  asset_type: string | null;
  price: string | null;
  payment_token: string | null;
  op_type: number | null;
  chain_id: number;
  block_number: number;
  tx_hash: string | null;
  contract_version: string;
  metadata_status: 'pending' | 'resolved' | 'failed';
  indexed_at: number;
  metadata_json: string | null;
}

export interface InstalledApp {
  app_name: string;
  title: string;
  version: string;
  cid: string;
  size: number;
  icon: string | null;
  description: string | null;
  author: string | null;
  permissions_json: string;
  requirements_json: string;
  manifest_json: string;
  installed_at: number;
  updated_at: number;
}
