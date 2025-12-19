import { logger } from '../utils/logger.js';
export function handleSign(req, res) {
    const filesystem = req.app.locals.filesystem;
    const body = req.body;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!body.items || !Array.isArray(body.items)) {
        res.status(400).json({ error: 'Missing or invalid items array' });
        return;
    }
    try {
        const signatures = [];
        for (const item of body.items) {
            if (!item.uid && !item.path) {
                continue;
            }
            let filePath = null;
            if (item.path) {
                filePath = item.path;
            }
            else if (item.uid) {
                const uuidPath = item.uid.replace(/^uuid-/, '');
                filePath = '/' + uuidPath.replace(/-/g, '/');
            }
            if (!filePath) {
                continue;
            }
            const metadata = filesystem.getFileMetadata(filePath, req.user.wallet_address);
            if (!metadata) {
                continue;
            }
            const expires = Math.ceil(Date.now() / 1000) + 999999999;
            const action = item.action || 'read';
            const signature = `sig-${filePath}-${action}-${expires}`;
            const origin = req.headers.origin || req.headers.host;
            const isHttps = origin && typeof origin === 'string' && origin.startsWith('https://');
            const baseUrl = isHttps
                ? `https://${origin.replace(/^https?:\/\//, '').split('/')[0]}`
                : `http://${req.headers.host || 'localhost:4200'}`;
            const fileUid = `uuid-${filePath.replace(/\//g, '-')}`;
            signatures.push({
                uid: fileUid,
                expires: expires,
                signature: signature,
                url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
                read_url: `${baseUrl}/file?uid=${fileUid}&expires=${expires}&signature=${signature}`,
                write_url: `${baseUrl}/writeFile?uid=${fileUid}&expires=${expires}&signature=${signature}`,
                metadata_url: `${baseUrl}/itemMetadata?uid=${fileUid}&expires=${expires}&signature=${signature}`,
                fsentry_type: metadata.mime_type || 'application/octet-stream',
                fsentry_is_dir: metadata.is_dir,
                fsentry_name: metadata.path.split('/').pop() || '',
                fsentry_size: metadata.size,
                fsentry_modified: metadata.updated_at,
                fsentry_created: metadata.created_at,
                path: filePath
            });
        }
        const appToken = `token-${req.user.wallet_address}-${Date.now()}`;
        const response = {
            token: appToken,
            signatures: signatures
        };
        res.json(response);
    }
    catch (error) {
        logger.error('Sign error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Failed to sign files',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export function handleVersion(req, res) {
    res.json({
        version: '2.5.1',
        server: 'localhost',
        deployed: new Date().toISOString()
    });
}
export function handleOSUser(req, res) {
    const { handleWhoami } = require('./whoami.js');
    handleWhoami(req, res);
}
export function handleKV(req, res) {
    const db = req.app.locals.db;
    const key = req.params.key || req.path.replace('/kv/', '').replace('/api/kv/', '');
    if (!db) {
        res.status(500).json({ error: 'Database not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const kvKey = `${req.user.wallet_address}:${key}`;
        if (req.method === 'GET') {
            const value = db.getSetting(kvKey);
            if (value === null) {
                res.send('null');
            }
            else if (typeof value === 'string') {
                res.send(value);
            }
            else {
                res.json(value);
            }
        }
        else if (req.method === 'POST') {
            const value = req.body.value !== undefined ? req.body.value : req.body;
            db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
            res.json({ success: true });
        }
        else if (req.method === 'DELETE') {
            db.deleteSetting(kvKey);
            res.json({ success: true });
        }
    }
    catch (error) {
        logger.error('KV error:', error instanceof Error ? error.message : 'Unknown error', { key });
        res.status(500).json({
            error: 'KV operation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export function handleRAO(req, res) {
    res.json({ code: 'ok', message: 'ok' });
}
export function handleContactUs(req, res) {
    res.json({ success: true });
}
export function handleDriversCall(req, res) {
    const db = req.app.locals.db;
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
            req.body = body;
        }
        catch (e) {
            logger.error('[Drivers] Failed to parse string body:', e);
            body = {};
        }
    }
    if (!req.user) {
        logger.warn('[Drivers] Unauthorized request - no user');
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
    }
    const rawBody = req.rawBody;
    console.log(`[Drivers] ========== REQUEST RECEIVED ==========`);
    console.log(`[Drivers] Request from ${req.user.wallet_address}`);
    console.log(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
    console.log(`[Drivers] Raw body (captured): ${rawBody ? rawBody.substring(0, 500) : 'NOT CAPTURED'} (length: ${rawBody?.length || 0})`);
    console.log(`[Drivers] Body type: ${typeof body}, is object: ${typeof body === 'object' && body !== null}`);
    console.log(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
    console.log(`[Drivers] interface=${body?.interface || 'missing'}, driver=${body?.driver || 'missing'}, method=${body?.method || 'missing'}`);
    console.log(`[Drivers] Full body:`, JSON.stringify(body || {}, null, 2));
    console.log(`[Drivers] Raw req.body:`, JSON.stringify(req.body || {}, null, 2));
    console.log(`[Drivers] Query params:`, JSON.stringify(req.query));
    console.log(`[Drivers] Request URL: ${req.url}`);
    console.log(`[Drivers] Request method: ${req.method}`);
    console.log(`[Drivers] ========================================`);
    logger.info(`[Drivers] Request from ${req.user.wallet_address}`);
    logger.info(`[Drivers] Content-Type: ${req.get('Content-Type')}`);
    logger.info(`[Drivers] Raw body: ${rawBody ? rawBody.substring(0, 200) : 'NOT CAPTURED'}`);
    logger.info(`[Drivers] Body keys: ${body && typeof body === 'object' ? Object.keys(body).join(', ') : 'N/A'}`);
    const bodyKeys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    const isEmptyBody = !body || typeof body !== 'object' || Array.isArray(body) || bodyKeys.length === 0;
    if (isEmptyBody) {
        logger.info('[Drivers] Empty or minimal request body, attempting to handle gracefully');
        const appNameFromQuery = req.query.name || req.query.app || req.query.id;
        if (appNameFromQuery) {
            logger.info(`[Drivers] Found app name in query params: ${appNameFromQuery}, treating as puter-apps request`);
            const baseUrl = req.protocol + '://' + req.get('host');
            const appMap = {
                'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: `${baseUrl}/apps/editor/img/icon.svg`, index_url: `${baseUrl}/apps/editor/index.html` },
                'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: undefined, index_url: `${baseUrl}/apps/viewer/index.html` },
                'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: undefined, index_url: `${baseUrl}/apps/player/index.html` },
                'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: undefined, index_url: `${baseUrl}/apps/camera/index.html` },
                'app-center': { name: 'app-center', title: 'App Center', uuid: 'app-app-center', uid: 'app-app-center', icon: undefined, index_url: `${baseUrl}/apps/app-center/index.html` },
                'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: undefined, index_url: `${baseUrl}/apps/pdf/index.html` },
                'terminal': { name: 'terminal', title: 'Terminal', uuid: 'app-terminal', uid: 'app-terminal', icon: undefined, index_url: `${baseUrl}/apps/terminal/index.html` },
                'phoenix': { name: 'phoenix', title: 'Phoenix Shell', uuid: 'app-phoenix', uid: 'app-phoenix', icon: undefined, index_url: `${baseUrl}/apps/phoenix/index.html` },
                'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: undefined, index_url: `${baseUrl}/apps/recorder/index.html` },
                'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: undefined, index_url: `${baseUrl}/apps/solitaire-frvr/index.html` }
            };
            const appInfo = appMap[String(appNameFromQuery)];
            if (appInfo) {
                res.json({ success: true, result: appInfo });
                return;
            }
        }
        logger.info('[Drivers] Empty body, returning null result');
        res.json({ success: true, result: null });
        return;
    }
    if (!body.interface && body.driver) {
        logger.info(`[Drivers] Converting 'driver' to 'interface': ${body.driver}`);
        body.interface = body.driver;
    }
    try {
        if (body.interface === 'puter-kvstore') {
            const method = body.method;
            const key = body.args?.key;
            const wallet = req.user.wallet_address;
            const kvKey = `${wallet}:${key}`;
            if (method === 'get') {
                const value = db?.getSetting?.(kvKey);
                res.json({ success: true, result: value !== undefined ? value : null });
            }
            else if (method === 'set') {
                const value = body.args?.value !== undefined ? body.args.value : body.args?.va;
                if (db?.setSetting) {
                    db.setSetting(kvKey, typeof value === 'string' ? value : JSON.stringify(value));
                }
                res.json({ success: true, result: value });
            }
            else if (method === 'list') {
                const pattern = body.args?.pattern || key || '*';
                const prefix = (pattern && typeof pattern === 'string') ? pattern.replace(/\*$/, '') : '';
                const walletPrefix = `${wallet}:${prefix}`;
                const matchingKeys = [];
                if (db?.listSettings) {
                    const allSettings = db.listSettings();
                    for (const [storedKey, _] of Object.entries(allSettings)) {
                        if (typeof storedKey === 'string' && storedKey.startsWith(walletPrefix)) {
                            const keyWithoutWallet = storedKey.substring(wallet.length + 1);
                            matchingKeys.push(keyWithoutWallet);
                        }
                    }
                }
                res.json({ success: true, result: matchingKeys });
            }
            else if (method === 'delete') {
                if (db?.deleteSetting) {
                    db.deleteSetting(kvKey);
                }
                res.json({ success: true, result: true });
            }
            else {
                res.status(400).json({ success: false, error: 'Unknown method' });
            }
            return;
        }
        if (body.interface === 'puter-apps' || body.interface === 'apps') {
            const method = body.method || 'read';
            let appName = body.args?.id?.name || body.args?.name || body.name;
            if (!appName && typeof body.args?.id === 'string') {
                appName = body.args.id;
            }
            if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
                appName = body.args.id.name;
            }
            const baseUrl = req.protocol + '://' + req.get('host');
            logger.info(`[Drivers] puter-apps request: method=${method}, appName=${appName}, args=`, JSON.stringify(body.args || {}));
            if (method === 'read' || !method) {
                if (!appName) {
                    logger.warn(`[Drivers] puter-apps read request but no app name found in args`);
                    res.json({ success: true, result: null });
                    return;
                }
                logger.info(`[Drivers] Looking up app: ${appName}`);
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
                    }
                };
                const appInfo = appName ? appMap[appName] : null;
                if (appInfo) {
                    logger.info(`[Drivers] Returning app info for: ${appName}`);
                    res.json({ success: true, result: appInfo });
                }
                else {
                    logger.warn(`[Drivers] App not found in appMap: ${appName}`);
                    res.json({ success: true, result: null });
                }
                return;
            }
            else if (method === 'list') {
                res.json({ success: true, result: [] });
                return;
            }
            else {
                res.status(400).json({ success: false, error: 'Unknown method' });
                return;
            }
        }
        if (body.interface === 'puter-subdomains') {
            logger.info('[Drivers] puter-subdomains request - returning empty list (subdomains not used in PC2)');
            res.json({ success: true, result: [] });
            return;
        }
        logger.warn(`[Drivers] Unknown interface: ${body.interface || 'missing'}, body:`, JSON.stringify(body));
        const hasAppLookupStructure = body.driver === 'puter-apps' || body.driver === 'apps' ||
            (!body.interface && !body.driver && (body.args?.id || body.name || body.args?.name));
        if (hasAppLookupStructure || (bodyKeys.length === 0 && req.method === 'POST')) {
            logger.info(`[Drivers] Attempting to handle as puter-apps request (hasStructure=${hasAppLookupStructure}, emptyBody=${bodyKeys.length === 0})`);
            logger.info(`[Drivers] Detected puter-apps request format (driver=${body.driver || 'none'}, has args=${!!body.args}, has name=${!!body.name})`);
            body.interface = 'puter-apps';
            const method = body.method || 'read';
            let appName = body.args?.id?.name || body.args?.name || body.name;
            if (!appName && typeof body.args?.id === 'string') {
                appName = body.args.id;
            }
            if (!appName && body.args?.id && typeof body.args.id === 'object' && body.args.id.name) {
                appName = body.args.id.name;
            }
            if (!appName && bodyKeys.length === 0) {
                logger.warn(`[Drivers] Cannot determine app name from empty body. Request might be malformed.`);
                res.status(400).json({
                    success: false,
                    error: 'Cannot determine app name from empty request body. Expected format: { interface: "puter-apps", method: "read", args: { id: { name: "app-name" } } }'
                });
                return;
            }
            const baseUrl = req.protocol + '://' + req.get('host');
            logger.info(`[Drivers] puter-apps (driver format): method=${method}, appName=${appName}`);
            if (method === 'read' || !method) {
                const appMap = {
                    'editor': { name: 'editor', title: 'Text Editor', uuid: 'app-editor', uid: 'app-editor', icon: `${baseUrl}/apps/editor/img/icon.svg`, index_url: `${baseUrl}/apps/editor/index.html` },
                    'viewer': { name: 'viewer', title: 'Image Viewer', uuid: 'app-viewer', uid: 'app-viewer', icon: undefined, index_url: `${baseUrl}/apps/viewer/index.html` },
                    'player': { name: 'player', title: 'Media Player', uuid: 'app-player', uid: 'app-player', icon: undefined, index_url: `${baseUrl}/apps/player/index.html` },
                    'camera': { name: 'camera', title: 'Camera', uuid: 'app-camera', uid: 'app-camera', icon: undefined, index_url: `${baseUrl}/apps/camera/index.html` },
                    'app-center': { name: 'app-center', title: 'App Center', uuid: 'app-app-center', uid: 'app-app-center', icon: undefined, index_url: `${baseUrl}/apps/app-center/index.html` },
                    'pdf': { name: 'pdf', title: 'PDF', uuid: 'app-pdf', uid: 'app-pdf', icon: undefined, index_url: `${baseUrl}/apps/pdf/index.html` },
                    'terminal': { name: 'terminal', title: 'Terminal', uuid: 'app-terminal', uid: 'app-terminal', icon: undefined, index_url: `${baseUrl}/apps/terminal/index.html` },
                    'phoenix': { name: 'phoenix', title: 'Phoenix Shell', uuid: 'app-phoenix', uid: 'app-phoenix', icon: undefined, index_url: `${baseUrl}/apps/phoenix/index.html` },
                    'recorder': { name: 'recorder', title: 'Recorder', uuid: 'app-recorder', uid: 'app-recorder', icon: undefined, index_url: `${baseUrl}/apps/recorder/index.html` },
                    'solitaire-frvr': { name: 'solitaire-frvr', title: 'Solitaire FRVR', uuid: 'app-solitaire-frvr', uid: 'app-solitaire-frvr', icon: undefined, index_url: `${baseUrl}/apps/solitaire-frvr/index.html` }
                };
                const appInfo = appName ? appMap[appName] : null;
                if (appInfo) {
                    logger.info(`[Drivers] Found app: ${appName}, returning app info`);
                    res.json({ success: true, result: appInfo });
                }
                else {
                    logger.warn(`[Drivers] App not found: ${appName}`);
                    res.json({ success: true, result: null });
                }
                return;
            }
        }
        const errorMsg = bodyKeys.length === 0
            ? `Empty request body. Expected format: { interface: 'puter-apps', method: 'read', args: { id: { name: 'app-name' } } }`
            : `Unknown interface: ${body.interface || 'missing'}. Body keys: ${bodyKeys.join(', ')}`;
        res.status(400).json({ success: false, error: errorMsg });
    }
    catch (error) {
        logger.error('[Drivers] Call error:', error instanceof Error ? error.message : 'Unknown error');
        logger.error('[Drivers] Error stack:', error instanceof Error ? error.stack : 'No stack');
        res.status(500).json({
            success: false,
            error: 'Driver call failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
function findFileCaseInsensitive(filesystem, filePath, walletAddress) {
    let metadata = filesystem.getFileMetadata(filePath, walletAddress);
    if (metadata) {
        return { metadata, resolvedPath: filePath };
    }
    if (!filePath.includes('/')) {
        return null;
    }
    const pathParts = filePath.split('/').filter(p => p);
    if (pathParts.length === 0) {
        return null;
    }
    let currentPath = '/';
    let resolvedPathParts = [];
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isLast = i === pathParts.length - 1;
        if (i === 0 && part.toLowerCase() === walletAddress.toLowerCase()) {
            resolvedPathParts.push(walletAddress);
            currentPath = `/${walletAddress}`;
            if (isLast) {
                const walletDirMetadata = filesystem.getFileMetadata(`/${walletAddress}`, walletAddress);
                if (walletDirMetadata) {
                    return { metadata: walletDirMetadata, resolvedPath: `/${walletAddress}` };
                }
            }
            continue;
        }
        try {
            const entries = filesystem.listDirectory(currentPath, walletAddress);
            const matchingEntry = entries.find(e => {
                const entryName = e.path.split('/').filter(p => p).pop() || '';
                return entryName.toLowerCase() === part.toLowerCase();
            });
            if (!matchingEntry) {
                logger.warn('[findFileCaseInsensitive] Component not found', {
                    currentPath,
                    part,
                    availableEntries: entries.map(e => e.path.split('/').pop() || '')
                });
                return null;
            }
            const entryName = matchingEntry.path.split('/').filter(p => p).pop() || '';
            resolvedPathParts.push(entryName);
            if (isLast) {
                return { metadata: matchingEntry, resolvedPath: matchingEntry.path };
            }
            else {
                currentPath = matchingEntry.path;
            }
        }
        catch (e) {
            logger.error('[findFileCaseInsensitive] Error listing directory', {
                currentPath,
                error: e instanceof Error ? e.message : String(e)
            });
            return null;
        }
    }
    return null;
}
export async function handleOpenItem(req, res) {
    logger.info('[OpenItem] Handler called', { path: req.path, method: req.method, hasUser: !!req.user });
    const filesystem = req.app.locals.filesystem;
    const body = req.body;
    if (!filesystem) {
        logger.error('[OpenItem] Filesystem not initialized');
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        logger.error('[OpenItem] No user in request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const fileUid = body.uid;
    let filePath = body.path;
    logger.info('[OpenItem] Request received', { uid: fileUid, path: filePath });
    if (filePath && filePath.startsWith('~')) {
        filePath = filePath.replace('~', `/${req.user.wallet_address}`);
    }
    else if (filePath && !filePath.startsWith('/')) {
        filePath = `/${req.user.wallet_address}/${filePath}`;
    }
    let metadata = null;
    if (filePath) {
        const result = findFileCaseInsensitive(filesystem, filePath, req.user.wallet_address);
        if (result) {
            metadata = result.metadata;
            filePath = result.resolvedPath;
        }
    }
    if (!metadata && fileUid) {
        let uuidPath = fileUid.replace(/^uuid-+/, '');
        let potentialPath = '/' + uuidPath.replace(/-/g, '/');
        logger.warn('[OpenItem] Falling back to UID-based lookup (may fail with hyphens in filename)', {
            uid: fileUid,
            potentialPath
        });
        const result = findFileCaseInsensitive(filesystem, potentialPath, req.user.wallet_address);
        if (result) {
            metadata = result.metadata;
            filePath = result.resolvedPath;
        }
    }
    if (!metadata) {
        logger.warn('[OpenItem] File not found', { uid: fileUid, path: filePath });
        res.status(404).json({
            error: {
                code: 'subject_does_not_exist',
                message: 'File not found'
            }
        });
        return;
    }
    logger.info('[OpenItem] File found', { path: metadata.path, mimeType: metadata.mime_type });
    const fileName = metadata.path.split('/').pop() || '';
    const fsname = fileName.toLowerCase();
    const baseUrl = req.protocol + '://' + req.get('host');
    let appUid;
    let appName;
    let appIndexUrl;
    if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') ||
        fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg') ||
        fsname.endsWith('.gif')) {
        appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
        appName = 'viewer';
        appIndexUrl = `${baseUrl}/apps/viewer/index.html`;
    }
    else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') ||
        fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') ||
        fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi') ||
        fsname.endsWith('.wav') || fsname.endsWith('.flac')) {
        appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
        appName = 'player';
        appIndexUrl = `${baseUrl}/apps/player/index.html`;
    }
    else if (fsname.endsWith('.pdf')) {
        appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
        appName = 'pdf';
        appIndexUrl = `${baseUrl}/apps/pdf/index.html`;
    }
    else {
        appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
        appName = 'editor';
        appIndexUrl = `${baseUrl}/apps/editor/index.html`;
    }
    const actualFileUid = fileUid || `uuid-${metadata.path.replace(/\//g, '-')}`;
    const expires = Math.ceil(Date.now() / 1000) + 9999999999999;
    const signature = `sig-${actualFileUid}-${expires}`;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = metadata.path.startsWith('/') ? metadata.path : '/' + metadata.path;
    const signatureObj = {
        uid: actualFileUid,
        expires: expires,
        signature: signature,
        url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
        read_url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
        write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
        metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
        fsentry_type: metadata.mime_type || 'application/octet-stream',
        fsentry_is_dir: metadata.is_dir,
        fsentry_name: fileName,
        fsentry_size: metadata.size,
        fsentry_accessed: metadata.updated_at,
        fsentry_modified: metadata.updated_at,
        fsentry_created: metadata.created_at,
        path: cleanPath,
    };
    const token = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const app = {
        uid: appUid,
        uuid: appUid,
        name: appName,
        title: appName.charAt(0).toUpperCase() + appName.slice(1),
        index_url: appIndexUrl,
        approved_for_opening_items: true,
    };
    logger.info('[OpenItem] Returning app info', { appName, indexUrl: appIndexUrl });
    res.json({
        signature: signatureObj,
        token: token,
        suggested_apps: [app],
    });
}
export async function handleSuggestApps(req, res) {
    logger.info('[SuggestApps] Handler called', { path: req.path, method: req.method, hasUser: !!req.user });
    const filesystem = req.app.locals.filesystem;
    const body = req.body;
    if (!filesystem) {
        logger.error('[SuggestApps] Filesystem not initialized');
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        logger.error('[SuggestApps] No user in request');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const fileUid = body.uid;
    let filePath = body.path;
    logger.info('[SuggestApps] Request received', { uid: fileUid, path: filePath });
    if (filePath && filePath.startsWith('~')) {
        filePath = filePath.replace('~', `/${req.user.wallet_address}`);
    }
    else if (filePath && !filePath.startsWith('/')) {
        filePath = `/${req.user.wallet_address}/${filePath}`;
    }
    let metadata = null;
    if (fileUid) {
        let uuidPath = fileUid.replace(/^uuid-+/, '');
        let potentialPath = '/' + uuidPath.replace(/-/g, '/');
        const pathParts = potentialPath.split('/').filter(p => p);
        if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
            potentialPath = '/' + pathParts.join('/');
        }
        const result = findFileCaseInsensitive(filesystem, potentialPath, req.user.wallet_address);
        if (result) {
            metadata = result.metadata;
            filePath = result.resolvedPath;
        }
    }
    if (!metadata && filePath) {
        const result = findFileCaseInsensitive(filesystem, filePath, req.user.wallet_address);
        if (result) {
            metadata = result.metadata;
            filePath = result.resolvedPath;
        }
    }
    if (!metadata) {
        logger.warn('[SuggestApps] File not found', { uid: fileUid, path: filePath });
        res.status(404).json({ error: 'File not found' });
        return;
    }
    logger.info('[SuggestApps] File found', { path: metadata.path, mimeType: metadata.mime_type });
    const fileName = metadata.path.split('/').pop() || '';
    const fsname = fileName.toLowerCase();
    const baseUrl = req.protocol + '://' + req.get('host');
    let appUid;
    let appName;
    let appIndexUrl;
    if (fsname.endsWith('.jpg') || fsname.endsWith('.png') || fsname.endsWith('.webp') ||
        fsname.endsWith('.svg') || fsname.endsWith('.bmp') || fsname.endsWith('.jpeg') ||
        fsname.endsWith('.gif')) {
        appUid = 'app-7870be61-8dff-4a99-af64-e9ae6811e367';
        appName = 'viewer';
        appIndexUrl = `${baseUrl}/apps/viewer/index.html`;
    }
    else if (fsname.endsWith('.mp4') || fsname.endsWith('.webm') || fsname.endsWith('.mpg') ||
        fsname.endsWith('.mpv') || fsname.endsWith('.mp3') || fsname.endsWith('.m4a') ||
        fsname.endsWith('.ogg') || fsname.endsWith('.mov') || fsname.endsWith('.avi') ||
        fsname.endsWith('.wav') || fsname.endsWith('.flac')) {
        appUid = 'app-11edfba2-1ed3-4e22-8573-47e88fb87d70';
        appName = 'player';
        appIndexUrl = `${baseUrl}/apps/player/index.html`;
    }
    else if (fsname.endsWith('.pdf')) {
        appUid = 'app-3920851d-bda8-479b-9407-8517293c7d44';
        appName = 'pdf';
        appIndexUrl = `${baseUrl}/apps/pdf/index.html`;
    }
    else {
        appUid = 'app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58';
        appName = 'editor';
        appIndexUrl = `${baseUrl}/apps/editor/index.html`;
    }
    const app = {
        uid: appUid,
        uuid: appUid,
        name: appName,
        title: appName.charAt(0).toUpperCase() + appName.slice(1),
        index_url: appIndexUrl,
    };
    const actualFileUid = fileUid || `uuid-${metadata.path.replace(/\//g, '-')}`;
    const expires = Math.ceil(Date.now() / 1000) + 9999999999999;
    const signature = `sig-${actualFileUid}-${expires}`;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = metadata.path.startsWith('/') ? metadata.path : '/' + metadata.path;
    const signatureObj = {
        uid: actualFileUid,
        expires: expires,
        signature: signature,
        url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
        read_url: `${cleanBaseUrl}/read?file=${encodeURIComponent(cleanPath)}`,
        write_url: `${cleanBaseUrl}/writeFile?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
        metadata_url: `${cleanBaseUrl}/itemMetadata?uid=${actualFileUid}&expires=${expires}&signature=${signature}`,
        fsentry_type: metadata.mime_type || 'application/octet-stream',
        fsentry_is_dir: metadata.is_dir,
        fsentry_name: fileName,
        fsentry_size: metadata.size,
        fsentry_accessed: metadata.updated_at,
        fsentry_modified: metadata.updated_at,
        fsentry_created: metadata.created_at,
        path: cleanPath,
    };
    logger.info('[SuggestApps] Returning app info', { appName, indexUrl: appIndexUrl });
    res.json({
        signature: signatureObj,
        suggested_apps: [app],
    });
}
export function handleItemMetadata(req, res) {
    const filesystem = req.app.locals.filesystem;
    const fileUid = req.query.uid;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!fileUid) {
        res.status(400).json({ error: 'Missing uid parameter' });
        return;
    }
    logger.info('[ItemMetadata] Request received', { uid: fileUid });
    const uuidPath = fileUid.replace(/^uuid-+/, '');
    let potentialPath = '/' + uuidPath.replace(/-/g, '/');
    const pathParts = potentialPath.split('/').filter(p => p);
    if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
        potentialPath = '/' + pathParts.join('/');
    }
    const metadata = filesystem.getFileMetadata(potentialPath, req.user.wallet_address);
    if (!metadata) {
        logger.warn('[ItemMetadata] File not found', { uid: fileUid, convertedPath: potentialPath });
        res.status(404).json({ error: 'File not found' });
        return;
    }
    logger.info('[ItemMetadata] File found', { path: metadata.path });
    res.json({
        uid: fileUid,
        name: metadata.path.split('/').pop() || '',
        path: metadata.path,
        is_dir: metadata.is_dir,
        size: metadata.size,
        type: metadata.mime_type || 'application/octet-stream',
        created: new Date(metadata.created_at).toISOString(),
        modified: new Date(metadata.updated_at).toISOString(),
        accessed: new Date(metadata.updated_at).toISOString(),
    });
}
export async function handleWriteFile(req, res) {
    const filesystem = req.app.locals.filesystem;
    const fileUid = req.query.uid;
    const signature = req.query.signature;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!fileUid) {
        res.status(400).json({ error: 'Missing uid parameter' });
        return;
    }
    logger.info('[WriteFile] Request received', { uid: fileUid, signature: signature ? signature.substring(0, 20) + '...' : 'none' });
    const uuidPath = fileUid.replace(/^uuid-+/, '');
    let potentialPath = '/' + uuidPath.replace(/-/g, '/');
    const pathParts = potentialPath.split('/').filter(p => p);
    if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
        potentialPath = '/' + pathParts.join('/');
    }
    const existingMetadata = filesystem.getFileMetadata(potentialPath, req.user.wallet_address);
    if (!existingMetadata) {
        logger.warn('[WriteFile] File not found for UID', { uid: fileUid, convertedPath: potentialPath });
        res.status(404).json({ error: 'File not found' });
        return;
    }
    let fileContent = '';
    const contentType = req.get('Content-Type') || '';
    if (typeof req.body === 'string' && req.body.length > 0) {
        fileContent = req.body;
        logger.info('[WriteFile] Using body as raw text', { length: fileContent.length });
    }
    else if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        if ('content' in req.body) {
            fileContent = req.body.content;
        }
        else if ('data' in req.body) {
            fileContent = req.body.data;
        }
        else if ('text' in req.body) {
            fileContent = req.body.text;
        }
        else {
            if (contentType.includes('text/plain')) {
                fileContent = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            }
        }
    }
    if (!fileContent && req.rawBody) {
        fileContent = req.rawBody.toString('utf8');
        logger.info('[WriteFile] Using raw body buffer', { length: fileContent.length });
    }
    if (!fileContent || (typeof fileContent === 'string' && fileContent.length === 0)) {
        logger.warn('[WriteFile] No file content found in request');
        res.status(400).json({ error: 'No file content provided' });
        return;
    }
    try {
        const contentBuffer = typeof fileContent === 'string'
            ? Buffer.from(fileContent, 'utf8')
            : fileContent;
        const updatedMetadata = await filesystem.writeFile(potentialPath, contentBuffer, req.user.wallet_address, {
            mimeType: existingMetadata.mime_type || undefined
        });
        logger.info('[WriteFile] File updated successfully', { path: updatedMetadata.path, size: updatedMetadata.size });
        res.json({
            uid: fileUid,
            name: updatedMetadata.path.split('/').pop() || '',
            path: updatedMetadata.path,
            is_dir: false,
            size: updatedMetadata.size,
            type: updatedMetadata.mime_type || 'application/octet-stream',
            created: new Date(updatedMetadata.created_at).toISOString(),
            modified: new Date(updatedMetadata.updated_at).toISOString(),
        });
    }
    catch (error) {
        logger.error('[WriteFile] Error writing file:', error);
        res.status(500).json({
            error: 'Failed to write file',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export function handleGetWallets(req, res) {
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const db = req.app.locals.db;
        const walletAddress = req.user.wallet_address;
        res.json({
            wallets: [],
            owner: walletAddress
        });
    }
    catch (error) {
        logger.error('[GetWallets] Error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Failed to get wallets',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
//# sourceMappingURL=other.js.map