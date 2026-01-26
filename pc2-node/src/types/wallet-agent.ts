/**
 * Wallet Agent Types
 * Types for AI-powered wallet operations via AgentKit integration
 */

/**
 * Supported blockchain networks for Agent Account
 */
export interface SupportedNetwork {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
}

/**
 * Transaction proposal status
 */
export type TransactionProposalStatus = 
  | 'pending_approval'
  | 'approved' 
  | 'rejected'
  | 'executing'
  | 'executed' 
  | 'failed'
  | 'expired';

/**
 * Transaction type
 */
export type TransactionType = 
  | 'transfer'
  | 'swap'
  | 'approve'
  | 'bridge'
  | 'contract_call'
  | 'elacity_mint'
  | 'elacity_list'
  | 'elacity_buy';

/**
 * Transaction proposal - pending transaction awaiting user approval
 */
export interface TransactionProposal {
  id: string;
  type: TransactionType;
  status: TransactionProposalStatus;
  
  // Wallet addresses
  from: string;
  smartAccountAddress: string;
  
  // Transaction details
  to: string;
  recipient?: string; // The actual recipient address (for ERC-20 transfers, 'to' is the contract)
  value?: string;
  data?: string;
  chainId: number;
  
  // Token info (for transfers/swaps)
  token?: {
    address: string | null; // null for native token
    symbol: string;
    decimals: number;
    amount: string;
  };
  
  // Swap specific (if type === 'swap')
  swap?: {
    fromToken: {
      address: string | null;
      symbol: string;
      amount: string;
    };
    toToken: {
      address: string | null;
      symbol: string;
      expectedAmount: string;
      minAmount: string;
    };
    slippage: number;
    protocol: string; // e.g., "uniswap", "1inch"
  };
  
  // Human-readable summary
  summary: {
    action: string;           // "Send 50 USDC to bob.eth on Base"
    estimatedGas: string;     // "~$0.02"
    estimatedGasUSD: number;
    isSponsored: boolean;     // Gas abstraction active
    totalCost: string;        // "50.02 USDC" (amount + gas if not sponsored)
  };
  
  // Timestamps
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  executedAt?: number;
  
  // Rejection reason (if rejected)
  rejectionReason?: string;
  
  // Result (after execution)
  txHash?: string;
  blockNumber?: number;
  error?: string;
  
  // Session key info (if using autonomous mode)
  sessionKeyId?: string;
  withinSessionLimits?: boolean;
}

/**
 * Session key for autonomous agent actions
 */
export interface SessionKey {
  id: string;
  publicKey: string;
  
  // Associated wallet
  walletAddress: string;
  smartAccountAddress: string;
  
  // Permissions
  permissions: SessionKeyPermissions;
  
  // Lifecycle
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  
  // Usage tracking
  spentToday: string;      // In USD
  spentThisMonth: string;
  lastUsedAt?: number;
  usageCount: number;
}

/**
 * Session key permissions
 */
export interface SessionKeyPermissions {
  // Spending limits
  maxSpendPerTx: string;       // "50" (in USD)
  maxDailySpend: string;       // "200"
  maxMonthlySpend: string;     // "2000"
  
  // Allowed actions
  allowedActions: TransactionType[];
  
  // Allowed tokens (symbols)
  allowedTokens: string[];     // ["USDC", "ETH", "ELA"]
  
  // Allowed chains
  allowedChains: number[];     // [8453, 1, 42161]
  
  // Recipient whitelist (optional - if empty, any recipient allowed)
  allowedRecipients?: string[];
  
  // Contract whitelist (for contract_call type)
  allowedContracts?: string[];
}

/**
 * Wallet audit log entry
 */
export interface WalletAuditLog {
  id: string;
  timestamp: number;
  walletAddress: string;
  
  // Action details
  action: string;
  proposalId?: string;
  sessionKeyId?: string;
  
  // Result
  success: boolean;
  txHash?: string;
  error?: string;
  
  // Context
  details: Record<string, any>;
}

/**
 * Multi-chain balance info
 */
export interface ChainBalance {
  chainId: number;
  chainName: string;
  nativeBalance: string;
  nativeBalanceUSD: number;
  tokens: TokenBalance[];
  totalUSD: number;
}

/**
 * Token balance
 */
export interface TokenBalance {
  address: string | null; // null for native token
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceUSD: number;
  price: number;
  chainId: number;
}

/**
 * Transaction execution result
 */
export interface TransactionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  error?: string;
  
  // For swaps
  amountOut?: string;
}

/**
 * Fee estimate for a transaction
 */
export interface FeeEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedCost: string;
  estimatedCostUSD: number;
  isSponsored: boolean;
  sponsorReason?: string; // e.g., "Particle paymaster active"
}

/**
 * AgentKit action result (from tool execution)
 */
export interface AgentKitToolResult {
  success: boolean;
  
  // For read operations
  data?: any;
  
  // For write operations (transactions)
  proposal?: TransactionProposal;
  
  // Error
  error?: string;
  
  // Human-readable message for AI to relay
  message: string;
}

/**
 * Supported chains configuration
 */
export const AGENT_SUPPORTED_CHAINS: SupportedNetwork[] = [
  {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
  },
  {
    chainId: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  {
    chainId: 10,
    name: 'Optimism',
    shortName: 'OP',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    isTestnet: false,
  },
  {
    chainId: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    nativeCurrency: { symbol: 'POL', decimals: 18 },
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
];

/**
 * Get chain by ID
 */
export function getChainById(chainId: number): SupportedNetwork | undefined {
  return AGENT_SUPPORTED_CHAINS.find(c => c.chainId === chainId);
}

/**
 * Get chain by name (case-insensitive)
 */
export function getChainByName(name: string): SupportedNetwork | undefined {
  const lower = name.toLowerCase();
  return AGENT_SUPPORTED_CHAINS.find(
    c => c.name.toLowerCase() === lower || c.shortName.toLowerCase() === lower
  );
}
