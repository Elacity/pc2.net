/**
 * Lit Action: Media Asset CEK Decryption (Chipotle/PKP-AES) — Session Auth
 *
 * Called once per viewing session. The player decrypts every DASH segment
 * client-side with the recovered CEK; Lit is not involved per-segment.
 *
 * ── Execution flow (main) ────────────────────────────────────────────────
 *
 *  1. Session-bundle validation
 *       Rejects if delegationRaw / delegationSig / requestRaw / requestSig
 *       are absent or not valid JSON, or if either object is not in
 *       canonical form (sorted-key JSON with no extra whitespace).
 *
 *  2. Domain & binding checks
 *       delegation.domain  === 'pc2.secure-view.v1'
 *       request.domain     === 'pc2.secure-view.request.v1'
 *       delegation.chainId === jsParams.chainId
 *       delegation.actionIpfsId === request.actionIpfsId === jsParams.actionIpfsId
 *       request.kid        === jsParams.kid  (case-insensitive, 0x-normalised)
 *
 *  3. Temporal checks
 *       delegation.issuedAt  ≤ now + 5 s  (clock-skew allowance)
 *       delegation.expiresAt ≥ now
 *       expiresAt − issuedAt ≤ 86 400 s  (max 24-hour window)
 *       |now − request.requestedAt| ≤ 60 s  (replay prevention)
 *
 *  4. Delegation signature verification
 *       Primary: ecrecover(delegationRaw) === delegation.ownerAddress
 *       Fallback: EIP-1271 eth_call isValidSignature on ownerAddress
 *
 *  5. Request signature verification
 *       P-256: WebCrypto ECDSA-SHA-256 over requestRaw bytes,
 *              verified against delegation.sessionPublicKey (uncompressed, 65 B).
 *       X25519: WebCrypto Ed25519 over requestRaw bytes,
 *               verified against delegation.sessionPublicKey (Ed25519 public key, 32 B).
 *
 *  6. On-chain access check
 *       Calls hasAccessByContentId(holder, contentId) on jsParams.authority
 *       for each address in delegation.coveredAddresses. First match wins.
 *
 *  7. CEK decryption
 *       Lit.Actions.Decrypt({ pkpId, ciphertext }) → base64-encoded raw key.
 *
 *  8. CEK ↔ KID ↔ authority binding
 *       SHA-256(cekRawBytes ‖ kidBytes ‖ authorityBytes) must equal jsParams.dataToEncryptHash.
 *       Produced at encrypt time with the same triple — swapping authority or KID invalidates the hash.
 *       Optional: recover issuer from jsParams.signature over hashBytes.
 *
 *  9. CEK envelope  →  envelopeCEK()
 *       Wraps the raw CEK bytes for the client (see wire format below).
 *
 * ── envelopeCEK wire format ──────────────────────────────────────────────
 *
 *  The response field returned in the Lit setResponse JSON is
 *  base64(envelopeCEK.response). Its byte layout:
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │ HEADER  (4 B)                                                       │
 *  │   format3[3]   "raw" as sequence of bytes, null-padded                          │
 *  │   flag  [1]    0x02                                                 │
 *  ├─────────────────────────────────────────────────────────────────────┤
 *  │ METADATA                                                            │
 *  │   pkLen [2]    u16be — byte length of the PKP public key (33)       │
 *  │   pk    [33]   PKP compressed P-256 public key (ECDH counterpart)   │
 *  │   sigLen[2]    u16be — byte length of the ECDSA signature (65)      │
 *  │   sig   [65]   secp256k1 sig over SHA-256(encryptedBody): r‖s‖v     │
 *  │   signer[33]   PKP compressed secp256k1 public key                  │
 *  ├─────────────────────────────────────────────────────────────────────┤
 *  │ BODY                                                                │
 *  │   bodyLen[4]   u32be — byte length of encryptedBody                 │
 *  │   encryptedBody[N]                                                  │
 *  │     AES-CBC-256, key = ECDH(pkpKey_P256, sessionPubKey_P256)        │
 *  │     IV = sessionPubKey bytes [0..15]  (first 16 B of 65-B raw key)  │
 *  │                                                                     │
 *  │     Plaintext layout (rawLicenseBytes.body):                        │
 *  │       metaLen [4]   u32be(issuer.length + 8)  — always 28           │
 *  │       issuer  [20]  issuer Ethereum address bytes                   │
 *  │       exp     [8]   u64be Unix timestamp (now + 4 h)                │
 *  │       audience[20]  audience Ethereum address bytes                 │
 *  │       keyCount[4]   u32be(1)                                        │
 *  │       cek     [16]  raw AES content-encryption key                  │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  The client derives the shared secret with its own P-256 private key and
 *  the PKP public key transmitted in the METADATA block, then decrypts the
 *  BODY to recover the CEK.
 */

