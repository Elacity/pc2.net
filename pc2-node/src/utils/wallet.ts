/**
 * Wallet Address Utilities
 * 
 * Handles multi-chain wallet address detection, normalization, and comparison.
 * Supports EVM (Ethereum, etc.) and Solana addresses with proper case handling.
 */

export type AddressType = 'evm' | 'solana' | 'unknown';

/**
 * Detect the type of a wallet address
 * @param address - The wallet address to check
 * @returns The address type: 'evm', 'solana', or 'unknown'
 */
export function detectAddressType(address: string): AddressType {
  if (!address || typeof address !== 'string') {
    return 'unknown';
  }

  // EVM addresses: 0x prefix + 40 hex characters (case-insensitive)
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return 'evm';
  }

  // Solana addresses: 32-44 Base58 characters
  // Base58 excludes: 0, O, I, l (to avoid ambiguity)
  // Valid chars: 1-9, A-H, J-N, P-Z, a-k, m-z
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return 'solana';
  }

  return 'unknown';
}

/**
 * Normalize a wallet address for storage
 * - EVM addresses are lowercased (they are case-insensitive)
 * - Solana addresses are kept as-is (they are case-sensitive)
 * 
 * @param address - The wallet address to normalize
 * @returns The normalized address
 */
export function normalizeAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    return address;
  }

  const type = detectAddressType(address);
  
  // Only lowercase EVM addresses (they are case-insensitive in the protocol)
  // Solana addresses must remain case-sensitive (Base58 encoding)
  if (type === 'evm') {
    return address.toLowerCase();
  }
  
  return address;
}

/**
 * Compare two wallet addresses for equality
 * - EVM addresses are compared case-insensitively
 * - Solana addresses are compared case-sensitively
 * - Different address types are never equal
 * 
 * @param addressA - First address to compare
 * @param addressB - Second address to compare
 * @returns True if addresses are equal
 */
export function compareAddresses(addressA: string | null | undefined, addressB: string | null | undefined): boolean {
  // Handle null/undefined
  if (!addressA || !addressB) {
    return false;
  }

  const typeA = detectAddressType(addressA);
  const typeB = detectAddressType(addressB);

  // Different types are never equal
  if (typeA !== typeB) {
    return false;
  }

  // EVM addresses: case-insensitive comparison
  if (typeA === 'evm') {
    return addressA.toLowerCase() === addressB.toLowerCase();
  }

  // Solana addresses: case-sensitive comparison
  if (typeA === 'solana') {
    return addressA === addressB;
  }

  // Unknown types: exact match required
  return addressA === addressB;
}

/**
 * Validate a wallet address
 * @param address - The address to validate
 * @returns True if the address is a valid EVM or Solana address
 */
export function isValidAddress(address: string): boolean {
  const type = detectAddressType(address);
  return type === 'evm' || type === 'solana';
}

/**
 * Get a display-friendly version of an address (truncated)
 * @param address - The wallet address
 * @param prefixLength - Number of characters to show at start (default 6)
 * @param suffixLength - Number of characters to show at end (default 4)
 * @returns Truncated address like "0x1234...5678" or "D9nf...YgfW"
 */
export function truncateAddress(address: string, prefixLength = 6, suffixLength = 4): string {
  if (!address || address.length <= prefixLength + suffixLength) {
    return address;
  }
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}
