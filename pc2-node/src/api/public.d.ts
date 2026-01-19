/**
 * Public IPFS Gateway API
 *
 * Provides unauthenticated access to:
 * - Files in users' /Public folders
 * - Any pinned CID via /ipfs/:cid
 * - Public file listings
 *
 * This enables PC2 nodes to participate in the public IPFS network
 * and serve as gateways for dDRM marketplace content.
 */
import { Router } from 'express';
import { DatabaseManager } from '../storage/database.js';
import { FilesystemManager } from '../storage/filesystem.js';
import { IPFSStorage } from '../storage/ipfs.js';
/**
 * Create the public gateway router
 */
export declare function createPublicRouter(db: DatabaseManager, filesystem: FilesystemManager, ipfs: IPFSStorage | null): Router;
export default createPublicRouter;
//# sourceMappingURL=public.d.ts.map