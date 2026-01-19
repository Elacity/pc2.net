/**
 * Polyfills for Node.js compatibility
 *
 * These polyfills ensure compatibility with older Node.js versions
 *
 * IMPORTANT: This file must be imported BEFORE any modules that use
 * the polyfilled features (e.g., ipfs-core)
 */
interface PromiseConstructor {
    withResolvers<T>(): {
        promise: Promise<T>;
        resolve: (value: T | PromiseLike<T>) => void;
        reject: (reason?: any) => void;
    };
}
//# sourceMappingURL=polyfill.d.ts.map