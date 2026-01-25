# PR: Add BTC and Tron Address Support to walletaccess Intent

## Summary

This PR extends the `walletaccess` intent to support Bitcoin and Tron address requests, enabling third-party applications to request these wallet addresses alongside the existing ELA mainchain and ESC addresses.

## Problem

The current `walletaccess` intent only supports:
- `elaaddress` - ELA mainchain address
- `elaamount` - ELA balance  
- `ethaddress` - Elastos Smart Chain (ESC) address

Third-party applications that integrate with Essentials need access to other chain addresses like Bitcoin and Tron to display multi-chain balances and enable cross-chain functionality.

## Solution

Add two new request fields to the `walletaccess` intent:
- `btcaddress` - Bitcoin address
- `tronaddress` - Tron address

These use the existing `StandardCoinName.BTC` and `StandardCoinName.TRON` enums which are already defined in the codebase.

## Changes

### `src/app/wallet/pages/intents/access/access.page.ts`

```typescript
// In getClaimValue() method, add after ethaddress case:
case 'btcaddress':
    value = await this.getAddress(StandardCoinName.BTC);
    break;
case 'tronaddress':
    value = await this.getAddress(StandardCoinName.TRON);
    break;

// In getClaimTitle() method, add after ethaddress case:
case 'btcaddress':
    value = 'wallet.btcaddress';
    break;
case 'tronaddress':
    value = 'wallet.tronaddress';
    break;
```

### Translation files (optional)

Add to `translations/strings/wallet/en.ts`:
```typescript
'btcaddress': 'Bitcoin Address',
'tronaddress': 'Tron Address',
```

## Usage Example

After this change, third-party apps can request:

```javascript
// Intent request payload
{
  elaaddress: true,
  ethaddress: true,
  btcaddress: true,    // NEW
  tronaddress: true,   // NEW
  callbackurl: "https://myapp.com/callback",
  nonce: "unique-nonce"
}
```

## Testing

1. Create a walletaccess intent URL with `btcaddress: true` and `tronaddress: true`
2. Scan with Essentials
3. Verify that BTC and Tron addresses appear in the "Data Access" list
4. Confirm and verify the callback receives the addresses

## Motivation / Use Case

[PC2 Personal Cloud](https://github.com/user/pc2.net) is a decentralized personal cloud that integrates with Elastos DID. When users tether their DID, we want to display their multi-chain wallet balances. This PR enables that functionality.

## Backward Compatibility

This is a purely additive change. Existing apps using `walletaccess` will continue to work unchanged. New apps can optionally request the new address types.

---

**Related Issues:** None

**Breaking Changes:** None

**Checklist:**
- [ ] Code follows project style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Translation strings added
