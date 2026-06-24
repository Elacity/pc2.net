/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmConfigSchema — joi schema for our extension's config file.
 *
 * Per Rev 6 audit (agent 10): the only validator added to PC2 in v0.1 is joi.
 * The schema below covers the v0.1 mainchain-only config; it intentionally
 * leaves multi-chain shape (ESC, EID) for v0.2 expansion.
 *
 * Validates the JSON written to ${dataDir}/extensions/elastos-node-manager/config.json
 * (NOT the chain's own ela config.json — that's a separate file we generate
 * inside chains/<chainId>/config.json).
 */

'use strict';

const Joi = require('joi');

const { ELA_DEFAULT_PORTS } = require('./EnmConstants');

const PORT_RANGE = Joi.number().integer().min(1024).max(65535);
const HEX_PUBKEY = Joi.string().hex().length(66); // 33-byte compressed pubkey
const IP_OR_HOST = Joi.alternatives().try(
    Joi.string().ip({ version: ['ipv4'] }),
    Joi.string().hostname(),
    Joi.valid(null),
);

const rpcSchema = Joi.object({
    // Master gate (alpha.19). When false, the generated ela config.json
    // forces WhiteIPList=['127.0.0.1'] so external apps cannot connect even
    // if the operator has saved a wider allow-list. Operator's whiteIPList
    // is preserved across toggle off/on so they don't lose configuration.
    // Defaults to false on fresh installs — operators explicitly open RPC.
    enabled: Joi.boolean().default(false),
    user: Joi.string().alphanum().min(1).max(64).required(),
    // Encrypted via EnmEncryption.encrypt() — base64 JSON envelope. We store
    // the envelope as-is and decrypt at spawn time.
    passwordEncrypted: Joi.string().required(),
    whiteIPList: Joi.array().items(
        Joi.alternatives().try(
            Joi.string().ip({ version: ['ipv4'], cidr: 'optional' }),
            // P1 (v0.5.183) — accept IPv6+CIDR too. The request schema
            // (EnmRequestSchemas.mainchainBody.whiteIPList) already accepts
            // IPv6, so without this the config schema REJECTED an IPv6 entry
            // the form had accepted → ConfigStore.save() threw → PUT
            // /config/mainchain returned 500. Both layers now accept identical
            // input.
            Joi.string().ip({ version: ['ipv6'], cidr: 'optional' }),
            Joi.valid('127.0.0.1'),
        ),
    ).default(['127.0.0.1']),
});

const dposSchema = Joi.object({
    enableArbiter: Joi.boolean().required(),
    // Auto, manual, or null (paint as auto-detect with no override yet).
    ipAddressMode: Joi.string().valid('auto', 'manual').default('auto'),
    ipAddressManual: IP_OR_HOST.default(null),
    refreshOnRestart: Joi.boolean().default(true),
    ownerPublicKey: HEX_PUBKEY.allow('').default(''),
    nodePublicKey: HEX_PUBKEY.allow('').default(''),
    // Keystore password — encrypted via EnmEncryption (same envelope shape as
    // rpc.passwordEncrypted). Optional in non-arbiter mode; required when the
    // operator flips enableArbiter=true. NativeProcessService decrypts at
    // spawn-time and pipes to stdin (Rev 1 audit: ela reads it from stdin).
    keystorePasswordEncrypted: Joi.string().allow('').default(''),
});

const portsSchema = Joi.object({
    rpc:      PORT_RANGE.default(ELA_DEFAULT_PORTS.rpc),
    nodePort: PORT_RANGE.default(ELA_DEFAULT_PORTS.nodePort),
    httpInfo: PORT_RANGE.default(ELA_DEFAULT_PORTS.httpInfo),
    httpRest: PORT_RANGE.default(ELA_DEFAULT_PORTS.httpRest),
    httpWs:   PORT_RANGE.default(ELA_DEFAULT_PORTS.httpWs),
    dpos:     PORT_RANGE.default(ELA_DEFAULT_PORTS.dpos),
});

