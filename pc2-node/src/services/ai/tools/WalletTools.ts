/**
 * Wallet Tools Definitions
 * Tool definitions for AI wallet-related function calling
 * Matches OpenAI/Claude tool format
 * 
 * CRITICAL: Always show both wallets separately (Core Wallet EOA and Smart Wallet)
 * Never combine balances - let user decide which to use
 */

import { NormalizedTool } from '../utils/FunctionCalling.js';

export const walletTools: NormalizedTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_wallet_info',
      description: 'Gets wallet addresses and info. Returns both the Core Wallet (EOA owner key for visibility) and the Agent Account (Universal/Smart Wallet where AI can execute transactions). The Agent Account is your AI-powered multi-chain wallet with gas abstraction.',
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
      name: 'get_wallet_balance',
      description: 'Gets token balances. Returns Core Wallet ELA balance (for visibility) and Agent Account multi-chain balances (Base, Ethereum, Polygon). The Agent Account balances are what you can help the user send, receive, and swap. Use this when user asks about their balance, holdings, USDC, ETH, or crypto.',
      parameters: {
        type: 'object',
        properties: {
          include_tokens: {
            type: 'boolean',
            description: 'If true, includes all token balances. Defaults to true.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: 'Gets system information about the PC2 node including CPU, memory, disk usage, uptime, and storage statistics. Use this when user asks about their node status, system resources, or storage usage.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];
