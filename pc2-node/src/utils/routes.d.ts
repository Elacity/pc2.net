/**
 * Route Utilities
 *
 * Helper functions for route detection and handling
 */
/**
 * Check if a path is an API route
 * API routes should not be handled by static file serving or SPA fallback
 */
export declare function isAPIRoute(path: string): boolean;
/**
 * Check if a path is a static asset (has file extension)
 */
export declare function isStaticAsset(path: string): boolean;
//# sourceMappingURL=routes.d.ts.map