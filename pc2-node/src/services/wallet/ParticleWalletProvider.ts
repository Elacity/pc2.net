/**
 * ParticleWalletProvider
 * 
 * Bridges Particle Network's Universal Account with AgentKit's WalletProvider interface.
 * This allows AgentKit actions to use Particle's smart account for transaction execution.
 * 
 * Design:
 * - Backend does NOT hold private keys
 * - Transactions are prepared here, but signed by frontend via Particle SDK
 * - Uses WebSocket to communicate with frontend for signing
 */

import { createPublicClient, http, encodeFunctionData, parseUnits, formatUnits } from 'viem';
import { base, mainnet, arbitrum, optimism, polygon } from 'viem/chains';
import { logger } from '../../utils/logger.js';
import { 
  SupportedNetwork, 
  TransactionProposal, 
  FeeEstimate,
  AGENT_SUPPORTED_CHAINS,
  getChainById,
} from '../../types/wallet-agent.js';

/**
 * Viem chain mapping
 */
const VIEM_CHAINS: Record<number, any> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

/**
 * ERC-20 Transfer ABI (minimal)
 */
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

/**
 * Configuration for ParticleWalletProvider
 */
export interface ParticleWalletProviderConfig {
  // EOA address (owner)
  eoaAddress: string;
  
  // Smart Account address (Particle Universal Account)
  smartAccountAddress: string;
  
  // Default chain ID
  defaultChainId?: number;
  
  // WebSocket server for frontend communication (for signing)
  // io?: SocketIOServer;
}

/**
 * ParticleWalletProvider - AgentKit-compatible wallet provider for Particle Universal Account
 * 
 * Note: This provider does NOT execute transactions directly.
 * It creates transaction proposals that are signed by the frontend.
 */
export class ParticleWalletProvider {
  private eoaAddress: string;
  private smartAccountAddress: string;
  private defaultChainId: number;
  private publicClients: Map<number, any> = new Map();
  
  constructor(config: ParticleWalletProviderConfig) {
    this.eoaAddress = config.eoaAddress.toLowerCase();
    this.smartAccountAddress = config.smartAccountAddress.toLowerCase();
    this.defaultChainId = config.defaultChainId || 8453; // Default to Base
    
    logger.info('[ParticleWalletProvider] Initialized', {
      eoa: this.eoaAddress,
      smartAccount: this.smartAccountAddress,
      defaultChain: this.defaultChainId,
    });
  }
  
  /**
   * Get the Smart Account address (used for transactions)
   */
  getAddress(): string {
    return this.smartAccountAddress;
  }
  
  /**
   * Get the EOA address (owner)
   */
  getEOAAddress(): string {
    return this.eoaAddress;
  }
  
  /**
   * Get the current chain ID
   */
  getChainId(): number {
    return this.defaultChainId;
  }
  
  /**
   * Set the current chain ID
   */
  setChainId(chainId: number): void {
    if (!this.supportsNetwork(chainId)) {
      throw new Error(`Chain ${chainId} is not supported`);
    }
    this.defaultChainId = chainId;
  }
  
  /**
   * Check if a network is supported
   */
  supportsNetwork(chainId: number): boolean {
    return AGENT_SUPPORTED_CHAINS.some(c => c.chainId === chainId);
  }
  
  /**
   * Get supported networks
   */
  getSupportedNetworks(): SupportedNetwork[] {
    return AGENT_SUPPORTED_CHAINS;
  }
  
  /**
   * Get or create a public client for a chain
   */
  private getPublicClient(chainId: number) {
    if (this.publicClients.has(chainId)) {
      return this.publicClients.get(chainId);
    }
    
    const chain = VIEM_CHAINS[chainId];
    const networkConfig = getChainById(chainId);
    
    if (!chain || !networkConfig) {
      throw new Error(`Chain ${chainId} is not configured`);
    }
    
    const client = createPublicClient({
      chain,
      transport: http(networkConfig.rpcUrl),
    });
    
    this.publicClients.set(chainId, client);
    return client;
  }
  
  /**
   * Get native token balance
   */
  async getBalance(chainId?: number): Promise<string> {
    const targetChainId = chainId || this.defaultChainId;
    const client = this.getPublicClient(targetChainId);
    
    const balance = await client.getBalance({
      address: this.smartAccountAddress as `0x${string}`,
    });
    
    return formatUnits(balance, 18);
  }
  
