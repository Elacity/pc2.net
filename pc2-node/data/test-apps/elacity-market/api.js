/**
 * Elacity GraphQL API client for the Market Browser.
 * Calls the Elacity Base chain API directly.
 */
var ElacityAPI = (function () {
  'use strict';

  var BASE_URL = 'https://base.ela.city/api';
  var GQL_ENDPOINT_REMOTE = BASE_URL + '/2.0/graphql';
  var GQL_ENDPOINT = '/api/elacity/graphql';

  // v1.2.7.7 (Bug-G mirror): per-mode JWT cache. The Elacity backend
  // issues a JWT whose principal differs depending on whether `sa` was
  // supplied to userLogin — owner-only mutations (updateChannelInformation,
  // updateSubscriptionPlan) require the principal to match the channel's
  // `creator`. A user who has both an EOA and a Smart Account may own
  // some channels via EOA and others via SA, so a single global token
  // can't cover both — we keep one per mode.
  var tokens = { eoa: null, sa: null };
  var signerAddresses = { eoa: null, sa: null };
  // Back-compat aliases — older code paths use a single auth token.
  // `authToken` mirrors whichever mode was most recently logged-in (EOA
  // wins by default since the connect-on-load path defaults to 'eoa').
  var authToken = null;
  var signerAddress = null;

  try {
    var storedToken = sessionStorage.getItem('elacity_auth_token');
    var storedSigner = sessionStorage.getItem('elacity_signer_address');
    var storedTokenSa = sessionStorage.getItem('elacity_auth_token_sa');
    var storedSignerSa = sessionStorage.getItem('elacity_signer_address_sa');
    if (storedToken) { authToken = storedToken; tokens.eoa = storedToken; }
    if (storedSigner) { signerAddress = storedSigner; signerAddresses.eoa = storedSigner; }
    if (storedTokenSa) { tokens.sa = storedTokenSa; }
    if (storedSignerSa) { signerAddresses.sa = storedSignerSa; }
  } catch (_) {}

  // ── GraphQL Transport ────────────────────────────────

  function gql(query, variables, requiresAuth, opts) {
    var mode = (opts && opts.authMode) || null;
    // When mode is explicit, hard-pick that token; throw if missing so
    // callers get a clear error rather than a silent backend rejection.
    var selectedToken = null;
    var selectedSigner = null;
    if (mode === 'sa' || mode === 'eoa') {
      selectedToken = tokens[mode];
      selectedSigner = signerAddresses[mode];
    } else {
      selectedToken = authToken;
      selectedSigner = signerAddress;
    }

    var headers = { 'Content-Type': 'application/json' };
    if (selectedToken) {
      headers['Authorization'] = 'Bearer ' + selectedToken;
    }
    if (requiresAuth && selectedSigner) {
      headers['X-ETH-Signer'] = selectedSigner;
    }

    var body = variables;
    if (body && body.query && body.query.type) {
      body = JSON.parse(JSON.stringify(body));
      if (!body.query.filterby) body.query.filterby = [];
    }

    return fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ query: query, variables: body })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var msg = 'API ' + res.status;
            try {
              var parsed = JSON.parse(txt);
              if (parsed.errors && parsed.errors[0]) msg += ': ' + parsed.errors[0].message;
            } catch (_) {
              if (txt && txt.length < 300) msg += ': ' + txt;
            }
            var isSchemaError = res.status === 400 && /Cannot query field|must have a selection of subfields/.test(msg);
            if (!isSchemaError) {
              console.error('[API] Request failed:', msg, 'headers:', JSON.stringify(headers));
            }
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (json) {
        if (json.errors && json.errors.length > 0) {
          if (!json.data || Object.values(json.data).every(function (v) { return v === null; })) {
            throw new Error(json.errors[0].message || 'GraphQL error');
          }
          console.warn('[API] GraphQL partial errors:', json.errors.map(function (e) { return e.message; }));
        }
        return json.data;
      });
  }

  // ── Fragments ────────────────────────────────────────

  var PROFILE_FIELDS = '\n\
    fragment profileFields on Account {\n\
      address\n\
      alias\n\
      avatar\n\
      did {\n\
        trustLevel\n\
        credentials {\n\
          name\n\
          avatar { thumbnail }\n\
        }\n\
      }\n\
    }';

  var NFT_FIELDS = '\n\
    fragment nftFields on ERC721Token {\n\
      _id\n\
      variant\n\
      contractAddress\n\
      tokenID\n\
      hexTokenID\n\
      thumbnailPath\n\
      name\n\
      description\n\
      category\n\
      imageURL\n\
      owner { ...profileFields }\n\
      price\n\
      paymentToken\n\
      createdAt\n\
      listedAt\n\
      saleEndsAt\n\
    }';

  // ── Query: Browse NFTs ───────────────────────────────

  var FETCH_ITEMS_QUERY = '\n\
    query FetchNFTItems($query: NFTItemQueryInput, $filters: FilterPaginationInput) {\n\
      assets: fetchNFTItems(query: $query, filters: $filters) {\n\
        total\n\
        offset\n\
        limit\n\
        data {\n\
          __typename\n\
          ... on StandardAsset {\n\
            ...nftFields\n\
            collection {\n\
              address: erc721Address\n\
              name: collectionName\n\
              creator: owner { ...profileFields }\n\
              description\n\
              imageURL: logoThumbnail\n\
            }\n\
            metadata {\n\
              type\n\
              description\n\
              properties {\n\
                mimeType\n\
                account { ...profileFields }\n\
                royalty\n\
                chainId\n\
              }\n\
            }\n\
          }\n\
          ... on ProtectedAsset {\n\
            ...nftFields\n\
            channel {\n\
              address\n\
              name\n\
              image\n\
              imageURL\n\
              creator { ...profileFields }\n\
              description\n\
              itemsCount\n\
            }\n\
            metadata {\n\
              kid\n\
              media {\n\
                contentType\n\
                protectionType\n\
              }\n\
              properties {\n\
                publisher { ...profileFields }\n\
                authority\n\
                labelType\n\
                distribution\n\
                chainId\n\
              }\n\
              attributes {\n\
                trait_type\n\
                value\n\
              }\n\
            }\n\
            operative {\n\
              opType\n\
              resellerCut\n\
              access {\n\
                totalSupply\n\
                listings {\n\
                  seller\n\
                  quantity\n\
                  price\n\
                  payToken\n\
                }\n\
              }\n\
            }\n\
            access {\n\
              haveAccess\n\
              entitlement\n\
            }\n\
          }\n\
        }\n\
      }\n\
    }\n' + NFT_FIELDS + '\n' + PROFILE_FIELDS;

  // ── Query: NFT Detail ────────────────────────────────

  var GET_ASSET_QUERY = '\n\
    query FetchLedgerAssetPublic($address: String!, $tokenId: TokenID!) {\n\
      nft: getLedgerAsset(address: $address, tokenId: $tokenId) {\n\
        tokenId\n\
        tokenURI\n\
        image\n\
        name\n\
        channel {\n\
          address\n\
          name\n\
          image\n\
          imageURL\n\
          description\n\
          itemsCount\n\
          creator { ...profileFields }\n\
          statistics {\n\
            count\n\
            owners\n\
            floor {\n\
              price\n\
              paymentToken\n\
            }\n\
          }\n\
        }\n\
        metadata {\n\
          kid\n\
          iscc\n\
          name\n\
          description\n\
          properties {\n\
        contract\n\
        publisher { ...profileFields }\n\
        ledger\n\
        chainId\n\
        authority\n\
        labelType\n\
        distribution\n\
          }\n\
          media {\n\
            uri\n\
            contentType\n\
            protectionType\n\
            previewURL\n\
            size\n\
          }\n\
          attributes {\n\
            trait_type\n\
            value\n\
          }\n\
        }\n\
        isProtected\n\
        operative {\n\
          address\n\
          opType\n\
          resellerCut\n\
          access {\n\
            totalSupply\n\
            listings {\n\
              seller\n\
              price\n\
              quantity\n\
              payToken\n\
            }\n\
          }\n\
        }\n\
        views\n\
        createdAt\n\
      }\n\
    }\n' + PROFILE_FIELDS;

  // ── Query: My Accessible Assets ─────────────────────

  var FETCH_ACCESSIBLE_ASSETS_QUERY = '\n\
    query FetchAccessibleAssets($query: LedgerAssetQuery, $filters: FilterPaginationInput) {\n\
      assets: fetchAccessibleAssets(query: $query, filters: $filters) {\n\
        total\n\
        offset\n\
        limit\n\
        data {\n\
          __typename\n\
          ... on ProtectedAsset {\n\
            ...nftFields\n\
            channel {\n\
              address\n\
              name\n\
              image\n\
              imageURL\n\
              creator { ...profileFields }\n\
              description\n\
              itemsCount\n\
            }\n\
            metadata {\n\
              kid\n\
              media {\n\
                contentType\n\
                protectionType\n\
              }\n\
              properties {\n\
                publisher { ...profileFields }\n\
                authority\n\
                labelType\n\
                distribution\n\
                chainId\n\
              }\n\
              attributes {\n\
                trait_type\n\
                value\n\
              }\n\
            }\n\
            operative {\n\
              opType\n\
              resellerCut\n\
              access {\n\
                totalSupply\n\
                listings {\n\
                  seller\n\
                  quantity\n\
                  price\n\
                  payToken\n\
                }\n\
              }\n\
            }\n\
          }\n\
        }\n\
      }\n\
    }\n' + NFT_FIELDS + '\n' + PROFILE_FIELDS;

  // ── Channel Queries ─────────────────────────────────

  var RETRIEVE_CHANNEL_QUERY = '\n\
    query RetrieveChannel($query: ChannelQueryInput) {\n\
      channel: retrieveChannel(query: $query) {\n\
        _id\n\
        name\n\
        address\n\
        description\n\
        channelType\n\
        categories\n\
        image\n\
        imageURL\n\
        coverImage\n\
        coverImageURL\n\
        itemsCount\n\
        isPublic\n\
        creator { ...profileFields }\n\
        plans {\n\
          planId\n\
          label\n\
          description\n\
          price\n\
          payToken\n\
          duration {\n\
            unit\n\
            value\n\
          }\n\
        }\n\
        tokenAccess {\n\
          address\n\
          value\n\
        }\n\
      }\n\
    }\n' + PROFILE_FIELDS;

  var LIST_SUBSCRIBERS_QUERY = '\n\
    query ListSubscribers($address: String!, $follower: String) {\n\
      subscribers: listSubscribers(address: $address, follower: $follower) {\n\
        count\n\
        isAmong\n\
      }\n\
    }';

  var CHECK_CHANNEL_ACCESS_QUERY = `
  query CheckChannelAccess($address: String!, $subscriber: String!) {
    access: checkChannelAccess(address: $address, subscriber: $subscriber) {
      haveAccess
      model {
        __typename
        ... on AccessModelOwner {
          type
        }
        ... on AccessModelSubscription {
          type
          planId
          expiresAt
        }
        ...on AccessModelToken {
          type
          address
          balance
        }
      }
    }
  }`;

  var SUBSCRIBE_CHANNEL_MUTATION = '\n\
    mutation SubscribeChannel($to: String!) {\n\
      subscribeChannel(to: $to) {\n\
        _id\n\
      }\n\
    }';

  var UNSUBSCRIBE_CHANNEL_MUTATION = '\n\
    mutation UnsubscribeChannel($to: String!) {\n\
      unsubscribeChannel(to: $to)\n\
    }';

  var FETCH_CHANNELS_QUERY = '\n\
    query FetchChannels($query: ChannelQueryInput, $filters: FilterPaginationInput) {\n\
      channels: fetchChannels(query: $query, filters: $filters) {\n\
        total\n\
        offset\n\
        limit\n\
        data {\n\
          _id\n\
          name\n\
          address\n\
          description\n\
          channelType\n\
          categories\n\
          image\n\
          imageURL\n\
          coverImage\n\
          coverImageURL\n\
          itemsCount\n\
          isPublic\n\
          creator { ...profileFields }\n\
          statistics {\n\
            subscribers\n\
            quote\n\
            floor {\n\
              price\n\
              paymentToken\n\
              priceInUSD\n\
            }\n\
          }\n\
        }\n\
      }\n\
    }\n' + PROFILE_FIELDS;

  var FETCH_CHANNEL_ITEMS_QUERY = '\n\
    query FetchChannelItems($query: LedgerAssetQuery, $filters: FilterPaginationInput) {\n\
      assets: fetchLedgerAssets(query: $query, filters: $filters) {\n\
        total\n\
        offset\n\
        limit\n\
        items {\n\
          tokenId\n\
          tokenURI\n\
          name\n\
          description\n\
          image\n\
          isProtected\n\
          createdAt\n\
          views\n\
          metadata {\n\
            name\n\
            description\n\
            image\n\
            kid\n\
            media {\n\
              uri\n\
              contentType\n\
              previewURL\n\
            }\n\
            properties {\n\
              chainId\n\
              ledger\n\
              authority\n\
              publisher { ...profileFields }\n\
              tags\n\
              categories\n\
            }\n\
            attributes {\n\
              trait_type\n\
              value\n\
            }\n\
          }\n\
          operative {\n\
            opType\n\
            resellerCut\n\
            access {\n\
              totalSupply\n\
              listings {\n\
                seller\n\
                quantity\n\
                price\n\
                payToken\n\
              }\n\
            }\n\
          }\n\
          channel {\n\
            name\n\
            address\n\
            image\n\
            imageURL\n\
          }\n\
        }\n\
      }\n\
    }\n' + PROFILE_FIELDS;

  // ── Watch Later & Likes Queries ─────────────────────

  var GET_USER_PLAYLIST_QUERY = '\n\
    query GetUserPlaylist {\n\
      getUserPlaylist {\n\
        _id\n\
        name\n\
        contents {\n\
          contractAddress\n\
          tokenId\n\
        }\n\
      }\n\
    }';

  var IS_SAVED_TO_LATER_QUERY = '\n\
    query IsSavedToLater($item: PlaylistItemInput!) {\n\
      isSavedToLater(item: $item)\n\
    }';

  var ADD_PLAYLIST_ITEM_MUTATION = '\n\
    mutation AddPlaylistItem($id: String!, $item: PlaylistItemInput!) {\n\
      addPlaylistItem(id: $id, item: $item) {\n\
        _id\n\
        contents {\n\
          contractAddress\n\
          tokenId\n\
        }\n\
      }\n\
    }';

  var REMOVE_PLAYLIST_ITEM_MUTATION = '\n\
    mutation RemovePlaylistItem($id: String!, $item: PlaylistItemInput!) {\n\
      removePlaylistItem(id: $id, item: $item) {\n\
        _id\n\
        contents {\n\
          contractAddress\n\
          tokenId\n\
        }\n\
      }\n\
    }';

  var FETCH_LIKES_QUERY = '\n\
    query FetchLikesByToken($contractAddress: String!, $tokenId: TokenID!, $address: String) {\n\
      likes: fetchLikesByToken(contractAddress: $contractAddress, tokenId: $tokenId, address: $address) {\n\
        count\n\
        isAmong\n\
      }\n\
    }';

  var TOGGLE_LIKE_MUTATION = '\n\
    mutation ToggleLike($contractAddress: String!, $tokenId: TokenID!) {\n\
      toggleLike(contractAddress: $contractAddress, tokenId: $tokenId)\n\
    }';

  // ── Query Presets ────────────────────────────────────

  var PRESETS = {
    all: function (offset, limit) {
      return [
        { type: 'single' },
        { offset: offset || 0, limit: limit || 20, sort: { createdAt: -1 } }
      ];
    },
    buyNow: function (offset, limit) {
      return [
        { type: 'single', variant: 'drm', filterby: ['buyNow'] },
        { offset: offset || 0, limit: limit || 20, sort: { listedAt: -1 } }
      ];
    },
    free: function (offset, limit) {
      return [
        { type: 'single', filterby: ['free'] },
        { offset: offset || 0, limit: limit || 20, sort: { createdAt: -1 } }
      ];
    },
    myAssets: function (offset, limit) {
      return [
        { type: 'single', variant: 'drm', contentType: ['audio', 'video', 'image'] },
        { offset: offset || 0, limit: limit || 20, sort: { createdAt: -1 } },
        true
      ];
    }
  };

  // ── Auth Queries ─────────────────────────────────────

  var GET_NONCE_QUERY = '\n\
    query GetNonce($address: String!) {\n\
      nonce: getNonce(address: $address)\n\
    }';

  var USER_LOGIN_MUTATION = '\n\
    mutation UserLogin($address: String!, $signature: String!, $sa: String) {\n\
      auth: userLogin(address: $address, signature: $signature, sa: $sa) {\n\
        address\n\
        token\n\
        expiresIn\n\
        sa\n\
      }\n\
    }';

  // ── V3 Operative Registry ──────────────────────────────

  var _v3OperativesCache = null;

  function getV3Operatives() {
    if (_v3OperativesCache) return Promise.resolve(_v3OperativesCache);
    var origin = window.puter_api_origin || window.location.origin;
    return fetch(origin + '/api/catalog/operatives')
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.success && json.operatives) {
          _v3OperativesCache = new Set(json.operatives.map(function (a) { return a.toLowerCase(); }));
          return _v3OperativesCache;
        }
        return new Set();
      })
      .catch(function () { return new Set(); });
  }

  // ── Public API ───────────────────────────────────────

  function fetchFromCatalog(offset, limit, channelAddress) {
    var origin = window.puter_api_origin || window.location.origin;
    var url = origin + '/api/catalog?limit=' + (limit || 50) + '&offset=' + (offset || 0);
    if (channelAddress) url += '&channel=' + encodeURIComponent(channelAddress);
    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.success) return null;
        var nfts = json.items.filter(function (i) { return i.metadata_status === 'resolved'; })
          .map(function (item) { return catalogItemToNft(item); });
        if (nfts.length === 0) return null;
        return { total: json.total, offset: offset || 0, limit: limit || 50, data: nfts };
      })
      .catch(function () { return null; });
  }

  // The local /api/catalog endpoint returns ALL resolved items in one batch
  // (no server-side category / content-type filtering). The PRESETS expressed
  // intent via { filterby: [...], contentType: [...] } but it was a no-op for
  // the local catalog path and only wired up to the remote GraphQL fallback.
  // Apply the same filter intent client-side here so chip selection actually
  // narrows the visible set on every PC2 node.
  function applyClientSideFilters(items, query) {
    if (!Array.isArray(items)) return items;
    var filterby = (query && query.filterby) || [];
    var contentType = (query && query.contentType) || [];

    var filtered = items;

    if (filterby.indexOf('buyNow') !== -1) {
      filtered = filtered.filter(function (n) {
        var op = n.operative && n.operative.opType;
        return op === 1 || op === 2;
      });
    } else if (filterby.indexOf('free') !== -1) {
      filtered = filtered.filter(function (n) {
        var op = (n.operative && n.operative.opType) || 0;
        return op === 0;
      });
    }

    if (contentType.length > 0) {
      filtered = filtered.filter(function (n) {
        return matchesContentType(n, contentType);
      });
    }

    return filtered;
  }

  // Maps a chip's data-type value to the catalog row's asset_type. Most chips
  // are 1:1 (video, audio, image), but "ebook" covers PDF + EPUB which the
  // indexer stores as asset_type='document' or 'other', and "3d" covers any
  // glb/gltf/fbx/obj content currently classified as 'ai-model' or '3d'.
  function matchesContentType(nft, chipTypes) {
    var rawAssetType = nft._rawAssetType || '';
    var mime = (nft.metadata && nft.metadata.media && (nft.metadata.media.contentType || nft.metadata.media.mimeType)) || '';
    var assetTypeStr = String(rawAssetType).toLowerCase();
    var mimeStr = String(mime).toLowerCase();

    for (var i = 0; i < chipTypes.length; i++) {
      var chip = String(chipTypes[i]).toLowerCase();
      if (chip === 'video' && (mimeStr.indexOf('video/') === 0 || assetTypeStr === 'video')) return true;
      if (chip === 'audio' && (mimeStr.indexOf('audio/') === 0 || assetTypeStr === 'audio')) return true;
      if (chip === 'image' && (mimeStr.indexOf('image/') === 0 || assetTypeStr === 'image')) return true;
      if (chip === 'ebook' && (mimeStr.indexOf('epub') !== -1 || mimeStr === 'application/pdf' || assetTypeStr === 'document' || assetTypeStr === 'other')) return true;
      if (chip === '3d' && (mimeStr.indexOf('gltf') !== -1 || mimeStr.indexOf('glb') !== -1 || assetTypeStr === '3d' || assetTypeStr === 'ai-model')) return true;
    }
    return false;
  }

  function fetchItems(query, filters) {
    var off = (filters && filters.offset) || 0;
    var lim = (filters && filters.limit) || 50;
    var searchBy = (filters && filters.searchBy) || '';

    return fetchFromCatalog(off, lim).then(function (catalogResult) {
      if (catalogResult && catalogResult.data.length > 0) {
        var filteredData = applyClientSideFilters(catalogResult.data, query);
        if (searchBy) filteredData = applySearchTerm(filteredData, searchBy);
        console.log('[API] Using local catalog (' + catalogResult.data.length + ' items, ' + filteredData.length + ' after filters)');
        return Object.assign({}, catalogResult, { data: filteredData });
      }
      return gql(FETCH_ITEMS_QUERY, { query: query, filters: filters })
        .then(function (data) { return normalizeAssetCollection(data.assets); });
    });
  }

  // Local-catalog search: case-insensitive match against the visible card
  // fields (asset name, description, channel name, creator address).
  // The /api/catalog endpoint has no server-side `q=` parameter today, so the
  // search bar would otherwise return EVERY catalog item regardless of query.
  // Future enhancement: push this into a SQL LIKE in the backend.
  function applySearchTerm(items, q) {
    if (!Array.isArray(items) || !q) return items;
    var needle = String(q).toLowerCase().trim();
    if (!needle) return items;
    return items.filter(function (n) {
      var name = (n.name || '').toLowerCase();
      var desc = ((n.metadata && n.metadata.description) || '').toLowerCase();
      var channelName = ((n.channel && n.channel.name) || '').toLowerCase();
      var creatorAddr = ((n.channel && n.channel.creator && n.channel.creator.address) || '').toLowerCase();
      return (
        name.indexOf(needle) !== -1 ||
        desc.indexOf(needle) !== -1 ||
        channelName.indexOf(needle) !== -1 ||
        creatorAddr.indexOf(needle) !== -1
      );
    });
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

  function normalizeAssetProtections(asset) {
    if (Array.isArray(asset && asset.protections)) {
      return asset.protections.filter(function (p) { return !!p && typeof p === 'object'; });
    }

    var protectionType = normalizeProtectionTypes(asset && asset.protectionType);
    if (protectionType.length === 0) return [];

    return [{
      algorithm: asset.algorithm || '',
      protectionType: protectionType[0],
      dataToEncryptHash: asset.dataToEncryptHash || '',
      actionCid: asset.actionCid || '',
      authority: asset.authority || '',
      chain: asset.chain || '',
      chainId: asset.chainId || null,
      rpc: asset.rpc || '',
      litCiphertext: asset.litCiphertext || '',
      iv: asset.iv || '',
      litBackend: asset.litBackend || '',
      contentHash: asset.contentHash || '',
      contentHashAlgorithm: asset.contentHashAlgorithm || ''
    }];
  }

  function hasEffectiveProtectionTypes(types) {
    return normalizeProtectionTypes(types).some(function (t) { return t.toLowerCase() !== 'none'; });
  }

  function hasEffectiveProtections(entries) {
    if (!Array.isArray(entries)) return false;
    return entries.some(function (p) {
      return hasEffectiveProtectionTypes(p && p.protectionType);
    });
  }

  function normalizeNftProtectionShape(nft) {
    if (!nft || !nft.metadata) return nft;

    var meta = nft.metadata || {};
    var media = meta.media || {};
    var asset = (nft._rawAsset || meta.asset || {});

    var mediaProtectionTypes = normalizeProtectionTypes(media.protectionType);
    var protections = normalizeAssetProtections(asset);
    var encrypted = !!asset.encrypted;
    var isProtected = encrypted || hasEffectiveProtectionTypes(mediaProtectionTypes) || hasEffectiveProtections(protections);

    var normalizedAsset = Object.assign({}, asset, { protections: protections });
    var normalizedMeta = Object.assign({}, meta, {
      media: Object.assign({}, media, { protectionType: mediaProtectionTypes }),
      asset: normalizedAsset
    });

    return Object.assign({}, nft, {
      isProtected: isProtected,
      metadata: normalizedMeta,
      _rawAsset: normalizedAsset
    });
  }

  function normalizeAssetCollection(collection) {
    if (!collection || !Array.isArray(collection.data)) return collection;
    return Object.assign({}, collection, {
      data: collection.data.map(normalizeNftProtectionShape)
    });
  }

  // Resolve the asset's operative type (0=Free, 1=Buy Once, 2=Buy & Resell)
  // by preferring the indexed on-chain truth (item.op_type from the operative
  // contract event) over the legacy metadata.pricing.accessMethod inference.
  // Newer asset metadata schemas (v1.1+) no longer embed pricing fields, so
  // metadata-only inference incorrectly defaulted every paid asset to Free.
  function catalogResolveOpType(item, pricing) {
    if (typeof item.op_type === 'number' && item.op_type >= 0) return item.op_type;
    if (pricing && pricing.accessMethod === 'buy_and_resell') return 2;
    if (pricing && pricing.price) return 1;
    return 0;
  }

  // Build the listings[] array for the operative.access object. Prefers the
  // indexed on-chain price/payment_token columns; falls back to metadata
  // pricing for legacy assets that still embed pricing inline.
  function catalogResolveListings(item, pricing) {
    if (item.price) {
      return [{
        seller: item.creator_address || '',
        price: String(item.price),
        quantity: pricing.copies || 1,
        payToken: item.payment_token || pricing.currencyAddress || '',
      }];
    }
    if (pricing && pricing.price) {
      return [{
        seller: item.creator_address || '',
        price: String(Math.round(pricing.price * Math.pow(10, pricing.currencyDecimals || 6))),
        quantity: pricing.copies || 1,
        payToken: pricing.currencyAddress || '',
      }];
    }
    return [];
  }

  // Surface a decimal-converted top-level { price, paymentToken } on the NFT
  // object so feed-card render code (formatPrice(item.price, item.paymentToken))
  // displays the real price (e.g. "$0.01 USDC") rather than falling through to
  // the tier-label fallback. USDC = 6 decimals, ETH/native = 18.
  // Returns { price: <number|null>, paymentToken: <string|''> }.
  function catalogResolveTopLevelPrice(listings) {
    if (!listings || !listings.length) return { price: null, paymentToken: '' };
    var l = listings[0];
    if (!l || !l.price) return { price: null, paymentToken: '' };
    var token = (l.payToken || '').toLowerCase();
    var USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
    var decimals = token === USDC ? 6 : 18;
    var n;
    try { n = Number(BigInt(l.price)) / Math.pow(10, decimals); }
    catch (_) { n = parseFloat(l.price) / Math.pow(10, decimals); }
    if (!isFinite(n)) return { price: null, paymentToken: '' };
    return { price: n, paymentToken: l.payToken || '' };
  }

  function catalogItemToNft(item) {
    var raw = {};
    try { raw = item.metadata_json ? JSON.parse(item.metadata_json) : {}; } catch (_) {}
    var media = raw.media || {};
    var props = raw.properties || {};
    var pricing = raw.pricing || {};
    var asset = raw.asset || {};
    var assetProtections = normalizeAssetProtections(asset);
    var creator = raw.creator || {};
    var chMeta = item._channelMeta || {};

    // Don't fall back to props.labelType for the channel name. labelType is
    // a metadata role tag (almost always literal "Creator" for assets minted
    // via elacity-creator) and surfaces under the Properties panel. Using it
    // as a channel-name fallback caused every channel without a cached name
    // to display as "Creator" -- confusing non-creator viewers into thinking
    // a watermark / role label was being shown for them. The downstream
    // GENERIC_NAMES handler resolves an empty channel name on-chain via
    // fetchChannelName(channel.address), so '' is the correct fallback.
    var channelName = chMeta.name || '';
    var channelImage = chMeta.image || chMeta.coverImage || '';
    var creatorAlias = creator.name || creator.alias || '';

    var resolvedListings = catalogResolveListings(item, pricing);
    var topPrice = catalogResolveTopLevelPrice(resolvedListings);

    return normalizeNftProtectionShape({
      tokenId: item.token_id,
      contractAddress: item.channel_address,
      hexTokenID: item.token_id,
      tokenID: item.token_id,
      address: item.channel_address,
      tokenURI: item.metadata_cid ? ('ipfs://' + item.metadata_cid) : '',
      image: item.image_url || '',
      name: item.name || raw.name || 'Untitled',
      price: topPrice.price,
      paymentToken: topPrice.paymentToken,
      createdAt: raw.createdAt || new Date(item.indexed_at).toISOString(),
      views: 0,
      isProtected: !!(asset.encrypted || media.protectionType),
      channel: {
        address: item.channel_address,
        name: channelName,
        image: channelImage,
        imageURL: channelImage,
        description: chMeta.description || '',
        itemsCount: 0,
        creator: { address: item.creator_address || creator.address || '', alias: creatorAlias, avatar: '' }
      },
      metadata: {
        kid: raw.kid || asset.kid || (props.kid || null),
        name: item.name || raw.name || '',
        description: raw.description || item.description || '',
        media: {
          uri: media.uri || '',
          contentType: media.contentType || media.mimeType || item.mime_type || '',
          protectionType: media.protectionType || [],
          previewURL: media.previewURL || '',
          size: media.size || 0,
        },
        properties: {
          contract: props.contract || '',
          publisher: { address: item.creator_address || props.publisher || '' },
          ledger: props.ledger || item.channel_address,
          chainId: props.chainId || item.chain_id || 8453,
          authority: props.authority || (assetProtections[0] && assetProtections[0].authority) || asset.authority || '',
          labelType: props.labelType || '',
          distribution: props.distribution || '',
        },
        asset: asset,
        attributes: raw.attributes || [],
      },
      operative: {
        address: item.operative_address || '',
        opType: catalogResolveOpType(item, pricing),
        resellerCut: pricing.resellerCut || 0,
        owner: item.creator_address || '',
        access: {
          totalSupply: pricing.copies || 0,
          listings: resolvedListings,
        },
      },
      _rawAsset: asset,
      _catalogItem: true,
      _rawAssetType: item.asset_type || '',
      _isLocal: !!item.is_local,
      _contentCid: item.content_cid || '',
    });
  }

  function fetchAssetFromCatalog(contractAddress, tokenId) {
    var tid = (tokenId && typeof tokenId === 'object') ? (tokenId.hexTokenID || tokenId.tokenID || String(tokenId)) : String(tokenId || '');
    if (!tid || tid === 'undefined') return Promise.resolve(null);
    if (!contractAddress || typeof contractAddress !== 'string') return Promise.resolve(null);
    var origin = window.puter_api_origin || window.location.origin;
    return fetch(origin + '/api/catalog/asset/' + encodeURIComponent(contractAddress) + '/' + encodeURIComponent(tid))
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (json) {
        if (json && json.success && json.item) {
          console.log('[API] Loaded asset from local catalog:', json.item.name);
          return catalogItemToNft(json.item);
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function getAssetDetail(contractAddress, tokenId) {
    if (contractAddress && typeof contractAddress === 'object') {
      var obj = contractAddress;
      contractAddress = obj.contractAddress || obj.address || '';
      tokenId = tokenId || obj.hexTokenID || obj.tokenID || '';
    }
    var tid = (tokenId && typeof tokenId === 'object') ? (tokenId.hexTokenID || tokenId.tokenID || String(tokenId)) : String(tokenId || '');
    if (!contractAddress || typeof contractAddress !== 'string') return Promise.reject(new Error('Invalid contract address'));
    return fetchAssetFromCatalog(contractAddress, tid).then(function (catalogNft) {
      if (catalogNft) return catalogNft;
      return gql(GET_ASSET_QUERY, { address: contractAddress, tokenId: tid })
        .then(function (data) { return normalizeNftProtectionShape(data.nft); });
    });
  }

  function getNonce(address) {
    return gql(GET_NONCE_QUERY, { address: address })
      .then(function (data) { return data.nonce; });
  }

  function login(address, signature, sa) {
    // Mode is implied by whether `sa` was passed by the caller. SIWE
    // signatures are always made by the EOA — what changes is whether
    // the `sa` field is included in the userLogin mutation, which is
    // what causes the backend to issue a JWT for the SA principal
    // instead of the EOA principal.
    var mode = sa ? 'sa' : 'eoa';
    console.log('[Auth] login called with address:', address, 'sa:', sa, 'mode:', mode);
    return gql(USER_LOGIN_MUTATION, { address: address, signature: signature, sa: sa || null })
      .then(function (data) {
        console.log('[Auth] login response:', data.auth ? 'token=' + (data.auth.token ? 'yes' : 'no') + ' sa=' + data.auth.sa + ' mode=' + mode : 'null');
        if (data.auth && data.auth.token) {
          var newSigner = (data.auth.sa || address).toLowerCase();
          tokens[mode] = data.auth.token;
          signerAddresses[mode] = newSigner;
          // Keep legacy single-token path consistent — newest login wins.
          authToken = data.auth.token;
          signerAddress = newSigner;
          try {
            sessionStorage.setItem('elacity_auth_token', authToken);
            sessionStorage.setItem('elacity_signer_address', signerAddress);
            if (mode === 'sa') {
              sessionStorage.setItem('elacity_auth_token_sa', data.auth.token);
              sessionStorage.setItem('elacity_signer_address_sa', newSigner);
            }
          } catch (_) {}
        }
        return data.auth;
      });
  }

  function fetchAccessibleAssets(offset, limit) {
    return gql(
      FETCH_ACCESSIBLE_ASSETS_QUERY,
      { query: {}, filters: { offset: offset || 0, limit: limit || 20, sort: { createdAt: -1 } } },
      true
    ).then(function (data) { return normalizeAssetCollection(data.assets); });
  }

  function fetchAccessibleAssetsForAddress(address, offset, limit) {
    if (address) {
      var origin = window.puter_api_origin || window.location.origin;
      return fetch(origin + '/api/catalog/owned/' + address + '?offset=' + (offset || 0) + '&limit=' + (limit || 50))
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.success && json.items) {
            var nfts = json.items.map(catalogItemToNft);
            console.log('[API] Library owned items:', nfts.length, 'of', json.total);
            return { data: nfts, total: json.total };
          }
          return { data: [], total: 0 };
        })
        .catch(function (err) {
          console.warn('[API] Owned catalog fetch failed, falling back:', err.message);
          return fetchFromCatalog(offset || 0, limit || 50);
        });
    }
    return fetchFromCatalog(offset || 0, limit || 50).then(function (localResult) {
      if (localResult && localResult.data && localResult.data.length > 0) {
        console.log('[API] Library using local catalog (V3 only):', localResult.data.length, 'items');
        return localResult;
      }
      var headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      if (address) headers['X-ETH-Signer'] = address.toLowerCase();

      var body = { query: {}, filters: { offset: offset || 0, limit: limit || 20, sort: { createdAt: -1 } } };
      return fetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query: FETCH_ACCESSIBLE_ASSETS_QUERY, variables: body })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('API ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (json.errors && json.errors.length > 0 && (!json.data || Object.values(json.data).every(function (v) { return v === null; }))) {
            throw new Error(json.errors[0].message || 'GraphQL error');
          }
          return json.data ? json.data.assets : { total: 0, data: [] };
        })
        .catch(function (err) {
          console.warn('[API] fetchAccessibleAssets GraphQL also failed:', err.message);
          return { total: 0, data: [] };
        });
    });
  }

  function fetchWithPreset(presetName, offset, limit) {
    var preset = PRESETS[presetName];
    if (!preset) throw new Error('Unknown preset: ' + presetName);

    var args = preset(offset, limit);
    var requiresAuth = args[2] === true;

    return fetchFromCatalog(offset, limit).then(function (catalogResult) {
      if (catalogResult && catalogResult.data.length > 0) {
        console.log('[API] Using local catalog for preset "' + presetName + '" (' + catalogResult.data.length + ' items)');
        return catalogResult;
      }
      return gql(FETCH_ITEMS_QUERY, { query: args[0], filters: args[1] }, requiresAuth)
        .then(function (data) { return normalizeAssetCollection(data.assets); });
    });
  }

  function isAuthenticated(mode) {
    if (mode === 'sa' || mode === 'eoa') return !!tokens[mode];
    return !!authToken;
  }

  function getAuthToken(mode) {
    if (mode === 'sa' || mode === 'eoa') return tokens[mode];
    return authToken;
  }

  // v1.2.7.7 (stale-signer fix): tokens are cached by mode (eoa/sa)
  // but NOT by the actual signer address. If the user previously
  // SIWE-logged in with a different EOA — or rehydrated a token from
  // sessionStorage that belongs to another account — `isAuthenticated`
  // alone returns true and the save handler skips the fresh login.
  // The stale-principal JWT then gets sent to the backend and rejected
  // with "not allowed to edit this channel" (this was the 2026-05-04
  // user-visible regression). `isAuthenticatedAs` adds the principal
  // check so callers that know which signer they NEED (= the channel
  // creator) can detect a stale cached token and force a fresh SIWE.
  function isAuthenticatedAs(mode, expectedSigner) {
    if (!expectedSigner) return isAuthenticated(mode);
    var token, signer;
    if (mode === 'sa' || mode === 'eoa') {
      token = tokens[mode];
      signer = signerAddresses[mode];
    } else {
      token = authToken;
      signer = signerAddress;
    }
    if (!token || !signer) return false;
    return String(signer).toLowerCase() === String(expectedSigner).toLowerCase();
  }

  function getCachedSigner(mode) {
    if (mode === 'sa' || mode === 'eoa') return signerAddresses[mode] || null;
    return signerAddress || null;
  }

  function clearAuth() {
    authToken = null;
    signerAddress = null;
    tokens.eoa = null; tokens.sa = null;
    signerAddresses.eoa = null; signerAddresses.sa = null;
    try {
      sessionStorage.removeItem('elacity_auth_token');
      sessionStorage.removeItem('elacity_signer_address');
      sessionStorage.removeItem('elacity_auth_token_sa');
      sessionStorage.removeItem('elacity_signer_address_sa');
    } catch (_) {}
  }

  function setSignerAddress(address) {
    signerAddress = address;
  }

  function retrieveChannelFromCatalog(channelAddress) {
    return fetchChannelsFromCatalog().then(function (result) {
      if (!result || !result.data) return null;
      return result.data.find(function (ch) {
        return ch.address && ch.address.toLowerCase() === channelAddress.toLowerCase();
      }) || null;
    });
  }

  // v1.2.7.7 (name-sync): the previous implementation returned the PC2
  // local catalog entry whenever it existed, and only fell through to
  // the GraphQL backend if the local mirror was empty. That made the
  // local mirror SHADOW the canonical Elacity backend forever once the
  // channel was indexed once, which directly produced the user-visible
  // bug on 2026-05-04: a fresh rename in elacity-creator (committed to
  // the backend) never appeared in elacity-market because market kept
  // returning the stale local-catalog "Woah" entry from a prior failed
  // save.
  //
  // New policy:
  //   • Fetch local catalog AND backend in parallel.
  //   • Prefer backend when it answers — backend is the canonical source
  //     for the mutable display name / description / images.
  //   • Local catalog only wins when backend is unreachable (offline
  //     fallback). All callers continue to work in offline mode.
  //   • Self-heal: if backend differs from local on any mutable field,
  //     mirror backend → local so subsequent reads (and any other dApp
  //     reading the same PC2 mirror, e.g. elacity-creator) see the
  //     canonical state without waiting for another save event.
  function retrieveChannel(channelAddress) {
    var localP = retrieveChannelFromCatalog(channelAddress).catch(function () { return null; });
    var backendP = gql(RETRIEVE_CHANNEL_QUERY, { query: { address: channelAddress } })
      .then(function (data) { return (data && data.channel) ? data.channel : null; })
      .catch(function () { return null; });
    return Promise.all([localP, backendP]).then(function (results) {
      var local = results[0];
      var backend = results[1];
      if (!backend && !local) return null;
      if (!backend) return local;
      if (local) {
        var diverges =
          (backend.name || '') !== (local.name || '') ||
          (backend.description || '') !== (local.description || '') ||
          (backend.image || '') !== (local.image || '') ||
          (backend.coverImage || '') !== (local.coverImage || '');
        if (diverges) {
          console.log('[API] Local catalog diverges from backend for ' + channelAddress + '; mirroring backend → local');
          updateChannelLocal(channelAddress, {
            name: backend.name,
            description: backend.description,
            image: backend.image,
            coverImage: backend.coverImage
          }).catch(function (e) {
            console.warn('[API] local self-heal failed:', e && e.message);
          });
        }
      }
      return backend;
    });
  }

  function fetchChannelsFromCatalog() {
    var origin = window.puter_api_origin || window.location.origin;
    return fetch(origin + '/api/catalog/channels')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        if (!json || !json.data || json.data.length === 0) return null;
        var channels = json.data.map(function (ch) {
          var cats = [];
          if (ch.categories) {
            try { cats = typeof ch.categories === 'string' ? JSON.parse(ch.categories) : ch.categories; } catch (_) { cats = ch.categories.split(',').map(function (c) { return c.trim(); }); }
          }
          var plans = [];
          if (ch.plans) {
            try { plans = typeof ch.plans === 'string' ? JSON.parse(ch.plans) : ch.plans; } catch (_) { plans = []; }
          }
          var tokenAccess = [];
          if (ch.tokenAccess) {
            try { tokenAccess = typeof ch.tokenAccess === 'string' ? JSON.parse(ch.tokenAccess) : ch.tokenAccess; } catch (_) { tokenAccess = []; }
          }
          return {
            _id: ch.address,
            name: ch.name || ('Channel ' + ch.address.substring(0, 8)),
            address: ch.address,
            description: ch.description || '',
            channelType: 'content',
            categories: Array.isArray(cats) ? cats : [],
            image: ch.image || '',
            imageURL: ch.image || '',
            coverImage: ch.coverImage || '',
            coverImageURL: ch.coverImage || '',
            itemsCount: ch.itemsCount || 0,
            creator: { address: ch.creator },
            plans: plans,
            tokenAccess: tokenAccess
          };
        });
        return { total: channels.length, offset: 0, limit: channels.length, data: channels };
      })
      .catch(function () { return null; });
  }

  // v1.2.7.7 (name-sync): shared overlay/self-heal helper for any code
  // path that returns a list of channels. The same divergence problem
  // that breaks the channel-detail page (local catalog shadows backend)
  // also breaks every list view: the channels grid, the creator's "my
  // channels" panel, the search filters, etc. Each call site used to
  // bail out of the backend fetch as soon as the local catalog had any
  // data — so a stale local entry would shadow the backend forever.
  //
  // Policy:
  //   • Local entries WIN for "does this channel exist on this PC2".
  //     They may include channels the backend hasn't indexed yet
  //     (newly created, indexer lag) — never drop them.
  //   • Backend entries WIN for the mutable display fields
  //     (name / description / image / coverImage / categories) when the
  //     same address exists in both. Backend is the canonical source.
  //   • Backend-only channels are appended to the result so global lists
  //     are not artificially limited to what this PC2 has cached.
  //   • Self-heal: any divergence is mirrored backend → local so other
  //     dApps reading the same PC2 catalog catch up immediately.
  function mergeChannelLists(localResult, backendResult) {
    var local = (localResult && localResult.data) ? localResult : { data: [] };
    var backend = (backendResult && backendResult.data) ? backendResult : { data: [] };
    if (local.data.length === 0 && backend.data.length === 0) return { total: 0, offset: 0, limit: 0, data: [] };
    if (backend.data.length === 0) return localResult || { total: 0, offset: 0, limit: 0, data: [] };
    if (local.data.length === 0) return backendResult || { total: 0, offset: 0, limit: 0, data: [] };

    var backendByAddr = {};
    backend.data.forEach(function (bch) {
      var addr = ((bch.address || bch._id || '') + '').toLowerCase();
      if (addr) backendByAddr[addr] = bch;
    });

    var merged = local.data.map(function (lch) {
      var addr = ((lch.address || lch._id || '') + '').toLowerCase();
      var bch = addr ? backendByAddr[addr] : null;
      if (!bch) return lch;
      var diverges =
        ((bch.name || '') !== (lch.name || '')) ||
        ((bch.description || '') !== (lch.description || '')) ||
        ((bch.image || '') !== (lch.image || '')) ||
        ((bch.coverImage || '') !== (lch.coverImage || ''));
      if (diverges) {
        console.log('[API] Channel list overlay: ' + addr + ' diverges from backend; mirroring backend → local');
        updateChannelLocal(addr, {
          name: bch.name,
          description: bch.description,
          image: bch.image,
          coverImage: bch.coverImage
        }).catch(function (e) {
          console.warn('[API] list self-heal failed:', e && e.message);
        });
      }
      var overlaid = {};
      Object.keys(lch).forEach(function (k) { overlaid[k] = lch[k]; });
      if (bch.name) overlaid.name = bch.name;
      if (bch.description !== undefined && bch.description !== null) overlaid.description = bch.description;
      if (bch.image) {
        overlaid.image = bch.image;
        overlaid.imageURL = bch.image;
      }
      if (bch.coverImage) {
        overlaid.coverImage = bch.coverImage;
        overlaid.coverImageURL = bch.coverImage;
      }
      if (bch.categories) overlaid.categories = bch.categories;
      return overlaid;
    });

    var localAddrs = {};
    local.data.forEach(function (lch) {
      var a = ((lch.address || lch._id || '') + '').toLowerCase();
      if (a) localAddrs[a] = true;
    });
    backend.data.forEach(function (bch) {
      var a = ((bch.address || bch._id || '') + '').toLowerCase();
      if (a && !localAddrs[a]) merged.push(bch);
    });

    return {
      total: merged.length,
      offset: localResult && localResult.offset ? localResult.offset : 0,
      limit: localResult && localResult.limit ? localResult.limit : merged.length,
      data: merged
    };
  }

  function fetchChannels(offset, limit) {
    var localP = fetchChannelsFromCatalog().catch(function () { return null; });
    var backendP = gql(FETCH_CHANNELS_QUERY, {
      query: {},
      filters: { offset: offset || 0, limit: limit || 30, sort: { itemsCount: -1 } }
    }).then(function (data) { return data && data.channels ? data.channels : null; })
      .catch(function () { return null; });
    return Promise.all([localP, backendP]).then(function (results) {
      var local = results[0];
      var backend = results[1];
      if (!backend && !local) return { total: 0, offset: 0, limit: 0, data: [] };
      if (!backend) {
        console.log('[API] Channels grid: backend unreachable, using local catalog only (' + (local.data ? local.data.length : 0) + ' channels)');
        return local;
      }
      if (!local || !local.data || local.data.length === 0) return backend;
      return mergeChannelLists(local, backend);
    });
  }

  function fetchChannelItems(channelAddress, offset, limit) {
    return fetchFromCatalog(offset || 0, limit || 40, channelAddress)
      .then(function (localResult) {
        if (localResult && localResult.data && localResult.data.length > 0) {
          console.log('[API] Using local catalog for channel items (' + localResult.data.length + ' items)');
          return localResult;
        }
        return gql(FETCH_CHANNEL_ITEMS_QUERY, {
          query: { address: channelAddress },
          filters: { offset: offset || 0, limit: limit || 40, sort: { createdAt: -1 } }
        }).then(function (data) { return normalizeAssetCollection(data.assets); });
      });
  }

  function listSubscribers(channelAddress, followerAddress) {
    return gql(LIST_SUBSCRIBERS_QUERY, {
      address: channelAddress,
      follower: followerAddress || null
    }).then(function (data) { return data.subscribers; });
  }

  function checkChannelAccess(channelAddress, subscriberAddress) {
    return gql(CHECK_CHANNEL_ACCESS_QUERY, {
      address: channelAddress,
      subscriber: subscriberAddress
    }).then(function (data) { return data.access; });
  }

  function subscribeChannel(channelAddress) {
    return gql(SUBSCRIBE_CHANNEL_MUTATION, { to: channelAddress }, true);
  }

  function unsubscribeChannel(channelAddress) {
    return gql(UNSUBSCRIBE_CHANNEL_MUTATION, { to: channelAddress }, true);
  }

  function getSignerAddress() {
    return signerAddress;
  }

  function getUserPlaylist() {
    return gql(GET_USER_PLAYLIST_QUERY, {}, true)
      .then(function (data) { return data.getUserPlaylist; });
  }

  function isSavedToLater(contractAddress, tokenId) {
    return gql(IS_SAVED_TO_LATER_QUERY, {
      item: { contractAddress: contractAddress, tokenId: tokenId }
    }, true)
      .then(function (data) { return data.isSavedToLater; });
  }

  function addPlaylistItem(playlistId, contractAddress, tokenId) {
    return gql(ADD_PLAYLIST_ITEM_MUTATION, {
      id: playlistId,
      item: { contractAddress: contractAddress, tokenId: tokenId }
    }, true);
  }

  function removePlaylistItem(playlistId, contractAddress, tokenId) {
    return gql(REMOVE_PLAYLIST_ITEM_MUTATION, {
      id: playlistId,
      item: { contractAddress: contractAddress, tokenId: tokenId }
    }, true);
  }

  function fetchLikesByToken(contractAddress, tokenId, address) {
    return gql(FETCH_LIKES_QUERY, {
      contractAddress: contractAddress,
      tokenId: tokenId,
      address: address || null
    }).then(function (data) { return data.likes; });
  }

  function toggleLike(contractAddress, tokenId) {
    return gql(TOGGLE_LIKE_MUTATION, {
      contractAddress: contractAddress,
      tokenId: tokenId
    }, true);
  }

  var FETCH_SUBSCRIPTIONS_QUERY = '\
    query QuerySubscriptions($input: SubscriptionQueryInput, $filters: FilterPaginationInput) {\n\
      subscriptions: fetchSubscriptions(query: $input, filters: $filters) {\n\
        total\n\
        data {\n\
          _id\n\
          planId\n\
          expireAt\n\
          channel {\n\
            _id\n\
            address\n\
            name\n\
            image\n\
            imageURL\n\
            itemsCount\n\
          }\n\
        }\n\
      }\n\
    }';

  function fetchSubscriptions(userAddress) {
    return gql(FETCH_SUBSCRIPTIONS_QUERY, {
      input: { user: userAddress },
      filters: { offset: 0, limit: 100 }
    }, true).then(function (res) {
      var subs = res && res.data && res.data.subscriptions;
      return (subs && subs.data) || [];
    }).catch(function () { return []; });
  }

  var INCREMENT_VIEWS_MUTATION = '\
    mutation IncrementViews($address: String!, $tokenId: TokenID!, $owner: String) {\n\
      incrementViews(address: $address, tokenId: $tokenId, owner: $owner)\n\
    }';

  function incrementViews(address, tokenId, owner) {
    return gql(INCREMENT_VIEWS_MUTATION, {
      address: address,
      tokenId: tokenId,
      owner: owner || null
    }).catch(function () {});
  }

  // ── Royalty / Earnings Queries ─────────────────────

  var FETCH_ROYALTY_ITEMS_QUERY = '\
    query FetchMyRoyaltyItems($address: String!, $category: RewardsCategory!, $filters: FilterPaginationInput) {\n\
      items: fetchMyRoyaltyItemsByAddress(address: $address, category: $category, filters: $filters) {\n\
        total\n\
        data {\n\
          __typename\n\
          ... on RoyaltyAsset {\n\
            id\n\
            address\n\
            name\n\
            thumbnail\n\
            share\n\
            beneficiary\n\
            unclaimedRewards\n\
            ledger\n\
            tokenId\n\
            hexTokenId\n\
          }\n\
          ... on RoyaltyChannel {\n\
            id\n\
            address\n\
            name\n\
            thumbnail\n\
            share\n\
            beneficiary\n\
            unclaimedRewards\n\
          }\n\
        }\n\
      }\n\
    }';

  var FETCH_REWARD_SUMMARY_QUERY = '\
    query FetchRewardSummary($address: String!, $category: RewardsCategory!) {\n\
      rewards: fetchRewardSummaryByAddress(address: $address, category: $category) {\n\
        name\n\
        unclaimedRewards\n\
      }\n\
    }';

  var _earningsCache = {};
  var _earningsForceRefresh = false;

  function fetchEarningsFromCatalog(address, category, walletLabel) {
    var cacheKey = address.toLowerCase() + ':' + (category || 'assets');
    if (!_earningsForceRefresh && _earningsCache[cacheKey]) return _earningsCache[cacheKey];

    var url = '/api/catalog/earnings/' + encodeURIComponent(address) +
      '?category=' + encodeURIComponent(category || 'assets');
    if (walletLabel) url += '&walletLabel=' + encodeURIComponent(walletLabel);
    if (_earningsForceRefresh) url += '&refresh=1';

    _earningsCache[cacheKey] = fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.error || 'Local earnings query failed');
        return data;
      })
      .catch(function (err) {
        delete _earningsCache[cacheKey];
        throw err;
      });
    return _earningsCache[cacheKey];
  }

  function clearEarningsCache(forceServerRefresh) {
    _earningsCache = {};
    if (forceServerRefresh) _earningsForceRefresh = true;
    setTimeout(function () { _earningsForceRefresh = false; }, 5000);
  }

  function fetchRoyaltyItems(address, category, offset, limit, walletLabel) {
    return fetchEarningsFromCatalog(address, category, walletLabel)
      .then(function (data) { return data.items; })
      .catch(function (localErr) {
        console.warn('[API] Local earnings failed, trying GraphQL:', localErr.message);
        return gql(FETCH_ROYALTY_ITEMS_QUERY, {
          address: address,
          category: category,
          filters: { offset: offset || 0, limit: limit || 50 }
        }, true).then(function (data) { return data.items; })
          .catch(function () { return { total: 0, data: [] }; });
      });
  }

  function fetchRewardSummary(address, category, walletLabel) {
    return fetchEarningsFromCatalog(address, category, walletLabel)
      .then(function (data) { return data.rewards || []; })
      .catch(function (localErr) {
        console.warn('[API] Local reward summary failed, trying GraphQL:', localErr.message);
        return gql(FETCH_REWARD_SUMMARY_QUERY, {
          address: address,
          category: category
        }, true).then(function (data) { return data.rewards || []; })
          .catch(function () { return []; });
      });
  }

  // ── Activity Event Queries ─────────────────────────

  var ACTIVITY_EVENT_FIELDS = '\
    _id\n\
    event\n\
    token { contractAddress name }\n\
    to { address }\n\
    from { address }\n\
    quantity\n\
    price\n\
    paymentToken\n\
    blockNumber\n\
    txHash\n\
    createdAt\n\
    tokenID\n\
    metadata\n';

  function searchListingEvents(contractAddress, tokenId, limit) {
    var query = '\
      query SearchListings($query: ActivityQueryInput) {\n\
        events: searchListingEvents(query: $query) {\n\
          ' + ACTIVITY_EVENT_FIELDS + '\
        }\n\
      }';
    return gql(query, {
      query: { contractAddress: contractAddress, tokenId: tokenId, limit: limit || 20 }
    }).then(function (data) { return data.events || []; });
  }

  function searchTradeEvents(contractAddress, tokenId, limit) {
    var query = '\
      query SearchTrades($query: ActivityQueryInput) {\n\
        events: searchTradeEvents(query: $query) {\n\
          ' + ACTIVITY_EVENT_FIELDS + '\
        }\n\
      }';
    return gql(query, {
      query: { contractAddress: contractAddress, tokenId: tokenId, limit: limit || 20 }
    }).then(function (data) { return data.events || []; });
  }

  function searchOfferEvents(contractAddress, tokenId, limit) {
    var query = '\
      query SearchOffers($query: ActivityQueryInput) {\n\
        events: searchOfferEvents(query: $query) {\n\
          ' + ACTIVITY_EVENT_FIELDS + '\
        }\n\
      }';
    return gql(query, {
      query: { contractAddress: contractAddress, tokenId: tokenId, limit: limit || 20 }
    }).then(function (data) { return data.events || []; });
  }

  function searchIncomingOfferEvents(contractAddress, tokenId, limit) {
    var query = '\
      query SearchIncomingOffers($query: ActivityQueryInput) {\n\
        events: searchIncomingOfferEvents(query: $query) {\n\
          ' + ACTIVITY_EVENT_FIELDS + '\
        }\n\
      }';
    return gql(query, {
      query: { contractAddress: contractAddress, tokenId: tokenId, limit: limit || 20 }
    }).then(function (data) { return data.events || []; });
  }

  // ── Statistics Queries ─────────────────────────────

  function fetchStatisticByAsset(address, ledger, tokenId) {
    var query = '\
      query FetchStatistic($input: AssetStatisticInput!) {\n\
        stat: fetchStatisticByAsset(input: $input) {\n\
          views\n\
          sold\n\
          totalSupply\n\
          totalRevenue\n\
          unpublished\n\
          resell { totalResell totalVendors totalRevenue percentage }\n\
          price { amount payToken }\n\
          opType\n\
        }\n\
      }';
    return gql(query, {
      input: { address: address, ledger: ledger, tokenId: tokenId }
    }).then(function (data) { return data.stat; })
      .catch(function () { return null; });
  }

  function governanceStatistics(address, account) {
    var query = '\
      query GovStats($address: String!, $account: String) {\n\
        stats: governanceStatistics(address: $address, account: $account) {\n\
          royalties { distribution }\n\
          rewards { volumeUSD claimableVolumeUSD }\n\
          governance { available owned volumeUSD }\n\
          floor { price paymentToken }\n\
        }\n\
      }';
    return gql(query, { address: address, account: account })
      .then(function (data) { return data.stats; })
      .catch(function () { return null; });
  }

  // ── Publish/Unpublish ──────────────────────────────

  function toggleUnpublish(contractAddress, tokenId, unpublish) {
    var mutation = '\
      mutation ToggleUnpublish($contractAddress: String!, $tokenId: String!, $unpublish: Boolean!) {\n\
        toggleUnpublish(contractAddress: $contractAddress, tokenId: $tokenId, unpublish: $unpublish)\n\
      }';
    return gql(mutation, {
      contractAddress: contractAddress,
      tokenId: String(tokenId),
      unpublish: unpublish
    }, true);
  }

  // ── Channel Management ─────────────────────────────

  // v1.2.7.7: Belt-and-braces upload — pin locally first (always reachable
  // through the user's own gateway), then mirror to the Elacity public
  // gateway for global discovery. Without the Elacity mirror, channel art
  // uploaded here is only reachable while the publisher's PC2 is online and
  // their CID has propagated through DHT — every other viewer sees broken
  // images. Matches the asset-thumbnail flow in elacity-creator.
  function uploadToIpfs(file, pc2FetchFn) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = async function () {
        var base64 = reader.result.split(',')[1];
        var fetchFn = pc2FetchFn || fetch;

        var localCid = null;
        try {
          var localRes = await fetchFn('/api/storage/ipfs/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: base64, announce: true })
          });
          if (localRes.ok) {
            var localJson = await localRes.json();
            if (localJson.success) localCid = localJson.cid;
          }
        } catch (e) {
          console.warn('[Elacity] Local IPFS pin failed:', e && e.message);
        }

        var elacityCid = null;
        try {
          var elRes = await fetchFn('/api/storage/ipfs/upload-elacity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: base64, filename: file.name || 'channel-image' })
          });
          if (elRes.ok) {
            var elJson = await elRes.json();
            if (elJson.success || elJson.cid) elacityCid = elJson.cid;
          }
        } catch (e) {
          console.warn('[Elacity] Elacity gateway upload failed:', e && e.message);
        }

        // Prefer Elacity (faster global discovery for other viewers); fall
        // back to local when the gateway is unreachable. If both failed,
        // surface that to the UI.
        var finalCid = elacityCid || localCid;
        if (!finalCid) {
          reject(new Error('IPFS upload failed (both local and Elacity gateway)'));
          return;
        }
        resolve('ipfs://' + finalCid);
      };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function updateChannelLocal(address, input, pc2FetchFn) {
    var body = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.categories !== undefined) body.categories = Array.isArray(input.categories) ? JSON.stringify(input.categories) : input.categories;
    if (input.image !== undefined) body.image = input.image;
    if (input.coverImage !== undefined) body.coverImage = input.coverImage;
    var fetchFn = pc2FetchFn || fetch;
    return fetchFn('/api/catalog/channel/' + encodeURIComponent(address), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('API ' + res.status);
      return res.json();
    }).then(function (json) {
      if (!json.success) throw new Error(json.error || 'Update failed');
      return json.channel;
    });
  }

  // v1.2.7.7 (Bug-G mirror): mode-aware backend update + non-silent
  // fallback. The previous implementation swallowed EVERY GraphQL error
  // and silently wrote to the PC2 local catalog instead — which made
  // "save successful" lie when the real cause was an auth-mode mismatch
  // (creator field is the EOA but we authenticated as the SA, or vice
  // versa). The user's local view would show the new name, but the
  // canonical Elacity backend still had the old data, and any other
  // dApp (elacity-creator) that re-queried the backend would render
  // the old data — exactly the symptom we hit on 2026-05-04.
  //
  // New policy:
  //   • opts.authMode (eoa | sa)  — required by every owner-only path
  //     (the channel-edit modal, the manage-plans flow). Mirror the
  //     pattern in elacity-creator/app.js (authModeForChannelData).
  //   • Auth-class errors (401/403, "not allowed to edit this channel")
  //     SURFACE as a thrown error. No silent local write. The user sees
  //     a clear toast and can switch wallets / sign in with the correct
  //     mode.
  //   • Network / 5xx / GraphQL non-auth errors STILL fall back to the
  //     local catalog so the offline-friendly UX is preserved (per the
  //     2026-05-04 handover note: "Don't drop the local-catalog
  //     fallback — just make the GraphQL path actually succeed first").
  function updateChannelInformation(address, input, pc2FetchFn, opts) {
    var mutation = '\
      mutation UpdateChannel($address: String!, $input: ChannelInformationInput!) {\n\
        channel: updateChannelInformation(address: $address, input: $input) {\n\
          name\n\
          description\n\
          categories\n\
          image\n\
          coverImage\n\
        }\n\
      }';
    return gql(mutation, { address: address, input: input }, true, opts)
      .then(function (data) {
        // v1.2.7.7 (name-sync): mirror the canonical backend response
        // back to the PC2 local catalog. Without this, the local mirror
        // (which is shared by every dApp on this PC2 — elacity-creator,
        // elacity-market, etc.) keeps any value it learned from a prior
        // (possibly silently-failed) save, and the apps drift apart
        // until the user rebuilds the channel. retrieveChannel's
        // self-heal pass also handles this lazily, but a write-through
        // here means OTHER dApps see the new value on their very next
        // local-catalog read (no need to wait for them to also hit the
        // backend).
        var serverChannel = (data && data.channel) || null;
        var src = serverChannel || {};
        var mirrorInput = {};
        if (input.name !== undefined) mirrorInput.name = (src.name !== undefined && src.name !== null) ? src.name : input.name;
        if (input.description !== undefined) mirrorInput.description = (src.description !== undefined && src.description !== null) ? src.description : input.description;
        if (input.categories !== undefined) mirrorInput.categories = (src.categories !== undefined && src.categories !== null) ? src.categories : input.categories;
        if (input.image !== undefined) mirrorInput.image = (src.image !== undefined && src.image !== null) ? src.image : input.image;
        if (input.coverImage !== undefined) mirrorInput.coverImage = (src.coverImage !== undefined && src.coverImage !== null) ? src.coverImage : input.coverImage;
        if (Object.keys(mirrorInput).length > 0) {
          updateChannelLocal(address, mirrorInput, pc2FetchFn).catch(function (e) {
            console.warn('[API] local catalog mirror after backend save failed:', e && e.message);
          });
        }
        return serverChannel;
      })
      .catch(function (gqlErr) {
        var msg = (gqlErr && gqlErr.message) || '';
        var isAuthError = /\bAPI 401\b|\bAPI 403\b|not allowed to edit|Unauthor/i.test(msg);
        if (isAuthError) {
          console.error('[API] GraphQL channel update rejected by backend (auth):', msg);
          throw new Error(
            'Backend rejected the update: ' + msg + '. ' +
            'Make sure you are connected with the wallet that created this channel.'
          );
        }
        console.warn('[API] GraphQL channel update failed (non-auth), falling back to local catalog:', msg);
        return updateChannelLocal(address, input, pc2FetchFn);
      });
  }

  function updateSubscriptionPlanLocal(address, actions, pc2FetchFn) {
    var fetchFn = pc2FetchFn || fetch;
    var origin = window.puter_api_origin || window.location.origin;
    return fetchFn(origin + '/api/catalog/channel/' + address.toLowerCase())
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var existing = [];
        if (json && json.channel && json.channel.plans) {
          try { existing = typeof json.channel.plans === 'string' ? JSON.parse(json.channel.plans) : json.channel.plans; } catch (_) { existing = []; }
        }
        actions.forEach(function (act) {
          if (act.action === 'ADD') {
            existing.push({
              planId: 'plan_' + Date.now(),
              label: act.args.label,
              description: act.args.description || '',
              duration: act.args.duration,
              price: act.args.price,
              payToken: act.args.payToken
            });
          } else if (act.action === 'REMOVE' && act.args && act.args.planId) {
            existing = existing.filter(function (p) { return p.planId !== act.args.planId; });
          } else if (act.action === 'UPDATE' && act.args && act.args.planId) {
            existing = existing.map(function (p) {
              if (p.planId === act.args.planId) {
                return Object.assign({}, p, act.args);
              }
              return p;
            });
          }
        });
        return fetchFn(origin + '/api/catalog/channel/' + address.toLowerCase(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plans: JSON.stringify(existing) })
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.success) throw new Error(json.error || 'Local plan update failed');
        return json.channel;
      });
  }

  function updateSubscriptionPlan(address, actions, pc2FetchFn) {
    // V3 contracts do not have bulkUpdatePlans on-chain;
    // plan modifications are stored in local catalog and backend index.
    return updateSubscriptionPlanLocal(address, actions, pc2FetchFn)
      .then(function (result) {
        var mutation = '\
          mutation UpdatePlan($address: String!, $input: [SubscriptionPlanUpdateAction]!) {\n\
            updateSubscriptionPlan(address: $address, input: $input) {\n\
              name\n\
              plans {\n\
                planId\n\
                label\n\
                price\n\
              }\n\
            }\n\
          }';
        gql(mutation, { address: address, input: actions }, true).catch(function (err) {
          console.warn('[API] Backend plan indexing failed (non-critical):', err.message);
        });
        return result;
      });
  }

  function fetchManagedChannels(creatorAddress, filters) {
    var addr = (creatorAddress || '').toLowerCase();
    if (!addr) return Promise.resolve({ total: 0, data: [] });

    // v1.2.7.7 (name-sync): same overlay/self-heal pattern as
    // fetchChannels — local catalog wins for "what does this PC2 have",
    // backend wins for canonical mutable fields, divergences self-heal.
    var localP = fetchEarningsFromCatalog(addr, 'my-channels', 'EOA')
      .then(function (data) {
        if (data && data.items && data.items.data && data.items.data.length > 0) {
          return { total: data.items.total, data: data.items.data };
        }
        return null;
      })
      .catch(function () { return null; });

    var query = { creator: addr };
    var backendP = gql(FETCH_CHANNELS_QUERY, {
      query: query,
      filters: filters || { offset: 0, limit: 100, sort: { itemsCount: -1 } }
    }, true).then(function (data) { return data && data.channels ? data.channels : null; })
      .catch(function () { return null; });

    return Promise.all([localP, backendP]).then(function (results) {
      var local = results[0];
      var backend = results[1];
      if (!backend && !local) return { total: 0, data: [] };
      if (!backend) return local;
      if (!local || !local.data || local.data.length === 0) return backend;
      return mergeChannelLists(local, backend);
    });
  }

  return {
    fetchItems: fetchItems,
    fetchAccessibleAssets: fetchAccessibleAssets,
    fetchAccessibleAssetsForAddress: fetchAccessibleAssetsForAddress,
    fetchWithPreset: fetchWithPreset,
    getAssetDetail: getAssetDetail,
    fetchAssetFromCatalog: fetchAssetFromCatalog,
    getNonce: getNonce,
    login: login,
    isAuthenticated: isAuthenticated,
    isAuthenticatedAs: isAuthenticatedAs,
    getCachedSigner: getCachedSigner,
    getAuthToken: getAuthToken,
    clearAuth: clearAuth,
    setSignerAddress: setSignerAddress,
    getSignerAddress: getSignerAddress,
    retrieveChannel: retrieveChannel,
    checkChannelAccess: checkChannelAccess,
    fetchChannels: fetchChannels,
    fetchChannelItems: fetchChannelItems,
    listSubscribers: listSubscribers,
    subscribeChannel: subscribeChannel,
    unsubscribeChannel: unsubscribeChannel,
    getUserPlaylist: getUserPlaylist,
    isSavedToLater: isSavedToLater,
    addPlaylistItem: addPlaylistItem,
    removePlaylistItem: removePlaylistItem,
    fetchLikesByToken: fetchLikesByToken,
    toggleLike: toggleLike,
    incrementViews: incrementViews,
    fetchSubscriptions: fetchSubscriptions,
    fetchRoyaltyItems: fetchRoyaltyItems,
    fetchRewardSummary: fetchRewardSummary,
    clearEarningsCache: clearEarningsCache,
    searchListingEvents: searchListingEvents,
    searchTradeEvents: searchTradeEvents,
    searchOfferEvents: searchOfferEvents,
    searchIncomingOfferEvents: searchIncomingOfferEvents,
    getV3Operatives: getV3Operatives,
    fetchStatisticByAsset: fetchStatisticByAsset,
    governanceStatistics: governanceStatistics,
    toggleUnpublish: toggleUnpublish,
    updateChannelInformation: updateChannelInformation,
    updateChannelLocal: updateChannelLocal,
    uploadToIpfs: uploadToIpfs,
    updateSubscriptionPlan: updateSubscriptionPlan,
    fetchManagedChannels: fetchManagedChannels,
    PRESETS: PRESETS
  };
})();
