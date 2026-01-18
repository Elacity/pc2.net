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
  type IAssetsResponse,
} from '@particle-network/universal-account-sdk';
import { Web3Provider } from '../provider/web3-provider';

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

// Helper: Encode ERC-20 transfer function call
function encodeERC20Transfer(to: string, amount: string): string {
  // transfer(address,uint256) function selector: 0xa9059cbb
  const functionSelector = '0xa9059cbb';
  // Pad address to 32 bytes (remove 0x, pad to 64 chars)
  const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
  // Convert amount to hex and pad to 32 bytes
  const amountHex = BigInt(amount).toString(16).padStart(64, '0');
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
  const { isWalletMode, urlEoaAddress, urlSmartAddress } = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      isWalletMode: params.get('mode') === 'wallet',
      urlEoaAddress: params.get('address') || undefined,
      urlSmartAddress: params.get('smartAddress') || undefined,
    };
  }, []);

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
          console.log('[Particle Auth]: Smart Account Options:', options);
          
          setSmartAccountInfo({
            ownerAddress: eoaAddress,
            smartAccountAddress: options.smartAccountAddress || '',
            solanaSmartAccountAddress: options.solanaSmartAccountAddress || '',
          });
          
          if (options.smartAccountAddress) {
            console.log('[Particle Auth]: Using Smart Account:', options.smartAccountAddress);
          } else {
            console.log('[Particle Auth]: No Smart Account available, using EOA');
          }
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
      const response = await fetch(`${import.meta.env.VITE_PUTER_API_URL}/auth/particle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authPayload),
      });
      
      const data = await response.json();
      
      if (data.success) {
        window.postMessage({
          type: 'particle-auth.success',
          payload: {
            address: eoaAddress,
            smartAccountAddress: smartAccountInfo?.smartAccountAddress,
            chainId,
            token: data.token,
            user: data.user,
          }
        }, '*');
        if (import.meta.env.VITE_DEV_SANDBOX !== 'true') {
          // Redirect back to main app
          window.location.href = `/?auth_token=${data.token}`;
        }
      } else {
        console.error('Authentication failed:', data.message);
        window.postMessage({
          type: 'particle-auth.error',
          payload: {
            message: `failed to authenticate: ${data.message}`,
          }
        }, '*');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      window.postMessage({
        type: 'particle-auth.error',
        payload: {
          message: `authentication error: ${error}`,
        }
      }, '*');
    }
  }, [eoaAddress, chainId, smartAccountInfo]);

  // Trigger auth when active AND smart account info is loaded (or after timeout)
  React.useEffect(() => {
    if (!active) return;
    
    // Wait for Smart Account info to load, but don't wait forever
    const timeoutId = setTimeout(() => {
      handleParticleAuthSuccess();
    }, smartAccountInfo?.smartAccountAddress ? 0 : 2000); // Wait 2s for Smart Account, or send immediately if available
    
    return () => clearTimeout(timeoutId);
  }, [active, smartAccountInfo, handleParticleAuthSuccess]);

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
            const transactions = await universalAccount.getTransactions({
              page: 1,
              limit: 50,
            });
            
            const formattedTxs = transactions?.list?.map((tx: any) => ({
              hash: tx.hash || tx.transactionHash,
              type: tx.type || 'transfer',
              from: tx.from,
              to: tx.to,
              value: tx.value,
              amount: tx.amount,
              symbol: tx.symbol || 'ETH',
              chainId: tx.chainId,
              timestamp: tx.timestamp || tx.createdAt,
              status: tx.status || 'confirmed',
            })) || [];
            
            window.parent.postMessage({
              type: 'particle-wallet.transactions',
              requestId,
              payload: { transactions: formattedTxs },
            }, '*');
            break;
          }
          
          case 'particle-wallet.send': {
            // Send tokens using Universal Account
            const { to, amount, tokenAddress, chainId: targetChainId } = payload;
            
            const txParams: any = {
              to,
              value: tokenAddress ? '0' : amount,
            };
            
            // For ERC-20 tokens, create transfer call
            if (tokenAddress) {
              txParams.to = tokenAddress;
              txParams.data = encodeERC20Transfer(to, amount);
            }
            
            const result = await universalAccount.sendTransaction(txParams, {
              chainId: targetChainId,
            });
            
            window.parent.postMessage({
              type: 'particle-wallet.send-result',
              requestId,
              payload: { 
                success: true, 
                hash: result.hash || result.transactionHash,
                result,
              },
            }, '*');
            break;
          }
          
          case 'particle-wallet.estimate-fee': {
            // Estimate fee for transaction
            const { to, amount, tokenAddress, chainId: targetChainId } = payload;
            
            const txParams: any = {
              to: tokenAddress || to,
              value: tokenAddress ? '0' : amount,
            };
            
            if (tokenAddress) {
              txParams.data = encodeERC20Transfer(to, amount);
            }
            
            const feeQuote = await universalAccount.getFeeQuotes(txParams, {
              chainId: targetChainId,
            });
            
            const fee = feeQuote?.gasless?.fee || feeQuote?.standard?.fee || '0';
            const feeUSD = feeQuote?.gasless?.feeUSD || feeQuote?.standard?.feeUSD || 0;
            
            window.parent.postMessage({
              type: 'particle-wallet.tokens', // Reuse tokens response type
              requestId,
              payload: { 
                fee,
                feeUSD,
                feeSymbol: 'ETH',
                feeQuote,
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