// beta.3.87 — Wave M1.3 — per-chain healing rule overrides. Shape mirrors
// cfg.global.healing.enabledRules (which becomes legacy fallback). Keys
// are F-rule IDs (F1..F22) plus AUTOSTART. Values are booleans. Any
// rule omitted falls back to the global override, then DEFAULT_ENABLED.
//
// HealthChecker._loadConfigSafe does a ONE-SHOT migration on first
// boot under this schema: if cfg.chains.mainchain.healing.enabledRules
// is absent AND cfg.global.healing.enabledRules has entries, the global
// map is copied here, an SSE notification fires, and an audit row is
// written. Operators' existing per-chain toggles survive the upgrade.
const perChainHealingSchema = Joi.object({
    enabledRules: Joi.object().pattern(
        Joi.string().regex(/^(F\d{1,2}|AUTOSTART)$/),
        Joi.boolean(),
    ).default({}),
}).default({});

const mainchainSchema = Joi.object({
    enabled: Joi.boolean().default(true),
    binaryPath: Joi.string().min(1).required(),
    binaryVersion: Joi.string().allow(null, '').default(null),
    // beta.0.5.0 — epoch ms of last binary install; HealthRules.detectF8
    // suppresses the version-drift proposal for 1h after install so
    // geth-fork sidechains' internal-version reporting doesn't trip
    // a cosmetic rule on every fresh install.
    binaryInstalledAt: Joi.number().integer().allow(null).default(null),
    dataDir: Joi.string().required(),
    activeNet: Joi.string().valid('mainnet', 'testnet', 'regnet').default('mainnet'),
    ports: portsSchema.required(),
    rpc: rpcSchema.required(),
    dpos: dposSchema.required(),
    memoryLimitMb: Joi.number().integer().min(512).max(32_768).default(4096),
    archiveMode: Joi.boolean().default(false),
    logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
    // beta.3.87 — per-chain healing rule overrides.
    healing: perChainHealingSchema,
});

