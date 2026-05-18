/**
 * PC2 Media Runtime API — DASH/CENC video playback inside PC2.
 *
 * POST /api/media/prepare-auth — Start Lit session creation, return SIWE message for user signing
 * POST /api/media/init         — Complete auth + resolve NFT, fetch MPD, recover CEK, create session
 * POST /api/media/segment      — Fetch encrypted segment from IPFS, decrypt via WASM, stream back
 */

import { Router, type Request, type Response } from 'express';
import { resolve as pathResolve, dirname, join } from 'path';
import { existsSync, readFileSync, mkdirSync as fsMkdirSync, rmSync as fsRmSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import * as crypto from 'crypto';
import { webcrypto } from 'crypto';
import { parseMPD } from '../services/media/mpdParser.js';
import { mediaSessionManager } from '../services/media/sessionManager.js';
import type { WASMRuntime } from '../services/wasm/WASMRuntime.js';
import { createLogger } from '../utils/logger.js';
import { getInternalIPFSGateway } from '../utils/urlUtils.js';

const subtle = webcrypto.subtle;

const logger = createLogger('media-api');
const router = Router();

// Pending auth requests for Datil two-phase SIWE flow (unused in Chipotle mode)
interface PendingAuth {
  sessionSigsPromise: Promise<any>;
  resolveAuthSig: (authSig: any) => void;
  rejectAuthSig: (error: Error) => void;
  createdAt: number;
}
const pendingAuthRequests = new Map<string, PendingAuth>();

setInterval(() => {
  const now = Date.now();
  pendingAuthRequests.forEach((val, key) => {
    if (now - val.createdAt > 120_000) {
      val.rejectAuthSig(new Error('Auth request expired'));
      pendingAuthRequests.delete(key);
    }
  });
}, 120_000);

// ── MPD cache for 412 two-phase /init flow ───────────────────────────
// Phase 5 cutover requires /init to return 412 + {kid, actionIpfsId}
// when no secureViewSession bundle is attached, so the player can ask
// the parent frame to sign and retry. The MPD parse is the expensive
// part of /init (IPFS fetch + PSSH extraction); we cache it briefly so
// the retry doesn't pay that cost twice.
interface CachedInitContext {
  mpdText: string;
  mpdBaseUrl: string;
  cachedAt: number;
}
const initContextCache = new Map<string, CachedInitContext>();
const INIT_CACHE_TTL_MS = 60_000;

setInterval(() => {
  const now = Date.now();
  initContextCache.forEach((val, key) => {
    if (now - val.cachedAt > INIT_CACHE_TTL_MS) initContextCache.delete(key);
  });
}, 60_000);

interface AuthenticatedRequest extends Request {
  user?: { uuid: string; username: string };
}

function getAuthToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return (req.body?.auth_token as string) || null;
}

// Use the shared getBaseUrl from utils/urlUtils.ts which correctly honours
// x-forwarded-host / x-forwarded-proto from reverse proxies (e.g. zzz.ela.city
// gateway → Jetson on plain HTTP). The previous local implementation built
// `${req.protocol}://${req.get('host')}` which produced URLs like
// `https://10.100.0.4:4200/...` when behind a gateway that set `x-forwarded-proto: https`
// but rewrote the Host header to the upstream IP — the resulting fetch would fail
// with ERR_SSL_WRONG_VERSION_NUMBER (TLS handshake against a plain-HTTP port).
// Imported lazily inside the route to avoid changing the file's import block layout.

// ── Lit Backend Selection (mirrors storage.ts) ───────────────────
type LitBackend = 'chipotle' | 'datil';
const LIT_BACKEND: LitBackend = (process.env.LIT_BACKEND as LitBackend) || 'chipotle';

