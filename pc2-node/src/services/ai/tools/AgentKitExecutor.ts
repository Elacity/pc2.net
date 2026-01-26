/**
 * AgentKit Executor
 * 
 * Executes AgentKit-related AI tools for wallet operations.
 * All write operations create proposals that require user approval.
 * 
 * SOVEREIGNTY MODEL:
 * - Runs on user's PC2 node (self-hosted)
 * - User wallet-authenticated
 * - AI proposes, user approves
 * - No private keys stored - signing via frontend Particle SDK
 */

import { logger } from '../../../utils/logger.js';
import { ParticleWalletProvider, createParticleWalletProvider } from '../../wallet/ParticleWalletProvider.js';
import { 
  TransactionProposal, 
  AgentKitToolResult,
  ChainBalance,
  TokenBalance,
  getChainById,
  AGENT_SUPPORTED_CHAINS,
} from '../../../types/wallet-agent.js';
import { 
  COMMON_TOKENS, 
  getTokenInfo, 
  getChainIdFromName,
  isPrimaryAsset,
  PRIMARY_ASSETS,
} from './AgentKitTools.js';
import { Server as SocketIOServer } from 'socket.io';
import { getDatabase } from '../../../storage/index.js';

/**
 * In-memory store for pending proposals
 * In production, this should be persisted to the database
 */
export const pendingProposals: Map<string, TransactionProposal> = new Map();

/**
 * AgentKit Executor - handles AI tool calls for wallet operations
 */
export class AgentKitExecutor {
  private walletProvider: ParticleWalletProvider | null = null;
  private walletAddress: string;
  private smartAccountAddress: string | null;
  private io?: SocketIOServer;
  
  constructor(
    walletAddress: string,
    options?: {
      smartAccountAddress?: string;
      io?: SocketIOServer;
    }
  ) {
    this.walletAddress = walletAddress.toLowerCase();
    this.smartAccountAddress = options?.smartAccountAddress?.toLowerCase() || null;
    this.io = options?.io;
    
    // Initialize wallet provider if we have a smart account
    if (this.smartAccountAddress) {
      this.walletProvider = createParticleWalletProvider(
        this.walletAddress,
        this.smartAccountAddress
      );
    }
    
    logger.info('[AgentKitExecutor] Initialized', {
      walletAddress: this.walletAddress,
      hasSmartAccount: !!this.smartAccountAddress,
      hasWebSocket: !!this.io,
    });
  }
  
  /**
   * Check if AgentKit features are available
   * Requires a Smart Account (Universal Account)
   */
  isAvailable(): boolean {
    return !!this.walletProvider;
  }
  
  /**
   * Execute an AgentKit tool
   */
  async executeTool(toolName: string, args: any): Promise<AgentKitToolResult> {
    logger.info('[AgentKitExecutor] Executing tool:', { toolName, args });
    
    try {
      switch (toolName) {
        case 'get_multi_chain_balances':
          return await this.getMultiChainBalances(args);
          
        case 'get_token_price':
          return await this.getTokenPrice(args);
          
        case 'transfer_tokens':
          return await this.transferTokens(args);
          
        case 'swap_tokens':
          return await this.swapTokens(args);
          
        case 'estimate_transfer_fee':
          return await this.estimateTransferFee(args);
          
        case 'get_pending_proposals':
          return this.getPendingProposals();
          
        case 'get_proposal_status':
          return this.getProposalStatus(args);
          
        case 'get_session_status':
          return this.getSessionStatus();
          
        default:
          return {
            success: false,
            error: `Unknown AgentKit tool: ${toolName}`,
            message: `I don't recognize the tool "${toolName}".`,
          };
      }
    } catch (error: any) {
      logger.error('[AgentKitExecutor] Tool execution failed:', {
        toolName,
        error: error.message,
      });
      
      return {
        success: false,
        error: error.message,
        message: `Failed to execute ${toolName}: ${error.message}`,
      };
    }
  }
  
