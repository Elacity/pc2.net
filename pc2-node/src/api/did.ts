/**
 * DID (Decentralized Identity) Tethering Endpoints
 * 
 * Handles Elastos DID tethering for PC2 nodes
 * Allows users to link their Elastos DID to their PC2 account
 */

import express, { Request, Response, Router } from 'express';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { getNodeConfig, saveNodeConfig } from './setup.js';

const router: Router = express.Router();

// Store pending tether requests (nonce -> request data)
const pendingTetherRequests: Map<string, {
  walletAddress: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
}> = new Map();

// Cleanup expired requests every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, request] of pendingTetherRequests) {
    if (request.expiresAt < now) {
      pendingTetherRequests.delete(nonce);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a DID tether request
 * Creates a nonce and returns data for QR code generation
 * POST /api/did/tether-request
 */
export async function handleTetherRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const walletAddress = req.user?.wallet_address;
    
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Generate unique nonce for this request
    const nonce = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + (5 * 60 * 1000); // 5 minutes

    // Store pending request
    pendingTetherRequests.set(nonce, {
      walletAddress: walletAddress.toLowerCase(),
      nonce,
      createdAt,
      expiresAt
    });

    // Build the credaccess URL for Essentials
    // Format: https://did.web3essentials.io/credaccess/?claims=...
    const nodeConfig = getNodeConfig();
    const callbackUrl = `${nodeConfig.publicUrl || req.protocol + '://' + req.get('host')}/api/did/callback`;
    
    // Minimal credential request - just asking for DID authentication
    const claims = {
      iss: nodeConfig.nodeDID || 'did:boson:pc2-node',
      nonce: nonce,
      claims: {
        // Request basic DID authentication
        credentials: []
      },
      callbackurl: callbackUrl
    };

    // Base64 encode for URL
    const claimsBase64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const qrUrl = `https://did.web3essentials.io/credaccess/?claims=${claimsBase64}`;

    logger.info('[DID] Tether request created', {
      wallet: walletAddress.substring(0, 10) + '...',
      nonce: nonce.substring(0, 16) + '...',
      expiresIn: '5 minutes'
    });

    res.json({
      success: true,
      nonce,
      qrUrl,
      expiresAt,
      callbackUrl
    });

  } catch (error) {
    logger.error('[DID] Tether request error:', error);
    res.status(500).json({ error: 'Failed to create tether request' });
  }
}

/**
 * Check tether status
 * Poll this endpoint to see if DID has been tethered
 * GET /api/did/status
 */
export async function handleTetherStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const walletAddress = req.user?.wallet_address;
    
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const nodeConfig = getNodeConfig();
    const tetheredDIDs = nodeConfig.tetheredDIDs || {};
    const normalizedWallet = walletAddress.toLowerCase();
    
    const tetheredInfo = tetheredDIDs[normalizedWallet];
    
    if (tetheredInfo) {
      res.json({
        tethered: true,
        did: tetheredInfo.did,
        tetheredAt: tetheredInfo.tetheredAt,
        wallets: tetheredInfo.wallets || null
      });
    } else {
      res.json({
        tethered: false
      });
    }

  } catch (error) {
    logger.error('[DID] Status check error:', error);
    res.status(500).json({ error: 'Failed to check tether status' });
  }
}

/**
 * DID callback from Essentials
 * Essentials posts the signed DID response here
 * POST /api/did/callback
 */
