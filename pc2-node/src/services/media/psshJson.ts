/**
 * Box-walking PSSH decoder for Elacity Lit-DRM payloads.
 *
 * Walks the ISO BMFF box tree (ISO/IEC 14496-12) and parses every `pssh`
 * box (ISO/IEC 23001-7 §8.1) found at file-root or under `moov`. Returns
 * the JSON envelopes whose `data.actionIpfsId` indicates they are
 * Elacity-shaped (Lit-DRM protection metadata).
 *
 * Independent of pssh `systemId` and of JSON key order — the previous
 * substring-marker scan missed bento4 `mp4dash` payloads whose
 * alphabetical-first key is `algorithm` rather than `protocolVersion`.
 *
 * Lives outside `src/api/media.ts` so unit tests can exercise it without
 * importing the Express stack (which transitively pulls in
 * `mediaSessionManager`'s never-unref'd cleanup `setInterval` and hangs
 * Node's event loop after tests pass).
 */
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('pssh-json');

export interface PSSHJsonEntry {
  protectionType: string;
  data: any;
}

export function extractPSSHJson(initSegment: Buffer): PSSHJsonEntry[] {
  const results: PSSHJsonEntry[] = [];

  const walk = (start: number, end: number) => {
    let off = start;
    while (off + 8 <= end) {
      let size = initSegment.readUInt32BE(off);
      const type = initSegment.toString('ascii', off + 4, off + 8);
      let headerLen = 8;
      if (size === 1) {
        if (off + 16 > end) break;
        const hi = initSegment.readUInt32BE(off + 8);
        const lo = initSegment.readUInt32BE(off + 12);
        size = hi * 0x1_0000_0000 + lo;
        headerLen = 16;
      } else if (size === 0) {
        size = end - off;
      }
      if (size < headerLen || off + size > end) break;

      if (type === 'pssh') {
        try {
          const entry = parsePsshBox(initSegment.subarray(off + headerLen, off + size));
          if (entry) results.push(entry);
        } catch (e) {
          logger.warn(`Skipping malformed pssh at offset ${off}: ${(e as Error).message}`);
        }
      } else if (type === 'moov') {
        walk(off + headerLen, off + size);
      }
      off += size;
    }
  };

  walk(0, initSegment.length);

  logger.info(`Extracted ${results.length} PSSH entries from init segment (${initSegment.length} bytes)`);
  return results;
}

function parsePsshBox(body: Buffer): PSSHJsonEntry | null {
  if (body.length < 4 + 16 + 4) return null;
  const version = body.readUInt8(0);
  // flags: body[1..3] — ignored
  let off = 4 + 16; // skip ver/flags + systemId
  if (version >= 1) {
    if (off + 4 > body.length) return null;
    const kidCount = body.readUInt32BE(off);
    off += 4 + kidCount * 16;
    if (off > body.length) return null;
  }
  if (off + 4 > body.length) return null;
  const dataSize = body.readUInt32BE(off);
  off += 4;
  if (dataSize === 0 || off + dataSize > body.length) return null;

  const dataBytes = body.subarray(off, off + dataSize);
  let parsed: any;
  try {
    parsed = JSON.parse(dataBytes.toString('utf8'));
  } catch {
    return null; // non-JSON pssh data (e.g. raw ClearKey) — not ours
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.data?.actionIpfsId) return null;
  return {
    protectionType: parsed.protectionType || 'unknown',
    data: parsed.data,
  };
}
