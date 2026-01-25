# Bug Report: walletaccess intent crashes when requesting elaaddress

## Summary

When using the `walletaccess` intent with `reqfields: { elaaddress: true }`, the Essentials app displays an error toast "Sorry, the application encountered an error. This has been reported to the team." and fails to return the ELA mainchain address.

## Environment

- **Essentials Version**: Latest (January 2026)
- **Device**: iPhone (iOS)
- **Network**: Elastos Main Chain wallet is configured and has balance (86 ELA)

## Steps to Reproduce

1. Create a `walletaccess` intent URL with the following JWT payload:

```json
{
  "iss": "did:elastos:pc2node",
  "callbackurl": "https://example.com/callback",
  "nonce": "unique-nonce-here",
  "reqfields": {
    "elaaddress": true,
    "ethaddress": true
  }
}
```

2. Encode the JWT and create URL: `https://wallet.web3essentials.io/walletaccess/<jwt>`

3. Scan the QR code with Essentials

4. Observe the "Wallet Access" screen shows "Data Access" but only `ethaddress` is listed

5. After confirming, an error toast appears at the bottom of the screen

## Expected Behavior

- Both `elaaddress` and `ethaddress` should be displayed in the "Data Access" section
- The callback should receive both addresses:
```json
{
  "walletinfo": [{
    "elaaddress": "EdVnU...U9bdT",
    "ethaddress": "0x6108143D..."
  }]
}
```

## Actual Behavior

- Only `ethaddress` is displayed in the "Data Access" section
- Error toast appears: "Sorry, the application encountered an error. This has been reported to the team."
- The callback only receives `ethaddress`:
```json
{
  "walletinfo": [{
    "ethaddress": "0x6108143D2A820726206345fb3c9606ba5e7f6128"
  }]
}
```

## Possible Cause

Looking at the source code in `src/app/wallet/pages/intents/access/access.page.ts`:

```typescript
case 'elaaddress':
  value = await this.getAddress(StandardCoinName.ELA);
  break;
```

And `getAddress()`:

```typescript
getAddress(subWalletId: string) {
  return this.networkWallet.getSubWallet(subWalletId).getCurrentReceiverAddress();
}
```

The issue might be:
1. The `networkWallet` context when handling `walletaccess` might not have access to the ELA subwallet
2. The `getSubWallet('ELA')` call might be returning null if the network wallet context is wrong
3. There might be an async issue causing the address fetch to fail

## Screenshots

![Error Screenshot](./assets/essentials-elaaddress-error.png)

*(Shows the error toast at bottom: "Sorry, the application encountered an error. This has been reported to the team.")*

## Additional Context

- `ethaddress` works correctly and returns the ESC address
- The user has an active ELA mainchain wallet with balance visible in the app
- This blocks applications from fetching ELA mainchain addresses via the `walletaccess` intent

## Workaround

Currently none - applications cannot request ELA mainchain addresses via `walletaccess`.

---

**Related**: We're also preparing a PR to add `btcaddress` and `tronaddress` support to the `walletaccess` intent. See `PR_DESCRIPTION.md` for details.
