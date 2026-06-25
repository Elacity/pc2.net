/**
 * AppInstallService
 *
 * Handles fetching dApp bundles from IPFS, extracting them to disk,
 * validating app manifests, and registering/unregistering apps in the database.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, normalize, sep as pathSep } from 'path';
import { createHash } from 'crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import nacl from 'tweetnacl';
import * as tar from 'tar';
import { createLogger } from '../utils/logger.js';
import type { DatabaseManager, InstalledApp } from '../storage/database.js';
import type { IPFSStorage } from '../storage/ipfs.js';
import {
  type PlatformRequirement,
  getHostPlatformSummary,
  evaluatePlatformCompatibility,
  resolveHostVariant,
} from '../utils/platform.js';

const log = createLogger('app-install');

const MAX_APP_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB hard cap per app
const MAX_BUNDLE_ENTRIES = 10_000;            // zip-bomb guard for tar.gz bundles
const TAR_GZIP_MAGIC = Buffer.from([0x1f, 0x8b]); // first 2 bytes of any gzip stream

/**
 * Stages an install can be in, in order. The dApp Centre has a human-
 * readable label for each and updates its progress bar accordingly.
 * `failed` is emitted when install() throws so the UI can show a
 * terminal error state without waiting for the HTTP response.
 */
export type InstallStage =
  | 'fetching'
  | 'verifying'
  | 'extracting'
  | 'registering'
  | 'done'
  | 'failed';

export interface InstallProgressMeta {
  bytesReceived?: number;
  totalBytes?: number;
  filesExtracted?: number;
  totalFiles?: number;
  message?: string;
}

export type InstallProgressCallback = (
  stage: InstallStage,
  pct: number,
  meta?: InstallProgressMeta,
) => void;

function resolveAuthorName(author?: string | AppAuthor): string | null {
  if (!author) return null;
  if (typeof author === 'string') return author;
  return author.name || null;
}

export interface AppAuthor {
  name: string;
  wallet?: string;
  url?: string;
}

export type AppType = 'web' | 'wasm' | 'data' | 'microvm' | 'agent' | 'service';

export type AppCategory =
  | 'media'
  | 'blockchain'
  | 'tools'
  | 'system'
  | 'games'
  | 'social'
  | 'ai'
  | 'marketplace'
  | 'other';

const VALID_APP_TYPES: readonly string[] = ['web', 'wasm', 'data', 'microvm', 'agent', 'service'];

const VALID_CATEGORIES: readonly string[] = [
  'media', 'blockchain', 'tools', 'system', 'games', 'social', 'ai', 'marketplace', 'other',
];

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

export interface AppCapabilities {
  wallet?: boolean;
  network?: boolean;
  storage?: {
    read?: string[];
    write?: string[];
  };
  ipfs?: {
    pin?: boolean;
    fetch?: boolean;
  };
  ipc?: string[];
  drm?: boolean;
}

export interface AppDisplay {
  maximize?: boolean;
  width?: number;
  height?: number;
  resizable?: boolean;
  titlebar?: boolean;
  taskbar?: boolean;
}

export interface AppService {
  name: string;
  protocol?: string;
  endpoint?: string;
  description?: string;
}

/**
 * AppBackend — describes a long-running Node process that pc2-node spawns
 * when a `type: "service"` app is installed and stops when it's uninstalled.
 *
 * Distinct from `AppService[]` (which is just metadata describing
 * exposed APIs/protocols). `backend` is the actual thing that runs.
 *
 * Trust note: the spawned process inherits pc2-node's user privileges.
 * Only first-party Elacity apps with verified `distribution.signature`
 * + `signedBy` in the trusted publisher set should be granted this
 * privilege — see AppProcessManager and the install handler in
 * api/installed-apps.ts for enforcement.
 */
export interface AppBackend {
  /** Path to the entry script, relative to the bundle root (e.g. "backend/dist/index.js"). */
  entry: string;
  /** TCP port the service binds to. The frontend may call localhost:<port>. */
  port: number;
  /**
   * Optional path on the service for periodic liveness checks.
   * If absent, only crashes are detected (no liveness signal).
   */
  healthCheck?: string;
  /** Extra argv passed to node after the entry script. */
  args?: string[];
  /**
   * Extra env vars merged on top of pc2-node's process env when spawning.
   * Operator-controlled values (paths, secrets) should be set via pc2-node's
   * config instead — these are app-author-controlled and should be limited.
   */
  env?: Record<string, string>;
  /**
   * Optional pre-stop teardown hook. pc2-node POSTs to this path on
   * uninstall (purge mode) BEFORE sending SIGTERM, so the service can
   * back up critical state — keystores, signing keys, anything
   * unrecoverable — to a safe location.
   *
   * The service should respond within `teardownTimeoutMs` (default
   * 30 000). If it times out or errors, pc2-node still proceeds with
   * the uninstall but logs the failure. The teardown response body is
   * echoed back to the API caller so the UI can surface where the
   * backup landed.
   *
   * Apps without sensitive state can omit this entirely.
   */
  teardown?: {
    endpoint: string;     // e.g. "/api/enm/teardown"
    timeoutMs?: number;   // default 30000
  };
}

