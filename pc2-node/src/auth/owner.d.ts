/**
 * Owner Wallet Verification
 *
 * Verifies that a wallet address is the owner or an authorized tethered wallet
 */
import { Config } from '../config/loader.js';
export interface OwnerVerificationResult {
    isAuthorized: boolean;
    isOwner: boolean;
    isTethered: boolean;
    reason?: string;
}
/**
 * Verify if a wallet address is authorized (owner or tethered)
 */
export declare function verifyOwner(walletAddress: string, config: Config): OwnerVerificationResult;
/**
 * Set owner wallet (first-time setup)
 */
export declare function setOwner(walletAddress: string, config: Config): {
    success: boolean;
    error?: string;
};
/**
 * Add tethered wallet (owner only operation)
 */
export declare function addTetheredWallet(walletAddress: string, config: Config, requesterWallet: string): {
    success: boolean;
    error?: string;
};
/**
 * Remove tethered wallet (owner only operation)
 */
export declare function removeTetheredWallet(walletAddress: string, config: Config, requesterWallet: string): {
    success: boolean;
    error?: string;
};
//# sourceMappingURL=owner.d.ts.map