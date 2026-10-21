/**
 * Outbound TLS trust for pc2-node.
 *
 * Node bundles its own root store and has not yet dropped the roots
 * distrusted after the eMudhra intermediate compromise (2026-10-20), so we
 * filter them out ourselves by SPKI hash.
 *
 * Elacity supernodes are addressed by IP but serve the Let's Encrypt
 * `*.ela.city` certificate; connections to them verify against an ela.city
 * name instead of the IP. The Host header is unchanged, so nginx routing is
 * the same as before.
 */

import https from 'https';
import { createHash, X509Certificate } from 'crypto';
import { rootCertificates } from 'tls';
import { Agent, buildConnector, setGlobalDispatcher } from 'undici';

const DISTRUSTED_ROOT_SPKI_SHA256: ReadonlySet<string> = new Set([
    '8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782', // emSign ECC Root CA - G3
    'c619e4780ed8e0abeda24ad732567de4383a7ea941338f6d1a7d1b49ac792fe9', // emSign Root TLS CA - G3
    'bd153ed7b0434f6886b17bce8bbe84ed340c7132d702a8f4fa318f756ecbd6f3', // Comodo AAA Certificate Services
]);

export const SUPERNODE_IPS: ReadonlySet<string> = new Set(['69.164.241.210', '38.242.211.112']);
export const SUPERNODE_TLS_SERVERNAME = 'supernode.ela.city';

/** SHA-256 (hex) of a PEM certificate's SubjectPublicKeyInfo. */
export function spkiSha256(pem: string): string {
    const spki = new X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' });
    return createHash('sha256').update(spki).digest('hex');
}

export const TRUSTED_ROOT_CERTIFICATES: string[] = rootCertificates.filter(
    (pem) => !DISTRUSTED_ROOT_SPKI_SHA256.has(spkiSha256(pem)),
);

/** TLS name to verify for a host: the ela.city name for supernode IPs, otherwise undefined (use the host). */
export function supernodeServername(host: string): string | undefined {
    return SUPERNODE_IPS.has(host) ? SUPERNODE_TLS_SERVERNAME : undefined;
}

/** Apply the trust policy to every global `fetch` and default-agent `https` request. Call once at boot. */
export function installOutboundTlsPolicy(): void {
    https.globalAgent.options.ca = TRUSTED_ROOT_CERTIFICATES;
    const connect = buildConnector({ ca: TRUSTED_ROOT_CERTIFICATES });
    setGlobalDispatcher(new Agent({
        connect: (opts, callback) => connect(
            { ...opts, servername: supernodeServername(opts.hostname) ?? opts.servername },
            callback,
        ),
    }));
}
