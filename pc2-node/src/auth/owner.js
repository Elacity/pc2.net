export function verifyOwner(walletAddress, config) {
    if (!walletAddress || typeof walletAddress !== 'string') {
        return {
            isAuthorized: false,
            isOwner: false,
            isTethered: false,
            reason: 'Invalid wallet address'
        };
    }
    const normalizedWallet = walletAddress.toLowerCase();
    if (!config.owner.wallet_address) {
        return {
            isAuthorized: true,
            isOwner: true,
            isTethered: false,
            reason: 'No owner set - first wallet will become owner'
        };
    }
    const normalizedOwner = config.owner.wallet_address.toLowerCase();
    if (normalizedWallet === normalizedOwner) {
        return {
            isAuthorized: true,
            isOwner: true,
            isTethered: false
        };
    }
    const tetheredWallets = config.owner.tethered_wallets || [];
    const isTethered = tetheredWallets.some(tethered => tethered.toLowerCase() === normalizedWallet);
    if (isTethered) {
        return {
            isAuthorized: true,
            isOwner: false,
            isTethered: true
        };
    }
    return {
        isAuthorized: false,
        isOwner: false,
        isTethered: false,
        reason: 'Wallet is not the owner or an authorized tethered wallet'
    };
}
export function setOwner(walletAddress, config) {
    if (!walletAddress || typeof walletAddress !== 'string') {
        return {
            success: false,
            error: 'Invalid wallet address'
        };
    }
    if (config.owner.wallet_address) {
        return {
            success: false,
            error: 'Owner is already set. Cannot change owner.'
        };
    }
    return {
        success: true
    };
}
export function addTetheredWallet(walletAddress, config, requesterWallet) {
    const ownerCheck = verifyOwner(requesterWallet, config);
    if (!ownerCheck.isOwner) {
        return {
            success: false,
            error: 'Only the owner can add tethered wallets'
        };
    }
    if (!walletAddress || typeof walletAddress !== 'string') {
        return {
            success: false,
            error: 'Invalid wallet address'
        };
    }
    const normalizedWallet = walletAddress.toLowerCase();
    const normalizedOwner = config.owner.wallet_address?.toLowerCase();
    if (normalizedWallet === normalizedOwner) {
        return {
            success: false,
            error: 'Cannot add owner as tethered wallet'
        };
    }
    const tetheredWallets = config.owner.tethered_wallets || [];
    if (tetheredWallets.some(w => w.toLowerCase() === normalizedWallet)) {
        return {
            success: false,
            error: 'Wallet is already in tethered wallets list'
        };
    }
    return {
        success: true
    };
}
export function removeTetheredWallet(walletAddress, config, requesterWallet) {
    const ownerCheck = verifyOwner(requesterWallet, config);
    if (!ownerCheck.isOwner) {
        return {
            success: false,
            error: 'Only the owner can remove tethered wallets'
        };
    }
    const normalizedWallet = walletAddress.toLowerCase();
    const tetheredWallets = config.owner.tethered_wallets || [];
    if (!tetheredWallets.some(w => w.toLowerCase() === normalizedWallet)) {
        return {
            success: false,
            error: 'Wallet is not in tethered wallets list'
        };
    }
    return {
        success: true
    };
}
//# sourceMappingURL=owner.js.map