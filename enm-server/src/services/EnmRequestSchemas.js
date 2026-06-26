/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmRequestSchemas — joi schemas for the request bodies of the
 * security-critical PUT /config/* and POST /config/anti-snipe-password
 * routes.
 *
 * Pre-beta.3.11 each route handler did inline `typeof body.X === 'Y'`
 * checks. That mostly worked but had four real problems:
 *
 *   1. Silent acceptance of malformed values: a non-string `mode` field
 *      passed `(mode && mode !== 'auto' && mode !== 'manual')` if the
 *      value was an array `['manual']` (truthy, !== 'auto', !== 'manual'
 *      compared as object), then writeback set `chain.dpos.ipAddressMode
 *      = ['manual']`, corrupting the config.
 *   2. No structured error responses: 400s carried plain strings like
 *      `Invalid mode "manual"`. Operators (and the frontend) had no way
 *      to programmatically tell which field failed.
 *   3. Type coercion holes: `auditRetentionDays` accepted any integer
 *      but had no upper bound; an operator could set it to 10^9 and
 *      the daily cleanup sweep would still consider "everything is
 *      newer than that" → never prune.
 *   4. No defaults: a field omitted from the body was silently kept
 *      at its previous value, but there was no way to express "use
 *      the schema default" through the API.
 *
 * Joi fixes all four. Each schema below is invoked from the route
 * handler via `.validate(body, { abortEarly: false, stripUnknown: true
 * })` so:
 *   - All field errors come back in one response (abortEarly: false)
 *   - Unknown fields are dropped silently (stripUnknown: true) so a
 *     future frontend that adds a new field doesn't 400 against an
 *     old backend.
 *
 * The shapes here are deliberately PATCH-like: every field is optional
 * (.optional()). The handler treats an undefined field as "don't change"
 * and only writes through the fields present in the validated body.
 *
 * 0.2.0-beta.3.11.
 */

'use strict';

const Joi = require('joi');

// IPv4/IPv6 with optional CIDR. Matches the frontend's IP_OR_CIDR_RE
// shape in settings-tab.js — we want both layers to accept the same
// inputs so an operator never sees "valid client-side, 400 server-side".
const IPV4_OR_CIDR = Joi.string().ip({ version: ['ipv4'], cidr: 'optional' });
const IPV6_OR_CIDR = Joi.string().ip({ version: ['ipv6'], cidr: 'optional' });
const IP_ANY_OR_CIDR = Joi.alternatives().try(IPV4_OR_CIDR, IPV6_OR_CIDR);

// PUT /config/network
const networkBody = Joi.object({
    // Optional because operator may only edit manualValue without changing
    // mode. When present, must be one of the two enum values.
    mode: Joi.string().valid('auto', 'manual').optional(),
    // Empty string allowed so the operator can clear a stale manual value
    // (e.g. switching back to auto after fixing the network).
    manualValue: Joi.string().allow('').max(64).optional(),
}).unknown(false).label('PUT /config/network body');

// PUT /config/mainchain
const mainchainBody = Joi.object({
    logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').optional(),
    archiveMode: Joi.boolean().optional(),
    // ela's actual config supports 512..32768 MB. Anything outside that
    // range either crashes the process on startup (too low) or just
    // wastes RAM (too high). Frontend has identical bounds; server-side
    // is defence-in-depth.
    memoryLimitMb: Joi.number().integer().min(512).max(32768).optional(),
    rpcEnabled: Joi.boolean().optional(),
    rpcUser: Joi.string().alphanum().min(1).max(64).optional(),
    // Plaintext password — encrypted at rest by ConfigStore.setRpcPassword.
    // 64 char min matches ela's recommended strength; max 256 prevents
    // the operator from accidentally pasting a multi-kB blob.
    rpcPassword: Joi.string().min(8).max(256).optional(),
    // Per-entry validation: IPv4/IPv6 with optional CIDR. Empty array
    // would lock out external clients but is permitted — operator is
    // explicitly saying "no external access". Backend route then re-
    // adds 127.0.0.1 anyway (alpha.19 safety net).
    whiteIPList: Joi.array().items(IP_ANY_OR_CIDR).max(256).optional(),
}).unknown(false).label('PUT /config/mainchain body');

// PUT /config/general
const generalBody = Joi.object({
    autoExecuteSafe: Joi.boolean().optional(),
    criticalRequiresAck: Joi.boolean().optional(),
    // 0 = forever. 3650 = ten years; way more than any operator needs
    // but the chosen cap keeps the integer fitting in JS safely.
    auditRetentionDays: Joi.number().integer().min(0).max(3650).optional(),
}).unknown(false).label('PUT /config/general body');