const globalSchema = Joi.object({
    healing: Joi.object({
        autoExecuteSafe: Joi.boolean().default(true),
        ownerConfirmsTimeoutSec: Joi.number().integer().min(60).max(86_400).default(3600),
        maxRestartAttempts: Joi.number().integer().min(1).max(20).default(3),
        restartCooldownSec: Joi.number().integer().min(5).max(600).default(30),
        // beta.3.76 — per-rule enable/disable overrides. Keys are the
        // F-rule IDs (F1, F2, F4, F5, F6, F7, F8, F9, F10, F11, F12,
        // F13, F16, F18, F19, F22) plus AUTOSTART. Any rule omitted
        // here keeps its DEFAULT_ENABLED value (all true today). At
        // boot HealthChecker pushes this map into HealthRules.
        // setRuleEnabled so the engine's runAll() gate honours it.
        enabledRules: Joi.object().pattern(
            Joi.string().regex(/^(F\d{1,2}|AUTOSTART)$/),
            Joi.boolean(),
        ).default({}),
    }).default(),
    notifications: Joi.object({
        criticalRequiresAck: Joi.boolean().default(true),
        // beta.3.19 (Phase 2 Alerts) — operator-tunable thresholds
        // for HealthChecker's F3 / F4 / F5 detectors. Defaults match
        // the alpha.28 hardcoded values; bounds mirror the Joi
        // request-body schema in EnmRequestSchemas.notificationsBody.
        thresholds: Joi.object({
            diskFreeWarnGb:     Joi.number().integer().min(10).max(10000).optional(),
            diskFreeCriticalGb: Joi.number().integer().min(1).max(10000).optional(),
            peerZeroGraceMin:   Joi.number().integer().min(1).max(120).optional(),
            syncStallGraceMin:  Joi.number().integer().min(1).max(240).optional(),
        }).default({}),
    }).default(),
    audit: Joi.object({
        retentionDays: Joi.number().integer().min(0).max(3650).default(365),
    }).default(),
    // beta.3.10 — scrypt hash for the anti-snipe password. Persisted
    // here so SelfHealingEngine._verifyAntiSnipePassword can verify
    // confirm-tier proposals against it. Format:
    //     scrypt$<saltHex>$<derivedHex>
    // Cleared (delete key) when the operator clicks "Clear" in the
    // Security section. NEVER echoed back to the client — the
    // EnmConfigRedact pass converts it to a `antiSnipePasswordSet`
    // boolean before the /config GET response.
    antiSnipePasswordHash: Joi.string().allow(null).pattern(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/).optional(),
    // beta.3.20 (Phase 3 Storage) — keystore auto-backup state +
    // policy. The service writes lastKeystoreBackupAt + path
    // every successful backup; PUT /config/storage writes the
    // policy fields. All fields optional so a config from an
    // older beta still validates.
    backup: Joi.object({
        keystoreIntervalDays: Joi.number().integer().min(1).max(90).optional(),
        keystoreKeepCount:    Joi.number().integer().min(1).max(50).optional(),
        lastKeystoreBackupAt: Joi.number().integer().min(0).allow(null).optional(),
        lastKeystoreBackupPath: Joi.string().allow(null, '').optional(),
    }).default({}),
    // Auto-start: when PC2 boots and an extension's `ready` hook fires, start
    // any chain whose `enabled=true`. Reattach handles the "ela was already
    // running before PC2 restarted" case; this handles cold boots.
    autoStart: Joi.object({
        onBoot: Joi.boolean().default(true),
        delaySec: Joi.number().integer().min(0).max(600).default(10),
    }).default(),
    // v0.5.236 — initial-sync strategy for constrained hosts.
    //   'concurrent' (default) — start all enabled chains at once (legacy).
    //   'staged'                — EnmStageSyncOrchestrator brings up the heavy
    //                             chains (mainchain + esc/eid/pg) ≤N at a time,
    //                             waiting for each to reach tip before starting
    //                             the next, so a low-end host isn't crushed by
    //                             simultaneous EVM full-syncs. Oracles pair with
    //                             their parent; arbiter starts last.
    // Set from the setup wizard's hardware-tier choice (Card 5). BPoS nodes run
    // only the mainchain, so staged is a no-op there (one heavy chain) — the
    // field is harmless regardless of role.
    syncStrategy: Joi.string().valid('concurrent', 'staged').default('concurrent'),
    stagedSync: Joi.object({
        // Heavy-chain window size. 2 = "two chains at once" (operator default
        // for lower-end recommended hardware).
        concurrency: Joi.number().integer().min(1).max(4).default(2),
    }).default(),
    // Log rotation — gzip *.log older than gzipAfterDays, purge *.gz older
    // than purgeAfterDays. main.js scheduler runs compactNow every 24h.
    // beta.3.20 — purgeAfterDays min lowered from 7 → 1 day so the
    // Settings Storage section's range (1-3650) doesn't trip the
    // schema. The cross-field "gzip < purge" rule is enforced in
    // EnmRequestSchemas.storageBody at the PUT boundary.
    logRotation: Joi.object({
        enabled: Joi.boolean().default(true),
        gzipAfterDays: Joi.number().integer().min(1).max(365).default(7),
        purgeAfterDays: Joi.number().integer().min(1).max(3650).default(30),
    }).default(),
    // beta.3.78 — `stateSnapshot` config block removed with the snapshot
    // service. F22 is now alert-only; recovery is operator-driven.
    //
    // beta.3.79 — pre-3.78 configs on disk still carry global.stateSnapshot.
    // Without a tolerant key here, Joi rejects the whole config with
    // "stateSnapshot is not allowed" — blocking config.load(), which in
    // turn blocked HealthChecker, AUTOSTART, and every chains/ route.
    // Operators woke up to chain-stopped + 500s from the UI.
    //
    // Joi.any().strip() accepts the legacy field on read and quietly
    // drops it from the validated output, so the next ConfigStore.save
    // writes a clean config and the legacy field is gone for good.
    stateSnapshot: Joi.any().strip(),
    // beta.3.98 (Wave M3.4) — Council-wide strategy answers (plan §5
    // Layer 1). Two questions asked once on the first non-mainchain
    // install:
    //   1. passwordStrategy:    one password for all sidechain EVM
    //                           keystores OR per-chain
    //   2. minerAddressStrategy: one Ethereum address for all chains
    //                            OR per-chain
    // Shared values (when strategy='shared') live here so all class B
    // install wizards can pull them; per-chain values live on each
    // cfg.chains.<id> (M3.3 classBSchema.miner.rewardAddress etc.).
    council: Joi.object({
        passwordStrategy: Joi.string().valid('shared', 'per-chain').optional(),
        // Encrypted shared password — populated when passwordStrategy
        // ='shared'. AES-GCM envelope (EnmEncryption). Each Class B
        // install copies this to cfg.chains.<id>.miner.evmKeystore
        // PasswordEncrypted for backward-compat with the per-chain
        // unlock path in EvmSidechainAdapter (M3.1).
        sharedPasswordEncrypted: Joi.string().allow('').default(''),
        // beta.0.4.7 — single master password covering ALL Council
        // keystores: mainchain keystore.dat (DPoS signer) + ESC/EID/PG
        // EVM keystores + Arbiter wallet. Generated once on Card 3
        // of the redesigned wizard; chain-level `keystorePasswordEncrypted`
        // and `evmKeystorePasswordEncrypted` fields MAY be empty when
        // this is set, in which case they derive from this. Pre-0.4.7
        // installs without this field still validate; their per-chain
        // envelopes remain authoritative.
        //
        // Joi.string().allow('') — no regex. EnmEncryption.encrypt()
        // returns a JSON envelope (JSON.stringify({v,iv,tag,ct}) with
        // base64 fields, see EnmEncryption.js:104-109); all sibling
        // *Encrypted fields use the same permissive shape.
        masterPasswordEncrypted: Joi.string().allow('').default(''),
        minerAddressStrategy: Joi.string().valid('shared', 'per-chain').optional(),
        sharedMinerAddress: Joi.string().regex(/^0x[0-9a-fA-F]{40}$/).allow('').default(''),
        setupCompletedAt: Joi.number().integer().allow(null).default(null),
        // v0.5.229 (audit 2026-05-27) — explicit "this is a Council install"
        // flag set by /setup/install-council when the orchestrator finishes
        // the start-chains step. The dashboard uses this as the early-render
        // hint for "show Council UI" before the live listcurrentcrs call
        // resolves (mainchain RPC may still be warming up). Pre-229 the
        // wizard saved 'council' to localStorage.enm:setup-intent only,
        // which the dashboard never read — every Council operator saw the
        // BPoS default labelling instead.
        installed: Joi.boolean().default(false),
        installedAt: Joi.number().integer().allow(null).default(null),
    }).default(),
});