export async function handleDIDCallback(req: Request, res: Response): Promise<void> {
  try {
    const { presentation, nonce } = req.body;

    logger.info('[DID] Callback received', {
      hasPresentation: !!presentation,
      hasNonce: !!nonce,
      bodyKeys: Object.keys(req.body || {})
    });

    if (!nonce) {
      res.status(400).json({ error: 'Missing nonce' });
      return;
    }

    // Find pending request
    const pendingRequest = pendingTetherRequests.get(nonce);
    
    if (!pendingRequest) {
      res.status(400).json({ error: 'Invalid or expired nonce' });
      return;
    }

    if (pendingRequest.expiresAt < Date.now()) {
      pendingTetherRequests.delete(nonce);
      res.status(400).json({ error: 'Nonce expired' });
      return;
    }

    // Parse the presentation to extract DID
    let did: string | null = null;
    let wallets: {
      elaMainchain?: string;
      btc?: string;
      tron?: string;
    } = {};

    try {
      // The presentation contains a JWT or JSON-LD verifiable presentation
      // For now, we'll extract the DID from the holder field
      if (typeof presentation === 'string') {
        // JWT format - decode the payload
        const parts = presentation.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          did = payload.iss || payload.holder || payload.sub;
        }
      } else if (presentation?.holder) {
        // JSON-LD format
        did = presentation.holder;
      } else if (presentation?.iss) {
        did = presentation.iss;
      }

      // Extract additional wallet addresses if provided in the presentation
      // Essentials may include these in credentialSubject or custom claims
      if (presentation?.credentialSubject) {
        wallets.elaMainchain = presentation.credentialSubject.elaMainchainAddress;
        wallets.btc = presentation.credentialSubject.btcAddress;
        wallets.tron = presentation.credentialSubject.tronAddress;
      }

    } catch (parseError) {
      logger.error('[DID] Failed to parse presentation:', parseError);
    }

    if (!did) {
      res.status(400).json({ error: 'Could not extract DID from presentation' });
      return;
    }

    // TODO: In production, verify the DID signature
    // This would involve:
    // 1. Resolving the DID document from the EID chain
    // 2. Extracting the public key
    // 3. Verifying the JWT/presentation signature
    
    // For now, we'll trust the presentation and store the tether
    const nodeConfig = getNodeConfig();
    if (!nodeConfig.tetheredDIDs) {
      nodeConfig.tetheredDIDs = {};
    }

    nodeConfig.tetheredDIDs[pendingRequest.walletAddress] = {
      did,
      tetheredAt: new Date().toISOString(),
      wallets
    };

    saveNodeConfig(nodeConfig);
    pendingTetherRequests.delete(nonce);

    logger.info('[DID] Tether successful', {
      wallet: pendingRequest.walletAddress.substring(0, 10) + '...',
      did: did.substring(0, 30) + '...'
    });

    res.json({
      success: true,
      did,
      message: 'DID successfully tethered'
    });

  } catch (error) {
    logger.error('[DID] Callback error:', error);
    res.status(500).json({ error: 'Failed to process DID callback' });
  }
}

/**
 * Untether DID
 * Removes the DID association from the wallet
 * POST /api/did/untether
 */
export async function handleUntether(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const walletAddress = req.user?.wallet_address;
    
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const nodeConfig = getNodeConfig();
    const normalizedWallet = walletAddress.toLowerCase();
    
    if (nodeConfig.tetheredDIDs && nodeConfig.tetheredDIDs[normalizedWallet]) {
      const previousDID = nodeConfig.tetheredDIDs[normalizedWallet].did;
      delete nodeConfig.tetheredDIDs[normalizedWallet];
      saveNodeConfig(nodeConfig);
      
      logger.info('[DID] Untether successful', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        previousDID: previousDID.substring(0, 30) + '...'
      });
      
      res.json({ success: true, message: 'DID untethered' });
    } else {
      res.json({ success: true, message: 'No DID was tethered' });
    }

  } catch (error) {
    logger.error('[DID] Untether error:', error);
    res.status(500).json({ error: 'Failed to untether DID' });
  }
}

/**
 * Get multi-chain wallet balances
 * Returns balances for tethered non-EVM chains (Mainchain, BTC, Tron)
 * GET /api/did/balances
 */
