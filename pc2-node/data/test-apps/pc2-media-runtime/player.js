'use strict';

// ─── Parameters ──────────────────────────────────────────────────────
let params = {};
try {
  const raw = new URLSearchParams(window.location.search).get('puter.args');
  if (raw) params = JSON.parse(raw);
} catch { /* ignore */ }
const CHANNEL = params.channel || new URLSearchParams(window.location.search).get('channel');
const TOKEN_ID = params.tokenId || new URLSearchParams(window.location.search).get('tokenId');
const MEDIA_URI = params.mediaUri || new URLSearchParams(window.location.search).get('mediaUri') || '';
const TOKEN_URI = params.tokenURI || new URLSearchParams(window.location.search).get('tokenURI') || '';
const TITLE = params.title || new URLSearchParams(window.location.search).get('title') || '';
const AUTHORITY = params.authority || new URLSearchParams(window.location.search).get('authority') || '';
let BUYER_ADDRESS = params.buyerAddress || '';
let REQUEST_ID = params.requestId || '';
let LIT_AUTH_SIG = params.litAuthSig || null;
const STANDALONE = params.standalone === 'true' || params.standalone === true;
const CLEARTEXT = params.cleartext === 'true' || params.cleartext === true;
const FILE_URL = params.fileUrl || new URLSearchParams(window.location.search).get('fileUrl') || '';
const RAW_THUMBNAIL = params.thumbnail || new URLSearchParams(window.location.search).get('thumbnail') || '';
const THUMBNAIL = RAW_THUMBNAIL.startsWith('ipfs://') ? 'https://ipfs.ela.city/ipfs/' + RAW_THUMBNAIL.slice(7) : RAW_THUMBNAIL;
console.log('[player] params keys:', Object.keys(params), 'THUMBNAIL:', THUMBNAIL ? THUMBNAIL.substring(0, 80) : '(empty)', 'cleartext:', CLEARTEXT);

// ─── DOM ─────────────────────────────────────────────────────────────
const $loading = document.getElementById('loading-screen');
const $loadingText = document.getElementById('loading-text');
const $error = document.getElementById('error-screen');
const $errorTitle = document.getElementById('error-title');
const $errorText = document.getElementById('error-text');
const $container = document.getElementById('player-container');
const $video = document.getElementById('video');
const $videoWrapper = document.getElementById('video-wrapper');
const $watermark = document.getElementById('watermark');
const $bufferingOverlay = document.getElementById('buffering-overlay');
const $btnPlay = document.getElementById('btn-play');
const $iconPlay = document.getElementById('icon-play');
const $iconPause = document.getElementById('icon-pause');
const $seekBar = document.getElementById('seek-bar');
const $seekProgress = document.getElementById('seek-bar-progress');
const $seekBuffered = document.getElementById('seek-bar-buffered');
const $timeCurrent = document.getElementById('time-current');
const $timeDuration = document.getElementById('time-duration');
const $volumeBar = document.getElementById('volume-bar');
const $btnMute = document.getElementById('btn-mute');
const $iconVolOn = document.getElementById('icon-vol-on');
const $iconVolOff = document.getElementById('icon-vol-off');
const $btnFullscreen = document.getElementById('btn-fullscreen');
const $controls = document.getElementById('controls');

// ─── Auth ────────────────────────────────────────────────────────────
function getAuthToken() {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('puter.auth.token') || window.auth_token || localStorage.getItem('auth_token') || '';
}

function apiOrigin() {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('puter.api_origin') || window.location.origin;
}

async function apiFetch(path, body, extraHeaders) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getAuthToken(),
  };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const res = await fetch(apiOrigin() + path, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
  return res;
}

// ── Secure-view session bearer token ────────────────────────────────
//
// The parent PC2 frame (pc2-secure-view.js) owns the persistent backend
// secure-view session: one wallet prompt at session start, an opaque
// bearer token stored in IndexedDB, silent for the next 24h. The player
// asks the parent for the current token via the wallet-bridge RPC and
// attaches it as `X-SecureView-Session` on every secure-content request.
const SECURE_VIEW_SIGN_TIMEOUT_MS = 60000;