const DELEGATION_DOMAIN = "pc2.secure-view.v1";
const REQUEST_DOMAIN = "pc2.secure-view.request.v1";
const MAX_DELEGATION_WINDOW_SECONDS = 24 * 3600;
const REQUEST_FRESHNESS_WINDOW_SECONDS = 60;
const DELEGATION_CLOCK_SKEW_SECONDS = 5;
const EIP1271_MAGIC_VALUE = "0x1626ba7e";

// define helpers
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function toU8(x) {
  if (x == null) return new Uint8Array();
  if (x instanceof Uint8Array) return x;
  if (Array.isArray(x)) return new Uint8Array(x);
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  throw new TypeError("[toU8] invalid input");
}

function u16be(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0xffff) throw new RangeError("[u16] out of range");
  const b = new Uint8Array(2);
  b[0] = (n >>> 8) & 0xff;
  b[1] = n & 0xff;
  return b;
}

function u32be(n) {
  if (typeof n !== "number") n = Number(n);
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function u64be(n) {
  let v = typeof n === "bigint" ? n : BigInt(n || 0);
  if (v < 0n) throw new RangeError("[u64be] n must be unsigned");
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concatBytes(...chunks) {
  const total = chunks.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of chunks) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function b64ToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return ethers.utils.base64.decode(b64);
}

function hexToBytes(hex) {
  const padded = hex.startsWith("0x") ? hex : "0x" + hex;
  return ethers.utils.arrayify(padded);
}

const PKCS8_HEADERS = {
  "P-256": new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48,
    0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]),
  X25519: new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]),
};

// Convert an Ed25519 public key (Edwards y-coordinate, 32 B little-endian) to
// its X25519 counterpart (Montgomery u-coordinate) via u = (1+y)/(1−y) mod p.
// This is the deterministic direction: Ed25519 → X25519 is unambiguous.
function ed25519ToX25519(edPubBytes) {
  const p = (1n << 255n) - 19n;
  const bytes = new Uint8Array(edPubBytes);
  bytes[31] &= 0x7f; // clear x-sign bit to isolate the y-coordinate
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
  const num = (1n + y) % p;
  const den = (((1n - y) % p) + p) % p;
  // modular inverse via Fermat's little theorem: den^(p-2) mod p
  let inv = 1n,
    base = den,
    exp = p - 2n;
  while (exp > 0n) {
    if (exp & 1n) inv = (inv * base) % p;
    base = (base * base) % p;
    exp >>= 1n;
  }
  const u = (num * inv) % p;
  const out = new Uint8Array(32);
  let tmp = u;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  return out;
}

async function extractCompressedPublicKey(privKey, keyAlg) {
  const jwk = await crypto.subtle.exportKey("jwk", privKey);
  if (keyAlg.name === "X25519") {
    return b64ToBytes(jwk.x); // 32-byte raw X25519 public key
  }
  const xBytes = b64ToBytes(jwk.x);
  const yBytes = b64ToBytes(jwk.y);
  const pubKeyBytes = new Uint8Array(33);
  pubKeyBytes[0] = 0x02 | (yBytes[31] & 1); // 0x02 if y even, 0x03 if y odd
  pubKeyBytes.set(xBytes, 1);
  return pubKeyBytes;
}

function toChecksum(addr) {
  const lower = String(addr).toLowerCase();
  return ethers.utils ? ethers.utils.getAddress(lower) : ethers.getAddress(lower);
}

