import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { PacketType, PacketBuffer, encodePacket, encodeAuthPayload, encodeDataPayload, encodeDisconnectPayload, decodeAuthAckPayload, decodeConnectPayload, decodeDataPayload, getPacketTypeName, } from './ProxyProtocol.js';
export var ConnectionState;
(function (ConnectionState) {
    ConnectionState["DISCONNECTED"] = "disconnected";
    ConnectionState["CONNECTING"] = "connecting";
    ConnectionState["AUTHENTICATING"] = "authenticating";
    ConnectionState["CONNECTED"] = "connected";
    ConnectionState["RECONNECTING"] = "reconnecting";
})(ConnectionState || (ConnectionState = {}));
const defaultLogger = {
    debug: (msg) => console.debug(`[ActiveProxy] ${msg}`),
    info: (msg) => console.info(`[ActiveProxy] ${msg}`),
    warn: (msg) => console.warn(`[ActiveProxy] ${msg}`),
    error: (msg) => console.error(`[ActiveProxy] ${msg}`),
};
const DEFAULT_CONFIG = {
    keepaliveIntervalMs: 30000,
    reconnectIntervalMs: 5000,
    maxReconnectAttempts: 10,
};
export class ActiveProxyClient extends EventEmitter {
    config;
    socket = null;
    packetBuffer;
    state = ConnectionState.DISCONNECTED;
    sessionId = null;
    allocatedPort = null;
    serverPublicKey = null;
    keepaliveTimer = null;
    reconnectTimer = null;
    reconnectAttempts = 0;
    activeConnections = new Map();
    isShuttingDown = false;
    constructor(config) {
        super();
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            logger: config.logger || defaultLogger,
        };
        this.packetBuffer = new PacketBuffer();
    }
    getState() {
        return this.state;
    }
    getSessionId() {
        return this.sessionId;
    }
    getAllocatedPort() {
        return this.allocatedPort;
    }
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }
    getActiveConnectionsCount() {
        return this.activeConnections.size;
    }
    async connect() {
        if (this.state !== ConnectionState.DISCONNECTED) {
            this.config.logger.warn('Already connected or connecting');
            return;
        }
        this.isShuttingDown = false;
        this.state = ConnectionState.CONNECTING;
        return new Promise((resolve, reject) => {
            this.config.logger.info(`Connecting to ${this.config.host}:${this.config.port}...`);
            this.socket = new net.Socket();
            const connectionTimeout = setTimeout(() => {
                if (this.state === ConnectionState.CONNECTING) {
                    this.socket?.destroy();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
            this.socket.connect(this.config.port, this.config.host, () => {
                clearTimeout(connectionTimeout);
                this.config.logger.info('TCP connection established');
                this.state = ConnectionState.AUTHENTICATING;
                this.authenticate();
            });
            this.socket.on('data', (data) => {
                this.handleData(data);
            });
            this.socket.on('error', (error) => {
                clearTimeout(connectionTimeout);
                this.config.logger.error(`Socket error: ${error.message}`);
                this.emit('error', error);
                if (this.state === ConnectionState.CONNECTING) {
                    reject(error);
                }
            });
            this.socket.on('close', () => {
                this.config.logger.info('Socket closed');
                this.handleDisconnect('Socket closed');
            });
            this.once('connected', () => {
                resolve();
            });
            this.once('error', (error) => {
                if (this.state === ConnectionState.AUTHENTICATING) {
                    reject(error);
                }
            });
        });
    }
    async disconnect() {
        this.isShuttingDown = true;
        this.stopKeepalive();
        this.cancelReconnect();
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.state = ConnectionState.DISCONNECTED;
        this.sessionId = null;
        this.allocatedPort = null;
        this.activeConnections.clear();
        this.config.logger.info('Disconnected');
    }
    sendData(connectionId, data) {
        if (!this.isConnected() || !this.socket) {
            this.config.logger.warn('Cannot send data: not connected');
            return false;
        }
        const payload = encodeDataPayload(connectionId, data);
        const packet = encodePacket(PacketType.DATA, payload);
        try {
            this.socket.write(packet);
            return true;
        }
        catch (error) {
            this.config.logger.error(`Failed to send data: ${error}`);
            return false;
        }
    }
    closeConnection(connectionId) {
        if (!this.isConnected() || !this.socket) {
            return;
        }
        const payload = encodeDisconnectPayload(connectionId);
        const packet = encodePacket(PacketType.DISCONNECT, payload);
        try {
            this.socket.write(packet);
            this.activeConnections.delete(connectionId);
        }
        catch (error) {
            this.config.logger.error(`Failed to close connection: ${error}`);
        }
    }
    authenticate() {
        if (!this.socket)
            return;
        this.config.logger.info('Sending AUTH packet...');
        const signatureData = Buffer.from(this.config.nodeId, 'utf8');
        const signature = this.sign(signatureData);
        const payload = encodeAuthPayload(this.config.nodeId, this.config.publicKey, signature, this.config.localPort);
        const packet = encodePacket(PacketType.AUTH, payload);
        this.socket.write(packet);
    }
    sign(data) {
        const hash = crypto.createHash('sha512');
        hash.update(data);
        hash.update(this.config.privateKey);
        const fullHash = hash.digest();
        return fullHash.slice(0, 64);
    }
    handleData(data) {
        try {
            this.packetBuffer.append(data);
            let packet;
            while ((packet = this.packetBuffer.extractPacket()) !== null) {
                this.handlePacket(packet);
            }
        }
        catch (error) {
            const preview = data.slice(0, 100).toString('hex');
            this.config.logger.error(`Protocol error: ${error}. Data preview: ${preview}`);
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            this.handleDisconnect('Protocol error');
        }
    }
    handlePacket(packet) {
        this.config.logger.debug(`Received ${getPacketTypeName(packet.type)} packet`);
        switch (packet.type) {
            case PacketType.AUTH_ACK:
                this.handleAuthAck(packet.payload);
                break;
            case PacketType.AUTH_ERROR:
                this.handleAuthError(packet.payload);
                break;
            case PacketType.PONG:
                this.config.logger.debug('Received PONG');
                break;
            case PacketType.CONNECT:
                this.handleConnect(packet.payload);
                break;
            case PacketType.DISCONNECT:
                this.handleDisconnectPacket(packet.payload);
                break;
            case PacketType.DATA:
                this.handleDataPacket(packet.payload);
                break;
            case PacketType.ERROR:
                this.handleError(packet.payload);
                break;
            default:
                this.config.logger.warn(`Unknown packet type: 0x${packet.type.toString(16)}`);
        }
    }
    handleAuthAck(payload) {
        try {
            const authAck = decodeAuthAckPayload(payload);
            this.sessionId = authAck.sessionId;
            this.allocatedPort = authAck.allocatedPort;
            this.serverPublicKey = authAck.serverPublicKey;
            this.state = ConnectionState.CONNECTED;
            this.reconnectAttempts = 0;
            this.config.logger.info(`Authenticated! Session: ${this.sessionId}, Port: ${this.allocatedPort}`);
            this.startKeepalive();
            this.emit('connected', this.sessionId, this.allocatedPort);
        }
        catch (error) {
            this.config.logger.error(`Failed to parse AUTH_ACK: ${error}`);
            this.handleDisconnect('AUTH_ACK parse error');
        }
    }
    handleAuthError(payload) {
        const message = payload.toString('utf8');
        this.config.logger.error(`Authentication failed: ${message}`);
        this.emit('error', new Error(`Authentication failed: ${message}`));
        this.handleDisconnect('Authentication failed');
    }
    handleConnect(payload) {
        try {
            const conn = decodeConnectPayload(payload);
            this.config.logger.info(`New connection: ${conn.connectionId} from ${conn.sourceAddress}:${conn.sourcePort}`);
            this.activeConnections.set(conn.connectionId, conn);
            this.emit('connection', conn);
            if (this.socket) {
                const ackPayload = Buffer.alloc(4);
                ackPayload.writeUInt32BE(conn.connectionId, 0);
                const packet = encodePacket(PacketType.CONNECT_ACK, ackPayload);
                this.socket.write(packet);
            }
        }
        catch (error) {
            this.config.logger.error(`Failed to handle CONNECT: ${error}`);
        }
    }
    handleDisconnectPacket(payload) {
        const connectionId = payload.readUInt32BE(0);
        this.config.logger.info(`Connection closed: ${connectionId}`);
        this.activeConnections.delete(connectionId);
        this.emit('connectionClosed', connectionId);
    }
    handleDataPacket(payload) {
        try {
            const dataPacket = decodeDataPayload(payload);
            this.emit('data', dataPacket.connectionId, dataPacket.data);
        }
        catch (error) {
            this.config.logger.error(`Failed to handle DATA: ${error}`);
        }
    }
    handleError(payload) {
        const message = payload.toString('utf8');
        this.config.logger.error(`Server error: ${message}`);
        this.emit('error', new Error(`Server error: ${message}`));
    }
    handleDisconnect(reason) {
        const wasConnected = this.state === ConnectionState.CONNECTED;
        this.stopKeepalive();
        this.state = ConnectionState.DISCONNECTED;
        this.sessionId = null;
        this.allocatedPort = null;
        this.activeConnections.clear();
        this.packetBuffer.clear();
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.emit('disconnected', reason);
        if (!this.isShuttingDown && wasConnected) {
            this.scheduleReconnect();
        }
    }
    startKeepalive() {
        this.stopKeepalive();
        this.keepaliveTimer = setInterval(() => {
            if (this.isConnected() && this.socket) {
                const packet = encodePacket(PacketType.PING);
                try {
                    this.socket.write(packet);
                    this.config.logger.debug('Sent PING');
                }
                catch (error) {
                    this.config.logger.error(`Failed to send PING: ${error}`);
                }
            }
        }, this.config.keepaliveIntervalMs);
    }
    stopKeepalive() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.config.logger.error('Max reconnection attempts reached');
            this.emit('error', new Error('Max reconnection attempts reached'));
            return;
        }
        this.reconnectAttempts++;
        const delay = this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1);
        this.config.logger.info(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.state = ConnectionState.RECONNECTING;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            this.state = ConnectionState.DISCONNECTED;
            try {
                await this.connect();
            }
            catch (error) {
                this.config.logger.error(`Reconnection failed: ${error}`);
                this.scheduleReconnect();
            }
        }, delay);
    }
    cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
//# sourceMappingURL=ActiveProxyClient.js.map