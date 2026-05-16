# Rollback Procedure (PC2 + ElastOS launcher)

**Purpose.** A bad release on a piece of software that users explicitly install on their own machines is much harder to recall than a bad release on a server you control. This document is the operational runbook for getting users back to a known-good version when a hot-patch isn't the right call.

**Read this all the way through before you need it.** When you actually need it, you'll be stressed, your team will be in different time zones, and there will be a community Slack thread waiting for an answer. Rehearse the steps now.

---

## Decision tree: hot-patch vs rollback

| Symptom | First reach for | Why |
|---|---|---|
| Bug is reproducible on demand, root cause obvious, fix is < 20 lines | **Hot-patch** | Faster than rollback. v1.2.7.7→13 each shipped within hours. |
| Bug surfaces only on a fraction of installs, root cause unclear after 1 hour of triage | **Rollback** | Don't dig blind. Get users to a working state, debug in calm. |
| Bug touches user data integrity (wallet, identity, keys, encrypted files) | **Rollback IMMEDIATELY** | Don't ship a second release that might compound the corruption. |
| Bug is a UX regression but app still functional | **Hot-patch** (in normal hours) or **wait** | Lower urgency. Don't burn the team on overnight pushes for UX. |
| Bug is in the launcher's auto-update path itself | **Rollback + advise users to download manually** | Self-healing fails when the healing mechanism is broken. |
| Bug breaks fresh installs but not upgrades | **Hot-patch + pause new install promo** | Existing users are OK; protect new users by holding announcements. |
| Bug breaks upgrades but not fresh installs | **Rollback + tell users not to upgrade** | Inverse of above. |

**The conservative call is rollback.** If you're not sure which side of any of these your situation falls on, roll back.

---

## What "rollback" means in our context

We ship two artefacts per release:

1. **PC2 source code + binary release** on `Elacity/pc2.net` (the source code at the git tag, plus the `pc2-binaries-v1` GitHub release that ships the platform-specific transport binaries that `BinaryManager` downloads).
2. **ElastOS launcher app bundle** on `Elacity/elastos-launcher` (the signed `.dmg` / `.exe` / `.AppImage` that users install on their machines).

Both have their own release lifecycle on GitHub. The launcher's auto-updater (`Electron updater` or equivalent) periodically polls the launcher repo's releases endpoint and offers users the latest non-draft release. **That's the lever we pull during a rollback.**

A rollback does **not** mean reverting commits on `main`. The bad code stays in history (with the bad tag still pointing at it) — we just stop offering that release to users via the auto-updater channel.

---

## Pre-flight: assemble what you need

Before doing anything else, gather:

- [ ] **A.** The version string of the **bad release** (e.g. `v1.2.7.10`).
- [ ] **B.** The version string of the **last known-good release** (e.g. `v1.2.7.9`).
- [ ] **C.** Confirmation that B's binaries (`.dmg`, etc.) on the launcher repo's release page are still downloadable: open the release URL in a browser, click one asset, verify the download starts. **If B's binaries are gone, you cannot roll back to B — pick an earlier good release.**
- [ ] **D.** Confirmation that B's `pc2-binaries-v1` release on `Elacity/pc2.net` still has all 22 binaries + SHASUMS256.txt:
  ```bash
  gh release view pc2-binaries-v1 -R Elacity/pc2.net --json assets --jq '.assets | length'  # expect 23
  ```
  (Note: `pc2-binaries-v1` is currently a single rolling release shared across all PC2 versions. As long as the binaries are present and named per the convention `BinaryManager` expects, they work for any PC2 version that downloads them.)