// ─── POST /api/media/prepare-auth ────────────────────────────────────
// Chipotle: Two-phase SIWE auth is no longer needed (API key replaces it).
// Datil: Full two-phase SIWE auth flow.
router.post('/prepare-auth', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { buyerAddress } = req.body;
    if (!buyerAddress) {
      res.status(400).json({ error: 'buyerAddress is required' });
      return;
    }

    if (LIT_BACKEND === 'chipotle') {
      const requestId = crypto.randomUUID();
      logger.info(`[media/prepare-auth] Chipotle mode — skipping SIWE, returning stub for ${buyerAddress}`);
      res.json({ requestId, siweMessage: null, chipotleMode: true });
      return;
    }

    // Datil: full two-phase SIWE auth
    const requestId = crypto.randomUUID();
    const { getLitClient, ensureDelegateeRegistered } = await import('./storage.js');
    const client = await getLitClient();
    await ensureDelegateeRegistered(buyerAddress);

    let resolveAuthSig!: (authSig: any) => void;
    let rejectAuthSig!: (error: Error) => void;
    const authSigPromise = new Promise<any>((resolve, reject) => {
      resolveAuthSig = resolve;
      rejectAuthSig = reject;
    });

    let resolveSiweReady!: (msg: string) => void;
    const siweReadyPromise = new Promise<string>((resolve) => {
      resolveSiweReady = resolve;
    });

    const sessionSigsPromise = startUserSessionSigs(
      client, buyerAddress,
      async (siweMessage: string) => { resolveSiweReady(siweMessage); return authSigPromise; },
    );

    sessionSigsPromise.catch((err: any) => {
      logger.warn(`[media/prepare-auth] Background session ${requestId} failed: ${err.message}`);
      pendingAuthRequests.delete(requestId);
    });

    pendingAuthRequests.set(requestId, {
      sessionSigsPromise, resolveAuthSig, rejectAuthSig, createdAt: Date.now(),
    });

    const siweMessage = await Promise.race([
      siweReadyPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for Lit auth callback')), 30_000),
      ),
    ]);

    logger.info(`[media/prepare-auth] Request ${requestId}: SIWE message ready for ${buyerAddress}`);
    res.json({ requestId, siweMessage });
  } catch (error: any) {
    logger.error(`[media/prepare-auth] Error: ${error.message}`, error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/media/init ────────────────────────────────────────────
router.post('/init', async (req: AuthenticatedRequest, res: Response) => {
  const requestStart = Date.now();
  try {
    const { channel, tokenId, mediaUri: clientMediaUri, tokenURI, title: clientTitle, authority: clientAuthority } = req.body;
    if (!channel || !tokenId) {
      res.status(400).json({ error: 'channel and tokenId are required' });
      return;
    }

    const authToken = getAuthToken(req);
    if (!authToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    logger.info(`[media/init] channel=${channel} tokenId=${tokenId} mediaUri=${clientMediaUri || '(none)'}`);

    // 1. Resolve media URI — prefer what the frontend already knows
    //
    // The "local" gateway here MUST be the loopback URL (http://127.0.0.1:PORT/ipfs/),
    // not the public-facing baseUrl. These fetches are entirely backend-internal
    // (MPD parse, init segment for PSSH extraction). If we used the public URL,
    // every request would round-trip out to the reverse proxy (zzz.ela.city) and
    // back through WireGuard — wasting bandwidth and adding 200ms-2s latency, and
    // making local playback dependent on gateway uptime, which defeats the whole
    // point of running a sovereign PC2 node. See urlUtils.getInternalIPFSGateway.
    const ipfsGateway = getInternalIPFSGateway();
    const fallbackGateway = 'https://ipfs.ela.city/ipfs/';

    let mediaUri = clientMediaUri || '';
    let rawMeta: any = null;

    // If frontend didn't pass mediaUri, fetch raw token metadata from IPFS
    if (!mediaUri && tokenURI) {
      logger.info(`[media/init] No mediaUri from client, fetching tokenURI: ${tokenURI}`);
      rawMeta = await fetchJsonFromIPFS(tokenURI, ipfsGateway, fallbackGateway);
      if (rawMeta?.media?.uri) {
        mediaUri = rawMeta.media.uri.replace('ipfs://', '');
      }
    }

    if (!mediaUri) {
      res.status(400).json({ error: 'No media URI available. Ensure the asset has video/audio content.' });
      return;
    }

    // 2. Fetch and parse MPD (cached briefly for the 412 → retry round-trip)
    const cacheKey = mediaUri;
    let mpdText: string;
    let mpdBaseUrl: string;
    const cached = initContextCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < INIT_CACHE_TTL_MS) {
      mpdText = cached.mpdText;
      mpdBaseUrl = cached.mpdBaseUrl;
      logger.info(`[media/init] MPD cache hit for ${cacheKey}`);
    } else {
      // MPD fetch with explicit per-gateway timeouts so a hung public IPFS
      // gateway (e.g. when the CID has not propagated to ipfs.ela.city yet)
      // never stalls playback for more than MPD_FETCH_TIMEOUT_MS.
      // v1.2.7: lowered from 10_000 to 5_000 so the worst-case both-gateways
      // miss path (10s instead of 20s) stays well under typical reverse-proxy
      // timeouts (30s) and the user gets the friendly "Downloading…" UI from
      // the pin_in_progress fallback faster instead of seeing a generic 502.
      const MPD_FETCH_TIMEOUT_MS = 5_000;
      const mpdUrl = ipfsGateway + mediaUri + '/stream.mpd';
      const fallbackUrl = fallbackGateway + mediaUri + '/stream.mpd';

      const fetchWithTimeout = async (url: string) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), MPD_FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(url, { signal: controller.signal });
          return { response, error: undefined as { code: string; message: string } | undefined };
        } catch (err: any) {
          const cause = err?.cause;
          const code = err?.name === 'AbortError' ? 'TIMEOUT' : (cause?.code || 'FETCH_ERROR');
          const message = cause?.message || err?.message || 'Unknown fetch error';
          return { response: undefined as Awaited<ReturnType<typeof fetch>> | undefined, error: { code, message } };
        } finally {
          clearTimeout(timer);
        }
      };

      logger.info(`[media/init] Fetching MPD: ${mpdUrl}`);
      const local = await fetchWithTimeout(mpdUrl);
      if (local.response?.ok) {
        mpdText = await local.response.text();
      } else {
        const localStatus = local.response?.status;
        const localErr = local.error;
        logger.info(
          `[media/init] Local MPD failed (${localStatus ?? localErr?.code}: ${localErr?.message ?? 'non-OK status'}), trying fallback: ${fallbackUrl}`,
        );
        const remote = await fetchWithTimeout(fallbackUrl);
        if (!remote.response?.ok) {
          const remoteStatus = remote.response?.status;
          const remoteErr = remote.error;

          // C1: when both gateways fail, check whether this CID is mid-pin on
          // this node. The download-first buy flow kicks off a pin job at
          // purchase time; if the user clicks Play before that pin completes,
          // local gateway 404s (blocks not all here yet) and public gateway
          // is unlikely to have the asset (just minted on a peer). The legacy
          // error told the user to "ask the publisher to peer with
          // ipfs.ela.city", which is the wrong action — they just need to
          // wait for the pin they ALREADY started to finish. Surface real pin
          // progress so the player can show a friendly progress UI and
          // auto-retry instead of bouncing the user.
          const db = req.app.locals.db;
          let pinDetail: any = null;
          try {
            pinDetail = db?.getPinnedCIDDetail ? db.getPinnedCIDDetail(mediaUri) : null;
          } catch (e: any) {
            logger.warn(`[media/init] getPinnedCIDDetail failed: ${e?.message}`);
          }
          if (pinDetail && (pinDetail.pin_status === 'pinning' || pinDetail.pin_status === 'queued')) {
            const sizeBytes = pinDetail.size || 0;
            const bytesDownloaded = Math.min(
              pinDetail.bytes_downloaded || 0,
              sizeBytes || pinDetail.bytes_downloaded || 0,
            );
            const progressPercent = sizeBytes > 0
              ? Math.min(99, Math.floor((bytesDownloaded / sizeBytes) * 100))
              : 0;
            res.status(503).json({
              error: 'pin_in_progress',
              code: 'pin_in_progress',
              message: progressPercent > 0
                ? `Downloading content to your node — ${progressPercent}% complete. This page will retry automatically.`
                : 'Downloading content to your node. This page will retry automatically.',
              progressPercent,
              bytesDownloaded,
              sizeBytes,
              mediaUri,
            });
            return;
          }
          if (pinDetail && pinDetail.pin_status === 'failed') {
            // v1.2.7: don't dead-end on a stale 'failed' flag. A 'failed' row
            // here means the seeding service gave up after its retry budget
            // (~5 min), but in practice the asset often becomes reachable
            // shortly after — either the publisher's node came back online,
            // the public-gateway resolver auto-imported the CAR, or DHT
            // propagation finally caught up. The previous "Local download
            // failed — retry from asset page" message was a UX dead-end:
            // there's no obvious retry button, and clicking Play again just
            // hit the same stale flag for the same misleading message.
            //
            // Instead: kick off a fresh seedContent at immediate priority,
            // reset the byte counter so the progress UI starts at 0, and
            // downgrade the response to 'pin_in_progress' so the player's
            // existing 5-min auto-retry loop takes over with the friendly
            // "Downloading content to your node…" UI. If the pin truly can't
            // be fetched after 60 retries × 5s = 5 min, the player surfaces
            // a real error then.
            const seedingService = req.app.locals.seedingService;
            const wallet = pinDetail.wallet_address;
            if (seedingService && wallet) {
              logger.info(`[media/init] Auto-retry: re-queuing failed pin for ${mediaUri} (wallet ${wallet.slice(0, 10)}…)`);
              try {
                if (typeof db?.resetPinBytesDownloaded === 'function') {
                  db.resetPinBytesDownloaded(mediaUri);
                }
                seedingService.seedContent(mediaUri, wallet, {
                  priority: 'immediate',
                  estimatedSizeBytes: pinDetail.size || 0,
                });
              } catch (e: any) {
                logger.warn(`[media/init] Pin auto-retry failed: ${e?.message}`);
              }
            }
            res.status(503).json({
              error: 'pin_in_progress',
              code: 'pin_in_progress',
              message: 'Re-attempting download — this page will retry automatically.',
              progressPercent: 0,
              bytesDownloaded: 0,
              sizeBytes: pinDetail.size || 0,
              mediaUri,
            });
            return;
          }

          const bothTimedOut = localErr?.code === 'TIMEOUT' && remoteErr?.code === 'TIMEOUT';
          res.status(502).json({
            error: bothTimedOut
              ? 'Content not yet reachable on IPFS. This asset was published from another node and has not propagated to the public gateway yet. Retry shortly, or ask the publisher to peer with ipfs.ela.city.'
              : `Failed to fetch MPD from both gateways (local: ${localStatus ?? localErr?.code}, public: ${remoteStatus ?? remoteErr?.code})`,
            localGateway: { status: localStatus, cause: localErr },
            publicGateway: { status: remoteStatus, cause: remoteErr },
            mediaUri,
          });
          return;
        }
        mpdText = await remote.response.text();
      }
      mpdBaseUrl = ipfsGateway + mediaUri + '/';
      initContextCache.set(cacheKey, { mpdText, mpdBaseUrl, cachedAt: Date.now() });
    }

    const mpd = parseMPD(mpdText, mpdBaseUrl);
    logger.info(`[media/init] Parsed MPD: ${mpd.tracks.length} tracks, ${mpd.duration.toFixed(1)}s`);

    // 3. Recover CEK via Lit Protocol
    // For media, encryption params are in the PSSH boxes of the init segment (not in token metadata).
    // Fetch the first video init segment and extract PSSH JSON.
    const videoTrack = mpd.tracks.find(t => t.type === 'video') || mpd.tracks[0];
    if (!videoTrack) {
      res.status(400).json({ error: 'No tracks found in MPD' });
      return;
    }

    logger.info(`[media/init] Fetching init segment for PSSH extraction: ${videoTrack.initUrl}`);
    const initBytes = await fetchBytesFromIPFS(videoTrack.initUrl, ipfsGateway, fallbackGateway);
    const psshEntries = extractPSSHJson(initBytes);

    if (psshEntries.length === 0) {
      res.status(400).json({ error: 'No PSSH encryption data found in init segment. Content may not be DRM-protected.' });
      return;
    }

    // Prefer the unified chipotle media protection type.
    // Legacy media may still contain SA/EOA-split protection types.
    const buyerAddr = req.body.buyerAddress || '';
    const hasUnifiedEntry = psshEntries.some(p => p.protectionType === 'cenc:lit-aes-gcm-v3');
    const hasSAEntry = psshEntries.some(p => p.protectionType === 'cenc:lit-drm-sa-v1');
    let isSmartAccountUser = false;

    if (!hasUnifiedEntry && hasSAEntry && buyerAddr) {
      try {
        isSmartAccountUser = await detectSmartAccountUser(buyerAddr, psshEntries);
      } catch (err: any) {
        logger.warn(`[media/init] SA detection failed (will try EOA path): ${err.message}`);
      }
    }

    let preferredType = 'cenc:lit-aes-gcm-v3';
    if (!hasUnifiedEntry) {
      preferredType = isSmartAccountUser ? 'cenc:lit-drm-sa-v1' : 'cenc:lit-drm-v1';
    }
    const pssh = psshEntries.find(p => p.protectionType === preferredType)
      || psshEntries[0];

    logger.info(`[media/init] Using PSSH: type=${pssh.protectionType}, action=${pssh.data?.actionIpfsId}, isSmartAccount=${isSmartAccountUser}`);

    const encData = pssh.data || {};

    // Extract KID from access control conditions or MPD ContentProtection
    let kid = encData.kid || '';
    if (!kid) {
      const conditions = encData.unifiedAccessControlConditions || [];
      for (const cond of conditions) {
        if (cond.parameters && Array.isArray(cond.parameters)) {
          const kidParam = cond.parameters.find((p: string) => typeof p === 'string' && /^0x[0-9a-f]{32}$/i.test(p));
          if (kidParam) { kid = kidParam; break; }
        }
      }
    }
    // Fallback: extract from MPD XML cenc:default_KID
    if (!kid) {
      const kidMatch = mpdText.match(/default_KID="([^"]+)"/);
      if (kidMatch) {
        kid = '0x' + kidMatch[1].replace(/-/g, '');
      }
    }

    const litParams: {
      litCiphertext: string;
      dataToEncryptHash: string;
      kid: string;
      actionCid: string;
      authority: string;
      chain: string;
      chainId: number;
      rpc: string;
      litBackend: string;
      secureViewSession?: import('./chipotle-client.js').SecureViewSessionBundle;
    } = {
      litCiphertext: encData.ciphertext || '',
      dataToEncryptHash: encData.hash || encData.dataToEncryptHash || '',
      kid,
      actionCid: encData.actionIpfsId || '',
      authority: encData.authority || clientAuthority || '',
      chain: encData.chain || 'base',
      chainId: encData.chainId || 8453,
      rpc: encData.rpc || '',
      litBackend: (encData.litBackend as string) || LIT_BACKEND || 'datil',
    };

    if (!litParams.litCiphertext || !litParams.dataToEncryptHash || !litParams.actionCid) {
      res.status(400).json({ error: 'PSSH data incomplete — missing ciphertext, hash, or actionIpfsId' });
      return;
    }

    // Phase 5 sigauth cutover: when the chipotle backend is active, the
    // server-controlled NON_MEDIA_ACTION_CID is the only action permitted to
    // run. Legacy assets carry a different `actionIpfsId` in their PSSH
    // (recorded at mint time, often a v0 non-sigauth CID) — that value is
    // ignored for the actual Lit invocation and replaced with the
    // authoritative server-configured sigauth action so that the user's
    // signed delegation (`actionIpfsId = NON_MEDIA_ACTION_CID`) matches what
    // is executed inside the TEE. Datil legacy media path keeps the PSSH CID.
    if ((litParams.litBackend || '').toLowerCase() === 'chipotle') {
      const { getNonMediaActionCid } = await import('./storage.js');
      const serverActionCid = getNonMediaActionCid();
      if (!serverActionCid) {
        res.status(500).json({ error: 'Server NON_MEDIA_ACTION_CID is not configured' });
        return;
      }
      if (serverActionCid !== litParams.actionCid) {
        logger.info(
          `[media/init] Overriding PSSH actionIpfsId for chipotle: pssh=${litParams.actionCid} → server=${serverActionCid}`,
        );
      }
      litParams.actionCid = serverActionCid;
    }

    // ── Phase 5 sigauth: two-phase secure-view bundle ──────────────
    // The player can't sign before /init because `kid` and
    // `actionIpfsId` are only known after server-side MPD/PSSH parse.
    // If the client didn't attach a bundle yet, hand them back the
    // {kid, actionIpfsId} so they can request one from the parent
    // wallet bridge and retry. The MPD is cached above so the retry
    // skips the IPFS round-trip.
    const incomingBundle = req.body.secureViewSession;
    if (!incomingBundle || !incomingBundle.delegationCanonical || !incomingBundle.requestSig) {
      const normalisedKid = litParams.kid && litParams.kid.startsWith('0x')
        ? litParams.kid
        : (litParams.kid ? `0x${litParams.kid}` : '');
      logger.info(`[media/init] Phase-1 412 → needsSecureView kid=${normalisedKid} actionIpfsId=${litParams.actionCid}`);
      res.status(412).json({
        needsSecureView: {
          kid: normalisedKid,
          actionIpfsId: litParams.actionCid,
        },
      });
      return;
    }
    litParams.secureViewSession = incomingBundle;

    const { getServerWallet } = await import('./storage.js');
    const wallet = await getServerWallet();
    const buyerAddress = req.body.buyerAddress || '';

    let prebuiltSessionSigs: any = null;

    if (LIT_BACKEND === 'datil') {
      // Datil: resolve two-phase auth if requestId provided
      const requestId = req.body.requestId || '';
      const litAuthSig = req.body.litAuthSig || null;
      if (requestId && litAuthSig?.sig) {
        const pending = pendingAuthRequests.get(requestId);
        if (!pending) {
          res.status(400).json({ error: 'Auth session expired or invalid. Please try again.' });
          return;
        }
        pending.resolveAuthSig(litAuthSig);
        try {
          prebuiltSessionSigs = await pending.sessionSigsPromise;
          logger.info(`[media/init] Two-phase session sigs ready (${Object.keys(prebuiltSessionSigs).length} nodes)`);
        } catch (sessErr: any) {
          pendingAuthRequests.delete(requestId);
          res.status(500).json({ error: `Lit session creation failed: ${sessErr.message}` });
          return;
        }
        pendingAuthRequests.delete(requestId);
      }
    }

    const cekBase64 = await recoverMediaCEK(litParams, wallet, prebuiltSessionSigs, buyerAddress);
    logger.info(`[media/init] CEK recovered in ${Date.now() - requestStart}ms`);

    // 4. Create session
    const session = mediaSessionManager.create({
      cekBase64,
      mpd,
      mpdBaseUrl,
      channel,
      tokenId,
      authToken,
    });

    // Build track info for the frontend (without CEK)
    const trackInfo = mpd.tracks.map((t, i) => ({
      index: i,
      type: t.type,
      codec: t.codec,
      mimeType: t.mimeType,
      bandwidth: t.bandwidth,
      width: t.width,
      height: t.height,
      representationId: t.representationId,
      segmentCount: t.segments.length,
      segmentStarts: t.segments.map(s => Math.round(s.startTime * 1000) / 1000),
    }));

    res.json({
      sessionId: session.id,
      title: clientTitle || rawMeta?.name || 'Untitled',
      duration: mpd.duration,
      tracks: trackInfo,
      totalTimeMs: Date.now() - requestStart,
    });
  } catch (error: any) {
    const cause = error?.cause;
    const causeMessage = cause?.message;
    const causeCode = cause?.code;
    logger.error(
      `[media/init] Error: ${error.message}${causeMessage ? ` (cause: ${causeCode || ''} ${causeMessage})` : ''}`,
      error,
    );
    res.status(500).json({
      error: error.message,
      ...(causeMessage ? { cause: { code: causeCode, message: causeMessage } } : {}),
    });
  }
});

