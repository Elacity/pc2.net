export var PacketType;
(function (PacketType) {
    PacketType[PacketType["AUTH"] = 0] = "AUTH";
    PacketType[PacketType["AUTH_ACK"] = 1] = "AUTH_ACK";
    PacketType[PacketType["AUTH_ERROR"] = 2] = "AUTH_ERROR";
    PacketType[PacketType["ATTACH"] = 8] = "ATTACH";
    PacketType[PacketType["ATTACH_ACK"] = 9] = "ATTACH_ACK";
    PacketType[PacketType["ATTACH_ERROR"] = 10] = "ATTACH_ERROR";
    PacketType[PacketType["PING"] = 16] = "PING";
    PacketType[PacketType["PONG"] = 17] = "PONG";
    PacketType[PacketType["CONNECT"] = 32] = "CONNECT";
    PacketType[PacketType["CONNECT_ACK"] = 33] = "CONNECT_ACK";
    PacketType[PacketType["DISCONNECT"] = 48] = "DISCONNECT";
    PacketType[PacketType["DISCONNECT_ACK"] = 49] = "DISCONNECT_ACK";
    PacketType[PacketType["DATA"] = 64] = "DATA";
    PacketType[PacketType["ERROR"] = 112] = "ERROR";
})(PacketType || (PacketType = {}));
const HEADER_SIZE = 5;
const MAX_PACKET_SIZE = 1024 * 1024;
export function encodePacket(type, payload = Buffer.alloc(0)) {
    const length = 1 + payload.length;
    const packet = Buffer.alloc(4 + length);
    packet.writeUInt32BE(length, 0);
    packet.writeUInt8(type, 4);
    if (payload.length > 0) {
        payload.copy(packet, 5);
    }
    return packet;
}
export function decodePacket(data) {
    if (data.length < HEADER_SIZE) {
        return null;
    }
    const length = data.readUInt32BE(0);
    if (length > MAX_PACKET_SIZE) {
        throw new Error(`Packet too large: ${length} bytes`);
    }
    const totalLength = 4 + length;
    if (data.length < totalLength) {
        return null;
    }
    const type = data.readUInt8(4);
    const payload = Buffer.alloc(length - 1);
    if (length > 1) {
        data.copy(payload, 0, 5, totalLength);
    }
    return {
        packet: { type, payload },
        bytesConsumed: totalLength,
    };
}
export function encodeAuthPayload(nodeId, publicKey, signature, port) {
    const nodeIdBytes = Buffer.from(nodeId, 'utf8');
    const payload = Buffer.alloc(2 + nodeIdBytes.length + 32 + 64 + 2);
    let offset = 0;
    payload.writeUInt16BE(nodeIdBytes.length, offset);
    offset += 2;
    nodeIdBytes.copy(payload, offset);
    offset += nodeIdBytes.length;
    publicKey.copy(payload, offset);
    offset += 32;
    signature.copy(payload, offset);
    offset += 64;
    payload.writeUInt16BE(port, offset);
    return payload;
}
export function decodeAuthAckPayload(payload) {
    let offset = 0;
    const sessionIdLen = payload.readUInt16BE(offset);
    offset += 2;
    const sessionId = payload.slice(offset, offset + sessionIdLen).toString('utf8');
    offset += sessionIdLen;
    const allocatedPort = payload.readUInt16BE(offset);
    offset += 2;
    const serverPublicKey = Buffer.alloc(32);
    payload.copy(serverPublicKey, 0, offset, offset + 32);
    return { sessionId, allocatedPort, serverPublicKey };
}
export function decodeConnectPayload(payload) {
    let offset = 0;
    const connectionId = payload.readUInt32BE(offset);
    offset += 4;
    const addrLen = payload.readUInt16BE(offset);
    offset += 2;
    const sourceAddress = payload.slice(offset, offset + addrLen).toString('utf8');
    offset += addrLen;
    const sourcePort = payload.readUInt16BE(offset);
    return { connectionId, sourceAddress, sourcePort };
}
export function encodeDataPayload(connectionId, data) {
    const payload = Buffer.alloc(4 + data.length);
    payload.writeUInt32BE(connectionId, 0);
    data.copy(payload, 4);
    return payload;
}
export function decodeDataPayload(payload) {
    const connectionId = payload.readUInt32BE(0);
    const data = Buffer.alloc(payload.length - 4);
    payload.copy(data, 0, 4);
    return { connectionId, data };
}
export function encodeDisconnectPayload(connectionId) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32BE(connectionId, 0);
    return payload;
}
export function getPacketTypeName(type) {
    const names = {
        [PacketType.AUTH]: 'AUTH',
        [PacketType.AUTH_ACK]: 'AUTH_ACK',
        [PacketType.AUTH_ERROR]: 'AUTH_ERROR',
        [PacketType.ATTACH]: 'ATTACH',
        [PacketType.ATTACH_ACK]: 'ATTACH_ACK',
        [PacketType.ATTACH_ERROR]: 'ATTACH_ERROR',
        [PacketType.PING]: 'PING',
        [PacketType.PONG]: 'PONG',
        [PacketType.CONNECT]: 'CONNECT',
        [PacketType.CONNECT_ACK]: 'CONNECT_ACK',
        [PacketType.DISCONNECT]: 'DISCONNECT',
        [PacketType.DISCONNECT_ACK]: 'DISCONNECT_ACK',
        [PacketType.DATA]: 'DATA',
        [PacketType.ERROR]: 'ERROR',
    };
    return names[type] || `UNKNOWN(0x${type.toString(16)})`;
}
export class PacketBuffer {
    buffer = Buffer.alloc(0);
    append(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
    }
    extractPacket() {
        const result = decodePacket(this.buffer);
        if (result) {
            this.buffer = this.buffer.slice(result.bytesConsumed);
            return result.packet;
        }
        return null;
    }
    get length() {
        return this.buffer.length;
    }
    clear() {
        this.buffer = Buffer.alloc(0);
    }
}
//# sourceMappingURL=ProxyProtocol.js.map