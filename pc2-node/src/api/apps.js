/**
 * Apps API Endpoints
 *
 * Handles /apps/:name requests for app metadata
 */
import { logger } from '../utils/logger.js';
/**
 * Get app information by name
 * GET /apps/:name
 * Returns app metadata including index_url
 */
export function handleGetApp(req, res) {
    const appName = req.params.name;
    const baseUrl = req.protocol + '://' + req.get('host');
    logger.info(`[apps.ts] Getting app info for: ${appName}`);
    // App map matching other.ts and info.ts
    const appMap = {
        'editor': {
            name: 'editor',
            title: 'Text Editor',
            uuid: 'app-editor',
            uid: 'app-editor',
            icon: `${baseUrl}/apps/editor/img/icon.svg`,
            index_url: `${baseUrl}/apps/editor/index.html`
        },
        'viewer': {
            name: 'viewer',
            title: 'Image Viewer',
            uuid: 'app-viewer',
            uid: 'app-viewer',
            icon: undefined,
            index_url: `${baseUrl}/apps/viewer/index.html`
        },
        'player': {
            name: 'player',
            title: 'Media Player',
            uuid: 'app-player',
            uid: 'app-player',
            icon: undefined,
            index_url: `${baseUrl}/apps/player/index.html`
        },
        'camera': {
            name: 'camera',
            title: 'Camera',
            uuid: 'app-camera',
            uid: 'app-camera',
            icon: undefined,
            index_url: `${baseUrl}/apps/camera/index.html`
        },
        'app-center': {
            name: 'app-center',
            title: 'App Center',
            uuid: 'app-app-center',
            uid: 'app-app-center',
            icon: undefined,
            index_url: `${baseUrl}/apps/app-center/index.html`
        },
        'pdf': {
            name: 'pdf',
            title: 'PDF',
            uuid: 'app-pdf',
            uid: 'app-pdf',
            icon: undefined,
            index_url: `${baseUrl}/apps/pdf/index.html`
        },
        'terminal': {
            name: 'terminal',
            title: 'Terminal',
            uuid: 'app-terminal',
            uid: 'app-terminal',
            icon: undefined,
            index_url: `${baseUrl}/apps/terminal/index.html`
        },
        'phoenix': {
            name: 'phoenix',
            title: 'Phoenix Shell',
            uuid: 'app-phoenix',
            uid: 'app-phoenix',
            icon: undefined,
            index_url: `${baseUrl}/apps/phoenix/index.html`
        },
        'recorder': {
            name: 'recorder',
            title: 'Recorder',
            uuid: 'app-recorder',
            uid: 'app-recorder',
            icon: undefined,
            index_url: `${baseUrl}/apps/recorder/index.html`
        },
        'solitaire-frvr': {
            name: 'solitaire-frvr',
            title: 'Solitaire FRVR',
            uuid: 'app-solitaire-frvr',
            uid: 'app-solitaire-frvr',
            icon: undefined,
            index_url: `${baseUrl}/apps/solitaire-frvr/index.html`
        },
        'calculator': {
            name: 'calculator',
            title: 'WASM Calculator',
            uuid: 'app-calculator',
            uid: 'app-calculator',
            icon: undefined,
            index_url: `${baseUrl}/apps/calculator/index.html`
        },
        'file-processor': {
            name: 'file-processor',
            title: 'File Processor',
            uuid: 'app-file-processor',
            uid: 'app-file-processor',
            icon: undefined,
            index_url: `${baseUrl}/apps/file-processor/index.html`
        },
        'system-terminal': {
            name: 'system-terminal',
            title: 'System Terminal',
            uuid: 'app-system-terminal',
            uid: 'app-system-terminal',
            icon: undefined,
            index_url: null, // Built-in window, no external URL
            is_builtin: true,
            pc2_exclusive: true // Only available in PC2 node
        }
    };
    // Handle multiple app names separated by |
    const appNames = appName.split('|');
    const results = appNames
        .map(name => appMap[name.trim()])
        .filter(app => app !== undefined);
    if (results.length === 0) {
        logger.warn(`[apps.ts] App not found: ${appName}`);
        res.status(404).json({ error: `App "${appName}" not found` });
        return;
    }
    // Return array if multiple apps, single object if one app
    // (window.get_apps expects array, but launch_app.js expects single object when one app)
    if (results.length === 1) {
        res.json([results[0]]); // Always return array for consistency with Puter API
    }
    else {
        res.json(results);
    }
}
//# sourceMappingURL=apps.js.map