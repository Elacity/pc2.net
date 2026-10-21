/**
 * Brotli responses never reach Node's decoder through fetch.
 *
 * Imports the built modules so `node --test` (CI, Node 20) can run it.
 * `npm run build:backend` must have produced dist/ first.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { Agent } from 'undici';

const { refuseBrotli, stripBrotli, isBrotliEncoded } = await import('../../dist/utils/refuseBrotli.js');
const { installOutboundTlsPolicy } = await import('../../dist/utils/tlsTrust.js');

const BODY = JSON.stringify({ ok: true });

const server = http.createServer((req, res) => {
    if (req.url === '/br') {
        res.writeHead(200, { 'content-encoding': 'br' });
        res.end(zlib.brotliCompressSync(BODY));
        return;
    }
    if (req.url === '/gzip') {
        res.writeHead(200, { 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync(BODY));
        return;
    }
    if (req.url === '/accept-encoding') {
        res.end(String(req.headers['accept-encoding']));
        return;
    }
    res.end(BODY);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const dispatcher = new Agent().compose(refuseBrotli);

after(() => {
    server.close();
    return dispatcher.close();
});

test('stripBrotli removes br and keeps the other codings', () => {
    assert.equal(stripBrotli('br, gzip, deflate'), 'gzip, deflate');
    assert.equal(stripBrotli('gzip;q=1.0, br;q=0.9'), 'gzip;q=1.0');
    assert.equal(stripBrotli('br'), 'identity');
    assert.equal(stripBrotli('gzip'), 'gzip');
});

test('isBrotliEncoded detects br in single, listed and repeated headers', () => {
    assert.equal(isBrotliEncoded('br'), true);
    assert.equal(isBrotliEncoded('gzip, br'), true);
    assert.equal(isBrotliEncoded(['gzip', 'BR']), true);
    assert.equal(isBrotliEncoded('gzip'), false);
    assert.equal(isBrotliEncoded('brotli'), false);
    assert.equal(isBrotliEncoded(undefined), false);
});

test('plain and gzip responses are unchanged', async () => {
    assert.equal(await (await fetch(`${base}/plain`, { dispatcher })).text(), BODY);
    assert.equal(await (await fetch(`${base}/gzip`, { dispatcher })).text(), BODY);
});

test('a Brotli-encoded response is refused', async () => {
    await assert.rejects(fetch(`${base}/br`, { dispatcher }), (err) => /Brotli/.test(err.cause?.message ?? ''));
});

test('br is not advertised even when the caller asks for it', async () => {
    const res = await fetch(`${base}/accept-encoding`, { dispatcher, headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(await res.text(), 'gzip');
});

test('the installed global dispatcher refuses Brotli too', async () => {
    installOutboundTlsPolicy();
    assert.equal(await (await fetch(`${base}/plain`)).text(), BODY);
    await assert.rejects(fetch(`${base}/br`), (err) => /Brotli/.test(err.cause?.message ?? ''));
});
