/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { isAddress } from '@ethersproject/address';
import { type Connector } from '@particle-network/connector-core';
import {
  useAccount,
  useDisconnect,
  useWallets,
} from '@particle-network/connectkit';
// @ts-ignore - TypeScript types not properly exported from package
import {
  UniversalAccount,
  createMultiChainUnsignedData,
  injectMultiChainSignature,
  type IAssetsResponse,
} from '@particle-network/universal-account-sdk';
import { Web3Provider } from '../provider/web3-provider';

// BUILD VERSION MARKER - this confirms we're running the latest bundle
console.log('[Particle Auth Context]: BUILD v2025.01.22.1830 loaded');

// Smart Account Info interface for UniversalX
interface SmartAccountInfo {
  ownerAddress: string;
  smartAccountAddress: string;
  solanaSmartAccountAddress?: string;
}

interface ConnectorContextValue {
  account?: string;
  eoaAddress?: string;
  library?: Web3Provider | null | undefined;
  chainId?: number;
  active?: boolean;
  connector?: Connector;
  smartAccountInfo?: SmartAccountInfo;
  universalAccount?: UniversalAccount;
  primaryAssets?: IAssetsResponse;
  deactivate: () => void;
  refreshPrimaryAssets?: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ParticleNetworkContext = React.createContext<ConnectorContextValue>({
  deactivate: () => {},
});

// Helper: Convert human-readable amount to smallest unit (wei)
function toSmallestUnit(amount: string, decimals: number): bigint {
  // Handle edge cases
  if (!amount || amount === '0') return BigInt(0);
  
  // Normalize the amount string
  const amountStr = amount.toString().trim();
  
  // Split into whole and fractional parts
  const [whole, fraction = ''] = amountStr.split('.');
  
  // Pad or truncate fraction to match decimals
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  
  // Combine and convert to BigInt
  const combined = whole + paddedFraction;
  
  // Remove leading zeros but keep at least one digit
  const cleaned = combined.replace(/^0+/, '') || '0';
  
  return BigInt(cleaned);
}

// Helper: Encode ERC-20 transfer function call
function encodeERC20Transfer(to: string, amount: string, decimals: number = 18): string {
  // transfer(address,uint256) function selector: 0xa9059cbb
  const functionSelector = '0xa9059cbb';
  // Pad address to 32 bytes (remove 0x, pad to 64 chars)
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  // Convert human-readable amount to smallest unit, then to hex
  const amountInSmallestUnit = toSmallestUnit(amount, decimals);
  const amountHex = amountInSmallestUnit.toString(16).padStart(64, '0');
  return functionSelector + paddedTo + amountHex;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ParticleNetworkContextProps {}

const ParticleNetworkProvider: React.FC<React.PropsWithChildren<ParticleNetworkContextProps>> = React.memo(({
  children,
}) => {
  const {
    address: connectedEoaAddress,
    chainId,
    connector,
  } = useAccount();
  const [primaryWallet] = useWallets();
  const { disconnect } = useDisconnect();
  const [particleProvider, setParticleProvider] = React.useState<unknown>();
  
  // Universal Account state
  const [universalAccount, setUniversalAccount] = React.useState<UniversalAccount | null>(null);
  const [smartAccountInfo, setSmartAccountInfo] = React.useState<SmartAccountInfo | undefined>();
  const [primaryAssets, setPrimaryAssets] = React.useState<IAssetsResponse | undefined>();

  // Wallet mode detection: check URL params for address passed from parent
  const { isWalletMode, urlEoaAddress, urlSmartAddress, shouldLogout } = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      isWalletMode: params.get('mode') === 'wallet',
      urlEoaAddress: params.get('address') || undefined,
      urlSmartAddress: params.get('smartAddress') || undefined,
      shouldLogout: params.get('logout') === 'true',
    };
  }, []);

