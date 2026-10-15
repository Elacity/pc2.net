/**
 * Setup reset guard and recovery-phrase proof.
 *
 * Imports the built modules so `node --test` (CI, Node 20) can run it.
 * `npm run build:backend` must have produced dist/ first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const { setupCompleteBlockReason } = await import('../../dist/api/setup/setup-guard.js');
const { verifyPhraseProof } = await import('../../dist/api/auth/phrase-proof.js');
const { getMnemonicSignMessage } = await import('../../dist/utils/encryption.js');

const fresh = { setupMarkerExists: false, ownerWallet: null, storedUsername: null, requestedUsername: 'alice' };

test('a fresh node may complete setup', () => {
    assert.equal(setupCompleteBlockReason(fresh), null);
});

test('an established node refuses setup', () => {
    assert.match(setupCompleteBlockReason({ ...fresh, setupMarkerExists: true }), /already complete/);
    assert.match(setupCompleteBlockReason({ ...fresh, ownerWallet: '0xabc' }), /owner/);
    assert.match(setupCompleteBlockReason({ ...fresh, storedUsername: 'bob' }), /username/);
});

test('a same-name retry before the marker is allowed', () => {
    assert.equal(setupCompleteBlockReason({ ...fresh, storedUsername: 'Alice ' }), null);
});

test('an owner blocks setup even with a matching username', () => {
    assert.match(setupCompleteBlockReason({ ...fresh, storedUsername: 'alice', ownerWallet: '0xabc' }), /owner/);
});

test('phrase proof rejects an arbitrary string', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const result = await verifyPhraseProof({ walletAddress: account.address, signature: 'attacker-chosen' });
    assert.equal(result.ok, false);
    if ( ! result.ok ) assert.equal(result.status, 403);
});

test('phrase proof rejects a signature from another wallet', async () => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const signature = await other.signMessage({ message: getMnemonicSignMessage(owner.address) });
    const result = await verifyPhraseProof({ walletAddress: owner.address, signature });
    assert.equal(result.ok, false);
});

test('phrase proof accepts the wallet signature for the phrase message', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: getMnemonicSignMessage(account.address) });
    const result = await verifyPhraseProof({ walletAddress: account.address, signature });
    assert.equal(result.ok, true);
});

test('decrypt proof requires the locking wallet', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: getMnemonicSignMessage(account.address) });

    const wrongLock = await verifyPhraseProof({ walletAddress: account.address, signature, lockedBy: '0x0000000000000000000000000000000000000001' });
    assert.equal(wrongLock.ok, false);
    if ( ! wrongLock.ok ) assert.equal(wrongLock.status, 403);

    const noLock = await verifyPhraseProof({ walletAddress: account.address, signature, lockedBy: null });
    assert.equal(noLock.ok, false);

    const rightLock = await verifyPhraseProof({ walletAddress: account.address, signature, lockedBy: account.address.toLowerCase() });
    assert.equal(rightLock.ok, true);
});

test('phrase proof rejects a non-EVM address', async () => {
    const result = await verifyPhraseProof({ walletAddress: 'not-an-address', signature: '0x00' });
    assert.equal(result.ok, false);
    if ( ! result.ok ) assert.equal(result.status, 400);
});
