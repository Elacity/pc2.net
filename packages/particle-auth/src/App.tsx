import { useEffect, useCallback, useState, useRef } from 'react';
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import './App.css';

// Get API origin from URL params or default to current origin
function getApiOrigin(): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('api_origin') || window.location.origin;
}

function App() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authComplete, setAuthComplete] = useState(false);
  
  // Track the address that was selected via the modal (not auto-connected)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [modalWasOpened, setModalWasOpened] = useState(false);
  const hasDisconnectedOnMount = useRef(false);
  const previousAddress = useRef<string | null>(null);

  // Parse URL params for mode
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode') || 'login';
  
  // On mount in login mode, FORCE disconnect any existing connection
  useEffect(() => {
    if (mode === 'login' && !hasDisconnectedOnMount.current) {
      hasDisconnectedOnMount.current = true;
      console.log('[RainbowKit]: Login mode - forcing disconnect on mount');
      
      // Always disconnect via wagmi
      disconnect();
      
      // Also try to revoke MetaMask permissions (clears "connected" state)
      // This ensures MetaMask shows the account picker next time
      if (window.ethereum) {
        try {
          // @ts-ignore - wallet_revokePermissions is not in types yet
          window.ethereum.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }]
          }).then(() => {
            console.log('[RainbowKit]: MetaMask permissions revoked');
          }).catch((err: Error) => {
            // Not all wallets support this, that's OK
            console.log('[RainbowKit]: wallet_revokePermissions not supported:', err.message);
          });
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Reset state
      setSelectedAddress(null);
      setModalWasOpened(false);
    }
  }, [mode, disconnect]);

  // Authenticate with PC2 backend
  const authenticateWithBackend = useCallback(async (walletAddress: string) => {
    if (isAuthenticating || authComplete) return;
    
    setIsAuthenticating(true);
    setError(null);

    try {
      const apiOrigin = getApiOrigin();
      console.log('[RainbowKit]: Authenticating with backend:', apiOrigin);

      const response = await fetch(`${apiOrigin}/auth/particle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: walletAddress,
          chainId: 20, // Elastos Smart Chain
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[RainbowKit]: Auth response:', data);

      if (!data.success || !data.token) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Send auth data to parent window
      const user = data.user || {};
      user.wallet_address = walletAddress;
      user.auth_type = 'eoa';

      window.parent.postMessage({
        type: 'wallet-auth-success',
        token: data.token,
        user: user,
        address: walletAddress,
      }, '*');

      setAuthComplete(true);
      console.log('[RainbowKit]: ✅ Auth complete, sent to parent');

    } catch (err) {
      console.error('[RainbowKit]: Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, authComplete]);

  // Track when we actually initiated a connection attempt
  const [connectionAttemptTime, setConnectionAttemptTime] = useState<number>(0);
  
  // ONLY authenticate when:
  // 1. Modal was opened by user
  // 2. Address changed AFTER modal was opened
  // 3. Connection happened recently (within 10 seconds of modal open)
  useEffect(() => {
    if (mode !== 'login') return;
    if (!modalWasOpened) return;
    if (!isConnected || !address) return;
    if (authComplete || isAuthenticating) return;
    
    // Check if this is a NEW connection (address changed after modal was opened)
    // AND it happened recently (not a stale MetaMask connection)
    const now = Date.now();
    const timeSinceModalOpen = now - connectionAttemptTime;
    
    if (address !== previousAddress.current && timeSinceModalOpen < 30000) {
      console.log('[RainbowKit]: New wallet selected via modal:', address, 'time since modal:', timeSinceModalOpen);
      previousAddress.current = address;
      setSelectedAddress(address);
      authenticateWithBackend(address);
    } else if (address === previousAddress.current) {
      // Same address as before, likely a stale connection - ignore
      console.log('[RainbowKit]: Ignoring stale connection to:', address);
    }
  }, [mode, modalWasOpened, isConnected, address, authComplete, isAuthenticating, authenticateWithBackend, connectionAttemptTime]);

  // Handle connect button click
  const handleConnectClick = useCallback(async () => {
    console.log('[RainbowKit]: User clicked Connect Wallet');
    
    // Always disconnect and revoke permissions first to ensure fresh wallet picker
    disconnect();
    
    // Try to revoke MetaMask permissions for fresh account selection
    if (window.ethereum) {
      try {
        // @ts-ignore
        await window.ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }]
        });
        console.log('[RainbowKit]: MetaMask permissions revoked before connect');
      } catch (e) {
        // Not all wallets support this
      }
    }
    
    // Small delay to let disconnect complete
    setTimeout(() => {
      setModalWasOpened(true);
      setConnectionAttemptTime(Date.now());
      previousAddress.current = null;
      openConnectModal?.();
    }, 150);
  }, [disconnect, openConnectModal]);

  // In wallet mode, just report the address
  useEffect(() => {
    if (isConnected && address && mode === 'wallet') {
      window.parent.postMessage({
        type: 'wallet-connected',
        address: address,
        chainId: 20,
      }, '*');
    }
  }, [isConnected, address, mode]);

  // Render based on mode
  if (mode === 'wallet') {
    return (
      <div className="wallet-mode">
        <ConnectButton 
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    );
  }

  // Login mode - full screen login UI
  return (
    <div className="login-container">
      <div className="login-header">
        <img 
          src="/Elastos_Logo_Dark_-_1.svg" 
          alt="Elastos" 
          className="logo"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h1>The World Computer</h1>
        <p>Connect your wallet to login</p>
      </div>

      <div className="login-content">
        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => { 
              setError(null); 
              setIsAuthenticating(false);
              setModalWasOpened(false);
              setSelectedAddress(null);
              disconnect();
            }}>
              Try Again
            </button>
          </div>
        )}

        {isAuthenticating && !error && (
          <div className="loading">
            <div className="spinner" />
            <p>Authenticating...</p>
          </div>
        )}

        {authComplete && (
          <div className="success">
            <p>✅ Connected! Loading desktop...</p>
          </div>
        )}

        {!isAuthenticating && !authComplete && !error && (
          <>
            <button 
              className="connect-button"
              onClick={handleConnectClick}
            >
              Connect Wallet
            </button>
            <p className="hint">MetaMask, WalletConnect, Coinbase, and more</p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