/**
 * One architecture's capsule for a native-module app. The `cid` points at that
 * arch's tarball on IPFS; `signature` is the Ed25519 detached signature over the
 * SHA-256 of those tarball bytes — i.e. the same scheme as the top-level
 * `distribution.signature`, just for this arch's bundle. The publisher key
 * (`signedBy`) is shared and lives on the parent `AppDistribution`.
 */
export interface AppDistributionVariant {
  cid: string;
  signature: string;
  size?: number | null;
}

export interface AppDistribution {
  cid?: string | null;
  signature?: string | null;
  signedBy?: string | null;
  channel?: 'stable' | 'beta' | 'dev';
  updateUrl?: string | null;
  size?: number | null;
  /**
   * Per-arch capsules for apps that bundle a NATIVE module (e.g. the Elastos
   * Node Manager bundles `better-sqlite3`, whose .node binary is arch-specific).
   * Keyed by `"<os>-<arch>"` using Node's `os.platform()`/`os.arch()` values,
   * e.g. `"linux-x64"`, `"linux-arm64"`. When present, the installer resolves
   * the variant matching the HOST's own arch and ignores the top-level `cid`
   * (which is kept as a back-compat default for older clients). `signedBy` is
   * shared across all variants.
   */
  variants?: Record<string, AppDistributionVariant>;
}

export interface AppManifest {
  name: string;
  title: string;
  version: string;
  description?: string;
  author?: string | AppAuthor;
  license?: string;
  icon?: string;
  screenshots?: string[];
  entry?: string;
  type?: AppType;
  category?: AppCategory;
  system?: boolean;

  /**
   * Distribution role (v1.2 dapp-store split, see docs/core/V1.2_ADOPTION_ROADMAP.md).
   *
   * - `"system"` — first-party Elacity protocol app, ships inside the PC2
   *   binary, can't be uninstalled. v1.2.x: Market, Creator, Player, Viewer.
   * - `"dapp"`   — third-party / optional app, installable + removable from
   *   the dapp store. v1.2.x first capsules: Elastos NFT, Glide Finance.
   *
   * Consumed by the apps.ela.city UI in v1.2.1 (decides whether to render
   * an "Install" button vs an "Up to date" badge). The PC2 node itself
   * does not branch on this field today; it's metadata for the registry
   * and the start-menu surface.
   */
  role?: 'system' | 'dapp';

  capabilities?: AppCapabilities;

  /** @deprecated Use `capabilities` instead. Kept for backward compat with existing app.json files. */
  permissions?: string[];

  requirements?: {
    headers?: string[];
    services?: string[];
    popup?: boolean;
    minVersion?: string;
    /**
     * Device-compatibility gate. When present, the host must satisfy every
     * constraint or the install is refused (and the dApp Centre shows
     * "Not compatible with this device"). Used by Linux-only service apps
     * such as the Elastos Node Manager. See utils/platform.ts.
     */
    platform?: PlatformRequirement;
  };

  display?: AppDisplay;
  services?: AppService[];
  /**
   * For `type: "service"` apps only. Describes the Node backend pc2-node
   * spawns on install and stops on uninstall. See AppBackend doc above.
   */
  backend?: AppBackend;
  /**
   * Absolute filesystem paths the app writes to OUTSIDE its bundle dir.
   * On purge-uninstall, pc2-node deletes these in addition to the bundle.
   *
   * Used by services that store state outside `APP_DATA_DIR` (e.g. ENM
   * uses `/data/enm/` for chain data, binaries, and its own DB). Without
   * this declaration, app-external state is preserved across uninstalls
   * (current behaviour for non-service apps).
   *
   * Safety:
   *   - Paths must be absolute
   *   - Paths must have at least 2 segments (no `/`, `/etc`, `/home`)
   *   - Paths must not contain `..`
   *   - The trust gate on service installs ensures only signed-by-trusted
   *     publishers can declare these
   */
  externalDataDirs?: string[];
  distribution?: AppDistribution;
  dependencies?: Record<string, string>;
}

export class AppInstallService {
  private db: DatabaseManager;
  private ipfs: IPFSStorage | null;
  private appsDir: string;
  /**
   * SEC-A17 (2026-04 Wave 5.5): the only directories `installFromLocal` is
   * allowed to source from. Sideloading an app from anywhere else (e.g.
   * `data/wallets/`) would let an attacker exfiltrate the owner mnemonic
   * via the `/installed-apps/*` static route. The route layer also gates
   * `install-local` with `requireOwner`; this is defense-in-depth so any
   * future internal caller is also bound to the allowlist.
   *
   * Both `data/dev-apps/` (owner sideload workspace) and `data/test-apps/`
   * (repo-shipped bundled-app fixtures consumed by the startup sync hook
   * in `api/index.ts`) are included. Both are server-controlled paths
   * not writable via any HTTP route; widening the allowlist by these two
   * roots does not give an attacker any new plant-a-file primitive.
   */
  private allowedLocalRoots: string[];

