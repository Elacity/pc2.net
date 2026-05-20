/**
 * Elacity Market Browser — Main application controller.
 * Pipeline-style sidebar UI with feed, search, library, and detail views.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 20;

  var PC2_AUTH_TOKEN = (function () {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('puter.auth.token') || params.get('auth_token') || params.get('token') || '';
    } catch (e) { return ''; }
  })();

  function pc2Fetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (PC2_AUTH_TOKEN && !opts.headers['Authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + PC2_AUTH_TOKEN;
    }
    if (!opts.credentials) opts.credentials = 'include';
    return fetch(url, opts);
  }

  // ── State ────────────────────────────────────────────

  var state = {
    activeView: 'feed',
    previousView: 'feed',
    activeCategory: 'all',
    searchQuery: '',
    browseItems: [],
    browseTotal: 0,
    browseOffset: 0,
    browseLoading: false,
    assetsItems: [],
    assetsTotal: 0,
    assetsOffset: 0,
    assetsLoading: false,
    searchItems: [],
    searchTotal: 0,
    searchOffset: 0,
    searchLoading: false,
    detailItem: null,
    purchasing: false,
    searchTimeout: null,
    channelData: null,
    channelItems: [],
    channelSubscribers: null,
    channelLoading: false,
    subscribedChannels: [],
    subscriptionsLoading: false,
    detailContractAddress: null,
    detailTokenId: null,
    detailSaved: false,
    detailLikes: null,
    watchLaterPlaylistId: null,
    watchLaterItems: [],
    watchLaterLoading: false,
    activeContentType: 'all',
    searchContentType: 'all',
    channelsDirData: [],
    channelsDirLoaded: false,
    channelsDirViewMode: 'grid',
    channelsDirCategory: 'all',
    selectedPlan: null,
    viewedAssets: {},
    initializing: true,
    libraryFilter: 'all',
    pinnedCIDs: null,
    showAdultContent: false
  };

  // ── DOM References ───────────────────────────────────

  var dom = {};

  function cacheDom() {
    dom.sidebarNav = document.getElementById('sidebar-nav');
    dom.walletBtn = document.getElementById('wallet-btn');
    dom.networkBadge = document.getElementById('network-badge');

    dom.viewFeed = document.getElementById('view-feed');
    dom.viewSearch = document.getElementById('view-search');
    dom.viewLibrary = document.getElementById('view-library');
    dom.viewSubscriptions = document.getElementById('view-subscriptions');
    dom.viewWatchlater = document.getElementById('view-watchlater');
    dom.viewDetail = document.getElementById('view-detail');
    dom.viewEarnings = document.getElementById('view-earnings');
    dom.detailSupplyInfo = document.getElementById('detail-supply-info');
    dom.earningsAuthPrompt = document.getElementById('earnings-auth-prompt');
    dom.earningsSummary = document.getElementById('earnings-summary');
    dom.earningsTotalAmount = document.getElementById('earnings-total-amount');
    dom.earningsTotalEarned = document.getElementById('earnings-total-earned');
    dom.earningsActiveCount = document.getElementById('earnings-active-count');
    dom.earningsWithdrawAllBtn = document.getElementById('earnings-withdraw-all-btn');
    dom.earningsTabs = document.getElementById('earnings-tabs');
    dom.earningsList = document.getElementById('earnings-list');
    dom.earningsLoading = document.getElementById('earnings-loading');
    dom.earningsEmpty = document.getElementById('earnings-empty');

    dom.feedFilterChips = document.getElementById('feed-filter-chips');
    dom.nftGrid = document.getElementById('nft-grid');
    dom.browseLoading = document.getElementById('browse-loading');
    dom.browseEmpty = document.getElementById('browse-empty');
    dom.feedSentinel = document.getElementById('feed-sentinel');

    dom.searchInput = document.getElementById('search-input');
    dom.searchClearBtn = document.getElementById('search-clear-btn');
    dom.searchRecent = document.getElementById('search-recent');
    dom.searchRecentList = document.getElementById('search-recent-list');
    dom.searchResultsCount = document.getElementById('search-results-count');
    dom.searchTypeChips = document.getElementById('search-type-chips');
    dom.searchGrid = document.getElementById('search-grid');
    dom.searchLoading = document.getElementById('search-loading');
    dom.searchEmpty = document.getElementById('search-empty');

    dom.authPrompt = document.getElementById('auth-prompt');
    dom.authBtn = document.getElementById('auth-btn');
    dom.assetsGrid = document.getElementById('assets-grid');
    dom.assetsLoading = document.getElementById('assets-loading');
    dom.assetsEmpty = document.getElementById('assets-empty');

    dom.viewChannel = document.getElementById('view-channel');
    dom.channelBackBtn = document.getElementById('channel-back-btn');
    dom.channelCover = document.getElementById('channel-cover');
    dom.channelAvatarLg = document.getElementById('channel-avatar-lg');
    dom.channelPageName = document.getElementById('channel-page-name');
    dom.channelPageStats = document.getElementById('channel-page-stats');
    dom.channelDescription = document.getElementById('channel-description');
    dom.subscribeBtn = document.getElementById('subscribe-btn');
    dom.channelItemsGrid = document.getElementById('channel-items-grid');
    dom.channelItemsLoading = document.getElementById('channel-items-loading');
    dom.channelItemsEmpty = document.getElementById('channel-items-empty');

    dom.viewChannels = document.getElementById('view-channels');
    dom.channelsViewToggle = document.getElementById('channels-view-toggle');
    dom.channelCategoryTabs = document.getElementById('channel-category-tabs');
    dom.channelsDirGrid = document.getElementById('channels-dir-grid');
    dom.channelsDirList = document.getElementById('channels-dir-list');
    dom.channelsDirLoading = document.getElementById('channels-dir-loading');
    dom.channelsDirEmpty = document.getElementById('channels-dir-empty');

    dom.subsGrid = document.getElementById('subs-grid');
    dom.subsLoading = document.getElementById('subs-loading');
    dom.subsEmpty = document.getElementById('subs-empty');

    dom.watchlaterGrid = document.getElementById('watchlater-grid');
    dom.watchlaterLoading = document.getElementById('watchlater-loading');
    dom.watchlaterEmpty = document.getElementById('watchlater-empty');

    dom.detailBackBtn = document.getElementById('detail-back-btn');
    dom.detailImage = document.getElementById('detail-image');
    dom.detailTitle = document.getElementById('detail-title');
    dom.detailCreator = document.getElementById('detail-creator');
    dom.detailDate = document.getElementById('detail-date');
    dom.detailViews = document.getElementById('detail-views');
    dom.detailDescription = document.getElementById('detail-description');
    dom.detailPriceSection = document.getElementById('detail-price-section');
    dom.detailPrice = document.getElementById('detail-price');
    dom.detailOwned = document.getElementById('detail-owned');
    dom.detailBalanceInfo = document.getElementById('detail-balance-info');
    dom.buyBtn = document.getElementById('buy-btn');
    dom.playOwnedBtn = document.getElementById('play-owned-btn');
    dom.detailAttributes = document.getElementById('detail-attributes');
    dom.previewBtn = document.getElementById('preview-btn');
    dom.detailMedia = document.getElementById('detail-media');
    dom.previewPlayer = document.getElementById('detail-preview-player');
    dom.saveBtn = document.getElementById('save-btn');
    dom.saveLabel = document.getElementById('save-label');
    dom.likeBtn = document.getElementById('like-btn');
    dom.likeCount = document.getElementById('like-count');
    dom.purchaseStatus = document.getElementById('purchase-status');
    dom.downloadNodeBtn = document.getElementById('download-node-btn');
    dom.openViewerBtn = document.getElementById('open-viewer-btn');
    dom.downloadStatus = document.getElementById('download-status');
    dom.shareBtn = document.getElementById('share-btn');
    dom.detailLoading = document.getElementById('detail-loading');
    dom.detailLoaded = document.getElementById('detail-loaded');
    dom.detailImagePlaceholder = document.getElementById('detail-image-placeholder');
    dom.detailBreadcrumb = document.getElementById('detail-breadcrumb');
    dom.detailBalanceInline = document.getElementById('detail-balance-inline');
    dom.toastContainer = document.getElementById('toast-container');
    dom.themeToggle = document.getElementById('theme-toggle');

    dom.detailOwnerActions = document.getElementById('detail-owner-actions');
    dom.resellBtn = document.getElementById('resell-btn');
    dom.transferBtn = document.getElementById('transfer-btn');
    dom.detailRoyaltyInfo = document.getElementById('detail-royalty-info');

    dom.resellModal = document.getElementById('resell-modal');
    dom.resellModalTitle = document.getElementById('resell-modal-title');
    dom.resellPrice = document.getElementById('resell-price');
    dom.resellQuantity = document.getElementById('resell-quantity');
    dom.resellAssetName = document.getElementById('resell-asset-name');
    dom.resellWalletPicker = document.getElementById('resell-wallet-picker');
    dom.resellRoyaltyNote = document.getElementById('resell-royalty-note');
    dom.resellStatus = document.getElementById('resell-status');
    dom.resellConfirmBtn = document.getElementById('resell-confirm-btn');
    dom.resellCancelBtn = document.getElementById('resell-cancel-btn');
    dom.resellModalClose = document.getElementById('resell-modal-close');

    dom.transferModal = document.getElementById('transfer-modal');
    dom.transferRecipient = document.getElementById('transfer-recipient');
    dom.transferAssetName = document.getElementById('transfer-asset-name');
    dom.transferStatus = document.getElementById('transfer-status');
    dom.transferConfirmBtn = document.getElementById('transfer-confirm-btn');
    dom.transferCancelBtn = document.getElementById('transfer-cancel-btn');
    dom.transferModalClose = document.getElementById('transfer-modal-close');

    dom.detailGovernance = document.getElementById('detail-governance');
    dom.govBalance = document.getElementById('governance-balance');
    dom.govRewards = document.getElementById('governance-rewards');
    dom.govWithdrawBtn = document.getElementById('gov-withdraw-btn');
    dom.govListBtn = document.getElementById('gov-list-btn');
    dom.govTransferBtn = document.getElementById('gov-transfer-btn');

    dom.govListModal = document.getElementById('gov-list-modal');
    dom.govListAssetName = document.getElementById('gov-list-asset-name');
    dom.govListBalanceInfo = document.getElementById('gov-list-balance-info');
    dom.govListAmount = document.getElementById('gov-list-amount');
    dom.govListPrice = document.getElementById('gov-list-price');
    dom.govListStatus = document.getElementById('gov-list-status');
    dom.govListConfirmBtn = document.getElementById('gov-list-confirm-btn');
    dom.govListCancelBtn = document.getElementById('gov-list-cancel-btn');
    dom.govListModalClose = document.getElementById('gov-list-modal-close');

    dom.govTransferModal = document.getElementById('gov-transfer-modal');
    dom.govTransferAssetName = document.getElementById('gov-transfer-asset-name');
    dom.govTransferBalanceInfo = document.getElementById('gov-transfer-balance-info');
    dom.govTransferAmount = document.getElementById('gov-transfer-amount');
    dom.govTransferRecipient = document.getElementById('gov-transfer-recipient');
    dom.govTransferStatus = document.getElementById('gov-transfer-status');
    dom.govTransferConfirmBtn = document.getElementById('gov-transfer-confirm-btn');
    dom.govTransferCancelBtn = document.getElementById('gov-transfer-cancel-btn');
    dom.govTransferModalClose = document.getElementById('gov-transfer-modal-close');
  }

  // ── Helpers ──────────────────────────────────────────

  var USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

  function getTokenSymbol(payToken) {
    if (!payToken) return 'ETH';
    if (payToken.toLowerCase() === USDC_ADDRESS) return 'USDC';
    return 'ETH';
  }

  function formatPrice(price, paymentToken) {
    if (!price && price !== 0) return '';
    var num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '';
    var symbol = getTokenSymbol(paymentToken);
    if (num === 0) return '$0.00';
    var formatted;
    if (num < 0.001) {
      formatted = num.toFixed(6).replace(/0+$/, '');
    } else if (num < 0.01) {
      formatted = num.toFixed(4);
    } else {
      formatted = num.toFixed(2);
    }
    return formatted + ' ' + symbol;
  }

  function formatAddress(addr) {
    if (!addr) return '';
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
  }

  function getCreatorName(item) {
    if (item.channel && item.channel.creator) {
      var c = item.channel.creator;
      if (c.did && c.did.credentials && c.did.credentials.name) return c.did.credentials.name;
      if (c.alias) return c.alias;
      return formatAddress(c.address);
    }
    if (item.owner) {
      var o = item.owner;
      if (o.did && o.did.credentials && o.did.credentials.name) return o.did.credentials.name;
      if (o.alias) return o.alias;
      return formatAddress(o.address);
    }
    return 'Unknown';
  }

  function getCreatorAvatar(item) {
    var creator = (item.channel && item.channel.creator) || item.owner;
    if (creator) {
      var didThumb = creator.did && creator.did.credentials && creator.did.credentials.avatar && creator.did.credentials.avatar.thumbnail;
      if (didThumb && resolveIpfsUrl(didThumb)) return didThumb;
      if (creator.avatar && resolveIpfsUrl(creator.avatar)) return creator.avatar;
    }
    if (item.channel) {
      if (item.channel.image && resolveIpfsUrl(item.channel.image)) return item.channel.image;
      if (item.channel.imageURL && resolveIpfsUrl(item.channel.imageURL)) return item.channel.imageURL;
    }
    return null;
  }

  function renderAvatar(imageUrl, name, sizeClass) {
    var initial = (name || '?').charAt(0).toUpperCase();
    var resolved = resolveIpfsUrl(imageUrl || '', true) || resolveIpfsUrl(imageUrl || '');
    if (resolved) {
      return '<img src="' + escapeHtml(resolved) + '" alt=""' +
        (sizeClass ? ' class="' + sizeClass + '"' : '') +
        ' onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + initial + '\'" />';
    }
    return initial;
  }

  function getContentType(item) {
    if (item.metadata && item.metadata.media && item.metadata.media.contentType) {
      var ct = item.metadata.media.contentType;
      if (ct.indexOf('video') !== -1) return 'Video';
      if (ct.indexOf('audio') !== -1) return 'Audio';
      if (ct.indexOf('image') !== -1) return 'Image';
      if (ct === 'application/epub+zip' || ct === 'application/epub') return 'Ebook';
      if (ct === 'application/vnd.comicbook+zip' || ct === 'application/x-cbz') return 'Comic';
      return ct.split('/')[0];
    }
    if (item.category) return item.category;
    return null;
  }

  function hasAITrainingPermitted(item) {
    var attrs = (item.metadata && item.metadata.attributes) || [];
    for (var i = 0; i < attrs.length; i++) {
      if (attrs[i].trait_type === 'AI Training' && attrs[i].value === 'Allowed') return true;
    }
    if (item._rawMeta && item._rawMeta.licensing && item._rawMeta.licensing.aiTraining) {
      return !!item._rawMeta.licensing.aiTraining.permitted;
    }
    return false;
  }

  function isAdultContent(item) {
    var attrs = (item.metadata && item.metadata.attributes) || [];
    for (var i = 0; i < attrs.length; i++) {
      if (attrs[i].trait_type === 'Adult Content' && attrs[i].value === '18+') return true;
    }
    if (item._rawMeta && item._rawMeta.adult) return true;
    if (item.metadata && item.metadata.adult) return true;
    return false;
  }

  function isAISkillAsset(item) {
    var attrs = (item.metadata && item.metadata.attributes) || [];
    for (var i = 0; i < attrs.length; i++) {
      if (attrs[i].trait_type === 'Content Type' && attrs[i].value === 'AI Agent Skill') return true;
    }
    return false;
  }

  function isNonMediaAsset(nft) {
    var meta = nft.metadata || {};
    var media = meta.media || {};
    var asset = meta.asset || {};
    var ct = (media.contentType || media.mimeType || '').toLowerCase();
    var duration = media.duration || nft.duration || 0;

    if (ct.indexOf('video') !== -1 || ct.indexOf('audio') !== -1) return false;
    if (asset.assetType === 'video' || asset.assetType === 'audio') return false;
    if (duration > 0 && !asset.encrypted) return false;

    var attrs = meta.attributes || [];
    for (var i = 0; i < attrs.length; i++) {
      var t = (attrs[i].trait_type || '').toLowerCase();
      var v = (String(attrs[i].value || '')).toLowerCase();
      if (t === 'type' && (v === 'video' || v === 'audio')) return false;
      if (t === 'content_type' && (v.indexOf('video') !== -1 || v.indexOf('audio') !== -1)) return false;
    }

    if (meta.schema === 'elacity-asset-envelope-v1') return true;
    if (asset.encrypted) return true;

    return ct.indexOf('video') === -1 && ct.indexOf('audio') === -1;
  }

  function normalizeProtectionTypes(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (v) { return typeof v === 'string' ? v.trim() : ''; })
        .filter(function (v) { return v.length > 0; });
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }

  function firstProtectionEntry(asset) {
    if (asset && Array.isArray(asset.protections) && asset.protections.length > 0) {
      return asset.protections[0] || {};
    }
    return {};
  }

  function resolveAssetProtectionField(asset, fieldName, fallbackValue) {
    var fromProtection = firstProtectionEntry(asset)[fieldName];
    if (fromProtection !== undefined && fromProtection !== null && fromProtection !== '') return fromProtection;
    if (asset && asset[fieldName] !== undefined && asset[fieldName] !== null && asset[fieldName] !== '') return asset[fieldName];
    return fallbackValue;
  }

  function isProtectedByMetadata(asset, media) {
    var mediaProtectionTypes = normalizeProtectionTypes(media && media.protectionType);
    var hasMediaProtection = mediaProtectionTypes.some(function (t) { return t.toLowerCase() !== 'none'; });
    var hasAssetProtection = Array.isArray(asset && asset.protections) && asset.protections.some(function (p) {
      return normalizeProtectionTypes(p && p.protectionType).some(function (t) { return t.toLowerCase() !== 'none'; });
    });
    return !!(asset && asset.encrypted) || hasMediaProtection || hasAssetProtection;
  }

  var IPFS_GATEWAY = 'https://ipfs.ela.city/ipfs/';
  var IPFS_LOCAL_GATEWAY = (window.puter_api_origin || window.location.origin) + '/ipfs/';

  function resolveIpfsUrl(url, useLocal) {
    if (!url) return '';
    var gw = useLocal ? IPFS_LOCAL_GATEWAY : IPFS_GATEWAY;
    if (url.startsWith('ipfs://')) return gw + url.slice(7);
    if (url.startsWith('thumbnail:')) return '';
    if (url.match(/^Qm[1-9A-HJ-NP-Za-km-z]{44}/)) return gw + url;
    if (url.match(/^bafy[a-z2-7]{55}/i)) return gw + url;
    return url;
  }

  function getImageUrl(item) {
    if (item.imageURL) return resolveIpfsUrl(item.imageURL);
    if (item.thumbnailPath) return resolveIpfsUrl(item.thumbnailPath);
    if (item.image) return resolveIpfsUrl(item.image);
    return '';
  }

  function normalizeLedgerAsset(asset) {
    if (asset.contractAddress) return asset;
    var tid = asset.tokenId || {};
    var listing = (asset.operative && asset.operative.access &&
      asset.operative.access.listings && asset.operative.access.listings[0]) || null;
    var rawPrice = listing ? listing.price : null;
    var payToken = listing ? listing.payToken : null;
    var decimals = getTokenSymbol(payToken) === 'USDC' ? 6 : 18;
    var displayPrice = rawPrice != null ? rawPrice / Math.pow(10, decimals) : null;
    return Object.assign({}, asset, {
      contractAddress: asset.address || (asset.channel && asset.channel.address) || '',
      hexTokenID: tid.hexTokenID || '',
      tokenID: tid.tokenID != null ? tid.tokenID : 0,
      price: displayPrice,
      paymentToken: payToken
    });
  }

  function getListing(item) {
    if (!item.operative || !item.operative.access || !item.operative.access.listings) return null;
    var listings = item.operative.access.listings;
    if (listings.length === 0) return null;
    return listings[0];
  }

  function isAssetInLibrary(nft) {
    var addr = nft.contractAddress || '';
    var tid = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '';
    return state.assetsItems.some(function (a) {
      var aAddr = a.contractAddress || '';
      var aTid = a.hexTokenID || a.tokenID || '';
      return aAddr.toLowerCase() === addr.toLowerCase() && aTid === tid;
    });
  }

  function getAssetOwnerWallet(nft) {
    var addr = (nft.contractAddress || '').toLowerCase();
    var tid = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '';
    for (var i = 0; i < state.assetsItems.length; i++) {
      var a = state.assetsItems[i];
      if ((a.contractAddress || '').toLowerCase() === addr &&
          (a.hexTokenID || a.tokenID || '') === tid) {
        return a._ownerWallet || null;
      }
    }
    return null;
  }

  function getBuyerAddressForAsset(nft) {
    var wallet = getAssetOwnerWallet(nft);
    if (wallet === 'eoa') return Wallet.getAddress();
    if (wallet === 'sa' || wallet === 'both') return Wallet.getSignerAddress();
    return Wallet.getSignerAddress();
  }

  function escapeHtml(text) {
    if (!text) return '';
    var el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  // Human-readable byte size. Accepts Number or numeric String.
  function formatSizeBytes(n) {
    var num = typeof n === 'number' ? n : parseFloat(n);
    if (!isFinite(num) || num < 0) return '';
    if (num >= 1073741824) return (num / 1073741824).toFixed(2) + ' GB';
    if (num >= 1048576) return (num / 1048576).toFixed(1) + ' MB';
    if (num >= 1024) return (num / 1024).toFixed(1) + ' KB';
    return Math.round(num) + ' B';
  }

  // Render NFT attribute values with trait-type-aware formatting so
  // raw byte counts (Size / Content Size / File Size) and object
  // blobs don't show up as "202881178" or "[object Object]".
  function formatAttrValue(traitType, rawValue) {
    var t = String(traitType || '').toLowerCase().replace(/[-_\s]/g, '');
    var isSize = t === 'size' || t === 'contentsize' || t === 'filesize' || t === 'bytes';
    if (isSize) {
      var human = formatSizeBytes(rawValue);
      if (human) return human;
    }
    if (rawValue && typeof rawValue === 'object') {
      try { return JSON.stringify(rawValue); } catch (e) { return ''; }
    }
    return String(rawValue == null ? '' : rawValue);
  }

  function formatViews(views) {
    if (!views) return '';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
    return views.toLocaleString() + ' views';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return 'Uploaded ' + d.toISOString().split('T')[0];
  }

  function getChannelName(item) {
    if (item.channel && item.channel.name) return item.channel.name;
    return getCreatorName(item);
  }

  // Channel-info cache for card-grid enrichment. The catalog row that backs a
  // card sometimes lacks channel.name / channel.image (channel not yet locally
  // indexed). The detail page already enriches via ElacityAPI.retrieveChannel
  // (backend-first GraphQL with local fallback); this exposes the same
  // resolver to renderCard, deduplicated per channel address so 20 cards from
  // one channel issue exactly one network request.
  var channelInfoCache = {};
  function resolveChannelInfo(channelAddress) {
    if (!channelAddress) return Promise.resolve(null);
    var key = channelAddress.toLowerCase();
    if (channelInfoCache[key]) return channelInfoCache[key];
    channelInfoCache[key] = ElacityAPI.retrieveChannel(channelAddress)
      .catch(function () { return null; });
    return channelInfoCache[key];
  }

  // ── Theme ────────────────────────────────────────────

  var THEME_KEY = 'elacity-theme';

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function toggleTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(THEME_KEY, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_KEY, 'dark');
    }
  }

  // ── Toast ────────────────────────────────────────────

  function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  }

  // ── View Routing ─────────────────────────────────────

  var VIEW_MAP = {
    feed: 'viewFeed',
    search: 'viewSearch',
    library: 'viewLibrary',
    channels: 'viewChannels',
    subscriptions: 'viewSubscriptions',
    watchlater: 'viewWatchlater',
    detail: 'viewDetail',
    channel: 'viewChannel',
    earnings: 'viewEarnings'
  };

  function switchView(viewName) {
    var isSlideView = (viewName === 'detail' || viewName === 'channel');
    if (!isSlideView) {
      state.previousView = viewName;
    }
    state.activeView = viewName;

    var sidebarView = viewName === 'channel' ? null : viewName;
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.view === sidebarView);
    });

    Object.keys(VIEW_MAP).forEach(function (key) {
      var el = dom[VIEW_MAP[key]];
      if (!el) return;
      var isTarget = (key === viewName);
      el.classList.remove('view-enter', 'view-slide-in', 'view-slide-out');
      if (isTarget) {
        el.classList.remove('hidden');
        el.classList.add('active');
        el.classList.add(isSlideView ? 'view-slide-in' : 'view-enter');
      } else {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });

    if (feedObserver) feedObserver.disconnect();

    if (viewName === 'library') renderMyAssetsView();
    if (viewName === 'search') {
      dom.searchInput.focus();
      showRecentSearches();
    }
    if (viewName === 'channels') loadChannelsDirectory();
    if (viewName === 'subscriptions') renderSubscriptionsView();
    if (viewName === 'watchlater') loadWatchLater();
    if (viewName === 'feed') setupFeedObserver();
    if (viewName === 'earnings') {
      if (window.ElaMarket && window.ElaMarket.loadEarningsView) {
        window.ElaMarket.loadEarningsView();
      } else {
        loadEarningsView();
      }
    }
  }

  // ── Video Card Rendering ─────────────────────────────

  var CONTENT_TYPE_ICONS = {
    video: '▶',
    audio: '♫',
    image: '◻',
    ebook: '📖',
    comic: '💥',
    'ai-model': '🤖',
    dataset: '📊',
    code: '⟨⟩'
  };

  function renderCard(item, isOwned, cardIndex) {
    var card = document.createElement('div');
    card.className = 'video-card card-appear';
    card.setAttribute('role', 'article');
    card.dataset.contractAddress = item.contractAddress;
    card.dataset.tokenId = item.hexTokenID || item.tokenID;
    if (typeof cardIndex === 'number') {
      card.style.animationDelay = (cardIndex * 40) + 'ms';
    }

    var itemRef = { contractAddress: item.contractAddress, tokenId: item.hexTokenID || item.tokenID };
    if (!isOwned && state.assetsItems.length > 0 && isAssetInLibrary(itemRef)) {
      isOwned = true;
    }
    if (!isOwned && item.access && item.access.haveAccess) isOwned = true;

    var imageUrl = getImageUrl(item);
    var title = escapeHtml(item.name || 'Untitled');
    var channelName = escapeHtml(getChannelName(item));
    var creatorName = escapeHtml(getCreatorName(item));
    var contentType = getContentType(item);
    var price = formatPrice(item.price, item.paymentToken);
    var views = item.views ? formatViews(item.views) : '';
    var avatarContent = renderAvatar(getCreatorAvatar(item), creatorName);
    var hasChannel = item.channel && item.channel.address;

    // opType 0 = Free, 1 = Buy Once, 2 = Buy & Resell. The on-chain truth is
    // resolved by the api.js adapter (preferring item.op_type from the indexer
    // over legacy metadata.pricing inference). For paid assets where the
    // catalog row hasn't yet captured a listing price, fall back to a tier
    // label ("Buy Once" / "Buy & Resell") so the card never misrepresents a
    // paid asset as free.
    var rawOpType = item.operative && item.operative.opType;
    var cardOpType = (typeof rawOpType === 'number') ? rawOpType : null;
    var isFreeItem = cardOpType === 0;
    var tierLabel = cardOpType === 1 ? 'Buy Once' : cardOpType === 2 ? 'Buy & Resell' : '';

    var ariaSuffix = '';
    if (isOwned) ariaSuffix = ' (Owned)';
    else if (price) ariaSuffix = ' — ' + price;
    else if (isFreeItem) ariaSuffix = ' — Free';
    else if (tierLabel) ariaSuffix = ' — ' + tierLabel;
    card.setAttribute('aria-label', title + ariaSuffix);

    var contentBadge = contentType ? '<span class="content-badge">' + escapeHtml(contentType) + '</span>' : '';
    var priceBadge = '';
    if (isOwned) {
      priceBadge = '<span class="price-badge owned-badge">\u2713 Owned</span>';
    } else if (price) {
      priceBadge = '<span class="price-badge">' + price + '</span>';
    } else if (isFreeItem) {
      priceBadge = '<span class="price-badge free-badge">Free</span>';
    } else if (tierLabel) {
      priceBadge = '<span class="price-badge tier-badge">' + tierLabel + '</span>';
    }
    var aiBadge = hasAITrainingPermitted(item) ? '<span class="ai-training-badge" title="AI training permitted">AI</span>' : '';
    var adultBadge = isAdultContent(item) ? '<span class="adult-content-badge" title="Adult content (18+)">18+</span>' : '';

    var thumbContent = imageUrl
      ? '<img src="' + escapeHtml(imageUrl) + '" alt="' + title + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling&&this.nextElementSibling.classList.remove(\'hidden\')" />' +
        '<div class="thumb-placeholder hidden">' + (CONTENT_TYPE_ICONS[contentType] || '◻') + '</div>'
      : '<div class="thumb-placeholder">' + (CONTENT_TYPE_ICONS[contentType] || '◻') + '</div>';

    card.innerHTML =
      '<div class="video-card-thumb">' +
        thumbContent +
        contentBadge +
        priceBadge +
        aiBadge +
        adultBadge +
      '</div>' +
      '<div class="video-card-info">' +
        '<div class="video-card-avatar">' + avatarContent + '</div>' +
        '<div class="video-card-text">' +
          '<div class="video-card-title">' + title + '</div>' +
          '<div class="video-card-channel' + (hasChannel ? ' clickable' : '') + '">' + channelName + '</div>' +
          (views ? '<div class="video-card-stats"><span>' + views + '</span></div>' : '') +
        '</div>' +
      '</div>';

    card.addEventListener('click', function (e) {
      if (e.target.closest('.video-card-channel.clickable')) {
        e.stopPropagation();
        openChannel(item.channel.address);
        return;
      }
      openDetail(item.contractAddress, item.hexTokenID || item.tokenID, isOwned);
    });

    // Enrich the card from the canonical channel record when the catalog row
    // didn't include the channel's display name and/or image. This runs the
    // same backend lookup that the detail and channel pages use, so a card
    // for "OpenTech" no longer falls back to a truncated 0x.. wallet address
    // and a single-letter avatar when the local catalog has only the address.
    var channelAddr = item.channel && item.channel.address;
    var rowMissingName = !item.channel || !item.channel.name;
    var rowMissingImage = !item.channel || (!item.channel.image && !item.channel.imageURL);
    if (channelAddr && (rowMissingName || rowMissingImage)) {
      resolveChannelInfo(channelAddr).then(function (ch) {
        if (!ch) return;
        var resolvedName = ch.name || '';
        if (resolvedName && rowMissingName) {
          var nameEl = card.querySelector('.video-card-channel');
          if (nameEl && !nameEl.dataset.enriched) {
            nameEl.textContent = resolvedName;
            nameEl.dataset.enriched = '1';
          }
        }
        var avatarEl = card.querySelector('.video-card-avatar');
        if (avatarEl && !avatarEl.dataset.enriched) {
          // Two-step avatar update: show the (correct) initial letter
          // immediately so the slot is never empty, then upgrade to the
          // channel image only if it actually loads. The previous
          // innerHTML+inline-onerror approach left the slot blank during
          // the loading window and silently lost the fallback letter when
          // the image 404'd, leaving an empty grey circle.
          if (resolvedName && rowMissingName) {
            avatarEl.textContent = resolvedName.charAt(0).toUpperCase();
          }
          // Use getOwnerAvatar -- the same resolver the channels directory
          // uses successfully. It tries (in order): creator.did avatar →
          // creator.avatar → ch.image → ch.imageURL, and validates each
          // via resolveIpfsUrl before returning. Returns a fully-resolved
          // URL or empty string, so we don't have to redo the gateway dance.
          var imgUrl = rowMissingImage ? getOwnerAvatar(ch) : '';
          if (imgUrl) {
            var img = document.createElement('img');
            img.alt = '';
            img.onload = function () {
              if (avatarEl.dataset.enriched === '1') return;
              avatarEl.innerHTML = '';
              avatarEl.appendChild(img);
              avatarEl.dataset.enriched = '1';
            };
            img.onerror = function () { /* keep the initial-letter fallback */ };
            img.src = imgUrl;
          } else if (resolvedName && rowMissingName) {
            avatarEl.dataset.enriched = '1';
          }
        }
      });
    }

    return card;
  }

  // ── Feed (Browse) ───────────────────────────────────

  var feedObserver = null;

  function renderSkeletons(container, count) {
    for (var i = 0; i < count; i++) {
      var sk = document.createElement('div');
      sk.className = 'skeleton-card';
      sk.innerHTML = '<div class="skeleton-thumb"></div><div class="skeleton-text"></div><div class="skeleton-text-short"></div>';
      container.appendChild(sk);
    }
  }

  function removeSkeletons(container) {
    var skeletons = container.querySelectorAll('.skeleton-card');
    skeletons.forEach(function (s) { s.remove(); });
  }

  function setupFeedObserver() {
    if (feedObserver) feedObserver.disconnect();
    if (!dom.feedSentinel) return;
    feedObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !state.browseLoading && state.browseOffset < state.browseTotal) {
        loadBrowse(true);
      }
    }, { rootMargin: '200px' });
    feedObserver.observe(dom.feedSentinel);
  }

  function loadBrowse(append) {
    if (state.browseLoading) return;
    state.browseLoading = true;

    if (!append) {
      state.browseOffset = 0;
      state.browseItems = [];
      dom.nftGrid.innerHTML = '';
    }

    dom.browseEmpty.classList.add('hidden');
    renderSkeletons(dom.nftGrid, append ? 4 : 8);

    var preset = ElacityAPI.PRESETS[state.activeCategory];
    var args = preset(state.browseOffset, PAGE_SIZE);
    var query = args[0];
    var filters = args[1];

    if (state.activeContentType !== 'all') {
      query.contentType = [state.activeContentType];
    }

    ElacityAPI.fetchItems(query, filters)
      .then(function (result) {
        state.browseLoading = false;
        removeSkeletons(dom.nftGrid);

        if (!result || !result.data) {
          if (!append) dom.browseEmpty.classList.remove('hidden');
          return;
        }

        state.browseTotal = result.total;
        var validItems = (result.data || []).filter(function (item) { return item !== null; });
        if (state.showAdultContent) {
          validItems = validItems.filter(function (item) { return isAdultContent(item); });
        } else {
          validItems = validItems.filter(function (item) { return !isAdultContent(item); });
        }
        state.browseItems = state.browseItems.concat(validItems);
        state.browseOffset += result.data ? result.data.length : 0;
        var baseIndex = state.browseItems.length - validItems.length;

        // Mark the feed exhausted when the server returns an empty page.
        // Without this, narrow filters (e.g. content-type "3d" with few
        // matches) leave `browseOffset < browseTotal` true forever, and the
        // IntersectionObserver re-fires every time it's recreated -- causing
        // a perceptible skeleton/refresh flicker on the 3D tab.
        if (!result.data || result.data.length === 0) {
          state.browseTotal = state.browseOffset;
        }

        validItems.forEach(function (item, idx) {
          dom.nftGrid.appendChild(renderCard(item, false, baseIndex + idx));
        });

        if (state.browseItems.length === 0) {
          dom.browseEmpty.classList.remove('hidden');
        }

        setupFeedObserver();
      })
      .catch(function (err) {
        state.browseLoading = false;
        removeSkeletons(dom.nftGrid);
        dom.browseLoading.classList.add('hidden');
        showToast('Failed to load: ' + err.message, 'error');
      });
  }

  // ── Search ──────────────────────────────────────────

  function getRecentSearches() {
    try { return JSON.parse(localStorage.getItem('ela_recent_searches') || '[]'); } catch (e) { return []; }
  }

  function saveRecentSearch(q) {
    if (!q) return;
    var recent = getRecentSearches().filter(function (s) { return s !== q; });
    recent.unshift(q);
    if (recent.length > 8) recent = recent.slice(0, 8);
    try { localStorage.setItem('ela_recent_searches', JSON.stringify(recent)); } catch (e) { /* noop */ }
  }

  function showRecentSearches() {
    var recent = getRecentSearches();
    if (recent.length === 0 || state.searchQuery) {
      dom.searchRecent.classList.add('hidden');
      return;
    }
    dom.searchRecent.classList.remove('hidden');
    dom.searchRecentList.innerHTML = '';
    recent.forEach(function (term) {
      var btn = document.createElement('button');
      btn.className = 'search-recent-item';
      btn.textContent = term;
      btn.addEventListener('click', function () {
        dom.searchInput.value = term;
        dom.searchClearBtn.classList.remove('hidden');
        state.searchQuery = term;
        dom.searchRecent.classList.add('hidden');
        loadSearch();
      });
      dom.searchRecentList.appendChild(btn);
    });
  }

  function loadSearch() {
    var q = state.searchQuery;
    if (!q) {
      dom.searchGrid.innerHTML = '';
      dom.searchEmpty.classList.add('hidden');
      dom.searchResultsCount.classList.add('hidden');
      return;
    }

    state.searchLoading = true;
    dom.searchEmpty.classList.add('hidden');
    dom.searchResultsCount.classList.add('hidden');
    dom.searchGrid.innerHTML = '';
    renderSkeletons(dom.searchGrid, 6);

    var searchQuery = { type: 'single' };
    if (state.searchContentType !== 'all') {
      searchQuery.contentType = [state.searchContentType];
    }

    ElacityAPI.fetchItems(
      searchQuery,
      { offset: 0, limit: PAGE_SIZE, sort: { createdAt: -1 }, searchBy: q }
    )
      .then(function (result) {
        state.searchLoading = false;
        removeSkeletons(dom.searchGrid);

        saveRecentSearch(q);

        if (!result || !result.data || result.data.length === 0) {
          dom.searchEmpty.classList.remove('hidden');
          dom.searchResultsCount.textContent = 'No results for "' + q + '"';
          dom.searchResultsCount.classList.remove('hidden');
          return;
        }

        var searchItems = result.data.filter(function (item) {
          if (!item) return false;
          return state.showAdultContent ? isAdultContent(item) : !isAdultContent(item);
        });
        state.searchItems = searchItems;
        dom.searchResultsCount.textContent = searchItems.length + (result.total > searchItems.length ? ' of ' + result.total : '') + ' result' + (searchItems.length !== 1 ? 's' : '');
        dom.searchResultsCount.classList.remove('hidden');

        if (searchItems.length === 0) {
          dom.searchEmpty.classList.remove('hidden');
          return;
        }

        searchItems.forEach(function (item, idx) {
          dom.searchGrid.appendChild(renderCard(item, false, idx));
        });
      })
      .catch(function (err) {
        state.searchLoading = false;
        removeSkeletons(dom.searchGrid);
        showToast('Search failed: ' + err.message, 'error');
      });
  }

  // ── My Library ──────────────────────────────────────

  function renderMyAssetsView() {
    var libraryControls = document.getElementById('library-controls');
    if (!Wallet.isConnected()) {
      dom.authPrompt.classList.remove('hidden');
      dom.assetsGrid.classList.add('hidden');
      dom.assetsEmpty.classList.add('hidden');
      if (libraryControls) { libraryControls.classList.add('hidden'); libraryControls.style.display = 'none'; }
      return;
    }

    if (!ElacityAPI.isAuthenticated()) {
      console.log('[Library] Not authenticated, starting SIWE login...');
      console.log('[Library] connectedAddress:', Wallet.getAddress(), 'smartAccount:', Wallet.getSignerAddress());
      dom.authPrompt.classList.add('hidden');
      dom.assetsGrid.classList.add('hidden');
      dom.assetsEmpty.classList.add('hidden');
      dom.assetsLoading.classList.remove('hidden');

      Wallet.siweLogin()
        .then(function () {
          console.log('[Library] SIWE login succeeded, signer:', ElacityAPI.getSignerAddress());
          dom.assetsLoading.classList.add('hidden');
          renderMyAssetsView();
        })
        .catch(function (err) {
          console.error('[Library] SIWE login failed:', err);
          dom.assetsLoading.classList.add('hidden');
          dom.authPrompt.classList.remove('hidden');
          showToast('Library login failed: ' + (err.message || 'signature rejected'), 'error');
        });
      return;
    }

    dom.authPrompt.classList.add('hidden');
    dom.assetsGrid.classList.remove('hidden');
    if (libraryControls) { libraryControls.classList.remove('hidden'); libraryControls.style.display = 'flex'; }

    if (state.assetsItems.length === 0 && !state.assetsLoading) {
      loadMyAssets();
    }
  }

  function refreshLibrary() {
    state.assetsItems = [];
    state.pinnedCIDs = null;
    state.assetsLoading = false;
    loadMyAssets();
  }

  function fetchPinnedCIDs() {
    return pc2Fetch('/api/storage/ipfs/pins')
      .then(function (res) { return res.ok ? res.json() : { cids: [] }; })
      .then(function (data) {
        state.pinnedCIDs = new Set(data.cids || []);
        return state.pinnedCIDs;
      })
      .catch(function () { state.pinnedCIDs = new Set(); return state.pinnedCIDs; });
  }

  function getAssetCID(item) {
    var meta = item.metadata || {};
    var asset = item._rawAsset || meta.asset || {};
    var media = meta.media || {};
    var cid = asset.cid || asset.uri || media.uri || '';
    return cid.replace('ipfs://', '').split('/')[0];
  }

  function applyLibraryFilter() {
    var filter = state.libraryFilter;
    dom.assetsGrid.innerHTML = '';
    if (!state.assetsItems || state.assetsItems.length === 0) {
      dom.assetsEmpty.classList.remove('hidden');
      return;
    }

    var pinSet = state.pinnedCIDs || new Set();
    var filtered = state.assetsItems;
    if (filter === 'downloaded') {
      filtered = state.assetsItems.filter(function (item) { return pinSet.has(getAssetCID(item)); });
    } else if (filter === 'not-downloaded') {
      filtered = state.assetsItems.filter(function (item) { return !pinSet.has(getAssetCID(item)); });
    }

    if (filtered.length === 0) {
      dom.assetsEmpty.classList.remove('hidden');
      dom.assetsEmpty.querySelector('h3').textContent = filter === 'downloaded' ? 'No downloaded items' : filter === 'not-downloaded' ? 'All items downloaded' : 'No items';
      return;
    }
    dom.assetsEmpty.classList.add('hidden');
    filtered.forEach(function (item, idx) {
      dom.assetsGrid.appendChild(renderCard(item, true, idx));
    });
  }

  function loadMyAssets() {
    var eoaAddr = Wallet.getAddress();
    var saAddr = Wallet.getSignerAddress();
    if (state.assetsLoading || !eoaAddr) return;
    state.assetsLoading = true;

    dom.assetsEmpty.classList.add('hidden');
    dom.assetsGrid.innerHTML = '';
    renderSkeletons(dom.assetsGrid, 6);

    var hasSeparateSA = saAddr && eoaAddr.toLowerCase() !== saAddr.toLowerCase();
    console.log('[Library] Loading assets — EOA:', eoaAddr, 'SA:', saAddr, 'dual:', hasSeparateSA);

    var fetches = [ElacityAPI.fetchAccessibleAssetsForAddress(saAddr || eoaAddr, 0, PAGE_SIZE)];
    if (hasSeparateSA) {
      fetches.push(ElacityAPI.fetchAccessibleAssetsForAddress(eoaAddr, 0, PAGE_SIZE));
    }

    Promise.all(fetches)
      .then(function (results) {
        state.assetsLoading = false;
        removeSkeletons(dom.assetsGrid);

        var saItems = (results[0] && results[0].data) || [];
        var eoaItems = hasSeparateSA ? ((results[1] && results[1].data) || []) : [];

        saItems.forEach(function (item) { item._ownerWallet = 'sa'; });
        eoaItems.forEach(function (item) { item._ownerWallet = 'eoa'; });

        var seen = {};
        var merged = [];
        saItems.concat(eoaItems).forEach(function (item) {
          var key = (item.contractAddress || '') + ':' + (item.hexTokenID || item.tokenID || '');
          if (seen[key]) {
            seen[key]._ownerWallet = 'both';
          } else {
            seen[key] = item;
            merged.push(item);
          }
        });

        if (merged.length === 0) {
          dom.assetsEmpty.classList.remove('hidden');
          return;
        }

        state.assetsItems = merged;

        fetchPinnedCIDs().then(function () {
          applyLibraryFilter();
        });
      })
      .catch(function (err) {
        state.assetsLoading = false;
        removeSkeletons(dom.assetsGrid);
        dom.assetsEmpty.classList.remove('hidden');
        showToast('Failed to load library: ' + err.message, 'error');
      });
  }

  // ── Detail View ─────────────────────────────────────

  function openDetail(contractAddress, tokenId, isOwned) {
    if (contractAddress && typeof contractAddress === 'object') {
      var obj = contractAddress;
      contractAddress = obj.contractAddress || obj.address || '';
      tokenId = obj.hexTokenID || obj.tokenID || tokenId;
      isOwned = obj.isOwned || isOwned;
    }
    switchView('detail');

    state.detailContractAddress = contractAddress;
    state.detailTokenId = tokenId;
    state.detailIsOwned = !!isOwned;
    state.detailSaved = false;
    state.detailLikes = null;

    dom.detailLoading.classList.remove('hidden');
    dom.detailLoaded.classList.add('hidden');

    dom.previewPlayer.innerHTML = '';
    dom.previewPlayer.classList.add('hidden');
    dom.detailImage.style.display = '';
    dom.detailImage.src = '';
    dom.detailImage.style.objectFit = '';
    dom.detailImage.style.height = '';
    dom.detailImagePlaceholder.classList.add('hidden');
    dom.detailImagePlaceholder.textContent = '';
    dom.previewBtn.classList.add('hidden');
    var mediaEl = document.getElementById('detail-media');
    if (mediaEl) { mediaEl.style.aspectRatio = ''; mediaEl.style.maxHeight = ''; mediaEl.style.overflowY = ''; }
    var pdfContainer = document.getElementById('pdf-pages-container');
    if (pdfContainer) pdfContainer.remove();
    dom.detailTitle.textContent = '';
    dom.detailCreator.innerHTML = '';
    dom.detailDate.textContent = '';
    dom.detailViews.textContent = '';
    dom.detailDescription.textContent = '';
    dom.detailPriceSection.classList.add('hidden');
    setBuyButtonState('idle');
    dom.buyBtn.classList.add('hidden');
    dom.detailOwned.classList.add('hidden');
    dom.detailBalanceInfo.classList.add('hidden');
    dom.detailBalanceInfo.innerHTML = '';
    dom.detailBalanceInline.textContent = '';
    dom.detailSupplyInfo.innerHTML = '';
    dom.playOwnedBtn.classList.add('hidden');
    dom.detailAttributes.innerHTML = '';
    dom.purchaseStatus.classList.add('hidden');
    dom.downloadNodeBtn.classList.add('hidden');
    // Reset button label/disabled state — otherwise a stuck "Downloading..." /
    // "Retry Download" label leaks between asset views and the user thinks a
    // pin is in progress when no request is actually running.
    var dlSpan = dom.downloadNodeBtn.querySelector('span');
    if (dlSpan) dlSpan.textContent = 'Download to your node';
    dom.downloadNodeBtn.disabled = false;
    dom.openViewerBtn.classList.add('hidden');
    dom.downloadStatus.classList.add('hidden');
    dom.downloadStatus.innerHTML = '';
    dom.detailOwnerActions.classList.add('hidden');
    dom.resellBtn.classList.add('hidden');
    dom.transferBtn.classList.add('hidden');
    dom.detailRoyaltyInfo.classList.add('hidden');
    dom.detailRoyaltyInfo.innerHTML = '';
    var sellersEl = document.getElementById('detail-sellers-list');
    if (sellersEl) { sellersEl.innerHTML = ''; }
    dom.detailGovernance.classList.add('hidden');
    var govSection = document.getElementById('detail-governance-section');
    if (govSection) govSection.classList.add('hidden');
    dom.govBalance.innerHTML = '';
    dom.govRewards.innerHTML = '';
    dom.govWithdrawBtn.classList.add('hidden');
    dom.govListBtn.classList.add('hidden');
    dom.govTransferBtn.classList.add('hidden');
    dom.saveBtn.classList.remove('saved');
    dom.saveLabel.textContent = 'Save';
    dom.likeBtn.classList.remove('liked');
    dom.likeCount.textContent = '';
    dom.detailBreadcrumb.innerHTML = '';

    ElacityAPI.getAssetDetail(contractAddress, tokenId)
      .then(function (nft) {
        if (!nft) {
          showToast('NFT not found', 'error');
          goBack();
          return;
        }

        state.detailItem = nft;

        var tokenURI = nft.tokenURI || '';
        var needsRawMeta = isNonMediaAsset(nft) && tokenURI;
        if (needsRawMeta) {
          fetchRawMetadataLocalFirst(tokenURI)
            .then(function (rawMeta) {
              if (rawMeta && rawMeta.asset) {
                nft._rawAsset = rawMeta.asset;
                nft._rawMedia = rawMeta.media;
              }
            })
            .catch(function () {})
            .finally(function () {
              showDetailContent(nft);
            });
        } else {
          showDetailContent(nft);
        }

        loadDetailInteractions(contractAddress, tokenId);

        var viewKey = contractAddress + ':' + tokenId;
        if (!state.viewedAssets[viewKey]) {
          state.viewedAssets[viewKey] = true;
          ElacityAPI.incrementViews(contractAddress, tokenId, Wallet.getSignerAddress());
        }
      })
      .catch(function (err) {
        showToast('Failed to load details: ' + err.message, 'error');
        goBack();
      });
  }

  function showDetailContent(nft) {
    dom.detailLoading.classList.add('hidden');
    dom.detailLoaded.classList.remove('hidden');
    renderDetail(nft);
  }

  function renderDetail(nft) {
    var meta = nft.metadata || {};
    var media = meta.media || {};
    var channel = nft.channel || {};
    var creator = channel.creator || {};

    var imageUrl = getImageUrl(nft) || resolveIpfsUrl(media.previewURL || '');
    var contentType = getContentType(nft);
    var contentTypeKey = contentType ? contentType.toLowerCase() : '';
    dom.detailImage.src = imageUrl;
    dom.detailImage.alt = nft.name || '';
    dom.detailImage.onerror = function () {
      this.style.display = 'none';
      dom.detailImagePlaceholder.textContent = CONTENT_TYPE_ICONS[contentTypeKey] || '\u25FB';
      dom.detailImagePlaceholder.classList.remove('hidden');
    };
    if (imageUrl) {
      dom.detailImage.style.display = '';
      dom.detailImagePlaceholder.classList.add('hidden');
    } else {
      dom.detailImage.style.display = 'none';
      dom.detailImagePlaceholder.textContent = CONTENT_TYPE_ICONS[contentTypeKey] || '\u25FB';
      dom.detailImagePlaceholder.classList.remove('hidden');
    }

    if (channel && channel.address) {
      var channelLabel = escapeHtml(channel.name || formatAddress(channel.address));
      dom.detailBreadcrumb.innerHTML = '<a onclick="ElaMarket.openChannel(\'' + escapeHtml(channel.address) + '\')">' + channelLabel + '</a>';
    }

    dom.detailTitle.textContent = meta.name || nft.name || 'Untitled';

    var creatorName = (creator.did && creator.did.credentials && creator.did.credentials.name) ||
      creator.alias || formatAddress(creator.address || '');
    var rawChannelImg = channel.imageURL || channel.image || '';
    var channelImg = resolveIpfsUrl(rawChannelImg, true) || resolveIpfsUrl(rawChannelImg);
    var creatorAvatar = channelImg || resolveIpfsUrl(
      (creator.did && creator.did.credentials && creator.did.credentials.avatar && creator.did.credentials.avatar.thumbnail) ||
      creator.avatar || '');

    var hasChannelLink = channel && channel.address;
    var displayName = channel.name || creatorName || 'Unknown';
    var showCreatorSub = channel.name && creatorName && channel.name !== creatorName;

    dom.detailCreator.innerHTML =
      '<div class="channel-avatar">' +
        renderAvatar(creatorAvatar, displayName) +
      '</div>' +
      '<div class="channel-info">' +
        '<div class="channel-name">' + escapeHtml(displayName) + '</div>' +
        (showCreatorSub ? '<div class="channel-subs">' + escapeHtml(creatorName) + '</div>' : '') +
        (channel.itemsCount ? '<div class="channel-subs">' + channel.itemsCount + ' items</div>' : '') +
      '</div>';

    if (hasChannelLink) {
      dom.detailCreator.classList.add('clickable');
      dom.detailCreator.onclick = function () {
        openChannel(channel.address);
      };
    } else {
      dom.detailCreator.classList.remove('clickable');
      dom.detailCreator.onclick = null;
    }

    dom.detailDate.textContent = formatDate(nft.createdAt);
    dom.detailViews.textContent = nft.views ? formatViews(nft.views) : '';

    dom.detailDescription.textContent = meta.description || '';

    var previewUrl = media.previewURL ? resolveIpfsUrl(media.previewURL) : '';
    if (previewUrl) {
      dom.previewBtn.classList.remove('hidden');
    }

    var listing = getListing(nft);
    var hasListing = listing && listing.price;
    var apiSaysOwned = nft.access && nft.access.haveAccess;
    var isOwned = state.detailIsOwned || isAssetInLibrary(nft) || apiSaysOwned;

    if (hasListing) {
      dom.detailPriceSection.classList.remove('hidden');
      var decimals = getTokenSymbol(listing.payToken) === 'USDC' ? 6 : 18;
      var displayPrice = listing.price / Math.pow(10, decimals);
      dom.detailPrice.textContent = formatPrice(displayPrice, listing.payToken);
      if (isOwned) {
        dom.buyBtn.classList.add('hidden');
        dom.detailOwned.classList.remove('hidden');
      } else {
        dom.buyBtn.classList.remove('hidden');
      }
    }

    var rawAsset = nft._rawAsset || (nft.metadata && nft.metadata.asset) || {};
    var cid = media.uri || rawAsset.uri || rawAsset.cid;
    if (cid) cid = cid.replace('ipfs://', '');
    var nonMedia = isNonMediaAsset(nft);
    var opType = (nft.operative && nft.operative.opType) || 0;
    var isFree = opType === 0;

    // Play / download / viewer access:
    // - Owned items: always (paid or free, owner has full access).
    // - Free items (opType === 0): always — content is cleartext on IPFS
    //   and doesn't require an access NFT. The publisher of a free item
    //   may not auto-receive the access NFT and otherwise wouldn't see
    //   any way to play their own asset on the detail page.
    if (isOwned || isFree) {
      if (nonMedia) {
        dom.playOwnedBtn.classList.add('hidden');
        if (cid) {
          dom.openViewerBtn.classList.remove('hidden');
          dom.downloadNodeBtn.classList.remove('hidden');
        }
      } else {
        dom.playOwnedBtn.classList.remove('hidden');
        if (cid) dom.downloadNodeBtn.classList.remove('hidden');
      }
    }

    if (isOwned) {
      if (!hasListing) dom.detailOwned.classList.remove('hidden');

      var hasActions = false;

      if (opType === 2) {
        dom.resellBtn.classList.remove('hidden');
        hasActions = true;
      }

      var isChannelNFT = nft.variant === 'ERC721' || (!nft.operative);
      if (isChannelNFT) {
        dom.transferBtn.classList.remove('hidden');
        hasActions = true;
      }

      if (hasActions) {
        dom.detailOwnerActions.classList.remove('hidden');
      }
    }

    renderRoyaltyInfo(nft);
    renderSupplyInfo(nft);
    renderOpTypeBadge(nft);
    if (isOwned) {
      renderOwnershipBalances(nft);
    }
    if (nft.operative && nft.operative.address && Wallet.isConnected()) {
      renderGovernanceSection(nft);
    }
    enrichFromChain(nft);

    var attrs = (meta.attributes || []).filter(function (a) {
      return a.trait_type && a.trait_type.indexOf('iscc::') !== 0 && a.trait_type !== 'AI Training';
    });

    var hasAttrs = attrs.length > 0 || media.contentType;
    if (hasAttrs) {
      var attrHtml = '';
      if (media.contentType) {
        attrHtml += '<div class="attribute-chip"><span class="attr-label">Type</span><span class="attr-value">' + escapeHtml(media.contentType) + '</span></div>';
      }
      attrs.forEach(function (attr) {
        attrHtml += '<div class="attribute-chip">' +
          '<span class="attr-label">' + escapeHtml(attr.trait_type || '') + '</span>' +
          '<span class="attr-value">' + escapeHtml(formatAttrValue(attr.trait_type, attr.value)) + '</span>' +
          '</div>';
      });
      dom.detailAttributes.innerHTML = attrHtml;
      dom.detailAttributes.classList.remove('hidden');
    } else {
      dom.detailAttributes.innerHTML = '';
      dom.detailAttributes.classList.add('hidden');
    }

    var aboutSection = document.getElementById('detail-about-section');
    if (aboutSection) {
      var hasAboutContent = (meta.description || '').trim() || hasAttrs;
      if (hasAboutContent) {
        aboutSection.classList.remove('hidden');
      } else {
        aboutSection.classList.add('hidden');
      }
    }

    renderAITrainingBadge(nft);
    renderAdultContentBadge(nft);
    renderInstallSkillButton(nft);

    window.dispatchEvent(new CustomEvent('ela-detail-rendered', { detail: { nft: nft } }));
  }

  var OP_TYPE_LABELS = { 0: 'Free', 1: 'Buy Once', 2: 'Buy & Resell' };

  function renderRoyaltyInfo(nft) {
    var operative = nft.operative || {};
    var resellerCutRaw = operative.resellerCut;
    var opType = operative.opType || 0;
    var resellerPct = resellerCutRaw ? (resellerCutRaw / 10) : 0;

    var html = '<div class="royalty-info-inner">';
    html += '<span class="royalty-info-title">License</span>';
    html += '<span class="royalty-chip optype-chip">' + escapeHtml(OP_TYPE_LABELS[opType] || 'Unknown') + '</span>';
    if (opType === 2 && resellerPct) {
      html += '<span class="royalty-chip reseller-chip">Reseller: ' + escapeHtml(String(resellerPct)) + '%</span>';
    }
    html += '</div>';
    dom.detailRoyaltyInfo.innerHTML = html;
    dom.detailRoyaltyInfo.classList.remove('hidden');
  }

  function renderAITrainingBadge(nft) {
    var el = document.getElementById('detail-ai-training');
    if (!el) return;

    var permitted = hasAITrainingPermitted(nft);

    if (!permitted && nft._rawMeta && nft._rawMeta.licensing && nft._rawMeta.licensing.aiTraining) {
      permitted = !!nft._rawMeta.licensing.aiTraining.permitted;
    }

    if (!permitted) {
      var tokenURI = nft.tokenURI || '';
      if (tokenURI) {
        fetchRawMetadataLocalFirst(tokenURI)
          .then(function (rawMeta) {
            if (rawMeta && rawMeta.licensing && rawMeta.licensing.aiTraining && rawMeta.licensing.aiTraining.permitted) {
              el.innerHTML = buildAITrainingBadgeHtml(rawMeta.licensing);
              el.classList.remove('hidden');
            }
          })
          .catch(function () {});
      }
      el.classList.add('hidden');
      return;
    }

    var licensing = (nft._rawMeta && nft._rawMeta.licensing) || {};
    el.innerHTML = buildAITrainingBadgeHtml(licensing);
    el.classList.remove('hidden');
  }

  function buildAITrainingBadgeHtml(licensing) {
    var ai = (licensing && licensing.aiTraining) || {};
    var scope = ai.scope ? ai.scope.charAt(0).toUpperCase() + ai.scope.slice(1) : 'Commercial';
    var html = '<div class="ai-training-detail">';
    html += '<div class="ai-training-detail-header">';
    html += '<span class="ai-training-detail-icon">✦</span>';
    html += '<span class="ai-training-detail-title">AI Training Allowed</span>';
    html += '</div>';
    html += '<span class="ai-training-detail-scope">' + escapeHtml(scope) + ' use</span>';
    html += '</div>';
    return html;
  }

  function renderAdultContentBadge(nft) {
    var el = document.getElementById('detail-adult-content');
    if (!el) return;

    if (isAdultContent(nft)) {
      var html = '<div class="adult-content-detail">';
      html += '<div class="adult-content-detail-header">';
      html += '<span class="adult-content-detail-icon">⚠</span>';
      html += '<span class="adult-content-detail-title">Adult Content (18+)</span>';
      html += '</div>';
      html += '<span class="adult-content-detail-note">This content has been flagged as adult material</span>';
      html += '</div>';
      el.innerHTML = html;
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
    }
  }

  function renderInstallSkillButton(nft) {
    var el = document.getElementById('detail-install-skill');
    if (!el) return;

    var isOwned = state.detailIsOwned || isAssetInLibrary(nft) || (nft.access && nft.access.haveAccess);

    if (isAISkillAsset(nft) && isOwned) {
      var meta = nft.metadata || {};
      var media = meta.media || {};
      var asset = meta.asset || {};
      var kid = nft.kid || asset.kid || (nft.operative && nft.operative.kid) || '';
      var skillId = (meta.name || nft.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      var html = '<div class="install-skill-section">';
      html += '<div class="install-skill-header">';
      html += '<span class="install-skill-icon">🤖</span>';
      html += '<span class="install-skill-title">AI Agent Skill</span>';
      html += '</div>';
      html += '<p class="install-skill-note">This asset is an AI Agent Skill. Install it to enhance your AI agent\'s capabilities.</p>';
      html += '<button id="install-skill-btn" class="install-skill-btn" '
        + 'data-kid="' + escapeHtml(kid) + '" '
        + 'data-skill-id="' + escapeHtml(skillId) + '"'
        + '>Install Skill</button>';
      html += '</div>';

      el.innerHTML = html;
      el.classList.remove('hidden');

      var btn = document.getElementById('install-skill-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          installSkillFromNFT(nft);
        });
      }
    } else if (isAISkillAsset(nft) && !isOwned) {
      var html2 = '<div class="install-skill-section">';
      html2 += '<div class="install-skill-header">';
      html2 += '<span class="install-skill-icon">🤖</span>';
      html2 += '<span class="install-skill-title">AI Agent Skill</span>';
      html2 += '</div>';
      html2 += '<p class="install-skill-note">Purchase this skill to enhance your AI agent\'s capabilities.</p>';
      html2 += '</div>';
      el.innerHTML = html2;
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
    }
  }

  function installSkillFromNFT(nft) {
    var meta = nft.metadata || {};
    var media = meta.media || {};
    var asset = meta.asset || {};
    var rawAsset = nft._rawAsset || asset;

    var kid = nft.kid || rawAsset.kid || (nft.operative && nft.operative.kid) || '';
    var litCiphertext = resolveAssetProtectionField(rawAsset, 'litCiphertext', '') || rawAsset.ciphertext || '';
    var dataToEncryptHash = resolveAssetProtectionField(rawAsset, 'dataToEncryptHash', '');
    var iv = resolveAssetProtectionField(rawAsset, 'iv', '');
    var encryptedDataCid = (rawAsset.uri || rawAsset.cid || '').replace('ipfs://', '');
    var buyerAddress = Wallet.isConnected() ? (getBuyerAddressForAsset(nft) || Wallet.getAddress()) : '';
    var authority = resolveAssetProtectionField(rawAsset, 'authority', '');
    var chainId = resolveAssetProtectionField(rawAsset, 'chainId', 8453);
    var skillSignature = resolveAssetProtectionField(rawAsset, 'signature', '');
    var skillIssuer = resolveAssetProtectionField(rawAsset, 'issuer', '');
    var skillActionCid = resolveAssetProtectionField(rawAsset, 'actionCid', '');

    var skillId = (meta.name || nft.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    var btn = document.getElementById('install-skill-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Installing...';
    }

    fetch('/api/gateway/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillId: skillId,
        kid: kid,
        litCiphertext: litCiphertext,
        dataToEncryptHash: dataToEncryptHash,
        iv: iv,
        encryptedDataCid: encryptedDataCid,
        buyerAddress: buyerAddress,
        authority: authority,
        chainId: chainId,
        ...(skillActionCid && { actionCid: skillActionCid }),
        ...(skillSignature && { signature: skillSignature }),
        ...(skillIssuer && { issuer: skillIssuer }),
      })
    })
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        if (data.success) {
          if (btn) {
            btn.textContent = '✓ Installed';
            btn.classList.add('installed');
          }
          alert('Skill "' + (data.data.name || skillId) + '" installed! Enable it in your Agent Editor (Settings > AI Agent > Skills).');
        } else {
          throw new Error(data.error || 'Install failed');
        }
      })
      .catch(function (err) {
        console.error('[InstallSkill] Error:', err);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Install Skill';
        }
        alert('Failed to install skill: ' + err.message);
      });
  }

  function renderOwnershipBalances(nft) {
    var operative = nft.operative || {};
    var operativeAddr = operative.address || '';
    if (!operativeAddr) return;

    var eoaAddr = Wallet.getAddress();
    var saAddr = Wallet.getSmartAccountAddress();
    var hasSA = Wallet.hasSmartAccount();

    if (!eoaAddr) return;

    var promises = [Wallet.getAccessTokenBalance(operativeAddr, eoaAddr)];
    if (hasSA && saAddr && saAddr.toLowerCase() !== eoaAddr.toLowerCase()) {
      promises.push(Wallet.getAccessTokenBalance(operativeAddr, saAddr));
    }

    Promise.all(promises).then(function (results) {
      var eoaBal = parseInt(results[0]) || 0;
      var saBal = results[1] !== undefined ? (parseInt(results[1]) || 0) : 0;
      var total = eoaBal + saBal;

      var html = '<div class="your-holdings">';
      html += '<span class="holdings-label">Your Holdings</span>';
      html += '<div class="holdings-wallets">';
      html += '<span class="balance-chip eoa' + (eoaBal === 0 ? ' empty' : '') + '">EOA: <strong>' + eoaBal + '</strong></span>';
      if (hasSA) {
        html += '<span class="balance-chip sa' + (saBal === 0 ? ' empty' : '') + '">Smart: <strong>' + saBal + '</strong></span>';
      }
      html += '<span class="holdings-total">Total: <strong>' + total + '</strong></span>';
      html += '</div>';
      html += '</div>';

      dom.detailBalanceInfo.innerHTML = html;
      dom.detailBalanceInfo.classList.remove('hidden');

      if (total > 0 && dom.detailBalanceInline) {
        dom.detailBalanceInline.textContent = '\u00B7 ' + total + ' token' + (total !== 1 ? 's' : '');
      }
    }).catch(function () {});
  }

  function renderSupplyInfo(nft) {
    var operative = nft.operative || {};
    var access = operative.access || {};
    var listings = access.listings || [];
    var totalSupply = parseInt(access.totalSupply) || 0;
    var opType = operative.opType || 0;
    var meta = nft.metadata || {};
    var props = meta.properties || {};

    // Free assets (opType === 0) typically have no access-NFT supply (anyone
    // can stream them directly from IPFS), but they ARE still indexed on-chain
    // and users should still be able to verify the NFT contract / token ID /
    // IPFS CID. We skip the supply-bar UI for free content (meaningless without
    // listings) but always render the props-grid below it.
    var showSupplyBar = (opType !== 0) && (totalSupply > 0);

    var forSale = 0;
    listings.forEach(function (l) { forSale += (parseInt(l.quantity) || 0); });

    var pctAvailable = totalSupply > 0 ? (forSale / totalSupply) * 100 : 0;
    var pctSold = totalSupply > 0 ? ((totalSupply - forSale) / totalSupply) * 100 : 0;
    var isLowStock = pctAvailable > 0 && pctAvailable <= 20;
    var isSoldOut = forSale === 0 && totalSupply > 0;

    var fillClass = isSoldOut ? 'critical' : isLowStock ? 'low-stock' : '';

    var listed = forSale;
    var held = totalSupply - forSale;

    var html = '';

    if (showSupplyBar) {
      html += '<div class="supply-bar">';
      html += '<div class="supply-visual">';
      html += '<div class="supply-text">';
      html += '<span>Listed: <strong>' + listed.toLocaleString() + '</strong> / ' + totalSupply.toLocaleString() + '</span>';
      if (listed > 0) {
        html += '<span class="supply-badge for-sale">' + listed.toLocaleString() + ' for sale</span>';
      } else if (isSoldOut && opType !== 0) {
        html += '<span class="supply-badge sold-out">Sold out</span>';
      }
      html += '</div>';
      html += '<div class="supply-track"><div class="supply-fill ' + fillClass + '" style="width: ' + Math.max(pctSold, 2) + '%"></div></div>';
      html += '<div class="supply-text"><span>' + held.toLocaleString() + ' held by owners</span>';
      if (isLowStock && listed > 0) {
        html += '<span class="supply-badge low-stock">Low stock!</span>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';

      if (isLowStock && listed > 0) {
        html += '<div class="urgency-indicator"><span class="urgency-dot"></span>Low stock — only ' + listed.toLocaleString() + ' left!</div>';
      }
    }

    var contentType = (meta.media && meta.media.contentType) || (meta.media && meta.media.mimeType) || props.mimeType || '';
    var storage = (nft.tokenURI && nft.tokenURI.indexOf('ipfs') !== -1) ? 'IPFS' : 'On-chain';
    var accessType = opType === 0 ? 'Free' : opType === 1 ? 'Buy Once' : 'Buy & Resell';

    var duration = '';
    var attrs = meta.attributes || [];
    for (var ai = 0; ai < attrs.length; ai++) {
      if ((attrs[ai].trait_type || '').toLowerCase() === 'duration') { duration = String(attrs[ai].value || ''); break; }
    }

    var fileSize = (meta.media && meta.media.size) ? meta.media.size : '';
    if (fileSize && typeof fileSize === 'number') {
      if (fileSize >= 1073741824) fileSize = (fileSize / 1073741824).toFixed(1) + ' GB';
      else if (fileSize >= 1048576) fileSize = (fileSize / 1048576).toFixed(1) + ' MB';
      else if (fileSize >= 1024) fileSize = (fileSize / 1024).toFixed(1) + ' KB';
      else fileSize = fileSize + ' B';
    }

    html += '<div class="props-grid" style="margin-top:12px">';
    if (contentType) html += '<div class="prop-row"><span class="prop-label">Content Type</span><span class="prop-value">' + escapeHtml(contentType) + '</span></div>';
    if (duration) html += '<div class="prop-row"><span class="prop-label">Duration</span><span class="prop-value">' + escapeHtml(duration) + '</span></div>';
    if (fileSize) html += '<div class="prop-row"><span class="prop-label">File Size</span><span class="prop-value">' + escapeHtml(String(fileSize)) + '</span></div>';
    html += '<div class="prop-row"><span class="prop-label">Access Type</span><span class="prop-value">' + accessType + '</span></div>';
    html += '<div class="prop-row"><span class="prop-label">Protected</span><span class="prop-value">' + (nft.isProtected ? 'Yes (dDRM)' : 'No') + '</span></div>';
    if (totalSupply > 0) {
      html += '<div class="prop-row"><span class="prop-label">Total Supply</span><span class="prop-value">' + totalSupply.toLocaleString() + '</span></div>';
      html += '<div class="prop-row"><span class="prop-label">Available</span><span class="prop-value">' + listed.toLocaleString() + ' / ' + totalSupply.toLocaleString() + (isSoldOut && opType !== 0 ? ' (sold out)' : '') + '</span></div>';
    }
    var storageHtml = storage;
    if (nft._isLocal) {
      storageHtml += ' <span class="seeding-badge pinned" title="This node is pinning and seeding this content"><span class="status-dot pinned-dot"></span> Pinned</span>';
    }
    html += '<div class="prop-row" id="detail-storage-row"><span class="prop-label">Storage</span><span class="prop-value">' + storageHtml + '</span></div>';
    if (nft._contentCid) {
      html += '<div class="prop-row" id="detail-seeding-row"><span class="prop-label">Network</span><span class="prop-value" id="detail-seeding-value"><span class="seeding-loading">Checking peers\u2026</span></span></div>';
    }
    if (nft.createdAt) html += '<div class="prop-row"><span class="prop-label">Uploaded</span><span class="prop-value">' + new Date(nft.createdAt).toLocaleDateString() + '</span></div>';
    if (props.distribution) html += '<div class="prop-row"><span class="prop-label">Usage Rights</span><span class="prop-value">' + escapeHtml(props.distribution) + '</span></div>';
    if (props.labelType) html += '<div class="prop-row"><span class="prop-label">Label</span><span class="prop-value">' + escapeHtml(props.labelType) + '</span></div>';
    if (props.authority) html += '<div class="prop-row"><span class="prop-label">Authority</span><span class="prop-value"><a href="https://basescan.org/address/' + escapeHtml(props.authority) + '" target="_blank" rel="noopener">' + formatAddress(props.authority) + '</a></span></div>';
    html += '<div class="prop-row"><span class="prop-label">Blockchain</span><span class="prop-value">Base (8453)</span></div>';

    // ── On-chain identity (NFT Asset / Token ID / IPFS CID / Operative) ──
    // Indexed by the catalog regardless of opType — surfaced for both free
    // (opType 0) and paid (opType 1/2) assets so anyone can verify on-chain
    // provenance via Basescan + IPFS gateways.
    var nftContractAddr = nft.contractAddress || '';
    var nftTokenIdRaw = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '';
    var contentCid = nft._contentCid || '';

    if (nftContractAddr) {
      html += '<div class="prop-row"><span class="prop-label">Asset Token Contract</span><span class="prop-value">' +
        '<a href="https://basescan.org/address/' + escapeHtml(nftContractAddr) + '" target="_blank" rel="noopener" title="View asset token contract on Basescan">' +
          formatAddress(nftContractAddr) +
        '</a>' +
        ' <button class="onchain-copy-btn" data-copy="' + escapeHtml(nftContractAddr) + '" title="Copy address" aria-label="Copy asset token contract address">\u29C9</button>' +
      '</span></div>';
    }

    if (nftTokenIdRaw) {
      var tokenIdStr = String(nftTokenIdRaw);
      var tokenIdShort = tokenIdStr.length > 14 ? (tokenIdStr.substring(0, 8) + '\u2026' + tokenIdStr.substring(tokenIdStr.length - 4)) : tokenIdStr;
      html += '<div class="prop-row"><span class="prop-label">Token ID</span><span class="prop-value">' +
        '<span class="onchain-mono" title="' + escapeHtml(tokenIdStr) + '">' + escapeHtml(tokenIdShort) + '</span>' +
        ' <button class="onchain-copy-btn" data-copy="' + escapeHtml(tokenIdStr) + '" title="Copy token ID" aria-label="Copy token ID">\u29C9</button>' +
      '</span></div>';
    }

    if (contentCid) {
      var cidShort = contentCid.length > 14 ? (contentCid.substring(0, 8) + '\u2026' + contentCid.substring(contentCid.length - 4)) : contentCid;
      html += '<div class="prop-row"><span class="prop-label">IPFS Content</span><span class="prop-value">' +
        '<a href="/ipfs/' + escapeHtml(contentCid) + '" target="_blank" rel="noopener" class="onchain-mono" title="Load via this PC2 node (auto-pins on first request)">' +
          escapeHtml(cidShort) +
        '</a>' +
        ' <a href="' + IPFS_GATEWAY + escapeHtml(contentCid) + '" target="_blank" rel="noopener" class="onchain-public-link" title="Verify on public ipfs.ela.city gateway">verify</a>' +
        ' <button class="onchain-copy-btn" data-copy="' + escapeHtml(contentCid) + '" title="Copy CID" aria-label="Copy IPFS CID">\u29C9</button>' +
      '</span></div>';
    }

    if (operative.address) {
      html += '<div class="prop-row"><span class="prop-label">Operative Contract</span><span class="prop-value">' +
        '<a href="https://basescan.org/address/' + escapeHtml(operative.address) + '" target="_blank" rel="noopener" title="View business-model contract on Basescan">' +
          formatAddress(operative.address) +
        '</a>' +
        ' <button class="onchain-copy-btn" data-copy="' + escapeHtml(operative.address) + '" title="Copy address" aria-label="Copy operative contract address">\u29C9</button>' +
      '</span></div>';
    }
    html += '</div>';

    dom.detailSupplyInfo.innerHTML = html;
    dom.detailSupplyInfo.classList.remove('hidden');

    // Wire up copy-to-clipboard buttons.
    var copyBtns = dom.detailSupplyInfo.querySelectorAll('.onchain-copy-btn');
    for (var ci = 0; ci < copyBtns.length; ci++) {
      copyBtns[ci].addEventListener('click', function (evt) {
        evt.preventDefault();
        evt.stopPropagation();
        var val = this.getAttribute('data-copy') || '';
        if (!val) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(function () {
            showToast('Copied to clipboard', 'success');
          }).catch(function () {
            showToast('Copy failed', 'error');
          });
        } else {
          showToast('Clipboard unavailable', 'error');
        }
      });
    }
  }

  function enrichFromChain(nft) {
    var operative = nft.operative || {};
    var access = operative.access || {};
    var listings = access.listings || [];
    var totalSupply = parseInt(access.totalSupply) || 0;
    var channel = nft.channel || {};

    if (operative.address && listings.length > 0 && totalSupply > 0) {
      var seller = listings[0].seller;
      if (seller) {
        Wallet.getAccessTokenBalance(operative.address, seller).then(function (sellerBal) {
          if (sellerBal === undefined || sellerBal === null) return;
          var catalogListed = 0;
          listings.forEach(function (l) { catalogListed += (parseInt(l.quantity) || 0); });
          if (sellerBal === catalogListed) return;

          var listed = sellerBal;
          var held = totalSupply - listed;
          var pctSold = totalSupply > 0 ? (held / totalSupply) * 100 : 0;
          var isSoldOut = listed === 0 && totalSupply > 0;
          var isLowStock = listed > 0 && ((listed / totalSupply) * 100) <= 20;
          var fillClass = isSoldOut ? 'critical' : isLowStock ? 'low-stock' : '';

          var supplyTextEls = dom.detailSupplyInfo.querySelectorAll('.supply-text');
          if (supplyTextEls[0]) {
            var badge = '';
            if (listed > 0) badge = '<span class="supply-badge for-sale">' + listed.toLocaleString() + ' for sale</span>';
            else if (isSoldOut) badge = '<span class="supply-badge sold-out">Sold out</span>';
            supplyTextEls[0].innerHTML = '<span>Listed: <strong>' + listed.toLocaleString() + '</strong> / ' + totalSupply.toLocaleString() + '</span>' + badge;
          }
          if (supplyTextEls[1]) {
            var heldBadge = isLowStock && listed > 0 ? '<span class="supply-badge low-stock">Low stock!</span>' : '';
            supplyTextEls[1].innerHTML = '<span>' + held.toLocaleString() + ' held by owners</span>' + heldBadge;
          }
          var fillEl = dom.detailSupplyInfo.querySelector('.supply-fill');
          if (fillEl) {
            fillEl.className = 'supply-fill ' + fillClass;
            fillEl.style.width = Math.max(pctSold, 2) + '%';
          }

          var availEl = dom.detailSupplyInfo.querySelector('.prop-value');
          var propRows = dom.detailSupplyInfo.querySelectorAll('.prop-row');
          for (var i = 0; i < propRows.length; i++) {
            var label = propRows[i].querySelector('.prop-label');
            if (label && label.textContent === 'Available') {
              var valEl = propRows[i].querySelector('.prop-value');
              if (valEl) valEl.textContent = listed.toLocaleString() + ' / ' + totalSupply.toLocaleString() + (isSoldOut ? ' (sold out)' : '');
              break;
            }
          }

          var urgencyEl = dom.detailSupplyInfo.querySelector('.urgency-indicator');
          if (urgencyEl) urgencyEl.remove();
          if (isLowStock && listed > 0) {
            var urgency = document.createElement('div');
            urgency.className = 'urgency-indicator';
            urgency.innerHTML = '<span class="urgency-dot"></span>Low stock — only ' + listed.toLocaleString() + ' left!';
            dom.detailSupplyInfo.querySelector('.supply-bar').after(urgency);
          }
        }).catch(function () {});
      }
    }

    var GENERIC_NAMES = ['Channel', 'Creator', 'Unknown', ''];
    if (channel.address && (!channel.name || GENERIC_NAMES.indexOf(channel.name) !== -1)) {
      fetchChannelName(channel.address).then(function (name) {
        if (!name) return;
        var nameEl = dom.detailCreator.querySelector('.channel-name');
        if (nameEl) nameEl.textContent = name;
        if (dom.detailBreadcrumb) {
          dom.detailBreadcrumb.innerHTML = '<a onclick="ElaMarket.openChannel(\'' + escapeHtml(channel.address) + '\')">' + escapeHtml(name) + '</a>';
        }
      }).catch(function () {});
    }

    if (nft._contentCid) {
      var origin = window.puter_api_origin || window.location.origin;
      fetch(origin + '/api/catalog/providers/' + encodeURIComponent(nft._contentCid))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          var el = document.getElementById('detail-seeding-value');
          if (!el || !data) return;

          // Backend returns DHT count + gateway probe results. Build a single
          // de-duplicated source list so the badge can show "N nodes" with an
          // expandable list of sources. Sources are: this node (if pinned),
          // each reachable public gateway, and each DHT peer (counted as one
          // bucket so we don't claim 1000 peers when the DHT happened to walk
          // a chatty area).
          var providers = data.providers || 0;
          var gateways = Array.isArray(data.gateways) ? data.gateways : [];
          var sources = [];
          if (nft._isLocal) sources.push({ label: 'This node', detail: 'pinned locally' });
          for (var gi = 0; gi < gateways.length; gi++) {
            if (gateways[gi] && gateways[gi].reachable) {
              sources.push({ label: gateways[gi].name, detail: 'public IPFS gateway' });
            }
          }
          if (providers > 0) {
            sources.push({ label: providers + ' DHT peer' + (providers !== 1 ? 's' : ''), detail: 'discovered via libp2p' });
          }

          var count = sources.length;
          var badgeClass = count >= 2 ? 'public' : (count === 1 && nft._isLocal && providers === 0 && gateways.every(function (g) { return !g.reachable; }) ? 'local-only' : (count > 0 ? 'public' : 'pending'));
          var labelText = count === 0 ? 'Discovering peers\u2026'
            : count === 1 && sources[0].label === 'This node' ? 'This node only'
            : count + ' source' + (count !== 1 ? 's' : '');

          // Build the dropdown listing sources. Shown via CSS hover/focus.
          var listHtml = '';
          for (var si = 0; si < sources.length; si++) {
            listHtml += '<li><strong>' + escapeHtml(sources[si].label) + '</strong> <span class="seeding-source-detail">' + escapeHtml(sources[si].detail) + '</span></li>';
          }
          if (!listHtml) listHtml = '<li class="seeding-source-empty">No sources found yet \u2014 still probing.</li>';

          var html = '<span class="seeding-badge ' + badgeClass + ' has-dropdown" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">' +
            escapeHtml(labelText) +
            ' <span class="seeding-caret" aria-hidden="true">\u25BE</span>' +
            '<span class="seeding-dropdown" role="tooltip"><strong class="seeding-dropdown-title">Sources</strong><ul>' + listHtml + '</ul></span>' +
            '</span>';
          el.innerHTML = html;
        })
        .catch(function () {
          var el = document.getElementById('detail-seeding-value');
          if (el) el.innerHTML = '<span class="seeding-badge">-</span>';
        });
    }
  }

  function fetchChannelName(channelAddress) {
    var iface = new ethers.Interface(['function name() view returns (string)']);
    var data = iface.encodeFunctionData('name', []);
    return Wallet.getProvider().request({
      method: 'eth_call',
      params: [{ to: channelAddress, data: data }, 'latest']
    }).then(function (result) {
      if (!result || result === '0x') return null;
      var decoded = iface.decodeFunctionResult('name', result);
      return decoded[0] || null;
    }).catch(function () { return null; });
  }

  function renderOpTypeBadge(nft) {
    var operative = nft.operative || {};
    var opType = operative.opType || 0;
    var operativeAddr = operative.address || '';
    var ownerAddr = Wallet.getSignerAddress() || Wallet.getAddress() || '';

    if (!operativeAddr || !ownerAddr) return;

    var sellersContainer = document.getElementById('detail-sellers-list');
    if (!sellersContainer) return;
    sellersContainer.innerHTML = '';
    sellersContainer.classList.add('hidden');

    // V3 operatives mint access tokens at the operative-internal tokenId = 1
    // (TOKEN_ID_ACCESS in wallet.js). AuthorityGateway state queries — sellersOf,
    // listings, withdrawListing — require this operative-tokenId. The ledger's
    // hex content-hash tokenId is only used for ledger-level calls (buyAccess,
    // tokenURI). Using the content-hash here would silently return empty and
    // hide the Buy button. operativeAddr is guaranteed truthy by the early
    // return above; any asset with an operative is V3 by construction.
    var tokenId = '1';
    var eoaAddr = Wallet.getAddress() || '';
    var saAddr = Wallet.getSmartAccountAddress() || '';

    Wallet.getAccessSellers(operativeAddr, tokenId).then(function (sellers) {
      if (!sellers || sellers.length === 0) return;

      var html = '<div class="sellers-list-inner">';
      html += '<span class="sellers-title">Active Sellers (' + sellers.length + ')</span>';

      var promises = sellers.map(function (seller) {
        return Wallet.getAccessListing(operativeAddr, tokenId, seller).then(function (listing) {
          return { seller: seller, listing: listing };
        });
      });

      Promise.all(promises).then(function (results) {
        var validResults = results.filter(function (r) { return r.listing && r.listing.quantity > 0; });

        validResults.sort(function (a, b) {
          return Number(a.listing.pricePerToken) - Number(b.listing.pricePerToken);
        });

        validResults.forEach(function (r, idx) {
          var decimals = getTokenSymbol(r.listing.payToken) === 'USDC' ? 6 : 18;
          var displayPrice = Number(r.listing.pricePerToken) / Math.pow(10, decimals);
          var sellerLower = r.seller.toLowerCase();
          var isEOA = (sellerLower === eoaAddr.toLowerCase());
          var isSA = saAddr && (sellerLower === saAddr.toLowerCase());
          var isSelf = isEOA || isSA;
          var selfLabel = isEOA ? 'You (EOA)' : isSA ? 'You (Smart)' : '';
          var isBest = (idx === 0 && validResults.length > 1);
          html += '<div class="seller-row' + (isSelf ? ' seller-self' : '') + (isBest ? ' seller-best' : '') + '">';
          html += '<span class="seller-addr">' + (isSelf ? selfLabel : formatAddress(r.seller)) + '</span>';
          html += '<span class="seller-price">' + formatPrice(displayPrice, r.listing.payToken) + '</span>';
          if (isBest) html += '<span class="best-price-tag">Best Price</span>';
          html += '<span class="seller-qty">x' + r.listing.quantity + '</span>';
          if (isSelf) {
            html += '<button class="cancel-listing-btn" data-operative="' + operativeAddr + '" data-tokenid="' + tokenId + '" data-qty="' + r.listing.quantity + '" data-seller="' + r.seller + '">Cancel</button>';
          }
          html += '</div>';
        });
        html += '</div>';
        sellersContainer.innerHTML = html;
        sellersContainer.classList.remove('hidden');

        // Back-fill Buy button when catalog metadata had no pricing section
        // (PC2 local catalog builds listings[] from metadata_json.pricing; the
        // creator app only encodes price in on-chain sellRawData, so listings[]
        // arrives empty and the detail view hides the Buy button. Once we have
        // live sellers from the AuthorityGateway, reuse them here.)
        if (nft === state.detailItem && validResults.length > 0) {
          var buyableResults = validResults.filter(function (r) {
            var s = (r.seller || '').toLowerCase();
            return s && s !== eoaAddr.toLowerCase() && (!saAddr || s !== saAddr.toLowerCase());
          });
          if (buyableResults.length > 0) {
            nft.operative.access.listings = buyableResults.map(function (r) {
              return {
                seller: r.seller,
                price: String(r.listing.pricePerToken),
                quantity: r.listing.quantity,
                payToken: r.listing.payToken,
              };
            });
            var viewerOwned = state.detailIsOwned || isAssetInLibrary(nft) || (nft.access && nft.access.haveAccess);
            if (!viewerOwned && dom.detailPriceSection.classList.contains('hidden')) {
              var best = buyableResults[0];
              var priceDecimals = getTokenSymbol(best.listing.payToken) === 'USDC' ? 6 : 18;
              var priceDisplay = Number(best.listing.pricePerToken) / Math.pow(10, priceDecimals);
              dom.detailPrice.textContent = formatPrice(priceDisplay, best.listing.payToken);
              dom.detailPriceSection.classList.remove('hidden');
              dom.buyBtn.classList.remove('hidden');
            }
          }
        }

        sellersContainer.querySelectorAll('.cancel-listing-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var op = btn.getAttribute('data-operative');
            var tid = btn.getAttribute('data-tokenid');
            var qty = btn.getAttribute('data-qty');
            var sellerAddr = (btn.getAttribute('data-seller') || '').toLowerCase();
            var cancelWallet = (saAddr && Wallet.hasSmartAccount() && sellerAddr === saAddr.toLowerCase()) ? 'sa' : undefined;
            btn.disabled = true;
            btn.textContent = '...';
            Wallet.cancelAccessListing(op, tid, qty, cancelWallet)
              .then(function () {
                showToast('Listing cancelled', 'success');
                btn.parentNode.remove();
                if (state.detailItem) setTimeout(function () { enrichFromChain(state.detailItem); }, 2000);
              })
              .catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Cancel';
                if (err.message && err.message.indexOf('rejected') === -1) {
                  showToast('Failed: ' + decodeContractError(err.message), 'error');
                }
              });
          });
        });
      });
    });
  }

  function decodeContractError(msg) {
    if (!msg) return 'Transaction failed';
    var errorMap = {
      'AvailabilityError': 'Not enough copies available',
      'InsufficientBalance': 'Insufficient balance',
      'InsufficientOwningError': "You don't own enough tokens",
      'InvalidOperativeError': 'Invalid content contract',
      'InvalidPaymentTokenError': 'Payment token not accepted',
      'NotApprovedError': 'Please approve the contract first',
      'NotAllowedError': "You don't have permission for this action",
      'PriceFulfillmentError': 'Incorrect payment amount',
      'NoOverrideError': 'You already have an active offer. Cancel it first before making a new one.',
      'TradeActionRestricted': 'You need an access token before you can trade royalty shares.',
      'TradableContractFault': 'This asset does not support royalty share trading.',
      'ReentrantTradeEntryCall': 'Transaction in progress — please wait and try again.',
      'AccessDenied': "You don't have access to this content",
      'InvalidSignature': 'Invalid license signature',
      'simulation failed': 'Transaction would fail on-chain. You may already have an active offer.'
    };
    var keys = Object.keys(errorMap);
    for (var i = 0; i < keys.length; i++) {
      if (msg.indexOf(keys[i]) !== -1) return errorMap[keys[i]];
    }
    if (msg.indexOf('insufficient') !== -1) return 'Insufficient balance for this transaction';
    if (msg.indexOf('revert') !== -1) return 'Transaction reverted by contract';
    return msg;
  }

  // ── Governance (Royalty Shares) ─────────────────────

  function renderGovernanceSection(nft) {
    var operative = nft.operative || {};
    var operativeAddr = operative.address || '';
    if (!operativeAddr) return;

    var eoaAddr = Wallet.getAddress() || '';
    var saAddr = Wallet.getSmartAccountAddress() || '';
    var hasSA = Wallet.hasSmartAccount();
    if (!eoaAddr) return;

    var balancePromises = [Wallet.getRoyaltyShareBalance(operativeAddr, eoaAddr)];
    if (hasSA && saAddr && saAddr.toLowerCase() !== eoaAddr.toLowerCase()) {
      balancePromises.push(Wallet.getRoyaltyShareBalance(operativeAddr, saAddr));
    }

    Promise.all(balancePromises).then(function (results) {
      var eoaBal = parseInt(results[0]) || 0;
      var saBal = results[1] !== undefined ? (parseInt(results[1]) || 0) : 0;
      var totalBal = eoaBal + saBal;

      if (totalBal <= 0) return;

      var pct = (totalBal / 10).toFixed(1);
      var balHtml = '<span class="label">Your royalty shares:</span> ';
      if (hasSA) {
        balHtml += '<span class="balance-chip eoa" style="font-size:11px;">' + eoaBal + ' EOA</span>';
        balHtml += '<span class="balance-chip sa" style="font-size:11px;">' + saBal + ' Smart</span>';
        balHtml += '<span class="value" style="margin-left:6px;">(' + pct + '% total)</span>';
      } else {
        balHtml += '<span class="value">' + totalBal + ' tokens (' + pct + '%)</span>';
      }
      dom.govBalance.innerHTML = balHtml;

      dom.govListBtn.classList.remove('hidden');
      dom.govTransferBtn.classList.remove('hidden');
      dom.detailGovernance.classList.remove('hidden');
      var govSection = document.getElementById('detail-governance-section');
      if (govSection) govSection.classList.remove('hidden');

      var rewardPromises = [Wallet.getPendingRewards(operativeAddr, eoaAddr, USDC_ADDRESS)];
      if (hasSA && saAddr && saAddr.toLowerCase() !== eoaAddr.toLowerCase()) {
        rewardPromises.push(Wallet.getPendingRewards(operativeAddr, saAddr, USDC_ADDRESS));
      }

      Promise.all(rewardPromises).then(function (rResults) {
        var eoaRewards = Number(rResults[0]) || 0;
        var saRewards = rResults[1] !== undefined ? (Number(rResults[1]) || 0) : 0;
        var totalRewards = eoaRewards + saRewards;

        if (totalRewards === 0) {
          dom.govRewards.innerHTML = '<span class="label">Pending rewards:</span> <span class="value">0 USDC</span>';
          return;
        }

        var rewardHtml = '<span class="label">Pending rewards:</span> ';
        if (hasSA && (eoaRewards > 0 || saRewards > 0)) {
          if (eoaRewards > 0) rewardHtml += '<span class="balance-chip eoa" style="font-size:11px;">' + (eoaRewards / 1e6).toFixed(2) + ' USDC (EOA)</span>';
          if (saRewards > 0) rewardHtml += '<span class="balance-chip sa" style="font-size:11px;">' + (saRewards / 1e6).toFixed(2) + ' USDC (Smart)</span>';
        } else {
          rewardHtml += '<span class="value">' + (totalRewards / 1e6).toFixed(2) + ' USDC</span>';
        }
        dom.govRewards.innerHTML = rewardHtml;
        dom.govWithdrawBtn.classList.remove('hidden');
      });
    });
  }

  function handleGovWithdraw() {
    var nft = state.detailItem;
    if (!nft) return;
    var operativeAddr = (nft.operative && nft.operative.address) || '';
    if (!operativeAddr) return;

    var rewardText = dom.govRewards.textContent || '';
    if (!confirm('Withdraw pending rewards?\n\n' + rewardText.replace(/Pending rewards:\s*/, '') + '\n\nThis will submit a blockchain transaction.')) {
      return;
    }

    dom.govWithdrawBtn.disabled = true;
    dom.govWithdrawBtn.textContent = 'Withdrawing...';

    Wallet.withdrawRewards(operativeAddr, USDC_ADDRESS)
      .then(function () {
        showToast('Rewards withdrawn!', 'success');
        dom.govWithdrawBtn.classList.add('hidden');
        dom.govRewards.innerHTML = '<span class="label">Pending rewards:</span> <span class="value">0 USDC</span>';
        ElacityAPI.clearEarningsCache(true);
        setTimeout(function () {
          if (window.ElaMarket && window.ElaMarket.loadEarningsData) {
            window.ElaMarket.loadEarningsData(state.earningsTab);
          } else {
            loadEarningsData(state.earningsTab);
          }
        }, 3000);
      })
      .catch(function (err) {
        if (err.message && err.message.indexOf('rejected') === -1) {
          showToast('Withdraw failed: ' + decodeContractError(err.message), 'error');
        }
      })
      .finally(function () {
        dom.govWithdrawBtn.disabled = false;
        dom.govWithdrawBtn.textContent = 'Withdraw';
      });
  }

  function openGovListModal() {
    var nft = state.detailItem;
    if (!nft) return;
    var meta = nft.metadata || {};
    dom.govListAssetName.textContent = meta.name || nft.name || 'Untitled';
    dom.govListAmount.value = '';
    dom.govListPrice.value = '';
    dom.govListStatus.classList.add('hidden');
    dom.govListConfirmBtn.disabled = false;

    var operativeAddr = (nft.operative && nft.operative.address) || '';
    var ownerAddr = Wallet.getSignerAddress() || Wallet.getAddress() || '';
    Wallet.getRoyaltyShareBalance(operativeAddr, ownerAddr).then(function (bal) {
      dom.govListBalanceInfo.textContent = 'You hold ' + bal + ' royalty share tokens (' + (bal / 10).toFixed(1) + '%)';
    });

    dom.govListModal.classList.remove('hidden');
  }

  function closeGovListModal() { dom.govListModal.classList.add('hidden'); }

  function handleGovListConfirm() {
    var nft = state.detailItem;
    if (!nft) return;

    var amount = parseInt(dom.govListAmount.value, 10);
    var price = parseFloat(dom.govListPrice.value);

    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!price || price <= 0) { showToast('Enter a valid price', 'error'); return; }
    if (price > 1000000) { showToast('Price exceeds maximum', 'error'); return; }

    var operativeAddr = (nft.operative && nft.operative.address) || '';
    var priceWei = BigInt(Math.round(price * 1e6)).toString();

    dom.govListConfirmBtn.disabled = true;
    dom.govListStatus.textContent = 'Submitting...';
    dom.govListStatus.className = 'modal-status pending';
    dom.govListStatus.classList.remove('hidden');

    Wallet.listRoyaltyShares(operativeAddr, amount, priceWei, USDC_ADDRESS)
      .then(function () {
        dom.govListStatus.textContent = 'Listed!';
        dom.govListStatus.className = 'modal-status success';
        showToast('Royalty shares listed for sale!', 'success');
        setTimeout(closeGovListModal, 1500);
        if (state.detailItem) {
          setTimeout(function () {
            renderGovernanceSection(state.detailItem);
            if (window.ElaMarket && window.ElaMarket.renderOrderBook) window.ElaMarket.renderOrderBook(state.detailItem);
          }, 2000);
        }
      })
      .catch(function (err) {
        if (err.message && err.message.indexOf('rejected') !== -1) {
          dom.govListStatus.classList.add('hidden');
          dom.govListConfirmBtn.disabled = false;
          return;
        }
        dom.govListStatus.textContent = decodeContractError(err.message);
        dom.govListStatus.className = 'modal-status error';
        dom.govListConfirmBtn.disabled = false;
      });
  }

  function openGovTransferModal() {
    var nft = state.detailItem;
    if (!nft) return;
    var meta = nft.metadata || {};
    dom.govTransferAssetName.textContent = meta.name || nft.name || 'Untitled';
    dom.govTransferAmount.value = '';
    dom.govTransferRecipient.value = '';
    dom.govTransferStatus.classList.add('hidden');
    dom.govTransferConfirmBtn.disabled = false;

    var operativeAddr = (nft.operative && nft.operative.address) || '';
    var ownerAddr = Wallet.getSignerAddress() || Wallet.getAddress() || '';
    Wallet.getRoyaltyShareBalance(operativeAddr, ownerAddr).then(function (bal) {
      dom.govTransferBalanceInfo.textContent = 'You hold ' + bal + ' royalty share tokens (' + (bal / 10).toFixed(1) + '%)';
    });

    dom.govTransferModal.classList.remove('hidden');
  }

  function closeGovTransferModal() { dom.govTransferModal.classList.add('hidden'); }

  function handleGovTransferConfirm() {
    var nft = state.detailItem;
    if (!nft) return;

    var amount = parseInt(dom.govTransferAmount.value, 10);
    var recipient = (dom.govTransferRecipient.value || '').trim();

    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!recipient || !ethers.isAddress(recipient)) { showToast('Enter a valid address', 'error'); return; }

    var operativeAddr = (nft.operative && nft.operative.address) || '';

    dom.govTransferConfirmBtn.disabled = true;
    dom.govTransferStatus.textContent = 'Submitting...';
    dom.govTransferStatus.className = 'modal-status pending';
    dom.govTransferStatus.classList.remove('hidden');

    Wallet.transferRoyaltyShares(operativeAddr, recipient, amount)
      .then(function () {
        dom.govTransferStatus.textContent = 'Transferred!';
        dom.govTransferStatus.className = 'modal-status success';
        showToast('Royalty shares transferred!', 'success');
        setTimeout(closeGovTransferModal, 1500);
        if (state.detailItem) {
          setTimeout(function () {
            renderGovernanceSection(state.detailItem);
            if (window.ElaMarket && window.ElaMarket.renderOrderBook) window.ElaMarket.renderOrderBook(state.detailItem);
          }, 2000);
        }
      })
      .catch(function (err) {
        if (err.message && err.message.indexOf('rejected') !== -1) {
          dom.govTransferStatus.classList.add('hidden');
          dom.govTransferConfirmBtn.disabled = false;
          return;
        }
        dom.govTransferStatus.textContent = decodeContractError(err.message);
        dom.govTransferStatus.className = 'modal-status error';
        dom.govTransferConfirmBtn.disabled = false;
      });
  }

  // ── Resell Modal ──────────────────────────────────

  function openResellModal() {
    var nft = state.detailItem;
    if (!nft) return;

    var opType = (nft.operative && nft.operative.opType) || 0;
    if (opType !== 2) {
      showToast('This content is not resellable (buy-once only)', 'error');
      return;
    }

    var operative = nft.operative || {};
    var operativeAddr = operative.address || '';
    var ledgerAddr = (nft.metadata && nft.metadata.properties && nft.metadata.properties.ledger)
      || nft.contractAddress || (nft.channel && nft.channel.address) || '';
    var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '0';

    if (window.ElaMarket && window.ElaMarket.openResellAccessModal) {
      window.ElaMarket.openResellAccessModal(operativeAddr, ledgerAddr, tokenId);
      return;
    }

    var meta = nft.metadata || {};
    dom.resellAssetName.textContent = meta.name || nft.name || 'Untitled';
    dom.resellPrice.value = '';
    dom.resellQuantity.value = '1';
    dom.resellStatus.classList.add('hidden');
    dom.resellConfirmBtn.disabled = false;
    state.resellSelectedWallet = null;

    var resellerCutRaw = operative.resellerCut || 0;
    var resellerPct = resellerCutRaw ? (resellerCutRaw / 10) : 0;
    dom.resellRoyaltyNote.textContent = resellerPct
      ? 'You receive ' + resellerPct + '% of the sale price. Royalty holders receive ' + (100 - resellerPct) + '%.'
      : '';

    var eoaAddr = Wallet.getAddress();
    var saAddr = Wallet.getSmartAccountAddress();
    var hasSA = Wallet.hasSmartAccount();

    dom.resellWalletPicker.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);">Loading balances...</div>';
    dom.resellModal.classList.remove('hidden');

    var balancePromises = [
      operativeAddr ? Wallet.getAccessTokenBalance(operativeAddr, eoaAddr) : Promise.resolve('0')
    ];
    if (hasSA && saAddr) {
      balancePromises.push(
        operativeAddr ? Wallet.getAccessTokenBalance(operativeAddr, saAddr) : Promise.resolve('0')
      );
    }

    Promise.all(balancePromises).then(function (results) {
      var eoaBal = parseInt(results[0]) || 0;
      var saBal = results[1] !== undefined ? (parseInt(results[1]) || 0) : 0;

      var html = '';
      html += '<div class="wallet-picker-option' + (eoaBal > 0 ? ' selected' : ' disabled') + '" data-wallet="eoa">';
      html += '<span class="wallet-picker-label">EOA Wallet</span>';
      html += '<span class="wallet-picker-balance">' + eoaBal + ' token' + (eoaBal !== 1 ? 's' : '') + '</span>';
      html += '<span class="wallet-picker-addr">' + formatAddress(eoaAddr) + '</span>';
      html += '</div>';

      if (hasSA && saAddr) {
        html += '<div class="wallet-picker-option' + (saBal > 0 && eoaBal === 0 ? ' selected' : '') + (saBal === 0 ? ' disabled' : '') + '" data-wallet="sa">';
        html += '<span class="wallet-picker-label">Agent Account</span>';
        html += '<span class="wallet-picker-balance">' + saBal + ' token' + (saBal !== 1 ? 's' : '') + '</span>';
        html += '<span class="wallet-picker-addr">' + formatAddress(saAddr) + '</span>';
        html += '</div>';
      }

      dom.resellWalletPicker.innerHTML = html;

      if (eoaBal > 0) {
        state.resellSelectedWallet = 'eoa';
        dom.resellQuantity.max = eoaBal;
      } else if (saBal > 0) {
        state.resellSelectedWallet = 'sa';
        dom.resellQuantity.max = saBal;
      }

      dom.resellWalletPicker.querySelectorAll('.wallet-picker-option').forEach(function (opt) {
        opt.addEventListener('click', function () {
          if (opt.classList.contains('disabled')) return;
          dom.resellWalletPicker.querySelectorAll('.wallet-picker-option').forEach(function (o) { o.classList.remove('selected'); });
          opt.classList.add('selected');
          state.resellSelectedWallet = opt.getAttribute('data-wallet');
          var maxQty = state.resellSelectedWallet === 'sa' ? saBal : eoaBal;
          dom.resellQuantity.max = maxQty;
          if (parseInt(dom.resellQuantity.value) > maxQty) dom.resellQuantity.value = maxQty;
        });
      });
    }).catch(function () {
      dom.resellWalletPicker.innerHTML = '';
      state.resellSelectedWallet = 'eoa';
    });
  }

  function closeResellModal() {
    dom.resellModal.classList.add('hidden');
  }

  function handleResellConfirm() {
    var nft = state.detailItem;
    if (!nft) return;

    if (!state.resellSelectedWallet) {
      showToast('Please select a wallet to sell from', 'error');
      return;
    }

    var price = parseFloat(dom.resellPrice.value);
    var quantity = parseInt(dom.resellQuantity.value, 10) || 1;

    if (!price || price <= 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }
    if (price > 1000000) {
      showToast('Price exceeds maximum (1,000,000 USDC)', 'error');
      return;
    }

    var operativeAddr = (nft.operative && nft.operative.address) || '';
    if (!operativeAddr) {
      showToast('Cannot list — no operative contract found', 'error');
      return;
    }

    var ledgerAddr = (nft.metadata && nft.metadata.properties && nft.metadata.properties.ledger)
      || nft.contractAddress || (nft.channel && nft.channel.address) || '';
    var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '0';

    var priceWei = BigInt(Math.round(price * 1e6)).toString();

    dom.resellConfirmBtn.disabled = true;
    dom.resellStatus.textContent = 'Submitting transaction...';
    dom.resellStatus.className = 'modal-status pending';
    dom.resellStatus.classList.remove('hidden');

    Wallet.resellAccessToken(ledgerAddr, tokenId, quantity, priceWei, USDC_ADDRESS, operativeAddr, state.resellSelectedWallet)
      .then(function () {
        dom.resellStatus.textContent = 'Listed for sale!';
        dom.resellStatus.className = 'modal-status success';
        showToast('Access token listed for resale!', 'success');
        setTimeout(closeResellModal, 1500);
        if (state.detailItem) setTimeout(function () { enrichFromChain(state.detailItem); }, 2000);
      })
      .catch(function (err) {
        if (err.message && (err.message.indexOf('rejected') !== -1 || err.message.indexOf('denied') !== -1)) {
          dom.resellStatus.classList.add('hidden');
          dom.resellConfirmBtn.disabled = false;
          return;
        }
        dom.resellStatus.textContent = decodeContractError(err.message) || 'Transaction failed';
        dom.resellStatus.className = 'modal-status error';
        dom.resellConfirmBtn.disabled = false;
      });
  }

  // ── Transfer Modal ────────────────────────────────

  function openTransferModal() {
    var nft = state.detailItem;
    if (!nft) return;

    var isChannelNFT = nft.variant === 'ERC721' || (!nft.operative);
    if (!isChannelNFT) {
      showToast('Access tokens cannot be transferred directly. Use the Resell feature instead.', 'error');
      return;
    }

    var meta = nft.metadata || {};
    dom.transferAssetName.textContent = meta.name || nft.name || 'Untitled';
    dom.transferRecipient.value = '';
    dom.transferStatus.classList.add('hidden');
    dom.transferConfirmBtn.disabled = false;
    dom.transferModal.classList.remove('hidden');
  }

  function closeTransferModal() {
    dom.transferModal.classList.add('hidden');
  }

  function handleTransferConfirm() {
    var nft = state.detailItem;
    if (!nft) return;

    var recipient = (dom.transferRecipient.value || '').trim();
    if (!recipient || !ethers.isAddress(recipient)) {
      showToast('Please enter a valid Ethereum address', 'error');
      return;
    }

    var ownAddress = (Wallet.getAddress() || '').toLowerCase();
    if (recipient.toLowerCase() === ownAddress) {
      showToast('Cannot transfer to your own address', 'error');
      return;
    }

    var nftAddress = nft.contractAddress || (nft.channel && nft.channel.address) || '';
    var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '0';

    dom.transferConfirmBtn.disabled = true;
    dom.transferStatus.textContent = 'Submitting transaction...';
    dom.transferStatus.className = 'modal-status pending';
    dom.transferStatus.classList.remove('hidden');

    Wallet.transferNFT(nftAddress, tokenId, recipient, false)
      .then(function () {
        dom.transferStatus.textContent = 'Transfer submitted!';
        dom.transferStatus.className = 'modal-status success';
        showToast('NFT transfer submitted!', 'success');
        setTimeout(function () {
          closeTransferModal();
          loadMyAssets();
        }, 2000);
      })
      .catch(function (err) {
        if (err.message && (err.message.indexOf('rejected') !== -1 || err.message.indexOf('denied') !== -1)) {
          dom.transferStatus.classList.add('hidden');
          dom.transferConfirmBtn.disabled = false;
          return;
        }
        dom.transferStatus.textContent = decodeContractError(err.message) || 'Transaction failed';
        dom.transferStatus.className = 'modal-status error';
        dom.transferConfirmBtn.disabled = false;
      });
  }

  function goBack() {
    state.detailItem = null;
    switchView(state.previousView || 'feed');
  }

  // ── Channel View ───────────────────────────────────

  var SUBS_STORAGE_KEY = 'elacity-subscriptions';

  function getLocalSubscriptions() {
    try {
      return JSON.parse(localStorage.getItem(SUBS_STORAGE_KEY) || '[]');
    } catch (e) { return []; }
  }

  function saveLocalSubscriptions(subs) {
    localStorage.setItem(SUBS_STORAGE_KEY, JSON.stringify(subs));
  }

  function openChannel(channelAddress) {
    if (!channelAddress) return;
    switchView('channel');

    state.channelData = null;
    state.channelItems = [];
    state.channelSubscribers = null;
    state.channelLoading = true;

    dom.channelPageName.textContent = 'Loading...';
    dom.channelPageStats.textContent = '';
    dom.channelDescription.textContent = '';
    dom.channelAvatarLg.innerHTML = '';
    dom.channelCover.innerHTML = '';
    dom.channelItemsGrid.innerHTML = '';
    dom.channelItemsEmpty.classList.add('hidden');
    dom.channelItemsLoading.classList.remove('hidden');
    dom.subscribeBtn.classList.remove('subscribed');
    dom.subscribeBtn.textContent = 'Subscribe';

    var signerAddr = ElacityAPI.getSignerAddress() || Wallet.getSignerAddress();

    Promise.all([
      ElacityAPI.retrieveChannel(channelAddress),
      ElacityAPI.listSubscribers(channelAddress, signerAddr || null),
      ElacityAPI.fetchChannelItems(channelAddress, 0, 40)
    ])
      .then(function (results) {
        var channel = results[0];
        var subscribers = results[1];
        var items = results[2];

        state.channelLoading = false;
        state.channelData = channel;
        state.channelSubscribers = subscribers;

        if (!channel) {
          showToast('Channel not found', 'error');
          goBack();
          return;
        }

        renderChannelPage(channel, subscribers, items);
      })
      .catch(function (err) {
        state.channelLoading = false;
        dom.channelItemsLoading.classList.add('hidden');
        showToast('Failed to load channel: ' + err.message, 'error');
      });
  }

  function renderChannelPage(channel, subscribers, items) {
    var creator = channel.creator || {};
    var creatorName = (creator.did && creator.did.credentials && creator.did.credentials.name) ||
      creator.alias || formatAddress(creator.address || '');

    dom.channelPageName.textContent = channel.name || creatorName || 'Untitled Channel';

    var statsText = '';
    if (subscribers && subscribers.count != null) {
      statsText += subscribers.count + ' subscriber' + (subscribers.count !== 1 ? 's' : '');
    }
    if (channel.itemsCount) {
      if (statsText) statsText += ' \u00B7 ';
      statsText += channel.itemsCount + ' item' + (channel.itemsCount !== 1 ? 's' : '');
    }
    dom.channelPageStats.textContent = statsText;

    dom.channelDescription.textContent = channel.description || '';

    var coverRaw = channel.coverImage || channel.coverImageURL || '';
    var coverLocal = resolveIpfsUrl(coverRaw, true);
    var coverExt = resolveIpfsUrl(coverRaw);
    if (coverLocal) {
      dom.channelCover.innerHTML = '<img src="' + escapeHtml(coverLocal) + '" alt="" onerror="if(this.src!==\'' + escapeHtml(coverExt) + '\'){this.src=\'' + escapeHtml(coverExt) + '\'}else{this.style.display=\'none\'}" />';
    }

    var avatarRaw = channel.image || channel.imageURL ||
      (creator.did && creator.did.credentials && creator.did.credentials.avatar && creator.did.credentials.avatar.thumbnail) ||
      creator.avatar || '';
    var avatarLocal = resolveIpfsUrl(avatarRaw, true);
    var avatarExt = resolveIpfsUrl(avatarRaw);
    if (avatarLocal) {
      dom.channelAvatarLg.innerHTML = '<img src="' + escapeHtml(avatarLocal) + '" alt="" onerror="if(this.src!==\'' + escapeHtml(avatarExt) + '\'){this.src=\'' + escapeHtml(avatarExt) + '\'}else{this.parentNode.textContent=\'' + (channel.name || '?').charAt(0).toUpperCase() + '\'}" />';
    } else {
      dom.channelAvatarLg.textContent = (channel.name || '?').charAt(0).toUpperCase();
    }

    var hasPlans = channel.plans && channel.plans.length > 0;
    if (subscribers && subscribers.isAmong) {
      dom.subscribeBtn.classList.add('subscribed');
      dom.subscribeBtn.textContent = hasPlans ? 'Subscribed' : 'Following';
    } else if (hasPlans) {
      var cheapest = channel.plans.reduce(function (min, p) { return p.price < min.price ? p : min; }, channel.plans[0]);
      dom.subscribeBtn.textContent = 'Subscribe from ' + formatPrice(cheapest.price, cheapest.payToken);
    } else {
      dom.subscribeBtn.textContent = 'Follow';
    }

    // Load plans from on-chain contract (source of truth) and check subscription
    if (Wallet.isConnected() && channel.address) {
      var subscriberAddr = Wallet.getSignerAddress() || Wallet.getAddress();
      Promise.all([
        Wallet.getPlans ? Wallet.getPlans(channel.address) : Promise.resolve([]),
        Wallet.checkSubscription ? Wallet.checkSubscription(channel.address, subscriberAddr) : Promise.resolve(false)
      ]).then(function (results) {
        var onChainPlans = results[0];
        var hasActiveSub = results[1];

        if (onChainPlans.length > 0) {
          var localPlans = channel.plans || [];
          channel.plans = onChainPlans.map(function (p) {
            var local = localPlans.find(function (lp) { return String(lp.planId) === String(p.planId); });
            return {
              planId: p.planId, payToken: p.payToken, price: p.price,
              duration: p.duration, active: p.active,
              label: (local && local.label) || ('Plan #' + p.planId),
              description: (local && local.description) || ''
            };
          }).filter(function (p) { return p.active !== false; });
          state.channelData = channel;
        }

        var plansExist = channel.plans && channel.plans.length > 0;
        if (hasActiveSub) {
          dom.subscribeBtn.classList.add('subscribed');
          dom.subscribeBtn.textContent = plansExist ? 'Subscribed' : 'Following';
        } else if (plansExist && !(subscribers && subscribers.isAmong)) {
          var cheapestPlan = channel.plans.reduce(function (min, p) { return p.price < min.price ? p : min; }, channel.plans[0]);
          dom.subscribeBtn.textContent = 'Subscribe from ' + formatPrice(cheapestPlan.price, cheapestPlan.payToken);
        }
      }).catch(function () {});
    }

    dom.channelItemsLoading.classList.add('hidden');

    var itemList = (items && (items.items || items.data)) || [];
    if (itemList.length === 0) {
      dom.channelItemsEmpty.classList.remove('hidden');
      return;
    }

    state.channelItems = itemList;
    itemList.forEach(function (item) {
      dom.channelItemsGrid.appendChild(renderCard(normalizeLedgerAsset(item)));
    });

    window.dispatchEvent(new CustomEvent('ela-channel-rendered', { detail: { channel: channel } }));
  }

  var SUBSCRIPTION_ABI = [
    { inputs: [{ type: 'address' }], name: 'hasActiveSubscription', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'paymentProcessor', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ type: 'uint8' }, { type: 'bool' }], name: 'subscribePlan', outputs: [], stateMutability: 'payable', type: 'function' }
  ];

  var ERC20_ABI = [
    { inputs: [{ type: 'address' }, { type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ type: 'address' }, { type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' }
  ];

  var ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

  function handleSubscribe() {
    var channel = state.channelData;
    if (!channel) return;

    var plans = channel.plans || [];
    if (plans.length > 0) {
      openSubscribeModal(channel, plans);
      return;
    }

    handleFollowToggle(channel);
  }

  function handleFollowToggle(channel) {
    dom.subscribeBtn.disabled = true;
    var authPromise;
    if (!Wallet.isConnected() || !ElacityAPI.isAuthenticated()) {
      authPromise = handleAuth().then(function () {
        if (!ElacityAPI.isAuthenticated()) throw new Error('Authentication required');
      });
    } else {
      authPromise = Promise.resolve();
    }

    var isSubscribed = dom.subscribeBtn.classList.contains('subscribed');
    authPromise
      .then(function () {
        return isSubscribed
          ? ElacityAPI.unsubscribeChannel(channel.address)
          : ElacityAPI.subscribeChannel(channel.address);
      })
      .then(function () {
        if (isSubscribed) {
          dom.subscribeBtn.classList.remove('subscribed');
          dom.subscribeBtn.textContent = 'Subscribe';
          removeLocalSubscription(channel.address);
          showToast('Unfollowed ' + (channel.name || 'channel'), 'success');
        } else {
          dom.subscribeBtn.classList.add('subscribed');
          dom.subscribeBtn.textContent = 'Subscribed';
          addLocalSubscription(channel);
          showToast('Following ' + (channel.name || 'channel'), 'success');
        }
        updateChannelStats(channel);
      })
      .catch(function (err) { showToast('Failed: ' + err.message, 'error'); })
      .finally(function () { dom.subscribeBtn.disabled = false; });
  }

  function updateChannelStats(channel) {
    var statsText = (state.channelSubscribers ? state.channelSubscribers.count : 0) +
      ' subscriber' + ((state.channelSubscribers && state.channelSubscribers.count !== 1) ? 's' : '');
    if (channel.itemsCount) statsText += ' \u00B7 ' + channel.itemsCount + ' item' + (channel.itemsCount !== 1 ? 's' : '');
    dom.channelPageStats.textContent = statsText;
  }

  // Render a duration object (e.g. {value: 30, unit: 'days'}) as a
  // human-friendly string ("30 days", "1 month", "1 year"). Singularises
  // the unit when value is 1.
  function subscriptionDurationToHuman(duration) {
    if (!duration || !duration.value) return 'the plan duration';
    var unit = duration.unit || 'days';
    var unitLabel = (Number(duration.value) === 1) ? unit.replace(/s$/, '') : unit;
    return duration.value + ' ' + unitLabel;
  }

  // Pick the most informative primary label for a plan in the subscribe
  // modal. Description wins (it's user-typed), then a meaningful label,
  // then a duration-derived fallback. Filters out the auto-generated
  // "Plan #N" placeholder so we don't show a useless label.
  function subscriptionPlanLabel(plan, durationHuman) {
    var desc = (plan.description || '').trim();
    if (desc) return desc;
    var lbl = (plan.label || '').trim();
    if (lbl && !/^Plan\s*#\d+$/i.test(lbl)) return lbl;
    return durationHuman + ' subscription';
  }

  function openSubscribeModal(channel, plans) {
    state.selectedPlan = null;
    state.selectedSubWallet = null;
    var modalEl = document.getElementById('subscribe-modal');
    var titleEl = document.getElementById('sub-modal-title');
    var plansEl = document.getElementById('sub-modal-plans');
    var confirmEl = document.getElementById('sub-modal-confirm');
    var statusEl = document.getElementById('sub-modal-status');
    var pickerEl = document.getElementById('sub-wallet-picker');
    var saOptEl = document.getElementById('sub-wallet-sa');
    var eoaOptEl = document.getElementById('sub-wallet-eoa');

    titleEl.textContent = 'Subscribe to ' + (channel.name || 'Channel');
    statusEl.textContent = '';
    statusEl.className = 'sub-modal-status';
    confirmEl.disabled = true;
    confirmEl.textContent = 'Select a plan';
    pickerEl.classList.add('hidden');
    saOptEl.classList.remove('selected');
    eoaOptEl.classList.remove('selected');

    var hasSA = Wallet.isConnected() && Wallet.hasSmartAccount();
    var eoaAddr = Wallet.getAddress() || '';
    var saAddr = Wallet.getSmartAccountAddress() || '';

    document.getElementById('sub-wallet-eoa-addr').textContent = eoaAddr ? (eoaAddr.slice(0, 6) + '...' + eoaAddr.slice(-4)) : '';
    document.getElementById('sub-wallet-sa-addr').textContent = saAddr ? (saAddr.slice(0, 6) + '...' + saAddr.slice(-4)) : '';
    document.getElementById('sub-wallet-eoa-bal').textContent = '';
    document.getElementById('sub-wallet-sa-bal').textContent = '';

    function updateConfirmButton() {
      var plan = state.selectedPlan;
      var wallet = state.selectedSubWallet;
      if (!plan) {
        confirmEl.disabled = true;
        confirmEl.textContent = 'Select a plan';
      } else if (hasSA && !wallet) {
        confirmEl.disabled = true;
        confirmEl.textContent = 'Select a wallet';
      } else {
        confirmEl.disabled = false;
        var priceStr = formatPrice(plan.price, plan.payToken);
        confirmEl.textContent = 'Subscribe for ' + priceStr;
      }
    }

    function fetchBalances(payToken) {
      var isNative = !payToken || payToken === ADDRESS_ZERO;
      var fetchFn = isNative ? Wallet.getNativeBalance : function (addr) { return Wallet.getERC20Balance(payToken, addr); };
      var decimals = isNative ? 18 : null;

      var decPromise = decimals !== null ? Promise.resolve(decimals) : Wallet.getTokenDecimals(payToken);
      decPromise.then(function (dec) {
        if (eoaAddr) {
          fetchFn(eoaAddr).then(function (raw) {
            var human = Number(ethers.formatUnits(raw, dec));
            var symbol = isNative ? 'ETH' : (payToken.toLowerCase() === Wallet.USDC_ADDRESS.toLowerCase() ? 'USDC' : '');
            document.getElementById('sub-wallet-eoa-bal').textContent = human.toFixed(dec <= 6 ? 2 : 4) + (symbol ? ' ' + symbol : '');
          });
        }
        if (hasSA && saAddr) {
          fetchFn(saAddr).then(function (raw) {
            var human = Number(ethers.formatUnits(raw, dec));
            var symbol = isNative ? 'ETH' : (payToken.toLowerCase() === Wallet.USDC_ADDRESS.toLowerCase() ? 'USDC' : '');
            document.getElementById('sub-wallet-sa-bal').textContent = human.toFixed(dec <= 6 ? 2 : 4) + (symbol ? ' ' + symbol : '');
          });
        }
      });
    }

    plansEl.innerHTML = '';
    plans.forEach(function (plan) {
      var option = document.createElement('div');
      option.className = 'sub-plan-option';
      option.dataset.planId = plan.planId;

      var priceStr = formatPrice(plan.price, plan.payToken);
      var durationHuman = subscriptionDurationToHuman(plan.duration);
      var primaryLabel = subscriptionPlanLabel(plan, durationHuman);
      // Show duration on its own line so subscribers always know the term,
      // even when the plan label is the auto-generated "Plan #N" placeholder
      // or when description is empty.
      var subLine = 'Access for ' + durationHuman;
      if (plan.description && plan.description.trim() && plan.description.trim() !== primaryLabel) {
        subLine += ' \u00b7 ' + plan.description.trim();
      }

      option.innerHTML =
        '<div class="sub-plan-radio"></div>' +
        '<div class="sub-plan-details">' +
          '<div class="sub-plan-label">' + escapeHtml(primaryLabel) + '</div>' +
          '<div class="sub-plan-desc">' + escapeHtml(subLine) + '</div>' +
        '</div>' +
        '<div class="sub-plan-price">' + priceStr + '</div>';

      option.addEventListener('click', function () {
        plansEl.querySelectorAll('.sub-plan-option').forEach(function (o) { o.classList.remove('selected'); });
        option.classList.add('selected');
        state.selectedPlan = plan;

        if (hasSA) {
          pickerEl.classList.remove('hidden');
          fetchBalances(plan.payToken);
        } else {
          state.selectedSubWallet = 'eoa';
        }
        updateConfirmButton();
      });

      plansEl.appendChild(option);
    });

    function selectWallet(walletKey) {
      state.selectedSubWallet = walletKey;
      saOptEl.classList.toggle('selected', walletKey === 'sa');
      eoaOptEl.classList.toggle('selected', walletKey === 'eoa');
      updateConfirmButton();
    }

    saOptEl.onclick = function () { selectWallet('sa'); };
    eoaOptEl.onclick = function () { selectWallet('eoa'); };

    if (!hasSA && Wallet.isConnected()) {
      state.selectedSubWallet = 'eoa';
    }

    modalEl.classList.remove('hidden');
  }

  function closeSubscribeModal() {
    document.getElementById('subscribe-modal').classList.add('hidden');
    state.selectedPlan = null;
    state.selectedSubWallet = null;
  }

  function executeSubscription() {
    var channel = state.channelData;
    var plan = state.selectedPlan;
    var walletChoice = state.selectedSubWallet;
    if (!channel || !plan) return;

    var confirmEl = document.getElementById('sub-modal-confirm');
    var statusEl = document.getElementById('sub-modal-status');

    confirmEl.disabled = true;
    confirmEl.textContent = 'Processing...';
    statusEl.textContent = 'Connecting wallet...';
    statusEl.className = 'sub-modal-status processing';

    var authPromise;
    if (!Wallet.isConnected() || !ElacityAPI.isAuthenticated()) {
      authPromise = handleAuth().then(function () {
        if (!ElacityAPI.isAuthenticated()) throw new Error('Authentication required');
      });
    } else {
      authPromise = Promise.resolve();
    }

    var isNative = !plan.payToken || plan.payToken === ADDRESS_ZERO;
    var fromWallet = walletChoice === 'sa' ? 'sa' : undefined;

    authPromise
      .then(function () {
        statusEl.textContent = 'Preparing transaction...';
        return Wallet.getTokenDecimals(isNative ? null : plan.payToken);
      })
      .then(function (decimals) {
        var priceWei = ethers.parseUnits(String(plan.price), decimals).toString();
        statusEl.textContent = 'Confirm in your wallet...';
        return Wallet.subscribeChannel(channel.address, plan.planId, plan.payToken, priceWei, fromWallet);
      })
      .then(function () {
        statusEl.textContent = '';
        closeSubscribeModal();
        dom.subscribeBtn.classList.add('subscribed');
        dom.subscribeBtn.textContent = 'Subscribed';
        addLocalSubscription(channel);
        showToast('Subscribed to ' + (channel.name || 'channel') + '!', 'success');
      })
      .catch(function (err) {
        var msg = err.reason || err.message || 'Transaction failed';
        if (msg.indexOf('user rejected') !== -1 || msg.indexOf('ACTION_REJECTED') !== -1) {
          msg = 'Transaction cancelled';
        }
        statusEl.textContent = msg;
        statusEl.className = 'sub-modal-status error';
        confirmEl.disabled = false;
        confirmEl.textContent = 'Try again';
      });
  }

  function addLocalSubscription(channel) {
    var subs = getLocalSubscriptions();
    var exists = subs.some(function (s) { return s.address.toLowerCase() === channel.address.toLowerCase(); });
    if (!exists) {
      subs.push({
        address: channel.address,
        name: channel.name,
        image: channel.image || channel.imageURL,
        imageURL: channel.imageURL,
        itemsCount: channel.itemsCount
      });
      saveLocalSubscriptions(subs);
    }
  }

  function removeLocalSubscription(channelAddress) {
    var subs = getLocalSubscriptions().filter(function (s) {
      return s.address.toLowerCase() !== channelAddress.toLowerCase();
    });
    saveLocalSubscriptions(subs);
  }

  // ── Subscriptions View ──────────────────────────────

  function renderChannelCard(channel) {
    var card = document.createElement('div');
    card.className = 'subscription-card';

    var creatorName = '';
    if (channel.creator) {
      creatorName = (channel.creator.did && channel.creator.did.credentials && channel.creator.did.credentials.name) ||
        channel.creator.alias || formatAddress(channel.creator.address || '');
    }

    card.innerHTML =
      '<div class="sub-avatar">' +
        renderAvatar(channel.imageURL, channel.name) +
      '</div>' +
      '<div class="sub-info">' +
        '<div class="sub-name">' + escapeHtml(channel.name || 'Unknown Channel') + '</div>' +
        '<div class="sub-meta">' + (channel.itemsCount || 0) + ' items' +
          (creatorName ? ' \u00B7 ' + escapeHtml(creatorName) : '') +
        '</div>' +
      '</div>';

    card.addEventListener('click', function () {
      openChannel(channel.address);
    });

    return card;
  }

  function syncSubscriptionsFromAPI() {
    var addr = Wallet.getSignerAddress();
    if (!addr || !ElacityAPI.isAuthenticated()) return;

    ElacityAPI.fetchSubscriptions(addr).then(function (apiSubs) {
      if (!apiSubs || apiSubs.length === 0) return;
      var local = getLocalSubscriptions();
      var localAddrs = {};
      local.forEach(function (s) { localAddrs[s.address.toLowerCase()] = true; });

      var merged = false;
      apiSubs.forEach(function (sub) {
        var ch = sub.channel;
        if (!ch || !ch.address) return;
        if (!localAddrs[ch.address.toLowerCase()]) {
          local.push({
            address: ch.address,
            name: ch.name,
            image: ch.image || ch.imageURL,
            imageURL: ch.imageURL,
            itemsCount: ch.itemsCount
          });
          merged = true;
        }
      });

      if (merged) saveLocalSubscriptions(local);
    });
  }

  function renderSubscriptionsView() {
    var subs = getLocalSubscriptions();

    dom.subsGrid.innerHTML = '';
    dom.subsLoading.classList.add('hidden');

    if (subs.length === 0) {
      dom.subsEmpty.classList.remove('hidden');
    } else {
      dom.subsEmpty.classList.add('hidden');
      subs.forEach(function (channel) {
        dom.subsGrid.appendChild(renderChannelCard(channel));
      });
    }
  }

  // ── Channels Directory ─────────────────────────────

  function loadChannelsDirectory() {
    if (state.channelsDirLoaded) {
      renderChannelsDirectory();
      return;
    }

    dom.channelsDirGrid.innerHTML = '';
    dom.channelsDirList.innerHTML = '';
    dom.channelsDirEmpty.classList.add('hidden');
    dom.channelsDirLoading.classList.remove('hidden');

    ElacityAPI.fetchChannels(0, 50)
      .then(function (result) {
        dom.channelsDirLoading.classList.add('hidden');

        if (!result || !result.data || result.data.length === 0) {
          dom.channelsDirEmpty.classList.remove('hidden');
          return;
        }

        state.channelsDirData = result.data;
        state.channelsDirLoaded = true;
        renderChannelsDirectory();
      })
      .catch(function (err) {
        dom.channelsDirLoading.classList.add('hidden');
        showToast('Failed to load channels: ' + err.message, 'error');
      });
  }

  function getFilteredChannels() {
    if (state.channelsDirCategory === 'all') return state.channelsDirData;
    return state.channelsDirData.filter(function (ch) {
      return ch.categories && ch.categories.indexOf(state.channelsDirCategory) !== -1;
    });
  }

  function getOwnerName(ch) {
    if (!ch.creator) return '';
    var c = ch.creator;
    return (c.did && c.did.credentials && c.did.credentials.name) || c.alias || formatAddress(c.address || '');
  }

  function getOwnerAvatar(ch) {
    if (ch.creator) {
      var c = ch.creator;
      var didThumb = c.did && c.did.credentials && c.did.credentials.avatar && c.did.credentials.avatar.thumbnail;
      if (didThumb && resolveIpfsUrl(didThumb)) return resolveIpfsUrl(didThumb);
      if (c.avatar && resolveIpfsUrl(c.avatar)) return resolveIpfsUrl(c.avatar);
    }
    if (ch.image && resolveIpfsUrl(ch.image)) return resolveIpfsUrl(ch.image);
    if (ch.imageURL && resolveIpfsUrl(ch.imageURL)) return resolveIpfsUrl(ch.imageURL);
    return '';
  }

  function getEntryPrice(ch) {
    var floor = ch.statistics && ch.statistics.floor;
    if (!floor || !floor.price) return null;
    if (floor.price <= 0) return null;
    var symbol = getTokenSymbol(floor.paymentToken);
    var formatted = floor.price < 0.01 ? floor.price.toExponential(2) : floor.price.toFixed(2);
    return formatted + ' ' + symbol;
  }

  function renderChannelsDirectory() {
    var channels = getFilteredChannels();
    if (state.channelsDirViewMode === 'grid') {
      renderChannelsGridView(channels);
      dom.channelsDirGrid.classList.remove('hidden');
      dom.channelsDirList.classList.add('hidden');
    } else {
      renderChannelsListView(channels);
      dom.channelsDirList.classList.remove('hidden');
      dom.channelsDirGrid.classList.add('hidden');
    }
  }

  function renderChannelsGridView(channels) {
    dom.channelsDirGrid.innerHTML = '';

    if (channels.length === 0) {
      dom.channelsDirEmpty.classList.remove('hidden');
      return;
    }
    dom.channelsDirEmpty.classList.add('hidden');

    channels.forEach(function (ch) {
      var card = document.createElement('div');
      card.className = 'dir-card';

      var coverRaw = ch.coverImage || ch.coverImageURL || ch.image || ch.imageURL || '';
      var coverLocal = resolveIpfsUrl(coverRaw, true);
      var coverExt = resolveIpfsUrl(coverRaw);
      var ownerName = escapeHtml(getOwnerName(ch));
      var subs = (ch.statistics && ch.statistics.subscribers) || 0;
      var category = (ch.categories && ch.categories[0]) || '';
      var entry = getEntryPrice(ch);

      card.innerHTML =
        '<div class="dir-card-cover">' +
          (coverLocal ? '<img src="' + escapeHtml(coverLocal) + '" alt="" loading="lazy" onerror="if(this.src!==\'' + escapeHtml(coverExt) + '\'){this.src=\'' + escapeHtml(coverExt) + '\'}else{this.style.display=\'none\'}" />' : '') +
          '<span class="dir-subs-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ' + subs + '</span>' +
          (category ? '<span class="dir-cat-badge">' + escapeHtml(category) + '</span>' : '') +
        '</div>' +
        '<div class="dir-card-body">' +
          '<div class="dir-card-avatar">' +
            renderAvatar(getOwnerAvatar(ch), ownerName) +
          '</div>' +
          '<div class="dir-card-info">' +
            '<div class="dir-card-name">' + escapeHtml(ch.name || 'Untitled') + '</div>' +
            '<div class="dir-card-meta">' + (ch.itemsCount || 0) + ' items' +
              (ownerName ? ' \u00B7 by ' + ownerName : '') +
            '</div>' +
          '</div>' +
          (entry ? '<div class="dir-card-entry">' + entry + '</div>' : '') +
        '</div>';

      card.addEventListener('click', function () {
        openChannel(ch.address);
      });

      dom.channelsDirGrid.appendChild(card);
    });
  }

  function renderChannelsListView(channels) {
    dom.channelsDirList.innerHTML = '';

    if (channels.length === 0) {
      dom.channelsDirEmpty.classList.remove('hidden');
      return;
    }
    dom.channelsDirEmpty.classList.add('hidden');

    var header = document.createElement('div');
    header.className = 'dir-list-header';
    header.innerHTML = '<div>Name</div><div>Owner</div><div>Items</div><div>Subs</div><div>Entry</div><div></div>';
    dom.channelsDirList.appendChild(header);

    channels.forEach(function (ch) {
      var row = document.createElement('div');
      row.className = 'dir-list-row';

      var imgRaw = ch.image || ch.imageURL || '';
      var imgLocal = resolveIpfsUrl(imgRaw, true);
      var imgExt = resolveIpfsUrl(imgRaw);
      var ownerName = escapeHtml(getOwnerName(ch));
      var subs = (ch.statistics && ch.statistics.subscribers) || 0;
      var category = (ch.categories && ch.categories[0]) || '';
      var entry = getEntryPrice(ch);

      row.innerHTML =
        '<div class="dir-list-name">' +
          (imgLocal ? '<img src="' + escapeHtml(imgLocal) + '" alt="" onerror="if(this.src!==\'' + escapeHtml(imgExt) + '\'){this.src=\'' + escapeHtml(imgExt) + '\'}else{this.style.display=\'none\'}" />' : '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--accent)">' + (ch.name || '?').charAt(0).toUpperCase() + '</div>') +
          '<div class="dir-list-name-text"><strong>' + escapeHtml(ch.name || 'Untitled') + '</strong>' +
            (category ? '<small>' + escapeHtml(category) + '</small>' : '') +
          '</div>' +
        '</div>' +
        '<div class="dir-list-owner">' + ownerName + '</div>' +
        '<div class="dir-list-cell">' + (ch.itemsCount || 0) + '</div>' +
        '<div class="dir-list-cell">' + subs + '</div>' +
        '<div class="dir-list-entry' + (entry ? ' has-entry' : '') + '">' + (entry || 'Free') + '</div>' +
        '<div class="dir-list-action"><button class="dir-sub-btn" data-address="' + escapeHtml(ch.address) + '">View</button></div>';

      row.addEventListener('click', function () {
        openChannel(ch.address);
      });

      dom.channelsDirList.appendChild(row);
    });
  }

  // ── Detail Interactions (Save + Like) ────────────────

  function loadDetailInteractions(contractAddress, tokenId) {
    var signerAddr = ElacityAPI.getSignerAddress() || Wallet.getSignerAddress();

    ElacityAPI.fetchLikesByToken(contractAddress, tokenId, signerAddr || null)
      .then(function (likes) {
        state.detailLikes = likes;
        dom.likeCount.textContent = likes.count > 0 ? likes.count : '';
        if (likes.isAmong) dom.likeBtn.classList.add('liked');
      })
      .catch(function () {});

    if (ElacityAPI.isAuthenticated()) {
      ElacityAPI.isSavedToLater(contractAddress, tokenId)
        .then(function (saved) {
          state.detailSaved = saved;
          if (saved) {
            dom.saveBtn.classList.add('saved');
            dom.saveLabel.textContent = 'Saved';
          }
        })
        .catch(function () {});
    }
  }

  function handleSave() {
    if (!ElacityAPI.isAuthenticated()) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    var contractAddress = state.detailContractAddress;
    var tokenId = state.detailTokenId;
    if (!contractAddress || !tokenId) return;

    dom.saveBtn.disabled = true;

    var ensurePlaylist = state.watchLaterPlaylistId
      ? Promise.resolve(state.watchLaterPlaylistId)
      : ElacityAPI.getUserPlaylist().then(function (playlists) {
          if (playlists && playlists.length > 0) {
            state.watchLaterPlaylistId = playlists[0]._id;
            return playlists[0]._id;
          }
          return null;
        });

    ensurePlaylist
      .then(function (playlistId) {
        if (!playlistId) {
          showToast('Could not find your watch later playlist', 'error');
          return;
        }

        if (state.detailSaved) {
          return ElacityAPI.removePlaylistItem(playlistId, contractAddress, tokenId)
            .then(function () {
              state.detailSaved = false;
              dom.saveBtn.classList.remove('saved');
              dom.saveLabel.textContent = 'Save';
              showToast('Removed from Watch Later', 'success');
            });
        } else {
          return ElacityAPI.addPlaylistItem(playlistId, contractAddress, tokenId)
            .then(function () {
              state.detailSaved = true;
              dom.saveBtn.classList.add('saved');
              dom.saveLabel.textContent = 'Saved';
              showToast('Added to Watch Later', 'success');
            });
        }
      })
      .catch(function (err) {
        showToast('Save failed: ' + err.message, 'error');
      })
      .finally(function () {
        dom.saveBtn.disabled = false;
      });
  }

  function handleLike() {
    if (!ElacityAPI.isAuthenticated()) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    var contractAddress = state.detailContractAddress;
    var tokenId = state.detailTokenId;
    if (!contractAddress || !tokenId) return;

    dom.likeBtn.disabled = true;

    ElacityAPI.toggleLike(contractAddress, tokenId)
      .then(function () {
        var wasLiked = dom.likeBtn.classList.contains('liked');
        if (wasLiked) {
          dom.likeBtn.classList.remove('liked');
          if (state.detailLikes) state.detailLikes.count = Math.max(0, state.detailLikes.count - 1);
        } else {
          dom.likeBtn.classList.add('liked');
          if (state.detailLikes) state.detailLikes.count = (state.detailLikes.count || 0) + 1;
        }
        dom.likeCount.textContent = (state.detailLikes && state.detailLikes.count > 0) ? state.detailLikes.count : '';
      })
      .catch(function (err) {
        showToast('Like failed: ' + err.message, 'error');
      })
      .finally(function () {
        dom.likeBtn.disabled = false;
      });
  }

  // ── Watch Later View ───────────────────────────────

  function loadWatchLater() {
    if (!ElacityAPI.isAuthenticated()) {
      dom.watchlaterGrid.innerHTML = '';
      dom.watchlaterLoading.classList.add('hidden');
      dom.watchlaterEmpty.classList.remove('hidden');
      dom.watchlaterEmpty.querySelector('h3').textContent = 'Sign in to see saved items';
      dom.watchlaterEmpty.querySelector('p').textContent = 'Connect your wallet to access your watch later list.';
      return;
    }

    if (state.watchLaterLoading) return;
    state.watchLaterLoading = true;

    dom.watchlaterGrid.innerHTML = '';
    dom.watchlaterEmpty.classList.add('hidden');
    dom.watchlaterLoading.classList.remove('hidden');

    ElacityAPI.getUserPlaylist()
      .then(function (playlists) {
        if (!playlists || playlists.length === 0) {
          state.watchLaterLoading = false;
          dom.watchlaterLoading.classList.add('hidden');
          dom.watchlaterEmpty.classList.remove('hidden');
          return;
        }

        var playlist = playlists[0];
        state.watchLaterPlaylistId = playlist._id;

        if (!playlist.contents || playlist.contents.length === 0) {
          state.watchLaterLoading = false;
          dom.watchlaterLoading.classList.add('hidden');
          dom.watchlaterEmpty.classList.remove('hidden');
          return;
        }

        var MAX_RESOLVE = 20;
        var toResolve = playlist.contents.slice(0, MAX_RESOLVE);
        var fetches = toResolve.map(function (item) {
          return ElacityAPI.fetchAssetFromCatalog(item.contractAddress, item.tokenId)
            .catch(function () { return null; });
        });

        return Promise.all(fetches).then(function (results) {
          state.watchLaterLoading = false;
          dom.watchlaterLoading.classList.add('hidden');

          var validItems = results.filter(function (r) { return r !== null; });

          if (validItems.length === 0) {
            dom.watchlaterEmpty.classList.remove('hidden');
            return;
          }

          state.watchLaterItems = validItems;

          validItems.forEach(function (nft, idx) {
            var cardItem = {
              contractAddress: nft.contractAddress || nft.address || (nft.channel ? nft.channel.address : ''),
              hexTokenID: (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '',
              tokenID: (nft.tokenId && nft.tokenId.tokenID) || '',
              name: nft.name || (nft.metadata && nft.metadata.name) || 'Untitled',
              imageURL: nft.image || (nft.metadata && nft.metadata.media && nft.metadata.media.previewURL) || '',
              channel: nft.channel,
              owner: null,
              views: nft.views,
              price: null,
              paymentToken: null,
              metadata: nft.metadata,
              operative: nft.operative
            };
            var owned = isAssetInLibrary(cardItem);
            dom.watchlaterGrid.appendChild(renderCard(cardItem, owned, idx));
          });
        });
      })
      .catch(function (err) {
        state.watchLaterLoading = false;
        dom.watchlaterLoading.classList.add('hidden');
        showToast('Failed to load watch later: ' + err.message, 'error');
      });
  }

  // ── Share ───────────────────────────────────────────

  function handleShare() {
    var nft = state.detailItem;
    if (!nft) return;
    var url = window.location.origin + window.location.pathname +
      '#asset/' + (nft.contractAddress || '') + '/' + (nft.hexTokenID || nft.tokenId || '0');
    if (navigator.share) {
      navigator.share({ title: (nft.metadata && nft.metadata.name) || nft.name || 'Elacity Asset', url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('Link copied to clipboard', 'success');
      });
    }
  }

  // ── Preview Flow ─────────────────────────────────────

  function handlePreview() {
    var nft = state.detailItem;
    if (!nft) return;
    var media = (nft.metadata && nft.metadata.media) || {};
    var previewUrl = media.previewURL ? resolveIpfsUrl(media.previewURL) : '';
    if (!previewUrl) return;

    var contentType = media.contentType || '';

    dom.detailImage.style.display = 'none';
    dom.previewPlayer.classList.remove('hidden');

    if (contentType.indexOf('audio') !== -1) {
      dom.previewPlayer.innerHTML = '<audio controls autoplay src="' + escapeHtml(previewUrl) + '"></audio>';
    } else {
      dom.previewPlayer.innerHTML = '<video controls autoplay src="' + escapeHtml(previewUrl) + '"></video>';
    }

    dom.previewBtn.classList.add('hidden');
  }

  // ── Play Flow ────────────────────────────────────────

  function handlePlay() {
    var nft = state.detailItem;
    if (!nft) return;

    // Non-media assets (images, PDFs, etc.) should open in the viewer, not the media player
    if (isNonMediaAsset(nft)) {
      handleOpenInViewer();
      return;
    }

    var meta = nft.metadata || {};
    var media = meta.media || {};
    var rawAsset = nft._rawAsset || meta.asset || {};
    var props = meta.properties || {};
    var title = meta.name || nft.name || 'Untitled';
    var mediaUri = (media.uri || rawAsset.cid || rawAsset.uri || '').replace('ipfs://', '');
    var tokenURI = (nft.tokenURI || '').replace('ipfs://', '');

    // ── Cleartext / direct-playback path ──
    // Free assets (opType === 0) and any asset whose metadata explicitly
    // declares `cleartext: true` or `directPlayback: true` are stored as
    // a single MP4 (or other media file) on IPFS — NOT as a fragmented
    // DASH bundle with stream.mpd. Trying to play them through the
    // encrypted-DASH flow (Lit auth + /api/media/init + MPD fetch) will
    // always fail with "Failed to fetch MPD from both gateways: 404"
    // because no MPD exists. Launch the player in cleartext mode with
    // a direct file URL — no auth, no DASH, just <video src="...">.
    var opType = (nft.operative && nft.operative.opType) || 0;
    var isCleartext = opType === 0 || rawAsset.cleartext === true || rawAsset.directPlayback === true;

    if (isCleartext) {
      if (!mediaUri) {
        showToast('Missing content URI for playback', 'error');
        return;
      }
      var mimeType = media.contentType || rawAsset.mimeType || media.mimeType || '';
      window.parent.postMessage({
        msg: 'launchApp',
        appName: 'pc2-media-runtime',
        windowTitle: title + ' — Elacity Player',
        args: {
          cleartext: true,
          fileUrl: '/ipfs/' + mediaUri,
          mediaUri: mediaUri,
          title: title,
          mimeType: mimeType,
          thumbnail: (function () {
            var url = resolveIpfsUrl(nft.image || '') || resolveIpfsUrl((meta.media || {}).previewURL || '') || getImageUrl(nft);
            return url;
          })(),
        },
      }, '*');
      return;
    }

    // ── Encrypted DASH path ──
    var channel = (nft.channel && nft.channel.address) || nft.contractAddress || '';
    var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || nft.hexTokenID || '';

    if (!channel || !tokenId) {
      showToast('Missing content identity for playback', 'error');
      return;
    }

    var walletAddr = getBuyerAddressForAsset(nft) || Wallet.getAddress() || '';

    if (!walletAddr) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    console.log('[handlePlay] Using buyer address:', walletAddr, 'ownerWallet:', getAssetOwnerWallet(nft));
    var checksumAddr = ethers.getAddress(walletAddr);
    showToast('Preparing Lit authentication...', 'info');

    // Phase 1: Ask the server to start a Lit session and return the SIWE message
    prepareLitAuth(checksumAddr).then(function (prepareResult) {

      // Chipotle mode: server returns siweMessage=null, no signing needed
      var authSigPromise;
      if (prepareResult.chipotleMode || !prepareResult.siweMessage) {
        authSigPromise = Promise.resolve({
          sig: '0x',
          derivedVia: 'chipotle-api-key',
          signedMessage: '',
          address: checksumAddr
        });
      } else {
        showToast('Please sign the Lit authentication message...', 'info');
        authSigPromise = Wallet.signMessage(prepareResult.siweMessage).then(function (sig) {
          return {
            sig: sig,
            derivedVia: 'web3.eth.personal.sign',
            signedMessage: prepareResult.siweMessage,
            address: checksumAddr
          };
        });
      }

      return authSigPromise.then(function (authSig) {
        window.parent.postMessage({
          msg: 'launchApp',
          appName: 'pc2-media-runtime',
          windowTitle: title + ' — Elacity Player',
          args: {
            channel: channel,
            tokenId: tokenId,
            mediaUri: mediaUri,
            tokenURI: tokenURI,
            title: title,
            authority: props.authority || '',
            buyerAddress: checksumAddr,
            requestId: prepareResult.requestId,
            litAuthSig: authSig,
            thumbnail: (function() {
              var url = resolveIpfsUrl(nft.image || '') || resolveIpfsUrl((meta.media || {}).previewURL || '') || getImageUrl(nft);
              console.log('[handlePlay] thumbnail URL:', url);
              return url;
            })()
          }
        }, '*');
      });
    }).catch(function (err) {
      console.error('[Play] Auth flow failed:', err);
      showToast('Playback auth failed: ' + (err.message || err), 'error');
    });
  }

  function prepareLitAuth(buyerAddress) {
    return pc2Fetch('/api/media/prepare-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerAddress: buyerAddress })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.error || 'prepare-auth failed');
        });
      }
      return res.json();
    });
  }

  // ── Purchase Flow ────────────────────────────────────

  // payToken + priceWei are optional but recommended: when supplied the modal
  // fetches each wallet's balance of the asset's payment token and shows it
  // beneath the address, plus a low-balance warning class when the wallet
  // can't cover priceWei. Balance loads asynchronously and never blocks the
  // user from picking a wallet — they can still proceed and let the on-chain
  // tx itself revert if balance is insufficient.
  function showWalletChoiceModal(payToken, priceWei) {
    return new Promise(function (resolve, reject) {
      var modal = document.getElementById('wallet-choice-modal');
      var saBtn = document.getElementById('wallet-choice-sa');
      var eoaBtn = document.getElementById('wallet-choice-eoa');
      var cancelBtn = document.getElementById('wallet-choice-cancel');
      var saAddrEl = document.getElementById('wallet-choice-sa-addr');
      var eoaAddrEl = document.getElementById('wallet-choice-eoa-addr');
      var saBalEl = document.getElementById('wallet-choice-sa-bal');
      var eoaBalEl = document.getElementById('wallet-choice-eoa-bal');

      var sa = Wallet.getSmartAccountAddress() || Wallet.getSignerAddress();
      var eoa = Wallet.getAddress();
      saAddrEl.textContent = sa ? (sa.slice(0, 6) + '...' + sa.slice(-4)) : '';
      eoaAddrEl.textContent = eoa ? (eoa.slice(0, 6) + '...' + eoa.slice(-4)) : '';
      if (saBalEl) { saBalEl.textContent = ''; saBalEl.classList.remove('insufficient'); }
      if (eoaBalEl) { eoaBalEl.textContent = ''; eoaBalEl.classList.remove('insufficient'); }

      modal.classList.remove('hidden');

      if (payToken && (sa || eoa)) {
        var isNative = !payToken || payToken === ADDRESS_ZERO;
        var fetchFn = isNative
          ? Wallet.getNativeBalance
          : function (addr) { return Wallet.getERC20Balance(payToken, addr); };
        var decPromise = isNative
          ? Promise.resolve(18)
          : (Wallet.getTokenDecimals ? Wallet.getTokenDecimals(payToken) : Promise.resolve(6));
        var symbol = isNative
          ? 'ETH'
          : (Wallet.USDC_ADDRESS && payToken.toLowerCase() === Wallet.USDC_ADDRESS.toLowerCase() ? 'USDC' : '');

        decPromise.then(function (dec) {
          if (saBalEl) saBalEl.textContent = 'Loading\u2026';
          if (eoaBalEl) eoaBalEl.textContent = 'Loading\u2026';
          var requiredBig = priceWei ? (function () {
            try { return BigInt(priceWei); } catch (_) { return null; }
          })() : null;

          function paint(el, raw) {
            if (!el) return;
            try {
              var human = Number(ethers.formatUnits(raw, dec));
              var fixed = human.toFixed(dec <= 6 ? 2 : 4);
              el.textContent = fixed + (symbol ? ' ' + symbol : '') + ' available';
              if (requiredBig !== null) {
                var rawBig;
                try { rawBig = BigInt(raw.toString()); } catch (_) { rawBig = null; }
                if (rawBig !== null && rawBig < requiredBig) el.classList.add('insufficient');
              }
            } catch (_) {
              el.textContent = '';
            }
          }

          if (sa) {
            fetchFn(sa)
              .then(function (raw) { paint(saBalEl, raw); })
              .catch(function () { if (saBalEl) saBalEl.textContent = ''; });
          } else if (saBalEl) {
            saBalEl.textContent = '';
          }
          if (eoa) {
            fetchFn(eoa)
              .then(function (raw) { paint(eoaBalEl, raw); })
              .catch(function () { if (eoaBalEl) eoaBalEl.textContent = ''; });
          } else if (eoaBalEl) {
            eoaBalEl.textContent = '';
          }
        });
      }

      function cleanup() {
        modal.classList.add('hidden');
        saBtn.removeEventListener('click', onSA);
        eoaBtn.removeEventListener('click', onEOA);
        cancelBtn.removeEventListener('click', onCancel);
      }
      function onSA() { cleanup(); resolve('sa'); }
      function onEOA() { cleanup(); resolve('eoa'); }
      function onCancel() { cleanup(); reject(new Error('Purchase cancelled')); }

      saBtn.addEventListener('click', onSA);
      eoaBtn.addEventListener('click', onEOA);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  function handleBuy() {
    var nft = state.detailItem;
    if (!nft || state.purchasing) return;

    var listing = getListing(nft);
    if (!listing) {
      showToast('No listing available', 'error');
      return;
    }

    var ensureConnected = Wallet.isConnected()
      ? Promise.resolve()
      : Wallet.connect().then(function () { updateWalletUI(); });

    var walletChoicePromise = ensureConnected.then(function () {
      if (Wallet.hasSmartAccount()) return showWalletChoiceModal(listing.payToken, listing.price);
      return 'eoa';
    });

    walletChoicePromise
      .then(function (walletChoice) {
        state.purchasing = true;
        setBuyButtonState('waiting', walletChoice === 'eoa' ? 'Switching to Base chain…' : 'Preparing Agent Account…');

        var chainReady = walletChoice === 'eoa'
          ? (Wallet.switchToBase ? Wallet.switchToBase() : Promise.resolve())
          : Promise.resolve();

        return chainReady.then(function () {
          var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '0';
          var meta = nft.metadata || {};
          var props = meta.properties || {};
          var authorityAddr = props.authority;
          var ledger = props.ledger || nft.contractAddress || (nft.channel && nft.channel.address);

          if (!authorityAddr) {
            throw new Error('No AuthorityGateway address found for this asset');
          }

          setBuyButtonState('waiting', 'Confirm transaction in your wallet…');

          if (walletChoice === 'eoa') {
            return Wallet.buyAccessWithEOA(
              authorityAddr, listing.seller, ledger, tokenId, 1,
              String(listing.price), listing.payToken,
              nft.operative ? nft.operative.address : null
            );
          }
          return Wallet.buyAccess(
            authorityAddr, listing.seller, ledger, tokenId, 1,
            String(listing.price), listing.payToken,
            nft.operative ? nft.operative.address : null
          );
        });
      })
      .then(function (txHashOrReceipt) {
        if (txHashOrReceipt && txHashOrReceipt._smartAccountConfirmed) {
          return txHashOrReceipt;
        }
        setBuyButtonState('confirming', 'Transaction submitted. Waiting for confirmation…');
        return Wallet.waitForReceipt(txHashOrReceipt);
      })
      .then(function (receipt) {
        var success = receipt && (receipt.status === '0x1' || receipt.status === 1);
        var uaPending = receipt && receipt._uaPending;
        if (success) {
          setBuyButtonState('success', 'Purchase successful! Saving to your node…');
          dom.buyBtn.classList.add('hidden');
          dom.detailOwned.classList.remove('hidden');
          dom.playOwnedBtn.classList.remove('hidden');
          showToast('Purchase complete! Auto-downloading...', 'success');
          state.detailIsOwned = true;
          pinAndRegisterMedia(nft);

          setTimeout(function () { enrichFromChain(nft); }, 2000);

          state.assetsItems = [];
          state.assetsLoading = false;
          setTimeout(function () { state.assetsItems = []; }, 8000);
          setTimeout(function () { state.assetsItems = []; }, 20000);
        } else if (uaPending) {
          setBuyButtonState('confirming', 'Transaction submitted — settling on-chain. This may take a minute…');
          showToast('Transaction submitted to Universal Account. Check status shortly.', 'info');
          setTimeout(function () { enrichFromChain(nft); }, 15000);
          if (receipt.transactionId) {
            console.log('[Buy] UA transaction pending. Check: https://universalx.app/activity/details?id=' + receipt.transactionId);
          }
        } else {
          setBuyButtonState('error', 'Transaction failed. Please try again.');
        }
        state.purchasing = false;
      })
      .catch(function (err) {
        state.purchasing = false;
        var msg = err.message || String(err);
        if (msg.indexOf('user rejected') !== -1 || msg.indexOf('User denied') !== -1) {
          setBuyButtonState('error', 'Transaction cancelled.');
        } else {
          setBuyButtonState('error', 'Purchase failed: ' + decodeContractError(msg));
        }
      });
  }

  function setBuyButtonState(st, message) {
    if (st === 'idle') {
      dom.buyBtn.disabled = false;
      dom.buyBtn.className = 'btn-primary buy-btn';
      dom.buyBtn.textContent = 'Buy Now';
      dom.buyBtn.classList.remove('hidden');
      dom.purchaseStatus.classList.add('hidden');
    } else if (st === 'waiting') {
      dom.buyBtn.disabled = true;
      dom.buyBtn.className = 'btn-primary buy-btn buy-btn-waiting';
      dom.buyBtn.textContent = 'Waiting…';
      setPurchaseStatus('pending', message || 'Confirm in wallet…');
    } else if (st === 'confirming') {
      dom.buyBtn.disabled = true;
      dom.buyBtn.className = 'btn-primary buy-btn buy-btn-confirming';
      dom.buyBtn.textContent = 'Confirming…';
      setPurchaseStatus('pending', message || 'Transaction submitted…');
    } else if (st === 'success') {
      dom.buyBtn.disabled = true;
      dom.buyBtn.className = 'btn-success buy-btn buy-btn-success';
      dom.buyBtn.innerHTML = '✓ Purchased';
      setPurchaseStatus('success', message || 'Purchase complete!');
    } else if (st === 'error') {
      dom.buyBtn.disabled = false;
      dom.buyBtn.className = 'btn-primary buy-btn';
      dom.buyBtn.textContent = 'Buy Now';
      setPurchaseStatus('error', message || 'Transaction failed');
    }
  }

  function setPurchaseStatus(type, message) {
    dom.purchaseStatus.className = 'purchase-status ' + type;
    dom.purchaseStatus.textContent = message;
    dom.purchaseStatus.classList.remove('hidden');
  }

  // ── Auto Pin & Register as .ddrm (unified dDRM capsule) ───────

  function buildDdrmDescriptor(nft) {
    var meta = nft.metadata || {};
    var props = meta.properties || {};
    var media = meta.media || nft._rawMedia || {};
    var asset = nft._rawAsset || meta.asset || {};
    var tokenId = (nft.tokenId && nft.tokenId.hexTokenID) || nft.tokenId || '0';
    var title = meta.name || nft.name || 'Untitled';
    var cid = asset.cid || asset.uri || media.uri || '';
    if (cid) cid = cid.replace('ipfs://', '');
    var thumbnailUrl = nft.image || meta.image || (nft.channel && nft.channel.image) || (nft.channel && nft.channel.imageURL) || '';
    var nonMedia = isNonMediaAsset(nft);

    var descriptor = {
      schema: 'ddrm-capsule-v2',
      type: nonMedia ? 'non-media' : 'media',
      version: 1,
      title: title,
      contractAddress: nft.contractAddress || (nft.channel && nft.channel.address) || '',
      tokenId: tokenId,
      authority: (resolveAssetProtectionField(asset, 'authority', '') || props.authority || ''),
      operative: (nft.operative && nft.operative.address) || '',
      ledger: props.ledger || nft.contractAddress || '',
      thumbnail: thumbnailUrl,
      acquiredAt: new Date().toISOString(),
      acquiredBy: Wallet.getSignerAddress() || Wallet.getAddress() || '',
    };

    if (nonMedia) {
      var dataToEncryptHash = resolveAssetProtectionField(asset, 'dataToEncryptHash', '');
      var cleanHash = dataToEncryptHash.startsWith('0x') ? dataToEncryptHash.slice(2) : dataToEncryptHash;
      descriptor.encryptedDataCid = cid;
      descriptor.mimeType = asset.mimeType || media.contentType || media.mimeType || 'application/octet-stream';
      descriptor.dataToEncryptHash = dataToEncryptHash;
      // Prefer asset.kid (UUID-derived, written by creator since NONMEDIA-LIT-MIGRATION-2026-05).
      // Fall back to hash-slice for assets published before the migration.
      descriptor.kid = resolveAssetProtectionField(asset, 'kid', '')
        || (cleanHash ? '0x' + cleanHash.slice(0, 32).padEnd(32, '0') : '');
      descriptor.litCiphertext = resolveAssetProtectionField(asset, 'litCiphertext', '') || '';
      descriptor.iv = resolveAssetProtectionField(asset, 'iv', '') || '';
      descriptor.actionCid = resolveAssetProtectionField(asset, 'actionCid', '');
      var descSignature = resolveAssetProtectionField(asset, 'signature', '');
      var descIssuer = resolveAssetProtectionField(asset, 'issuer', '');
      if (descSignature) descriptor.signature = descSignature;
      if (descIssuer) descriptor.issuer = descIssuer;
    } else {
      var localGateway = window.location.origin + '/ipfs/';
      descriptor.cid = cid;
      descriptor.gateway = localGateway;
      descriptor.fallbackGateway = 'https://ipfs.ela.city/ipfs/';
      descriptor.mediaType = media.mimeType || media.contentType || 'video';
      descriptor.duration = media.duration || 0;
      descriptor.isProtected = !!(nft.isProtected || isProtectedByMetadata(asset, media));
    }

    return descriptor;
  }

  function saveDdrmCapsule(nft, folderPath) {
    var descriptor = buildDdrmDescriptor(nft);
    if (descriptor.type === 'non-media' && (!descriptor.encryptedDataCid || !descriptor.kid)) return Promise.resolve();

    var safeName = descriptor.title.replace(/[^a-zA-Z0-9 _\-]/g, '').substring(0, 80).trim() || 'asset';
    var capsulePath = folderPath + '/' + safeName + '.ddrm';

    return pc2Fetch('/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: capsulePath,
        content: JSON.stringify(descriptor, null, 2),
        mime_type: 'application/x-ddrm',
        overwrite: false,
        dedupe_name: true,
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('Capsule save failed: ' + res.status);
      console.log('[dDRM] Capsule saved:', capsulePath);
      return res.json();
    });
  }

  // Download-first buy flow.
  //
  // Product promise: "when you buy, you download, you own it, you play it
  // locally." Implementation:
  //   1. Write "<title> (Preparing).ddrm" to the folder immediately with
  //      pinStatus='downloading' so the user sees something real in Videos /
  //      Pictures / Documents.
  //   2. POST /api/storage/ipfs/pin with the CID + estimatedSize. The server
  //      enqueues on ContentSeedingService (fire-and-forget).
  //   3. Poll /api/storage/ipfs/pin-status/:cid every 2 s. Show elapsed
  //      time + expected total size. Helia does not expose block-level
  //      progress cleanly, so we are explicit rather than faking a %.
  //   4. On `complete`: write the final "<title>.ddrm" with pinStatus='complete'
  //      and delete the "(Preparing)" placeholder. Show "Downloaded — you own
  //      this offline."
  //   5. On `failed`: show a Retry button wired to
  //      POST /api/storage/ipfs/pin/:cid/retry (30 s client debounce;
  //      server also 429s inside that window).
  //   6. After 120 s of pinning, offer "Continue in background" so the user
  //      is not trapped in the modal on a slow download. The launch gate in
  //      open_item.js then honours the pinStatus on re-open.
  function pinAndRegisterMedia(nft) {
    var media = (nft.metadata && nft.metadata.media) || {};
    var asset = nft._rawAsset || (nft.metadata && nft.metadata.asset) || {};
    var cid = asset.cid || asset.uri || media.uri;
    if (cid) cid = cid.replace('ipfs://', '');

    if (!cid) {
      dom.downloadStatus.className = 'download-status error';
      dom.downloadStatus.textContent = 'No downloadable content found for this asset.';
      dom.downloadStatus.classList.remove('hidden');
      return;
    }

    dom.downloadNodeBtn.disabled = true;
    dom.downloadNodeBtn.querySelector('span').textContent = 'Downloading...';
    dom.purchaseStatus.classList.add('fade-out');
    setTimeout(function () {
      dom.purchaseStatus.classList.add('hidden');
      dom.purchaseStatus.classList.remove('fade-out');
    }, 300);
    dom.downloadStatus.className = 'download-status pending';
    dom.downloadStatus.innerHTML =
      '<div class="download-progress-wrap">' +
        '<div class="download-progress-bar"><div class="download-progress-fill"></div></div>' +
        '<span class="download-progress-text">Preparing your content...</span>' +
      '</div>';
    dom.downloadStatus.classList.remove('hidden');

    var progressFill = dom.downloadStatus.querySelector('.download-progress-fill');
    var progressText = dom.downloadStatus.querySelector('.download-progress-text');
    // Starts as a minimal visual cue (5%); the first /pin-status poll will
    // immediately overwrite this with the real server-reported percent.
    progressFill.style.width = '5%';

    var meta = nft.metadata || {};
    var title = meta.name || nft.name || 'Untitled';
    var safeName = title.replace(/[^a-zA-Z0-9 _\-]/g, '').substring(0, 80).trim() || 'media';
    var walletAddr = (Wallet.getAddress() || '').toLowerCase();
    var nonMedia = isNonMediaAsset(nft);
    var assetMime = (asset.mimeType || media.contentType || '').toLowerCase();
    var folder = nonMedia
      ? (assetMime.startsWith('image/') ? 'Pictures' : 'Documents')
      : 'Videos';
    var preparingName = safeName + ' (Preparing).ddrm';
    var finalName = safeName + '.ddrm';
    var folderPath = '/' + walletAddr + '/' + folder;
    var preparingPath = folderPath + '/' + preparingName;
    var finalPath = folderPath + '/' + finalName;

    // estimatedSize drives the server's adaptive pin timeout + gives the user an "expected"
    // figure for the progress text. Not currently sent by the legacy flow (bug).
    var estimatedSize = 0;
    if (asset.size) estimatedSize = parseInt(asset.size, 10) || 0;
    else if (media.size) estimatedSize = parseInt(media.size, 10) || 0;

    var descriptor = buildDdrmDescriptor(nft);
    descriptor.pinStatus = 'downloading';
    descriptor.estimatedSizeBytes = estimatedSize;
    descriptor.pinnedSizeBytes = null;
    descriptor.downloadStartedAt = new Date().toISOString();

    var buyerWallets = [Wallet.getAddress(), Wallet.getSignerAddress()]
      .filter(Boolean)
      .map(function (a) { return a.toLowerCase(); });
    var uniqueBuyers = buyerWallets.filter(function (v, i, arr) { return arr.indexOf(v) === i; });

    // Polling + UI state
    var downloadStartMs = Date.now();
    var pollTimer = null;
    var backgroundButtonShown = false;
    var BACKGROUND_BUTTON_THRESHOLD_MS = 120000;
    var POLL_INTERVAL_MS = 2000;
    var RETRY_DEBOUNCE_MS = 30000;

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function formatBytes(n) {
      if (!n || n < 0) return '';
      if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
      if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
      if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
      return n + ' B';
    }

    function formatElapsed(ms) {
      var s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60);
      var r = s % 60;
      return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
    }

    function maybeOfferBackgroundButton() {
      if (backgroundButtonShown) return;
      if (Date.now() - downloadStartMs <= BACKGROUND_BUTTON_THRESHOLD_MS) return;
      backgroundButtonShown = true;
      var cont = document.createElement('a');
      cont.href = '#';
      cont.className = 'continue-background-link';
      cont.style.marginLeft = '8px';
      cont.textContent = 'Continue in background';
      cont.addEventListener('click', function (e) {
        e.preventDefault();
        stopPolling();
        dom.downloadStatus.className = 'download-status info';
        dom.downloadStatus.innerHTML =
          'Download continues in the background. It will appear as "' + finalName + '" in ' +
          folder + ' when complete.';
      });
      progressText.appendChild(cont);
    }

    function renderProgress(percent, bytesDownloaded, sizeBytes) {
      var pct = Math.max(0, Math.min(100, Math.floor(percent || 0)));
      // Never visually collapse the bar back below 5% — the first poll can
      // legitimately return 0% before the first 500ms byte-stream tick, and
      // the user shouldn't see the bar reset.
      progressFill.style.width = Math.max(pct, 5) + '%';

      var elapsed = Date.now() - downloadStartMs;
      var totalLabel = formatBytes(sizeBytes || estimatedSize);
      var doneLabel = formatBytes(bytesDownloaded);
      var sizePart;
      if (doneLabel && totalLabel) {
        sizePart = doneLabel + ' / ' + totalLabel;
      } else if (totalLabel) {
        sizePart = '~' + totalLabel + ' expected';
      } else {
        sizePart = '';
      }
      var elapsedPart = formatElapsed(elapsed) + ' elapsed';
      var pctPart = pct + '%';
      progressText.textContent = 'Downloading to your node... ' + pctPart +
        ' · ' + elapsedPart + (sizePart ? ' · ' + sizePart : '');
      maybeOfferBackgroundButton();
    }

    function pollPinStatus() {
      pc2Fetch('/api/storage/ipfs/pin-status/' + encodeURIComponent(cid))
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (body) {
          if (!body) return;
          if (body.status === 'complete') {
            stopPolling();
            // Snap the UI to 100% for the brief moment before finalizeDownload
            // swaps the panel over to the success state.
            renderProgress(100, body.sizeBytes || 0, body.sizeBytes || 0);
            finalizeDownload(body.sizeBytes || 0);
            return;
          }
          if (body.status === 'failed') {
            stopPolling();
            handlePinFailure('Pin failed on server');
            return;
          }
          if (body.status === 'queued') {
            progressText.textContent = 'Queued for download...';
            progressFill.style.width = '5%';
            maybeOfferBackgroundButton();
            return;
          }
          // 'pinning' or 'not-pinned' (race window before the first status write) — keep polling
          renderProgress(body.progressPercent || 0, body.bytesDownloaded || 0, body.sizeBytes || 0);
        })
        .catch(function () {
          // Transient fetch error; the next tick retries. Do not disturb the user's UI.
        });
    }

    function finalizeDownload(pinnedBytes) {
      descriptor.pinStatus = 'complete';
      descriptor.pinned = true;
      descriptor.pinnedSizeBytes = pinnedBytes;
      descriptor.pinnedSize = pinnedBytes;

      pc2Fetch('/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: finalPath,
          content: JSON.stringify(descriptor, null, 2),
          mime_type: 'application/x-ddrm',
          overwrite: true,
          dedupe_name: true
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('Finalize write failed: ' + res.status);
        return res.json();
      }).then(function () {
        // Best-effort cleanup of the "(Preparing)" placeholder; non-fatal if it fails.
        pc2Fetch('/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: [preparingPath] })
        }).catch(function () { /* non-fatal */ });
        showSuccess(pinnedBytes);
      }).catch(function (err) {
        console.error('[Download] Finalize write failed:', err);
        handlePinFailure('Pin completed but saving descriptor failed: ' + (err && err.message));
      });
    }

    function showSuccess(pinnedBytes) {
      dom.downloadNodeBtn.querySelector('span').textContent = 'Downloaded';
      dom.downloadNodeBtn.disabled = true;
      dom.downloadStatus.className = 'download-status success';
      var sizeLabel = formatBytes(pinnedBytes);
      var sizeSuffix = sizeLabel ? ' (' + sizeLabel + ')' : '';
      dom.downloadStatus.innerHTML =
        'Downloaded' + sizeSuffix + ' — you own this offline. ' +
        '<a href="#" class="open-folder-link">Open ' + folder + ' folder</a>';
      showToast('Content downloaded to your node!', 'success');

      var folderLink = dom.downloadStatus.querySelector('.open-folder-link');
      if (folderLink) {
        folderLink.addEventListener('click', function (e) {
          e.preventDefault();
          var appInstanceId = new URLSearchParams(window.location.search).get('puter.app_instance_id') || '';
          window.parent.postMessage({
            $: 'puter-ipc',
            msg: 'openFolder',
            path: folderPath,
            appInstanceID: appInstanceId,
            env: 'app'
          }, '*');
        });
      }
    }

    function startPolling() {
      pollTimer = setInterval(pollPinStatus, POLL_INTERVAL_MS);
      pollPinStatus();
    }

    function handlePinFailure(message) {
      stopPolling();
      console.error('[Download] Pin failed:', message);
      dom.downloadNodeBtn.querySelector('span').textContent = 'Retry Download';
      dom.downloadNodeBtn.disabled = false;

      var diskFull = /disk|quota/i.test(message);
      var msgText = diskFull
        ? 'Insufficient disk space on your node. Free up space and tap Retry.'
        : 'Download failed: ' + message + '.';

      dom.downloadStatus.className = 'download-status error';
      dom.downloadStatus.innerHTML = msgText + ' <a href="#" class="retry-download-link">Retry</a>';

      var retryLink = dom.downloadStatus.querySelector('.retry-download-link');
      var lastRetryMs = 0;

      if (!retryLink) return;

      retryLink.addEventListener('click', function (e) {
        e.preventDefault();
        var now = Date.now();
        if (now - lastRetryMs < RETRY_DEBOUNCE_MS) {
          var waitS = Math.ceil((RETRY_DEBOUNCE_MS - (now - lastRetryMs)) / 1000);
          showToast('Please wait ' + waitS + 's before retrying.', 'info');
          return;
        }
        lastRetryMs = now;
        retryLink.style.pointerEvents = 'none';
        retryLink.textContent = 'Retrying...';

        pc2Fetch('/api/storage/ipfs/pin/' + encodeURIComponent(cid) + '/retry', {
          method: 'POST'
        }).then(function (res) {
          if (res.status === 429) {
            return res.json().then(function (body) {
              var secs = Math.ceil((body.retryAfterMs || RETRY_DEBOUNCE_MS) / 1000);
              showToast('Retry rate-limited. Try again in ' + secs + 's.', 'info');
              retryLink.style.pointerEvents = '';
              retryLink.textContent = 'Retry';
            });
          }
          if (!res.ok) throw new Error('Retry request failed: ' + res.status);
          return res.json().then(function () {
            dom.downloadStatus.className = 'download-status pending';
            dom.downloadStatus.innerHTML =
              '<div class="download-progress-wrap">' +
                '<div class="download-progress-bar"><div class="download-progress-fill"></div></div>' +
                '<span class="download-progress-text">Queued for retry...</span>' +
              '</div>';
            progressFill = dom.downloadStatus.querySelector('.download-progress-fill');
            progressText = dom.downloadStatus.querySelector('.download-progress-text');
            progressFill.style.width = '5%';
            downloadStartMs = Date.now();
            backgroundButtonShown = false;
            startPolling();
          });
        }).catch(function (err) {
          console.error('[Download] Retry failed:', err);
          retryLink.style.pointerEvents = '';
          retryLink.textContent = 'Retry';
          showToast('Retry failed: ' + (err && err.message || 'Unknown error'), 'error');
        });
      });
    }

    // Step 1: preparing placeholder (non-fatal if it fails — the download still runs)
    pc2Fetch('/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: preparingPath,
        content: JSON.stringify(descriptor, null, 2),
        mime_type: 'application/x-ddrm',
        overwrite: true,
        dedupe_name: true
      })
    }).catch(function (err) {
      console.warn('[Download] Preparing placeholder write failed (non-fatal):', err);
    });

    // Step 2: enqueue the pin on the server, then start polling
    pc2Fetch('/api/storage/ipfs/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: cid,
        estimatedSize: estimatedSize,
        buyerWallets: uniqueBuyers
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('Pin request failed: ' + res.status);
      return res.json();
    }).then(function () {
      startPolling();
    }).catch(function (err) {
      handlePinFailure((err && err.message) || 'Unknown error');
    });
  }

  // ── Download to Node (manual fallback) ─────────────

  function handleDownloadToNode() {
    var nft = state.detailItem;
    if (!nft) return;
    pinAndRegisterMedia(nft);
  }

  // ── Open in dDRM Viewer (secure runtime) ──

  function handleOpenInViewer() {
    var nft = state.detailItem;
    if (!nft) return;

    if (!Wallet.isConnected()) {
      showToast('Connect your wallet first', 'error');
      return;
    }

    ensureRawMetadata(nft).then(function () {
      launchViewerPopup(nft);
    }).catch(function () {
      launchViewerPopup(nft);
    });
  }

  function launchViewerPopup(nft) {
    var media = (nft.metadata && nft.metadata.media) || nft._rawMedia || {};
    var asset = nft._rawAsset || (nft.metadata && nft.metadata.asset) || {};
    var meta = nft.metadata || {};
    var props = meta.properties || {};
    var enc = asset.encryption || media.encryption || meta.encryption || {};

    var cid = asset.cid || asset.uri || media.uri || enc.encryptedDataCid;
    if (cid) cid = cid.replace('ipfs://', '');

    var dataToEncryptHash = resolveAssetProtectionField(asset, 'dataToEncryptHash', '') || enc.dataToEncryptHash || enc.hash || '';
    var cleanHash = dataToEncryptHash.startsWith('0x') ? dataToEncryptHash.slice(2) : dataToEncryptHash;
    // Prefer asset.kid (UUID-derived, written by creator since NONMEDIA-LIT-MIGRATION-2026-05).
    // Fall back to hash-slice for assets published before the migration.
    var kid = resolveAssetProtectionField(asset, 'kid', '')
      || (cleanHash ? '0x' + cleanHash.slice(0, 32).padEnd(32, '0') : '');

    var mime = asset.mimeType || media.contentType || media.mimeType || 'application/octet-stream';
    var buyerAddr = getBuyerAddressForAsset(nft) || Wallet.getAddress() || '';
    console.log('[Viewer] Using buyer address:', buyerAddr, 'ownerWallet:', getAssetOwnerWallet(nft));

    var litCiphertext = resolveAssetProtectionField(asset, 'litCiphertext', '') || enc.litCiphertext || enc.ciphertext || '';
    var iv = resolveAssetProtectionField(asset, 'iv', '') || enc.iv || '';
    var actionCid = resolveAssetProtectionField(asset, 'actionCid', '') || enc.actionCid || enc.actionIpfsId || '';
    var authority = resolveAssetProtectionField(asset, 'authority', '') || enc.authority || props.authority || '';
    var signature = resolveAssetProtectionField(asset, 'signature', '') || enc.signature || '';
    var issuer = resolveAssetProtectionField(asset, 'issuer', '') || enc.issuer || '';
    var title = meta.name || nft.name || 'Untitled';

    if (!cid || !kid || !litCiphertext) {
      var missing = [];
      if (!cid) missing.push('cid');
      if (!kid) missing.push('kid');
      if (!litCiphertext) missing.push('litCiphertext');
      console.error('[Viewer] Missing fields:', missing.join(', '), {
        tokenURI: nft.tokenURI,
        hasRawAsset: !!nft._rawAsset,
        assetKeys: Object.keys(asset),
        encKeys: Object.keys(enc),
        mediaKeys: Object.keys(media),
      });
      showToast('Missing asset metadata for viewer (' + missing.join(', ') + '). Try refreshing the page.', 'error');
      return;
    }

    var viewerArgs = {
      litCiphertext: litCiphertext,
      dataToEncryptHash: dataToEncryptHash,
      encryptedDataCid: cid,
      iv: iv,
      kid: kid,
      buyerAddress: buyerAddr,
      mimeType: mime,
      title: title,
    };
    if (actionCid) viewerArgs.actionCid = actionCid;
    if (authority) viewerArgs.authority = authority;
    if (signature) viewerArgs.signature = signature;
    if (issuer) viewerArgs.issuer = issuer;
    var litBackend = resolveAssetProtectionField(asset, 'litBackend', '') || enc.litBackend || '';
    if (litBackend) viewerArgs.litBackend = litBackend;

    window.parent.postMessage({
      $: 'puter-ipc',
      msg: 'launchApp',
      appName: 'ddrm-viewer',
      windowTitle: title + ' — Elacity Viewer',
      args: viewerArgs,
    }, '*');
  }

  function fetchRawMetadataLocalFirst(tokenURI) {
    var cid = tokenURI.replace('ipfs://', '');
    var localUrl = window.location.origin + '/ipfs/' + cid;
    var publicUrl = resolveIpfsUrl(tokenURI);

    return fetch(localUrl)
      .then(function (r) {
        if (r.ok) return r;
        console.warn('[Meta] Local IPFS failed (' + r.status + '), trying public gateway');
        return fetch(publicUrl);
      })
      .catch(function () {
        console.warn('[Meta] Local IPFS unreachable, trying public gateway');
        return fetch(publicUrl);
      })
      .then(function (r) {
        if (!r.ok) throw new Error('IPFS fetch failed from both gateways: ' + r.status);
        return r.json();
      });
  }

  function ensureRawMetadata(nft) {
    if (nft._rawAsset && (nft._rawAsset.dataToEncryptHash || (Array.isArray(nft._rawAsset.protections) && nft._rawAsset.protections.length > 0))) {
      return Promise.resolve();
    }
    var tokenURI = nft.tokenURI || '';
    if (!tokenURI) return Promise.resolve();

    return fetchRawMetadataLocalFirst(tokenURI)
      .then(function (rawMeta) {
        if (rawMeta && rawMeta.asset) {
          nft._rawAsset = rawMeta.asset;
          nft._rawMedia = rawMeta.media;
          console.log('[Meta] Raw metadata loaded, asset CID:', rawMeta.asset.cid);
        }
      });
  }

  // ── Wallet UI ────────────────────────────────────────

  function updateWalletUI() {
    var address = Wallet.getSignerAddress();
    dom.networkBadge.classList.remove('hidden');
    dom.networkBadge.textContent = 'BASE';
    if (address) {
      dom.walletBtn.textContent = formatAddress(address);
      dom.walletBtn.classList.add('connected');
      window.dispatchEvent(new CustomEvent('wallet-connected'));
    } else {
      dom.walletBtn.textContent = 'Connect Wallet';
      dom.walletBtn.classList.remove('connected');
    }
  }

  // ── SIWE Auth Flow ───────────────────────────────────

  function handleAuth() {
    dom.authBtn.disabled = true;
    dom.authBtn.textContent = 'Signing in...';

    return Wallet.siweLogin()
      .then(function () {
        showToast('Authenticated successfully', 'success');
        updateWalletUI();
        syncSubscriptionsFromAPI();
        renderMyAssetsView();
      })
      .catch(function (err) {
        showToast('Auth failed: ' + err.message, 'error');
        throw err;
      })
      .finally(function () {
        dom.authBtn.disabled = false;
        dom.authBtn.textContent = 'Sign In with Wallet';
      });
  }

  // ── Event Binding ────────────────────────────────────

  function bindEvents() {
    dom.sidebarNav.addEventListener('click', function (e) {
      var item = e.target.closest('.nav-item');
      if (!item) return;
      switchView(item.dataset.view);
    });

    dom.walletBtn.addEventListener('click', function () {
      if (Wallet.isConnected()) return;
      Wallet.connect()
        .then(function () { updateWalletUI(); showToast('Wallet connected', 'success'); })
        .catch(function (err) { showToast('Connection failed: ' + err.message, 'error'); });
    });

    dom.feedFilterChips.addEventListener('click', function (e) {
      var chip = e.target.closest('.filter-chip');
      if (!chip) return;

      if (chip.dataset.toggle === 'adult') {
        state.showAdultContent = !state.showAdultContent;
        chip.classList.toggle('active', state.showAdultContent);
        loadBrowse(false);
        return;
      }

      dom.feedFilterChips.querySelectorAll('.filter-chip:not([data-toggle])').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      if (chip.dataset.category) {
        state.activeCategory = chip.dataset.category;
        state.activeContentType = 'all';
      }
      if (chip.dataset.type && chip.dataset.type !== 'all') {
        state.activeContentType = chip.dataset.type;
        if (!chip.dataset.category) state.activeCategory = 'all';
      }
      loadBrowse(false);
    });

    dom.searchTypeChips.addEventListener('click', function (e) {
      var chip = e.target.closest('.filter-chip');
      if (!chip) return;
      dom.searchTypeChips.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      state.searchContentType = chip.dataset.type;
      if (state.searchQuery) loadSearch();
    });

    dom.channelsViewToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.mode-btn');
      if (!btn) return;
      dom.channelsViewToggle.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.channelsDirViewMode = btn.dataset.mode;
      if (state.channelsDirLoaded) renderChannelsDirectory();
    });

    dom.channelCategoryTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.cat-tab');
      if (!tab) return;
      dom.channelCategoryTabs.querySelectorAll('.cat-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      state.channelsDirCategory = tab.dataset.cat;
      if (state.channelsDirLoaded) renderChannelsDirectory();
    });

    dom.earningsTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.earnings-tab');
      if (!tab) return;
      if (tab.dataset.tab === 'offers') return;
      dom.earningsTabs.querySelectorAll('.earnings-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      state.earningsTab = tab.dataset.tab;
      if (window.ElaMarket && window.ElaMarket.loadEarningsData) {
        window.ElaMarket.loadEarningsData(state.earningsTab);
      } else {
        loadEarningsData(state.earningsTab);
      }
    });

    dom.earningsWithdrawAllBtn.addEventListener('click', handleWithdrawAll);

    dom.searchInput.addEventListener('input', function () {
      clearTimeout(state.searchTimeout);
      var val = dom.searchInput.value.trim();
      dom.searchClearBtn.classList.toggle('hidden', !val);
      if (!val) {
        showRecentSearches();
        dom.searchResultsCount.classList.add('hidden');
        dom.searchGrid.innerHTML = '';
        dom.searchEmpty.classList.add('hidden');
      }
      state.searchTimeout = setTimeout(function () {
        state.searchQuery = val;
        if (val) {
          dom.searchRecent.classList.add('hidden');
          loadSearch();
        }
      }, 300);
    });

    dom.searchClearBtn.addEventListener('click', function () {
      dom.searchInput.value = '';
      dom.searchClearBtn.classList.add('hidden');
      dom.searchResultsCount.classList.add('hidden');
      dom.searchGrid.innerHTML = '';
      dom.searchEmpty.classList.add('hidden');
      state.searchQuery = '';
      showRecentSearches();
      dom.searchInput.focus();
    });

    dom.authBtn.addEventListener('click', handleAuth);
    document.getElementById('library-refresh-btn').addEventListener('click', function () {
      if (!ElacityAPI.isAuthenticated()) {
        renderMyAssetsView();
      } else {
        refreshLibrary();
      }
    });

    var libraryFilterEl = document.getElementById('library-filter');
    if (libraryFilterEl) {
      libraryFilterEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.segment-btn');
        if (!btn) return;
        libraryFilterEl.querySelectorAll('.segment-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.libraryFilter = btn.dataset.filter || 'all';
        if (state.assetsItems.length > 0) {
          applyLibraryFilter();
        }
      });
    }
    dom.detailBackBtn.addEventListener('click', goBack);
    dom.channelBackBtn.addEventListener('click', goBack);
    dom.subscribeBtn.addEventListener('click', handleSubscribe);

    document.getElementById('sub-modal-close').addEventListener('click', closeSubscribeModal);
    document.getElementById('sub-modal-confirm').addEventListener('click', executeSubscription);
    document.getElementById('subscribe-modal').addEventListener('click', function (e) {
      if (e.target === this) closeSubscribeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var wcm = document.getElementById('wallet-choice-modal');
        if (wcm && !wcm.classList.contains('hidden')) { wcm.classList.add('hidden'); return; }
        if (!dom.govListModal.classList.contains('hidden')) { closeGovListModal(); return; }
        if (!dom.govTransferModal.classList.contains('hidden')) { closeGovTransferModal(); return; }
        if (!dom.resellModal.classList.contains('hidden')) { closeResellModal(); return; }
        if (!dom.transferModal.classList.contains('hidden')) { closeTransferModal(); return; }
        if (!document.getElementById('subscribe-modal').classList.contains('hidden')) { closeSubscribeModal(); return; }
        if (state.activeView === 'detail' || state.activeView === 'channel') { goBack(); }
      }
    });

    document.querySelectorAll('.collapsible-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var section = header.closest('.collapsible-section');
        if (!section) return;
        var isOpen = section.classList.toggle('open');
        header.setAttribute('aria-expanded', String(isOpen));
      });
    });

    var wcOverlay = document.getElementById('wallet-choice-modal');
    if (wcOverlay) {
      wcOverlay.addEventListener('click', function (e) {
        if (e.target === wcOverlay) wcOverlay.classList.add('hidden');
      });
    }

    dom.themeToggle.addEventListener('click', toggleTheme);

    dom.buyBtn.addEventListener('click', handleBuy);
    dom.downloadNodeBtn.addEventListener('click', handleDownloadToNode);
    dom.openViewerBtn.addEventListener('click', handleOpenInViewer);
    dom.previewBtn.addEventListener('click', handlePreview);
    dom.playOwnedBtn.addEventListener('click', handlePlay);
    dom.saveBtn.addEventListener('click', handleSave);
    dom.likeBtn.addEventListener('click', handleLike);
    dom.shareBtn.addEventListener('click', handleShare);

    dom.resellBtn.addEventListener('click', openResellModal);
    dom.transferBtn.addEventListener('click', openTransferModal);
    dom.resellConfirmBtn.addEventListener('click', handleResellConfirm);
    dom.resellCancelBtn.addEventListener('click', closeResellModal);
    dom.resellModalClose.addEventListener('click', closeResellModal);
    dom.resellModal.addEventListener('click', function (e) { if (e.target === this) closeResellModal(); });
    dom.transferConfirmBtn.addEventListener('click', handleTransferConfirm);
    dom.transferCancelBtn.addEventListener('click', closeTransferModal);
    dom.transferModalClose.addEventListener('click', closeTransferModal);
    dom.transferModal.addEventListener('click', function (e) { if (e.target === this) closeTransferModal(); });

    dom.govWithdrawBtn.addEventListener('click', handleGovWithdraw);
    dom.govListBtn.addEventListener('click', openGovListModal);
    dom.govTransferBtn.addEventListener('click', openGovTransferModal);
    dom.govListConfirmBtn.addEventListener('click', handleGovListConfirm);
    dom.govListCancelBtn.addEventListener('click', closeGovListModal);
    dom.govListModalClose.addEventListener('click', closeGovListModal);
    dom.govListModal.addEventListener('click', function (e) { if (e.target === this) closeGovListModal(); });
    dom.govTransferConfirmBtn.addEventListener('click', handleGovTransferConfirm);
    dom.govTransferCancelBtn.addEventListener('click', closeGovTransferModal);
    dom.govTransferModalClose.addEventListener('click', closeGovTransferModal);
    dom.govTransferModal.addEventListener('click', function (e) { if (e.target === this) closeGovTransferModal(); });

    Wallet.setupListeners({
      onAccountChange: function () {
        updateWalletUI();
        if (state.initializing) return;
        var currentAddr = (Wallet.getAddress() || '').toLowerCase();
        var lastAddr = (state._lastSignedAddress || '').toLowerCase();
        if (!currentAddr || currentAddr === lastAddr) return;
        ElacityAPI.clearAuth();
        state.assetsItems = [];
        state._lastSignedAddress = Wallet.getAddress();
        Wallet.siweLogin()
          .then(function () {
            updateWalletUI();
            if (state.activeView === 'library') renderMyAssetsView();
          })
          .catch(function () {
            if (state.activeView === 'library') renderMyAssetsView();
          });
      },
      onChainChange: function () { updateWalletUI(); }
    });
  }

  // ── Earnings View ──────────────────────────────────────

  state.earningsTab = 'assets';
  state.earningsData = null;
  state.earningsRewards = null;

  function loadEarningsView() {
    if (!Wallet.isConnected()) {
      dom.earningsAuthPrompt.classList.remove('hidden');
      dom.earningsSummary.classList.add('hidden');
      dom.earningsList.innerHTML = '';
      dom.earningsEmpty.classList.add('hidden');
      return;
    }
    if (!ElacityAPI.isAuthenticated()) {
      dom.earningsAuthPrompt.classList.add('hidden');
      dom.earningsSummary.classList.add('hidden');
      dom.earningsList.innerHTML = '';
      dom.earningsEmpty.classList.add('hidden');
      dom.earningsLoading.classList.remove('hidden');
      Wallet.siweLogin()
        .then(function () {
          dom.earningsLoading.classList.add('hidden');
          loadEarningsView();
        })
        .catch(function (err) {
          dom.earningsLoading.classList.add('hidden');
          dom.earningsAuthPrompt.classList.remove('hidden');
          showToast('Earnings login failed: ' + (err.message || 'signature rejected'), 'error');
        });
      return;
    }
    dom.earningsAuthPrompt.classList.add('hidden');
    var emptyH3 = dom.earningsEmpty.querySelector('h3');
    var emptyP = dom.earningsEmpty.querySelector('p');
    if (emptyH3) emptyH3.textContent = 'No royalty holdings found';
    if (emptyP) emptyP.textContent = "You'll see your earnings here when you hold royalty share tokens for any channels or assets.";
    loadEarningsData(state.earningsTab);
  }

  function loadEarningsData(category) {
    var eoaAddr = Wallet.getAddress();
    var saAddr = Wallet.getSmartAccountAddress();
    var hasSA = Wallet.hasSmartAccount() && saAddr && saAddr.toLowerCase() !== (eoaAddr || '').toLowerCase();
    if (!eoaAddr) return;

    // "channels" tab = owned channels with subscription revenue
    var apiCategory = (category === 'channels') ? 'my-channels' : category;

    dom.earningsList.innerHTML = '';
    dom.earningsEmpty.classList.add('hidden');
    dom.earningsLoading.classList.remove('hidden');
    dom.earningsSummary.classList.add('hidden');

    ElacityAPI.clearEarningsCache();

    var itemsPromises = [ElacityAPI.fetchRoyaltyItems(eoaAddr, apiCategory, 0, 100, 'EOA')];
    var rewardsPromises = [ElacityAPI.fetchRewardSummary(eoaAddr, apiCategory, 'EOA')];
    if (hasSA) {
      itemsPromises.push(ElacityAPI.fetchRoyaltyItems(saAddr, apiCategory, 0, 100, 'Smart Account'));
      rewardsPromises.push(ElacityAPI.fetchRewardSummary(saAddr, apiCategory, 'Smart Account'));
    }

    Promise.all([Promise.all(itemsPromises), Promise.all(rewardsPromises)]).then(function (all) {
      dom.earningsLoading.classList.add('hidden');
      var itemResults = all[0];
      var rewardResults = all[1];

      var mergedData = [];
      var seenIds = {};
      itemResults.forEach(function (res) {
        if (!res || !res.data) return;
        res.data.forEach(function (item) {
          var key = (item.address || item.id || '').toLowerCase();
          if (!seenIds[key]) {
            seenIds[key] = true;
            mergedData.push(item);
          }
        });
      });

      var rewards = [];
      var seenRewards = {};
      rewardResults.forEach(function (arr) {
        (arr || []).forEach(function (r) {
          var key = (r.address || '').toLowerCase();
          if (!seenRewards[key]) {
            seenRewards[key] = true;
            rewards.push(r);
          } else {
            var existing = rewards.find(function (e) { return e.address.toLowerCase() === key; });
            if (existing) {
              existing.unclaimedRewards = (existing.unclaimedRewards || 0) + (r.unclaimedRewards || 0);
              (r.distributions || []).forEach(function (d) {
                var found = existing.distributions.find(function (ed) { return ed.paymentToken === d.paymentToken; });
                if (found) { found.volume += d.volume; }
                else { existing.distributions.push(d); }
              });
            }
          }
        });
      });

      var items = { total: mergedData.length, data: mergedData };
      state.earningsData = items;
      state.earningsRewards = rewards;

      var rewardsMap = {};
      rewards.forEach(function (r) {
        rewardsMap[r.address.toLowerCase()] = r;
      });

      var totalUnclaimed = 0;
      var withRewards = 0;
      mergedData.forEach(function (item) {
        totalUnclaimed += (item.unclaimedRewards || 0);
        if ((item.unclaimedRewards || 0) > 0) withRewards++;
      });

      // The /api/catalog/earnings backend queries rewardsOf(wallet, USDC) and
      // returns values already decimal-converted with USDC's 6-decimal scale.
      // formatPrice defaults to ETH when no paymentToken is passed, which
      // would mislabel USDC values like 0.05 as "0.05 ETH". Pass USDC_ADDRESS
      // explicitly so the symbol displays correctly.
      dom.earningsTotalAmount.textContent = formatPrice(totalUnclaimed, USDC_ADDRESS);
      if (dom.earningsTotalEarned) dom.earningsTotalEarned.textContent = String(mergedData.length);
      if (dom.earningsActiveCount) dom.earningsActiveCount.textContent = String(withRewards);
      dom.earningsSummary.classList.remove('hidden');

      if (totalUnclaimed > 0) {
        dom.earningsWithdrawAllBtn.disabled = false;
      } else {
        dom.earningsWithdrawAllBtn.disabled = true;
      }

      if (!items || !items.data || items.data.length === 0) {
        dom.earningsEmpty.classList.remove('hidden');
        return;
      }

      renderEarningsList(items.data, rewardsMap, category);
    }).catch(function (err) {
      dom.earningsLoading.classList.add('hidden');
      dom.earningsEmpty.classList.remove('hidden');
      var emptyH3 = dom.earningsEmpty.querySelector('h3');
      var emptyP = dom.earningsEmpty.querySelector('p');
      if (emptyH3) emptyH3.textContent = 'Failed to load earnings';
      if (emptyP) emptyP.textContent = 'Could not reach the Elacity API. Check your connection and try refreshing.';
      showToast('Earnings load failed: ' + (err.message || 'network error'), 'error');
      console.warn('[Earnings] Load failed:', err);
    });
  }

  function renderEarningsList(items, rewardsMap, category) {
    var html = '';
    items.forEach(function (item) {
      var thumb = getImageUrl(item) || resolveIpfsUrl(item.thumbnail || '');
      var unclaimed = item.unclaimedRewards || 0;
      var rewardEntry = rewardsMap[(item.address || '').toLowerCase()];
      if (rewardEntry && rewardEntry.unclaimedRewards > unclaimed) {
        unclaimed = rewardEntry.unclaimedRewards;
      }
      var distributions = (rewardEntry && rewardEntry.distributions) || item.distributions || [];
      var hasRewards = unclaimed > 0;
      var sharePct = (item.share || 0).toFixed(1);

      var isChannel = item.__typename === 'OwnedChannel' || item.__typename === 'RoyaltyChannel';
      var itemType = isChannel ? 'channel' : 'asset';

      var walletTag = item.walletLabel ? ' <span style="color:#94a3b8;font-size:11px">(' + escapeHtml(item.walletLabel) + ')</span>' : '';

      html += '<div class="earnings-item" data-contract="' + escapeHtml(item.address) + '"' +
        (item.ledger ? ' data-ledger="' + escapeHtml(item.ledger) + '"' : '') +
        (item.hexTokenId ? ' data-hextokenid="' + escapeHtml(item.hexTokenId) + '"' : '') +
        ' data-itemtype="' + itemType + '"' +
        ' data-category="' + category + '">';
      html += '<img class="earnings-item-thumb" src="' + escapeHtml(thumb) + '" alt="" onerror="this.style.display=\'none\'" />';
      html += '<div class="earnings-item-info">';
      html += '<div class="earnings-item-name">' + escapeHtml(item.name || 'Untitled') + walletTag + '</div>';
      html += '<div class="earnings-item-meta">';

      if (isChannel) {
        html += '<span style="color:#8b5cf6;font-weight:600">Channel</span>';
        if (item.itemsCount !== undefined) {
          html += '<span>' + item.itemsCount + ' asset' + (item.itemsCount !== 1 ? 's' : '') + '</span>';
        }
        html += '<span>Subscription Revenue</span>';
      } else {
        html += '<span class="earnings-item-share">' + sharePct + '% royalty</span>';
        html += '<span>Asset</span>';
      }
      html += '<span>' + formatAddress(item.address) + '</span>';
      html += '</div>';

      // Action buttons row
      html += '<div class="earnings-item-actions">';
      if (isChannel) {
        html += '<button class="action-btn ei-view" data-addr="' + escapeHtml(item.address) + '">View</button>';
        html += '<button class="action-btn ei-ch-edit" data-addr="' + escapeHtml(item.address) + '">Edit Details</button>';
        html += '<button class="action-btn ei-ch-plans" data-addr="' + escapeHtml(item.address) + '">Manage Plans</button>';
      } else {
        html += '<button class="action-btn ei-view-asset" data-addr="' + escapeHtml(item.address) + '"' +
          (item.ledger ? ' data-ledger="' + escapeHtml(item.ledger) + '"' : '') +
          (item.hexTokenId ? ' data-hextokenid="' + escapeHtml(item.hexTokenId) + '"' : '') +
          '>View</button>';
        if (parseFloat(sharePct) > 0) {
          html += '<button class="action-btn ei-list-shares" data-addr="' + escapeHtml(item.address) + '">List Royalty Shares</button>';
          html += '<button class="action-btn ei-transfer-shares" data-addr="' + escapeHtml(item.address) + '">Transfer Shares</button>';
        }
        html += '<button class="action-btn ei-resell" data-addr="' + escapeHtml(item.address) + '"' +
          (item.ledger ? ' data-ledger="' + escapeHtml(item.ledger) + '"' : '') +
          (item.hexTokenId ? ' data-hextokenid="' + escapeHtml(item.hexTokenId) + '"' : '') +
          '>Sell Access</button>';
      }
      html += '</div>';

      html += '</div>';
      html += '<div class="earnings-item-right">';
      // Backend returns USDC-denominated values (already decimal-converted).
      // Use the first distribution's paymentToken when available, falling back
      // to USDC_ADDRESS so the symbol never silently defaults to ETH.
      var unclaimedPayToken = (distributions && distributions[0] && distributions[0].paymentToken) || USDC_ADDRESS;
      html += '<span class="earnings-item-unclaimed' + (hasRewards ? '' : ' zero') + '">' +
        (hasRewards ? formatPrice(unclaimed, unclaimedPayToken) : '$0.00') + '</span>';

      if (hasRewards) {
        var payTokens = distributions.map(function (d) { return d.paymentToken; }).join(',');
        var wLabel = item.walletLabel || '';
        var operatives = (item.operatives && item.operatives.length > 0) ? item.operatives.join(',') : '';
        html += '<button class="earnings-withdraw-btn" data-contract="' + escapeHtml(item.address) + '"' +
          (operatives ? ' data-operatives="' + escapeHtml(operatives) + '"' : '') +
          ' data-paytokens="' + escapeHtml(payTokens) + '" data-wallet-label="' + escapeHtml(wLabel) + '" title="Withdraw to ' + escapeHtml(wLabel || 'wallet') + '">Withdraw' + (wLabel ? ' (' + escapeHtml(wLabel) + ')' : '') + '</button>';
      } else if (!isChannel) {
        html += '<span style="color:#64748b;font-size:11px">No rewards yet</span>';
      }

      html += '</div>';
      html += '</div>';
    });

    dom.earningsList.innerHTML = html;

    dom.earningsList.querySelectorAll('.earnings-withdraw-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var contractAddr = btn.getAttribute('data-contract');
        var operatives = (btn.getAttribute('data-operatives') || '').split(',').filter(Boolean);
        var payTokens = (btn.getAttribute('data-paytokens') || '').split(',').filter(Boolean);
        var item = btn.closest('.earnings-item');
        var wLabel = item ? (item.dataset.walletlabel || '') : '';
        var wKey = wLabel.toLowerCase().indexOf('smart') !== -1 ? 'sa' : undefined;
        if (operatives.length > 0) {
          handleChannelWithdraw(operatives, payTokens, btn, wKey);
        } else {
          handleEarningsWithdraw(contractAddr, payTokens, btn, wKey);
        }
      });
    });

    // Channel action buttons
    dom.earningsList.querySelectorAll('.ei-view').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openChannel(btn.dataset.addr);
      });
    });

    dom.earningsList.querySelectorAll('.ei-ch-edit').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        ElacityAPI.retrieveChannel(addr).then(function (ch) {
          if (ch && window.ElaMarket && window.ElaMarket.openEditChannelModal) {
            window.ElaMarket.openEditChannelModal(ch);
          }
        }).catch(function (err) { showToast('Failed: ' + err.message, 'error'); });
      });
    });

    dom.earningsList.querySelectorAll('.ei-ch-plans').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        ElacityAPI.retrieveChannel(addr).then(function (ch) {
          if (ch && window.ElaMarket && window.ElaMarket.openManagePlansModal) {
            window.ElaMarket.openManagePlansModal(ch);
          }
        }).catch(function (err) { showToast('Failed: ' + err.message, 'error'); });
      });
    });

    // Asset action buttons
    dom.earningsList.querySelectorAll('.ei-view-asset').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        var hexId = btn.dataset.hextokenid || '';
        openDetail(addr, hexId, false);
      });
    });

    dom.earningsList.querySelectorAll('.ei-resell').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        var ledger = btn.dataset.ledger || '';
        var hexId = btn.dataset.hextokenid || '';
        if (window.ElaMarket && window.ElaMarket.openResellAccessModal) {
          window.ElaMarket.openResellAccessModal(addr, ledger, hexId);
        }
      });
    });

    dom.earningsList.querySelectorAll('.ei-list-shares').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        if (window.ElaMarket && window.ElaMarket.openListRoyaltySharesModal) {
          window.ElaMarket.openListRoyaltySharesModal(addr);
        } else {
          showToast('List royalty shares coming soon', 'info');
        }
      });
    });

    dom.earningsList.querySelectorAll('.ei-transfer-shares').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var addr = btn.dataset.addr;
        if (window.ElaMarket && window.ElaMarket.openTransferSharesModal) {
          window.ElaMarket.openTransferSharesModal(addr);
        } else {
          showToast('Transfer shares coming soon', 'info');
        }
      });
    });

    dom.earningsList.querySelectorAll('.earnings-item').forEach(function (el) {
      el.style.cursor = 'pointer';
    });
  }

  function handleChannelWithdraw(operatives, payTokens, btn, fromWallet) {
    if (!operatives.length || !payTokens.length) return;
    btn.disabled = true;
    btn.textContent = 'Withdrawing...';

    var chain = Promise.resolve();
    var completed = 0;
    operatives.forEach(function (opAddr) {
      chain = chain.then(function () {
        btn.textContent = 'Withdrawing ' + (completed + 1) + '/' + operatives.length + '...';
        return Wallet.withdrawRewards(opAddr, payTokens[0], fromWallet);
      }).then(function () {
        completed++;
      });
    });

    chain.then(function () {
      btn.textContent = 'Done!';
      btn.style.background = '#22c55e';
      showToast('Channel rewards withdrawn from ' + operatives.length + ' asset(s)!', 'success');
      ElacityAPI.clearEarningsCache(true);
      setTimeout(function () { loadEarningsData(state.earningsTab); }, 3000);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Withdraw';
      if (err.message && err.message.indexOf('rejected') === -1) {
        showToast('Withdraw failed: ' + decodeContractError(err.message), 'error');
      }
    });
  }

  function handleEarningsWithdraw(contractAddr, payTokens, btn, fromWallet) {
    if (!contractAddr || payTokens.length === 0) return;

    btn.disabled = true;
    btn.textContent = 'Withdrawing...';

    var withdrawPromise;
    if (payTokens.length === 1) {
      withdrawPromise = Wallet.withdrawRewards(contractAddr, payTokens[0], fromWallet);
    } else {
      withdrawPromise = Wallet.batchWithdrawRewards(contractAddr, payTokens, fromWallet);
    }

    withdrawPromise.then(function () {
      btn.textContent = 'Done!';
      btn.style.background = '#22c55e';
      showToast('Rewards withdrawn successfully!', 'success');
      ElacityAPI.clearEarningsCache(true);
      setTimeout(function () { loadEarningsData(state.earningsTab); }, 3000);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Withdraw';
      if (err.message && err.message.indexOf('rejected') === -1) {
        showToast('Withdraw failed: ' + decodeContractError(err.message), 'error');
      }
    });
  }

  function handleWithdrawAll() {
    var rewards = state.earningsRewards;
    if (!rewards || rewards.length === 0) return;

    var contractsWithRewards = rewards.filter(function (r) {
      return r.unclaimedRewards > 0 && r.distributions && r.distributions.length > 0;
    });

    if (contractsWithRewards.length === 0) {
      showToast('No rewards to withdraw', 'error');
      return;
    }

    dom.earningsWithdrawAllBtn.disabled = true;
    dom.earningsWithdrawAllBtn.textContent = 'Withdrawing...';

    var chain = Promise.resolve();
    var completed = 0;
    var total = contractsWithRewards.length;

    contractsWithRewards.forEach(function (r) {
      var payTokens = r.distributions.map(function (d) { return d.paymentToken; });
      chain = chain.then(function () {
        dom.earningsWithdrawAllBtn.textContent = 'Withdrawing ' + (completed + 1) + '/' + total + '...';
        if (payTokens.length === 1) {
          return Wallet.withdrawRewards(r.address, payTokens[0]);
        }
        return Wallet.batchWithdrawRewards(r.address, payTokens);
      }).then(function () {
        completed++;
      });
    });

    chain.then(function () {
      dom.earningsWithdrawAllBtn.textContent = 'Done!';
      showToast('All rewards withdrawn! (' + completed + ' contracts)', 'success');
      ElacityAPI.clearEarningsCache(true);
      setTimeout(function () { loadEarningsData(state.earningsTab); }, 3000);
    }).catch(function (err) {
      dom.earningsWithdrawAllBtn.disabled = false;
      dom.earningsWithdrawAllBtn.textContent = 'Withdraw All';
      if (err.message && err.message.indexOf('rejected') === -1) {
        showToast('Batch withdraw failed: ' + decodeContractError(err.message), 'error');
      }
    });
  }

  // ── Init ─────────────────────────────────────────────

  // ── Indexer progress banner (v1.2.7.3) ───────────────
  // Polls /api/catalog/indexer-status every 10s while the local catalog is
  // still doing its initial backfill (~15 min on a fresh install). Hides
  // automatically once the chain is fully indexed. Lets fresh users know
  // PC2 is working — they'd otherwise stare at the same supernode-fed cards
  // with no signal that their local catalog is filling up underneath.
  var indexerBannerState = {
    pollInterval: null,
    dismissed: false
  };

  function formatBannerEta(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return '~' + Math.ceil(seconds) + 's remaining';
    var minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return '~' + minutes + ' min remaining';
    return '~' + Math.ceil(minutes / 60) + 'h remaining';
  }

  function renderIndexerBanner(status) {
    var banner = document.getElementById('indexer-progress-banner');
    if (!banner) return;

    if (indexerBannerState.dismissed) {
      banner.classList.add('hidden');
      return;
    }

    if (!status || status.ready) {
      banner.classList.add('hidden');
      return;
    }

    if (!status.isInitialBackfill && !status.scanning) {
      banner.classList.add('hidden');
      return;
    }

    var versions = status.versions || {};
    var versionKeys = Object.keys(versions);
    if (versionKeys.length === 0) {
      banner.classList.add('hidden');
      return;
    }

    var primary = versions[versionKeys[0]];
    var pct = Math.max(0, Math.min(100, primary.progressPct || 0));
    var eta = formatBannerEta(status.estimatedSecondsRemaining);
    var catalogTotal = (status.catalog && status.catalog.total) || 0;
    var catalogChannels = (status.catalog && status.catalog.channels) || 0;

    var detailParts = [];
    detailParts.push('Indexed ' + pct.toFixed(1) + '% of Base mainnet');
    if (eta) detailParts.push(eta);
    if (catalogTotal > 0 || catalogChannels > 0) {
      detailParts.push(catalogChannels + ' channel(s), ' + catalogTotal + ' item(s) so far');
    } else {
      detailParts.push('Showing live results from elacity.io until ready');
    }

    var detail = document.getElementById('indexer-banner-detail');
    if (detail) detail.textContent = detailParts.join(' · ');

    var fill = document.getElementById('indexer-banner-progress-fill');
    if (fill) fill.style.width = pct + '%';

    banner.classList.remove('hidden');
  }

  function pollIndexerStatus() {
    var origin = window.puter_api_origin || window.location.origin;
    return pc2Fetch(origin + '/api/catalog/indexer-status')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        if (!json || !json.success) return;
        renderIndexerBanner(json);
        if (json.ready && indexerBannerState.pollInterval) {
          clearInterval(indexerBannerState.pollInterval);
          indexerBannerState.pollInterval = null;
        }
      })
      .catch(function () { /* swallow — banner stays in last state */ });
  }

  function startIndexerBannerPoll() {
    var dismissBtn = document.getElementById('indexer-banner-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        indexerBannerState.dismissed = true;
        var banner = document.getElementById('indexer-progress-banner');
        if (banner) banner.classList.add('hidden');
        if (indexerBannerState.pollInterval) {
          clearInterval(indexerBannerState.pollInterval);
          indexerBannerState.pollInterval = null;
        }
      });
    }
    pollIndexerStatus();
    indexerBannerState.pollInterval = setInterval(pollIndexerStatus, 10000);
  }

  function init() {
    initTheme();
    cacheDom();
    bindEvents();
    loadBrowse(false);
    setupFeedObserver();
    startIndexerBannerPoll();

    Wallet.connect()
      .then(function () {
        state._lastSignedAddress = Wallet.getAddress();
        updateWalletUI();
        return Wallet.siweLogin();
      })
      .then(function () {
        state.initializing = false;
        state._lastSignedAddress = Wallet.getAddress();
        updateWalletUI();
        syncSubscriptionsFromAPI();
        if (state.activeView === 'library') renderMyAssetsView();
      })
      .catch(function () {
        state.initializing = false;
        state._lastSignedAddress = Wallet.getAddress();
        updateWalletUI();
      });
  }

  // ── Namespace Export (capsule-ready module bridge) ───
  window.ElaMarket = {
    state: state,
    dom: dom,
    utils: {
      escapeHtml: escapeHtml,
      formatPrice: formatPrice,
      formatAddress: formatAddress,
      formatDate: formatDate,
      formatViews: formatViews,
      resolveIpfsUrl: resolveIpfsUrl,
      getImageUrl: getImageUrl,
      getCreatorName: getCreatorName,
      getTokenSymbol: getTokenSymbol,
      showToast: showToast,
      decodeContractError: decodeContractError,
      isNonMediaAsset: isNonMediaAsset,
      getListing: getListing,
      normalizeLedgerAsset: normalizeLedgerAsset,
      pc2Fetch: pc2Fetch,
      USDC_ADDRESS: USDC_ADDRESS,
      PAGE_SIZE: PAGE_SIZE
    },
    openDetail: openDetail,
    openChannel: openChannel,
    switchView: switchView,
    renderCard: renderCard,
    loadBrowse: loadBrowse,
    loadEarningsView: loadEarningsView,
    loadEarningsData: loadEarningsData,
    renderGovernanceSection: renderGovernanceSection,
    renderSupplyInfo: renderSupplyInfo,
    renderOpTypeBadge: renderOpTypeBadge,
    renderOwnershipBalances: renderOwnershipBalances,
    enrichFromChain: enrichFromChain
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
