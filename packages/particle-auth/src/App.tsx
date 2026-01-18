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
      
      // Always disconnect, regardless of current state
      disconnect();
      
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

  // ONLY authenticate when:
  // 1. Modal was opened by user
  // 2. Address changed (user selected a wallet)
  // 3. We have a valid address
  useEffect(() => {
    if (mode !== 'login') return;
    if (!modalWasOpened) return;
    if (!isConnected || !address) return;
    if (authComplete || isAuthenticating) return;
    
    // Check if this is a NEW connection (address changed after modal was opened)
    if (address !== previousAddress.current) {
      console.log('[RainbowKit]: New wallet selected via modal:', address);
      previousAddress.current = address;
      setSelectedAddress(address);
      authenticateWithBackend(address);
    }
  }, [mode, modalWasOpened, isConnected, address, authComplete, isAuthenticating, authenticateWithBackend]);

  // Handle connect button click
  const handleConnectClick = useCallback(() => {
    console.log('[RainbowKit]: User clicked Connect Wallet');
    
    // If somehow connected, disconnect first
    if (isConnected) {
      console.log('[RainbowKit]: Already connected, disconnecting first...');
      disconnect();
      // Give it a moment to disconnect
      setTimeout(() => {
        setModalWasOpened(true);
        previousAddress.current = null;
        openConnectModal?.();
      }, 100);
    } else {
      setModalWasOpened(true);
      previousAddress.current = null;
      openConnectModal?.();
    }
  }, [isConnected, disconnect, openConnectModal]);

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
        <h1>Welcome to PC2</h1>
        <p>Connect your wallet to continue</p>
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <path d="M12 12a2 2 0 100-4 2 2 0 000 4z"/>
              </svg>
              <span>Connect Wallet</span>
            </button>
            <p className="hint">MetaMask, WalletConnect, Coinbase, and more</p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
