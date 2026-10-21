/**
 * Undici interceptor that keeps Brotli responses away from Node's decoder.
 *
 * Node 20 and the launcher's Node 22.13.1 carry a Brotli decoder
 * out-of-bounds write (CVE-2026-111497) that any `br` response read through
 * `fetch` reaches. Requests stop advertising `br`, so well-behaved servers
 * reply with gzip or identity; a response that is Brotli-encoded anyway is
 * aborted before its body is decoded.
 */

import type { IncomingHttpHeaders } from 'http';
import { DecoratorHandler, type Dispatcher } from 'undici';

type Headers = Dispatcher.DispatchOptions['headers'];

// undici's typings omit the handler methods DecoratorHandler implements at runtime.
interface ForwardingHandler extends Dispatcher.DispatchHandler {
    onResponseStart(
        controller: Dispatcher.DispatchController,
        statusCode: number,
        headers: IncomingHttpHeaders,
        statusMessage?: string,
    ): void;
}
const ForwardingHandler = DecoratorHandler as unknown as new (handler: Dispatcher.DispatchHandler) => ForwardingHandler;

/** Remove `br` from an Accept-Encoding value. */
export function stripBrotli(value: string): string {
    const kept = value.split(',').map((part) => part.trim()).filter((part) => part && !/^br(\s*;|$)/i.test(part));
    return kept.length ? kept.join(', ') : 'identity';
}

/** True when a Content-Encoding value includes `br`. */
export function isBrotliEncoded(value: string | string[] | undefined): boolean {
    const joined = Array.isArray(value) ? value.join(',') : value ?? '';
    return joined.split(',').some((part) => part.trim().toLowerCase() === 'br');
}

function withoutBrotliAccepted(headers: Headers): Headers {
    if (Array.isArray(headers)) {
        return headers.map((value, i) =>
            i % 2 === 1 && String(headers[i - 1]).toLowerCase() === 'accept-encoding' ? stripBrotli(String(value)) : value,
        ) as Headers;
    }
    if (headers && typeof headers === 'object' && !(Symbol.iterator in headers)) {
        return Object.fromEntries(Object.entries(headers).map(([name, value]) =>
            [name, name.toLowerCase() === 'accept-encoding' && typeof value === 'string' ? stripBrotli(value) : value],
        )) as Headers;
    }
    return headers;
}

class RefuseBrotliHandler extends ForwardingHandler {
    onResponseStart(
        controller: Dispatcher.DispatchController,
        statusCode: number,
        headers: IncomingHttpHeaders,
        statusMessage?: string,
    ): void {
        if (isBrotliEncoded(headers['content-encoding'])) {
            controller.abort(new Error('Refused Brotli-encoded response'));
            return;
        }
        super.onResponseStart(controller, statusCode, headers, statusMessage);
    }
}

export const refuseBrotli: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (opts, handler) =>
    dispatch({ ...opts, headers: withoutBrotliAccepted(opts.headers) }, new RefuseBrotliHandler(handler));
