/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * Particle Network Universal Account Constants
 * Chain info, token mappings, and contract addresses
 * Based on Elacity implementation
 */

/**
 * Chain ID to Info mapping
 * Icons, names, explorers for each supported chain
 * Icons use Particle CDN for cross-origin access
 */
export const CHAIN_INFO = {
    1: {
        name: 'Ethereum',
        icon: 'https://static.particle.network/token-list/ethereum/native.png',
        explorer: 'https://etherscan.io',
        chainType: 'evm',
        color: '#627EEA',
    },
    8453: {
        name: 'Base',
        icon: 'https://static.particle.network/token-list/base/native.png',
        explorer: 'https://basescan.org',
        chainType: 'evm',
        color: '#0052FF',
    },
    42161: {
        name: 'Arbitrum',
        icon: 'https://static.particle.network/token-list/arbitrum/native.png',
        explorer: 'https://arbiscan.io',
        chainType: 'evm',
        color: '#28A0F0',
    },
    10: {
        name: 'Optimism',
        icon: 'https://static.particle.network/token-list/optimism/native.png',
        explorer: 'https://optimistic.etherscan.io',
        chainType: 'evm',
        color: '#FF0420',
    },
    137: {
        name: 'Polygon',
        icon: 'https://static.particle.network/token-list/polygon/native.png',
        explorer: 'https://polygonscan.com',
        chainType: 'evm',
        color: '#8247E5',
    },
    56: {
        name: 'BNB Chain',
        icon: 'https://static.particle.network/token-list/bsc/native.png',
        explorer: 'https://bscscan.com',
        chainType: 'evm',
        color: '#F0B90B',
    },
    43114: {
        name: 'Avalanche',
        icon: 'https://static.particle.network/token-list/avalanche/native.png',
        explorer: 'https://snowtrace.io',
        chainType: 'evm',
        color: '#E84142',
    },
    101: {
        name: 'Solana',
        icon: 'https://static.particle.network/token-list/solana/native.png',
        explorer: 'https://solscan.io',
        chainType: 'solana',
        color: '#9945FF',
    },
    59144: {
        name: 'Linea',
        icon: 'https://static.particle.network/token-list/linea/native.png',
        explorer: 'https://lineascan.build',
        chainType: 'evm',
        color: '#121212',
    },
    20: {
        name: 'Elastos Smart Chain',
        shortName: 'ESC',
        icon: 'https://static.particle.network/token-list/elastos/native.png',
        explorer: 'https://esc.elastos.io',
        chainType: 'evm',
        color: '#F6921A',
    },
    22: {
        name: 'Elastos Identity Chain',
        shortName: 'EID',
        icon: 'https://static.particle.network/token-list/elastos/native.png',
        explorer: 'https://eid.elastos.io',
        chainType: 'evm',
        color: '#F6921A',
    },
};

/**
 * Available networks for Universal Account transfers
 */
export const AVAILABLE_NETWORKS = [
    { name: 'Elastos Smart Chain', chainId: 20, chainType: 'evm' },
    { name: 'Base', chainId: 8453, chainType: 'evm' },
    { name: 'Ethereum', chainId: 1, chainType: 'evm' },
    { name: 'Arbitrum', chainId: 42161, chainType: 'evm' },
    { name: 'Optimism', chainId: 10, chainType: 'evm' },
    { name: 'Polygon', chainId: 137, chainType: 'evm' },
    { name: 'BNB Chain', chainId: 56, chainType: 'evm' },
    { name: 'Avalanche', chainId: 43114, chainType: 'evm' },
    { name: 'Solana', chainId: 101, chainType: 'solana' },
    { name: 'Linea', chainId: 59144, chainType: 'evm' },
];

/**
 * Particle Network supported tokens per chain
 * Only these token/chain combinations work with Universal Account
 */
