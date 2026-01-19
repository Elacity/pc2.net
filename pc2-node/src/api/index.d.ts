import { Express } from 'express';
import { DatabaseManager, FilesystemManager } from '../storage/index.js';
import { Config } from '../config/loader.js';
import { Server as SocketIOServer } from 'socket.io';
declare global {
    namespace Express {
        interface Application {
            locals: {
                db?: DatabaseManager;
                filesystem?: FilesystemManager;
                config?: Config;
                io?: SocketIOServer;
            };
        }
    }
}
export declare function setupAPI(app: Express): void;
//# sourceMappingURL=index.d.ts.map