/**
 * PC2 Media Runtime API — DASH/CENC video playback inside PC2.
 *
 * POST /api/media/prepare-auth — Start Lit session creation, return SIWE message for user signing
 * POST /api/media/init         — Complete auth + resolve NFT, fetch MPD, recover CEK, create session
 * POST /api/media/segment      — Fetch encrypted segment from IPFS, decrypt via WASM, stream back
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from './middleware.js';
import { requireSecureViewSession, type SecureViewRequest } from './middleware/secureViewSession.js';
import { resolve as pathResolve, dirname, join } from 'path';
import { existsSync, readFileSync, mkdirSync as fsMkdirSync, rmSync as fsRmSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import * as crypto from 'crypto';
// webcrypto removed — ECDH operations moved to chipotle-client.ts
import { parseMPD } from '../services/media/mpdParser.js';
import { extractPSSHJson } from '../services/media/psshJson.js';
import { mediaSessionManager } from '../services/media/sessionManager.js';
import type { WASMRuntime } from '../services/wasm/WASMRuntime.js';
import { createLogger } from '../utils/logger.js';
import { getInternalIPFSGateway } from '../utils/urlUtils.js';

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

  logger.error(`[media/prepare-auth] Unsupported lit backend: "${LIT_BACKEND}"`);
  res.status(500).json({ error: "Unsupported lit backend" });
});

// ─── POST /api/media/init ────────────────────────────────────────────
router.post('/init', authenticate, requireSecureViewSession, async (req: SecureViewRequest, res: Response) => {
  const requestStart = Date.now();
  try {
    const { channel, tokenId, mediaUri: clientMediaUri, tokenURI, title: clientTitle, authority: clientAuthority } = req.body;
    if (!channel || !tokenId) {
      res.status(400).json({ error: 'channel and tokenId are required' });
      return;
    }

    // mediaSessionManager keys media sessions on the PC2 auth token (kept
    // for /segment lookups); the secure-view BackendSessionView is the
    // separate concern owned by the middleware.
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

    // 2. Fetch and parse MPD
    let mpdText: string;
    let mpdBaseUrl: string;
    {
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
      const { getNonMediaActionCid, isLegacyNonMediaActionCid } = await import('./storage.js');
      const serverActionCid = getNonMediaActionCid();
      if (!serverActionCid) {
        res.status(500).json({ error: 'Server NON_MEDIA_ACTION_CID is not configured' });
        return;
      }
      // Legacy support: if the PSSH carries a known-good legacy CID, honor
      // it (the asset's delegation must bind to that same legacy CID so the
      // legacy Lit Action will accept it). Otherwise override with the
      // server's current universal CID.
      if (litParams.actionCid && isLegacyNonMediaActionCid(litParams.actionCid)) {
        logger.info(`[media/init] Legacy PSSH actionIpfsId honored: ${litParams.actionCid}`);
      } else {
        if (serverActionCid !== litParams.actionCid) {
          logger.info(
            `[media/init] Overriding PSSH actionIpfsId for chipotle: pssh=${litParams.actionCid} → server=${serverActionCid}`,
          );
        }
        litParams.actionCid = serverActionCid;
      }
    }

    // The middleware has already loaded the BackendSessionView. Pass it
    // straight to the recovery helper — the session's P-256 keypair is the
    // ECDH target for the Lit Action's CEK envelope; its wallet-signed
    // delegation is the ownership proof the Lit Action verifies on-chain via
    // `hasAccessByContentId(del.ownerAddress, kid)`. Buyer address is encoded
    // in `del.ownerAddress` — no separate `coveredAddresses` field.
    const sessionView = req.secureViewSession!.view;
    const cekHandle = await recoverMediaCEK(litParams, sessionView);
    logger.info(`[media/init] CEK recovered in ${Date.now() - requestStart}ms (backend=${cekHandle.kind})`);

    // 4. Create session. The handle is either a base64 CEK string (JS
    //    backend, /segment will hand it to cenc-decrypt) or a ddrm-decrypt
    //    L2 request handle (WASM backend, /segment will hand it to
    //    ddrm-decrypt directly). Both live for the playback duration.
    const session = mediaSessionManager.create({
      cekBase64: cekHandle.kind === 'js' ? cekHandle.cekBase64 : undefined,
      wasmRequestHandle: cekHandle.kind === 'wasm' ? cekHandle.requestHandle : undefined,
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
// `requireSecureViewSession` enforces a live secure-view bearer token on
// every segment fetch. The middleware also cross-checks that the session's
// ownerAddress still matches the PC2-authenticated wallet — so a stolen
// segment URL with a fresh PC2 cookie cannot continue streaming after the
// secure-view session has been revoked or its wallet has rotated.
router.post('/segment', authenticate, requireSecureViewSession, async (req: SecureViewRequest, res: Response) => {
  try {
    const { sessionId, trackIndex, segmentNumber, init } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    // mediaSessionManager keys media sessions on the PC2 auth token — kept
    // for backward-compat with the /init persisted session identifier.
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

      // Capture the packaging-time pssh bytes before strip removes them.
      // The same bytes are spliced back into the cleaned, single-track init
      // so libav/ffprobe and other ISOBMFF parsers can discover the box.
      // Tracked in .cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
      const psshBoxBytes = extractFirstPSSHBox(segmentBytes);

      // Strip CENC encryption signaling via WASM (encv → av01, enca → mp4a/Opus,
      // remove sinf box, strip pssh boxes). Uses strip_init mode in cenc-decrypt.
      let cleanInit = await stripInitViaWASM(segmentBytes, wasmRuntime);
      logger.info(`[media/segment] Init segment: raw=${segmentBytes.length}B → clean=${cleanInit.length}B (stripped ${segmentBytes.length - cleanInit.length}B of DRM signaling)`);

      // Split multi-track init to single-track for MSE compatibility.
      // MSE requires each SourceBuffer to receive only its own track.
      cleanInit = await splitInitForTrackWithFallback(cleanInit, track.type, wasmRuntime);

      if (psshBoxBytes) {
        cleanInit = splicePSSHIntoInit(cleanInit, psshBoxBytes);
      } else {
        logger.warn(`[media/segment] No pssh box found in raw init — delivering without DRM discovery metadata`);
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(cleanInit.length));
      res.send(cleanInit);
      return;
    }

    // Get cached init segment for this track (provides tenc for IV size)
    const initSegForTrack = session.initSegments.get(trackIdx) || null;

    // Phase 2-D-helpers: route handler reads wasmRuntime from app.locals.
    const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;

    // Decrypt + strip via WASM. Dispatch on which decrypt handle the
    // MediaSession holds (set at /media/init based on the session view's
    // backend). Both paths produce the same output: decrypted segment with
    // CENC encryption-metadata boxes stripped, ready for the player.
    let cleanSegment: Buffer;
    if (session.wasmRequestHandle !== undefined) {
      const { WasmDdrmDecryptRuntime } = await import('../services/wasm/WasmDdrmDecryptRuntime.js');
      cleanSegment = await WasmDdrmDecryptRuntime.get().requestDecryptSegment(
        session.wasmRequestHandle,
        initSegForTrack ?? null,
        segmentBytes,
        true,
      );
    } else if (session.cekBase64) {
      cleanSegment = await decryptSegmentViaWASM(
        segmentBytes,
        session.cekBase64,
        wasmRuntime,
        initSegForTrack,
      );
    } else {
      throw new Error('MediaSession holds neither cekBase64 nor wasmRequestHandle');
    }

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

// `extractPSSHJson` lives in `../services/media/psshJson.ts` so unit tests
// can exercise it without dragging in the Express stack (mediaSessionManager
// installs a never-unref'd cleanup setInterval at module load that keeps the
// Node event loop alive). Re-exported here for callers that still import it
// from `api/media`.
export { extractPSSHJson } from '../services/media/psshJson.js';

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

// fetchLitActionCode, unwrapECDHEnvelope, and P-256 helpers moved to chipotle-client.ts (shared)

/**
 * Recover the Content Encryption Key for media assets.
 *
 * Takes a pre-resurrected `BackendSessionView` from the middleware, calls
 * `recoverCEKEnvelope` to fetch the ECDH envelope, then asks the view to
 * unwrap it. The CEK lives only inside `BackendSessionView._cekBase64`
 * (Node heap) and is read via the `cekBase64` getter directly into
 * `MediaSession.cekBase64`. It must not be logged or returned over HTTP.
 *
 * The Lit Action's `hasAccessByContentId(del.ownerAddress, kid)` check is
 * the access gate — the session's wallet signature binds buyer→session key.
 */
