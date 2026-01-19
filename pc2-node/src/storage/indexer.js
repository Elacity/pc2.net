/**
 * File Content Indexer
 *
 * Extracts and indexes text content from files for full-text search
 */
import { logger } from '../utils/logger.js';
/**
 * Extract text content from a file based on its MIME type
 */
async function extractTextContent(filesystem, path, walletAddress, mimeType) {
    try {
        if (!mimeType) {
            return '';
        }
        // Text-based files - read directly
        if (mimeType.startsWith('text/')) {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        // JSON files
        if (mimeType === 'application/json') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                try {
                    const json = JSON.parse(content.toString('utf-8'));
                    // Extract text from JSON (simple approach - stringify and extract values)
                    return JSON.stringify(json);
                }
                catch {
                    return content.toString('utf-8');
                }
            }
            return String(content);
        }
        // JavaScript/TypeScript files
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
        // Markdown files
        if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        // HTML files - extract text (strip tags)
        if (mimeType === 'text/html') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                const html = content.toString('utf-8');
                // Simple HTML tag stripping (basic implementation)
                return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return String(content);
        }
        // CSV files
        if (mimeType === 'text/csv') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                return content.toString('utf-8');
            }
            return String(content);
        }
        // XML files
        if (mimeType === 'text/xml' || mimeType === 'application/xml') {
            const content = await filesystem.readFile(path, walletAddress);
            if (content instanceof Buffer) {
                const xml = content.toString('utf-8');
                // Simple XML tag stripping
                return xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return String(content);
        }
        // PDF files - handled by extractPDFText function
        if (mimeType === 'application/pdf') {
            return await extractPDFText(filesystem, path, walletAddress);
        }
        // For other file types, return empty string (no content extraction)
        return '';
    }
    catch (error) {
        logger.warn(`[Indexer] Failed to extract content from ${path}:`, error);
        return '';
    }
}
/**
 * Extract text from PDF using pdfjs-dist
 */
async function extractPDFText(filesystem, path, walletAddress) {
    try {
        // Import pdfjs-dist (required dependency)
        // Use legacy build for Node.js compatibility
        const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const { getDocument } = pdfjsModule;
        const content = await filesystem.readFile(path, walletAddress);
        if (!(content instanceof Buffer)) {
            return '';
        }
        // Load PDF document
        const pdf = await getDocument({ data: content }).promise;
        let fullText = '';
        // Extract text from each page
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
/**
 * Index a single file (extract content and update database)
 */
export async function indexFile(db, filesystem, path, walletAddress) {
    try {
        // Get file metadata
        const file = db.getFile(path, walletAddress);
        if (!file || file.is_dir) {
            return false;
        }
        // Check if already indexed (has content_text)
        // Query database directly to check if content_text exists and is not empty
        const dbInstCheck = db.getDB();
        try {
            const fileWithContent = dbInstCheck.prepare(`
        SELECT content_text FROM files 
        WHERE path = ? AND wallet_address = ?
      `).get(path, walletAddress);
            if (fileWithContent && fileWithContent.content_text !== null && fileWithContent.content_text !== '') {
                // Already indexed, skip
                return true;
            }
        }
        catch (checkError) {
            // File might not exist in database yet, continue with indexing
            logger.debug(`[Indexer] Could not check existing content_text for ${path}:`, checkError);
        }
        // Extract content based on MIME type
        // PDF extraction is handled within extractTextContent for consistency
        const contentText = await extractTextContent(filesystem, path, walletAddress, file.mime_type);
        // Update database with extracted content
        // Note: The FTS5 trigger will automatically update the FTS5 index
        const dbInstUpdate = db.getDB();
        try {
            dbInstUpdate.prepare(`
        UPDATE files 
        SET content_text = ? 
        WHERE path = ? AND wallet_address = ?
      `).run(contentText, path, walletAddress);
        }
        catch (updateError) {
            // If file doesn't exist in database, that's OK - it might have been deleted
            // Log but don't fail the indexing operation
            if (updateError && updateError.message && !updateError.message.includes('no such table')) {
                throw updateError; // Re-throw if it's a real error
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
/**
 * Background indexing worker
 * Processes files in priority queue (recently accessed first)
 */
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
    /**
     * Add file to indexing queue
     */
    enqueue(path, walletAddress, priority = 0) {
        const key = `${walletAddress}:${path}`;
        if (this.processing.has(key)) {
            return; // Already processing
        }
        // Remove existing entry if present
        this.queue = this.queue.filter(task => !(task.path === path && task.walletAddress === walletAddress));
        // Add with priority
        this.queue.push({ path, walletAddress, priority });
        this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    }
    /**
     * Start background indexing
     */
    async start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        logger.info('[Indexer] Starting background indexing worker');
        // Process queue continuously
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
                // Queue empty, scan for unindexed files
                await this.scanForUnindexedFiles();
                // Wait before next scan
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
            }
        }
    }
    /**
     * Stop background indexing
     */
    stop() {
        this.isRunning = false;
        logger.info('[Indexer] Stopping background indexing worker');
    }
    /**
     * Scan database for files that need indexing
     */
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