/**
 * Web gateway peer requests: JSON over http/https without response decompression.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';

const { peerRequest, peerServername, ELACITY_SUPERNODE_SERVERNAME } =
    await import('../../../deploy/web-gateway/lib/peer-request.js');

let server;
let base;

before(async () => {
    server = http.createServer((req, res) => {
        if (req.url === '/br') {
            res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'br' });
            res.end(zlib.brotliCompressSync(JSON.stringify({ ok: true })));
            return;
        }
        if (req.url === '/slow') {
            return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            res.writeHead(req.url === '/missing' ? 404 : 200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                method: req.method,
                acceptEncoding: req.headers['accept-encoding'],
                body: body ? JSON.parse(body) : null,
            }));
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
    server.closeAllConnections();
    server.close();
});

test('GET returns parsed JSON and asks for an uncompressed body', async () => {
    const res = await peerRequest(`${base}/dht/get?key=x`);
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), { method: 'GET', acceptEncoding: 'identity', body: null });
});

test('POST sends the body as JSON', async () => {
    const res = await peerRequest(`${base}/dht/put`, { method: 'POST', body: { key: 'k', value: 1 } });
    assert.deepEqual(res.json().body, { key: 'k', value: 1 });
});

test('non-2xx responses resolve with ok=false', async () => {
    const res = await peerRequest(`${base}/missing`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
});

test('Brotli-encoded responses are refused, not decoded', async () => {
    await assert.rejects(peerRequest(`${base}/br`), /Refused br-encoded response/);
});

test('requests time out', async () => {
    await assert.rejects(peerRequest(`${base}/slow`, { timeoutMs: 200 }), /timed out/);
});

test('Elacity supernode IPs verify against the ela.city name; others are unchanged', () => {
    assert.equal(peerServername('69.164.241.210'), ELACITY_SUPERNODE_SERVERNAME);
    assert.equal(peerServername('38.242.211.112'), ELACITY_SUPERNODE_SERVERNAME);
    assert.equal(peerServername('155.138.245.211'), undefined);
    assert.equal(peerServername('example.com'), undefined);
});
