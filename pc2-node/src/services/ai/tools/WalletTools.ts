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
      description: 'Gets the user\'s wallet addresses. Returns BOTH wallets separately: Core Wallet (EOA/owner account used for signing and identity) and Smart Wallet (Particle Universal Account for gas abstraction and batched transactions). Never combine them - always report both separately.',
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
      description: 'Gets ELA and token balances for BOTH wallets separately. Returns Core Wallet balance and Smart Wallet balance independently - never combines totals. Use this when user asks about their balance, holdings, or how much crypto they have.',
      parameters: {
        type: 'object',
        properties: {
          include_tokens: {
            type: 'boolean',
            description: 'If true, includes ERC-20 token balances in addition to native ELA. Defaults to true.'
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
