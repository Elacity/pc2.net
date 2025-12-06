/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Wallet utility functions for Account Sidebar
 */

/**
 * Truncate an Ethereum address for display
 * @param {string} address - Full wallet address
 * @param {number} startChars - Characters to show at start (default 6)
 * @param {number} endChars - Characters to show at end (default 4)
 * @returns {string} Truncated address (e.g., "0x1234...5678")
 */
export function truncateAddress(address, startChars = 6, endChars = 4) {
    if (!address) return '';
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Validate an Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
    if (!address) return false;
    // Basic regex for Ethereum addresses
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Format a token balance for display
 * @param {string|number} balance - Raw balance
 * @param {number} decimals - Token decimals (default 18)
 * @param {number} displayDecimals - Decimals to show (default 4)
 * @returns {string} Formatted balance
 */
export function formatTokenBalance(balance, decimals = 18, displayDecimals = 4) {
    if (!balance) return '0';
    
    const balanceNum = typeof balance === 'string' ? parseFloat(balance) : balance;
    
    if (isNaN(balanceNum)) return '0';
    
    // For very small amounts
    if (balanceNum > 0 && balanceNum < 0.0001) {
        return '< 0.0001';
    }
    
    // For large amounts, use compact notation
    if (balanceNum >= 1000000) {
        return (balanceNum / 1000000).toFixed(2) + 'M';
    }
    if (balanceNum >= 1000) {
        return (balanceNum / 1000).toFixed(2) + 'K';
    }
    
    // Regular formatting
    return balanceNum.toFixed(displayDecimals).replace(/\.?0+$/, '');
}

/**
 * Format USD value for display
 * @param {number} value - USD value
 * @returns {string} Formatted USD string
 */
export function formatUSD(value) {
    if (value === null || value === undefined) return '$0.00';
    
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return '$0.00';
    
    if (num >= 1000000) {
        return '$' + (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return '$' + (num / 1000).toFixed(2) + 'K';
    }
    if (num < 0.01 && num > 0) {
        return '< $0.01';
    }
    
    return '$' + num.toFixed(2);
}

/**
 * Format relative time (e.g., "2 mins ago")
 * @param {string|number|Date} timestamp - Timestamp to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    
    // Format as date for older entries
    return date.toLocaleDateString();
}

/**
 * Get chain name from chain ID
 * @param {number} chainId - Chain ID
 * @returns {string} Chain name
 */
export function getChainName(chainId) {
    const chains = {
        1: 'Ethereum',
        8453: 'Base',
        137: 'Polygon',
        42161: 'Arbitrum',
        10: 'Optimism',
        56: 'BNB Chain',
        43114: 'Avalanche',
        250: 'Fantom',
        20: 'Elastos',
        21: 'Elastos Testnet',
    };
    return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Get chain icon URL
 * @param {number} chainId - Chain ID
 * @returns {string} Icon URL or default
 */
export function getChainIcon(chainId) {
    const chainIcons = {
        1: 'ethereum.svg',
        8453: 'base.svg',
        137: 'polygon.svg',
        42161: 'arbitrum.svg',
        10: 'optimism.svg',
        56: 'bnb.svg',
        43114: 'avalanche.svg',
        20: 'elastos.svg',
    };
    
    const iconName = chainIcons[chainId] || 'chain-default.svg';
    return window.icons?.[iconName] || window.icons?.['chain-default.svg'] || '';
}

/**
 * Get block explorer URL for an address or transaction
 * @param {number} chainId - Chain ID
 * @param {string} hash - Address or tx hash
 * @param {string} type - 'address' or 'tx'
 * @returns {string} Explorer URL
 */
export function getExplorerUrl(chainId, hash, type = 'address') {
    const explorers = {
        1: 'https://etherscan.io',
        8453: 'https://basescan.org',
        137: 'https://polygonscan.com',
        42161: 'https://arbiscan.io',
        10: 'https://optimistic.etherscan.io',
        56: 'https://bscscan.com',
        43114: 'https://snowtrace.io',
        20: 'https://esc.elastos.io',
    };
    
    const baseUrl = explorers[chainId] || 'https://etherscan.io';
    const path = type === 'tx' ? 'tx' : 'address';
    
    return `${baseUrl}/${path}/${hash}`;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            return true;
        } catch (e) {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

/**
 * Parse token amount from raw value with decimals
 * @param {string|number} rawAmount - Raw token amount
 * @param {number} decimals - Token decimals
 * @returns {number} Parsed amount
 */
export function parseTokenAmount(rawAmount, decimals = 18) {
    if (!rawAmount) return 0;
    const raw = typeof rawAmount === 'string' ? rawAmount : rawAmount.toString();
    return parseFloat(raw) / Math.pow(10, decimals);
}

/**
 * Convert amount to raw value for transactions
 * @param {string|number} amount - Human readable amount
 * @param {number} decimals - Token decimals
 * @returns {string} Raw amount string
 */
export function toRawAmount(amount, decimals = 18) {
    if (!amount) return '0';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.floor(num * Math.pow(10, decimals)).toString();
}

/**
 * Get default token icon based on symbol
 * @param {string} symbol - Token symbol
 * @returns {string} Icon URL
 */
export function getDefaultTokenIcon(symbol) {
    const knownTokens = {
        'ETH': 'eth.svg',
        'WETH': 'eth.svg',
        'USDC': 'usdc.svg',
        'USDT': 'usdt.svg',
        'DAI': 'dai.svg',
        'WBTC': 'wbtc.svg',
        'MATIC': 'polygon.svg',
        'BNB': 'bnb.svg',
        'ELA': 'elastos.svg',
    };
    
    const iconName = knownTokens[symbol?.toUpperCase()] || 'token-default.svg';
    return window.icons?.[iconName] || window.icons?.['token-default.svg'] || '';
}

/**
 * Sort tokens by USD value (highest first)
 * @param {Array} tokens - Array of token objects
 * @returns {Array} Sorted tokens
 */
export function sortTokensByValue(tokens) {
    if (!Array.isArray(tokens)) return [];
    
    return [...tokens].sort((a, b) => {
        const aValue = parseFloat(a.usdValue) || 0;
        const bValue = parseFloat(b.usdValue) || 0;
        return bValue - aValue;
    });
}

/**
 * Get transaction type label
 * @param {string} type - Transaction type code
 * @returns {string} Human readable label
 */
export function getTransactionTypeLabel(type) {
    const labels = {
        'send': 'Sent',
        'receive': 'Received',
        'swap': 'Swapped',
        'approve': 'Approved',
        'contract': 'Contract Call',
        'mint': 'Minted',
        'burn': 'Burned',
    };
    return labels[type?.toLowerCase()] || 'Transaction';
}

/**
 * Get transaction status class
 * @param {string} status - Transaction status
 * @returns {string} CSS class name
 */
export function getTransactionStatusClass(status) {
    const classes = {
        'pending': 'tx-pending',
        'confirmed': 'tx-confirmed',
        'success': 'tx-confirmed',
        'failed': 'tx-failed',
        'cancelled': 'tx-cancelled',
    };
    return classes[status?.toLowerCase()] || 'tx-pending';
}

