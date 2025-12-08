/**
 * @fileoverview Safe Ethereum provider accessor with graceful fallbacks.
 * Abstracts direct window.ethereum access per project rules.
 * 
 * @module helpers/ethereum-provider
 */

import { createLogger } from './logger.js';

const logger = createLogger('EthereumProvider');

/**
 * Elastos Smart Chain network configuration
 * @type {Object}
 */
export const ELASTOS_CHAIN_CONFIG = {
    chainId: '0x14', // 20 in hex
    chainName: 'Elastos Smart Chain',
    nativeCurrency: {
        name: 'Elastos',
        symbol: 'ELA',
        decimals: 18
    },
    rpcUrls: ['https://api.elastos.io/esc'],
    blockExplorerUrls: ['https://esc.elastos.io']
};

/**
 * Check if an Ethereum provider is available
 * @returns {boolean} True if provider exists
 */
export function hasEthereumProvider() {
    return typeof window !== 'undefined' && 
           (typeof window.ethereum !== 'undefined' || 
            typeof window.web3?.currentProvider !== 'undefined');
}

/**
 * Get the Ethereum provider with graceful fallback
 * @returns {Object|null} EIP-1193 compatible provider or null
 */
export function getEthereumProvider() {
    if (typeof window === 'undefined') {
        logger.warn('Window not available (SSR context)');
        return null;
    }
    
    // Primary: window.ethereum (MetaMask, etc.)
    if (typeof window.ethereum !== 'undefined') {
        return window.ethereum;
    }
    
    // Fallback: Legacy web3 provider
    if (window.web3?.currentProvider) {
        logger.warn('Using legacy web3.currentProvider');
        return window.web3.currentProvider;
    }
    
    logger.warn('No Ethereum provider detected');
    return null;
}

/**
 * Request account access from the provider
 * @returns {Promise<string[]>} Array of connected account addresses
 * @throws {Error} If no provider or user rejects
 */
export async function requestAccounts() {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask or another Web3 wallet.');
    }
    
    try {
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        logger.log('Accounts connected:', accounts.length);
        return accounts;
    } catch (error) {
        if (error.code === 4001) {
            throw new Error('Connection rejected. Please approve the connection request in your wallet.');
        }
        throw error;
    }
}

/**
 * Get the current chain ID
 * @returns {Promise<number>} Current chain ID as number
 */
export async function getCurrentChainId() {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
}

/**
 * Switch to a specific chain
 * @param {number} chainId - Target chain ID
 * @returns {Promise<void>}
 */
export async function switchChain(chainId) {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    const chainIdHex = '0x' + chainId.toString(16);
    
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }]
        });
        logger.log('Switched to chain:', chainId);
    } catch (error) {
        // Chain not added to wallet
        if (error.code === 4902) {
            logger.log('Chain not found, attempting to add...');
            throw error; // Let caller handle adding the chain
        }
        throw error;
    }
}

/**
 * Add Elastos Smart Chain to the wallet
 * @returns {Promise<void>}
 */
export async function addElastosChain() {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ELASTOS_CHAIN_CONFIG]
    });
    
    logger.log('Elastos Smart Chain added to wallet');
}

/**
 * Switch to Elastos Smart Chain, adding it if necessary
 * @returns {Promise<void>}
 */
export async function switchToElastos() {
    try {
        await switchChain(20);
    } catch (error) {
        if (error.code === 4902) {
            await addElastosChain();
            await switchChain(20);
        } else {
            throw error;
        }
    }
}

/**
 * Send a transaction via the provider
 * @param {Object} txParams - Transaction parameters
 * @param {string} txParams.from - Sender address
 * @param {string} txParams.to - Recipient address
 * @param {string} [txParams.value] - Value in wei (hex)
 * @param {string} [txParams.data] - Transaction data (hex)
 * @param {string} [txParams.gas] - Gas limit (hex)
 * @returns {Promise<string>} Transaction hash
 */
export async function sendTransaction(txParams) {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    logger.log('Sending transaction:', { to: txParams.to, value: txParams.value });
    
    const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
    });
    
    logger.log('Transaction sent:', txHash);
    return txHash;
}

/**
 * Estimate gas for a transaction
 * @param {Object} txParams - Transaction parameters
 * @returns {Promise<string>} Estimated gas (hex)
 */
export async function estimateGas(txParams) {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    const gas = await provider.request({
        method: 'eth_estimateGas',
        params: [txParams]
    });
    
    return gas;
}

/**
 * Get the balance of an address
 * @param {string} address - Address to check
 * @returns {Promise<string>} Balance in wei (hex)
 */
export async function getBalance(address) {
    const provider = getEthereumProvider();
    
    if (!provider) {
        throw new Error('No Ethereum provider available');
    }
    
    const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
    });
    
    return balance;
}

export default {
    hasEthereumProvider,
    getEthereumProvider,
    requestAccounts,
    getCurrentChainId,
    switchChain,
    switchToElastos,
    addElastosChain,
    sendTransaction,
    estimateGas,
    getBalance,
    ELASTOS_CHAIN_CONFIG
};

