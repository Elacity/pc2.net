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
  SUPPORTED_TOKEN_TYPE,
  type IAssetsResponse,
} from '@particle-network/universal-account-sdk';
import { Web3Provider } from '../provider/web3-provider';

// BUILD VERSION MARKER - this confirms we're running the latest bundle
console.log('[Particle Auth Context]: BUILD v2026.04.30.pc2net.wcsigning-hardening loaded');

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

  // Tracks when a logout-triggered deactivation is pending so handleParticleAuthSuccess
  // can ignore the auto-reconnect auth call that fires before deactivate() completes.
  const isLogoutPendingRef = React.useRef(false);
  // UX fix (v1.2.1): handleParticleAuthSuccess MUST fire exactly once per
  // active session. Without this, every re-render of the auth-trigger effect
  // (smartAccountInfo updates twice in wallet mode, connector resolves
  // separately) caused another SIWE personal_sign — so users saw 2-3
  // duplicate "sign to log in" wallet prompts. Reset on disconnect so the
  // next login can fire again.
  const authFiredRef = React.useRef(false);

  // WC stale-closure fix (v1.2.1): the signing-mode RPC handler captures
  // `primaryWallet` and `connector` via closure when its effect first fires.
  // For WalletConnect users, ConnectKit's reconnectOnMount populates
  // useAccount() (-> connector) before useWallets() returns the live wagmi
  // wallet (-> primaryWallet). The in-flight handler's retry loop kept
  // re-calling resolveSigningProvider() against its stale closure and never
  // saw the late-arriving primaryWallet, so even though wagmi was healthy
  // by retry 2, the sign request silently timed out after 9 s. Refs always
  // point at the latest values regardless of when the handler was bound.
  const primaryWalletRef = React.useRef(primaryWallet);
  React.useEffect(() => { primaryWalletRef.current = primaryWallet; }, [primaryWallet]);
  const connectorRef = React.useRef(connector);
  React.useEffect(() => { connectorRef.current = connector; }, [connector]);
  
  // Universal Account state
  const [universalAccount, setUniversalAccount] = React.useState<UniversalAccount | null>(null);
  const [smartAccountInfo, setSmartAccountInfo] = React.useState<SmartAccountInfo | undefined>();
  const [primaryAssets, setPrimaryAssets] = React.useState<IAssetsResponse | undefined>();

  // getPrimaryAssets() dedupe (v1.2.1): the desktop sidebar / token list /
  // chat ready-handler all post `particle-wallet.get-tokens` independently
  // on every component mount. In a real session log we observed 6+
  // back-to-back calls in <1s — each one makes a fresh round-trip to
  // Particle's UA API. Dedupe in two layers:
  //   (1) in-flight: if a request is already pending, all callers await the
  //       same promise (no duplicate network).
  //   (2) cache: 5s TTL on the last successful response. Short enough that
  //       balances stay fresh after a transaction, long enough to absorb
  //       the React re-render storm on initial mount.
  const primaryAssetsCacheRef = React.useRef<{
    inflight: Promise<IAssetsResponse> | null;
    value: IAssetsResponse | null;
    fetchedAt: number;
  }>({ inflight: null, value: null, fetchedAt: 0 });
  const PRIMARY_ASSETS_TTL_MS = 5000;

  // Mode detection: check URL params for address passed from parent
  const { isWalletMode, isSigningMode, urlEoaAddress, urlSmartAddress, shouldLogout } = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    return {
      isWalletMode: mode === 'wallet',
      isSigningMode: mode === 'signing',
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

  // In wallet/signing mode, prefer connected address but fall back to URL address
  const eoaAddress = connectedEoaAddress || ((isWalletMode || isSigningMode) ? urlEoaAddress : undefined);

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

  // Active when we have proper context for the current mode:
  // - Login/signing mode: needs both eoaAddress AND library (full ConnectKit session)
  // - Wallet mode: only needs eoaAddress (from URL params) — UA SDK uses HTTP APIs
  //   for data operations (balance, tokens, tx history) and doesn't need the provider
  const active = React.useMemo(() => {
    if (isWalletMode && eoaAddress) {
      console.log('[Particle Auth]: Wallet mode active with URL address:', eoaAddress, '(provider:', !!library, ')');
      return true;
    }
    const hasAuth = !!(eoaAddress && library);
    if (isSigningMode) {
      console.log('[Particle Auth]: Signing mode session status:', { hasAuth, connectedEoaAddress, hasLibrary: !!library });
    }
    return hasAuth;
  }, [library, eoaAddress, isWalletMode, isSigningMode, connectedEoaAddress]);

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

      // UA SDK uses Elacity's project credentials (gas abstraction is configured there)
      // Falls back to ConnectKit credentials if UA-specific ones aren't set
      const uaProjectId = import.meta.env.VITE_UA_PROJECT_ID || projectId;
      const uaClientKey = import.meta.env.VITE_UA_CLIENT_KEY || clientKey;
      const uaAppId = import.meta.env.VITE_UA_APP_ID || appId;

      if (projectId && clientKey && appId) {
        console.log('[Particle Auth]: Initializing UniversalAccount for EOA:', eoaAddress, isWalletMode ? '(wallet mode)' : '');
        console.log('[Particle Auth]: UA credentials:', uaProjectId !== projectId ? 'using Elacity project' : 'using default project');

        const ua = new UniversalAccount({
          projectId: uaProjectId,
          projectClientKey: uaClientKey,
          projectAppUuid: uaAppId,
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
    // If logout was triggered, skip this auto-reconnect auth and clear the flag
    // so the next manual login can proceed normally.
    if (isLogoutPendingRef.current) {
      console.log('[Particle Auth]: Auth skipped — logout pending, ignoring auto-reconnect');
      isLogoutPendingRef.current = false;
      return;
    }
    try {
      // Compute loginMethod once up front so we can include it in the
      // SIWE-pending notification AND the eventual success payload.
      const detectedConnectorId = (connector?.id || connector?.name || '').toLowerCase();
      const detectedLoginMethod = detectedConnectorId.includes('metamask') ? 'metamask'
        : detectedConnectorId.includes('walletconnect') ? 'walletconnect'
        : detectedConnectorId.includes('coinbase') ? 'coinbase'
        : 'email';

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

      // One personal_sign per fresh login. A missing signature does not
      // continue into /auth/particle. publicHost lets the node name this
      // site in the prompt when the gateway rewrote Host to a tunnel address.
      let siweReady = false;
      try {
        if (eoaAddress) {
          const publicHost = window.location.host;
          const challengeRes = await fetch(`${apiOrigin}/auth/challenge?address=${encodeURIComponent(eoaAddress)}&publicHost=${encodeURIComponent(publicHost)}`);
          if (challengeRes.ok) {
            const challenge = await challengeRes.json() as { nonce: string; message: string };
            // primaryWallet.connector is the live wagmi connector;
            // useAccount().connector is a thin descriptor that breaks for WC.
            const _pwConn = (primaryWallet as any)?.connector;
            const _acConn = connector as any;
            const provider = (_pwConn && typeof _pwConn.getProvider === 'function')
              ? await _pwConn.getProvider()
              : (_acConn && typeof _acConn.getProvider === 'function' ? await _acConn.getProvider() : undefined);
            if (provider && challenge.message && challenge.nonce) {
              // UX bridge (#1): tell the parent login modal we're about to
              // request a signature so it can show a "Verifying wallet
              // ownership" overlay until success/error fires. Without this,
              // there's a confusing dead window between wallet-connect and
              // the wallet's signature popup (especially on Jetson + WC).
              try {
                window.parent.postMessage({
                  type: 'particle-auth.siwe-pending',
                  payload: { address: eoaAddress, loginMethod: detectedLoginMethod },
                }, '*');
              } catch (postErr) {
                console.warn('[Particle Auth]: Failed to post siwe-pending to parent:', postErr);
              }

              const signature = await (provider as any).request({
                method: 'personal_sign',
                params: [challenge.message, eoaAddress],
              });
              authPayload.signature = signature;
              authPayload.nonce = challenge.nonce;
              authPayload.message = challenge.message;
              siweReady = true;
              console.log('[Particle Auth]: SIWE signature attached');
            }
          } else {
            console.warn('[Particle Auth]: /auth/challenge returned', challengeRes.status);
          }
        }
      } catch (siweErr) {
        console.warn('[Particle Auth]: SIWE challenge/sign step failed:', siweErr);
      }

      if (!siweReady) {
        let isInIframe = false;
        try {
          isInIframe = window !== window.parent || window.self !== window.top;
        } catch (e) {
          isInIframe = true;
        }
        const messageTarget = isInIframe ? window.parent : window;
        messageTarget.postMessage({
          type: 'particle-auth.error',
          payload: { message: 'Wallet signature is required to sign in.' },
        }, '*');
        return;
      }

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
        // Reuse the loginMethod computed at the top of this callback so SIWE-pending
        // and success messages always agree on the connector identity.
        const loginMethod = detectedLoginMethod;

        console.log('[Particle Auth]: Auth SUCCESS, loginMethod:', loginMethod, 'connector:', detectedConnectorId);
        messageTarget.postMessage({
          type: 'particle-auth.success',
          payload: {
            address: eoaAddress,
            smartAccountAddress: smartAccountInfo?.smartAccountAddress,
            chainId,
            token: data.token,
            user: data.user,
            loginMethod,
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
  }, [eoaAddress, chainId, smartAccountInfo, connector]);

  // Trigger auth when active AND smart account info is loaded (or after timeout)
  // CRITICAL: Do NOT trigger auth in wallet mode - wallet iframe is for data operations only
  React.useEffect(() => {
    if (!active) {
      // Reset the fire-once guard so the next login can authenticate again.
      authFiredRef.current = false;
      return;
    }
    
    // Skip auth if logout was requested - let logout effect handle disconnect first
    if (shouldLogout) {
      console.log('[Particle Auth]: Skipping auth (logout requested)');
      return;
    }
    
    // Skip auth callback in wallet/signing mode - only the login iframe should do this
    if (isWalletMode || isSigningMode) {
      console.log('[Particle Auth Wallet Mode]: Skipping auth callback (wallet mode)');
      return;
    }

    // Fire-once guard (v1.2.1): without this, smartAccountInfo or connector
    // changing later in the lifecycle re-runs this effect and fires a SECOND
    // (or third) SIWE personal_sign on the same login. Users saw 2-3
    // duplicate wallet prompts. We still allow the effect to RE-SCHEDULE the
    // setTimeout if the wait window is recomputed (e.g., SA loads early so
    // we no longer need the 2s wait), but only one timer can ever resolve
    // into handleParticleAuthSuccess() per session.
    if (authFiredRef.current) {
      return;
    }
    
    // UX fix (#2): drop the artificial pre-SIWE wait for external wallets.
    // External wallets (MetaMask/WalletConnect/Coinbase) never produce a
    // Particle Smart Account in the auth payload, so waiting 2s for one to
    // arrive is pure dead time — and it's exactly the dead time users see
    // as a "dark screen" between connect and the second signature prompt
    // (worst on Jetson + WalletConnect over a slow relay).
    // Embedded (email/social) logins keep the 2s safety net so the UA SDK
    // has a chance to attach the Smart Account before we POST.
    const connectorIdRaw = (connector?.id || connector?.name || '').toLowerCase();
    const isExternalWallet = ['metamask', 'walletconnect', 'coinbase', 'phantom', 'injected']
      .some((k) => connectorIdRaw.includes(k));
    const waitMs = (smartAccountInfo?.smartAccountAddress || isExternalWallet) ? 0 : 2000;

    const timeoutId = setTimeout(() => {
      // Re-check at fire time to win any race with a concurrent re-run.
      if (authFiredRef.current) return;
      authFiredRef.current = true;
      handleParticleAuthSuccess();
    }, waitMs);

    return () => clearTimeout(timeoutId);
  }, [active, smartAccountInfo, handleParticleAuthSuccess, isWalletMode, shouldLogout, connector]);

  React.useEffect(() => {
    // The disconnect_particle flag is now consumed at root by connectkit.tsx
    // (it disables reconnectOnMount for the post-logout boot — the only
    // reliable way to stop ConnectKit's auto-restore racing with this
    // effect). This effect remains as a defensive net for the theoretical
    // case where logout happens in an already-mounted iframe without a page
    // reload (PC2 always reloads, so this is just belt-and-braces).
    if (active) {
      const stillSet = localStorage.getItem('disconnect_particle');
      if (stillSet) {
        localStorage.removeItem('disconnect_particle');
        console.log('[Particle Auth]: Late disconnect_particle (active session) — calling deactivate');
        // Set ref BEFORE deactivating so any pending auth setTimeout sees it
        isLogoutPendingRef.current = true;
        deactivate();
      }
    }
  }, [deactivate, active]);

  // Notify parent that particle-auth iframe is ready (used by WalletService readiness check)
  // For non-signing mode only; signing mode ready signal is below.
  React.useEffect(() => {
    if (isSigningMode) return;

    // In wallet mode, ConnectKit session may not restore (different App ID).
    // Signal ready using the URL-provided address instead.
    if (isWalletMode && eoaAddress) {
      window.parent.postMessage({
        type: 'particle-wallet.ready',
        payload: { ready: true, address: eoaAddress },
      }, '*');
      return;
    }

    if (!connector || !connectedEoaAddress) return;

    window.parent.postMessage({
      type: 'particle-wallet.ready',
      payload: { ready: true, address: connectedEoaAddress },
    }, '*');
  }, [connector, connectedEoaAddress, isSigningMode, isWalletMode, eoaAddress]);

  // ==========================================
  // Signing Mode: Register RPC handler THEN signal ready (single effect to avoid race)
  // No dependency on `active` — handler resolves the live wagmi provider on demand.
  //
  // CRITICAL: useAccount().connector returns a thin descriptor in Particle's
  // ConnectKit (no .getProvider method — calling it threw
  // "je.getProvider is not a function" in production). The real wagmi
  // Connector instance with .getProvider() lives on useWallets()[0].connector.
  // Login's SIWE personal_sign already uses that pattern (see line 148).
  // ==========================================
  React.useEffect(() => {
    if (!isSigningMode || (!primaryWallet && !connector) || !connectedEoaAddress) return;

    const resolveSigningProvider = async (): Promise<unknown> => {
      // Prefer the wallet returned by useWallets() — that's the live wagmi
      // Connector with getProvider(). Fall back to useAccount().connector
      // only if it actually exposes the method (e.g. embedded particle-auth).
      //
      // Read both via refs (not closure-captured values): for WC users,
      // primaryWallet may populate after this handler is registered, and a
      // closure-captured undefined would never recover. The retry loop is
      // useless without this — it would just call the same stale closure
      // six times. See `primaryWalletRef`/`connectorRef` declaration for
      // full context (v1.2.1 stale-closure fix).
      const pwConnector = (primaryWalletRef.current as any)?.connector;
      if (pwConnector && typeof pwConnector.getProvider === 'function') {
        return await pwConnector.getProvider();
      }
      const acConnector = connectorRef.current as any;
      if (acConnector && typeof acConnector.getProvider === 'function') {
        return await acConnector.getProvider();
      }
      return undefined;
    };

    const handleSigningRpc = async (event: MessageEvent) => {
      const { type, requestId, payload } = event.data || {};
      if (type !== 'particle-signing.rpc') return;

      try {
        let signingProvider = await resolveSigningProvider();
        // ConnectKit's reconnectOnMount may still be restoring the WC session
        // when the dApp requests a signature immediately after the iframe
        // mounts. Retry up to ~9s for the wagmi connector to settle.
        if (!signingProvider) {
          for (let attempt = 0; attempt < 6 && !signingProvider; attempt++) {
            console.log('[Particle Signing Handler] Provider not ready, retrying...', attempt + 1);
            await new Promise(r => setTimeout(r, 1500));
            signingProvider = await resolveSigningProvider();
          }
        }
        if (!signingProvider) throw new Error('Signer not available — session not restored. Open Essentials, reconnect to PC2, then try again.');

        const { method: rpcMethod } = payload;
        let rpcParams = payload.params;

        if (rpcMethod === 'eth_accounts' || rpcMethod === 'eth_requestAccounts') {
          window.parent.postMessage({
            type: 'particle-signing.rpc-result',
            requestId,
            payload: { result: connectedEoaAddress ? [connectedEoaAddress] : [] },
          }, '*');
          return;
        }

        if (rpcMethod === 'eth_chainId') {
          const currentChain = await (signingProvider as any).request({ method: 'eth_chainId' });
          window.parent.postMessage({
            type: 'particle-signing.rpc-result',
            requestId,
            payload: { result: currentChain },
          }, '*');
          return;
        }

        if (rpcMethod === 'eth_sendTransaction' && rpcParams?.[0]?.chainId) {
          const targetChainHex = rpcParams[0].chainId;
          try {
            await (signingProvider as any).request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: targetChainHex }],
            });
          } catch (switchErr: any) {
            console.log('[Particle Signing Handler] Chain switch info:', switchErr?.message || switchErr);
          }
          const { chainId: _removed, ...cleanParams } = rpcParams[0];
          rpcParams[0] = cleanParams;
        }

        // Defence-in-depth signer normalisation. The parent already rewrites
        // SA→EOA before posting, but in case a dApp routes a sign request
        // through a different code path, make sure WalletConnect / MetaMask
        // sees an address it actually owns — otherwise the wallet silently
        // drops the request (no popup, no error).
        const SIGN_TYPED_DATA = ['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'];
        if (rpcMethod === 'personal_sign' && Array.isArray(rpcParams)) {
          const signerInParams = (rpcParams[1] || '').toString().toLowerCase();
          const expectedSigner = (connectedEoaAddress || '').toLowerCase();
          if (expectedSigner && signerInParams !== expectedSigner) {
            console.warn('[Particle Signing Handler] personal_sign signer mismatch — rewriting from', signerInParams || '(empty)', 'to', expectedSigner);
            rpcParams = [...rpcParams];
            rpcParams[1] = connectedEoaAddress;
          }
        }
        if ((SIGN_TYPED_DATA.indexOf(rpcMethod) !== -1 || rpcMethod === 'eth_sign') && Array.isArray(rpcParams)) {
          const signerInParams = (rpcParams[0] || '').toString().toLowerCase();
          const expectedSigner = (connectedEoaAddress || '').toLowerCase();
          if (expectedSigner && signerInParams !== expectedSigner) {
            console.warn('[Particle Signing Handler]', rpcMethod, 'signer mismatch — rewriting from', signerInParams || '(empty)', 'to', expectedSigner);
            rpcParams = [...rpcParams];
            rpcParams[0] = connectedEoaAddress;
          }
        }

        const signingConnectorId = (connector as any)?.id || (connector as any)?.name || 'unknown';
        console.log('[Particle Signing Handler] Calling provider.request:', rpcMethod, 'via', signingConnectorId);
        try {
          const rpcResult = await (signingProvider as any).request({ method: rpcMethod, params: rpcParams });
          console.log('[Particle Signing Handler] RPC result for', rpcMethod, ':', typeof rpcResult === 'string' ? rpcResult.substring(0, 20) + '...' : rpcResult);
          window.parent.postMessage({
            type: 'particle-signing.rpc-result',
            requestId,
            payload: { result: rpcResult },
          }, '*');
        } catch (signingErr: any) {
          console.error('[Particle Signing Handler]', rpcMethod, 'FAILED via', signingConnectorId, '— code:', signingErr?.code, '— msg:', signingErr?.message);
          throw signingErr;
        }
      } catch (error: any) {
        console.error('[Particle Signing Handler] Error:', error);
        window.parent.postMessage({
          type: 'particle-wallet.error',
          requestId,
          payload: { message: error.message || 'Signing failed' },
        }, '*');
      }
    };

    // Register handler FIRST, then signal ready — eliminates race condition
    window.addEventListener('message', handleSigningRpc);
    console.log('[Particle Auth Signing]: RPC handler registered, signaling ready');

    window.parent.postMessage({
      type: 'particle-signing.ready',
      payload: { ready: true, address: connectedEoaAddress },
    }, '*');

    return () => window.removeEventListener('message', handleSigningRpc);
  }, [isSigningMode, connector, connectedEoaAddress, primaryWallet]);

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
      const { type, requestId, payload } = event.data || {};
      
      if (!type?.startsWith('particle-wallet.')) return;

      try {
        switch (type) {
          case 'particle-wallet.get-tokens': {
            // Fetch tokens from Universal Account primary assets
            console.log('[Particle Auth]: get-tokens handler called, universalAccount:', !!universalAccount);

            const cache = primaryAssetsCacheRef.current;
            const now = Date.now();

            const isCacheFresh = !!cache.value && (now - cache.fetchedAt) < PRIMARY_ASSETS_TTL_MS;
            if (isCacheFresh) {
              console.log('[Particle Auth]: getPrimaryAssets() cache HIT (age',
                Math.round((now - cache.fetchedAt) / 100) / 10, 's) — skipping network');
            } else if (cache.inflight) {
              console.log('[Particle Auth]: getPrimaryAssets() join in-flight request');
            } else {
              console.log('[Particle Auth]: Calling getPrimaryAssets()...');
            }

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('getPrimaryAssets() timed out after 15s')), 15000)
            );

            let assets: any;
            try {
              if (isCacheFresh) {
                assets = cache.value;
              } else {
                if (!cache.inflight) {
                  cache.inflight = (async () => {
                    try {
                      const result = await Promise.race([
                        universalAccount.getPrimaryAssets(),
                        timeoutPromise,
                      ]) as IAssetsResponse;
                      cache.value = result;
                      cache.fetchedAt = Date.now();
                      return result;
                    } finally {
                      cache.inflight = null;
                    }
                  })();
                }
                assets = await cache.inflight;
                console.log('[Particle Auth]: getPrimaryAssets() succeeded (assets cached for', PRIMARY_ASSETS_TTL_MS, 'ms)');
              }
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
          
          case 'particle-wallet.execute-universal-batch': {
            if (!universalAccount || !smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart account not ready');
            }
            const { chainId: batchChainId, transactions: batchTxs, expectTokens: batchExpectTokens } = payload as {
              chainId: number;
              transactions: Array<{ to: string; data: string; value?: string }>;
              expectTokens?: Array<{ type: string; amount: string }>;
            };
            if (!batchChainId || !Array.isArray(batchTxs) || batchTxs.length === 0) {
              throw new Error('chainId and non-empty transactions required');
            }

            // Step 1: Assert smart account is deployed on-chain
            const UNIVERSAL_CHECKIN = '0x2361a02e6727Ff1798920186b8ACf0f100f621C0';
            const BASE_RPC = 'https://mainnet.base.org';
            try {
              const codeResp = await fetch(BASE_RPC, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0', id: 1, method: 'eth_getCode',
                  params: [smartAccountInfo.smartAccountAddress, 'latest'],
                }),
              });
              const codeResult = await (codeResp.json() as Promise<{ result: string }>);
              if (codeResult.result === '0x') {
                console.log('[Particle Auth] Smart account not deployed, deploying via checkIn...');
                const checkInData = '0x183ff085'; // Interface(['function checkIn() public']).encodeFunctionData('checkIn')
                const deployTx = await universalAccount.createUniversalTransaction({
                  chainId: batchChainId,
                  expectTokens: [],
                  transactions: [{ to: UNIVERSAL_CHECKIN, data: checkInData, value: '0x0' }],
                });
                const deployProvider = await connector?.getProvider();
                if (!deployProvider) throw new Error('No wallet provider for deployment');
                const deploySig = await (deployProvider as any).request({
                  method: 'personal_sign',
                  params: [deployTx.rootHash, connectedEoaAddress],
                });
                await universalAccount.sendTransaction(deployTx, deploySig);
                await new Promise((r) => setTimeout(r, 3000));
                console.log('[Particle Auth] Smart account deployed successfully');
              }
            } catch (deployErr) {
              console.warn('[Particle Auth] Smart account assertion failed (continuing):', deployErr);
            }

            // Diagnostic: log smart account balance + SDK-resolved addresses
            let diagInfo: any = {};
            try {
              const [diagAssets, diagSaOptions] = await Promise.all([
                universalAccount.getPrimaryAssets(),
                universalAccount.getSmartAccountOptions(),
              ]);
              diagInfo = {
                totalUSD: diagAssets?.totalAmountInUSD,
                assets: diagAssets?.assets?.map((a: any) => ({ type: a.tokenType, amount: a.amount, usd: a.amountInUSD })),
                sdkSmartAccount: diagSaOptions?.smartAccountAddress,
                localSmartAccount: smartAccountInfo.smartAccountAddress,
                eoa: connectedEoaAddress,
                expectTokens: batchExpectTokens || [],
                batchTxCount: batchTxs?.length,
                chainId: batchChainId,
                sdkVersion: '1.0.7',
              };
              console.log('[Particle Auth] DIAGNOSTIC:', JSON.stringify(diagInfo));
              window.parent.postMessage({ type: 'particle-wallet.diagnostic', payload: diagInfo }, '*');
            } catch (diagErr: any) {
              diagInfo = { error: diagErr?.message };
              console.warn('[Particle Auth] Diagnostic failed:', diagErr);
              window.parent.postMessage({ type: 'particle-wallet.diagnostic', payload: diagInfo }, '*');
            }

            // Step 2: Create the universal transaction with batched calls
            // IMPORTANT: expectTokens must be EMPTY — Particle's server rejects any non-empty
            // expectTokens with "Insufficient balance for gas fees" even when balance exists.
            // Instead, usePrimaryTokens in tradeConfig tells the SDK to use USDC for fees.
            let transaction: any;
            try {
              const createPayload = {
                chainId: batchChainId,
                expectTokens: [] as Array<{ type: string; amount: string }>,
                transactions: batchTxs.map((t) => ({
                  to: t.to,
                  data: t.data,
                  value: t.value || '0x0',
                })),
              };
              const tradeConfig = { usePrimaryTokens: ['usdc'] };
              console.log('[Particle Auth] createUniversalTransaction payload:', JSON.stringify(createPayload), 'tradeConfig:', JSON.stringify(tradeConfig));
              window.parent.postMessage({ type: 'particle-wallet.diagnostic', payload: { step: 'createUniversalTransaction', params: createPayload, tradeConfig } }, '*');
              transaction = await universalAccount.createUniversalTransaction(createPayload, tradeConfig);
            } catch (createErr: any) {
              console.error('[Particle Auth] createUniversalTransaction FAILED:', createErr);
              window.parent.postMessage({ type: 'particle-wallet.diagnostic', payload: {
                step: 'createUniversalTransaction-ERROR',
                error: createErr?.message,
                code: createErr?.code,
                fullError: String(createErr),
                diagInfo,
              } }, '*');
              throw createErr;
            }

            // Step 3: Sign the rootHash with the EOA (NOT createMultiChainUnsignedData)
            const batchProvider = await connector?.getProvider();
            if (!batchProvider) {
              throw new Error('No wallet provider available');
            }
            const signature = await (batchProvider as any).request({
              method: 'personal_sign',
              params: [transaction.rootHash, connectedEoaAddress],
            });

            if (!signature?.length) {
              throw new Error('Signature is empty, cannot send transaction');
            }

            // Step 4: Send signed transaction via UA bundler
            const sendResult = await universalAccount.sendTransaction(transaction, signature);
            const txId = sendResult?.transactionId || (transaction as any)?.transactionId;
            const universalTxUrl = `https://universalx.app/activity/details?id=${txId}`;
            console.log('[Particle Auth] UA transaction sent:', txId, universalTxUrl);

            // Step 5: Poll ua.getTransaction() for on-chain tx hash (status 7 = Finished)
            let onChainHash: string | null = null;
            const POLL_INTERVAL = 2000;
            const POLL_TIMEOUT = 60000;
            const pollStart = Date.now();
            while (Date.now() - pollStart < POLL_TIMEOUT) {
              try {
                const txStatus = await universalAccount.getTransaction(txId);
                const status = (txStatus as any)?.status;

                if (status === 6 || status === 10 || status === 14) {
                  throw new Error(`UA transaction failed with status ${status}`);
                }

                const allOps = [
                  ...((txStatus as any)?.lendingUserOperations || []),
                  ...((txStatus as any)?.depositUserOperations || []),
                  ...((txStatus as any)?.settlementUserOperations || []),
                  ...((txStatus as any)?.refundUserOperations || []),
                ];
                const opWithHash = allOps.find((op: any) => op?.txHash);
                if (opWithHash) {
                  onChainHash = opWithHash.txHash;
                  console.log('[Particle Auth] On-chain tx hash found:', onChainHash);
                  break;
                }

                if (status === 7) {
                  console.log('[Particle Auth] TX finished (status 7) but no txHash yet');
                  break;
                }
              } catch (pollErr: any) {
                if (pollErr?.message?.includes('failed with status')) throw pollErr;
                console.warn('[Particle Auth] Poll error (retrying):', pollErr?.message);
              }
              await new Promise((r) => setTimeout(r, POLL_INTERVAL));
            }

            window.parent.postMessage({
              type: 'particle-wallet.execute-universal-batch-result',
              requestId,
              payload: {
                transactionId: txId,
                transactionHash: onChainHash || sendResult?.transactionHash || (sendResult as any)?.hash,
                universalTxUrl,
              },
            }, '*');
            break;
          }

          case 'particle-wallet.execute-universal-batch-create': {
            if (!universalAccount || !smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart account not ready');
            }
            const { chainId: createChainId, transactions: createTxs, expectTokens: createExpectTokens } = payload as {
              chainId: number;
              transactions: Array<{ to: string; data: string; value?: string }>;
              expectTokens?: Array<{ type: string; amount: string }>;
            };
            if (!createChainId || !Array.isArray(createTxs) || createTxs.length === 0) {
              throw new Error('chainId and non-empty transactions required');
            }

            const CHECKIN_ADDR = '0x2361a02e6727Ff1798920186b8ACf0f100f621C0';
            const RPC_URL = 'https://mainnet.base.org';
            try {
              const codeRes = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [smartAccountInfo.smartAccountAddress, 'latest'] }),
              });
              const codeJson = await (codeRes.json() as Promise<{ result: string }>);
              if (codeJson.result === '0x') {
                console.log('[Particle Auth] Smart account not deployed, deploying via checkIn...');
                const deployTx = await universalAccount.createUniversalTransaction({
                  chainId: createChainId, expectTokens: [],
                  transactions: [{ to: CHECKIN_ADDR, data: '0x183ff085', value: '0x0' }],
                });
                const deployProv = await connector?.getProvider();
                if (!deployProv) throw new Error('No wallet provider for deployment');
                const deploySig = await (deployProv as any).request({ method: 'personal_sign', params: [deployTx.rootHash, connectedEoaAddress] });
                await universalAccount.sendTransaction(deployTx, deploySig);
                await new Promise((r) => setTimeout(r, 3000));
              }
            } catch (deployErr) {
              console.warn('[Particle Auth] Smart account assertion failed (continuing):', deployErr);
            }

            const createPayload = {
              chainId: createChainId,
              expectTokens: createExpectTokens || [],
              transactions: createTxs.map((t) => ({ to: t.to, data: t.data, value: t.value || '0x0' })),
            };
            const tradeConfig = { usePrimaryTokens: ['usdc'] };
            console.log('[Particle Auth] batch-create payload:', JSON.stringify(createPayload));
            const createdBatchTx = await universalAccount.createUniversalTransaction(createPayload, tradeConfig);

            window.parent.postMessage({
              type: 'particle-wallet.execute-universal-batch-create-result',
              requestId,
              payload: {
                rootHash: createdBatchTx.rootHash,
                transactionData: JSON.parse(JSON.stringify(createdBatchTx)),
                eoaAddress: connectedEoaAddress,
              },
            }, '*');
            break;
          }

          case 'particle-wallet.execute-universal-batch-submit': {
            if (!universalAccount) {
              throw new Error('Universal account not ready');
            }
            const { transactionData: batchTxData, signature: batchSig } = payload as {
              transactionData: any;
              signature: string;
            };

            const batchSendResult = await universalAccount.sendTransaction(batchTxData, batchSig);
            const batchTxId = batchSendResult?.transactionId || batchTxData?.transactionId;
            const batchUniversalTxUrl = `https://universalx.app/activity/details?id=${batchTxId}`;
            console.log('[Particle Auth] UA batch submitted:', batchTxId, batchUniversalTxUrl);

            let batchOnChainHash: string | null = null;
            const BATCH_POLL_INTERVAL = 2000;
            const BATCH_POLL_TIMEOUT = 60000;
            const batchPollStart = Date.now();
            while (Date.now() - batchPollStart < BATCH_POLL_TIMEOUT) {
              try {
                const batchTxStatus = await universalAccount.getTransaction(batchTxId);
                const batchStatus = (batchTxStatus as any)?.status;
                if (batchStatus === 6 || batchStatus === 10 || batchStatus === 14) {
                  throw new Error(`UA transaction failed with status ${batchStatus}`);
                }
                const batchAllOps = [
                  ...((batchTxStatus as any)?.lendingUserOperations || []),
                  ...((batchTxStatus as any)?.depositUserOperations || []),
                  ...((batchTxStatus as any)?.settlementUserOperations || []),
                  ...((batchTxStatus as any)?.refundUserOperations || []),
                ];
                const batchOpWithHash = batchAllOps.find((op: any) => op?.txHash);
                if (batchOpWithHash) {
                  batchOnChainHash = batchOpWithHash.txHash;
                  console.log('[Particle Auth] Batch on-chain hash:', batchOnChainHash);
                  break;
                }
                if (batchStatus === 7) break;
              } catch (pollErr: any) {
                if (pollErr?.message?.includes('failed with status')) throw pollErr;
                console.warn('[Particle Auth] Batch poll error (retrying):', pollErr?.message);
              }
              await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL));
            }

            window.parent.postMessage({
              type: 'particle-wallet.execute-universal-batch-submit-result',
              requestId,
              payload: {
                transactionId: batchTxId,
                transactionHash: batchOnChainHash || batchSendResult?.transactionHash || (batchSendResult as any)?.hash,
                universalTxUrl: batchUniversalTxUrl,
              },
            }, '*');
            break;
          }

          case 'particle-wallet.eth-send-transaction': {
            // Same primaryWallet-first resolution as eoa-send / rpc — see
            // commentary above for why useAccount().connector cannot be used
            // for WalletConnect provider access in Particle ConnectKit.
            const pwConn = (primaryWallet as any)?.connector;
            const acConn = connector as any;
            const provider = (pwConn && typeof pwConn.getProvider === 'function')
              ? await pwConn.getProvider()
              : (acConn && typeof acConn.getProvider === 'function' ? await acConn.getProvider() : undefined);
            if (!provider) throw new Error('No wallet provider available');

            const txParams = { ...payload.txParams, from: connectedEoaAddress };
            const txHash = await (provider as any).request({
              method: 'eth_sendTransaction',
              params: [txParams],
            });

            window.parent.postMessage({
              type: 'particle-wallet.eth-send-transaction-result',
              requestId,
              payload: { txHash },
            }, '*');
            break;
          }

          case 'particle-wallet.eoa-send': {
            // Prefer useWallets()[0].connector — it's the live wagmi connector
            // exposing .getProvider(). useAccount().connector is just a thin
            // descriptor in Particle ConnectKit and threw
            // "getProvider is not a function" for WalletConnect users.
            const connectorIdForLog = (primaryWallet as any)?.connector?.id
              || (primaryWallet as any)?.connector?.name
              || (connector as any)?.id
              || (connector as any)?.name
              || 'unknown';
            console.log('[Particle Wallet Handler] eoa-send: connector=', connectorIdForLog, 'connectedEoa?', connectedEoaAddress, 'method?', payload.method);
            const resolveEoaProvider = async (): Promise<unknown> => {
              const pw = (primaryWallet as any)?.connector;
              if (pw && typeof pw.getProvider === 'function') return await pw.getProvider();
              const ac = connector as any;
              if (ac && typeof ac.getProvider === 'function') return await ac.getProvider();
              return undefined;
            };
            let eoaProvider = await resolveEoaProvider();
            if (!eoaProvider) {
              // For WalletConnect users, ConnectKit's reconnectOnMount may still be running.
              // Wait up to ~9s (6 × 1.5s) for the WC session to restore from localStorage (wc@* keys).
              for (let attempt = 0; attempt < 6 && !eoaProvider; attempt++) {
                console.log('[Particle Wallet Handler] Provider not ready (WC autoConnect in progress?), retrying...', attempt + 1);
                await new Promise(r => setTimeout(r, 1500));
                eoaProvider = await resolveEoaProvider();
              }
            }
            if (!eoaProvider) {
              throw new Error(`No wallet provider available — ConnectKit did not restore session for connector "${connectorIdForLog}". For WalletConnect, the session may have expired on the wallet side; please open Essentials and reconnect.`);
            }

            if (payload.method === 'personal_sign') {
              // Normalise params: dApps sometimes pass [message, smartAccountAddress]
              // because they read the wallet address from window.user. The WC
              // connector only knows the EOA owner — Essentials will silently
              // drop the request if asked to sign with an address it doesn't
              // recognise. Always sign with the connected EOA so the user
              // actually sees a popup.
              const incomingParams = Array.isArray(payload.params) ? [...payload.params] : [];
              const signerInParams = (incomingParams[1] || '').toLowerCase();
              const expectedSigner = (connectedEoaAddress || '').toLowerCase();
              if (signerInParams && expectedSigner && signerInParams !== expectedSigner) {
                console.warn(
                  '[Particle Wallet Handler] personal_sign signer mismatch — dApp asked for',
                  signerInParams, 'but connector only knows', expectedSigner,
                  '— rewriting params[1] so the WC wallet actually pops up'
                );
                incomingParams[1] = connectedEoaAddress;
              } else if (!signerInParams && connectedEoaAddress) {
                incomingParams[1] = connectedEoaAddress;
              }

              console.log(
                '[Particle Wallet Handler] personal_sign via',
                connectorIdForLog,
                '— signer:', incomingParams[1],
                '— msg preview:', String(incomingParams[0] || '').slice(0, 80)
              );
              try {
                const signResult = await (eoaProvider as any).request({
                  method: 'personal_sign',
                  params: incomingParams,
                });
                console.log('[Particle Wallet Handler] personal_sign result:', signResult?.substring(0, 20) + '...');
                window.parent.postMessage({
                  type: 'particle-wallet.eoa-send-result',
                  requestId,
                  payload: { signature: signResult, txHash: signResult },
                }, '*');
              } catch (signErr: any) {
                console.error(
                  '[Particle Wallet Handler] personal_sign FAILED via', connectorIdForLog,
                  '— code:', signErr?.code, '— msg:', signErr?.message
                );
                throw signErr;
              }
              break;
            }

            const targetChainId = payload.chainId;
            if (targetChainId) {
              const chainIdHex = '0x' + targetChainId.toString(16);
              try {
                await (eoaProvider as any).request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: chainIdHex }],
                });
              } catch (switchErr: any) {
                console.log('[Particle Wallet Handler] Chain switch info:', switchErr?.message || switchErr);
              }
            }

            const eoaTxParams = { ...payload.txParams, from: connectedEoaAddress };
            console.log('[Particle Wallet Handler] EOA send on chain', targetChainId, ':', eoaTxParams);

            const eoaTxHash = await (eoaProvider as any).request({
              method: 'eth_sendTransaction',
              params: [eoaTxParams],
            });

            console.log('[Particle Wallet Handler] EOA tx sent:', eoaTxHash);

            window.parent.postMessage({
              type: 'particle-wallet.eoa-send-result',
              requestId,
              payload: { txHash: eoaTxHash },
            }, '*');
            break;
          }

          case 'particle-wallet.rpc': {
            const walletRpcMethod = payload.method;
            // `let` (not `const`): signer-normalisation below may rebind to a
            // mutated copy. The previous `const` destructure threw a silent
            // TypeError that surfaced as "no signer popup".
            let walletRpcParams = payload.params;
            const rpcConnectorId = (primaryWallet as any)?.connector?.id
              || (primaryWallet as any)?.connector?.name
              || (connector as any)?.id
              || (connector as any)?.name
              || 'unknown';
            console.log('[Particle Wallet RPC] connector=', rpcConnectorId, 'method=', walletRpcMethod);

            if (walletRpcMethod === 'eth_accounts' || walletRpcMethod === 'eth_requestAccounts') {
              window.parent.postMessage({
                type: 'particle-wallet.rpc-result',
                requestId,
                payload: { result: connectedEoaAddress ? [connectedEoaAddress] : [] },
              }, '*');
              break;
            }

            if (walletRpcMethod === 'eth_chainId') {
              window.parent.postMessage({
                type: 'particle-wallet.rpc-result',
                requestId,
                payload: { result: chainId ? '0x' + chainId.toString(16) : null },
              }, '*');
              break;
            }

            // Same retry policy as eoa-send: ConnectKit's reconnectOnMount may
            // still be restoring the WC session from localStorage when a dApp
            // requests a signature immediately after page load. Throwing
            // "No provider available" instantly produced silent failures
            // (the parent's overlay just sat there until the 45 s timeout).
            //
            // Prefer useWallets()[0].connector — that's the live wagmi
            // connector exposing .getProvider(). useAccount().connector is a
            // descriptor and threw "getProvider is not a function".
            const resolveWalletProvider = async (): Promise<unknown> => {
              // Read via refs, not closure: the wallet-mode handler has the
              // same stale-closure pitfall as the signing-mode handler — for
              // WC users, primaryWallet/connector can populate AFTER this
              // resolver is created, and a closure-captured undefined would
              // never recover across the retry loop below. See
              // `primaryWalletRef`/`connectorRef` declaration (v1.2.1 fix).
              const pw = (primaryWalletRef.current as any)?.connector;
              if (pw && typeof pw.getProvider === 'function') return await pw.getProvider();
              const ac = connectorRef.current as any;
              if (ac && typeof ac.getProvider === 'function') return await ac.getProvider();
              return undefined;
            };
            let walletProvider = await resolveWalletProvider();
            if (!walletProvider) {
              for (let attempt = 0; attempt < 6 && !walletProvider; attempt++) {
                console.log('[Particle Wallet RPC] Provider not ready, retrying...', attempt + 1);
                await new Promise(r => setTimeout(r, 1500));
                walletProvider = await resolveWalletProvider();
              }
            }
            if (!walletProvider) {
              throw new Error(`No wallet provider available — ConnectKit did not restore session for connector "${rpcConnectorId}". For WalletConnect, the session may have expired on the wallet side; please open Essentials and reconnect.`);
            }

            // Normalise the signer slot for typed-data / eth_sign so external
            // wallets actually see a signer they recognise (mirrors the same
            // fix applied to personal_sign in the eoa-send case).
            const TYPED_DATA = ['eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'];
            if (TYPED_DATA.indexOf(walletRpcMethod) !== -1 || walletRpcMethod === 'eth_sign') {
              const incoming = Array.isArray(walletRpcParams) ? [...walletRpcParams] : [];
              const signerInParams = (incoming[0] || '').toString().toLowerCase();
              const expectedSigner = (connectedEoaAddress || '').toLowerCase();
              if (expectedSigner && signerInParams !== expectedSigner) {
                console.warn(
                  '[Particle Wallet RPC]', walletRpcMethod, 'signer mismatch — dApp asked for',
                  signerInParams || '(empty)', 'but connector only knows', expectedSigner,
                  '— rewriting params[0] so the wallet actually pops up'
                );
                incoming[0] = connectedEoaAddress;
                walletRpcParams = incoming;
              }
            }

            if (walletRpcMethod === 'eth_sendTransaction' && walletRpcParams?.[0]?.chainId) {
              const targetChainHex = walletRpcParams[0].chainId;
              try {
                await (walletProvider as any).request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: targetChainHex }],
                });
              } catch (switchErr: any) {
                console.log('[Particle Wallet RPC] Chain switch info:', switchErr?.message || switchErr);
              }
              const { chainId: _removed, ...cleanParams } = walletRpcParams[0];
              walletRpcParams[0] = cleanParams;
            }

            console.log('[Particle Wallet RPC] Calling provider.request:', walletRpcMethod, 'via', rpcConnectorId);
            try {
              const walletRpcResult = await (walletProvider as any).request({ method: walletRpcMethod, params: walletRpcParams });
              console.log('[Particle Wallet RPC] Result:', walletRpcMethod, typeof walletRpcResult === 'string' ? walletRpcResult.substring(0, 20) + '...' : walletRpcResult);
              window.parent.postMessage({
                type: 'particle-wallet.rpc-result',
                requestId,
                payload: { result: walletRpcResult },
              }, '*');
            } catch (rpcErr: any) {
              console.error(
                '[Particle Wallet RPC]', walletRpcMethod, 'FAILED via', rpcConnectorId,
                '— code:', rpcErr?.code, '— msg:', rpcErr?.message
              );
              throw rpcErr;
            }
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
            
            // Sign the rootHash with the EOA wallet
            let sendProvider = await connector?.getProvider();
            if (!sendProvider) {
              for (let attempt = 0; attempt < 3 && !sendProvider; attempt++) {
                console.log('[Particle Wallet Handler] Send provider not ready, retrying...', attempt + 1);
                await new Promise(r => setTimeout(r, 1500));
                sendProvider = await connector?.getProvider();
              }
            }
            if (!sendProvider) {
              throw new Error('No wallet provider available — session may not be restored. Try logging out and back in.');
            }
            
            console.log('[Particle Wallet Handler] Signing rootHash:', transaction.rootHash, 'with address:', connectedEoaAddress);
            
            const signature = await (sendProvider as any).request({
              method: 'personal_sign',
              params: [transaction.rootHash, connectedEoaAddress],
            });
            
            console.log('[Particle Wallet Handler] Signature obtained:', signature?.substring(0, 20) + '...');
            
            // Send the signed transaction via UA bundler
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

          case 'particle-wallet.create-transfer': {
            if (!smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
            }

            const { to, amount, tokenAddress, chainId: targetChainId, decimals = 18 } = payload;

            const transferPayload = {
              token: {
                chainId: targetChainId || 8453,
                address: tokenAddress || '0x0000000000000000000000000000000000000000',
              },
              amount: amount,
              receiver: to,
            };

            console.log('[Particle Wallet Handler] create-transfer:', transferPayload);

            const createdTx = await universalAccount.createTransferTransaction(transferPayload);

            console.log('[Particle Wallet Handler] Transfer transaction created, rootHash:', createdTx.rootHash);

            window.parent.postMessage({
              type: 'particle-wallet.create-transfer-result',
              requestId,
              payload: {
                rootHash: createdTx.rootHash,
                transactionData: JSON.parse(JSON.stringify(createdTx)),
                eoaAddress: connectedEoaAddress,
              },
            }, '*');
            break;
          }

          case 'particle-wallet.submit-transfer': {
            if (!universalAccount) {
              throw new Error('Universal Account not available');
            }

            const { transactionData: txData, signature: sig } = payload;

            console.log('[Particle Wallet Handler] submit-transfer: sig=', sig?.substring(0, 20) + '...');

            const submitResult = await universalAccount.sendTransaction(txData, sig);

            console.log('[Particle Wallet Handler] Transaction submitted:', submitResult);

            window.parent.postMessage({
              type: 'particle-wallet.send-result',
              requestId,
              payload: {
                success: true,
                hash: submitResult.transactionHash || submitResult.hash || txData.transactionId,
                transactionId: txData.transactionId,
                result: submitResult,
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
          
          case 'particle-wallet.estimate-swap': {
            // Estimate swap output without executing - for real-time UI updates
            if (!smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
            }
            
            const { fromToken: estFromToken, toToken: estToToken, fromAmount: estFromAmount, toChainId: estToChainId } = payload;
            
            console.log('[Particle Wallet Handler] Estimating swap:', { estFromToken, estToToken, estFromAmount, estToChainId });
            
            // Token type mapping
            const estTokenTypeMap: Record<string, any> = {
              'USDC': SUPPORTED_TOKEN_TYPE.USDC,
              'USDT': SUPPORTED_TOKEN_TYPE.USDT,
              'ETH': SUPPORTED_TOKEN_TYPE.ETH,
              'BTC': SUPPORTED_TOKEN_TYPE.BTC,
              'SOL': SUPPORTED_TOKEN_TYPE.SOL,
              'BNB': SUPPORTED_TOKEN_TYPE.BNB,
            };
            
            const estTokenDecimals: Record<string, number> = {
              'USDC': 6, 'USDT': 6, 'ETH': 18, 'BTC': 8, 'SOL': 9, 'BNB': 18,
            };
            
            const estToTokenType = estTokenTypeMap[estToToken?.toUpperCase()];
            if (!estToTokenType) {
              throw new Error(`Unsupported target token: ${estToToken}`);
            }
            
            // Get prices
            const estAssets = await universalAccount.getPrimaryAssets();
            const estFromAsset = estAssets.assets.find((a: any) => a.tokenType?.toUpperCase() === estFromToken?.toUpperCase());
            const estToAsset = estAssets.assets.find((a: any) => a.tokenType?.toUpperCase() === estToToken?.toUpperCase());
            
            const estFromPrice = estFromAsset?.price || 1;
            const estToPrice = estToAsset?.price || 1;
            
            if (estToPrice <= 0) {
              throw new Error(`Price not available for ${estToToken}`);
            }
            
            // Calculate expected output
            const estFromAmountFloat = parseFloat(estFromAmount);
            const estFromAmountUSD = estFromAmountFloat * estFromPrice;
            const estExpectedOutput = estFromAmountUSD / estToPrice;
            const estToTokenDecimals = estTokenDecimals[estToToken?.toUpperCase()] || 18;
            const estExpectedOutputString = estExpectedOutput.toFixed(estToTokenDecimals);
            
            // Create transaction to get accurate fees and output
            const estTransaction = await universalAccount.createConvertTransaction({
              expectToken: {
                type: estToTokenType,
                amount: estExpectedOutputString,
              },
              chainId: estToChainId || 8453,
            });
            
            console.log('[Particle Wallet Handler] Estimation transaction created:', estTransaction);
            
            // Extract actual receive amount from lendingTokens
            let actualReceiveAmount = estExpectedOutputString;
            if (estTransaction.lendingTokens && estTransaction.lendingTokens.length > 0) {
              const lendingToken = estTransaction.lendingTokens[0];
              const rawAmount = lendingToken.amount || '0';
              // Particle returns amounts in 18 decimals
              actualReceiveAmount = (Number(BigInt(rawAmount)) / 1e18).toFixed(estToTokenDecimals);
              console.log('[Particle Wallet Handler] Actual receive amount from lendingTokens:', actualReceiveAmount);
            }
            
            // Extract fees
            let feesData = null;
            if (estTransaction.feeQuotes?.[0]) {
              const totals = estTransaction.feeQuotes[0].fees?.totals || {};
              feesData = {
                totalFeeUSD: totals.feeTokenAmountInUSD 
                  ? (Number(BigInt(totals.feeTokenAmountInUSD)) / 1e18).toFixed(4) 
                  : '0',
                gasFeeUSD: totals.gasFeeTokenAmountInUSD 
                  ? (Number(BigInt(totals.gasFeeTokenAmountInUSD)) / 1e18).toFixed(4) 
                  : '0',
                serviceFeeUSD: totals.transactionServiceFeeTokenAmountInUSD 
                  ? (Number(BigInt(totals.transactionServiceFeeTokenAmountInUSD)) / 1e18).toFixed(4) 
                  : '0',
                freeGasFee: estTransaction.feeQuotes[0].fees?.freeGasFee || false,
                freeServiceFee: estTransaction.feeQuotes[0].fees?.freeServiceFee || false,
              };
            }
            
            // Also try tokenChanges for fee info
            const tokenChangesFee = estTransaction.tokenChanges?.totalFeeInUSD || '0';
            
            window.parent.postMessage({
              type: 'particle-wallet.estimate-swap-result',
              requestId,
              payload: {
                success: true,
                fromToken: estFromToken,
                toToken: estToToken,
                fromAmount: estFromAmount,
                fromAmountUSD: estFromAmountUSD.toFixed(2),
                expectedOutput: actualReceiveAmount,
                toChainId: estToChainId || 8453,
                fees: feesData,
                tokenChangesFeeUSD: tokenChangesFee,
              },
            }, '*');
            break;
          }
          
          case 'particle-wallet.swap': {
            // Swap between primary assets using createConvertTransaction
            // Primary assets: USDC, USDT, ETH, BTC, SOL, BNB
            if (!smartAccountInfo?.smartAccountAddress) {
              throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
            }
            
            const { fromToken, toToken, fromAmount, toChainId } = payload;
            
            console.log('[Particle Wallet Handler] Swap request:', {
              fromToken,
              toToken,
              fromAmount,
              toChainId,
            });
            
            // Map token symbols to SUPPORTED_TOKEN_TYPE enum
            const tokenTypeMap: Record<string, any> = {
              'USDC': SUPPORTED_TOKEN_TYPE.USDC,
              'USDT': SUPPORTED_TOKEN_TYPE.USDT,
              'ETH': SUPPORTED_TOKEN_TYPE.ETH,
              'BTC': SUPPORTED_TOKEN_TYPE.BTC,
              'SOL': SUPPORTED_TOKEN_TYPE.SOL,
              'BNB': SUPPORTED_TOKEN_TYPE.BNB,
            };
            
            // Decimals for each token
            const tokenDecimals: Record<string, number> = {
              'USDC': 6,
              'USDT': 6,
              'ETH': 18,
              'BTC': 8,
              'SOL': 9,
              'BNB': 18,
            };
            
            const toTokenType = tokenTypeMap[toToken?.toUpperCase()];
            if (!toTokenType) {
              throw new Error(`Unsupported target token: ${toToken}. Primary assets only: USDC, USDT, ETH, BTC, SOL, BNB`);
            }
            
            // Get prices to calculate expected output
            console.log('[Particle Wallet Handler] Fetching prices for swap calculation...');
            const assets = await universalAccount.getPrimaryAssets();
            
            const fromAsset = assets.assets.find(
              (a: any) => a.tokenType?.toUpperCase() === fromToken?.toUpperCase()
            );
            const toAsset = assets.assets.find(
              (a: any) => a.tokenType?.toUpperCase() === toToken?.toUpperCase()
            );
            
            const fromPrice = fromAsset?.price || 1;
            const toPrice = toAsset?.price || 1;
            
            if (!toPrice || toPrice <= 0) {
              throw new Error(`Price data not available for ${toToken}`);
            }
            
            // Calculate expected output: (fromAmount * fromPrice) / toPrice
            const fromAmountFloat = parseFloat(fromAmount);
            const fromAmountUSD = fromAmountFloat * fromPrice;
            const expectedOutput = fromAmountUSD / toPrice;
            
            // Format with correct decimals
            const toTokenDecimals = tokenDecimals[toToken?.toUpperCase()] || 18;
            const expectedOutputString = expectedOutput.toFixed(toTokenDecimals);
            
            console.log('[Particle Wallet Handler] Swap calculation:', {
              fromAmount,
              fromPrice,
              fromAmountUSD,
              toPrice,
              expectedOutput,
              expectedOutputString,
            });
            
            // Create convert transaction using Particle SDK
            const swapTransaction = await universalAccount.createConvertTransaction({
              expectToken: {
                type: toTokenType,
                amount: expectedOutputString,
              },
              chainId: toChainId || 8453, // Default to Base
            });
            
            console.log('[Particle Wallet Handler] Convert transaction created:', swapTransaction);
            
            // Sign the rootHash with the EOA wallet
            const swapProvider = await connector?.getProvider();
            if (!swapProvider) {
              throw new Error('No wallet provider available');
            }
            
            console.log('[Particle Wallet Handler] Signing swap rootHash with address:', connectedEoaAddress);
            
            const swapSignature = await (swapProvider as any).request({
              method: 'personal_sign',
              params: [swapTransaction.rootHash, connectedEoaAddress],
            });
            
            console.log('[Particle Wallet Handler] Swap signature obtained');
            
            // Send via UA bundler
            const swapResult = await universalAccount.sendTransaction(swapTransaction, swapSignature);
            
            console.log('[Particle Wallet Handler] Swap sent:', swapResult);
            
            // Extract fee info for display
            const swapFees = swapTransaction.tokenChanges?.totalFeeInUSD || '0';
            
            window.parent.postMessage({
              type: 'particle-wallet.swap-result',
              requestId,
              payload: { 
                success: true,
                transactionId: swapResult.transactionId || swapTransaction.transactionId,
                fromToken,
                toToken,
                fromAmount,
                expectedOutput: expectedOutputString,
                toChainId: toChainId || 8453,
                feeUSD: swapFees,
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
  }, [active, universalAccount, connector, connectedEoaAddress, smartAccountInfo, chainId, eoaAddress]);

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
