/**
 * PC2 Wallet Bridge — Parent-side handler
 *
 * Listens for wallet RPC requests from child apps via:
 *   1. postMessage (iframe apps)
 *   2. BroadcastChannel (popup windows with COOP that severs opener)
 *
 * Forwards requests to the real wallet provider (Particle Auth / window.ethereum).
 *
 * ⚠️  CRITICAL: This is the SOLE handler for pc2-wallet-rpc messages.
 *    IPC.js must NOT also handle these messages, or every wallet call
 *    (signatures, transactions, chain switches) will be sent to MetaMask
 *    TWICE, causing duplicate confirmation popups ("1 of 2").
 *    See IPC.js lines ~131-141 where these messages are explicitly ignored.
 */
(function () {
  'use strict';

  if (window.__pc2WalletBridgeInstalled) return;
  window.__pc2WalletBridgeInstalled = true;

  var bc = null;
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel('pc2-wallet-bridge');
  }

  var EXTERNAL_WALLET_METHODS = ['metamask', 'walletconnect', 'coinbase'];

  // Wallet RPC methods requiring wallet:sign capability (write operations)
  var SIGN_METHODS = [
    'eth_sendTransaction', 'eth_signTransaction', 'eth_sign',
    'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'
  ];

  // Known app origins — populated by registered/installed apps.
  // In v1, all origins are allowed (warn-only). In v2, unregistered origins will be blocked.
  var _knownOrigins = {};

  function classifyRpcMethod(method) {
    if (SIGN_METHODS.indexOf(method) !== -1) return 'wallet:sign';
    if (DIRECT_RPC_METHODS.indexOf(method) !== -1) return 'network:rpc';
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return 'wallet:read';
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return 'network:rpc';
    return 'wallet:read';
  }

  function validateOrigin(origin, method) {
    if (!origin || origin === '*' || origin === 'null') return;
    if (_knownOrigins[origin]) return;
    var capability = classifyRpcMethod(method);
    if (capability === 'wallet:sign') {
      console.warn('[wallet-bridge] ⚠ Signing request from unregistered origin:', origin, 'method:', method);
    }
  }

  // Read-only RPC methods that can go directly to chain RPC
  var DIRECT_RPC_METHODS = [
    'eth_estimateGas', 'eth_call', 'eth_getBalance', 'eth_getCode',
    'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_blockNumber',
    'eth_gasPrice', 'eth_getTransactionReceipt', 'eth_getTransactionByHash',
    'eth_getLogs', 'eth_getBlockByHash', 'net_version'
  ];

  // Multi-chain RPC endpoints — keyed by decimal chain ID
  // Only free, no-auth, CORS-enabled endpoints. Avoid llamarpc (ad-blocked), ankr (needs key).
  var CHAIN_RPC_URLS = {
    20: ['/api/rpc/esc', 'https://api.elastos.io/eth', 'https://api.elastos.io/esc'],
    1: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'],
    56: ['https://bsc-dataseed1.binance.org', 'https://bsc-dataseed2.binance.org', 'https://bsc-rpc.publicnode.com'],
    137: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
    42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
    10: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
    43114: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
    250: ['https://rpc.ftm.tools', 'https://fantom-rpc.publicnode.com'],
    25: ['https://evm.cronos.org'],
    8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']
  };

  // Chain metadata for wallet_addEthereumChain
  var CHAIN_META = {
    20:    { name: 'Elastos Smart Chain', symbol: 'ELA', decimals: 18, explorer: 'https://esc.elastos.io' },
    1:     { name: 'Ethereum', symbol: 'ETH', decimals: 18, explorer: 'https://etherscan.io' },
    56:    { name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18, explorer: 'https://bscscan.com' },
    137:   { name: 'Polygon', symbol: 'MATIC', decimals: 18, explorer: 'https://polygonscan.com' },
    42161: { name: 'Arbitrum One', symbol: 'ETH', decimals: 18, explorer: 'https://arbiscan.io' },
    10:    { name: 'Optimism', symbol: 'ETH', decimals: 18, explorer: 'https://optimistic.etherscan.io' },
    43114: { name: 'Avalanche C-Chain', symbol: 'AVAX', decimals: 18, explorer: 'https://snowtrace.io' },
    250:   { name: 'Fantom', symbol: 'FTM', decimals: 18, explorer: 'https://ftmscan.com' },
    25:    { name: 'Cronos', symbol: 'CRO', decimals: 18, explorer: 'https://cronoscan.com' },
    8453:  { name: 'Base', symbol: 'ETH', decimals: 18, explorer: 'https://basescan.org' }
  };

  // bridgeChainId: controls read-only RPC routing (eth_chainId, eth_blockNumber, etc.)
  // Stays at 20 (ESC) so Glide's main providers remain stable.
  var bridgeChainId = 20;
  // walletChainId: tracks what chain the dApp last requested via wallet_switchEthereumChain.
  // Used by ensureWalletOnChain to switch MetaMask before signing.
  var walletChainId = 20;
  var _highestBlock = {};

  function getRpcUrls(chainId) {
    return CHAIN_RPC_URLS[chainId] || [];
  }

  function buildAddChainParams(chainId) {
    var meta = CHAIN_META[chainId];
    var rpcs = getRpcUrls(chainId);
    if (!meta || rpcs.length === 0) return null;
    var publicRpcs = rpcs.filter(function (u) { return u.indexOf('/') !== 0; });
    return {
      chainId: '0x' + chainId.toString(16),
      chainName: meta.name,
      nativeCurrency: { name: meta.symbol, symbol: meta.symbol, decimals: meta.decimals },
      rpcUrls: publicRpcs.length > 0 ? publicRpcs : rpcs,
      blockExplorerUrls: [meta.explorer]
    };
  }

  function directRpc(method, params, chainOverride) {
    var chain = chainOverride || bridgeChainId;
    var urls = getRpcUrls(chain);
    if (urls.length === 0) {
      return Promise.reject(new Error('No RPC endpoints configured for chain ' + chain));
    }

    var body = JSON.stringify({
      jsonrpc: '2.0', method: method, params: params || [], id: Date.now()
    });

    var urlIndex = 0;

    function tryNext() {
      if (urlIndex >= urls.length) {
        return Promise.reject(new Error('All RPCs failed for ' + method + ' on chain ' + chain));
      }
      var url = urls[urlIndex++];
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (json) {
        if (json.error) {
          var err = new Error(json.error.message || 'RPC error');
          err.code = json.error.code || -32603;
          err.data = json.error.data;
          throw err;
        }
        var result = json.result;

        if (method === 'eth_blockNumber' && result && chain === 20) {
          var hb = _highestBlock[chain] || 0;
          var bn = parseInt(result, 16);
          if (bn > hb) {
            _highestBlock[chain] = bn;
          } else if (hb > 0 && bn < hb - 10) {
            if (urlIndex < urls.length) {
              console.warn('[PC2 Bridge] Stale block from', url, '(' + bn + ' vs ' + hb + '), trying next RPC');
              return tryNext();
            }
            result = '0x' + hb.toString(16);
          }
        }

        return result;
      }).catch(function (err) {
        if (err.code && err.code !== -32603) throw err;
        if (urlIndex < urls.length) return tryNext();
        throw err;
      });
    }

    return tryNext();
  }

  function isEmbeddedLogin() {
    var method = (window.user && window.user.login_method)
      || localStorage.getItem('pc2_login_method') || '';
    if (EXTERNAL_WALLET_METHODS.indexOf(method) >= 0) return false;
    return true;
  }

  function isWalletConnectLogin() {
    var method = (window.user && window.user.login_method)
      || localStorage.getItem('pc2_login_method') || '';
    return method === 'walletconnect';
  }

  // True when the bridge should route signing through the wallet iframe
  // (window.pc2RouteRpcToParticle) instead of window.ethereum. Embedded users
  // always need this; WalletConnect users need it too because their connector
  // lives inside the iframe (restored by ConnectKit's reconnectOnMount), not
  // in the parent frame.
  function shouldRouteViaIframe() {
    return isEmbeddedLogin() || isWalletConnectLogin();
  }

  function routeToParticle(data, respond) {
    if (typeof window.pc2RouteRpcToParticle === 'function') {
      window.pc2RouteRpcToParticle(data.method, data.params)
        .then(function (result) {
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method, result: result
          });
        })
        .catch(function (error) {
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method,
            error: { code: error.code || -32603, message: error.message || String(error) }
          });
        });
    } else {
      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method,
        error: { code: 4900, message: 'Embedded wallet not ready' }
      });
    }
  }

  function handleRpc(data, respond) {
    console.log('[PC2 Bridge] handleRpc:', data.method, '| embedded=' + isEmbeddedLogin() + ' | wc=' + isWalletConnectLogin());

    // Secure-view (Option C session-key delegation): per-asset signing handled
    // entirely in the parent frame. Iframes call this method instead of
    // touching the wallet themselves, so the user sees ONE wallet prompt at
    // session start (handled by pc2-secure-view.js) and ZERO prompts per
    // asset open.
    if (data.method === 'pc2_secureView_sign') {
      var sv = window.pc2SecureView;
      if (!sv || typeof sv.signRequest !== 'function') {
        respond({
          type: 'pc2-wallet-rpc-response',
          id: data.id, method: data.method,
          error: { code: 4900, message: 'Secure-view manager not available' }
        });
        return;
      }
      var arg = (data.params && data.params[0]) || {};
      sv.signRequest({ kid: arg.kid, actionIpfsId: arg.actionIpfsId })
        .then(function (bundle) {
          console.log('[PC2 Bridge] OK pc2_secureView_sign | kid=' + arg.kid + ' | reqId=' + data.id);
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method, result: bundle
          });
        })
        .catch(function (err) {
          console.warn('[PC2 Bridge] pc2_secureView_sign rejected:', err && err.message, '| reqId=' + data.id);
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method,
            error: { code: err.code || -32603, message: err.message || String(err) }
          });
        });
      return;
    }

    if (data.method === 'pc2_getSmartAccountAddress') {
      var sa = (window.user && window.user.smart_account_address) || null;
      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method, result: sa
      });
      return;
    }

    // Fast paths that don't need Particle or RPC at all
    if (data.method === 'eth_accounts' || data.method === 'eth_requestAccounts') {
      var addr = (window.user && window.user.wallet_address) || '';
      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method, result: addr ? [addr] : []
      });
      return;
    }

    if (data.method === 'eth_chainId') {
      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method,
        result: '0x' + bridgeChainId.toString(16)
      });
      return;
    }

    if (data.method === 'wallet_switchEthereumChain' || data.method === 'wallet_addEthereumChain') {
      var requestedHex = data.params && data.params[0] && data.params[0].chainId;
      var requestedId = requestedHex ? parseInt(requestedHex, 16) : bridgeChainId;

      // Update both chain IDs so reads AND signing target the requested chain.
      // V3 contracts live on Base (8453), so eth_call must route there after switch.
      bridgeChainId = requestedId;
      walletChainId = requestedId;
      console.log('[PC2 Bridge] wallet_switchEthereumChain:', requestedId, '(reads + signing now on chain', requestedId + ')');

      // Forward to MetaMask so the actual wallet is on the right chain for signing.
      // Skipped for WalletConnect users — the iframe handler (particle-wallet.eoa-send /
      // particle-wallet.rpc) issues wallet_switchEthereumChain to the WC connector itself
      // before each signing call, so doubling the switch here is unnecessary and can
      // fight with MetaMask if it's also installed.
      if (!isEmbeddedLogin() && !isWalletConnectLogin()) {
        var walletProvider = window.ethereum;
        if (walletProvider && !walletProvider.isPC2WalletBridge) {
          walletProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: requestedHex }] })
            .catch(function (switchErr) {
              if (switchErr.code === 4902 || (switchErr.message && switchErr.message.indexOf('nrecognized') >= 0)) {
                var addParams = buildAddChainParams(requestedId);
                if (addParams) return walletProvider.request({ method: 'wallet_addEthereumChain', params: [addParams] });
              }
            })
            .catch(function () {});
        }
      }

      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method, result: null
      });
      return;
    }

    // Read-only RPC: ALWAYS route directly to chain RPC.
    // These methods don't need signing, so there's no reason to send them
    // through MetaMask (which may be on a different chain) or Particle.
    if (DIRECT_RPC_METHODS.indexOf(data.method) >= 0) {
      console.log('[PC2 Bridge] Direct RPC:', data.method, '(chain=' + bridgeChainId + ', embedded=' + isEmbeddedLogin() + ')');
      directRpc(data.method, data.params)
        .then(function (result) {
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method, result: result
          });
        })
        .catch(function (error) {
          console.warn('[PC2 Bridge] Direct RPC error:', data.method, error.message);
          respond({
            type: 'pc2-wallet-rpc-response',
            id: data.id, method: data.method,
            error: { code: error.code || -32603, message: error.message || String(error) }
          });
        });
      return;
    }

    // Signing and other methods: route to the wallet iframe via WalletService.
    // Embedded users (email/social) → Particle Auth connector inside iframe.
    // WalletConnect users → ConnectKit-restored WC connector inside iframe.
    // Both paths land in particle-wallet.eoa-send / particle-wallet.rpc handlers
    // and use connector.getProvider().request(...) to dispatch.
    if (shouldRouteViaIframe()) {
      routeToParticle(data, respond);
      return;
    }

    var provider = window.ethereum;
    if (!provider || provider.isPC2WalletBridge) {
      respond({
        type: 'pc2-wallet-rpc-response',
        id: data.id, method: data.method,
        error: { code: 4900, message: 'No wallet provider available' }
      });
      return;
    }

    // Chains whose RPC nodes only understand legacy (type-0) transactions.
    // ESC (20) runs an older Geth fork without EIP-1559 support: a type-2
    // envelope causes the node to RLP-fail decode with "expected input list
    // for types.txdata" (-32603). MetaMask can silently up-convert a
    // pre-filled gasPrice into maxFeePerGas/maxPriorityFeePerGas based on
    // its cached per-chain "supports EIP-1559?" flag (populated from the
    // last sampled block). That flag varies by user, which is why ESC swaps
    // (Glide) and ESC NFT mints (Elastos NFT) work for some users and fail
    // with the RLP error for others on the exact same code path.
    // Forcing type:'0x0' and stripping any 1559 fields makes the tx shape
    // unambiguous before MetaMask sees it.
    var LEGACY_ONLY_CHAINS = [20];

    function prefillGasForTx(params) {
      if (!params || !params[0]) return Promise.resolve(params);
      var tx = Object.assign({}, params[0]);
      var tasks = [];

      var txChain = tx.chainId ? parseInt(tx.chainId, 16) : walletChainId;

      if (LEGACY_ONLY_CHAINS.indexOf(txChain) >= 0) {
        tx.type = '0x0';
        delete tx.maxFeePerGas;
        delete tx.maxPriorityFeePerGas;
        delete tx.accessList;
      }

      if (!tx.from) {
        var userAddr = (window.user && window.user.wallet_address) || '';
        if (userAddr) tx.from = userAddr;
      }

      if (!tx.gas && !tx.gasLimit) {
        tasks.push(
          directRpc('eth_estimateGas', [{ from: tx.from, to: tx.to, value: tx.value, data: tx.data }], txChain)
            .then(function (gas) {
              var padded = Math.ceil(parseInt(gas, 16) * 1.2);
              tx.gas = '0x' + padded.toString(16);
              console.log('[PC2 Bridge] Pre-filled gas:', tx.gas, '(estimated:', gas, ', chain:', txChain, ')');
            })
            .catch(function (e) { console.warn('[PC2 Bridge] Gas estimate failed, MetaMask will estimate:', e.message); })
        );
      }

      if (!tx.gasPrice && !tx.maxFeePerGas) {
        tasks.push(
          directRpc('eth_gasPrice', [], txChain)
            .then(function (price) {
              tx.gasPrice = price;
              console.log('[PC2 Bridge] Pre-filled gasPrice:', price, '(chain:', txChain, ', legacy:', LEGACY_ONLY_CHAINS.indexOf(txChain) >= 0, ')');
            })
            .catch(function () {})
        );
      }

      if (!tx.chainId) {
        tx.chainId = '0x' + txChain.toString(16);
      }

      if (tasks.length === 0) return Promise.resolve([tx]);
      return Promise.all(tasks).then(function () { return [tx]; });
    }

    var isTx = data.method === 'eth_sendTransaction' || data.method === 'eth_signTransaction';
    var chainHex = '0x' + bridgeChainId.toString(16);

    function ensureWalletOnChain() {
      var txChainId = (data.params && data.params[0] && data.params[0].chainId)
        ? parseInt(data.params[0].chainId, 16)
        : walletChainId;
      var txChainHex = '0x' + txChainId.toString(16);
      var addParams = buildAddChainParams(txChainId);
      return provider.request({ method: 'eth_chainId' }).then(function (current) {
        var currentId = parseInt(current, 16);
        console.log('[PC2 Bridge] Wallet on chain', currentId, '| tx needs', txChainId);
        if (currentId === txChainId) return;
        return provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: txChainHex }]
        }).catch(function (switchErr) {
          if (switchErr.code === 4902 || (switchErr.message && switchErr.message.indexOf('nrecognized') >= 0)) {
            if (addParams) return provider.request({ method: 'wallet_addEthereumChain', params: [addParams] });
          }
          throw switchErr;
        }).then(function () {
          console.log('[PC2 Bridge] Wallet switched to chain', txChainId, 'for signing');
        });
      }).catch(function (err) {
        console.warn('[PC2 Bridge] Chain ensure failed:', err.message, '- proceeding anyway');
      });
    }

    function ensureCorrectAccount(params) {
      if (!isTx || !params || !params[0] || !params[0].from) return Promise.resolve();
      var expectedFrom = params[0].from.toLowerCase();
      return provider.request({ method: 'eth_accounts' }).then(function (accounts) {
        var selected = (accounts && accounts[0]) ? accounts[0].toLowerCase() : '';
        if (selected && selected !== expectedFrom) {
          var short = expectedFrom.substring(0, 6) + '...' + expectedFrom.slice(-4);
          console.warn('[PC2 Bridge] MetaMask account mismatch — selected:', selected, 'expected:', expectedFrom);
          return provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
            .then(function () {
              return provider.request({ method: 'eth_accounts' });
            })
            .then(function (newAccounts) {
              var newSelected = (newAccounts && newAccounts[0]) ? newAccounts[0].toLowerCase() : '';
              if (newSelected !== expectedFrom) {
                throw new Error('Wrong MetaMask account selected. Please switch to ' + short + ' in MetaMask and try again.');
              }
              console.log('[PC2 Bridge] Account switched to', short);
            });
        }
      }).catch(function (err) {
        if (err.message && err.message.indexOf('Wrong MetaMask account') >= 0) throw err;
        console.warn('[PC2 Bridge] Account check failed (non-fatal):', err.message);
      });
    }

    var prepare = isTx
      ? ensureWalletOnChain().then(function () { return prefillGasForTx(data.params); })
      : Promise.resolve(data.params);

    prepare.then(function (finalParams) {
      return ensureCorrectAccount(finalParams).then(function () {
        return provider.request({ method: data.method, params: finalParams });
      });
    })
      .then(function (result) {
        respond({
          type: 'pc2-wallet-rpc-response',
          id: data.id, method: data.method, result: result
        });
      })
      .catch(function (error) {
        respond({
          type: 'pc2-wallet-rpc-response',
          id: data.id, method: data.method,
          error: { code: error.code || -32603, message: error.message || String(error) }
        });
      });
  }

  function handleReady(respond) {
    var smartAccountAddress = (window.user && window.user.smart_account_address) || null;

    // Embedded users have no parent-frame provider; report the stored wallet address.
    // WalletConnect users likewise — the WC provider lives inside the iframe; reading
    // window.ethereum here would return MetaMask's address, which is wrong.
    if (shouldRouteViaIframe()) {
      var addr = (window.user && window.user.wallet_address) || '';
      respond({
        type: 'pc2-wallet-init',
        accounts: addr ? [addr] : [],
        chainId: '0x' + bridgeChainId.toString(16),
        smartAccountAddress: smartAccountAddress
      });
      return;
    }

    var provider = window.ethereum;
    if (!provider || provider.isPC2WalletBridge) return;

    var accounts = [];

    provider.request({ method: 'eth_accounts' })
      .then(function (accts) { accounts = accts || []; })
      .catch(function () {})
      .finally(function () {
        respond({
          type: 'pc2-wallet-init',
          accounts: accounts,
          chainId: '0x' + bridgeChainId.toString(16),
          smartAccountAddress: smartAccountAddress
        });
      });
  }

  // Handle postMessage from iframes
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    var source = event.source;
    var origin = event.origin === 'null' ? '*' : event.origin;

    function respondPostMessage(msg) {
      if (source) source.postMessage(msg, origin);
    }

    if (data.type === 'pc2-wallet-rpc' && data.id && data.method) {
      validateOrigin(origin, data.method);
      handleRpc(data, respondPostMessage);
    }
    if (data.type === 'pc2-wallet-ready') {
      handleReady(respondPostMessage);
    }
  });

  // Handle BroadcastChannel from popup windows
  if (bc) {
    bc.onmessage = function (event) {
      var data = event.data;
      if (!data || typeof data !== 'object') return;

      function respondBroadcast(msg) {
        bc.postMessage(msg);
      }

      if (data.type === 'pc2-wallet-rpc' && data.id && data.method) {
        handleRpc(data, respondBroadcast);
      }
      if (data.type === 'pc2-wallet-ready') {
        handleReady(respondBroadcast);
      }
    };
  }

  console.log('[PC2] Wallet bridge handler installed (parent-side, postMessage + BroadcastChannel)');
})();
