import { ChainNotConfiguredError, ProviderNotFoundError, SwitchChainError, UserRejectedRequestError, createConnector, numberToHex, } from '@particle-network/connector-core';
import { ResourceUnavailableRpcError, withRetry, withTimeout, } from 'viem';
function findProvider(window, select) {
    function isProvider(provider) {
        if (typeof select === 'function')
            return select(provider);
        if (typeof select === 'string')
            return provider[select];
        return true;
    }
    const { ethereum } = window;
    if (ethereum?.providers)
        return ethereum.providers.find((provider) => isProvider(provider));
    if (ethereum && isProvider(ethereum))
        return ethereum;
    return undefined;
}
const targetMap = {
    coinbaseWallet: {
        id: 'coinbaseWallet',
        name: 'Coinbase Wallet',
        provider(window) {
            if (window?.coinbaseWalletExtension)
                return window.coinbaseWalletExtension;
            return findProvider(window, 'isCoinbaseWallet');
        },
    },
    metaMask: {
        id: 'metaMask',
        name: 'MetaMask',
        provider(window) {
            return findProvider(window, (provider) => {
                if (!provider.isMetaMask)
                    return false;
                if (provider.isBraveWallet && !provider._events && !provider._state)
                    return false;
                const flags = [
                    'isApexWallet',
                    'isAvalanche',
                    'isBitKeep',
                    'isBlockWallet',
                    'isKuCoinWallet',
                    'isMathWallet',
                    'isOkxWallet',
                    'isOKExWallet',
                    'isOneInchIOSWallet',
                    'isOneInchAndroidWallet',
                    'isOpera',
                    'isPortal',
                    'isRabby',
                    'isTokenPocket',
                    'isTokenary',
                    'isZerion',
                    'isEssentialWallet',
                ];
                for (const flag of flags)
                    if (provider[flag])
                        return false;
                return true;
            });
        },
    },
    phantom: {
        id: 'phantom',
        name: 'Phantom',
        provider(window) {
            if (window?.phantom?.ethereum)
                return window.phantom?.ethereum;
            return findProvider(window, 'isPhantom');
        },
    },
    safePal: {
        id: 'safePal',
        name: 'SafePal',
        provider(window) {
            return window?.safepalProvider;
        },
    },
    coin98: {
        id: 'coin98',
        name: 'Coin98 Wallet',
        provider(window) {
            if (window?.coin98?.provider)
                return window.coin98?.provider;
            return findProvider(window, 'isCoin98');
        },
    },
    onekey: {
        id: 'onekey',
        name: 'OneKey',
        provider(window) {
            return window?.$onekey?.ethereum;
        },
    },
    bybitWallet: {
        id: 'bybitWallet',
        name: 'Bybit Wallet',
        provider(window) {
            return window?.bybitWallet;
        },
    },
    braveWallet: {
        id: 'braveWallet',
        name: 'Brave Wallet',
        provider(window) {
            return window?.braveEthereum;
        },
    },
    essentialWallet: {
        id: 'essential',
        name: 'Essentials',
        provider(window) {
            return window?.ethereum;
        },
    },
};
export function injected(parameters = {}) {
    const { shimDisconnect = true, unstableShimAsyncInject } = parameters;
    function getTarget() {
        const { target } = parameters;
        if (typeof target === 'function') {
            const result = target();
            if (result)
                return result;
        }
        if (typeof target === 'object')
            return target;
        if (typeof target === 'string') {
            return {
                ...(targetMap[target] ?? {
                    id: target,
                    name: `${target[0].toUpperCase()}${target.slice(1)}`,
                    provider: `is${target[0].toUpperCase()}${target.slice(1)}`,
                }),
            };
        }
        return {
            id: 'injected',
            name: 'Injected',
            provider(window) {
                return window?.ethereum;
            },
        };
    }
    let accountsChanged;
    let chainChanged;
    let connect;
    let disconnect;
    return createConnector((config) => ({
        get icon() {
            return getTarget().icon;
        },
        get id() {
            return getTarget().id;
        },
        get name() {
            return getTarget().name;
        },
        type: injected.type,
        async setup() {
            const provider = await this.getProvider();
            if (provider && parameters.target) {
                if (!connect) {
                    connect = this.onConnect.bind(this);
                }
                if (!accountsChanged) {
                    accountsChanged = this.onAccountsChanged.bind(this);
                    provider.on('accountsChanged', accountsChanged);
                }
            }
        },
        async connect({ chainId, isReconnecting } = {}) {
            const provider = await this.getProvider();
            if (!provider)
                throw new ProviderNotFoundError();
            let accounts = [];
            if (isReconnecting) {
                accounts = await this.getAccounts().catch(() => []);
            }
            else if (shimDisconnect) {
                try {
                    const permissions = await provider.request({
                        method: 'wallet_requestPermissions',
                        params: [{ eth_accounts: {} }],
                    });
                    console.log('inject provider connect, permissions:', permissions);
                    accounts = permissions?.[0]?.caveats?.[0]?.value;
                    if (accounts?.length) {
                        const sortedAccounts = await this.getAccounts();
                        accounts = sortedAccounts;
                    }
                }
                catch (err) {
                    const error = err;
                    if (error.code === UserRejectedRequestError.code)
                        throw new UserRejectedRequestError(error);
                    if (error.code === ResourceUnavailableRpcError.code)
                        throw error;
                }
            }
            try {
                if (!accounts?.length && !isReconnecting) {
                    const requestedAccounts = await provider.request({
                        method: 'eth_requestAccounts',
                    });
                    accounts = requestedAccounts;
                }
                if (connect) {
                    provider.removeListener('connect', connect);
                    connect = undefined;
                }
                if (!accountsChanged) {
                    accountsChanged = this.onAccountsChanged.bind(this);
                    provider.on('accountsChanged', accountsChanged);
                }
                if (!chainChanged) {
                    chainChanged = this.onChainChanged.bind(this);
                    provider.on('chainChanged', chainChanged);
                }
                if (!disconnect) {
                    disconnect = this.onDisconnect.bind(this);
                    provider.on('disconnect', disconnect);
                }
                let currentChainId = await this.getChainId();
                if (chainId && currentChainId !== chainId) {
                    const chain = await this.switchChain({ chainId }).catch((error) => {
                        if (error.code === UserRejectedRequestError.code)
                            throw error;
                        return { id: currentChainId };
                    });
                    currentChainId = chain?.id ?? currentChainId;
                }
                if (shimDisconnect)
                    await config.storage?.removeItem(`${this.id}.disconnected`);
                if (!parameters.target)
                    await config.storage?.setItem('injected.connected', true);
                return { accounts, chainId: currentChainId };
            }
            catch (err) {
                const error = err;
                if (error.code === UserRejectedRequestError.code)
                    throw new UserRejectedRequestError(error);
                if (error.code === ResourceUnavailableRpcError.code)
                    throw new ResourceUnavailableRpcError(error);
                throw error;
            }
        },
        async disconnect() {
            const provider = await this.getProvider();
            if (!provider)
                throw new ProviderNotFoundError();
            if (chainChanged) {
                provider.removeListener('chainChanged', chainChanged);
                chainChanged = undefined;
            }
            if (disconnect) {
                provider.removeListener('disconnect', disconnect);
                disconnect = undefined;
            }
            if (!connect) {
                connect = this.onConnect.bind(this);
            }
            try {
                await provider.request({
                    method: 'wallet_revokePermissions',
                    params: [{ eth_accounts: {} }],
                });
            }
            catch (e) {
                console.log(e);
            }
            if (shimDisconnect) {
                await config.storage?.setItem(`${this.id}.disconnected`, true);
            }
            if (!parameters.target)
                await config.storage?.removeItem('injected.connected');
        },
        async getAccounts() {
            const provider = await this.getProvider();
            if (!provider)
                throw new ProviderNotFoundError();
            const accounts = await provider.request({ method: 'eth_accounts' });
            return accounts;
        },
        async getChainId() {
            const provider = await this.getProvider();
            if (!provider)
                throw new ProviderNotFoundError();
            const hexChainId = await provider.request({ method: 'eth_chainId' });
            return Number(hexChainId);
        },
        async getProvider() {
            if (typeof window === 'undefined')
                return undefined;
            let provider;
            const target = getTarget();
            if (typeof target.provider === 'function')
                provider = target.provider(window);
            else if (typeof target.provider === 'string')
                provider = findProvider(window, target.provider);
            else
                provider = target.provider;
            if (provider && !provider.removeListener) {
                if ('off' in provider && typeof provider.off === 'function')
                    provider.removeListener = provider.off;
                else
                    provider.removeListener = () => { };
            }
            return provider;
        },
        async isAuthorized() {
            try {
                const isDisconnected = shimDisconnect &&
                    (await config.storage?.getItem(`${this.id}.disconnected`));
                if (isDisconnected)
                    return false;
                if (!parameters.target) {
                    const connected = await config.storage?.getItem('injected.connected');
                    if (!connected)
                        return false;
                }
                const provider = await this.getProvider();
                if (!provider) {
                    if (unstableShimAsyncInject !== undefined && unstableShimAsyncInject !== false) {
                        const handleEthereum = async () => {
                            if (typeof window !== 'undefined')
                                window.removeEventListener('ethereum#initialized', handleEthereum);
                            const provider = await this.getProvider();
                            return !!provider;
                        };
                        const timeout = typeof unstableShimAsyncInject === 'number' ? unstableShimAsyncInject : 1_000;
                        const res = await Promise.race([
                            ...(typeof window !== 'undefined'
                                ? [
                                    new Promise((resolve) => window.addEventListener('ethereum#initialized', () => resolve(handleEthereum()), { once: true })),
                                ]
                                : []),
                            new Promise((resolve) => setTimeout(() => resolve(handleEthereum()), timeout)),
                        ]);
                        if (res)
                            return true;
                    }
                    throw new ProviderNotFoundError();
                }
                const accounts = await withRetry(() => withTimeout(() => this.getAccounts(), {
                    timeout: 100 * 10,
                }));
                return Array.isArray(accounts) && accounts.length > 0;
            }
            catch {
                return false;
            }
        },
        async switchChain({ addEthereumChainParameter, chainId }) {
            const provider = await this.getProvider();
            if (!provider)
                throw new ProviderNotFoundError();
            const chain = config.chains.find((x) => x.id === chainId);
            if (!chain)
                throw new SwitchChainError(new ChainNotConfiguredError());
            try {
                await Promise.all([
                    provider
                        .request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: numberToHex(chainId) }],
                    })
                        .then(async () => {
                        const currentChainId = await this.getChainId();
                        if (currentChainId === chainId)
                            config.emitter.emit('change', { chainId });
                    }),
                    new Promise((resolve) => config.emitter.once('change', ({ chainId: currentChainId }) => {
                        if (currentChainId === chainId)
                            resolve();
                    })),
                ]);
                return chain;
            }
            catch (err) {
                const error = err;
                if (error.code === 4902 ||
                    error?.data?.originalError?.code === 4902) {
                    try {
                        let blockExplorerUrls;
                        if (addEthereumChainParameter?.blockExplorerUrls)
                            blockExplorerUrls = addEthereumChainParameter.blockExplorerUrls;
                        else
                            blockExplorerUrls = chain.blockExplorers?.default.url ? [chain.blockExplorers?.default.url] : [];
                        let rpcUrls;
                        if (addEthereumChainParameter?.rpcUrls?.length)
                            rpcUrls = addEthereumChainParameter.rpcUrls;
                        else
                            rpcUrls = [chain.rpcUrls.default?.http[0] ?? ''];
                        const addEthereumChain = {
                            blockExplorerUrls,
                            chainId: numberToHex(chainId),
                            chainName: addEthereumChainParameter?.chainName ?? chain.name,
                            iconUrls: addEthereumChainParameter?.iconUrls,
                            nativeCurrency: addEthereumChainParameter?.nativeCurrency ?? chain.nativeCurrency,
                            rpcUrls,
                        };
                        await provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [addEthereumChain],
                        });
                        const currentChainId = await this.getChainId();
                        if (currentChainId !== chainId)
                            throw new UserRejectedRequestError(new Error('User rejected switch after adding network.'));
                        return chain;
                    }
                    catch (error) {
                        throw new UserRejectedRequestError(error);
                    }
                }
                if (error.code === UserRejectedRequestError.code)
                    throw new UserRejectedRequestError(error);
                throw new SwitchChainError(error);
            }
        },
        async onAccountsChanged(accounts) {
            if (accounts.length === 0)
                this.onDisconnect();
            else if (config.emitter.listenerCount('connect')) {
                const chainId = (await this.getChainId()).toString();
                this.onConnect({ chainId });
                if (shimDisconnect)
                    await config.storage?.removeItem(`${this.id}.disconnected`);
            }
            else {
                config.emitter.emit('change', {
                    accounts,
                });
            }
        },
        onChainChanged(chain) {
            const chainId = Number(chain);
            config.emitter.emit('change', { chainId });
        },
        async onConnect(connectInfo) {
            const accounts = await this.getAccounts();
            if (accounts.length === 0)
                return;
            const chainId = Number(connectInfo.chainId);
            config.emitter.emit('connect', { accounts, chainId });
            const provider = await this.getProvider();
            if (provider) {
                if (connect) {
                    provider.removeListener('connect', connect);
                    connect = undefined;
                }
                if (!accountsChanged) {
                    accountsChanged = this.onAccountsChanged.bind(this);
                    provider.on('accountsChanged', accountsChanged);
                }
                if (!chainChanged) {
                    chainChanged = this.onChainChanged.bind(this);
                    provider.on('chainChanged', chainChanged);
                }
                if (!disconnect) {
                    disconnect = this.onDisconnect.bind(this);
                    provider.on('disconnect', disconnect);
                }
            }
        },
        async onDisconnect(error) {
            const provider = await this.getProvider();
            if (error && error.code === 1013) {
                if (provider && !!(await this.getAccounts()).length)
                    return;
            }
            config.emitter.emit('disconnect');
            if (provider) {
                if (chainChanged) {
                    provider.removeListener('chainChanged', chainChanged);
                    chainChanged = undefined;
                }
                if (disconnect) {
                    provider.removeListener('disconnect', disconnect);
                    disconnect = undefined;
                }
                if (!connect) {
                    connect = this.onConnect.bind(this);
                }
            }
        },
        isInstalled() {
            if (typeof window === 'undefined')
                return false;
            let provider;
            const target = getTarget();
            if (typeof target.provider === 'function')
                provider = target.provider(window);
            else if (typeof target.provider === 'string')
                provider = findProvider(window, target.provider);
            else
                provider = target.provider;
            return Boolean(provider);
        },
    }));
}
injected.type = 'injected';
//# sourceMappingURL=injected.js.map