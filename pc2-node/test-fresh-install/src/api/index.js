import multer from 'multer';
import { authenticate, corsMiddleware, errorHandler } from './middleware.js';
import { logger } from '../utils/logger.js';
import { handleWhoami } from './whoami.js';
import { handleParticleAuth, handleGrantUserApp, handleGetUserAppToken } from './auth.js';
import { handleStat, handleReaddir, handleRead, handleWrite, handleMkdir, handleDelete, handleMove, handleRename } from './filesystem.js';
import { handleSign, handleVersion, handleOSUser, handleKV, handleRAO, handleContactUs, handleDriversCall, handleGetWallets, handleOpenItem, handleSuggestApps, handleItemMetadata, handleWriteFile } from './other.js';
import { handleAPIInfo, handleGetLaunchApps, handleDF, handleBatch, handleCacheTimestamp, handleStats } from './info.js';
import { handleFile } from './file.js';
import storageRouter from './storage.js';
import { handleSearch } from './search.js';
export function setupAPI(app) {
    app.use((req, res, next) => {
        if (req.path === '/stat' || req.path.startsWith('/stat')) {
            logger.info(`[Route Debug] /stat request: method=${req.method}, path=${req.path}, url=${req.url}, query=${JSON.stringify(req.query)}, body=${JSON.stringify(req.body)}`);
        }
        next();
    });
    app.use(corsMiddleware);
    app.get('/health', (req, res) => {
        const db = app.locals.db;
        const filesystem = app.locals.filesystem;
        const config = app.locals.config;
        const io = app.locals.io;
        const dbStatus = db ? 'connected' : 'not initialized';
        const ipfsStatus = filesystem ? 'available' : 'not initialized';
        const websocketStatus = io ? 'active' : 'not initialized';
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: dbStatus,
            ipfs: ipfsStatus,
            websocket: websocketStatus
        };
        if (config) {
            health.owner = {
                set: config.owner.wallet_address !== null,
                tethered_wallets: config.owner.tethered_wallets.length
            };
        }
        if (!db) {
            health.status = 'degraded';
        }
        res.json(health);
    });
    app.get('/version', handleVersion);
    app.get('/api/info', handleAPIInfo);
    app.get('/get-launch-apps', handleGetLaunchApps);
    app.get('/cache/last-change-timestamp', handleCacheTimestamp);
    app.get('/file', handleFile);
    app.post('/auth/particle', handleParticleAuth);
    app.post('/auth/grant-user-app', authenticate, handleGrantUserApp);
    app.get('/auth/get-user-app-token', authenticate, handleGetUserAppToken);
    app.post('/auth/get-user-app-token', authenticate, handleGetUserAppToken);
    app.get('/whoami', handleWhoami);
    app.get('/os/user', handleOSUser);
    app.get('/api/stats', authenticate, handleStats);
    app.get('/api/wallets', authenticate, handleGetWallets);
    app.use('/api/storage', storageRouter);
    app.post('/search', authenticate, handleSearch);
    app.all('/stat', authenticate, handleStat);
    app.post('/readdir', authenticate, handleReaddir);
    app.get('/read', authenticate, handleRead);
    app.post('/read', authenticate, handleRead);
    app.post('/write', authenticate, handleWrite);
    app.post('/mkdir', authenticate, handleMkdir);
    app.post('/delete', authenticate, handleDelete);
    app.post('/move', authenticate, handleMove);
    app.post('/rename', authenticate, handleRename);
    app.post('/api/files/mkdir', authenticate, handleMkdir);
    app.post('/api/files/delete', authenticate, handleDelete);
    app.post('/api/files/move', authenticate, handleMove);
    app.get('/df', authenticate, handleDF);
    app.post('/df', authenticate, handleDF);
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 100 * 1024 * 1024
        }
    });
    app.post('/batch', authenticate, upload.any(), handleBatch);
    app.post('/sign', authenticate, handleSign);
    app.get('/kv/:key*', authenticate, handleKV);
    app.post('/kv/:key*', authenticate, handleKV);
    app.delete('/kv/:key*', authenticate, handleKV);
    app.get('/api/kv/:key*', authenticate, handleKV);
    app.post('/api/kv/:key*', authenticate, handleKV);
    app.delete('/api/kv/:key*', authenticate, handleKV);
    app.post('/rao', authenticate, handleRAO);
    app.post('/contactUs', handleContactUs);
    app.post('/drivers/call', authenticate, handleDriversCall);
    app.post('/open_item', authenticate, handleOpenItem);
    app.post('/suggest_apps', authenticate, handleSuggestApps);
    app.get('/itemMetadata', authenticate, handleItemMetadata);
    app.post('/writeFile', authenticate, handleWriteFile);
    app.put('/writeFile', authenticate, handleWriteFile);
    app.use(errorHandler);
}
//# sourceMappingURL=index.js.map