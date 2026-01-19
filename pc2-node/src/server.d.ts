import { Express } from 'express';
import { Server } from 'http';
import { DatabaseManager, FilesystemManager } from './storage/index.js';
import { Config } from './config/loader.js';
import { AIChatService } from './services/ai/AIChatService.js';
export interface ServerOptions {
    port: number;
    frontendPath: string;
    isProduction: boolean;
    database?: DatabaseManager;
    filesystem?: FilesystemManager;
    config?: Config;
    aiService?: AIChatService;
}
export declare function createServer(options: ServerOptions): {
    app: Express;
    server: Server;
};
//# sourceMappingURL=server.d.ts.map