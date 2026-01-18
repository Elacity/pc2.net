import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import App from './App';
import { config } from './wagmi';

import '@rainbow-me/rainbowkit/styles.css';
import './index.css';

// Check if this is login mode - if so, clear ALL cached wallet data BEFORE wagmi loads
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'login';

if (mode === 'login') {
  console.log('[RainbowKit Main]: Login mode - clearing all wallet cache before wagmi init');
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('wagmi') || 
      key.startsWith('rk-') || 
      key.startsWith('wc@') || 
      key.startsWith('WC') ||
      key.includes('walletconnect') ||
      key.includes('WALLETCONNECT')
    )) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => {
    console.log('[RainbowKit Main]: Removing:', key);
    localStorage.removeItem(key);
  });
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#F6921A', // Elastos orange
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
