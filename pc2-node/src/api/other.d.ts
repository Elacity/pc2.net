/**
 * Other API Endpoints
 *
 * Additional endpoints: /sign, /version, /os/user, /kv, etc.
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './middleware.js';
/**
 * Sign files for app access
 * POST /sign
 */
export declare function handleSign(req: AuthenticatedRequest, res: Response): void;
/**
 * Get server version
 * GET /version
 */
export declare function handleVersion(req: Request, res: Response): void;
/**
 * Get OS user info (alias for /whoami)
 * GET /os/user
 */
export declare function handleOSUser(req: AuthenticatedRequest, res: Response): void;
/**
 * Key-value store operations
 * GET/POST/DELETE /kv/:key
 */
export declare function handleKV(req: AuthenticatedRequest, res: Response): void;
/**
 * Record app open
 * POST /rao
 */
export declare function handleRAO(req: Request, res: Response): void;
/**
 * Contact form
 * POST /contactUs
 */
export declare function handleContactUs(req: Request, res: Response): void;
/**
 * Driver calls (for app lookups and KV store)
 * POST /drivers/call
 */
export declare function handleDriversCall(req: AuthenticatedRequest, res: Response): void;
/**
 * Open item - Get app to open a file/folder
 * POST /open_item
 * Matches Puter's format exactly - returns suggested app and file signature
 */
export declare function handleOpenItem(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Suggest apps for a file (fallback when open_item fails)
 * POST /suggest_apps
 * Returns array of suggested apps for a file
 */
export declare function handleSuggestApps(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Get file metadata by UID
 * GET /itemMetadata?uid=uuid-...
 */
export declare function handleItemMetadata(req: AuthenticatedRequest, res: Response): void;
/**
 * Write file using signed URL (for editor saves)
 * POST /writeFile?uid=...&signature=...&expires=...
 */
export declare function handleWriteFile(req: AuthenticatedRequest, res: Response): Promise<void>;
/**
 * Set desktop background
 * POST /set-desktop-bg
 */
export declare function handleSetDesktopBg(req: AuthenticatedRequest, res: Response): void;
/**
 * Set profile picture
 * POST /set-profile-picture
 */
export declare function handleSetProfilePicture(req: AuthenticatedRequest, res: Response): void;
/**
 * GET /api/wallets
 * Returns list of trusted wallets for the authenticated user
 */
export declare function handleGetWallets(req: AuthenticatedRequest, res: Response): void;
//# sourceMappingURL=other.d.ts.map