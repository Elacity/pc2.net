/**
 * Owner Wallet Verification
 * 
 * Verifies that a wallet address is the owner or an authorized tethered wallet
 * Supports both EVM and Solana addresses with proper case handling
 */

import { Config } from '../config/loader.js';
import { normalizeAddress, compareAddresses } from '../utils/wallet.js';

export interface OwnerVerificationResult {
  isAuthorized: boolean;
  isOwner: boolean;
  isTethered: boolean;
  reason?: string;
}

/**
 * Verify if a wallet address is authorized (owner or tethered)
 */
export function verifyOwner(
  walletAddress: string,
  config: Config
): OwnerVerificationResult {
  if (!walletAddress || typeof walletAddress !== 'string') {
    return {
      isAuthorized: false,
      isOwner: false,
      isTethered: false,
      reason: 'Invalid wallet address'
    };
  }

  // Normalize wallet address (EVM lowercase, Solana as-is)
  const normalizedWallet = normalizeAddress(walletAddress);

  // Check if no owner is set (first-time setup)
  if (!config.owner.wallet_address) {
    return {
      isAuthorized: true, // Allow first wallet to become owner
      isOwner: true,
      isTethered: false,
      reason: 'No owner set - first wallet will become owner'
    };
  }

  // Check if wallet is the owner (using proper comparison for address type)
  if (compareAddresses(normalizedWallet, config.owner.wallet_address)) {
    return {
      isAuthorized: true,
      isOwner: true,
      isTethered: false
    };
  }

  // Check if wallet is in tethered wallets list
  const tetheredWallets = config.owner.tethered_wallets || [];
  const isTethered = tetheredWallets.some(
    tethered => compareAddresses(tethered, normalizedWallet)
  );

  if (isTethered) {
    return {
      isAuthorized: true,
      isOwner: false,
      isTethered: true
    };
  }

  // Wallet is not authorized
  return {
    isAuthorized: false,
    isOwner: false,
    isTethered: false,
    reason: 'Wallet is not the owner or an authorized tethered wallet'
  };
}

/**
 * Set owner wallet (first-time setup)
 */
export function setOwner(
  walletAddress: string,
  config: Config
): { success: boolean; error?: string } {
  if (!walletAddress || typeof walletAddress !== 'string') {
    return {
      success: false,
      error: 'Invalid wallet address'
    };
  }

  // Check if owner is already set
  if (config.owner.wallet_address) {
    return {
      success: false,
      error: 'Owner is already set. Cannot change owner.'
    };
  }

  // Owner will be set via config.saveConfig() in the calling code
  return {
    success: true
  };
}

/**
 * Add tethered wallet (owner only operation)
 */
export function addTetheredWallet(
  walletAddress: string,
  config: Config,
  requesterWallet: string
): { success: boolean; error?: string } {
  // Verify requester is owner
  const ownerCheck = verifyOwner(requesterWallet, config);
  if (!ownerCheck.isOwner) {
    return {
      success: false,
      error: 'Only the owner can add tethered wallets'
    };
  }

  if (!walletAddress || typeof walletAddress !== 'string') {
    return {
      success: false,
      error: 'Invalid wallet address'
    };
  }

  const normalizedWallet = normalizeAddress(walletAddress);

  // Cannot add owner as tethered wallet
  if (compareAddresses(normalizedWallet, config.owner.wallet_address)) {
    return {
      success: false,
      error: 'Cannot add owner as tethered wallet'
    };
  }

  // Check if already in list
  const tetheredWallets = config.owner.tethered_wallets || [];
  if (tetheredWallets.some(w => compareAddresses(w, normalizedWallet))) {
    return {
      success: false,
      error: 'Wallet is already in tethered wallets list'
    };
  }

  // Wallet will be added via config.saveConfig() in the calling code
  return {
    success: true
  };
}

/**
 * Remove tethered wallet (owner only operation)
 */
export function removeTetheredWallet(
  walletAddress: string,
  config: Config,
  requesterWallet: string
): { success: boolean; error?: string } {
  // Verify requester is owner
  const ownerCheck = verifyOwner(requesterWallet, config);
  if (!ownerCheck.isOwner) {
    return {
      success: false,
      error: 'Only the owner can remove tethered wallets'
    };
  }

  const normalizedWallet = normalizeAddress(walletAddress);
  const tetheredWallets = config.owner.tethered_wallets || [];

  // Check if wallet is in list
  if (!tetheredWallets.some(w => compareAddresses(w, normalizedWallet))) {
    return {
      success: false,
      error: 'Wallet is not in tethered wallets list'
    };
  }

  // Wallet will be removed via config.saveConfig() in the calling code
  return {
    success: true
  };
}
