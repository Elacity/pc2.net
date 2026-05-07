/**
 * Wallet operations for the Elacity Market Browser.
 * All calls go through the PC2 wallet bridge (window.ethereum).
 */
var Wallet = (function () {
  'use strict';

  var BASE_CHAIN_ID = '0x2105'; // 8453 in hex
  var BASE_CHAIN_CONFIG = {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org']
  };

  var ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  var BUY_ACCESS_ABI = [
    'function buyAccess(address seller, address ledger, uint256 tokenId, uint256 _quantity, uint256 _pricePerToken) payable',
    'function buyAccess(address seller, address ledger, uint256 tokenId, uint256 _quantity, uint256 _pricePerToken, address _payToken)'
  ];
  var ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];
  var OPERATIVE_ABI = [
    'function paymentProcessor() view returns (address)',
    'function setApprovalForAll(address operator, bool approved)',
    'function isApprovedForAll(address account, address operator) view returns (bool)',
    'function balanceOf(address account, uint256 id) view returns (uint256)',
    'function OP_TYPE() view returns (uint16)',
    'function resellerCut() view returns (uint16)',
    'function rewardsOf(address user, address payToken) view returns (uint256)',
    'function hasTradeAccess(address account, uint256 tokenId) view returns (bool)',
    'function withdrawRewards(address paymentToken)',
    'function multicall(bytes[] data)',
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
    'function royaltyInfo(uint256 salePrice) view returns (tuple(address receiver, uint256 amount)[])'
  ];
  // V3 SubscriptionModule (base-network-updates branch). Critical differences vs.
  // legacy:
  //   - bulkUpdatePlans tuple is (uint8 actionType, bytes args), NOT
  //     (string action, bytes args). actionType: 1=ADD, 2=UPDATE, 3=REMOVE.
  //   - subscribePlan now takes (uint8, bytes) — the bytes payload is an
  //     ABI-encoded subscription metadata CID (or 0x for none).
  //   - ADD/UPDATE args include a planURI string (IPFS CID) so the indexer
  //     can pick up label/description/image metadata.
  // See elacity-web/src/lib/drm/channel/{subscription.ts,subscribe.ts} on
  // the base-network-updates branch for the canonical reference.
  var SUBSCRIPTION_MODULE_ABI = [
    'function bulkUpdatePlans(tuple(uint8 actionType, bytes args)[] actions)',
    'function getPlans() view returns (tuple(uint8 planId, address payToken, uint256 price, uint256 duration, bool active)[])',
    'function plans(uint8 planId) view returns (uint8 planId, address payToken, uint256 price, uint256 duration, bool active)',
    'function configureTokenOwnershipAccess(tuple(address tokenAddress, uint256 threshold)[] thresholds)',
    'function hasActiveSubscription(address subscriber) view returns (bool)',
    'function subscribePlan(uint8 planId, bytes args) payable',
    'function paymentProcessor() view returns (address)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function name() view returns (string)'
  ];

  // PlanActionType enum values used by bulkUpdatePlans, mirroring elacity-web:
  //   { ADD: 1, UPDATE: 2, REMOVE: 3 }
  var PLAN_ACTION = { ADD: 1, UPDATE: 2, REMOVE: 3 };
  var TOKEN_INTROSPECT_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function supportsInterface(bytes4 interfaceId) view returns (bool)'
  ];
  var AUTHORITY_GATEWAY_ABI = [
    'function sellAccess(address ledger, uint256 tokenId, uint256 quantity, uint256 pricePerToken, address payToken)',
    'function withdrawListing(address operative, uint256 tokenId, uint256 quantity)',
    'function sellersOf(address operative, uint256 tokenId) view returns (address[])',
    'function listings(address operative, uint256 tokenId, address seller) view returns (uint256, uint256, address)',
    'function hasAccess(address accessor, address ledger, uint256 tokenId) view returns (bool)'
  ];
  var TRADE_GATEWAY_ABI = [
    'function sellToken(address operative, uint256 tokenId, uint256 quantity, uint256 pricePerToken, address payToken)',
    'function buyToken(address seller, address operative, uint256 tokenId, uint256 quantity) payable',
    'function withdrawListing(address operative, uint256 tokenId, uint256 quantity)',
    'function createOffer(address operative, uint256 tokenId, uint256 quantity, uint256 pricePerToken, address payToken)',
    'function acceptOffer(address from, address operative, uint256 tokenId, uint256 quantity)',
    'function cancelOffer(address operative, uint256 tokenId)',
    'function sellersOf(address operative, uint256 tokenId) view returns (address[])',
    'function listings(address operative, uint256 tokenId, address seller) view returns (uint256, uint256, address)',
    'function cstore() view returns (address)'
  ];
  var STORAGE_ABI = [
    'function offers(address op, uint256 tokenId, address owner) returns (uint256, uint256, address)',
    'function offerersOf(address op, uint256 tokenId) returns (address[])'
  ];
  var TRADE_ACCESS_ABI = [
    'function hasTradeAccess(address account, uint256 tkId) view returns (bool)'
  ];
  var ERC721_ABI = [
    'function safeTransferFrom(address from, address to, uint256 tokenId)'
  ];
  var ERC1155_ABI = [
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)'
  ];

  var AUTHORITY_GATEWAY_ADDRESS = '0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D';
  var TRADE_GATEWAY_ADDRESS = '0xd02451BCE627EF476B8ee52Cf131C426f67dbcB2';
  var USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  var TOKEN_ID_ACCESS = 1;
  var TOKEN_ID_ROYALTY_SHARE = 2;
  var TOKEN_ID_DISTRIBUTION = 3;

  var connectedAddress = null;
  var smartAccountAddress = new URLSearchParams(window.location.search).get('puter.smart_account') || null;
  var currentChainId = null;
  var siwePromise = null;

  // Short-lived RPC read cache. Base's public RPC throttles `eth_call` when
  // the detail view flips back and forth between assets (it fires a burst of
  // sellersOf + listings + balanceOf per open); throttled reads made the
  // Buy-button back-fill silently empty and the price section flicker in and
  // out. 30 s TTL is short enough to pick up fresh listings after a cancel
  // or a new mint, long enough to survive a rate-limit cooldown.
  var _rpcReadCache = {};
  var _RPC_CACHE_TTL_MS = 30000;

  function _cacheGet(key) {
    var entry = _rpcReadCache[key];
    if (!entry) return null;
    if (Date.now() - entry.at > _RPC_CACHE_TTL_MS) {
      delete _rpcReadCache[key];
      return null;
    }
    return entry.value;
  }

  function _cacheSet(key, value) {
    _rpcReadCache[key] = { at: Date.now(), value: value };
    return value;
  }

  function _isRateLimitError(err) {
    var msg = (err && err.message) || '';
    return msg.indexOf('rate-limited') !== -1
      || msg.indexOf('Too Many Requests') !== -1
      || msg.indexOf('429') !== -1;
  }

  // Retry-once wrapper for read RPC calls that get rate-limited by the
  // Base public gateway. Only retries on rate-limit errors; all other
  // failures propagate immediately.
  function _withRateLimitRetry(fn) {
    return fn().catch(function (err) {
      if (!_isRateLimitError(err)) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(fn);
    });
  }
  var ipcMsgCounter = 0;
  var appInstanceId = new URLSearchParams(window.location.search).get('puter.app_instance_id') || '';

  function getProvider() {
    if (!window.ethereum) throw new Error('No wallet provider available');
    return window.ethereum;
  }

  function parentSendTransaction(txParams) {
    return new Promise(function (resolve, reject) {
      var msgId = 'wallet-tx-' + (++ipcMsgCounter) + '-' + Date.now();

      function handler(event) {
        if (!event.data || event.data.original_msg_id !== msgId) return;
        window.removeEventListener('message', handler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.txHash);
        }
      }

      window.addEventListener('message', handler);
      window.parent.postMessage({
        $: 'puter-ipc',
        msg: 'walletSendTransaction',
        appInstanceID: appInstanceId,
        env: 'app',
        uuid: msgId,
        txParams: txParams
      }, '*');
    });
  }

  function parentExecuteSmartAccountBatch(chainId, transactions, expectTokens) {
    return new Promise(function (resolve, reject) {
      var msgId = 'wallet-batch-' + (++ipcMsgCounter) + '-' + Date.now();

      function handler(event) {
        if (!event.data || event.data.original_msg_id !== msgId) return;
        if (event.data.msg !== 'walletExecuteSmartAccountBatchResult') return;
        window.removeEventListener('message', handler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve({
            transactionId: event.data.transactionId,
            transactionHash: event.data.transactionHash
          });
        }
      }

      window.addEventListener('message', handler);
      window.parent.postMessage({
        $: 'puter-ipc',
        msg: 'walletExecuteSmartAccountBatch',
        appInstanceID: appInstanceId,
        env: 'app',
        uuid: msgId,
        chainId: chainId,
        transactions: transactions,
        expectTokens: expectTokens || []
      }, '*');
    });
  }

  function getSmartAccountFromParent() {
    return new Promise(function (resolve) {
      if (window.parent === window) { resolve(null); return; }
      var msgId = 'wallet-sa-' + (++ipcMsgCounter) + '-' + Date.now();
      var done = false;
      function handler(event) {
        if (!event.data || event.data.original_msg_id !== msgId) return;
        if (event.data.msg !== 'walletGetSmartAccountAddressResult') return;
        window.removeEventListener('message', handler);
        if (!done) { done = true; resolve(event.data.smartAccountAddress || null); }
      }
      window.addEventListener('message', handler);
      window.parent.postMessage({
        $: 'puter-ipc',
        msg: 'walletGetSmartAccountAddress',
        appInstanceID: appInstanceId,
        env: 'app',
        uuid: msgId
      }, '*');
      setTimeout(function () {
        window.removeEventListener('message', handler);
        if (!done) { done = true; resolve(null); }
      }, 3000);
    });
  }

  // ── Connection ───────────────────────────────────────

  function connect() {
    return getProvider().request({ method: 'eth_accounts' })
      .then(function (accounts) {
        if (accounts && accounts.length > 0) return accounts;
        return getProvider().request({ method: 'eth_requestAccounts' });
      })
      .then(function (accounts) {
        connectedAddress = accounts[0] || null;
        return getProvider().request({ method: 'eth_chainId' });
      })
      .then(function (chainId) {
        currentChainId = chainId;
        return getProvider().request({ method: 'pc2_getSmartAccountAddress' });
      })
      .then(function (sa) {
        if (sa) smartAccountAddress = sa;
        // V3 contracts live on Base — ensure bridge routes reads to 8453
        if (currentChainId !== BASE_CHAIN_ID) {
          return switchToBase().then(function () {
            return { address: connectedAddress, chainId: currentChainId, smartAccountAddress: smartAccountAddress };
          });
        }
        return { address: connectedAddress, chainId: currentChainId, smartAccountAddress: smartAccountAddress };
      })
      .catch(function (err) {
        return { address: connectedAddress, chainId: currentChainId, smartAccountAddress: smartAccountAddress };
      });
  }

  function getAddress() {
    return connectedAddress;
  }

  function getSignerAddress() {
    return smartAccountAddress || connectedAddress;
  }

  function isConnected() {
    return !!connectedAddress;
  }

  function getChainId() {
    return currentChainId;
  }

  function isOnBase() {
    return currentChainId === BASE_CHAIN_ID;
  }

  // ── Chain Switching ──────────────────────────────────

  function switchToBase() {
    if (currentChainId === BASE_CHAIN_ID) return Promise.resolve();
    return getProvider().request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID }]
    })
      .catch(function (err) {
        if (err.code === 4902) {
          return getProvider().request({
            method: 'wallet_addEthereumChain',
            params: [BASE_CHAIN_CONFIG]
          });
        }
        throw err;
      })
      .then(function () {
        currentChainId = BASE_CHAIN_ID;
      });
  }

  // ── SIWE Authentication ──────────────────────────────

  // v1.2.7.7 (Bug-G mirror): mode-aware SIWE.
  //   opts.authMode === 'sa'  → include `sa` in userLogin → JWT principal = SA
  //   opts.authMode === 'eoa' → omit `sa` in userLogin   → JWT principal = EOA
  //   omitted                 → legacy behaviour (sends `sa` if it exists)
  // Owner-only mutation callers (channel-edit, manage-plans) MUST pass
  // an explicit mode derived from walletChoiceForChannel(channel) so
  // the backend's owner-check (req.principal === channel.creator)
  // resolves. Without this the backend silently rejects with "not
  // allowed to edit this channel" and the caller's silent fallback
  // hides it (see api.js#updateChannelInformation comment).
  var siwePromiseByMode = {};

  function siweLogin(opts) {
    var mode = (opts && opts.authMode) || null; // null = legacy
    var force = !!(opts && opts.force);
    var cacheKey = mode || 'legacy';

    // v1.2.7.7 (stale-signer fix): callers can pass `force: true` when
    // they detected the cached token's signer doesn't match the
    // principal they need (e.g. the channel-edit save handler comparing
    // cached signer vs channel creator). When forced we skip the
    // "already authenticated" short-circuit and obtain a fresh JWT
    // bound to the currently-connected wallet.
    if (!force) {
      if (mode && ElacityAPI.isAuthenticated(mode)) return Promise.resolve();
      if (!mode && ElacityAPI.isAuthenticated()) return Promise.resolve();
    }
    if (siwePromiseByMode[cacheKey]) return siwePromiseByMode[cacheKey];

    if (!connectedAddress) {
      siwePromiseByMode[cacheKey] = connect().then(function () {
        siwePromiseByMode[cacheKey] = null;
        return siweLogin(opts);
      }).catch(function (err) {
        siwePromiseByMode[cacheKey] = null;
        throw err;
      });
      return siwePromiseByMode[cacheKey];
    }

    siwePromiseByMode[cacheKey] = ElacityAPI.getNonce(connectedAddress)
      .then(function (nonce) {
        var message = 'Approve signature on https://ela.city with nonce ' + (nonce || 0);
        var hexMessage = '0x' + Array.from(new TextEncoder().encode(message))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');

        return getProvider().request({
          method: 'personal_sign',
          params: [hexMessage, connectedAddress]
        });
      })
      .then(function (signature) {
        var saFromProvider = smartAccountAddress || getProvider().smartAccountAddress || null;
        if (saFromProvider) smartAccountAddress = saFromProvider;

        // Pick what to send as `sa` based on mode:
        //   'eoa'   → null (force EOA principal)
        //   'sa'    → throw if no SA available (caller asked for something
        //             impossible)
        //   legacy  → preserve old behaviour (always send sa if present)
        var saForLogin;
        if (mode === 'eoa') {
          saForLogin = null;
        } else if (mode === 'sa') {
          if (!smartAccountAddress) {
            throw new Error('SA-mode SIWE requested but no Smart Account is available on this wallet.');
          }
          saForLogin = smartAccountAddress;
        } else {
          saForLogin = saFromProvider;
        }

        return ElacityAPI.login(connectedAddress, signature, saForLogin).then(function (auth) {
          if (auth && auth.sa) smartAccountAddress = auth.sa;
          siwePromiseByMode[cacheKey] = null;
          return auth;
        });
      })
      .catch(function (err) {
        siwePromiseByMode[cacheKey] = null;
        throw err;
      });

    return siwePromiseByMode[cacheKey];
  }

  // ── Purchase ─────────────────────────────────────────

  function ensureBase() {
    if (isOnBase()) return Promise.resolve();
    return switchToBase();
  }

  function buyAccess(authorityAddr, seller, ledger, tokenId, quantity, priceWei, payToken, operativeAddr) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var isNativePayment = !payToken || payToken === ZERO_ADDRESS;
      var iface = new ethers.Interface(BUY_ACCESS_ABI);

      if (isNativePayment) {
        var data = iface.encodeFunctionData(
          'buyAccess(address,address,uint256,uint256,uint256)',
          [seller, ledger, ethers.getBigInt(tokenId), ethers.getBigInt(quantity), ethers.getBigInt(priceWei)]
        );
        return parentSendTransaction({ to: authorityAddr, data: data, value: ethers.toQuantity(ethers.getBigInt(priceWei)) });
      }

      var buyData = iface.encodeFunctionData(
        'buyAccess(address,address,uint256,uint256,uint256,address)',
        [seller, ledger, ethers.getBigInt(tokenId), ethers.getBigInt(quantity), ethers.getBigInt(priceWei), payToken]
      );
      var buyTx = { to: authorityAddr, data: buyData, value: '0x0' };

      function runSmartAccountBatch(effectiveSa) {
        console.log('[Wallet buyAccess] runSmartAccountBatch called, SA:', effectiveSa);
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        var ownerAddr = (effectiveSa || '').toLowerCase();
        return getPaymentProcessor(operativeAddr).then(function (approvalTarget) {
          console.log('[Wallet buyAccess] approvalTarget:', approvalTarget);
          var erc20Iface = new ethers.Interface(ERC20_ABI);
          var allowanceData = erc20Iface.encodeFunctionData('allowance', [ownerAddr, approvalTarget]);
          return getProvider().request({
            method: 'eth_call',
            params: [{ to: payToken, data: allowanceData }, 'latest']
          }).then(function (allowanceResult) {
            var currentAllowance = ethers.getBigInt(allowanceResult);
            var needed = ethers.getBigInt(priceWei);
            var transactions = [];
            if (currentAllowance < needed) {
              var approveData = erc20Iface.encodeFunctionData('approve', [approvalTarget, ethers.MaxUint256]);
              transactions.push({ to: payToken, data: approveData, value: '0x0' });
            }
            transactions.push(buyTx);

            // Convert priceWei to human-readable USDC amount (6 decimals) for expectTokens
            var priceNum = Number(ethers.getBigInt(priceWei));
            var usdcAmount = (priceNum / 1e6).toString();
            var expectTokens = [{ type: 'usdc', amount: usdcAmount }];

            return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, expectTokens);
          }).then(function (result) {
            var hash = result.transactionHash;
            var isOnChainHash = hash && hash.length === 66 && hash.startsWith('0x');
            if (!isOnChainHash) {
              console.warn('[Wallet buyAccess] UA transaction submitted but no on-chain hash. ID:', result.transactionId);
              if (result.transactionId) {
                console.log('[Wallet buyAccess] Check status at: https://universalx.app/activity/details?id=' + result.transactionId);
              }
            }
            return {
              status: isOnChainHash ? '0x1' : '0x0',
              transactionHash: hash || result.transactionId,
              transactionId: result.transactionId,
              _smartAccountConfirmed: true,
              _uaPending: !isOnChainHash
            };
          });
        });
      }

      function resolveSmartAccount() {
        var apiSigner = typeof ElacityAPI !== 'undefined' && ElacityAPI.getSignerAddress && ElacityAPI.getSignerAddress();
        var sa = smartAccountAddress || apiSigner;
        console.log('[Wallet buyAccess] resolveSmartAccount:', { smartAccountAddress: smartAccountAddress, apiSigner: apiSigner, sa: sa, connectedAddress: connectedAddress });
        if (sa && (connectedAddress || '').toLowerCase() !== (sa || '').toLowerCase()) {
          console.log('[Wallet buyAccess] Using SA from local/API:', sa);
          return Promise.resolve(sa);
        }
        if (window.parent !== window) {
          console.log('[Wallet buyAccess] Asking parent for SA...');
          return getSmartAccountFromParent().then(function (parentSa) {
            console.log('[Wallet buyAccess] Parent returned SA:', parentSa);
            if (parentSa) {
              smartAccountAddress = parentSa;
              return parentSa;
            }
            return null;
          });
        }
        return Promise.resolve(null);
      }

      return resolveSmartAccount().then(function (effectiveSa) {
        console.log('[Wallet buyAccess] RESOLVED SA:', effectiveSa, '| Will use batch:', !!effectiveSa);
        if (effectiveSa) {
          return runSmartAccountBatch(effectiveSa);
        }
        console.warn('[Wallet] No smart account available, falling back to EOA path');
        return getPaymentProcessor(operativeAddr)
          .then(function (approvalTarget) {
            return approveIfNeeded(payToken, priceWei, approvalTarget);
          })
          .then(function () {
            return parentSendTransaction(buyTx);
          });
      });
    });
  }

  function getPaymentProcessor(operativeAddr) {
    if (!operativeAddr) return Promise.resolve(operativeAddr);
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('paymentProcessor', []);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      var decoded = '0x' + result.slice(26);
      if (decoded === ZERO_ADDRESS) return operativeAddr;
      return decoded;
    }).catch(function () {
      return operativeAddr;
    });
  }

  function approveIfNeeded(tokenAddress, amountWei, spender, ownerOverride) {
    var iface = new ethers.Interface(ERC20_ABI);
    var ownerAddr = ownerOverride || smartAccountAddress || connectedAddress;

    var allowanceData = iface.encodeFunctionData('allowance', [
      ownerAddr,
      spender
    ]);

    return getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data: allowanceData }, 'latest']
    }).then(function (result) {
      var currentAllowance = ethers.getBigInt(result);
      var needed = ethers.getBigInt(amountWei);

      if (currentAllowance >= needed) return;

      var approveData = iface.encodeFunctionData('approve', [
        spender,
        needed
      ]);

      return parentSendTransaction({
        to: tokenAddress,
        data: approveData
      }).then(function (txHash) {
        return waitForReceipt(txHash);
      }).then(function () {
        return waitForAllowance(tokenAddress, ownerAddr, spender, needed);
      });
    });
  }

  function waitForAllowance(tokenAddress, owner, spender, needed) {
    var iface = new ethers.Interface(ERC20_ABI);
    var data = iface.encodeFunctionData('allowance', [owner, spender]);
    var attempts = 0;
    var maxAttempts = 15;

    function poll() {
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: tokenAddress, data: data }, 'latest']
      }).then(function (result) {
        var current = ethers.getBigInt(result);
        if (current >= needed) return;
        attempts++;
        if (attempts >= maxAttempts) return;
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(poll()); }, 1500);
        });
      });
    }

    return poll();
  }

  function waitForReceipt(txHash, maxAttempts) {
    maxAttempts = maxAttempts || 60;
    var attempt = 0;

    function poll() {
      return getProvider().request({
        method: 'eth_getTransactionReceipt',
        params: [txHash]
      }).then(function (receipt) {
        if (receipt) return receipt;
        attempt++;
        if (attempt >= maxAttempts) throw new Error('Transaction not confirmed after ' + maxAttempts + ' attempts');
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(poll()); }, 2000);
        });
      });
    }

    return poll();
  }

  // ── Event Listeners ──────────────────────────────────

  function setupListeners(callbacks) {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', function (accounts) {
      connectedAddress = accounts[0] || null;
      if (window.ethereum.smartAccountAddress) {
        smartAccountAddress = window.ethereum.smartAccountAddress;
      }
      if (callbacks.onAccountChange) callbacks.onAccountChange(connectedAddress);
    });

    window.ethereum.on('chainChanged', function (chainId) {
      currentChainId = chainId;
      if (callbacks.onChainChange) callbacks.onChainChange(chainId);
    });
  }

  function signMessage(message) {
    if (!connectedAddress) return Promise.reject(new Error('Wallet not connected'));
    var hexMessage = '0x' + Array.from(new TextEncoder().encode(message))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
    return getProvider().request({
      method: 'personal_sign',
      params: [hexMessage, connectedAddress]
    });
  }

  function getSmartAccountAddress() {
    return smartAccountAddress;
  }

  function hasSmartAccount() {
    return !!smartAccountAddress && smartAccountAddress.toLowerCase() !== (connectedAddress || '').toLowerCase();
  }

  function buyAccessWithEOA(authorityAddr, seller, ledger, tokenId, quantity, priceWei, payToken, operativeAddr) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    // Log inputs once up-front — these are the exact values passed in by
    // app.js handleBuy. Captures missing/malformed args (Irzhy's 2026-04-28
    // "Invalid Params" report showed MetaMask rejecting at addDappTransaction
    // BEFORE the user-approval dialog, which means a field in the tx envelope
    // was malformed. Logging inputs + the final tx object lets us compare.
    console.log('[Wallet buyAccessWithEOA] inputs:', {
      authorityAddr: authorityAddr,
      seller: seller,
      ledger: ledger,
      tokenId: String(tokenId),
      quantity: String(quantity),
      priceWei: String(priceWei),
      payToken: payToken,
      operativeAddr: operativeAddr,
      connectedAddress: connectedAddress,
      currentChainId: currentChainId
    });

    return ensureBase().then(function () {
      var isNativePayment = !payToken || payToken === ZERO_ADDRESS;
      var iface = new ethers.Interface(BUY_ACCESS_ABI);

      if (isNativePayment) {
        var data = iface.encodeFunctionData(
          'buyAccess(address,address,uint256,uint256,uint256)',
          [seller, ledger, ethers.getBigInt(tokenId), ethers.getBigInt(quantity), ethers.getBigInt(priceWei)]
        );
        var nativeTx = { to: authorityAddr, data: data, value: ethers.toQuantity(ethers.getBigInt(priceWei)) };
        console.log('[Wallet buyAccessWithEOA] native-payment tx envelope:', nativeTx);
        return parentSendTransaction(nativeTx);
      }

      var buyData = iface.encodeFunctionData(
        'buyAccess(address,address,uint256,uint256,uint256,address)',
        [seller, ledger, ethers.getBigInt(tokenId), ethers.getBigInt(quantity), ethers.getBigInt(priceWei), payToken]
      );
      var buyTx = { to: authorityAddr, data: buyData, value: '0x0' };
      console.log('[Wallet buyAccessWithEOA] erc20 buy tx envelope (after approve):', buyTx);

      return getPaymentProcessor(operativeAddr)
        .then(function (approvalTarget) {
          return approveIfNeeded(payToken, priceWei, approvalTarget, connectedAddress);
        })
        .then(function () {
          return parentSendTransaction(buyTx);
        });
    });
  }

  // ── Operative Read Helpers ──────────────────────────

  function getOperativeOpType(operativeAddr) {
    if (!operativeAddr) return Promise.resolve(0);
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('OP_TYPE', []);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      return Number(ethers.getBigInt(result));
    }).catch(function () { return 0; });
  }

  function getOperativeResellerCut(operativeAddr) {
    if (!operativeAddr) return Promise.resolve(0);
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('resellerCut', []);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      return Number(ethers.getBigInt(result));
    }).catch(function () { return 0; });
  }

  function getTokenBalance(contractAddr, ownerAddr, tokenId) {
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('balanceOf', [ownerAddr, tokenId]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: contractAddr, data: data }, 'latest']
    }).then(function (result) {
      return Number(ethers.getBigInt(result));
    }).catch(function () { return 0; });
  }

  function getAccessTokenBalance(operativeAddr, ownerAddr) {
    return getTokenBalance(operativeAddr, ownerAddr, TOKEN_ID_ACCESS);
  }

  function getRoyaltyShareBalance(operativeAddr, ownerAddr) {
    return getTokenBalance(operativeAddr, ownerAddr, TOKEN_ID_ROYALTY_SHARE);
  }

  function getPendingRewards(operativeAddr, ownerAddr, payToken) {
    if (!operativeAddr) return Promise.resolve(0);
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('rewardsOf', [ownerAddr, payToken]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      return ethers.getBigInt(result).toString();
    }).catch(function () { return '0'; });
  }

  function checkTradeAccess(operativeAddr, ownerAddr, tokenId) {
    if (!operativeAddr) return Promise.resolve(false);
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('hasTradeAccess', [ownerAddr, tokenId]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      return result !== '0x' + '0'.repeat(64);
    }).catch(function () { return false; });
  }

  // ── Resell Access Token (AuthorityGateway) ─────────

  function resellAccessToken(ledgerAddr, tokenId, quantity, priceWei, payToken, operativeAddr, useWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var opIface = new ethers.Interface(OPERATIVE_ABI);
      var agIface = new ethers.Interface(AUTHORITY_GATEWAY_ABI);
      var useEOA = (useWallet === 'eoa');
      var ownerAddr = useEOA ? connectedAddress : (smartAccountAddress || connectedAddress);

      var isApprovedData = opIface.encodeFunctionData('isApprovedForAll', [ownerAddr, AUTHORITY_GATEWAY_ADDRESS]);
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: operativeAddr, data: isApprovedData }, 'latest']
      }).then(function (result) {
        var approved = result !== '0x' + '0'.repeat(64);
        var transactions = [];

        if (!approved) {
          var approveData = opIface.encodeFunctionData('setApprovalForAll', [AUTHORITY_GATEWAY_ADDRESS, true]);
          transactions.push({ to: operativeAddr, data: approveData, value: '0x0' });
        }

        var sellData = agIface.encodeFunctionData('sellAccess', [
          ledgerAddr,
          ethers.getBigInt(tokenId),
          ethers.getBigInt(quantity),
          ethers.getBigInt(priceWei),
          payToken
        ]);
        transactions.push({ to: AUTHORITY_GATEWAY_ADDRESS, data: sellData, value: '0x0' });

        if (hasSmartAccount() && !useEOA) {
          var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
          return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, []);
        }

        var chain = transactions.reduce(function (p, tx) {
          return p.then(function () {
            return parentSendTransaction(tx).then(function (hash) {
              return waitForReceipt(hash);
            });
          });
        }, Promise.resolve());
        return chain;
      });
    });
  }

  function cancelAccessListing(operativeAddr, tokenId, quantity, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    // See buyAccessWithEOA for rationale on these diagnostic logs.
    console.log('[Wallet cancelAccessListing] inputs:', {
      operativeAddr: operativeAddr,
      tokenId: String(tokenId),
      quantity: String(quantity),
      fromWallet: fromWallet,
      connectedAddress: connectedAddress,
      currentChainId: currentChainId
    });

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var iface = new ethers.Interface(AUTHORITY_GATEWAY_ABI);
      var data = iface.encodeFunctionData('withdrawListing', [
        operativeAddr,
        ethers.getBigInt(tokenId),
        ethers.getBigInt(quantity)
      ]);
      var tx = { to: AUTHORITY_GATEWAY_ADDRESS, data: data, value: '0x0' };
      console.log('[Wallet cancelAccessListing] tx envelope:', tx, 'useSA:', useSA);

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  function getAccessSellers(operativeAddr, tokenId) {
    if (!operativeAddr) return Promise.resolve([]);
    var cacheKey = 'sellers:' + operativeAddr.toLowerCase() + ':' + String(tokenId);
    var cached = _cacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    var iface = new ethers.Interface(AUTHORITY_GATEWAY_ABI);
    var data = iface.encodeFunctionData('sellersOf', [operativeAddr, ethers.getBigInt(tokenId)]);
    return _withRateLimitRetry(function () {
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: AUTHORITY_GATEWAY_ADDRESS, data: data }, 'latest']
      });
    }).then(function (result) {
      var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address[]'], result);
      return _cacheSet(cacheKey, decoded[0] || []);
    }).catch(function () { return []; });
  }

  function getAccessListing(operativeAddr, tokenId, sellerAddr) {
    if (!operativeAddr || !sellerAddr) return Promise.resolve(null);
    var cacheKey = 'listing:' + operativeAddr.toLowerCase() + ':' + String(tokenId) + ':' + sellerAddr.toLowerCase();
    var cached = _cacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    var iface = new ethers.Interface(AUTHORITY_GATEWAY_ABI);
    var data = iface.encodeFunctionData('listings', [operativeAddr, ethers.getBigInt(tokenId), sellerAddr]);
    return _withRateLimitRetry(function () {
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: AUTHORITY_GATEWAY_ADDRESS, data: data }, 'latest']
      });
    }).then(function (result) {
      var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'uint256', 'address'], result);
      return _cacheSet(cacheKey, {
        quantity: Number(decoded[0]),
        pricePerToken: decoded[1].toString(),
        payToken: decoded[2]
      });
    }).catch(function () { return null; });
  }

  // ── Royalty Share Operations (TradeGateway) ────────

  function listRoyaltyShares(operativeAddr, quantity, priceWei, payToken, useWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var opIface = new ethers.Interface(OPERATIVE_ABI);
      var tgIface = new ethers.Interface(TRADE_GATEWAY_ABI);
      var useEOA = (useWallet === 'eoa');
      var useSA = !useEOA && hasSmartAccount();
      var ownerAddr = useSA ? smartAccountAddress : connectedAddress;

      var isApprovedData = opIface.encodeFunctionData('isApprovedForAll', [ownerAddr, TRADE_GATEWAY_ADDRESS]);
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: operativeAddr, data: isApprovedData }, 'latest']
      }).then(function (result) {
        var approved = result !== '0x' + '0'.repeat(64);
        var transactions = [];

        if (!approved) {
          var approveData = opIface.encodeFunctionData('setApprovalForAll', [TRADE_GATEWAY_ADDRESS, true]);
          transactions.push({ to: operativeAddr, data: approveData, value: '0x0' });
        }

        var sellData = tgIface.encodeFunctionData('sellToken', [
          operativeAddr,
          ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE),
          ethers.getBigInt(quantity),
          ethers.getBigInt(priceWei),
          payToken
        ]);
        transactions.push({ to: TRADE_GATEWAY_ADDRESS, data: sellData, value: '0x0' });

        if (useSA) {
          var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
          return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, []);
        }

        var chain = transactions.reduce(function (p, tx) {
          return p.then(function () {
            return parentSendTransaction(tx).then(function (hash) {
              return waitForReceipt(hash);
            });
          });
        }, Promise.resolve());
        return chain;
      });
    });
  }

  function buyRoyaltyShares(sellerAddr, operativeAddr, quantity, totalPriceWei, payToken) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var tgIface = new ethers.Interface(TRADE_GATEWAY_ABI);
      var isNative = !payToken || payToken === ZERO_ADDRESS;
      var buyData = tgIface.encodeFunctionData('buyToken', [
        sellerAddr, operativeAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE), ethers.getBigInt(quantity)
      ]);
      var buyTx = {
        to: TRADE_GATEWAY_ADDRESS,
        data: buyData,
        value: isNative ? ethers.toQuantity(ethers.getBigInt(totalPriceWei)) : '0x0'
      };

      if (hasSmartAccount() && !isNative) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        var saAddr = (smartAccountAddress || '').toLowerCase();
        var erc20Iface = new ethers.Interface(ERC20_ABI);
        var allowanceData = erc20Iface.encodeFunctionData('allowance', [saAddr, TRADE_GATEWAY_ADDRESS]);
        return getProvider().request({
          method: 'eth_call',
          params: [{ to: payToken, data: allowanceData }, 'latest']
        }).then(function (result) {
          var current = ethers.getBigInt(result);
          var needed = ethers.getBigInt(totalPriceWei);
          var transactions = [];
          if (current < needed) {
            var approveData = erc20Iface.encodeFunctionData('approve', [TRADE_GATEWAY_ADDRESS, ethers.MaxUint256]);
            transactions.push({ to: payToken, data: approveData, value: '0x0' });
          }
          transactions.push(buyTx);
          var priceNum = Number(ethers.getBigInt(totalPriceWei));
          var usdcAmount = (priceNum / 1e6).toString();
          return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, [{ type: 'usdc', amount: usdcAmount }]);
        });
      }

      if (!isNative) {
        return approveIfNeeded(payToken, totalPriceWei, TRADE_GATEWAY_ADDRESS, connectedAddress)
          .then(function () { return parentSendTransaction(buyTx); });
      }
      return parentSendTransaction(buyTx);
    });
  }

  function cancelRoyaltyListing(operativeAddr, quantity, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var iface = new ethers.Interface(TRADE_GATEWAY_ABI);
      var data = iface.encodeFunctionData('withdrawListing', [
        operativeAddr,
        ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE),
        ethers.getBigInt(quantity)
      ]);
      var tx = { to: TRADE_GATEWAY_ADDRESS, data: data, value: '0x0' };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  function transferRoyaltyShares(operativeAddr, recipientAddr, amount, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');
    if (!ethers.isAddress(recipientAddr)) throw new Error('Invalid recipient address');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var fromAddr = useSA ? smartAccountAddress : connectedAddress;
      var iface = new ethers.Interface(OPERATIVE_ABI);
      var data = iface.encodeFunctionData('safeTransferFrom', [
        fromAddr, recipientAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE), ethers.getBigInt(amount), '0x'
      ]);
      var tx = { to: operativeAddr, data: data, value: '0x0' };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  function withdrawRewards(operativeAddr, payToken, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var iface = new ethers.Interface(OPERATIVE_ABI);
      var data = iface.encodeFunctionData('withdrawRewards', [payToken]);
      var tx = { to: operativeAddr, data: data, value: '0x0' };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  function batchWithdrawRewards(operativeAddr, payTokens, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');
    if (!payTokens || payTokens.length === 0) throw new Error('No payment tokens');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var iface = new ethers.Interface(OPERATIVE_ABI);
      var encodedCalls = payTokens.map(function (pt) {
        return iface.encodeFunctionData('withdrawRewards', [pt]);
      });
      var data = iface.encodeFunctionData('multicall', [encodedCalls]);
      var tx = { to: operativeAddr, data: data, value: '0x0' };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  function getRoyaltySellers(operativeAddr) {
    if (!operativeAddr) return Promise.resolve([]);
    var iface = new ethers.Interface(TRADE_GATEWAY_ABI);
    var data = iface.encodeFunctionData('sellersOf', [operativeAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE)]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: TRADE_GATEWAY_ADDRESS, data: data }, 'latest']
    }).then(function (result) {
      var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address[]'], result);
      return decoded[0] || [];
    }).catch(function () { return []; });
  }

  function getRoyaltyListing(operativeAddr, sellerAddr) {
    if (!operativeAddr || !sellerAddr) return Promise.resolve(null);
    var iface = new ethers.Interface(TRADE_GATEWAY_ABI);
    var data = iface.encodeFunctionData('listings', [operativeAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE), sellerAddr]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: TRADE_GATEWAY_ADDRESS, data: data }, 'latest']
    }).then(function (result) {
      var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'uint256', 'address'], result);
      return {
        quantity: Number(decoded[0]),
        pricePerToken: decoded[1].toString(),
        payToken: decoded[2]
      };
    }).catch(function () { return null; });
  }

  // ── Royalty Share Offers (TradeGateway) ─────────────

  function createRoyaltyOffer(operativeAddr, quantity, pricePerToken, payToken, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');
    payToken = payToken || USDC_ADDRESS;
    var useSA = fromWallet ? fromWallet === 'sa' : hasSmartAccount();

    return ensureBase().then(function () {
      var totalCost = BigInt(quantity) * BigInt(pricePerToken);
      var tgIface = new ethers.Interface(TRADE_GATEWAY_ABI);
      var offerData = tgIface.encodeFunctionData('createOffer', [
        operativeAddr,
        ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE),
        ethers.getBigInt(quantity),
        ethers.getBigInt(pricePerToken),
        payToken
      ]);
      var offerTx = { to: TRADE_GATEWAY_ADDRESS, data: offerData, value: '0x0' };

      if (useSA && hasSmartAccount()) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        var saAddr = (smartAccountAddress || '').toLowerCase();
        var erc20Iface = new ethers.Interface(ERC20_ABI);
        var allowanceData = erc20Iface.encodeFunctionData('allowance', [saAddr, TRADE_GATEWAY_ADDRESS]);
        return getProvider().request({
          method: 'eth_call',
          params: [{ to: payToken, data: allowanceData }, 'latest']
        }).then(function (result) {
          var current = BigInt(result);
          var transactions = [];
          if (current < totalCost) {
            var approveData = erc20Iface.encodeFunctionData('approve', [TRADE_GATEWAY_ADDRESS, ethers.MaxUint256]);
            transactions.push({ to: payToken, data: approveData, value: '0x0' });
          }
          transactions.push(offerTx);
          var usdcAmount = (Number(totalCost) / 1e6).toString();
          return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, [{ type: 'usdc', amount: usdcAmount }])
            .then(function (result) {
              var hash = result.transactionHash;
              var isOnChainHash = hash && hash.length === 66 && hash.startsWith('0x');
              if (!isOnChainHash) {
                console.warn('[Wallet createRoyaltyOffer] UA submitted but no confirmed on-chain hash. ID:', result.transactionId);
              }
              return {
                transactionHash: hash || result.transactionId,
                transactionId: result.transactionId,
                _uaPending: !isOnChainHash
              };
            });
        });
      }

      var erc20Iface = new ethers.Interface(ERC20_ABI);
      var allowanceData = erc20Iface.encodeFunctionData('allowance', [connectedAddress, TRADE_GATEWAY_ADDRESS]);

      return getProvider().request({
        method: 'eth_call',
        params: [{ to: payToken, data: allowanceData }, 'latest']
      }).then(function (result) {
        var current = BigInt(result);
        if (current < totalCost) {
          var approveData = erc20Iface.encodeFunctionData('approve', [TRADE_GATEWAY_ADDRESS, totalCost.toString()]);
          return parentSendTransaction({ to: payToken, data: approveData, value: '0x0' })
            .then(function (txHash) { return waitForReceipt(txHash); })
            .then(function () { return waitForAllowance(payToken, connectedAddress, TRADE_GATEWAY_ADDRESS, totalCost); });
        }
      }).then(function () {
        return parentSendTransaction(offerTx);
      });
    });
  }

  function acceptRoyaltyOffer(fromAddr, operativeAddr, quantity, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var ownerAddr = useSA ? smartAccountAddress : connectedAddress;
      var opIface = new ethers.Interface(OPERATIVE_ABI);
      var tgIface = new ethers.Interface(TRADE_GATEWAY_ABI);

      var approvedData = opIface.encodeFunctionData('isApprovedForAll', [ownerAddr, TRADE_GATEWAY_ADDRESS]);

      return getProvider().request({
        method: 'eth_call',
        params: [{ to: operativeAddr, data: approvedData }, 'latest']
      }).then(function (result) {
        var isApproved = result !== '0x' + '0'.repeat(64);
        var acceptData = tgIface.encodeFunctionData('acceptOffer', [
          fromAddr, operativeAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE), ethers.getBigInt(quantity)
        ]);

        if (useSA) {
          var transactions = [];
          if (!isApproved) {
            var approveData = opIface.encodeFunctionData('setApprovalForAll', [TRADE_GATEWAY_ADDRESS, true]);
            transactions.push({ to: operativeAddr, data: approveData, value: '0x0' });
          }
          transactions.push({ to: TRADE_GATEWAY_ADDRESS, data: acceptData, value: '0x0' });
          var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
          return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, []);
        }

        if (!isApproved) {
          var setApprovalData = opIface.encodeFunctionData('setApprovalForAll', [TRADE_GATEWAY_ADDRESS, true]);
          return parentSendTransaction({ to: operativeAddr, data: setApprovalData, value: '0x0' })
            .then(function (txHash) { return waitForReceipt(txHash); })
            .then(function () {
              return parentSendTransaction({ to: TRADE_GATEWAY_ADDRESS, data: acceptData, value: '0x0' });
            });
        }
        return parentSendTransaction({ to: TRADE_GATEWAY_ADDRESS, data: acceptData, value: '0x0' });
      });
    });
  }

  function cancelRoyaltyOffer(operativeAddr, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var tgIface = new ethers.Interface(TRADE_GATEWAY_ABI);
      var data = tgIface.encodeFunctionData('cancelOffer', [
        operativeAddr,
        ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE)
      ]);
      var tx = { to: TRADE_GATEWAY_ADDRESS, data: data, value: '0x0' };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
      }
      return parentSendTransaction(tx);
    });
  }

  // ── Offer & Trade Access Queries ──────────────────

  var _cachedCstoreAddr = null;

  function _getCstoreAddress() {
    if (_cachedCstoreAddr) return Promise.resolve(_cachedCstoreAddr);
    var iface = new ethers.Interface(TRADE_GATEWAY_ABI);
    var data = iface.encodeFunctionData('cstore', []);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: TRADE_GATEWAY_ADDRESS, data: data }, 'latest']
    }).then(function (result) {
      _cachedCstoreAddr = ethers.AbiCoder.defaultAbiCoder().decode(['address'], result)[0];
      return _cachedCstoreAddr;
    });
  }

  function getActiveOffer(operativeAddr, accountAddr) {
    if (!operativeAddr || !accountAddr) return Promise.resolve(null);
    return _getCstoreAddress().then(function (storageAddr) {
      var iface = new ethers.Interface(STORAGE_ABI);
      var data = iface.encodeFunctionData('offers', [operativeAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE), accountAddr]);
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: storageAddr, data: data }, 'latest']
      }).then(function (result) {
        var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'uint256', 'address'], result);
        var qty = decoded[0];
        if (qty === 0n) return null;
        return { quantity: qty.toString(), pricePerToken: decoded[1].toString(), payToken: decoded[2] };
      });
    }).catch(function () { return null; });
  }

  function checkTradeAccess(operativeAddr, accountAddr) {
    if (!operativeAddr || !accountAddr) return Promise.resolve(false);
    var iface = new ethers.Interface(TRADE_ACCESS_ABI);
    var data = iface.encodeFunctionData('hasTradeAccess', [accountAddr, ethers.getBigInt(TOKEN_ID_ROYALTY_SHARE)]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['bool'], result);
      return decoded[0];
    }).catch(function () { return false; });
  }

  // ── Distribution Token Balance ────────────────────

  function getDistributionBalance(operativeAddr, ownerAddr) {
    if (!operativeAddr || !ownerAddr) return Promise.resolve('0');
    var iface = new ethers.Interface(OPERATIVE_ABI);
    var data = iface.encodeFunctionData('balanceOf', [ownerAddr, ethers.getBigInt(TOKEN_ID_DISTRIBUTION)]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: operativeAddr, data: data }, 'latest']
    }).then(function (result) {
      return ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result)[0].toString();
    }).catch(function () { return '0'; });
  }

  // ── NFT Transfer (channel-level ERC721 only) ──────

  function transferNFT(nftAddress, tokenId, recipientAddress, isERC1155, amount) {
    if (!connectedAddress) throw new Error('Wallet not connected');
    if (!ethers.isAddress(recipientAddress)) throw new Error('Invalid recipient address');

    return ensureBase().then(function () {
      var fromAddr = connectedAddress;
      var data;

      if (isERC1155) {
        var iface = new ethers.Interface(ERC1155_ABI);
        data = iface.encodeFunctionData('safeTransferFrom', [
          fromAddr, recipientAddress, ethers.getBigInt(tokenId), ethers.getBigInt(amount || 1), '0x'
        ]);
      } else {
        var iface721 = new ethers.Interface(ERC721_ABI);
        data = iface721.encodeFunctionData('safeTransferFrom', [
          fromAddr, recipientAddress, ethers.getBigInt(tokenId)
        ]);
      }

      return parentSendTransaction({ to: nftAddress, data: data, value: '0x0' });
    });
  }

  // ── On-Chain Subscription Plan Management ──────────

  var DURATION_SECONDS = {
    days: 86400,
    weeks: 604800,
    months: 2592000,
    years: 31104000
  };

  function convertDurationToSeconds(durValue, durUnit) {
    var base = DURATION_SECONDS[durUnit] || DURATION_SECONDS.months;
    return durValue * base;
  }

  function getPlans(channelAddr) {
    var iface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
    var data = iface.encodeFunctionData('getPlans', []);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: channelAddr, data: data }, 'latest']
    }).then(function (result) {
      var decoded = iface.decodeFunctionResult('getPlans', result)[0];
      return decoded.map(function (p) {
        var payToken = p.payToken;
        var isUSDC = payToken.toLowerCase() === USDC_ADDRESS.toLowerCase();
        var decimals = isUSDC ? 6 : 18;
        var priceHuman = Number(ethers.formatUnits(p.price, decimals));
        var durationSecs = Number(p.duration);
        var dur = secondsToDuration(durationSecs);
        return {
          planId: Number(p.planId),
          payToken: payToken,
          price: priceHuman,
          priceWei: p.price.toString(),
          duration: dur,
          durationSeconds: durationSecs,
          active: p.active
        };
      });
    }).catch(function (err) {
      console.warn('[Wallet] getPlans failed:', err.message);
      return [];
    });
  }

  function secondsToDuration(secs) {
    if (secs >= 31104000) return { value: Math.round(secs / 31104000), unit: 'years' };
    if (secs >= 2592000) return { value: Math.round(secs / 2592000), unit: 'months' };
    if (secs >= 604800) return { value: Math.round(secs / 604800), unit: 'weeks' };
    return { value: Math.round(secs / 86400), unit: 'days' };
  }

  function introspectToken(tokenAddr) {
    if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
      return Promise.resolve({ valid: false });
    }
    var iface = new ethers.Interface(TOKEN_INTROSPECT_ABI);

    var nameCall = getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddr, data: iface.encodeFunctionData('name', []) }, 'latest']
    }).then(function (r) {
      return iface.decodeFunctionResult('name', r)[0];
    }).catch(function () { return null; });

    var symbolCall = getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddr, data: iface.encodeFunctionData('symbol', []) }, 'latest']
    }).then(function (r) {
      return iface.decodeFunctionResult('symbol', r)[0];
    }).catch(function () { return null; });

    var decimalsCall = getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddr, data: iface.encodeFunctionData('decimals', []) }, 'latest']
    }).then(function (r) {
      return Number(iface.decodeFunctionResult('decimals', r)[0]);
    }).catch(function () { return -1; });

    var ERC721_INTERFACE_ID = '0x80ac58cd';
    var erc721Call = getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddr, data: iface.encodeFunctionData('supportsInterface', [ERC721_INTERFACE_ID]) }, 'latest']
    }).then(function (r) {
      return iface.decodeFunctionResult('supportsInterface', r)[0];
    }).catch(function () { return false; });

    return Promise.all([nameCall, symbolCall, decimalsCall, erc721Call])
      .then(function (results) {
        var name = results[0];
        var symbol = results[1];
        var decimals = results[2];
        var isERC721 = results[3];

        if (!name && !symbol) return { valid: false };

        return {
          valid: true,
          name: name,
          symbol: symbol,
          isERC721: isERC721,
          isERC20: !isERC721 && decimals >= 0,
          decimals: isERC721 ? 0 : (decimals >= 0 ? decimals : 18)
        };
      });
  }

  function getTokenDecimals(payToken) {
    if (!payToken || payToken === ZERO_ADDRESS) return Promise.resolve(18);
    if (payToken.toLowerCase() === USDC_ADDRESS.toLowerCase()) return Promise.resolve(6);
    var iface = new ethers.Interface(TOKEN_INTROSPECT_ABI);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: payToken, data: iface.encodeFunctionData('decimals', []) }, 'latest']
    }).then(function (r) {
      return Number(iface.decodeFunctionResult('decimals', r)[0]);
    }).catch(function () { return 18; });
  }

  function getERC20Balance(tokenAddress, ownerAddress) {
    if (!tokenAddress || !ownerAddress) return Promise.resolve('0');
    var iface = new ethers.Interface(ERC20_ABI);
    var data = iface.encodeFunctionData('balanceOf', [ownerAddress]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data: data }, 'latest']
    }).then(function (result) {
      return ethers.getBigInt(result).toString();
    }).catch(function () { return '0'; });
  }

  function getNativeBalance(ownerAddress) {
    if (!ownerAddress) return Promise.resolve('0');
    return getProvider().request({
      method: 'eth_getBalance',
      params: [ownerAddress, 'latest']
    }).then(function (result) {
      return ethers.getBigInt(result).toString();
    }).catch(function () { return '0'; });
  }

  // ── Channel Subscription ──────────────────────────────

  function subscribeChannel(channelAddr, planId, payToken, priceWei, fromWallet) {
    if (!connectedAddress) throw new Error('Wallet not connected');

    return ensureBase().then(function () {
      var useSA = (fromWallet === 'sa') && hasSmartAccount();
      var isNative = !payToken || payToken === ZERO_ADDRESS;
      var subIface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
      // V3 subscribePlan(uint8 planId, bytes args). The `args` slot is an
      // ABI-encoded subscription metadata CID (best effort) or 0x. We pass 0x
      // here because PC2 wallets don't have a configured uploader at this
      // call site; the off-chain indexer will fall back to plan metadata.
      var subData = subIface.encodeFunctionData('subscribePlan', [planId, '0x']);
      var subTx = {
        to: channelAddr,
        data: subData,
        value: isNative ? ('0x' + ethers.getBigInt(priceWei).toString(16)) : '0x0'
      };

      if (useSA) {
        var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
        if (isNative) {
          return parentExecuteSmartAccountBatch(chainIdDecimal, [subTx], []);
        }
        var saAddr = smartAccountAddress;
        var erc20Iface = new ethers.Interface(ERC20_ABI);

        return subIface.encodeFunctionData('paymentProcessor', [])
          ? getProvider().request({
              method: 'eth_call',
              params: [{ to: channelAddr, data: subIface.encodeFunctionData('paymentProcessor', []) }, 'latest']
            }).then(function (r) {
              var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address'], r);
              return decoded[0] || channelAddr;
            }).catch(function () { return channelAddr; })
          : Promise.resolve(channelAddr)
        .then(function (operator) {
          var allowanceData = erc20Iface.encodeFunctionData('allowance', [saAddr, operator]);
          return getProvider().request({
            method: 'eth_call',
            params: [{ to: payToken, data: allowanceData }, 'latest']
          }).then(function (result) {
            var current = ethers.getBigInt(result);
            var needed = ethers.getBigInt(priceWei);
            var transactions = [];
            if (current < needed) {
              var approveData = erc20Iface.encodeFunctionData('approve', [operator, ethers.MaxUint256]);
              transactions.push({ to: payToken, data: approveData, value: '0x0' });
            }
            transactions.push(subTx);
            var priceNum = Number(ethers.getBigInt(priceWei));
            var isUSDC = payToken.toLowerCase() === USDC_ADDRESS.toLowerCase();
            var expectTokens = isUSDC ? [{ type: 'usdc', amount: (priceNum / 1e6).toString() }] : [];
            return parentExecuteSmartAccountBatch(chainIdDecimal, transactions, expectTokens);
          });
        });
      }

      // EOA path
      if (isNative) {
        return parentSendTransaction(subTx).then(function (hash) {
          return waitForReceipt(hash);
        });
      }

      var ppIface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
      var ppData = ppIface.encodeFunctionData('paymentProcessor', []);
      return getProvider().request({
        method: 'eth_call',
        params: [{ to: channelAddr, data: ppData }, 'latest']
      }).then(function (r) {
        var decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address'], r);
        return decoded[0] || channelAddr;
      }).catch(function () { return channelAddr; })
      .then(function (operator) {
        return approveIfNeeded(payToken, priceWei, operator, connectedAddress);
      }).then(function () {
        return parentSendTransaction(subTx).then(function (hash) {
          return waitForReceipt(hash);
        });
      });
    });
  }

  // ── On-chain plan + token-gate management ──────────────────────────────
  //
  // Channels on Base mainnet expose `bulkUpdatePlans` and
  // `configureTokenOwnershipAccess` directly. The off-chain GraphQL mutations
  // are deprecated by Elacity; only on-chain writes propagate to the
  // subscription/access enforcement contracts. Reference implementation
  // is elacity-web/src/lib/drm/channel/subscription.ts (base-network-updates).
  //
  // Plan ID -> ERC-1155 metadata token ID mapping. The contract reserves the
  // top byte (0xff) and stores the plan id at byte 14 (bits 112..119), then
  // left-pads the result to 32 bytes. Mirrors `_maskU16(id, 32)` from
  // elacity-web's ChannelTraits.
  function maskPlanTokenId(planId) {
    var idNum = Number(planId);
    if (!isFinite(idNum) || idNum <= 0 || idNum > 255) {
      throw new Error('Invalid plan id: ' + planId);
    }
    // (0xff << 120) | (id << 112)
    var topMask = ethers.getBigInt('0xff') << 120n;
    var idShifted = ethers.getBigInt(idNum) << 112n;
    var result = topMask | idShifted;
    return ethers.zeroPadValue(ethers.toBeHex(result), 32);
  }

  // Pin a JSON metadata blob via one canonical endpoint.
  function uploadJsonToIpfs(metadataObj, pc2FetchFn, filename) {
    var fetchFn = pc2FetchFn || fetch;
    var json = JSON.stringify(metadataObj);
    var base64 = (typeof btoa === 'function')
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, 'utf8').toString('base64');
    var dataUrl = 'data:application/json;base64,' + base64;
    var fname = filename || 'plan-metadata.json';

    return fetchFn('/api/storage/ipfs/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: dataUrl, filename: fname, announce: true, replicationScope: 'asset_metadata' })
    })
      .then(function (j) {
        var finalCid = j && j.cid ? j.cid : null;
        if (!finalCid) throw new Error('IPFS upload failed (both local and Elacity gateway)');
        return 'ipfs://' + finalCid;
      });
  }

  // Fetch the channel's on-chain image so newly added plans inherit the
  // channel artwork. Soft-fails so plan adds never block on a flaky gateway.
  function fetchChannelImage(channelAddr) {
    var subIface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
    var data = subIface.encodeFunctionData('tokenURI', [0]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: channelAddr, data: data }, 'latest']
    }).then(function (r) {
      var uri = subIface.decodeFunctionResult('tokenURI', r)[0];
      if (!uri) return null;
      var url = uri.replace(/^ipfs:\/\//, 'https://ipfs.elacity.io/ipfs/');
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 1500);
      return fetch(url, { signal: ctrl.signal }).then(function (resp) {
        clearTimeout(timer);
        return resp.ok ? resp.json() : null;
      }).catch(function () { clearTimeout(timer); return null; });
    }).then(function (meta) {
      return (meta && meta.image) ? meta.image : null;
    }).catch(function () { return null; });
  }

  // Fetch existing plan metadata from tokenURI(maskedPlanId) so UPDATE flows
  // can merge user edits with the previously-stored fields (image, schema,
  // creator) instead of dropping them. Soft-fails to {} on any error.
  function fetchPlanMetadata(channelAddr, planId) {
    var subIface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
    var maskedId;
    try { maskedId = maskPlanTokenId(planId); } catch (_) { return Promise.resolve({}); }
    var data = subIface.encodeFunctionData('tokenURI', [maskedId]);
    return getProvider().request({
      method: 'eth_call',
      params: [{ to: channelAddr, data: data }, 'latest']
    }).then(function (r) {
      var uri = subIface.decodeFunctionResult('tokenURI', r)[0];
      if (!uri) return {};
      var url = uri.replace(/^ipfs:\/\//, 'https://ipfs.elacity.io/ipfs/');
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 1500);
      return fetch(url, { signal: ctrl.signal }).then(function (resp) {
        clearTimeout(timer);
        return resp.ok ? resp.json() : {};
      }).catch(function () { clearTimeout(timer); return {}; });
    }).catch(function () { return {}; });
  }

  // Build the canonical Elacity plan metadata JSON that goes to IPFS.
  // Schema mirrors elacity-web/_issuePlanURI(). Caller may pass channelImage
  // (inherited) and an existingMetadata bag (for UPDATE merges).
  function buildPlanMetadata(opts, signer) {
    var existing = opts.existing || {};
    var meta = {
      version: '1.0',
      schema: 'https://raw.githubusercontent.com/Elacity/wiki/main/metadata/schemas/plan/v1.0/schema.json',
      description: opts.description || '',
      name: opts.label || '',
      properties: { creator: signer || '' },
      attributes: [
        { trait_type: 'Duration', value: (opts.duration ? (opts.duration.value + ' ' + opts.duration.unit) : '') }
      ]
    };
    // For UPDATE, start from existing and override with new fields so we
    // preserve image + extra properties the user/channel set previously.
    var merged = Object.assign({}, existing, meta);
    var inheritedImage = opts.channelImage || existing.image;
    if (inheritedImage) merged.image = inheritedImage;
    return merged;
  }

  // Convert {value, unit} to seconds. Mirrors elacity-web convertDuration().
  // Months default to 30 days, years to 360 days (12*30) so the chain stores
  // a consistent duration even if humans think in calendar months.
  function durationToSeconds(duration) {
    if (!duration || !duration.value) return 0;
    var v = Number(duration.value);
    if (!isFinite(v) || v < 0) return 0;
    switch ((duration.unit || '').toLowerCase()) {
      case 'seconds': return Math.floor(v);
      case 'minutes': return Math.floor(v * 60);
      case 'hours':   return Math.floor(v * 3600);
      case 'days':    return Math.floor(v * 86400);
      case 'weeks':   return Math.floor(v * 604800);
      case 'months':  return Math.floor(v * 2592000);
      case 'years':   return Math.floor(v * 31104000);
      default:        return Math.floor(v * 86400);
    }
  }

  // Build the on-chain bulkUpdatePlans payload from a list of UI actions.
  //   actions: [{ action: 'ADD'|'UPDATE'|'REMOVE', args: { planId?, label, description, duration:{value,unit}, price:string, payToken } }]
  // Returns a Promise<encoded calldata string> ready for `to: channelAddr`.
  function encodeBulkUpdatePlans(channelAddr, actions, opts) {
    opts = opts || {};
    var signerAddr = opts.signerAddress || connectedAddress;
    var pc2FetchFn = opts.pc2Fetch;

    return fetchChannelImage(channelAddr).then(function (channelImage) {
      // Walk each action sequentially so the IPFS pins go up one at a time.
      var promiseChain = Promise.resolve([]);
      actions.forEach(function (action) {
        promiseChain = promiseChain.then(function (acc) {
          return prepareAction(channelAddr, action, channelImage, signerAddr, pc2FetchFn).then(function (encodedTuple) {
            acc.push(encodedTuple);
            return acc;
          });
        });
      });

      return promiseChain.then(function (tuples) {
        var iface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
        return iface.encodeFunctionData('bulkUpdatePlans', [tuples]);
      });
    });
  }

  // Pre-V3 off-chain plan IDs (string-format like "plan_1777921474969") cannot
  // be edited or removed on-chain — they were never minted. Show a clear UX
  // message instead of cryptic encoding failures.
  function isOnChainPlanId(planId) {
    var n = Number(planId);
    return isFinite(n) && Number.isInteger(n) && n > 0 && n <= 255;
  }

  function prepareAction(channelAddr, action, channelImage, signerAddr, pc2FetchFn) {
    var coder = ethers.AbiCoder.defaultAbiCoder();
    var args = action.args || {};

    if (action.action === 'REMOVE') {
      if (!isOnChainPlanId(args.planId)) {
        return Promise.reject(new Error('This plan was created in legacy off-chain storage and cannot be removed on-chain. Reload the channel; the plan should disappear once the on-chain state syncs.'));
      }
      var encoded = coder.encode(['uint8'], [Number(args.planId)]);
      return Promise.resolve([PLAN_ACTION.REMOVE, encoded]);
    }

    if (action.action === 'UPDATE' && !isOnChainPlanId(args.planId)) {
      return Promise.reject(new Error('This plan was created in legacy off-chain storage and cannot be edited on-chain. Use "Add Plan" to create a fresh on-chain plan instead.'));
    }

    var payToken = args.payToken || USDC_ADDRESS;
    var price = args.price;
    var durationSecs = durationToSeconds(args.duration);
    if (!durationSecs) return Promise.reject(new Error('Duration must be > 0'));

    return getTokenDecimals(payToken).then(function (decimals) {
      var priceWei;
      try {
        priceWei = ethers.parseUnits(String(price || '0'), decimals);
      } catch (e) {
        throw new Error('Invalid price: ' + price);
      }
      if (priceWei <= 0n) throw new Error('Price must be > 0');

      // Build + pin metadata. For UPDATE, start from existing tokenURI so we
      // preserve any prior fields the user didn't touch (image, schema, etc).
      var existingMetaPromise = (action.action === 'UPDATE' && isOnChainPlanId(args.planId))
        ? fetchPlanMetadata(channelAddr, args.planId)
        : Promise.resolve({});

      return existingMetaPromise.then(function (existing) {
        var metadata = buildPlanMetadata({
          label: args.label,
          description: args.description,
          duration: args.duration,
          channelImage: channelImage,
          existing: existing
        }, signerAddr);

        return uploadJsonToIpfs(metadata, pc2FetchFn, 'plan-metadata.json');
      }).then(function (planURI) {
        if (action.action === 'ADD') {
          var encodedAdd = coder.encode(
            ['address', 'uint256', 'uint256', 'string'],
            [payToken, priceWei, durationSecs, planURI]
          );
          return [PLAN_ACTION.ADD, encodedAdd];
        }
        var encodedUpd = coder.encode(
          ['uint8', 'address', 'uint256', 'uint256', 'string'],
          [Number(args.planId), payToken, priceWei, durationSecs, planURI]
        );
        return [PLAN_ACTION.UPDATE, encodedUpd];
      });
    });
  }

  // v1.2.7.7 (Bug G2 mirror — parity with elacity-creator/app.js
  // preflightOrSurfaceRevert): MetaMask reports on-chain reverts during gas
  // estimation as a cryptic "Cannot destructure property 'gasLimit' of
  // '(intermediate value)' as it is null" — and worse, on Particle/SA
  // signing flow the user just sees "User denied transaction signature"
  // because the popup never carries the underlying revert reason.
  // Pre-flighting via a direct eth_call against Base public RPC surfaces
  // the actual revert (signature, custom error, or message) BEFORE we ever
  // pop the wallet, so users see "this wallet is not authorized to modify
  // this channel" instead of a JS error or a denied-signature ghost.
  // Known custom errors:
  //   0x4888d31b — Unauthorized(channel, caller). Caller (the SA or EOA
  //               we're sending from) is not the channel admin.
  // Fail-open on RPC transport errors so a flaky public RPC does not
  // block a legitimate tx — the wallet will still validate before signing.
  function preflightOrSurfaceRevert(toAddr, calldata, fromAddr, opName) {
    var rpcUrl = (BASE_CHAIN_CONFIG.rpcUrls && BASE_CHAIN_CONFIG.rpcUrls[0]) || 'https://mainnet.base.org';
    var params = { to: toAddr, data: calldata };
    if (fromAddr) params.from = fromAddr;
    return fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [params, 'latest'] })
    }).then(function (resp) { return resp.json(); }).then(function (json) {
      if (!json || !json.error) return;
      var errData = String(json.error.data || '');
      var errMsg = String(json.error.message || '');
      if (errData.indexOf('0x4888d31b') !== -1 || errMsg.indexOf('0x4888d31b') !== -1) {
        throw new Error('On-chain check failed: this wallet is not authorized to modify this channel. The channel rejected the transaction with Unauthorized(' + toAddr.slice(0, 10) + '…, ' + (fromAddr || '').slice(0, 10) + '…). Switch wallets in Puter to the channel creator before retrying.');
      }
      throw new Error('On-chain pre-flight (' + opName + ') reverted: ' + (errMsg || errData || 'unknown reason'));
    }).catch(function (err) {
      if (err && err.message && err.message.indexOf('On-chain') === 0) throw err;
      console.warn('[Wallet] preflight RPC failed, allowing tx to proceed:', err && err.message);
    });
  }

  // Public wrapper. Sends the bulkUpdatePlans tx via EOA (default) or SA.
  // Returns a Promise resolving to {hash, receipt}.
  //   actions: see encodeBulkUpdatePlans()
  //   opts.fromWallet: 'eoa' | 'sa'
  //   opts.pc2Fetch:   authed fetch wrapper for IPFS pinning
  function bulkUpdatePlans(channelAddr, actions, opts) {
    if (!connectedAddress) return Promise.reject(new Error('Wallet not connected'));
    if (!Array.isArray(actions) || actions.length === 0) {
      return Promise.reject(new Error('No plan actions to apply'));
    }
    opts = opts || {};
    var useSA = (opts.fromWallet === 'sa') && hasSmartAccount();
    var fromAddr = useSA ? smartAccountAddress : connectedAddress;

    return ensureBase()
      .then(function () { return encodeBulkUpdatePlans(channelAddr, actions, opts); })
      .then(function (data) {
        return preflightOrSurfaceRevert(channelAddr, data, fromAddr, 'bulkUpdatePlans')
          .then(function () { return data; });
      })
      .then(function (data) {
        var tx = { to: channelAddr, data: data, value: '0x0' };
        if (useSA) {
          var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
          return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
        }
        return parentSendTransaction(tx).then(function (hash) {
          return waitForReceipt(hash).then(function (receipt) {
            return { hash: hash, receipt: receipt };
          });
        });
      });
  }

  // Public wrapper for token-gate writes. Mirrors elacity-web's
  // configureTokenAccess(). Threshold values are ALREADY in base units (the
  // caller is expected to multiply by 10^decimals).
  //   thresholds: [{ tokenAddress, threshold: <bigint|string|number in base units> }]
  function configureTokenAccess(channelAddr, thresholds, opts) {
    if (!connectedAddress) return Promise.reject(new Error('Wallet not connected'));
    if (!Array.isArray(thresholds)) {
      return Promise.reject(new Error('thresholds must be an array'));
    }
    opts = opts || {};
    var useSA = (opts.fromWallet === 'sa') && hasSmartAccount();
    var fromAddr = useSA ? smartAccountAddress : connectedAddress;

    return ensureBase().then(function () {
      var iface = new ethers.Interface(SUBSCRIPTION_MODULE_ABI);
      var input = thresholds.map(function (t) {
        if (!t || !ethers.isAddress(t.tokenAddress)) {
          throw new Error('Invalid token address in threshold list');
        }
        var th = t.threshold === undefined || t.threshold === null
          ? 0n
          : ethers.getBigInt(typeof t.threshold === 'string' ? t.threshold : String(t.threshold));
        return [t.tokenAddress, th];
      });
      var data = iface.encodeFunctionData('configureTokenOwnershipAccess', [input]);
      return preflightOrSurfaceRevert(channelAddr, data, fromAddr, 'configureTokenOwnershipAccess')
        .then(function () {
          var tx = { to: channelAddr, data: data, value: '0x0' };
          if (useSA) {
            var chainIdDecimal = currentChainId ? parseInt(currentChainId, 16) : 8453;
            return parentExecuteSmartAccountBatch(chainIdDecimal, [tx], []);
          }
          return parentSendTransaction(tx).then(function (hash) {
            return waitForReceipt(hash).then(function (receipt) {
              return { hash: hash, receipt: receipt };
            });
          });
        });
    });
  }

  function checkSubscription(channelAddr, subscriberAddr) {
    // V3 hasActiveSubscription exists but requires subscriptionManager to be set.
    // For now we return false since the subscription manager isn't deployed yet.
    return Promise.resolve(false);
  }

  return {
    connect: connect,
    getAddress: getAddress,
    getSignerAddress: getSignerAddress,
    getSmartAccountAddress: getSmartAccountAddress,
    hasSmartAccount: hasSmartAccount,
    isConnected: isConnected,
    getChainId: getChainId,
    isOnBase: isOnBase,
    switchToBase: switchToBase,
    siweLogin: siweLogin,
    signMessage: signMessage,
    buyAccess: buyAccess,
    buyAccessWithEOA: buyAccessWithEOA,
    waitForReceipt: waitForReceipt,
    setupListeners: setupListeners,
    getOperativeOpType: getOperativeOpType,
    getOperativeResellerCut: getOperativeResellerCut,
    getAccessTokenBalance: getAccessTokenBalance,
    getRoyaltyShareBalance: getRoyaltyShareBalance,
    getPendingRewards: getPendingRewards,
    checkTradeAccess: checkTradeAccess,
    resellAccessToken: resellAccessToken,
    cancelAccessListing: cancelAccessListing,
    getAccessSellers: getAccessSellers,
    getAccessListing: getAccessListing,
    listRoyaltyShares: listRoyaltyShares,
    buyRoyaltyShares: buyRoyaltyShares,
    cancelRoyaltyListing: cancelRoyaltyListing,
    transferRoyaltyShares: transferRoyaltyShares,
    withdrawRewards: withdrawRewards,
    batchWithdrawRewards: batchWithdrawRewards,
    getRoyaltySellers: getRoyaltySellers,
    getRoyaltyListing: getRoyaltyListing,
    createRoyaltyOffer: createRoyaltyOffer,
    acceptRoyaltyOffer: acceptRoyaltyOffer,
    cancelRoyaltyOffer: cancelRoyaltyOffer,
    getActiveOffer: getActiveOffer,
    checkTradeAccess: checkTradeAccess,
    getDistributionBalance: getDistributionBalance,
    transferNFT: transferNFT,
    getPlans: getPlans,
    bulkUpdatePlans: bulkUpdatePlans,
    configureTokenAccess: configureTokenAccess,
    subscribeChannel: subscribeChannel,
    checkSubscription: checkSubscription,
    getERC20Balance: getERC20Balance,
    getNativeBalance: getNativeBalance,
    getTokenDecimals: getTokenDecimals,
    introspectToken: introspectToken,
    BASE_CHAIN_ID: BASE_CHAIN_ID,
    AUTHORITY_GATEWAY_ADDRESS: AUTHORITY_GATEWAY_ADDRESS,
    TRADE_GATEWAY_ADDRESS: TRADE_GATEWAY_ADDRESS,
    USDC_ADDRESS: USDC_ADDRESS,
    TOKEN_ID_ACCESS: TOKEN_ID_ACCESS,
    TOKEN_ID_ROYALTY_SHARE: TOKEN_ID_ROYALTY_SHARE,
    TOKEN_ID_DISTRIBUTION: TOKEN_ID_DISTRIBUTION,
    getProvider: getProvider
  };
})();
