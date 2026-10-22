/**
 * Outbound TLS trust: distrusted-root filter and supernode name mapping.
 *
 * Imports the built module so `node --test` (CI, Node 20) can run it.
 * `npm run build:backend` must have produced dist/ first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { rootCertificates } from 'node:tls';

const {
    DISTRUSTED_ROOT_SPKI_SHA256,
    TRUSTED_ROOT_CERTIFICATES,
    SUPERNODE_TLS_SERVERNAME,
    spkiSha256,
    supernodeServername,
    installOutboundTlsPolicy,
} = await import('../../dist/utils/tlsTrust.js');

// Node 24.22.1+ no longer bundles emSign ECC G3; Node 20/22 still do.
const EMSIGN_ECC_G3 = '8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782';

test('emSign ECC Root CA - G3 is never trusted', () => {
    assert.ok(DISTRUSTED_ROOT_SPKI_SHA256.has(EMSIGN_ECC_G3));
    assert.ok(!TRUSTED_ROOT_CERTIFICATES.some((pem) => spkiSha256(pem) === EMSIGN_ECC_G3));
});

test('exactly the bundled distrusted roots are removed', () => {
    const expected = rootCertificates.filter((pem) => !DISTRUSTED_ROOT_SPKI_SHA256.has(spkiSha256(pem)));
    assert.deepEqual(TRUSTED_ROOT_CERTIFICATES, expected);
    assert.ok(rootCertificates.length - TRUSTED_ROOT_CERTIFICATES.length <= DISTRUSTED_ROOT_SPKI_SHA256.size);
});

test('supernode IPs verify against the ela.city name; other hosts are unchanged', () => {
    assert.equal(supernodeServername('69.164.241.210'), SUPERNODE_TLS_SERVERNAME);
    assert.equal(supernodeServername('38.242.211.112'), SUPERNODE_TLS_SERVERNAME);
    assert.equal(supernodeServername('1.2.3.4'), undefined);
    assert.equal(supernodeServername('api.openai.com'), undefined);
    assert.match(SUPERNODE_TLS_SERVERNAME, /\.ela\.city$/);
});

test('installOutboundTlsPolicy sets the default https trust store', () => {
    installOutboundTlsPolicy();
    assert.equal(https.globalAgent.options.ca, TRUSTED_ROOT_CERTIFICATES);
});

test('installOutboundTlsPolicy removes a leftover TLS-off setting', () => {
    const env = 'NODE_TLS_REJECT_UNAUTHORIZED';
    const original = process.env[env];
    try {
        process.env[env] = '0';
        assert.equal(installOutboundTlsPolicy(), true);
        assert.equal(process.env[env], undefined);

        process.env[env] = '1';
        assert.equal(installOutboundTlsPolicy(), false);
        assert.equal(process.env[env], '1');
    } finally {
        if (original === undefined) {
            delete process.env[env];
        } else {
            process.env[env] = original;
        }
    }
});