function requestSessionTokenFromParent(opts) {
  const provider = window.pc2Wallet
    || (window.ethereum && window.ethereum.isPC2WalletBridge ? window.ethereum : null);
  if (!provider || typeof provider.request !== 'function') {
    return Promise.reject(new Error('No PC2 wallet bridge available (window.pc2Wallet missing)'));
  }
  // Forward `refresh: true` to the parent so it clears its cached token AND
  // the IndexedDB record before bootstrapping a fresh session. Without this
  // the parent hands back the same stale token after a 401 — the retry
  // would fail with the identical `session_token_invalid` and surface to
  // the user. (Bug discovered while tracking down "session_token_invalid
  // most of the time" reports during dev server restarts.)
  const refresh = !!(opts && opts.refresh);
  return new Promise(function (resolve, reject) {
    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error('pc2_secureView_sign timed out after ' + SECURE_VIEW_SIGN_TIMEOUT_MS + 'ms'));
    }, SECURE_VIEW_SIGN_TIMEOUT_MS);

    provider.request({
      method: 'pc2_secureView_sign',
      params: [{ refresh: refresh }],
    }).then(function (bundle) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!bundle || !bundle.token) {
        reject(new Error('Parent secure-view bridge returned no session token'));
        return;
      }
      resolve(bundle.token);
    }).catch(function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

// In-memory cache of the secure-view token. The parent itself caches in
// IndexedDB and handles pre-emptive renewal, but caching here avoids an
// RPC round-trip per segment fetch.
let __secureViewToken = null;
async function getSecureViewHeaders(opts) {
  // Pass `opts = { refresh: true }` after a 401 — that propagates to the
  // parent's `pc2_secureView_sign` so the parent clears its own cache AND
  // the IndexedDB token before re-running the bootstrap (wallet prompt).
  // Without forwarding refresh, the parent would hand back the same stale
  // token and the retry would fail with the same error.
  if (!__secureViewToken || (opts && opts.refresh)) {
    __secureViewToken = await requestSessionTokenFromParent(opts || {});
  }
  return { 'X-SecureView-Session': __secureViewToken };
}

// Drops the cached token; the next getSecureViewHeaders() call will
// re-ask the parent (which may renew via /lit/renew-session).
function invalidateSecureViewToken() {
  __secureViewToken = null;
}

async function mediaInit(buildBody) {
  const headers = await getSecureViewHeaders();
  let res = await apiFetch('/api/media/init', buildBody(), headers);
  if (res.status === 401) {
    // Token expired or revoked — force the parent to drop its cached token
    // (and IndexedDB record) and re-bootstrap, then retry.
    invalidateSecureViewToken();
    const retryHeaders = await getSecureViewHeaders({ refresh: true });
    res = await apiFetch('/api/media/init', buildBody(), retryHeaders);
  }
  return res;
}

// ─── State ───────────────────────────────────────────────────────────
let sessionId = null;
let tracks = [];
let videoTrackIdx = -1;
let audioTrackIdx = -1;
let mediaSource = null;
let videoSB = null;
let audioSB = null;
let videoSegmentQueue = [];
let audioSegmentQueue = [];
let videoNextSeg = 0;
let audioNextSeg = 0;
let videoSegCount = 0;
let audioSegCount = 0;
let isAppendingVideo = false;
let isAppendingAudio = false;
let duration = 0;
let bufferLoopId = null;
let controlsIdleTimer = null;
let isSeeking = false;
let isAudioOnly = false;

// Segment start times (seconds) per track, from server
let videoSegStarts = [];
let audioSegStarts = [];

// ABR state
let allVideoTracks = [];       // sorted low→high bandwidth
let currentQualityIdx = -1;    // index into allVideoTracks
let abrMode = 'auto';          // 'auto' or track index number for manual
let bandwidthSamples = [];     // recent throughput measurements (bps)
let lastSwitchTime = 0;        // prevent rapid switching
let isSwitchingQuality = false;
const ABR_SAMPLE_WINDOW = 6;   // keep last N samples
const ABR_SWITCH_COOLDOWN_MS = 8000;
const ABR_UPGRADE_FACTOR = 1.3;  // need 30% headroom to upgrade
const ABR_DOWNGRADE_FACTOR = 0.9;

const BUFFER_AHEAD_SEC = 20;
const BUFFER_EVICT_BEHIND_SEC = 30;
const MAX_SEGMENT_RETRIES = 3;
const MAX_SESSION_REFRESHES = 2;

// Pipelined segment prefetch — fire N fetches in parallel per track instead
// of one at a time. Appends still run strictly in segment order via the
// per-track append chain (MSE requires sequential appends). Hides cache-miss
// latency when segments have to fall back to the public IPFS gateway.
// Generation counter lets seek/quality-switch invalidate stale in-flight
// appends without aborting the underlying fetches (bytes are still cached
// at pc2-node's Helia level, so the work isn't wasted).
const MAX_CONCURRENT_FETCHES_PER_TRACK = 3;
let videoInFlight = 0;
let audioInFlight = 0;
let videoAppendChain = Promise.resolve();
let audioAppendChain = Promise.resolve();
let videoFetchGeneration = 0;
let audioFetchGeneration = 0;

// Session refresh state — ensures only one refresh runs at a time
let sessionRefreshPromise = null;
let sessionRefreshCount = 0;

// ─── Helpers ─────────────────────────────────────────────────────────
function formatTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

function showError(msg) {
  $loading.style.display = 'none';
  $container.style.display = 'none';
  $error.style.display = 'flex';

  const lower = (msg || '').toLowerCase();
  const isAccessDenied = lower.includes('accesstoken') ||
    lower.includes('access denied') ||
    lower.includes('does not hold') ||
    lower.includes('not authorized') ||
    lower.includes('access control') ||
    lower.includes('lit action denied');

  if (isAccessDenied) {
    $errorTitle.textContent = 'Access Required';
    $errorText.textContent = 'You need to purchase this content to watch it. Please buy an Access Token from the marketplace.';
  } else {
    $errorTitle.textContent = 'Playback Error';
    $errorText.textContent = msg;
  }
}

// ─── Session Refresh ─────────────────────────────────────────────────
async function refreshSession() {
  if (sessionRefreshCount >= MAX_SESSION_REFRESHES) {
    throw new Error('Session refresh limit reached. Please reload the player.');
  }

  // Coalesce concurrent refresh requests into one
  if (sessionRefreshPromise) return sessionRefreshPromise;

  sessionRefreshPromise = (async () => {
    try {
      console.log('[player] Session expired — refreshing...');
      sessionRefreshCount++;

      // Re-authenticate via wallet (works for both standalone and market-launched)
      if (window.ethereum) {
  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        .then(a => (a && a.length > 0) ? a : window.ethereum.request({ method: 'eth_requestAccounts' }));
        const eoaAddress = accounts[0];
        const sp = new URLSearchParams(window.location.search);
        BUYER_ADDRESS = sp.get('puter.smart_account') || eoaAddress;

        const prepareRes = await apiFetch('/api/media/prepare-auth', { buyerAddress: eoaAddress });
        if (!prepareRes.ok) {
          const err = await prepareRes.json().catch(() => ({ error: prepareRes.statusText }));
          throw new Error(err.error || 'Failed to prepare re-authentication');
        }
        const { requestId, siweMessage, chipotleMode } = await prepareRes.json();
        REQUEST_ID = requestId;

        if (chipotleMode || !siweMessage) {
          LIT_AUTH_SIG = { sig: '0x', derivedVia: 'chipotle-api-key', signedMessage: '', address: eoaAddress };
        } else {
          const msgHex = '0x' + Array.from(new TextEncoder().encode(siweMessage))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          const sig = await window.ethereum.request({
            method: 'personal_sign',
            params: [msgHex, eoaAddress],
          });

          LIT_AUTH_SIG = {
            sig,
            derivedVia: 'web3.eth.personal.sign',
            signedMessage: siweMessage,
            address: eoaAddress,
          };
        }
      }

      // Re-init the session to get a new sessionId with fresh CEK
      const initRes = await mediaInit(function () {
        const initBody = {
          channel: CHANNEL,
          tokenId: TOKEN_ID,
          mediaUri: MEDIA_URI,
          tokenURI: TOKEN_URI,
          title: TITLE,
          authority: AUTHORITY,
          buyerAddress: BUYER_ADDRESS,
        };
        if (REQUEST_ID) initBody.requestId = REQUEST_ID;
        if (LIT_AUTH_SIG) initBody.litAuthSig = LIT_AUTH_SIG;
        return initBody;
      });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({ error: initRes.statusText }));
        throw new Error(err.error || 'Failed to re-initialize session');
      }

      const data = await initRes.json();
      sessionId = data.sessionId;

      // Re-send init segments so the server caches them for WASM tenc extraction
      const segHeaders = await getSecureViewHeaders();
      if (videoTrackIdx !== -1) {
        await apiFetch('/api/media/segment', { sessionId, trackIndex: videoTrackIdx, init: true }, segHeaders);
      }
      if (audioTrackIdx !== -1) {
        await apiFetch('/api/media/segment', { sessionId, trackIndex: audioTrackIdx, init: true }, segHeaders);
      }

      console.log('[player] Session refreshed: ' + sessionId);
    } finally {
      sessionRefreshPromise = null;
    }
  })();

  return sessionRefreshPromise;
}

