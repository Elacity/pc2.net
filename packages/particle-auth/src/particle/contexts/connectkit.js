import React from 'react';
import { ConnectKitProvider, createConfig, } from '@particle-network/connectkit';
import { wallet, EntryPosition } from '@particle-network/connectkit/wallet';
import { defineChain, mainnet, arbitrum, polygon, base, optimism, bsc, avalanche, linea, } from '@particle-network/connectkit/chains';
import { evmWalletConnectors, walletConnect } from '@particle-network/connectkit/evm';
import { injected } from '../connectors/injected';
import elastosLogo from '../../assets/Elastos_Logo_Dark_-_1.svg';
import './style.css';
const getWalletConnectProjectId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const customProjectId = urlParams.get('wc_project_id');
    if (customProjectId && customProjectId.length > 20) {
        console.log('[WalletConnect]: Using custom project ID from URL param');
        return customProjectId;
    }
    return import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
};
const wcProjectId = getWalletConnectProjectId();
const elastos = defineChain({
    id: 20,
    name: 'Elastos (ESC)',
    nativeCurrency: { name: 'Elastos', symbol: 'ELA', decimals: 18 },
    rpcUrls: {
        default: {
            http: [
                'https://api.ela.city/esc',
                'https://api.elastos.io/esc',
            ],
        },
    },
    blockExplorers: {
        default: {
            name: 'Elastos Explorer',
            url: 'https://esc.elastos.io',
            apiUrl: 'http://esc.elastos.io/api',
        },
    },
    contracts: {},
});
const elastosIdentity = defineChain({
    id: 22,
    name: 'Elastos (EID)',
    nativeCurrency: { name: 'Elastos', symbol: 'ELA', decimals: 18 },
    rpcUrls: {
        default: {
            http: [
                'https://api.elastos.io/eid',
                'https://api2.elastos.io/eid',
            ],
        },
    },
    blockExplorers: {
        default: {
            name: 'Elastos Identity Explorer',
            url: 'https://eid.elastos.io',
        },
    },
    contracts: {},
});
const elastosEco = defineChain({
    id: 12343,
    name: 'Elastos (ECO)',
    network: 'elastos-eco',
    nativeCurrency: { name: 'Elastos', symbol: 'ELA', decimals: 18 },
    rpcUrls: {
        default: {
            http: [
                'https://api.elastos.io/eco',
                'https://api2.elastos.io/eco',
            ],
        },
    },
    blockExplorers: {
        default: {
            name: 'ECO Explorer',
            url: 'https://eco.elastos.io',
        },
    },
    contracts: {},
    testnet: false,
});
const elastosPgp = defineChain({
    id: 860621,
    name: 'Elastos (PGP)',
    network: 'elastos-pgp',
    nativeCurrency: { name: 'PanGu Asset', symbol: 'PGA', decimals: 18 },
    iconUrl: 'https://icons.llamao.fi/icons/chains/rsz_elastos.jpg',
    rpcUrls: {
        default: {
            http: [
                'https://api.elastos.io/pg',
                'https://api2.elastos.io/pg',
                'https://pgp-node.elastos.io',
            ],
        },
    },
    blockExplorers: {
        default: {
            name: 'PGP Explorer',
            url: 'https://pgp.elastos.io',
        },
    },
    contracts: {},
    testnet: false,
});
const chains = [
    mainnet,
    base,
    polygon,
    arbitrum,
    optimism,
    bsc,
    avalanche,
    linea,
    elastos,
    elastosIdentity,
    elastosEco,
    elastosPgp,
];
const config = createConfig({
    projectId: import.meta.env.VITE_PARTICLE_PROJECT_ID,
    clientKey: import.meta.env.VITE_PARTICLE_CLIENT_KEY,
    appId: import.meta.env.VITE_PARTICLE_APP_ID,
    appearance: {
        recommendedWallets: [
            { walletId: window?.elastos ? 'essentialWallet' : 'metaMask', label: 'Recommended' },
            { walletId: 'phantom', label: 'Popular' },
            { walletId: 'walletConnect', label: 'none' },
            { walletId: 'coinbaseWallet', label: 'none' },
            { walletId: 'okxWallet', label: 'none' },
            { walletId: 'trustWallet', label: 'none' },
            { walletId: 'bitKeep', label: 'none' },
        ],
        splitEmailAndPhone: false,
        isDismissable: false,
        collapseWalletList: false,
        hideContinueButton: true,
        connectorsOrder: ['wallet'],
        logo: elastosLogo,
        language: 'en-US',
        theme: {
            '--pcm-font-family': '-apple-system,"Proxima Nova",Arial,sans-serif',
            '--pcm-rounded-sm': '4px',
            '--pcm-rounded-md': '8px',
            '--pcm-rounded-lg': '11px',
            '--pcm-rounded-xl': '22px',
            '--pcm-overlay-background': '#161616',
            "--pcm-body-background": "#1C1D22",
            "--pcm-body-background-secondary": "#41424A",
            "--pcm-body-background-tertiary": "#232529",
            "--pcm-body-color": "#ffffff",
            "--pcm-body-color-secondary": "#8B8EA1",
            "--pcm-body-color-tertiary": "#42444B",
            "--pcm-primary-button-bankground": "#F59E0B",
            "--pcm-primary-button-color": "#5c2e00",
            "--pcm-primary-button-hover-background": "#cf7c00",
            "--pcm-secondary-button-color": "#361900",
            "--pcm-secondary-button-bankground": "#ffbb33",
            "--pcm-secondary-button-hover-background": "#ffce5c",
            "--pcm-body-action-color": "#808080",
            "--pcm-button-border-color": "#292B36",
            "--pcm-accent-color": "#F59E0B",
            "--pcm-button-font-weight": "500",
            "--pcm-modal-box-shadow": "0px 2px 4px rgba(0, 0, 0, 0.02)",
        },
    },
    walletConnectors: [
        evmWalletConnectors({
            metadata: { name: 'Elacity' },
            connectorFns: [
                injected({ target: 'metaMask' }),
                injected({ target: 'phantom' }),
                ...window.elastos ? [injected({
                        target: 'essentialWallet',
                    })] : [],
                walletConnect({
                    showQrModal: true,
                    projectId: wcProjectId,
                    qrModalOptions: {
                        themeVariables: {
                            '--wcm-z-index': '2147483647',
                            '--wcm-background-color': '#ffffff',
                            '--wcm-accent-fill-color': '#ffffff',
                            '--wcm-background-border-radius': '8px',
                            '--wcm-container-border-radius': '24px',
                            '--wcm-wallet-icon-border-radius': '16px',
                            '--wcm-font-family': '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu',
                        },
                        enableExplorer: true,
                        featuredWalletIds: [
                            '022e8ff84519e427bff394b3a58308bc9838196a8efb45158da0ab7c3228abfb',
                        ],
                        explorerRecommendedWalletIds: [
                            '022e8ff84519e427bff394b3a58308bc9838196a8efb45158da0ab7c3228abfb',
                        ],
                    },
                }),
                injected({ target: 'coinbaseWallet' }),
                injected({ target: 'okxWallet' }),
                injected({ target: 'trustWallet' }),
                injected({ target: 'bitKeep' }),
                injected({ target: 'rainbow' }),
                injected({ target: 'zerion' }),
            ],
            multiInjectedProviderDiscovery: true,
        }),
    ],
    plugins: [
        wallet({
            entryPosition: EntryPosition.TR,
            visible: true,
            customStyle: {
                fiatCoin: 'USD',
            },
            widgetIntegration: 'embedded',
            walletUrl: 'https://wallet-iframe.particle.network',
        }),
    ],
    chains,
});
const filteredConnectorIds = ['io.metamask'];
const cloneWithDescriptors = (obj) => {
    const clone = Object.create(Object.getPrototypeOf(obj));
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    if (descriptors.connectors) {
        const originalGet = descriptors.connectors.get;
        descriptors.connectors = {
            ...descriptors.connectors,
            get() {
                const connectors = originalGet?.call(this);
                return connectors.filter((c) => !filteredConnectorIds.includes(c.id));
            },
        };
    }
    Object.defineProperties(clone, descriptors);
    return clone;
};
export const ParticleConnectkitContext = React.createContext({
    config: null,
});
const ParticleConnectkit = ({ children }) => {
    const clonedConfig = cloneWithDescriptors(config);
    return (<ParticleConnectkitContext.Provider value={{
            config: clonedConfig,
        }}>
      <ConnectKitProvider config={clonedConfig} reconnectOnMount>{children}</ConnectKitProvider>
    </ParticleConnectkitContext.Provider>);
};
export const useConnectkitConfig = () => React.useContext(ParticleConnectkitContext);
export default React.memo(ParticleConnectkit);
//# sourceMappingURL=connectkit.js.map