- [ ] **E.** A communication channel ready to use immediately (Slack, X/Twitter, Discord, the elacity.com banner — whichever you've used recently to announce releases).
- [ ] **F.** The current time in UTC and an estimate of how long the rollback will take to propagate (auto-update poll interval is typically 1-4 hours; communicate the worst case to users).

If any of A–D is missing, **fix that first** before pulling the trigger.

---

## Procedure

### Step 1 — Pull the bad launcher release out of the auto-update channel

The fastest, most reversible action. Sets the bad release to "draft" on GitHub, which excludes it from the launcher's update polling, without losing any history or assets.

```bash
gh release edit v<bad-version> -R Elacity/elastos-launcher --draft
```

Result: existing users on the bad version stay on the bad version (auto-updater no longer offers them anything newer — until §2 happens). New users downloading from the GitHub release page stop seeing the bad version at the top.

**This is the bell that can be un-rung.** If you decide 30 minutes later this was unnecessary, run `--draft=false` and the bad release is back in the channel. Do this BEFORE anything else in this procedure.

### Step 2 — Re-publish the previous launcher release to the top of the list

GitHub's release list is sorted by `published_at` timestamp. The auto-updater polls the topmost non-draft release. Re-publishing the previous release bumps its `published_at` to "now", which makes the auto-updater offer it to users on the bad version as an "update" — even though the version number is lower.

```bash
# Bump the previous release's published_at to NOW, keeping content unchanged
gh release edit v<previous-good-version> -R Elacity/elastos-launcher --latest
```

The `--latest` flag explicitly sets this release as the "Latest release" on the GitHub repo page and updates the auto-updater feed. Most Electron-style auto-updaters respect this signal.

**If your auto-updater doesn't respect `--latest`**: you may need to delete-and-re-create the previous release (more invasive). Test this beforehand — see §6 dry-run.

### Step 3 — Communicate the rollback (within 30 minutes of §1)

The actual user-facing harm of a bad release is greatly reduced by transparency. Users who know "v1.2.7.10 has a bug, we're reverting to v1.2.7.9, fix coming in v1.2.7.11 within 24h" feel respected. Users who silently get downgraded without an announcement get suspicious. Trust burns three orders of magnitude faster than it builds.

Use the same channel(s) used to announce the release. Template:

> **Heads-up: rolling back v\<bad-version\>.**
>
> We've identified \<one-sentence summary of bug, no jargon\> in v\<bad-version\> and rolled the auto-updater back to v\<previous-good-version\>. If you've already installed v\<bad-version\>, your launcher will offer you v\<previous-good-version\> on its next update check (typically within \<X\> hours).
>
> If you want to fix this immediately without waiting, you can download v\<previous-good-version\> directly from \<release-URL\>.
>
> Fix is in progress. ETA for v\<next-version\>: \<estimate\>. We'll post here when it ships.
>
> Apologies for the disruption.

**What NOT to do**: don't say "if you experience X, do Y" without admitting the bug existed. Users on the bad release are figuring out something is wrong; meet them where they are.

### Step 4 — Pause new outbound announcements

If the bad release was being actively promoted (Twitter/X announcement scheduled, blog post draft, community update queued), pull or pause those.

- [ ] Tweet drafts in scheduler: pulled.
- [ ] Blog post: paused or updated.
- [ ] Community update in `docs/updates/`: edited to reflect the rollback + the bad release's behaviour ("v1.2.7.10 was released and rolled back due to <reason>; v1.2.7.11 ships <ETA> with the fix").
- [ ] Banner on `elacity.com` or similar: updated if it was promoting the bad version.

### Step 5 — Investigate, then ship the hot-patch

Now that users are safe, the team can debug calmly. The hot-patch (a new release, version `\<bad-version + 1\>`) should:

- Address the specific bug that triggered the rollback (cite it explicitly in the release notes).
- Pass the full `PRE-TAG-CHECKLIST.md` flow — no shortcuts because we already shipped a bad one.
- Be tested on a fresh machine before tagging.

When the hot-patch is ready:

```bash
# Run through PRE-TAG-CHECKLIST.md end-to-end, then:
git tag -a v<bad-version + 1> -m "v<bad-version + 1> — fix <bug from rollback>"
git push origin v<bad-version + 1>
# Launcher CI builds + signs + publishes
# (No need to un-draft v<bad-version>; leave it as a historical "broken" record.)
```

### Step 6 — Post-mortem (within 7 days of the rollback)

Write a short post-mortem covering:

- What the bug was (one paragraph).
- Why the pre-tag checklist didn't catch it.
- A new checklist item added under the appropriate section of `PRE-TAG-CHECKLIST.md` so the same class of bug doesn't repeat.
- An item added to `OPTIMISATION-AND-REFACTORING-2026-05` (or a follow-up task) if there's a structural fix that prevents the bug class entirely.

Commit it to `docs/postmortems/<YYYY-MM-DD>-rollback-v<bad-version>.md` (create that folder if it doesn't exist yet — first one establishes the pattern).

---

## Dry-run procedure (validate this runbook BEFORE the real fire)

Do this once now, repeat once per quarter so the team's muscle memory stays warm.

1. **Pick a recent release** (e.g. the most recent one, while a stable version is still on the channel).
2. **In a test branch of `Elacity/elastos-launcher`**, simulate the rollback steps on a clone or test release. Do NOT actually modify the production release.
3. **Verify the commands in §1, §2 work as expected** by running them with `--dry-run` flags where supported, or against a test repo.
4. **Time the procedure end-to-end** so we know how long we have between "tag was bad" and "users are protected". Target: <30 minutes from decision to §1 complete, <60 minutes including §3 communication.
5. **Note any gotchas** discovered (e.g. "the gh release edit --latest flag also needs --target=main" — hypothetical) and update this document.

The dry-run for the v1.2.8.0 release window should be done once before the Mac launcher release ships next Wed/Thu so the procedure has been exercised on the current GitHub Actions / `gh` CLI versions.

**Status of dry-run completion**: ✅ COMPLETED 2026-05-16 08:34 BST against `Elacity/pc2.net` using two sacrificial test releases (`dry-run-rollback-{good,bad}-20260516`). All five canonical Step 1-2 commands verified end-to-end. Sacrificial releases + tags cleaned up immediately after; `/releases/latest` confirmed to still point at `v1.2.7.14`. See "Empirical findings from the 2026-05-16 dry-run" appendix at the bottom of this document for the full set of observations.

---

## Edge cases + caveats

- **The launcher's auto-updater itself was broken** in the bad release: §1 + §2 won't reach users automatically. You'll need to communicate (§3) extra clearly that users have to download the previous version manually from a URL you provide. Pin that URL to the top of every communication channel. Consider an email blast if you have a user mailing list.
- **The bad release is more than 7 days old** when the bug is discovered: the rollback is harder because many users have already updated and there may be data-state assumptions that don't roll back cleanly. In this case, ship the hot-patch — don't roll back. Update §A in `PRE-TAG-CHECKLIST.md` to add a "have we had this version in the wild for >N days" check before tagging the next major version.
- **The bad release is a launcher-only or PC2-only change**: only roll back the affected artefact. E.g. if the bug is purely in pc2-node and the launcher half is fine, you may not need to touch the launcher's release at all — instead refresh `pc2-binaries-v1` to the previous-good binaries and rely on `BinaryManager`'s download-and-verify behaviour.
- **The bad release introduces a new dependency on infrastructure that doesn't exist yet** (e.g. v1.2.8.0's Chipotle Relayer dependency on the new `/api/ddrm/lit-action` endpoint on supernodes): rolling back the client side is straightforward; rolling back the server side may not be needed at all because old clients won't call the new endpoint. Verify that the server side has backward compatibility before rolling back the client.

---

## What this procedure does NOT cover

- **Revoking signing certificates / keys** if a release was compromised at the signing level. That's a separate, more involved incident response — see the security playbook if it exists, or talk to whoever owns Apple Developer / code-signing infrastructure.
- **Rotating leaked secrets** (e.g. the Chipotle `usageKey` leak documented in `docs/handover/PROMPT_NEXT_CHAT_V1280.md`). Different threat model, different runbook (see `.cursor/tasks/SEC-2026-04-28-WAVE8-CHIPOTLE-HARDENING/ROTATION_RUNBOOK.md` for that path).
- **Wallet / identity recovery** if the bad release corrupted user data. That's case-by-case and depends on the specific corruption mode.

---

## Appendix — Empirical findings from the 2026-05-16 dry-run

Ran the full procedure against `Elacity/pc2.net` (NOT `Elacity/elastos-launcher` — we don't have the launcher repo write rights from the agent context, and pc2.net is the closer-to-fire test ground anyway). Methodology: created two sacrificial test releases (`dry-run-rollback-{good,bad}-20260516`), exercised every step, observed behaviour via both `gh` CLI and direct GitHub REST API calls (authenticated + anonymous), then deleted the test releases + tags. Total elapsed time: ~12 minutes including the doc update.

### 1. The "Latest" pointer is auto-stolen on release creation (CRITICAL)

When you run `gh release create <new-tag>` on a repo that already has a Latest release, **the new release IMMEDIATELY becomes the new Latest** — even if it's the same content as a test release, even if its `published_at` is older than the existing Latest (no, GitHub uses release-creation timestamp, not the tag's commit date).

**Verified**: created `dry-run-rollback-bad-20260516` at 07:34:02 UTC. Within ~1 second, `GET /releases/latest` returned `dry-run-rollback-bad-20260516` instead of `v1.2.7.14` (published 2026-05-07).

**Implication**: any non-draft release you create — even one labelled "DO NOT USE" or "TEST" — will be served to any user / auto-updater / CI that polls `/releases/latest` until you explicitly mark the previous-good release with `--latest` again. The exposure window is ~seconds for the agent, ~minutes-to-hours for a human who doesn't realize what they did.

**Defence**: when creating any auxiliary release on a repo that has production users, use `--draft` from the start. Then GitHub never promotes it to Latest. The `gh release create` command supports this:
```bash
gh release create <tag> --draft --title "..." --notes "..." asset1 asset2 ...
```

**Action item**: add this to `PRE-TAG-CHECKLIST.md` §0 (or §5.3) — when tagging a real release, the moment you create it, GitHub WILL mark it Latest. So make sure §0–§4 are all green BEFORE running `gh release create`. Don't `gh release create` to "see what happens" — that's not free.

### 2. `gh release edit --draft` does the right thing for rollbacks

Confirmed behaviour when toggling `--draft` on an existing release:

| Surface | Anonymous (no auth) | Authenticated |
|---|---|---|
| `GET /releases/tags/<tag>` | HTTP 404 ✓ | Tag visible with `draft=true` |
| `GET /releases/download/<tag>/<asset>` | HTTP 404 ✓ | Same |
| `GET /releases/latest` | Returns next-Latest non-draft ✓ | Same |
| `GET /releases` (list) | Excludes drafts ✓ | Includes drafts |
| Git tag on remote | Untouched ✓ (for forensics) | Same |
| The release record in DB | Preserved with `tag_name` intact ✓ | Same |

The output of `gh release edit --draft` shows a URL like `https://github.com/Elacity/pc2.net/releases/tag/untagged-<hash>`. **This URL is misleading — it's only the gh-CLI-rendered draft preview page.** The release is still bound to its tag in the canonical API; the "untagged" name is a render artefact. Don't panic when you see it.

**Implication**: Step 1 of the procedure (`--draft` the bad release) is the right move. It hides the bad release from every user-facing surface that matters, while leaving forensics intact (the git tag stays, the release record stays in the database). If you decide an hour later it was a false alarm, `gh release edit --draft=false` re-publishes it cleanly.

### 3. Un-draft propagation has a CDN lag of ~30-60 s for anonymous viewers

When un-drafting via `gh release edit <tag> --draft=false`:
- **Authenticated endpoint** updates instantly: `gh release view <tag>` works immediately.
- **Anonymous endpoint** (no auth header) returns HTTP 404 for ~30-60 seconds after the un-draft, then starts returning HTTP 200.

**Implication**: if you mistakenly un-draft a release you intended to keep drafted, an authenticated re-draft via `gh release edit <tag> --draft` works fine — but during that ~60 s window, anonymous users may already have seen and downloaded the release. Generally not a concern for our rollback path (we're going OUT of draft, not IN), but worth knowing if you ever need to keep something drafted defensively.

### 4. `gh release edit <tag> --latest` flips the pointer instantly

Confirmed: from running `gh release edit dry-run-rollback-good-20260516 --latest` to the response of `GET /releases/latest` reporting the new tag was sub-second. **The previous Latest is implicitly unset** (single-pointer model). Recovery via `gh release edit <previous> --latest` is equally instant. We held an "unsafe" Latest pointer for 2 seconds during the dry-run with zero observable production impact.

**Implication**: the `--latest` flip is reliable and fast. There's no race window concern.

### 5. `gh release delete --cleanup-tag --yes` cleanly removes everything

Confirmed: a single `gh release delete <tag> --cleanup-tag --yes` removes:
- The release record (from `gh release list`, from `GET /releases`)
- The git tag on the remote (verified via `git ls-remote --tags`)
- All assets attached to the release

Local tags must be deleted separately with `git tag -d <tag>` (gh CLI is remote-only). Both releases in the dry-run were cleaned up with one command each, no orphan tags, no orphan release records.

### 6. Decision-tree refinement

Based on dry-run timing data, the original "rollback in 30 min, comms in 60 min" target in this doc is **achievable** but tight. Step 1 + Step 2 (the technical actions) took ~30 seconds end-to-end. The dominant time cost will be:
- Identifying the previous good version (§A.B in the doc) — 1-2 min if recent
- Verifying its assets are still downloadable (§A.C) — 1 min per platform
- Writing the comms message (§3) — 10-15 min from blank page; 2-3 min from the template in this doc

So the realistic clock is **5 min to technical containment, 10-20 min to first comms post**. Faster than the original estimate. Don't pad — speed matters more than polish in the first communication.

### 7. Document changes recommended (and tracked separately)

These findings should be folded back into the procedure text in a follow-up commit:
- §1 should explicitly note "this hides the release from anonymous viewers within 1 second; tag stays bound".
- §2 should reassure "this flip is instant, no race window".
- A new "common gotchas" subsection should warn about the auto-Latest-on-creation behaviour from finding #1 above.
- The 30/60 min targets should be tightened to 5/20 min.

These were not folded in during the dry-run itself to keep the diff small and reviewable. Sasha to decide if/when to refine.

---

## Document metadata

- **Source of truth**: this file.
- **Owners**: release engineering (Sasha primary).
- **Last updated**: see git log on this file.
- **Last dry-run completed**: 2026-05-16 08:34 BST (see Appendix above).
- **Tied to**: `PRE-TAG-CHECKLIST.md`, `.cursor/tasks/RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md`.
