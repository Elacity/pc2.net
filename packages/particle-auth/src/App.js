import React from 'react';
import './App.css';
import { useModal } from '@particle-network/connectkit';
import { useParticleNetwork } from './particle/hooks/useParticleNetwork';
import elacityLogo from './assets/elacity-labs-logo.svg';
function App() {
    const { setOpen, isOpen } = useModal();
    const { active, account, eoaAddress, universalAccount } = useParticleNetwork();
    const isWalletMode = React.useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('mode') === 'wallet';
    }, []);
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
        if (isWalletMode) {
            console.log('[Particle Auth Wallet Mode]: Waiting for session restore...', { active });
            if (isOpen) {
                setOpen(false);
            }
            return;
        }
        if (!active) {
            setOpen(true);
        }
        else {
            if (isOpen && import.meta.env.VITE_DEV_SANDBOX !== 'true') {
                setOpen(false);
            }
        }
    }, [setOpen, active, isOpen, isWalletMode]);
    if (isWalletMode) {
        return null;
    }
    return (<a href="https://elacitylabs.com" target="_blank" rel="noopener noreferrer" className="presented-by">
      <span>Presented by</span>
      <img src={elacityLogo} alt="Elacity Labs"/>
    </a>);
}
export default App;
//# sourceMappingURL=App.js.map