// ─── MSE Engine ──────────────────────────────────────────────────────
async function fetchSegmentWithRetry(trackIndex, segmentNumber, init) {
  const body = { sessionId, trackIndex };
  if (init) body.init = true;
  else body.segmentNumber = segmentNumber;

  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    try {
      const t0 = performance.now();
      let segHeaders = await getSecureViewHeaders();
      let res = await apiFetch('/api/media/segment', body, segHeaders);

      if (res.status === 401) {
        // Secure-view token expired or rotated — force the parent to
        // bootstrap a fresh session (wallet prompt) and retry once.
        invalidateSecureViewToken();
        segHeaders = await getSecureViewHeaders({ refresh: true });
        res = await apiFetch('/api/media/segment', body, segHeaders);
      }

      if (res.status === 410) {
        await refreshSession();
        body.sessionId = sessionId;
        const retryRes = await apiFetch('/api/media/segment', body, segHeaders);
        if (!retryRes.ok) {
          const err = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
          throw new Error(err.error || 'Failed to fetch segment after session refresh');
        }
        return await retryRes.arrayBuffer();
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to fetch segment');
      }

      const buf = await res.arrayBuffer();

      // Measure throughput for ABR (only for non-init video segments)
      if (!init && trackIndex === videoTrackIdx && buf.byteLength > 1000) {
        const elapsedSec = (performance.now() - t0) / 1000;
        if (elapsedSec > 0.05) {
          const bps = (buf.byteLength * 8) / elapsedSec;
          bandwidthSamples.push(bps);
          if (bandwidthSamples.length > ABR_SAMPLE_WINDOW) bandwidthSamples.shift();
        }
      }

      return buf;
    } catch (e) {
      if (attempt === MAX_SEGMENT_RETRIES - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function appendToSourceBuffer(sb, data, queue, setAppending) {
  return new Promise((resolve, reject) => {
    const label = (sb === videoSB) ? 'video' : 'audio';
    console.log('[player] appendToSourceBuffer(' + label + '): ' + data.byteLength + 'B, updating=' + sb.updating);
    if (sb.updating) {
      console.log('[player] SB(' + label + ') busy, queuing');
      queue.push({ data, resolve, reject });
      return;
    }
    setAppending(true);
    const onUpdate = () => {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onError);
      setAppending(false);
      console.log('[player] SB(' + label + ') append OK, buffered ranges:', sb.buffered.length);
      processQueue(sb, queue, setAppending);
      resolve();
    };
    const onError = (e) => {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onError);
      setAppending(false);
      console.error('[player] SB(' + label + ') append error:', e);
      reject(e);
    };
    try {
      sb.addEventListener('updateend', onUpdate);
      sb.addEventListener('error', onError);
      sb.appendBuffer(data);
    } catch (syncErr) {
      sb.removeEventListener('updateend', onUpdate);
      sb.removeEventListener('error', onError);
      setAppending(false);
      console.error('[player] SB(' + label + ') appendBuffer threw:', syncErr.name, syncErr.message);
      reject(syncErr);
    }
  });
}

function processQueue(sb, queue, setAppending) {
  if (queue.length === 0 || sb.updating) return;
  const { data, resolve, reject } = queue.shift();
  setAppending(true);
  const onUpdate = () => {
    sb.removeEventListener('updateend', onUpdate);
    sb.removeEventListener('error', onError);
    setAppending(false);
    processQueue(sb, queue, setAppending);
    resolve();
  };
  const onError = (e) => {
    sb.removeEventListener('updateend', onUpdate);
    sb.removeEventListener('error', onError);
    setAppending(false);
    reject(e);
  };
  sb.addEventListener('updateend', onUpdate);
  sb.addEventListener('error', onError);
  sb.appendBuffer(data);
}

function getBufferedEnd(sb) {
  if (!sb || sb.buffered.length === 0) return 0;
  let maxEnd = 0;
  for (let i = 0; i < sb.buffered.length; i++) {
    if (sb.buffered.end(i) > maxEnd) maxEnd = sb.buffered.end(i);
  }
  return maxEnd;
}

function evictOldBuffers(sb, currentTime) {
  if (!sb || sb.updating || sb.buffered.length === 0) return;
  const evictEnd = currentTime - BUFFER_EVICT_BEHIND_SEC;
  if (evictEnd <= 0) return;
  for (let i = 0; i < sb.buffered.length; i++) {
    if (sb.buffered.end(i) < evictEnd) {
      try { sb.remove(sb.buffered.start(i), sb.buffered.end(i)); } catch { /* skip */ }
      return;
    }
  }
}

// ─── Seek Recovery ───────────────────────────────────────────────────
function segmentIndexForTime(time, segStarts) {
  if (!segStarts.length) return 0;
  for (let i = segStarts.length - 1; i >= 0; i--) {
    if (segStarts[i] <= time) return i;
  }
  return 0;
}

function isTimeBuffered(time) {
  const buf = $video.buffered;
  for (let i = 0; i < buf.length; i++) {
    if (time >= buf.start(i) && time <= buf.end(i)) return true;
  }
  return false;
}

async function handleSeekToUnbuffered(targetTime) {
  if (isSeeking) return;
  isSeeking = true;
  $bufferingOverlay.style.display = 'flex';

  // Invalidate any in-flight appends from the pre-seek pipeline. Pending
  // fetches still resolve (their bytes cache in pc2-node's Helia, so the
  // work isn't wasted), but their append step is skipped by the generation
  // check — preventing stale data from corrupting the flushed SourceBuffer.
  videoFetchGeneration++;
  audioFetchGeneration++;
  videoAppendChain = Promise.resolve();
  audioAppendChain = Promise.resolve();

  try {
    const newVideoSeg = videoTrackIdx !== -1 ? segmentIndexForTime(targetTime, videoSegStarts) : 0;
    const newAudioSeg = audioTrackIdx !== -1 ? segmentIndexForTime(targetTime, audioSegStarts) : 0;

    // Flush existing buffers
    if (videoSB && !videoSB.updating) {
      try { videoSB.remove(0, Infinity); } catch { /* ignore */ }
      await new Promise(r => { videoSB.addEventListener('updateend', r, { once: true }); });
    }
    if (audioSB && !audioSB.updating) {
      try { audioSB.remove(0, Infinity); } catch { /* ignore */ }
      await new Promise(r => { audioSB.addEventListener('updateend', r, { once: true }); });
    }

    // Re-append init segments (required after flush)
    if (videoSB) {
      const initData = await fetchSegmentWithRetry(videoTrackIdx, 0, true);
      await appendToSourceBuffer(videoSB, initData, videoSegmentQueue, v => isAppendingVideo = v);
    }
    if (audioSB) {
      const initData = await fetchSegmentWithRetry(audioTrackIdx, 0, true);
      await appendToSourceBuffer(audioSB, initData, audioSegmentQueue, v => isAppendingAudio = v);
    }

    // Fetch a batch from the new position, in parallel (fetch concurrently,
    // append sequentially). Masks cache-miss latency when seeking into a
    // region whose blocks aren't yet in local Helia.
    videoNextSeg = newVideoSeg;
    audioNextSeg = newAudioSeg;
    const batch = 3;

    if (videoSB) {
      const videoFetches = [];
      const videoStart = videoNextSeg;
      for (let i = 0; i < batch && videoStart + i < videoSegCount; i++) {
        videoFetches.push(fetchSegmentWithRetry(videoTrackIdx, videoStart + i, false));
      }
      for (let i = 0; i < videoFetches.length; i++) {
        const data = await videoFetches[i];
        await appendToSourceBuffer(videoSB, data, videoSegmentQueue, v => isAppendingVideo = v);
        videoNextSeg = videoStart + i + 1;
      }
    }
    if (audioSB) {
      const audioFetches = [];
      const audioStart = audioNextSeg;
      for (let i = 0; i < batch && audioStart + i < audioSegCount; i++) {
        audioFetches.push(fetchSegmentWithRetry(audioTrackIdx, audioStart + i, false));
      }
      for (let i = 0; i < audioFetches.length; i++) {
        const data = await audioFetches[i];
        await appendToSourceBuffer(audioSB, data, audioSegmentQueue, v => isAppendingAudio = v);
        audioNextSeg = audioStart + i + 1;
      }
    }

    $video.currentTime = targetTime;
  } catch (e) {
    console.error('[player] Seek recovery failed:', e);
  } finally {
    isSeeking = false;
    $bufferingOverlay.style.display = 'none';
  }
}

// ─── Standalone Lit Auth (for filesystem double-click launch) ────────
async function performStandaloneLitAuth() {
  if (!window.ethereum) {
    throw new Error('Wallet not available. Please ensure your wallet is connected.');
  }

  $loadingText.textContent = 'Connecting wallet...';

  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    .then(a => (a && a.length > 0) ? a : window.ethereum.request({ method: 'eth_requestAccounts' }));
  const eoaAddress = accounts[0];
  const sp = new URLSearchParams(window.location.search);
  const smartAccount = sp.get('puter.smart_account') || null;
  // Store both addresses so init() can try the other if the first fails
  window.__pc2_eoaAddress = eoaAddress;
  window.__pc2_saAddress = (smartAccount && smartAccount.toLowerCase() !== eoaAddress.toLowerCase()) ? smartAccount : null;
  BUYER_ADDRESS = eoaAddress;

  $loadingText.textContent = 'Preparing Lit authentication...';

  const prepareRes = await apiFetch('/api/media/prepare-auth', { buyerAddress: eoaAddress });
  if (!prepareRes.ok) {
    const err = await prepareRes.json().catch(() => ({ error: prepareRes.statusText }));
    throw new Error(err.error || 'Failed to prepare Lit authentication');
  }
  const { requestId, siweMessage, chipotleMode } = await prepareRes.json();
  REQUEST_ID = requestId;

  if (chipotleMode || !siweMessage) {
    LIT_AUTH_SIG = { sig: '0x', derivedVia: 'chipotle-api-key', signedMessage: '', address: eoaAddress };
  } else {
    $loadingText.textContent = 'Please sign the authentication message in your wallet...';

    const msgHex = '0x' + Array.from(new TextEncoder().encode(siweMessage))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [msgHex, eoaAddress],
    });

    LIT_AUTH_SIG = {
      sig: sig,
      derivedVia: 'web3.eth.personal.sign',
      signedMessage: siweMessage,
      address: eoaAddress,
    };
  }
}