function eqAddr(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

async function verifyWebCrypto(keyAlg, sessionPublicKey, canonicalBytes, sigHex) {
  const pubBytes = hexToBytes(sessionPublicKey);
  const sigBytes = hexToBytes(sigHex);

  switch (keyAlg.name) {
    case "X25519": {
      if (pubBytes.length !== 32) return false;
      let pubKey;
      try {
        pubKey = await crypto.subtle.importKey("raw", pubBytes, { name: "Ed25519" }, false, ["verify"]);
      } catch {
        return false;
      }
      try {
        return await crypto.subtle.verify({ name: "Ed25519" }, pubKey, sigBytes, canonicalBytes);
      } catch {
        return false;
      }
    }
    case "ECDH": {
      if (pubBytes.length !== 65 || ![0x04, 0x02, 0x03].includes(pubBytes[0])) return false;
      let pubKey;
      try {
        pubKey = await crypto.subtle.importKey("raw", pubBytes, { name: "ECDSA", namedCurve: keyAlg.namedCurve }, false, [
          "verify",
        ]);
      } catch {
        return false;
      }
      try {
        return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sigBytes, canonicalBytes);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function encodeIsValidSignature(messageHash, signatureHex) {
  const sig = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  const sigBytesLen = sig.length / 2;
  const padLen = (32 - (sigBytesLen % 32)) % 32;
  const sigPadded = sig + "0".repeat(padLen * 2);
  const hash = messageHash.startsWith("0x") ? messageHash.slice(2) : messageHash;
  const offset = (0x40).toString(16).padStart(64, "0");
  const lenHex = sigBytesLen.toString(16).padStart(64, "0");
  return "0x1626ba7e" + hash + offset + lenHex + sigPadded;
}

async function isValidSignatureEip1271(ownerAddress, canonicalText, signatureHex, rpcUrl) {
  const messageHash = ethers.utils ? ethers.utils.hashMessage(canonicalText) : ethers.hashMessage(canonicalText);
  const data = encodeIsValidSignature(messageHash, signatureHex);
  let resp;
  try {
    resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: toChecksum(ownerAddress), data }, "latest"],
      }),
    });
  } catch {
    return false;
  }
  if (!resp.ok) return false;
  let body;
  try {
    body = await resp.json();
  } catch {
    return false;
  }
  if (!body || typeof body.result !== "string") return false;
  return body.result.toLowerCase().startsWith(EIP1271_MAGIC_VALUE.toLowerCase());
}

function rawLicenseBytes(c) {
  const format3 = new TextEncoder().encode((c.targetFormat || "").slice(0, 3).padEnd(3, "\0"));
  const flag = new Uint8Array([0x02]);
  const issuer = toU8(c.issuer || new Uint8Array());
  const exp8 = u64be(c.exp ?? 0);
  const audience = toU8(c.audience || new Uint8Array());
  const metadata = concatBytes(issuer, exp8, audience);
  const metadataSize = u32be(metadata.length);
  const keysArray = Array.isArray(c.keys) ? c.keys : [];
  const keyCount = u32be(keysArray.length);
  const keyBytes = concatBytes(...keysArray.map((k) => toU8(k.key)));
  const body = concatBytes(keyCount, keyBytes);
  const response = concatBytes(metadataSize, metadata, body);
  return {
    header: concatBytes(format3, flag),
    body: response,
  };
}

