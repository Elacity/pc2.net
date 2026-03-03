#!/usr/bin/env npx tsx
import nacl from 'tweetnacl';
import net from 'net';
import { ensureWasmReady, ed25519PublicKeyToX25519, ed25519PrivateKeyToX25519, deriveNonceFromX25519Keys, signEd25519 } from './src/services/boson/CryptoBox.js';
const SUPERNODE = {
    address: '69.164.241.210',
    port: 8090,
    nodeId: Buffer.from('fcc407f1588a201246b1d460bcc1b00051f46a6cf8051f9ff7f98d997572e99f', 'hex')
};
async function testActiveProxy() {
    console.log('🧪 PC2 Active Proxy Device Test\n');
    console.log(`📍 Target: ${SUPERNODE.address}:${SUPERNODE.port}`);
    console.log('━'.repeat(50));
    await ensureWasmReady();
    console.log('✅ Crypto ready\n');
    const clientKeyPair = nacl.sign.keyPair();
    const clientEd25519Pub = clientKeyPair.publicKey;
    const clientEd25519Priv = clientKeyPair.secretKey;
    console.log('🔑 Test identity generated');
    console.log(`   Node ID: ${Buffer.from(clientEd25519Pub).toString('hex').slice(0, 16)}...`);
    const clientX25519Pub = ed25519PublicKeyToX25519(clientEd25519Pub);
    const clientX25519Priv = ed25519PrivateKeyToX25519(clientEd25519Priv);
    const serverX25519Pub = ed25519PublicKeyToX25519(new Uint8Array(SUPERNODE.nodeId));
    const sharedKey = nacl.box.before(serverX25519Pub, clientX25519Priv);
    const xorNonce = deriveNonceFromX25519Keys(clientX25519Pub, serverX25519Pub);
    console.log('🔐 Crypto keys derived\n');
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('Connection timeout'));
        }, 30000);
        socket.on('error', (err) => {
            clearTimeout(timeout);
            console.log('❌ Connection error:', err.message);
            reject(err);
        });
        let state = 'connecting';
        let dataBuffer = Buffer.alloc(0);
        socket.on('data', (data) => {
            dataBuffer = Buffer.concat([dataBuffer, data]);
            if (state === 'challenge') {
                if (dataBuffer.length < 2)
                    return;
                const challengeLen = dataBuffer.readUInt16BE(0);
                if (dataBuffer.length < challengeLen)
                    return;
                const challenge = dataBuffer.slice(2, challengeLen);
                dataBuffer = dataBuffer.slice(challengeLen);
                console.log(`📨 Challenge received: ${challenge.length} bytes`);
                const signature = signEd25519(new Uint8Array(challenge), clientEd25519Priv);
                console.log('✍️  Challenge signed');
                const sessionKeyPair = nacl.box.keyPair();
                const sessionNonce = nacl.randomBytes(24);
                const authPayload = Buffer.alloc(32 + 24 + 64 + 1);
                let pos = 0;
                Buffer.from(sessionKeyPair.publicKey).copy(authPayload, pos);
                pos += 32;
                Buffer.from(sessionNonce).copy(authPayload, pos);
                pos += 24;
                Buffer.from(signature).copy(authPayload, pos);
                pos += 64;
                authPayload[pos] = 0;
                const encrypted = nacl.box.after(new Uint8Array(authPayload), xorNonce, sharedKey);
                const packetLen = 3 + 32 + encrypted.length;
                const authPacket = Buffer.alloc(packetLen);
                authPacket.writeUInt16BE(packetLen, 0);
                authPacket.writeUInt8(0x00, 2);
                Buffer.from(clientEd25519Pub).copy(authPacket, 3);
                Buffer.from(encrypted).copy(authPacket, 35);
                socket.write(authPacket);
                console.log('📤 AUTH sent, waiting for response...\n');
                state = 'auth_sent';
            }
            if (state === 'auth_sent') {
                if (dataBuffer.length < 3)
                    return;
                const responseLen = dataBuffer.readUInt16BE(0);
                if (dataBuffer.length < responseLen)
                    return;
                const packetType = dataBuffer.readUInt8(2);
                const isAuthAck = packetType >= 0x80 && packetType <= 0x87;
                const isError = packetType >= 0x70 && packetType <= 0x7F;
                if (isError) {
                    clearTimeout(timeout);
                    console.log('❌ Server returned ERROR');
                    socket.destroy();
                    reject(new Error('Server error'));
                    return;
                }
                if (isAuthAck) {
                    const cipher = dataBuffer.slice(3, 3 + 51);
                    const plaintext = nacl.box.open.after(new Uint8Array(cipher), xorNonce, sharedKey);
                    if (!plaintext) {
                        clearTimeout(timeout);
                        console.log('❌ Failed to decrypt AUTH_ACK');
                        socket.destroy();
                        reject(new Error('Decryption failed'));
                        return;
                    }
                    const serverSessionPk = Buffer.from(plaintext.slice(0, 32));
                    const allocatedPort = (plaintext[32] << 8) | plaintext[33];
                    const domainEnabled = plaintext[34] !== 0;
                    console.log('━'.repeat(50));
                    console.log('🎉 ACTIVE PROXY CONNECTED!\n');
                    console.log('📊 Connection Details:');
                    console.log(`   Public Address: ${SUPERNODE.address}:${allocatedPort}`);
                    console.log(`   Server Session: ${serverSessionPk.toString('hex').slice(0, 16)}...`);
                    console.log(`   Domain Enabled: ${domainEnabled ? 'Yes' : 'No'}`);
                    console.log('\n💡 Your device is now reachable from the internet at:');
                    console.log(`   http://${SUPERNODE.address}:${allocatedPort}`);
                    console.log('━'.repeat(50));
                    clearTimeout(timeout);
                    state = 'done';
                    setTimeout(() => {
                        socket.destroy();
                        resolve();
                    }, 2000);
                }
            }
        });
        console.log('🔗 Connecting to supernode...');
        socket.connect(SUPERNODE.port, SUPERNODE.address, () => {
            console.log('✅ TCP connected');
            state = 'challenge';
        });
    });
}
testActiveProxy()
    .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
})
    .catch((err) => {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
});
//# sourceMappingURL=test-device-proxy.js.map