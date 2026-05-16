/**
 * REGRESSION TEST: macOS osascript command construction (v1.2.7.11)
 *
 * Catches the apostrophe-injection bug class that broke v1.2.7.10 in production
 * on every fresh-Mac install. Documented in:
 *   - docs/handover/PROMPT_NEXT_CHAT_V1280.md (v1.2.7.11 release note, item 4)
 *   - pc2-node/src/services/wireguard/setupPermissions.ts (comments around
 *     `setupMacOS`, lines 418-468)
 *
 * The bug
 * -------
 * Pre-v1.2.7.11 `setupMacOS` interpolated the sudoers entry text directly into
 *
 *   osascript -e 'do shell script "echo \"${entry}\" > /etc/sudoers.d/pc2-wireguard"'
 *
 * Any apostrophe in `entry` terminated the outer single-quoted shell argument
 * before `osascript` could parse the inner script. /bin/sh failed at parse
 * time, before the password dialog ever appeared. v1.2.7.10's comment text
 * contained `'sudo -E'`, `cant`, `doesnt` — every fresh-Mac install silently
 * fell through to ActiveProxy because the auth dialog never fired.
 *
 * The fix
 * -------
 * Write `entry` to a tmpfile as the user (mode 0600), then ask osascript to
 * run a fixed-shape `cp + chmod + rm` against known paths. The user-controlled
 * `entry` is never interpolated into a shell command — only the file paths
 * (which we control) go through escaping.
 *
 * What this test does
 * -------------------
 *   1. Reproduces the buggy pre-v1.2.7.11 pattern as `buggyOsascriptCommand`
 *      and asserts it produces shell-invalid output when entry has apostrophes.
 *   2. Reproduces the fixed v1.2.7.11+ pattern as `fixedOsascriptCommand`
 *      and asserts it produces shell-valid output for any input.
 *   3. Defence-in-depth: scans the LIVE `setupPermissions.ts` source for any
 *      apostrophes inside the `buildSudoersEntry` comment template literals.
 *      A future refactor that re-introduces apostrophe-bearing comments would
 *      fail this assertion BEFORE shipping, even if the apostrophe-safe
 *      `setupMacOS` path was simultaneously regressed back to interpolation.
 *
 * What this test does NOT do
 * --------------------------
 *   - Execute osascript (which would require macOS + admin password — out of
 *     scope for unit tests).
 *   - Test the runtime behaviour of `setupMacOS` (covered separately by the
 *     macOS smoke gate in `.github/workflows/smoke-test.yml`, future Phase 3).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SETUP_PERMISSIONS_SRC = join(
  __dirname,
  '..',
  '..',
  'src',
  'services',
  'wireguard',
  'setupPermissions.ts',
);

// Read a UTF-8 source file with CRLF→LF normalisation. Required because on
// Windows runners `actions/checkout` may convert .ts files to CRLF, and the
// static-source-scan logic below assumes LF when looking for sentinels like
// `\n}\n`. Normalising at read time keeps the rest of the test logic
// platform-agnostic.
function readSourceUtf8(path) {
  return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// Test fixtures: the buggy + fixed osascript invocation shapes, reproduced
// here verbatim from the v1.2.7.11 before/after diff so the test self-
// documents the regression class.
// ---------------------------------------------------------------------------

/**
 * Reproduces the pre-v1.2.7.11 buggy osascript invocation shape.
 *
 * Verbatim from `setupMacOS` as it existed pre-fix:
 *
 *   const script = `do shell script "echo \\"${entry}\\" > ${SUDOERS_FILE}"`;
 *   exec(`osascript -e '${script}'`);
 *
 * DO NOT IMPORT THIS INTO PRODUCTION CODE. It is here purely to demonstrate
 * the regression class.
 */
function buggyOsascriptCommand(entry, dest) {
  const script = `do shell script "echo \\"${entry}\\" > ${dest}"`;
  return `osascript -e '${script}'`;
}

/**
 * Mirrors the v1.2.7.11+ `escapeForOsa` helper from setupPermissions.ts
 * (currently a closure inside `setupMacOS`, lines 442). Backslashes are
 * escaped FIRST so the escape characters we add for quotes are not
 * themselves re-escaped on the second pass.
 */
