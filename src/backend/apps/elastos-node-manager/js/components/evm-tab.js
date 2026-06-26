/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/evm-tab.js — EVM tab placeholder (v0.5).
 *
 * Per Architectural Invariant #4 of the v0.3 rebuild: EVM is a future
 * 5th tab inside ENM. The layout reserves the slot now so navigation
 * doesn't move when v0.5 ships. This component renders a clear
 * "coming soon" card with the v0.5 scope.
 *
 * No CTA, no link to a roadmap (we don't want to ship a dead link), no
 * hint that the tab is interactive. The button-shaped element below is
 * a static label, not a button — clicking it does nothing intentionally.
 */

(function (root) {
    'use strict';

    function EvmTab() {
        this.root = document.createElement('section');
        this.root.className = 'enm-card enm-evm-placeholder';
    }

    EvmTab.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        // 0.5.119 audit Session 119 — refreshed stale copy. Pre-0.5.119
        // the card claimed "ENM v0.3 manages your native ELA mainchain
        // only" and rendered a "v0.5" version chip — both written when
        // ENM was BPoS-mainchain-only and never refreshed as Council
        // mode shipped through Waves M3-M6 (ESC + EID + PG + Arbiter
        // chain management is live since v0.5.x). The card stayed as a
        // placeholder because the *browser-wallet* features (wallet
        // connect, contract reads/writes, bridges, NFT views) are
        // genuinely distinct from chain-process management and haven't
        // landed yet. Dropped the version chip (avoids "we're at v0.5
        // and v0.5 is coming soon" contradiction) and reframed the
        // body around what ENM does today vs. what THIS tab will add.
        this.root.innerHTML =
            '<header class="enm-evm-head">' +
                '<h2>Wallet-side EVM tools are coming</h2>' +
            '</header>' +
            '<p>' +
                'ENM already runs your Main chain producer and, in Council mode, ' +
                'the EVM sidechains (Smart Chain, Identity Chain, PG) plus the ' +
                'Arbiter — those are chain-process management. This tab is for ' +
                'something different: an in-app browser wallet so you can sign ' +
                'transactions, read EVM contracts, move assets across the bridge, ' +
                'and inspect tokens / NFTs without leaving ENM. It will land in ' +
                'a future release.' +
            '</p>' +
            '<p>' +
                'For now: use Essentials, MetaMask, or your wallet provider ' +
                'directly for any on-chain action. BPoS supernode and CR Council ' +
                'registration are <em>Main chain</em> operations — those happen ' +
                'in Essentials on your phone, not here. See ' +
                '<strong>Dashboard → Identity</strong> for the step-by-step ' +
                'registration instructions and your node\'s public key.' +
            '</p>' +
            // v0.5.186 (Council Node UX P1.4) — label the tiles unambiguously as
            // ROADMAP so they aren't misread as live/available features. The
            // copy above already states this is future; this caption makes the
            // grid itself self-evidently "planned, not live".
            '<p class="enm-evm-features-caption">Planned for a future release</p>' +
            '<div class="enm-evm-features">' +
                '<div class="enm-evm-feature">' +
                    '<div class="enm-evm-feature-title">Wallet connect</div>' +
                    '<div class="enm-evm-feature-desc">Browser wallet for ESC tx signing — ESC sidechain only, never the mainchain</div>' +
                '</div>' +
                '<div class="enm-evm-feature">' +
                    '<div class="enm-evm-feature-title">Smart contracts</div>' +
                    '<div class="enm-evm-feature-desc">Read + write to ESC contracts</div>' +
                '</div>' +
                '<div class="enm-evm-feature">' +
                    '<div class="enm-evm-feature-title">Bridges</div>' +
                    '<div class="enm-evm-feature-desc">Mainchain ↔ ESC asset transfers</div>' +
                '</div>' +
                '<div class="enm-evm-feature">' +
                    '<div class="enm-evm-feature-title">Token + NFT views</div>' +
                    '<div class="enm-evm-feature-desc">Inspect ESC balances and NFTs held by your node</div>' +
                '</div>' +
            '</div>';
        return this;
    };

    EvmTab.prototype.destroy = function () {
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    };

    root.EnmEvmTab = EvmTab;
}(typeof window !== 'undefined' ? window : globalThis));
