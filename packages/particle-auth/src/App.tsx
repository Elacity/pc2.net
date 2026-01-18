import React from 'react';
import './App.css';
import { useModal } from '@particle-network/connectkit';
import { useParticleNetwork } from './particle/hooks/useParticleNetwork';


function App() {
  const { setOpen, isOpen } = useModal();
  const { active, account, eoaAddress, universalAccount } = useParticleNetwork();
  
  // Check if we're in wallet background mode (hidden iframe for data fetching)
  const isWalletMode = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'wallet';
  }, []);
  
  // Debug logging for wallet mode
  React.useEffect(() => {
    if (isWalletMode) {
      console.log('[Particle Auth Wallet Mode]: Status -', {
        active,
        account,
        eoaAddress,
        hasUniversalAccount: !!universalAccount,
        isOpen,
      });
    }
  }, [isWalletMode, active, account, eoaAddress, universalAccount, isOpen]);
  
  React.useEffect(() => {
    // In wallet mode, don't open any modal - just stay quiet in background
    if (isWalletMode) {
      console.log('[Particle Auth Wallet Mode]: Waiting for session restore...', { active });
      if (isOpen) {
        setOpen(false);
      }
      return;
    }
    
    // Normal mode - open modal if not active
    if(!active) {
      setOpen(true);
    } else {
      if (isOpen && import.meta.env.VITE_DEV_SANDBOX !== 'true') {
        setOpen(false);
      }
    }
  }, [setOpen, active, isOpen, isWalletMode]);
  
  return null;
}

export default App;
