# `createSellTransaction` - TypeScript Types vs Actual Behavior

## The Issue

**TypeScript interface says:**
```typescript
interface ISellTransaction {
    token: IBasicToken;
    amount: string;
}
```

**We're passing (with TypeScript errors):**
```typescript
await ua.createSellTransaction({
  token: { chainId, address },
  amount: "0.1",
  expectToken: { type: "usdc" },  // ❌ Not in types
  chainId: 8453,                   // ❌ Not in types
});
```

**Your docs show:**
```typescript
await ua.createSellTransaction({
  token: { chainId, address },
  amount: "0.1",
  // No expectToken or chainId
});
```

## Testing Results

We tested selling non-primary tokens (UNI, COMP) to different primary assets:
- ✅ UNI → USDC: Works
- ❌ UNI → BTC: Outputs USDC anyway
- ❌ UNI → ETH: Outputs USDC anyway
- ❌ UNI → BNB: Outputs USDC anyway

## Questions

**1. How do we control the output token?**
- Is `expectToken` supported but undocumented? (update types if yes)
- Should we use `usePrimaryTokens` in second parameter?
- Is USDC the only supported output?

**2. What's the correct implementation?**

Option A:
```typescript
await ua.createSellTransaction({
  token: { chainId, address },
  amount: "0.1",
  expectToken: { type: "btc" }  // Does this work?
});
```

Option B (if this doesn't break multi-asset BUY):
```typescript
await ua.createSellTransaction(
  { token: { chainId, address }, amount: "0.1" },
  { usePrimaryTokens: ["btc"] }  // Controls output, not input?
);
```

Option C:
```typescript
// USDC is the only output - accept this limitation
```

**3. Does `usePrimaryTokens` control OUTPUT or restrict INPUT?**

We see in your docs that `usePrimaryTokens` can be set in `tradeConfig`:
```typescript
tradeConfig: {
  usePrimaryTokens: [SUPPORTED_TOKEN_TYPE.SOL],
}
```

**Critical concern:** Will this:
- ✅ Control which token we **receive** as output? (what we want)
- ❌ Restrict which tokens can be **used** as input? (would break BUY behavior)

**Current BUY behavior we need to preserve:**
- User has $3 USDC + $10 BNB
- Buying $5 of UNI uses: $3 USDC + $2 BNB automatically
- This multi-asset sourcing is essential - we can't break it

**Question:** Does `usePrimaryTokens` behave differently for BUY vs SELL?
- For BUY: Does it restrict which assets can be spent?
- For SELL: Does it control which asset you receive?

**4. Is this a LI.FI routing limitation?**
Since you use LI.FI backend, does it default to USDC for liquidity reasons?

## Why This Matters

We can't approve production code that:
- Has TypeScript errors
- Uses undocumented parameters
- Relies on unclear behavior

**Please clarify the correct implementation.**

---

**SDK:** `@particle-network/universal-account-sdk@1.0.3`  
**Environment:** TypeScript strict mode, production

Thanks!
Elacity Team