async function envelopeCEK(params) {
  const { keyAlg } = params;
  const curveName = keyAlg.namedCurve ?? keyAlg.name; // 'P-256' or 'X25519'

  // 1. Import the consumer public key.
  // X25519 mode: sessionPublicKey is an Ed25519 key — convert to X25519 Montgomery form for ECDH.
  const remoteKeyRaw = hexToBytes(params.remotePublicKey.replace(/^0x/, ""));
  const pubKeyBuff = keyAlg.name === "X25519" ? ed25519ToX25519(remoteKeyRaw) : remoteKeyRaw;
  const pubKey = await crypto.subtle.importKey("raw", pubKeyBuff, keyAlg, false, []);

  // 2. Import PKP private key — Web Crypto requires PKCS8 wrapping for raw EC scalars
  const privKeyRaw = await Lit.Actions.getPrivateKey({ pkpId: params.pkpId });
  const privKeyNormalized = privKeyRaw.startsWith("0x") ? privKeyRaw : "0x" + privKeyRaw;
  const privKeyBytes = ethers.utils.arrayify(privKeyNormalized);

  const pkcs8Header = PKCS8_HEADERS[curveName];
  const pkcs8 = new Uint8Array(pkcs8Header.length + privKeyBytes.length);
  pkcs8.set(pkcs8Header);
  pkcs8.set(privKeyBytes, pkcs8Header.length);

  const pkpPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    keyAlg,
    true, // extractable: needed to export JWK and recover the ephemeral public key
    ["deriveKey"],
  );

  // 3. Derive a shared secret
  const sharedKey = await crypto.subtle.deriveKey(
    { ...keyAlg, public: pubKey },
    pkpPrivateKey,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"],
  );

  // 4. Encrypt the CEK with the shared secret
  const { header, body: rawFormatted } = rawLicenseBytes({
    keys: [{ key: params.cek }],
    issuer: hexToBytes(params.pkpId.replace(/0x/, "")),
    audience: hexToBytes(params.audience.replace(/0x/, "")),
    exp: Math.ceil((Date.now() + 1000 * 4 * 3600) / 1000),
    targetFormat: "raw",
  });

  const iv = pubKeyBuff.subarray(0, 16);
  const encryptedCek = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, sharedKey, rawFormatted);

  // 5. Derive PKP ephemeral public key from the imported private key
  const ephemeralPublicKey = await extractCompressedPublicKey(pkpPrivateKey, keyAlg);

  // 6. sign response
  const { signer, signature } = await signPayload(privKeyRaw, encryptedCek);

  // 7. Build response
  const response = concatBytes(
    // -- HEADER --
    header,

    // -- METADATA --
    // ECDH public key
    u16be(ephemeralPublicKey.byteLength),
    ephemeralPublicKey,

    // ECDSA Signature
    u16be(signature.byteLength),
    signature,
    signer,

    // -- BODY --
    u32be(encryptedCek.byteLength),
    new Uint8Array(encryptedCek),
  );

  // 8. Return the response in base64 format
  return {
    response,
    byteLength: response.byteLength,
  };
}

async function signPayload(privKeyRaw, payload) {
  const signingKey = new ethers.utils.SigningKey(privKeyRaw);
  const digestHex = ethers.utils.sha256(new Uint8Array(payload));
  const { r, s, v } = signingKey.signDigest(digestHex);
  const sigHex = [r.replace(/^0x/, ""), s.replace(/^0x/, ""), v.toString(16)].join("");
  return {
    signature: hexToBytes(sigHex),
    signer: hexToBytes(signingKey.compressedPublicKey),
  };
}

function deny(code, extra) {
  Lit.Actions.setResponse({
    response: JSON.stringify(Object.assign({ error: "Access denied", code }, extra || {})),
  });
}

