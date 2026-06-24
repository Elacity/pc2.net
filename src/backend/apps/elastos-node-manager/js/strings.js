/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * STRINGS — every user-facing string the UI displays.
 *
 * Why a flat object instead of inline literals?
 *   PC2's GUI ships its own i18n at src/gui/src/i18n/i18n.js (38 languages).
 *   v0.1 is English-only (matches PC2's setup wizard precedent), but we keep
 *   strings centralized so v0.2 can drop in by:
 *     1. Pasting STRINGS keys into PC2's translation files
 *     2. Replacing references with `window.i18n('enm.<key>')`
 *
 * Convention: hierarchical dot-keys mirror the UI region.
 * Format helpers: use {placeholder} tokens — services/format.js fills them.
 */

(function (root) {
    'use strict';

    /**
     * Recursively freeze an object so deep mutations throw in strict mode.
     * Object.freeze only freezes the top level — nested objects stay mutable
     * unless we walk them.
     *
     * @param {object} o
     * @returns {object}
     */
    function deepFreeze(o) {
        Object.freeze(o);
        for (var k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)
                && o[k] && typeof o[k] === 'object'
                && !Object.isFrozen(o[k])) {
                deepFreeze(o[k]);
            }
        }
        return o;
    }

    var STRINGS = deepFreeze({
        // Friendly vocabulary — eli5 + "your ElastOS" framing.
        // Used by v0.4 components (welcome-screen, setup-conversation,
        // hero-card, settings-drawer, milestone-toast). The technical
        // strings below are still consumed by the v0.3 components that
        // live inside the technical-view drawer.
        friendly: {
            app_title: 'Welcome to your ElastOS',

            welcome: {
                title:  'Turn your ElastOS into a node',
                body:   'In a few minutes, your ElastOS will be helping secure '
                      + 'the network — and earning ELA while it does.',
                cta:    "Let's go",
            },

            setup: {
                progress: 'Step {n} of {total}',
                back:     'Back',
                next:     'Next',
                cancel:   'Cancel setup',

                card_a: {
                    title:      'What kind of node?',
                    // ENM is positioned for BPoS supernode + Council node operators only.
                    // "Full node" is NOT a primary option — the chain can run as a
                    // follower technically, but ENM the product targets the two
                    // governance roles. (See feedback_enm_vocabulary memory entry.)
                    bpos_title: 'BPoS supernode',
                    bpos_sub:   'Run as a producer and sign blocks for the DPoS consensus. Earns block rewards once your wallet is voted in by the community.',
                    // 0.2.0-beta.3.6 — phase-06 mock spec is a three-line
                    // meta list (Requires / Wallet / Auto-installs) per
                    // role-card. (0.5.25 audit Session 25 — dropped the
                    // orphan bpos_meta key; replaced pre-beta.3.6.)
                    bpos_requires_label:  'Requires',
                    bpos_requires_value:  'producer keystore (signing key)',
                    bpos_wallet_label:    'Wallet',
                    bpos_wallet_value:    'paired in the next step',
                    bpos_install_label:   'Auto-installs',
                    // 0.5.25 audit Session 25 — display-name parity with
                    // v0.5.18+24. Pre-0.5.25: 'ela mainchain only' leaked
                    // the binary name + used the raw chain id. New copy
                    // also names the missing pieces (no sidechains) so
                    // the contrast with Council card is explicit.
                    bpos_install_value:   'Main chain only (no sidechains, no Arbiter)',
                    // beta.0.4.3 — Council node is a DISTINCT role from
                    // BPoS supernode (operator directive: "BPoS owners
                    // don't become Council nodes; Council nodes always
                    // run all services"). Picking Council triggers the
                    // full multi-chain sequential install (M1-M6 work):
                    // Mainchain → ESC/EID/PG → Oracles → Arbiter.
                    // (CR governance voting on treasury proposals
                    // happens via the operator's wallet app, NOT via
                    // node setup; this card is about the infrastructure,
                    // not the voting.)
                    council_title:   'Council node',
                    // 0.5.0 audit Session 1 — replaced stale "3 inputs" copy.
                    // The 7-card redesign (v0.4.7) collapsed user-supplied inputs
                    // to ONE: the EVM wallet address. The master password is
                    // generated client-side (no operator typing) and the Arbiter
                    // mining uses the same EVM address. Promising "3 inputs" then
                    // showing 1 field on Card 4 was a trust gap.
                    council_sub:     'Run the full multi-chain operator stack — Main chain, EVM sidechains (ESC/EID/PG), their Oracles, and Arbiter for cross-chain signing. ENM installs everything in sequence; you provide one wallet address — your master password is generated for you.',
                    // 0.5.0 audit Session 1 — Council's economic story is
                    // "many small streams" (PBFT block rewards on ESC/EID/PG +
                    // Arbiter mining heartbeats + the mainchain BPoS rewards if
                    // the operator's also a producer). We don't quote a number
                    // for the same reason BPoS no longer does — depends on stake
                    // + chain activity. "Multi-chain rewards*" anchors the role.
                    council_meta:    'Multi-chain rewards*',
                    council_meta_compact: 'Multi-chain',
                    council_status_label: 'Includes',
                    // 0.5.25 audit Session 25 — display-name parity.
                    // Pre-0.5.25 used lowercase raw ids ("mainchain ...
                    // oracles + arbiter") inconsistent with the rest
                    // of the app post-v0.5.18.
                    council_status_value: 'Main chain + 3 EVM sidechains + 3 Oracles + Arbiter Service',
                    // 0.5.25 audit Session 25 — dropped the orphan
                    // council_disabled boolean (no consumers since
                    // beta.0.4.3 enabled the card unconditionally).
                    council_requires_label: 'Requires',
                    // 0.5.25 audit Session 25 — "Main chain keystore"
                    // matches v0.5.24 install-stepper "Main chain
                    // keystore" label.
                    council_requires_value: 'Main chain keystore (signing key, shared across chains)',
                    // 0.5.140 audit Session 140 — council_includes_bpos_label
                    // and council_includes_bpos_value DROPPED. The original
                    // S1 audit assumed dpos.enableArbiter=true puts the
                    // mainchain into "BPoS PRODUCER mode (eligible for
                    // community voting)". That assumption is wrong:
                    //   - Elastos.ELA main.go:114-130 — EnableArbiter only
                    //     opens the keystore so the node CAN sign blocks.
                    //     It does NOT register the operator as a BPoS
                    //     producer. BPoS producer registration is a
                    //     separate on-chain RegisterProducer tx with a
                    //     2,000 ELA deposit, which ENM does not call.
                    //   - Elastos.ELA dpos/state/arbitrators.go:2439-2460
                    //     (resetNextArbiterByCRC) — Council members are
                    //     AUTOMATICALLY a CRC arbiter during their election
                    //     period via the CR Committee → CRC arbiter
                    //     pipeline. No separate vote required.
                    // Net: Council nodes participate in mainchain consensus
                    // by virtue of being elected to the CR Committee — a
                    // different path from BPoS producer registration. The
                    // council_status_value above already discloses Main
                    // chain inclusion, so the callout was also redundant.
                    // See [[feedback-enm-council-auto-consensus]] memory.
                    council_wallet_label:   'Wallet',
                    council_wallet_value:   'paired in the next step',
                    // 0.5.0 audit Session 1 — separated footnote from help copy.
                    // Pre-0.5.0 the * "rewards depend on votes" line and the
                    // "Council vs BPoS" comparison ran together as one
                    // paragraph; visually + semantically distinct concerns
                    // belong on separate lines.
                    footer:     "Council node is the full multi-chain operator role; BPoS supernode runs Main chain only. Pick whichever matches the role you want to run.",
                    footnote:   "* Rewards depend on community votes + chain activity. Both roles earn only when active.",
                },
                card_b: {
                    title_idle:        'Ready when you are',
                    title_active:      'Setting your ElastOS up',
                    title_done:        'All set up — almost there',
                    sub_idle:          'When you tap the button below, your ElastOS will download and install the chain software. Takes about 2 minutes.',
                    sub_active:        'Grab a coffee while we get things ready ☕',
                    sub_done:          'Everything is installed and ready.',
                    cta_install:       'Install now',
                    cta_retry:         'Try again',
                    cta_continue:      'Continue',
                    phase_preparing:   'Getting ready…',
                    phase_downloading: 'Downloading…',
                    phase_verifying:   'Making sure everything works…',
                    phase_installing:  'Almost ready…',
                    phase_done:        'Done',
                    phase_failed:      "Something didn't work",
                    failed_help:       'Tap "Try again". If it keeps failing, check your internet connection.',
                },
                card_b2: {
                    title_idle:                 'Speed up first sync?',
                    sub_idle:                   "Your node can either download the official Elastos mainchain snapshot (~15-30 min) or sync the mainchain block-by-block from scratch (1–3 days). EVM sidechains always sync from peers regardless. Most operators pick the snapshot for the mainchain — it still verifies every block as it catches up to today.",
                    badge_recommended:          'Recommended',
                    tile_bootstrap_title:       'Use official mainchain snapshot',
                    tile_bootstrap_sub:         'Skip the multi-day mainchain genesis sync. Your node will be reachable in roughly 15-30 minutes.',
                    tile_bootstrap_meta:        '~10 GB download · needs ~40 GB free',
                    tile_genesis_title:         'Sync from scratch',
                    tile_genesis_sub:           'Verify every mainchain block from genesis. Slower, but no trust in anyone else’s files.',
                    tile_genesis_meta:          '1–3 days, depending on hardware',
                    cancel:                     'Cancel download',
                    advancing:                  'Saving your choice…',
                    advance_failed:             'Could not save your choice: {error}',
                    title_running:              'Downloading the mainchain snapshot',
                    sub_running:                "Leave this open. We’ll move you on as soon as it’s ready.",
                    title_failed:               "Snapshot didn’t finish",
                    sub_failed:                 'Network or disk problem during the download.',
                    title_done:                 'Snapshot ready',
                    sub_done:                   'Your node has the official mainchain data. Continue to the next step.',
                    cta_retry:                  'Try again',
                    cta_fallback_genesis:       'Skip and sync from scratch instead',
                    cta_continue:               'Continue',
                    genesis_picked_title:       'Genesis sync chosen',
                    genesis_picked_sub:         'Your node will sync from block 0. This can take 1–3 days.',
                    phase_preparing:            'Getting ready…',
                    phase_resolving:            'Checking the mainchain snapshot…',
                    phase_downloading:          'Downloading',
                    phase_extracting:           'Unpacking…',
                    phase_applying:             'Moving files into place…',
                    phase_verifying:            'Verifying…',
                    phase_done:                 'Done',
                    phase_failed:               'Failed',
                },
                card_c: {
                    title_initial:    'Save your secret password',
                    title_generated:  '🔑 Here is your secret password',
                    sub_initial:      "We'll generate a strong password for you. It protects your earnings.",
                    sub_generated:    "We just generated a strong password that unlocks the keystore signing your DPoS rounds. Save it before continuing.",
                    // beta.3.38 — explicit warning callout above the password
                    // block + a row label so the operator's eye lands on the
                    // value, not on the surrounding chrome.
                    warning:          "This password is shown ONCE. If you lose it, you can't recover the keystore — you'd have to re-register the node from scratch (BPoS producer-register OR CR Council claim, depending on your role). A password manager is the safest place.",
                    password_label:   'Password',
                    cta_generate:     'Generate my password',
                    cta_continue:     'Continue',
                    cta_copy:         'Copy',
                    cta_copied:       'Copied!',
                    ack:              "I've saved it somewhere safe",
                    skip_full:        'No password needed for follower nodes — moving on.',
                    // alpha.28.1 batch 88 (Round-28 finding #2) — UX
                    // parity with validator-card (batch 87): tell the
                    // operator the API failed and how to recover via
                    // manual select-and-copy. Previous shape selected
                    // the password silently with no toast.
                    copy_fail_title:  'Copy unavailable',
                    copy_fail_body:   'Browser blocked clipboard access. The password is selected — press Ctrl-C (or ⌘-C on Mac) to copy.',
                },
                card_d: {
                    title_starting:  'Starting your ElastOS up…',
                    title_done:      "🎉 You're all set!",
                    sub_starting:    'Almost there.',
                    sub_done:        'Your ElastOS is now a node and is starting up.',
                    cta:             'Take me home',
                },
                // beta.0.4.6 — Card D2: pre-flight checks. Sits
                // between Card D (mainchain up) and Card E (inputs)
                // on the Council path. Surfaces blockers UPFRONT so
                // the operator doesn't watch the install fail at
                // step 3 of 8 because GitHub is unreachable or disk
                // is full. The Re-run button retries after the
                // operator fixes the underlying issue without
                // restarting the wizard.
                card_d2: {
                    title:  'Pre-flight checks',
                    sub:    'Quick check that everything Council install needs is ready before we '
                          + 'start. Re-run if something fails after fixing it (e.g. firewall, '
                          + 'disk).',
                    cta:    'Continue',
                    rerun:  'Re-run checks',
                    running: 'Running checks…',
                    error_prefix: 'Pre-flight call failed: ',
                },
                // beta.0.4.5 — Card E redesigned per operator
                // directive 2026-05-18 ("too many steps and doesn't
                // actually understand what is it doing"). Collapsed
                // 3 inputs (password + reward + arbiter mining) down
                // to ONE (the wallet address). The mainchain keystore
                // password from Card C is reused for all sidechain
                // signing (H23). The Arbiter's mining address is the
                // same wallet address (schema accepts EVM or ELA).
                card_e: {
                    title:        'Your wallet address',
                    sub:          'ENM uses this for everything: ESC, EID, PG block rewards AND '
                                + 'the Arbiter’s cross-chain signing. One address from your '
                                + 'wallet — that’s it.',
                    reward_label: 'Your wallet address',
                    reward_hint:  'Paste your Ethereum-style address from Essentials. '
                                + 'Same address is used for ESC, EID, PG, and the Arbiter — '
                                + 'one wallet, one input.',
                    note_mining_off: 'Heads up: ENM does not toggle EVM sidechain mining — it activates '
                                + 'automatically the moment this node\'s public key appears in the on-chain '
                                + 'arbiter slate (once you bind your CR Council seat in Elastos Essentials). '
                                + 'Most Council rewards come from BPoS mainchain blocks and Arbiter '
                                + 'SideChainPow heartbeats; sidechain rewards arrive automatically when '
                                + 'on-duty. The reward addresses you set here are persisted for that moment.',
                    cta:          'Install Council stack',
                },
                card_f: {
                    title:           'Installing Council stack',
                    sub:             'ENM is installing the remaining services. '
                                   + 'This usually takes 5–10 minutes depending on your network speed. '
                                   + 'Each step is real progress — not a spinner.',
                    cta_done:        'Open dashboard',
                    cta_retry:       'Retry',
                    cta_working:     'Working…',
                    summary_done:    'All chains installed. Click Continue to open the dashboard.',
                    summary_error:   'Install failed at one of the steps above. '
                                   + 'Click Retry to resume from where it stopped — '
                                   + 'completed steps are skipped on retry.',
                },

                // beta.0.4.7 — Card 2..7 keys for the redesigned 7-card
                // flow. Card A (welcome / role chooser) is reused as
                // Card 1 — its strings stay under `card_a.*` above.
                // The new flow collapses Card B / B2 / B3 / C / D / E /
                // F into a leaner sequence that's identical in shape
                // for Council and BPoS-only paths (the difference is
                // the per-card backend payload, not the UI). Mainchain
                // keystore password lives inside Card 3's master
                // password (BPoS path covers only mainchain; Council
                // path covers mainchain + ESC + EID + PG EVM keystores
                // + Arbiter wallet).
                card_2: {
                    title:           'System check',
                    sub:             'ENM verifies your hardware can actually run this workload before '
                                   + 'we touch anything. CPU cores, RAM, disk space and the OS get '
                                   + 'checked against the {path} thresholds. This step cannot be skipped.',
                    rerun:           'Re-run checks',
                    cta:             'Continue',
                    running:         'Running system checks…',
                    // v0.5.188 — staged-sync guidance for constrained servers (Council
                    // installs 8 chains). Verified safe + consistent with node.sh.
                    perf_note:       'Heads-up for modest hardware: Council runs 8 chains, and they sync '
                                   + 'slowly when they all start together. The Main chain comes up first '
                                   + 'and the sidechains + Arbiter depend on it — so if a chain looks stuck, '
                                   + 'let the Main chain (and one sidechain) finish syncing before the rest '
                                   + 'catch up. Staging the sync like this is normal on limited servers.',
                    blocked_help:    'Fix the blocker, then press Re-run checks. Your host needs to meet '
                                   + 'the required thresholds before setup can proceed.',
                    add_swap_label:  'Your server has exactly 8 GB RAM. ENM can create a 4 GB swapfile '
                                   + 'so mainchain doesn\'t OOM during initial sync.',
                    add_swap_btn:    'Add swap automatically',
                    add_swap_working:'Creating swapfile…',
                    add_swap_done:   'Swap is active ({freeGbAfter} GB free including swap). Re-running checks…',
                    add_swap_failed: 'Could not add swap: {error}',
                    // 0.5.22 audit Session 22 — error UX parity with Card 5
                    // (v0.5.21). Pre-0.5.22 a single `err_prefix` key
                    // produced "System check call failed: Failed to fetch"
                    // — stack-trace-style, no retry pointer. Same three-
                    // key pattern: label / body / retry hint.
                    err_label:       'System check could not run',
                    err_body:        'Network or server problem: {error}',
                    err_retry_hint:  'Press Re-run checks above to try again.',
                },
                card_3: {
                    title:           '🔑 Master password',
                    // 0.5.26 audit Session 26 — dropped orphan `sub` key
                    // (no consumers; the card only ever renders sub_council
                    // or sub_bpos based on _goal). Display-name parity:
                    // "Main chain" replaces lowercase "mainchain" raw id,
                    // matching v0.5.18 / v0.5.24 / v0.5.25 conventions.
                    sub_council:     'One password protects every keystore on your node: Main chain '
                                   + 'producer key, ESC + EID + PG EVM keystores, and the Arbiter '
                                   + 'wallet. Save it once and you\'re done.',
                    sub_bpos:        'One password protects your Main chain producer keystore. Save it '
                                   + 'once — there\'s no recovery if it\'s lost.',
                    // 0.5.3 audit Session 3 — warning rewritten for accuracy.
                    // Pre-0.5.3 "shown ONCE" was misleading: localStorage stash
                    // re-displays it on refresh until install completes. The
                    // real catastrophic states are (a) clearing localStorage
                    // before install finishes, (b) generating on one origin
                    // then accessing from a different URL (per-origin
                    // localStorage means the password is missing on the new
                    // origin → wizard regenerates → mismatch with the
                    // existing keystore.dat). Copy now reflects both.
                    warning:         'Save this NOW to your password manager. If you lose it before the '
                                   + 'install completes, regenerating creates a different password that '
                                   + 'won\'t match the keystore — full wipe + reinstall needed. Stick to '
                                   + 'ONE access URL (IP or domain, not both) until install finishes; '
                                   + 'browsers keep the password separately per URL.',
                    show:            'Show',
                    hide:            'Hide',
                    password_label:  'Master password',
                    cta_generate:    'Generate my master password',
                    cta_continue:    'Continue',
                    cta_copy:        'Copy',
                    cta_copied:      'Copied!',
                    ack:             'I\'ve saved it somewhere safe',
                    copy_fail_title: 'Copy unavailable',
                    copy_fail_body:  'Browser blocked clipboard access. The password is selected — '
                                   + 'press Ctrl-C (or ⌘-C on Mac) to copy.',
                    // 0.5.103 audit Session 103 — Session 50 backlog #2.
                    // Strings for the existing-keystore branch. The
                    // wizard hits GET /identity at Card 3 mount; if a
                    // keystore.dat is on disk (operator reinstalled
                    // ENM but kept the chain data dir, or restored a
                    // backup keystore manually), they get the paste-
                    // existing-password input instead of the auto-
                    // generate button. Pre-0.5.103 this case silently
                    // installed with a brand-new password the existing
                    // keystore couldn't unlock — first chain start
                    // then fell over with a generic "process exited"
                    // F1 alert and no operator-actionable hint.
                    checking_existing:        'Checking for an existing keystore on this node…',
                    existing_warning:         'An existing Main chain keystore was detected on disk. '
                                            + 'Paste the master password you used when it was created — '
                                            + 'generating a new one here would not unlock that keystore '
                                            + 'and the chain would fail to start. If you lost the '
                                            + 'password, delete the keystore.dat from the Main chain '
                                            + 'data directory on this server before continuing.',
                    existing_input_label:     'Existing master password',
                    existing_input_placeholder: 'Paste the password from your password manager',
                    existing_input_hint:       'No verification happens here — the chain itself checks '
                                             + 'the password the first time it starts. A wrong '
                                             + 'password surfaces as a chain-start failure on the '
                                             + 'dashboard, not on this card.',
                    existing_input_err_length: 'Master passwords are at least 8 characters. Check that '
                                             + 'you pasted the full value without trailing spaces.',
                    cta_use_existing:          'Continue with existing keystore',
                    // 0.5.105 audit Session 105 — Session 50 backlog #4.
                    // Recovery flow for the localStorage-clear-mid-setup
                    // case: operator copied the Card 3 password to their
                    // password manager, then localStorage got cleared
                    // before the install ran (no keystore.dat exists
                    // yet, so the Session 103 existing-keystore branch
                    // doesn't trigger). The "Use a password I saved
                    // earlier" link below the Generate button surfaces
                    // a paste input so the operator can resume with
                    // their saved password instead of regenerating and
                    // making their password manager entry stale.
                    cta_paste_saved_link:    'Use a password I saved earlier',
                    paste_saved_warning:     'Paste the master password you saved during a previous setup. '
                                           + 'No keystore was created yet, so any value works — the install '
                                           + 'will use whatever you paste verbatim. Pulling straight from a '
                                           + 'password manager avoids typos that would make your saved '
                                           + 'entry useless later.',
                    paste_saved_input_label: 'Saved master password',
                    paste_saved_input_hint:  'Same length sanity check as the auto-generated value (8–64 '
                                           + 'characters). No verification at this step.',
                    cta_use_saved:           'Continue with saved password',
                    cta_back_to_generate:    'Generate a new one instead',
                },
                card_4: {
                    title:           'Your wallet address',
                    // Heads up: operator directive 2026-05-19 — explainer
                    // MUST mention ESC, EID, PG mining rewards AND the
                    // Arbiter's cross-chain signing role. One wallet for
                    // everything; no separate inputs.
                    //
                    // 0.5.28 audit Session 28:
                    //  - "on the mainchain" → "on Main chain" display-name
                    //    parity (v0.5.18 / 24 / 25 / 26 / 27 convention).
                    //  - "PG (private chain)" → "PG" — verified against
                    //    enm-server/src/services/PgAdapter.js (Wave M5.1):
                    //    PG is a PUBLIC EVM PBFT sidechain. The binary is
                    //    closed-source (operator-supplied SHA256 manifest
                    //    gate), but the CHAIN ITSELF isn't private in the
                    //    permissioned-access sense the label implied.
                    sub:             'ENM uses this one address for everything: block-mining rewards '
                                   + 'on ESC (Smart Chain), EID (Identity Chain), PG '
                                   + 'AND the Arbiter\'s cross-chain signing on Main chain. One '
                                   + 'wallet from Essentials — one input.',
                    sub_bpos:        'ENM uses this address as your producer\'s reward destination '
                                   + 'on Main chain. Paste the same Essentials owner-address you '
                                   + 'will register with later.',
                    reward_label:    'Wallet address (Ethereum-style, from Essentials)',
                    reward_hint:     'Paste your Ethereum-style address from Essentials. '
                                   + 'Same address is used for ESC, EID, PG mining and the Arbiter — '
                                   + 'one wallet, one input.',
                    reward_hint_bpos:'Paste your Essentials owner-address. This is the address that '
                                   + 'will eventually appear on your producer registration.',
                    confirm_label:   'Confirm: retype the LAST 4 characters',
                    confirm_hint:    'Anti-typo gate: a wrong reward address means lost rewards '
                                   + 'forever. Retype the last 4 characters of the address above to '
                                   + 'confirm.',
                    err_format:      'Must start with 0x followed by 40 hex characters.',
                    // 0.5.102 audit Session 102 — EIP-55 backlog item
                    // (Session 50 list #3). Surfaces a non-blocking
                    // warning when the operator's pasted reward
                    // address has mixed-case A-F chars (suggesting
                    // EIP-55 checksum encoding). Doesn't do full
                    // keccak verification (no built-in browser API
                    // for keccak-256; SubtleCrypto provides standard
                    // SHA-3 only, which differs in pad byte from
                    // keccak-256 that EIP-55 uses) but prompts
                    // operator awareness of the wrong-checksum
                    // footgun: EVM chains accept ANY mixed-case as
                    // valid and parse it to the lowercase address,
                    // so a one-char typo in mixed-case sends to a
                    // different wallet silently.
                    warn_mixed_case: 'Mixed-case address detected — double-check it matches your wallet exactly. A wrong checksum sends to a different address silently.',
                    // 0.5.4 audit Session 4 — operators paste from Essentials /
                    // MetaMask / explorer pages and sometimes capture the 40
                    // hex chars without the 0x prefix. Pre-0.5.4 they hit the
                    // generic format error and didn't know what was wrong;
                    // suggesting the fix preempts the support question.
                    err_missing_0x:  'Address is missing the "0x" prefix. Did you mean "{suggested}"?',
                    err_last4_empty: 'Retype the last 4 characters of the address above.',
                    err_last4_match: 'Mismatch — expected "{expected}".',
                    cta:             'Continue',
                },
                card_5: {
                    title:           'Confirm and install',
                    sub:             'A quick pre-flight then we kick everything off. Council always '
                                   + 'installs Mainchain + ESC + EID + PG + 3 oracles + Arbiter — no '
                                   + 'optional add-ons. The mainchain snapshot below skips 1–3 days '
                                   + 'of mainchain block-by-block sync; EVM sidechains cold-sync '
                                   + 'from peers regardless.',
                    sub_bpos:        'A quick pre-flight then we kick the mainchain install off.',
                    rerun:           'Re-run pre-flight',
                    snapshot_label:  'Use official mainchain snapshot (recommended)',
                    snapshot_hint:   'Default ON. Downloads ~10 GB so the Main chain skips its '
                                   + '1–3 day genesis sync. Needs ~220 GB free disk for the full '
                                   + 'Council install (chaindata growth dominates, not the snapshot).',
                    // v0.5.199 — explicit EVM-cold-sync disclosure. The Card 5
                    // checkbox controls the mainchain snapshot only; the
                    // upstream EVM snapshots embed a duplicate nodekey that
                    // collides on the peer mesh (the cycle-13 lockup,
                    // 2026-05-23) so they are disabled by design.
                    snapshot_evm_note: 'Mainchain only. EVM sidechains (esc, eid, pg) always '
                                   + 'sync from peers — the official EVM snapshots embed an '
                                   + 'identity key that collides on the network. Expect 3–7 '
                                   + 'days of background EVM sync after install completes.',
                    cta:             'Install everything',
                    cta_bpos:        'Install mainchain',
                    cta_working:     'Starting install…',
                    running:         'Running pre-flight…',
                    blocked:         'Fix the blocking check above, then press Re-run pre-flight.',
                    // 0.5.21 audit Session 21 — preflight error UX:
                    //  - err_label: short row title (operator scans the list)
                    //  - err_body: friendly explanation + technical detail
                    //  - err_retry_hint: explicit pointer to the Re-run btn
                    // Pre-0.5.21 there was a single `err_prefix` key that
                    // produced "Pre-flight call failed: Failed to fetch" —
                    // reads like a stack trace + no recovery affordance.
                    err_label:       'Pre-flight check could not run',
                    err_body:        'Network or server problem: {error}',
                    err_retry_hint:  'Press Re-run pre-flight above to try again.',
                    err_install:     'Could not start install: {error}',
                },
                card_6: {
                    title:           'Installing your node',
                    // 0.5.143 audit Session 143 — duration honesty fix.
                    // Pre-0.5.143 said "Usually 5–10 minutes if snapshots
                    // are on" — the 5-minute floor was an optimistic
                    // single-chain bench number. On a Hostinger VPS with
                    // 4 chain snapshots in parallel, the mainchain tarball
                    // alone takes 30-90 min. Operators stared at the bar
                    // assuming it was hung. New copy matches real-world
                    // wall time on the supported hardware tier.
                    // v0.5.199 — snapshot is mainchain-only now; install
                    // completes faster (no EVM tarballs) but EVM sidechains
                    // keep syncing for days in the background.
                    sub:             'ENM is installing all 4 chains, 3 oracles and the Arbiter. '
                                   + 'Real progress below — not a spinner. Usually 30 minutes to '
                                   + '1 hour with the mainchain snapshot on. EVM sidechains '
                                   + 'continue syncing in the background for several days after '
                                   + 'install completes.',
                    sub_bpos:        'ENM is installing the mainchain binary and configuration. '
                                   + 'Usually 2–5 minutes.',
                    // 0.5.143 audit Session 143 — operator-requested guidance
                    // for the snapshot-download step. Shown only while
                    // `download-snapshots-parallel` is the active running
                    // step; hidden once it completes. The snapshot step is
                    // the longest-running phase of the entire install
                    // (network-bound, can run 30-120 min depending on
                    // upstream bandwidth) and operators previously had no
                    // signal that walking away or accidentally killing the
                    // device's connection would lose progress.
                    // v0.5.199 — mainchain-only snapshot; tighter time range
                    // since only one tarball streams (~10 GB vs ~50 GB).
                    snapshot_note_title: '⏱ Mainchain snapshot — 15 to 60 minutes',
                    snapshot_note_body:  'You can leave this page open and come back later — '
                                       + 'the download continues in the background. Don’t shut '
                                       + 'down your PC2 or disconnect its internet while this '
                                       + 'runs; either will interrupt the mainchain download '
                                       + 'and you’ll have to start this step over. EVM sidechains '
                                       + 'are not affected by this step — they begin cold-syncing '
                                       + 'from peers separately once the install finishes.',
                    cta_done:        'Open dashboard',
                    cta_retry:       'Retry from failed step',
                    cta_working:     'Working…',
                    summary_done:    'Everything is installed. Click Continue to open the dashboard.',
                    summary_error:   'Install failed at one of the steps above. Click Retry to resume '
                                   + 'from where it stopped — completed steps are skipped on retry.',
                    // 0.5.6 audit Session 6 — copy for the refresh-recovery
                    // path. If the operator refreshes at Card 6 BEFORE the
                    // install kicks off, _installInputs is null in-memory;
                    // backend would 412. Frontend now redirects to Card 5
                    // with this notification.
                    refresh_recovery_title: 'Re-confirm install settings',
                    refresh_recovery_body:  'You refreshed before the install started. Confirm your '
                                          + 'settings on the previous step and click Install everything '
                                          + 'again.',
                },
                card_7: {
                    title:           '🎉 Your Council node is live',
                    title_bpos:      '🎉 Your BPoS supernode is ready',
                    // 0.5.27 audit Session 27 — fixed stale pointer.
                    // Pre-0.5.27 referenced "Producer Identity tile" but
                    // that component (producer-identity.js) was dropped
                    // in beta.3.15. The actual dashboard card is "Node
                    // identity" (node-identity-card.js); the row is
                    // labeled "Node public key" with a "Share with
                    // Essentials" pill. Display-name parity: "Main chain"
                    // replaces lowercase "mainchain" raw id.
                    sub:             'All 8 services are installed and starting up. The Dashboard tab '
                                   + 'shows the multi-chain overview where you can watch them '
                                   + 'come online. To earn rewards on Main chain, copy the Node public '
                                   + 'key from the Node identity card and paste it into Elastos '
                                   + 'Essentials when registering as a BPoS supernode.',
                    sub_bpos:        'Main chain is installed and starting up. On the dashboard, the '
                                   + 'Node identity card shows your Node public key — copy that and '
                                   + 'paste it into Elastos Essentials, then register as a BPoS '
                                   + 'supernode to be voted in by the community.',
                    cta:             'Open dashboard',
                },
            },

            // v0.5 reset notes:
            //   - Removed the friendly state vocabulary (healthy_earn,
            //     syncing, stalled, etc.) — those were inferred from
            //     partial backend data and frequently lied. The
            //     post-setup home view is now the technical dashboard,
            //     which renders only fields the API explicitly returns.
            //   - Removed the stat-strip vocabulary (earned/running/peers)
            //     for the same reason: the strip hard-coded a "votes as
            //     proxy for earned ELA" lie. v0.6+ will reintroduce
            //     stats once a real earned-ELA tracker exists.
            //   - Removed the milestone celebrations — they pivoted on
            //     the same fragile inference layer.
            //   - notif.* is preserved because the toast texts are still
            //     used by the proposal pipeline (CRITICAL prompts pop on
            //     top of the dashboard).
            // alpha.28.1 batch 46 — `friendly.notif` (3 keys) and the
            // friendly.settings.section_* / opt_* sub-blocks (~12 keys)
            // dropped. Round-7 i18n audit acbcec6b verified zero JS
            // callers. The settings drawer was rewritten in alpha.13
            // with inline strings; the friendly notification copy was
            // never wired up — the live notification pipeline uses
            // the technical strings under notification.* instead.

            // Errors that surface to the user.
            error: {
                backend_offline:  "Can't reach your node manager",
                backend_offline_sub: "Try refreshing this page in a moment.",
                forbidden:        "Only the owner can manage this node",
                forbidden_sub:    "Sign in as the operator who set up this PC2.",
                generic:          'Something went wrong',
            },
        },

        app: {
            // alpha.28.1 batch 47 — title / connecting / reconnecting
            // dropped. The PC2 window chrome shows the app name (see
            // technical-view.js:155 comment); the spinner text is
            // static in index.html:115 and the reconnecting state
            // surfaces via inline pills in chain-card and log-viewer.
            // Round-7 i18n audit acbcec6b.
            backendUnreachable: 'ENM backend unavailable',
            backendHelp:
                'The ENM extension inside pc2-node is not responding. Reload to retry. '
                + 'If this keeps happening, ask whoever manages your PC2 server to check '
                + 'the pc2-node service is running.',
            // alpha.28.1 — offline override surfaced by app._showError when
            // navigator.onLine === false. Kept in the same family so the
            // copy can move together when localised.
            offlineTitle: 'You appear to be offline',
            offlineHelp: 'Your browser reports no network connection. Reconnect and click Retry.',
            unauthenticatedHelp:
                'Your PC2 session has expired. Reload the dashboard and sign in again.',
            forbiddenHelp:
                'This PC2 node has a different owner. Only the operator who claimed this '
                + 'node can manage chains.',
            generic_error: 'Something went wrong',
            // alpha.28.1 batch 40 — error pane recovery buttons +
            // skip-link text. index.html ships English defaults; app
            // boot replaces them with these keys when strings.js loads.
            retry:      'Retry',
            reload:     'Reload page',
            skip_link:  'Skip to main content',
            // alpha.28.1 batch 80 (Round-22 finding #4) — spinner-text
            // initial boot label. index.html ships the English literal
            // ("Connecting to Node Manager…"); the app boot replaces it
            // with this key once strings.js loads. Matches the existing
            // retry/reload/skip_link pattern.
            connecting: 'Connecting to Node Manager…',
            // alpha.29 batch 98 — offline/recovery banner strings used
            // by the EnmOnlineWatcher service. Falls back to hardcoded
            // English inside the service if strings.js missed loading.
            offline_banner:  'You appear to be offline. The dashboard will refresh when your connection returns.',
            offline_retry:   'Retry now',
            online_restored: 'Connection restored. Refreshing data.',
        },

        // alpha.28.1 batch 44 — `nav:` namespace dropped (~7 lines).
        // No JS caller references nav.dashboard / nav.logs etc. The
        // top-level tabs were hidden in v0.4 (app.js:467 marks them
        // hidden = true); technical-view's sub-tabs use inline
        // English labels defined in the TABS array, not strings.js.
        // (Round-7 i18n audit acbcec6b.)

        chain_state: {
            healthy:    'Healthy',
            // v0.5.205 — v0.5.203 unified the backend state vocab so chains.js
            // /chains/:id now returns 'synced' for what used to be 'healthy'.
            // Adding the string here so chain-card.js's t('chain_state.' + state)
            // lookup doesn't render '[chain_state.synced]' as literal text. The
            // chain-card.js alive-detection branches were also expanded to treat
            // 'synced' === 'healthy' for backward compat.
            synced:     'Synced',
            // v0.5.207 — chain-card initial state before /chains/:id returns
            // (which can take 5–20s when the chain is busy: eid 100% CPU
            // state-sync, mainchain leveldb compaction). Pre-v0.5.207 the
            // initial chip read "Not configured" then flipped to the real
            // state — operators read the first paint as "chain broken."
            loading:    'Loading…',
            syncing:    'Syncing',
            stalled:    'Stalled',
            stopped:    'Stopped',
            error:      'Error',
            recovering: 'Recovering',
            unconfigured: 'Not configured',
            disabled:   'Disabled',
            // beta.3.83 — Wave D — process alive but RPC not bound yet
            // (typical first ~30s after each chain start). chain-card.js
            // already handles 'starting' state with a hero-spinner.
            starting:   'Starting',
            // beta.3.90 (Wave M2.2) — additional coarse-state buckets
            // surfaced by CouncilOverviewService (lightweight aggregator
            // that doesn't run RPC). The richer healthy/syncing/stalled
            // analysis lives in the per-chain endpoint; overview uses
            // 'running' to mean "alive and past the startup grace window
            // — fine-grained sync state unknown at this layer".
            running:    'Running',
        },

        // beta.3.94 (Wave M2.6) — operator-facing display names for
        // every known chainId. Centralized here so chain-card (M2.4),
        // multi-chain-overview (M2.3), chain-selector, and settings-tab
        // (M2.5) all surface the SAME name. Strings used to live in
        // three CHAIN_DISPLAY_FALLBACK maps spread across the
        // components; M2.6 collapses them into a single source of truth.
        //
        // No ECO entry per H3 — ECO chain is permanently out-of-scope.
        chain_name: {
            mainchain:    'Main chain',
            esc:          'Smart Chain',
            'esc-oracle': 'ESC Oracle',
            eid:          'Identity Chain',
            'eid-oracle': 'EID Oracle',
            pg:           'PG Chain',
            'pg-oracle':  'PG Oracle',
            arbiter:      'Arbiter Service',
            spv:          'SPV Module',
        },

        // beta.3.94 (Wave M2.6) — section labels for the multi-chain
        // overview pane (M2.3) class-grouped sections. Five buckets
        // matching the 5-class taxonomy (plan §2). The '?' bucket is a
        // safety net for unknown/legacy chain ids — used to live in
        // CLASS_LABEL['?'] = 'Other' inside multi-chain-overview.js.
        chain_class_label: {
            // 0.5.70 audit Session 70 — Mainchain → Main chain. Was the
            // last remaining 'Mainchain' spelling in operator-facing
            // strings.js (chain_name.mainchain already used 'Main chain'
            // since Wave M2.6). Operators saw the inconsistency in the
            // Multi-chain overview pane: class section header
            // 'Mainchain' over a row labeled 'Main chain'.
            A: 'Main chain',
            B: 'EVM sidechains',
            C: 'Oracles',
            D: 'Cross-chain',
            E: 'Light clients',
            unknown: 'Other',
        },

        // beta.3.94 (Wave M2.6) — operator-facing labels for the M2.2
        // CouncilOverviewService coarseState values. Distinct from
        // chain_state above which is for the per-chain endpoint's full
        // analysis. Overview values: running / starting / stopped /
        // disabled / unconfigured (server-side enum, no 'syncing' etc).
        // v0.5.203 — unified 7-tier state vocabulary. Both the multi-chain
        // overview pane AND the per-chain dashboard now use CoarseStateDerive
        // on the backend, which returns one of seven values. Frontend pulls
        // labels from this block; both renderers go through the same key
        // namespace so the same chain shows the same label everywhere.
        chain_state_v2: {
            synced:       'Synced',
            syncing:      'Syncing',
            starting:     'Starting',
            stalled:      'Stalled',
            stopped:      'Stopped',
            disabled:     'Disabled',
            unconfigured: 'Not configured',
        },
        chain_state_v2_hint: {
            synced:       'Doing its job — at chain tip (or service is up + dependency healthy).',
            syncing:      'Catching up to the network tip. Block height is advancing.',
            starting:     'Process is up but its RPC isn\'t responding yet (warming up — leveldb open, peer handshakes).',
            stalled:      'Alive but not advancing. Usually means 0 peers or a dead fork — check the chain logs.',
            stopped:      'Enabled in config but not running. Use the Start button or wait for self-heal.',
            disabled:     'Operator-disabled in config. Enable it in Settings to start it.',
            unconfigured: 'Not installed yet. Use the setup wizard to add this chain.',
        },
        overview_state: {
            running:      'Running',
            starting:     'Starting',
            stopped:      'Stopped',
            disabled:     'Disabled',
            unconfigured: 'Not configured',
        },

        // v0.5.237 — static topbar node-mode label (replaces the removed
        // chain selector). Set by PaneRouter from GET /config.
        node_mode: {
            council: 'Council node',
            bpos:    'BPoS node',
        },

        // beta.3.94 (Wave M2.6) — multi-chain overview pane copy.
        overview_pane: {
            title:                'Council overview',
            // Summary line uses {running}/{stopped}/{disabled}/{total}
            // placeholders so locales can reorder.
            summary_no_chains:    'No chains yet.',
            // Operator-facing "section is loading" copy.
            loading:              'Loading Council overview…',
            empty_title:          'No chains configured yet.',
            empty_body:           'Use the setup wizard to install your first chain. Once Main chain is running you can add EVM sidechains, Oracles, and Arbiter from the same wizard.',
            error_title:          'Overview unavailable',
            error_malformed:      'Overview snapshot is malformed.',
            retry:                'Retry',
            // Per-row aria-label "Open <chainName> dashboard".
            row_aria_open:        'Open {chainName} dashboard',
            // SR announcer message after row click.
            announce_switched_to: 'Switched to {chainName}',
            // v0.5.237 — label of the control that returns from a drilled-in
            // per-chain dashboard to the multi-chain overview (Council only).
            back_to_overview:     '← Back to overview',
            // v0.5.238 — "This node" identity card (DAO Council + BPoS status).
            identity: {
                title:              'This node',
                aria:               'This node identity',
                council_label:      'DAO Council',
                bpos_label:         'BPoS',
                not_council:        'Not a Council member',
                council_unbound:    'Not bound to a seat',
                bpos_unregistered:  'Not registered',
                key_label:          'Key',
                addr_label:         'Address',
            },
            // v0.5.239 overview redesign — health headline (one-line node
            // verdict), bulk actions, the hero "Manage" link, and the per-row
            // "Update available" badge. (Added to strings.js in v0.5.240 — the
            // redesign shipped reading these via tFb fallbacks; this makes them
            // localizable. {n} = count of services needing attention.)
            health_healthy:        'All services healthy',
            health_attention_one:  '1 service needs attention',
            health_attention_many: '{n} services need attention',
            health_syncing:        'Syncing',
            bulk_start:            'Start all',
            bulk_restart:          'Restart all',
            manage:                'Manage',
            update_available:      'Update available',
            // v0.5.186 (Council Node UX P2.1) — control-center row meta line.
            // {n} = thousands-separated block height; {parent} = parent
            // EVM chain name an Oracle relays for.
            block:                'Block {n}',
            relays_for:           'Relays for {parent}',
            // Honest placeholder shown for an alive chain whose RPC hasn't
            // reported a height yet (never a faked number).
            height_pending:       'height pending…',
            // Sync-state badges — only rendered from a real syncState.
            synced:               'Synced',
            stalled:              'Stalled',
            syncing:              'Syncing',
            // P2.2 — confirm prompt for disruptive quick actions (stop/restart).
            // {action} = stop|restart; {chainName} = display name.
            action_confirm:       'Are you sure you want to {action} {chainName}? In-progress sync work will be interrupted.',

            // ============================================================
            // v0.5.203 — usage cards + per-row metrics for the redesigned
            // multi-chain overview. Pulled from /system/usage (cards) and
            // /council/overview chain entries' `processMetrics` + `peers`
            // + `lastHeightAdvanceMs` + `networkHeight` + `blocksBehind`.
            // ============================================================
            usage_cards_aria:     'Host usage summary',
            // Card 1 — chain count. {up} = chains currently in synced/syncing/
            // starting state (anything alive). {total} = total enabled chains.
            chains_card_title:    'Chains',
            chains_card_value:    '{up}/{total}',
            chains_card_sub:      '{synced} synced · {syncing} syncing · {other} other',
            // Card 2 — CPU load. {pct} = loadAvg1m / cores × 100 (0-100).
            // {load1} = loadAvg1m, {cores} = cpu cores count.
            cpu_card_title:       'CPU load',
            cpu_card_value:       '{pct}%',
            cpu_card_sub:         'load {load1} on {cores} cores',
            // Card 3 — memory.
            mem_card_title:       'Memory',
            mem_card_value:       '{usedGb} / {totalGb} GB',
            mem_card_sub:         '{usedPct}% used',
            // Card 4 — disk.
            disk_card_title:      'Disk',
            disk_card_value:      '{usedGb} / {totalGb} GB',
            disk_card_sub:        '{freeGb} GB free',

            // Per-row block-height line for class A/B: "Block 1,234 / 5,678 · 4,444 behind"
            block_of:             'Block {h} / {nh}',
            blocks_behind:        '{behind} behind',
            blocks_behind_one:    '1 behind',
            // Peer count chip. {n} = number.
            peers_label:          '{n} peers',
            peers_label_one:      '1 peer',
            peers_label_none:     '0 peers',
            // Process metrics inline.
            metric_cpu:           'CPU {pct}%',
            metric_ram:           'RAM {mb} MB',
            metric_ram_gb:        'RAM {gb} GB',
            metric_fd:            'FD {n}',
            metric_disk:          'disk {mb} MB',
            metric_disk_gb:       'disk {gb} GB',
            // Time-since-last-bump for class A/B (when synced) / class C/D
            // ("last activity"). {age} = formatted age string ("5s", "12m").
            last_height_ago:      'last block {age} ago',
            last_activity_ago:    'last activity {age} ago',
            // Arbiter-specific starting-state subtitle.
            starting_waiting_mainchain_rpc: 'waiting for mainchain RPC…',
            starting_warming_up:  'warming up (RPC binding)…',
            stalled_no_progress:  'no height progress for {age}',

            // ============================================================
            // v0.5.204 — class-aware "what's actually happening" copy for
            // chains in the 'starting' state past the 60s grace window.
            // Backed by CouncilOverviewService.computeStartingReason output:
            //   normal | rpc-not-bound | leveldb-busy | evm-state-sync |
            //   awaiting-parent | normal-slow
            //
            // Pre-v0.5.204: starting chains just showed "warming up (RPC
            // binding)…" forever, leaving operators with no signal whether
            // to wait or intervene. The 2026-05-24 incident: mainchain stuck
            // STARTING for 7+ min while leveldb compacted from a dirty
            // shutdown, and the UI gave no clue that restarting would just
            // restart the compaction.
            // ============================================================
            starting_reason: {
                normal:           'starting up…',
                'rpc-not-bound':  'starting up · RPC server still binding ({elapsed} elapsed)',
                'leveldb-busy':   'leveldb compaction in progress · {elapsed} elapsed (common after a hard restart; can take 5–15 min)',
                'evm-state-sync': 'geth state-sync · downloading chain state from peers ({elapsed} elapsed; can take 1–3 hours on a fresh install)',
                'awaiting-parent': 'waiting for Main chain RPC ({elapsed} elapsed)',
                'normal-slow':    'starting up · {elapsed} elapsed',
            },

            // ============================================================
            // v0.5.204 — sticky banner at the top of the overview pane shown
            // when ANY chain has been in 'starting' state for > BANNER_THRESHOLD
            // seconds (frontend default 120s). Reassures the operator that a
            // long warm-up is expected and tells them NOT to restart anything.
            // ============================================================
            startup_banner: {
                title_one:   '1 chain warming up',
                title_many:  '{n} chains warming up',
                dismiss:     'Dismiss',
                dont_restart: 'Please don\'t restart any chain during warm-up — startup work (leveldb open, state-sync, peer handshake) will start over from scratch.',
                generic_explainer: 'Some chains take longer than others to come up. Watching for progress; nothing to do unless this banner is still here in 30+ minutes.',
                // v0.5.206 — extra context line shown when several chains are
                // warming up simultaneously (typical post-deploy or post-PC2
                // restart pattern: all chains spawn within seconds and all
                // sit in 'starting' for a while).
                post_restart_hint: 'This is the expected pattern after a deploy, PC2 restart, or "Restart all" — every chain comes back at once and the slowest ones (Main chain leveldb open, EVM state-sync) gate the others.',
                // Class-aware appendix lines (shown as bullets under the
                // generic explainer when one or more chains match the
                // condition). {chains} = comma-joined list of display names.
                leveldb_chains:   '{chains}: leveldb compaction is busy. Common after a hard shutdown; can take 5–15 min.',
                state_sync_chains: '{chains}: geth state-sync is downloading chain state from peers. Pre-pivot phase; can take 1–3 hours on a fresh install.',
                rpc_binding_chains: '{chains}: RPC server still binding. Usually completes within 60 seconds of warm-up.',
                awaiting_parent_chains: '{chains}: waiting for Main chain RPC to be reachable.',
            },
        },

        // beta.3.94 (Wave M2.6) — non-mainchain dashboard pane stub
        // (M2.1) copy + per-class settings stub (M2.5) copy. The stub
        // is shown when a chain is selectable but its per-class
        // dashboard / settings layout hasn't shipped yet.
        pane_stub: {
            // Dashboard stub title is "{chainName} dashboard".
            dashboard_title:      '{chainName} dashboard',
            // Per-chain dashboard fallback stub (rare). v0.5.237 — copy
            // updated for the selector-free navigation: the Dashboard tab is
            // the multi-chain overview; clicking a chain row drills in.
            dashboard_body:       'A detailed dashboard for this chain isn\'t ready yet. The Dashboard tab shows every installed chain\'s status in the multi-chain overview — click a chain there to drill into it.',
            // Multi-chain overview stub (shown only when the real
            // EnmMultiChainOverviewPane component fails to load).
            overview_title:       'Multi-chain overview',
            overview_body:        'The multi-chain overview couldn\'t load. This is unexpected — try refreshing the page.',
        },

        // 0.5.136 audit Session 136 — Class B/C/D stub keys dropped.
        // The original beta.3.94 (M2.5) plan was for per-class settings
        // panes to render a "coming in MX.Y" stub before the real layout
        // shipped. By v0.5.x (post-S132), every class's mount handler
        // (_mountEvmSidechainSettings / _mountOracleSettings /
        // _mountArbiterSettings in settings-tab.js) renders a real
        // settings form built from hardcoded English copy, NOT from
        // this namespace. The 7 stub keys (evm_title / evm_body /
        // evm_fallback / oracle_title / oracle_body / arbiter_title /
        // arbiter_body) were reserved for the still-unbuilt "chain-card
        // configure target" pane (S121 comment), but the audit-chain
        // rule (don't design for hypothetical future requirements)
        // says delete now and re-introduce when the pane lands.
        // Class E (SPV) keys are RETAINED — settings-tab.js line 753-762
        // (_mountSpvSettings) DOES wire spv_title / spv_lead / spv_note
        // via _tFb. SPV's design is "nothing to configure", which is a
        // stable operator-honest stub, not a placeholder for future
        // work.
        settings_class_stub: {
            spv_title:      'SPV (light client)',
            spv_lead:       'SPV (Simple Payment Verification) is a wallet/client protocol, not a node mode. Lightweight wallets — like the Elastos Essentials mobile wallet — connect to your Main chain node and use SPV to verify transactions without downloading the full chain.',
            spv_note:       'Your Main chain node already serves SPV clients automatically. There is nothing to configure here, and you can safely ignore this option.',
        },

        chain_actions: {
            start:      'Start',
            stop:       'Stop',
            restart:    'Restart',
            configure:  'Configure',
            // v0.5.240 — overview EVM/mainchain "Update" action button label
            // (added in v0.5.240; the v0.5.239 redesign used a tFb fallback).
            update:     'Update',
            // alpha.28.1 batch 46 — dropped confirm_stop, confirm_restart,
            // cooldown. Round-7 i18n audit acbcec6b verified zero JS
            // callers. The chain-card uses a click-and-busy pattern
            // (enmRunOnce) rather than a confirm() dialog.
            starting:   'Starting...',
            stopping:   'Stopping...',
            restarting: 'Restarting...',
        },

        // 0.5.138 audit Session 138 — 5 dead keys dropped:
        //   - chain_card.height (visual "Height" label never rendered;
        //     only `peers / version / uptime` are wired via the
        //     `['peers','version','uptime'].forEach` loop at
        //     chain-card.js:457; the actual block-height value renders
        //     under primary_label_height instead).
        //   - chain_card.primary_metric_synced / _syncing / _height
        //     (placeholder strings for the big number; chain-card.js
        //     formats the height inline via enmFormatNumber rather
        //     than routing through these templates).
        //   - chain_card.sparkline_aria (the sparkline component sets
        //     its own aria-label inline; this fallback never ran).
        chain_card: {
            version:    'Version',
            peers:      'Peers',
            uptime:     'Uptime',
            primary_metric_off:          '—',
            primary_metric_unconfigured: '—',
            primary_label_height:        'block height',
            // v0.5.212 — was missing → arbiter (class D) card showed
            // literal "[CHAIN_CARD.PRIMARY_LABEL_SPV_HEIGHT]" instead of
            // the height label. Found in v0.5.211 post-deploy audit.
            primary_label_spv_height:        'SPV height',
            primary_label_spv_header_height: 'SPV header height',
            primary_label_off:           'tap power to start',
            primary_label_unconfigured:  'tap to configure',
            // 0.2.0-alpha.4 — caption swap during initial peer
            // handshake. Reassures the operator that the empty
            // "block height: —" state lasts about a minute and
            // resolves itself.
            primary_label_connecting:    'connecting to peers',
            sse_reconnecting:            'Reconnecting…',
            tap_circle_aria:             'Status of {chainName}',
            // beta.3.16 — dynamic aria-label per coarse state. Stopped
            // / error make the circle a real start-button affordance;
            // alive states just announce the role (Stop / Restart are
            // separate, visible buttons).
            tap_circle_aria_start:       'Start {chainName}',
            tap_circle_aria_configure:   'Configure {chainName}',
            tap_circle_aria_running:     '{chainName} status — currently running',
            // Visible caption that appears below the power icon when
            // the chain is stopped, telling the operator the circle
            // is tappable. Hidden in other states.
            tap_to_start_caption:        'Tap to start',
            // alpha.28.1 batch 45 — dropped bpos_* (5 keys) and sync_*
            // (8 keys). The chain-card never renders a "BPoS details"
            // sub-panel and the sync line uses inline copy with
            // enmFormatNumber. (Round-7 i18n audit acbcec6b.)
        },

        system_status: {
            // alpha.15 — labels carry the context that moved out of the
            // value formatters (the "free" / "of N GB" suffixes) so the
            // value text stays narrow and the cell doesn't truncate.
            cpu:        'cpu load',
            mem:        'ram used',
            disk:       'disk free',
            os:         'os',
            uptime:     'uptime',
            // beta.3.15 a11y — visually-hidden region label so screen-
            // reader users get a name for this strip (the strip has no
            // visible heading).
            region_label: 'System status',
        },

        // 0.5.138 audit Session 138 — 3 more dead keys dropped:
        //   - log_viewer.heading (the "Logs" tab label comes from the
        //     top-tab strip in app.js, not from this namespace)
        //   - log_viewer.paused (the auto-resume pill renders inline
        //     English in log-viewer.js — never routed through this key)
        //   - log_viewer.empty (the empty-state copy lives inline in
        //     log-viewer.js too)
        // Only log_viewer.live remains alive — log-viewer.js:437 reads
        // it via `t('log_viewer.live', 'Live')`.
        log_viewer: {
            live:       'Live',
            // alpha.28.1 batch 44 — dropped: connection_lost,
            // filter_placeholder, level_all/info/warn/error. No JS
            // caller; the filter UI was never built and the
            // connection-lost state surfaces via the inline pill
            // string in log-viewer.js:91 ('reconnecting…').
            // (Round-7 i18n audit acbcec6b.)
        },

        // alpha.28.1 batch 43 — `wizard:` namespace dropped (~50 keys).
        // The v0.4 "Welcome Home" rewrite replaced the 9-step wizard
        // with setup-conversation; the strings sat orphan ever since.
        // Round-7 i18n audit (acbcec6b) verified zero JS callers.
        // Batch 29 already deleted the matching CSS cluster.

        notification: {
            // 0.5.137 audit Session 137 — visible-text severity_* keys
            // dropped (severity_info / severity_warning / severity_critical
            // / severity_healing). Zero references anywhere in the tree —
            // neither literal `notification.severity_info` nor dynamic
            // `'notification.severity_' + sev`. The visible toast badges
            // get their text from the inline notification body / CSS-
            // driven colour stripe, not from a translated severity label.
            // The sr_* variants below ARE alive — notifications.js:396
            // constructs `'notification.sr_' + sev` for the SR-only
            // prefix (per alpha.28.1 batch 38).
            sr_info:     'Notice',
            sr_warning:  'Warning',
            sr_critical: 'Critical',
            sr_healing:  'Action needed',
            dismiss: 'Dismiss',
            ack: 'Acknowledge',
        },

        proposal: {
            heading:           'Confirmation needed',
            cooldown_pending:  'Hold {seconds}s before confirming...',
            confirm_label:     'I understand: {summary}',
            confirm_button:    'Confirm',
            reject_button:     'Reject',
            reject_reason_placeholder: 'Optional reason',
            // alpha.28.1 batch 37 — anti-snipe input label moved from
            // inline English. Both placeholder + aria-label use the
            // same string for visible/AT parity.
            anti_snipe_label:  'Anti-snipe password',
            // 0.5.59 audit Session 59 — dropped 3 orphan i18n keys
            // (expired / executed / rejected). Full-tree grep across
            // components/, services/, app.js, utils.js, api.js found
            // zero consumers, including dynamic key lookups of the
            // form t('proposal.' + status). The proposal modal only
            // renders pending proposals; settled-state UI lives in
            // audit-tab.js (Session 16) which has its own decision-
            // column labels and never reads these.
            // alpha.28.1 batch 69 — fallback when both summary_action
            // and summaryAction are absent on the proposal payload.
            // Prevents the ack-checkbox ceremony from silently
            // degrading to "I understand: " with a blank trailing
            // value, and the post-action notification from posting
            // an empty body.
            fallback_action:   'this operation',
        },

        owner: {
            forbidden: 'Only the node owner can perform this action.',
            unauthenticated: 'Authentication required',
        },

        common: {
            close: 'Close',
            loading: 'Loading...',
            // alpha.28.1 — referenced by enmRunOnce labels in settings-tab
            // save handlers and by validator-registration-card's activate
            // failure branch via `t('common.failed')`; previously slipped
            // through enmT and only survived because of `|| 'Saving…'`
            // fallbacks scattered through callers.
            saving: 'Saving…',
            failed: 'Failed',
            // alpha.28.1 batch 76 — "Done" transient button label used
            // by technical-view's _runMaintenance success branch (1.5s
            // flash before reverting to the original "Run" label).
        },

        settings: {
            heading_network: 'Network',
            heading_advanced: 'Mainchain Advanced',
            // 0.5.35 audit Session 35 — dropped orphan heading_general
            // i18n key. Only consumer was _buildGeneralSection_DEAD,
            // also removed this session.
            // 0.5.139 audit Session 139 — dropped 5 dead pre-Phase-1-IA
            // Network section keys: ip_label, ip_mode_auto, ip_mode_manual,
            // ip_help, ip_save_btn. The beta.3.18 Phase 1 IA reshape (5
            // task-oriented sections) rebuilt the Network section's labels
            // inline with English strings + makeFormRow help text; only
            // ip_detect_btn (alive — 1 hit) and the ip_detecting / ip_detected
            // / ip_detect_failed / ip_detect_unknown result strings (all
            // alive) survived from this block.
            ip_detect_btn:    'Detect now',
            // alpha.28.1 batch 85 (Round-25 finding #1) — Detect-now
            // result text moved out of inline English. The four states
            // mirror _detectIp's promise paths:
            //   detecting     → before the GET resolves
            //   detected      → ok+ip path
            //   detect_failed → ok=false path or .catch with a reason
            //   detect_unknown→ ok=false with no reason / generic error
            ip_detecting:     'Detecting…',
            ip_detected:      'Detected: {ip}',
            ip_detect_failed: 'Detection failed: {reason}',
            ip_detect_unknown:'unknown',
            // alpha.28.1 batch 85 (Round-25 finding #2) — client-side
            // validation parity for the Network save path. Sibling
            // handlers _saveAdvanced/_saveGeneral validate before the
            // PUT; _saveNetwork was the outlier letting the manual-mode
            // empty value reach the backend.
            err_ip_required:  'Enter an external IP or hostname (or switch to Auto-detect).',
            rpc_white_invalid:      'Not a valid IPv4 or CIDR (try 192.168.1.5 or 192.168.1.0/24).',
            saved:            'Saved.',
            save_failed:      'Save failed: {error}',
            // alpha.28.1 batch 36 — three validation error messages
            // previously inline-English in settings-tab._saveAdvanced /
            // _saveGeneral. Moved into strings.js so a locale swap
            // covers them.
            err_memory_range: 'Memory limit must be between 512 MB and 32 GB.',
            err_rpc_user:     'RPC user must be letters and numbers only (no spaces or symbols).',
            err_retention:    'Audit retention must be between 0 and 3650 days (0 keeps audit logs forever).',

            heading_danger:    'Danger zone',
            danger_intro:      'Permanently wipe this app and all its data from your PC2.',
            // 0.5.139 audit Session 139 — dropped 6 dead pre-Phase-1-IA
            // wipe-surface keys: danger_confirm_h, danger_confirm_ph,
            // danger_wipe_btn, danger_in_progress, danger_done, danger_failed.
            // The Beta 3 Danger Zone redesign (S40) split wipe into 4
            // separate cards (update / chain-resync / uninstall / nuke);
            // each card builds its own typed-confirm UI with inline copy
            // via _buildTypedConfirm / _buildDangerCard helpers in
            // settings-tab.js:1693-1748. None of the old single-wipe
            // strings are reachable.

            // beta.3.18 — Phase 1 IA reshape. The 3-section schema-dump
            // (Network / Mainchain Advanced / General) became 5 task-
            // oriented sections (Access / Security / Network / Storage /
            // Advanced). New copy throughout to explain WHY each knob
            // matters to a BPoS supernode operator, not just WHAT it
            // writes. See project_settings_phase_plan in memory.
            heading_access:   'Access',
            heading_identity: 'Identity',
            heading_security: 'Security',
            heading_storage:  'Storage',
            // Per-section one-line intros rendered as help under the heading.
            access_intro:     'Allow specific tools to reach this node’s JSON-RPC. Loopback (127.0.0.1) is always allowed so ENM itself can talk to ela.',
            security_intro:   'Defense-in-depth for your node — both BPoS supernode and CR Council operators benefit.',
            network_intro:    'How DPoS peers reach this node. Set once at first boot; only change if your public IP moves.',
            storage_intro:    'How much history ENM keeps locally before pruning.',
            advanced_intro:   'Runtime tuning for the ela chain process. Defaults are correct for almost every operator.',
            // Advanced warning banner — operator chose option (b): always
            // visible at the bottom of Settings with this banner above the
            // controls explaining the risk of changing them.
            advanced_warn_title: 'Don’t change these unless you know why.',
            advanced_warn_body:  'Defaults are right for almost every operator — BPoS supernode and CR Council alike. Changing these can degrade chain performance or cost you blocks. Each change here needs a chain restart to apply.',
            // "What this protects" callouts surfaced inside the Security
            // section so operators understand the WHY behind the toggle/
            // password they’re configuring.
            anti_snipe_what:        'What this protects',
            anti_snipe_what_body:   'High-stakes healing actions (restart-on-crash, reactivate producer, rebootstrap chain) won’t execute without this password — even if your owner token leaks. A leaked-token attacker could only do safe read actions.',
            healing_what:           'What this controls',
            healing_what_body:      'When ENM detects a known-safe issue (process crashed, log file too big, RPC unresponsive), it can fix it without asking. Off = every action waits for your explicit OK.',
            critical_ack_what:      'What this controls',
            critical_ack_what_body: 'Slashing-risk alerts (sync drift, peer drop, BPoS state change) stay visible until you click to dismiss. Off = critical events auto-clear after 5 seconds like normal toasts.',
            // Restart modal — fired after a save when the section requires
            // a chain restart for the change to take effect. Operator option
            // (3): don’t put lifecycle controls in Settings, but surface a
            // restart prompt when one is needed.
            restart_modal_title:      'Restart mainchain to apply',
            restart_modal_body:       'Your changes are saved, but the running node still uses the old values. Restart the chain now to apply them.',
            restart_modal_now:        'Restart now',
            restart_modal_later:      'Restart later',
            restart_modal_restarting: 'Restarting…',
            restart_modal_done:       'Mainchain restarted.',
            restart_modal_failed:     'Restart failed: {error}',
            restart_modal_chain_stopped: 'The chain isn’t currently running, so there’s nothing to restart. Your settings will apply on next start.',
            // Migration of hardcoded English strings flagged by the
            // settings inventory audit. Same wording, just routed through
            // the i18n layer.
            nav_label_config:               'Configuration',
            // v0.5.245 — nav-rail group subheaders (BL-2). Visual grouping
            // only; the sections themselves are unchanged.
            nav_group_node:                 'Node',
            nav_group_network:              'Network & sidechains',
            nav_group_maintenance:          'Maintenance',
            nav_group_danger:               'Danger zone',
            rpc_user_tooltip:               'Letters and numbers only (no spaces or symbols).',
            rpc_password_placeholder_set:   '(leave blank to keep current)',
            rpc_white_add_placeholder:      'add IP or CIDR…',
            anti_snipe_placeholder_unset:   'unset · type a new password to set',
            anti_snipe_placeholder_set:     'set · type a new password to change',
            anti_snipe_set_btn:             'Set password',
            anti_snipe_clear_btn:           'Clear',
            anti_snipe_min_length:          'Password must be at least 8 characters.',
            anti_snipe_saved:               '✓ Anti-snipe password set',
            anti_snipe_clear_confirm:       'Disable anti-snipe password? Healing proposals that require it will fail until you set a new one.',
            anti_snipe_cleared:             '✓ Anti-snipe disabled',
            revert_btn:                     'Revert',

            // beta.3.19 — Phase 2 Alerts section. Operator-tunable
            // thresholds that drive HealthChecker's F3/F4/F5 detectors.
            // No restart needed — HealthChecker picks the new values
            // up on its next _loadConfigSafe tick (≤5 s).
            heading_alerts:           'Alerts',
            alerts_intro:             'When the dashboard should warn you. These thresholds drive the health detectors that decide what counts as a problem worth surfacing.',
            // Disk-space pair (warn comes before critical so the operator
            // reads it in increasing-severity order).
            alerts_disk_warn_label:   'Disk space — warn at',
            alerts_disk_warn_help:    'Show a warning when free disk on the chain data dir drops below this. Default 20 GB.',
            alerts_disk_critical_label: 'Disk space — critical at',
            alerts_disk_critical_help:  'Escalate to a critical alert when free disk drops below this. Must be less than the warn value. Default 5 GB.',
            // Peer + sync timers. Both are "grace periods" — how long the
            // bad condition has to persist before the alert fires.
            alerts_peer_grace_label:  'Peer-count alert after',
            alerts_peer_grace_help:   'Wait this long with zero peers before alerting. Short values (1–2 min) catch real network issues fast but trip during normal handshake flutter. Default 5 min.',
            alerts_sync_grace_label:  'Sync-stall alert after',
            alerts_sync_grace_help:   'Alert when block height hasn’t advanced for this long despite peers being connected. Default 10 min — well above the ~2-minute block cadence on mainnet.',
            // Inline validation errors.
            alerts_err_disk_warn:     'Disk-warn threshold must be between 10 and 10,000 GB.',
            alerts_err_disk_critical: 'Disk-critical threshold must be between 1 and 10,000 GB and strictly less than the warn threshold.',
            alerts_err_peer_grace:    'Peer-zero grace must be between 1 and 120 minutes.',
            alerts_err_sync_grace:    'Sync-stall grace must be between 1 and 240 minutes.',

            // beta.3.20 — Phase 3 Storage section expansion. Two
            // operator-tunable policies (log retention + keystore
            // backup interval) drive the EnmStorageMaintenance 24h
            // cron. No manual buttons (operator directive #4 — "no
            // manual, everything automatic"). The section also shows
            // a read-only disk-usage breakdown + last-backup info.
            storage_disk_label:       'Disk usage on this server',
            storage_disk_help:        'Live snapshot. Auto-refreshes when you open this section.',
            storage_disk_chain_data:  'Chain data',
            storage_disk_logs:        'Logs',
            storage_disk_audit:       'Audit log',
            storage_disk_backups:     'Backups',
            storage_disk_total:       'Total',
            // 0.5.139 audit Session 139 — storage_disk_loading and
            // storage_disk_failed dropped. settings-tab.js's
            // _refreshStorageUsage paints these states inline with em-dash
            // placeholders ('…' during load, '—' on failure) rather than
            // routing through these keys.
            // Log retention.
            storage_log_gzip_label:   'Compress old logs after',
            storage_log_gzip_help:    'Closed log files older than this get gzipped in place. Default 7 days.',
            storage_log_retention_label: 'Delete old logs after',
            storage_log_retention_help:  'Compressed *.log.gz files older than this are removed automatically. Must be greater than the compress-age. Default 30 days.',
            // Keystore backup.
            storage_backup_section_label: 'Keystore auto-backup',
            storage_backup_section_help:  'ENM copies your keystore.dat to a separate backup directory on a fixed schedule. No action needed — restore is just copying the .dat back into place if the install is ever lost.',
            storage_backup_interval_label: 'Backup every',
            storage_backup_interval_help:  'Auto-backup cadence. The job runs on a 24-hour timer; it backs up only when this many days have passed since the last copy. Default 7 days.',
            storage_backup_keep_label:   'Keep latest',
            storage_backup_keep_help:    'How many backup copies to retain. Older copies are deleted automatically. Default 4.',
            storage_backup_status_label: 'Status',
            storage_backup_last:         'Last backup: <strong>{when}</strong> at <code>{path}</code>',
            storage_backup_last_never:   'No automatic backup yet. The next 24-hour cycle will create one.',
            storage_backup_no_keystore:  'No keystore on disk yet. Auto-backup will start once you finish the setup wizard.',
            storage_backup_dir_hint:     'All backups live in <code>{dir}</code>. Restore by copying a .dat back into the keystore path.',
            // Validation errors.
            storage_err_log_gzip:       'Log compress-age must be between 1 and 365 days.',
            storage_err_log_retention:  'Log retention must be between 1 and 3,650 days and greater than the compress-age.',
            storage_err_backup_interval:'Backup interval must be between 1 and 90 days.',
            storage_err_backup_keep:    'Backup keep-count must be between 1 and 50.',
            // Time-ago.
            storage_relative_just_now:  'just now',
            storage_relative_minutes:   '{n} min ago',
            storage_relative_hours:     '{n} h ago',
            storage_relative_days:      '{n} d ago',

            // beta.3.21 — Phase 4: Healing visibility. Sits inside the
            // Security section, below the auto-execute-safe-healing
            // toggle. Two panels:
            //   1. "What auto-runs" — list of AUTOMATED_SAFE rules.
            //   2. "Recent activity" — last N rows from GET /healing/history.
            // No manual-trigger buttons (operator directive #4 —
            // everything stays automatic).
            healing_rules_heading:        'What auto-runs',
            healing_rules_help:           'These are the healing actions ENM is allowed to run on its own when the toggle above is on. Anything not on this list waits for the operator to confirm.',
            healing_rules_load_failed:    'Couldn’t load the rule list.',
            // 0.5.139 audit Session 139 — dropped 5 dead keys:
            //   healing_rules_owner_heading + _owner_help
            //   healing_rules_critical_heading + _critical_help
            //   healing_activity_help
            // The beta.3.23 redesign collapsed the 3-stacked-groups layout
            // into a flat dotted list with a single help paragraph
            // (healing_rules_help above + the per-tier summary line built
            // dynamically in _paintHealingRules at settings-tab.js:2862).
            // healing_activity_help was rendered as a third explanatory
            // paragraph but was dropped when the activity panel collapsed
            // into the <details> summary count line.
            healing_activity_heading:     'Recent healing activity',
            healing_activity_empty:       'No healing activity yet. The list will populate as ENM detects and acts on issues.',
            healing_activity_load_failed: 'Couldn’t load activity. Retrying.',
            // beta.3.78 — settings.snapshot_* string keys removed with
            // the snapshot UI panel.
            healing_activity_col_when:    'When',
            healing_activity_col_rule:    'Rule',
            healing_activity_col_action:  'Action',
            healing_activity_col_outcome: 'Outcome',
            // Status badges on the activity rows.
            healing_status_executed:      'executed',
            healing_status_approved:      'approved',
            healing_status_rejected:      'rejected',
            healing_status_expired:       'expired',
            healing_status_pending:       'pending',
            healing_status_failed:        'failed',
            // Tier badges (matches the chain’s tier names).
            healing_tier_auto:            'auto',
            healing_tier_owner:           'owner',
            healing_tier_critical:        'critical',
            // 0.5.139 audit Session 139 — healing_tier_manual dropped. The
            // 4-tier label set was consolidated to 3 in the beta.3.23
            // chain-tier rename (NEVER_AUTOMATIC + CRITICAL_NOTIFY both
            // bucket under healing_tier_critical at _paintHealingRules
            // line 2865). No caller references 'manual' for the tier
            // summary count line.

            // beta.3.33 — Danger Zone. Four destructive actions backed
            // by /api/enm/maintenance/*. The copy here is operator-
            // facing: short labels on buttons, longer explanations in
            // help text so an operator pressed for time can scan the
            // titles, and one who's about to type the confirmation
            // word has the consequences in front of them.
            heading_danger:                 'Danger Zone',
            danger_intro:                   'Destructive actions. Each one has a typed-confirmation gate. There is no undo. To remove ENM entirely from PC2, right-click the ENM tile on the PC2 desktop and choose Uninstall — these in-app controls operate on data only.',

            // Update card (least destructive — top of section).
            danger_update_title:            'Update ENM',
            danger_update_help:             'Install the latest ENM extension from GitHub. Your chain data, keystore, and settings are preserved — only the extension code is replaced. The chain restarts after the new version comes up.',
            danger_update_current_label:    'Current',
            danger_update_latest_label:     'Latest available',
            danger_update_btn:              'Update now',
            danger_update_uptodate:         'You are running the latest version.',
            danger_update_available:        'A newer version is available.',
            danger_update_error:            'Update check failed:',
            danger_update_confirm_dialog:   'Install the latest ENM version? The chain will restart automatically and may briefly disconnect.',
            danger_update_in_progress:      'Update in progress — ENM will restart in a few seconds…',
            danger_update_queued:           '✓ Update queued. Reload this page after ~30 seconds to see the new version.',

            // Chain resync card — v0.5.232 mode-aware (BPoS vs Council).
            // The card paints differently based on the operator's setupRole:
            // BPoS gets a single "Resync mainchain" button; Council gets a
            // checkbox list across {mainchain, esc, eid, pg}. Shared copy
            // (title/help/status) is generic; mode-specific keys layer on.
            danger_resync_title:            'Resync chain data',
            danger_resync_help:             'Wipe one or more chains and re-sync from the network. Your keystore and node identity are preserved. Use this if a chain is stuck, corrupted, or has forked off the network. A full re-sync from genesis can take 4–8 hours per chain.',
            danger_resync_in_progress:      'Wiping chain data, restarting…',
            danger_resync_ok:               '✓ Chain data wiped. Re-sync started — may take 4–8 hours.',
            danger_resync_no_selection:     'Pick at least one chain to resync.',

            // v0.5.232 — BPoS variant (single mainchain).
            // v0.5.234 — branding pass: "ELA mainchain" → "Main chain" +
            // "Resync mainchain" → "Resync Main chain" for parity with the
            // rest of the app. Typed-confirm value stays the literal
            // chainId "mainchain" because the backend gate matches that
            // exact lowercase token.
            danger_resync_bpos_help:        'BPoS supernodes only run the Main chain — confirm to wipe its data and resync from peers.',
            danger_resync_bpos_confirm_label: 'Type "mainchain" to confirm:',
            danger_resync_bpos_btn:         'Resync Main chain',

            // v0.5.232 — Council variant (multi-chain).
            danger_resync_council_help:     'Council nodes run four chains with on-disk data. Tick the ones you want to wipe (default all), then type RESYNC to confirm. Each chain wipes serially — total time scales linearly with selection.',
            danger_resync_council_confirm_label: 'Type RESYNC (uppercase) to confirm:',
            danger_resync_council_btn:      'Resync selected chains',

            // v0.5.232 — Reset ENM (the single in-app full wipe).
            // Replaces the retired uninstall + nuke + identity/reset cards.
            // Wipes ALL data but KEEPS the bundle installed, so the wizard
            // reappears in place when ENM respawns — fixes the historical
            // "another pc2 inside the app" bug where the orphaned iframe
            // loaded the pc2 desktop root after a full uninstall.
            danger_reset_title:             'Reset ENM (full wipe)',
            danger_reset_help:              'Wipes ALL data — chain databases, keystore, node identity, settings, audit log, healing history — and restarts ENM with the setup wizard. The app stays installed in PC2; this page reloads automatically. There is no undo.',
            danger_reset_warning:           'This deletes your keystore + node identity. If you re-register afterwards — as a BPoS supernode (producer-register TX) or rebind a CR Council seat (CRCouncilMemberClaimNode TX) — you do so with a new node identity (a different public key). Any stake delegated to your current OwnerPublicKey remains under your control in Elastos Essentials regardless of what happens to this node.',
            danger_reset_confirm_label:     'Type RESET EVERYTHING (uppercase) to confirm:',
            danger_reset_btn:               'Reset ENM',
            danger_reset_in_progress:       'Wiping data — ENM will restart in a few seconds…',
            danger_reset_queued:            '✓ Reset queued. ENM will restart and reload this page in ~6 seconds. The setup wizard will reappear.',

            // v0.5.228 — EVM chains (shared settings). Operator directive
            // 2026-05-27: shared settings across esc/eid/pg should live in
            // one place. This section reads from all 3 EVM chains in
            // parallel, surfaces shared values when all 3 match (and
            // flags divergence when they don't), and writes back to all
            // 3 chains via PUT /chains/:id/class-b-config in one click.
            heading_evm_shared:                 'EVM chains',
            evm_shared_intro:                   'Shared settings across all three EVM sidechains (esc, eid, pg). Per-chain overrides (bootnodes, ports, EVM account) live in each chain’s own detail view.',
            evm_shared_reward_title:            'Block reward address',
            evm_shared_reward_help:             'Operator address that receives EVM block rewards (geth flag --pbft.miner.address). On a Council node this is typically the same address on all three sidechains, but you can diverge per-chain from the chain’s own card.',
            evm_shared_reward_placeholder:      '0x… (40 hex characters)',
            evm_shared_reward_loading:          'Reading current value from all three chains…',
            evm_shared_reward_shared:           '✓ Same on all three chains.',
            evm_shared_reward_diverged:         '⚠ Diverged across chains: {summary}. Editing here overwrites all three.',
            evm_shared_reward_unset:            'No reward address set on any chain. Setting one here applies to all three.',
            evm_shared_reward_apply_btn:        'Apply to all three EVM chains',
            evm_shared_reward_apply_progress:   'Applying — {done} of 3 done…',
            evm_shared_reward_apply_ok:         '✓ Saved on all three. Restart any running chain to apply.',
            evm_shared_reward_apply_partial:    '⚠ Saved on {okCount} of 3. Failed: {failed}.',
            evm_shared_reward_validation_err:   'Not a valid Ethereum address. Need 0x + 40 hex characters.',
            evm_shared_reward_eip55_err:        'EIP-55 checksum mismatch. Suggested correct form: {suggested}',
            evm_shared_mining_title:            'Validator status (per chain)',
            evm_shared_mining_help:             'Derived from the on-chain CR-Council / DPoS arbiter slate, not from operator setting. Mining activates automatically when this node\'s public key is bound to a Council seat (via Elastos Essentials) and the chain\'s current rotation includes it. ENM re-checks on every chain start.',
            // v0.5.228d (audit F9) — evm_shared_mining_summary
            // ("{onCount} on, {offCount} off") was orphaned by the
            // v228 inline rewrite of _fillEvmShared; every caller now
            // builds the status text from plain-English literals
            // (validator/follower wording, no "on/off" template).
            // Removed.
            evm_shared_sync_title:              'Sync mode',
            evm_shared_sync_help:               'How geth catches up to the chain tip. ‘full’ re-executes every transaction from genesis — validator-grade and the default for Council nodes. ‘archive’ additionally retains every historical state (much larger disk). (Fast sync was removed in v0.5.235.)',
            evm_shared_sync_shared:             '✓ All three chains on ‘{mode}’.',
            evm_shared_sync_diverged:           '⚠ Diverged: {summary}',
            evm_shared_sync_apply_btn:          'Apply to all three',
            // v0.5.237 — per-chain peers/bootnodes accordion in the
            // consolidated Sidechain settings tab.
            evm_shared_peers_title:             'Peers & bootnodes',
            evm_shared_peers_help:              'Bootnodes are per chain — open a chain below to view and edit its peer list. Use this if a sidechain is stuck at 0 peers; new bootnodes are dialled immediately when the chain is running.',
            evm_shared_perchain_footer:         'Ports, binary version, and the EVM account address are managed automatically. Mining is derived on-chain (no manual toggle). A chain’s live status and Start / Stop / Restart / Resync controls are on its dashboard card.',

            // v0.5.228 — Staged chain resume. Gated behind a Danger Zone
            // enable/disable toggle (operator directive 2026-05-26: the
            // staged-start orchestrator is destructive and must require
            // explicit opt-in, not auto-reveal based on host detection).
            danger_stage_title:             'Staged chain resume',
            danger_stage_help:              'Starts your chains one at a time, waiting for each to reach Synced before starting the next. Use this only on a constrained host where running all chains together saturates CPU. A full pass can take several hours.',
            danger_stage_warn:              'Destructive: while this runs, the host is intentionally pinned at near-full CPU for hours. Do not use on a host you also need responsive for other workloads.',
            danger_stage_enable_label:      'Allow staged chain resume',
            danger_stage_enabled_sub:       'On — controls below are unlocked.',
            danger_stage_disabled_sub:      'Off — staged resume is locked and cannot be started.',
            danger_stage_start_btn:         'Start staged resume',
            danger_stage_pause_btn:         'Pause after current chain',
            danger_stage_resume_btn:        'Resume',
            danger_stage_cancel_btn:        'Cancel',
            danger_stage_idle:              'Idle. Click Start to begin.',
            danger_stage_locked:            'Enable the toggle above to unlock these controls.',
            danger_stage_phase_starting:   'Starting {chain}…',
            danger_stage_phase_waiting:    'Waiting for {chain} to sync ({minutes}m elapsed)…',
            danger_stage_phase_synced:     '✓ {chain} synced. Next: {next}',
            danger_stage_phase_timeout:    '⚠ {chain} did not sync within 4h — moved to next chain. Check logs.',
            danger_stage_phase_complete:   '✓ Staged resume complete. All chains processed.',
            danger_stage_phase_paused:     'Paused after current chain. Click Resume to continue.',
            danger_stage_phase_resumed:    'Resumed.',
            danger_stage_phase_cancelled:  'Cancelled.',
            danger_stage_phase_error:      '✗ Error: {message}',
            danger_stage_helper_missing:    'Staged-resume helper failed to load. Refresh the page.',

            // beta.3.43 — Identity tab. Five cards: current identity
            // view, unlock-and-cache, backup, import, reset.
            identity_intro:                 'Your node’s consensus-signing identity (the keystore) and the on-chain producer it’s bound to. Reset, restore, or back up here.',

            identity_current_title:         'Current identity',
            identity_current_help:          'What this node signs DPoS messages with. Share the public key with Essentials; never share the keystore.',
            identity_pubkey_label:          'Node public key',
            identity_address_label:         'Node signing address',
            identity_producer_label:        'On-chain status',
            identity_producer_unregistered: 'Not registered yet',

            identity_unlock_title:          'Unlock & cache identity',
            identity_unlock_help:           'A keystore exists on disk but we can’t see its public key without the password. Enter the password you saved during setup to refresh the cached identity — the password is not stored.',
            identity_unlock_label:          'Keystore password',
            identity_unlock_placeholder:    'enter password',
            identity_unlock_btn:            'Unlock',
            identity_unlock_ok:             '✓ Identity cache refreshed.',

            identity_backup_title:          'Backup keystore',
            identity_backup_help:           'Download the encrypted keystore.dat. Keep this off the server with the password you saved — together they’re the only way to recover this producer if the server dies.',
            identity_backup_btn:            'Download backup',
            identity_backup_running:        'Preparing download…',
            identity_backup_ok:             '✓ Downloaded {name}',

            identity_import_title:          'Restore from backup',
            identity_import_help:           'Replace the current keystore with one you backed up earlier. We validate the password before swapping.',
            identity_import_file_label:     'Backup file (keystore.dat)',
            identity_import_password_label: 'Backup password',
            identity_import_password_placeholder: 'password for the file above',
            identity_import_confirm_label:  'Type "import" to confirm:',
            identity_import_btn:            'Restore keystore',
            identity_import_no_file:        'Pick a backup file first.',
            identity_import_confirm_dialog: 'Replace the current keystore with this backup? The current one is auto-archived.',
            identity_import_running:        'Validating and swapping keystore…',
            identity_import_ok:             '✓ Keystore restored from backup.',

            // v0.5.232 — identity_reset_* keys dropped along with the
            // standalone "Reset keystore" card. The unified Settings →
            // Reset ENM flow handles full reset (keystore + chain data
            // atomically). Keys lived here originally for the dedicated
            // card's title / help / confirm-label / btn / running /
            // ok / password_warning copy — preserved in git history.

            identity_password_required:     'Password is required.',

            // beta.3.46 — Server integrity sub-card. Quiet by default;
            // operator clicks "Run check" to expand details. Honest
            // about scope (tamper-EVIDENCE not tamper-PROOF; can't
            // see hypervisor-level threats).
            identity_integrity_title:       'Server integrity',
            identity_integrity_help:        'Checks for changes to the ela binary, the keystore, and the host environment since this install. Run this if you want to know whether anything has shifted under your feet.',
            identity_integrity_collapsed:   'Not run yet. Click Run check to scan.',
            identity_integrity_run_btn:     'Run check',
            identity_integrity_running:     'Running…',
            identity_integrity_summary_ok:      '✓ All checks pass',
            identity_integrity_summary_warn:    '⚠ Drift detected — review the rows below',
            identity_integrity_summary_fail:    '✗ One or more checks failed',
            identity_integrity_summary_unknown: '? Some checks couldn’t run',
            identity_integrity_scope_note:  'Limits: this catches changes to the ela binary, the keystore.dat file, the system clock, and the host environment after install. It can’t see VPS-level threats like live RAM snapshots or pre-install disk images — those are invisible from inside the guest OS. Your owner key in Essentials remains the strongest protection.',
            identity_integrity_rebaseline_btn:      'Re-baseline (mark current state as trusted)',
            identity_integrity_rebaseline_running:  'Re-capturing baseline…',
            identity_integrity_rebaseline_ok:       '✓ Baseline re-captured.',
            identity_integrity_rebaseline_confirm:  'Mark the current state as the new trusted baseline? Use this AFTER you ran a legitimate change (binary update, keystore reset).',
            // beta.3.45 — audited against Elastos.ELA HEAD. Inactivity
            // does NOT slash the deposit (InactivePenalty = 0 on
            // mainnet, common/config/config.go:193). The risk is lost
            // rewards + identity orphaning, recoverable via an
            // Essentials-signed DPoSV2UpdateProducer + ActivateProducer
            // tx. The 200 ELA penalty (DPoSV2IllegalPenalty) only
            // applies for double-sign of consensus messages — a
            // keystore-swapped node can't even produce a valid sig,
            // let alone a double-sig, so this path is N/A. See
            // memory/feedback_enm_bpos_slashing_truth.md for the full
            // line-walk citations.
            identity_slashing_warning:      '⚠ This node is registered as a BPoS producer. Generating or importing a different keystore creates a new node public key that won’t match your on-chain registration, so ela stops being recognized as your producer’s signer. You’ll miss block-production rewards (no deposit penalty — InactivePenalty is 0 on mainnet) until you sign DPoSV2UpdateProducer in Essentials with the new node public key. After ~1440 missed rounds the chain flips the producer to Inactive; recovery from there is ActivateProducer + UpdateProducer in Essentials. Clicking below acknowledges the lost-rewards window.',
        },

        // beta.3.40 — Dashboard BPoS supernode card. Two visual variants
        // matching enm-design-mocks/v2/phase-03-status.html C (active,
        // "bound to this node's signing key") and D (not registered, "no
        // on-chain producer record matches this node's signing key").
        // Pre-3.40 these keys didn't exist in strings.js and validator-
        // registration-card.js was rendering bracketed placeholders.
        bpos_card: {
            // Variant D (not registered).
            head_title_register:        'BPoS supernode: not yet registered',
            head_sub_register:          'No on-chain producer record matches this node’s signing key.',
            chip_action_required:       'Action needed',
            // 0.5.32 audit Session 32 — "validator" → "supernode" for
            // consistency with the rest of bpos_card.* (Elastos uses
            // "supernode" / "producer"; "validator" came from a stray
            // beta.3.x rename that left one string behind).
            cta_help_register:          'To start producing blocks and earn rewards, register your supernode from your Elastos Essentials wallet. ENM will detect the on-chain record once confirmed and start tracking state automatically.',
            view_guide_btn:             'View registration guide',
            copy_pubkey_btn:            'Copy node public key',
            copy_aria:                  'Copy node public key',
            copied:                     'Copied!',
            copy_fail_title:            'Copy unavailable',
            copy_fail_body:             'Browser blocked clipboard access. The key is selected — press Ctrl-C (or ⌘-C on Mac) to copy.',
            signing_key_label:          'This node’s signing key',
            // 0.5.32 audit Session 32 — fixed stale Essentials UI label.
            // Pre-0.5.32 said "Producer Registration form" — that label
            // doesn't exist in Essentials. The actual Essentials form is
            // "Register as new supernode" (verified against
            // essentials_guide_body 10 lines below). Same class of
            // stale-pointer bug as v0.5.27's Card 7 Producer Identity.
            note_after_confirm:         'Paste this into the "Register as new supernode" form in Essentials.',
            // 0.5.138 audit Session 138 — open_essentials_btn dropped.
            // Duplicate of view_guide_btn (same value 'View registration
            // guide') and never referenced. The render path uses
            // view_guide_btn instead.

            // Variant C (active).
            head_title_active:          'BPoS supernode',
            head_sub_active:            'On-chain producer record bound to this node’s signing key.',
            // 0.5.138 audit Session 138 — head_sub_active_narrow dropped.
            // The compact-mode sub-text fallback is rendered inline in
            // validator-registration-card.js, never routed through this
            // key.
            chip_active:                'Active',
            chip_active_rank:           'Active · Rank #{rank}',
            stat_votes:                 'Votes',
            stat_votes_meta:            'Current snapshot',
            stat_inactive_rounds:       'Inactive rounds',
            // 0.5.32 audit Session 32 — "slashing" was inaccurate to
            // Elastos. Verified against mainchain config.go:193
            // (`InactivePenalty: 0, //there will be no penalty in this
            // version`) and the [[feedback_enm_bpos_slashing_truth]]
            // memory: going inactive does NOT deduct deposit on
            // mainnet — the actual risk is LOST REWARDS while the
            // producer is flipped to Inactive. The 200-ELA slash
            // exists only for illegal-evidence (double-sign), which
            // an inactive producer cannot trigger. Copy reflects the
            // truthful risk.
            stat_inactive_rounds_meta_safe: 'Producer earning normally',
            stat_inactive_rounds_meta_warn: 'Approaching forced-inactive — rewards will pause',
            note_active:                'Rewards and voting are managed in Elastos Essentials. ENM tracks on-chain producer status; claim, stake, and update operations require a signed transaction from your wallet.',

            // Variant B (needs activation).
            // 0.5.138 audit Session 138 — head_title_needs_activation /
            // head_sub_needs_activation aliases dropped. The render
            // path only ever consumed the head_title_activation /
            // head_sub_activation pair; the *_needs_activation_*
            // aliases were retained "for clarity" per a beta-era
            // comment but never wired. Also dropped activate_btn_running
            // — chain-card.js handles the busy-state label inline via
            // enmRunOnce's swap callback.
            head_title_activation:      'BPoS supernode: ready to activate',
            head_sub_activation:        'On-chain producer record found. Activate to start signing blocks.',
            chip_ready_to_activate:     'Ready to activate',
            activate_btn:               'Activate supernode',
            activate_ok_title:          'Activation submitted',
            activate_ok_body:           'Wait a block or two for chain confirmation.',
            // v0.5.248 (validator-readiness audit) — these three keys are
            // referenced by _activate() (busy label + the two error-toast
            // titles) but were never defined, so the live activate flow
            // rendered '[bpos_card.activate_btn_active]' etc. as literal
            // bracketed placeholders. Added here; shared by the BPoS and the
            // Council reactivation paths (both call BposCard._activate).
            activate_btn_active:        'Activating…',
            activate_fail_title:        'Activation failed',
            activate_conflict_title:    'Cannot activate yet',

            // Deep-link guide modal copy (variant D's "View registration
            // guide" button). Until the Essentials deep-link integration
            // lands, the button surfaces a notifications.info with
            // step-by-step instructions.
            essentials_guide_title:     'Register your supernode in Elastos Essentials',
            essentials_guide_body:      'Open Elastos Essentials → Wallet → Voting → BPoS supernodes → "Register as new supernode". Paste this node’s public key into the Node Public Key field, sign with the wallet that holds the 2,000 ELA deposit, then wait ~6 blocks (about 12 minutes) for chain confirmation.',
        },

        // v0.5.229 (audit 2026-05-27) — Council-mode parallel to bpos_card.
        // validator-registration-card.js's _renderCouncil() reads these keys
        // when the operator is in a CR Council context (cfg.global.council
        // .installed=true OR /system/identity returns crMember.isCrMember).
        // The card was BPoS-only pre-229; Council operators saw the wrong
        // copy ("BPoS supernode: not yet registered") regardless of their
        // actual on-chain Council binding. Six sub-states map to six head
        // title + head sub pairs:
        //   elected    — on Committee, MemberState=Elected, producing
        //   inactive   — on Committee, MemberState=Inactive
        //   impeached  — on Committee, MemberState=Impeached|Returned|
        //                Terminated|Illegal (terminal-ish)
        //   next_term  — in NEXT term's Committee (waiting term boundary)
        //   unclaimed  — Council install but pubkey not bound to any
        //                current Committee seat (e.g. operator unclaimed
        //                via Essentials)
        //   no_term    — Council install but Committee not currently in
        //                an election period (between terms)
        council_card: {
            head_title_elected:    'CR Council member — On-duty',
            head_sub_elected:      'Your node is in the on-chain CR Committee arbiter slate. EVM sidechain mining + mainchain BPoS signing activate automatically when your slot rotates in.',
            head_title_inactive:   'CR Council member — Inactive',
            // v0.5.248 (validator-readiness audit P1) — corrected. The old
            // copy told operators to "Recover via Essentials → Activate",
            // implying ENM couldn't do it. But ela's ActivateProducer tx
            // reactivates an Inactive CR member and is signed by the NODE
            // public key (activateproducertransaction.go:113/212) — exactly
            // the keystore.dat ENM already manages. So ENM can reactivate
            // in-app, no wallet/owner-key needed. Button wired below.
            head_sub_inactive:     'You are a CR Committee member but on-chain MemberState is Inactive (the chain skipped your slot for too many consecutive rounds). Node Manager can reactivate this for you — it signs the activation with your node key.',
            // Council reactivation CTA (mirrors bpos_card.activate_* but with
            // Council-specific copy). The button reuses BposCard._activate(),
            // which POSTs /chains/mainchain/bpos/activate and shows the shared
            // bpos_card.activate_ok_* / activate_fail_* toasts.
            activate_btn:          'Reactivate Council node',
            activate_explainer:    'Submits an on-chain activation signed with this node’s key (no wallet needed). Your node must be running and fully synced.',
            head_title_impeached:  'CR Council member — Impeached',
            head_sub_impeached:    'Your CR Committee membership has been impeached, terminated, returned, or flagged illegal on-chain. The current term seat is lost; check Essentials for the specific reason and recovery options.',
            head_title_next_term:  'CR Council member — Next term',
            head_sub_next_term:    'You won the next CR Committee election. Your node will enter the arbiter slate when the next term begins.',
            head_title_unclaimed:  'Council install — Not currently bound',
            head_sub_unclaimed:    'ENM detects a Council install but your node’s public key is not currently bound to any CR Committee seat on-chain. If you intend to be a Council member, claim your node via Elastos Essentials (CRCouncilMemberClaimNode TX).',
            head_title_no_term:    'Council install — Committee between terms',
            head_sub_no_term:      'The CR Council is not currently in an election period. No active Committee means no arbiter slots to fill — your node will be added when the next term begins.',
        },

        // 0.5.138 audit Session 138 — entire validator_card namespace
        // dropped (30 keys, ~40 lines). validator_card was the original
        // "Register as a BPoS validator" 3-step wizard card design.
        // Beta 3.40 replaced it with the simpler bpos_card namespace
        // (lines ~1274-1342 above) — see the comment at bpos_card's
        // header explaining the migration. validator-registration-card.js
        // (which still bears the old filename) now reads bpos_card.*
        // keys exclusively; no consumer ever pointed back at
        // validator_card. Also: validator_card.title used the stale
        // "validator" terminology that v0.5.32 (S32 audit) renamed to
        // "supernode" everywhere else in the catalog. The keys were
        // doubly orphaned (wrong namespace AND wrong vocabulary).
        // Total: 30 keys (eyebrow / title / sub / step1_title / step1_help
        // / copy / copied / step2_* / step3_* / field_* / deposit_note /
        // activate_* / copy_aria / copy_fail_*) — all zero references
        // in the tree. If a future surface needs this 3-step wizard
        // shape, resurrect from git history.

        audit: {
            // beta.3.48 — renamed "Audit log" → "Activity" for plain-
            // language clarity. "Audit" sounded like compliance jargon;
            // the page is just a chronological list of things that
            // happened on this node.
            heading:        'Activity',
            // 0.5.138 audit Session 138 — dropped filter_chain /
            // filter_from / filter_to / apply_filter / export_btn.
            // The filter toolbar in audit-tab.js renders its labels +
            // button text inline; none of these keys had any consumer.
            // filter_tier IS kept (2 hits via audit-tab.js — tier
            // chip + filter label).
            filter_tier:    'Kind',
            empty:          'No activity matches these filters.',
            // Default-friendly columns shown to all operators.
            col_when:       'When',
            col_what:       'What happened',
            col_result:     'Result',
            // Technical columns — surfaced only when the "Show technical
            // details" toggle is on. Keep the names short so the wider
            // table still fits on narrow viewports.
            col_ts:         'Timestamp (UTC)',
            col_chain:      'Chain',
            col_rule:       'Rule / Route',
            col_tier:       'Kind',
            col_decision:   'Decision',
            col_executor:   'Who',
            col_outcome:    'Outcome',
            tier_any:       'Any kind',
            filter_when:    'When',
            // v0.5.168 (Phase 4) — re-introduced (Session 138 had dropped
            // filter_chain as orphaned). The audit tab now offers a per-chain
            // scope chip ("All chains" / "<this chain>") that adds chainId= to
            // the /audit query, so these keys have live consumers again.
            filter_chain:   'Chain',
            chain_all:      'All chains',
            copy_filtered:  'Copy filtered rows',
            load_more:      'Load more',
            load_more_capped: 'Cap reached — narrow filters or export to see more.',
            // beta.3.48 — toggle for the technical view.
            show_technical:     'Show technical details',
            hide_technical:     'Hide technical details',
            // beta.3.48 — friendly names for the executor column.
            // beta.3.52 — the executor field is now a role label, not
            // a wallet hex. Possible values: 'operator', 'system',
            // 'F1'/'F2'/'AUTOSTART'/etc. PC2 wallet never appears here
            // anymore (ENM identity = keystore, not PC2 wallet).
            // 0.5.138 audit Session 138 — executor_you dropped per its
            // own inline "legacy key — no longer used" tag.
            executor_system:    'System',
            executor_operator:  'Operator',
            // beta.3.48 — friendly names for the 5 healing tiers.
            // Mock kept the full codes; operator feedback was that
            // they're internal jargon and don't help a regular user.
            tier_label_AUTOMATED_SAFE:  'Auto-fix',
            tier_label_OWNER_CONFIRMS:  'Awaits you',
            tier_label_CRITICAL_NOTIFY: 'Alert',
            tier_label_NEVER_AUTOMATIC: 'Manual',
            tier_label_HTTP_MUTATION:   'Setting change',
            tier_label_CRITICAL_INFO:   'Note',
            // beta.3.48 — friendly outcome groups.
            // beta.3.66 — restructured: only OWNER-CONFIRMS pending
            // proposals show "Awaits you"; everything else routes to
            // Done / Failed / Auto-resolved by the structured decision
            // field, not by pattern-matching the outcome string. The
            // old "Notified" badge was firing for ANY action whose
            // outcome string didn't match success/error patterns —
            // turned routine boots into a wall of alarming red badges.
            outcome_friendly_done:           'Done',
            outcome_friendly_failed:         'Failed',
            outcome_friendly_skipped:        'Skipped',
            // 0.5.138 audit Session 138 — outcome_friendly_noted dropped
            // per its own inline "legacy — kept for back-compat, not
            // emitted by 3.66+" tag. audit-tab.js:1368 was explicitly
            // changed FROM 'noted' to 'done' as the default fallback,
            // and no other caller emits the noted classification.
            outcome_friendly_pending:        'Awaits you',
            outcome_friendly_auto_resolved:  'Auto-resolved',
            outcome_friendly_rejected:       'Rejected',
            outcome_friendly_expired:        'Expired',

            // alpha.28.1 batch 39 — row-count suffix moved from inline
            // English. ICU plurals still deferred (audit-tab.js audit
            // acbcec6b flagged "1 rows" as the cosmetic bug).
            // alpha.28.1 batch 74 (Round-20A audit finding #3) — split
            // singular vs plural so "1 rows" stops being printed. The
            // ICU plural shim is still deferred; for now the audit-tab
            // caller picks between the two keys based on count.
            row_count:      '{n} entries',
            row_count_one:  '{n} entry',
        },

        // v0.5.168 (Phase 2/5) — SPV Module pane (components/spv-module.js).
        // SPV (class E) is embedded in the EVM sidechains + the arbiter; this
        // pane aggregates getspvheight + per-sidechain getsidechainblockheight
        // and tails each sidechain's on-disk logs-spv on demand.
        //
        // v0.5.200 relabel — the per-sidechain `getsidechainblockheight` value
        // is NOT a SPV height (it is the arbiter's per-block-walk processing
        // position for cross-chain transactions). The previous "Sidechain SPV
        // heights" framing was misleading and made operators think SPV was
        // broken. Renamed to "Arbiter ↔ sidechain catch-up" + added an
        // explicit "Embedded SPV" badge per row that reflects log-file
        // liveness (the real embedded-SPV height isn't RPC-exposed upstream,
        // so log-mtime is the only available signal).
        spv_module: {
            aria:            'SPV Module',
            loading:         'Loading SPV status…',
            error_title:     'SPV status unavailable',
            intro:           'Two separate SPV systems run on a Council node: the Arbiter has its '
                             + 'own SPV that tracks the ELA Main chain (the headline number below), '
                             + 'and each EVM sidechain runs its own embedded SPV for cross-chain '
                             + 'deposit verification. This view aggregates both.',
            hero_label:      'Arbiter SPV height',
            hero_sub:        'Tracks the ELA Main chain tip.',
            arbiter_running: 'Arbiter running',
            arbiter_stopped: 'Arbiter stopped',
            arbiter_absent:  'Arbiter not installed',
            // v0.5.200 — was "Sidechain SPV heights". The per-row number is
            // actually the arbiter's cross-chain processing position for each
            // sidechain, NOT SPV.
            sidechains_title: 'Arbiter ↔ sidechain catch-up',
            sidechains_intro: 'How far the Arbiter has walked through each sidechain looking for '
                             + 'cross-chain transactions (withdraws, illegal evidence, failed '
                             + 'deposits). This catches up slowly for chains with many blocks — '
                             + 'the Arbiter walks every block and persists progress every 1,000 '
                             + 'blocks. Not the same as the sidechain block height or SPV height.',
            col_name:         'Sidechain',
            col_arbiter:      'Arbiter processed',
            col_embedded:     'Embedded SPV',
            no_sidechains:   'No EVM sidechains are configured.',
            view_logs:       'View SPV logs',
            no_logs_yet:     'No SPV logs yet',
            logs_title:      'SPV logs — {chain}',
            logs_loading:    'Loading…',
            logs_empty:      'No SPV log lines yet for this chain.',
            logs_error:      'Could not read SPV logs: {msg}',
            // v0.5.200 — embedded SPV badge per row. Upstream Elastos does not
            // expose the sidechain-embedded-SPV height via RPC, so liveness
            // is inferred from the newest logs-spv file's mtime + last event.
            embedded_active:    'Active',
            embedded_active_hint: 'Last embedded-SPV log activity {age} ago.',
            embedded_stale:     'Stale',
            embedded_stale_hint: 'No embedded-SPV log activity for {age}. Usually means the chain '
                                 + 'process or its SPV thread is down.',
            embedded_unknown:   'No data',
            embedded_unknown_hint: 'No embedded-SPV log files yet — the chain may be too freshly '
                                   + 'installed, or the SPV thread hasn\'t written anything.',
            embedded_last_event: 'Last event: {line}',
        },

        // v0.5.175 — Peers & Bootnodes panel (components/peers-panel.js).
        // Mounts on the per-chain dashboard for EVM sidechains (Class B). The
        // geth fork's discv4 auto-discovery is weak; this is the operator's
        // manual escape hatch when a sidechain is stuck at 0 peers.
        peers_panel: {
            aria:            'Peers and bootnodes',
            title:           'Peers & bootnodes',
            loading:         'Loading peer status…',
            error:           'Peer status unavailable.',
            help_summary:    'How do I get a peer to add?',
            help_what:       'A peer is identified by its enode — its public key plus IP and port. '
                             + 'An IP on its own is not enough: the key is required for the encrypted '
                             + 'connection and cannot be looked up from the IP.',
            help_how:        'To copy the peers a working node already has, attach to it '
                             + '(./eid attach) and run:',
            help_format:     'Paste any enode (enode://<key>@<ip>:<port>) above. ENM saves it so it '
                             + 'survives a restart, and connects to it immediately if the chain is running.',
            empty:           'No peers configured yet. Your node relies on auto-discovery alone — '
                             + 'if it is stuck at 0 peers, add one below.',
            remove_aria:     'Remove this peer',
            status_stopped:  'Chain is stopped — start it to connect to peers.',
            status_unknown:  'Peer count unavailable.',
            status_peers:    '{n} peer(s) connected',
            stuck:           'This chain is running but has 0 peers, so it cannot sync. '
                             + 'Add a peer below to get it moving.',
            add_label:       'Add a peer (enode URL)',
            add_btn:         'Add peer',
            bad_format:      'That does not look like an enode. Expected enode://<128 hex>@host:port.',
            already:         'That peer is already in the list.',
            removed:         'Peer removed.',
            dialed:          'Peer added and connected. Watch the peer count above start to climb.',
            saved_restart:   'Peer saved. Start or restart this chain for it to take effect.',
            saved:           'Saved.',
            save_failed:     'Could not save. Try again.',
            dial_failed:     'Saved, but the live connection failed: {err}. ENM will retry it '
                             + 'next time the chain restarts.',
            toast_dialed_title:      'Peer connected',
            toast_saved_title:       'Peer saved',
            toast_dial_failed_title: 'Peer saved (dial failed)',
        },

        // beta.3.15 — producer_binding.* strings block deleted. Its only
        // consumer was components/producer-identity.js, which was dropped
        // in beta.3.15 (CR Council / DID content on the dashboard violated
        // operator preference; the component was loaded but never mounted
        // on Beta 3's _showDashboard anyway). If a future binding-status
        // card is needed, resurrect these keys from git history.

        // BP-E — tech_maintenance.* string block retired with technical-
        // view.js. The Maintenance section (compact logs / reactivate
        // BPoS / re-bootstrap chain data) is dropped from Beta 3 entirely;
        // BPoS reactivation now goes through .enm-bpos-card. Re-bootstrap
        // + compact-logs may return as standalone Settings actions in a
        // post-beta.3 release. If/when they do, ressurect this block from
        // git history (was at this location pre-BP-E).

        // alpha.28.1 batch 81 — tools-update CARD strings (the resting
        // and update-available states). Modal-internal strings are
        // deferred to batch 82+ since they're a larger block.
        tools_update: {
            head_resting:          'Binary update',
            head_available:        'Binary update available',
            badge_offline:         'offline',
            badge_offline_title:   'GitHub unreachable; showing last known stable version baked into this ENM build.',
            badge_stale:           'stale',
            badge_stale_title:     'GitHub probe failed; showing the last successful result.',
            // {version} fills with env.current. {time} fills with the
            // relTime <span> HTML — caller splices raw since it includes
            // markup; locale switch only touches the surrounding prose.
            latest_release_one:    "You're on the latest release ({version}).",
            latest_release_with_check:
                "You're on the latest release ({version}). Last checked {time}.",
            fallback_explainer:
                'GitHub unreachable from this server; comparison uses the build-time '
              + '<code>knownGoodElaVersion</code> baked into this ENM bundle.',
            notes_summary:         'Release notes',
            open_on_github:        'Open on GitHub →',
            // {current} → installed version; {latest} → available version.
            // Splices raw `<code>` markup; safe because both values flow
            // through escapeHtml at the call site.
            versions_line:         'Installed {current} → available {latest}',
            update_btn:            'Update via shell',
            // 0.5.33 audit Session 33 — dropped stale "Apply-in-place ...
            // lands in alpha.11+" promise. Verified by grep across
            // enm-server source: the apply-in-place feature was never
            // built, and ENM is at v0.5.x so the alpha.11+ marker is
            // doubly stale. 5th stale-pointer bug of the audit chain
            // (parallel to v0.5.27 Card 7, v0.5.30 chain-selector).
            update_help:           'Opens a copy-paste-ready command you\'ll run on the server.',
            // Relative-time-suffix used by the "Last checked" span.
            // {time} carries the human substring ("5 min ago").
            released_when:         'released {time}',
            // alpha.28.1 batch 82 — tools-update MODAL strings. The
            // modal is the "View update command" overlay that operators
            // open from the Update button on the resting card. Strings
            // cover: heading, lead paragraph, the two action buttons,
            // the explainer disclosure + its four li items, and the
            // release-notes label. {version} fills with env.latest;
            // {githubLink} carries the full <a href> markup so the
            // surrounding prose stays localisable while the link stays
            // intact.
            modal_heading:         'Update to {version}',
            modal_lead:            "Run this on the host that runs your PC2 server (where ENM's files live):",
            modal_close_aria:      'Close',
            modal_auto_fill_btn:   'Auto-fill my token',
            modal_copy_btn:        'Copy command',
            modal_copy_btn_aria:   'Copy update shell command',
            modal_explainer_label: 'What does this do?',
            modal_step_download:   'Downloads ela {version} from GitHub.',
            // 0.5.33 audit Session 33 — dropped HTTP method/path leak
            // (DELETE /api/installed-apps + extensions/elastos-node-
            // manager/). Operators reading "what does this do?" want
            // safety reassurance, not REST semantics.
            modal_step_uninstall:  'Removes the old ENM files. Your chain data and keystore stay safe in their own folder.',
            modal_step_reinstall:  'Reinstalls with the new binary; pc2-node spawns it under the supervisor.',
            // 0.5.33 audit Session 33 — "24s" → "24 seconds" (dev
            // shorthand for operator copy).
            modal_step_healthcheck:"Checks for 24 seconds that the new ENM is healthy; auto-rolls back if it doesn't come up.",
            modal_release_notes:   'Release notes: {githubLink}',
        },

        // 0.5.135 audit Session 135 — clock_skew namespace removed.
        // The alpha.28.1 batch 84 plan was to give the clock-skew
        // wizard step a rich 3-state UI (skipped / out-of-sync / in-sync,
        // each with title + sub + detail card + 1-2 CTAs). That plan
        // was REPLACED with a simpler shape: clock-skew folds into the
        // Card 5 preflight checklist as a single row (severity-tagged,
        // see setup-conversation.js _renderCard5Preflight, around the
        // skewMsg builder at ~line 1548 using hardcoded English). The
        // 21 rich strings under clock_skew.* were never wired to any
        // consumer — every grep across the repo returned zero hits.
        // Dropping 33 lines of dead i18n.
    });
    // STRINGS is a deeply-frozen tree — see deepFreeze above.

    /**
     * Look up a dot-path in STRINGS and substitute {tokens}. Missing keys
     * return the key itself in brackets so they're visible to QA.
     *
     * @param {string} key   e.g. 'wizard.binary_ok'
     * @param {object} [vars] e.g. { version: 'v0.9.9.5' }
     * @returns {string}
     */
    function t(key, vars) {
        if (typeof key !== 'string' || key.length === 0) {
            return '';
        }
        var parts = key.split('.');
        var cur = STRINGS;
        for (var i = 0; i < parts.length; i += 1) {
            if (cur && typeof cur === 'object' && parts[i] in cur) {
                cur = cur[parts[i]];
            } else {
                return '[' + key + ']';
            }
        }
        if (typeof cur !== 'string') {
            return '[' + key + ']';
        }
        if (!vars) {
            return cur;
        }
        return cur.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
        });
    }

    root.ENM_STRINGS = STRINGS;
    root.enmT = t;
}(typeof window !== 'undefined' ? window : globalThis));