// ─── POST /api/media/segment ─────────────────────────────────────────
router.post('/segment', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId, trackIndex, segmentNumber, init } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const authToken = getAuthToken(req);
    if (!authToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const session = mediaSessionManager.get(sessionId, authToken);
    if (!session) {
      res.status(410).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
      return;
    }

    const trackIdx = typeof trackIndex === 'number' ? trackIndex : 0;
    const track = session.mpd.tracks[trackIdx];
    if (!track) {
      res.status(400).json({ error: `Track ${trackIdx} not found` });
      return;
    }

    // Determine which URL to fetch
    let segmentUrl: string;
    if (init) {
      segmentUrl = track.initUrl;
    } else {
      const segNum = typeof segmentNumber === 'number' ? segmentNumber : 0;
      const seg = track.segments[segNum];
      if (!seg) {
        res.status(400).json({ error: `Segment ${segNum} not found (track has ${track.segments.length} segments)` });
        return;
      }
      segmentUrl = seg.url;
    }

    logger.info(`[media/segment] Fetching: ${segmentUrl.substring(0, 80)}...`);

    // Fetch encrypted segment from IPFS
    const ipfsService = req.app?.locals?.ipfs;
    const segmentBytes = await fetchSegmentBytes(segmentUrl, ipfsService);

    if (init) {
      // Cache raw init segment for WASM decryption (tenc extraction)
      session.initSegments.set(trackIdx, segmentBytes);

      // Phase 2-D-helpers: route handler reads wasmRuntime from app.locals
      // and threads it through to all media WASM helpers below.
      const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;

      // Strip CENC encryption signaling via WASM (encv → av01, enca → mp4a/Opus,
      // remove sinf box, strip pssh boxes). Uses strip_init mode in cenc-decrypt.
      let cleanInit = await stripInitViaWASM(segmentBytes, wasmRuntime);
      logger.info(`[media/segment] Init segment: raw=${segmentBytes.length}B → clean=${cleanInit.length}B (stripped ${segmentBytes.length - cleanInit.length}B of DRM signaling)`);

      // Split multi-track init to single-track for MSE compatibility.
      // MSE requires each SourceBuffer to receive only its own track.
      cleanInit = await splitInitForTrackWithFallback(cleanInit, track.type, wasmRuntime);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(cleanInit.length));
      res.send(cleanInit);
      return;
    }

    // Get cached init segment for this track (provides tenc for IV size)
    const initSegForTrack = session.initSegments.get(trackIdx) || null;

    // Phase 2-D-helpers: route handler reads wasmRuntime from app.locals.
    const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;

    // Decrypt + strip via WASM (combined: decrypt samples then remove senc/saiz/saio boxes)
    const cleanSegment = await decryptSegmentViaWASM(
      segmentBytes,
      session.cekBase64,
      wasmRuntime,
      initSegForTrack,
    );

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(cleanSegment.length));
    res.send(cleanSegment);
  } catch (error: any) {
    logger.error(`[media/segment] Error: ${error.message}`, error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Smart Account Detection ─────────────────────────────────────────

const SA_FACTORY = '0xb3f15a44f91a08a93a11c6fbf6a4933c623275fe';
const SA_ENTRYPOINT = '0xba418fa699622de824b258c61eb150ed7a13967b';

/**
 * Detect if a user's EOA has a deployed Smart Account on Base (chain 8453).
 * Calls the factory contract's getAddress(entryPoint, initData, salt) view function
 * to derive the counterfactual SA address, then checks if it has deployed code.
 */
async function detectSmartAccountUser(
  eoaAddress: string,
  psshEntries: Array<{ protectionType: string; data: any }>,
): Promise<boolean> {
  // Extract RPC URL from PSSH data (the Lit Action embeds it)
  const saEntry = psshEntries.find(p => p.protectionType === 'cenc:lit-drm-sa-v1')
    || psshEntries.find(p => p.protectionType === 'cenc:lit-aes-gcm-v3')
    || psshEntries[0];
  const { getBaseRpcUrl } = await import('../utils/rpc.js');
  const rpcUrl = saEntry?.data?.rpc || getBaseRpcUrl();

  // Build calldata for factory.getAddress(entryPoint, initData, salt=0)
  // initData = 0x2ede3bc0 + eoaAddress (padded to 32 bytes)
  const cleanAddr = eoaAddress.replace('0x', '').toLowerCase().padStart(64, '0');
  const initData = '2ede3bc0' + cleanAddr;
  const initDataLen = (initData.length / 2).toString(16).padStart(64, '0');

  const callData = '0x2e7a1a83' +
    SA_ENTRYPOINT.replace('0x', '').padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000060' +
    '0000000000000000000000000000000000000000000000000000000000000000' +
    initDataLen +
    initData.padEnd(Math.ceil(initData.length / 64) * 64, '0');

  // eth_call to factory → derive SA address
  const addrResult = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: SA_FACTORY, data: callData }, 'latest'],
    }),
  });
  const addrJson = await addrResult.json() as any;
  if (addrJson.error || !addrJson.result || addrJson.result === '0x') {
    logger.warn(`[media/SA] Factory call failed: ${JSON.stringify(addrJson.error || 'empty result')}`);
    return false;
  }

  const smartAccountAddr = '0x' + addrJson.result.slice(-40);
  logger.info(`[media/SA] EOA ${eoaAddress} → derived SA ${smartAccountAddr}`);

  // Check if the SA has deployed code (i.e., has been activated)
  const codeResult = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'eth_getCode',
      params: [smartAccountAddr, 'latest'],
    }),
  });
  const codeJson = await codeResult.json() as any;
  const hasCode = codeJson.result && codeJson.result !== '0x' && codeJson.result.length > 2;

  logger.info(`[media/SA] Smart Account ${smartAccountAddr} deployed=${hasCode}`);
  return hasCode;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveIpfsUrl(url: string, gateway: string): string {
  if (!url) return '';
  if (url.startsWith('ipfs://')) return gateway + url.slice(7);
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return gateway + url;
}

