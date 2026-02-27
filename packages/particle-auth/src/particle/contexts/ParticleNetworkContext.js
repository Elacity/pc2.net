import React from 'react';
import { isAddress } from '@ethersproject/address';
import { useAccount, useDisconnect, useWallets, } from '@particle-network/connectkit';
import { UniversalAccount, createMultiChainUnsignedData, injectMultiChainSignature, SUPPORTED_TOKEN_TYPE, } from '@particle-network/universal-account-sdk';
import { Web3Provider } from '../provider/web3-provider';
console.log('[Particle Auth Context]: BUILD v2025.01.22.1830 loaded');
export const ParticleNetworkContext = React.createContext({
    deactivate: () => { },
});
function toSmallestUnit(amount, decimals) {
    if (!amount || amount === '0')
        return BigInt(0);
    const amountStr = amount.toString().trim();
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    const combined = whole + paddedFraction;
    const cleaned = combined.replace(/^0+/, '') || '0';
    return BigInt(cleaned);
}
function encodeERC20Transfer(to, amount, decimals = 18) {
    const functionSelector = '0xa9059cbb';
    const paddedTo = to.toLowerCase().replace('0x', '').padStart(64, '0');
    const amountInSmallestUnit = toSmallestUnit(amount, decimals);
    const amountHex = amountInSmallestUnit.toString(16).padStart(64, '0');
    return functionSelector + paddedTo + amountHex;
}
const ParticleNetworkProvider = React.memo(({ children, }) => {
    const { address: connectedEoaAddress, chainId, connector, } = useAccount();
    const [primaryWallet] = useWallets();
    const { disconnect } = useDisconnect();
    const [particleProvider, setParticleProvider] = React.useState();
    const [universalAccount, setUniversalAccount] = React.useState(null);
    const [smartAccountInfo, setSmartAccountInfo] = React.useState();
    const [primaryAssets, setPrimaryAssets] = React.useState();
    const { isWalletMode, urlEoaAddress, urlSmartAddress, shouldLogout } = React.useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            isWalletMode: params.get('mode') === 'wallet',
            urlEoaAddress: params.get('address') || undefined,
            urlSmartAddress: params.get('smartAddress') || undefined,
            shouldLogout: params.get('logout') === 'true',
        };
    }, []);
    React.useEffect(() => {
        if (shouldLogout && connectedEoaAddress) {
            console.log('[Particle Auth]: Logout requested, disconnecting wallet...');
            disconnect({ connector });
            const url = new URL(window.location.href);
            url.searchParams.delete('logout');
            window.history.replaceState({}, '', url.toString());
        }
    }, [shouldLogout, connectedEoaAddress, disconnect, connector]);
    const eoaAddress = connectedEoaAddress || (isWalletMode ? urlEoaAddress : undefined);
    const library = React.useMemo(() => (particleProvider ? new Web3Provider(particleProvider) : null), [particleProvider]);
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
    React.useEffect(() => {
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
                if (isWalletMode && urlSmartAddress) {
                    console.log('[Particle Auth]: Smart Account hint from URL:', urlSmartAddress);
                    setSmartAccountInfo({
                        ownerAddress: eoaAddress,
                        smartAccountAddress: urlSmartAddress,
                    });
                }
            }
            else {
                console.warn('[Particle Auth]: Missing Particle credentials for UniversalAccount');
            }
        }
    }, [active, eoaAddress, isWalletMode, urlSmartAddress]);
    React.useEffect(() => {
        if (universalAccount && eoaAddress) {
            const fetchSmartAccountInfo = async () => {
                try {
                    const options = await universalAccount.getSmartAccountOptions();
                    console.log('[Particle Auth]: Smart Account Options (full):', JSON.stringify(options, null, 2));
                    console.log('[Particle Auth]: options.smartAccountAddress:', options.smartAccountAddress);
                    console.log('[Particle Auth]: options.solanaSmartAccountAddress:', options.solanaSmartAccountAddress);
                    console.log('[Particle Auth]: options.senderSolanaAddress:', options.senderSolanaAddress);
                    const solanaAddr = options.solanaSmartAccountAddress
                        || options.senderSolanaAddress
                        || options.solanaAddress
                        || '';
                    setSmartAccountInfo({
                        ownerAddress: eoaAddress,
                        smartAccountAddress: options.smartAccountAddress || '',
                        solanaSmartAccountAddress: solanaAddr,
                    });
                    console.log('[Particle Auth]: Using Smart Account (EVM):', options.smartAccountAddress);
                    console.log('[Particle Auth]: Using Smart Account (Solana):', solanaAddr || 'Not available');
                }
                catch (error) {
                    console.error('[Particle Auth]: Failed to get Smart Account options:', error);
                }
            };
            fetchSmartAccountInfo();
        }
    }, [universalAccount, eoaAddress]);
    const fetchPrimaryAssets = React.useCallback(async () => {
        if (!universalAccount)
            return;
        try {
            const assets = await universalAccount.getPrimaryAssets();
            console.log('[Particle Auth]: Primary Assets:', assets);
            setPrimaryAssets(assets);
        }
        catch (error) {
            console.warn('[Particle Auth]: Failed to fetch primary assets:', error);
        }
    }, [universalAccount]);
    React.useEffect(() => {
        if (universalAccount) {
            fetchPrimaryAssets();
        }
    }, [universalAccount, fetchPrimaryAssets]);
    const handleParticleAuthSuccess = React.useCallback(async () => {
        try {
            const authPayload = {
                address: eoaAddress,
                chainId,
            };
            if (smartAccountInfo?.smartAccountAddress) {
                authPayload.smartAccountAddress = smartAccountInfo.smartAccountAddress;
                console.log('[Particle Auth]: Sending auth with Smart Account:', smartAccountInfo.smartAccountAddress);
            }
            else {
                console.log('[Particle Auth]: Sending auth with EOA only (Smart Account not ready yet)');
            }
            let apiOrigin = window.PUTER_API_ORIGIN || import.meta.env.VITE_PUTER_API_URL || window.location.origin;
            if (window.location.protocol === 'https:' && apiOrigin.startsWith('http://')) {
                apiOrigin = apiOrigin.replace('http://', 'https://');
            }
            console.log('[Particle Auth]: Auth callback using API origin:', apiOrigin);
            const response = await fetch(`${apiOrigin}/auth/particle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(authPayload),
            });
            const data = await response.json();
            let isInIframe = false;
            try {
                isInIframe = window !== window.parent || window.self !== window.top;
            }
            catch (e) {
                isInIframe = true;
            }
            console.log('[Particle Auth]: isInIframe detection:', isInIframe, 'window !== parent:', window !== window.parent, 'self !== top:', window.self !== window.top);
            const messageTarget = isInIframe ? window.parent : window;
            if (data.success) {
                console.log('[Particle Auth]: Auth SUCCESS, posting to:', isInIframe ? 'parent' : 'self');
                messageTarget.postMessage({
                    type: 'particle-auth.success',
                    payload: {
                        address: eoaAddress,
                        smartAccountAddress: smartAccountInfo?.smartAccountAddress,
                        chainId,
                        token: data.token,
                        user: data.user,
                    }
                }, '*');
                if (!isInIframe && import.meta.env.VITE_DEV_SANDBOX !== 'true') {
                    console.log('[Particle Auth]: Standalone mode, redirecting to main app');
                    window.location.href = `/?auth_token=${data.token}`;
                }
                else {
                    console.log('[Particle Auth]: In iframe, NOT redirecting (parent handles it)');
                }
            }
            else {
                console.error('Authentication failed:', data.error, data.message);
                if (data.error === 'access_denied') {
                    console.log('[Particle Auth]: Access denied, redirecting to access-denied page');
                    const deniedUrl = `/access-denied?wallet=${encodeURIComponent(data.wallet || eoaAddress)}`;
                    if (!isInIframe) {
                        window.location.href = deniedUrl;
                    }
                    else {
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
        }
        catch (error) {
            console.error('Authentication error:', error);
            const isInIframe = window !== window.parent;
            const messageTarget = isInIframe ? window.parent : window;
            messageTarget.postMessage({
                type: 'particle-auth.error',
                payload: {
                    message: `authentication error: ${error}`,
                }
            }, '*');
        }
    }, [eoaAddress, chainId, smartAccountInfo]);
    React.useEffect(() => {
        if (!active)
            return;
        if (shouldLogout) {
            console.log('[Particle Auth]: Skipping auth (logout requested)');
            return;
        }
        if (isWalletMode) {
            console.log('[Particle Auth Wallet Mode]: Skipping auth callback (wallet mode)');
            return;
        }
        const timeoutId = setTimeout(() => {
            handleParticleAuthSuccess();
        }, smartAccountInfo?.smartAccountAddress ? 0 : 2000);
        return () => clearTimeout(timeoutId);
    }, [active, smartAccountInfo, handleParticleAuthSuccess, isWalletMode, shouldLogout]);
    React.useEffect(() => {
        let timeoutId;
        if (active) {
            const isDisconnecting = localStorage.getItem('disconnect_particle');
            if ((isDisconnecting)) {
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
    React.useEffect(() => {
        if (!active || !universalAccount)
            return;
        console.log('[Particle Auth]: Wallet ready, signaling parent window');
        window.parent.postMessage({
            type: 'particle-wallet.ready',
            payload: {
                ready: true,
                address: eoaAddress,
                smartAccountAddress: smartAccountInfo?.smartAccountAddress,
            },
        }, '*');
        const handleWalletDataRequest = async (event) => {
            const { type, requestId, payload } = event.data || {};
            if (!type?.startsWith('particle-wallet.'))
                return;
            try {
                switch (type) {
                    case 'particle-wallet.get-tokens': {
                        console.log('[Particle Auth]: get-tokens handler called, universalAccount:', !!universalAccount);
                        console.log('[Particle Auth]: Calling getPrimaryAssets()...');
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('getPrimaryAssets() timed out after 15s')), 15000));
                        let assets;
                        try {
                            assets = await Promise.race([
                                universalAccount.getPrimaryAssets(),
                                timeoutPromise
                            ]);
                            console.log('[Particle Auth]: getPrimaryAssets() succeeded:', JSON.stringify(assets, null, 2));
                        }
                        catch (fetchError) {
                            console.error('[Particle Auth]: getPrimaryAssets() FAILED:', fetchError.message || fetchError);
                            window.parent.postMessage({
                                type: 'particle-wallet.tokens',
                                requestId,
                                payload: { tokens: [], totalBalance: 0, error: fetchError.message },
                            }, '*');
                            break;
                        }
                        const tokens = assets?.assets?.map((asset) => ({
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
                            chainBreakdown: asset.chainAggregation?.map((chain) => ({
                                chainId: chain.token?.chainId,
                                amount: chain.amount,
                                amountInUSD: chain.amountInUSD,
                            })) || [],
                        })).filter((token) => token.balance > 0 || token.usdValue > 0) || [];
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
                        const page = payload?.page || 1;
                        const limit = payload?.limit || 20;
                        console.log('[Particle Wallet Handler] Fetching transactions, page:', page, 'limit:', limit);
                        const txResponse = await universalAccount.getTransactions(page, limit);
                        const transactions = txResponse?.data || txResponse || [];
                        console.log('[Particle Wallet Handler] Transactions response:', transactions?.length || 0, 'items');
                        const formattedTxs = (Array.isArray(transactions) ? transactions : []).map((tx) => {
                            const rawAmount = parseFloat(tx.change?.amount || '0');
                            const isSend = rawAmount < 0;
                            const displayAmount = Math.abs(rawAmount).toString();
                            return {
                                transactionId: tx.transactionId,
                                hash: tx.transactionId,
                                tag: tx.tag,
                                type: isSend ? 'send' : 'receive',
                                createdAt: tx.createdAt,
                                timestamp: tx.createdAt,
                                status: tx.status,
                                symbol: tx.targetToken?.symbol || 'Unknown',
                                tokenName: tx.targetToken?.name || 'Unknown Token',
                                tokenIcon: tx.targetToken?.image,
                                tokenPrice: tx.targetToken?.price,
                                targetToken: {
                                    name: tx.targetToken?.name,
                                    symbol: tx.targetToken?.symbol,
                                    image: tx.targetToken?.image,
                                    type: tx.targetToken?.type,
                                    price: tx.targetToken?.price,
                                    chainId: tx.targetToken?.chainId,
                                },
                                amount: displayAmount,
                                rawAmount: tx.change?.amount,
                                amountInUSD: tx.change?.amountInUSD,
                                from: tx.change?.from,
                                to: tx.change?.to,
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
                        const { transactionId } = payload;
                        if (!transactionId) {
                            throw new Error('Transaction ID required');
                        }
                        console.log('[Particle Wallet Handler] Fetching transaction details:', transactionId);
                        const txDetails = await universalAccount.getTransaction(transactionId);
                        console.log('[Particle Wallet Handler] Transaction details:', txDetails);
                        const operations = [
                            ...(txDetails?.lendingUserOperations || []),
                            ...(txDetails?.depositUserOperations || []),
                            ...(txDetails?.userOperations || []),
                        ];
                        const operation = operations.find((op) => op?.txHash);
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
                    case 'particle-wallet.send': {
                        if (!smartAccountInfo?.smartAccountAddress) {
                            throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
                        }
                        const { to, amount, tokenAddress, chainId: targetChainId, decimals = 18 } = payload;
                        const isSolanaTransfer = targetChainId === 101;
                        console.log('[Particle Wallet Handler] Transfer request:', {
                            to,
                            amount,
                            tokenAddress,
                            targetChainId,
                            decimals,
                            isSolanaTransfer,
                        });
                        if (isSolanaTransfer && !smartAccountInfo?.solanaSmartAccountAddress) {
                            console.warn('[Particle Wallet Handler] Solana smart account not available');
                        }
                        const transferPayload = {
                            token: {
                                chainId: targetChainId || 8453,
                                address: tokenAddress || '0x0000000000000000000000000000000000000000',
                            },
                            amount: amount,
                            receiver: to,
                        };
                        console.log('[Particle Wallet Handler] Creating transfer transaction:', transferPayload);
                        console.log('[Particle Wallet Handler] Connected EOA:', connectedEoaAddress);
                        console.log('[Particle Wallet Handler] Smart Account (EVM):', smartAccountInfo?.smartAccountAddress);
                        console.log('[Particle Wallet Handler] Smart Account (Solana):', smartAccountInfo?.solanaSmartAccountAddress);
                        const transaction = await universalAccount.createTransferTransaction(transferPayload);
                        console.log('[Particle Wallet Handler] Transaction created:', transaction);
                        console.log('[Particle Wallet Handler] Transaction userOps:', transaction.userOps?.length);
                        const userOps = transaction.userOps || [];
                        if (userOps.length === 0) {
                            throw new Error('No user operations in transaction');
                        }
                        const unsignedData = createMultiChainUnsignedData(userOps);
                        console.log('[Particle Wallet Handler] Unsigned data to sign:', unsignedData);
                        const provider = await connector?.getProvider();
                        if (!provider) {
                            throw new Error('No wallet provider available');
                        }
                        const dataToSign = typeof unsignedData === 'string' ? unsignedData : unsignedData.merkleRoot || unsignedData.hash;
                        console.log('[Particle Wallet Handler] Signing data:', dataToSign, 'with address:', connectedEoaAddress);
                        const signature = await provider.request({
                            method: 'personal_sign',
                            params: [dataToSign, connectedEoaAddress],
                        });
                        console.log('[Particle Wallet Handler] Signature obtained:', signature?.substring(0, 20) + '...');
                        injectMultiChainSignature(transaction, signature);
                        console.log('[Particle Wallet Handler] Signature injected into transaction');
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
                    case 'particle-wallet.estimate-fee': {
                        if (!smartAccountInfo?.smartAccountAddress) {
                            throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
                        }
                        const { to, amount, tokenAddress, chainId: targetChainId } = payload;
                        const isSolanaTransfer = targetChainId === 101;
                        const transferPayload = {
                            token: {
                                chainId: targetChainId || 8453,
                                address: tokenAddress || '0x0000000000000000000000000000000000000000',
                            },
                            amount: amount,
                            receiver: to,
                        };
                        console.log('[Particle Wallet Handler] Estimating fee for:', {
                            ...transferPayload,
                            isSolanaTransfer,
                        });
                        const transaction = await universalAccount.createTransferTransaction(transferPayload);
                        console.log('[Particle Wallet Handler] Transaction created for fee estimate:', transaction);
                        const fees = transaction.tokenChanges?.totalFeeInUSD || '0';
                        const freeGasFee = transaction.transactionFees?.freeGasFee || false;
                        const freeServiceFee = transaction.transactionFees?.freeServiceFee || false;
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
                                    solanaRent,
                                    solanaRentUSD,
                                    isSolanaTransfer,
                                },
                            },
                        }, '*');
                        break;
                    }
                    case 'particle-wallet.estimate-swap': {
                        if (!smartAccountInfo?.smartAccountAddress) {
                            throw new Error('Smart Account not yet initialized. Please wait for wallet to fully connect.');
                        }
                        const { fromToken: estFromToken, toToken: estToToken, fromAmount: estFromAmount, toChainId: estToChainId } = payload;
                        console.log('[Particle Wallet Handler] Estimating swap:', { estFromToken, estToToken, estFromAmount, estToChainId });
                        const estTokenTypeMap = {
                            'USDC': SUPPORTED_TOKEN_TYPE.USDC,
                            'USDT': SUPPORTED_TOKEN_TYPE.USDT,
                            'ETH': SUPPORTED_TOKEN_TYPE.ETH,
                            'BTC': SUPPORTED_TOKEN_TYPE.BTC,
                            'SOL': SUPPORTED_TOKEN_TYPE.SOL,
                            'BNB': SUPPORTED_TOKEN_TYPE.BNB,
                        };
                        const estTokenDecimals = {
                            'USDC': 6, 'USDT': 6, 'ETH': 18, 'BTC': 8, 'SOL': 9, 'BNB': 18,
                        };
                        const estToTokenType = estTokenTypeMap[estToToken?.toUpperCase()];
                        if (!estToTokenType) {
                            throw new Error(`Unsupported target token: ${estToToken}`);
                        }
                        const estAssets = await universalAccount.getPrimaryAssets();
                        const estFromAsset = estAssets.assets.find((a) => a.tokenType?.toUpperCase() === estFromToken?.toUpperCase());
                        const estToAsset = estAssets.assets.find((a) => a.tokenType?.toUpperCase() === estToToken?.toUpperCase());
                        const estFromPrice = estFromAsset?.price || 1;
                        const estToPrice = estToAsset?.price || 1;
                        if (estToPrice <= 0) {
                            throw new Error(`Price not available for ${estToToken}`);
                        }
                        const estFromAmountFloat = parseFloat(estFromAmount);
                        const estFromAmountUSD = estFromAmountFloat * estFromPrice;
                        const estExpectedOutput = estFromAmountUSD / estToPrice;
                        const estToTokenDecimals = estTokenDecimals[estToToken?.toUpperCase()] || 18;
                        const estExpectedOutputString = estExpectedOutput.toFixed(estToTokenDecimals);
                        const estTransaction = await universalAccount.createConvertTransaction({
                            expectToken: {
                                type: estToTokenType,
                                amount: estExpectedOutputString,
                            },
                            chainId: estToChainId || 8453,
                        });
                        console.log('[Particle Wallet Handler] Estimation transaction created:', estTransaction);
                        let actualReceiveAmount = estExpectedOutputString;
                        if (estTransaction.lendingTokens && estTransaction.lendingTokens.length > 0) {
                            const lendingToken = estTransaction.lendingTokens[0];
                            const rawAmount = lendingToken.amount || '0';
                            actualReceiveAmount = (Number(BigInt(rawAmount)) / 1e18).toFixed(estToTokenDecimals);
                            console.log('[Particle Wallet Handler] Actual receive amount from lendingTokens:', actualReceiveAmount);
                        }
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
                        const tokenTypeMap = {
                            'USDC': SUPPORTED_TOKEN_TYPE.USDC,
                            'USDT': SUPPORTED_TOKEN_TYPE.USDT,
                            'ETH': SUPPORTED_TOKEN_TYPE.ETH,
                            'BTC': SUPPORTED_TOKEN_TYPE.BTC,
                            'SOL': SUPPORTED_TOKEN_TYPE.SOL,
                            'BNB': SUPPORTED_TOKEN_TYPE.BNB,
                        };
                        const tokenDecimals = {
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
                        console.log('[Particle Wallet Handler] Fetching prices for swap calculation...');
                        const assets = await universalAccount.getPrimaryAssets();
                        const fromAsset = assets.assets.find((a) => a.tokenType?.toUpperCase() === fromToken?.toUpperCase());
                        const toAsset = assets.assets.find((a) => a.tokenType?.toUpperCase() === toToken?.toUpperCase());
                        const fromPrice = fromAsset?.price || 1;
                        const toPrice = toAsset?.price || 1;
                        if (!toPrice || toPrice <= 0) {
                            throw new Error(`Price data not available for ${toToken}`);
                        }
                        const fromAmountFloat = parseFloat(fromAmount);
                        const fromAmountUSD = fromAmountFloat * fromPrice;
                        const expectedOutput = fromAmountUSD / toPrice;
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
                        const swapTransaction = await universalAccount.createConvertTransaction({
                            expectToken: {
                                type: toTokenType,
                                amount: expectedOutputString,
                            },
                            chainId: toChainId || 8453,
                        });
                        console.log('[Particle Wallet Handler] Convert transaction created:', swapTransaction);
                        const swapUserOps = swapTransaction.userOps || [];
                        if (swapUserOps.length === 0) {
                            throw new Error('No user operations in swap transaction');
                        }
                        const swapUnsignedData = createMultiChainUnsignedData(swapUserOps);
                        console.log('[Particle Wallet Handler] Swap unsigned data:', swapUnsignedData);
                        const swapProvider = await connector?.getProvider();
                        if (!swapProvider) {
                            throw new Error('No wallet provider available');
                        }
                        const swapDataToSign = typeof swapUnsignedData === 'string'
                            ? swapUnsignedData
                            : swapUnsignedData.merkleRoot || swapUnsignedData.hash;
                        console.log('[Particle Wallet Handler] Signing swap with address:', connectedEoaAddress);
                        const swapSignature = await swapProvider.request({
                            method: 'personal_sign',
                            params: [swapDataToSign, connectedEoaAddress],
                        });
                        console.log('[Particle Wallet Handler] Swap signature obtained');
                        injectMultiChainSignature(swapTransaction, swapSignature);
                        const swapResult = await universalAccount.sendTransaction(swapTransaction, swapSignature);
                        console.log('[Particle Wallet Handler] Swap sent:', swapResult);
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
            }
            catch (error) {
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
    React.useEffect(() => {
        if (!active || !smartAccountInfo?.smartAccountAddress)
            return;
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
    const account = smartAccountInfo?.smartAccountAddress || eoaAddress;
    return (<ParticleNetworkContext.Provider value={{
            ...(isAddress(eoaAddress) && {
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
        }}>
      {children}
    </ParticleNetworkContext.Provider>);
});
ParticleNetworkProvider.displayName = 'ParticleNetworkProviderInner';
export default ParticleNetworkProvider;
//# sourceMappingURL=ParticleNetworkContext.js.map