// ─── Cleartext Playback (non-DRM files) ──────────────────────────────
function initCleartext() {
  var fileUrl = FILE_URL || MEDIA_URI || '';
  if (!fileUrl) {
    showError('No file URL provided for cleartext playback.');
    return;
  }

  if (fileUrl.startsWith('/') && !fileUrl.startsWith('//')) {
    fileUrl = apiOrigin() + fileUrl;
  }

  var authToken = getAuthToken();
  if (authToken && fileUrl.indexOf('puter.auth.token') === -1) {
    fileUrl += (fileUrl.indexOf('?') === -1 ? '?' : '&') + 'puter.auth.token=' + encodeURIComponent(authToken);
  }

  var title = TITLE || 'Media';
  document.title = title + ' — Elacity Player';

  console.log('[player] Cleartext playback — URL:', fileUrl);

  var mimeType = params.mimeType || '';
  isAudioOnly = mimeType.indexOf('audio/') === 0;

  if (isAudioOnly) {
    var $audioArt = document.getElementById('audio-art');
    var $audioTitle = document.getElementById('audio-title');
    if ($audioArt) {
      $audioArt.style.display = 'flex';
      if (THUMBNAIL) {
        var img = document.createElement('img');
        img.src = THUMBNAIL;
        img.alt = title;
        img.onerror = function() { this.style.display = 'none'; };
        $audioArt.insertBefore(img, $audioArt.firstChild);
        var svgIcon = $audioArt.querySelector('svg');
        if (svgIcon) svgIcon.style.display = 'none';
      }
    }
    if ($audioTitle) $audioTitle.textContent = title;
  }

  if ($qualityGroup) $qualityGroup.style.display = 'none';
  $watermark.textContent = '';

  $video.src = fileUrl;
  duration = 0;

  $video.addEventListener('loadedmetadata', function () {
    duration = $video.duration || 0;
    $timeDuration.textContent = formatTime(duration);
    $seekBar.max = String(duration);
  }, { once: true });

  $video.addEventListener('error', function () {
    var err = $video.error;
    if (!err) return;
    var ext = (FILE_URL || fileUrl).split('.').pop().split('?')[0].toLowerCase();
    var isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    var firefoxBlocked = ['mkv', 'avi', 'mov', 'ts'];
    if (err.code === 4 && isFirefox && firefoxBlocked.indexOf(ext) !== -1) {
      showError('Firefox cannot play .' + ext + ' files natively. Try Chrome/Edge, or remux to .mp4 / .webm.');
    }
  }, { once: true });

  $loading.style.display = 'none';
  $container.style.display = 'flex';

  $video.play().catch(function () {});
}

