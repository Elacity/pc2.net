/**
 * relayer-signer.ts (pc2-node) — SCAFFOLD
 *
 * STATUS: pre-flight scaffold for v1.2.8.0. NOT IMPORTED FROM RUNTIME YET.
 *         Production write is gated on C-1 (live `usageKey` rotation) and
 *         on the supernode-side relayer (lit-relay.js) being promoted.
 *
 * When promoted, this file lives at:
 *   pc2-node/src/runtime/relayer-signer.ts
 * and is wired from `pc2-node/src/api/chipotle-client.ts` Tier 0 (see
 * ./CLIENT_MIGRATION.md for the diff manifest).
 *
 * Purpose
 * -------
 * `chipotle-client.ts` already does a lot of work. It must NOT learn how to
 * drive a wallet; that's wallet-stack territory. This adapter is the thin
 * boundary: it exposes the SIWE-equivalent message signer to chipotle-client
 * via the `RelayerSigner` interface, and internally it picks one of three
 * signing backends in priority order:
 *
 *   1. Runtime-injected signer       — the user's actual wallet (EOA or SA)
 *                                       reused from the existing siweLogin
 *                                       handshake (wallet.js#siweLogin).
 *
 *   2. Operator override (env var)   — process.env.PC2_RELAYER_SIGNER_KEY
 *                                       (32-byte hex). Useful for headless
 *                                       supernode-adjacent test harnesses
 *                                       and for the e2e smoke script.
 *
 *   3. Disk-backed ephemeral signer  — pc2-node/data/.relayer-signer
 *                                       Random secp256k1 key, mode 0600,
 *                                       rotated every 7 days. Lets nodes
 *                                       that have not yet completed wallet
 *                                       onboarding still call the relayer.
 *                                       The key is bound to the same SIWE
 *                                       challenge as a real wallet — no
 *                                       trust delta on the supernode side.
 *
 * Design refs:
 *   .cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/V1.2.8.0-CHIPOTLE-RELAYER.md
 *     §"Phase 2 — PC2 client" → "Wallet signer interface"
 *   pc2-node/data/test-apps/elacity-market/wallet.js#siweLogin (lines 337-…)
 *   docs/handover/V12_SIGAUTH_HANDOVER.md
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("relayer-signer");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "../../data");
const EPHEMERAL_KEY_PATH = join(DATA_DIR, ".relayer-signer");
const EPHEMERAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — what chipotle-client.ts depends on.
// Identical shape to the contract documented in the task spec
// (V1.2.8.0-CHIPOTLE-RELAYER.md, lines 264-269).
// ─────────────────────────────────────────────────────────────────────────────

export interface RelayerSigner {
  /** Returns the lowercased EVM address that will sign. */
  address: () => Promise<`0x${string}`>;

  /**
   * Signs `message` with `personal_sign` semantics (EIP-191 prefix).
   * Returns a 0x-prefixed 65-byte hex signature.
   */
  signMessage: (message: string) => Promise<`0x${string}`>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend 1 — Runtime-injected (the user's real wallet)
//
// At promote-time this gets wired from the same place wallet.js's siweLogin
// gets its provider. The runtime layer registers a signer via setRuntimeSigner()
// at boot (after the wallet stack initializes). chipotle-client never calls
// setRuntimeSigner directly — only the runtime/wallet bootstrap does.
// ─────────────────────────────────────────────────────────────────────────────

let _runtimeSigner: RelayerSigner | null = null;

export function setRuntimeSigner(signer: RelayerSigner | null): void {
  _runtimeSigner = signer;
  logger.info(
    `[relayer-signer] runtime signer ${signer ? "registered" : "cleared"}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend 2 — Operator override via env
// ─────────────────────────────────────────────────────────────────────────────

function envSigner(): RelayerSigner | null {
  const hex = process.env.PC2_RELAYER_SIGNER_KEY;
  if (!hex || hex.length !== 64) return null;
  // STUB: at promote-time this builds a signer over the env-provided key
  // using the same secp256k1 lib chipotle-client picks. We don't pull the
  // dep in at scaffold time — see promote checklist at bottom of file.
  logger.warn(
    "[relayer-signer] envSigner() stub — will be wired at promote-time",
  );
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend 3 — Disk-backed ephemeral keypair
//
// Rationale: a brand-new PC2 install on a brand-new MacBook has no wallet yet.
// The user can still consume Chipotle via the relayer immediately, because the
// ephemeral key signs the SAME SIWE challenge a real wallet would sign — the
// supernode treats it identically. Once the user onboards a real wallet, the
// runtime signer takes over and the ephemeral file is no longer used.
// ─────────────────────────────────────────────────────────────────────────────

interface EphemeralKeyfile {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  createdAt: number;
}

function loadOrMintEphemeralKey(): EphemeralKeyfile {
  if (existsSync(EPHEMERAL_KEY_PATH)) {
    try {
      const raw = readFileSync(EPHEMERAL_KEY_PATH, "utf8");
      const parsed: EphemeralKeyfile = JSON.parse(raw);
      const age = Date.now() - parsed.createdAt;
      if (age < EPHEMERAL_TTL_MS && parsed.privateKey && parsed.address) {
        return parsed;
      }
      logger.info(
        `[relayer-signer] ephemeral key expired (age=${Math.round(age / 86_400_000)}d) — rotating`,
      );
    } catch (err) {
      logger.warn(
        `[relayer-signer] ephemeral keyfile unreadable (${(err as Error).message}); minting fresh`,
      );
    }
  }
  return mintFreshEphemeralKey();
}

function mintFreshEphemeralKey(): EphemeralKeyfile {
  // STUB: at promote-time use the same secp256k1 + keccak256 helpers as
  // chipotle-client (or pull viem in deploy/web-gateway/package.json — same
  // decision as the supernode-side recover). Returns a fully-populated
  // EphemeralKeyfile and writes it to disk mode 0600.
  const privateKey = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  const address = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const out: EphemeralKeyfile = {
    privateKey,
    address, // STUB: derive from privateKey at promote-time
    createdAt: Date.now(),
  };
  try {
    writeFileSync(EPHEMERAL_KEY_PATH, JSON.stringify(out, null, 2), {
      mode: 0o600,
    });
    chmodSync(EPHEMERAL_KEY_PATH, 0o600);
  } catch (err) {
    logger.warn(
      `[relayer-signer] failed to persist ephemeral keyfile: ${(err as Error).message}`,
    );
  }
  return out;
}

function ephemeralSigner(): RelayerSigner {
  const key = loadOrMintEphemeralKey();
  return {
    address: async () => key.address,
    signMessage: async (_message: string) => {
      // STUB at scaffold-time. Production: keccak256(EIP-191 prefix + message),
      // sign with secp256k1, return 65-byte hex.
      throw new Error(
        "[relayer-signer] ephemeralSigner.signMessage is stubbed; promote with secp256k1 helpers",
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver — chipotle-client calls this exactly once per relayer round-trip.
// Order matches the priority documented at the top of the file.
// ─────────────────────────────────────────────────────────────────────────────

export function getRelayerSigner(): RelayerSigner {
  if (_runtimeSigner) return _runtimeSigner;
  const env = envSigner();
  if (env) return env;
  return ephemeralSigner();
}

// ─────────────────────────────────────────────────────────────────────────────
// Promote-time TODO list (do these BEFORE wiring chipotle-client.ts Tier 0):
//
//   1. Implement `mintFreshEphemeralKey()`:
//        - derive `address` from `privateKey` via secp256k1 + keccak256
//        - same lib choice as the supernode-side `recoverPersonalSign`
//   2. Implement `ephemeralSigner().signMessage()` (EIP-191 personal_sign)
//   3. Implement `envSigner()` to mirror the same shape over env-provided key
//   4. Wire `setRuntimeSigner()` from the wallet bootstrap that already
//      backs `pc2-node/data/test-apps/elacity-market/wallet.js#siweLogin`
//   5. Add unit tests:
//        - ephemeral key persists across process restarts within TTL
//        - rotation kicks in past TTL
//        - runtimeSigner takes priority when present
//        - envSigner takes priority over ephemeral when set
// ─────────────────────────────────────────────────────────────────────────────