  // Handle logout request from access-denied page
  React.useEffect(() => {
    if (shouldLogout && connectedEoaAddress) {
      console.log('[Particle Auth]: Logout requested, disconnecting wallet...');
      disconnect({ connector });
      // Clean URL by removing logout param
      const url = new URL(window.location.href);
      url.searchParams.delete('logout');
      window.history.replaceState({}, '', url.toString());
    }
  }, [shouldLogout, connectedEoaAddress, disconnect, connector]);

  // In wallet mode, we prefer the connected address (from restored session) 
  // but fall back to URL address if session isn't restored yet
  const eoaAddress = connectedEoaAddress || (isWalletMode ? urlEoaAddress : undefined);

  const library = React.useMemo(
    () => (particleProvider ? new Web3Provider(particleProvider) : null),
    [particleProvider]
  );
  
  React.useEffect(() => {
    const getProvider = async () => {
      const provider = await primaryWallet.connector.getProvider();
      setParticleProvider(provider);
    };

    if (connectedEoaAddress && primaryWallet) {
      getProvider();
    }
  }, [primaryWallet, connectedEoaAddress]);

  const deactivate = React.useCallback(() => {
    disconnect({ connector });
  }, [disconnect, connector]);

  // Active when we have both an address AND library (proper authentication context)
  // In wallet mode, the session should restore from localStorage automatically
  const active = React.useMemo(() => {
    const hasAuth = !!(eoaAddress && library);
    if (isWalletMode) {
      console.log('[Particle Auth]: Wallet mode session status:', { 
        hasAuth, 
        connectedEoaAddress, 
        urlEoaAddress,
        hasLibrary: !!library 
      });
    }
    return hasAuth;
  }, [library, eoaAddress, isWalletMode, connectedEoaAddress, urlEoaAddress]);

  React.useEffect(() => {
    if (!active) {
      setParticleProvider(null);
      setUniversalAccount(null);
      setSmartAccountInfo(undefined);
      setPrimaryAssets(undefined);
    }
  }, [active]);

  // Initialize UniversalAccount when properly connected (active = true means we have auth context)
  React.useEffect(() => {
    // Only initialize when active (has library/auth context) AND we have an address
    if (active && eoaAddress) {
      const projectId = import.meta.env.VITE_PARTICLE_PROJECT_ID;
      const clientKey = import.meta.env.VITE_PARTICLE_CLIENT_KEY;
      const appId = import.meta.env.VITE_PARTICLE_APP_ID;
      
      if (projectId && clientKey && appId) {
        console.log('[Particle Auth]: Initializing UniversalAccount for EOA:', eoaAddress, isWalletMode ? '(wallet mode)' : '');
        
        const ua = new UniversalAccount({
          projectId,
          projectClientKey: clientKey,
          projectAppUuid: appId,
          ownerAddress: eoaAddress,
        });
        
        setUniversalAccount(ua);
        
        // In wallet mode with URL smart address, use it as a hint (but SDK will verify)
        if (isWalletMode && urlSmartAddress) {
          console.log('[Particle Auth]: Smart Account hint from URL:', urlSmartAddress);
          setSmartAccountInfo({
            ownerAddress: eoaAddress,
            smartAccountAddress: urlSmartAddress,
          });
        }
      } else {
        console.warn('[Particle Auth]: Missing Particle credentials for UniversalAccount');
      }
    }
  }, [active, eoaAddress, isWalletMode, urlSmartAddress]);