const setupSchema = Joi.object({
    completed: Joi.boolean().default(false),
    completedAt: Joi.number().integer().allow(null).default(null),
    completedStep: Joi.string().valid(
        'welcome', 'os', 'disk', 'wallet', 'binary',
        // alpha.10: 'bootstrap' sits between binary install and keystore.
        // Operator picks fast-sync (snapshot) or genesis on Card B2;
        // either path advances completedStep through 'bootstrap'.
        'bootstrap',
        'keystore', 'config', 'complete',
        // beta.0.5.0 — Council orchestrator's finalization step writes
        // 'council-install' when the start-chains runStep finishes, so
        // the wizard does not re-mount on the next page load.
        'council-install',
    ).default('welcome'),
});

// beta.3.86 — Wave M1.2 — multi-chain config-shape opening.
//
// Placeholder schemas for non-mainchain classes. Each currently accepts
// any shape (`.unknown(true)`) so M1.2 only OPENS the door for future
// per-class fields without prescribing what they look like (that lands
// in M3 for Class B, M4 for Class C, M5 for PG-specific, M6 for Class D).
//
// Why now: by introducing the pattern matchers in M1.2, the schema
// stops rejecting any non-mainchain chainId before the per-class schemas
// land. This lets later milestones add chain entries to the config
// without simultaneously needing schema migration.
//
// The mainchain key stays as a NAMED key (not a pattern match) so the
// existing strict mainchainSchema continues to validate exactly as
// before. Backward compat: pre-3.86 configs with `chains.mainchain`
// only continue to validate without any change.
//
// ECO is intentionally absent from the regex (H3 — operator-instructed
// 2026-05-18); attempting to add `chains.eco: {...}` is REJECTED.

