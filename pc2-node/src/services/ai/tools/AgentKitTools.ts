/**
 * AgentKit Tools Definitions
 * 
 * AI tool definitions for AgentKit-powered wallet operations.
 * These tools enable the AI to propose blockchain transactions
 * that require user approval before execution.
 * 
 * Design Philosophy:
 * - All write operations return a proposal, not direct execution
 * - User must approve before any funds leave the wallet
 * - Clear, descriptive tool names and parameters
 */

import { NormalizedTool } from '../utils/FunctionCalling.js';

/**
 * AgentKit tools for AI-powered wallet operations
 */
export const agentKitTools: NormalizedTool[] = [
  // ==================== READ OPERATIONS ====================
  {
    type: 'function',
    function: {
      name: 'get_multi_chain_balances',
      description: 'Gets token balances across all supported chains (Base, Ethereum, Arbitrum, Optimism, Polygon). Returns native token and major stablecoin balances for each chain. Use this when user asks about their balance across chains or wants to know where their funds are.',
      parameters: {
        type: 'object',
        properties: {
          include_zero_balances: {
            type: 'boolean',
            description: 'If true, includes chains with zero balance. Defaults to false.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_token_price',
      description: 'Gets the current price of a token in USD. Use this when user asks about token prices or needs to calculate USD values.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Token symbol (e.g., "ETH", "USDC", "ELA")'
          }
        },
        required: ['token']
      }
    }
  },
  
  // ==================== WRITE OPERATIONS (Proposals) ====================
  {
    type: 'function',
    function: {
      name: 'transfer_tokens',
      description: 'Creates a proposal to transfer tokens to another address. IMPORTANT: This creates a transaction proposal that the user must approve before execution. CRITICAL REQUIREMENT: If user mentions "my EOA wallet", "my core wallet", "my admin wallet", or "my other wallet", you MUST STOP and FIRST call get_wallet_info to retrieve the EXACT address from core_wallet.address field. NEVER fabricate, guess, or use placeholder addresses! The core_wallet.address is the user\'s actual EOA that they control directly. If you do not have the exact address from get_wallet_info, ask the user to provide the full address. Always confirm the recipient address and amount with the user before calling this. Returns a proposal object that will be shown to the user for approval.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient wallet address (0x...) - MUST be exact 42-character hex address. MANDATORY: If user says "my EOA/core/admin wallet", you MUST first call get_wallet_info and extract the address from core_wallet.address field. NEVER invent addresses. Example: if get_wallet_info returns core_wallet.address as "0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3", use that exact address.'
          },
          amount: {
            type: 'string',
            description: 'Amount to send as a string (e.g., "50", "0.5", "100.25"). Do not include token symbol.'
          },
          token: {
            type: 'string',
            description: 'Token symbol to transfer (e.g., "USDC", "ETH"). Case-insensitive.'
          },
          chain: {
            type: 'string',
            description: 'Blockchain to send on. Options: "base", "ethereum", "arbitrum", "optimism", "polygon", "bnb", "bsc", "avalanche", "linea", "solana". Defaults to "base". Note: Particle UniversalX handles cross-chain automatically - tokens are sent FROM wherever you have funds TO the specified chain.'
          }
        },
        required: ['to', 'amount', 'token']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'swap_tokens',
      description: 'Creates a proposal to swap one token for another on a DEX. IMPORTANT: This creates a transaction proposal that the user must approve. The swap will be executed at the best available rate across supported DEXs. Returns a proposal with expected output amount and slippage.',
      parameters: {
        type: 'object',
        properties: {
          from_token: {
            type: 'string',
            description: 'Token to swap from (e.g., "ETH", "USDC")'
          },
          to_token: {
            type: 'string',
            description: 'Token to receive (e.g., "USDC", "ETH")'
          },
          amount: {
            type: 'string',
            description: 'Amount of from_token to swap (e.g., "0.5", "100")'
          },
          chain: {
            type: 'string',
            description: 'Blockchain for the swap. Options: "base", "ethereum", "arbitrum", "optimism", "polygon". Defaults to "base".'
          },
          slippage: {
            type: 'number',
            description: 'Maximum slippage tolerance as percentage (e.g., 0.5 for 0.5%). Defaults to 0.5%.'
          }
        },
        required: ['from_token', 'to_token', 'amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_transfer_fee',
      description: 'Estimates the gas fee for a token transfer without creating a proposal. Use this to help user understand costs before committing to a transaction.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address'
          },
          amount: {
            type: 'string',
            description: 'Amount to transfer'
          },
          token: {
            type: 'string',
            description: 'Token symbol (e.g., "USDC", "ETH")'
          },
          chain: {
            type: 'string',
            description: 'Blockchain to use. Defaults to "base".'
          }
        },
        required: ['to', 'amount', 'token']
      }
    }
  },
  
  // ==================== PROPOSAL MANAGEMENT ====================
  {
    type: 'function',
    function: {
      name: 'get_pending_proposals',
      description: 'Gets all pending transaction proposals awaiting user approval. Use this to check if there are any transactions waiting for the user to approve or reject.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_proposal_status',
      description: 'Gets the status of a specific transaction proposal by ID. Use this to check if a proposal has been approved, rejected, or executed.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: {
            type: 'string',
            description: 'The proposal ID to check'
          }
        },
        required: ['proposal_id']
      }
    }
  },
  
  // ==================== SESSION KEY MANAGEMENT (Phase 3) ====================
  {
    type: 'function',
    function: {
      name: 'get_session_status',
      description: 'Gets the current session key status and remaining limits. Use this to check if autonomous transactions are enabled and how much spending capacity remains.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
];

/**
 * Common token addresses by chain
 * Used for token lookup in AgentKitExecutor
 */
export const COMMON_TOKENS: Record<number, Record<string, { address: string | null; decimals: number }>> = {
  // Base (chainId 8453)
  8453: {
    'ETH': { address: null, decimals: 18 },
    'USDC': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    'USDT': { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    'DAI': { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    'WETH': { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  },
  // Ethereum (chainId 1)
  1: {
    'ETH': { address: null, decimals: 18 },
    'USDC': { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    'USDT': { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    'DAI': { address: '0x6B175474E89094C44Da98b954EescdeCB5badC0a', decimals: 18 },
    'WETH': { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  },
  // Arbitrum (chainId 42161)
  42161: {
    'ETH': { address: null, decimals: 18 },
    'USDC': { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    'USDT': { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    'DAI': { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    'WETH': { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  },
  // Optimism (chainId 10)
  10: {
    'ETH': { address: null, decimals: 18 },
    'USDC': { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    'USDT': { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    'DAI': { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    'WETH': { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  },
  // Polygon (chainId 137)
  137: {
    'POL': { address: null, decimals: 18 },
    'MATIC': { address: null, decimals: 18 }, // Alias
    'USDC': { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    'USDT': { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    'DAI': { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    'WETH': { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
  },
  // BNB Chain (chainId 56)
  56: {
    'BNB': { address: null, decimals: 18 },
    'USDC': { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    'USDT': { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    'BUSD': { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 },
    'DAI': { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
    'WBNB': { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
    'ETH': { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
  },
  // Avalanche (chainId 43114)
  43114: {
    'AVAX': { address: null, decimals: 18 },
    'USDC': { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
    'USDT': { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
    'DAI': { address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', decimals: 18 },
    'WETH': { address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18 },
    'WAVAX': { address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18 },
  },
  // Linea (chainId 59144)
  59144: {
    'ETH': { address: null, decimals: 18 },
    'USDC': { address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6 },
    'USDT': { address: '0xA219439258ca9da29E9Cc4cE5596924745e12B93', decimals: 6 },
    'WETH': { address: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', decimals: 18 },
  },
  // Solana (chainId 101) - SPL token addresses
  101: {
    'SOL': { address: null, decimals: 9 },
    'USDC': { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
    'USDT': { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  },
};

/**
 * Chain name to ID mapping
 */
export const CHAIN_NAME_TO_ID: Record<string, number> = {
  'base': 8453,
  'ethereum': 1,
  'eth': 1,
  'mainnet': 1,
  'arbitrum': 42161,
  'arb': 42161,
  'optimism': 10,
  'op': 10,
  'polygon': 137,
  'matic': 137,
  'bnb': 56,
  'bsc': 56,
  'binance': 56,
  'bnb chain': 56,
  'avalanche': 43114,
  'avax': 43114,
  'linea': 59144,
  'solana': 101,
  'sol': 101,
};

/**
 * Get token info by symbol and chain
 */
export function getTokenInfo(symbol: string, chainId: number): { address: string | null; decimals: number } | null {
  const chainTokens = COMMON_TOKENS[chainId];
  if (!chainTokens) return null;
  
  const upperSymbol = symbol.toUpperCase();
  return chainTokens[upperSymbol] || null;
}

/**
 * Get chain ID from name
 */
export function getChainIdFromName(name: string): number {
  const lowerName = name.toLowerCase();
  return CHAIN_NAME_TO_ID[lowerName] || 8453; // Default to Base
}
