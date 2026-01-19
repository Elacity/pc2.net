"use strict";
/**
 * Polyfills for Node.js compatibility
 *
 * These polyfills ensure compatibility with older Node.js versions
 *
 * IMPORTANT: This file must be imported BEFORE any modules that use
 * the polyfilled features (e.g., ipfs-core)
 */
// Only add polyfill if it doesn't exist (Node.js < 22)
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function () {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve: resolve, reject: reject };
    };
    // Log that polyfill was applied (only in development)
    if (process.env.NODE_ENV !== 'production') {
        console.log('🔧 Applied Promise.withResolvers polyfill for Node.js 20 compatibility');
    }
}
//# sourceMappingURL=polyfill.js.map