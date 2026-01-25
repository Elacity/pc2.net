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
import os from 'os';
import { getNodeConfig, saveNodeConfig } from './setup.js';

/**
 * Get the local network IP address for callbacks
 * This is needed for local development when mobile devices need to reach the PC2 node
 */
function getLocalNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip internal/loopback and non-IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

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

    // Build credaccess URL for Essentials with EMPTY credentials
    // This only asks for DID authentication, no actual credentials required
    const nodeConfig = getNodeConfig();
    
    // Determine callback URL - needs to be reachable from Essentials mobile app
    let callbackUrl: string;
    if (nodeConfig.publicUrl) {
      // Production: use configured public URL
      callbackUrl = `${nodeConfig.publicUrl}/api/did/callback`;
    } else {
      // Development: use local network IP so phone can reach us
      const host = req.get('host') || 'localhost:4200';
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
      
      if (isLocalhost) {
        const localIP = getLocalNetworkIP();
        const port = host.split(':')[1] || '4200';
        if (localIP) {
          callbackUrl = `http://${localIP}:${port}/api/did/callback`;
          logger.info('[DID] Using local network IP for callback:', callbackUrl);
        } else {
          // Fallback - will only work if phone is on same machine (unlikely)
          callbackUrl = `http://localhost:${port}/api/did/callback`;
          logger.warn('[DID] Could not detect local IP, callback may not work from mobile');
        }
      } else {
        // Already using a reachable host (maybe behind proxy)
        callbackUrl = `${req.protocol}://${host}/api/did/callback`;
      }
    }
    
    // Determine which step we're on
    const step = req.body.step || 1;
    
    let jwtPayload: Record<string, unknown>;
    let qrUrl: string;
    let intentType: string;
    
    if (step === 1) {
      // Step 1: credaccess for DID verification
      intentType = 'credaccess';
      jwtPayload = {
        iss: 'did:elastos:pc2node',
        callbackurl: callbackUrl,
        nonce: nonce,
        claims: {},  // Empty claims - just verify DID
        website: {
          domain: 'PC2 Personal Cloud',
          logo: ''
        }
      };
      const jwtHeader = { alg: 'none', typ: 'JWT' };
      const headerB64 = Buffer.from(JSON.stringify(jwtHeader)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
      const jwtToken = `${headerB64}.${payloadB64}.`;
      qrUrl = `https://did.elastos.net/credaccess/${jwtToken}`;
    } else {
      // Step 2: walletaccess for wallet addresses
      // Use reqfields to explicitly specify which addresses to request
      intentType = 'walletaccess';
      jwtPayload = {
        iss: 'did:elastos:pc2node',
        callbackurl: callbackUrl,
        nonce: nonce,
        // Use reqfields object to request specific wallet addresses
        reqfields: {
          elaaddress: true,
          ethaddress: true
          // Future: btcaddress, tronaddress (after Essentials PR)
        }
      };
      const jwtHeader = { alg: 'none', typ: 'JWT' };
      const headerB64 = Buffer.from(JSON.stringify(jwtHeader)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
      const jwtToken = `${headerB64}.${payloadB64}.`;
      qrUrl = `https://wallet.web3essentials.io/walletaccess/${jwtToken}`;
    }

    logger.info('[DID] Tether request created', {
      wallet: walletAddress.substring(0, 10) + '...',
      nonce: nonce.substring(0, 16) + '...',
      step,
      intentType,
      expiresIn: '5 minutes'
    });

    res.json({
      success: true,
      nonce,
      qrUrl,
      expiresAt,
      callbackUrl,
      step,
      intentType
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
 * Handles both didsign JWT response and credaccess presentation
 * POST /api/did/callback
 */
export async function handleDIDCallback(req: Request, res: Response): Promise<void> {
  // Log ALL incoming callback requests for debugging
  logger.info('[DID] ========== CALLBACK RECEIVED ==========');
  logger.info('[DID] Method:', req.method);
  logger.info('[DID] Headers:', JSON.stringify(req.headers, null, 2));
  logger.info('[DID] Body:', JSON.stringify(req.body, null, 2));
  logger.info('[DID] Query:', JSON.stringify(req.query, null, 2));
  logger.info('[DID] ===========================================');
  
  try {
    // didsign returns: { jwt: "..." } or { signedData: "..." }
    // credaccess returns: { presentation: "...", nonce: "..." }
    const { jwt, signedData, presentation } = req.body;

    logger.info('[DID] Callback received', {
      hasJwt: !!jwt,
      hasSignedData: !!signedData,
      hasPresentation: !!presentation,
      bodyKeys: Object.keys(req.body || {})
    });

    // Parse the response to extract DID and nonce
    let did: string | null = null;
    let nonce: string | null = null;
    let wallets: {
      elaMainchain?: string;
      esc?: string;
      btc?: string;
      tron?: string;
    } = {};

    try {
      // Handle walletaccess response format: { result: JSON.stringify({ walletinfo: [...] }) }
      if (req.body.result && typeof req.body.result === 'string') {
        try {
          const resultData = JSON.parse(req.body.result);
          logger.info('[DID] Parsed walletaccess result:', JSON.stringify(resultData));
          
          if (resultData.walletinfo) {
            const walletInfo = Array.isArray(resultData.walletinfo) ? resultData.walletinfo[0] : resultData.walletinfo;
            logger.info('[DID] WalletInfo:', JSON.stringify(walletInfo));
            
            // Extract wallet addresses from walletinfo
            if (walletInfo.elaaddress) {
              wallets.elaMainchain = walletInfo.elaaddress;
              logger.info('[DID] ELA Mainchain address:', walletInfo.elaaddress);
            }
            if (walletInfo.ethaddress) {
              wallets.esc = walletInfo.ethaddress;
              logger.info('[DID] ESC address:', walletInfo.ethaddress);
            }
            if (walletInfo.btcaddress) {
              wallets.btc = walletInfo.btcaddress;
              logger.info('[DID] BTC address:', walletInfo.btcaddress);
            }
            if (walletInfo.tronaddress) {
              wallets.tron = walletInfo.tronaddress;
              logger.info('[DID] Tron address:', walletInfo.tronaddress);
            }
            
            // For walletaccess, we need to find the pending request without nonce
            // since the response format doesn't include nonce
            // Use the most recent pending request for this callback URL
            for (const [pendingNonce, request] of pendingTetherRequests.entries()) {
              if (request.expiresAt > Date.now()) {
                nonce = pendingNonce;
                logger.info('[DID] Found pending request for walletaccess:', pendingNonce.substring(0, 16) + '...');
                break;
              }
            }
          }
        } catch (parseErr) {
          logger.warn('[DID] Failed to parse result field:', parseErr);
        }
      }
      
      // Essentials credaccess sends: { jwt: "<signed JWT token>" }
      // The JWT payload contains: iss (user DID), presentation.proof.nonce
      const jwtToken = jwt || signedData || presentation;
      
      if (typeof jwtToken === 'string' && jwtToken.includes('.')) {
        // JWT format - decode the payload
        const parts = jwtToken.split('.');
        if (parts.length >= 2) {
          // Add padding if needed for base64url
          let payloadB64 = parts[1];
          while (payloadB64.length % 4 !== 0) {
            payloadB64 += '=';
          }
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
          
          // DID is in 'iss' or 'did' field
          did = payload.iss || payload.did || payload.sub;
          
          // Nonce is in presentation.proof.nonce (Essentials format)
          if (payload.presentation?.proof?.nonce) {
            nonce = payload.presentation.proof.nonce;
          } else {
            // Fallback to direct nonce field
            nonce = payload.nonce || payload.jti;
          }
          
          // Try to extract wallet addresses from JWT claims or presentation
          // Check various possible property names Essentials might use
          const elaKeys = ['elaMainchainAddress', 'elaaddress', 'ela', 'mainchainAddress', 'ELAAddress'];
          const btcKeys = ['btcAddress', 'btcaddress', 'btc', 'bitcoinAddress', 'BTCAddress'];
          const tronKeys = ['tronAddress', 'tronaddress', 'trx', 'TRXAddress', 'TRONAddress'];
          
          // walletaccess response format: { walletinfo: [{ elaaddress: "...", ethaddress: "..." }] }
          if (payload.walletinfo) {
            const walletInfo = Array.isArray(payload.walletinfo) ? payload.walletinfo[0] : payload.walletinfo;
            logger.info('[DID] Found walletinfo in response:', JSON.stringify(walletInfo));
            if (walletInfo.elaaddress) wallets.elaMainchain = walletInfo.elaaddress;
            if (walletInfo.ethaddress) logger.info('[DID] ESC address confirmed:', walletInfo.ethaddress);
          }
          
          // Check top-level payload
          for (const key of elaKeys) {
            if (payload[key]) { wallets.elaMainchain = payload[key]; break; }
          }
          for (const key of btcKeys) {
            if (payload[key]) { wallets.btc = payload[key]; break; }
          }
          for (const key of tronKeys) {
            if (payload[key]) { wallets.tron = payload[key]; break; }
          }
          
          // Check presentation credentials for wallet addresses
          if (payload.presentation?.verifiableCredential) {
            const credentials = Array.isArray(payload.presentation.verifiableCredential) 
              ? payload.presentation.verifiableCredential 
              : [payload.presentation.verifiableCredential];
              
            for (const vc of credentials) {
              const subject = vc.credentialSubject || vc;
              
              // Check for "wallet" credential format from Essentials
              // Format: { addressType: 'elastosmainchain'|'btclegacy'|'tron'|'evm', address: '...' }
              if (subject.wallet || subject.addressType) {
                const walletData = subject.wallet || subject;
                const addressType = walletData.addressType;
                const address = walletData.address;
                
                if (addressType && address) {
                  logger.info('[DID] Found wallet credential:', { addressType, address: address.substring(0, 20) + '...' });
                  
                  switch (addressType) {
                    case 'elastosmainchain':
                      if (!wallets.elaMainchain) wallets.elaMainchain = address;
                      break;
                    case 'btclegacy':
                    case 'btc':
                      if (!wallets.btc) wallets.btc = address;
                      break;
                    case 'tron':
                      if (!wallets.tron) wallets.tron = address;
                      break;
                    case 'evm':
                      // EVM address is the same as ESC, already have from login
                      break;
                  }
                }
              }
              
              // Check each credential for direct wallet address keys
              for (const key of elaKeys) {
                if (subject[key] && !wallets.elaMainchain) { 
                  // Handle both string and object formats
                  wallets.elaMainchain = typeof subject[key] === 'object' ? subject[key].address : subject[key]; 
                  break; 
                }
              }
              for (const key of btcKeys) {
                if (subject[key] && !wallets.btc) { 
                  wallets.btc = typeof subject[key] === 'object' ? subject[key].address : subject[key]; 
                  break; 
                }
              }
              for (const key of tronKeys) {
                if (subject[key] && !wallets.tron) { 
                  wallets.tron = typeof subject[key] === 'object' ? subject[key].address : subject[key]; 
                  break; 
                }
              }
              
              // Log the credential for debugging
              logger.info('[DID] Credential subject:', JSON.stringify(subject).substring(0, 500));
            }
          }
          
          // Also check vp (Verifiable Presentation) format
          if (payload.vp?.verifiableCredential) {
            const credentials = Array.isArray(payload.vp.verifiableCredential) 
              ? payload.vp.verifiableCredential 
              : [payload.vp.verifiableCredential];
              
            for (const vc of credentials) {
              const subject = vc.credentialSubject || vc;
              for (const key of elaKeys) {
                if (subject[key] && !wallets.elaMainchain) { wallets.elaMainchain = subject[key]; break; }
              }
              for (const key of btcKeys) {
                if (subject[key] && !wallets.btc) { wallets.btc = subject[key]; break; }
              }
              for (const key of tronKeys) {
                if (subject[key] && !wallets.tron) { wallets.tron = subject[key]; break; }
              }
            }
          }
          
          // Log FULL payload for debugging wallet address extraction
          logger.info('[DID] ===== FULL JWT PAYLOAD FOR DEBUGGING =====');
          logger.info('[DID] Payload keys:', Object.keys(payload));
          logger.info('[DID] Full payload:', JSON.stringify(payload, null, 2).substring(0, 2000));
          if (payload.presentation) {
            logger.info('[DID] Presentation keys:', Object.keys(payload.presentation));
            if (payload.presentation.verifiableCredential) {
              logger.info('[DID] VerifiableCredentials:', JSON.stringify(payload.presentation.verifiableCredential, null, 2).substring(0, 2000));
            }
          }
          logger.info('[DID] ===========================================');
          
          logger.info('[DID] Parsed JWT from Essentials', {
            did: did?.substring(0, 40) + '...',
            nonceFromPresentation: nonce?.substring(0, 16) + '...',
            hasWallets: Object.keys(wallets).length > 0,
            wallets: JSON.stringify(wallets)
          });
        }
      } else if (typeof jwtToken === 'object') {
        // JSON-LD format or object response
        did = jwtToken?.holder || jwtToken?.iss || jwtToken?.sub;
        nonce = jwtToken?.presentation?.proof?.nonce || jwtToken?.nonce;
        
        if (jwtToken?.credentialSubject) {
          wallets.elaMainchain = jwtToken.credentialSubject.elaMainchainAddress;
          wallets.btc = jwtToken.credentialSubject.btcAddress;
          wallets.tron = jwtToken.credentialSubject.tronAddress;
        }
      }

      // Also check for nonce in request body directly
      if (!nonce && req.body.nonce) {
        nonce = req.body.nonce;
      }

    } catch (parseError) {
      logger.error('[DID] Failed to parse response:', parseError);
    }

    if (!nonce) {
      logger.warn('[DID] Missing nonce in callback');
      res.status(400).json({ error: 'Missing nonce' });
      return;
    }

    // Find pending request
    const pendingRequest = pendingTetherRequests.get(nonce);
    
    if (!pendingRequest) {
      logger.warn('[DID] Invalid or expired nonce:', nonce.substring(0, 16) + '...');
      res.status(400).json({ error: 'Invalid or expired nonce' });
      return;
    }

    if (pendingRequest.expiresAt < Date.now()) {
      pendingTetherRequests.delete(nonce);
      res.status(400).json({ error: 'Nonce expired' });
      return;
    }

    // Handle two types of callbacks:
    // 1. credaccess: Returns DID (step 1)
    // 2. walletaccess: Returns wallet addresses (step 2)
    
    const nodeConfig = getNodeConfig();
    if (!nodeConfig.tetheredDIDs) {
      nodeConfig.tetheredDIDs = {};
    }
    
    const existingTether = nodeConfig.tetheredDIDs[pendingRequest.walletAddress];
    
    if (did) {
      // This is a credaccess response (step 1) - save DID
      nodeConfig.tetheredDIDs[pendingRequest.walletAddress] = {
        did,
        tetheredAt: new Date().toISOString(),
        wallets: existingTether?.wallets || wallets
      };
      
      logger.info('[DID] Step 1 complete: DID tethered', {
        wallet: pendingRequest.walletAddress.substring(0, 10) + '...',
        did: did.substring(0, 30) + '...'
      });
      
      saveNodeConfig(nodeConfig);
      pendingTetherRequests.delete(nonce);
      
      res.json({
        success: true,
        step: 1,
        did,
        message: 'DID successfully tethered. Proceed to step 2 for wallet addresses.'
      });
    } else if (Object.keys(wallets).length > 0) {
      // This is a walletaccess response (step 2) - save wallet addresses
      if (!existingTether) {
        // No existing DID tether - create a placeholder
        nodeConfig.tetheredDIDs[pendingRequest.walletAddress] = {
          did: 'pending',
          tetheredAt: new Date().toISOString(),
          wallets
        };
      } else {
        // Update existing tether with wallet addresses
        nodeConfig.tetheredDIDs[pendingRequest.walletAddress] = {
          ...existingTether,
          wallets: { ...existingTether.wallets, ...wallets }
        };
      }
      
      logger.info('[DID] Step 2 complete: Wallet addresses saved', {
        wallet: pendingRequest.walletAddress.substring(0, 10) + '...',
        wallets: JSON.stringify(wallets)
      });
      
      saveNodeConfig(nodeConfig);
      pendingTetherRequests.delete(nonce);
      
      res.json({
        success: true,
        step: 2,
        wallets,
        message: 'Wallet addresses successfully linked'
      });
    } else {
      res.status(400).json({ error: 'Could not extract DID or wallet addresses from response' });
      return;
    }

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