async function fetchJsonFromIPFS(cid: string, localGateway: string, publicGateway: string): Promise<any> {
  const cleanCid = cid.replace('ipfs://', '');
  const localUrl = localGateway + cleanCid;
  const publicUrl = publicGateway + cleanCid;

  try {
    const localRes = await fetch(localUrl);
    if (localRes.ok) return await localRes.json();
    logger.info(`[media] Local IPFS fetch failed (${localRes.status}), trying public`);
  } catch {
    logger.info('[media] Local IPFS unreachable, trying public');
  }

  const publicRes = await fetch(publicUrl);
  if (!publicRes.ok) throw new Error(`Failed to fetch ${cleanCid} from both gateways`);
  return await publicRes.json();
}

async function fetchBytesFromIPFS(pathOrUrl: string, localGateway: string, publicGateway: string): Promise<Buffer> {
  // If already a full URL (from resolved template), use it directly.
  // We must catch BOTH non-OK responses AND thrown fetch errors (timeout,
  // network down, TLS handshake failure) — earlier this function only handled
  // non-OK and let throws bubble, which prevented fallback when the local
  // gateway URL was malformed (e.g. https://internal-ip:4200 → SSL error).
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    let primaryStatus: number | string = 'fetch threw';
    try {
      const res = await fetch(pathOrUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      primaryStatus = res.status;
    } catch (err: any) {
      const cause = err?.cause;
      primaryStatus = cause?.code || err?.code || err?.message || 'fetch threw';
      logger.warn(`[media] Primary IPFS fetch threw (${primaryStatus}): ${pathOrUrl.substring(0, 80)} — trying public gateway`);
    }
    const ipfsMatch = pathOrUrl.match(/\/ipfs\/(.+)/);
    if (ipfsMatch) {
      const publicUrl = publicGateway + ipfsMatch[1];
      try {
        const pubRes = await fetch(publicUrl);
        if (pubRes.ok) return Buffer.from(await pubRes.arrayBuffer());
        throw new Error(`Public gateway returned ${pubRes.status}`);
      } catch (pubErr: any) {
        const pubCause = pubErr?.cause;
        const pubReason = pubCause?.code || pubErr?.message || 'unknown';
        throw new Error(`Failed to fetch ${ipfsMatch[1]} from both gateways (local: ${primaryStatus}, public: ${pubReason})`);
      }
    }
    throw new Error(`Failed to fetch: ${pathOrUrl} (${primaryStatus})`);
  }

  const cleanPath = pathOrUrl.replace('ipfs://', '').replace(/^\/ipfs\//, '');
  const localUrl = localGateway + cleanPath;
  const publicUrl = publicGateway + cleanPath;

  try {
    const localRes = await fetch(localUrl);
    if (localRes.ok) {
      const buf = await localRes.arrayBuffer();
      logger.info(`[media] Fetched ${buf.byteLength} bytes from local IPFS: ${cleanPath}`);
      return Buffer.from(buf);
    }
    logger.info(`[media] Local fetch failed (${localRes.status}), trying public gateway`);
  } catch {
    logger.info('[media] Local IPFS unreachable for bytes, trying public');
  }

  const publicRes = await fetch(publicUrl);
  if (!publicRes.ok) throw new Error(`Failed to fetch bytes ${cleanPath} from both gateways`);
  const buf = await publicRes.arrayBuffer();
  return Buffer.from(buf);
}

/**
 * Extract PSSH JSON payloads from an fMP4 init segment.
 * PSSH boxes contain JSON-encoded Lit Protocol DRM parameters.
 * The JSON is embedded as raw bytes in the PSSH box data field.
 *
 * The Elacity PSSH JSON has the form:
 *   {"protocolVersion":"...","protectionType":"...","data":{"actionIpfsId":"...",...}}
 * We search for `{"protocolVersion"` or `{"data":{` to find the JSON start,
 * then use brace counting to extract the complete object.
 */
function extractPSSHJson(initSegment: Buffer): Array<{ protectionType: string; data: any }> {
  const results: Array<{ protectionType: string; data: any }> = [];
  const text = initSegment.toString('binary');

  const markers = ['{"protocolVersion":', '{"data":{', '{"protectionType":'];
  const visited = new Set<number>();

  for (const marker of markers) {
    let searchStart = 0;
    while (true) {
      const pos = text.indexOf(marker, searchStart);
      if (pos === -1) break;
      if (visited.has(pos)) { searchStart = pos + 1; continue; }
      visited.add(pos);

      let depth = 0;
      let end = -1;
      for (let i = pos; i < text.length && i < pos + 16384; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }

      if (end === -1) { searchStart = pos + 1; continue; }

      const jsonStr = text.substring(pos, end);
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.data?.actionIpfsId) {
          results.push({
            protectionType: parsed.protectionType || 'unknown',
            data: parsed.data,
          });
        }
      } catch (e) {
        logger.warn(`[media] Failed to parse PSSH JSON at offset ${pos}: ${(e as Error).message}`);
      }
      searchStart = end;
    }
  }

  logger.info(`[media] Extracted ${results.length} PSSH entries from init segment (${initSegment.length} bytes)`);
  return results;
}

// ── JS strip functions — replaced by Rust/WASM in cenc-decrypt crate ──────────
// Kept commented for one release cycle as a safety net. If WASM stripping works
// correctly across all media types, these can be deleted.
//
// function stripEncryptionSignaling(init: Buffer): Buffer { ... }
// function stripSegmentEncryptionBoxes(segment: Buffer): Buffer { ... }
// function findBoxStart(buf: Buffer, start: number, end: number, boxType: string): number { ... }
// function findBoxPath(buf: Buffer, start: number, end: number, path: string[]): { ... } | null { ... }

const FALLBACK_IPFS_GATEWAY = 'https://ipfs.ela.city/ipfs/';

/**
 * WASM-first init segment splitting with JS fallback.
 * Tries the mp4-split WASM module's split_init mode for performance and
 * to keep binary data out of V8's GC heap. Falls back to the JS
 * implementation if WASM is unavailable or fails.
 */
async function splitInitForTrackWithFallback(
  initSegment: Buffer,
  trackType: 'video' | 'audio',
  wasmRuntime: WASMRuntime,
): Promise<Buffer> {
  try {
    const wasmBinary = await loadMp4SplitWasmBinary();
    const result = await wasmRuntime.executeMp4InitSplit(
      wasmBinary,
      initSegment,
      trackType,
      { timeoutMs: 10000 },
    );

    if (result.success && result.initSegment) {
      logger.info(`[media/split] WASM split_init for ${trackType}: ${initSegment.length}B → ${result.initSegment.length}B (removed ${result.tracksRemoved} track(s), ${result.executionTimeMs}ms)`);
      return result.initSegment;
    }

    logger.warn(`[media/split] WASM split_init failed (${result.error}), falling back to JS`);
  } catch (wasmErr: any) {
    logger.warn(`[media/split] WASM split_init error: ${wasmErr.message}, falling back to JS`);
  }

  return splitInitForTrack(initSegment, trackType);
}

/**
 * Split a multi-track fMP4 init segment into a single-track init segment.
 *
 * MSE requires each SourceBuffer to receive an init segment containing only
 * its own track. When Bento4's mp4fragment produces a shared init segment
 * (both video and audio trak boxes inside the same moov), we must rebuild
 * moov to contain only the requested track.
 *
 * JS fallback implementation — kept for robustness if WASM path fails.
 *
 * @param initSegment  The full multi-track init segment (ftyp + moov).
 * @param trackType    'video' or 'audio' — determines which trak to keep.
 * @returns            A new init segment with only the requested track.
 */