/**
 * Discriminated handle describing how the /segment route should perform
 * AES-CTR decryption on the encrypted media segments.
 *
 * - `js`   — CEK lives in Node heap on the BackendSessionView (`cekBase64`).
 *            /segment passes it to `cenc-decrypt` WASM (legacy path).
 * - `wasm` — CEK lives in `ddrm-decrypt` WASM linear memory, identified by
 *            an opaque L2 `requestHandle`. /segment calls
 *            `WasmDdrmDecryptRuntime.requestDecryptSegment(handle, init, seg)`.
 */
type MediaCekHandle =
  | { kind: 'js'; cekBase64: string }
  | { kind: 'wasm'; requestHandle: number };

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
  },
  session: import('./chipotle-client.js').BackendSessionView | import('./chipotle-client.js').WasmSessionView,
): Promise<MediaCekHandle> {
  const { recoverCEKEnvelope } = await import('./chipotle-client.js');

  const envelope = await recoverCEKEnvelope(
    {
      litCiphertext: litParams.litCiphertext,
      dataToEncryptHash: litParams.dataToEncryptHash,
      kid: litParams.kid,
      actionCid: litParams.actionCid,
      authority: litParams.authority,
      chain: litParams.chain,
      chainId: litParams.chainId,
      rpc: litParams.rpc,
    },
    session,
  );

  // Legacy short payload: plaintext CEK ≤ 32 bytes — JS-only path.
  if (envelope.length <= 32) {
    logger.info(`[Media] Legacy plaintext CEK (${envelope.length} bytes) — returning as-is`);
    return { kind: 'js', cekBase64: envelope.toString('base64') };
  }

  await session.unwrapEnvelope(envelope);

  if ('cekBase64' in session) {
    // JS backend: CEK lives in session._cekBase64 (Node heap). Do not log or forward.
    return { kind: 'js', cekBase64: session.cekBase64 };
  }

  // WASM backend: CEK lives in ddrm-decrypt's L2 keyed by the request handle.
  // The handle outlives this request (2h L2 TTL in WASM) so /segment can
  // reuse it without re-running the Lit action.
  const handle = session.requestHandle;
  if (handle === null) {
    throw new Error('recoverMediaCEK: WasmSessionView returned null requestHandle after unwrapEnvelope');
  }
  return { kind: 'wasm', requestHandle: handle };
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
import { createEncryptedDASH, extractFirstPSSHBox, splicePSSHIntoInit } from '../services/media/dashPackager.js';

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