// ─── Cleartext DASH Playback (free DASH content — no decryption) ─────
async function initCleartextDASH(mpdUrl, title) {
  $loadingText.textContent = 'Loading cleartext DASH stream...';
  console.log('[player] Cleartext DASH — fetching MPD:', mpdUrl);

  var authHeaders = {};
  var token = getAuthToken();
  if (token) authHeaders['Authorization'] = 'Bearer ' + token;

  function authFetch(url) {
    return fetch(url, { headers: authHeaders });
  }

  try {
    var mpdRes = await authFetch(mpdUrl);
    if (!mpdRes.ok) throw new Error('Failed to fetch MPD: ' + mpdRes.status);
    var mpdText = await mpdRes.text();

    var baseUrl = mpdUrl.substring(0, mpdUrl.lastIndexOf('/') + 1);
    // Strip query params from baseUrl
    if (baseUrl.indexOf('?') !== -1) baseUrl = baseUrl.substring(0, baseUrl.indexOf('?'));
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    var parser = new DOMParser();
    var mpd = parser.parseFromString(mpdText, 'application/xml');

    var adaptSets = mpd.querySelectorAll('AdaptationSet');
    var ctTracks = [];
    adaptSets.forEach(function (as) {
      var rep = as.querySelector('Representation');
      if (!rep) return;
      var mimeType = as.getAttribute('mimeType') || rep.getAttribute('mimeType') || '';
      var codec = rep.getAttribute('codecs') || as.getAttribute('codecs') || '';
      var initTpl = '', mediaTpl = '', segCount = 0;
      var segTpl = as.querySelector('SegmentTemplate') || rep.querySelector('SegmentTemplate');
      if (segTpl) {
        initTpl = segTpl.getAttribute('initialization') || '';
        mediaTpl = segTpl.getAttribute('media') || '';
        var timeline = segTpl.querySelector('SegmentTimeline');
        if (timeline) {
          var sElements = timeline.querySelectorAll('S');
          for (var si = 0; si < sElements.length; si++) {
            var r = parseInt(sElements[si].getAttribute('r') || '0');
            segCount += 1 + r;
          }
        }
      }
      ctTracks.push({ mimeType: mimeType, codec: codec, initTpl: initTpl, mediaTpl: mediaTpl, segCount: segCount });
    });

    if (ctTracks.length === 0) throw new Error('No tracks found in MPD');
    console.log('[player] Cleartext DASH tracks:', ctTracks.length, ctTracks.map(function (t) { return t.mimeType + ' codecs=' + t.codec + ' segs=' + t.segCount; }));

    if (!window.MediaSource) {
      showError('MediaSource API not available in this browser.');
      return;
    }

    var ms = new MediaSource();
    var msUrl = URL.createObjectURL(ms);
    $video.src = msUrl;

    ms.addEventListener('sourceopen', async function () {
      URL.revokeObjectURL(msUrl);
      try {
        var sourceBuffers = [];
        // Detect audio-only stream: no video tracks at all. Audio-only Bento4
        // DASH needs SourceBuffer.mode = 'sequence' (see encrypted path for
        // the full rationale).
        var ctIsAudioOnly = ctTracks.every(function (t) { return t.mimeType.indexOf('video') !== 0; });
        for (var ti = 0; ti < ctTracks.length; ti++) {
          var t = ctTracks[ti];
          var fullCodec = t.mimeType + '; codecs="' + t.codec + '"';
          console.log('[player] Cleartext DASH: codec check:', fullCodec, 'supported:', MediaSource.isTypeSupported(fullCodec));
          if (!MediaSource.isTypeSupported(fullCodec)) {
            console.warn('[player] Cleartext DASH: codec not supported, skipping:', fullCodec);
            continue;
          }
          var sb = ms.addSourceBuffer(fullCodec);
          if (ctIsAudioOnly && t.mimeType.indexOf('audio') === 0) {
            sb.mode = 'sequence';
            console.log('[player] Cleartext DASH: audio SourceBuffer mode set to "sequence" (audio-only)');
          }
          sourceBuffers.push({ sb: sb, track: t, idx: ti });
        }

        if (sourceBuffers.length === 0) {
          showError('No supported codecs found for cleartext DASH playback.');
          return;
        }

        // Append init segments for all source buffers
        for (var bi = 0; bi < sourceBuffers.length; bi++) {
          var entry = sourceBuffers[bi];
          var initUrl = baseUrl + entry.track.initTpl;
          console.log('[player] Cleartext DASH: fetching init [' + bi + ']:', initUrl);
          var initRes = await authFetch(initUrl);
          if (!initRes.ok) throw new Error('Failed to fetch init segment (' + initRes.status + '): ' + initUrl);
          var initBuf = await initRes.arrayBuffer();
          console.log('[player] Cleartext DASH: init [' + bi + '] received:', initBuf.byteLength, 'bytes');
          await new Promise(function (resolve, reject) {
            entry.sb.addEventListener('updateend', resolve, { once: true });
            entry.sb.addEventListener('error', function (e) { reject(new Error('SourceBuffer error on init append')); }, { once: true });
            entry.sb.appendBuffer(initBuf);
          });
          console.log('[player] Cleartext DASH: init [' + bi + '] appended OK');
        }

        // Fetch and append media segments — interleave for better playback start
        var totalSegs = 0;
        for (bi = 0; bi < sourceBuffers.length; bi++) totalSegs += sourceBuffers[bi].track.segCount;
        var segCounters = sourceBuffers.map(function () { return 1; });
        var batchSize = 4;

        // Buffer initial batch for quick playback start
        for (bi = 0; bi < sourceBuffers.length; bi++) {
          entry = sourceBuffers[bi];
          for (var s = 0; s < batchSize && segCounters[bi] <= entry.track.segCount; s++) {
            var segUrl = baseUrl + entry.track.mediaTpl.replace('$Number$', String(segCounters[bi]));
            var segRes = await authFetch(segUrl);
            if (!segRes.ok) { console.warn('[player] Cleartext seg fetch failed:', segUrl, segRes.status); break; }
            var segBuf = await segRes.arrayBuffer();
            await new Promise(function (resolve, reject) {
              entry.sb.addEventListener('updateend', resolve, { once: true });
              entry.sb.addEventListener('error', function () { reject(new Error('SourceBuffer error')); }, { once: true });
              entry.sb.appendBuffer(segBuf);
            });
            segCounters[bi]++;
          }
        }

        console.log('[player] Cleartext DASH: initial batch buffered, starting playback');
        $loading.style.display = 'none';
        $container.style.display = 'flex';
        duration = $video.duration || 0;
        $timeDuration.textContent = formatTime(duration);
        $seekBar.max = String(duration);
        if ($qualityGroup) $qualityGroup.style.display = 'none';
        $watermark.textContent = '';
        $video.play().catch(function () {});

        // Continue buffering remaining segments in background
        (async function bufferRemaining() {
          try {
            var allDone = false;
            while (!allDone) {
              allDone = true;
              for (var bi2 = 0; bi2 < sourceBuffers.length; bi2++) {
                var e2 = sourceBuffers[bi2];
                if (segCounters[bi2] <= e2.track.segCount) {
                  allDone = false;
                  var url2 = baseUrl + e2.track.mediaTpl.replace('$Number$', String(segCounters[bi2]));
                  var r2 = await authFetch(url2);
                  if (!r2.ok) { segCounters[bi2] = e2.track.segCount + 1; continue; }
                  var buf2 = await r2.arrayBuffer();
                  await new Promise(function (resolve) {
                    e2.sb.addEventListener('updateend', resolve, { once: true });
                    e2.sb.appendBuffer(buf2);
                  });
                  segCounters[bi2]++;
                }
              }
            }
            if (ms.readyState === 'open') ms.endOfStream();
            duration = $video.duration || 0;
            $timeDuration.textContent = formatTime(duration);
            $seekBar.max = String(duration);
            console.log('[player] Cleartext DASH: all segments buffered');
          } catch (bgErr) {
            console.warn('[player] Cleartext DASH background buffering error:', bgErr.message);
            if (ms.readyState === 'open') try { ms.endOfStream(); } catch (_) {}
          }
        })();

      } catch (e) {
        console.error('[player] Cleartext DASH sourceopen error:', e);
        showError('Cleartext DASH playback failed: ' + e.message);
      }
    });

  } catch (e) {
    console.error('[player] Cleartext DASH init error:', e);
    showError('Failed to load cleartext DASH: ' + e.message);
  }
}

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  if (CLEARTEXT) {
    initCleartext();
    return;
  }

  if (!CHANNEL || !TOKEN_ID) {
    showError('Missing channel or tokenId parameters.');
    return;
  }

  // v1.2.7: clear any stale "Playback Error" left over from a previous
  // attempt before the user retried. Otherwise the old red error pane
  // stays visible behind/under the new loading state and the user sees
  // misleading text from a previous (now-stale) failure for ~hundreds of
  // ms before /init responds. Belt-and-braces with the same toggle in
  // the pin_in_progress retry loop.
  $error.style.display = 'none';
  $loading.style.display = 'flex';

  try {
    if (STANDALONE && !LIT_AUTH_SIG) {
      await performStandaloneLitAuth();
    }

    $loadingText.textContent = 'Resolving content and recovering decryption key...';

    // Resolve both wallet addresses for fallback regardless of launch mode
    const urlParams = new URLSearchParams(window.location.search);
    const saFromUrl = urlParams.get('puter.smart_account') || null;
    let eoaAddr = window.__pc2_eoaAddress || null;
    let saAddr = window.__pc2_saAddress || saFromUrl || null;

    // Get EOA from wallet bridge (with timeout to avoid hanging)
    if (!eoaAddr && window.ethereum) {
      try {
        const accts = await Promise.race([
          window.ethereum.request({ method: 'eth_accounts' }),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 2000); })
        ]);
        if (accts && accts[0]) eoaAddr = accts[0];
      } catch (_) { /* ignore */ }
    }
    // Ensure EOA and SA are actually different addresses
    if (saAddr && eoaAddr && saAddr.toLowerCase() === eoaAddr.toLowerCase()) saAddr = null;
    // If BUYER_ADDRESS is the SA, make sure we have the EOA as alternate (and vice versa)
    if (eoaAddr && BUYER_ADDRESS && eoaAddr.toLowerCase() === BUYER_ADDRESS.toLowerCase()) eoaAddr = null;
    if (saAddr && BUYER_ADDRESS && saAddr.toLowerCase() === BUYER_ADDRESS.toLowerCase()) saAddr = null;
    console.log('[player] Wallet fallback — BUYER:', BUYER_ADDRESS, 'altEOA:', eoaAddr, 'altSA:', saAddr);

    function buildInitBody(buyerAddr) {
      const body = {
        channel: CHANNEL, tokenId: TOKEN_ID, mediaUri: MEDIA_URI,
        tokenURI: TOKEN_URI, title: TITLE, authority: AUTHORITY,
        buyerAddress: buyerAddr,
      };
      if (REQUEST_ID) body.requestId = REQUEST_ID;
      if (LIT_AUTH_SIG) body.litAuthSig = LIT_AUTH_SIG;
      return body;
    }

    async function tryInit(buyerAddr) {
      return mediaInit(function () { return buildInitBody(buyerAddr); });
    }

    async function isAccessError(res) {
      try {
        const body = await res.clone().json();
        const msg = (body.error || '').toLowerCase();
        return msg.includes('access') || msg.includes('denied') || msg.includes('token') || msg.includes('no valid');
      } catch (_) { return false; }
    }

    let initRes = await tryInit(BUYER_ADDRESS);
    // If access denied, try alternate wallet addresses
    if (!initRes.ok && saAddr && await isAccessError(initRes)) {
      console.log('[player] Access denied with', BUYER_ADDRESS, '— trying SA:', saAddr);
      BUYER_ADDRESS = saAddr;
      initRes = await tryInit(BUYER_ADDRESS);
    }
    if (!initRes.ok && eoaAddr && await isAccessError(initRes)) {
      console.log('[player] Access denied with', BUYER_ADDRESS, '— trying EOA:', eoaAddr);
      BUYER_ADDRESS = eoaAddr;
      initRes = await tryInit(BUYER_ADDRESS);
    }

    // C1: when /init reports the asset is still pinning locally, show a
    // friendly "Downloading X%…" UI and auto-retry every few seconds
    // instead of bouncing the user with the misleading "ask publisher to
    // peer" error. The pin job was started at buy-time; we just need to
    // wait for it. Bounded by MAX_PIN_WAIT_RETRIES so a wedged pin
    // eventually surfaces a real error.
    const MAX_PIN_WAIT_RETRIES = 60;       // 60 × 5s = 5 min ceiling
    const PIN_WAIT_INTERVAL_MS = 5000;
    let pinWaitRetries = 0;
    while (!initRes.ok && pinWaitRetries < MAX_PIN_WAIT_RETRIES) {
      let body = null;
      try { body = await initRes.clone().json(); } catch (_) { body = null; }
      if (!body || (body.code !== 'pin_in_progress')) break;

      const pct = typeof body.progressPercent === 'number' ? body.progressPercent : 0;
      const sizeMB = body.sizeBytes ? (body.sizeBytes / (1024 * 1024)).toFixed(1) : null;
      const dlMB = body.bytesDownloaded ? (body.bytesDownloaded / (1024 * 1024)).toFixed(1) : null;
      const sizeSuffix = (dlMB && sizeMB) ? ` (${dlMB} / ${sizeMB} MB)` : '';
      // Reuse the loading screen to show progress; keep error screen hidden
      // so we don't flash a "Playback Error" between retries.
      $loading.style.display = 'flex';
      $error.style.display = 'none';
      const $loadingText = document.getElementById('loading-text');
      if ($loadingText) {
        $loadingText.textContent = pct > 0
          ? `Downloading content to your node — ${pct}%${sizeSuffix}…`
          : 'Downloading content to your node…';
      }
      console.log(`[player] /init reports pin_in_progress (${pct}%, retry ${pinWaitRetries + 1}/${MAX_PIN_WAIT_RETRIES})`);
      await new Promise(r => setTimeout(r, PIN_WAIT_INTERVAL_MS));
      pinWaitRetries++;
      initRes = await tryInit(BUYER_ADDRESS);
    }

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({ error: initRes.statusText }));
      showError(err.error || err.message || 'Failed to initialize playback');
      return;
    }

    const data = await initRes.json();
    sessionId = data.sessionId;
    duration = data.duration;
    tracks = data.tracks;

    if (data.title) {
      document.title = data.title + ' — Elacity Player';
    }

    allVideoTracks = tracks.filter(t => t.type === 'video').sort((a, b) => a.bandwidth - b.bandwidth);
    const audioTracks = tracks.filter(t => t.type === 'audio').sort((a, b) => b.bandwidth - a.bandwidth);

    if (allVideoTracks.length > 0) {
      // Start at lowest quality for fast initial buffer, ABR will ramp up
      currentQualityIdx = 0;
      const chosen = allVideoTracks[currentQualityIdx];
      videoTrackIdx = chosen.index;
      videoSegCount = chosen.segmentCount;
      videoSegStarts = chosen.segmentStarts || [];
    }
    if (audioTracks.length > 0) {
      audioTrackIdx = audioTracks[0].index;
      audioSegCount = audioTracks[0].segmentCount;
      audioSegStarts = audioTracks[0].segmentStarts || [];
    }

    if (videoTrackIdx === -1 && audioTrackIdx === -1) {
      showError('No playable tracks found in content.');
      return;
    }

    isAudioOnly = videoTrackIdx === -1;
    if (isAudioOnly) {
      const $audioArt = document.getElementById('audio-art');
      const $audioTitle = document.getElementById('audio-title');
      if ($audioArt) {
        $audioArt.style.display = 'flex';
        if (THUMBNAIL) {
          const img = document.createElement('img');
          img.src = THUMBNAIL;
          img.alt = data.title || 'Audio';
          img.onerror = function() { this.style.display = 'none'; };
          $audioArt.insertBefore(img, $audioArt.firstChild);
          const svgIcon = $audioArt.querySelector('svg');
          if (svgIcon) svgIcon.style.display = 'none';
        }
      }
      if ($audioTitle) $audioTitle.textContent = data.title || 'Audio';
    }

    const sp = new URLSearchParams(window.location.search);
    const addr = sp.get('puter.smart_account') || params.buyerAddress || '';
    if (addr) {
      $watermark.textContent = addr.substring(0, 10) + '...' + addr.substring(addr.length - 6) + '\n' + new Date().toISOString().split('T')[0];
    }

    $loadingText.textContent = 'Buffering media segments...';

    if (!window.MediaSource) {
      showError('MediaSource API not available in this browser.');
      return;
    }

    mediaSource = new MediaSource();
    const msUrl = URL.createObjectURL(mediaSource);
    console.log('[player] MediaSource state:', mediaSource.readyState, 'URL:', msUrl);
    $video.src = msUrl;

    mediaSource.addEventListener('sourceended', () => {
      console.log('[player] sourceended fired, readyState:', mediaSource.readyState);
    });
    mediaSource.addEventListener('sourceclose', () => {
      console.warn('[player] sourceclose fired — MediaSource was detached from video element');
    });

    $video.addEventListener('error', () => {
      const e = $video.error;
      console.error('[player] <video> error event: code=' + (e && e.code) + ' message=' + (e && e.message));
    });

    mediaSource.addEventListener('sourceopen', async () => {
      console.log('[player] sourceopen fired, readyState:', mediaSource.readyState);

      if (mediaSource.sourceBuffers.length > 0) {
        console.warn('[player] sourceopen fired but SourceBuffers already exist — skipping duplicate init');
        return;
      }

      URL.revokeObjectURL(msUrl);
      try {
        if (videoTrackIdx !== -1) {
          const vTrack = tracks[videoTrackIdx];
          const vCodec = `${vTrack.mimeType}; codecs="${vTrack.codec}"`;
          console.log('[player] Video codec:', vCodec, 'isTypeSupported:', MediaSource.isTypeSupported(vCodec));
          if (!MediaSource.isTypeSupported(vCodec)) {
            showError(`Video codec "${vTrack.codec}" is not supported by this browser. Please update your browser or contact the creator.`);
            return;
          }
          videoSB = mediaSource.addSourceBuffer(vCodec);
          console.log('[player] Video SourceBuffer created');
        }
        if (audioTrackIdx !== -1) {
          const aTrack = tracks[audioTrackIdx];
          const aCodec = `${aTrack.mimeType}; codecs="${aTrack.codec}"`;
          console.log('[player] Audio codec:', aCodec, 'isTypeSupported:', MediaSource.isTypeSupported(aCodec));
          if (!MediaSource.isTypeSupported(aCodec)) {
            showError(`Audio codec "${aTrack.codec}" is not supported by this browser.`);
            return;
          }
          audioSB = mediaSource.addSourceBuffer(aCodec);
          // Audio-only Bento4 DASH emits SegmentTimeline `t=` resets between
          // AAC-frame-aligned segments. Default 'segments' mode honours each
          // segment's baseMediaDecodeTime, producing tiny gaps that stall
          // playback (no video timeline to mask them). 'sequence' mode pastes
          // each fragment directly after the previous one — correct for
          // audio-only where there is no A/V sync constraint.
          if (isAudioOnly) {
            audioSB.mode = 'sequence';
            console.log('[player] Audio SourceBuffer mode set to "sequence" (audio-only)');
          }
          console.log('[player] Audio SourceBuffer created');
        }

        if (videoSB) {
          const initData = await fetchSegmentWithRetry(videoTrackIdx, 0, true);
          console.log('[player] Video init data received:', initData.byteLength, 'bytes');
          console.log('[player] Video init first 16 bytes:', Array.from(new Uint8Array(initData.slice(0, 16))).map(b => b.toString(16).padStart(2, '0')).join(' '));
          console.log('[player] Video SB readyState before append:', mediaSource.readyState, 'videoSB.updating:', videoSB.updating);
          await appendToSourceBuffer(videoSB, initData, videoSegmentQueue, v => isAppendingVideo = v);
          console.log('[player] Video init appended OK');
        }
        if (audioSB) {
          const initData = await fetchSegmentWithRetry(audioTrackIdx, 0, true);
          console.log('[player] Audio init data received:', initData.byteLength, 'bytes');
          console.log('[player] Audio SB readyState before append:', mediaSource.readyState, 'audioSB.updating:', audioSB.updating);
          await appendToSourceBuffer(audioSB, initData, audioSegmentQueue, v => isAppendingAudio = v);
          console.log('[player] Audio init appended OK');
        }

        videoNextSeg = 0;
        audioNextSeg = 0;

        // Initial batch — kick off all fetches in parallel so a cold-start
        // (fresh buy, local Helia empty, every segment falling back to the
        // public gateway) doesn't serialise 4 × RTT before first frame.
        // Appends still run in strict segment order.
        const initialBatch = 4;
        if (videoSB) {
          const videoFetches = [];
          for (let i = 0; i < initialBatch && i < videoSegCount; i++) {
            videoFetches.push(fetchSegmentWithRetry(videoTrackIdx, i, false));
          }
          for (let i = 0; i < videoFetches.length; i++) {
            const data = await videoFetches[i];
            await appendToSourceBuffer(videoSB, data, videoSegmentQueue, v => isAppendingVideo = v);
            videoNextSeg = i + 1;
          }
        }
        if (audioSB) {
          const audioFetches = [];
          for (let i = 0; i < initialBatch && i < audioSegCount; i++) {
            audioFetches.push(fetchSegmentWithRetry(audioTrackIdx, i, false));
          }
          for (let i = 0; i < audioFetches.length; i++) {
            const data = await audioFetches[i];
            await appendToSourceBuffer(audioSB, data, audioSegmentQueue, v => isAppendingAudio = v);
            audioNextSeg = i + 1;
          }
        }

        $loading.style.display = 'none';
        $container.style.display = 'flex';
        $timeDuration.textContent = formatTime(duration);
        $seekBar.max = String(duration);

        startBufferLoop();
        buildQualityMenu();

        $video.play().catch(() => {});

      } catch (e) {
        const msg = e.message || e.type || (typeof e === 'string' ? e : JSON.stringify(e));
        showError('Failed to buffer media: ' + msg);
      }
    });

  } catch (e) {
    showError('Initialization failed: ' + e.message);
  }
}

