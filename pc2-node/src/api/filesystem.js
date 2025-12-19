import { broadcastItemRemoved, broadcastItemMoved, broadcastItemUpdated, broadcastItemAdded, broadcastItemRenamed } from '../websocket/events.js';
import { logger } from '../utils/logger.js';
export function handleStat(req, res) {
    const filesystem = req.app.locals.filesystem;
    const path = req.query.path ||
        req.query.file ||
        req.query.subject ||
        req.body?.path ||
        req.body?.file ||
        req.body?.subject ||
        '/';
    logger.info(`[Stat] Request received: method=${req.method}, path=${path}, query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}, hasUser=${!!req.user}`);
    if (!req.user) {
        logger.warn(`[Stat] Unauthorized request for path: ${path}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!req.user.wallet_address) {
        logger.error(`[Stat] User object exists but wallet_address is null/undefined`);
        res.status(401).json({ error: 'Invalid user session - wallet address missing' });
        return;
    }
    let resolvedPath = path;
    if (path.startsWith('~')) {
        resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
    }
    else if (path.startsWith('/null')) {
        resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
        logger.warn(`[Stat] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
    }
    else if (!path.startsWith('/')) {
        resolvedPath = `/${req.user.wallet_address}/${path}`;
    }
    logger.info(`[Stat] Resolved path: ${resolvedPath} (original: ${path}, wallet: ${req.user.wallet_address})`);
    if (!filesystem) {
        const walletPath = `/${req.user.wallet_address}`;
        const isUserPath = resolvedPath === walletPath ||
            resolvedPath.startsWith(`${walletPath}/`) ||
            resolvedPath === '/' ||
            resolvedPath.endsWith('/');
        if (isUserPath) {
            const pathParts = resolvedPath.split('/').filter(p => p);
            const dirStat = {
                name: pathParts.length > 0 ? pathParts[pathParts.length - 1] : '/',
                path: resolvedPath,
                type: 'dir',
                size: 0,
                created: Date.now(),
                modified: Date.now(),
                is_dir: true,
                uid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`,
                uuid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`
            };
            logger.info(`[Stat] Returning directory stat for: ${resolvedPath} (filesystem not initialized, wallet: ${walletPath})`);
            res.json(dirStat);
            return;
        }
        logger.warn(`[Stat] Path not found (not a user path): ${resolvedPath}, wallet: ${walletPath}, isUserPath: ${isUserPath}`);
        res.status(404).json({ error: 'File not found', path: resolvedPath, wallet: walletPath });
        return;
    }
    try {
        const metadata = filesystem.getFileMetadata(resolvedPath, req.user.wallet_address);
        logger.info(`[Stat] Metadata lookup result: ${metadata ? 'found' : 'not found'} for path: ${resolvedPath}`);
        if (!metadata) {
            const walletPath = `/${req.user.wallet_address}`;
            const isUserPath = resolvedPath === walletPath ||
                resolvedPath.startsWith(`${walletPath}/`) ||
                resolvedPath === '/';
            logger.info(`[Stat] Checking user path: resolvedPath=${resolvedPath}, walletPath=${walletPath}, isUserPath=${isUserPath}`);
            if (isUserPath) {
                const pathParts = resolvedPath.split('/').filter(p => p);
                const dirStat = {
                    name: pathParts.length > 0 ? pathParts[pathParts.length - 1] : '/',
                    path: resolvedPath,
                    type: 'dir',
                    size: 0,
                    created: Date.now(),
                    modified: Date.now(),
                    is_dir: true,
                    uid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`,
                    uuid: `uuid-${resolvedPath.replace(/\//g, '-').replace(/^-/, '')}`
                };
                logger.info(`[Stat] Returning directory stat for: ${resolvedPath} (not in database yet, wallet: ${walletPath})`);
                res.json(dirStat);
                return;
            }
            logger.warn(`[Stat] Path not a user path, returning 404: ${resolvedPath}`);
            res.status(404).json({ error: 'File not found' });
            return;
        }
        const stat = {
            name: metadata.path.split('/').pop() || '/',
            path: resolvedPath,
            type: metadata.is_dir ? 'dir' : 'file',
            size: metadata.size,
            created: metadata.created_at,
            modified: metadata.updated_at,
            mime_type: metadata.mime_type,
            thumbnail: metadata.thumbnail || undefined,
            is_dir: metadata.is_dir,
            uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
            uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
        };
        if ('is_public' in metadata) {
            stat.is_public = metadata.is_public;
        }
        res.json(stat);
    }
    catch (error) {
        logger.error('Stat error:', error instanceof Error ? error.message : 'Unknown error', { path });
        res.status(500).json({
            error: 'Failed to get file stat',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export function handleReaddir(req, res) {
    const filesystem = req.app.locals.filesystem;
    const body = req.body;
    const path = body.path || '/';
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    let resolvedPath = path;
    if (path.startsWith('~')) {
        resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
    }
    else if (path.startsWith('/null')) {
        resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
        logger.warn(`[Readdir] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
    }
    else if (!path.startsWith('/')) {
        resolvedPath = `/${req.user.wallet_address}/${path}`;
    }
    if (!filesystem) {
        const entries = [];
        const isDesktop = resolvedPath.endsWith('/Desktop') ||
            resolvedPath.endsWith('/Desktop/') ||
            resolvedPath.includes('/Desktop/') ||
            (resolvedPath === `/${req.user.wallet_address}/Desktop`);
        if (isDesktop) {
            const trashPath = `/${req.user.wallet_address}/.Trash`;
            entries.push({
                name: '.Trash',
                path: trashPath,
                type: 'dir',
                size: 0,
                created: Date.now(),
                modified: Date.now(),
                mime_type: 'inode/directory',
                is_dir: true,
                uid: `uuid-${trashPath.replace(/\//g, '-').replace(/^-/, '')}`,
                uuid: `uuid-${trashPath.replace(/\//g, '-').replace(/^-/, '')}`
            });
        }
        res.json(entries);
        return;
    }
    try {
        const files = filesystem.listDirectory(resolvedPath, req.user.wallet_address);
        const entries = files.map(metadata => {
            let is_empty = false;
            if (metadata.is_dir) {
                try {
                    const dirContents = filesystem.listDirectory(metadata.path, req.user.wallet_address);
                    is_empty = dirContents.length === 0;
                }
                catch (error) {
                    is_empty = true;
                }
            }
            const entry = {
                id: Math.floor(Math.random() * 10000),
                uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
                uuid: `uuid-${metadata.path.replace(/\//g, '-')}`,
                name: metadata.path.split('/').pop() || '/',
                path: metadata.path,
                is_dir: metadata.is_dir,
                is_empty: is_empty,
                size: metadata.size || 0,
                created: new Date(metadata.created_at).toISOString(),
                modified: new Date(metadata.updated_at).toISOString(),
                type: metadata.is_dir ? null : (metadata.mime_type || 'application/octet-stream'),
                thumbnail: metadata.thumbnail || undefined,
                is_public: metadata.is_public || false
            };
            return entry;
        });
        res.json(entries);
    }
    catch (error) {
        logger.error('Readdir error:', error instanceof Error ? error.message : 'Unknown error', { path });
        res.status(500).json({
            error: 'Failed to read directory',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleRead(req, res) {
    const filesystem = req.app.locals.filesystem;
    let path = req.query.path ||
        req.query.file ||
        req.body?.path ||
        req.body?.file ||
        undefined;
    const encoding = req.query.encoding || 'utf8';
    if (path && (path === '~/.__puter_gui.json' || path.endsWith('.__puter_gui.json'))) {
        logger.info('[Read] Special case: .__puter_gui.json - returning empty config');
        const emptyConfig = '{}';
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', Buffer.byteLength(emptyConfig, 'utf8').toString());
        res.send(emptyConfig);
        return;
    }
    if (!filesystem) {
        res.status(404).json({ error: 'File not found' });
        return;
    }
    if (!req.user && path && !path.startsWith('~')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!path) {
        res.status(400).json({ error: 'Missing path parameter' });
        return;
    }
    let resolvedPath = path;
    let walletAddress;
    try {
        resolvedPath = path;
        if (path.startsWith('~')) {
            if (req.user) {
                resolvedPath = path.replace('~', `/${req.user.wallet_address}`);
            }
            else {
                const url = new URL(req.url || '/', `http://${req.get('host') || 'localhost'}`);
                const tokenParam = url.searchParams.get('token') || url.searchParams.get('puter.auth.token') || url.searchParams.get('auth_token');
                let walletAddress = null;
                if (tokenParam && filesystem) {
                    const db = req.app.locals.db;
                    if (db) {
                        const session = db.getSession(tokenParam);
                        if (session) {
                            walletAddress = session.wallet_address;
                        }
                    }
                }
                if (!walletAddress && req.headers.referer) {
                    try {
                        const refererUrl = new URL(req.headers.referer);
                        const refererToken = refererUrl.searchParams.get('puter.auth.token');
                        if (refererToken && filesystem) {
                            const db = req.app.locals.db;
                            if (db) {
                                const session = db.getSession(refererToken);
                                if (session) {
                                    walletAddress = session.wallet_address;
                                }
                            }
                        }
                    }
                    catch (e) {
                    }
                }
                if (walletAddress) {
                    resolvedPath = path.replace('~', `/${walletAddress}`);
                }
                else {
                    res.status(401).json({ error: 'Unauthorized - cannot resolve ~ without authentication' });
                    return;
                }
            }
        }
        else if (path.startsWith('/null')) {
            if (req.user) {
                resolvedPath = path.replace('/null', `/${req.user.wallet_address}`);
                logger.warn(`[Read] Replacing /null with wallet address: ${path} -> ${resolvedPath}`);
            }
            else {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
        }
        else if (!path.startsWith('/') && req.user) {
            resolvedPath = `/${req.user.wallet_address}/${path}`;
        }
        walletAddress = req.user?.wallet_address;
        if (!walletAddress) {
            const pathParts = resolvedPath.split('/').filter(p => p);
            if (pathParts.length > 0 && pathParts[0].startsWith('0x') && pathParts[0].length === 42) {
                walletAddress = pathParts[0];
                logger.info('[Read] Extracted wallet address from path', { walletAddress, resolvedPath });
            }
        }
        if (!walletAddress) {
            logger.error('[Read] Cannot determine wallet address', {
                path,
                resolvedPath,
                hasUser: !!req.user,
                userWallet: req.user?.wallet_address
            });
            res.status(400).json({ error: 'Cannot determine wallet address' });
            return;
        }
        logger.info('[Read] Reading file', {
            resolvedPath,
            walletAddress,
            originalPath: path,
            hasUser: !!req.user,
            userWallet: req.user?.wallet_address
        });
        const fileMetadata = filesystem.getFileMetadata(resolvedPath, walletAddress);
        if (!fileMetadata) {
            logger.error('[Read] File metadata not found in database', {
                resolvedPath,
                walletAddress,
                availableFiles: 'checking...'
            });
            res.status(404).json({ error: 'File not found', message: `File not found: ${resolvedPath}` });
            return;
        }
        logger.info('[Read] File metadata found', {
            path: fileMetadata.path,
            hasIPFSHash: !!fileMetadata.ipfs_hash,
            ipfsHash: fileMetadata.ipfs_hash?.substring(0, 20) + '...',
            size: fileMetadata.size,
            isDir: fileMetadata.is_dir
        });
        const content = await filesystem.readFile(resolvedPath, walletAddress);
        const metadata = filesystem.getFileMetadata(resolvedPath, walletAddress);
        const mimeType = metadata?.mime_type || 'application/octet-stream';
        const isBinary = mimeType.startsWith('video/') ||
            mimeType.startsWith('image/') ||
            mimeType.startsWith('audio/') ||
            mimeType === 'application/octet-stream' ||
            mimeType === 'application/pdf' ||
            encoding === 'base64';
        if (isBinary) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
            res.setHeader('Accept-Ranges', 'bytes');
        }
        const rangeHeader = req.headers.range;
        const fileSize = content.length;
        if (rangeHeader && isBinary) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            const chunk = content.slice(start, end + 1);
            logger.info('[Read] Range request', {
                path: resolvedPath,
                range: rangeHeader,
                start,
                end,
                fileSize,
                chunkSize
            });
            res.status(206).set({
                'Content-Type': mimeType,
                'Content-Length': chunkSize.toString(),
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
            });
            return res.send(chunk);
        }
        if (encoding === 'base64') {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(content.toString('base64'));
        }
        else if (isBinary) {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', content.length.toString());
            res.send(content);
        }
        else {
            res.setHeader('Content-Type', mimeType);
            res.send(content.toString('utf8'));
        }
    }
    catch (error) {
        logger.error('Read error:', error instanceof Error ? error.message : 'Unknown error', {
            path,
            resolvedPath: resolvedPath || path,
            walletAddress: walletAddress || req.user?.wallet_address || 'unknown',
            errorStack: error instanceof Error ? error.stack : undefined
        });
        if (error instanceof Error) {
            if (error.message.includes('not found') || error.message.includes('File not found')) {
                res.status(404).json({ error: 'File not found', message: error.message });
                return;
            }
            if (error.message.includes('IPFS is not available')) {
                res.status(503).json({ error: 'Storage unavailable', message: error.message });
                return;
            }
            if (error.message.includes('Path is a directory')) {
                res.status(400).json({ error: 'Path is a directory', message: error.message });
                return;
            }
            if (error.message.includes('no IPFS hash')) {
                res.status(500).json({ error: 'File metadata incomplete', message: error.message });
                return;
            }
        }
        res.status(500).json({
            error: 'Failed to read file',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleWrite(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    const body = req.body;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!body.path) {
        res.status(400).json({ error: 'Missing path' });
        return;
    }
    try {
        let content = body.content;
        if (body.encoding === 'base64') {
            content = Buffer.from(body.content, 'base64');
        }
        const metadata = await filesystem.writeFile(body.path, content, req.user.wallet_address, {
            mimeType: body.mime_type,
            isPublic: false
        });
        if (io) {
            const fileUid = `uuid-${body.path.replace(/\//g, '-')}`;
            broadcastItemUpdated(io, req.user.wallet_address, {
                uid: fileUid,
                name: metadata.path.split('/').pop() || '',
                path: body.path,
                size: metadata.size,
                modified: new Date(metadata.updated_at).toISOString(),
                original_client_socket_id: null
            });
        }
        const fileStat = {
            name: metadata.path.split('/').pop() || '/',
            path: metadata.path,
            type: 'file',
            size: metadata.size,
            created: metadata.created_at,
            modified: metadata.updated_at,
            mime_type: metadata.mime_type,
            is_dir: false,
            uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
            uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
        };
        res.json(fileStat);
    }
    catch (error) {
        logger.error('Write error:', error instanceof Error ? error.message : 'Unknown error', { path: body.path });
        res.status(500).json({
            error: 'Failed to write file',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleMkdir(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    const body = {
        ...req.query,
        ...req.body
    };
    logger.info('[Mkdir] Request received', {
        method: req.method,
        bodyKeys: Object.keys(req.body || {}),
        queryKeys: Object.keys(req.query || {}),
        mergedKeys: Object.keys(body || {}),
        hasPath: !!body.path,
        pathType: typeof body.path,
        pathValue: body.path ? String(body.path).substring(0, 100) : undefined,
        hasParent: !!body.parent,
        hasItems: !!body.items,
        contentType: req.headers['content-type'],
        rawBody: JSON.stringify(req.body).substring(0, 500),
        rawQuery: JSON.stringify(req.query).substring(0, 500),
        mergedBody: JSON.stringify(body).substring(0, 500)
    });
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (body.path === undefined) {
        logger.warn('[Mkdir] Missing path', { bodyKeys: Object.keys(body || {}), body: JSON.stringify(body).substring(0, 200) });
        res.status(400).json({ message: 'path is required' });
        return;
    }
    if (body.path === '' || body.path === null) {
        logger.warn('[Mkdir] Empty or null path', { path: body.path });
        res.status(400).json({ message: body.path === '' ? 'path cannot be empty' : 'path cannot be null' });
        return;
    }
    if (typeof body.path !== 'string') {
        logger.warn('[Mkdir] Path is not a string', { pathType: typeof body.path, path: body.path });
        res.status(400).json({ message: 'path must be a string' });
        return;
    }
    let targetPath;
    let parentPath;
    if (body.path) {
        targetPath = body.path;
        parentPath = body.parent;
    }
    else if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        targetPath = 'path' in body.items[0] ? body.items[0].path : undefined;
        parentPath = 'parent' in body.items[0] ? body.items[0].parent : undefined;
    }
    if (!targetPath) {
        res.status(400).json({ message: 'path is required' });
        return;
    }
    let resolvedPath;
    let targetName;
    let actualParentPath;
    if (parentPath) {
        actualParentPath = parentPath.startsWith('/') ? parentPath : '/' + parentPath;
        targetName = targetPath;
        resolvedPath = actualParentPath === '/' ? `/${targetName}` : `${actualParentPath}/${targetName}`;
    }
    else {
        resolvedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
        const pathParts = resolvedPath.split('/').filter(p => p);
        targetName = pathParts.pop() || '';
        actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
        resolvedPath = actualParentPath === '/' ? `/${targetName}` : `${actualParentPath}/${targetName}`;
    }
    if (resolvedPath.startsWith('~/')) {
        resolvedPath = resolvedPath.replace('~/', `/${req.user.wallet_address}/`);
        const pathParts = resolvedPath.split('/').filter(p => p);
        targetName = pathParts.pop() || '';
        actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
    }
    if (actualParentPath.startsWith('~/')) {
        actualParentPath = actualParentPath.replace('~/', `/${req.user.wallet_address}/`);
        resolvedPath = `${actualParentPath}/${targetName}`;
    }
    if (!resolvedPath.startsWith('/')) {
        resolvedPath = `/${req.user.wallet_address}/${resolvedPath}`;
        const pathParts = resolvedPath.split('/').filter(p => p);
        targetName = pathParts.pop() || '';
        actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
    }
    else if (resolvedPath.startsWith('/') && !resolvedPath.startsWith(`/${req.user.wallet_address}/`)) {
        const firstPart = resolvedPath.split('/').filter(p => p)[0];
        const standardDirs = ['Desktop', 'Documents', 'Public', 'Pictures', 'Videos', 'Trash'];
        if (standardDirs.includes(firstPart)) {
            resolvedPath = `/${req.user.wallet_address}${resolvedPath}`;
            const pathParts = resolvedPath.split('/').filter(p => p);
            targetName = pathParts.pop() || '';
            actualParentPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
        }
    }
    resolvedPath = resolvedPath.replace(/\/+/g, '/');
    actualParentPath = actualParentPath.replace(/\/+/g, '/');
    logger.info('[Mkdir] Creating directory', {
        originalPath: body.path,
        resolvedPath,
        wallet: req.user.wallet_address
    });
    try {
        const metadata = await filesystem.createDirectory(resolvedPath, req.user.wallet_address);
        logger.info('[Mkdir] Directory created successfully', {
            path: metadata.path,
            is_public: metadata.is_public,
            is_dir: metadata.is_dir
        });
        if (io) {
            const pathParts = metadata.path.split('/').filter(p => p);
            pathParts.pop();
            const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
            const dirUid = `uuid-${metadata.path.replace(/\//g, '-')}`;
            broadcastItemAdded(io, req.user.wallet_address, {
                uid: dirUid,
                uuid: dirUid,
                name: targetName,
                path: metadata.path,
                dirpath: dirpath,
                size: 0,
                type: null,
                mime_type: undefined,
                is_dir: true,
                created: new Date(metadata.created_at).toISOString(),
                modified: new Date(metadata.updated_at).toISOString()
            });
        }
        const dirStat = {
            name: metadata.path.split('/').pop() || '/',
            path: metadata.path,
            type: 'dir',
            size: 0,
            created: metadata.created_at,
            modified: metadata.updated_at,
            mime_type: null,
            is_dir: true,
            uid: `uuid-${metadata.path.replace(/\//g, '-')}`,
            uuid: `uuid-${metadata.path.replace(/\//g, '-')}`
        };
        if ('is_public' in metadata) {
            dirStat.is_public = metadata.is_public;
            logger.info('[Mkdir] Directory is_public:', metadata.is_public);
        }
        res.json(dirStat);
    }
    catch (error) {
        logger.error('Mkdir error:', error instanceof Error ? error.message : 'Unknown error', { path: body.path });
        res.status(500).json({
            error: 'Failed to create directory',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleDelete(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    const body = req.body;
    logger.info('[Delete] Request received', {
        bodyKeys: Object.keys(body || {}),
        hasPaths: !!body.paths,
        hasPath: !!body.path,
        hasItems: !!body.items,
        bodyPreview: JSON.stringify(body).substring(0, 200)
    });
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    let pathsToDelete = [];
    if (body.paths) {
        if (typeof body.paths === 'string') {
            pathsToDelete = [body.paths];
        }
        else if (Array.isArray(body.paths)) {
            pathsToDelete = body.paths;
        }
        else {
            res.status(400).json({ error: 'paths must be a string or array' });
            return;
        }
    }
    else if (body.path) {
        pathsToDelete = [body.path];
    }
    else if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        pathsToDelete = body.items.map((item) => {
            if ('path' in item) {
                return item.path;
            }
            else if ('uid' in item) {
                const uuidPath = item.uid.replace(/^uuid-/, '');
                return '/' + uuidPath.replace(/-/g, '/');
            }
            return null;
        }).filter((p) => p !== null);
    }
    else {
        logger.warn('[Delete] Invalid request format', { bodyKeys: Object.keys(body || {}) });
        res.status(400).json({ error: 'Missing paths, path, or items array' });
        return;
    }
    if (pathsToDelete.length === 0) {
        res.status(400).json({ error: 'No valid paths to delete' });
        return;
    }
    try {
        const deleted = [];
        const walletAddress = req.user.wallet_address;
        const trashPath = `/${walletAddress}/Trash`;
        try {
            await filesystem.createDirectory(trashPath, walletAddress);
        }
        catch (error) {
            logger.info('[Delete] Trash directory check', { error: error instanceof Error ? error.message : 'Unknown' });
        }
        for (const pathInput of pathsToDelete) {
            if (!pathInput || pathInput === '/') {
                deleted.push({ path: pathInput || 'unknown', success: false, error: 'Invalid path' });
                continue;
            }
            try {
                let actualPath = pathInput;
                if (pathInput.startsWith('uuid-') || pathInput.includes('uuid-')) {
                    logger.info('[Delete] Path is UUID, converting to path', { uuid: pathInput });
                    const uuidPath = pathInput.replace(/^uuid-+/, '');
                    let potentialPath = '/' + uuidPath.replace(/-/g, '/');
                    const pathParts = potentialPath.split('/').filter(p => p);
                    if (pathParts.length > 0 && pathParts[0].startsWith('0x')) {
                        potentialPath = '/' + pathParts.join('/');
                    }
                    const metadata = filesystem.getFileMetadata(potentialPath, walletAddress);
                    if (metadata) {
                        actualPath = metadata.path;
                        logger.info('[Delete] Resolved UUID to path', { uuid: pathInput, path: actualPath });
                    }
                    else {
                        const userRoot = `/${walletAddress}`;
                        const searchForFileByUuid = (dirPath) => {
                            try {
                                const files = filesystem.listDirectory(dirPath, walletAddress);
                                for (const file of files) {
                                    const fileUid = `uuid-${file.path.replace(/\//g, '-')}`;
                                    if (fileUid === pathInput || fileUid.toLowerCase() === pathInput.toLowerCase()) {
                                        return file.path;
                                    }
                                    if (file.is_dir) {
                                        const found = searchForFileByUuid(file.path);
                                        if (found)
                                            return found;
                                    }
                                }
                            }
                            catch (error) {
                            }
                            return null;
                        };
                        const foundPath = searchForFileByUuid(userRoot);
                        if (foundPath) {
                            actualPath = foundPath;
                            logger.info('[Delete] Found file by UUID search', { uuid: pathInput, path: actualPath });
                        }
                        else {
                            actualPath = potentialPath;
                            logger.warn('[Delete] UUID conversion may be incorrect, file not found', { uuid: pathInput, convertedPath: actualPath });
                        }
                    }
                }
                const path = actualPath.startsWith('/') ? actualPath : '/' + actualPath;
                if (path.includes('/Trash/') || path.includes('/Trash')) {
                    await filesystem.deleteFile(path, walletAddress);
                    deleted.push({ path, success: true });
                    if (io) {
                        const fileUid = `uuid-${path.replace(/\//g, '-')}`;
                        broadcastItemRemoved(io, walletAddress, {
                            path: path,
                            uid: fileUid,
                            original_client_socket_id: null
                        });
                    }
                    logger.info('[Delete] Permanently deleted from Trash', { path });
                }
                else {
                    const metadata = filesystem.getFileMetadata(path, walletAddress);
                    if (!metadata) {
                        deleted.push({ path, success: false, error: 'File not found' });
                        continue;
                    }
                    const fileName = path.split('/').pop() || 'untitled';
                    let trashFileName = fileName;
                    try {
                        const trashFiles = filesystem.listDirectory(trashPath, walletAddress);
                        const existingInTrash = trashFiles.find(f => f.path === `${trashPath}/${fileName}`);
                        if (existingInTrash) {
                            const lastDot = fileName.lastIndexOf('.');
                            const hasExtension = lastDot > 0;
                            const baseName = hasExtension ? fileName.substring(0, lastDot) : fileName;
                            const extension = hasExtension ? fileName.substring(lastDot) : '';
                            const timestamp = Date.now();
                            trashFileName = `${baseName} (${timestamp})${extension}`;
                        }
                    }
                    catch (error) {
                        logger.info('[Delete] Checking Trash for duplicates', { error: error instanceof Error ? error.message : 'Unknown' });
                    }
                    const trashFilePath = `${trashPath}/${trashFileName}`;
                    const movedMetadata = await filesystem.moveFile(path, trashFilePath, walletAddress);
                    deleted.push({ path, success: true });
                    if (io) {
                        const fileUid = `uuid-${path.replace(/\//g, '-')}`;
                        broadcastItemRemoved(io, walletAddress, {
                            path: path,
                            uid: fileUid,
                            original_client_socket_id: null
                        });
                    }
                    if (io) {
                        const trashFileUid = `uuid-${trashFilePath.replace(/\//g, '-')}`;
                        const pathParts = trashFilePath.split('/').filter(p => p);
                        pathParts.pop();
                        const dirpath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
                        broadcastItemAdded(io, walletAddress, {
                            uid: trashFileUid,
                            uuid: trashFileUid,
                            name: fileName,
                            path: trashFilePath,
                            dirpath: dirpath,
                            size: movedMetadata.size,
                            type: movedMetadata.mime_type || null,
                            mime_type: movedMetadata.mime_type || undefined,
                            is_dir: movedMetadata.is_dir,
                            created: new Date(movedMetadata.created_at).toISOString(),
                            modified: new Date(movedMetadata.updated_at).toISOString(),
                            original_client_socket_id: null
                        });
                    }
                    logger.info('[Delete] Moved to Trash', { from: path, to: trashFilePath, originalName: fileName });
                }
            }
            catch (error) {
                const errorPath = typeof pathInput === 'string' ? pathInput : 'unknown';
                deleted.push({
                    path: errorPath,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                logger.error('[Delete] Error processing delete request', {
                    path: errorPath,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        const allSuccessful = deleted.every(d => d.success);
        const allFailed = deleted.every(d => !d.success);
        if (allSuccessful) {
            res.json({});
        }
        else if (allFailed) {
            res.status(404).json({
                error: 'Failed to delete files',
                deleted: deleted
            });
        }
        else {
            res.json({ deleted });
        }
        logger.info('[Delete] Completed', {
            total: pathsToDelete.length,
            successful: deleted.filter(d => d.success).length,
            failed: deleted.filter(d => !d.success).length
        });
    }
    catch (error) {
        logger.error('Delete error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Failed to delete files',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleMove(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    const body = req.body;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    let fromPath;
    let toPath;
    let newName;
    logger.info('[Move] Request received', {
        bodyKeys: Object.keys(body || {}),
        hasSource: !!body.source,
        hasFrom: !!body.from,
        hasItems: !!body.items,
        source: body.source ? String(body.source).substring(0, 50) : undefined,
        destination: body.destination ? String(body.destination).substring(0, 50) : undefined
    });
    if (body.source) {
        fromPath = body.source;
        toPath = body.destination || body.dest || body.to;
        newName = body.newName || body.new_name || body.name;
    }
    else if (body.from && body.to) {
        fromPath = body.from;
        toPath = body.to;
    }
    else if (body.items && Array.isArray(body.items) && body.items.length > 0 && body.destination) {
        const firstItem = body.items[0];
        fromPath = 'path' in firstItem ? firstItem.path : undefined;
        toPath = body.destination;
    }
    else {
        logger.warn('[Move] Invalid request format', { bodyKeys: Object.keys(body || {}) });
        res.status(400).json({ error: 'Missing source/from or destination/to' });
        return;
    }
    if (!fromPath || !toPath) {
        logger.warn('[Move] Missing paths', { fromPath, toPath });
        res.status(400).json({ error: 'Invalid paths' });
        return;
    }
    let originalFileName;
    if (fromPath.startsWith('uuid-')) {
        const walletAddress = req.user.wallet_address;
        const userRoot = `/${walletAddress}`;
        const db = req.app.locals.db;
        if (db && typeof db.listFiles === 'function') {
            const allFiles = db.listFiles(userRoot, walletAddress);
            let foundMetadata = null;
            for (const file of allFiles) {
                const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
                if (fileUuid === fromPath) {
                    foundMetadata = file;
                    break;
                }
            }
            if (foundMetadata) {
                fromPath = foundMetadata.path;
                originalFileName = foundMetadata.path.split('/').pop() || undefined;
                logger.info('[Move] Found file by UUID lookup', { uuid: fromPath, path: foundMetadata.path, fileName: originalFileName });
            }
            else {
                const uuidWithoutPrefix = fromPath.replace(/^uuid-/, '');
                const reconstructedPath = `/${uuidWithoutPrefix.replace(/-/g, '/')}`;
                logger.warn('[Move] UUID not found, trying reconstructed path', {
                    uuid: fromPath,
                    reconstructedPath,
                    searchedFiles: allFiles.length
                });
                const reconstructedMetadata = filesystem.getFileMetadata(reconstructedPath, walletAddress);
                if (reconstructedMetadata) {
                    fromPath = reconstructedMetadata.path;
                    originalFileName = reconstructedMetadata.path.split('/').pop() || undefined;
                    logger.info('[Move] Found file by reconstructed path', {
                        uuid: fromPath,
                        path: reconstructedMetadata.path,
                        fileName: originalFileName
                    });
                }
                else {
                    logger.error('[Move] UUID not found and reconstructed path also not found', {
                        uuid: fromPath,
                        reconstructedPath,
                        searchedFiles: allFiles.length,
                        samplePaths: allFiles.slice(0, 5).map(f => f.path),
                        sampleUuids: allFiles.slice(0, 5).map(f => `uuid-${f.path.replace(/\//g, '-')}`)
                    });
                }
            }
        }
        else {
            logger.error('[Move] Database not available for UUID lookup', { uuid: fromPath, hasDb: !!db });
        }
    }
    else {
        originalFileName = fromPath.split('/').pop() || undefined;
    }
    if (fromPath.startsWith('~')) {
        fromPath = fromPath.replace('~', `/${req.user.wallet_address}`);
    }
    else if (!fromPath.startsWith('/')) {
        fromPath = `/${req.user.wallet_address}/${fromPath}`;
    }
    if (toPath.startsWith('~')) {
        toPath = toPath.replace('~', `/${req.user.wallet_address}`);
    }
    else if (!toPath.startsWith('/')) {
        toPath = `/${req.user.wallet_address}/${toPath}`;
    }
    const isMovingToTrash = toPath.includes('/Trash') || toPath.endsWith('/Trash') || toPath === '/Trash';
    const newNameIsUuid = newName && (newName.startsWith('uuid-') || newName.includes('uuid-'));
    if (isMovingToTrash) {
        const trashDirPath = toPath.includes('/Trash')
            ? toPath.substring(0, toPath.indexOf('/Trash') + 6)
            : `/${req.user.wallet_address}/Trash`;
        try {
            await filesystem.createDirectory(trashDirPath, req.user.wallet_address);
            logger.info('[Move] Trash directory ensured', { trashDirPath });
        }
        catch (error) {
            logger.info('[Move] Trash directory check', { error: error instanceof Error ? error.message : 'Unknown' });
        }
        if (!toPath.endsWith('/')) {
            toPath = `${toPath}/`;
        }
        let trashFileName = originalFileName || 'untitled';
        if (originalFileName) {
            try {
                const trashFiles = filesystem.listDirectory(trashDirPath, req.user.wallet_address);
                const existingInTrash = trashFiles.find(f => {
                    const fileName = f.path.split('/').pop() || '';
                    return fileName === originalFileName;
                });
                if (existingInTrash) {
                    const lastDot = originalFileName.lastIndexOf('.');
                    const hasExtension = lastDot > 0;
                    const baseName = hasExtension ? originalFileName.substring(0, lastDot) : originalFileName;
                    const extension = hasExtension ? originalFileName.substring(lastDot) : '';
                    const timestamp = Date.now();
                    trashFileName = `${baseName} (${timestamp})${extension}`;
                    logger.info('[Move] Duplicate filename in Trash, using timestamp suffix', {
                        originalFileName,
                        trashFileName,
                        existingPath: existingInTrash.path
                    });
                }
            }
            catch (error) {
                logger.info('[Move] Error checking Trash for duplicates', {
                    error: error instanceof Error ? error.message : 'Unknown'
                });
            }
            toPath = `${toPath}${trashFileName}`;
        }
        logger.info('[Move] Moving to Trash with filename', {
            originalFileName,
            trashFileName,
            finalToPath: toPath,
            destinationBefore: body.destination,
            trashDirPath
        });
    }
    else if (newName && !newNameIsUuid) {
        const destinationIsDir = toPath.endsWith('/') || toPath === '/';
        if (destinationIsDir) {
            toPath = `${toPath}${newName}`;
        }
        else {
            const parentDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
            toPath = parentDir === '/' ? `/${newName}` : `${parentDir}/${newName}`;
        }
        logger.info('[Move] Using newName', { newName, finalToPath: toPath });
    }
    else if (newNameIsUuid && originalFileName) {
        const destinationIsDir = toPath.endsWith('/') || toPath === '/';
        if (destinationIsDir) {
            toPath = `${toPath}${originalFileName}`;
        }
        else {
            const parentDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
            toPath = parentDir === '/' ? `/${originalFileName}` : `${parentDir}/${originalFileName}`;
        }
        logger.info('[Move] Using original filename (UUID newName)', {
            originalFileName,
            finalToPath: toPath,
            newName
        });
    }
    try {
        const sourceMetadata = filesystem.getFileMetadata(fromPath, req.user.wallet_address);
        if (!sourceMetadata) {
            const parentDir = fromPath.substring(0, fromPath.lastIndexOf('/')) || '/';
            const parentContents = filesystem.listDirectory(parentDir, req.user.wallet_address);
            logger.error('[Move] Source file not found', {
                fromPath,
                parentDir,
                parentContentsCount: parentContents.length,
                parentContents: parentContents.map(f => f.path).slice(0, 10)
            });
            res.status(404).json({
                error: 'File not found',
                message: `Source file not found: ${fromPath}`,
                parentDir,
                availableFiles: parentContents.map(f => ({ path: f.path, name: f.path.split('/').pop() }))
            });
            return;
        }
        let newPath;
        if (isMovingToTrash && toPath && originalFileName) {
            newPath = toPath;
        }
        else {
            const destinationIsDir = toPath.endsWith('/') || toPath === '/';
            const fileName = originalFileName || fromPath.split('/').pop() || '';
            newPath = destinationIsDir
                ? `${toPath}${fileName}`
                : toPath;
        }
        logger.info('[Move] Moving file/directory', {
            from: fromPath,
            to: newPath,
            toPathBeforeCalc: toPath,
            isMovingToTrash,
            fileName: originalFileName || fromPath.split('/').pop() || '',
            originalFileName,
            sourceExists: !!sourceMetadata
        });
        const metadata = await filesystem.moveFile(fromPath, newPath, req.user.wallet_address);
        logger.info('[Move] File/directory moved successfully', {
            from: fromPath,
            to: newPath
        });
        logger.info('[Move] Broadcasting events', {
            hasIO: !!io,
            isMovingToTrash,
            wallet: req.user.wallet_address
        });
        if (io) {
            if (isMovingToTrash) {
                const oldFileUid = `uuid-${fromPath.replace(/\//g, '-')}`;
                logger.info('[Move] Broadcasting item.removed', {
                    path: fromPath,
                    uid: oldFileUid,
                    wallet: req.user.wallet_address
                });
                broadcastItemRemoved(io, req.user.wallet_address, {
                    path: fromPath,
                    uid: oldFileUid,
                    descendants_only: false,
                    original_client_socket_id: null
                });
                const newFileUid = `uuid-${newPath.replace(/\//g, '-')}`;
                const trashDirPath = newPath.substring(0, newPath.lastIndexOf('/')) || '/';
                const fileName = metadata.path.split('/').pop() || '';
                logger.info('[Move] Broadcasting item.added to Trash', {
                    path: newPath,
                    dirpath: trashDirPath,
                    uid: newFileUid,
                    wallet: req.user.wallet_address
                });
                broadcastItemAdded(io, req.user.wallet_address, {
                    uid: newFileUid,
                    uuid: newFileUid,
                    name: originalFileName || fileName,
                    path: newPath,
                    dirpath: trashDirPath,
                    size: metadata.size,
                    type: metadata.mime_type || null,
                    mime_type: metadata.mime_type || undefined,
                    is_dir: metadata.is_dir,
                    created: new Date(metadata.created_at).toISOString(),
                    modified: new Date(metadata.updated_at).toISOString(),
                    original_client_socket_id: null
                });
            }
            else {
                const fileUid = `uuid-${newPath.replace(/\//g, '-')}`;
                logger.info('[Move] Broadcasting item.moved', {
                    from: fromPath,
                    to: newPath,
                    uid: fileUid,
                    wallet: req.user.wallet_address
                });
                broadcastItemMoved(io, req.user.wallet_address, {
                    uid: fileUid,
                    path: newPath,
                    old_path: fromPath,
                    name: metadata.path.split('/').pop() || '',
                    metadata: {
                        size: metadata.size,
                        mime_type: metadata.mime_type || undefined,
                        is_dir: metadata.is_dir
                    },
                    original_client_socket_id: null
                });
            }
        }
        else {
            logger.warn('[Move] WebSocket io not available, events not broadcast', {
                wallet: req.user.wallet_address
            });
        }
        res.json({ success: true, from: fromPath, to: newPath });
    }
    catch (error) {
        logger.error('Move error:', error instanceof Error ? error.message : 'Unknown error');
        res.status(500).json({
            error: 'Failed to move files',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
export async function handleRename(req, res) {
    const filesystem = req.app.locals.filesystem;
    const io = req.app.locals.io;
    const body = req.body;
    if (!filesystem) {
        res.status(500).json({ error: 'Filesystem not initialized' });
        return;
    }
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const filePath = body.path || body.uid;
    const newName = body.new_name;
    if (!filePath) {
        res.status(400).json({ error: 'path or uid is required' });
        return;
    }
    if (!newName) {
        res.status(400).json({ error: 'new_name is required' });
        return;
    }
    if (typeof newName !== 'string') {
        res.status(400).json({ error: 'new_name must be a string' });
        return;
    }
    if (newName.includes('/') || newName.includes('\0') || newName.trim() === '') {
        res.status(400).json({ error: 'Invalid filename' });
        return;
    }
    try {
        let resolvedPath;
        if (filePath.startsWith('uuid-') || filePath.includes('uuid-')) {
            logger.info('[Rename] Path is UUID, converting to path', { uid: filePath });
            if (!req.user) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const searchAllFiles = (dirPath) => {
                try {
                    const files = filesystem.listDirectory(dirPath, req.user.wallet_address);
                    for (const file of files) {
                        const fileUuid = `uuid-${file.path.replace(/\//g, '-')}`;
                        if (fileUuid === filePath || fileUuid.toLowerCase() === filePath.toLowerCase()) {
                            return file;
                        }
                        if (file.is_dir) {
                            const found = searchAllFiles(file.path);
                            if (found)
                                return found;
                        }
                    }
                }
                catch (error) {
                }
                return null;
            };
            const matchingFile = searchAllFiles(`/${req.user.wallet_address}`);
            if (!matchingFile) {
                logger.warn('[Rename] File not found by UUID', { uid: filePath });
                res.status(404).json({ error: 'File not found by UUID' });
                return;
            }
            resolvedPath = matchingFile.path;
            logger.info('[Rename] Found file by UUID', { uid: filePath, path: resolvedPath });
        }
        else {
            resolvedPath = filePath;
            if (resolvedPath.startsWith('~')) {
                resolvedPath = resolvedPath.replace('~', `/${req.user.wallet_address}`);
            }
            else if (!resolvedPath.startsWith('/')) {
                resolvedPath = `/${req.user.wallet_address}/${resolvedPath}`;
            }
        }
        const pathParts = resolvedPath.split('/').filter((p) => p);
        const parentPath = pathParts.length > 1
            ? '/' + pathParts.slice(0, -1).join('/')
            : '/';
        const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;
        logger.info('[Rename] Renaming file/directory', {
            from: resolvedPath,
            to: newPath,
            newName
        });
        const metadata = await filesystem.moveFile(resolvedPath, newPath, req.user.wallet_address);
        logger.info('[Rename] File/directory renamed successfully', {
            from: resolvedPath,
            to: newPath
        });
        if (io) {
            const socketId = req.socketId || undefined;
            broadcastItemRenamed(io, req.user.wallet_address, {
                uid: `uuid-${newPath.replace(/\//g, '-')}`,
                name: newName,
                path: newPath,
                old_path: resolvedPath,
                is_dir: metadata.is_dir,
                type: metadata.mime_type || null,
                original_client_socket_id: socketId
            });
        }
        const response = {
            uid: `uuid-${newPath.replace(/\//g, '-')}`,
            name: newName,
            is_dir: metadata.is_dir,
            path: newPath,
            old_path: resolvedPath,
            type: metadata.mime_type || null
        };
        res.json(response);
    }
    catch (error) {
        logger.error('Rename error:', error instanceof Error ? error.message : 'Unknown error');
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: 'File not found' });
        }
        else {
            res.status(500).json({
                error: 'Failed to rename file',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
//# sourceMappingURL=filesystem.js.map