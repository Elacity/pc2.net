/**
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import UIWindow from '../UI/UIWindow.js';
import UIAlert from '../UI/UIAlert.js';
import i18n from '../i18n/i18n.js';
import launch_app from './launch_app.js';
import path from '../lib/path.js';
import item_icon from './item_icon.js';

// ----------------------------------------------------------------
// dDRM launch gate
//
// Before launching the media runtime or dDRM viewer for any .ddrm
// capsule, we verify the underlying CID is fully pinned on this node.
// Playback of an incomplete asset is what caused the stuttering /
// "fetch failed" UX that motivated the download-first flow.
//
// Contract:
//   - Legacy .ddrm files (no pinStatus field): trust and proceed —
//     existing libraries must not regress.
//   - pinStatus === 'complete' (written by the market app after pin
//     completion): trust and proceed. No server roundtrip on normal
//     open (would add latency to every double-click).
//   - pinStatus in {'downloading','failed'} or unexpected: verify
//     against GET /api/storage/ipfs/pin-status/:cid and show a gate
//     overlay until the CID is complete / user cancels / user retries.
//   - API unreachable (node restarting, offline): fall through to the
//     dispatch so streaming playback still works — do not leave the
//     user stranded on a modal they cannot dismiss.
//
// Returns true to proceed with launch, false to abort.
// ----------------------------------------------------------------
const DDRM_PIN_POLL_INTERVAL_MS = 2000;
const DDRM_RETRY_DEBOUNCE_MS = 30000;

async function ddrmLaunchGate(descriptor) {
    const cid = descriptor.cid || descriptor.encryptedDataCid;
    if ( !cid ) return true;

    // Legacy compatibility: pre-v1.2 .ddrm files have no pinStatus field.
    // Preserve existing playback behavior — do not retrofit the gate onto
    // files that predate the download-first flow.
    if ( typeof descriptor.pinStatus === 'undefined' ) return true;

    // Trusted fast path — the market app only writes 'complete' after the
    // server confirmed the pin. Re-verifying on every open would add a
    // round-trip to every double-click.
    if ( descriptor.pinStatus === 'complete' ) return true;

    const cidClean = String(cid).replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '');
    const apiOrigin = window.api_origin || window.location.origin;
    const token = window.auth_token || (typeof puter !== 'undefined' && puter.authToken) || '';

    async function fetchStatus() {
        try {
            const res = await fetch(`${apiOrigin}/api/storage/ipfs/pin-status/${encodeURIComponent(cidClean)}`, {
                method: 'GET',
                headers: token ? { 'Authorization': `Bearer ${ token}` } : {},
            });
            if ( !res.ok ) return null;
            return await res.json();
        } catch ( e ) {
            return null;
        }
    }

    const initial = await fetchStatus();
    if ( initial === null ) {
        // Graceful degradation: server unreachable. Let playback attempt —
        // streaming from ipfs.ela.city still works for already-published
        // content, and blocking the user behind an un-dismissable modal
        // would be worse than allowing a potentially-laggy playback.
        console.warn('[dDRM launch gate] pin-status unreachable, falling through to dispatch');
        return true;
    }
    if ( initial.status === 'complete' ) return true;

    return await showDdrmGateOverlay({
        descriptor,
        cidClean,
        initialStatus: initial,
        fetchStatus,
        apiOrigin,
        token,
    });
}

function showDdrmGateOverlay({ descriptor, cidClean, initialStatus, fetchStatus, apiOrigin, token }) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        let pollTimer = null;
        let lastRetryMs = 0;

        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:inherit;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:10px;padding:24px;max-width:460px;width:92vw;box-shadow:0 12px 32px rgba(0,0,0,0.25);';
        backdrop.appendChild(card);

        const title = document.createElement('h3');
        title.style.cssText = 'margin:0 0 12px;font-size:16px;font-weight:600;color:#111;';
        title.textContent = 'Preparing your content';
        card.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.style.cssText = 'color:#6b7280;font-size:13px;margin-bottom:16px;';
        subtitle.textContent = descriptor.title || 'Untitled';
        card.appendChild(subtitle);

        const statusLine = document.createElement('div');
        statusLine.style.cssText = 'color:#374151;font-size:13px;line-height:1.5;min-height:20px;margin-bottom:20px;';
        card.appendChild(statusLine);

        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        card.appendChild(buttonRow);

        function makeButton(label, style) {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;font-size:13px;line-height:1;font-family:inherit;border-radius:6px;cursor:pointer;' + style;
            return b;
        }

        const cancelBtn = makeButton('Cancel', 'background:#f3f4f6;border:1px solid #d1d5db;color:#111;');
        const retryBtn = makeButton('Retry', 'background:#3b82f6;border:none;color:#fff;');
        retryBtn.style.display = 'none';

        buttonRow.appendChild(cancelBtn);
        buttonRow.appendChild(retryBtn);

        function cleanup() {
            if ( pollTimer ) { clearInterval(pollTimer); pollTimer = null; }
            if ( backdrop.parentNode ) backdrop.parentNode.removeChild(backdrop);
        }

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });

        function formatElapsed(ms) {
            const s = Math.floor(ms / 1000);
            if ( s < 60 ) return s + 's';
            const m = Math.floor(s / 60);
            const r = s % 60;
            return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
        }

        function formatBytes(n) {
            if ( !n || n < 0 ) return '';
            if ( n >= 1073741824 ) return (n / 1073741824).toFixed(1) + ' GB';
            if ( n >= 1048576 ) return (n / 1048576).toFixed(1) + ' MB';
            if ( n >= 1024 ) return (n / 1024).toFixed(1) + ' KB';
            return n + ' B';
        }

        function renderStatus(body) {
            const expected = descriptor.estimatedSizeBytes || (body && body.sizeBytes) || 0;
            const suffix = expected ? ' (~' + formatBytes(expected) + ' expected)' : '';
            if ( body.status === 'queued' ) {
                statusLine.textContent = 'Queued — waiting for a seeder...';
                retryBtn.style.display = 'none';
            } else if ( body.status === 'pinning' || body.status === 'not-pinned' ) {
                statusLine.textContent = 'Downloading to your node... ' + formatElapsed(Date.now() - startedAt) + ' elapsed' + suffix;
                retryBtn.style.display = 'none';
            } else if ( body.status === 'failed' ) {
                statusLine.textContent = 'Download failed. Tap Retry to try again, or Cancel to close.';
                retryBtn.style.display = '';
            }
        }

        retryBtn.addEventListener('click', async () => {
            const now = Date.now();
            if ( now - lastRetryMs < DDRM_RETRY_DEBOUNCE_MS ) {
                const waitS = Math.ceil((DDRM_RETRY_DEBOUNCE_MS - (now - lastRetryMs)) / 1000);
                statusLine.textContent = 'Please wait ' + waitS + 's before retrying.';
                return;
            }
            lastRetryMs = now;
            retryBtn.disabled = true;
            retryBtn.textContent = 'Retrying...';
            try {
                const res = await fetch(`${apiOrigin}/api/storage/ipfs/pin/${encodeURIComponent(cidClean)}/retry`, {
                    method: 'POST',
                    headers: token ? { 'Authorization': `Bearer ${ token}` } : {},
                });
                if ( res.status === 429 ) {
                    const body = await res.json().catch(() => ({}));
                    const secs = Math.ceil((body.retryAfterMs || DDRM_RETRY_DEBOUNCE_MS) / 1000);
                    statusLine.textContent = 'Retry rate-limited. Try again in ' + secs + 's.';
                } else if ( !res.ok ) {
                    statusLine.textContent = 'Retry request failed (' + res.status + ').';
                } else {
                    statusLine.textContent = 'Queued for retry...';
                }
            } catch ( e ) {
                statusLine.textContent = 'Retry failed: ' + (e && e.message);
            } finally {
                retryBtn.disabled = false;
                retryBtn.textContent = 'Retry';
            }
        });

        async function pollOnce() {
            const body = await fetchStatus();
            if ( !body ) {
                // Server unreachable mid-poll: keep the overlay up, next tick retries.
                return;
            }
            if ( body.status === 'complete' ) {
                cleanup();
                resolve(true);
                return;
            }
            renderStatus(body);
        }

        renderStatus(initialStatus);
        document.body.appendChild(backdrop);
        pollTimer = setInterval(pollOnce, DDRM_PIN_POLL_INTERVAL_MS);
    });
}

const RUNTIME_EXTENSIONS = {
    '.mp4':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/mp4' },
    '.webm': { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/webm' },
    '.mkv':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/x-matroska' },
    '.avi':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/x-msvideo' },
    '.mov':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/quicktime' },
    '.m4v':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/mp4' },
    '.ogv':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'video/ogg' },
    '.mp3':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/mpeg' },
    '.wav':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/wav' },
    '.flac': { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/flac' },
    '.m4a':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/mp4' },
    '.ogg':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/ogg' },
    '.aac':  { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/aac' },
    '.opus': { app: 'pc2-media-runtime', title: 'Elacity Player', mime: 'audio/opus' },
    '.pdf':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'application/pdf' },
    '.jpg':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/jpeg' },
    '.jpeg': { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/jpeg' },
    '.png':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/png' },
    '.gif':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/gif' },
    '.webp': { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/webp' },
    '.svg':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/svg+xml' },
    '.bmp':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'image/bmp' },
    '.glb':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'model/gltf-binary' },
    '.gltf': { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'model/gltf+json' },
    '.obj':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'model/obj' },
    '.stl':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'model/stl' },
    '.fbx':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'model/vnd.autodesk.fbx' },
    '.csv':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'text/csv' },
    '.tsv':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'text/tab-separated-values' },
    '.ttf':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'font/ttf' },
    '.otf':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'font/otf' },
    '.woff': { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'font/woff' },
    '.woff2':{ app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'font/woff2' },
    '.zip':  { app: 'ddrm-viewer', title: 'Elacity Viewer', mime: 'application/zip' },
};

const open_item = async function (options) {
    let el_item = options.item;
    const $el_parent_window = $(el_item).closest('.window');
    const parent_win_id = $($el_parent_window).attr('data-id');
    const is_dir = $(el_item).attr('data-is_dir') === '1' ? true : false;
    const uid = $(el_item).attr('data-shortcut_to') === '' ? $(el_item).attr('data-uid') : $(el_item).attr('data-shortcut_to');
    const item_path = $(el_item).attr('data-shortcut_to_path') === '' ? $(el_item).attr('data-path') : $(el_item).attr('data-shortcut_to_path');
    const is_shortcut = $(el_item).attr('data-is_shortcut') === '1';
    const shortcut_to_path = $(el_item).attr('data-shortcut_to_path');
    const associated_app_name = $(el_item).attr('data-associated_app_name');
    const file_uid = $(el_item).attr('data-uid');

    //----------------------------------------------------------------
    // Is this a shortcut whose source is perma-deleted?
    //----------------------------------------------------------------
    if ( is_shortcut && shortcut_to_path === '' ) {
        UIAlert('This shortcut can\'t be opened because its source has been deleted.');
    }
    //----------------------------------------------------------------
    // Is this a shortcut whose source is trashed?
    //----------------------------------------------------------------
    else if ( is_shortcut && shortcut_to_path.startsWith(`${window.trash_path }/`) ) {
        UIAlert('This shortcut can\'t be opened because its source has been deleted.');
    }
    //----------------------------------------------------------------
    // Is this a .weblink file?
    //----------------------------------------------------------------
    else if ( $(el_item).attr('data-name').toLowerCase().endsWith('.weblink') ) {
        try {
            // First check localStorage using the file's UID
            let url = null;
            if ( file_uid ) {
                url = localStorage.getItem(`weblink_${ file_uid}`);
            }

            // Try to read the file content directly using the file's path
            if ( ! url ) {
                try {
                    const content = await puter.fs.read({
                        path: item_path,
                    });

                    // Handle different content types
                    if ( content instanceof Blob ) {
                        // If content is a Blob, convert it to text
                        const text = await content.text();

                        // Try to parse the text as JSON
                        try {
                            const jsonData = JSON.parse(text);
                            if ( jsonData.url ) {
                                url = jsonData.url;
                            }
                        } catch (e) {
                            console.error('Error parsing Blob content as JSON:', e);
                            // Not valid JSON, try using the content directly
                            if ( text && (text.startsWith('http://') || text.startsWith('https://')) ) {
                                url = text;
                                console.log('Using Blob content as URL (direct):', url);
                            }
                        }
                    } else if ( typeof content === 'string' ) {
                        // If content is a string, try to parse it as JSON
                        try {
                            const jsonData = JSON.parse(content);
                            if ( jsonData.url ) {
                                url = jsonData.url;
                            }
                        } catch (e) {
                            console.error('Error parsing string content as JSON:', e);
                            // Not valid JSON, try using the content directly
                            if ( content && (content.startsWith('http://') || content.startsWith('https://')) ) {
                                url = content;
                                console.log('Using string content as URL (direct):', url);
                            }
                        }
                    } else {
                        console.error('Unexpected content type:', typeof content);
                    }
                } catch (e) {
                    console.error('Error reading file using path:', e);
                }
            }

            // If we have a valid URL, open it
            if ( url && (url.startsWith('http://') || url.startsWith('https://')) ) {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                // Show a more detailed error message
                UIAlert(`Could not determine the URL for this web shortcut.
                
Technical details:
- File name: ${$(el_item).attr('data-name')}
- File path: ${item_path}
- File UID: ${file_uid}

Please try recreating the link.`);
            }
        } catch ( error ) {
            console.error('Error opening web shortcut:', error);
            UIAlert(`Error opening web shortcut: ${ error.message}`);
        }
    }
    //----------------------------------------------------------------
    // Is this a .ddrm file? (unified dDRM capsule — protected asset from Elacity)
    // Also handles legacy .edrm and .ddrm.json for backward compatibility
    //----------------------------------------------------------------
    else if ( /\.ddrm(\s*\(\d+\))?$/i.test($(el_item).attr('data-name'))
           || /\.edrm(\s*\(\d+\))?$/i.test($(el_item).attr('data-name'))
           || /\.ddrm(\s*\(\d+\))?\.json$/i.test($(el_item).attr('data-name')) ) {
        try {
            let descriptor = null;
            try {
                const apiOrigin = window.api_origin || window.location.origin;
                const token = window.auth_token || (typeof puter !== 'undefined' && puter.authToken) || '';
                const readRes = await fetch(`${ apiOrigin}/read`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${ token}` } : {}),
                    },
                    body: JSON.stringify({ path: item_path }),
                });
                if ( !readRes.ok ) throw new Error(`Read failed: ${ readRes.status}`);
                const text = await readRes.text();
                descriptor = JSON.parse(text);
            } catch (e) {
                console.error('Error reading .ddrm descriptor:', e);
            }

            if ( !descriptor ) {
                UIAlert('Could not read dDRM capsule. The file may be corrupted.');
            } else {
                // Launch gate: verify the underlying CID is pinned before
                // handing off to the runtime. Covers media + non-media in
                // a single point; legacy capsules (no pinStatus) bypass.
                const pinReady = await ddrmLaunchGate(descriptor);
                if ( !pinReady ) {
                    // User cancelled; stop here without touching the runtime.
                    return;
                }

                const isMedia = descriptor.type === 'media'
                    || (!descriptor.type && descriptor.cid && descriptor.contractAddress && !descriptor.encryptedDataCid);
                const isCleartext = descriptor.cleartext === true || descriptor.isProtected === false;
                const launch_app = (await import('./launch_app.js')).default;

                if ( isCleartext && isMedia ) {
                    const cleartextFileUrl = descriptor.cid
                        ? '/ipfs/' + descriptor.cid
                        : '';

                    await launch_app({
                        name: 'pc2-media-runtime',
                        window_title: (descriptor.title || 'Untitled') + ' — Elacity Player',
                        args: {
                            channel:         descriptor.contractAddress || '',
                            tokenId:         descriptor.tokenId || '',
                            mediaUri:        cleartextFileUrl,
                            fileUrl:         cleartextFileUrl,
                            title:           descriptor.title || '',
                            authority:       descriptor.authority || '',
                            thumbnail:       descriptor.thumbnail || '',
                            standalone:      'true',
                            cleartext:       'true',
                        },
                    });
                } else if ( isCleartext && descriptor.cid ) {
                    await launch_app({
                        name: 'ddrm-viewer',
                        window_title: (descriptor.title || 'Untitled') + ' — dDRM Viewer',
                        args: {
                            cleartext:         'true',
                            cleartextCid:      descriptor.cid,
                            mimeType:          descriptor.mimeType || 'application/octet-stream',
                            title:             descriptor.title || 'Untitled',
                        },
                    });
                } else if ( isMedia ) {
                    await launch_app({
                        name: 'pc2-media-runtime',
                        window_title: (descriptor.title || 'Untitled') + ' — Elacity Player',
                        args: {
                            channel:         descriptor.contractAddress || '',
                            tokenId:         descriptor.tokenId || '',
                            mediaUri:        descriptor.cid || '',
                            title:           descriptor.title || '',
                            authority:       descriptor.authority || '',
                            thumbnail:       descriptor.thumbnail || '',
                            standalone:      'true',
                        },
                    });
                } else if ( descriptor.encryptedDataCid && descriptor.kid ) {
                    await launch_app({
                        name: 'ddrm-viewer',
                        window_title: (descriptor.title || 'Untitled') + ' — dDRM Viewer',
                        args: {
                            litCiphertext:     descriptor.litCiphertext || '',
                            dataToEncryptHash: descriptor.dataToEncryptHash || '',
                            encryptedDataCid:  descriptor.encryptedDataCid,
                            iv:                descriptor.iv || '',
                            kid:               descriptor.kid,
                            buyerAddress:      (window.user && (window.user.wallet_address || window.user.smart_account_address)) || descriptor.acquiredBy || '',
                            buyerAddressAlt:   (window.user && window.user.wallet_address && window.user.smart_account_address)
                                                 ? (window.user.wallet_address !== window.user.smart_account_address ? window.user.smart_account_address : '')
                                                 : '',
                            mimeType:          descriptor.mimeType || 'application/octet-stream',
                            title:             descriptor.title || 'Untitled',
                            actionCid:         descriptor.actionCid || '',
                            authority:         descriptor.authority || '',
                            ...(descriptor.issuer && {
                                issuer: descriptor.issuer,
                            }),
                            ...(descriptor.signature && {
                                signature: descriptor.signature,
                            }),
                        },
                    });
                } else {
                    UIAlert('Could not determine asset type from dDRM capsule. The file may be corrupted or missing required fields.');
                }
            }
        } catch ( error ) {
            console.error('Error opening dDRM capsule:', error);
            UIAlert(`Error opening dDRM capsule: ${ error.message}`);
        }
    }
    //----------------------------------------------------------------
    // Is this a trashed file?
    //----------------------------------------------------------------
    else if ( item_path.startsWith(`${window.trash_path }/`) ) {
        UIAlert('This item can\'t be opened because it\'s in the trash. To use this item, first drag it out of the Trash.');
    }
    //----------------------------------------------------------------
    // .zip handling removed — now handled by RUNTIME_EXTENSIONS routing below
    //----------------------------------------------------------------
    //----------------------------------------------------------------
    // Is this a file (no dir) on a SaveFileDialog?
    //----------------------------------------------------------------
    else if ( $el_parent_window.attr('data-is_saveFileDialog') === 'true' && !is_dir ) {
        $el_parent_window.find('.savefiledialog-filename').val($(el_item).attr('data-name'));
        $el_parent_window.find('.savefiledialog-save-btn').trigger('click');
    }
    //----------------------------------------------------------------
    // Is this a file (no dir) on an OpenFileDialog?
    //----------------------------------------------------------------
    else if ( $el_parent_window.attr('data-is_openFileDialog') === 'true' && !is_dir ) {
        $el_parent_window.find('.window-disable-mask, .busy-indicator').show();
        let busy_init_ts = Date.now();
        try {
            let filedialog_parent_uid = $el_parent_window.attr('data-parent_uuid');
            let $filedialog_parent_app_window = $(`.window[data-element_uuid="${filedialog_parent_uid}"]`);
            let parent_window_app_uid = $filedialog_parent_app_window.attr('data-app_uuid');
            const initiating_app_uuid = $el_parent_window.attr('data-initiating_app_uuid');

            let res = await puter.fs.sign(window.host_app_uid ?? parent_window_app_uid, { uid: uid, action: 'write' });
            res = res.items;
            // todo split is buggy because there might be a slash in the filename
            res.path = window.privacy_aware_path(item_path);
            const parent_uuid = $el_parent_window.attr('data-parent_uuid');
            const return_to_parent_window = $el_parent_window.attr('data-return_to_parent_window') === 'true';
            if ( return_to_parent_window ) {
                window.opener.postMessage({
                    msg: 'fileOpenPicked',
                    original_msg_id: $el_parent_window.attr('data-iframe_msg_uid'),
                    items: Array.isArray(res) ? [...res] : [res],
                    // LEGACY SUPPORT, remove this in the future when Polotno uses the new SDK
                    // this is literally put in here to support Polotno's legacy code
                    ...(!Array.isArray(res) && res),
                }, '*');

                window.close();
            }
            else if ( parent_uuid ) {
                // send event to iframe
                const target_iframe = $(`.window[data-element_uuid="${parent_uuid}"]`).find('.window-app-iframe').get(0);
                if ( target_iframe ) {
                    let retobj = {
                        msg: 'fileOpenPicked',
                        original_msg_id: $el_parent_window.attr('data-iframe_msg_uid'),
                        items: Array.isArray(res) ? [...res] : [res],
                        // LEGACY SUPPORT, remove this in the future when Polotno uses the new SDK
                        // this is literally put in here to support Polotno's legacy code
                        ...(!Array.isArray(res) && res),
                    };
                    target_iframe.contentWindow.postMessage(retobj, '*');
                }

                // focus iframe
                $(target_iframe).get(0)?.focus({ preventScroll: true });

                // send file_opened event
                const file_opened_event = new CustomEvent('file_opened', { detail: res });

                // dispatch event to parent window
                $(`.window[data-element_uuid="${parent_uuid}"]`).get(0)?.dispatchEvent(file_opened_event);
            }
        } catch (e) {
            console.log(e);
        }
        // done
        let busy_duration = (Date.now() - busy_init_ts);
        if ( busy_duration >= window.busy_indicator_hide_delay ) {
            $el_parent_window.close();
        } else {
            setTimeout(() => {
                // close this dialog
                $el_parent_window.close();
            }, Math.abs(window.busy_indicator_hide_delay - busy_duration));
        }
    }
    //----------------------------------------------------------------
    // Does the user have a preference for this file type?
    //----------------------------------------------------------------
    else if ( !associated_app_name && !is_dir && window.user_preferences[`default_apps${path.extname(item_path).toLowerCase()}`] ) {
        // PDF files now open in normal window to allow resizing
        // Users can maximize manually if needed
        const shouldMaximize = options.maximized !== undefined ? options.maximized : false;
        
        launch_app({
            name: window.user_preferences[`default_apps${path.extname(item_path).toLowerCase()}`],
            file_path: item_path,
            window_title: path.basename(item_path),
            maximized: shouldMaximize,
            file_uid: file_uid,
        });
    }
    //----------------------------------------------------------------
    // Route media/document/3D/data/font/archive files to PC2 runtime apps
    //----------------------------------------------------------------
    else if ( !is_dir && RUNTIME_EXTENSIONS[path.extname(item_path).toLowerCase()] ) {
        const ext = path.extname(item_path).toLowerCase();
        const target = RUNTIME_EXTENSIONS[ext];
        const filename = path.basename(item_path);
        const readUrl = `${window.api_origin}/read?path=${encodeURIComponent(item_path)}`;

        launch_app({
            name: target.app,
            window_title: filename + ' — ' + target.title,
            args: {
                cleartext: 'true',
                fileUrl: readUrl,
                mimeType: target.mime,
                title: filename,
                thumbnail: '',
            },
        });
    }
    //----------------------------------------------------------------
    // Is there an app associated with this item?
    //----------------------------------------------------------------
    else if ( associated_app_name !== '' ) {
        launch_app({
            name: associated_app_name,
        });
    }
    //----------------------------------------------------------------
    // Dir with no open windows: create a new window
    //----------------------------------------------------------------
    else if ( is_dir && ($el_parent_window.length === 0 || options.new_window) ) {
        UIWindow({
            path: item_path,
            title: path.basename(item_path),
            icon: await item_icon({ is_dir: true, path: item_path }),
            uid: $(el_item).attr('data-uid'),
            is_dir: is_dir,
            app: 'explorer',
            top: options.maximized ? 0 : undefined,
            left: options.maximized ? 0 : undefined,
            height: options.maximized ? `calc(100% - ${window.taskbar_height + window.toolbar_height + 1}px)` : undefined,
            width: options.maximized ? '100%' : undefined,
        });
    }
    //----------------------------------------------------------------
    // Dir with an open window: change the path of the open window
    //----------------------------------------------------------------
    else if ( $el_parent_window.length > 0 && is_dir ) {
        window.window_nav_history[parent_win_id] = window.window_nav_history[parent_win_id].slice(0, window.window_nav_history_current_position[parent_win_id] + 1);
        window.window_nav_history[parent_win_id].push(item_path);
        window.window_nav_history_current_position[parent_win_id]++;

        window.update_window_path($el_parent_window, item_path);
    }
    //----------------------------------------------------------------
    // all other cases: try to open using an app
    //----------------------------------------------------------------
    else {
        const fspath = item_path.toLowerCase();
        const fsuid = uid.toLowerCase();
        let open_item_meta;

        // get all info needed to open an item
        try {
            open_item_meta = await $.ajax({
                url: `${window.api_origin }/open_item`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    uid: fsuid ?? undefined,
                    path: fspath ?? undefined,
                }),
                headers: {
                    'Authorization': `Bearer ${window.auth_token}`,
                },
                statusCode: {
                    401: function () {
                        window.logout();
                    },
                },
            });
        } catch ( err ) {
            // Ignored
        }

        // get a list of suggested apps for this file type.
        let suggested_apps = open_item_meta?.suggested_apps ?? await window.suggest_apps_for_fsentry({ uid: fsuid, path: fspath });

        //---------------------------------------------
        // No suitable apps, ask if user would like to
        // download
        //---------------------------------------------
        if ( suggested_apps.length === 0 ) {
            //---------------------------------------------
            // If .zip file, unzip it
            //---------------------------------------------
            if ( path.extname(item_path) === '.zip' ) {
                window.unzipItem(item_path);
                return;
            }
            // PC2: Tar handling removed - unnecessary complexity
            const alert_resp = await UIAlert('Found no suitable apps to open this file with. Would you like to download it instead?',
                            [
                                {
                                    label: i18n('download_file'),
                                    value: 'download_file',
                                    type: 'primary',

                                },
                                {
                                    label: i18n('cancel'),
                                },
                            ]);
            if ( alert_resp === 'download_file' ) {
                window.trigger_download([item_path]);
            }
            return;
        }
        //---------------------------------------------
        // First suggested app is default app to open this item
        //---------------------------------------------
        else {
            // PDF files now open in normal window to allow resizing
            // Users can maximize manually if needed
            const shouldMaximize = options.maximized !== undefined ? options.maximized : false;
            
            launch_app({
                name: suggested_apps[0].name,
                token: open_item_meta.token,
                file_path: item_path,
                app_obj: suggested_apps[0],
                window_title: path.basename(item_path),
                file_uid: fsuid,
                maximized: shouldMaximize,
                file_signature: open_item_meta.signature,
            });
        }
    }
};

export default open_item;