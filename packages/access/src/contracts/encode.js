import { ethers } from 'ethers';
import { OP_TYPES, ROLE_TYPES } from './abis.js';
export const ELACITY_ROYALTY_ADDRESS = '0x0917Aa260359670F7855a5454c630993ce40C52D';
export const ELACITY_ROYALTY_PERCENT = 5;
export function kidToContentId(kidHex) {
    const clean = (kidHex.startsWith('0x') ? kidHex.slice(2) : kidHex)
        .replace(/-/g, '')
        .toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) {
        throw new Error(`kidToContentId: expected 32 hex chars (16-byte KID), got ${JSON.stringify(kidHex)}`);
    }
    return '0x' + clean;
}
/** @deprecated Use kidToContentId(kid) — see encode.ts for rationale */
export function hashToContentId(hash) {
    const clean = hash.startsWith('0x') ? hash.slice(2) : hash;
    const stripped = clean.replace(/-/g, '');
    return '0x' + stripped.slice(0, 32).padEnd(32, '0');
}
export function encodeOpRawData(params) {
    const { contentId, metadataCID, creatorAddress, copies, opType, creatorRoyaltyPercent = 95, resellerCut = 900, } = params;
    if (opType === OP_TYPES.FREE)
        return '0x';
    const cid16 = kidToContentId(contentId);
    const metadataUri = `ipfs://${metadataCID}`;
    const creatorPer1000 = Math.round(creatorRoyaltyPercent * 10);
    const elacityPer1000 = Math.round(ELACITY_ROYALTY_PERCENT * 10);
    const addresses = [creatorAddress, creatorAddress, ELACITY_ROYALTY_ADDRESS];
    const roleTypes = [
        ROLE_TYPES.ACCESS_TOKEN,
        ROLE_TYPES.ROYALTY_SHARE,
        ROLE_TYPES.ROYALTY_SHARE,
    ];
    const amounts = [copies, creatorPer1000, elacityPer1000];
    const isResellable = opType === OP_TYPES.BUY_AND_RESELL;
    const abiTypes = isResellable
        ? ['bytes16', 'string', 'address[]', 'uint256[]', 'uint256[]', 'uint16']
        : ['bytes16', 'string', 'address[]', 'uint256[]', 'uint256[]'];
    const abiValues = isResellable
        ? [cid16, metadataUri, addresses, roleTypes, amounts, resellerCut]
        : [cid16, metadataUri, addresses, roleTypes, amounts];
    return ethers.AbiCoder.defaultAbiCoder().encode(abiTypes, abiValues);
}
export function encodeSellRawData(copies, priceInWei, payTokenAddress) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256', 'address'], [copies, priceInWei, payTokenAddress]);
}
//# sourceMappingURL=encode.js.map