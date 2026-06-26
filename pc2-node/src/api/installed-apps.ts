/**
 * Installed Apps API
 *
 * CRUD endpoints for the dApp Store's app install system.
 *
 * SEC-A17 (2026-04 Wave 5.5): owner-mutating routes are gated by
 * `requireOwner`. Without this, any authenticated tethered wallet could
 * call `install-local` with `localDir` pointing at the owner's mnemonic
 * store and then exfiltrate it via the `/installed-apps/*` static route.
 * Read-only listing routes remain `authenticate`-only so iframe apps and
 * the dApp Store UI continue to work for non-owner sessions.
 */

import { join, normalize, resolve as resolvePath } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { Router, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedRequest, requireOwner } from './middleware.js';
import { AppInstallService, AppManifest, InstallStage, InstallProgressMeta } from '../services/AppInstallService.js';
import { AppProcessManager } from '../services/AppProcessManager.js';
import { broadcastToUser } from '../websocket/events.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('api-installed-apps');

/**
 * Trusted publisher set for `type: "service"` apps. Service apps run as
 * pc2-node-privileged child processes, so install must be gated on a
 * verified Ed25519 signature from a publisher in this set. Read once at
 * router construction so a change requires pc2-node restart.
 *
 * Env var: PC2_TRUSTED_SERVICE_PUBLISHERS — comma-separated 64-hex
 * Ed25519 public keys. Empty/unset = all service installs are rejected.
 */
function loadTrustedPublishers(): Set<string> {
  const raw = process.env.PC2_TRUSTED_SERVICE_PUBLISHERS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[0-9a-f]{64}$/.test(s)),
  );
}

/**
 * Path on disk where an installed app's bundle root lives. Mirrors what
 * AppInstallService.install() writes to (data/installed-apps/<name>).
 */
function bundleDirFor(appsDir: string, appName: string): string {
  return join(appsDir, appName);
}

/**
 * Throw if a service-type install isn't signed by a trusted publisher.
 * Only enforced for type === 'service' — other app kinds keep their
 * existing v1 warn-only signature posture.
 */
function gateServiceInstall(manifest: AppManifest, trusted: Set<string>): void {
  if (manifest.type !== 'service') return;

  const sig = manifest.distribution?.signature;
  const signedBy = manifest.distribution?.signedBy?.toLowerCase();

  if (!sig || !signedBy) {
    throw new Error(
      'Service-type apps require distribution.signature and distribution.signedBy. ' +
      `App "${manifest.name}" has neither.`,
    );
  }
  if (trusted.size === 0) {
    throw new Error(
      'No trusted publishers configured. Service-type installs are disabled. ' +
      'Set PC2_TRUSTED_SERVICE_PUBLISHERS in pc2-node\'s env.',
    );
  }
  if (!trusted.has(signedBy)) {
    throw new Error(
      `Publisher ${signedBy.slice(0, 10)}… is not in the trusted set. ` +
      `Service-type apps must be signed by a key listed in ` +
      `PC2_TRUSTED_SERVICE_PUBLISHERS.`,
    );
  }
}