// ─── ABR Engine ──────────────────────────────────────────────────────
function getEstimatedBandwidth() {
  if (bandwidthSamples.length < 2) return 0;
  // Use harmonic mean (conservative, better for variable networks)
  let sumInverse = 0;
  for (const s of bandwidthSamples) sumInverse += 1 / s;
  return bandwidthSamples.length / sumInverse;
}

function selectQuality(estimatedBps) {
  if (abrMode !== 'auto' || allVideoTracks.length <= 1) return currentQualityIdx;

  // Find highest quality whose bandwidth fits within estimated throughput
  let bestIdx = 0;
  for (let i = allVideoTracks.length - 1; i >= 0; i--) {
    if (allVideoTracks[i].bandwidth * ABR_UPGRADE_FACTOR <= estimatedBps) {
      bestIdx = i;
      break;
    }
  }

  // Downgrade quickly: if current quality exceeds bandwidth, step down
  if (currentQualityIdx > 0 && allVideoTracks[currentQualityIdx].bandwidth > estimatedBps * ABR_DOWNGRADE_FACTOR) {
    return Math.max(0, currentQualityIdx - 1);
  }

  // Upgrade conservatively: only go up one step at a time
  if (bestIdx > currentQualityIdx) return currentQualityIdx + 1;

  return currentQualityIdx;
}

