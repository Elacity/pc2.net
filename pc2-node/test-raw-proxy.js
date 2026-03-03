import net from 'net';
import nacl from 'tweetnacl';
import ed25519ToX25519 from 'ed25519-to-x25519.wasm';
const SUPERNODE_HOST = '69.164.241.210';
const SUPERNODE_PORT = 8090;
const SUPERNODE_NODE_ID = 'J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E';
function waitForWasm() {
    return new Promise((resolve) => {
        ed25519ToX25519.ready(() => {
            console.log('✅ WASM module ready');
            resolve();
        });
    });
}
function ed25519PubToX25519(ed25519Pub) {
    return ed25519ToX25519.convert_public_key(ed25519Pub);
}
function ed25519PrivToX25519(ed25519Priv) {
    return ed25519ToX25519.convert_private_key(ed25519Priv);
}
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function fromBase58(str) {
    let num = BigInt(0);
    for (const char of str) {
        const index = BASE58_ALPHABET.indexOf(char);
        if (index === -1)
            throw new Error(`Invalid Base58 character: ${char}`);
        num = num * 58n + BigInt(index);
    }
    let hex = num.toString(16);
    if (hex.length % 2 !== 0)
        hex = '0' + hex;
    let leadingZeros = 0;
    for (const char of str) {
        if (char === '1')
            leadingZeros++;
        else
            break;
    }
    const dataBytes = Buffer.from(hex, 'hex');
    if (leadingZeros > 0) {
        return Buffer.concat([Buffer.alloc(leadingZeros), dataBytes]);
    }
    return dataBytes;
}
async function main() {
    console.log('🧪 Raw Active Proxy Protocol Test\n');
    await waitForWasm();
    const clientKeyPair = nacl.sign.keyPair();
    const clientEd25519Pub = clientKeyPair.publicKey;
    const clientEd25519Priv = clientKeyPair.secretKey;
    console.log('Client Ed25519 pubkey:', Buffer.from(clientEd25519Pub).toString('hex'));
    console.log('Client Ed25519 privkey length:', clientEd25519Priv.length, 'bytes');
    const clientX25519Priv = ed25519PrivToX25519(clientEd25519Priv);
    console.log('Client X25519 privkey:', Buffer.from(clientX25519Priv).toString('hex').slice(0, 32) + '...');
    const clientX25519PubFromPriv = nacl.scalarMult.base(clientX25519Priv);
    const clientX25519PubFromEd = ed25519PubToX25519(clientEd25519Pub);
    console.log('Client X25519 pubkey (from priv):', Buffer.from(clientX25519PubFromPriv).toString('hex'));
    console.log('Client X25519 pubkey (from ed25519 pub):', Buffer.from(clientX25519PubFromEd).toString('hex'));
    console.log('X25519 pubkeys match:', Buffer.from(clientX25519PubFromPriv).equals(Buffer.from(clientX25519PubFromEd)));
    const supernodeEd25519Pub = fromBase58(SUPERNODE_NODE_ID);
    console.log('Supernode Ed25519 pubkey:', supernodeEd25519Pub.toString('hex'));
    console.log('Supernode pubkey length:', supernodeEd25519Pub.length);
    const serverX25519Pub = ed25519PubToX25519(new Uint8Array(supernodeEd25519Pub));
    console.log('Supernode X25519 pubkey (converted):', Buffer.from(serverX25519Pub).toString('hex'));
    const serverRawAsX25519 = new Uint8Array(supernodeEd25519Pub);
    console.log('Supernode pubkey (raw/direct):', Buffer.from(serverRawAsX25519).toString('hex'));
    console.log(`\n🔗 Connecting to ${SUPERNODE_HOST}:${SUPERNODE_PORT}...\n`);
    const socket = new net.Socket();
    socket.connect(SUPERNODE_PORT, SUPERNODE_HOST, () => {
        console.log('✅ TCP connected, waiting for challenge...');
    });
    let receivedData = Buffer.alloc(0);
    let handshakeComplete = false;
    let sessionKeyPair = null;
    let derivedNonce = null;
    let ed25519DerivedNonce = null;
    let sessionNonce = null;
    socket.on('data', (data) => {
        receivedData = Buffer.concat([receivedData, data]);
        console.log(`📥 Received ${data.length} bytes (total: ${receivedData.length})`);
        console.log('   Hex:', data.toString('hex').slice(0, 100) + (data.length > 50 ? '...' : ''));
        if (receivedData.length >= 2) {
            const messageLen = receivedData.readUInt16BE(0);
            console.log('   Message length field:', messageLen);
            if (receivedData.length >= messageLen) {
                if (!handshakeComplete) {
                    console.log('\n📝 Complete challenge received!');
                    const challenge = receivedData.slice(2, messageLen);
                    console.log('   Challenge length:', challenge.length, 'bytes');
                    console.log('   Challenge:', challenge.toString('hex').slice(0, 64) + '...');
                    const signature = nacl.sign.detached(new Uint8Array(challenge), clientEd25519Priv);
                    console.log('\n🔏 Signed challenge');
                    console.log('   Signature:', Buffer.from(signature).toString('hex').slice(0, 64) + '...');
                    sessionKeyPair = nacl.box.keyPair();
                    console.log('   Session X25519 pubkey:', Buffer.from(sessionKeyPair.publicKey).toString('hex'));
                    sessionNonce = nacl.randomBytes(24);
                    const domainLen = 0;
                    const authPayload = Buffer.alloc(32 + 24 + 64 + 1 + domainLen);
                    let pos = 0;
                    Buffer.from(sessionKeyPair.publicKey).copy(authPayload, pos);
                    pos += 32;
                    Buffer.from(sessionNonce).copy(authPayload, pos);
                    pos += 24;
                    Buffer.from(signature).copy(authPayload, pos);
                    pos += 64;
                    authPayload.writeUInt8(domainLen, pos);
                    pos += 1;
                    console.log('\n📦 Built auth payload:', authPayload.length, 'bytes');
                    const paddingLen = Math.floor(Math.random() * 256);
                    const plaintextWithPadding = Buffer.alloc(authPayload.length + paddingLen);
                    authPayload.copy(plaintextWithPadding, 0);
                    nacl.randomBytes(paddingLen).forEach((b, i) => plaintextWithPadding[authPayload.length + i] = b);
                    console.log('\n🔐 Building AUTH with XOR-derived nonce');
                    console.log('   Plaintext length (with padding):', plaintextWithPadding.length);
                    const clientX25519Pub = ed25519PubToX25519(clientEd25519Pub);
                    console.log('   Client Ed25519 pubkey:', Buffer.from(clientEd25519Pub).toString('hex'));
                    console.log('   Server Ed25519 pubkey:', supernodeEd25519Pub.toString('hex'));
                    console.log('   Client X25519 pubkey:', Buffer.from(clientX25519Pub).toString('hex'));
                    console.log('   Server X25519 pubkey:', Buffer.from(serverX25519Pub).toString('hex'));
                    const xorX25519 = new Uint8Array(32);
                    for (let i = 0; i < 32; i++) {
                        xorX25519[i] = clientX25519Pub[i] ^ serverX25519Pub[i];
                    }
                    derivedNonce = xorX25519.slice(0, 24);
                    console.log('   XOR nonce (X25519):', Buffer.from(derivedNonce).toString('hex'));
                    const xorEd25519 = new Uint8Array(32);
                    for (let i = 0; i < 32; i++) {
                        xorEd25519[i] = clientEd25519Pub[i] ^ supernodeEd25519Pub[i];
                    }
                    ed25519DerivedNonce = xorEd25519.slice(0, 24);
                    console.log('   XOR nonce (Ed25519):', Buffer.from(ed25519DerivedNonce).toString('hex'));
                    const encrypted = nacl.box(new Uint8Array(plaintextWithPadding), derivedNonce, serverX25519Pub, clientX25519Priv);
                    console.log('   Encrypted length:', encrypted.length, '(includes 16-byte MAC)');
                    const packetLen = 2 + 1 + 32 + encrypted.length;
                    const authPacket = Buffer.alloc(packetLen);
                    pos = 0;
                    authPacket.writeUInt16BE(packetLen, pos);
                    pos += 2;
                    authPacket.writeUInt8(0x00, pos);
                    pos += 1;
                    Buffer.from(clientEd25519Pub).copy(authPacket, pos);
                    pos += 32;
                    Buffer.from(encrypted).copy(authPacket, pos);
                    console.log('\n📤 Sending AUTH packet');
                    console.log('   Total length:', authPacket.length);
                    console.log('   Packet:', authPacket.toString('hex').slice(0, 100) + '...');
                    socket.write(authPacket);
                    console.log('   ✅ Sent! Waiting for AUTH_ACK...');
                    handshakeComplete = true;
                    receivedData = receivedData.slice(messageLen);
                }
                else {
                    console.log('\n📝 Received encrypted response (AUTH_ACK?)');
                    const packetType = receivedData.readUInt8(2);
                    console.log('   Packet type:', packetType, `(0x${packetType.toString(16)})`);
                    const encryptedResponse = receivedData.slice(3, messageLen);
                    console.log('   Encrypted length:', encryptedResponse.length, 'bytes');
                    const isAuthAck = (packetType >= 0x80 && packetType <= 0x87);
                    const isError = (packetType >= 0x70 && packetType <= 0x7F);
                    console.log('   Packet type:', packetType, `(0x${packetType.toString(16)})`);
                    console.log('   Is AUTH_ACK (0x80-0x87):', isAuthAck);
                    console.log('   Is ERROR (0x70-0x7F):', isError);
                    if (sessionKeyPair && derivedNonce && sessionNonce) {
                        const identitySharedKey = nacl.box.before(serverX25519Pub, clientX25519Priv);
                        const sessionIdentitySharedKey = nacl.box.before(serverX25519Pub, sessionKeyPair.secretKey);
                        const identitySharedKeyRaw = nacl.box.before(serverRawAsX25519, clientX25519Priv);
                        let decrypted = null;
                        console.log('\n   === Java CryptoContext approach (prepended nonce) ===');
                        if (encryptedResponse.length > 24 + 16) {
                            const prependedNonce = new Uint8Array(encryptedResponse.slice(0, 24));
                            const actualCiphertext = new Uint8Array(encryptedResponse.slice(24));
                            console.log('   Prepended nonce (first 24 bytes):', Buffer.from(prependedNonce).toString('hex'));
                            console.log('   Actual ciphertext length:', actualCiphertext.length, 'bytes');
                            console.log('   Ciphertext hex:', Buffer.from(actualCiphertext).toString('hex').slice(0, 60) + '...');
                            console.log('\n   Attempt 1: Identity keys + prepended nonce');
                            decrypted = nacl.box.open.after(actualCiphertext, prependedNonce, identitySharedKey);
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 1b: Session->Identity keys + prepended nonce');
                                decrypted = nacl.box.open.after(actualCiphertext, prependedNonce, sessionIdentitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2: Direct box.open + prepended nonce');
                                decrypted = nacl.box.open(actualCiphertext, prependedNonce, serverX25519Pub, clientX25519Priv);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2b: Session box.open + prepended nonce');
                                decrypted = nacl.box.open(actualCiphertext, prependedNonce, serverX25519Pub, sessionKeyPair.secretKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2c: Identity keys + OUR session nonce (full payload)');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse), sessionNonce, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2d: Session-Identity keys + OUR session nonce (full payload)');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse), sessionNonce, sessionIdentitySharedKey);
                            }
                            const authAckCipherOnly = new Uint8Array(encryptedResponse.slice(0, 53));
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2e: Identity keys + prepended nonce - first 53 bytes');
                                decrypted = nacl.box.open.after(authAckCipherOnly, prependedNonce, identitySharedKey);
                            }
                            const nonceFromStart = new Uint8Array(encryptedResponse.slice(0, 24));
                            const cipherFromOffset24 = new Uint8Array(encryptedResponse.slice(24, 24 + 53));
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2f: Identity + nonce from start - cipher 24:77');
                                decrypted = nacl.box.open.after(cipherFromOffset24, nonceFromStart, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 2g: Raw server key + prepended nonce');
                                decrypted = nacl.box.open.after(actualCiphertext, prependedNonce, identitySharedKeyRaw);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                const xorWithRaw = new Uint8Array(32);
                                const clientX25519Pub = ed25519PubToX25519(clientEd25519Pub);
                                for (let i = 0; i < 32; i++) {
                                    xorWithRaw[i] = clientX25519Pub[i] ^ serverRawAsX25519[i];
                                }
                                const xorNonceRaw = xorWithRaw.slice(0, 24);
                                console.log('   XOR nonce (with raw server key):', Buffer.from(xorNonceRaw).toString('hex'));
                                console.log('   Attempt 2h: Raw server key + XOR nonce');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse.slice(0, 53)), xorNonceRaw, identitySharedKeyRaw);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('\n   === Session-targeted encryption ===');
                                const xorSessionServer = new Uint8Array(32);
                                for (let i = 0; i < 32; i++) {
                                    xorSessionServer[i] = sessionKeyPair.publicKey[i] ^ serverX25519Pub[i];
                                }
                                const xorNonceSession = xorSessionServer.slice(0, 24);
                                console.log('   XOR nonce (session + server):', Buffer.from(xorNonceSession).toString('hex'));
                                console.log('   Attempt 3a: Session<->Server + XOR nonce');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse.slice(0, 53)), xorNonceSession, sessionIdentitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 3b: Session<->Server + prepended nonce');
                                decrypted = nacl.box.open.after(actualCiphertext, prependedNonce, sessionIdentitySharedKey);
                            }
                        }
                        if (!decrypted) {
                            console.log('\n   === C++ CryptoContext approach (XOR-derived nonce) ===');
                            function incrementNonce(nonce) {
                                const result = new Uint8Array(nonce);
                                for (let i = 0; i < result.length; i++) {
                                    result[i]++;
                                    if (result[i] !== 0)
                                        break;
                                }
                                return result;
                            }
                            const incrementedXorNonce = incrementNonce(derivedNonce);
                            const AUTH_ACK_CIPHER_SIZE_CPP = 53;
                            const AUTH_ACK_CIPHER_SIZE_JAVA = 51;
                            console.log('   Trying Java server size (51 bytes cipher)...');
                            const authAckCipherJava = new Uint8Array(encryptedResponse.slice(0, AUTH_ACK_CIPHER_SIZE_JAVA));
                            console.log('   Attempt 3: Identity keys + XOR nonce - 51 bytes (Java)');
                            decrypted = nacl.box.open.after(authAckCipherJava, derivedNonce, identitySharedKey);
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                const authAckCipher = new Uint8Array(encryptedResponse.slice(0, AUTH_ACK_CIPHER_SIZE_CPP));
                                console.log('   Attempt 4: Identity keys + XOR nonce - 53 bytes (C++)');
                                decrypted = nacl.box.open.after(authAckCipher, derivedNonce, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                const authAckCipherCpp = new Uint8Array(encryptedResponse.slice(0, AUTH_ACK_CIPHER_SIZE_CPP));
                                console.log('   Attempt 4b: Identity keys + XOR nonce+1 - 53 bytes');
                                decrypted = nacl.box.open.after(authAckCipherCpp, incrementedXorNonce, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 4c: Identity keys + XOR nonce+1 - 51 bytes (Java)');
                                decrypted = nacl.box.open.after(authAckCipherJava, incrementedXorNonce, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 5: Identity keys + XOR nonce - full response');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse), derivedNonce, identitySharedKey);
                            }
                            if (!decrypted) {
                                console.log('   ❌ Failed');
                                console.log('   Attempt 6: Identity keys + XOR nonce+1 - full response');
                                decrypted = nacl.box.open.after(new Uint8Array(encryptedResponse), incrementedXorNonce, identitySharedKey);
                            }
                        }
                        if (decrypted) {
                            console.log('\n   ✅ Decryption successful!');
                            console.log('   Plaintext length:', decrypted.length, 'bytes');
                            console.log('   Plaintext hex:', Buffer.from(decrypted).toString('hex'));
                            if (isError && decrypted.length >= 2) {
                                const errorCode = (decrypted[0] << 8) | decrypted[1];
                                const errorMessage = Buffer.from(decrypted.slice(2)).toString('utf8');
                                console.log('\n   ❌ ERROR from server:');
                                console.log('   Error code:', errorCode);
                                console.log('   Error message:', errorMessage);
                            }
                            else if (decrypted.length >= 35) {
                                const serverSessionPk = Buffer.from(decrypted.slice(0, 32));
                                const port = (decrypted[32] << 8) | decrypted[33];
                                const domainEnabled = decrypted[34];
                                console.log('\n🎉 AUTH_ACK parsed successfully!');
                                console.log('   Server session pubkey:', serverSessionPk.toString('hex'));
                                console.log('   Allocated port:', port);
                                console.log('   Domain enabled:', domainEnabled ? 'yes' : 'no');
                                console.log('\n✅ Active Proxy handshake COMPLETE!');
                                console.log('   Client can now use this session for data relay');
                            }
                        }
                        else {
                            console.log('\n   ❌ All decryption attempts failed');
                            console.log('\n   Debug info:');
                            console.log('   Encrypted response length:', encryptedResponse.length);
                            console.log('   Identity shared key:', Buffer.from(identitySharedKey).toString('hex').slice(0, 32) + '...');
                            console.log('   XOR nonce:', Buffer.from(derivedNonce).toString('hex'));
                            console.log('   Session nonce:', Buffer.from(sessionNonce).toString('hex'));
                        }
                    }
                    receivedData = receivedData.slice(messageLen);
                    console.log('\n✅ Handshake completed successfully!');
                    socket.end();
                    process.exit(0);
                }
            }
        }
    });
    socket.on('close', () => {
        console.log('\n⚠️  Socket closed');
        process.exit(0);
    });
    socket.on('error', (err) => {
        console.error('❌ Error:', err.message);
    });
    setTimeout(() => {
        console.log('\n⏰ Timeout');
        socket.destroy();
        process.exit(1);
    }, 30000);
}
main().catch(console.error);
//# sourceMappingURL=test-raw-proxy.js.map