// beta.3.97 (Wave M3.3) — Class B (EVM PBFT sidechain) schema. Real
// shape; the M1.2 `Joi.object().unknown(true)` placeholder is replaced
// here for ESC + EID + PG (PG fills in the remaining PG-specific
// quirks in M5.1; this shape works for PG today, just without the
// closed-source binary SHA256 manifest).
//
// node.sh parity:
//   - pbft.usesMainchainKeystore is schema-locked to true (H23 — the
//     EVM sidechain's PBFT keystore is ALWAYS the mainchain
//     keystore.dat per node.sh:2144). Surfacing it in the schema lets
//     operators reading the cfg file see the invariant.
//   - miner.rewardAddress is operator-supplied (NOT derived from the
//     EVM keystore — H22). Format regex here is the shape gate; full
//     EIP-55 + checksum validation happens at the route layer via
//     EnmCrypto.validateEthAddress.
//   - miner.evmKeystorePasswordEncrypted is the AES-GCM envelope
//     produced by EnmEncryption (H24 — no plaintext on disk).
//   - sync.mode mirrors geth's --syncmode. v0.5.235: ENM EVM chains
//     always run validator-grade FULL sync (default 'full'). 'fast' is
//     retained in valid() only so legacy stored configs still load — the
//     adapter + routes coerce any 'fast' to 'full' at use. node.sh runs
//     producers on full (esc_start:2152, eid_start:4390).
const classBPortsSchema = Joi.object({
    rpc:       PORT_RANGE.required(),
    p2p:       PORT_RANGE.required(),
    dpos:      PORT_RANGE.required(),
    discovery: PORT_RANGE.required(),
    httpInfo:  PORT_RANGE.optional(),
});
const classBPbftSchema = Joi.object({
    usesMainchainKeystore: Joi.boolean().valid(true).default(true),
    ipAddress: IP_OR_HOST.default(null),
}).default();
const classBMinerSchema = Joi.object({
    enabled: Joi.boolean().default(false),
    // 0x + 40 hex shape gate; route layer applies EIP-55 + warn.
    rewardAddress: Joi.string().regex(/^0x[0-9a-fA-F]{40}$/).allow('').default(''),
    rewardAddressSource: Joi.string().valid('shared', 'per-chain').default('per-chain'),
    evmKeystoreAddr: Joi.string().regex(/^0x[0-9a-fA-F]{40}$/).allow('').default(''),
    evmKeystorePasswordEncrypted: Joi.string().allow('').default(''),
    threads: Joi.number().integer().min(1).max(16).default(1),
}).default();
const classBSyncSchema = Joi.object({
    // v0.5.235 — default 'full' (validator-grade). 'fast' stays in valid()
    // for load-compat with pre-v0.5.235 stored configs; it's coerced to
    // 'full' by EvmSidechainAdapter.start() (which re-persists) and by the
    // setup/chains routes.
    mode: Joi.string().valid('fast', 'full', 'archive').default('full'),
}).default();
const classBSchema = Joi.object({
    enabled: Joi.boolean().default(false),
    binaryPath: Joi.string().allow('').default(''),
    binaryVersion: Joi.string().allow('').default(''),
    // beta.0.5.0 — epoch ms of last binary install; see mainchainSchema.
    binaryInstalledAt: Joi.number().integer().allow(null).default(null),
    activeNet: Joi.string().valid('mainnet', 'testnet').default('mainnet'),
    ports: classBPortsSchema.required(),
    pbft: classBPbftSchema,
    miner: classBMinerSchema,
    sync: classBSyncSchema,
    bootnodes: Joi.array().items(Joi.string().max(512)).default([]),
    healing: perChainHealingSchema,
    // beta.0.3.6 (Wave M5.1) — operator-supplied SHA256 manifest for
    // closed-source binaries (currently only PG). Required at PG start
    // time (PgAdapter throws if unset); ESC/EID start fine without it
    // since their binaries build reproducibly from public source.
    // 64-char hex string, case-insensitive comparison at verify time.
    binarySha256Expected: Joi.string().regex(/^[0-9a-fA-F]{64}$/).allow('').default(''),
    // 0.5.149 audit Session 149 — accept-and-strip transient spawn params.
    // EvmSidechainAdapter.buildSpawnArgs() (line ~210) computes spawnArgs
    // FRESH at every start from cfg.ports/miner/pbft/sync; it never reads
    // a persisted value. But the computed array leaked into config.json
    // via the chainConfig object handed to NativeProcessService, so a
    // later validation of the on-disk config saw an unknown `spawnArgs`
    // key and FAILED — firing a bogus "Rollback config to previous
    // version" healing proposal at the operator (the config was actually
    // fine; the chains run off it). Joi.strip() makes validation accept
    // the key AND removes it from the validated output, so the next save
    // writes a clean config. The adapter is unaffected (it recomputes).
    spawnArgs: Joi.any().strip(),
    spawnEnv: Joi.any().strip(),
});