async function switchVideoQuality(newQualityIdx) {
  if (isSwitchingQuality || newQualityIdx === currentQualityIdx) return;
  if (!videoSB || isAppendingVideo) return;
  isSwitchingQuality = true;

  // Invalidate pending pipelined appends so stale data from the old track
  // can't land after we re-append the new track's init segment (different
  // codec params would corrupt MSE state).
  videoFetchGeneration++;
  videoAppendChain = Promise.resolve();

  try {
    const newTrack = allVideoTracks[newQualityIdx];
    const oldLabel = formatQualityLabel(allVideoTracks[currentQualityIdx]);
    const newLabel = formatQualityLabel(newTrack);
    console.log(`[ABR] Switching: ${oldLabel} → ${newLabel} (${Math.round(getEstimatedBandwidth() / 1000)}kbps measured)`);

    currentQualityIdx = newQualityIdx;
    videoTrackIdx = newTrack.index;
    videoSegCount = newTrack.segmentCount;
    videoSegStarts = newTrack.segmentStarts || [];
    lastSwitchTime = Date.now();

    // Map current playback position to segment number in new track
    const ct = $video.currentTime;
    const bufEnd = getBufferedEnd(videoSB);
    videoNextSeg = segmentIndexForTime(bufEnd > ct ? bufEnd : ct, videoSegStarts);

    // Append the new track's init segment (tells MSE about the new codec params)
    const initData = await fetchSegmentWithRetry(videoTrackIdx, 0, true);
    await appendToSourceBuffer(videoSB, initData, videoSegmentQueue, v => isAppendingVideo = v);
  } catch (e) {
    console.error('[ABR] Quality switch failed:', e);
  } finally {
    isSwitchingQuality = false;
  }
}

function formatQualityLabel(track) {
  const w = track.width || 0;
  const h = track.height || 0;
  // Use the shorter dimension as the conventional "p" label (handles portrait too)
  const p = (w && h) ? Math.min(w, h) : (h || w);
  if (p) return p + 'p';
  return Math.round(track.bandwidth / 1000) + 'kbps';
}

// ─── Buffer Loop ─────────────────────────────────────────────────────
function startBufferLoop() {
  bufferLoopId = setInterval(async () => {
    if (isSeeking || isSwitchingQuality) return;
    const ct = $video.currentTime;
    let videoAllDone = videoTrackIdx === -1;
    let audioAllDone = audioTrackIdx === -1;

    evictOldBuffers(videoSB, ct);
    evictOldBuffers(audioSB, ct);

    // ABR: check if we should switch quality
    if (videoSB && allVideoTracks.length > 1 && abrMode === 'auto' && !isSwitchingQuality) {
      const bw = getEstimatedBandwidth();
      if (bw > 0 && Date.now() - lastSwitchTime > ABR_SWITCH_COOLDOWN_MS) {
        const newIdx = selectQuality(bw);
        if (newIdx !== currentQualityIdx) {
          await switchVideoQuality(newIdx);
        }
      }
    }

    // Video: fire as many parallel fetches as concurrency cap allows, up to
    // the point where we have BUFFER_AHEAD_SEC of video buffered. Appends
    // chain sequentially via videoAppendChain so MSE only sees in-order data.
    // Each pending append captures the current generation; if a seek or
    // quality-switch bumps the generation before the append runs, the data
    // is dropped rather than corrupting the freshly-flushed buffer.
    if (videoSB && videoNextSeg < videoSegCount && !isSwitchingQuality) {
      const bufEnd = getBufferedEnd(videoSB);
      while (
        videoInFlight < MAX_CONCURRENT_FETCHES_PER_TRACK &&
        videoNextSeg < videoSegCount &&
        bufEnd - ct < BUFFER_AHEAD_SEC
      ) {
        const segNum = videoNextSeg++;
        const gen = videoFetchGeneration;
        videoInFlight++;
        const fetchPromise = fetchSegmentWithRetry(videoTrackIdx, segNum, false);
        videoAppendChain = videoAppendChain
          .then(() => fetchPromise)
          .then((data) => {
            if (gen !== videoFetchGeneration) return undefined;
            return appendToSourceBuffer(videoSB, data, videoSegmentQueue, v => isAppendingVideo = v);
          })
          .catch((err) => { console.warn('[player] video seg ' + segNum + ' failed:', err && err.message); })
          .finally(() => { videoInFlight--; });
      }
    }
    if (videoNextSeg >= videoSegCount && videoInFlight === 0) videoAllDone = true;

    if (audioSB && audioNextSeg < audioSegCount) {
      const bufEnd = getBufferedEnd(audioSB);
      while (
        audioInFlight < MAX_CONCURRENT_FETCHES_PER_TRACK &&
        audioNextSeg < audioSegCount &&
        bufEnd - ct < BUFFER_AHEAD_SEC
      ) {
        const segNum = audioNextSeg++;
        const gen = audioFetchGeneration;
        audioInFlight++;
        const fetchPromise = fetchSegmentWithRetry(audioTrackIdx, segNum, false);
        audioAppendChain = audioAppendChain
          .then(() => fetchPromise)
          .then((data) => {
            if (gen !== audioFetchGeneration) return undefined;
            return appendToSourceBuffer(audioSB, data, audioSegmentQueue, v => isAppendingAudio = v);
          })
          .catch((err) => { console.warn('[player] audio seg ' + segNum + ' failed:', err && err.message); })
          .finally(() => { audioInFlight--; });
      }
    }
    if (audioNextSeg >= audioSegCount && audioInFlight === 0) audioAllDone = true;

    if (videoAllDone && audioAllDone && mediaSource.readyState === 'open') {
      try { mediaSource.endOfStream(); } catch { /* already ended */ }
    }
  }, 1000);
}

// ─── Controls ────────────────────────────────────────────────────────
function togglePlay() {
  if ($video.paused) $video.play();
  else $video.pause();
}

$btnPlay.addEventListener('click', togglePlay);
$videoWrapper.addEventListener('click', (e) => {
  if (e.target === $video || e.target === $videoWrapper) togglePlay();
});

$video.addEventListener('play', () => { $iconPlay.style.display = 'none'; $iconPause.style.display = 'block'; });
$video.addEventListener('pause', () => { $iconPlay.style.display = 'block'; $iconPause.style.display = 'none'; });

