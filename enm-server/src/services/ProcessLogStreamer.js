/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ProcessLogStreamer — bridge a chain's stdout/stderr to SSE topic
 * chains:<id>:logs. Shared across every chain class (Main chain, ESC,
 * EID, PG, Arbiter) — the implementation is process-output-agnostic.
 *
 * Per Rev 6/8 audits:
 *   - Each chain binary writes to BOTH stdout AND on-disk log files
 *     (ela uses io.MultiWriter at common/log/log.go; geth-derived
 *     chains have their own MultiWriter equivalents). We capture
 *     stdout/stderr directly from the child process — no demux
 *     needed because Node's child_process gives us already-separated pipes.
 *   - Per-line buffering: split on '\n', keep trailing partial in a buffer
 *     until the next chunk completes it.
 *   - 4 KB cap per line — anything longer gets truncated with `[...truncated]`
 *     suffix to bound bandwidth.
 *   - Batched flush every 100 ms or when the buffer reaches 50 lines, whichever
 *     hits first (Rev 6 audit, agent 11 — prevents thundering-herd on Socket.io
 *     equivalent; also reduces SSE frame count for log-heavy chains).
 *   - On chain stop, flush remaining buffer and emit completion.
 *
 * Note: re-attaching to a process started by a previous PC2 instance — we
 * lose access to the child's stdio (those pipes belonged to the dead parent).
 * For reattach mode, log streaming falls back to tailing the on-disk log files
 * inside the chain dir. That's a Phase 4+ enhancement; v0.1 logs go dark for
 * reattached chains until the operator restarts them.
 */

'use strict';

const { ENM_LOG_PREFIX } = require('./EnmConstants');

const FLUSH_INTERVAL_MS = 100;
const FLUSH_LINE_THRESHOLD = 50;
const QUEUE_HARD_CAP = 5000; // Prevents unbounded growth on log bursts (Phase 3 audit, agent 4).
const MAX_LINE_BYTES = 4096;
const TRUNCATE_SUFFIX = ' [...truncated]';

class ProcessLogStreamer {
    /**
     * @param {object} deps
     * @param {object} deps.processService NativeProcessService
     * @param {object} deps.sseHub
     * @param {object} deps.extensionHandle
     */
    constructor(deps) {
        if (!deps || !deps.processService || !deps.sseHub || !deps.extensionHandle) {
            throw new TypeError(
                'ProcessLogStreamer: { processService, sseHub, extensionHandle } required',
            );
        }
        this.processService = deps.processService;
        this.sseHub = deps.sseHub;
        this.extensionHandle = deps.extensionHandle;

        /** @type {Map<string, { stdoutBuf: string, stderrBuf: string, queue: Array<{stream:string,line:string,ts:number}>, flushTimer: NodeJS.Timeout|null }>} */
        this.state = new Map();

        // Subscribe to NativeProcessService events. State is created when a
        // chain starts (so a chain spawn is the only way state appears) and
        // deleted on exit. Post-exit chunks are dropped because state is gone
        // — Node permits stdout 'data' after 'exit', so this is real (Phase 3
        // audit, agent 4: would otherwise leak zombie queues).
        this.processService.on('started', ({ chainId }) => this._initState(chainId));
        this.processService.on('stdout', ({ chainId, chunk }) => this._ingest(chainId, 'stdout', chunk));
        this.processService.on('stderr', ({ chainId, chunk }) => this._ingest(chainId, 'stderr', chunk));
        this.processService.on('exit', ({ chainId }) => this._flush(chainId, true));
    }

    /**
     * @private
     * Idempotently create the per-chain rolling state.
     *
     * @param {string} chainId
     */
    _initState(chainId) {
        if (!this.state.has(chainId)) {
            this.state.set(chainId, {
                stdoutBuf: '',
                stderrBuf: '',
                queue: [],
                flushTimer: null,
            });
        }
    }