function splitInitForTrack(initSegment: Buffer, trackType: 'video' | 'audio'): Buffer {
  const readU32 = (buf: Buffer, off: number) => buf.readUInt32BE(off);
  const boxType = (buf: Buffer, off: number) => buf.toString('ascii', off + 4, off + 8);

  const findChildren = (buf: Buffer, start: number, end: number): Array<{ pos: number; size: number; type: string }> => {
    const children: Array<{ pos: number; size: number; type: string }> = [];
    let pos = start;
    while (pos + 8 <= end) {
      const size = readU32(buf, pos);
      if (size < 8 || pos + size > end) break;
      children.push({ pos, size, type: boxType(buf, pos) });
      pos += size;
    }
    return children;
  };

  // Find ftyp and moov
  const topBoxes = findChildren(initSegment, 0, initSegment.length);
  const ftyp = topBoxes.find(b => b.type === 'ftyp');
  const moov = topBoxes.find(b => b.type === 'moov');
  if (!ftyp || !moov) {
    logger.warn('[media/split] No ftyp or moov found, returning original init');
    return initSegment;
  }

  const moovChildren = findChildren(initSegment, moov.pos + 8, moov.pos + moov.size);
  const traks = moovChildren.filter(b => b.type === 'trak');

  if (traks.length <= 1) {
    return initSegment;
  }

  // Determine handler type for each trak to identify video vs audio
  const targetHandler = trackType === 'video' ? 'vide' : 'soun';
  let targetTrak: { pos: number; size: number; type: string } | null = null;
  let targetTrackId = 0;

  for (const trak of traks) {
    const trakData = initSegment.subarray(trak.pos, trak.pos + trak.size);
    const hdlrIdx = trakData.indexOf(Buffer.from('hdlr'));
    if (hdlrIdx > 0) {
      // hdlr box: indexOf finds 'hdlr' at +4 from box start.
      // Layout after 'hdlr': version/flags(4) + pre_defined(4) + handler_type(4)
      // So handler_type is at hdlrIdx + 12
      const ht = trakData.toString('ascii', hdlrIdx + 12, hdlrIdx + 16);
      if (ht === targetHandler) {
        targetTrak = trak;
        // Extract track_id from tkhd (first child of trak, track_id at offset +12 for v0, +20 for v1)
        const tkhdIdx = trakData.indexOf(Buffer.from('tkhd'));
        if (tkhdIdx > 0) {
          const tkhdVersion = trakData[tkhdIdx + 4];
          targetTrackId = tkhdVersion === 1
            ? trakData.readUInt32BE(tkhdIdx + 4 + 4 + 8 + 8)  // version(1) + flags(3) + creation(8) + modification(8) + track_id(4)
            : trakData.readUInt32BE(tkhdIdx + 4 + 4 + 4 + 4);  // version(1) + flags(3) + creation(4) + modification(4) + track_id(4)
        }
        break;
      }
    }
  }

  if (!targetTrak) {
    logger.warn(`[media/split] No ${trackType} trak found, returning original init`);
    return initSegment;
  }

  // Rebuild moov: mvhd + target trak + mvex (with only target trex) + udta
  const pieces: Buffer[] = [];

  // ftyp
  pieces.push(initSegment.subarray(ftyp.pos, ftyp.pos + ftyp.size));

  // Build moov contents
  const moovParts: Buffer[] = [];

  for (const child of moovChildren) {
    if (child.type === 'mvhd' || child.type === 'udta') {
      moovParts.push(initSegment.subarray(child.pos, child.pos + child.size));
    } else if (child.type === 'trak' && child.pos === targetTrak.pos) {
      moovParts.push(initSegment.subarray(child.pos, child.pos + child.size));
    } else if (child.type === 'mvex') {
      // Rebuild mvex keeping only the trex for our target track + any mehd
      const mvexChildren = findChildren(initSegment, child.pos + 8, child.pos + child.size);
      const mvexParts: Buffer[] = [];
      for (const mc of mvexChildren) {
        if (mc.type === 'mehd') {
          mvexParts.push(initSegment.subarray(mc.pos, mc.pos + mc.size));
        } else if (mc.type === 'trex' && targetTrackId > 0) {
          // trex: header(8) + version/flags(4) + track_id(4)
          const trexTrackId = initSegment.readUInt32BE(mc.pos + 12);
          if (trexTrackId === targetTrackId) {
            mvexParts.push(initSegment.subarray(mc.pos, mc.pos + mc.size));
          }
        } else if (mc.type === 'trex' && targetTrackId === 0) {
          mvexParts.push(initSegment.subarray(mc.pos, mc.pos + mc.size));
        }
      }
      // Rebuild mvex box
      const mvexContent = Buffer.concat(mvexParts);
      const mvexBox = Buffer.alloc(8 + mvexContent.length);
      mvexBox.writeUInt32BE(8 + mvexContent.length, 0);
      mvexBox.write('mvex', 4);
      mvexContent.copy(mvexBox, 8);
      moovParts.push(mvexBox);
    }
  }

  // Rebuild moov box
  const moovContent = Buffer.concat(moovParts);
  const moovBox = Buffer.alloc(8 + moovContent.length);
  moovBox.writeUInt32BE(8 + moovContent.length, 0);
  moovBox.write('moov', 4);
  moovContent.copy(moovBox, 8);
  pieces.push(moovBox);

  const result = Buffer.concat(pieces);
  logger.info(`[media/split] Split init for ${trackType}: ${initSegment.length}B → ${result.length}B (removed ${traks.length - 1} other track(s))`);
  return result;
}

