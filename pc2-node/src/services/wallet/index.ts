/**
 * Wallet Services Index
 * 
 * Exports for wallet-related services including:
 * - ParticleWalletProvider: AgentKit-compatible wallet adapter
 * - Transaction proposal types and utilities
 */

export { 
  ParticleWalletProvider, 
  createParticleWalletProvider,
  type ParticleWalletProviderConfig,
} from './ParticleWalletProvider.js';

// Re-export types from types directory
export type {
  TransactionProposal,
  TransactionProposalStatus,
  TransactionType,
  SessionKey,
  SessionKeyPermissions,
  SupportedNetwork,
  ChainBalance,
  TokenBalance,
  FeeEstimate,
  AgentKitToolResult,
  WalletAuditLog,
  TransactionResult,
} from '../../types/wallet-agent.js';

export {
  AGENT_SUPPORTED_CHAINS,
  getChainById,
  getChainByName,
} from '../../types/wallet-agent.js';