    /**
     * @private
     * Convert a chunk (Buffer or string) into per-line entries, queue them,
     * and arm a flush timer if not already armed.
     *
     * Tracking state is created on first ingest (a chain's first byte) and
     * deleted on chain exit. A late-arriving chunk after exit is dropped — Node
     * permits stdout/stderr 'data' to fire after 'exit', and re-creating state
     * for a dead chain would leak a zombie queue (Phase 3 audit, agent 4).
     */
    _ingest(chainId, streamName, chunk) {
        const s = this.state.get(chainId);
        if (!s) {
            // Late chunk after exit (or stream from a chain we never saw start).
            // Drop silently — see ctor comment.
            return;
        }
        const bufKey = streamName === 'stderr' ? 'stderrBuf' : 'stdoutBuf';
        s[bufKey] += chunk.toString('utf8');

        // Drain complete lines from the per-stream rolling buffer.
        const lines = s[bufKey].split('\n');
        s[bufKey] = lines.pop() || ''; // last element is the partial trailing line

        const ts = Date.now();
        for (const raw of lines) {
            const line = (raw.length > MAX_LINE_BYTES)
                ? raw.slice(0, MAX_LINE_BYTES) + TRUNCATE_SUFFIX
                : raw;
            s.queue.push({ stream: streamName, line, ts });
        }

        // Hard cap defence — flush eagerly when the queue grows past QUEUE_HARD_CAP
        // so we don't accumulate unbounded memory under a log burst.
        if (s.queue.length >= QUEUE_HARD_CAP) {
            this._flush(chainId, false);
            return;
        }
        // Hot path: flush if we hit the soft threshold.
        if (s.queue.length >= FLUSH_LINE_THRESHOLD) {
            this._flush(chainId, false);
            return;
        }
        // Cold path: arm a timer if not already armed.
        if (!s.flushTimer) {
            s.flushTimer = setTimeout(() => this._flush(chainId, false), FLUSH_INTERVAL_MS);
        }
    }

    /**
     * @private
     * Drain the queue and publish a single batched SSE event.
     *
     * @param {string} chainId
     * @param {boolean} final  true on chain exit — also clears the flush timer
     */
    _flush(chainId, final) {
        const s = this.state.get(chainId);
        if (!s) {
            return;
        }
        if (s.flushTimer) {
            clearTimeout(s.flushTimer);
            s.flushTimer = null;
        }
        if (s.queue.length === 0 && !final) {
            return;
        }
        const lines = s.queue;
        s.queue = [];

        if (lines.length > 0) {
            this.sseHub.publish(`chains:${chainId}:logs`, { chainId, lines });
        }

        if (final) {
            // Emit any half-line in the rolling buffers as a closing entry.
            const ts = Date.now();
            const tail = [];
            if (s.stdoutBuf.length > 0) {
                tail.push({ stream: 'stdout', line: s.stdoutBuf, ts });
                s.stdoutBuf = '';
            }
            if (s.stderrBuf.length > 0) {
                tail.push({ stream: 'stderr', line: s.stderrBuf, ts });
                s.stderrBuf = '';
            }
            if (tail.length > 0) {
                this.sseHub.publish(`chains:${chainId}:logs`, { chainId, lines: tail });
            }
            this.state.delete(chainId);
            this.extensionHandle.log.debug(`${ENM_LOG_PREFIX} log streamer drained ${chainId}`);
        }
    }

    /**
     * Force-flush every active chain. Used on extension shutdown so the
     * dashboard sees the last few lines before disconnect.
     */
    flushAll() {
        for (const chainId of Array.from(this.state.keys())) {
            this._flush(chainId, true);
        }
    }
}

module.exports = {
    ProcessLogStreamer,
    FLUSH_INTERVAL_MS,
    FLUSH_LINE_THRESHOLD,
    MAX_LINE_BYTES,
    // 0.5.110 audit Session 110 — added QUEUE_HARD_CAP to the exports
    // for symmetry with the other thresholds. Tests + introspection
    // tooling can now read the hard cap value without parsing the
    // source. Previously the constant was unexported despite serving
    // the same role (a tunable threshold) as the three already-exported
    // ones — pure consistency cleanup.
    QUEUE_HARD_CAP,
};
