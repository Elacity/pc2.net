/**
 * Proof for the Boson recovery-phrase routes.
 *
 * The phrase is encrypted with sha256(signature) over
 * getMnemonicSignMessage(walletAddress). A caller must present a
 * signature that actually recovers to walletAddress for that message,
 * otherwise any string would become the encryption key. Decrypt also
 * requires walletAddress to be the wallet that locked the phrase.
 */

import { isAddress } from 'viem';
import { verifySiweSignature } from './siwe-verify.js';
import { getMnemonicSignMessage } from '../../utils/encryption.js';

export interface PhraseProofInput {
    walletAddress: unknown;
    signature: unknown;
    lockedBy?: string | null;
}

export type PhraseProofResult =
    | { ok: true; walletAddress: string }
    | { ok: false; status: 400 | 403; error: string };

export async function verifyPhraseProof (input: PhraseProofInput): Promise<PhraseProofResult> {
    const { walletAddress, signature, lockedBy } = input;

    if ( typeof walletAddress !== 'string' || ! isAddress(walletAddress) ) {
        return { ok: false, status: 400, error: 'A valid EVM wallet address is required' };
    }
    if ( typeof signature !== 'string' || signature.length === 0 ) {
        return { ok: false, status: 400, error: 'Signature is required' };
    }
    if ( lockedBy !== undefined && ( ! lockedBy || lockedBy.toLowerCase() !== walletAddress.toLowerCase() ) ) {
        return { ok: false, status: 403, error: 'This wallet did not lock the recovery phrase' };
    }

    const result = await verifySiweSignature({
        message: getMnemonicSignMessage(walletAddress),
        signature,
        expectedAddress: walletAddress,
        addressType: 'evm',
    });
    if ( ! result.valid ) {
        return { ok: false, status: 403, error: 'Signature does not match the wallet' };
    }
    return { ok: true, walletAddress: walletAddress.toLowerCase() };
}