$video.addEventListener('timeupdate', () => {
  $timeCurrent.textContent = formatTime($video.currentTime);
  const d = CLEARTEXT ? ($video.duration || 0) : duration;
  if (d > 0) {
    $seekBar.value = String($video.currentTime);
    $seekProgress.style.width = ($video.currentTime / d * 100) + '%';
  }
  if (CLEARTEXT) {
    if (d > 0 && $seekBar.max !== String(d)) {
      $seekBar.max = String(d);
      $timeDuration.textContent = formatTime(d);
    }
  }
  updateBufferedBar();
});

$seekBar.addEventListener('input', () => {
  const targetTime = parseFloat($seekBar.value);
  if (CLEARTEXT) {
    $video.currentTime = targetTime;
  } else if (isTimeBuffered(targetTime)) {
    $video.currentTime = targetTime;
  } else {
    handleSeekToUnbuffered(targetTime);
  }
});

function updateBufferedBar() {
  if (!$video.buffered.length) return;
  let maxEnd = 0;
  for (let i = 0; i < $video.buffered.length; i++) {
    if ($video.buffered.end(i) > maxEnd) maxEnd = $video.buffered.end(i);
  }
  const d = CLEARTEXT ? ($video.duration || 0) : duration;
  if (d > 0) $seekBuffered.style.width = (maxEnd / d * 100) + '%';
}

$volumeBar.addEventListener('input', () => { $video.volume = parseInt($volumeBar.value) / 100; });

function updateMuteIcon() {
  const muted = $video.muted || $video.volume === 0;
  $iconVolOn.style.display = muted ? 'none' : 'block';
  $iconVolOff.style.display = muted ? 'block' : 'none';
}

$btnMute.addEventListener('click', () => {
  $video.muted = !$video.muted;
  $volumeBar.value = $video.muted ? '0' : String(Math.round($video.volume * 100));
  updateMuteIcon();
});
$video.volume = 0.8;

$btnFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.getElementById('player-root').requestFullscreen();
});

// ─── Quality Selector ────────────────────────────────────────────────
const $btnQuality = document.getElementById('btn-quality');
const $qualityMenu = document.getElementById('quality-menu');
const $qualityGroup = document.getElementById('quality-group');

function buildQualityMenu() {
  if (!$qualityMenu || allVideoTracks.length === 0) {
    if ($qualityGroup) $qualityGroup.style.display = 'none';
    return;
  }

  $qualityMenu.innerHTML = '';

  const currentLabel = (currentQualityIdx >= 0) ? formatQualityLabel(allVideoTracks[currentQualityIdx]) : '';

  // Auto option
  const autoItem = document.createElement('div');
  autoItem.className = 'q-item' + (abrMode === 'auto' ? ' active' : '');
  const autoSuffix = abrMode === 'auto' && currentLabel ? ' (' + currentLabel + ')' : '';
  autoItem.innerHTML = '<span class="q-dot"></span>Auto' + autoSuffix;
  autoItem.addEventListener('click', () => {
    abrMode = 'auto';
    bandwidthSamples = [];
    lastSwitchTime = 0;
    buildQualityMenu();
    $qualityMenu.style.display = 'none';
  });
  $qualityMenu.appendChild(autoItem);

  // Individual quality options (highest first)
  for (let i = allVideoTracks.length - 1; i >= 0; i--) {
    const track = allVideoTracks[i];
    const label = formatQualityLabel(track);
    const item = document.createElement('div');
    const isActive = abrMode !== 'auto' && currentQualityIdx === i;
    item.className = 'q-item' + (isActive ? ' active' : '');
    item.innerHTML = `<span class="q-dot"></span>${label}`;
    item.addEventListener('click', ((idx) => () => {
      abrMode = idx;
      if (idx !== currentQualityIdx) switchVideoQuality(idx);
      buildQualityMenu();
      $qualityMenu.style.display = 'none';
    })(i));
    $qualityMenu.appendChild(item);
  }
}

if ($btnQuality) {
  $btnQuality.addEventListener('click', (e) => {
    e.stopPropagation();
    if ($qualityMenu.style.display === 'none') {
      buildQualityMenu();
      $qualityMenu.style.display = 'block';
    } else {
      $qualityMenu.style.display = 'none';
    }
  });
}

document.addEventListener('click', (e) => {
  if ($qualityMenu && $qualityGroup && !$qualityGroup.contains(e.target)) {
    $qualityMenu.style.display = 'none';
  }
});

// ─── Buffering Indicator ─────────────────────────────────────────────
$video.addEventListener('waiting', () => { $bufferingOverlay.style.display = 'flex'; });
$video.addEventListener('playing', () => { $bufferingOverlay.style.display = 'none'; });
$video.addEventListener('canplay', () => { $bufferingOverlay.style.display = 'none'; });

// ─── Video Error Handler ─────────────────────────────────────────────
$video.addEventListener('error', () => {
  const err = $video.error;
  if (!err) return;
  const msgs = {
    1: 'Playback aborted.',
    2: 'A network error occurred.',
    3: 'Media decode failed. The content may be corrupted.',
    4: 'Media format not supported by this browser.',
  };
  showError(msgs[err.code] || 'An unknown playback error occurred (code ' + err.code + ').');
});

// ─── Auto-Hide Controls ──────────────────────────────────────────────
function showControls() {
  $controls.classList.remove('hidden');
  document.body.style.cursor = '';
  clearTimeout(controlsIdleTimer);
  controlsIdleTimer = setTimeout(hideControls, 3000);
}

function hideControls() {
  if ($video.paused) return;
  $controls.classList.add('hidden');
  document.body.style.cursor = 'none';
}

$container.addEventListener('mousemove', showControls);
$container.addEventListener('mouseenter', showControls);
$container.addEventListener('mouseleave', () => { if (!$video.paused) hideControls(); });
$video.addEventListener('pause', showControls);
$video.addEventListener('play', () => { controlsIdleTimer = setTimeout(hideControls, 3000); });

// ─── Seek Helper ─────────────────────────────────────────────────────
function seekByDelta(deltaSec) {
  const d = CLEARTEXT ? ($video.duration || 0) : duration;
  const target = Math.max(0, Math.min(d, $video.currentTime + deltaSec));
  if (CLEARTEXT) {
    $video.currentTime = target;
  } else if (isTimeBuffered(target)) {
    $video.currentTime = target;
  } else {
    handleSeekToUnbuffered(target);
  }
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p' || e.key === 'S' || e.key === 'P')) {
    e.preventDefault();
    return;
  }
  if (e.key === 'PrintScreen') { e.preventDefault(); return; }

  if ($container.style.display === 'none') return;

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      seekByDelta(-5);
      showControls();
      break;
    case 'ArrowRight':
      e.preventDefault();
      seekByDelta(5);
      showControls();
      break;
    case 'j':
      e.preventDefault();
      seekByDelta(-10);
      showControls();
      break;
    case 'l':
      e.preventDefault();
      seekByDelta(10);
      showControls();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.getElementById('player-root').requestFullscreen();
      break;
    case 'm':
    case 'M':
      e.preventDefault();
      $video.muted = !$video.muted;
      $volumeBar.value = $video.muted ? '0' : String(Math.round($video.volume * 100));
      updateMuteIcon();
      showControls();
      break;
    case 'ArrowUp':
      e.preventDefault();
      $video.volume = Math.min(1, $video.volume + 0.1);
      $volumeBar.value = String(Math.round($video.volume * 100));
      updateMuteIcon();
      showControls();
      break;
    case 'ArrowDown':
      e.preventDefault();
      $video.volume = Math.max(0, $video.volume - 0.1);
      $volumeBar.value = String(Math.round($video.volume * 100));
      updateMuteIcon();
      showControls();
      break;
  }
});

// ─── Anti-Piracy (DRM only) ──────────────────────────────────────────
if (!CLEARTEXT) {
  document.addEventListener('contextmenu', e => e.preventDefault());
  $video.addEventListener('enterpictureinpicture', () => {
    document.exitPictureInPicture().catch(() => {});
  });
  $video.disablePictureInPicture = true;
  $video.addEventListener('dragstart', e => e.preventDefault());
}

// ─── Start ───────────────────────────────────────────────────────────
init();
