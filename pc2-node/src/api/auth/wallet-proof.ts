/**
 * Wallet-control proof for login and first claim.
 *
 * A missing security.siweRequired is enforced. The only unsigned path is
 * PC2_ALLOW_UNSIGNED_AUTH=1, and that process refuses to boot on a public
 * bind or in production.
 */

import { challengeStore } from './challenge-store.js';
import { verifySiweSignature } from './siwe-verify.js';
import { normalizeAddress, detectAddressType } from '../../utils/wallet.js';

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

export function isSiweRequired (config: { security?: { siweRequired?: boolean } } | undefined): boolean {
    if ( process.env.PC2_ALLOW_UNSIGNED_AUTH === '1' ) return false;
    return config?.security?.siweRequired !== false;
}

/**
 * Unsigned auth is a local-dev switch. It must not run on a node that
 * accepts connections from other machines.
 */
export function unsignedAuthBootError (input: { allowUnsigned: boolean; host?: string; nodeEnv?: string }): string | null {
    if ( ! input.allowUnsigned ) return null;
    const host = (input.host || '').trim();
    const listensWidely = host === '' || host === '0.0.0.0' || host === '::';
    if ( listensWidely || input.nodeEnv === 'production' ) {
        return 'PC2_ALLOW_UNSIGNED_AUTH cannot be used when the server listens on all interfaces or NODE_ENV is production.';
    }
    return null;
}

export function isPrivatePeer (addr: string | undefined): boolean {
    if ( ! addr ) return false;
    const mapped = addr.trim().match(IPV4_MAPPED);
    const ip = (mapped ? mapped[1] : addr.trim()).toLowerCase();
    if ( ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd') ) return true;
    const parts = ip.split('.');
    if ( parts.length !== 4 ) return false;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if ( ! Number.isInteger(a) || ! Number.isInteger(b) ) return false;
    if ( a === 10 || a === 127 ) return true;
    if ( a === 192 && b === 168 ) return true;
    if ( a === 172 && b >= 16 && b <= 31 ) return true;
    if ( a === 169 && b === 254 ) return true;
    return false;
}

/** Hostname or host:port the wallet can display. No URL, no whitespace. */
export function isSafePublicHost (value: string | undefined): boolean {
    if ( ! value ) return false;
    const host = value.trim();
    if ( host.length === 0 || host.length > 253 ) return false;
    return /^[a-zA-Z0-9._:-]+$/.test(host);
}

/**
 * The gateway rewrites Host to the tunnel address. When that peer is
 * private, a browser-supplied public host (zzz.ela.city) is what the
 * wallet should show. A public peer cannot choose the name.
 */
export function resolveChallengeHost (input: {
    remoteAddress?: string;
    requestHost?: string;
    clientHost?: string;
}): string {
    const fallback = (input.requestHost || 'pc2-node.local').trim() || 'pc2-node.local';
    const clientHost = input.clientHost?.trim();
    if ( isPrivatePeer(input.remoteAddress) && isSafePublicHost(clientHost) ) {
        return clientHost as string;
    }
    return fallback;
}

export interface WalletProofInput {
    siweRequired: boolean;
    wallet: string;
    signature?: string;
    nonce?: string;
    message?: string;
}

export type WalletProofResult =
    | { ok: true }
    | { ok: false; error: string; message: string };

/**
 * Confirm the caller controls `wallet`. Consumes the challenge nonce.
 */
export async function verifyPresentedWalletProof (input: WalletProofInput): Promise<WalletProofResult> {
    if ( ! input.siweRequired ) return { ok: true };

    const { signature, nonce, message } = input;
    if ( ! signature || ! nonce || ! message ) {
        return { ok: false, error: 'siwe_required', message: 'A signed challenge is required. Fetch /auth/challenge first.' };
    }

    const wallet = normalizeAddress(input.wallet);
    const consumed = challengeStore.consume(nonce, wallet);
    if ( ! consumed.ok ) {
        return { ok: false, error: 'invalid_nonce', message: consumed.reason };
    }

    const addressType = detectAddressType(wallet) === 'solana' ? 'solana' : 'evm';
    const verifyResult = await verifySiweSignature({
        message,
        signature,
        expectedAddress: wallet,
        addressType,
    });
    if ( ! verifyResult.valid ) {
        return { ok: false, error: 'invalid_signature', message: verifyResult.reason };
    }
    return { ok: true };
}
