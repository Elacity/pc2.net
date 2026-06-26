/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * withChainLock — per-chainId Promise-chain mutex.
 *
 * Why we need it (Rev 6 audit, agent 6):
 *   PC2 has zero concurrency primitives in production use. Multiple actors can
 *   try to act on the same chain simultaneously: HealthChecker tick wants to
 *   restart on F1, operator clicks Restart, operator clicks Stop while F1 is
 *   in flight. Without locking we get double-starts, ping-pong, leaked PIDs.
 *
 * Design (per Rev 6 recommendation): one lock per chainId, FIFO. No deps.
 * Each call to withChainLock waits for the previous lock to release before
 * running the operation, then releases when the operation's promise settles.
 *
 * No deadlock risk: there is no nested-lock pattern in the codebase.
 * No starvation: FIFO, no priority.
 */

'use strict';

/** @type {Map<string, Promise<void>>} */
const locks = new Map();

/**
 * Run an async operation while holding the lock for `chainId`. Other callers
 * with the same chainId queue behind us; callers for other chains run in
 * parallel.
 *
 * @template T
 * @param {string} chainId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withChainLock(chainId, fn) {
    if (typeof chainId !== 'string' || chainId.length === 0) {
        throw new TypeError('withChainLock: chainId must be a non-empty string');
    }
    if (typeof fn !== 'function') {
        throw new TypeError('withChainLock: fn must be a function');
    }

    const previous = locks.get(chainId) || Promise.resolve();

    // Build the new lock-tail. Resolve is captured by reference so the finally
    // below can release the next caller in the chain.
    let releaseLock;
    const myTail = new Promise((resolve) => {
        releaseLock = resolve;
    });
    locks.set(chainId, myTail);

    try {
        await previous; // wait for the head of the queue to release
        return await fn();
    } finally {
        // Release first — successors run as soon as the microtask queue drains.
        releaseLock();
        // Garbage-collect entries that no longer have queued waiters.
        if (locks.get(chainId) === myTail) {
            locks.delete(chainId);
        }
    }
}

/**
 * Test-only: clear all locks. Used by vitest cleanup hooks.
 */
function _resetForTests() {
    locks.clear();
}

module.exports = {
    withChainLock,
    _resetForTests,
};
