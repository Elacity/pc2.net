/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * illustrations.js — hand-rolled inline SVG illustrations for v0.4.
 *
 * Each function returns an SVG string. All shapes use `currentColor`
 * so CSS controls the tint — that lets the same illustration re-color
 * by state (green hero when happy, amber when working, etc.).
 *
 * Geometry is intentionally simple (circles, polygons, short paths).
 * No external dependency, no asset pipeline, ~6 KB total when minified.
 *
 * Usage:
 *   element.innerHTML = root.EnmIllust.welcome({ size: 120 });
 *   element.innerHTML = root.EnmIllust.heroState('healthy', { size: 160 });
 */

(function (root) {
    'use strict';

    // Welcome — a soft cloud with a sparkle, signaling "your ElastOS
    // is ready to do more". Used on the first-run welcome screen.
    function welcome(opts) {
        var size = (opts && opts.size) || 120;
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 120 120"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
            // Cloud body
            + '<path d="M36 76 Q24 76 24 64 Q24 54 34 52 Q36 40 50 40 Q62 40 66 50'
            + ' Q78 50 80 62 Q90 62 90 70 Q90 80 80 80 H36 Z"'
            + ' fill="currentColor" opacity="0.9"/>'
            // Big sparkle, top-right
            + '<path d="M86 28 L89 36 L97 39 L89 42 L86 50 L83 42 L75 39 L83 36 Z"'
            + ' fill="currentColor" opacity="0.65"/>'
            // Small sparkles for depth
            + '<circle cx="104" cy="48" r="2.5" fill="currentColor" opacity="0.5"/>'
            + '<circle cx="18" cy="86" r="2" fill="currentColor" opacity="0.4"/>'
            + '<circle cx="98" cy="92" r="1.6" fill="currentColor" opacity="0.5"/>'
            + '</svg>';
    }

    // Trophy — for the "Earn rewards" goal tile. Stylized cup shape.
    function trophy(opts) {
        var size = (opts && opts.size) || 64;
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
            // Base
            + '<rect x="22" y="48" width="20" height="6" rx="2" fill="currentColor"/>'
            // Stem
            + '<rect x="26" y="40" width="12" height="8" fill="currentColor" opacity="0.85"/>'
            // Cup body
            + '<path d="M16 12 H48 V28 Q48 38 32 38 Q16 38 16 28 Z" fill="currentColor"/>'
            // Side handles
            + '<path d="M16 16 H10 Q8 16 8 18 V22 Q8 28 16 28"'
            + ' stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.7"/>'
            + '<path d="M48 16 H54 Q56 16 56 18 V22 Q56 28 48 28"'
            + ' stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.7"/>'
            // Star on cup
            + '<path d="M32 18 L34 22 L38 22 L35 25 L36 29 L32 27 L28 29 L29 25 L26 22 L30 22 Z"'
            + ' fill="white" opacity="0.7"/>'
            + '</svg>';
    }

    // Shield with heart — for the "Help the network" goal tile.
    function shield(opts) {
        var size = (opts && opts.size) || 64;
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
            // Shield outline
            + '<path d="M32 8 L52 16 V32 Q52 46 32 56 Q12 46 12 32 V16 Z"'
            + ' fill="currentColor"/>'
            // Heart inside
            + '<path d="M32 40 Q24 32 24 28 Q24 24 28 24 Q31 24 32 26'
            + ' Q33 24 36 24 Q40 24 40 28 Q40 32 32 40 Z"'
            + ' fill="white" opacity="0.85"/>'
            + '</svg>';
    }

    // Gear with motion arcs — for "Setting your ElastOS up". CSS spins it.
    function gear(opts) {
        var size = (opts && opts.size) || 96;
        var teeth = '';
        for (var i = 0; i < 8; i += 1) {
            teeth += '<rect x="-4" y="-44" width="8" height="14" rx="2"'
                + ' fill="currentColor" transform="rotate(' + (i * 45) + ')"/>';
        }
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 96 96"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"'
            + ' class="enm-illust-spin">'
            + '<g transform="translate(48 48)">'
            + teeth
            + '<circle r="24" fill="currentColor"/>'
            + '<circle r="10" fill="white"/>'
            + '</g>'
            + '</svg>';
    }

    // Celebration — star with confetti dots. For Card D + milestone toasts.
    function celebration(opts) {
        var size = (opts && opts.size) || 96;
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 96 96"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
            // 5-point star
            + '<path d="M48 16 L56 38 L80 38 L60 52 L68 76 L48 62 L28 76 L36 52 L16 38 L40 38 Z"'
            + ' fill="currentColor"/>'
            // Confetti dots scattered
            + '<circle cx="14" cy="14" r="3" fill="currentColor" opacity="0.7"/>'
            + '<circle cx="84" cy="20" r="2" fill="currentColor" opacity="0.6"/>'
            + '<circle cx="10" cy="80" r="2" fill="currentColor" opacity="0.5"/>'
            + '<circle cx="86" cy="74" r="3" fill="currentColor" opacity="0.6"/>'
            + '<circle cx="48" cy="92" r="2" fill="currentColor" opacity="0.5"/>'
            + '<rect x="6" y="46" width="2" height="6" fill="currentColor" opacity="0.5"'
            + ' transform="rotate(20 7 49)"/>'
            + '<rect x="88" y="50" width="2" height="6" fill="currentColor" opacity="0.6"'
            + ' transform="rotate(-30 89 53)"/>'
            + '</svg>';
    }

    // Hero state — concentric rings with a state-specific glyph in the
    // center. Used as the focal point of the home view in v0.4.
    // The CSS picks tint via `data-state` attr.
    function heroState(stateName, opts) {
        var size = (opts && opts.size) || 160;
        var glyph;
        // v0.5.210 — accept 'synced' alongside 'healthy' (v0.5.203 vocab
        // rename). Without this, the hero illustration on synced chains
        // fell through to the default glyph instead of the smile/heart.
        if (stateName === 'healthy_earn' || stateName === 'healthy_help' || stateName === 'healthy' || stateName === 'synced') {
            // Smile / heart for happy node
            glyph = '<path d="M80 100 Q70 88 70 80 Q70 72 76 72 Q80 72 80 76'
                + ' Q80 72 84 72 Q90 72 90 80 Q90 88 80 100 Z" fill="currentColor"/>';
        } else if (stateName === 'syncing' || stateName === 'starting') {
            // Wave for "in motion"
            glyph = '<path d="M62 84 Q70 76 80 84 Q90 92 98 84"'
                + ' stroke="currentColor" stroke-width="4" fill="none"'
                + ' stroke-linecap="round" stroke-linejoin="round"'
                + ' class="enm-hero-wave"/>';
        } else if (stateName === 'recovering') {
            // Mini spinning gear
            glyph = '<g class="enm-illust-spin" transform="translate(80 84)">'
                + '<circle r="10" fill="currentColor"/>'
                + '<rect x="-2" y="-16" width="4" height="6" fill="currentColor"/>'
                + '<rect x="-2" y="10"  width="4" height="6" fill="currentColor"/>'
                + '<rect x="-16" y="-2" width="6" height="4" fill="currentColor"/>'
                + '<rect x="10"  y="-2" width="6" height="4" fill="currentColor"/>'
                + '</g>';
        } else if (stateName === 'error' || stateName === 'stalled') {
            // Bell — calls for attention
            glyph = '<path d="M80 70 Q72 70 72 78 V90 Q72 92 70 92 H90'
                + ' Q88 92 88 90 V78 Q88 70 80 70 Z" fill="currentColor"/>'
                + '<circle cx="80" cy="96" r="3" fill="currentColor"/>';
        } else if (stateName === 'stopped') {
            // Pause icon
            glyph = '<rect x="72" y="72" width="6" height="20" rx="1" fill="currentColor"/>'
                + '<rect x="82" y="72" width="6" height="20" rx="1" fill="currentColor"/>';
        } else {
            // Unconfigured — small dot, signals "nothing here yet"
            glyph = '<circle cx="80" cy="84" r="6" fill="currentColor" opacity="0.7"/>';
        }
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 160 160"'
            + ' fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"'
            + ' data-state="' + stateName + '" class="enm-illust-hero">'
            // Outer ring (very subtle)
            + '<circle cx="80" cy="80" r="76" stroke="currentColor" stroke-width="1.5"'
            + ' opacity="0.15" fill="none"/>'
            // Middle ring
            + '<circle cx="80" cy="80" r="62" stroke="currentColor" stroke-width="1.5"'
            + ' opacity="0.25" fill="none"/>'
            // Inner soft fill
            + '<circle cx="80" cy="80" r="48" fill="currentColor" opacity="0.10"/>'
            + glyph
            + '</svg>';
    }

    root.EnmIllust = {
        welcome:     welcome,
        trophy:      trophy,
        shield:      shield,
        gear:        gear,
        celebration: celebration,
        heroState:   heroState,
    };
}(typeof window !== 'undefined' ? window : globalThis));