async function main(params) {
  const {
    // decryption materials
    ciphertext,
    dataToEncryptHash,
    kid,
    issuer,
    signature,
    // on-chain data
    authority,
    chainId,
    rpc,
    // lit-based arguments
    pkpId,
    actionIpfsId,
    // key agreement algorithm — { name: 'ECDH', namedCurve: 'P-256' } | { name: 'X25519' }
    keyAlg: keyAlgParam,
    // session and delegation
    delegation: delegationRaw,
    delegationSig,
    request: requestRaw,
    requestSig,
  } = params;
  const keyAlg = keyAlgParam ?? { name: "ECDH", namedCurve: "P-256" };

  if (
    typeof delegationRaw !== "string" ||
    typeof delegationSig !== "string" ||
    typeof requestRaw !== "string" ||
    typeof requestSig !== "string"
  ) {
    return deny("missing_session_bundle");
  }

  let del, req;
  try {
    del = JSON.parse(delegationRaw);
  } catch {
    return deny("del_malformed");
  }
  try {
    req = JSON.parse(requestRaw);
  } catch {
    return deny("req_malformed");
  }

  if (canonicalize(del) !== delegationRaw) return deny("del_not_canonical");
  if (canonicalize(req) !== requestRaw) return deny("req_not_canonical");

  if (del.domain !== DELEGATION_DOMAIN) return deny("bad_domain");
  if (req.domain !== REQUEST_DOMAIN) return deny("bad_req_domain");
  if (Number(del.chainId) !== Number(chainId)) return deny("bad_chain");
  if (del.actionIpfsId !== actionIpfsId) return deny("bad_action_cid");
  if (req.actionIpfsId !== actionIpfsId) return deny("bad_req_action_cid");

  const normalizedKid = kid.startsWith("0x") ? kid : "0x" + kid;
  if (String(req.kid).toLowerCase() !== normalizedKid.toLowerCase()) return deny("bad_req_kid");
  // Binding is via the ECDSA signature over del.sessionPublicKey.

  const now = Math.floor(Date.now() / 1000);
  if (now + DELEGATION_CLOCK_SKEW_SECONDS < del.issuedAt) return deny("del_not_yet_valid");
  if (now > del.expiresAt) return deny("del_expired");
  if (del.expiresAt - del.issuedAt > MAX_DELEGATION_WINDOW_SECONDS) return deny("del_window_too_wide");
  if (Math.abs(now - req.requestedAt) > REQUEST_FRESHNESS_WINDOW_SECONDS) return deny("req_stale_or_future");

  let delOk = false;
  try {
    const recovered = ethers.utils
      ? ethers.utils.verifyMessage(delegationRaw, delegationSig)
      : ethers.verifyMessage(delegationRaw, delegationSig);
    delOk = eqAddr(recovered, del.ownerAddress);
  } catch {
    delOk = false;
  }
  if (!delOk) {
    delOk = await isValidSignatureEip1271(del.ownerAddress, delegationRaw, delegationSig, rpc);
    if (!delOk) return deny("del_sig_invalid");
  }

  const reqOk = await verifyWebCrypto(keyAlg, del.sessionPublicKey, new TextEncoder().encode(requestRaw), requestSig);
  if (!reqOk) return deny("req_sig_invalid");

  const abi = [
    {
      inputs: [
        { name: "holder", type: "address" },
        { name: "contentId", type: "bytes16" },
      ],
      name: "hasAccessByContentId",
      outputs: [{ name: "hasAccess", type: "bool" }],
      stateMutability: "view",
      type: "function",
    },
  ];
  const provider = ethers.providers ? new ethers.providers.JsonRpcProvider(rpc) : new ethers.JsonRpcProvider(rpc);
  const gateway = new ethers.Contract(toChecksum(authority), abi, provider);

  if (!Array.isArray(del.coveredAddresses) || del.coveredAddresses.length === 0) {
    return deny("no_covered_addresses");
  }

  let authorizedAddress = null;
  for (const addr of del.coveredAddresses) {
    try {
      const ok = await gateway.hasAccessByContentId(toChecksum(addr), normalizedKid);
      if (ok) {
        authorizedAddress = toChecksum(addr);
        break;
      }
    } catch {
      /* keep trying */
    }
  }
  if (!authorizedAddress) return deny("access_denied");

  let cek;
  try {
    cek = await Lit.Actions.Decrypt({ pkpId: pkpId, ciphertext: ciphertext });
  } catch (e) {
    return deny("decrypt_failed", { detail: String((e && e.message) || e) });
  }

  // Recompute SHA-256(cekBytes ‖ kidBytes ‖ authorityBytes) inside the TEE and compare
  // against dataToEncryptHash produced at encrypt time. Swapping authority or KID changes
  // the preimage, so the hash will not match and access is denied.
  const cekRawBytes = ethers.utils.base64.decode(cek);
  const kidBytes = hexToBytes(normalizedKid);
  const authorityBytes = hexToBytes(authority);
  const compositeInput = concatBytes(cekRawBytes, kidBytes, authorityBytes);
  const computedHash = ethers.utils.sha256(compositeInput);
  const normalizedInputHash = dataToEncryptHash.startsWith("0x")
    ? dataToEncryptHash.toLowerCase()
    : ("0x" + dataToEncryptHash).toLowerCase();
  if (computedHash.toLowerCase() !== normalizedInputHash) {
    return deny("kid_authority_mismatch");
  }
  const hashBytes = ethers.utils.arrayify(computedHash);

  if (signature && issuer) {
    const sigHex = signature.startsWith("0x") ? signature : "0x" + signature;
    const recoveredIssuer = ethers.utils.verifyMessage(hashBytes, sigHex);
    if (!eqAddr(recoveredIssuer, issuer)) {
      return deny("integrity_sig_mismatch");
    }
  }

  // encode the CEK to target format (raw)
  const { response: formatedCEK, byteLength } = await envelopeCEK({
    keyAlg,
    remotePublicKey: del.sessionPublicKey,
    cek: cekRawBytes,
    pkpId,
    audience: authorizedAddress,
  });

  Lit.Actions.setResponse({
    response: JSON.stringify({
      byteLength,
      data: ethers.utils.base64.encode(formatedCEK),
      authorizedAddress,
      delegationNonce: del.nonce,
      requestNonce: req.requestNonce,
    }),
  });
}
