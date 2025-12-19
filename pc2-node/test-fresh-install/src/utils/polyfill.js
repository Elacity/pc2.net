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
    if (process.env.NODE_ENV !== 'production') {
        console.log('🔧 Applied Promise.withResolvers polyfill for Node.js 20 compatibility');
    }
}
export {};
//# sourceMappingURL=polyfill.js.map