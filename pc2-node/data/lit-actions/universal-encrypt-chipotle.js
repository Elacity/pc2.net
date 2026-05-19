/**
 * Lit Action: Asset CEK Encryption (Chipotle/PKP-AES)
 * Any CEK for media (16-byte), non-media (32-byte) or even arbitrary length
 * data can be encrypted
 *
 * Chipotle v3 calls `main(params)` with js_params as the argument.
 *
 * params expected:
 *  - plaintext:      The base64-encoded CEK to encrypt
 *  - kid:            The base64-encoded content key ID (16-byte UUID)
 *  - authority:      Authority contract address that governs access to this content (hex / 0x-prefixed)
 *  - pkpId:          PKP wallet address to encrypt under
 *  - outputFormat:   The format of the output, can be 'hex' (default) | 'base64' | 'base64url'
 *
 * The success response:
 *  - ciphertext: encrypted CEK in the requested format
 *  - hash:       SHA-256(cekBytes ‖ kidBytes ‖ authorityBytes) — binds CEK, KID, and authority together
 *  - signature:  The PKP signature over the composite hash
 *  - issuer:     The signer of the encrypted data, in this case the PKP wallet address
 */

function encodeBytes(bytes, format) {
  switch (format) {
    case "base64url":
      return ethers.utils.base64.encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    case "base64":
      return ethers.utils.base64.encode(bytes);
    default:
      // hex: ethers.utils.hexlify returns 0x-prefixed, strip it
      return ethers.utils.hexlify(bytes).slice(2);
  }
}

function validateInputs(params) {
  const { pkpId, plaintext, kid, authority } = params;
  if (!pkpId || !plaintext || !kid || !authority) {
    throw new Error("Missing required input parameters");
  }

  if (!ethers.utils.isAddress(pkpId)) {
    throw new Error("Invalid pkpId");
  }

  if (!ethers.utils.isAddress(authority)) {
    throw new Error("Invalid authority");
  }

  if (kid.length == 0) {
    throw new Error("kid required");
  }

  if (plaintext.length == 0) {
    throw new Error("plaintext required");
  }
}

async function main(params) {
  validateInputs(params);

  const { pkpId, plaintext, kid, authority, outputFormat = "hex" } = params;

  const cekBytes = ethers.utils.base64.decode(plaintext);
  const kidBytes = ethers.utils.base64.decode(kid);
  const authorityBytes = ethers.utils.arrayify(authority.startsWith("0x") ? authority : "0x" + authority);

  const compositeBytes = new Uint8Array(cekBytes.length + kidBytes.length + authorityBytes.length);
  compositeBytes.set(cekBytes, 0);
  compositeBytes.set(kidBytes, cekBytes.length);
  compositeBytes.set(authorityBytes, cekBytes.length + kidBytes.length);

  const hashBytes = ethers.utils.arrayify(ethers.utils.sha256(compositeBytes));

  const wallet = new ethers.Wallet(await Lit.Actions.getPrivateKey({ pkpId }));

  const sigBytes = ethers.utils.arrayify(await wallet.signMessage(hashBytes));

  const encrypted = await Lit.Actions.Encrypt({
    pkpId: pkpId,
    message: plaintext,
  });

  // convert to bytes for universal encoding
  const encryptedBytes = ethers.utils.arrayify("0x" + encrypted);

  Lit.Actions.setResponse({
    response: JSON.stringify({
      ciphertext: encodeBytes(encryptedBytes, outputFormat),
      hash: encodeBytes(hashBytes, outputFormat),
      signature: encodeBytes(sigBytes, outputFormat),
      issuer: ethers.utils.getAddress(pkpId),
    }),
  });
}
