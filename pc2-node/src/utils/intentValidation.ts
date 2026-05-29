/**
 * Publish-intent field validation + normalization.
 *
 * Single source of truth shared by every writer of `publish_intents` rows:
 *   - REST surface  `src/api/intents.ts` (POST / PUT)
 *   - Monetisation Agent tool `update_intent` in
 *     `src/services/ai/tools/ToolExecutor.ts`
 *
 * Centralising these rules (security.mdc / codequality.mdc — no duplication)
 * guarantees the AI-tool write path cannot bypass the same bounds the REST
 * path enforces (category/access enums, copies ≤ 10000, price > 0 for paid
 * modes, royalty address shape + sum-to-100, etc.).
 */

export const VALID_CATEGORIES = ['Photography', 'Video', 'Audio', 'Document', 'Other'];
export const VALID_ACCESS_METHODS = ['free', 'buy_once', 'buy_and_resell'];
export const VALID_LICENSE_PROFILES = [
  'perpetual_personal_view',
  'perpetual_personal_print',
  'share_alike_nc',
  'custom',
];

/**
 * Validate a partial set of intent field updates. Returns an error string
 * or null. Shared so REST POST/PUT and the AI tool path apply identical rules.
 */
export function validateIntentFields(fields: any): string | null {
  if (fields.category !== undefined && fields.category !== null) {
    if (!VALID_CATEGORIES.includes(fields.category)) {
      return `Invalid category. Allowed: ${VALID_CATEGORIES.join(', ')}`;
    }
  }
  if (fields.access_method !== undefined && fields.access_method !== null) {
    if (!VALID_ACCESS_METHODS.includes(fields.access_method)) {
      return `Invalid access_method. Allowed: ${VALID_ACCESS_METHODS.join(', ')}`;
    }
  }
  if (fields.license_profile !== undefined && fields.license_profile !== null) {
    if (!VALID_LICENSE_PROFILES.includes(fields.license_profile)) {
      return `Invalid license_profile. Allowed: ${VALID_LICENSE_PROFILES.join(', ')}`;
    }
  }
  if (fields.copies !== undefined && fields.copies !== null) {
    const c = Number(fields.copies);
    if (!Number.isInteger(c) || c < 1 || c > 10000) {
      return 'copies must be an integer between 1 and 10000';
    }
  }
  if (fields.price !== undefined && fields.price !== null && fields.price !== '') {
    // Price arrives stringified to preserve precision; non-free access modes need >0
    try {
      const big = BigInt(fields.price);
      if (fields.access_method && fields.access_method !== 'free' && big <= 0n) {
        return 'price must be > 0 for non-free access modes';
      }
    } catch {
      return 'price must be a stringified integer (wei or smallest unit)';
    }
  }
  if (fields.channel !== undefined && fields.channel !== null && fields.channel !== '') {
    if (typeof fields.channel !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(fields.channel)) {
      return 'channel must be a 0x-prefixed 40-hex-char address';
    }
  }
  if (fields.royalty_partners !== undefined && fields.royalty_partners !== null) {
    // Accept either array (will be JSON-stringified server-side) or pre-stringified
    let partners: any[] | null = null;
    if (Array.isArray(fields.royalty_partners)) {
      partners = fields.royalty_partners;
    } else if (typeof fields.royalty_partners === 'string') {
      try { partners = JSON.parse(fields.royalty_partners); } catch { return 'royalty_partners must be valid JSON'; }
    }
    if (partners && Array.isArray(partners)) {
      let totalPercent = 0;
      for (const p of partners) {
        if (!p || typeof p !== 'object') return 'each royalty partner must be an object';
        if (typeof p.address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(p.address)) {
          return 'royalty partner address must be a 0x-prefixed 40-hex-char address';
        }
        const pct = Number(p.percent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          return 'royalty partner percent must be a number 0-100';
        }
        totalPercent += pct;
      }
      // Allow small float rounding (e.g. 33.33+33.33+33.34)
      if (partners.length > 0 && Math.abs(totalPercent - 100) > 0.05) {
        return `royalty partner percents must sum to 100 (got ${totalPercent.toFixed(2)})`;
      }
    }
  }
  if (fields.tags !== undefined && fields.tags !== null) {
    // Accept array or comma-separated string; normalize server-side
    if (!Array.isArray(fields.tags) && typeof fields.tags !== 'string') {
      return 'tags must be an array of strings or a comma-separated string';
    }
  }
  return null;
}

/**
 * Normalize incoming fields for DB insertion: array → JSON string, etc.
 */
export function normalizeForDb(fields: any): any {
  const out: any = { ...fields };
  if (Array.isArray(out.royalty_partners)) {
    out.royalty_partners = JSON.stringify(out.royalty_partners);
  }
  if (Array.isArray(out.tags)) {
    out.tags = JSON.stringify(out.tags);
  }
  return out;
}
