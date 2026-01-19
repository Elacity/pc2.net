import { Express } from 'express';
export interface StaticOptions {
    frontendPath: string;
    isProduction: boolean;
}
/**
 * Setup production-grade static file serving
 *
 * Features:
 * - Proper MIME type detection
 * - Cache headers (different for assets vs HTML)
 * - SPA fallback (only for non-API routes)
 * - Error handling
 * - Security headers
 */
export declare function setupStaticServing(app: Express, options: StaticOptions): void;
//# sourceMappingURL=static.d.ts.map