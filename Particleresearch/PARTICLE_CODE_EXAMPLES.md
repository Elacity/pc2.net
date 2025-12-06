# Particle Network - Ready-to-Use Code Examples

**Quick reference for common use cases**

---

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Login/Logout](#loginlogout)
3. [User Profile Display](#user-profile-display)
4. [Balance Display](#balance-display)
5. [Send Transactions](#send-transactions)
6. [Contract Interactions](#contract-interactions)
7. [Network Switching](#network-switching)
8. [Error Handling](#error-handling)

---

## Basic Setup

### Minimal App Setup

```typescript
// src/App.tsx
import React from 'react';
import { ParticleNetworkProvider, ConnectorSelect, useParticleNetwork } from './lib/particle-network';

function App() {
  return (
    <ParticleNetworkProvider transactionHandler="ua">
      <div>
        <h1>My App</h1>
        <ConnectorSelect />
        <UserInfo />
      </div>
    </ParticleNetworkProvider>
  );
}

function UserInfo() {
  const { account, active } = useParticleNetwork();
  
  if (!active) return null;
  
  return <div>Connected: {account}</div>;
}

export default App;
```

---

## Login/Logout

### Custom Login Button

```typescript
import React from 'react';
import { useModal } from '@particle-network/connectkit';
import { useParticleNetwork } from './lib/particle-network';

function LoginButton() {
  const { account, deactivate } = useParticleNetwork();
  const { setOpen } = useModal();

  if (account) {
    return (
      <button onClick={deactivate}>
        Logout ({account.slice(0, 6)}...{account.slice(-4)})
      </button>
    );
  }

  return (
    <button onClick={() => setOpen(true)}>
      Login
    </button>
  );
}
```

### Login with Redirect

```typescript
function LoginWithRedirect() {
  const { setOpen } = useModal();
  const navigate = useNavigate();

  const handleLogin = () => {
    setOpen(true);
    // Particle will handle authentication
    // You can listen for connection in useEffect
  };

  const { account } = useParticleNetwork();

  React.useEffect(() => {
    if (account) {
      // User logged in, redirect to dashboard
      navigate('/dashboard');
    }
  }, [account, navigate]);

  return <button onClick={handleLogin}>Get Started</button>;
}
```

---

## User Profile Display

### Basic Profile Card

```typescript
import { useParticleNetwork } from './lib/particle-network';

function ProfileCard() {
  const { 
    account, 
    smartAccountInfo, 
    primaryAssets,
    chainId,
  } = useParticleNetwork();

  if (!account) return null;

  return (
    <div className="profile-card">
      <h2>Your Profile</h2>
      
      <div>
        <label>Account:</label>
        <code>{account}</code>
      </div>

      {smartAccountInfo && (
        <>
          <div>
            <label>EOA Address:</label>
            <code>{smartAccountInfo.ownerAddress}</code>
          </div>
          
          <div>
            <label>Smart Account:</label>
            <code>{smartAccountInfo.smartAccountAddress}</code>
          </div>
        </>
      )}

      <div>
        <label>Chain:</label>
        <span>{chainId === 8453 ? 'Base' : `Chain ${chainId}`}</span>
      </div>

      <div>
        <label>Total Balance:</label>
        <strong>${primaryAssets?.totalAmountInUSD || '0.00'}</strong>
      </div>
    </div>
  );
}
```

### Profile with Avatar

```typescript
import Blockies from 'react-blockies';

function ProfileWithAvatar() {
  const { account, deactivate } = useParticleNetwork();

  if (!account) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Blockies 
        seed={account.toLowerCase()} 
        size={8} 
        scale={4} 
      />
      <div>
        <div>{account.slice(0, 6)}...{account.slice(-4)}</div>
        <button onClick={deactivate}>Disconnect</button>
      </div>
    </div>
  );
}
```

---

## Balance Display

### Total Portfolio Balance

```typescript
function PortfolioBalance() {
  const { primaryAssets, refreshPrimaryAssets } = useParticleNetwork();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPrimaryAssets();
    setRefreshing(false);
  };

  if (!primaryAssets) return <div>Loading balances...</div>;

  return (
    <div>
      <h3>Total Portfolio</h3>
      <h1>${Number(primaryAssets.totalAmountInUSD).toFixed(2)}</h1>
      
      <button onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>

      <h4>Assets by Chain</h4>
      <ul>
        {primaryAssets.assets?.map((asset) => (
          <li key={`${asset.chainId}-${asset.symbol}`}>
            {asset.symbol}: ${asset.valueInUSD?.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Single Token Balance (Native ETH)

```typescript
import { formatEther } from '@ethersproject/units';

function ETHBalance() {
  const { library, account } = useParticleNetwork();
  const [balance, setBalance] = React.useState('0');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!library || !account) return;

    library.getBalance(account)
      .then((bal) => {
        setBalance(formatEther(bal));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch balance:', err);
        setLoading(false);
      });
  }, [library, account]);

  if (loading) return <div>Loading ETH balance...</div>;

  return (
    <div>
      <strong>ETH:</strong> {Number(balance).toFixed(4)}
    </div>
  );
}
```

### ERC-20 Token Balance

```typescript
import { Contract } from '@ethersproject/contracts';
import { formatUnits } from '@ethersproject/units';

// ERC-20 ABI (minimal)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

function TokenBalance({ tokenAddress }: { tokenAddress: string }) {
  const { library, account } = useParticleNetwork();
  const [balance, setBalance] = React.useState<string>('0');
  const [symbol, setSymbol] = React.useState<string>('TOKEN');

  React.useEffect(() => {
    if (!library || !account || !tokenAddress) return;

    const contract = new Contract(tokenAddress, ERC20_ABI, library);

    Promise.all([
      contract.balanceOf(account),
      contract.decimals(),
      contract.symbol(),
    ]).then(([bal, decimals, sym]) => {
      setBalance(formatUnits(bal, decimals));
      setSymbol(sym);
    });
  }, [library, account, tokenAddress]);

  return (
    <div>
      <strong>{symbol}:</strong> {Number(balance).toFixed(4)}
    </div>
  );
}

// Usage:
// <TokenBalance tokenAddress="0xUSDCAddressHere" />
```

---

## Send Transactions

### Send Native Token (ETH)

```typescript
import { parseEther } from '@ethersproject/units';

function SendETH() {
  const { library, universalAccount, transactionHandler } = useParticleNetwork();
  const [recipient, setRecipient] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [txHash, setTxHash] = React.useState('');

  const handleSend = async () => {
    if (!recipient || !amount) {
      alert('Please enter recipient and amount');
      return;
    }

    setSending(true);
    try {
      if (transactionHandler === 'ua' && universalAccount) {
        // Universal Account (gasless)
        const tx = await universalAccount.sendTransaction({
          to: recipient,
          value: parseEther(amount).toString(),
        });
        setTxHash(tx.hash || 'Transaction submitted');
        alert('Transaction sent via Universal Account!');
      } else if (library) {
        // Standard EOA
        const signer = library.getSigner();
        const tx = await signer.sendTransaction({
          to: recipient,
          value: parseEther(amount),
        });
        await tx.wait();
        setTxHash(tx.hash);
        alert('Transaction confirmed!');
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Transaction failed: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h3>Send ETH</h3>
      <input
        type="text"
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />
      <input
        type="number"
        placeholder="Amount (ETH)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        step="0.01"
      />
      <button onClick={handleSend} disabled={sending}>
        {sending ? 'Sending...' : 'Send'}
      </button>
      {txHash && <div>Tx Hash: {txHash}</div>}
    </div>
  );
}
```

### Send ERC-20 Token

```typescript
import { Contract } from '@ethersproject/contracts';
import { parseUnits } from '@ethersproject/units';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

function SendERC20({ tokenAddress }: { tokenAddress: string }) {
  const { library, account } = useParticleNetwork();
  const [recipient, setRecipient] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const handleSend = async () => {
    if (!library || !account) return;

    setSending(true);
    try {
      const signer = library.getSigner();
      const contract = new Contract(tokenAddress, ERC20_ABI, signer);
      
      const decimals = await contract.decimals();
      const amountBN = parseUnits(amount, decimals);
      
      const tx = await contract.transfer(recipient, amountBN);
      await tx.wait();
      
      alert('Transfer successful!');
    } catch (error) {
      console.error('Transfer failed:', error);
      alert('Transfer failed: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h3>Send Token</h3>
      <input
        placeholder="Recipient"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      />
      <input
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button onClick={handleSend} disabled={sending}>
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}
```

---

## Contract Interactions

### Read Contract Data

```typescript
import { Contract } from '@ethersproject/contracts';

const NFT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

function NFTInfo({ contractAddress }: { contractAddress: string }) {
  const { library, account } = useParticleNetwork();
  const [info, setInfo] = React.useState({
    name: '',
    symbol: '',
    totalSupply: '',
    userBalance: '',
  });

  React.useEffect(() => {
    if (!library || !account) return;

    const contract = new Contract(contractAddress, NFT_ABI, library);

    Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply(),
      contract.balanceOf(account),
    ]).then(([name, symbol, supply, balance]) => {
      setInfo({
        name,
        symbol,
        totalSupply: supply.toString(),
        userBalance: balance.toString(),
      });
    });
  }, [library, account, contractAddress]);

  return (
    <div>
      <h3>{info.name} ({info.symbol})</h3>
      <p>Total Supply: {info.totalSupply}</p>
      <p>Your Balance: {info.userBalance}</p>
    </div>
  );
}
```

### Write Contract Data (Mint NFT)

```typescript
import { Contract } from '@ethersproject/contracts';
import { parseEther } from '@ethersproject/units';

const NFT_MINT_ABI = [
  'function mint(uint256 quantity) payable returns (uint256)',
  'function price() view returns (uint256)',
];

function MintNFT({ contractAddress }: { contractAddress: string }) {
  const { library } = useParticleNetwork();
  const [quantity, setQuantity] = React.useState(1);
  const [minting, setMinting] = React.useState(false);

  const handleMint = async () => {
    if (!library) return;

    setMinting(true);
    try {
      const signer = library.getSigner();
      const contract = new Contract(contractAddress, NFT_MINT_ABI, signer);
      
      const price = await contract.price();
      const totalPrice = price.mul(quantity);
      
      const tx = await contract.mint(quantity, {
        value: totalPrice,
      });
      
      await tx.wait();
      alert(`Minted ${quantity} NFT(s)!`);
    } catch (error) {
      console.error('Mint failed:', error);
      alert('Mint failed: ' + error.message);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div>
      <h3>Mint NFT</h3>
      <input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      <button onClick={handleMint} disabled={minting}>
        {minting ? 'Minting...' : `Mint ${quantity} NFT(s)`}
      </button>
    </div>
  );
}
```

---

## Network Switching

### Display Current Network

```typescript
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  137: 'Polygon',
  42161: 'Arbitrum',
  56: 'BSC',
};

function CurrentNetwork() {
  const { chainId } = useParticleNetwork();
  
  if (!chainId) return null;

  return (
    <div>
      Connected to: {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
    </div>
  );
}
```

### Request Network Switch

```typescript
function NetworkSwitcher() {
  const { library } = useParticleNetwork();

  const switchToBase = async () => {
    if (!library) return;

    try {
      await library.send('wallet_switchEthereumChain', [
        { chainId: '0x2105' }, // Base = 8453 in hex
      ]);
    } catch (error: any) {
      // Chain not added to wallet
      if (error.code === 4902) {
        await library.send('wallet_addEthereumChain', [{
          chainId: '0x2105',
          chainName: 'Base',
          nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
          },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }]);
      }
    }
  };

  return (
    <button onClick={switchToBase}>
      Switch to Base
    </button>
  );
}
```

---

## Error Handling

### Protected Route (Require Login)

```typescript
import { Navigate } from 'react-router-dom';
import { useParticleNetwork } from './lib/particle-network';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { active } = useParticleNetwork();

  if (!active) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Usage:
// <Route path="/dashboard" element={
//   <ProtectedRoute>
//     <Dashboard />
//   </ProtectedRoute>
// } />
```

### Transaction Error Handling

```typescript
function SendWithErrorHandling() {
  const { library } = useParticleNetwork();
  const [error, setError] = React.useState<string>('');

  const handleSend = async (to: string, amount: string) => {
    setError('');
    
    try {
      const signer = library.getSigner();
      const tx = await signer.sendTransaction({
        to,
        value: parseEther(amount),
      });
      await tx.wait();
      alert('Success!');
    } catch (err: any) {
      // Handle specific errors
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        setError('Insufficient funds for transaction');
      } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        setError('Cannot estimate gas (contract may revert)');
      } else {
        setError(err.message || 'Transaction failed');
      }
    }
  };

  return (
    <div>
      {/* Transaction UI */}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
```

### Loading States

```typescript
function BalanceWithLoading() {
  const { primaryAssets, refreshPrimaryAssets } = useParticleNetwork();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (primaryAssets) {
      setLoading(false);
    }
  }, [primaryAssets]);

  const handleRefresh = async () => {
    setLoading(true);
    await refreshPrimaryAssets();
    setLoading(false);
  };

  if (loading) {
    return <div>Loading balances...</div>;
  }

  return (
    <div>
      <h2>${primaryAssets?.totalAmountInUSD || '0.00'}</h2>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  );
}
```

---

## Complete Example App

### Full Featured App

```typescript
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ParticleNetworkProvider, useParticleNetwork } from './lib/particle-network';

// Login page
function LoginPage() {
  const { setOpen } = useModal();
  const { account } = useParticleNetwork();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (account) navigate('/dashboard');
  }, [account, navigate]);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Welcome to PuterOS</h1>
      <button onClick={() => setOpen(true)}>
        Login with Particle Network
      </button>
    </div>
  );
}

// Dashboard
function Dashboard() {
  const { account, primaryAssets, deactivate } = useParticleNetwork();

  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Dashboard</h1>
        <button onClick={deactivate}>Logout</button>
      </header>

      <div>
        <h2>Account</h2>
        <code>{account}</code>
      </div>

      <div>
        <h2>Portfolio</h2>
        <h1>${primaryAssets?.totalAmountInUSD || '0.00'}</h1>
      </div>

      <div>
        <h2>Quick Actions</h2>
        <button>Send</button>
        <button>Receive</button>
        <button>Swap</button>
      </div>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { active } = useParticleNetwork();
  return active ? <>{children}</> : <Navigate to="/login" />;
}

// Main app
function App() {
  return (
    <BrowserRouter>
      <ParticleNetworkProvider transactionHandler="ua">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </ParticleNetworkProvider>
    </BrowserRouter>
  );
}

export default App;
```

---

## Summary

These examples cover:
- ✅ Basic setup and authentication
- ✅ User profile and wallet display
- ✅ Balance queries (native + ERC-20)
- ✅ Sending transactions (ETH + tokens)
- ✅ Smart contract interactions (read/write)
- ✅ Network switching
- ✅ Error handling
- ✅ Loading states
- ✅ Protected routes
- ✅ Complete app structure

**Copy any example and customize for your needs!**

For more details, see `PARTICLE_NETWORK_IMPLEMENTATION_GUIDE.md`.