  constructor(db: DatabaseManager, ipfs: IPFSStorage | null, dataDir: string) {
    this.db = db;
    this.ipfs = ipfs;
    this.appsDir = resolve(dataDir, 'installed-apps');

    const devAppsDir = resolve(dataDir, 'dev-apps');
    const testAppsDir = resolve(dataDir, 'test-apps');
    this.allowedLocalRoots = [devAppsDir, testAppsDir];

    if (!existsSync(this.appsDir)) {
      mkdirSync(this.appsDir, { recursive: true });
    }
    // Auto-create dev-apps (owner workspace). Do NOT auto-create test-apps:
    // it ships with the repo and its absence simply means there are no
    // bundled fixtures to sync.
    if (!existsSync(devAppsDir)) {
      mkdirSync(devAppsDir, { recursive: true });
    }
  }

  getAppsDir(): string {
    return this.appsDir;
  }

  getDevAppsDir(): string {
    // dev-apps is the first entry in allowedLocalRoots (see constructor).
    return this.allowedLocalRoots[0];
  }

  /**
   * Install an app from a manifest + CID.
   * 1. Validate manifest fields
   * 2. Fetch bundle from IPFS
   * 3. Write to disk at data/installed-apps/<name>/
   * 4. Register in database
   *
   * `onProgress` is optional — supplied by the API route so the dApp
   * Centre can show a real multi-stage progress bar instead of the old
   * "Downloading…" spinner. See DAPP-UX-POLISH-V12 #6. The callback
   * is invoked synchronously on the install-execution thread; any
   * throw is swallowed to keep the install resilient to consumer bugs.
   */
  async install(
    manifest: AppManifest,
    cid: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstalledApp> {
    const emit: InstallProgressCallback = (stage, pct, meta) => {
      if (!onProgress) return;
      try { onProgress(stage, pct, meta); } catch { /* ignore */ }
    };

    try {
      this.validateManifest(manifest);
      this.enforcePlatformCompatibility(manifest);

      const appName = manifest.name;
      const appDir = join(this.appsDir, appName);

      if (this.db.getInstalledApp(appName)) {
        throw new Error(`App "${appName}" is already installed. Uninstall first or use update.`);
      }

      // Native-module apps (e.g. ENM bundles better-sqlite3) ship one capsule
      // per architecture. When the manifest declares distribution.variants, the
      // node installs the bundle matching ITS OWN arch — never the top-level cid
      // and never whatever the client asked for. The signature is still verified
      // over the fetched bytes below, so resolving here is safe (a wrong/forged
      // cid can't pass the trusted-publisher signature check). Throws if there
      // is no capsule for this host's arch.
      let effectiveCid = cid;
      let verifyManifest = manifest;
      const variant = this.resolveDistributionVariant(manifest);
      if (variant) {
        effectiveCid = variant.cid;
        verifyManifest = {
          ...manifest,
          distribution: { ...manifest.distribution, cid: variant.cid, signature: variant.signature },
        };
        log.info(`[install] "${appName}": selected "${variant.key}" capsule (cid ${variant.cid})`);
      }

      log.info(`[install] Starting install of "${appName}" from CID ${effectiveCid}`);
      emit('fetching', 5, { message: `Fetching "${appName}" from IPFS…` });

      let bundleBuffer: Buffer;
      try {
        bundleBuffer = await this.fetchFromIPFS(effectiveCid);
      } catch (err: any) {
        throw new Error(`Failed to fetch app bundle from IPFS: ${err.message}`);
      }

      if (bundleBuffer.length > MAX_APP_SIZE_BYTES) {
        throw new Error(`App bundle exceeds ${MAX_APP_SIZE_BYTES / 1024 / 1024}MB limit`);
      }

      emit('verifying', 55, {
        bytesReceived: bundleBuffer.length,
        totalBytes: bundleBuffer.length,
      });
      const signatureVerified = this.verifyDistributionSignature(verifyManifest, bundleBuffer);

      // Service-type apps spawn a pc2-node-privileged child process. Unlike
      // other app kinds (which keep the v1 warn-only signature posture), a
      // service install MUST fail closed when the signature does not verify
      // against the fetched bundle bytes. The route-level gateServiceInstall
      // only checks that `signedBy` is a trusted *identity* and that a
      // signature is *present* — it does NOT cryptographically bind the
      // bundle. Enforcing here closes the bundle-substitution gap for the
      // privileged path (a swapped CID or forged signature can no longer
      // spawn a backend). Thrown before any bytes hit disk.
      if (manifest.type === 'service' && !signatureVerified) {
        throw new Error(
          `Service-type app "${manifest.name}" failed Ed25519 signature verification — ` +
          `refusing to install a privileged backend from an unverified bundle.`,
        );
      }

      if (existsSync(appDir)) {
        rmSync(appDir, { recursive: true, force: true });
      }
      mkdirSync(appDir, { recursive: true });

      emit('extracting', 60);
      try {
        await this.extractBundle(bundleBuffer, appDir, manifest, (filesExtracted) => {
          // Progress band 60..90 % during extraction — caps at 90 so the
          // final `registering` stage has visible headroom. We don't know
          // totalFiles upfront for a tar stream, so we smooth based on
          // file count modulo a comfortable maximum (200 files).
          const approxPct = Math.min(90, 60 + Math.min(30, Math.floor(filesExtracted / 5)));
          emit('extracting', approxPct, { filesExtracted });
        });
      } catch (err: any) {
        rmSync(appDir, { recursive: true, force: true });
        throw new Error(`Failed to extract app bundle: ${err.message}`);
      }

      const entryFile = manifest.entry || 'index.html';
      if (!existsSync(join(appDir, entryFile))) {
        rmSync(appDir, { recursive: true, force: true });
        throw new Error(`App bundle missing entry file: ${entryFile}`);
      }

      emit('registering', 95);
      const totalSize = this.dirSize(appDir);
      const now = Date.now();

      const installedApp: InstalledApp = {
        app_name: appName,
        title: manifest.title,
        version: manifest.version,
        cid: effectiveCid,
        size: totalSize,
        icon: manifest.icon || null,
        description: manifest.description || null,
        author: resolveAuthorName(manifest.author),
        permissions_json: JSON.stringify(manifest.capabilities || manifest.permissions || []),
        requirements_json: JSON.stringify(manifest.requirements || {}),
        manifest_json: JSON.stringify({
          ...manifest,
          _signatureVerified: signatureVerified,
        }),
        installed_at: now,
        updated_at: now,
      };

      this.db.registerInstalledApp(installedApp);

      log.info(`[install] ✅ "${appName}" v${manifest.version} installed (${(totalSize / 1024).toFixed(1)} KB)`);
      emit('done', 100, { message: `${manifest.title} installed` });
      return installedApp;
    } catch (err: any) {
      emit('failed', 100, { message: err?.message || String(err) });
      throw err;
    }
  }

  /**
   * Verify Ed25519 signature on an app bundle if distribution.signature is present.
   * v1: warn-only — unsigned apps still install. v2: enforced.
   *
   * Signature is verified over SHA-256(bundleBytes) using the public key
   * from distribution.signedBy (hex-encoded Ed25519 public key).
   *
   * @returns true if signature is valid, false if absent or invalid
   */
  private verifyDistributionSignature(manifest: AppManifest, bundleBuffer: Buffer): boolean {
    const dist = manifest.distribution;
    if (!dist?.signature || !dist?.signedBy) {
      log.warn(`[install] ⚠ Unsigned app bundle: "${manifest.name}" — capsule-unsigned installs will be blocked in v2`);
      return false;
    }

    try {
      const bundleHash = createHash('sha256').update(bundleBuffer).digest();
      const signatureBytes = Buffer.from(dist.signature, 'hex');
      const publicKeyBytes = Buffer.from(dist.signedBy, 'hex');

      if (publicKeyBytes.length !== 32) {
        log.warn(`[install] ⚠ Invalid signedBy key length for "${manifest.name}": expected 32 bytes, got ${publicKeyBytes.length}`);
        return false;
      }

      if (signatureBytes.length !== 64) {
        log.warn(`[install] ⚠ Invalid signature length for "${manifest.name}": expected 64 bytes, got ${signatureBytes.length}`);
        return false;
      }

      const valid = nacl.sign.detached.verify(
        new Uint8Array(bundleHash),
        new Uint8Array(signatureBytes),
        new Uint8Array(publicKeyBytes)
      );

      if (valid) {
        log.info(`[install] ✅ Signature verified for "${manifest.name}" (signed by ${dist.signedBy.substring(0, 16)}...)`);
      } else {
        log.warn(`[install] ⚠ Signature INVALID for "${manifest.name}" — bundle may have been tampered with`);
      }

      return valid;
    } catch (err: any) {
      log.warn(`[install] ⚠ Signature verification failed for "${manifest.name}": ${err.message}`);
      return false;
    }
  }

  /**
   * Install from a local directory (for development / sideloading).
   * Skips IPFS fetch — the files must already exist on disk.
   *
   * SEC-A17 (2026-04 Wave 5.5): `localDir` is constrained to live inside
   * one of the allowed roots (`data/dev-apps/` or `data/test-apps/`).
   * Without this, an attacker who reaches this code path (e.g. via a
   * future internal caller that bypasses the route-level `requireOwner`)
   * could point `localDir` at `data/wallets/` and have the mnemonic
   * copied into the static-served `installed-apps/<name>/` dir.
   */
  installFromLocal(manifest: AppManifest, localDir: string): InstalledApp {
    this.validateManifest(manifest);
    this.enforcePlatformCompatibility(manifest);

    const appName = manifest.name;
    const appDir = join(this.appsDir, appName);
    const resolvedLocal = resolve(localDir);

    // SEC-A17: strict allowlist. resolve() already collapses '..' segments,
    // so a path like `data/dev-apps/../wallets` resolves OUTSIDE every
    // allowed root and is rejected here.
    const isInsideAllowedRoot = this.allowedLocalRoots.some((root) => {
      const rootWithSep = root.endsWith(pathSep) ? root : root + pathSep;
      return resolvedLocal === root || resolvedLocal.startsWith(rootWithSep);
    });
    if (!isInsideAllowedRoot) {
      throw new Error(
        `localDir must live inside one of [${this.allowedLocalRoots.join(', ')}] (got: ${resolvedLocal})`,
      );
    }

    // SEC-A17: prevent self-targeting (copy from installed-apps into
    // installed-apps), which would also let a crafted path read out
    // another app's contents.
    const appsRootWithSep = this.appsDir.endsWith(pathSep)
      ? this.appsDir
      : this.appsDir + pathSep;
    if (resolvedLocal === this.appsDir || resolvedLocal.startsWith(appsRootWithSep)) {
      throw new Error('localDir must not point inside installed-apps/');
    }

    if (!existsSync(resolvedLocal)) {
      throw new Error(`Local directory does not exist: ${localDir}`);
    }

    const entryFile = manifest.entry || 'index.html';
    if (!existsSync(join(resolvedLocal, entryFile))) {
      throw new Error(`Local directory missing entry file: ${entryFile}`);
    }

    if (resolvedLocal !== resolve(appDir)) {
      if (existsSync(appDir)) {
        rmSync(appDir, { recursive: true, force: true });
      }
      this.copyDirRecursive(resolvedLocal, appDir);
    }

    const totalSize = this.dirSize(appDir);
    const now = Date.now();

    const installedApp: InstalledApp = {
      app_name: appName,
      title: manifest.title,
      version: manifest.version,
      cid: `local:${appName}`,
      size: totalSize,
      icon: manifest.icon || null,
      description: manifest.description || null,
      author: resolveAuthorName(manifest.author),
      permissions_json: JSON.stringify(manifest.capabilities || manifest.permissions || []),
      requirements_json: JSON.stringify(manifest.requirements || {}),
      manifest_json: JSON.stringify(manifest),
      installed_at: now,
      updated_at: now,
    };

    this.db.registerInstalledApp(installedApp);

    log.info(`[installFromLocal] ✅ "${appName}" installed from local dir (${(totalSize / 1024).toFixed(1)} KB)`);
    return installedApp;
  }

  /**
   * Uninstall an app: remove files from disk and database record.
   */
  uninstall(appName: string): boolean {
    const app = this.db.getInstalledApp(appName);
    if (!app) {
      return false;
    }

    const appDir = join(this.appsDir, appName);
    if (existsSync(appDir)) {
      rmSync(appDir, { recursive: true, force: true });
    }

    this.db.uninstallApp(appName);
    log.info(`[uninstall] ✅ "${appName}" removed`);
    return true;
  }

  /**
   * List all installed apps.
   */
  list(): InstalledApp[] {
    return this.db.listInstalledApps();
  }

  /**
   * Get a single installed app.
   */
  get(appName: string): InstalledApp | undefined {
    return this.db.getInstalledApp(appName);
  }

  /**
   * Update an app: uninstall the old version, install the new one.
   */
  async update(manifest: AppManifest, cid: string): Promise<InstalledApp> {
    const existing = this.db.getInstalledApp(manifest.name);
    if (!existing) {
      throw new Error(`App "${manifest.name}" is not installed`);
    }

    if (existing.cid === cid) {
      throw new Error(`App "${manifest.name}" is already at CID ${cid}`);
    }

    this.uninstall(manifest.name);
    return this.install(manifest, cid);
  }

  // ── Private helpers ──────────────────────────────────────

  private validateManifest(manifest: AppManifest): void {
    if (!manifest.name || typeof manifest.name !== 'string') {
      throw new Error('Manifest missing required field: name');
    }
    if (manifest.name.length > 64) {
      throw new Error(`App name exceeds 64 character limit (${manifest.name.length})`);
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(manifest.name)) {
      throw new Error('App name must be lowercase alphanumeric with hyphens (e.g. "media-player")');
    }

    if (!manifest.title || typeof manifest.title !== 'string') {
      throw new Error('Manifest missing required field: title');
    }
    if (manifest.title.length > 128) {
      throw new Error(`App title exceeds 128 character limit (${manifest.title.length})`);
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new Error('Manifest missing required field: version');
    }
    if (!SEMVER_REGEX.test(manifest.version)) {
      throw new Error(`Invalid version "${manifest.version}" — must be semver (e.g. "1.0.0")`);
    }

    if (manifest.description && manifest.description.length > 500) {
      throw new Error(`Description exceeds 500 character limit (${manifest.description.length})`);
    }

    if (manifest.entry) {
      this.validateSafePath(manifest.entry);
    }

    if (manifest.type && !VALID_APP_TYPES.includes(manifest.type)) {
      log.warn(`[validateManifest] Unknown type "${manifest.type}" for app "${manifest.name}"`);
    }

    if (manifest.type === 'service') {
      this.validateServiceBackend(manifest);
    }

    if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
      log.warn(`[validateManifest] Unknown category "${manifest.category}" for app "${manifest.name}"`);
    }

    if (manifest.capabilities) {
      this.validateCapabilities(manifest.capabilities, manifest.name);
    }

    if (manifest.requirements?.platform) {
      this.validatePlatformRequirement(manifest.requirements.platform, manifest.name);
    }
  }