// beta.0.3.2 (Wave M4.2) — Class C (Sidekick Oracle) schema. Replaces
// the M1.2 placeholder for esc-oracle / eid-oracle (PG-oracle reuses
// the same shape; lands in M5.4).
//
// Oracles are stateless Node.js HTTP relayers (plan §2). The cfg block
// declares:
//   - parentChainId    — which EVM sidechain feeds this oracle
//   - scriptPath       — directory holding crosschain_<X>.js
//   - nodejsVersion    — pinned to v23.10.0 per upstream (M4.3 ships)
//   - ports.httpRpc    — the oracle's status endpoint port
//   - parent.{chainRpcUrl, mainchainRpcUrl} — optional overrides; the
//     adapter falls through to per-chain RPC URLs derived from cfg
//     when these are empty (the common case — operator never sets them)
//   - binaryPath / binaryVersion — the node interpreter (M4.3 sets)
//   - healing — per-chain rule overrides (M1.3 schema reuse)
const classCParentSchema = Joi.object({
    chainRpcUrl: Joi.string().uri().allow('').default(''),
    mainchainRpcUrl: Joi.string().uri().allow('').default(''),
}).default();
const classCPortsSchema = Joi.object({
    httpRpc: PORT_RANGE.required(),
});
const classCSchema = Joi.object({
    enabled: Joi.boolean().default(false),
    binaryPath: Joi.string().allow('').default(''),
    binaryVersion: Joi.string().allow('').default(''),
    // beta.0.5.0 — epoch ms of last binary install; see mainchainSchema.
    binaryInstalledAt: Joi.number().integer().allow(null).default(null),
    activeNet: Joi.string().valid('mainnet', 'testnet').default('mainnet'),
    parentChainId: Joi.string().valid('esc', 'eid', 'pg').required(),
    scriptPath: Joi.string().allow('').default(''),
    nodejsVersion: Joi.string().allow('').default('v23.10.0'),
    ports: classCPortsSchema.required(),
    parent: classCParentSchema,
    healing: perChainHealingSchema,
    // 0.5.149 audit Session 149 — accept-and-strip transient spawn params.
    // Oracle adapters (Class C) compute spawnArgs AND spawnEnv at start
    // (env carries ENM_PARENT_RPC / ENM_MAINCHAIN_RPC etc.) and the
    // computed values leaked into config.json the same way the EVM
    // sidechains' did, failing validation + firing the bogus "rollback
    // config" proposal. See classBSchema for the full rationale.
    spawnArgs: Joi.any().strip(),
    spawnEnv: Joi.any().strip(),
});
// beta.0.3.10 (Wave M6.1) — Class D (Arbiter cross-chain signer)
// schema. Replaces the M1.2 placeholder. Arbiter is singleton (only
// one per ENM install); SideNodeList is auto-derived from cfg.chains
// at start time (M6.6) rather than carried in schema.
//
// node.sh parity:
//   - wallet.usesMainchainKeystore is schema-locked to true (H8/H23
//     style invariant — the Arbiter's signing identity = the
//     mainchain producer identity; node.sh:5545 had a `cp keystore.dat`
//     of the mainchain keystore which we replicate via path reference
//     instead).
//   - wallet.passwordSource is schema-locked to 'mainchain-ela-txt' to
//     surface the invariant; the actual password is read from
//     mainchain.dpos.keystorePasswordEncrypted (H24 — AES-GCM).
//   - mining.miningAddress is an ELA MAINCHAIN address (NOT Ethereum).
//     Regex matches the base58check shape that EnmCrypto.validateEla
//     Address uses at the route layer. ELA addresses start with E
//     (mainnet) or 4 (testnet) and are 34 chars.
const classDWalletSchema = Joi.object({
    usesMainchainKeystore: Joi.boolean().valid(true).default(true),
    passwordSource: Joi.string().valid('mainchain-ela-txt').default('mainchain-ela-txt'),
}).default();
const classDMiningSchema = Joi.object({
    // beta.0.4.5 — accept EITHER format. Pre-0.4.5 only ELA-mainnet
    // base58check was accepted. Operator directive 2026-05-18:
    // "Arbiter should also register as the same EVM address". The
    // arbiter binary resolves either format string to the same key
    // when both derive from the same wallet seed (Essentials usage
    // pattern), so accepting both at the schema layer keeps the
    // operator-facing UX to ONE address input.
    miningAddress: Joi.string().regex(
        /^(?:0x[0-9a-fA-F]{40}|[E4][1-9A-HJ-NP-Za-km-z]{33})$/
    ).allow('').default(''),
    sideChainPowFeeEla: Joi.number().min(0).max(100).default(0.1),
}).default();
const classDPortsSchema = Joi.object({
    rpc: PORT_RANGE.required(),
    p2p: PORT_RANGE.required(),
});
const classDCrossChainSchema = Joi.object({
    // sideNodeList auto-populated by ArbiterAdapter.generateConfig
    // from ChainRegistry.listChains; the schema accepts an explicit
    // override but normal flow leaves this empty.
    sideNodeList: Joi.array().items(Joi.object().unknown(true)).default([]),
    // SPV catchup poll interval (ms). node.sh uses 1000ms; expose for
    // operator tuning.
    syncIntervalMs: Joi.number().integer().min(100).max(60_000).default(1000),
}).default();
const classDSchema = Joi.object({
    enabled: Joi.boolean().default(false),
    binaryPath: Joi.string().allow('').default(''),
    binaryVersion: Joi.string().allow('').default(''),
    // beta.0.5.0 — epoch ms of last binary install; see mainchainSchema.
    binaryInstalledAt: Joi.number().integer().allow(null).default(null),
    activeNet: Joi.string().valid('mainnet', 'testnet').default('mainnet'),
    ports: classDPortsSchema.required(),
    wallet: classDWalletSchema,
    mining: classDMiningSchema,
    crossChain: classDCrossChainSchema,
    healing: perChainHealingSchema,
});
const classEPlaceholderSchema = Joi.object().unknown(true);  // SPV (M6-opt)

