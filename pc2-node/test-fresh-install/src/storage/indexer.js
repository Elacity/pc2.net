import { logger } from '../utils/logger.js';
async function extractTextContent(filesystem, path, walletAddress, mimeType) {
    try {
        if (!mimeType) {
            return '';
        }
        if (mimeType.startsWith('text/')) {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        if (mimeType === 'application/json') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                try {
                    const json = JSON.parse(content.toString('utf-8'));
                    return JSON.stringify(json);
                }
                catch {
                    return content.toString('utf-8');
                }
            }
            return String(content);
        }
        if (mimeType === 'application/javascript' ||
            mimeType === 'application/typescript' ||
            mimeType === 'text/javascript' ||
            mimeType === 'text/typescript') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        if (mimeType === 'text/html') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                const html = content.toString('utf-8');
                return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return String(content);
        }
        if (mimeType === 'text/csv') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        if (mimeType === 'text/xml' || mimeType === 'application/xml') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                const xml = content.toString('utf-8');
                return xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return String(content);
        }
        if (mimeType === 'application/pdf') {
            return await extractPDFText(filesystem, path, walletAddress);
        }
        return '';
    }
    catch (error) {
        logger.warn(`[Indexer] Failed to extract content from ${path}:`, error);
        return '';
    }
}
async function extractPDFText(filesystem, path, walletAddress) {
    try {
        const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const { getDocument } = pdfjsModule;
        const content = await filesystem.readFile(path, walletAddress);
        if (!(content instanceof Buffer)) {
            return '';
        }
        const pdf = await getDocument({ data: content }).promise;
        let fullText = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }
        return fullText.trim();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.warn(`[Indexer] Failed to extract PDF text from ${path}:`, {
            message: errorMessage,
            stack: errorStack,
            error: error
        });
        return '';
    }
}
export async function indexFile(db, filesystem, path, walletAddress) {
    try {
        const file = db.getFile(path, walletAddress);
        if (!file || file.is_dir) {
            return false;
        }
        const dbInstCheck = db.getDB();
        try {
            const fileWithContent = dbInstCheck.prepare(`
        SELECT content_text FROM files 
        WHERE path = ? AND wallet_address = ?
      `).get(path, walletAddress);
            if (fileWithContent && fileWithContent.content_text !== null && fileWithContent.content_text !== '') {
                return true;
            }
        }
        catch (checkError) {
            logger.debug(`[Indexer] Could not check existing content_text for ${path}:`, checkError);
        }
        const contentText = await extractTextContent(filesystem, path, walletAddress, file.mime_type);
        const dbInstUpdate = db.getDB();
        try {
            dbInstUpdate.prepare(`
        UPDATE files 
        SET content_text = ? 
        WHERE path = ? AND wallet_address = ?
      `).run(contentText, path, walletAddress);
        }
        catch (updateError) {
            if (updateError && updateError.message && !updateError.message.includes('no such table')) {
                throw updateError;
            }
            logger.debug(`[Indexer] Could not update content_text for ${path} (file may not exist):`, updateError);
            return false;
        }
        logger.debug(`[Indexer] Indexed file: ${path} (${contentText.length} chars)`);
        return true;
    }
    catch (error) {
        logger.error(`[Indexer] Error indexing file ${path}:`, error);
        return false;
    }
}
export class IndexingWorker {
    db;
    filesystem;
    isRunning = false;
    queue = [];
    processing = new Set();
    constructor(db, filesystem) {
        this.db = db;
        this.filesystem = filesystem;
    }
    enqueue(path, walletAddress, priority = 0) {
        const key = `${walletAddress}:${path}`;
        if (this.processing.has(key)) {
            return;
        }
        this.queue = this.queue.filter(task => !(task.path === path && task.walletAddress === walletAddress));
        this.queue.push({ path, walletAddress, priority });
        this.queue.sort((a, b) => b.priority - a.priority);
    }
    async start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        logger.info('[Indexer] Starting background indexing worker');
        while (this.isRunning) {
            if (this.queue.length > 0) {
                const task = this.queue.shift();
                if (task) {
                    const key = `${task.walletAddress}:${task.path}`;
                    this.processing.add(key);
                    try {
                        await indexFile(this.db, this.filesystem, task.path, task.walletAddress);
                    }
                    catch (error) {
                        logger.error(`[Indexer] Error processing ${task.path}:`, error);
                    }
                    finally {
                        this.processing.delete(key);
                    }
                }
            }
            else {
                await this.scanForUnindexedFiles();
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    stop() {
        this.isRunning = false;
        logger.info('[Indexer] Stopping background indexing worker');
    }
    async scanForUnindexedFiles() {
        try {
            const dbInst = this.db.getDB();
            const unindexed = dbInst.prepare(`
        SELECT path, wallet_address
        FROM files
        WHERE is_dir = 0
          AND (content_text IS NULL OR content_text = '')
          AND mime_type IS NOT NULL
        LIMIT 10
      `).all();
            for (const file of unindexed) {
                this.enqueue(file.path, file.wallet_address, 0);
            }
            if (unindexed.length > 0) {
                logger.debug(`[Indexer] Found ${unindexed.length} unindexed files`);
            }
        }
        catch (error) {
            logger.error('[Indexer] Error scanning for unindexed files:', error);
        }
    }
}
//# sourceMappingURL=indexer.js.map