  // Fetch Smart Account addresses when UA is initialized
  React.useEffect(() => {
    if (universalAccount && eoaAddress) {
      const fetchSmartAccountInfo = async () => {
        try {
          const options = await universalAccount.getSmartAccountOptions();
          
          // Debug: Log the entire options object to see all fields
          console.log('[Particle Auth]: Smart Account Options (full):', JSON.stringify(options, null, 2));
          console.log('[Particle Auth]: options.smartAccountAddress:', options.smartAccountAddress);
          console.log('[Particle Auth]: options.solanaSmartAccountAddress:', options.solanaSmartAccountAddress);
          console.log('[Particle Auth]: options.senderSolanaAddress:', (options as any).senderSolanaAddress);
          
          // Try different possible field names for Solana address
          const solanaAddr = options.solanaSmartAccountAddress 
            || (options as any).senderSolanaAddress 
            || (options as any).solanaAddress
            || '';
          
          setSmartAccountInfo({
            ownerAddress: eoaAddress,
            smartAccountAddress: options.smartAccountAddress || '',
            solanaSmartAccountAddress: solanaAddr,
          });
          
          console.log('[Particle Auth]: Using Smart Account (EVM):', options.smartAccountAddress);
          console.log('[Particle Auth]: Using Smart Account (Solana):', solanaAddr || 'Not available');
        } catch (error) {
          console.error('[Particle Auth]: Failed to get Smart Account options:', error);
        }
      };
      
      fetchSmartAccountInfo();
    }
  }, [universalAccount, eoaAddress]);

  // Fetch Primary Assets
  const fetchPrimaryAssets = React.useCallback(async () => {
    if (!universalAccount) return;
    
    try {
      const assets = await universalAccount.getPrimaryAssets();
      console.log('[Particle Auth]: Primary Assets:', assets);
      setPrimaryAssets(assets);
    } catch (error) {
      console.warn('[Particle Auth]: Failed to fetch primary assets:', error);
    }
  }, [universalAccount]);

  React.useEffect(() => {
    if (universalAccount) {
      fetchPrimaryAssets();
    }
  }, [universalAccount, fetchPrimaryAssets]);