function escapeForOsa(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Reproduces the v1.2.7.11+ fixed osascript invocation shape.
 *
 * Verbatim from `setupMacOS` lines 442-448 of setupPermissions.ts as of
 * v1.2.7.11. Only `tmpFile` + `dest` (paths we control) are interpolated,
 * after escapeForOsa-ing them. The user-supplied `entry` is written to
 * `tmpFile` separately on disk and never reaches the shell command.
 */
function fixedOsascriptCommand(tmpFile, dest) {
  const tmpEsc = escapeForOsa(tmpFile);
  const destEsc = escapeForOsa(dest);
  const script =
    `do shell script "/bin/cp \\"${tmpEsc}\\" \\"${destEsc}\\" ` +
    `&& /bin/chmod 0440 \\"${destEsc}\\" ` +
    `&& /bin/rm -f \\"${tmpEsc}\\"" with administrator privileges`;
  return `osascript -e '${script}'`;
}

/**
 * POSIX shell-style tokeniser for ASSERTING tokenisation outcomes only.
 *
 * The v1.2.7.11 bug was NOT a syntax error — `bash -n` parsed the buggy
 * command fine. The bug was that apostrophes inside `entry` terminated the
 * outer single-quoted region, splitting what should have been a single
 * osascript `-e` argument into multiple shell tokens. The result: osascript
 * received a TRUNCATED script (up to the first apostrophe in the entry)
 * and silently failed.
 *
 * To detect this class, we tokenise the command the same way a POSIX shell
 * would and count the result. The intended buggy/fixed shape is always:
 *   ['osascript', '-e', '<single-string-script>']  (3 tokens)
 * Any apostrophe leakage produces >3 tokens.
 *
 * This is intentionally minimal — handles single quotes (literal), double
 * quotes (with backslash escapes), and whitespace splitting. Enough to
 * model the regression class without depending on a real shell.
 */
function shellTokenise(cmd) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let pendingToken = false;
  const flush = () => {
    if (pendingToken || current.length > 0) {
      tokens.push(current);
      current = '';
      pendingToken = false;
    }
  };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
        pendingToken = true;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === '\\' && i + 1 < cmd.length) {
        current += cmd[i + 1];
        i++;
        pendingToken = true;
      } else {
        current += ch;
        pendingToken = true;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      pendingToken = true;
    } else if (ch === '"') {
      inDouble = true;
      pendingToken = true;
    } else if (ch === '\\' && i + 1 < cmd.length) {
      current += cmd[i + 1];
      i++;
      pendingToken = true;
    } else if (/\s/.test(ch)) {
      flush();
    } else {
      current += ch;
      pendingToken = true;
    }
  }
  flush();
  return {
    tokens,
    error:
      inSingle ? 'unclosed single quote'
      : inDouble ? 'unclosed double quote'
      : null,
  };
}

