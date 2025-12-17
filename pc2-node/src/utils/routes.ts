/**
 * Route Utilities
 * 
 * Helper functions for route detection and handling
 */

/**
 * Check if a path is an API route
 * API routes should not be handled by static file serving or SPA fallback
 */
export function isAPIRoute(path: string): boolean {
  // API routes
  if (path.startsWith('/api/')) {
    return true;
  }

  // Authentication routes
  if (path.startsWith('/auth/')) {
    return true;
  }

  // Puter API endpoints (for compatibility)
  const puterEndpoints = [
    '/whoami',
    '/stat',
    '/read',
    '/write',
    '/mkdir',
    '/readdir',
    '/delete',
    '/move',
    '/rename',
    '/sign',
    '/version',
    '/os/user',
    '/kv/',
    '/rao',
    '/contactUs',
    '/open_item',
    '/suggest_apps',
    '/file',
    '/itemMetadata',
    '/writeFile',
    '/drivers/call',
    '/get-launch-apps',
    '/cache/',
    '/batch',
    '/df'
  ];

  for (const endpoint of puterEndpoints) {
    if (path.startsWith(endpoint)) {
      return true;
    }
  }

  // WebSocket
  if (path.startsWith('/socket.io/')) {
    return true;
  }

  // Health check
  if (path === '/health') {
    return true;
  }

  return false;
}

/**
 * Check if a path is a static asset (has file extension)
 */
export function isStaticAsset(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) {
    return false;
  }

  // Common static file extensions
  const staticExtensions = [
    'js', 'css', 'json', 'xml', 'txt',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'mp4', 'mp3', 'wav', 'ogg',
    'pdf', 'zip', 'tar', 'gz'
  ];

  return staticExtensions.includes(ext);
}