  // After successful authentication with Particle Network
  const handleParticleAuthSuccess = React.useCallback(async () => {
    try {
      // Build auth payload with Smart Account support
      const authPayload: Record<string, any> = {
        address: eoaAddress,  // EOA address (always present)
        chainId,
      };
      
      // Add Smart Account address if available (UniversalX)
      if (smartAccountInfo?.smartAccountAddress) {
        authPayload.smartAccountAddress = smartAccountInfo.smartAccountAddress;
        console.log('[Particle Auth]: Sending auth with Smart Account:', smartAccountInfo.smartAccountAddress);
      } else {
        console.log('[Particle Auth]: Sending auth with EOA only (Smart Account not ready yet)');
      }
      
      // Call Puter's backend to authenticate
      // Use runtime API origin (injected by PC2 node) or fallback to build-time env
      // CRITICAL: Ensure HTTPS protocol when page is served over HTTPS to avoid mixed content
      let apiOrigin = (window as any).PUTER_API_ORIGIN || import.meta.env.VITE_PUTER_API_URL || window.location.origin;
      if (window.location.protocol === 'https:' && apiOrigin.startsWith('http://')) {
        apiOrigin = apiOrigin.replace('http://', 'https://');
      }
      console.log('[Particle Auth]: Auth callback using API origin:', apiOrigin);
      const response = await fetch(`${apiOrigin}/auth/particle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authPayload),
      });
      
      const data = await response.json();
      
      // Determine if we're running in an iframe (embedded by UIWindowParticleLogin)
      // Use multiple detection methods as some browsers/contexts may behave differently
      let isInIframe = false;
      try {
        isInIframe = window !== window.parent || window.self !== window.top;
      } catch (e) {
        // Cross-origin iframe - we're definitely in an iframe
        isInIframe = true;
      }
      
      console.log('[Particle Auth]: isInIframe detection:', isInIframe, 
        'window !== parent:', window !== window.parent,
        'self !== top:', window.self !== window.top);
      
      // Use parent.postMessage when in iframe, otherwise self
      const messageTarget = isInIframe ? window.parent : window;
      
      if (data.success) {
        console.log('[Particle Auth]: Auth SUCCESS, posting to:', isInIframe ? 'parent' : 'self');
        messageTarget.postMessage({
          type: 'particle-auth.success',
          payload: {
            address: eoaAddress,
            smartAccountAddress: smartAccountInfo?.smartAccountAddress,
            chainId,
            token: data.token,
            user: data.user,
          }
        }, '*');
        
        // NEVER redirect when in iframe - let parent handle it via message
        // Only redirect in standalone mode (when particle-auth is opened directly in a tab)
        if (!isInIframe && import.meta.env.VITE_DEV_SANDBOX !== 'true') {
          console.log('[Particle Auth]: Standalone mode, redirecting to main app');
          window.location.href = `/?auth_token=${data.token}`;
        } else {
          console.log('[Particle Auth]: In iframe, NOT redirecting (parent handles it)');
        }
      } else {
        console.error('Authentication failed:', data.error, data.message);
        
        // Handle access denied - redirect to access-denied page
        if (data.error === 'access_denied') {
          console.log('[Particle Auth]: Access denied, redirecting to access-denied page');
          const deniedUrl = `/access-denied?wallet=${encodeURIComponent(data.wallet || eoaAddress)}`;
          
          if (!isInIframe) {
            window.location.href = deniedUrl;
          } else {
            // Tell parent to redirect
            messageTarget.postMessage({
              type: 'particle-auth.access-denied',
              payload: {
                wallet: data.wallet || eoaAddress,
                message: data.message,
                redirectUrl: deniedUrl,
              }
            }, '*');
          }
          return;
        }
        
        messageTarget.postMessage({
          type: 'particle-auth.error',
          payload: {
            message: `failed to authenticate: ${data.message}`,
          }
        }, '*');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      // Use parent.postMessage when in iframe
      const isInIframe = window !== window.parent;
      const messageTarget = isInIframe ? window.parent : window;
      messageTarget.postMessage({
        type: 'particle-auth.error',
        payload: {
          message: `authentication error: ${error}`,
        }
      }, '*');
    }
  }, [eoaAddress, chainId, smartAccountInfo]);

  // Trigger auth when active AND smart account info is loaded (or after timeout)
  // CRITICAL: Do NOT trigger auth in wallet mode - wallet iframe is for data operations only
  React.useEffect(() => {
    if (!active) return;
    
    // Skip auth if logout was requested - let logout effect handle disconnect first
    if (shouldLogout) {
      console.log('[Particle Auth]: Skipping auth (logout requested)');
      return;
    }
    
    // Skip auth callback in wallet mode - only the login iframe should do this
    if (isWalletMode) {
      console.log('[Particle Auth Wallet Mode]: Skipping auth callback (wallet mode)');
      return;
    }
    
    // Wait for Smart Account info to load, but don't wait forever
    const timeoutId = setTimeout(() => {
      handleParticleAuthSuccess();
    }, smartAccountInfo?.smartAccountAddress ? 0 : 2000); // Wait 2s for Smart Account, or send immediately if available
    
    return () => clearTimeout(timeoutId);
  }, [active, smartAccountInfo, handleParticleAuthSuccess, isWalletMode, shouldLogout]);

  React.useEffect(() => {
    // Initialize timeout ID as undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if(active) {
      const isDisconnecting = localStorage.getItem('disconnect_particle');
      if((isDisconnecting)) {
        localStorage.removeItem('disconnect_particle');
        deactivate();
      }
    }

    return () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [deactivate, active]);

  // ==========================================
  // Wallet Data Request Handlers (for Account Sidebar)
  // ==========================================
  
  React.useEffect(() => {
    if (!active || !universalAccount) return;
    
    // Signal to parent window that wallet is ready for requests
    console.log('[Particle Auth]: Wallet ready, signaling parent window');
    window.parent.postMessage({
      type: 'particle-wallet.ready',
      payload: { 
        ready: true,
        address: eoaAddress,
        smartAccountAddress: smartAccountInfo?.smartAccountAddress,
      },
    }, '*');

    const handleWalletDataRequest = async (event: MessageEvent) => {
      // Security: Accept messages from parent window only
      const { type, requestId, payload } = event.data || {};
      
      if (!type?.startsWith('particle-wallet.')) return;

      try {
        switch (type) {
          case 'particle-wallet.get-tokens': {
            // Fetch tokens from Universal Account primary assets
            console.log('[Particle Auth]: get-tokens handler called, universalAccount:', !!universalAccount);
            console.log('[Particle Auth]: Calling getPrimaryAssets()...');
            
            // Add timeout to detect hanging calls
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('getPrimaryAssets() timed out after 15s')), 15000)
            );
            
            let assets: any;
            try {
              assets = await Promise.race([
                universalAccount.getPrimaryAssets(),
                timeoutPromise
              ]);
              console.log('[Particle Auth]: getPrimaryAssets() succeeded:', JSON.stringify(assets, null, 2));
            } catch (fetchError: any) {
              console.error('[Particle Auth]: getPrimaryAssets() FAILED:', fetchError.message || fetchError);
              // Return empty response on error
              window.parent.postMessage({
                type: 'particle-wallet.tokens',
                requestId,
                payload: { tokens: [], totalBalance: 0, error: fetchError.message },
              }, '*');
              break;
            }
            // Map from Particle SDK response format: { assets: [...], totalAmountInUSD: number }
            // Each asset has: tokenType, price, amount, amountInUSD, chainAggregation[]
            const tokens = assets?.assets?.map((asset: any) => ({
              symbol: (asset.tokenType || 'unknown').toUpperCase(),
              name: asset.tokenType || 'Unknown Token',
              address: asset.chainAggregation?.[0]?.token?.address || '0x0',
              balance: asset.amount || 0,
              decimals: asset.chainAggregation?.[0]?.token?.decimals || 18,
              chainId: asset.chainAggregation?.[0]?.token?.chainId,
              icon: null,
              logoURI: null,
              usdValue: asset.amountInUSD || 0,
              price: asset.price || 0,
              // Include chain breakdown for multi-chain display
              chainBreakdown: asset.chainAggregation?.map((chain: any) => ({
                chainId: chain.token?.chainId,
                amount: chain.amount,
                amountInUSD: chain.amountInUSD,
              })) || [],
            })).filter((token: any) => token.balance > 0 || token.usdValue > 0) || [];
            
            // Use totalAmountInUSD from Particle response directly
            const totalBalance = assets?.totalAmountInUSD || 0;
            
            console.log('[Particle Auth]: Sending tokens response:', { tokensCount: tokens.length, totalBalance, rawAssets: assets?.assets?.length });
            window.parent.postMessage({
              type: 'particle-wallet.tokens',
              requestId,
              payload: { tokens, totalBalance },
            }, '*');
            break;
          }
          
          case 'particle-wallet.get-transactions': {
            // Fetch transaction history from Universal Account
            // API: getTransactions(page, limit) returns { data: Transaction[] }
            const page = payload?.page || 1;
            const limit = payload?.limit || 20;
            
            console.log('[Particle Wallet Handler] Fetching transactions, page:', page, 'limit:', limit);
            
            const txResponse = await universalAccount.getTransactions(page, limit);
            const transactions = txResponse?.data || txResponse || [];
            
            console.log('[Particle Wallet Handler] Transactions response:', transactions?.length || 0, 'items');
            
            // Format transactions - flatten structure for frontend compatibility
            const formattedTxs = (Array.isArray(transactions) ? transactions : []).map((tx: any) => {
              // Determine if send or receive based on amount sign
              const rawAmount = parseFloat(tx.change?.amount || '0');
              const isSend = rawAmount < 0;
              const displayAmount = Math.abs(rawAmount).toString();
              
              return {
                transactionId: tx.transactionId,
                hash: tx.transactionId, // Internal ID, real hash needs getTransaction() call
                tag: tx.tag, // e.g., 'transfer_v2', 'buy', 'sell'
                type: isSend ? 'send' : 'receive',
                createdAt: tx.createdAt,
                timestamp: tx.createdAt,
                status: tx.status, // 0 = pending, 7 = finished
                
                // Flatten token info to top level (what frontend expects)
                symbol: tx.targetToken?.symbol || 'Unknown',
                tokenName: tx.targetToken?.name || 'Unknown Token',
                tokenIcon: tx.targetToken?.image, // Frontend will check this
                tokenPrice: tx.targetToken?.price,
                
                // Also keep targetToken for backward compatibility
                targetToken: {
                  name: tx.targetToken?.name,
                  symbol: tx.targetToken?.symbol,
                  image: tx.targetToken?.image,
                  type: tx.targetToken?.type,
                  price: tx.targetToken?.price,
                  chainId: tx.targetToken?.chainId,
                },
                
                // Change info - use absolute amount for display
                amount: displayAmount,
                rawAmount: tx.change?.amount, // Keep original signed amount
                amountInUSD: tx.change?.amountInUSD,
                from: tx.change?.from,
                to: tx.change?.to,
                
                // Chain info
                fromChains: tx.fromChains || [],
                toChains: tx.toChains || [],
                chainId: tx.targetToken?.chainId || tx.toChains?.[0],
              };
            });
            
            console.log('[Particle Wallet Handler] Formatted transactions:', formattedTxs.length);
            
            window.parent.postMessage({
              type: 'particle-wallet.transactions',
              requestId,
              payload: { 
                transactions: formattedTxs,
                hasMore: formattedTxs.length >= limit,
                page,
              },
            }, '*');
            break;
          }
          
          case 'particle-wallet.get-transaction-details': {
            // Fetch full transaction details to get blockchain tx hash for explorer
            const { transactionId } = payload;
            
            if (!transactionId) {
              throw new Error('Transaction ID required');
            }
            
            console.log('[Particle Wallet Handler] Fetching transaction details:', transactionId);
            
            // Call universalAccount.getTransaction(transactionId)
            const txDetails = await universalAccount.getTransaction(transactionId);
            
            console.log('[Particle Wallet Handler] Transaction details:', txDetails);
            
            // Extract blockchain tx hash from user operations
            const operations = [
              ...(txDetails?.lendingUserOperations || []),
              ...(txDetails?.depositUserOperations || []),
              ...(txDetails?.userOperations || []),
            ];
            
            // Find first operation with a blockchain transaction hash
            const operation = operations.find((op: any) => op?.txHash);
            
            const blockchainTxHash = operation?.txHash || null;
            const operationChainId = operation?.chainId || txDetails?.targetToken?.chainId;
            
            console.log('[Particle Wallet Handler] Blockchain hash:', blockchainTxHash, 'chainId:', operationChainId);
            
            window.parent.postMessage({
              type: 'particle-wallet.transaction-details',
              requestId,
              payload: {
                transactionId,
                blockchainTxHash,
                chainId: operationChainId,
                details: txDetails,
              },
            }, '*');
            break;
          }
          
          case 'particle-wallet.send': {
            // Ensure smart account is fully initialized before operations
            if (!smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
            }
            
            // Send tokens using Universal Account's createTransferTransaction API
            const { to, amount, tokenAddress, chainId: targetChainId, decimals = 18 } = payload;
            
            // Detect if this is a Solana transfer (chain ID 101)
            const isSolanaTransfer = targetChainId === 101;
            
            console.log('[Particle Wallet Handler] Transfer request:', {
              to,
              amount,
              tokenAddress,
              targetChainId,
              decimals,
              isSolanaTransfer,
            });
            
            // For Solana transfers, verify we have a Solana smart account
            if (isSolanaTransfer && !smartAccountInfo?.solanaSmartAccountAddress) {
              console.warn('[Particle Wallet Handler] Solana smart account not available');
              // Continue anyway - the SDK may still handle it
            }
            
            // Use the proper Universal Account transfer API
            // The SDK expects the token as { chainId, address } and amount as string
            const transferPayload = {
              token: {
                chainId: targetChainId || 8453, // Default to Base
                address: tokenAddress || '0x0000000000000000000000000000000000000000', // Native token = zero address
              },
              amount: amount, // Human-readable amount (SDK handles conversion)
              receiver: to,
            };
            
            console.log('[Particle Wallet Handler] Creating transfer transaction:', transferPayload);
            console.log('[Particle Wallet Handler] Connected EOA:', connectedEoaAddress);
            console.log('[Particle Wallet Handler] Smart Account (EVM):', smartAccountInfo?.smartAccountAddress);
            console.log('[Particle Wallet Handler] Smart Account (Solana):', smartAccountInfo?.solanaSmartAccountAddress);
            
            // Create the transaction (this includes fee calculation)
            const transaction = await universalAccount.createTransferTransaction(transferPayload);
            
            console.log('[Particle Wallet Handler] Transaction created:', transaction);
            console.log('[Particle Wallet Handler] Transaction userOps:', transaction.userOps?.length);
            
            // For Universal Account, we need to sign using the proper multi-chain signing flow
            const userOps = transaction.userOps || [];
            if (userOps.length === 0) {
              throw new Error('No user operations in transaction');
            }
            
            // Create the unsigned data that needs to be signed
            const unsignedData = createMultiChainUnsignedData(userOps);
            console.log('[Particle Wallet Handler] Unsigned data to sign:', unsignedData);
            
            // Request signature from the wallet provider
            const provider = await connector?.getProvider();
            if (!provider) {
              throw new Error('No wallet provider available');
            }
            
            // The unsignedData is typically a hex string (the merkle root or combined hash)
            // Sign it with personal_sign using the connected EOA
            const dataToSign = typeof unsignedData === 'string' ? unsignedData : unsignedData.merkleRoot || unsignedData.hash;
            
            console.log('[Particle Wallet Handler] Signing data:', dataToSign, 'with address:', connectedEoaAddress);
            
            const signature = await (provider as any).request({
              method: 'personal_sign',
              params: [dataToSign, connectedEoaAddress],
            });
            
            console.log('[Particle Wallet Handler] Signature obtained:', signature?.substring(0, 20) + '...');
            
            // Inject the signature into the transaction
            injectMultiChainSignature(transaction, signature);
            console.log('[Particle Wallet Handler] Signature injected into transaction');
            
            // Send the signed transaction
            const result = await universalAccount.sendTransaction(transaction, signature);
            
            console.log('[Particle Wallet Handler] Transaction sent:', result);
            
            window.parent.postMessage({
              type: 'particle-wallet.send-result',
              requestId,
              payload: { 
                success: true, 
                hash: result.transactionHash || result.hash || transaction.transactionId,
                transactionId: transaction.transactionId,
                result,
              },
            }, '*');
            break;
          }
          
          case 'particle-wallet.estimate-fee': {
            // Ensure smart account is fully initialized before operations
            if (!smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
            }
            
            // Estimate fee by creating a transfer transaction (doesn't execute)
            const { to, amount, tokenAddress, chainId: targetChainId } = payload;
            
            // Detect if this is a Solana transfer
            const isSolanaTransfer = targetChainId === 101;
            
            // Use the proper Universal Account transfer API
            const transferPayload = {
              token: {
                chainId: targetChainId || 8453, // Default to Base
                address: tokenAddress || '0x0000000000000000000000000000000000000000',
              },
              amount: amount,
              receiver: to,
            };
            
            console.log('[Particle Wallet Handler] Estimating fee for:', {
              ...transferPayload,
              isSolanaTransfer,
            });
            
            // Create transaction to get fee info (doesn't execute)
            const transaction = await universalAccount.createTransferTransaction(transferPayload);
            
            console.log('[Particle Wallet Handler] Transaction created for fee estimate:', transaction);
            
            // Extract fee information from the transaction
            const fees = transaction.tokenChanges?.totalFeeInUSD || '0';
            const freeGasFee = transaction.transactionFees?.freeGasFee || false;
            const freeServiceFee = transaction.transactionFees?.freeServiceFee || false;
            
            // Solana-specific fees (rent for new token accounts)
            const solanaRent = transaction.tokenChanges?.solanaRentFee || transaction.fees?.totals?.solanaRentFee || null;
            const solanaRentUSD = transaction.tokenChanges?.solanaRentFeeInUSD || transaction.fees?.totals?.solanaRentFeeInUSD || null;
            
            console.log('[Particle Wallet Handler] Fee estimate:', { 
              fees, 
              freeGasFee, 
              freeServiceFee,
              isSolanaTransfer,
              solanaRent,
              solanaRentUSD,
            });
            
            window.parent.postMessage({
              type: 'particle-wallet.fee-estimate',
              requestId,
              payload: { 
                success: true,
                feeEstimate: {
                  total: fees,
                  totalUSD: parseFloat(fees) || 0,
                  gas: transaction.transactionFees?.transactionServiceFeeAmountInUSD || '0',
                  gasUSD: parseFloat(transaction.transactionFees?.transactionServiceFeeAmountInUSD || '0'),
                  service: transaction.transactionFees?.transactionLPFeeAmountInUSD || '0',
                  serviceUSD: parseFloat(transaction.transactionFees?.transactionLPFeeAmountInUSD || '0'),
                  lp: '0',
                  lpUSD: 0,
                  freeGasFee,
                  freeServiceFee,
                  // Solana-specific
                  solanaRent,
                  solanaRentUSD,
                  isSolanaTransfer,
                },
              },
            }, '*');
            break;
          }
        }
      } catch (error: any) {
        console.error('[Particle Wallet Handler]:', error);
        window.parent.postMessage({
          type: 'particle-wallet.error',
          requestId,
          payload: { message: error.message || 'Unknown error' },
        }, '*');
      }
    };

    window.addEventListener('message', handleWalletDataRequest);
    
    return () => {
      window.removeEventListener('message', handleWalletDataRequest);
    };
  }, [active, universalAccount]);

  // Send updated smart account info to parent when it becomes available
  // This runs separately from the ready message to ensure parent gets the smart account
  React.useEffect(() => {
    if (!active || !smartAccountInfo?.smartAccountAddress) return;
    
    console.log('[Particle Auth]: Smart Account loaded, notifying parent:', smartAccountInfo.smartAccountAddress);
    window.parent.postMessage({
      type: 'particle-wallet.ready',
      payload: { 
        ready: true,
        address: eoaAddress,
        smartAccountAddress: smartAccountInfo.smartAccountAddress,
        solanaSmartAccountAddress: smartAccountInfo.solanaSmartAccountAddress,
      },
    }, '*');
  }, [active, smartAccountInfo, eoaAddress]);

  // Determine the active account - prefer Smart Account if available
  const account = smartAccountInfo?.smartAccountAddress || eoaAddress;

  return (
    <ParticleNetworkContext.Provider
      value={{
        ...(isAddress(eoaAddress as string) && {
          chainId,
          account,
          eoaAddress,
          library,
          active,
          connector,
          smartAccountInfo,
          universalAccount: universalAccount || undefined,
          primaryAssets,
          refreshPrimaryAssets: fetchPrimaryAssets,
        }),
        deactivate,
      }}
    >
      {children}
    </ParticleNetworkContext.Provider>
  );
});

ParticleNetworkProvider.displayName = 'ParticleNetworkProviderInner';

export default ParticleNetworkProvider;