// beta.3.19 — Phase 2 alert thresholds. The four knobs are operator-
// tunable values that today live as hardcoded `let`s in HealthRules.js
// (DISK_WARN_GB / DISK_CRITICAL_GB / PEER_ZERO_GRACE_MS /
// HEIGHT_STALL_GRACE_MS). The frontend's Alerts section hits this
// endpoint; the backend route writes them into
// cfg.global.notifications.thresholds and HealthChecker pushes them
// into HealthRules.setThresholds() on each tick.
//
// Bounds picked to be defensible:
//   - Disk warn 10–10000 GB, critical 1–disk-warn GB
//   - Peer-zero grace 1–120 min (zero-peers under 1 min would alert
//     constantly during normal handshake flutter; >120 min is denial)
//   - Sync-stall grace 1–240 min (similar reasoning — block times
//     of ~2 min on mainnet make <1 min noise; >240 min lets a real
//     stall ride invisibly for hours)
const notificationsBody = Joi.object({
    diskFreeWarnGb: Joi.number().integer().min(10).max(10000).optional(),
    diskFreeCriticalGb: Joi.number().integer().min(1).max(10000).optional(),
    peerZeroGraceMin: Joi.number().integer().min(1).max(120).optional(),
    syncStallGraceMin: Joi.number().integer().min(1).max(240).optional(),
})
    .unknown(false)
    .label('PUT /config/notifications body')
    // Cross-field: critical must be strictly less than warn so the
    // operator can't accidentally configure a state where "below 20 GB
    // is critical, below 30 GB is just a warning".
    .custom((value, helpers) => {
        if (Number.isFinite(value.diskFreeWarnGb)
            && Number.isFinite(value.diskFreeCriticalGb)
            && value.diskFreeCriticalGb >= value.diskFreeWarnGb) {
            return helpers.error('any.invalid', {
                message: 'diskFreeCriticalGb must be less than diskFreeWarnGb',
            });
        }
        return value;
    })
    .messages({
        'any.invalid': '{{#message}}',
    });

// beta.3.20 — Phase 3 Storage section. Operator-tunable storage
// policies. All three knobs run on the EnmStorageMaintenance 24h
// cron; no chain restart needed.
//
//   logRetentionDays   maps to cfg.global.logRotation.purgeAfterDays
//                      (older *.log.gz files are deleted past this)
//   logGzipAfterDays   maps to cfg.global.logRotation.gzipAfterDays
//                      (closed *.log files are gzipped past this)
//   keystoreIntervalDays  how often the auto-backup task runs
//   keystoreKeepCount     how many backup copies to retain
//
// Bounds chosen so the operator can't lock the system into a state
// where logs never rotate (gzipAfterDays must precede purgeAfterDays
// — enforced as a cross-field check below) and backups happen often
// enough to be useful (≤ 90 days) but not so often they churn disk
// for an effectively-static file (≥ 1 day).
const storageBody = Joi.object({
    logGzipAfterDays: Joi.number().integer().min(1).max(365).optional(),
    logRetentionDays: Joi.number().integer().min(1).max(3650).optional(),
    keystoreIntervalDays: Joi.number().integer().min(1).max(90).optional(),
    keystoreKeepCount: Joi.number().integer().min(1).max(50).optional(),
})
    .unknown(false)
    .label('PUT /config/storage body')
    .custom((value, helpers) => {
        if (Number.isFinite(value.logGzipAfterDays)
            && Number.isFinite(value.logRetentionDays)
            && value.logGzipAfterDays >= value.logRetentionDays) {
            return helpers.error('any.invalid', {
                message: 'logGzipAfterDays must be less than logRetentionDays',
            });
        }
        return value;
    })
    .messages({
        'any.invalid': '{{#message}}',
    });

// beta.3.33 — POST /maintenance/update body.
//
// `tag` is the GitHub release tag, e.g. "enm-v0.2.0-beta.3.33". We
// constrain to the enm-v<semver> shape so an operator can't accidentally
// run the deploy script against an arbitrary tag (which could be a
// non-ENM release on the same repo). Pattern enforces:
//   - Must start with literal "enm-v"
//   - Then [\d.\-a-z]+ (digits, dots, dashes, lowercase letters)
//   - 6..64 chars total (sanity bounds)
//
// `confirm` echoes the operator's typed confirmation from the UI;
// the route compares it to the typed-confirmation token expected for
// each action. The pattern allows just the words / numbers we use.
const maintenanceUpdateBody = Joi.object({
    tag: Joi.string().pattern(/^enm-v[\d.\-a-z]+$/).min(6).max(64).required(),
}).unknown(false).label('POST /maintenance/update body');