async function fetchSegmentBytes(url: string, _ipfsService?: any): Promise<Buffer> {
  const ipfsMatch = url.match(/\/ipfs\/(.+)/);
  const ipfsPath = ipfsMatch ? ipfsMatch[1] : '';

  // Local gateway attempt — catches both non-OK and thrown errors (network,
  // TLS, timeout). Any failure falls through to the public IPFS gateway so a
  // single transient blip on the local Helia / loopback never breaks playback.
  let primaryStatus: number | string = 'fetch threw';
  try {
    const response = await fetch(url);
    if (response.ok) {
      const arrayBuf = await response.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
    primaryStatus = response.status;
  } catch (err: any) {
    const cause = err?.cause;
    primaryStatus = cause?.code || err?.code || err?.message || 'fetch threw';
  }

  // Fallback to public IPFS gateway
  if (ipfsPath) {
    const fallbackUrl = FALLBACK_IPFS_GATEWAY + ipfsPath;
    logger.info(`[media/segment] Local fetch failed (${primaryStatus}), trying public: ${fallbackUrl.substring(0, 80)}...`);
    try {
      const fbResponse = await fetch(fallbackUrl);
      if (fbResponse.ok) {
        const arrayBuf = await fbResponse.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
      throw new Error(`Failed to fetch segment from both gateways (local: ${primaryStatus}, public: ${fbResponse.status})`);
    } catch (pubErr: any) {
      const pubReason = pubErr?.cause?.code || pubErr?.message || 'unknown';
      throw new Error(`Failed to fetch segment from both gateways (local: ${primaryStatus}, public: ${pubReason})`);
    }
  }

  throw new Error(`Failed to fetch segment: ${primaryStatus}`);
}

let cachedMp4SplitWasmBinary: ArrayBuffer | null = null;

async function loadMp4SplitWasmBinary(): Promise<ArrayBuffer> {
  if (cachedMp4SplitWasmBinary) return cachedMp4SplitWasmBinary;
  const wasmPath = pathResolve(__dirname, '../../wasm-apps/mp4-split/mp4-split.wasm');
  if (!existsSync(wasmPath)) {
    throw new Error(`mp4-split WASM not found: ${wasmPath}`);
  }
  cachedMp4SplitWasmBinary = readFileSync(wasmPath).buffer;
  return cachedMp4SplitWasmBinary;
}

loadMp4SplitWasmBinary().catch((err) =>
  logger.warn(`[media] mp4-split WASM preload skipped: ${err.message}`)
);

let cachedCENCWasmBinary: ArrayBuffer | null = null;

async function loadCENCWasmBinary(): Promise<ArrayBuffer> {
  if (cachedCENCWasmBinary) return cachedCENCWasmBinary;
  const wasmPath = pathResolve(__dirname, '../../wasm-apps/cenc-decrypt/cenc-decrypt.wasm');
  if (!existsSync(wasmPath)) {
    throw new Error(`CENC decrypt WASM not found: ${wasmPath}`);
  }
  cachedCENCWasmBinary = readFileSync(wasmPath).buffer;
  return cachedCENCWasmBinary;
}

// Eagerly preload WASM binary at import time so the first playback request
// doesn't incur a disk read penalty.
loadCENCWasmBinary().catch((err) =>
  logger.warn(`[media] WASM preload skipped: ${err.message}`)
);

/**
 * Strip encryption signaling from an init segment via WASM.
 * Uses the cenc-decrypt module's strip_init mode (encv→av01/enca→mp4a,
 * remove sinf, remove pssh). 64-bit extended box sizes handled.
 */
async function stripInitViaWASM(initSegment: Buffer, wasmRuntime: WASMRuntime): Promise<Buffer> {
  const wasmBinary = await loadCENCWasmBinary();

  const commandJson = JSON.stringify({
    cek_b64: '',
    mode: 'strip_init',
  });

  const result = await wasmRuntime.executeCENCDecrypt(
    wasmBinary,
    commandJson,
    initSegment,
    null,
    { timeoutMs: 10000 },
  );

  if (!result.success || !result.decryptedBytes) {
    throw new Error(`WASM strip_init failed: ${result.error || 'no output'}`);
  }

  return result.decryptedBytes;
}

async function decryptSegmentViaWASM(
  encryptedSegment: Buffer,
  cekBase64: string,
  wasmRuntime: WASMRuntime,
  initSegment?: Buffer | null,
): Promise<Buffer> {
  const commandJson = JSON.stringify({
    cek_b64: cekBase64,
    iv_size: 8,
    is_init: false,
    strip: true,
  });

  const wasmBinary = await loadCENCWasmBinary();

  logger.info(`[media/WASM] Decrypting segment: inputSize=${encryptedSegment.length}, hasInit=${!!initSegment}`);

  const result = await wasmRuntime.executeCENCDecrypt(
    wasmBinary,
    commandJson,
    encryptedSegment,
    initSegment || null,
    { timeoutMs: 30000 },
  );

  if (!result.success || !result.decryptedBytes) {
    throw new Error(`WASM decryption failed: ${result.error || 'no output'}`);
  }

  logger.info(`[media/WASM] Decrypted: outputSize=${result.decryptedBytes.length}, time=${result.executionTimeMs}ms, error=${result.error || 'none'}`);

  // Find mdat box and compare encrypted vs decrypted data within it
  const mdatStr = 'mdat';
  let mdatPos = -1;
  for (let i = 0; i < Math.min(encryptedSegment.length - 4, 64000); i++) {
    if (encryptedSegment[i] === 0x6d && encryptedSegment[i + 1] === 0x64 && encryptedSegment[i + 2] === 0x61 && encryptedSegment[i + 3] === 0x74) {
      mdatPos = i + 4;
      break;
    }
  }
  if (mdatPos > 0 && mdatPos + 32 < encryptedSegment.length) {
    const inMdat = encryptedSegment.subarray(mdatPos, mdatPos + 32).toString('hex');
    const outMdat = result.decryptedBytes.subarray(mdatPos, mdatPos + 32).toString('hex');
    const changed = inMdat !== outMdat;
    logger.info(`[media/WASM] mdat@${mdatPos}: changed=${changed}`);
    logger.info(`[media/WASM]   encrypted: ${inMdat}`);
    logger.info(`[media/WASM]   decrypted: ${outMdat}`);
  }

  return result.decryptedBytes;
}

/**
 * Start Lit getSessionSigs with a callback-bridged auth flow.
 * The authNeededCallback constructs the SIWE message (with ReCap capabilities)
 * and delegates signing to the caller via onAuthNeeded.
 */
async function startUserSessionSigs(
  client: any,
  buyerAddress: string,
  onAuthNeeded: (siweMessage: string) => Promise<any>,
): Promise<any> {
  const {
    LitAccessControlConditionResource,
    LitActionResource,
    RecapSessionCapabilityObject,
  } = await import('@lit-protocol/auth-helpers');
  const { LIT_ABILITY } = await import('@lit-protocol/constants');
  const { SiweMessage } = await import('siwe');
  const { ethers } = await import('ethers');

  const checksumAddr = ethers.getAddress(buyerAddress);
  const expiration = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const accResource = new LitAccessControlConditionResource('*');
  const actionResource = new LitActionResource('*');

  const resourceAbilityRequests = [
    { resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption },
    { resource: actionResource, ability: LIT_ABILITY.LitActionExecution },
  ];

  const sessionCapabilityObject = new RecapSessionCapabilityObject({}, []);
  sessionCapabilityObject.addCapabilityForResource(accResource, LIT_ABILITY.AccessControlConditionDecryption);
  sessionCapabilityObject.addCapabilityForResource(actionResource, LIT_ABILITY.LitActionExecution);

  const sessionOpts: any = {
    chain: 'ethereum',
    expiration,
    resourceAbilityRequests,
    sessionCapabilityObject,
    authNeededCallback: async (params: any) => {
      // Construct the SIWE message using the params from the Lit SDK
      // (includes session key URI, ReCap resources, nonce, etc.)
      const siweMessage = new SiweMessage({
        domain: params.domain || 'localhost',
        address: checksumAddr,
        statement: params.statement || 'Lit Protocol session signature',
        uri: params.uri || 'https://localhost',
        version: '1',
        chainId: 1,
        nonce: params.nonce || await client.getLatestBlockhash(),
        expirationTime: params.expiration || expiration,
        resources: params.resources || [],
      });

      const messageToSign = siweMessage.prepareMessage();
      logger.info(`[media/auth] SIWE message prepared for ${checksumAddr}, uri=${params.uri?.substring(0, 40)}...`);

      // Delegate signing to the frontend via the bridge
      const authSig = await onAuthNeeded(messageToSign);

      logger.info(`[media/auth] Received signed auth from frontend for ${authSig.address}`);
      return authSig;
    },
  };

  // Add capacity delegation if available
  try {
    const { getCapacityWallet, detectCapacityTokenId, getServerWallet } = await import('./storage.js');
    const capacityWallet = await getCapacityWallet();
    if (capacityWallet) {
      const tokenId = await detectCapacityTokenId(capacityWallet.address);
      if (tokenId) {
        const { capacityDelegationAuthSig } = await client.createCapacityDelegationAuthSig({
          dAppOwnerWallet: capacityWallet,
          capacityTokenId: tokenId,
          delegateeAddresses: [checksumAddr],
          uses: '10',
          expiration,
        });
        sessionOpts.capacityDelegationAuthSig = capacityDelegationAuthSig;
        logger.info(`[media/auth] Capacity delegation attached for ${checksumAddr}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[media/auth] Capacity delegation setup skipped: ${err.message}`);
  }

  const sessionSigs = await client.getSessionSigs(sessionOpts);
  logger.info(`[media/auth] Session sigs created for ${checksumAddr}: ${Object.keys(sessionSigs).length} nodes`);
  return sessionSigs;
}

/**
 * Fetch and cache Lit Action JavaScript code by IPFS CID.
 * Media Lit Actions are stored on IPFS (not local like non-media-decrypt.js).
 * Chipotle requires inline code — so we fetch the JS source by CID.
 */
const litActionCodeCache = new Map<string, string>();

async function fetchLitActionCode(cid: string): Promise<string> {
  const cached = litActionCodeCache.get(cid);
  if (cached) return cached;

  const gateways = [
    `http://localhost:4200/ipfs/${cid}`,
    `https://ipfs.ela.city/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ];

  for (const url of gateways) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const raw = await resp.text();
        // Chipotle's allowlist is keyed on the byte-exact hash of the
        // submitted `code` field. The runtime-internal CID we registered
        // corresponds to the trailing-whitespace-stripped form (captured
        // from a shell-based 403 probe during key rotation). Keeping the
        // raw IPFS bytes here produces a different hash and triggers
        // HTTP 403. See chipotle-client.ts getNonMediaActionCode() for
        // the same normalisation on locally-loaded actions.
        const code = raw.replace(/\s+$/, '');
        if (code && code.length > 10) {
          litActionCodeCache.set(cid, code);
          logger.info(`[media/CEK] Fetched Lit Action code from ${url.includes('localhost') ? 'local' : 'remote'} IPFS (${code.length} chars)`);
          return code;
        }
      }
    } catch { /* try next gateway */ }
  }

  throw new Error(`Failed to fetch media Lit Action code from IPFS: ${cid}`);
}

/**
 * Recover the Content Encryption Key for media assets via Lit Protocol.
 *
 * Media Lit Actions use an ECDH envelope: the caller sends an ephemeral
 * public key, the Lit Action decrypts the CEK internally, wraps it with
 * ECDH + AES-CBC, and returns the envelope. The caller unwraps to get
 * the raw 16-byte CENC AES-128-CTR key.
 */
async function recoverMediaCEK(
  litParams: {
    litCiphertext: string;
    dataToEncryptHash: string;
    kid: string;
    actionCid: string;
    authority: string;
    chain: string;
    chainId: number;
    rpc: string;
    litBackend: string;
    secureViewSession?: import('./chipotle-client.js').SecureViewSessionBundle;
  },
  wallet: any,
  prebuiltSessionSigs?: any,
  buyerAddress?: string,
): Promise<string> {
  const backend = litParams.litBackend || LIT_BACKEND || 'datil';

  // Phase 5 cutover: media decryption requires a secure-view session
  // bundle. The sigauth Lit Action authorises the caller from
  // delegation.coveredAddresses, so `userAddress` is no longer sent.
  if (!litParams.secureViewSession) {
    throw new Error('[media/CEK] secureViewSession bundle is required for Lit decryption');
  }

  // Chipotle with direct CEK recovery (sigauth action)
  if (backend === 'chipotle') {
    logger.info(`[media/CEK] Chipotle direct CEK recovery via ${litParams.actionCid}, kid=${litParams.kid}`);
    const { recoverNonMediaCEK } = await import('./chipotle-client.js');
    const decryptedCek = await recoverNonMediaCEK({
      litCiphertext: litParams.litCiphertext,
      dataToEncryptHash: litParams.dataToEncryptHash,
      kid: litParams.kid,
      buyerAddress: buyerAddress || wallet.address,
      actionCid: litParams.actionCid,
      authority: litParams.authority,
      chain: litParams.chain,
      chainId: litParams.chainId,
      rpc: litParams.rpc,
      secureViewSession: litParams.secureViewSession,
    });

    const crypto = await import('crypto');
    const cekHash = crypto.createHash('sha256').update(decryptedCek).digest('hex').slice(0, 12);
    logger.info(`[media/CEK] Chipotle direct recovery complete, cekSha=${cekHash}`);
    return decryptedCek;
  }

  // Datil path — ECDH envelope unwrapping
  const keyAlg = { name: 'ECDH', namedCurve: 'P-256' } as const;
  const keyPair = await subtle.generateKey(keyAlg, true, ['deriveKey', 'deriveBits']);
  const rawPubKey = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const publicKeyHex = Buffer.from(rawPubKey).toString('hex');

  logger.info(`[media/CEK] Datil ECDH envelope recovery via ${litParams.actionCid}, kid=${litParams.kid}`);

  let envelope: Buffer;

  const { getLitClient, getExecuteSessionSigs } = await import('./storage.js');
  const client = await getLitClient();

  let sessionSigs: any;
  if (prebuiltSessionSigs && Object.keys(prebuiltSessionSigs).length > 0) {
    sessionSigs = prebuiltSessionSigs;
  } else {
    sessionSigs = await getExecuteSessionSigs(client, wallet);
  }

  const datilJsParams: Record<string, unknown> = {
    keyAlg: { name: 'ECDH', namedCurve: 'P-256' },
    publicKey: publicKeyHex,
    ciphertext: litParams.litCiphertext,
    dataToEncryptHash: litParams.dataToEncryptHash,
    kid: litParams.kid.startsWith('0x') ? litParams.kid : `0x${litParams.kid}`,
    actionIpfsId: litParams.actionCid,
    authority: litParams.authority,
    chain: litParams.chain,
    chainId: litParams.chainId,
    rpc: litParams.rpc,
    delegation: litParams.secureViewSession.delegationCanonical,
    delegationSig: litParams.secureViewSession.delegationSig,
    request: litParams.secureViewSession.requestCanonical,
    requestSig: litParams.secureViewSession.requestSig,
  };
  const executeParams: any = {
    sessionSigs,
    jsParams: datilJsParams,
    ipfsId: litParams.actionCid,
  };

  const result = await client.executeJs(executeParams);
  if (!result.response) throw new Error('Lit Action returned empty response');
  envelope = Buffer.from(result.response, 'base64');
  logger.info(`[media/CEK] Received envelope: ${envelope.length} bytes (Datil SDK)`);

  return unwrapECDHEnvelope(envelope, keyPair.privateKey, rawPubKey, keyAlg);
}

/**
 * Unwrap an ECDH-wrapped license envelope from the media Lit Action.
 *
 * Envelope format:
 *   HEADER: format (3 bytes) + flag (1 byte)
 *   METADATA:
 *     ephemeral_pubkey_len (u16be) + ephemeral_pubkey
 *     signature_len (u16be) + signature + signer_compressed_pubkey (33 bytes)
 *   BODY:
 *     encrypted_cek_len (u32be) + encrypted_cek (AES-CBC)
 *
 * Decrypted payload (rawLicenseBytes):
 *   metadata_size (u32be) + metadata (issuer + exp) + key_count (u32be) + keys
 */
async function unwrapECDHEnvelope(
  envelope: Buffer,
  privateKey: CryptoKey,
  ourRawPubKey: Uint8Array,
  keyAlg: { name: string; namedCurve: string },
): Promise<string> {
  let offset = 4; // skip header (3 bytes format + 1 byte flag)

  // Read ephemeral public key
  const ephPubKeyLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  const ephPubKeyRaw = envelope.subarray(offset, offset + ephPubKeyLen);
  offset += ephPubKeyLen;

  // Skip signature
  const sigLen = (envelope[offset] << 8) | envelope[offset + 1];
  offset += 2;
  offset += sigLen;
  offset += 33; // compressed signer public key

  // Read encrypted CEK
  const encCekLen = (envelope[offset] << 24) | (envelope[offset + 1] << 16) |
    (envelope[offset + 2] << 8) | envelope[offset + 3];
  offset += 4;
  const encryptedCek = envelope.subarray(offset, offset + encCekLen);

  logger.info(`[media/CEK] Envelope: ephPubKey=${ephPubKeyLen}B, sig=${sigLen}B, encCEK=${encCekLen}B`);

  // Decompress P-256 point if needed (Lit Action compresses for P-256)
  let litPubKeyUncompressed: Uint8Array;
  if (ephPubKeyRaw[0] === 0x02 || ephPubKeyRaw[0] === 0x03) {
    litPubKeyUncompressed = decompressP256Point(ephPubKeyRaw);
  } else {
    litPubKeyUncompressed = new Uint8Array(ephPubKeyRaw);
  }

  // Import Lit's ephemeral public key
  const litPubKey = await subtle.importKey(
    'raw',
    litPubKeyUncompressed,
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve },
    false,
    [],
  );

  // Derive shared AES-CBC-256 key via ECDH
  const sharedKey = await subtle.deriveKey(
    { name: keyAlg.name, namedCurve: keyAlg.namedCurve, public: litPubKey } as any,
    privateKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt'],
  );

  // IV = first 16 bytes of OUR raw public key (matches Lit Action's `pubKeyBuff.subarray(0, 16)`)
  const iv = ourRawPubKey.subarray(0, 16);

  // Decrypt
  const decrypted = new Uint8Array(
    await subtle.decrypt({ name: 'AES-CBC', iv }, sharedKey, encryptedCek),
  );

  // Parse rawLicenseBytes: metadataSize(u32) | metadata | keyCount(u32) | keys
  const metaSize = (decrypted[0] << 24) | (decrypted[1] << 16) | (decrypted[2] << 8) | decrypted[3];
  const bodyOffset = 4 + metaSize;
  // const keyCount = (decrypted[bodyOffset] << 24) | ... — we expect 1 key
  const cekStart = bodyOffset + 4;
  const cekBytes = decrypted.subarray(cekStart, cekStart + 16);

  // Verify structure: read keyCount at bodyOffset
  const keyCount = (decrypted[bodyOffset] << 24) | (decrypted[bodyOffset + 1] << 16) |
    (decrypted[bodyOffset + 2] << 8) | decrypted[bodyOffset + 3];
  const cekHash = crypto.createHash('sha256').update(cekBytes).digest('hex').slice(0, 12);
  logger.info(`[media/CEK] Unwrapped license: metaSize=${metaSize}, keyCount=${keyCount}, cekLen=${cekBytes.length}, cekSha=${cekHash}`);
  const result = Buffer.from(cekBytes).toString('base64');
  decrypted.fill(0);
  return result;
}

/**
 * Decompress a compressed P-256 EC point (33 bytes → 65 bytes uncompressed).
 * P-256 curve: y² = x³ - 3x + b (mod p)
 */
function decompressP256Point(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) throw new Error(`Invalid compressed point length: ${compressed.length}`);
  const prefix = compressed[0];
  if (prefix !== 0x02 && prefix !== 0x03) throw new Error(`Invalid prefix: 0x${prefix.toString(16)}`);

  const p = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF');
  const b = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B');
  const a = p - 3n;

  // Read x coordinate
  let x = 0n;
  for (let i = 1; i < 33; i++) {
    x = (x << 8n) | BigInt(compressed[i]);
  }

  // y² = x³ + ax + b (mod p)
  const x3 = modPow(x, 3n, p);
  const rhs = (x3 + a * x + b) % p;
  let y = modSqrt(rhs, p);

  // Choose correct y based on prefix (even/odd)
  const isOdd = (y & 1n) === 1n;
  if ((prefix === 0x03) !== isOdd) {
    y = p - y;
  }

  // Build uncompressed point: 0x04 || x (32 bytes) || y (32 bytes)
  const result = new Uint8Array(65);
  result[0] = 0x04;
  const xBytes = bigintToBytes32(x);
  const yBytes = bigintToBytes32(y);
  result.set(xBytes, 1);
  result.set(yBytes, 33);
  return result;
}

function bigintToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** Tonelli-Shanks modular square root for P-256 (p === 3 mod 4 -> simple formula). */
function modSqrt(a: bigint, p: bigint): bigint {
  // For P-256, p === 3 (mod 4), so sqrt(a) = a^((p+1)/4) mod p
  return modPow(a, (p + 1n) / 4n, p);
}

// ── Media Encoding Pipeline ──────────────────────────────────────────────────

import multer from 'multer';
import { tmpdir } from 'os';
import {
  analyzeMedia,
  validateMediaInput,
  buildTranscodePlan,
  transcodeRendition,
  fragmentMedia,
  detectAvailableCodec,
  checkFFmpegAvailable,
} from '../services/media/encoder.js';
import { ensureBento4 } from '../services/media/bento4.js';
import { createEncryptedDASH } from '../services/media/dashPackager.js';

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface EncodeJob {
  id: string;
  status: 'queued' | 'analyzing' | 'transcoding' | 'fragmenting' | 'packaging' | 'uploading' | 'complete' | 'error';
  progress: { percent: number; fps: number; speed: string; time: string; stage: string };
  result?: { cid: string; mpdUri: string; kid: string; size: number; dataToEncryptHash: string; ciphertext: string; previewURL?: string; duration?: number; resolution?: string; codec?: string; cleartext?: boolean };
  error?: string;
  startedAt: number;
  previewDuration?: number;
  skipCenc?: boolean;
}

const encodeJobs = new Map<string, EncodeJob>();

const uploadTmpDir = join(
  process.env.PC2_DATA_DIR || process.cwd(),
  'tmp',
  'media-encode',
);

// SEC-A19 (2026-04 Wave 5.5): the on-disk filename MUST NOT include
// `file.originalname`. A crafted originalname like
// `../../../etc/cron.d/evil` would `path.join` outside `uploadTmpDir`.
// `req.file.originalname` is still preserved by multer for any handler that
// wants to display the client-supplied name.
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(uploadTmpDir)) fsMkdirSync(uploadTmpDir, { recursive: true });
      cb(null, uploadTmpDir);
    },
    filename: (_req, _file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cb(null, `${unique}.upload`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

router.post('/encode', mediaUpload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = crypto.randomUUID();

  try {
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart/form-data with field name "file".' });
      return;
    }

    if (!await checkFFmpegAvailable()) {
      res.status(503).json({ error: 'FFmpeg not found. Install FFmpeg to enable media encoding.' });
      return;
    }

    const previewDuration = parseInt(req.body?.previewDuration, 10) || 0;
    const skipCenc = req.body?.skipCenc === 'true' || req.body?.skipCenc === true;
    logger.info(`[media/encode] Job ${jobId}: skipCenc=${skipCenc} (raw: ${JSON.stringify(req.body?.skipCenc)})`);

    const job: EncodeJob = {
      id: jobId,
      status: 'analyzing',
      progress: { percent: 0, fps: 0, speed: '0x', time: '00:00:00.00', stage: 'analyzing' },
      startedAt: Date.now(),
      previewDuration: previewDuration > 0 ? Math.min(previewDuration, 60) : 0,
      skipCenc,
    };
    encodeJobs.set(jobId, job);

    // Return job ID immediately so the frontend can poll progress
    res.json({ jobId, status: 'started' });

    // Run pipeline in background
    runEncodePipeline(job, file.path, req.app.locals).catch((err: any) => {
      logger.error(`[media/encode] Pipeline error for job ${jobId}:`, err);
      job.status = 'error';
      job.error = err.message;
    });

  } catch (err: any) {
    logger.error('[media/encode] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/encode/status/:jobId', async (req: AuthenticatedRequest, res: Response) => {
  const job = encodeJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    elapsedMs: Date.now() - job.startedAt,
  });

  // Clean up completed/errored jobs after 5 minutes
  if ((job.status === 'complete' || job.status === 'error') && (Date.now() - job.startedAt > 300000)) {
    encodeJobs.delete(job.id);
  }
});

async function runEncodePipeline(
  job: EncodeJob,
  inputPath: string,
  appLocals: any,
): Promise<void> {
  const workDir = join(uploadTmpDir, `job-${job.id}`);
  fsMkdirSync(workDir, { recursive: true });

  try {
    // 1. Analyze
    job.status = 'analyzing';
    job.progress.stage = 'analyzing';
    const info = await analyzeMedia(inputPath);
    await validateMediaInput(inputPath, info);
    logger.info(`[media/encode] Job ${job.id}: analysis complete — ${info.format.format_name}, ${info.format.duration}s`);

    // 2. Transcode
    job.status = 'transcoding';
    job.progress.stage = 'transcoding';
    const codec = await detectAvailableCodec();
    const plan = buildTranscodePlan(info, inputPath, workDir, codec);

    const result = await transcodeRendition(plan, (progress) => {
      job.progress = { ...progress, stage: 'transcoding' };
    });
    logger.info(`[media/encode] Job ${job.id}: transcode complete — ${result.resolution} via ${result.codec}`);

    // 2b. Generate preview clip (unencrypted, lower quality, first N seconds)
    let previewCid: string | undefined;
    const totalDurationSec = parseFloat(info.format.duration) || 0;
    const previewSec = job.previewDuration || 0;

    if (previewSec > 0 && totalDurationSec > previewSec) {
      try {
        const previewPath = join(workDir, 'preview.mp4');
        const isAudio = plan.isAudioOnly;

        const ffmpegArgs: string[] = [
          '-i', result.outputPath,
          '-t', String(previewSec),
          ...(isAudio
            ? ['-c:a', 'aac', '-b:a', '96k', '-vn']
            : [
              '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
              '-vf', 'scale=min(640\\,iw):-2',
              '-c:a', 'aac', '-b:a', '96k',
            ]),
          '-movflags', '+faststart',
          '-y', previewPath,
        ];

        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 60000 });
        logger.info(`[media/encode] Job ${job.id}: preview clip generated (${previewSec}s)`);

        const { readFile } = await import('fs/promises');
        const previewBytes = await readFile(previewPath);

        // Upload to local IPFS
        const ipfs = appLocals.ipfs;
        if (ipfs?.storeFile) {
          previewCid = await ipfs.storeFile(new Uint8Array(previewBytes), { pin: true });
          logger.info(`[media/encode] Job ${job.id}: preview pinned locally, CID=${previewCid}`);
        }

        // Replicate preview to Elacity IPFS and use the returned CIDv0
        if (previewCid) {
          try {
            const ELACITY_UPLOAD = 'https://base.ela.city/api/2.0/files/upload';
            const formData = new FormData();
            formData.append('file', new Blob([new Uint8Array(previewBytes)]), 'preview.mp4');
            const elaResp = await fetch(ELACITY_UPLOAD, {
              method: 'POST',
              headers: { 'X-Target-Flow': 'ipfs' },
              body: formData,
              signal: AbortSignal.timeout(30000),
            });
            if (elaResp.ok) {
              const elaData = await elaResp.json() as Array<{ path: string; size: number }>;
              if (elaData?.[0]?.path) {
                previewCid = elaData[0].path;
                logger.info(`[media/encode] Job ${job.id}: preview on Elacity IPFS, CID=${previewCid}`);
              }
            } else {
              logger.warn(`[media/encode] Job ${job.id}: preview Elacity upload returned ${elaResp.status}`);
            }
          } catch {
            logger.warn(`[media/encode] Job ${job.id}: preview Elacity replication failed — using local CID`);
          }
        }
      } catch (previewErr: any) {
        logger.warn(`[media/encode] Job ${job.id}: preview generation failed (non-fatal): ${previewErr.message}`);
      }
    } else if (previewSec > 0 && totalDurationSec <= previewSec) {
      logger.info(`[media/encode] Job ${job.id}: skipping preview — content duration (${totalDurationSec}s) ≤ preview duration (${previewSec}s)`);
    }

    // 3. Fragment
    job.status = 'fragmenting';
    job.progress.stage = 'fragmenting';
    const bento4 = await ensureBento4();
    const fragmentedPath = join(workDir, `fragmented_${plan.isAudioOnly ? 'audio' : plan.resolution}.mp4`);
    await fragmentMedia(result.outputPath, fragmentedPath, bento4.mp4fragment, bento4.useFfmpegFallback);
    logger.info(`[media/encode] Job ${job.id}: fragmented (${bento4.useFfmpegFallback ? 'ffmpeg' : 'mp4fragment'})`);

    // 4. DASH package (with or without CENC encryption) + IPFS upload
    job.status = 'packaging';
    job.progress.stage = 'packaging';
    const ipfs = appLocals.ipfs;

    let dashResult: { cid: string; mpdUri: string; kid: string; size: number; dataToEncryptHash: string; ciphertext: string; cleartext?: boolean };

    if (job.skipCenc) {
      const { createCleartextDASH } = await import('../services/media/dashPackager.js');
      dashResult = await createCleartextDASH([fragmentedPath], workDir, ipfs);
      logger.info(`[media/encode] Job ${job.id}: Cleartext DASH package created, CID=${dashResult.cid}`);
    } else {
      dashResult = await createEncryptedDASH([fragmentedPath], workDir, bento4, ipfs);
      logger.info(`[media/encode] Job ${job.id}: DASH package created, CID=${dashResult.cid}`);
    }

    // 4b. Replicate to Elacity IPFS for multi-node reachability
    job.status = 'uploading';
    job.progress.stage = 'uploading';
    try {
      const ELACITY_UPLOAD = 'https://base.ela.city/api/2.0/files/upload';
      const dashDir = join(workDir, 'dash');
      const { readdirSync: rdSync, readFileSync: rfSync, statSync: stSync } = await import('fs');
      const walkFiles = (dir: string, base: string): Array<{ path: string; relPath: string }> => {
        const results: Array<{ path: string; relPath: string }> = [];
        for (const entry of rdSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) results.push(...walkFiles(full, rel));
          else results.push({ path: full, relPath: rel });
        }
        return results;
      };

      if (existsSync(dashDir)) {
        const files = walkFiles(dashDir, '');
        let replicated = 0;
        const BATCH_SIZE = 5;
        const UPLOAD_TIMEOUT = 15000;
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map(async (f) => {
            const bytes = rfSync(f.path);
            const fd = new FormData();
            fd.append('file', new Blob([new Uint8Array(bytes)]), f.relPath);
            await fetch(ELACITY_UPLOAD, {
              method: 'POST',
              headers: { 'X-Target-Flow': 'ipfs' },
              body: fd,
              signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
            });
          }));
          replicated += results.filter(r => r.status === 'fulfilled').length;
        }
        logger.info(`[media/encode] Job ${job.id}: replicated ${replicated}/${files.length} files to Elacity IPFS`);
      }
    } catch (replicateErr: any) {
      logger.warn(`[media/encode] Job ${job.id}: Elacity replication failed (non-fatal): ${replicateErr.message}`);
    }

    // 5. Complete
    job.status = 'complete';
    job.progress = { percent: 100, fps: 0, speed: '0x', time: '00:00:00.00', stage: 'complete' };
    job.result = {
      cid: dashResult.cid,
      mpdUri: dashResult.mpdUri,
      kid: dashResult.kid,
      size: dashResult.size,
      dataToEncryptHash: dashResult.dataToEncryptHash,
      ciphertext: dashResult.ciphertext,
      duration: parseFloat(info.format.duration) || undefined,
      resolution: result.resolution || undefined,
      codec: result.codec || undefined,
      previewURL: previewCid ? `ipfs://${previewCid}` : undefined,
      cleartext: dashResult.cleartext || false,
    };

    logger.info(`[media/encode] Job ${job.id}: COMPLETE in ${Date.now() - job.startedAt}ms — CID=${dashResult.cid}`);

  } finally {
    // Cleanup temp files
    try { fsRmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fsRmSync(inputPath, { force: true }); } catch { /* ignore */ }
  }
}

export default router;
export { router as mediaRouter };