export const PARTICLE_SUPPORTED_TOKENS = {
    'Elastos Smart Chain': ['ELA'],
    'Solana': ['USDC', 'USDT', 'SOL'],
    'Ethereum': ['USDC', 'USDT', 'ETH', 'BTC'],
    'Base': ['USDC', 'ETH', 'BTC', 'ELA'],
    'BNB Chain': ['USDC', 'USDT', 'ETH', 'BTC', 'BNB'],
    'Arbitrum': ['USDC', 'USDT', 'ETH', 'BTC'],
    'Optimism': ['USDC', 'USDT', 'ETH', 'BTC'],
    'Polygon': ['USDC', 'USDT', 'ETH', 'BTC', 'POL'],
    'Avalanche': ['USDC', 'USDT', 'ETH', 'BTC'],
    'Linea': ['USDC', 'USDT', 'ETH', 'BTC'],
};

/**
 * Token contract addresses per network
 * Each token has different contract addresses on different chains
 * Native tokens use 0x0000000000000000000000000000000000000000
 */
export const PARTICLE_CURRENCY_MAP = {
    'Elastos Smart Chain': {
        'ela': '0x0000000000000000000000000000000000000000', // Native ELA
        'usdc': '0xA06be0F5950781cE28D965E5EFc6996e88a8C141', // USDC on Elastos
        'eth': '0x802c3e839E4fDb10aF583E3E759239ec7703501e', // Wrapped ETH on Elastos
    },
    'Solana': {
        'sol': '0x0000000000000000000000000000000000000000',
        'usdc': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'usdt': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    },
    'Ethereum': {
        'eth': '0x0000000000000000000000000000000000000000',
        'btc': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
        'usdc': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'usdt': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    'Base': {
        'eth': '0x0000000000000000000000000000000000000000',
        'btc': '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // cbBTC
        'usdc': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    'Arbitrum': {
        'eth': '0x0000000000000000000000000000000000000000',
        'btc': '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
        'usdc': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        'usdt': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    'Optimism': {
        'eth': '0x0000000000000000000000000000000000000000',
        'btc': '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        'usdc': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        'usdt': '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
    'Polygon': {
        'pol': '0x0000000000000000000000000000000000000000',
        'eth': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
        'btc': '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        'usdc': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        'usdt': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    'Avalanche': {
        'avax': '0x0000000000000000000000000000000000000000',
        'eth': '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', // WETH
        'btc': '0x152b9d0FdC40C096757F570A51E494bd4b943E50',
        'usdc': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        'usdt': '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    },
    'BNB Chain': {
        'bnb': '0x0000000000000000000000000000000000000000',
        'eth': '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // WETH
        'btc': '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
        'usdc': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        'usdt': '0x55d398326f99059fF775485246999027B3197955',
    },
    'Linea': {
        'eth': '0x0000000000000000000000000000000000000000',
        'btc': '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4',
        'usdc': '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
        'usdt': '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
    },
};

/**
 * Token display names
 */
export const TOKEN_NAMES = {
    'usdc': 'USD Coin',
    'usdt': 'Tether',
    'eth': 'Ethereum',
    'btc': 'Bitcoin',
    'sol': 'Solana',
    'bnb': 'BNB',
    'pol': 'Polygon',
    'avax': 'Avalanche',
};

/**
 * Token icons
 */
export const TOKEN_ICONS = {
    // Use local images to avoid CORS issues with Particle Network CDN
    'usdc': '/images/tokens/USDC.png',
    'usdt': '/images/tokens/USDT.png',
    'eth': '/images/tokens/ETH.png',
    'btc': '/images/tokens/BTC.svg',
    'sol': '/images/tokens/Sol.webp',
    'bnb': '/images/tokens/BNB.png',
    'ela': '/images/tokens/ELA.png',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get chain info by chain ID
 * @param {number} chainId 
 * @returns {Object} Chain info with name, icon, explorer
 */
export function getChainInfo(chainId) {
    return CHAIN_INFO[chainId] || {
        name: `Chain ${chainId}`,
        icon: '',
        explorer: 'https://etherscan.io',
        chainType: 'evm',
    };
}

/**
 * Get available networks for a specific token
 * Filters networks based on which chains support the token and wallet mode
 * @param {string} tokenSymbol - Token symbol (e.g., "USDC")
 * @param {string} [mode] - Wallet mode: 'universal' or 'elastos'. If 'elastos', only Elastos chain is shown. If 'universal', Elastos is excluded.
 * @returns {Array} Array of network objects that support this token
 */
export function getAvailableNetworksForToken(tokenSymbol, mode = null) {
    const tokenUpper = tokenSymbol?.toUpperCase() || '';
    
    let networks = AVAILABLE_NETWORKS.filter((network) =>
        PARTICLE_SUPPORTED_TOKENS[network.name]?.includes(tokenUpper)
    );
    
    // Filter based on wallet mode
    if (mode === 'elastos') {
        // Elastos mode: only show Elastos Smart Chain
        networks = networks.filter(n => n.name === 'Elastos Smart Chain');
    } else if (mode === 'universal') {
        // Universal mode: exclude Elastos Smart Chain (Universal Account doesn't support it)
        networks = networks.filter(n => n.name !== 'Elastos Smart Chain');
    }
    
    return networks;
}

/**
 * Get token contract address for a specific network
 * @param {string} tokenSymbol - Token symbol (e.g., "USDC")
 * @param {string} networkName - Network name (e.g., "Base")
 * @returns {string} Token contract address
 */
export function getTokenAddress(tokenSymbol, networkName) {
    const tokenLower = tokenSymbol?.toLowerCase() || '';
    return PARTICLE_CURRENCY_MAP[networkName]?.[tokenLower] || 
           '0x0000000000000000000000000000000000000000';
}

/**
 * Get token display name
 * @param {string} tokenType - Token type (e.g., "usdc")
 * @returns {string} Display name
 */
export function getTokenDisplayName(tokenType) {
    return TOKEN_NAMES[tokenType?.toLowerCase()] || tokenType?.toUpperCase() || 'Unknown';
}

/**
 * Get token icon URL
 * @param {string} tokenSymbol - Token symbol
 * @returns {string} Icon URL
 */
export function getTokenIconUrl(tokenSymbol) {
    return TOKEN_ICONS[tokenSymbol?.toLowerCase()] || '';
}

/**
 * Check if a token is supported on a network
 * @param {string} tokenSymbol - Token symbol
 * @param {string} networkName - Network name
 * @returns {boolean}
 */
export function isTokenSupportedOnNetwork(tokenSymbol, networkName) {
    const tokenUpper = tokenSymbol?.toUpperCase() || '';
    return PARTICLE_SUPPORTED_TOKENS[networkName]?.includes(tokenUpper) || false;
}

/**
 * Validate address based on chain type
 * @param {string} address - Address to validate
 * @param {string} chainType - 'evm' or 'solana'
 * @returns {boolean}
 */
export function isValidAddressForChain(address, chainType) {
    if (!address) return false;
    
    if (chainType === 'solana') {
        // Solana address: base58, 32-44 characters
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }
    
    // EVM address: 0x + 40 hex chars
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Get explorer URL for a transaction or address
 * @param {number} chainId - Chain ID
 * @param {string} hash - Transaction hash or address
 * @param {string} type - 'tx' or 'address'
 * @returns {string} Explorer URL
 */
export function getExplorerUrlForChain(chainId, hash, type = 'tx') {
    const chainInfo = CHAIN_INFO[chainId];
    const baseUrl = chainInfo?.explorer || 'https://etherscan.io';
    
    // Solana has different URL structure
    if (chainInfo?.chainType === 'solana') {
        return type === 'tx' 
            ? `${baseUrl}/tx/${hash}`
            : `${baseUrl}/account/${hash}`;
    }
    
    return `${baseUrl}/${type}/${hash}`;
}

/**
 * Get network by chain ID
 * @param {number} chainId 
 * @returns {Object|null}
 */
export function getNetworkByChainId(chainId) {
    return AVAILABLE_NETWORKS.find(n => n.chainId === chainId) || null;
}

/**
 * Get network by name
 * @param {string} name 
 * @returns {Object|null}
 */
export function getNetworkByName(name) {
    return AVAILABLE_NETWORKS.find(n => n.name === name) || null;
}

