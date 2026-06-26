/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * services/wallet.js — operator-identity service (v0.3 rebuild).
 *
 * Per Architectural Invariant #2: the wallet here is identity-only. ENM
 * never asks the operator's browser wallet to sign chain transactions.
 * Producer keys are generated server-side via `ela-cli` against
 * keystore.dat. The wallet badge in the titlebar exists to show "you are
 * signed in as <address>" and to attribute audit-log entries.
 *
 * Identity resolution path (single source, no fallbacks):
 *
 *     1. Read `puter.auth.token` (or fallbacks) from URL params.
 *     2. GET /api/enm/whoami with Bearer token.
 *     3. enm-server resolves the token against pc2-node's session DB.
 *     4. Returns { wallet_address, isOwner }.
 *
 * Why we dropped the legacy `dao-wallet-request` IPC path:
 *
 *   The original v0.1 frontend tried to postMessage `getTetheredDID` to the
 *   parent PC2 window, expecting an `{did, wallets}` response. PC2's
 *   src/gui/src/IPC.js DOES handle that message — but only for apps that
 *   PC2 has explicitly registered as DAO consumers (dao-dashboard is the
 *   canonical example). ENM was never registered there, so the IPC path
 *   silently dropped its messages and the operator saw "Sign in to PC2
 *   first" forever.
 *
 *   The /whoami fallback we added later worked. So we drop the IPC path
 *   entirely. One code path, one source of truth, no race conditions
 *   between two parallel resolutions.
 *
 * Window-manager IPC contract is unchanged: send READY on boot, respond
 * to windowWillClose with windowWillCloseAck. PC2 needs both for proper
 * minimize/close behavior.
 */

(function (root) {
    'use strict';

    function WalletService() {
        var params = new URLSearchParams(root.location.search);
        this.appInstanceId = params.get('puter.app_instance_id') || null;
        this.authToken = params.get('puter.auth.token')
            || params.get('auth_token')
            || params.get('token')
            || null;
        this.identity = null; // { wallet_address, isOwner }
        this._closeHandlerInstalled = false;
    }

    WalletService.prototype.sendReady = function () {
        if (!root.parent || root.parent === root) return;
        root.parent.postMessage({
            msg: 'READY',
            appInstanceID: this.appInstanceId,
            env: 'app',
        }, '*');
    };

    WalletService.prototype.installCloseHandler = function () {
        if (this._closeHandlerInstalled) return;
        this._closeHandlerInstalled = true;
        root.addEventListener('message', function (ev) {
            if (!ev || !ev.data || ev.data.msg !== 'windowWillClose') return;
            root.parent.postMessage({
                msg: 'windowWillCloseAck',
                original_msg_id: ev.data.msg_id,
            }, '*');
        });
    };

    /**
     * Resolve the operator's identity. Caches the result for the page session.
     *
     * @returns {Promise<{wallet_address: string, isOwner: boolean}|null>}
     */
    WalletService.prototype.getIdentity = function () {
        if (this.identity) return Promise.resolve(this.identity);
        if (!this.authToken) return Promise.resolve(null);

        var apiBase = root.ENM_API_BASE
            || (root.location.protocol + '//' + root.location.hostname + ':4180/api/enm');
        var self = this;
        return fetch(apiBase + '/whoami', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + this.authToken,
            },
            credentials: 'include',
        }).then(function (res) {
            if (!res.ok) return null;
            return res.json();
        }).then(function (body) {
            if (!body || body.success === false) return null;
            var r = body.result || body;
            if (!r || !r.wallet_address) return null;
            self.identity = {
                wallet_address: r.wallet_address,
                isOwner: !!r.isOwner,
            };
            return self.identity;
        }).catch(function () { return null; });
    };

    WalletService.truncateAddress = function (addr) {
        if (!addr) return '';
        if (addr.length <= 12) return addr;
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    };

    root.EnmWalletService = WalletService;
}(typeof window !== 'undefined' ? window : globalThis));
