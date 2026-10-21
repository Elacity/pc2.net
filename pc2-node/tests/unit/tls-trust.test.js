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
    TRUSTED_ROOT_CERTIFICATES,
    SUPERNODE_TLS_SERVERNAME,
    spkiSha256,
    supernodeServername,
    installOutboundTlsPolicy,
} = await import('../../dist/utils/tlsTrust.js');

const EMSIGN_ECC_G3 = '8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782';

test('emSign ECC Root CA - G3 is removed from the trusted roots', () => {
    assert.ok(rootCertificates.some((pem) => spkiSha256(pem) === EMSIGN_ECC_G3), 'fixture: Node still bundles it');
    assert.ok(!TRUSTED_ROOT_CERTIFICATES.some((pem) => spkiSha256(pem) === EMSIGN_ECC_G3));
});

test('only distrusted roots are removed', () => {
    const removed = rootCertificates.length - TRUSTED_ROOT_CERTIFICATES.length;
    assert.ok(removed >= 1 && removed <= 3, `removed ${removed}`);
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