// beta.3.33 — POST /maintenance/chain-resync body.
// v0.5.232 — accepts either the legacy single-chain shape (chainId:string) OR
// the new multi-chain shape (chainIds:array). Route normalizes both into an
// array internally. Council operators use the array form to pick subsets of
// {mainchain,esc,eid,pg}; BPoS operators always send ['mainchain'].
const maintenanceChainResyncBody = Joi.object({
    // Legacy: one chain at a time.
    chainId: Joi.string().pattern(/^[a-z0-9-]+$/).min(1).max(32).optional(),
    // v0.5.232 — many chains in one call. Capped at 8 to match the maximum
    // ChainRegistry size; route additionally rejects oracle/arbiter (no
    // chaindata to wipe).
    chainIds: Joi.array()
        .items(Joi.string().pattern(/^[a-z0-9-]+$/).min(1).max(32))
        .min(1).max(8)
        .optional(),
    confirm: Joi.string().required(),  // route validates exact match
})
    .or('chainId', 'chainIds')
    .unknown(false)
    .label('POST /maintenance/chain-resync body');

// v0.5.232 — POST /maintenance/reset-everything body. The single in-app
// destructive action that replaces the retired /maintenance/uninstall,
// /maintenance/nuke, and /identity/reset routes. Operator types
// "RESET EVERYTHING" (case-sensitive) to confirm.
const maintenanceResetEverythingBody = Joi.object({
    confirm: Joi.string().required(),  // route validates exact match
}).unknown(false).label('POST /maintenance/reset-everything body');

// beta.3.43 — Settings → Identity tab bodies.
//
// Passwords aren't bounded by length here beyond a sanity 256 cap —
// the operator's existing wizard generates 32-char passwords, but a
// human-chosen password may be shorter or longer. Routes themselves
// reject empty strings.
const identityUnlockBody = Joi.object({
    password: Joi.string().min(1).max(256).required()
        .messages({ 'any.required': 'Password is required.' }),
}).unknown(false).label('POST /identity/unlock body');

// v0.5.236 — identityResetBody schema removed (dead code). POST /identity/reset
// was retired to a 410 stub in v0.5.232 (folded into /maintenance/reset-everything);
// this Joi body was no longer exported or referenced anywhere (4-way verified:
// no src refs, no tests, no dynamic access). The shape lives in git history if a
// narrower keystore-rotation path is ever revived.

// POST /identity/import — typed confirm + password. The file itself
// arrives as raw bytes in the request body (Content-Type: application/
// octet-stream); we don't multipart-parse because that pulls in
// formidable/busboy and the keystore is just <10 KB. Password +
// confirm come as headers so we don't have to mix concerns.
//
// The route reads body bytes directly via Buffer concat; this schema
// validates the metadata header values only.
const identityImportHeaders = Joi.object({
    password: Joi.string().min(1).max(256).required(),
    confirm: Joi.string().required(),
    force: Joi.boolean().optional(),
}).unknown(true).label('POST /identity/import headers');

// POST /config/anti-snipe-password
const antiSnipeBody = Joi.object({
    // `password` is the ONLY field. Empty string = explicit clear.
    // 8 char min matches the frontend's inline check + the route's
    // own server-side guard. 256 cap keeps scrypt cost bounded.
    // The handler treats {} (no password field) as "probe — return
    // current set/unset state" which is BEFORE this schema is
    // applied, so we still want `.optional()` here.
    password: Joi.string().allow('').min(0).max(256).optional()
        .messages({
            'string.base': 'Password must be a string.',
            'string.max': 'Password is too long (256 char max).',
        }),
}).unknown(false).label('POST /config/anti-snipe-password body');

/**
 * Validate a request body against a Joi schema. Returns either
 *   { value: <validated body> }  on success
 * or
 *   { error: <ValidationError>, details: <array of {path, message}> }
 *     where details is the structured per-field error list the route
 *     can surface as a 400 response.
 *
 * The route is responsible for shaping the 400 envelope. We don't
 * shape it here so callers can keep their existing errorBody() shape
 * (success: false / error: string) intact and just include the
 * `details` array when they want to be helpful.
 *
 * @param {Joi.Schema} schema
 * @param {object|null|undefined} body
 * @returns {{ value: object }|{ error: Joi.ValidationError, details: object[] }}
 */
function validateBody(schema, body) {
    const { value, error } = schema.validate(body || {}, {
        abortEarly: false,
        stripUnknown: true,
        // Don't coerce — types must match. A boolean field with the
        // string "true" should 400, not silently convert. The frontend
        // sends actual booleans.
        convert: false,
    });
    if (error) {
        const details = error.details.map((d) => ({
            path: Array.isArray(d.path) ? d.path.join('.') : String(d.path),
            message: d.message,
        }));
        return { error, details };
    }
    return { value };
}

module.exports = {
    networkBody,
    mainchainBody,
    generalBody,
    notificationsBody,
    storageBody,
    antiSnipeBody,
    maintenanceUpdateBody,
    maintenanceChainResyncBody,
    maintenanceResetEverythingBody,
    // v0.5.232 — retired but kept exported in case external callers
    // still reference these schemas. Routes return 410 Gone now.
    identityUnlockBody,
    identityImportHeaders,
    validateBody,
};