  /** Shape-check requirements.platform. Throws on malformed declarations. */
  private validatePlatformRequirement(p: PlatformRequirement, appName: string): void {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      throw new Error(`App "${appName}": requirements.platform must be an object`);
    }
    for (const key of ['os', 'arch'] as const) {
      const v = p[key];
      if (v !== undefined) {
        if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) {
          throw new Error(`App "${appName}": requirements.platform.${key} must be an array of strings`);
        }
      }
    }
    if (p.minMemoryMB !== undefined && (typeof p.minMemoryMB !== 'number' || p.minMemoryMB <= 0)) {
      throw new Error(`App "${appName}": requirements.platform.minMemoryMB must be a positive number`);
    }
    if (p.reason !== undefined && typeof p.reason !== 'string') {
      throw new Error(`App "${appName}": requirements.platform.reason must be a string`);
    }
  }

  /**
   * Refuse to install an app whose requirements.platform the current host
   * does not satisfy. Defense-in-depth behind the dApp Centre's client-side
   * gate — a hand-crafted API call cannot bypass it. (For service apps this
   * is also a UX guard: installing a Linux-only service on macOS would just
   * crash-loop into quarantine; failing closed here gives a clear message.)
   */
  private enforcePlatformCompatibility(manifest: AppManifest): void {
    const req = manifest.requirements?.platform;
    if (!req) return;
    const verdict = evaluatePlatformCompatibility(req, getHostPlatformSummary());
    if (!verdict.compatible) {
      throw new Error(
        `App "${manifest.name}" is not compatible with this device: ${verdict.reason}`,
      );
    }
  }

  /**
   * Resolve the per-arch capsule for THIS host from `distribution.variants`.
   *
   * Returns null when the manifest has no variants (single-arch app — the
   * caller uses the top-level cid as-is). When variants exist, the node picks
   * the one keyed by its own `"<os>-<arch>"` (Node's os.platform()/os.arch()),
   * and throws if none matches — there is no usable capsule for this device, so
   * the install must fail closed rather than fetch a wrong-arch bundle.
   */
  private resolveDistributionVariant(
    manifest: AppManifest,
  ): (AppDistributionVariant & { key: string }) | null {
    try {
      const resolved = resolveHostVariant<AppDistributionVariant>(
        manifest.distribution?.variants,
        getHostPlatformSummary(),
      );
      if (!resolved) return null;
      return { ...resolved.variant, key: resolved.key };
    } catch (err) {
      // Re-wrap the pure resolver's generic message with the app name so the
      // operator sees which app could not be installed on this device.
      throw new Error(`App "${manifest.name}" ${(err as Error).message}`);
    }
  }

  /**
   * Service-type apps must declare a `backend` block with at minimum
   * an entry script + a port. Validated at install time so a bad
   * manifest fails loudly before pc2-node tries to spawn anything.
   */
  private validateServiceBackend(manifest: AppManifest): void {
    if (!manifest.backend) {
      throw new Error(`App "${manifest.name}" has type "service" but no "backend" block`);
    }
    const b = manifest.backend;
    if (!b.entry || typeof b.entry !== 'string') {
      throw new Error(`App "${manifest.name}": backend.entry is required and must be a string`);
    }
    this.validateSafePath(b.entry);

    if (typeof b.port !== 'number' || !Number.isInteger(b.port) || b.port < 1024 || b.port > 65535) {
      throw new Error(
        `App "${manifest.name}": backend.port must be an integer in 1024..65535 (got ${b.port})`,
      );
    }

    if (b.healthCheck !== undefined && typeof b.healthCheck !== 'string') {
      throw new Error(`App "${manifest.name}": backend.healthCheck must be a string path`);
    }

    if (b.args !== undefined && !Array.isArray(b.args)) {
      throw new Error(`App "${manifest.name}": backend.args must be an array of strings`);
    }

    if (b.env !== undefined) {
      if (typeof b.env !== 'object' || b.env === null || Array.isArray(b.env)) {
        throw new Error(`App "${manifest.name}": backend.env must be an object of string→string`);
      }
      for (const [k, v] of Object.entries(b.env)) {
        if (typeof v !== 'string') {
          throw new Error(`App "${manifest.name}": backend.env.${k} must be a string`);
        }
      }
    }

    if (b.teardown !== undefined) {
      if (typeof b.teardown !== 'object' || b.teardown === null || Array.isArray(b.teardown)) {
        throw new Error(`App "${manifest.name}": backend.teardown must be an object`);
      }
      if (typeof b.teardown.endpoint !== 'string' || !b.teardown.endpoint.startsWith('/')) {
        throw new Error(`App "${manifest.name}": backend.teardown.endpoint must be an absolute URL path (start with /)`);
      }
      if (b.teardown.timeoutMs !== undefined
          && (typeof b.teardown.timeoutMs !== 'number' || b.teardown.timeoutMs < 1000)) {
        throw new Error(`App "${manifest.name}": backend.teardown.timeoutMs must be a number >= 1000`);
      }
    }

    // externalDataDirs is on the manifest, not backend, but services are
    // the only kind that uses it — validate here while we have context.
    if (manifest.externalDataDirs !== undefined) {
      if (!Array.isArray(manifest.externalDataDirs)) {
        throw new Error(`App "${manifest.name}": externalDataDirs must be an array of absolute paths`);
      }
      for (const p of manifest.externalDataDirs) {
        if (typeof p !== 'string') {
          throw new Error(`App "${manifest.name}": externalDataDirs entries must be strings`);
        }
        // Allow ${PC2_DATA_DIR} as the leading variable so manifests don't
        // need to hardcode /var/lib/pc2/data. Other entries must be
        // absolute. The runtime purgeExternalDir applies the safety checks
        // again AFTER interpolation; this validator is just a quick
        // sanity check at install time.
        if (!p.startsWith('/') && !p.startsWith('${PC2_DATA_DIR}')) {
          throw new Error(`App "${manifest.name}": externalDataDirs path "${p}" must be absolute or start with $\{PC2_DATA_DIR\}`);
        }
        if (p.includes('..')) {
          throw new Error(`App "${manifest.name}": externalDataDirs path "${p}" must not contain '..'`);
        }
        // Refuse paths with too few segments — '/', '/etc', '/var', '/home',
        // '/usr', '/opt', '/data' alone, etc. Need at least two segments
        // beyond the root (or 1 beyond ${PC2_DATA_DIR}, since that's
        // already a deep path).
        const stripped = p.replace('${PC2_DATA_DIR}', '/_pc2_data_root');
        const segments = stripped.split('/').filter(Boolean);
        if (segments.length < 2) {
          throw new Error(`App "${manifest.name}": externalDataDirs path "${p}" is too shallow — refuse to wipe top-level dirs`);
        }
      }
    }
  }

  private validateSafePath(entry: string): void {
    const normalized = normalize(entry);
    if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('..')) {
      throw new Error(`Unsafe entry path: "${entry}"`);
    }
  }

  private validateCapabilities(caps: AppCapabilities, appName: string): void {
    const booleanFields: (keyof AppCapabilities)[] = ['wallet', 'network', 'drm'];
    for (const field of booleanFields) {
      if (caps[field] !== undefined && typeof caps[field] !== 'boolean') {
        log.warn(`[validateManifest] capabilities.${field} should be boolean in "${appName}"`);
      }
    }
    if (caps.ipc !== undefined && !Array.isArray(caps.ipc)) {
      log.warn(`[validateManifest] capabilities.ipc should be a string array in "${appName}"`);
    }
    if (caps.storage !== undefined && typeof caps.storage !== 'object') {
      log.warn(`[validateManifest] capabilities.storage should be an object in "${appName}"`);
    }
    if (caps.ipfs !== undefined && typeof caps.ipfs !== 'object') {
      log.warn(`[validateManifest] capabilities.ipfs should be an object in "${appName}"`);
    }
  }

  private async fetchFromIPFS(cid: string): Promise<Buffer> {
    if (!this.ipfs) {
      throw new Error('IPFS not available — cannot fetch remote app bundles');
    }

    // Populate the local blockstore from the network first. `getFile` only
    // reads from disk, so without this step any cold-install CID (typical
    // for dApp-Centre "Install" clicks) would surface a Node ENOENT from
    // the blockstore — which is exactly the symptom Irzhy hit on 2026-04-29.
    // `pinRemoteCID` walks the DAG via bitswap against `PC2_SUPERNODE_BOOTSTRAP`
    // and falls back to `ipfs.ela.city` gateway CAR if peers are unreachable.
    // Timeout is generous (5 min) because the Glide Finance bundle is ~80 MB
    // and a slow home connection via the gateway fallback can take a minute.
    try {
      await this.ipfs.pinRemoteCID(cid, { timeoutMs: 300_000 });
    } catch (err: any) {
      const type = err?.type;
      if (type === 'INVALID_CID') {
        throw new Error(`App bundle CID is not a valid IPFS CID: ${cid}`);
      }
      if (type === 'PRIVATE_MODE') {
        throw new Error('IPFS is in private network mode; remote app installs require public or hybrid mode');
      }
      throw new Error(`Unable to fetch app bundle from the IPFS network (CID ${cid}): ${err?.message || err}`);
    }

    return this.ipfs.getFile(cid);
  }

  /**
   * Extract a bundle buffer to the target directory.
   *
   * Supported formats (auto-detected from the magic bytes):
   *   1. tar.gz   — full multi-file capsule bundle (the format `package-app.ts` emits)
   *   2. raw HTML — single-file legacy bundle (kept for back-compat with v1.0–v1.1)
   *
   * Tar.gz extraction is hardened against the same families of issues that
   * Wave 5.5 (A17 + A19) closed for the install-from-local + multer paths:
   *   - Path traversal: every entry path must, after resolution, live strictly
   *     inside `targetDir`. We use `tar`'s built-in protections AND re-check
   *     the resolved path manually as defense-in-depth.
   *   - Symlink/hardlink/device entries: rejected outright. A capsule should
   *     never contain symlinks; allowing them would let a crafted bundle
   *     read or write outside its sandbox once the launcher follows the link.
   *   - Zip-bomb: total uncompressed bytes capped at MAX_APP_SIZE_BYTES,
   *     entry count capped at MAX_BUNDLE_ENTRIES.
   */
  private async extractBundle(
    buffer: Buffer,
    targetDir: string,
    manifest: AppManifest,
    onEntry?: (filesExtracted: number) => void,
  ): Promise<void> {
    if (buffer.length >= 2 && buffer[0] === TAR_GZIP_MAGIC[0] && buffer[1] === TAR_GZIP_MAGIC[1]) {
      await this.extractTarGz(buffer, targetDir, manifest, onEntry);
      return;
    }

    const header = buffer.subarray(0, 64).toString('utf-8').trimStart().toLowerCase();
    if (header.startsWith('<!doctype') || header.startsWith('<html') || header.startsWith('<head')) {
      const entryFile = manifest.entry || 'index.html';
      writeFileSync(join(targetDir, entryFile), buffer);
      return;
    }

    log.warn(`[extractBundle] Bundle for "${manifest.name}" doesn't look like HTML or tar.gz — writing as-is`);
    const entryFile = manifest.entry || 'index.html';
    writeFileSync(join(targetDir, entryFile), buffer);
  }

  /**
   * Defensive tar.gz extraction.
   *
   * IMPORTANT — error propagation pattern:
   * `tar` invokes `filter` and `onentry` synchronously from inside its
   * stream-data handler. Throwing from those callbacks does NOT reliably
   * surface as a `pipeline()` rejection — it can escape as an uncaught
   * exception and crash the node process (DoS vector). So instead we record
   * the first violation in `violationReason`, return false from the filter
   * to SKIP the malicious entry (so it never lands on disk), let the
   * pipeline drain normally, and then throw AFTER the pipeline resolves.
   *
   * Net effect: malicious bundles are rejected with a clean error and the
   * partial extraction is wiped by the install() try/catch.
   */
  private async extractTarGz(
    buffer: Buffer,
    targetDir: string,
    manifest: AppManifest,
    onEntry?: (filesExtracted: number) => void,
  ): Promise<void> {
    const resolvedTarget = resolve(targetDir);
    const targetWithSep = resolvedTarget.endsWith(pathSep) ? resolvedTarget : resolvedTarget + pathSep;

    let entryCount = 0;
    let totalUncompressedBytes = 0;
    let violationReason: string | null = null;

    const recordViolation = (reason: string): false => {
      if (violationReason === null) violationReason = reason;
      return false;
    };

    const extractor = tar.x({
      cwd: resolvedTarget,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      filter: (entryPath, entry) => {
        if (violationReason) return false;
        // Extract-side filter always passes a ReadEntry (the Stats variant is for
        // the create path). Cast to read .type safely.
        const readEntry = entry as tar.ReadEntry;
        const allowedTypes = new Set(['File', 'Directory']);
        if (!allowedTypes.has(readEntry.type as string)) {
          return recordViolation(`disallowed entry type "${readEntry.type}" at ${entryPath}`);
        }
        if (typeof entryPath !== 'string' || entryPath.length === 0) {
          return recordViolation('empty entry path');
        }
        const candidate = resolve(resolvedTarget, entryPath);
        if (candidate !== resolvedTarget && !candidate.startsWith(targetWithSep)) {
          return recordViolation(`path escapes bundle root: ${entryPath}`);
        }
        return true;
      },
      onentry: (entry) => {
        if (violationReason) return;
        entryCount += 1;
        if (entryCount > MAX_BUNDLE_ENTRIES) {
          violationReason = `exceeds ${MAX_BUNDLE_ENTRIES} entry cap`;
          return;
        }
        const entrySize = typeof entry.size === 'number' ? entry.size : 0;
        totalUncompressedBytes += entrySize;
        if (totalUncompressedBytes > MAX_APP_SIZE_BYTES) {
          violationReason = `uncompressed bundle exceeds ${MAX_APP_SIZE_BYTES / 1024 / 1024}MB cap`;
        }
        // Throttle progress emissions to every 5 entries — an 80 MB
        // bundle has ~200 entries and firing on every one would saturate
        // the WebSocket for no visible gain.
        if (onEntry && entryCount % 5 === 0) {
          try { onEntry(entryCount); } catch { /* ignore */ }
        }
      },
      onwarn: (code, message) => {
        log.warn(`[extractBundle] tar warning for "${manifest.name}": ${code} — ${message}`);
      },
    });

    try {
      await pipeline(Readable.from(buffer), extractor);
    } catch (err: any) {
      throw new Error(`tar.gz extraction failed: ${err.message}`);
    }

    if (violationReason) {
      throw new Error(`[extractBundle] "${manifest.name}" rejected: ${violationReason}`);
    }

    log.info(`[extractBundle] ✅ Extracted ${entryCount} entries (${(totalUncompressedBytes / 1024).toFixed(1)} KB uncompressed) for "${manifest.name}"`);
  }

  private dirSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += this.dirSize(fullPath);
        } else {
          total += statSync(fullPath).size;
        }
      }
    } catch {
      // ignore errors
    }
    return total;
  }

  private copyDirRecursive(src: string, dest: string): void {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        writeFileSync(destPath, readFileSync(srcPath));
      }
    }
  }
}
