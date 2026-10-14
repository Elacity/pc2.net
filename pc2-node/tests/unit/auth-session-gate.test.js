/**
 * Login and first-claim wallet proof.
 *
 * Imports the built module so `node --test` (CI, Node 20) can run it.
 * `npm run build:backend` must have produced dist/ first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const proof = await import('../../dist/api/auth/wallet-proof.js');

test('public host is used only for a private peer', () => {
    assert.equal(proof.resolveChallengeHost({
        remoteAddress: '10.100.0.1',
        requestHost: '10.100.0.4:4200',
        clientHost: 'zzz.ela.city',
    }), 'zzz.ela.city');

    assert.equal(proof.resolveChallengeHost({
        remoteAddress: '::ffff:10.100.0.1',
        requestHost: '10.100.0.4:4200',
        clientHost: 'zzz.ela.city',
    }), 'zzz.ela.city');

    assert.equal(proof.resolveChallengeHost({
        remoteAddress: '8.8.8.8',
        requestHost: '10.100.0.4:4200',
        clientHost: 'zzz.ela.city',
    }), '10.100.0.4:4200');

    assert.equal(proof.resolveChallengeHost({
        remoteAddress: '127.0.0.1',
        requestHost: 'localhost:4200',
        clientHost: 'not a host',
    }), 'localhost:4200');
});

test('a missing siweRequired flag is enforced', () => {
    const previous = process.env.PC2_ALLOW_UNSIGNED_AUTH;
    delete process.env.PC2_ALLOW_UNSIGNED_AUTH;
    assert.equal(proof.isSiweRequired(undefined), true);
    assert.equal(proof.isSiweRequired({ security: {} }), true);
    assert.equal(proof.isSiweRequired({ security: { siweRequired: true } }), true);
    assert.equal(proof.isSiweRequired({ security: { siweRequired: false } }), false);
    if ( previous === undefined ) delete process.env.PC2_ALLOW_UNSIGNED_AUTH;
    else process.env.PC2_ALLOW_UNSIGNED_AUTH = previous;
});

test('unsigned auth refuses a public bind and production', () => {
    assert.equal(proof.unsignedAuthBootError({ allowUnsigned: false, host: '0.0.0.0', nodeEnv: 'production' }), null);
    assert.match(proof.unsignedAuthBootError({ allowUnsigned: true, host: '0.0.0.0', nodeEnv: 'development' }), /all interfaces/);
    assert.match(proof.unsignedAuthBootError({ allowUnsigned: true, host: '127.0.0.1', nodeEnv: 'production' }), /production/);
    assert.equal(proof.unsignedAuthBootError({ allowUnsigned: true, host: '127.0.0.1', nodeEnv: 'development' }), null);
});

test('address-only proof is rejected and a signed challenge is accepted once', async () => {
    const { challengeStore } = await import('../../dist/api/auth/challenge-store.js');
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = challengeStore.issue(account.address, 'zzz.ela.city', {
        uri: 'https://zzz.ela.city',
        chainId: 20,
        statement: 'Sign in to your PC2 node.',
    });
    const signature = await account.signMessage({ message: challenge.message });

    const missing = await proof.verifyPresentedWalletProof({
        siweRequired: true,
        wallet: account.address,
    });
    assert.equal(missing.ok, false);
    if ( ! missing.ok ) assert.equal(missing.error, 'siwe_required');

    const accepted = await proof.verifyPresentedWalletProof({
        siweRequired: true,
        wallet: account.address,
        signature,
        nonce: challenge.nonce,
        message: challenge.message,
    });
    assert.equal(accepted.ok, true);

    const replay = await proof.verifyPresentedWalletProof({
        siweRequired: true,
        wallet: account.address,
        signature,
        nonce: challenge.nonce,
        message: challenge.message,
    });
    assert.equal(replay.ok, false);
    if ( ! replay.ok ) assert.equal(replay.error, 'invalid_nonce');
});
