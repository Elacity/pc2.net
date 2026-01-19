/**
 * File Content Indexer
 *
 * Extracts and indexes text content from files for full-text search
 */
import { DatabaseManager } from './database.js';
import { FilesystemManager } from './filesystem.js';
/**
 * Index a single file (extract content and update database)
 */
export declare function indexFile(db: DatabaseManager, filesystem: FilesystemManager, path: string, walletAddress: string): Promise<boolean>;
/**
 * Background indexing worker
 * Processes files in priority queue (recently accessed first)
 */
export declare class IndexingWorker {
    private db;
    private filesystem;
    private isRunning;
    private queue;
    private processing;
    constructor(db: DatabaseManager, filesystem: FilesystemManager);
    /**
     * Add file to indexing queue
     */
    enqueue(path: string, walletAddress: string, priority?: number): void;
    /**
     * Start background indexing
     */
    start(): Promise<void>;
    /**
     * Stop background indexing
     */
    stop(): void;
    /**
     * Scan database for files that need indexing
     */
    private scanForUnindexedFiles;
}
//# sourceMappingURL=indexer.d.ts.map