  /**
   * Get balances across all supported chains
   */
  private async getMultiChainBalances(args: any): Promise<AgentKitToolResult> {
    if (!this.walletProvider) {
      return {
        success: false,
        error: 'Smart Account not available',
        message: 'Multi-chain balances require a Universal Account (Smart Wallet). Please ensure you are logged in with Particle.',
      };
    }
    
    const includeZero = args.include_zero_balances === true;
    const balances: ChainBalance[] = [];
    
    for (const chain of AGENT_SUPPORTED_CHAINS) {
      try {
        // Get native balance
        const nativeBalance = await this.walletProvider.getBalance(chain.chainId);
        const nativeBalanceNum = parseFloat(nativeBalance);
        
        // Get token balances for common tokens
        const tokens: TokenBalance[] = [];
        const chainTokens = COMMON_TOKENS[chain.chainId] || {};
        
        for (const [symbol, tokenInfo] of Object.entries(chainTokens)) {
          if (!tokenInfo.address) continue; // Skip native token (already counted)
          
          try {
            const { balance, decimals } = await this.walletProvider.getTokenBalance(
              tokenInfo.address,
              chain.chainId
            );
            const balanceNum = parseFloat(balance);
            
            if (balanceNum > 0 || includeZero) {
              tokens.push({
                address: tokenInfo.address,
                symbol,
                name: symbol, // Simplified
                decimals,
                balance,
                balanceUSD: balanceNum, // Stablecoins ~$1
                price: 1,
                chainId: chain.chainId,
              });
            }
          } catch (e) {
            // Skip tokens that fail to load
          }
        }
        
        const totalUSD = nativeBalanceNum * 2500 + tokens.reduce((sum, t) => sum + t.balanceUSD, 0);
        
        if (nativeBalanceNum > 0 || tokens.length > 0 || includeZero) {
          balances.push({
            chainId: chain.chainId,
            chainName: chain.name,
            nativeBalance,
            nativeBalanceUSD: nativeBalanceNum * 2500, // Placeholder ETH price
            tokens,
            totalUSD,
          });
        }
      } catch (error: any) {
        logger.warn(`[AgentKitExecutor] Failed to get balance for ${chain.name}:`, error.message);
      }
    }
    
    // Format response for AI
    const totalAcrossChains = balances.reduce((sum, b) => sum + b.totalUSD, 0);
    
    let message = `Found balances across ${balances.length} chains:\n\n`;
    for (const chain of balances) {
      message += `**${chain.chainName}**: ${chain.nativeBalance} ${chain.chainId === 137 ? 'POL' : 'ETH'}`;
      if (chain.tokens.length > 0) {
        message += ` + ${chain.tokens.map(t => `${t.balance} ${t.symbol}`).join(', ')}`;
      }
      message += `\n`;
    }
    message += `\n**Total**: ~$${totalAcrossChains.toFixed(2)} USD`;
    
    return {
      success: true,
      data: { balances, totalUSD: totalAcrossChains },
      message,
    };
  }
  
  /**
   * Get token price (simplified - uses hardcoded values)
   */
  private async getTokenPrice(args: any): Promise<AgentKitToolResult> {
    const token = (args.token || '').toUpperCase();
    
    // Hardcoded prices for demo - in production, use CoinGecko API
    const prices: Record<string, number> = {
      'ETH': 2500,
      'BTC': 45000,
      'USDC': 1,
      'USDT': 1,
      'DAI': 1,
      'ELA': 1.80,
      'POL': 0.40,
      'MATIC': 0.40,
    };
    
    const price = prices[token];
    
    if (price === undefined) {
      return {
        success: false,
        error: `Unknown token: ${token}`,
        message: `I don't have price data for ${token}. Supported tokens: ${Object.keys(prices).join(', ')}`,
      };
    }
    
    return {
      success: true,
      data: { token, price, currency: 'USD' },
      message: `${token} is currently ~$${price.toFixed(2)} USD`,
    };
  }
  
