/**
 * Polyfills for Node.js compatibility
 * 
 * These polyfills ensure compatibility with older Node.js versions
 * 
 * IMPORTANT: This file must be imported BEFORE any modules that use
 * the polyfilled features (e.g., ipfs-core)
 */

// Polyfill for Promise.withResolvers() (Node.js 20 compatibility)
// Promise.withResolvers() was added in Node.js 22, but ipfs-core requires it
// This polyfill allows IPFS to work on Node.js 20+
// 
// Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers

// Extend PromiseConstructor interface for TypeScript
interface PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
  };
}

// Only add polyfill if it doesn't exist (Node.js < 22)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
  } {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
  
  // Log that polyfill was applied (only in development)
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔧 Applied Promise.withResolvers polyfill for Node.js 20 compatibility');
  }
}
