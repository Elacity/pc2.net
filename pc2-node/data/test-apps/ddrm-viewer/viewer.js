/**
 * dDRM Viewer — Secure runtime for dDRM-protected digital assets.
 *
 * Receives asset params via URL query string or puter.args JSON,
 * calls /api/storage/lit/secure-view to decrypt and render content
 * server-side, then displays the rendered output.
 *
 * - Images: centered fit-contain display
 * - Text / PDF: full-width scrollable document view (all pages stacked)
 */
(function () {
  'use strict';

  var AUTH_TOKEN = (function () {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get('puter.auth.token') || p.get('auth_token') || p.get('token') || '';
    } catch (_) { return ''; }
  })();

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (AUTH_TOKEN && !opts.headers['Authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
    }
    if (!opts.credentials) opts.credentials = 'include';
    return fetch(url, opts);
  }

  // ── Secure-view session (Option C session-key delegation) ────────
  //
  // The session lifecycle (ephemeral P-256 keypair, 24h delegation,
  // wallet personal_sign) lives ENTIRELY in the parent PC2 frame —
  // see pc2-node/frontend/pc2-secure-view.js. This iframe only asks
  // the parent to sign a per-asset SecureViewRequest, then attaches
  // the returned bundle to /lit/secure-view.
  //
  // Architectural rationale: third-party wallet extensions (TronLink,
  // Phantom, Rabby) hijack window.ethereum inside iframes, fanning a
  // single signature request into N MetaMask popups that frequently
  // never resolve. Doing the signing in the parent — exactly like
  // every other PC2 wallet flow (login, mint, send) — makes the UX
  // consistent ("one wallet prompt at session start, double-click to
  // open after that") and removes the iframe wallet attack surface.
  //
  // The bridge call is mandatory: if the parent has no secure-view
  // manager (no injected wallet, user declined the wallet prompt) the
  // server returns 401 session_bundle_required and the viewer surfaces
  // a re-connect prompt. The legacy 14-day rollout window closed when
  // Phase 5 cleanup landed (2026-04-21).

  var SECURE_VIEW_SIGN_TIMEOUT_MS = 60000;

  function requestTokenFromParent(opts) {
    // Prefer window.pc2Wallet — this is the unambiguous PC2 provider
    // shim reference. window.ethereum can be hijacked by MetaMask /
    // TronLink / Phantom inside iframes, in which case
    // pc2_secureView_sign is rejected as an unknown method before the
    // call ever reaches the parent bridge.
    var provider = window.pc2Wallet
      || (window.ethereum && window.ethereum.isPC2WalletBridge ? window.ethereum : null);
    if (!provider || typeof provider.request !== 'function') {
      return Promise.reject(new Error('No PC2 wallet bridge available (window.pc2Wallet missing)'));
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('pc2_secureView_sign timed out after ' + SECURE_VIEW_SIGN_TIMEOUT_MS + 'ms'));
      }, SECURE_VIEW_SIGN_TIMEOUT_MS);

      provider.request({
        method: 'pc2_secureView_sign',
        params: [{ refresh: !!(opts && opts.refresh) }]
      }).then(function (bundle) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(bundle);
      }).catch(function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // POST /lit/secure-view with the parent-held bearer token. On
  // session_token_invalid (server restarted, session evicted) ask the
  // parent to drop the stale token and re-bootstrap, then retry once.
  function secureViewPost(body) {
    function callOnce(refresh) {
      return requestTokenFromParent({ refresh: refresh })
        .then(function (bundle) {
          var headers = { 'Content-Type': 'application/json' };
          if (bundle && bundle.token) {
            body.sessionToken = bundle.token;
            headers['X-SecureView-Session'] = bundle.token;
          }
          return authFetch('/api/storage/lit/secure-view', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
          });
        });
    }
    return callOnce(false).then(function (resp) {
      if (resp.status !== 401) return resp;
      return resp.clone().json().catch(function () { return {}; }).then(function (payload) {
        if (payload && payload.error === 'session_token_invalid') {
          console.warn('[Viewer] Session token invalid — refreshing and retrying');
          return callOnce(true);
        }
        return resp;
      });
    });
  }

  // ── DOM refs ──────────────────────────────────────────

  var $title        = document.getElementById('viewer-title');
  var $subtitle     = document.getElementById('viewer-subtitle');
  var $loading      = document.getElementById('loading-state');
  var $loadingText  = document.getElementById('loading-text');
  var $error        = document.getElementById('error-state');
  var $errorTitle   = document.getElementById('error-title');
  var $errorMsg     = document.getElementById('error-message');
  var $content      = document.getElementById('content-area');
  var $imgContainer = document.getElementById('image-container');
  var $img          = document.getElementById('rendered-image');
  var $docContainer = document.getElementById('document-container');
  var $rendererBdg  = document.getElementById('renderer-badge');
  var $watermarkBdg = document.getElementById('watermark-badge');
  var $pageCounter  = document.getElementById('page-counter');
  var $assetType    = document.getElementById('asset-type');

  // Toolbar refs
  var $toolbar      = document.getElementById('viewer-toolbar');
  var $zoomLevel    = document.getElementById('zoom-level');
  var $btnZoomIn    = document.getElementById('btn-zoom-in');
  var $btnZoomOut   = document.getElementById('btn-zoom-out');
  var $btnFullscreen = document.getElementById('btn-fullscreen');
  var $pageNav      = document.getElementById('toolbar-page-nav');
  var $pageIndicator = document.getElementById('page-indicator');
  var $btnPagePrev  = document.getElementById('btn-page-prev');
  var $btnPageNext  = document.getElementById('btn-page-next');

  // ── Parse launch params ───────────────────────────────

  var params = new URLSearchParams(window.location.search);

  var puterArgs = (function () {
    try {
      var raw = params.get('puter.args');
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  })();

  function p(key, fallback) {
    return puterArgs[key] || params.get(key) || fallback;
  }

  var rawKid = p('kid', '');
  var assetParams = {
    litCiphertext:     p('litCiphertext', ''),
    dataToEncryptHash: p('dataToEncryptHash', ''),
    encryptedDataCid:  p('encryptedDataCid', ''),
    iv:                p('iv', ''),
    // Lit Action compares req.kid (from signed session) against 0x-normalised jsParams.kid.
    // Normalise here so the session request and jsParams carry the same format.
    kid:               rawKid && !rawKid.startsWith('0x') ? '0x' + rawKid : rawKid,
    buyerAddress:      p('buyerAddress', ''),
    buyerAddressAlt:   p('buyerAddressAlt', ''),
    mimeType:          p('mimeType', 'application/octet-stream'),
    actionCid:         p('actionCid', ''),
    authority:         p('authority', ''),
    signature:         p('signature', null),
    issuer:            p('issuer', null),
    title:             p('title', ''),
    maxWidth:          Math.min(window.innerWidth * (window.devicePixelRatio || 1), 1600),
  };

  // ── Helpers ───────────────────────────────────────────

  var isDocumentType = assetParams.mimeType === 'application/pdf'
    || assetParams.mimeType.indexOf('text/') === 0;
  var isAudioType = assetParams.mimeType.indexOf('audio/') === 0;
  var is3DType = assetParams.mimeType.indexOf('model/') === 0;
  var isCSVType = assetParams.mimeType === 'text/csv' || assetParams.mimeType === 'text/tab-separated-values';
  var isFontType = assetParams.mimeType.indexOf('font/') === 0 || assetParams.mimeType === 'application/vnd.ms-fontobject';
  var isArchiveType = assetParams.mimeType === 'application/zip' || assetParams.mimeType === 'application/gzip' || assetParams.mimeType === 'application/x-tar';
  var isEpubType = assetParams.mimeType === 'application/epub+zip' || assetParams.mimeType === 'application/epub';
  var isCbzType = assetParams.mimeType === 'application/vnd.comicbook+zip' || assetParams.mimeType === 'application/x-cbz';
  var isInteractivePassthrough = is3DType || isCSVType || isFontType || isArchiveType;
  var isCleartext = p('cleartext', '') === 'true';
  var cleartextCid = p('cleartextCid', '');
  var cleartextFileUrl = p('fileUrl', '');

  if (isCSVType) isDocumentType = false;

  // Audio DOM refs
  var $audioContainer = document.getElementById('audio-container');
  var $audioEl        = document.getElementById('audio-element');
  var $audioTitle     = document.getElementById('audio-title');
  var $btnAudioPlay   = document.getElementById('btn-audio-play');
  var $audioPlayIcon  = document.getElementById('audio-play-icon');
  var $audioPauseIcon = document.getElementById('audio-pause-icon');
  var $audioTime      = document.getElementById('audio-time');
  var $audioSeek      = document.getElementById('audio-seek');
  var $audioVolume    = document.getElementById('audio-volume');

  // ── State ─────────────────────────────────────────────

  var viewerState = {
    totalPages: 1,
    pagesLoaded: 0,
    blobUrls: [],
  };

  var zoom = { level: 1, min: 0.25, max: 5, step: 0.25 };
  var pan = { active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 };
  var imgBaseWidth = 0;
  var currentPage = 1;
  var toolbarTimer = null;

  // ── Init ──────────────────────────────────────────────

  function init() {
    if (assetParams.title) {
      $title.textContent = assetParams.title;
      document.title = assetParams.title + (isCleartext ? ' — Elacity Viewer' : ' — dDRM Viewer');
    }

    $subtitle.textContent = humanMime(assetParams.mimeType);
    $assetType.textContent = assetParams.mimeType;

    if (!isCleartext) disableContextMenu();

    if (isCleartext && (cleartextFileUrl || cleartextCid)) {
      loadCleartext();
      return;
    }

    if (!assetParams.encryptedDataCid || !assetParams.kid) {
      showError('Missing Parameters', 'This viewer requires asset parameters to be provided via the launch URL.');
      return;
    }

    if (isEpubType) { loadEpub(); return; }
    if (isCbzType)  { loadCbz();  return; }

    loadFirstPage();
  }

  // ── Cleartext loading (non-DRM files) ──────────────────

  function loadCleartext() {
    showLoading();
    $loadingText.textContent = 'Loading file...';

    $rendererBdg.classList.add('hidden');
    $watermarkBdg.classList.add('hidden');

    var url = cleartextFileUrl;
    if (!url && cleartextCid) {
      var sp = new URLSearchParams(window.location.search);
      var origin = sp.get('puter.api_origin') || window.location.origin;
      url = origin + '/ipfs/' + cleartextCid;
    }
    if (url.startsWith('/') && !url.startsWith('//')) {
      var sp2 = new URLSearchParams(window.location.search);
      var origin2 = sp2.get('puter.api_origin') || window.location.origin;
      url = origin2 + url;
    }

    if (AUTH_TOKEN && url.indexOf('puter.auth.token') === -1) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'puter.auth.token=' + encodeURIComponent(AUTH_TOKEN);
    }

    var mime = assetParams.mimeType;

    if (mime === 'application/pdf') {
      loadCleartextPDF(url);
      return;
    }

    fetch(url, { credentials: 'include' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load file (' + resp.status + ')');
        return resp.blob();
      })
      .then(function (blob) {
        var blobUrl = URL.createObjectURL(blob);
        viewerState.blobUrls.push(blobUrl);

        if (isAudioType) {
          showAudioPlayer(blobUrl);
        } else if (is3DType) {
          show3DModel(blob);
        } else if (isCSVType) {
          showDataTable(blob);
        } else if (isFontType) {
          showFontPreview(blobUrl);
        } else if (isArchiveType) {
          showArchive(blob);
        } else if (mime.indexOf('image/') === 0) {
          showImage(blobUrl);
        } else {
          showImage(blobUrl);
        }
      })
      .catch(function (err) {
        console.error('[Viewer] Cleartext load failed:', err);
        showError('Load Failed', err.message || 'Unable to load this file.');
      });
  }

  function loadCleartextPDF(url) {
    fetch(url, { credentials: 'include' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load PDF (' + resp.status + ')');
        return resp.arrayBuffer();
      })
      .then(function (arrayBuf) {
        if (typeof pdfjsLib === 'undefined') {
          var blobUrl = URL.createObjectURL(new Blob([arrayBuf], { type: 'application/pdf' }));
          viewerState.blobUrls.push(blobUrl);
          showPDFEmbed(blobUrl);
          return;
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc || '';

        pdfjsLib.getDocument({ data: arrayBuf }).promise.then(function (pdf) {
          viewerState.totalPages = pdf.numPages;

          $loading.classList.add('hidden');
          $error.classList.add('hidden');
          $content.classList.remove('hidden');
          $imgContainer.classList.add('hidden');
          $docContainer.classList.remove('hidden');
          $docContainer.innerHTML = '';

          if (viewerState.totalPages > 1) {
            $pageNav.style.display = 'flex';
          }

          // HiDPI rendering: render the PDF bitmap at scale * devicePixelRatio
          // so 4K / Retina displays get sharp pages, while keeping the canvas
          // CSS width at 100% so layout is unchanged. cap at 3x to bound memory
          // on extreme DPR (e.g. 4x emulator profiles).
          var scale = 1.5;
          var dpr = Math.min(window.devicePixelRatio || 1, 3);
          var renderScale = scale * dpr;
          var rendered = 0;

          for (var i = 1; i <= pdf.numPages; i++) {
            (function (pageNum) {
              var canvasEl = document.createElement('canvas');
              canvasEl.className = 'page-img';
              canvasEl.style.display = 'block';
              canvasEl.style.marginBottom = '8px';
              canvasEl.style.width = '100%';
              $docContainer.appendChild(canvasEl);

              pdf.getPage(pageNum).then(function (page) {
                var viewport = page.getViewport({ scale: renderScale });
                canvasEl.width = viewport.width;
                canvasEl.height = viewport.height;
                // Reserve aspect ratio so the page's CSS height matches the
                // bitmap before render finishes (prevents visible jump from
                // 0-height placeholder to fully sized canvas).
                canvasEl.style.aspectRatio = (viewport.width / viewport.height).toString();
                var ctx = canvasEl.getContext('2d');
                page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                  rendered++;
                  viewerState.pagesLoaded = rendered;
                  updatePageCounter();
                });
              });
            })(i);
          }

          $content.addEventListener('scroll', trackVisiblePage);
          initToolbar();
          updatePageCounter();
        });
      })
      .catch(function (err) {
        console.error('[Viewer] PDF load failed:', err);
        showError('PDF Load Failed', err.message || 'Unable to load PDF.');
      });
  }

  function showPDFEmbed(blobUrl) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.remove('hidden');
    $docContainer.innerHTML = '';

    var embed = document.createElement('embed');
    embed.src = blobUrl;
    embed.type = 'application/pdf';
    embed.style.width = '100%';
    embed.style.height = '100%';
    embed.style.minHeight = '80vh';
    $docContainer.appendChild(embed);
  }

  // ── Secure view request ───────────────────────────────

  function buildBody(page, opts) {
    opts = opts || {};
    var body = {
      litCiphertext:     assetParams.litCiphertext,
      dataToEncryptHash: assetParams.dataToEncryptHash,
      encryptedDataCid:  assetParams.encryptedDataCid,
      iv:                assetParams.iv,
      kid:               assetParams.kid,
      buyerAddress:      assetParams.buyerAddress,
      mimeType:          assetParams.mimeType,
      maxWidth:          assetParams.maxWidth,
      page:              page,
    };
    if (typeof opts.chapter === 'number') body.chapter = opts.chapter;
    if (typeof opts.viewportWidth === 'number') body.viewportWidth = opts.viewportWidth;
    if (assetParams.buyerAddressAlt) body.buyerAddressAlt = assetParams.buyerAddressAlt;
    if (assetParams.actionCid) body.actionCid = assetParams.actionCid;
    if (assetParams.authority) body.authority = assetParams.authority;
    if (assetParams.signature) body.signature = assetParams.signature;
    if (assetParams.issuer) body.issuer = assetParams.issuer;
    if (assetParams.litBackend) body.litBackend = assetParams.litBackend;
    return body;
  }

  function loadFirstPage() {
    $loadingText.textContent = 'Verifying access rights...';
    showLoading();

    secureViewPost(buildBody(1))
    .then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          var errMsg;
          try { errMsg = JSON.parse(body).error; } catch (_) { errMsg = 'Secure view failed (' + resp.status + ')'; }
          throw new Error(errMsg);
        });
      }

      var renderer   = resp.headers.get('X-Renderer') || '';
      var totalPages = parseInt(resp.headers.get('X-Asset-Pages') || '0', 10);

      if (totalPages > 0) viewerState.totalPages = totalPages;

      if (renderer) {
        $rendererBdg.textContent = renderer.replace('nodejs-', '');
        $rendererBdg.classList.remove('hidden');
      }

      if (renderer === 'wasm') {
        $watermarkBdg.textContent = 'Watermarked';
        $watermarkBdg.classList.remove('hidden');
      }

      return resp.blob().then(function (blob) {
        return { blob: blob };
      });
    })
    .then(function (result) {
      var blobUrl = URL.createObjectURL(result.blob);
      viewerState.blobUrls.push(blobUrl);

      if (isAudioType) {
        showAudioPlayer(blobUrl);
      } else if (is3DType) {
        show3DModel(result.blob);
      } else if (isCSVType) {
        showDataTable(result.blob);
      } else if (isFontType) {
        showFontPreview(blobUrl);
      } else if (isArchiveType) {
        showArchive(result.blob);
      } else if (isDocumentType) {
        showDocument(blobUrl);
      } else {
        showImage(blobUrl);
      }

      if (viewerState.totalPages > 1) {
        updatePageCounter();
        loadRemainingPages();
      }
    })
    .catch(function (err) {
      console.error('[dDRM Viewer] Load failed:', err);
      showError('Decryption Failed', err.message || 'Unable to decrypt and render this asset.');
    });
  }

  function loadRemainingPages() {
    for (var i = 2; i <= viewerState.totalPages; i++) {
      (function (pageNum) {
        secureViewPost(buildBody(pageNum))
        .then(function (resp) {
          if (!resp.ok) throw new Error('Page ' + pageNum + ' failed');
          return resp.blob();
        })
        .then(function (blob) {
          var blobUrl = URL.createObjectURL(blob);
          viewerState.blobUrls.push(blobUrl);
          var placeholder = document.getElementById('page-slot-' + pageNum);
          if (placeholder) {
            var img = document.createElement('img');
            img.className = 'page-img';
            img.alt = 'Page ' + pageNum;
            img.draggable = false;
            img.oncontextmenu = function (e) { e.preventDefault(); return false; };
            img.src = blobUrl;
            placeholder.replaceWith(img);
          }
          viewerState.pagesLoaded++;
          updatePageCounter();
        })
        .catch(function (err) {
          console.error('[dDRM Viewer] Page ' + pageNum + ' failed:', err);
          var placeholder = document.getElementById('page-slot-' + pageNum);
          if (placeholder) placeholder.textContent = 'Failed to load page ' + pageNum;
        });
      })(i);
    }
  }

  // ── EPUB: reflowable ebook ─────────────────────────────

  function decodeTocHeader(b64) {
    if (!b64) return null;
    try {
      var bin = atob(b64);
      try { return JSON.parse(decodeURIComponent(escape(bin))); }
      catch (_) { return JSON.parse(bin); }
    } catch (_) { return null; }
  }

  function fetchEpubChapter(chapterIdx) {
    var body = buildBody(1, {
      chapter: chapterIdx,
      viewportWidth: Math.max(320, Math.min(window.innerWidth - 40, 900)),
    });
    return secureViewPost(body).then(function (resp) {
      if (resp.status === 409) {
        return resp.json().then(function (err) {
          throw new Error(err.message || 'This EPUB uses a fixed layout which is not yet supported.');
        });
      }
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          var m;
          try { m = JSON.parse(txt).error; } catch (_) { m = 'Failed to load chapter'; }
          throw new Error(m);
        });
      }
      var totalChapters = parseInt(resp.headers.get('X-Asset-Chapters') || '0', 10);
      var toc = decodeTocHeader(resp.headers.get('X-Asset-TOC') || '');
      var title = decodeURIComponent(resp.headers.get('X-Asset-Title') || '');
      var author = decodeURIComponent(resp.headers.get('X-Asset-Author') || '');
      var renderer = resp.headers.get('X-Renderer') || '';
      if (renderer) {
        $rendererBdg.textContent = renderer;
        $rendererBdg.classList.remove('hidden');
      }
      if (renderer === 'wasm') {
        $watermarkBdg.textContent = 'Watermarked';
        $watermarkBdg.classList.remove('hidden');
      }
      return resp.text().then(function (html) {
        return {
          html: html,
          totalChapters: totalChapters,
          toc: toc || [],
          title: title,
          author: author,
        };
      });
    });
  }

  function loadEpub() {
    if (typeof window.EpubReader === 'undefined' || !window.EpubReader.open) {
      showError('EPUB Reader Error', 'Ebook reader module not loaded.');
      return;
    }
    showLoading();
    $loadingText.textContent = 'Opening ebook...';

    var $epub = document.getElementById('epub-container');
    window.EpubReader.open({
      container: $epub,
      blobUrls: viewerState.blobUrls,
      viewportWidth: Math.max(320, Math.min(window.innerWidth - 40, 900)),
      fetchChapter: fetchEpubChapter,
      onReady: function () {
        $loading.classList.add('hidden');
        $error.classList.add('hidden');
        $content.classList.remove('hidden');
      },
      onError: function (title, msg) {
        showError(title, msg);
      },
    });
  }

  // ── CBZ: comic book reader ─────────────────────────────

  function fetchCbzPage(pageNum) {
    var body = buildBody(pageNum);
    return secureViewPost(body).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          var m;
          try { m = JSON.parse(txt).error; } catch (_) { m = 'Failed to load page'; }
          throw new Error(m);
        });
      }
      if (!viewerState.cbzInitDone) {
        var totalPages = parseInt(resp.headers.get('X-Asset-Pages') || '0', 10);
        if (totalPages > 0) viewerState.totalPages = totalPages;
        var renderer = resp.headers.get('X-Renderer') || '';
        if (renderer) {
          $rendererBdg.textContent = renderer;
          $rendererBdg.classList.remove('hidden');
        }
        if (renderer === 'wasm') {
          $watermarkBdg.textContent = 'Watermarked';
          $watermarkBdg.classList.remove('hidden');
        }
        viewerState.cbzInitDone = true;
        if (viewerState.cbzState) {
          viewerState.cbzState.totalPages = viewerState.totalPages;
          if (viewerState.cbzState.indicator) {
            viewerState.cbzState.indicator.textContent = 'Page ' + viewerState.cbzState.current + ' / ' + viewerState.totalPages;
          }
        }
      }
      return resp.blob();
    });
  }

  function loadCbz() {
    if (typeof window.CbzReader === 'undefined' || !window.CbzReader.open) {
      showError('Comic Reader Error', 'Comic reader module not loaded.');
      return;
    }
    showLoading();
    $loadingText.textContent = 'Opening comic...';

    var $cbz = document.getElementById('cbz-container');
    viewerState.cbzInitDone = false;
    viewerState.cbzState = window.CbzReader.open({
      container: $cbz,
      blobUrls: viewerState.blobUrls,
      totalPages: 1, // updated after first fetch via X-Asset-Pages
      fetchPage: fetchCbzPage,
      onReady: function () {
        $loading.classList.add('hidden');
        $error.classList.add('hidden');
        $content.classList.remove('hidden');
      },
      onError: function (title, msg) {
        showError(title, msg);
      },
    });
  }

  // ── Display modes ─────────────────────────────────────

  function showLoading() {
    $loading.classList.remove('hidden');
    $error.classList.add('hidden');
    $content.classList.add('hidden');
  }

  function showError(title, message) {
    $loading.classList.add('hidden');
    $error.classList.remove('hidden');
    $content.classList.add('hidden');
    $errorTitle.textContent = title;
    $errorMsg.textContent = message;
  }

  function showImage(url) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.remove('hidden');
    $docContainer.classList.add('hidden');
    $img.onload = function () {
      imgBaseWidth = $img.clientWidth;
    };
    $img.src = url;
    initToolbar();
  }

  function showDocument(firstPageUrl) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.remove('hidden');
    $docContainer.innerHTML = '';

    var firstImg = document.createElement('img');
    firstImg.className = 'page-img';
    firstImg.alt = 'Page 1';
    firstImg.draggable = false;
    firstImg.oncontextmenu = function (e) { e.preventDefault(); return false; };
    firstImg.src = firstPageUrl;
    $docContainer.appendChild(firstImg);

    viewerState.pagesLoaded = 1;

    for (var i = 2; i <= viewerState.totalPages; i++) {
      var slot = document.createElement('div');
      slot.id = 'page-slot-' + i;
      slot.className = 'page-placeholder';
      slot.textContent = 'Loading page ' + i + '...';
      $docContainer.appendChild(slot);
    }

    if (viewerState.totalPages > 1) {
      $pageNav.style.display = 'flex';
    }

    $content.addEventListener('scroll', trackVisiblePage);
    initToolbar();
  }

  function updatePageCounter() {
    if (viewerState.totalPages <= 1) return;
    var loaded = viewerState.pagesLoaded;
    var total = viewerState.totalPages;
    $pageCounter.textContent = loaded >= total
      ? total + ' pages'
      : loaded + ' / ' + total + ' pages';
    $pageCounter.classList.remove('hidden');
  }

  // ── Anti-piracy measures ──────────────────────────────

  function disableContextMenu() {
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        return;
      }
      if (e.key === 'PrintScreen') { e.preventDefault(); return; }

      switch (e.key) {
        case '+': case '=': e.preventDefault(); zoomIn(); break;
        case '-': case '_': e.preventDefault(); zoomOut(); break;
        case '0': e.preventDefault(); resetZoom(); break;
        case 'f': case 'F':
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFullscreen(); }
          break;
        case 'PageDown':
          if (isDocumentType && viewerState.totalPages > 1) { e.preventDefault(); goToPage(currentPage + 1); }
          break;
        case 'PageUp':
          if (isDocumentType && viewerState.totalPages > 1) { e.preventDefault(); goToPage(currentPage - 1); }
          break;
        case 'Home':
          if (isDocumentType) { e.preventDefault(); $content.scrollTop = 0; }
          break;
        case 'End':
          if (isDocumentType) { e.preventDefault(); $content.scrollTop = $content.scrollHeight; }
          break;
        case 'w': case 'W':
          if (is3DType && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleWireframe(); }
          break;
        case 'g': case 'G':
          if (is3DType && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleGrid(); }
          break;
        case 'a': case 'A':
          if (is3DType && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleAutoRotate(); }
          break;
        case 'n': case 'N':
          if (is3DType && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleNormals(); }
          break;
        case 's': case 'S':
          if (is3DType && !e.ctrlKey && !e.metaKey) { e.preventDefault(); takeScreenshot(); }
          break;
        case '?':
          if (is3DType) { e.preventDefault(); toggleHelpOverlay(); }
          break;
      }
    });
  }

  // ── Utility ───────────────────────────────────────────

  function humanMime(mime) {
    if (!mime) return '';
    var map = {
      'image/jpeg': 'JPEG Image',
      'image/png': 'PNG Image',
      'image/gif': 'GIF Image',
      'image/webp': 'WebP Image',
      'application/pdf': 'PDF Document',
      'text/plain': 'Text Document',
      'text/html': 'HTML Document',
      'text/csv': 'CSV Dataset',
      'text/tab-separated-values': 'TSV Dataset',
      'audio/mpeg': 'MP3 Audio',
      'video/mp4': 'MP4 Video',
      'model/gltf-binary': 'GLB 3D Model',
      'model/gltf+json': 'glTF 3D Model',
      'model/obj': 'OBJ 3D Model',
      'model/stl': 'STL 3D Model',
      'model/vnd.autodesk.fbx': 'FBX 3D Model',
      'font/ttf': 'TrueType Font',
      'font/otf': 'OpenType Font',
      'font/woff': 'WOFF Font',
      'font/woff2': 'WOFF2 Font',
      'application/vnd.ms-fontobject': 'Embedded OpenType Font',
      'application/zip': 'ZIP Archive',
      'application/gzip': 'GZIP Archive',
      'application/x-tar': 'TAR Archive',
      'application/epub+zip': 'EPUB Ebook',
      'application/epub': 'EPUB Ebook',
      'application/vnd.comicbook+zip': 'CBZ Comic',
      'application/x-cbz': 'CBZ Comic',
    };
    return map[mime] || mime.split('/').pop().toUpperCase();
  }

  // ── Audio player ────────────────────────────────────

  function showAudioPlayer(blobUrl) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.add('hidden');
    $audioContainer.classList.remove('hidden');

    $audioTitle.textContent = assetParams.title || 'Audio';
    $audioEl.src = blobUrl;
    $audioEl.volume = 0.8;

    $btnAudioPlay.addEventListener('click', function () {
      if ($audioEl.paused) { $audioEl.play(); } else { $audioEl.pause(); }
    });

    $audioEl.addEventListener('play', function () {
      $audioPlayIcon.style.display = 'none';
      $audioPauseIcon.style.display = '';
    });

    $audioEl.addEventListener('pause', function () {
      $audioPlayIcon.style.display = '';
      $audioPauseIcon.style.display = 'none';
    });

    $audioEl.addEventListener('timeupdate', function () {
      if (!$audioEl.duration) return;
      var pct = ($audioEl.currentTime / $audioEl.duration) * 100;
      $audioSeek.value = pct;
      $audioTime.textContent = fmtTime($audioEl.currentTime) + ' / ' + fmtTime($audioEl.duration);
    });

    $audioSeek.addEventListener('input', function () {
      if (!$audioEl.duration) return;
      $audioEl.currentTime = ($audioSeek.value / 100) * $audioEl.duration;
    });

    $audioVolume.addEventListener('input', function () {
      $audioEl.volume = $audioVolume.value / 100;
    });
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  // ── 3D Model Viewer (Three.js) ──────────────────────
  var threeScene = null;

  function show3DModel(blob) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.add('hidden');
    var $modelContainer = document.getElementById('model-container');
    $modelContainer.classList.remove('hidden');

    $rendererBdg.textContent = 'Three.js';
    $rendererBdg.classList.remove('hidden');

    var blobUrl = URL.createObjectURL(blob);
    viewerState.blobUrls.push(blobUrl);

    if (typeof THREE === 'undefined') {
      showError('3D Viewer Error', 'Three.js library not loaded.');
      return;
    }

    init3DScene(blobUrl, blob);
  }

  function init3DScene(blobUrl, blob) {
    var canvas = document.getElementById('model-canvas');
    var container = document.getElementById('model-container');

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d27);

    var camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(3, 2, 3);

    var renderer3d = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
    renderer3d.setSize(container.clientWidth, container.clientHeight);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
    renderer3d.toneMappingExposure = 1.2;

    var ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    var dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    var fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-3, 0, -5);
    scene.add(fillLight);

    var gridHelper = new THREE.GridHelper(10, 20, 0x2a2d3a, 0x1f2230);
    scene.add(gridHelper);

    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;

    var VertexNormalsHelper = (typeof THREE.VertexNormalsHelper !== 'undefined') ? THREE.VertexNormalsHelper : null;
    threeScene = { scene: scene, camera: camera, renderer: renderer3d, controls: controls, mixer: null, clock: new THREE.Clock(), gridHelper: gridHelper, THREE: THREE, VertexNormalsHelper: VertexNormalsHelper, normalHelpers: [] };

    var mime = assetParams.mimeType;
    var loader;

    // Parse from ArrayBuffer directly — avoids the Puter iframe fetch
    // interceptor rewriting blob: URLs to HTML 404 pages.
    blob.arrayBuffer().then(function (arrayBuf) {
      try {
        if (mime === 'model/gltf-binary' || mime === 'model/gltf+json') {
          loader = new THREE.GLTFLoader();
          loader.parse(arrayBuf, '', function (gltf) {
            scene.add(gltf.scene);
            if (gltf.animations && gltf.animations.length > 0) {
              threeScene.mixer = new THREE.AnimationMixer(gltf.scene);
              gltf.animations.forEach(function (clip) { threeScene.mixer.clipAction(clip).play(); });
            }
            frameObject(gltf.scene, THREE, camera, controls);
            URL.revokeObjectURL(blobUrl);
            showModelInfo(gltf.scene, THREE);
            setupModelToolbar();
          }, function (err) { showError('3D Load Error', String(err)); });
        } else if (mime === 'model/stl') {
          loader = new THREE.STLLoader();
          var geometry = loader.parse(arrayBuf);
          var mat = new THREE.MeshStandardMaterial({ color: 0x8888cc, metalness: 0.3, roughness: 0.6 });
          var mesh = new THREE.Mesh(geometry, mat);
          scene.add(mesh);
          frameObject(mesh, THREE, camera, controls);
          URL.revokeObjectURL(blobUrl);
          showModelInfo(mesh, THREE);
          setupModelToolbar();
        } else if (mime === 'model/obj') {
          loader = new THREE.OBJLoader();
          var text = new TextDecoder().decode(arrayBuf);
          var group = loader.parse(text);
          scene.add(group);
          frameObject(group, THREE, camera, controls);
          URL.revokeObjectURL(blobUrl);
          showModelInfo(group, THREE);
          setupModelToolbar();
        } else if (mime === 'model/vnd.autodesk.fbx') {
          loader = new THREE.FBXLoader();
          var fbxGroup = loader.parse(arrayBuf, '');
          scene.add(fbxGroup);
          if (fbxGroup.animations && fbxGroup.animations.length > 0) {
            threeScene.mixer = new THREE.AnimationMixer(fbxGroup);
            fbxGroup.animations.forEach(function (clip) { threeScene.mixer.clipAction(clip).play(); });
          }
          frameObject(fbxGroup, THREE, camera, controls);
          URL.revokeObjectURL(blobUrl);
          showModelInfo(fbxGroup, THREE);
          setupModelToolbar();
        } else {
          showError('Unsupported 3D Format', 'MIME type ' + mime + ' is not supported for 3D viewing.');
          return;
        }
      } catch (parseErr) {
        showError('3D Parse Error', String(parseErr));
        return;
      }

      var watermarkEl = document.getElementById('model-watermark');
      if (!isCleartext) {
        watermarkEl.textContent = (assetParams.buyerAddress || '').substring(0, 10) + '...' + ' \u2022 dDRM Protected';
      } else {
        watermarkEl.textContent = '';
      }

      function animate() {
        requestAnimationFrame(animate);
        controls.update();
        if (threeScene.mixer) threeScene.mixer.update(threeScene.clock.getDelta());
        renderer3d.render(scene, camera);
      }
      animate();
    }).catch(function (err) {
      showError('3D Load Error', String(err));
    });

    window.addEventListener('resize', function () {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer3d.setSize(container.clientWidth, container.clientHeight);
    });
  }

  function frameObject(object, THREE, camera, controls) {
    var box = new THREE.Box3().setFromObject(object);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z);
    var distance = maxDim * 2;

    // Adapt the clip planes to the model's real-world size. The camera is
    // created with a fixed far=1000, but assets authored in mm/cm can span
    // thousands of units (e.g. a 1327-unit car), pushing the model behind
    // the far plane — it vanishes when zoomed out and reappears as you zoom
    // in. Scaling near/far to maxDim fixes both tiny and huge models and
    // avoids the z-fighting a 0.01 near + huge far would cause.
    camera.near = Math.max(maxDim / 1000, 0.01);
    camera.far = Math.max(distance * 100, 5000);
    camera.updateProjectionMatrix();

    // Keep zoom within the visible frustum so you can't dolly past the model
    // (out beyond the far plane, or inside the near plane).
    controls.minDistance = maxDim * 0.1;
    controls.maxDistance = distance * 10;

    camera.position.set(center.x + distance * 0.6, center.y + distance * 0.4, center.z + distance * 0.6);
    controls.target.copy(center);
    controls.update();
  }

  function showModelInfo(object, THREE) {
    var box = new THREE.Box3().setFromObject(object);
    var size = box.getSize(new THREE.Vector3());
    var polyCount = 0;
    var materialCount = new Set();

    object.traverse(function (child) {
      if (child.isMesh) {
        var geom = child.geometry;
        if (geom.index) polyCount += geom.index.count / 3;
        else if (geom.attributes.position) polyCount += geom.attributes.position.count / 3;
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(function (m) { materialCount.add(m.uuid); });
          else materialCount.add(child.material.uuid);
        }
      }
    });

    var $infoPanel = document.getElementById('model-info');
    var $infoContent = document.getElementById('model-info-content');
    $infoContent.innerHTML =
      '<div class="info-row"><span>Polygons</span><span>' + Math.round(polyCount).toLocaleString() + '</span></div>' +
      '<div class="info-row"><span>Materials</span><span>' + materialCount.size + '</span></div>' +
      '<div class="info-row"><span>Size</span><span>' + size.x.toFixed(2) + ' × ' + size.y.toFixed(2) + ' × ' + size.z.toFixed(2) + '</span></div>';
    $infoPanel.classList.remove('hidden');
  }

  function setupModelToolbar() {
    $toolbar.classList.remove('hidden');
    $toolbar.innerHTML = '';

    var buttons = [
      { label: 'W', title: 'Wireframe (W)', action: toggleWireframe },
      { label: 'N', title: 'Normals (N)', action: toggleNormals },
      { label: 'G', title: 'Grid (G)', action: toggleGrid },
      { label: 'A', title: 'Auto-rotate (A)', action: toggleAutoRotate },
      { label: 'S', title: 'Screenshot (S)', action: takeScreenshot },
      { label: '?', title: 'Keyboard shortcuts (?)', action: toggleHelpOverlay },
    ];

    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'tb-btn';
      btn.textContent = b.label;
      btn.title = b.title;
      btn.style.fontFamily = 'inherit';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = '600';
      btn.style.lineHeight = '1';
      btn.addEventListener('click', b.action);
      $toolbar.appendChild(btn);
    });

    showToolbarBriefly();
  }

  function toggleWireframe() {
    if (!threeScene) return;
    threeScene.scene.traverse(function (child) {
      if (child.isMesh && child.material) {
        var mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(function (m) { m.wireframe = !m.wireframe; });
      }
    });
  }

  function toggleGrid() {
    if (!threeScene) return;
    threeScene.gridHelper.visible = !threeScene.gridHelper.visible;
  }

  function toggleAutoRotate() {
    if (!threeScene) return;
    threeScene.controls.autoRotate = !threeScene.controls.autoRotate;
  }

  function toggleNormals() {
    if (!threeScene) return;
    if (threeScene.normalHelpers.length > 0) {
      threeScene.normalHelpers.forEach(function (h) { threeScene.scene.remove(h); h.dispose(); });
      threeScene.normalHelpers = [];
      return;
    }
    threeScene.scene.traverse(function (child) {
      if (child.isMesh && child.geometry) {
        var helper = new threeScene.VertexNormalsHelper(child, 0.1, 0x00ff88);
        threeScene.scene.add(helper);
        threeScene.normalHelpers.push(helper);
      }
    });
  }

  function takeScreenshot() {
    if (!threeScene) return;
    threeScene.renderer.render(threeScene.scene, threeScene.camera);
    var dataUrl = threeScene.renderer.domElement.toDataURL('image/png');
    var link = document.createElement('a');
    link.download = (assetParams.title || '3d-model') + '-screenshot.png';
    link.href = dataUrl;
    link.click();
  }

  function toggleHelpOverlay() {
    var existing = document.getElementById('help-overlay');
    if (existing) {
      existing.remove();
      return;
    }

    var shortcuts = [
      { key: 'Drag', desc: 'Orbit camera' },
      { key: 'Scroll', desc: 'Zoom in / out' },
      { key: 'Right-drag', desc: 'Pan camera' },
      { key: 'W', desc: 'Toggle wireframe' },
      { key: 'N', desc: 'Toggle vertex normals' },
      { key: 'G', desc: 'Toggle grid' },
      { key: 'A', desc: 'Toggle auto-rotate' },
      { key: 'S', desc: 'Save screenshot' },
      { key: 'F', desc: 'Toggle fullscreen' },
      { key: '?', desc: 'Show / hide this help' },
    ];

    var overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.innerHTML =
      '<div class="help-card">' +
      '<div class="help-title">Keyboard Shortcuts</div>' +
      shortcuts.map(function (s) {
        return '<div class="help-row"><kbd>' + s.key + '</kbd><span>' + s.desc + '</span></div>';
      }).join('') +
      '<div class="help-hint">Press <kbd>?</kbd> to dismiss</div>' +
      '</div>';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('viewer-container').appendChild(overlay);
  }

  // ── CSV / Dataset Viewer ────────────────────────────

  function showDataTable(blob) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.add('hidden');
    var $dataContainer = document.getElementById('data-container');
    $dataContainer.classList.remove('hidden');

    $rendererBdg.textContent = 'Table';
    $rendererBdg.classList.remove('hidden');

    blob.text().then(function (text) {
      var sep = assetParams.mimeType === 'text/tab-separated-values' ? '\t' : ',';
      var rows = parseCSV(text, sep);
      if (rows.length === 0) { showError('Empty Dataset', 'The file contains no data.'); return; }

      var headers = rows[0];
      var data = rows.slice(1);
      var PAGE_SIZE = 100;
      var currentDataPage = 0;
      var filteredData = data;

      var $search = document.getElementById('data-search');
      var $stats = document.getElementById('data-stats');
      var $tableWrap = document.getElementById('data-table-wrap');
      var $pager = document.getElementById('data-pager');

      $stats.textContent = data.length + ' rows × ' + headers.length + ' columns';

      function renderPage() {
        var start = currentDataPage * PAGE_SIZE;
        var pageData = filteredData.slice(start, start + PAGE_SIZE);

        var html = '<table class="data-table"><thead><tr>';
        html += '<th class="row-num">#</th>';
        headers.forEach(function (h) { html += '<th>' + escapeHtml(h) + '</th>'; });
        html += '</tr></thead><tbody>';
        pageData.forEach(function (row, i) {
          html += '<tr><td class="row-num">' + (start + i + 1) + '</td>';
          headers.forEach(function (_, ci) {
            html += '<td>' + escapeHtml(row[ci] || '') + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table>';
        $tableWrap.innerHTML = html;

        var totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
        if (totalPages > 1) {
          $pager.classList.remove('hidden');
          $pager.innerHTML =
            '<button class="pager-btn" data-dir="-1" ' + (currentDataPage === 0 ? 'disabled' : '') + '>&laquo; Prev</button>' +
            '<span class="pager-info">' + (currentDataPage + 1) + ' / ' + totalPages + '</span>' +
            '<button class="pager-btn" data-dir="1" ' + (currentDataPage >= totalPages - 1 ? 'disabled' : '') + '>Next &raquo;</button>';
          $pager.querySelectorAll('.pager-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var dir = parseInt(btn.getAttribute('data-dir'), 10);
              currentDataPage = Math.max(0, Math.min(currentDataPage + dir, totalPages - 1));
              renderPage();
            });
          });
        } else {
          $pager.classList.add('hidden');
        }
      }

      $search.addEventListener('input', function () {
        var query = $search.value.toLowerCase();
        currentDataPage = 0;
        if (!query) { filteredData = data; }
        else {
          filteredData = data.filter(function (row) {
            return row.some(function (cell) { return (cell || '').toLowerCase().indexOf(query) !== -1; });
          });
        }
        $stats.textContent = filteredData.length + ' of ' + data.length + ' rows';
        renderPage();
      });

      renderPage();
    }).catch(function (err) {
      showError('Parse Error', 'Failed to parse dataset: ' + err.message);
    });
  }

  function parseCSV(text, sep) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === sep) { row.push(field); field = ''; }
        else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
          row.push(field); field = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
          if (c === '\r') i++;
        } else { field += c; }
      }
    }
    if (field || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Font Preview Viewer ─────────────────────────────

  function showFontPreview(blobUrl) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.add('hidden');
    var $fontContainer = document.getElementById('font-container');
    $fontContainer.classList.remove('hidden');

    $rendererBdg.textContent = 'Font';
    $rendererBdg.classList.remove('hidden');

    var fontName = 'ddrm-preview-font-' + Date.now();
    var fontFace = new FontFace(fontName, 'url(' + blobUrl + ')');

    fontFace.load().then(function (loaded) {
      document.fonts.add(loaded);

      var $specimen = document.getElementById('font-specimen');
      var title = assetParams.title || 'Font Preview';

      var sizes = [72, 48, 36, 24, 18, 14];
      var html = '<h2 class="font-title">' + escapeHtml(title) + '</h2>';

      html += '<div class="font-section"><div class="font-label">Alphabet</div>';
      html += '<div class="font-sample" style="font-family:\'' + fontName + '\';font-size:36px;">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>';
      html += '<div class="font-sample" style="font-family:\'' + fontName + '\';font-size:36px;">abcdefghijklmnopqrstuvwxyz</div>';
      html += '<div class="font-sample" style="font-family:\'' + fontName + '\';font-size:36px;">0123456789</div></div>';

      html += '<div class="font-section"><div class="font-label">Pangram</div>';
      html += '<div class="font-sample" style="font-family:\'' + fontName + '\';font-size:28px;">The quick brown fox jumps over the lazy dog</div></div>';

      html += '<div class="font-section"><div class="font-label">Sizes</div>';
      sizes.forEach(function (sz) {
        html += '<div class="font-size-row"><span class="font-size-label">' + sz + 'px</span><span class="font-sample" style="font-family:\'' + fontName + '\';font-size:' + sz + 'px;">Sphinx of black quartz, judge my vow.</span></div>';
      });
      html += '</div>';

      html += '<div class="font-section"><div class="font-label">Custom Text</div>';
      html += '<input id="font-custom-input" type="text" class="font-custom-input" placeholder="Type to preview..." value="Hello, World!" />';
      html += '<div id="font-custom-preview" class="font-sample" style="font-family:\'' + fontName + '\';font-size:48px;">Hello, World!</div></div>';

      $specimen.innerHTML = html;

      var $customInput = document.getElementById('font-custom-input');
      var $customPreview = document.getElementById('font-custom-preview');
      $customInput.addEventListener('input', function () {
        $customPreview.textContent = $customInput.value || 'Type to preview...';
      });

    }).catch(function (err) {
      showError('Font Load Error', 'Failed to load font: ' + err.message);
    });
  }

  // ── Archive Viewer ──────────────────────────────────

  function showArchive(blob) {
    $loading.classList.add('hidden');
    $error.classList.add('hidden');
    $content.classList.remove('hidden');
    $imgContainer.classList.add('hidden');
    $docContainer.classList.add('hidden');
    var $archiveContainer = document.getElementById('archive-container');
    $archiveContainer.classList.remove('hidden');

    $rendererBdg.textContent = 'Archive';
    $rendererBdg.classList.remove('hidden');

    if (typeof JSZip === 'undefined') {
      showError('Archive Error', 'JSZip library not loaded. Cannot view archive contents.');
      return;
    }

    JSZip.loadAsync(blob).then(function (zip) {
      var entries = [];
      zip.forEach(function (relativePath, zipEntry) {
        entries.push({
          path: relativePath,
          dir: zipEntry.dir,
          size: zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0,
          date: zipEntry.date,
        });
      });

      entries.sort(function (a, b) {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.path.localeCompare(b.path);
      });

      var $tree = document.getElementById('archive-tree');
      var totalSize = 0;
      var html = '<div class="archive-header">';
      html += '<span class="archive-icon">\uD83D\uDCC1</span> ';
      html += '<span class="archive-name">' + escapeHtml(assetParams.title || 'Archive') + '</span>';
      html += '<span class="archive-count">' + entries.length + ' items</span></div>';
      html += '<div class="archive-list">';

      entries.forEach(function (entry) {
        totalSize += entry.size;
        var icon = entry.dir ? '\uD83D\uDCC1' : fileIcon(entry.path);
        var sizeStr = entry.dir ? '' : formatBytes(entry.size);
        html += '<div class="archive-entry">';
        html += '<span class="entry-icon">' + icon + '</span>';
        html += '<span class="entry-path">' + escapeHtml(entry.path) + '</span>';
        if (sizeStr) html += '<span class="entry-size">' + sizeStr + '</span>';
        html += '</div>';
      });

      html += '</div>';
      html += '<div class="archive-footer">Total uncompressed: ' + formatBytes(totalSize) + '</div>';
      $tree.innerHTML = html;
    }).catch(function (err) {
      showError('Archive Error', 'Failed to read archive: ' + err.message);
    });
  }

  function fileIcon(path) {
    var ext = path.split('.').pop().toLowerCase();
    var icons = { js: '\uD83D\uDCDC', ts: '\uD83D\uDCDC', py: '\uD83D\uDC0D', html: '\uD83C\uDF10', css: '\uD83C\uDFA8', json: '{}', md: '\uD83D\uDCD6', txt: '\uD83D\uDCC4', png: '\uD83D\uDDBC', jpg: '\uD83D\uDDBC', jpeg: '\uD83D\uDDBC', gif: '\uD83D\uDDBC', mp3: '\uD83C\uDFB5', mp4: '\uD83C\uDFAC', zip: '\uD83D\uDCE6', pdf: '\uD83D\uDCC4' };
    return icons[ext] || '\uD83D\uDCC4';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  // ── Zoom & Pan ────────────────────────────────────────

  function zoomIn() { setZoom(Math.min(zoom.level + zoom.step, zoom.max)); }
  function zoomOut() { setZoom(Math.max(zoom.level - zoom.step, zoom.min)); }
  function resetZoom() { setZoom(1); }

  function setZoom(level) {
    level = Math.round(level * 100) / 100;
    if (level === zoom.level) return;

    var oldLevel = zoom.level;
    zoom.level = level;

    // Capture the viewport center BEFORE the layout grows/shrinks so we can
    // re-center on the same content point afterwards. Without this the user
    // sees the page "scroll" downward when zooming in from 100%, because the
    // content grows from the top-left and pushes their gaze off-screen.
    var cx = $content.scrollLeft + $content.clientWidth / 2;
    var cy = $content.scrollTop + $content.clientHeight / 2;

    applyZoom();

    if (oldLevel > 0) {
      var ratio = level / oldLevel;
      $content.scrollLeft = Math.max(0, cx * ratio - $content.clientWidth / 2);
      $content.scrollTop = Math.max(0, cy * ratio - $content.clientHeight / 2);
    }

    showToolbarBriefly();
  }

  function applyZoom() {
    $zoomLevel.textContent = Math.round(zoom.level * 100) + '%';
    $btnZoomOut.disabled = zoom.level <= zoom.min;
    $btnZoomIn.disabled = zoom.level >= zoom.max;

    if (isDocumentType) {
      $docContainer.style.width = (100 * zoom.level) + '%';
    } else {
      if (zoom.level === 1) {
        $imgContainer.classList.remove('zoomed');
        $img.style.width = '';
      } else {
        $imgContainer.classList.add('zoomed');
        var base = imgBaseWidth || $img.naturalWidth || $content.clientWidth;
        $img.style.width = (base * zoom.level) + 'px';
      }
    }

    $content.classList.toggle('zoomable', zoom.level > 1 || isDocumentType);
  }

  // Drag-to-scroll (pan)
  function initPanHandlers() {
    $content.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (zoom.level <= 1 && !isDocumentType) return;
      pan.active = true;
      pan.startX = e.clientX;
      pan.startY = e.clientY;
      pan.scrollX = $content.scrollLeft;
      pan.scrollY = $content.scrollTop;
      $content.classList.add('panning');
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!pan.active) return;
      $content.scrollLeft = pan.scrollX - (e.clientX - pan.startX);
      $content.scrollTop = pan.scrollY - (e.clientY - pan.startY);
    });

    document.addEventListener('mouseup', function () {
      if (!pan.active) return;
      pan.active = false;
      $content.classList.remove('panning');
    });

    $content.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }, { passive: false });
  }

  // ── Page navigation (documents) ─────────────────────

  function trackVisiblePage() {
    if (!isDocumentType || viewerState.totalPages <= 1) return;
    var pages = $docContainer.querySelectorAll('.page-img');
    if (!pages.length) return;
    var scrollMid = $content.scrollTop + $content.clientHeight / 2;
    var found = 1;
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].offsetTop <= scrollMid) found = i + 1;
    }
    if (found !== currentPage) {
      currentPage = found;
      updatePageIndicator();
    }
  }

  function goToPage(n) {
    if (n < 1 || n > viewerState.totalPages) return;
    var pages = $docContainer.querySelectorAll('.page-img, .page-placeholder');
    if (pages[n - 1]) {
      pages[n - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    currentPage = n;
    updatePageIndicator();
  }

  function updatePageIndicator() {
    if ($pageIndicator) {
      $pageIndicator.textContent = currentPage + ' / ' + viewerState.totalPages;
    }
    if ($btnPagePrev) $btnPagePrev.disabled = currentPage <= 1;
    if ($btnPageNext) $btnPageNext.disabled = currentPage >= viewerState.totalPages;
  }

  // ── Toolbar ─────────────────────────────────────────

  function initToolbar() {
    $toolbar.classList.remove('hidden');

    $btnZoomIn.addEventListener('click', zoomIn);
    $btnZoomOut.addEventListener('click', zoomOut);
    $zoomLevel.addEventListener('click', resetZoom);
    $btnFullscreen.addEventListener('click', toggleFullscreen);

    if ($btnPagePrev) $btnPagePrev.addEventListener('click', function () { goToPage(currentPage - 1); });
    if ($btnPageNext) $btnPageNext.addEventListener('click', function () { goToPage(currentPage + 1); });

    initPanHandlers();

    $content.addEventListener('mousemove', showToolbarBriefly);
    $toolbar.addEventListener('mouseenter', function () { clearTimeout(toolbarTimer); });
    $toolbar.addEventListener('mouseleave', function () { scheduleToolbarHide(); });

    applyZoom();
    showToolbarBriefly();
  }

  function showToolbarBriefly() {
    $toolbar.classList.remove('toolbar-fade');
    scheduleToolbarHide();
  }

  function scheduleToolbarHide() {
    clearTimeout(toolbarTimer);
    toolbarTimer = setTimeout(function () {
      if (!$toolbar.matches(':hover')) {
        $toolbar.classList.add('toolbar-fade');
      }
    }, 3000);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  // ── Cleanup: revoke blob URLs on unload ──────────────
  window.addEventListener('beforeunload', function () {
    viewerState.blobUrls.forEach(function (url) { URL.revokeObjectURL(url); });
  });

  // ── Go ────────────────────────────────────────────────

  init();
})();
