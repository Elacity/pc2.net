/**
 * @fileoverview Type definitions for wallet-related data structures.
 * Using JSDoc for JavaScript projects without TypeScript.
 * 
 * @module types/wallet
 */

/**
 * Token information returned from Particle API
 * @typedef {Object} Token
 * @property {string} symbol - Token symbol (e.g., "USDC", "ETH")
 * @property {string} name - Human-readable token name
 * @property {string} balance - Token balance as decimal string
 * @property {number} decimals - Number of decimal places
 * @property {string} network - Network name (e.g., "Base", "Ethereum")
 * @property {number} chainId - Chain ID number
 * @property {string} [contractAddress] - ERC-20 contract address (null for native)
 * @property {string} [usdValue] - USD value as decimal string
 * @property {string} [tokenIcon] - URL or path to token icon
 */

/**
 * Transaction record from Particle API or Elastos explorer
 * @typedef {Object} Transaction
 * @property {string} transactionId - Internal Particle transaction ID
 * @property {string} [txHash] - On-chain transaction hash
 * @property {string} tag - Transaction type (e.g., "send", "receive", "swap")
 * @property {string} status - Status code or string
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {Token} [targetToken] - Token involved in transaction
 * @property {string} [symbol] - Token symbol shorthand
 * @property {string} [amount] - Amount transferred
 * @property {string} [from] - Sender address
 * @property {string} [to] - Recipient address
 * @property {number} [chainId] - Chain ID where transaction occurred
 * @property {string} [network] - Network name
 * @property {string} [tokenIcon] - Token icon URL
 */

/**
 * Wallet data aggregated from multiple sources
 * @typedef {Object} WalletData
 * @property {Token[]} tokens - List of token balances
 * @property {string} totalBalance - Total USD balance formatted
 * @property {string} eoaAddress - Externally Owned Account address
 * @property {string} smartAccountAddress - Smart Account address (EVM)
 * @property {string} [solanaAddress] - Solana Smart Account address
 * @property {Transaction[]} [transactions] - Recent transactions
 */

/**
 * Elastos-specific wallet data
 * @typedef {Object} ElastosData
 * @property {string} balance - ELA balance
 * @property {string} [usdValue] - USD equivalent
 * @property {Transaction[]} transactions - Elastos chain transactions
 */

/**
 * Chain information for display
 * @typedef {Object} ChainInfo
 * @property {string} name - Chain display name
 * @property {string} icon - Path to chain icon
 * @property {string} explorer - Block explorer base URL
 * @property {string} [color] - Brand color hex code
 * @property {number} chainId - Chain ID
 */

/**
 * Fee estimation result
 * @typedef {Object} FeeEstimate
 * @property {string} totalFeeUSD - Total fee in USD
 * @property {string} gasFeeUSD - Gas fee portion in USD
 * @property {string} serviceFeeUSD - Service fee portion in USD
 * @property {string} [nativeAmount] - Fee in native token
 * @property {string} [nativeSymbol] - Native token symbol
 * @property {boolean} isEstimate - Whether this is an estimate or exact
 */

/**
 * Send transaction parameters
 * @typedef {Object} SendTransactionParams
 * @property {string} tokenSymbol - Token to send
 * @property {string} amount - Amount as decimal string
 * @property {string} recipient - Recipient address
 * @property {string} network - Network name
 * @property {number} chainId - Target chain ID
 * @property {number} decimals - Token decimals
 * @property {string} [contractAddress] - ERC-20 contract (null for native)
 * @property {string} mode - Wallet mode ('universal' or 'elastos')
 */

/**
 * Network asset support configuration
 * @typedef {Object} NetworkAssetSupport
 * @property {string} name - Network display name
 * @property {number} chainId - Chain ID
 * @property {string[]} assets - Supported token symbols
 * @property {string} [gasWarning] - Warning about gas requirements
 * @property {string} icon - Network icon path
 */

/**
 * Wallet service listener callback
 * @callback WalletDataListener
 * @param {Object} data - Updated wallet data
 * @param {WalletData} [data.walletData] - Universal account data
 * @param {ElastosData} [data.elastosData] - Elastos EOA data
 * @param {string} data.mode - Current wallet mode
 */

/**
 * Message sent to Particle iframe
 * @typedef {Object} IframeMessage
 * @property {string} type - Message type (e.g., 'particle-wallet.get-tokens')
 * @property {Object} [payload] - Message payload
 */

/**
 * Response from Particle iframe
 * @typedef {Object} IframeResponse
 * @property {string} type - Response type
 * @property {Object} payload - Response data
 * @property {boolean} [payload.success] - Whether operation succeeded
 * @property {string} [payload.error] - Error message if failed
 */

// Export empty object to make this a module
export default {};