  /**
   * Get ERC-20 token balance
   */
  async getTokenBalance(
    tokenAddress: string,
    chainId?: number
  ): Promise<{ balance: string; decimals: number; symbol: string }> {
    const targetChainId = chainId || this.defaultChainId;
    const client = this.getPublicClient(targetChainId);
    
    // Get decimals
    const decimals = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'decimals',
    });
    
    // Get symbol
    const symbol = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'symbol',
    });
    
    // Get balance
    const balance = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'balanceOf',
      args: [this.smartAccountAddress as `0x${string}`],
    });
    
    return {
      balance: formatUnits(balance as bigint, decimals as number),
      decimals: decimals as number,
      symbol: symbol as string,
    };
  }
  
  /**
   * Prepare a native token transfer
   * Returns transaction data for frontend to sign
   */
  prepareNativeTransfer(
    to: string,
    amount: string,
    chainId?: number
  ): { to: string; value: string; data: string; chainId: number } {
    const targetChainId = chainId || this.defaultChainId;
    const valueWei = parseUnits(amount, 18);
    
    return {
      to: to.toLowerCase(),
      value: valueWei.toString(),
      data: '0x',
      chainId: targetChainId,
    };
  }
  
  /**
   * Prepare an ERC-20 token transfer
   * Returns transaction data for frontend to sign
   */
  prepareTokenTransfer(
    tokenAddress: string,
    to: string,
    amount: string,
    decimals: number,
    chainId?: number
  ): { to: string; value: string; data: string; chainId: number } {
    const targetChainId = chainId || this.defaultChainId;
    const amountWei = parseUnits(amount, decimals);
    
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, amountWei],
    });
    
    return {
      to: tokenAddress.toLowerCase(),
      value: '0',
      data,
      chainId: targetChainId,
    };
  }
  
  /**
   * Estimate gas for a transaction
   */
  async estimateGas(
    tx: { to: string; value?: string; data?: string },
    chainId?: number
  ): Promise<FeeEstimate> {
    const targetChainId = chainId || this.defaultChainId;
    const client = this.getPublicClient(targetChainId);
    const networkConfig = getChainById(targetChainId);
    
    try {
      // Estimate gas limit
      const gasLimit = await client.estimateGas({
        account: this.smartAccountAddress as `0x${string}`,
        to: tx.to as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : BigInt(0),
        data: (tx.data || '0x') as `0x${string}`,
      });
      
      // Get current gas price
      const gasPrice = await client.getGasPrice();
      
      // Calculate estimated cost
      const estimatedCostWei = gasLimit * gasPrice;
      const estimatedCost = formatUnits(estimatedCostWei, 18);
      
      // Get native token price for USD conversion (simplified)
      // In production, would use a price oracle
      const ethPrice = 2500; // Placeholder
      const estimatedCostUSD = parseFloat(estimatedCost) * ethPrice;
      
      // Particle provides gas sponsorship for most transactions
      // This is a simplified check - actual sponsorship depends on Particle's paymaster
      const isSponsored = targetChainId === 8453; // Base has best sponsorship
      
      return {
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
        estimatedCost,
        estimatedCostUSD,
        isSponsored,
        sponsorReason: isSponsored ? 'Particle paymaster active on Base' : undefined,
      };
    } catch (error: any) {
      logger.warn('[ParticleWalletProvider] Gas estimation failed:', error.message);
      
      // Return a conservative estimate
      return {
        gasLimit: '100000',
        gasPrice: '1000000000', // 1 gwei
        estimatedCost: '0.0001',
        estimatedCostUSD: 0.25,
        isSponsored: false,
      };
    }
  }
  
  /**
   * Create a transaction proposal for user approval
   * This does NOT execute the transaction - it creates a proposal
   * that the frontend will present to the user for signing
   */
  async createTransferProposal(
    to: string,
    amount: string,
    tokenAddress: string | null,
    tokenSymbol: string,
    tokenDecimals: number,
    chainId?: number
  ): Promise<TransactionProposal> {
    const targetChainId = chainId || this.defaultChainId;
    const networkConfig = getChainById(targetChainId);
    
    // Prepare transaction data
    let txData: { to: string; value: string; data: string; chainId: number };
    
    if (!tokenAddress) {
      // Native token transfer
      txData = this.prepareNativeTransfer(to, amount, targetChainId);
    } else {
      // ERC-20 transfer
      txData = this.prepareTokenTransfer(tokenAddress, to, amount, tokenDecimals, targetChainId);
    }
    
    // Estimate gas
    const feeEstimate = await this.estimateGas(txData, targetChainId);
    
    // Create proposal
    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const proposal: TransactionProposal = {
      id: proposalId,
      type: 'transfer',
      status: 'pending_approval',
      
      from: this.eoaAddress,
      smartAccountAddress: this.smartAccountAddress,
      
      to: txData.to,
      value: txData.value,
      data: txData.data,
      chainId: targetChainId,
      
      token: {
        address: tokenAddress,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
        amount,
      },
      
      summary: {
        action: `Send ${amount} ${tokenSymbol} to ${this.formatAddress(to)} on ${networkConfig?.name || 'Unknown'}`,
        estimatedGas: feeEstimate.isSponsored ? 'Free (sponsored)' : `~$${feeEstimate.estimatedCostUSD.toFixed(2)}`,
        estimatedGasUSD: feeEstimate.estimatedCostUSD,
        isSponsored: feeEstimate.isSponsored,
        totalCost: feeEstimate.isSponsored 
          ? `${amount} ${tokenSymbol}`
          : `${amount} ${tokenSymbol} + ~$${feeEstimate.estimatedCostUSD.toFixed(2)} gas`,
      },
      
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
    
    logger.info('[ParticleWalletProvider] Created transfer proposal', {
      proposalId,
      to,
      amount,
      token: tokenSymbol,
      chain: networkConfig?.name,
    });
    
    return proposal;
  }
  
  /**
   * Format address for display (truncate middle)
   */
  private formatAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  
  /**
   * Resolve ENS name to address (if applicable)
   * For now, just returns the input - ENS resolution would require mainnet connection
   */
  async resolveAddress(addressOrEns: string): Promise<string> {
    // If already an address, return it
    if (addressOrEns.startsWith('0x') && addressOrEns.length === 42) {
      return addressOrEns.toLowerCase();
    }
    
    // ENS resolution would go here
    // For now, throw an error for non-address inputs
    if (addressOrEns.endsWith('.eth')) {
      // In production, would resolve via mainnet ENS
      throw new Error('ENS resolution not yet implemented. Please use a wallet address.');
    }
    
    throw new Error(`Invalid address: ${addressOrEns}`);
  }
}

/**
 * Create a ParticleWalletProvider instance
 */
export function createParticleWalletProvider(
  eoaAddress: string,
  smartAccountAddress: string,
  defaultChainId?: number
): ParticleWalletProvider {
  return new ParticleWalletProvider({
    eoaAddress,
    smartAccountAddress,
    defaultChainId,
  });
}