const enmConfigSchema = Joi.object({
    version: Joi.number().integer().valid(1).required(),
    chains: Joi.object({
        // Named key — preserves bit-for-bit mainchain validation. Stays
        // as a named key forever; Class A is the only class with a
        // singleton (only one mainchain ever).
        mainchain: mainchainSchema.optional(),
    })
        // Class B chainIds — esc, eid, pg. Real schema landed in M3.3
        // (replaces the M1.2 .unknown(true) placeholder). PG additions
        // (closed-source SHA256 manifest) layer on in M5.1 but the
        // current shape covers all three.
        .pattern(/^(esc|eid|pg)$/, classBSchema)
        // Class C chainIds — oracles. M4.2 real schema; PG oracle uses
        // the same shape (M5.4 will just register the adapter).
        .pattern(/^(esc-oracle|eid-oracle|pg-oracle)$/, classCSchema)
        // Class D — arbiter (singleton). Real schema landed M6.1.
        .pattern(/^arbiter$/, classDSchema)
        // Class E — spv (singleton, optional). Real schema in M6-opt.
        .pattern(/^spv$/, classEPlaceholderSchema)
        .default({}),
    global: globalSchema.default(),
    setup: setupSchema.default(),
})
    .unknown(false) // reject typos at the top level (chains/global/setup/version only)
    .required();

/**
 * Validate a config object. Returns the normalized value (with defaults
 * applied) on success; throws on failure with all error messages joined.
 *
 * @param {object} input
 * @returns {object} validated + default-filled config
 */
function validate(input) {
    const result = enmConfigSchema.validate(input, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
    });
    if (result.error) {
        const details = result.error.details
            .map((d) => `  ${d.path.join('.') || '(root)'}: ${d.message}`)
            .join('\n');
        const err = new Error(`EnmConfigSchema: invalid config\n${details}`);
        err.details = result.error.details;
        throw err;
    }
    return result.value;
}

/**
 * Default config seed — used on first init before the operator runs setup.
 * Required fields are filled with placeholders that pass schema validation
 * BUT the calling code should still flag the config as "not yet configured"
 * via setup.completed=false.
 *
 * @returns {object}
 */
function defaultConfig() {
    return {
        version: 1,
        chains: {},
        global: {
            healing: {
                autoExecuteSafe: true,
                ownerConfirmsTimeoutSec: 3600,
                maxRestartAttempts: 3,
                restartCooldownSec: 30,
            },
            notifications: { criticalRequiresAck: true },
            audit: { retentionDays: 365 },
            autoStart: { onBoot: true, delaySec: 10 },
            // v0.5.236 — initial-sync strategy (set by the wizard's hardware
            // tier choice). 'concurrent' = all-at-once (default); 'staged' =
            // bring heavy chains up 2-at-a-time on constrained hosts.
            syncStrategy: 'concurrent',
            stagedSync: { concurrency: 2 },
            logRotation: { enabled: true, gzipAfterDays: 7, purgeAfterDays: 90 },
        },
        setup: {
            completed: false,
            completedAt: null,
            completedStep: 'welcome',
        },
    };
}

module.exports = {
    enmConfigSchema,
    validate,
    defaultConfig,
};