export async function handleGetBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const walletAddress = req.user?.wallet_address;
    
    if (!walletAddress) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const nodeConfig = getNodeConfig();
    const normalizedWallet = walletAddress.toLowerCase();
    const tetheredInfo = nodeConfig.tetheredDIDs?.[normalizedWallet];
    
    if (!tetheredInfo) {
      res.status(400).json({ error: 'DID not tethered' });
      return;
    }

    const balances: {
      elaMainchain?: { address: string; balance: string; usdValue: number };
      btc?: { address: string; balance: string; usdValue: number };
      tron?: { address: string; balance: string; usdValue: number };
    } = {};

    // Fetch ELA Mainchain balance if address is available
    if (tetheredInfo.wallets?.elaMainchain) {
      try {
        const elaBalance = await fetchELAMainchainBalance(tetheredInfo.wallets.elaMainchain);
        balances.elaMainchain = {
          address: tetheredInfo.wallets.elaMainchain,
          balance: elaBalance.balance,
          usdValue: elaBalance.usdValue
        };
      } catch (e) {
        logger.warn('[DID] Failed to fetch ELA Mainchain balance:', e);
      }
    }

    // Fetch BTC balance if address is available
    if (tetheredInfo.wallets?.btc) {
      try {
        const btcBalance = await fetchBTCBalance(tetheredInfo.wallets.btc);
        balances.btc = {
          address: tetheredInfo.wallets.btc,
          balance: btcBalance.balance,
          usdValue: btcBalance.usdValue
        };
      } catch (e) {
        logger.warn('[DID] Failed to fetch BTC balance:', e);
      }
    }

    // Fetch Tron balance if address is available
    if (tetheredInfo.wallets?.tron) {
      try {
        const tronBalance = await fetchTronBalance(tetheredInfo.wallets.tron);
        balances.tron = {
          address: tetheredInfo.wallets.tron,
          balance: tronBalance.balance,
          usdValue: tronBalance.usdValue
        };
      } catch (e) {
        logger.warn('[DID] Failed to fetch Tron balance:', e);
      }
    }

    res.json({
      did: tetheredInfo.did,
      balances
    });

  } catch (error) {
    logger.error('[DID] Get balances error:', error);
    res.status(500).json({ error: 'Failed to get balances' });
  }
}

/**
 * Fetch ELA Mainchain balance using RPC
 */
async function fetchELAMainchainBalance(address: string): Promise<{ balance: string; usdValue: number }> {
  // ELA Mainchain RPC: https://api.elastos.io/ela
  const response = await fetch('https://api.elastos.io/ela', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'getreceivedbyaddress',
      params: { address }
    })
  });

  const data = await response.json();
  const balance = data.result || '0';
  
  // Get ELA price (approximate)
  const elaPrice = await getTokenPrice('ELA');
  const balanceNum = parseFloat(balance) / 1e8; // ELA has 8 decimals on mainchain
  
  return {
    balance: balanceNum.toFixed(8),
    usdValue: balanceNum * elaPrice
  };
}

/**
 * Fetch BTC balance using block explorer API
 */
async function fetchBTCBalance(address: string): Promise<{ balance: string; usdValue: number }> {
  // Use a public BTC explorer API
  const response = await fetch(`https://blockchain.info/q/addressbalance/${address}`);
  const satoshis = await response.text();
  const balanceNum = parseInt(satoshis, 10) / 1e8;
  
  const btcPrice = await getTokenPrice('BTC');
  
  return {
    balance: balanceNum.toFixed(8),
    usdValue: balanceNum * btcPrice
  };
}

/**
 * Fetch Tron balance using TronGrid API
 */
async function fetchTronBalance(address: string): Promise<{ balance: string; usdValue: number }> {
  const response = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
  const data = await response.json();
  
  const balance = data.data?.[0]?.balance || 0;
  const balanceNum = balance / 1e6; // TRX has 6 decimals
  
  const trxPrice = await getTokenPrice('TRX');
  
  return {
    balance: balanceNum.toFixed(6),
    usdValue: balanceNum * trxPrice
  };
}

/**
 * Get token price from CoinGecko or cache
 */
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTokenPrice(symbol: string): Promise<number> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  const coinGeckoIds: Record<string, string> = {
    'ELA': 'elastos',
    'BTC': 'bitcoin',
    'TRX': 'tron'
  };

  const id = coinGeckoIds[symbol];
  if (!id) return 0;

  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const data = await response.json();
    const price = data[id]?.usd || 0;
    
    priceCache.set(symbol, { price, timestamp: Date.now() });
    return price;
  } catch (e) {
    logger.warn(`[DID] Failed to fetch ${symbol} price:`, e);
    return 0;
  }
}

// Register routes
router.post('/tether-request', authenticate, handleTetherRequest);
router.get('/status', authenticate, handleTetherStatus);
router.post('/callback', handleDIDCallback); // No auth - Essentials calls this
router.post('/untether', authenticate, handleUntether);
router.get('/balances', authenticate, handleGetBalances);

export default router;
