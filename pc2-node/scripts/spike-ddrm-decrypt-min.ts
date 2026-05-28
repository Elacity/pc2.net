/**
 * Minimal spike — call exports that don't touch RNG/clock/crypto first to
 * narrow down where the `unreachable` trap originates.
 */
import { WasmDdrmDecryptRuntime } from '../src/services/wasm/WasmDdrmDecryptRuntime.js';

async function main() {
  const rt = WasmDdrmDecryptRuntime.get();
  await rt.ensureLoaded();
  console.log('[min] loaded OK');

  // Step 1: pure registry read — no RNG, no clock, no crypto.
  const c0 = await rt.sessionCount();
  console.log(`[min] sessionCount() = ${c0}`);

  // Step 2: lookup of unknown id — touches HashMap + string conversion only.
  const nf = await rt.sessionLookup('00000000-0000-0000-0000-000000000000');
  console.log(`[min] sessionLookup(unknown) = ${nf}`);

  // Step 3: now try session_create. This touches OsRng (getrandom) +
  // SystemTime::now() (WASI clock_time_get) + p256 key gen + uuid v4.
  console.log('[min] calling sessionCreate…');
  const s = await rt.sessionCreate();
  console.log(`[min] sessionCreate OK: handle=${s.handle} id=${s.sessionId}`);
}

main().catch((err) => { console.error('[min] FAILED:', err); process.exit(1); });
