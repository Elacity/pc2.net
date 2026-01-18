import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
  rainbowWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';

// Define Elastos Smart Chain
export const elastos = defineChain({
  id: 20,
  name: 'Elastos Smart Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'ELA',
    symbol: 'ELA',
  },
  rpcUrls: {
    default: {
      http: ['https://api.elastos.io/eth'],
    },
    public: {
      http: ['https://api.elastos.io/eth'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Elastos Explorer',
      url: 'https://esc.elastos.io',
    },
  },
  contracts: {},
});

// WalletConnect Project ID - https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '0d1ac2ba93587a74b54f92189bdc341e';

// Check if this is login mode - if so, disable reconnect
const urlParams = new URLSearchParams(window.location.search);
const isLoginMode = urlParams.get('mode') === 'login' || !urlParams.get('mode');

// Configure wallets
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        coinbaseWallet,
        rainbowWallet,
      ],
    },
    {
      groupName: 'More',
      wallets: [
        trustWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'PC2',
    projectId: WALLETCONNECT_PROJECT_ID,
  }
);

// Create config with NO auto-reconnect in login mode
// This forces users to explicitly select their wallet
export const config = createConfig({
  chains: [elastos],
  connectors,
  transports: {
    [elastos.id]: http(),
  },
  // Disable reconnect on mount - user must explicitly connect
  // This is critical for login mode to work correctly
  ...(isLoginMode ? {
    storage: null, // No persistence = no auto-reconnect
  } : {}),
});