/**
 * Strip JS/TS comments from source so static-analysis sentinels can search
 * executable code only. Handles:
 *   - /* ... *\/  (block comments, including multi-line — non-greedy)
 *   - // ...      (line comments to end of line)
 *
 * NOT a full JS parser — it doesn't know about strings/regexes, so it can
 * over-strip if a `/` appears inside a string literal followed by content
 * that looks like a comment. For our purpose (searching for distinct
 * markers in setupPermissions.ts) this is sufficient. A future Phase can
 * upgrade to a real AST-based scan if the heuristic ever produces a false
 * negative.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupPermissions osascript regression (v1.2.7.11 apostrophe bug)', () => {
  test('REGRESSION: buggy pattern tokenises into >3 shell tokens when entry has apostrophes (osascript receives a truncated script)', () => {
    // EXACT input shape that broke v1.2.7.10 in production. The apostrophe
    // in `'sudo -E'` terminates the outer single-quoted shell argument
    // before osascript ever runs. /bin/sh tokenises the command into many
    // pieces; osascript receives only the FIRST piece as its `-e` argument
    // (a truncated script) and exits with a parse error — but pc2-node's
    // exec callback saw that as a "user cancelled" event, so the password
    // dialog never even appeared on fresh-Mac installs.
    const entryWithApostrophe =
      "# sudoers entry referencing 'sudo -E' env propagation\n" +
      "# explains why this rule cant be omitted\n" +
      'user ALL=(root) NOPASSWD:SETENV: /path/wg-quick up *\n';

    const cmd = buggyOsascriptCommand(
      entryWithApostrophe,
      '/etc/sudoers.d/pc2-wireguard',
    );
    const result = shellTokenise(cmd);

    assert.equal(
      result.error,
      null,
      `buggy command tokenisation error (orthogonal — focus on token count): ${result.error}`,
    );
    assert.ok(
      result.tokens.length > 3,
      'buggy pattern must produce >3 shell tokens when entry has apostrophes ' +
        '— this is the v1.2.7.11 bug class. Intended: 3 tokens ' +
        '[osascript, -e, <single-string-script>]. Got: ' +
        `${result.tokens.length} tokens. If this test starts FAILING (i.e. ` +
        'tokens.length === 3), the regression class is back: production code ' +
        "is interpolating entry-with-apostrophes safely now. Re-read v1.2.7.11's " +
        "setupMacOS comments before 'fixing' the test.\n\nTokens:\n" +
        result.tokens.map((t, i) => `  [${i}] ${JSON.stringify(t)}`).join('\n'),
    );
  });

  test('REGRESSION: buggy pattern tokenises into exactly 3 tokens when entry has NO apostrophes (proves the bug was apostrophe-specific, not a general interpolation problem)', () => {
    // Identical to the failing case above, just with apostrophes stripped.
    // Confirms the buggy pattern works fine for apostrophe-free entries —
    // which is why the bug only surfaced when v1.2.7.10 added apostrophes
    // to the comment text. The vulnerability was always there, but latent.
    const safeEntry =
      '# sudoers entry with no quote characters in comments\n' +
      'user ALL=(root) NOPASSWD:SETENV: /path/wg-quick up *\n';

    const cmd = buggyOsascriptCommand(safeEntry, '/etc/sudoers.d/pc2-wireguard');
    const result = shellTokenise(cmd);

    assert.equal(result.error, null, `unexpected tokenise error: ${result.error}`);
    assert.equal(
      result.tokens.length,
      3,
      'buggy pattern with apostrophe-free entry should tokenise to exactly ' +
        `3 tokens [osascript, -e, <script>]. Got ${result.tokens.length}: ` +
        result.tokens.map((t) => JSON.stringify(t)).join(', '),
    );
    assert.equal(result.tokens[0], 'osascript');
    assert.equal(result.tokens[1], '-e');
  });

  test('FIX: fixed pattern always tokenises into exactly 3 tokens regardless of typical macOS tmp/dest paths', () => {
    // The fixed pattern does NOT interpolate `entry` at all — only paths,
    // which are macOS tmpdir() outputs (e.g. /var/folders/xx/yy/T/pc2-…).
    // tmpdir() never returns apostrophe-bearing paths. Exercise the pattern
    // with a realistic path that includes spaces and parens (chars that
    // would have broken the buggy pattern if interpolated raw).
    const tmpFile = '/var/folders/xx/yy/T/pc2-sudoers-123 with spaces (test)';
    const dest = '/etc/sudoers.d/pc2-wireguard';

    const cmd = fixedOsascriptCommand(tmpFile, dest);
    const result = shellTokenise(cmd);

    assert.equal(result.error, null, `unexpected tokenise error: ${result.error}`);
    assert.equal(
      result.tokens.length,
      3,
      'fixed pattern must always tokenise into exactly 3 tokens. Got ' +
        `${result.tokens.length}: ${result.tokens.map((t) => JSON.stringify(t)).join(', ')}`,
    );
    assert.equal(result.tokens[0], 'osascript');
    assert.equal(result.tokens[1], '-e');
    // The script token must start with `do shell script` — proves the
    // entire osascript program was preserved as a single argument.
    assert.match(
      result.tokens[2],
      /^do shell script /,
      `fixed pattern produced unexpected -e argument shape: ${result.tokens[2]}`,
    );
  });

  test('FIX: single-quote count in fixed pattern stays at exactly 2 (the outer wrapping quotes only)', () => {
    // Belt-and-braces: the fixed pattern's whole point is that no
    // user-controlled content reaches the shell quoting layer, so the
    // single-quote count in the command string is constant.
    const cmd = fixedOsascriptCommand(
      '/var/folders/typical/macos/tmp/path',
      '/etc/sudoers.d/pc2-wireguard',
    );
    const singleQuoteCount = (cmd.match(/'/g) || []).length;
    assert.equal(
      singleQuoteCount,
      2,
      `fixed pattern must have exactly 2 single quotes (outer wrapping). ` +
        `Got ${singleQuoteCount}. Command: ${cmd}`,
    );
  });

  test('escapeForOsa: backslashes are escaped first, double quotes second (order matters)', () => {
    // Empty → empty.
    assert.equal(escapeForOsa(''), '');
    // No special chars → passthrough.
    assert.equal(escapeForOsa('plain'), 'plain');
    // Quote → escaped quote.
    assert.equal(escapeForOsa('"'), '\\"');
    // Backslash → escaped backslash.
    assert.equal(escapeForOsa('\\'), '\\\\');
    // Pre-existing escape: a backslash followed by a quote in the INPUT
    // becomes \\\\ + \\" in the output. If backslash escaping ran SECOND,
    // we'd double-escape the backslash we just added for the quote and
    // get \\\\\\" (4 backslashes + escaped quote) instead. This test
    // pins the ordering.
    assert.equal(escapeForOsa('\\"'), '\\\\\\"');
    // Apostrophes are intentionally NOT escaped — they're safe inside
    // double-quoted osascript strings. (The fix's safety comes from never
    // putting user-controlled entry text into the osascript command,
    // not from escaping apostrophes inside file paths.)
    assert.equal(escapeForOsa("it's fine"), "it's fine");
  });
});

describe('setupPermissions defence-in-depth (live source scan)', () => {
  test('SENTINEL: production setupPermissions.ts does NOT contain the v1.2.7.10 echo-interpolation anti-pattern in executable code', () => {
    // Pre-v1.2.7.11 buggy code shape — verbatim:
    //   const script = `do shell script "echo \"${entry}\" > ${SUDOERS_FILE}"`;
    //   exec(`osascript -e '${script}'`);
    //
    // The fix replaced `echo`-interpolation with `cp`-from-tmpfile. Any
    // future reversion that goes back to echo-interpolation will trip
    // this check.
    //
    // We strip /* ... */ and // ... comments from the source before
    // searching so doc-comment references to the buggy pattern (which
    // legitimately quote the bad string for explanation) don't false-
    // positive.
    const src = readSourceUtf8(SETUP_PERMISSIONS_SRC);
    const codeOnly = stripComments(src);

    // Two shapes we'd flag as anti-patterns in executable code:
    //   1. A template literal whose contents start with `do shell script "echo `
    //      — the exact form of the buggy `script` assignment.
    //   2. A string literal of `osascript -e '...echo` style — the same
    //      shape inside double-quoted strings.
    // Use anchored substring checks rather than overly-fancy regex; the
    // false-positive surface is low and the failure message is clearer.
    const buggyTemplateMarker = '`do shell script "echo ';
    const buggyStringMarker = 'osascript -e ';

    assert.equal(
      codeOnly.includes(buggyTemplateMarker),
      false,
      `setupPermissions.ts executable code contains the buggy template ` +
        `marker ${JSON.stringify(buggyTemplateMarker)}. ` +
        'v1.2.7.11 replaced echo-interpolation with cp-from-tmpfile (see ' +
        'setupMacOS lines 418-468). If you intentionally re-introduced ' +
        'echo-interpolation, fully escape every single quote in `entry` ' +
        'before passing it to osascript — and even then, the temp-file ' +
        'approach is safer because it cannot leak arbitrary content into ' +
        'the shell quoting layer.',
    );

    // The string `osascript -e ` appearing alone is OK (the fixed pattern
    // uses it too). We only flag if it appears AND `${entry}` /
    // `${someUserControlled}` style interpolation is nearby — but that's
    // fragile to detect statically. The template marker check above is
    // the primary signal; this one is informational.
    // (Intentionally NOT asserting on buggyStringMarker presence.)
    assert.ok(
      codeOnly.includes(buggyStringMarker),
      'sanity check: setupPermissions.ts should still call osascript ' +
        'somewhere — if this assertion fails, the macOS install path may ' +
        'have been removed entirely. Update the test to match the new shape.',
    );
  });

  test('buildSudoersEntry comment template literals contain no apostrophes', () => {
    // Read the live setupPermissions.ts file and find the buildSudoersEntry
    // function body. Each comment line inside is a template literal of the
    // form `# ...comment text...`. If a future refactor adds an apostrophe
    // (e.g. "doesn't", "can't") to one of these comments, AND a separate
    // refactor simultaneously regresses setupMacOS back to interpolating
    // the entry, the production bug returns. This test guards the comment
    // text as defence-in-depth.
    const src = readSourceUtf8(SETUP_PERMISSIONS_SRC);

    const fnStart = src.indexOf('function buildSudoersEntry');
    assert.notEqual(
      fnStart,
      -1,
      `Could not locate buildSudoersEntry in ${SETUP_PERMISSIONS_SRC}. ` +
        'If the function was renamed or moved, update this test to match.',
    );

    // Find the closing `}` for the function. We look for the next line that
    // is exactly `}` (with newline boundaries) — this is brittle if the
    // function ever uses formatter-induced single-line `}` placement, but
    // is fine for the current source style. A heredoc or computed regex
    // would be overkill; rebuild this test if the function shape changes.
    const fnEnd = src.indexOf('\n}\n', fnStart);
    assert.notEqual(
      fnEnd,
      -1,
      'Could not locate buildSudoersEntry closing brace. Source formatting changed?',
    );

    const fnBody = src.slice(fnStart, fnEnd);

    // Extract every template literal on a line whose content (inside the
    // backticks) starts with `#` — i.e. the sudoers entry comment lines.
    // Then check each for apostrophes.
    const offenders = [];
    for (const line of fnBody.split('\n')) {
      // Match `<backtick-content>` where content starts with optional
      // whitespace then `#`. Non-greedy so we don't span across multiple
      // template literals on one line.
      const match = line.match(/`(\s*#[^`]*)`/);
      if (match && match[1].includes("'")) {
        offenders.push(line.trim());
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'Found apostrophe(s) in buildSudoersEntry comment templates. This would ' +
        're-introduce the v1.2.7.11 bug class IF setupMacOS is ever regressed back ' +
        'to interpolating the entry. Rewrite the comment without apostrophes.\n' +
        'Offending lines:\n' +
        offenders.map((l) => `  ${l}`).join('\n'),
    );
  });
});