  /**
   * Create a transfer proposal (requires user approval)
   */
  private async transferTokens(args: any): Promise<AgentKitToolResult> {
    logger.info('[AgentKitExecutor] transferTokens called with:', {
      hasWalletProvider: !!this.walletProvider,
      hasIo: !!this.io,
      walletAddress: this.walletAddress,
      smartAccountAddress: this.smartAccountAddress,
      args,
    });
    
    if (!this.walletProvider) {
      return {
        success: false,
        error: 'Smart Account not available',
        message: 'Token transfers require a Universal Account (Smart Wallet). Please ensure you are logged in with Particle.',
      };
    }
    
    // Validate required args
    const { to, amount, token, chain } = args;
    
    if (!to) {
      return {
        success: false,
        error: 'Missing recipient address',
        message: 'Please provide a recipient address (to).',
      };
    }
    
    if (!amount) {
      return {
        success: false,
        error: 'Missing amount',
        message: 'Please provide an amount to transfer.',
      };
    }
    
    if (!token) {
      return {
        success: false,
        error: 'Missing token',
        message: 'Please specify which token to transfer (e.g., USDC, ETH).',
      };
    }
    
    // Resolve chain
    const chainId = chain ? getChainIdFromName(chain) : 8453; // Default to Base
    const chainConfig = getChainById(chainId);
    
    if (!chainConfig) {
      return {
        success: false,
        error: `Unsupported chain: ${chain}`,
        message: `Chain "${chain}" is not supported. Available: base, ethereum, arbitrum, optimism, polygon.`,
      };
    }
    
    // Resolve token
    const tokenInfo = getTokenInfo(token, chainId);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: `Token ${token} not found on ${chainConfig.name}`,
        message: `Token "${token}" is not available on ${chainConfig.name}. Please check the token symbol.`,
      };
    }
    
    // Resolve recipient address
    let recipientAddress: string;
    try {
      recipientAddress = await this.walletProvider.resolveAddress(to);
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Invalid recipient: ${error.message}`,
      };
    }
    
    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return {
        success: false,
        error: 'Invalid amount',
        message: `"${amount}" is not a valid amount. Please provide a positive number.`,
      };
    }
    
    // Check balance
    try {
      if (tokenInfo.address) {
        const { balance } = await this.walletProvider.getTokenBalance(tokenInfo.address, chainId);
        if (parseFloat(balance) < amountNum) {
          return {
            success: false,
            error: 'Insufficient balance',
            message: `Insufficient ${token} balance. You have ${balance} ${token} but tried to send ${amount}.`,
          };
        }
      } else {
        const balance = await this.walletProvider.getBalance(chainId);
        if (parseFloat(balance) < amountNum) {
          return {
            success: false,
            error: 'Insufficient balance',
            message: `Insufficient ${token} balance. You have ${balance} ${token} but tried to send ${amount}.`,
          };
        }
      }
    } catch (error: any) {
      logger.warn('[AgentKitExecutor] Balance check failed:', error.message);
      // Continue anyway - balance check is a convenience, not a hard requirement
    }
    
    // Create proposal
    const proposal = await this.walletProvider.createTransferProposal(
      recipientAddress,
      amount,
      tokenInfo.address,
      token.toUpperCase(),
      tokenInfo.decimals,
      chainId
    );
    
    // Store proposal in memory and database
    pendingProposals.set(proposal.id, proposal);
    
    // Persist to database
    try {
      const db = getDatabase();
      db.saveProposal({
        id: proposal.id,
        walletAddress: this.walletAddress,
        type: proposal.type,
        status: proposal.status,
        from: proposal.from,
        smartAccountAddress: proposal.smartAccountAddress,
        recipient: proposal.recipient,
        to: proposal.to,
        value: proposal.value,
        data: proposal.data,
        chainId: proposal.chainId,
        token: proposal.token,
        summary: proposal.summary,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
      });
      logger.info('[AgentKitExecutor] Proposal saved to database:', proposal.id);
    } catch (dbError) {
      logger.warn('[AgentKitExecutor] Failed to save proposal to database:', dbError);
    }
    
    // Notify frontend via WebSocket
    // Room format is `user:${normalizedWallet}` (lowercase)
    if (this.io) {
      const room = `user:${this.walletAddress.toLowerCase()}`;
      this.io.to(room).emit('wallet-agent:proposal', { proposal });
      logger.info('[AgentKitExecutor] Sent proposal to frontend via room:', room, 'proposalId:', proposal.id);
    } else {
      logger.warn('[AgentKitExecutor] No WebSocket (io) available - cannot notify frontend');
    }
    
    // Return proposal for AI to present to user
    return {
      success: true,
      proposal,
      message: `**Transaction Proposal Created**\n\n` +
        `📤 **Action**: ${proposal.summary.action}\n` +
        `⛽ **Gas**: ${proposal.summary.estimatedGas}\n` +
        `💰 **Total Cost**: ${proposal.summary.totalCost}\n\n` +
        `⏳ This proposal requires your approval. Please review and approve in the wallet panel.\n\n` +
        `_Proposal ID: ${proposal.id}_`,
    };
  }
  
  /**
   * Create a swap proposal for primary assets using Particle UniversalX
   * Primary assets: USDC, USDT, ETH, BTC, SOL, BNB
   */
  private async swapTokens(args: any): Promise<AgentKitToolResult> {
    if (!this.walletProvider) {
      return {
        success: false,
        error: 'Smart Account not available',
        message: 'Swapping requires a Universal Account. Please connect your wallet first.',
      };
    }
    
    const { from_token, to_token, amount, to_chain } = args;
    
    // Validate required parameters
    if (!from_token || !to_token || !amount) {
      return {
        success: false,
        error: 'Missing required parameters',
        message: 'Please specify from_token, to_token, and amount for the swap.',
      };
    }
    
    const fromTokenUpper = from_token.toUpperCase();
    const toTokenUpper = to_token.toUpperCase();
    
    // Validate both tokens are primary assets
    if (!isPrimaryAsset(fromTokenUpper)) {
      return {
        success: false,
        error: `${fromTokenUpper} is not a primary asset`,
        message: `Cannot swap from ${fromTokenUpper}. Primary assets only: ${PRIMARY_ASSETS.join(', ')}. ` +
          `For non-primary tokens, please use a DEX directly.`,
      };
    }
    
    if (!isPrimaryAsset(toTokenUpper)) {
      return {
        success: false,
        error: `${toTokenUpper} is not a primary asset`,
        message: `Cannot swap to ${toTokenUpper}. Primary assets only: ${PRIMARY_ASSETS.join(', ')}. ` +
          `For buying non-primary tokens, this feature is coming soon.`,
      };
    }
    
    // Same token check
    if (fromTokenUpper === toTokenUpper) {
      return {
        success: false,
        error: 'Cannot swap same token',
        message: `Cannot swap ${fromTokenUpper} to itself. Please choose different tokens.`,
      };
    }
    
    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        success: false,
        error: 'Invalid amount',
        message: 'Please provide a valid positive amount to swap.',
      };
    }
    
    // Get destination chain ID
    const toChainId = to_chain ? getChainIdFromName(to_chain) : 8453; // Default to Base
    
    try {
      // Create swap proposal
      const proposal = await this.walletProvider.createSwapProposal(
        fromTokenUpper,
        toTokenUpper,
        amount,
        toChainId
      );
      
      // Store proposal in memory and database
      pendingProposals.set(proposal.id, proposal);
      
      // Persist to database (same pattern as transfer)
      try {
        const db = getDatabase();
        db.saveProposal({
          id: proposal.id,
          walletAddress: this.walletAddress,
          type: proposal.type,
          status: proposal.status,
          from: proposal.from,
          smartAccountAddress: proposal.smartAccountAddress,
          to: proposal.to,
          chainId: proposal.chainId,
          // For swaps, store from_token info in the token field
          token: {
            address: null,
            symbol: fromTokenUpper,
            decimals: 18,
            amount: amount,
          },
          summary: proposal.summary,
          createdAt: proposal.createdAt,
          expiresAt: proposal.expiresAt,
        });
        logger.info('[AgentKitExecutor] Swap proposal saved to database:', proposal.id);
      } catch (dbError) {
        logger.warn('[AgentKitExecutor] Failed to save swap proposal to database:', dbError);
      }
      
      // Notify frontend via WebSocket (same room format as transfer)
      if (this.io) {
        const room = `user:${this.walletAddress.toLowerCase()}`;
        this.io.to(room).emit('wallet-agent:proposal', { proposal });
        logger.info('[AgentKitExecutor] Sent swap proposal to frontend via room:', room, 'proposalId:', proposal.id);
      } else {
        logger.warn('[AgentKitExecutor] No WebSocket (io) available - cannot notify frontend');
      }
      
      // Return success with proposal details
      return {
        success: true,
        proposal,
        message: `📊 **Swap Proposal Created**\n\n` +
          `**Swap**: ${amount} ${fromTokenUpper} → ${toTokenUpper}\n` +
          `**Destination Chain**: ${getChainById(toChainId)?.name || 'Unknown'}\n` +
          `**Protocol**: Particle UniversalX\n` +
          `⛽ **Gas**: ${proposal.summary.estimatedGas}\n\n` +
          `⏳ This proposal requires your approval. Please review and approve in the wallet panel.\n\n` +
          `_Note: Exact output amount will be calculated at signing time based on current market prices._\n\n` +
          `_Proposal ID: ${proposal.id}_`,
      };
    } catch (error: any) {
      logger.error('[AgentKitExecutor] Failed to create swap proposal:', error);
      return {
        success: false,
        error: error.message || 'Failed to create swap proposal',
        message: `Failed to create swap proposal: ${error.message || 'Unknown error'}`,
      };
    }
  }
  
  /**
   * Estimate transfer fee without creating a proposal
   */
  private async estimateTransferFee(args: any): Promise<AgentKitToolResult> {
    if (!this.walletProvider) {
      return {
        success: false,
        error: 'Smart Account not available',
        message: 'Fee estimation requires a Universal Account.',
      };
    }
    
    const { to, amount, token, chain } = args;
    const chainId = chain ? getChainIdFromName(chain) : 8453;
    const tokenInfo = getTokenInfo(token || 'ETH', chainId);
    
    if (!tokenInfo) {
      return {
        success: false,
        error: `Token ${token} not found`,
        message: `Token "${token}" is not supported.`,
      };
    }
    
    // Prepare transaction
    let txData;
    if (tokenInfo.address) {
      txData = this.walletProvider.prepareTokenTransfer(
        tokenInfo.address,
        to || '0x0000000000000000000000000000000000000001',
        amount || '1',
        tokenInfo.decimals,
        chainId
      );
    } else {
      txData = this.walletProvider.prepareNativeTransfer(
        to || '0x0000000000000000000000000000000000000001',
        amount || '0.001',
        chainId
      );
    }
    
    const estimate = await this.walletProvider.estimateGas(txData, chainId);
    
    return {
      success: true,
      data: estimate,
      message: estimate.isSponsored
        ? `Gas is **free** (sponsored by Particle paymaster)! 🎉`
        : `Estimated gas: ~$${estimate.estimatedCostUSD.toFixed(2)} USD`,
    };
  }
  
  /**
   * Get all pending proposals for this wallet
   */
  private getPendingProposals(): AgentKitToolResult {
    const proposals = Array.from(pendingProposals.values())
      .filter(p => 
        p.from === this.walletAddress && 
        p.status === 'pending_approval' &&
        p.expiresAt > Date.now()
      );
    
    if (proposals.length === 0) {
      return {
        success: true,
        data: { proposals: [] },
        message: 'No pending transaction proposals.',
      };
    }
    
    let message = `**${proposals.length} Pending Proposal(s)**\n\n`;
    for (const p of proposals) {
      message += `• ${p.summary.action} (ID: ${p.id})\n`;
    }
    
    return {
      success: true,
      data: { proposals },
      message,
    };
  }
  
  /**
   * Get status of a specific proposal
   */
  private getProposalStatus(args: any): AgentKitToolResult {
    const { proposal_id } = args;
    
    if (!proposal_id) {
      return {
        success: false,
        error: 'Missing proposal_id',
        message: 'Please provide a proposal_id to check.',
      };
    }
    
    const proposal = pendingProposals.get(proposal_id);
    
    if (!proposal) {
      return {
        success: false,
        error: 'Proposal not found',
        message: `No proposal found with ID: ${proposal_id}`,
      };
    }
    
    let statusMessage = '';
    switch (proposal.status) {
      case 'pending_approval':
        statusMessage = '⏳ Awaiting your approval';
        break;
      case 'approved':
        statusMessage = '✅ Approved, executing...';
        break;
      case 'executed':
        statusMessage = `✅ Executed! Tx: ${proposal.txHash}`;
        break;
      case 'rejected':
        statusMessage = '❌ Rejected by user';
        break;
      case 'failed':
        statusMessage = `❌ Failed: ${proposal.error}`;
        break;
      case 'expired':
        statusMessage = '⏰ Expired';
        break;
    }
    
    return {
      success: true,
      data: { proposal },
      message: `**Proposal ${proposal_id}**\n${proposal.summary.action}\n\nStatus: ${statusMessage}`,
    };
  }
  
  /**
   * Get session key status (Phase 3 - placeholder)
   */
  private getSessionStatus(): AgentKitToolResult {
    // Session keys not yet implemented
    return {
      success: true,
      data: {
        hasActiveSession: false,
        message: 'Session keys are not yet enabled.',
      },
      message: 'Session keys for autonomous transactions are coming soon! For now, all transactions require manual approval.',
    };
  }
  
  /**
   * Update proposal status (called by API when user approves/rejects)
   */
  static updateProposalStatus(
    proposalId: string,
    status: 'approved' | 'rejected' | 'executed' | 'failed' | 'expired',
    extra?: { txHash?: string; error?: string; rejectionReason?: string }
  ): TransactionProposal | null {
    const proposal = pendingProposals.get(proposalId);
    if (!proposal) return null;
    
    proposal.status = status;
    
    if (status === 'approved') {
      proposal.approvedAt = Date.now();
    } else if (status === 'executed') {
      proposal.executedAt = Date.now();
      proposal.txHash = extra?.txHash;
    } else if (status === 'failed') {
      proposal.error = extra?.error;
    } else if (status === 'rejected') {
      proposal.error = extra?.rejectionReason || 'User rejected';
    }
    
    pendingProposals.set(proposalId, proposal);
    
    // Update in database
    try {
      const db = getDatabase();
      db.updateProposalStatus(proposalId, status, extra);
    } catch (dbError) {
      logger.warn('[AgentKitExecutor] Failed to update proposal in database:', dbError);
    }
    
    return proposal;
  }
  
  /**
   * Get proposal by ID
   */
  static getProposal(proposalId: string): TransactionProposal | null {
    // Try memory first
    const memoryProposal = pendingProposals.get(proposalId);
    if (memoryProposal) return memoryProposal;
    
    // Fall back to database
    try {
      const db = getDatabase();
      return db.getProposal(proposalId);
    } catch (dbError) {
      logger.warn('[AgentKitExecutor] Failed to get proposal from database:', dbError);
      return null;
    }
  }
  
  /**
   * Clean up expired proposals
   */
  static cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, proposal] of pendingProposals) {
      if (proposal.status === 'pending_approval' && proposal.expiresAt < now) {
        proposal.status = 'expired';
        pendingProposals.set(id, proposal);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Check if a tool name is an AgentKit tool
 */
export function isAgentKitTool(toolName: string): boolean {
  const agentKitToolNames = [
    'get_multi_chain_balances',
    'get_token_price',
    'transfer_tokens',
    'swap_tokens',
    'estimate_transfer_fee',
    'get_pending_proposals',
    'get_proposal_status',
    'get_session_status',
  ];
  
  return agentKitToolNames.includes(toolName);
}