export function createInstalledAppsRouter(
  appInstallService: AppInstallService,
  processManager: AppProcessManager,
  appsDir: string,
): Router {
  const router = Router();
  const trustedPublishers = loadTrustedPublishers();
  if (trustedPublishers.size === 0) {
    log.warn('[trust] PC2_TRUSTED_SERVICE_PUBLISHERS is empty — all service-type installs will be rejected');
  } else {
    log.info(`[trust] ${trustedPublishers.size} trusted publisher(s) loaded`);
  }

  /**
   * GET /api/installed-apps
   * List all installed apps.
   *
   * Hidden apps (manifest.hidden === true, e.g. pc2-media-runtime which
   * acts as a backstage WASM helper for elacity-player) are filtered out
   * so the dApp Centre and other consumers don't surface them as
   * standalone tiles. /get-launch-apps applies the same filter — see
   * pc2-node/src/api/info.ts handleGetLaunchApps. Without this guard the
   * dApp Centre shows two "Elacity Player" cards.
   */
  router.get('/', (req: AuthenticatedRequest, res: Response) => {
    try {
      const includeHidden = String(req.query.include_hidden || '') === '1';
      const all = appInstallService.list();
      const apps = includeHidden ? all : all.filter((a) => {
        try {
          const manifest = JSON.parse(a.manifest_json || '{}');
          return !manifest.hidden;
        } catch {
          return true;
        }
      });
      res.json({ apps });
    } catch (error: any) {
      log.error('[list] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/installed-apps/:name
   * Get details for a single installed app.
   */
  router.get('/:name', (req: AuthenticatedRequest, res: Response) => {
    try {
      const app = appInstallService.get(req.params.name);
      if (!app) {
        res.status(404).json({ error: `App "${req.params.name}" not found` });
        return;
      }
      res.json({ app });
    } catch (error: any) {
      log.error('[get] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/installed-apps/:name/status
   * Live runtime status for a service-type app: running? pid? uptime?
   * crashes? quarantined? Used by the launcher tile to render
   * "running / stopped / crashed" indicators without polling the
   * filesystem.
   *
   * For non-service apps, returns { running: false, crashCount: 0 }
   * — they're inert by definition.
   */
  router.get('/:name/status', (req: AuthenticatedRequest, res: Response) => {
    try {
      const app = appInstallService.get(req.params.name);
      if (!app) {
        res.status(404).json({ error: `App "${req.params.name}" not found` });
        return;
      }
      const status = processManager.getStatus(req.params.name);
      res.json({ status });
    } catch (error: any) {
      log.error('[status] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/installed-apps/install
   * Install a new app from IPFS CID + manifest.
   *
   * Body: { manifest: AppManifest, cid: string }
   *
   * SEC-A17: requireOwner — installing an app writes to disk under
   * `data/installed-apps/<name>/` and is served by the static route.
   * Tethered wallets must not be able to plant arbitrary content there.
   */
  router.post('/install', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { manifest, cid } = req.body as { manifest: AppManifest; cid: string };

      if (!manifest || !cid) {
        res.status(400).json({ error: 'Missing required fields: manifest, cid' });
        return;
      }

      // Bridge install-pipeline progress events onto the authenticated
      // user's Socket.io room so the dApp Centre can draw a meaningful
      // progress bar. We intentionally only emit to the caller (room
      // `user:<wallet>`) — other tethered sessions don't care. See
      // DAPP-UX-POLISH-V12 #6.
      const io = (req.app.locals.io as SocketIOServer | undefined);
      const wallet = req.user?.wallet_address;
      const emitProgress = (stage: InstallStage, pct: number, meta?: InstallProgressMeta) => {
        if (!io || !wallet) return;
        broadcastToUser(io, wallet, 'install:progress', {
          appName: manifest.name,
          stage,
          pct,
          meta,
        });
      };

      // Service-type install requires a trusted-publisher signature.
      // Reject EARLY (before fetching from IPFS) so a malicious manifest
      // can't waste bandwidth.
      gateServiceInstall(manifest, trustedPublishers);

      const app = await appInstallService.install(manifest, cid, emitProgress);
      log.info(`[install] App "${app.app_name}" installed by ${wallet?.substring(0, 10)}`);

      // Spawn the backend now if this is a service-type app. If the
      // spawn fails, surface the error AND roll the install back so we
      // don't leave a half-installed app that can't ever start.
      if (manifest.type === 'service') {
        try {
          await processManager.start(app.app_name, manifest, bundleDirFor(appsDir, app.app_name));
        } catch (spawnErr: any) {
          log.error(`[install] backend spawn failed for "${app.app_name}": ${spawnErr.message}; rolling back install`);
          try { appInstallService.uninstall(app.app_name); } catch { /* ignore */ }
          throw new Error(`Backend spawn failed: ${spawnErr.message}`);
        }
      }

      // Notify room that the installed-apps set changed so clients
      // (Start menu, dApp Centre) can refresh without a page reload.
      if (io && wallet) {
        broadcastToUser(io, wallet, 'apps:changed', {
          action: 'installed',
          appName: app.app_name,
        });
      }
      res.status(201).json({ app });
    } catch (error: any) {
      log.error('[install] Error:', error.message);
      const status = error.message.includes('already installed') ? 409 : 400;
      res.status(status).json({ error: error.message });
    }
  });

  /**
   * POST /api/installed-apps/install-local
   * Install from a local directory (dev / sideloading).
   *
   * Body: { manifest: AppManifest, localDir: string }
   *
   * SEC-A17: requireOwner — `installFromLocal` copies the contents of
   * `localDir` into `data/installed-apps/<name>/`. Without owner gating
   * (and the `data/dev-apps/` allowlist enforced in AppInstallService),
   * any authenticated wallet could exfiltrate the owner's mnemonic by
   * pointing `localDir` at `data/wallets/`.
   */
  router.post('/install-local', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { manifest, localDir } = req.body as { manifest: AppManifest; localDir: string };

      if (!manifest || !localDir) {
        res.status(400).json({ error: 'Missing required fields: manifest, localDir' });
        return;
      }

      gateServiceInstall(manifest, trustedPublishers);

      const app = appInstallService.installFromLocal(manifest, localDir);
      log.info(`[install-local] App "${app.app_name}" sideloaded by ${req.user?.wallet_address?.substring(0, 10)}`);

      if (manifest.type === 'service') {
        try {
          await processManager.start(app.app_name, manifest, bundleDirFor(appsDir, app.app_name));
        } catch (spawnErr: any) {
          log.error(`[install-local] backend spawn failed for "${app.app_name}": ${spawnErr.message}; rolling back`);
          try { appInstallService.uninstall(app.app_name); } catch { /* ignore */ }
          throw new Error(`Backend spawn failed: ${spawnErr.message}`);
        }
      }

      res.status(201).json({ app });
    } catch (error: any) {
      log.error('[install-local] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/installed-apps/update
   * Update an installed app to a new CID.
   *
   * Body: { manifest: AppManifest, cid: string }
   *
   * SEC-A17: requireOwner — same reasoning as `/install`.
   */
  router.post('/update', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { manifest, cid } = req.body as { manifest: AppManifest; cid: string };

      if (!manifest || !cid) {
        res.status(400).json({ error: 'Missing required fields: manifest, cid' });
        return;
      }

      gateServiceInstall(manifest, trustedPublishers);

      // Stop the running service (if any) BEFORE update() runs, so the
      // uninstall+install sequence inside update() doesn't trip over a
      // running process holding files open. Restart on the new bundle
      // after install completes.
      if (manifest.type === 'service') {
        try { await processManager.stop(manifest.name); } catch { /* not running, fine */ }
      }

      const app = await appInstallService.update(manifest, cid);
      log.info(`[update] App "${app.app_name}" updated by ${req.user?.wallet_address?.substring(0, 10)}`);

      if (manifest.type === 'service') {
        try {
          await processManager.start(app.app_name, manifest, bundleDirFor(appsDir, app.app_name));
        } catch (spawnErr: any) {
          log.error(`[update] backend spawn failed for "${app.app_name}": ${spawnErr.message}`);
          throw new Error(`Backend spawn failed: ${spawnErr.message}`);
        }
      }

      res.json({ app });
    } catch (error: any) {
      log.error('[update] Error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/installed-apps/:name
   * Uninstall an app.
   *
   * SEC-A17: requireOwner — uninstall removes files from disk and the DB
   * row. Tethered wallets must not be able to take an app offline.
   */
  router.delete('/:name', requireOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const appName = req.params.name;
      // Default purge=true for service-type apps (operator's call 2026-05-07
      // — losing the registered supernode's keystore should be the only
      // unrecoverable thing, and the teardown hook handles that). Operator
      // can opt out with ?purge=false to preserve all app-external state.
      const purge = String(req.query.purge ?? 'true').toLowerCase() !== 'false';

      const existing = appInstallService.get(appName);
      if (!existing) {
        res.status(404).json({ error: `App "${appName}" not found` });
        return;
      }

      // Parse manifest from the DB row to recover teardown + externalDataDirs.
      let manifest: AppManifest | null = null;
      try { manifest = JSON.parse(existing.manifest_json) as AppManifest; } catch { /* malformed; treat as no metadata */ }

      // 1. Pre-stop teardown — give the service a chance to back up
      //    critical state (e.g. ENM exports keystore). Service still
      //    listening on its port at this point.
      let teardownResult: unknown = null;
      if (purge && manifest?.type === 'service' && manifest.backend?.teardown?.endpoint) {
        teardownResult = await callTeardown(manifest, processManager.getStatus(appName).port);
      }

      // 2. Stop the spawned process (if any).
      try { await processManager.stop(appName); } catch { /* not running */ }

      // 3. Remove the bundle + DB row (existing behaviour).
      const removed = appInstallService.uninstall(appName);
      if (!removed) {
        res.status(404).json({ error: `App "${appName}" not found` });
        return;
      }
      log.info(`[uninstall] App "${appName}" removed by ${req.user?.wallet_address?.substring(0, 10)}`);

      // 4. On purge, also wipe declared external data dirs.
      // purgedDirs returns the RESOLVED paths so the operator sees what
      // actually got wiped, not the manifest templates.
      const purgedDirs: string[] = [];
      if (purge && manifest?.externalDataDirs) {
        for (const dir of manifest.externalDataDirs) {
          const resolved = purgeExternalDir(dir, appName);
          if (resolved) purgedDirs.push(resolved);
        }
      }

      // Notify room so Start menu drops its cached entry.
      // See DAPP-UX-POLISH-V12 #4.
      const io = (req.app.locals.io as SocketIOServer | undefined);
      const wallet = req.user?.wallet_address;
      if (io && wallet) {
        broadcastToUser(io, wallet, 'apps:changed', {
          action: 'uninstalled',
          appName,
        });
      }
      res.json({
        success: true,
        purged: purge,
        purgedDirs,
        teardown: teardownResult,
      });
    } catch (error: any) {
      log.error('[uninstall] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

/**
 * POST to the service's teardown endpoint with a tight timeout. Errors
 * and timeouts are logged but do not block the rest of the uninstall —
 * the operator's intent is to remove the app, even if the app refuses.
 */
async function callTeardown(manifest: AppManifest, port: number | undefined): Promise<unknown> {
  const t = manifest.backend?.teardown;
  if (!t) return null;
  const targetPort = port ?? manifest.backend?.port;
  if (!targetPort) {
    log.warn(`[teardown] cannot reach "${manifest.name}" — no port`);
    return null;
  }
  const url = `http://127.0.0.1:${targetPort}${t.endpoint}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), t.timeoutMs ?? 30_000);
  try {
    log.info(`[teardown] POST ${url}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctl.signal,
    });
    // Always read the body, success or not — the operator wants to see
    // what happened either way (e.g. the actual error message on 500,
    // or the backup_path on 200).
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.warn(`[teardown] ${url} returned ${res.status}: ${JSON.stringify(body)}; continuing uninstall`);
      return { ok: false, status: res.status, body };
    }
    log.info(`[teardown] ${manifest.name} teardown OK`);
    return { ok: true, ...((typeof body === 'object' && body !== null) ? body : { data: body }) };
  } catch (err: any) {
    log.warn(`[teardown] ${manifest.name} failed: ${err.message ?? String(err)}; continuing uninstall`);
    return { ok: false, error: err.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Variable interpolation for externalDataDirs. Supports `${PC2_DATA_DIR}`
 * so manifests can declare paths relative to the operator's data root
 * without hardcoding /var/lib/pc2/data. Apps that write under
 * `${PC2_DATA_DIR}/extensions/<name>/` (the convention pc2-node's
 * extension framework uses) can declare exactly that path, and it
 * resolves correctly on any deployment.
 *
 * Only well-known PC2 vars are interpolated. Anything else is left
 * literal — and the safety checks below catch the result if it's bogus.
 */
function interpolatePath(path: string): string {
  const pc2DataDir = process.env.PC2_DATA_DIR || '/var/lib/pc2/data';
  return path.replace(/\$\{PC2_DATA_DIR\}/g, pc2DataDir);
}

/**
 * Delete one externalDataDir, with paranoid safety checks. The manifest
 * validator already rejected obvious shallow paths in the literal manifest,
 * but defense-in-depth: re-check after variable interpolation too.
 *
 * Returns the RESOLVED path on success (so the API caller sees what was
 * actually wiped, not the template) or null if safety checks refused.
 */
function purgeExternalDir(dir: string, appName: string): string | null {
  const expanded = interpolatePath(dir);
  const abs = normalize(resolvePath(expanded));
  if (!abs.startsWith('/')) {
    log.warn(`[purge] refuse non-absolute path "${dir}" → "${abs}" for "${appName}"`);
    return null;
  }
  if (abs === '/' || abs.split('/').filter(Boolean).length < 2) {
    log.warn(`[purge] refuse top-level path "${abs}" for "${appName}"`);
    return null;
  }
  if (abs.includes('..')) {
    log.warn(`[purge] refuse path with .. — "${dir}" → "${abs}" for "${appName}"`);
    return null;
  }
  try {
    if (existsSync(abs)) {
      rmSync(abs, { recursive: true, force: true });
      log.info(`[purge] wiped "${abs}" for "${appName}"`);
    }
    return abs;
  } catch (err: any) {
    log.warn(`[purge] failed to wipe "${abs}" for "${appName}": ${err.message}`);
    return null;
  }
}
