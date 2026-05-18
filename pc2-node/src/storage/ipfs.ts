/**
 * IPFS Storage Module
 * 
 * Handles file storage and retrieval using Helia (modern IPFS implementation)
 * Files are stored content-addressed (by CID) and linked to paths via database
 */

// Import polyfill before Helia to ensure Promise.withResolvers is available
import '../utils/polyfill.js';

import { createHelia, type Helia } from 'helia';
import { unixfs, type UnixFS } from '@helia/unixfs';
import { createLibp2p, type Libp2pOptions } from 'libp2p';
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { FaultTolerance } from '@libp2p/interface';
import { tcp } from '@libp2p/tcp';
import { mdns } from '@libp2p/mdns';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { autoNAT } from '@libp2p/autonat';
import { multiaddr } from '@multiformats/multiaddr';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
const log = createLogger('ipfs');

const WASM_ASSEMBLE_THRESHOLD = 5 * 1024 * 1024; // 5 MB — WASM assembly reduces V8 heap pressure on constrained devices
const IPFS_ASSEMBLE_WASM_PATH = 'wasm-apps/ipfs-assemble/ipfs-assemble.wasm';
let cachedAssembleWasm: ArrayBuffer | null = null;
type UnixFSEntryType = 'file' | 'raw' | 'directory' | 'hamt-sharded-directory';

function normalizeUnixFSEntryType(type: string | undefined): 'file' | 'raw' | 'directory' {
  if (type === 'directory' || type === 'hamt-sharded-directory') return 'directory';
  if (type === 'raw') return 'raw';
  return 'file';
}

/**
 * IPFS Network Modes:
 * - private: Isolated node, no network connectivity (personal cloud only)
 * - public: Full DHT participation, content discoverable globally
 * - hybrid: Connect to network but only announce public content
 */
export type IPFSNetworkMode = 'private' | 'public' | 'hybrid';

/**
 * PC2 Supernode bootstrap addresses
 *
 * Two categories of peer live on the PC2 supernodes:
 *
 *   1. `kubo` daemon on port 4101 — this is the process that pins the v1.2
 *      app-registry CIDs (installed by `deploy/app-registry/scripts/install-pinning.sh`).
 *      Bitswap fetches for any app-bundle or marketplace-pinned CID must
 *      reach this peer to succeed, otherwise PC2 falls through to the
 *      Elacity public gateway and eats the latency.
 *
 *   2. `pc2-ipfs-relay` Node.js daemon on ports 4003 (TCP) and 4004 (WS) —
 *      a libp2p circuit-relay-v2 used for NAT traversal only. It does NOT
 *      hold any content; listing it does not help content discovery but
 *      it keeps circuit-hop paths available for home-NAT'd PC2 nodes.
 *
 * Peer IDs verified via read-only `ipfs id` over SSH on 2026-04-30.
 */
const PC2_SUPERNODE_BOOTSTRAP: string[] = [
  // InterServer kubo (primary — pins v1.2 app bundles, swarm on 4101)
  '/ip4/69.164.241.210/tcp/4101/p2p/12D3KooWFLBeemSpue43SULYbqmSrgreYDYQdfDKD2MHUnRcMc5f',
  // Contabo kubo (secondary — pins v1.2 app bundles, swarm on 4101)
  '/ip4/38.242.211.112/tcp/4101/p2p/12D3KooWQZu8rY8BgD1fLq1yF1ArSnUy9D3Jf71w7C6RpbZy9nVr',
  // InterServer pc2-ipfs-relay (circuit relay only, no content)
  '/ip4/69.164.241.210/tcp/4003/p2p/12D3KooWMcuTWxkKg7xS3dxRaPDK9BEUHdAvKWf2b5Kdk4Kwxy9G',
  '/ip4/69.164.241.210/tcp/4004/ws/p2p/12D3KooWMcuTWxkKg7xS3dxRaPDK9BEUHdAvKWf2b5Kdk4Kwxy9G',
  // Contabo pc2-ipfs-relay (circuit relay only, no content)
  '/ip4/38.242.211.112/tcp/4003/p2p/12D3KooWAaFWUWN7GQVeNdbdPKUUTmyoQewBAPbwXKKrhxxsck5h',
  '/ip4/38.242.211.112/tcp/4004/ws/p2p/12D3KooWAaFWUWN7GQVeNdbdPKUUTmyoQewBAPbwXKKrhxxsck5h',
];

/**
 * Elacity public IPFS gateway (ipfs.ela.city) — explicit libp2p peering.
 *
 * Why: Helia's DHT-based provider record propagation to external Kubo nodes is
 * unreliable for fresh CIDs. By dialing ipfs.ela.city directly we guarantee
 * bitswap-level peering, so newly-stored CIDs become reachable through the
 * public gateway within seconds instead of relying on DHT propagation.
 *
 * Operators may override via the `ELACITY_IPFS_MULTIADDRS` env var or the
 * `ipfs.elacity_bootstrap` config option (both: comma-separated multiaddrs).
 */
const ELACITY_DEFAULT_BOOTSTRAP: string[] = [
  '/ip4/34.77.31.164/tcp/4001/p2p/12D3KooWNieM3HRBJdVqaQucZEJdqA3oWKrKf3Gx3hp2cmtR9GNK',
];

/**
 * Relay-first bootstrap targets.
 * These are attempted early so NAT'd Helia nodes can establish circuit paths.
 * Same peer as ELACITY_DEFAULT_BOOTSTRAP but declared separately so operators
 * can extend the relay pool via `ipfs.relay_bootstrap` without disturbing the
 * direct-peering list.
 */
const DEFAULT_RELAY_BOOTSTRAP: string[] = [
  '/ip4/34.77.31.164/tcp/4001/p2p/12D3KooWNieM3HRBJdVqaQucZEJdqA3oWKrKf3Gx3hp2cmtR9GNK',
];

/**
 * Public IPFS bootstrap nodes (fallback after supernodes + Elacity + relays)
 */
const PUBLIC_BOOTSTRAP_NODES = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
  '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
];

export interface IPFSOptions {
  repoPath: string;
  mode?: IPFSNetworkMode;           // Network mode (default: private)
  enableDHT?: boolean;              // Enable DHT (auto for public/hybrid)
  dhtClientMode?: boolean;          // DHT client-only mode (default: false for public/hybrid)
  enableBootstrap?: boolean;        // Use public bootstrap nodes
  autoAnnounceOnStore?: boolean;    // Auto-announce newly stored CIDs (default: true)
  prefetchOnStore?: boolean;        // Trigger public gateway prefetch after local store (default: true)
  publicGatewayPrefetchUrl?: string;// Public gateway base URL for prefetch (default: ipfs.ela.city/ipfs/)
  customBootstrap?: string[];       // Additional bootstrap nodes
  supernodeBootstrap?: string[];    // PC2 supernode relay addresses (highest priority)
  elacityBootstrap?: string[];      // Elacity public gateway peers (overrides default; empty array disables)
  relayBootstrap?: string[];        // Additional relay bootstrap peers from config (circuit relay pool)
  relayMode?: boolean;              // Enable relay server mode (for nodes with public IP)
  relayMaxConnections?: number;     // Max relay connections (default: 100)
  bootstrapHealthcheckIntervalMs?: number; // Periodic bootstrap re-dial when disconnected (default: 30s)
}

export class IPFSStorage {
  private helia: Helia | null = null;
  private fs: UnixFS | null = null;
  private blockstore: FsBlockstore | null = null;
  private repoPath: string;
  private isInitialized: boolean = false;
  private networkMode: IPFSNetworkMode;
  private options: IPFSOptions;
  private relayEnabled: boolean = false;
  private bootstrapReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bootstrapHealthTimer: ReturnType<typeof setInterval> | null = null;
  private elacityReconnectTimer: ReturnType<typeof setInterval> | null = null;
  // v1.2.7.5: throttle the "no relay circuit" warning. The bootstrap
  // healthcheck runs every 30 s; on NATed nodes that never get a relay
  // reservation, this previously emitted ~720 warns/day, drowning real signal.
  // We now warn at most once per 5 min while degraded, and reset to fire
  // immediately on the next degradation after recovery.
  private lastRelayWarnAt: number = 0;
  private configuredBootstrapPeers: string[] = [];
  private configuredElacityPeers: string[] = [];
  private configuredElacityPeerIds: Set<string> = new Set();

  constructor(options: IPFSOptions) {
    this.repoPath = options.repoPath;
    this.networkMode = options.mode || 'private';
    this.options = options;
    this.relayEnabled = options.relayMode ?? false;
  }

  /**
   * Resolve effective Elacity peer multiaddrs:
   *   - explicit option (including empty array → disabled)
   *   - else default hardcoded list (single source of truth)
   *
   * Each entry is normalized (legacy `/ipfs/` → `/p2p/`) and any entry that
   * fails to parse is dropped (with a warning) so a malformed override never
   * blocks node startup.
   */
  private resolveElacityPeers(): { peers: string[]; peerIds: Set<string> } {
    const raw = this.options.elacityBootstrap !== undefined
      ? this.options.elacityBootstrap
      : ELACITY_DEFAULT_BOOTSTRAP;

    const peers: string[] = [];
    const peerIds = new Set<string>();
    const peerIdPattern = /\/p2p\/([^\/]+)/;
    for (const entry of raw) {
      const trimmed = (entry || '').trim();
      if (!trimmed) continue;
      const normalized = this.normalizeBootstrapAddr(trimmed);
      try {
        // Validate multiaddr parses; we read the peer id via string match
        // because @multiformats/multiaddr does not expose getPeerId() in all
        // versions and we want to stay version-agnostic.
        multiaddr(normalized);
        const match = peerIdPattern.exec(normalized);
        if (!match || !match[1]) {
          log.warn(`[IPFS] Elacity bootstrap entry has no /p2p/<peerId>, skipping: ${normalized}`);
          continue;
        }
        peers.push(normalized);
        peerIds.add(match[1]);
      } catch (error: any) {
        log.warn(`[IPFS] Elacity bootstrap entry malformed, skipping (${error?.message || 'parse error'}): ${normalized}`);
      }
    }
    return { peers, peerIds };
  }

  isRelayMode(): boolean {
    return this.relayEnabled;
  }

  /**
   * Get the current network mode
   */
  getNetworkMode(): IPFSNetworkMode {
    return this.networkMode;
  }

  private uniquePeers(peers: string[]): string[] {
    return Array.from(new Set(peers.map((peer) => peer.trim()).filter(Boolean)));
  }

  /**
   * Persist libp2p identity key so Peer ID stays stable across restarts.
   */
  private getLibp2pKeyPath(): string {
    return join(this.repoPath, 'libp2p-private-key.protobuf');
  }

  private async loadOrCreateLibp2pPrivateKey() {
    const keyPath = this.getLibp2pKeyPath();

    if (existsSync(keyPath)) {
      try {
        const keyBytes = readFileSync(keyPath);
        const key = privateKeyFromProtobuf(new Uint8Array(keyBytes));
        return key;
      } catch (error: any) {
        log.warn(`⚠️  Failed to load persisted libp2p identity key, regenerating: ${error?.message || 'unknown error'}`);
      }
    }

    const key = await generateKeyPair('Ed25519');
    const encoded = privateKeyToProtobuf(key);
    writeFileSync(keyPath, Buffer.from(encoded), { mode: 0o600 });
    log.info(`🔐 Created new persistent libp2p identity key: ${keyPath}`);
    return key;
  }

  /**
   * Initialize Helia IPFS node
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.helia) {
      return; // Already initialized
    }

    // Ensure repo directory exists
    if (!existsSync(this.repoPath)) {
      mkdirSync(this.repoPath, { recursive: true });
    }

    // Ensure subdirectories exist
    const blockstorePath = join(this.repoPath, 'blocks');
    const datastorePath = join(this.repoPath, 'datastore');
    if (!existsSync(blockstorePath)) {
      mkdirSync(blockstorePath, { recursive: true });
    }
    if (!existsSync(datastorePath)) {
      mkdirSync(datastorePath, { recursive: true });
    }

    try {
      // Verify polyfill is loaded
      if (typeof (Promise as any).withResolvers === 'undefined') {
        throw new Error('Promise.withResolvers polyfill not loaded. Helia requires Node.js 22+ or the polyfill.');
      }

      log.info('🌐 Initializing Helia IPFS node...');
      log.info(`   Repo path: ${this.repoPath}`);
      log.info(`   Network mode: ${this.networkMode}`);

      // Create blockstore and datastore
      this.blockstore = new FsBlockstore(blockstorePath);
      const datastore = new FsDatastore(datastorePath);
      const privateKey = await this.loadOrCreateLibp2pPrivateKey();

      // Determine if we should enable network features
      const enableNetwork = this.networkMode !== 'private';
      const enableDHT = this.options.enableDHT ?? enableNetwork;
      const enableBootstrap = this.options.enableBootstrap ?? enableNetwork;

      // Build libp2p configuration
      const libp2pConfig: Libp2pOptions = {
        addresses: {
          listen: enableNetwork ? [
            '/ip4/0.0.0.0/tcp/4001',
            '/ip4/0.0.0.0/tcp/4002/ws',
            // Allow inbound relayed connections for NAT'd nodes.
            // /p2p-circuit can only actually listen after a relay reservation
            // completes, so transportManager.faultTolerance below must allow
            // it to be unreachable at startup (otherwise createLibp2p throws
            // UnsupportedListenAddressesError before relay reservations can
            // even be attempted).
            '/p2p-circuit'
          ] : []
        },
        transportManager: {
          // NO_FATAL: listen addresses that can't bind at startup are logged
          // and skipped instead of aborting node initialization. Required for
          // /p2p-circuit (reservation-dependent) and also makes IPv6-less
          // hosts degrade gracefully.
          faultTolerance: FaultTolerance.NO_FATAL
        },
        transports: enableNetwork ? [
          tcp(),
          webSockets(),
          // Maintain relay reservations to keep NAT-reachable circuit paths.
          circuitRelayTransport({
            reservationConcurrency: 2,
            reservationCompletionTimeout: 20_000,
          })
        ] : [
          tcp(),
          webSockets()
        ],
        connectionEncrypters: [
          noise()
        ],
        streamMuxers: [
          yamux()
        ],
        connectionManager: {
          maxConnections: enableNetwork ? 50 : 0,
        },
        datastore,
        privateKey,
        services: {} as any
      };

      // Add network services for public/hybrid modes
      if (enableNetwork) {
        log.info(`   DHT: ${enableDHT ? 'enabled' : 'disabled'}`);
        log.info(`   Bootstrap: ${enableBootstrap ? 'enabled' : 'disabled'}`);
        log.info(`   NAT traversal: enabled (autoNAT + dcutr + circuit-relay-v2)`);
        log.info(`   Max connections: 50`);

        // Add identify service (required for DHT)
        (libp2pConfig.services as any).identify = identify();

        // Add ping service (required for DHT)
        (libp2pConfig.services as any).ping = ping();

        // NAT traversal: autoNAT detects whether we're behind NAT,
        // dcutr upgrades relay connections to direct peer-to-peer links
        (libp2pConfig.services as any).autoNAT = autoNAT();
        (libp2pConfig.services as any).dcutr = dcutr();

        // Relay server: when relay mode is on, this node serves as a
        // circuit-relay for NAT'd peers, strengthening the mesh
        if (this.relayEnabled) {
          (libp2pConfig.services as any).relay = circuitRelayServer({
            reservations: {
              maxReservations: this.options.relayMaxConnections ?? 100,
            },
          });
          log.info('   Relay server: ENABLED — serving as circuit relay for other peers');
        }

        // DHT defaults to full participation for public/hybrid nodes so this
        // node can advertise locally-created CIDs to external gateways.
        // Allow opting back into client mode via config when needed.
        if (enableDHT) {
          const dhtClientMode = this.options.dhtClientMode ?? false;
          (libp2pConfig.services as any).dht = kadDHT({
            clientMode: dhtClientMode,
          });
          log.info(`   DHT mode: ${dhtClientMode ? 'client' : 'server (full participation)'}`);
        }

        // Add bootstrap nodes for initial peer discovery
        // Priority: supernodes → elacity → custom → public IPFS nodes
        if (enableBootstrap) {
          const relayBootstrap = [
            ...DEFAULT_RELAY_BOOTSTRAP,
            ...(this.options.relayBootstrap || []),
          ];
          const supernodes = [
            ...PC2_SUPERNODE_BOOTSTRAP,
            ...(this.options.supernodeBootstrap || []),
          ];
          const elacity = this.resolveElacityPeers();
          this.configuredElacityPeers = elacity.peers;
          this.configuredElacityPeerIds = elacity.peerIds;
          const bootstrapNodes = this.uniquePeers([
            ...relayBootstrap,
            ...supernodes,
            ...elacity.peers,
            ...(this.options.customBootstrap || []),
            ...PUBLIC_BOOTSTRAP_NODES,
          ]);
          if (relayBootstrap.length > 0) {
            log.info(`   Relay bootstrap peers: ${relayBootstrap.length} configured`);
          }
          if (supernodes.length > 0) {
            log.info(`   PC2 supernodes: ${supernodes.length} configured`);
          }
          if (elacity.peers.length > 0) {
            log.info(`   Elacity peers: ${elacity.peers.length} configured (ipfs.ela.city)`);
          }
          libp2pConfig.peerDiscovery = [
            bootstrap({ list: bootstrapNodes }),
            mdns(),
          ];
        }
      } else {
        log.info('   Network: disabled (private mode)');
      }

      // Create libp2p instance
      const libp2p = await createLibp2p(libp2pConfig);

      // Create Helia node with custom libp2p (no WebRTC)
      // Let Helia start libp2p - don't start it ourselves
      this.helia = await createHelia({
        blockstore: this.blockstore,
        datastore,
        libp2p,
      });

      this.helia.libp2p.addEventListener('peer:discovery', (event) => {
        log.debug(`New peer discovered (${event.detail.id.toString()}) via MDNS`);

        this.helia?.libp2p.dial(event.detail.multiaddrs, {
          signal: AbortSignal.timeout(5000),
        }).then(
          () => {
            log.info(`Successfully dialed peer (${event.detail.id.toString()})`);
          }
        ).catch((err) => {
          log.debug(`Failed to dial peer (${event.detail.id.toString()}):`, (err as Error)?.message);
        });
      });

      // Initialize UnixFS
      this.fs = unixfs(this.helia);

      // Get node info
      const peerId = this.helia.libp2p.peerId;
      log.info(`✅ Helia IPFS node initialized`);
      log.info(`   Node ID: ${peerId.toString()}`);

      const addresses = this.helia.libp2p.getMultiaddrs();
      log.info(`   Addresses: ${addresses.length} configured`);
      if (addresses.length > 0) {
        log.info(`   First address: ${addresses[0].toString()}`);
      }
      const relayAddresses = addresses
        .map((addr) => addr.toString())
        .filter((addr) => addr.includes('/p2p-circuit'));
      if (relayAddresses.length > 0) {
        log.info(`   Relay addresses: ${relayAddresses.length} advertised`);
      } else if (enableNetwork) {
        log.warn('⚠️  No /p2p-circuit addresses advertised yet; NAT reachability may be limited until relay reservations are established');
      }

      this.isInitialized = true;

      // Kubo-style flow: explicitly dial bootstrap peers after init.
      // This mirrors `ipfs swarm connect ...` and speeds up peering/provider exchange.
      if (enableNetwork && enableBootstrap) {
        const relayBootstrap = [
          ...DEFAULT_RELAY_BOOTSTRAP,
          ...(this.options.relayBootstrap || [])
        ];
        const supernodes = [
          ...PC2_SUPERNODE_BOOTSTRAP,
          ...(this.options.supernodeBootstrap || [])
        ];
        const bootstrapNodes = this.uniquePeers([
          ...relayBootstrap,
          ...supernodes,
          ...this.configuredElacityPeers,
          ...(this.options.customBootstrap || []),
          ...PUBLIC_BOOTSTRAP_NODES,
        ]);
        this.configuredBootstrapPeers = bootstrapNodes;
        void this.connectBootstrapPeers(bootstrapNodes, 'initial');

        if (this.bootstrapReconnectTimer) {
          clearTimeout(this.bootstrapReconnectTimer);
        }
        this.bootstrapReconnectTimer = setTimeout(() => {
          void this.connectBootstrapPeers(bootstrapNodes, 'post-init');
        }, 10_000);

        // Kubo-like resilience: keep trying bootstrap peers when we have no
        // active connections (common after cold start or transient network issues).
        if (this.bootstrapHealthTimer) {
          clearInterval(this.bootstrapHealthTimer);
        }
        const intervalMs = this.options.bootstrapHealthcheckIntervalMs ?? 30_000;
        this.bootstrapHealthTimer = setInterval(() => {
          if (!this.helia || !this.isInitialized) return;
          const connected = this.helia.libp2p.getConnections().length;
          const relayAddrCount = this.helia.libp2p.getMultiaddrs()
            .map((addr) => addr.toString())
            .filter((addr) => addr.includes('/p2p-circuit')).length;
          if (connected === 0) {
            log.info('[IPFS] No active peers detected; running bootstrap re-dial');
            void this.connectBootstrapPeers(this.configuredBootstrapPeers, 'manual');
          } else if (relayAddrCount === 0) {
            const RELAY_WARN_THROTTLE_MS = 5 * 60 * 1000;
            if (Date.now() - this.lastRelayWarnAt > RELAY_WARN_THROTTLE_MS) {
              log.warn('[IPFS] Connected peers exist but no relay circuit addresses are advertised; remote pull pinning may stall for NATed nodes');
              this.lastRelayWarnAt = Date.now();
            } else {
              log.debug('[IPFS] Still no relay circuit addresses (throttled — next warn in <=5 min)');
            }
          } else if (this.lastRelayWarnAt !== 0) {
            log.debug('[IPFS] Relay circuit addresses recovered');
            this.lastRelayWarnAt = 0;
          }
        }, intervalMs);

        // Elacity-specific reconnect: the bootstrap health check only fires
        // at zero peers, but in steady state Elacity connections tend to be
        // pruned by the remote Kubo (observed 10-25s after startup). A
        // dedicated 5-min reconnect restores the peering without waiting for
        // the whole connection pool to drop. Purely additive to the existing
        // health timer.
        if (this.elacityReconnectTimer) {
          clearInterval(this.elacityReconnectTimer);
        }
        if (this.configuredElacityPeers.length > 0) {
          // 60 s cadence: in testing we observed Elacity's Kubo dropping our
          // connection within 10-25 s of startup, so a 5-min gap would miss
          // most uploads. 60 s keeps recovery tight without being chatty.
          const elacityIntervalMs = 60 * 1000;
          this.elacityReconnectTimer = setInterval(() => {
            if (!this.helia || !this.isInitialized) return;
            const status = this.getElacityPeerStatus();
            if (status.peered) return;
            log.info('[IPFS] Elacity peer not connected; re-dialing');
            void this.reconnectElacityPeers().then((result) => {
              if (result.connected > 0) {
                log.info(`[IPFS] Elacity reconnect ok (${result.connected}/${result.attempted})`);
              } else if (result.attempted > 0) {
                log.warn(`[IPFS] Elacity reconnect failed for all ${result.attempted} peer(s)`);
              }
            });
          }, elacityIntervalMs);
        }
      }
    } catch (error) {
      // Clean up any partial initialization
      if (this.helia) {
        try {
          await this.helia.stop().catch((err) => {
            log.debug('Helia stop during cleanup failed (expected)', { error: err?.message });
          });
        } catch {
          // Ignore cleanup errors
        }
        this.helia = null;
        this.fs = null;
      }
      this.isInitialized = false;
      if (this.bootstrapReconnectTimer) {
        clearTimeout(this.bootstrapReconnectTimer);
        this.bootstrapReconnectTimer = null;
      }
      if (this.bootstrapHealthTimer) {
        clearInterval(this.bootstrapHealthTimer);
        this.bootstrapHealthTimer = null;
      }
      if (this.elacityReconnectTimer) {
        clearInterval(this.elacityReconnectTimer);
        this.elacityReconnectTimer = null;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      log.error('❌ Failed to initialize Helia IPFS:', errorMessage);

      // Provide helpful error messages for common issues
      if (errorMessage.includes('withResolvers')) {
        log.error('   ⚠️  This error suggests Node.js version < 22');
        log.error('   💡 A polyfill has been added, but Helia may still require Node.js 22+');
        log.error('   💡 Consider upgrading Node.js: nvm install 22 && nvm use 22');
      } else if (errorMessage.includes('EADDRINUSE')) {
        log.error('   ⚠️  IPFS ports (4001, 4002) are already in use');
        log.error('   💡 Another IPFS instance may be running');
        log.error('   💡 Try stopping other IPFS processes or change ports in config');
      } else if (errorMessage.includes('repo') || errorMessage.includes('datastore') || errorMessage.includes('blockstore')) {
        log.error('   ⚠️  IPFS repository issue');
        log.error(`   💡 Repo path: ${this.repoPath}`);
        log.error('   💡 Try deleting the repo directory and restarting');
      }

      if (errorStack && process.env.NODE_ENV !== 'production') {
        log.error('   Stack trace:', errorStack);
      }

      throw error;
    }
  }

  /**
   * Get Helia instance for external access (relay status, peer counts, etc.)
   * Returns null if not initialized.
   */
  getHeliaInstance(): Helia | null {
    return this.helia;
  }

  /**
   * Get Helia instance (throws if not initialized)
   */
  private getHelia(): Helia {
    if (!this.helia || !this.isInitialized) {
      throw new Error('Helia IPFS not initialized. Call initialize() first.');
    }
    return this.helia;
  }

  /**
   * Get UnixFS instance (throws if not initialized)
   */
  private getUnixFS(): UnixFS {
    if (!this.fs || !this.isInitialized) {
      throw new Error('UnixFS not initialized. Call initialize() first.');
    }
    return this.fs;
  }

  /**
   * Store file content in IPFS
   * Returns the Content ID (CID) that can be used to retrieve the file
   */
  async storeFile(content: Buffer | Uint8Array | string, options?: {
    pin?: boolean;
    timeoutMs?: number;
    announce?: boolean; // Announce CID to DHT after storing
  }): Promise<string> {
    const fs = this.getUnixFS();
    const timeout = options?.timeoutMs ?? 15 * 60 * 1000; // 15 min default

    try {
      const data = typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content instanceof Buffer
          ? new Uint8Array(content)
          : content;

      const cidPromise = fs.addBytes(data);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`IPFS addBytes timed out after ${Math.round(timeout / 60000)} minutes`)), timeout);
      });

      const cid = await Promise.race([cidPromise, timeoutPromise]);

      if (options?.pin !== false) {
        await this.pinFile(cid.toString());
      }

      void this.maybeAnnounceStoredCID(cid.toString(), options?.announce);
      void this.maybeWarmPublicGateway(cid.toString());

      return cid.toString();
    } catch (error) {
      log.error('Error storing file in Helia IPFS:', error);
      throw new Error(`Failed to store file in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store multiple named files as an IPFS directory.
   * Uses the UnixFS importer with wrapWithDirectory to build a proper DAG
   * so that {dirCID}/{filename} resolves on any IPFS gateway.
   *
   * @param files - Map of filename → content (Buffer or string)
   * @returns The directory CID string
   */
  async storeDirectory(
    files: Record<string, Buffer | Uint8Array | string>,
    options?: { pin?: boolean; timeoutMs?: number; announce?: boolean }
  ): Promise<string> {
    const fs = this.getUnixFS();

    try {
      const candidates = Object.entries(files).map(([filename, content]) => {
        const data = typeof content === 'string'
          ? new TextEncoder().encode(content)
          : content instanceof Buffer
            ? new Uint8Array(content)
            : content;

        return { path: filename, content: data };
      });

      let dirCid: string | null = null;
      const importedCids = new Set<string>();

      for await (const entry of fs.addAll(candidates, { wrapWithDirectory: true })) {
        const cid = entry.cid.toString();
        dirCid = cid;
        importedCids.add(cid);
      }

      if (!dirCid) {
        throw new Error('No CID returned from addAll');
      }

      if (options?.pin !== false) {
        await this.pinFile(dirCid);
      }

      void this.maybeAnnounceStoredCIDs(Array.from(importedCids), options?.announce);
      void this.maybeWarmPublicGateway(dirCid);
      void this.maybeWarmPublicGatewayDirectoryPaths(dirCid, Object.keys(files));

      log.info(`[IPFS] Stored directory with ${Object.keys(files).length} files: ${dirCid}`);
      return dirCid;
    } catch (error) {
      log.error('Error storing directory in Helia IPFS:', error);
      throw new Error(`Failed to store directory in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store a file from a readable stream without loading it entirely into memory.
   * Uses Helia's addByteStream for efficient chunked IPFS ingestion.
   */
  async storeFileStream(stream: AsyncIterable<Uint8Array>, options?: {
    pin?: boolean;
    timeoutMs?: number;
    announce?: boolean; // Announce CID to DHT after storing
  }): Promise<string> {
    const fs = this.getUnixFS();
    const timeout = options?.timeoutMs ?? 30 * 60 * 1000; // 30 min default for large files

    try {
      // Wrap with a timeout so large uploads don't hang forever
      const cidPromise = fs.addByteStream(stream);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`IPFS addByteStream timed out after ${Math.round(timeout / 60000)} minutes`)), timeout);
      });

      const cid = await Promise.race([cidPromise, timeoutPromise]);

      if (options?.pin !== false) {
        await this.pinFile(cid.toString());
      }

      void this.maybeAnnounceStoredCID(cid.toString(), options?.announce);
      void this.maybeWarmPublicGateway(cid.toString());

      return cid.toString();
    } catch (error) {
      log.error('Error storing file stream in Helia IPFS:', error);
      throw new Error(`Failed to store file stream in IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async maybeAnnounceStoredCID(cid: string, explicitAnnounce?: boolean): Promise<void> {
    const autoAnnounce = this.options.autoAnnounceOnStore !== false;
    const shouldAnnounce = explicitAnnounce === true || (explicitAnnounce === undefined && autoAnnounce);

    if (!shouldAnnounce) return;
    if (!this.canAnnounce()) return;

    try {
      const announced = await this.announceCID(cid);
      if (!announced) {
        log.debug(`[IPFS] Store auto-announce skipped/failed for CID: ${cid}`);
      }
    } catch (error: any) {
      log.warn(`[IPFS] Store auto-announce failed for CID ${cid}: ${error?.message || 'unknown error'}`);
    }
  }

  private async maybeAnnounceStoredCIDs(cids: string[], explicitAnnounce?: boolean): Promise<void> {
    const unique = Array.from(new Set(cids.filter(Boolean)));
    if (unique.length === 0) return;
    if (unique.length === 1) {
      await this.maybeAnnounceStoredCID(unique[0], explicitAnnounce);
      return;
    }

    const autoAnnounce = this.options.autoAnnounceOnStore !== false;
    const shouldAnnounce = explicitAnnounce === true || (explicitAnnounce === undefined && autoAnnounce);
    if (!shouldAnnounce) return;
    if (!this.canAnnounce()) return;

    try {
      const result = await this.announceMultipleCIDs(unique);
      if (result.failed > 0) {
        log.warn(`[IPFS] Store batch auto-announce partial failure: ${result.success} success, ${result.failed} failed`);
      }
    } catch (error: any) {
      log.warn(`[IPFS] Store batch auto-announce failed: ${error?.message || 'unknown error'}`);
    }
  }

  private async maybeWarmPublicGateway(cid: string): Promise<void> {
    const shouldPrefetch = this.options.prefetchOnStore !== false;
    if (!shouldPrefetch) return;

    const base = (this.options.publicGatewayPrefetchUrl || 'https://ipfs.ela.city/ipfs/').replace(/\/+$/, '/');
    const url = `${base}${encodeURIComponent(cid)}`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(15_000),
      });
      log.debug(`[IPFS] Public gateway prefetch: ${cid} -> HTTP ${response.status}`);
    } catch (error: any) {
      log.debug(`[IPFS] Public gateway prefetch failed for ${cid}: ${error?.message || 'unknown error'}`);
    }
  }

  private async maybeWarmPublicGatewayDirectoryPaths(rootCid: string, fileNames: string[]): Promise<void> {
    const shouldPrefetch = this.options.prefetchOnStore !== false;
    if (!shouldPrefetch) return;
    if (fileNames.length === 0) return;

    const base = (this.options.publicGatewayPrefetchUrl || 'https://ipfs.ela.city/ipfs/').replace(/\/+$/, '/');
    const maxWarmups = 16; // Keep bootstrap prefetch bounded.

    for (const name of fileNames.slice(0, maxWarmups)) {
      const encodedPath = name.split('/').map((part) => encodeURIComponent(part)).join('/');
      const url = `${base}${encodeURIComponent(rootCid)}/${encodedPath}`;
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(15_000),
        });
        log.debug(`[IPFS] Public gateway prefetch path: ${rootCid}/${name} -> HTTP ${response.status}`);
      } catch (error: any) {
        log.debug(`[IPFS] Public gateway prefetch path failed for ${rootCid}/${name}: ${error?.message || 'unknown error'}`);
      }
    }
  }

  /**
   * Retrieve file content from IPFS using CID.
   *
   * For callers that can consume an async stream instead of a full Buffer,
   * prefer {@link getFileStream} — it keeps memory proportional to one IPFS
   * chunk (~256 KB) rather than the entire file.
   */
  async getFile(cid: string): Promise<Buffer> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — guard against Helia iterator hangs
    const LARGE_FILE_WARN_BYTES = 100 * 1024 * 1024; // 100 MB

    try {
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);

      // IMPORTANT: Use the underlying FsBlockstore directly, not helia.blockstore (IdentityBlockstore wrapper)
      const { exporter } = await import('ipfs-unixfs-exporter');

      const entry = await exporter(cidObj, this.blockstore);

      if (!entry) {
        throw new Error(`Entry not found for CID: ${cid}`);
      }

      if (entry.type !== 'file' && entry.type !== 'raw') {
        throw new Error(`CID ${cid} is not a file (type: ${entry.type})`);
      }

      // Single-pass assembly: collect chunks and concat once.
      // Previous implementation allocated an intermediate chunks[] array, then a
      // second full-size Buffer, and copied every byte a second time. This version
      // hands the chunks directly to Buffer.concat which does one allocation.
      const pieces: Buffer[] = [];
      let totalLength = 0;

      const contentPromise = (async () => {
        for await (const chunk of entry.content()) {
          pieces.push(Buffer.from(chunk));
          totalLength += chunk.length;
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`IPFS getFile timed out after ${TIMEOUT_MS / 1000}s for CID: ${cid}`)), TIMEOUT_MS);
      });

      await Promise.race([contentPromise, timeoutPromise]);

      if (pieces.length === 0) {
        throw new Error(`File content is empty for CID: ${cid}`);
      }

      log.debug(`[IPFS] Retrieved ${pieces.length} chunks, total size: ${totalLength} bytes for CID: ${cid}`);

      if (totalLength >= LARGE_FILE_WARN_BYTES) {
        log.warn(`[IPFS] getFile() fetching ${(totalLength / (1024 * 1024)).toFixed(1)}MB for CID: ${cid}.`);
      }

      // For files above threshold, assemble in Rust/WASM to keep chunk data
      // out of V8's GC-tracked heap. Only the final Buffer lives in Node.js.
      if (totalLength >= WASM_ASSEMBLE_THRESHOLD) {
        try {
          const { getWASMRuntime } = await import('../services/wasm/WASMRuntime.js');
          // Phase 2-D-helpers: INTENTIONAL service-internal ambient.
          // This is inside IPFSStorage.getFile() — a CLASS METHOD on a
          // service constructed once at bootstrap (before any request).
          // Cleanest future fix is constructor injection of WASMRuntime
          // into IPFSStorage; that's structurally invasive and out of
          // scope for Phase 2-D-helpers' route-chain mandate.
          // Audit-permitted as architectural-boundary ambient (similar
          // pattern to the bootstrap-time setGlobalDatabase() in Phase 2-C).
          // See PHASE-2-D-HELPERS-CLEANUP.md §"Intentional service-internal
          // ambient sites".
          const runtime = getWASMRuntime();

          if (!cachedAssembleWasm) {
            cachedAssembleWasm = await runtime.loadFromFile(IPFS_ASSEMBLE_WASM_PATH);
            log.info(`[IPFS] Loaded ipfs-assemble WASM (${(cachedAssembleWasm.byteLength / 1024).toFixed(0)} KB)`);
          }

          const result = await runtime.executeIPFSAssemble(cachedAssembleWasm, pieces, totalLength, {
            timeoutMs: 120000,
          });

          if (result.success && result.assembled) {
            log.info(`[IPFS] WASM assembled ${(totalLength / (1024 * 1024)).toFixed(1)}MB in ${result.executionTimeMs}ms for CID: ${cid}`);
            return result.assembled;
          }

          log.warn(`[IPFS] WASM assemble failed (${result.error}), falling back to Buffer.concat for CID: ${cid}`);
        } catch (wasmErr) {
          log.warn(`[IPFS] WASM assembler unavailable (${wasmErr instanceof Error ? wasmErr.message : 'unknown'}), falling back to Buffer.concat for CID: ${cid}`);
        }
      }

      return Buffer.concat(pieces, totalLength);
    } catch (error) {
      log.error(`Error retrieving file from Helia IPFS (CID: ${cid}):`, error);
      throw new Error(`Failed to retrieve file from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file size from IPFS without loading any content into memory.
   * Uses the exporter's entry.size which reads only the DAG metadata.
   */
  async inspectCID(cidString: string): Promise<{
    cid: string;
    size: number;
    type: 'file' | 'raw' | 'directory';
  }> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const { CID } = await import('multiformats/cid');
    const cidObj = CID.parse(cidString);
    const { exporter } = await import('ipfs-unixfs-exporter');

    const entry = await exporter(cidObj, this.blockstore);
    if (!entry) {
      throw new Error(`Entry not found for CID: ${cidString}`);
    }

    const type = normalizeUnixFSEntryType(entry.type as string | undefined);
    return {
      cid: entry.cid.toString(),
      size: Number(entry.size || 0),
      type,
    };
  }

  /**
   * Get file size from IPFS without loading any content into memory.
   * Uses the exporter's entry.size which reads only the DAG metadata.
   */
  async getFileSize(cid: string): Promise<number> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const { CID } = await import('multiformats/cid');
    const cidObj = CID.parse(cid);
    const { exporter } = await import('ipfs-unixfs-exporter');

    const entry = await exporter(cidObj, this.blockstore);
    if (!entry) {
      throw new Error(`Entry not found for CID: ${cid}`);
    }
    if (entry.type !== 'file' && entry.type !== 'raw') {
      throw new Error(`CID ${cid} is not a file (type: ${entry.type})`);
    }

    return Number(entry.size);
  }

  /**
   * List entries in an IPFS directory.
   * Returns array of { name, cid, size, type } for each entry.
   */
  async listDirectory(cidString: string): Promise<Array<{ name: string; cid: string; size: number; type: string }>> {
    const { CID } = await import('multiformats/cid');
    const cid = CID.parse(cidString);
    const entries: Array<{ name: string; cid: string; size: number; type: string }> = [];
    const fs = this.getUnixFS();
    try {
      for await (const entry of fs.ls(cid)) {
        entries.push({
          name: entry.name,
          cid: entry.cid.toString(),
          size: Number(entry.size || 0),
          type: normalizeUnixFSEntryType(entry.type as string | undefined),
        });
      }
      return entries;
    } catch (lsError: any) {
      log.debug(`[IPFS] fs.ls fallback for ${cidString}: ${lsError?.message || 'unknown error'}`);
    }

    // Fallback path for legacy/sharded directory formats that fs.ls may not decode.
    const { exporter } = await import('ipfs-unixfs-exporter');
    const entry = await exporter(cid, this.blockstore!);
    if (!entry) return entries;
    const rootType = normalizeUnixFSEntryType((entry.type as UnixFSEntryType | undefined) || 'file');
    if (rootType !== 'directory') {
      throw new Error(`CID ${cidString} is not a directory (type: ${entry.type})`);
    }

    if (typeof entry.content !== 'function') {
      return entries;
    }
    for await (const child of entry.content()) {
      entries.push({
        name: child.name || '',
        cid: child.cid.toString(),
        size: Number(child.size || 0),
        type: normalizeUnixFSEntryType(child.type as string | undefined),
      });
    }
    return entries;
  }

  /**
   * Stream file content from IPFS with optional byte-range support.
   * Only reads the requested bytes from the blockstore -- memory usage is
   * proportional to the chunk size (~256 KB), not the file size.
   */
  async *getFileStream(cid: string, options?: {
    offset?: number;
    length?: number;
  }): AsyncGenerator<Uint8Array> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const { CID } = await import('multiformats/cid');
    const cidObj = CID.parse(cid);
    const { exporter } = await import('ipfs-unixfs-exporter');

    const entry = await exporter(cidObj, this.blockstore);
    if (!entry) {
      throw new Error(`Entry not found for CID: ${cid}`);
    }
    if (entry.type !== 'file' && entry.type !== 'raw') {
      throw new Error(`CID ${cid} is not a file (type: ${entry.type})`);
    }

    yield* entry.content({
      offset: options?.offset,
      length: options?.length,
    });
  }

  /**
   * Resolve a sub-path within a UnixFS DAG directory.
   * e.g. resolveDAGPath("QmRoot", "video/seg-1.m4s") traverses the directory to
   * find and return the file entry.  Returns null when the root CID is not a
   * directory or the sub-path does not exist.
   */
  async resolveDAGPath(rootCid: string, subPath: string): Promise<{
    cid: string;
    size: number;
    type: 'file' | 'raw' | 'directory';
  } | null> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const { exporter } = await import('ipfs-unixfs-exporter');
    const fullPath = `${rootCid}/${subPath}`;

    try {
      const entry = await exporter(fullPath, this.blockstore);
      if (!entry) return null;

      return {
        cid: entry.cid.toString(),
        size: Number(entry.size),
        type: normalizeUnixFSEntryType(entry.type as string | undefined),
      };
    } catch {
      return null;
    }
  }

  /**
   * Stream content from a sub-path within a UnixFS DAG directory.
   * Uses the exporter's native path resolution to traverse the directory.
   */
  async *getDAGFileStream(rootCid: string, subPath: string, options?: {
    offset?: number;
    length?: number;
  }): AsyncGenerator<Uint8Array> {
    if (!this.blockstore) {
      throw new Error('Blockstore not initialized');
    }

    const { exporter } = await import('ipfs-unixfs-exporter');
    const fullPath = `${rootCid}/${subPath}`;

    const entry = await exporter(fullPath, this.blockstore);
    if (!entry) {
      throw new Error(`Path not found: ${fullPath}`);
    }
    if (entry.type !== 'file' && entry.type !== 'raw') {
      throw new Error(`Path ${fullPath} is not a file (type: ${entry.type})`);
    }

    yield* entry.content({
      offset: options?.offset,
      length: options?.length,
    });
  }

  /**
   * Check if a CID exists in IPFS
   */
  async fileExists(cid: string): Promise<boolean> {
    const helia = this.getHelia();

    try {
      // Import CID and try to get the block
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);

      // Try to get the block - if it exists, this will succeed
      await helia.blockstore.get(cidObj);
      return true;
    } catch (error) {
      // If get fails, block doesn't exist
      return false;
    }
  }

  /**
   * Pin a file (prevent garbage collection)
   */
  async pinFile(cid: string): Promise<void> {
    const helia = this.getHelia();

    try {
      // Import CID
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);

      // Helia pins are managed through the blockstore
      // For now, we'll just ensure the block is in the blockstore
      // (which it should be if we just added it)
      // In the future, we can use @helia/remote-pinning for proper pinning
      await helia.blockstore.get(cidObj);
    } catch (error) {
      log.error(`Error pinning file (CID: ${cid}):`, error);
      throw new Error(`Failed to pin file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpin a file (allow garbage collection)
   */
  async unpinFile(cid: string): Promise<void> {
    // In Helia, unpinning is typically handled by garbage collection
    // For now, we'll just log - actual unpinning would require
    // tracking pinned CIDs separately or using @helia/remote-pinning
    log.debug(`Unpinning file (CID: ${cid}) - GC will handle cleanup`);
  }

  /**
   * Error types for remote pinning operations
   */
  static readonly PinErrorType = {
    PRIVATE_MODE: 'PRIVATE_MODE',
    INVALID_CID: 'INVALID_CID',
    TIMEOUT: 'TIMEOUT',
    NOT_FOUND: 'NOT_FOUND',
    NETWORK_ERROR: 'NETWORK_ERROR',
    DIRECTORY_TOO_LARGE: 'DIRECTORY_TOO_LARGE',
  } as const;

  /**
   * Pin a remote CID from the IPFS network
   * Fetches content from other nodes and stores locally
   * Handles both files and directories with timeout support
   * Used for marketplace purchases and network participation
   * 
   * @param cidString - The CID to fetch and pin
   * @param options - Optional configuration
   * @param options.timeoutMs - Timeout in milliseconds (default: 60000)
   * @param options.maxFiles - Maximum files to fetch for directories (default: 1000)
   */
  async pinRemoteCID(cidString: string, options?: {
    timeoutMs?: number;
    maxFiles?: number;
    /**
     * Called with cumulative bytes received for the CID during long-running
     * fetches (CAR import, gateway stream). Safe to no-op; callers should
     * throttle their own persistence (e.g. only write to SQLite every N ms).
     */
    onProgress?: (bytesReceived: number) => void;
  }): Promise<{
    success: boolean;
    cid: string;
    type: 'file' | 'directory' | 'raw';
    size: number;
    files?: number;
    timeMs: number;
    content?: Uint8Array; // Content bytes when fetched via gateway
    actualCid?: string; // Actual CID in local store (may differ due to v0/v1)
  }> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? 60000; // 60 second default
    const maxFiles = options?.maxFiles ?? 1000;

    if (this.networkMode === 'private') {
      throw Object.assign(
        new Error('Remote pinning requires public or hybrid network mode'),
        { type: IPFSStorage.PinErrorType.PRIVATE_MODE }
      );
    }

    const fs = this.getUnixFS();

    // Parse CID
    let cid: any;
    try {
      const { CID } = await import('multiformats/cid');
      cid = CID.parse(cidString);
    } catch (error) {
      throw Object.assign(
        new Error(`Invalid CID format: ${cidString}`),
        { type: IPFSStorage.PinErrorType.INVALID_CID }
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      log.debug(`[IPFS] Fetching remote CID from network: ${cidString} (timeout: ${timeoutMs}ms)`);

      // Helper to wrap operations with timeout check
      const checkAbort = () => {
        if (controller.signal.aborted) {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        }
      };

      // Check if the original CID's root block exists in the local blockstore
      const hasRootBlock = this.blockstore ? await this.blockstore.has(cid) : false;

      if (hasRootBlock) {
        // Root block exists locally. For content uploaded by our own encoder,
        // all blocks are already in the blockstore — skip expensive traversal.
        const quickLocalTimeoutMs = 10000;
        try {
          log.info(`[IPFS] Root block exists locally for ${cidString}, trying local resolve...`);

          // Try to detect content type via exporter (fast, reads only root node)
          const { exporter } = await import('ipfs-unixfs-exporter');
          const entryPromise = exporter(cid, this.blockstore!);
          const entryTimeout = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), quickLocalTimeoutMs)
          );
          const entry = await Promise.race([entryPromise, entryTimeout]);

          if (entry) {
            if (entry.type === 'directory') {
              // Fast path only holds for content we authored locally
              // (DASH encoder, /upload) — every block in the DAG is in
              // the blockstore and a pin is just a DB flag.
              //
              // For BUYER-side pins the root block may be local because
              // of a prior /media/init call (which fetched stream.mpd
              // and a few init segments to extract PSSH) or a gateway
              // auto-fetch, while the segment and audio blocks are
              // still remote. Returning fast-path success in that state
              // marks pin_status='complete' in the DB and writes a
              // .ddrm claiming "Downloaded (193.5 MB)" when only a few
              // KB are actually on disk — the exact deception we just
              // shipped the download-first flow to eliminate.
              //
              // Recursively verify the DAG is fully local up to a
              // bounded depth (covers DASH's root → audio|video → 1 →
              // segments layout). Falls through to CAR import if any
              // block is missing.
              const { exporter: expForCheck } = await import('ipfs-unixfs-exporter');
              const completenessDeadline = Date.now() + quickLocalTimeoutMs;
              const MAX_CHECK_DEPTH = 4;

              let dirFileCount = 0;
              let dirTotalSize = 0;

              // Walks the DAG verifying every block is local AND accumulating
              // real leaf-file bytes. Top-level child.size on a UnixFS
              // directory is the directory's own metadata size (~200B), not
              // the sum of its descendants, so summing it at the root lies
              // about the content size (e.g. reports 3KB for a 200MB DASH
              // directory). Only file/raw leaves carry honest byte counts.
              const isDagComplete = async (checkCid: any, depth: number): Promise<boolean> => {
                if (Date.now() > completenessDeadline) return false;
                if (controller.signal.aborted) return false;
                if (this.blockstore && !(await this.blockstore.has(checkCid))) return false;
                if (depth <= 0) return true;
                try {
                  const e = await expForCheck(checkCid, this.blockstore!);
                  if (e.type === 'file' || e.type === 'raw') {
                    const leafSize = Number((e as any).size || 0);
                    if (leafSize > 0) {
                      dirTotalSize += leafSize;
                      dirFileCount++;
                    }
                    return true;
                  }
                  if (e.type !== 'directory') return true;
                  for await (const child of e.content()) {
                    const childCid = (child as any).cid;
                    if (!childCid) continue;
                    const ok = await isDagComplete(childCid, depth - 1);
                    if (!ok) return false;
                  }
                  return true;
                } catch {
                  return false;
                }
              };

              let incompleteDag = false;
              try {
                for await (const child of entry.content()) {
                  const childCid = (child as any).cid;
                  if (!childCid) continue;
                  const ok = await isDagComplete(childCid, MAX_CHECK_DEPTH - 1);
                  if (!ok) {
                    incompleteDag = true;
                    break;
                  }
                }
              } catch {
                try {
                  const lsTimeout = new Promise<void>((resolve) => setTimeout(resolve, quickLocalTimeoutMs));
                  const lsWork = (async () => {
                    const fs = this.getUnixFS();
                    for await (const child of fs.ls(cid)) {
                      if (!child.cid) continue;
                      const ok = await isDagComplete(child.cid, MAX_CHECK_DEPTH - 1);
                      if (!ok) {
                        incompleteDag = true;
                        break;
                      }
                    }
                  })();
                  await Promise.race([lsWork, lsTimeout]);
                } catch {
                  // If ls also fails, be conservative and fall through
                  incompleteDag = true;
                }
              }

              if (incompleteDag) {
                log.info(`[IPFS] Fast path skipped for ${cidString}: DAG not fully local, falling through to CAR import`);
                // fall through to Bitswap / CAR import below
              } else {
                const timeMs = Date.now() - startTime;
                log.info(`[IPFS] ✅ Local directory confirmed: ${cidString} (${dirTotalSize} bytes, ${dirFileCount} files, ${timeMs}ms)`);
                return {
                  success: true,
                  cid: cidString,
                  type: 'directory' as const,
                  size: dirTotalSize,
                  files: dirFileCount || 1,
                  timeMs,
                };
              }
            }

            // File or raw: read content
            if (entry.type === 'file' || entry.type === 'raw') {
              const chunks: Uint8Array[] = [];
              let totalSize = 0;
              const catPromise = (async () => {
                for await (const chunk of entry.content()) {
                  chunks.push(chunk);
                  totalSize += chunk.length;
                  checkAbort();
                }
                return chunks;
              })();
              const catTimeout = new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), quickLocalTimeoutMs)
              );
              const result = await Promise.race([catPromise, catTimeout]);

              if (result && chunks.length > 0) {
                const combined = new Uint8Array(totalSize);
                let offset = 0;
                for (const chunk of chunks) {
                  combined.set(chunk, offset);
                  offset += chunk.length;
                }
                log.info(`[IPFS] ✅ Found locally: ${cidString} (${totalSize} bytes)`);
                const timeMs = Date.now() - startTime;
                return {
                  success: true,
                  cid: cidString,
                  type: 'file' as const,
                  size: totalSize,
                  timeMs,
                  content: combined,
                  actualCid: cidString
                };
              }
            }
          }
        } catch (localError: any) {
          log.info(`[IPFS] Quick local fetch failed for ${cidString}: ${localError.message}`);
        }
      } else {
        log.debug(`[IPFS] Root block not in blockstore for ${cidString}, skipping local fetch`);
      }

      // Phase 2: Try Bitswap — ask DHT peers for the content before gateways
      if (this.canAnnounce()) {
        try {
          const bitswapResult = await this.fetchViaBitswap(cid, cidString, fs, checkAbort);
          if (bitswapResult) {
            const timeMs = Date.now() - startTime;
            return { ...bitswapResult, timeMs };
          }
        } catch (bitswapError: any) {
          log.debug(`[IPFS] Bitswap fetch failed: ${bitswapError.message}`);
        }
      }

      // Fetch via gateway — CAR import preserves original CID block structure
      log.debug(`[IPFS] Fetching via gateway (CAR preferred) for ${cidString}...`);
      try {
        const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime), options?.onProgress);
        if (gatewayResult.success) {
          const timeMs = Date.now() - startTime;
          log.debug(`[IPFS] ✅ Fetched via gateway: ${cidString} (${gatewayResult.size} bytes, ${gatewayResult.blockCount || 1} blocks, ${timeMs}ms)`);
          return {
            success: true,
            cid: cidString,
            type: 'file' as const,
            size: gatewayResult.size,
            timeMs,
            content: gatewayResult.content,
            actualCid: gatewayResult.actualCid
          };
        }
      } catch (gatewayError: any) {
        log.debug(`[IPFS] Gateway fetch failed: ${gatewayError.message}`);
      }

      // Last resort: try stat + cat with remaining timeout (for directories or special cases)
      const statTimeoutMs = Math.min(timeoutMs - (Date.now() - startTime), 45000);
      let stats: any;

      try {
        checkAbort();
        log.debug(`[IPFS] Trying DHT stat for ${cidString}...`);

        const statPromise = fs.stat(cid);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('stat_timeout')), statTimeoutMs)
        );

        stats = await Promise.race([statPromise, timeoutPromise]);
        log.debug(`[IPFS] CID type: ${stats.type}`);
      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.debug(`[IPFS] DHT stat failed: ${errorMsg}`);

        throw Object.assign(
          new Error(`Content not found: Could not retrieve from local cache, gateways, or DHT`),
          { type: IPFSStorage.PinErrorType.NOT_FOUND }
        );
      }

      let totalSize = 0;
      let fileCount = 0;

      if (stats.type === 'directory') {
        // Handle directory: recursively fetch all files
        log.debug(`[IPFS] Fetching directory contents...`);
        const result = await this.fetchDirectoryRecursive(fs, cid, controller.signal, maxFiles, 0);
        totalSize = result.size;
        fileCount = result.files;

        if (result.truncated) {
          log.warn(`[IPFS] ⚠️ Directory fetch truncated at ${maxFiles} files`);
        }

        log.debug(`[IPFS] ✅ Pinned remote directory: ${cidString} (${fileCount} files, ${totalSize} bytes)`);
      } else {
        // Handle file or raw: use cat() without signal
        const chunks: Uint8Array[] = [];

        for await (const chunk of fs.cat(cid)) {
          chunks.push(chunk);
          totalSize += chunk.length;
          checkAbort(); // Check abort between chunks
        }

        fileCount = 1;
        log.debug(`[IPFS] ✅ Pinned remote file: ${cidString} (${totalSize} bytes, ${chunks.length} chunks)`);
      }

      const timeMs = Date.now() - startTime;

      return {
        success: true,
        cid: cidString,
        type: stats.type,
        size: totalSize,
        files: stats.type === 'directory' ? fileCount : undefined,
        timeMs
      };
    } catch (error: any) {
      // Re-throw typed errors as-is
      if (error.type) {
        // Try gateway fallback for NOT_FOUND and NETWORK_ERROR
        if (error.type === IPFSStorage.PinErrorType.NOT_FOUND ||
          error.type === IPFSStorage.PinErrorType.NETWORK_ERROR) {
          log.debug(`[IPFS] DHT fetch failed, trying gateway fallback...`);
          try {
            const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime), options?.onProgress);
            if (gatewayResult.success) {
              const timeMs = Date.now() - startTime;
              return {
                success: true,
                cid: cidString,
                type: 'file' as const,
                size: gatewayResult.size,
                timeMs,
                content: gatewayResult.content,
                actualCid: gatewayResult.actualCid
              };
            }
          } catch (gatewayError: any) {
            log.debug(`[IPFS] Gateway fallback also failed: ${gatewayError.message}`);
          }
        }
        throw error;
      }

      // Handle abort/timeout
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw Object.assign(
          new Error(`Timeout: Could not fetch content within ${timeoutMs / 1000}s`),
          { type: IPFSStorage.PinErrorType.TIMEOUT }
        );
      }

      // Handle other errors - try gateway fallback
      log.error(`[IPFS] Failed to pin remote CID ${cidString}:`, error);
      log.debug(`[IPFS] Trying gateway fallback...`);

      try {
        const gatewayResult = await this.fetchViaGateway(cidString, timeoutMs - (Date.now() - startTime), options?.onProgress);
        if (gatewayResult.success) {
          const timeMs = Date.now() - startTime;
          return {
            success: true,
            cid: cidString,
            type: 'file' as const,
            size: gatewayResult.size,
            timeMs,
            content: gatewayResult.content,
            actualCid: gatewayResult.actualCid
          };
        }
      } catch (gatewayError: any) {
        log.debug(`[IPFS] Gateway fallback also failed: ${gatewayError.message}`);
      }

      throw Object.assign(
        new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`),
        { type: IPFSStorage.PinErrorType.NETWORK_ERROR }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch content via public IPFS gateway and add to local node
   * Used as fallback when DHT fetching fails
   * @private
   */
  /**
   * Drain a Fetch response body to a Uint8Array, emitting cumulative byte
   * counts to `onProgress` at most once every 500ms (or on completion).
   * Replaces `await response.arrayBuffer()` so long-running CAR/file
   * downloads expose live progress for the market-app progress bar
   * without flooding SQLite with per-chunk writes.
   */
  private async readStreamWithProgress(
    response: Response,
    onProgress?: (bytesReceived: number) => void,
  ): Promise<Uint8Array> {
    if (!response.body || typeof response.body.getReader !== 'function') {
      return new Uint8Array(await response.arrayBuffer());
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let lastEmit = 0;
    const EMIT_INTERVAL_MS = 500;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        const now = Date.now();
        if (onProgress && now - lastEmit >= EMIT_INTERVAL_MS) {
          lastEmit = now;
          try { onProgress(total); } catch { /* never let a progress consumer kill a pin */ }
        }
      }
    }

    if (onProgress && total > 0) {
      try { onProgress(total); } catch { /* same */ }
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private async fetchViaGateway(
    cidString: string,
    remainingTimeoutMs: number,
    onProgress?: (bytesReceived: number) => void,
  ): Promise<{
    success: boolean;
    size: number;
    content?: Uint8Array;
    actualCid?: string;
    blockCount?: number;
  }> {
    const GATEWAYS = [
      'https://ipfs.ela.city/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://dweb.link/ipfs/',
      'https://w3s.link/ipfs/',
      'https://nftstorage.link/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://4everland.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
    ];

    const helia = this.helia!;
    const fs = this.getUnixFS();
    const timeoutMs = Math.max(remainingTimeoutMs, 120000);

    // Phase 1: Try CAR import from gateways that support ?format=car
    // This handles both files AND directories in one request.
    // The response body is streamed (not buffered) so long-running 100+MB
    // fetches can surface real-time byte counts to `onProgress` for the
    // download progress bar in the market app. We still need the full CAR
    // in memory before CarReader can parse it (the format isn't streamable
    // mid-import on this version of @ipld/car), but progress during the
    // network-bound phase — which is 99% of perceived wait — is live.
    for (const gateway of GATEWAYS) {
      try {
        const carUrl = `${gateway}${cidString}?format=car`;
        log.debug(`[IPFS] Trying CAR import: ${carUrl}`);

        const response = await fetch(carUrl, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Accept': 'application/vnd.ipld.car' },
        });

        if (!response.ok) {
          log.debug(`[IPFS] Gateway ${gateway} CAR returned ${response.status}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('car') && !contentType.includes('octet-stream')) {
          log.debug(`[IPFS] Gateway ${gateway} returned ${contentType}, not CAR`);
          continue;
        }

        const carBytes = await this.readStreamWithProgress(response, onProgress);
        log.debug(`[IPFS] Downloaded CAR: ${carBytes.length} bytes from ${gateway}`);

        const { CarReader } = await import('@ipld/car');
        const reader = await CarReader.fromBytes(carBytes);

        let blockCount = 0;
        let totalSize = 0;
        for await (const { cid, bytes } of reader.blocks()) {
          await helia.blockstore.put(cid, bytes);
          blockCount++;
          totalSize += bytes.length;
        }

        log.info(`[IPFS] ✅ CAR imported: ${blockCount} blocks, ${totalSize} bytes for ${cidString}`);

        return {
          success: true,
          size: totalSize,
          actualCid: cidString,
          blockCount,
        };
      } catch (error: any) {
        const errMsg = error.message || 'Unknown error';
        if (errMsg.includes('timeout') || errMsg.includes('abort')) {
          log.debug(`[IPFS] Gateway ${gateway} CAR timed out`);
        } else {
          log.debug(`[IPFS] Gateway ${gateway} CAR failed: ${errMsg.substring(0, 100)}`);
        }
        continue;
      }
    }

    // Phase 2: Try raw file fetch (only for non-directory CIDs)
    for (const gateway of GATEWAYS) {
      try {
        log.debug(`[IPFS] Trying raw fetch: ${gateway}${cidString}`);

        const response = await fetch(`${gateway}${cidString}`, {
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'follow',
          headers: { 'Accept': 'application/octet-stream, */*' },
        });

        if (!response.ok) {
          log.debug(`[IPFS] Gateway ${gateway} returned ${response.status}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          log.debug(`[IPFS] Gateway ${gateway} returned HTML (likely directory listing), skipping`);
          continue;
        }

        const content = await this.readStreamWithProgress(response, onProgress);

        log.debug(`[IPFS] ✅ Fetched ${content.length} bytes from gateway ${gateway}`);

        const addedCid = await fs.addBytes(content);
        log.debug(`[IPFS] ✅ Added to local IPFS: ${addedCid.toString()}`);

        return {
          success: true,
          size: content.length,
          content,
          actualCid: addedCid.toString()
        };
      } catch (error: any) {
        const errMsg = error.message || 'Unknown error';
        if (errMsg.includes('timeout') || errMsg.includes('abort')) {
          log.debug(`[IPFS] Gateway ${gateway} timed out`);
        } else {
          log.debug(`[IPFS] Gateway ${gateway} failed: ${errMsg.substring(0, 100)}`);
        }
        continue;
      }
    }

    throw new Error('All gateways failed after retries');
  }

  private static readonly BITSWAP_PEER_DISCOVERY_TIMEOUT_MS = 10_000;
  private static readonly BITSWAP_FETCH_TIMEOUT_MS = 30_000;

  /**
   * Try to fetch content directly from peers via Bitswap (DHT findProviders + fs.cat).
   * Returns null if no peers have the content or fetch fails within timeout.
   * @private
   */
  private async fetchViaBitswap(
    cid: any,
    cidString: string,
    fs: UnixFS,
    checkAbort: () => void
  ): Promise<{
    success: boolean;
    cid: string;
    type: 'file';
    size: number;
    content: Uint8Array;
    actualCid: string;
  } | null> {
    const dht = (this.helia!.libp2p.services as any).dht;
    if (!dht) return null;

    log.debug(`[IPFS] Bitswap: searching for providers of ${cidString}...`);

    let providerCount = 0;
    const discoveryTimeout = AbortSignal.timeout(IPFSStorage.BITSWAP_PEER_DISCOVERY_TIMEOUT_MS);

    try {
      for await (const event of dht.findProviders(cid, { signal: discoveryTimeout })) {
        if (event.name === 'PROVIDER') {
          providerCount += event.providers.length;
          for (const provider of event.providers) {
            log.debug(`[IPFS] Bitswap: found provider ${provider.id.toString()}`);
          }
        }
        if (providerCount > 0) break;
      }
    } catch (e: any) {
      if (!e.message?.includes('abort') && !e.message?.includes('timeout')) {
        log.debug(`[IPFS] Bitswap: findProviders error: ${e.message}`);
      }
    }

    if (providerCount === 0) {
      log.debug(`[IPFS] Bitswap: no providers found for ${cidString}`);
      return null;
    }

    log.debug(`[IPFS] Bitswap: ${providerCount} provider(s) found, fetching via fs.cat...`);

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const fetchTimeout = AbortSignal.timeout(IPFSStorage.BITSWAP_FETCH_TIMEOUT_MS);

    const catPromise = (async () => {
      for await (const chunk of fs.cat(cid, { signal: fetchTimeout })) {
        chunks.push(chunk);
        totalSize += chunk.length;
        checkAbort();
      }
    })();

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), IPFSStorage.BITSWAP_FETCH_TIMEOUT_MS)
    );

    const result = await Promise.race([catPromise, timeoutPromise]);
    if (result === null && chunks.length === 0) {
      log.debug(`[IPFS] Bitswap: fetch timed out for ${cidString}`);
      return null;
    }

    if (totalSize === 0) return null;

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    log.info(`[IPFS] ✅ Bitswap: fetched ${cidString} from peers (${totalSize} bytes)`);

    return {
      success: true,
      cid: cidString,
      type: 'file' as const,
      size: totalSize,
      content: combined,
      actualCid: cidString,
    };
  }

  /**
   * Recursively fetch all files in a directory
   * Note: Signal checking is done manually to work around Helia async iterator issues
   * @private
   */
  private async fetchDirectoryRecursive(
    fs: UnixFS,
    cid: any,
    signal: AbortSignal,
    maxFiles: number,
    currentCount: number
  ): Promise<{ size: number; files: number; truncated: boolean }> {
    let totalSize = 0;
    let fileCount = 0;
    let truncated = false;

    if (signal.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }

    for await (const entry of fs.ls(cid)) {
      if (signal.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }

      if (currentCount + fileCount >= maxFiles) {
        truncated = true;
        break;
      }

      if (entry.type === 'directory') {
        const subResult = await this.fetchDirectoryRecursive(
          fs,
          entry.cid,
          signal,
          maxFiles,
          currentCount + fileCount
        );
        totalSize += subResult.size;
        fileCount += subResult.files;
        truncated = truncated || subResult.truncated;
      } else {
        // Use size from directory metadata when available (avoids reading all bytes)
        const entrySize = Number(entry.size || 0);
        if (entrySize > 0) {
          totalSize += entrySize;
        } else {
          // Fallback: read content to determine size (remote fetch case)
          for await (const chunk of fs.cat(entry.cid)) {
            totalSize += chunk.length;
            if (signal.aborted) {
              throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
            }
          }
        }
        fileCount++;
      }
    }

    return { size: totalSize, files: fileCount, truncated };
  }

  /**
   * List all connected peers
   */
  async getConnectedPeers(): Promise<string[]> {
    if (!this.helia || !this.isInitialized) {
      return [];
    }

    const connections = this.helia.libp2p.getConnections();
    return connections.map(conn => conn.remotePeer.toString());
  }

  getConfiguredBootstrapPeers(): string[] {
    return Array.from(new Set(this.configuredBootstrapPeers.map((p) => this.normalizeBootstrapAddr(p))));
  }

  /**
   * Report whether this node is currently peered with any configured Elacity
   * bootstrap peer. Used by /api/ipfs/peers and operator diagnostics to
   * confirm content uploaded here will propagate to ipfs.ela.city.
   */
  getElacityPeerStatus(): {
    peered: boolean;
    configuredPeerIds: string[];
    configuredMultiaddrs: string[];
    matchedPeerIds: string[];
  } {
    const configuredPeerIds = Array.from(this.configuredElacityPeerIds);
    const configuredMultiaddrs = Array.from(new Set(this.configuredElacityPeers));

    if (!this.helia || !this.isInitialized || configuredPeerIds.length === 0) {
      return {
        peered: false,
        configuredPeerIds,
        configuredMultiaddrs,
        matchedPeerIds: [],
      };
    }

    const matched = new Set<string>();
    for (const conn of this.helia.libp2p.getConnections()) {
      const remote = conn.remotePeer.toString();
      if (this.configuredElacityPeerIds.has(remote)) {
        matched.add(remote);
      }
    }

    return {
      peered: matched.size > 0,
      configuredPeerIds,
      configuredMultiaddrs,
      matchedPeerIds: Array.from(matched),
    };
  }

  async reconnectBootstrapPeers(phase: 'manual' | 'post-init' | 'initial' = 'manual'): Promise<{
    attempted: number;
    connected: number;
    failed: Array<{ peer: string; error: string }>;
  }> {
    if (!this.helia || !this.isInitialized) {
      return { attempted: 0, connected: 0, failed: [] };
    }

    const peers = this.getConfiguredBootstrapPeers();
    if (peers.length === 0) {
      return { attempted: 0, connected: 0, failed: [] };
    }

    return this.connectBootstrapPeers(peers, phase);
  }

  /**
   * Manually (re)dial all configured Elacity peers. Returns per-peer results.
   * Used as a diagnostic and manual-recovery hook when startup dial fails or
   * the connection manager evicts the peer (e.g. LRU pressure at max
   * connections).
   */
  async reconnectElacityPeers(): Promise<{
    attempted: number;
    connected: number;
    results: Array<{ peer: string; success: boolean; error?: string }>;
  }> {
    if (!this.helia || !this.isInitialized) {
      return { attempted: 0, connected: 0, results: [] };
    }
    const peers = Array.from(new Set(this.configuredElacityPeers));
    const results: Array<{ peer: string; success: boolean; error?: string }> = [];
    let connected = 0;
    for (const peer of peers) {
      const outcome = await this.connectToPeer(peer);
      if (outcome.success) connected += 1;
      results.push({ peer, success: outcome.success, error: outcome.error });
    }
    return { attempted: peers.length, connected, results };
  }

  async connectToPeer(peerAddr: string): Promise<{ success: boolean; error?: string }> {
    if (!this.helia || !this.isInitialized) {
      return { success: false, error: 'IPFS not initialized' };
    }

    const normalized = this.normalizeBootstrapAddr(peerAddr.trim());
    if (!normalized) {
      return { success: false, error: 'Empty peer address' };
    }

    try {
      await (this.helia.libp2p as any).dial(multiaddr(normalized));
      log.info(`[IPFS] Manual dial ok: ${normalized}`);
      return { success: true };
    } catch (error: any) {
      const message = error?.message || 'unknown error';
      log.warn(`[IPFS] Manual dial failed ${normalized}: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<{
    mode: IPFSNetworkMode;
    peerId: string | null;
    connectedPeers: number;
    addresses: string[];
  }> {
    return {
      mode: this.networkMode,
      peerId: this.getNodeId(),
      connectedPeers: this.helia ? this.helia.libp2p.getConnections().length : 0,
      addresses: this.getMultiaddrs()
    };
  }

  /**
   * Get IPFS node information
   */
  async getNodeInfo(): Promise<{
    id: string;
    addresses: string[];
    agentVersion: string;
    protocolVersion: string;
  }> {
    const helia = this.getHelia();
    const peerId = helia.libp2p.peerId;
    const addresses = helia.libp2p.getMultiaddrs();

    return {
      id: peerId.toString(),
      addresses: addresses.map(addr => addr.toString()),
      agentVersion: 'helia',
      protocolVersion: '1.0'
    };
  }

  /**
   * Get node peer ID (short form for display)
   */
  getNodeId(): string | null {
    if (!this.helia || !this.isInitialized) {
      return null;
    }
    return this.helia.libp2p.peerId.toString();
  }

  /**
   * Get multiaddresses for this node
   */
  getMultiaddrs(): string[] {
    if (!this.helia || !this.isInitialized) {
      return [];
    }
    return this.helia.libp2p.getMultiaddrs().map(addr => addr.toString());
  }

  // ============================================================================
  // DHT Announcement Methods (for IPFS Public Folder Sharing)
  // ============================================================================

  /**
   * Announce a single CID to the DHT network
   * This makes the CID discoverable by other IPFS nodes
   */
  async announceCID(cid: string): Promise<boolean> {
    if (this.networkMode === 'private') {
      log.debug(`[IPFS] Skipping DHT announcement (private mode): ${cid}`);
      return false;
    }

    if (!this.helia || !this.isInitialized) {
      log.warn(`[IPFS] Cannot announce CID - IPFS not initialized`);
      return false;
    }

    try {
      const dht = (this.helia.libp2p.services as any).dht;
      if (!dht) {
        log.warn(`[IPFS] DHT service not available`);
        return false;
      }

      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cid);

      log.debug(`[IPFS] Announcing CID to DHT: ${cid}`);

      // IMPORTANT: kad-dht provide() returns an AsyncIterable<QueryEvent>.
      // We must consume it fully, otherwise the provide query may never run.
      for await (const _event of dht.provide(cidObj)) {
        // Drain iterator to completion.
        // console.log(_event);
      }

      log.debug(`[IPFS] ✅ Successfully announced CID to DHT: ${cid}`);
      return true;
    } catch (error: any) {
      // v1.2.7.5: AbortError is benign — kad-dht's provide() iterator is
      // bounded by an internal timeout. Hitting that timeout means the DHT
      // walk didn't finish in time, but the CID is still pinned locally
      // and the next pin-touch (or peer's want-have) will retry. Demote so
      // the log line stays informational rather than alarming.
      const isAbort = error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
      if (isAbort) {
        log.warn(`[IPFS] DHT announce timed out for ${cid} (transient — will retry on next pin / fetch)`);
      } else {
        log.error(`[IPFS] Failed to announce CID ${cid}:`, error);
      }
      return false;
    }
  }

  /**
   * Announce multiple CIDs to the DHT network
   * Used for batch announcement of public files
   */
  async announceMultipleCIDs(cids: string[]): Promise<{ success: number; failed: number }> {
    if (this.networkMode === 'private') {
      log.debug(`[IPFS] Skipping batch DHT announcement (private mode)`);
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    log.debug(`[IPFS] Starting batch announcement of ${cids.length} CIDs...`);

    for (const cid of cids) {
      try {
        const announced = await this.announceCID(cid);
        if (announced) {
          success++;
        } else {
          failed++;
        }
        // Small delay between announcements to avoid overwhelming DHT
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        failed++;
        const isAbort = error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
        if (isAbort) {
          log.warn(`[IPFS] DHT announce timed out for ${cid} (transient — will retry on next pin / fetch)`);
        } else {
          log.error(`[IPFS] Failed to announce CID ${cid}:`, error);
        }
      }
    }

    log.info(`[IPFS] Batch announcement complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  /**
   * Get DHT announcement statistics
   */
  getAnnouncementStats(): {
    mode: IPFSNetworkMode;
    dhtEnabled: boolean;
    canAnnounce: boolean;
    connectedPeers: number;
  } {
    const dhtEnabled = this.networkMode !== 'private' &&
      this.helia !== null &&
      (this.helia.libp2p.services as any).dht !== undefined;

    return {
      mode: this.networkMode,
      dhtEnabled,
      canAnnounce: dhtEnabled && this.isInitialized,
      connectedPeers: this.helia ? this.helia.libp2p.getConnections().length : 0
    };
  }

  /**
   * Check if DHT is available for announcements
   */
  canAnnounce(): boolean {
    return this.networkMode !== 'private' &&
      this.isInitialized &&
      this.helia !== null &&
      (this.helia.libp2p.services as any).dht !== undefined;
  }

  /**
   * Count DHT providers for a CID without fetching content.
   * Returns the number of peers advertising they have this content.
   * Times out after the specified duration (default 8s).
   */
  async countProviders(cidString: string, timeoutMs = 8000): Promise<number> {
    if (!this.canAnnounce()) return -1;

    try {
      const { CID } = await import('multiformats/cid');
      const cidObj = CID.parse(cidString);
      const dht = (this.helia!.libp2p.services as any).dht;
      if (!dht) return -1;

      let count = 0;
      const signal = AbortSignal.timeout(timeoutMs);

      for await (const event of dht.findProviders(cidObj, { signal })) {
        if (event.name === 'PROVIDER') {
          count += event.providers.length;
        }
      }
      return count;
    } catch (e: any) {
      if (e.message?.includes('abort') || e.message?.includes('timeout')) {
        return 0;
      }
      log.debug(`[IPFS] countProviders error for ${cidString}: ${e.message}`);
      return -1;
    }
  }

  /**
   * Stop IPFS node gracefully
   */
  async stop(): Promise<void> {
    if (this.bootstrapReconnectTimer) {
      clearTimeout(this.bootstrapReconnectTimer);
      this.bootstrapReconnectTimer = null;
    }
    if (this.bootstrapHealthTimer) {
      clearInterval(this.bootstrapHealthTimer);
      this.bootstrapHealthTimer = null;
    }
    if (this.elacityReconnectTimer) {
      clearInterval(this.elacityReconnectTimer);
      this.elacityReconnectTimer = null;
    }
    if (this.helia && this.isInitialized) {
      try {
        log.info('🛑 Stopping Helia IPFS node...');
        await this.helia.stop();
        this.helia = null;
        this.fs = null;
        this.isInitialized = false;
        log.info('✅ Helia IPFS node stopped');
      } catch (error) {
        log.error('Error stopping Helia IPFS node:', error);
        throw error;
      }
    }
  }

  /**
   * Check if IPFS is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.helia !== null;
  }

  private normalizeBootstrapAddr(addr: string): string {
    // Accept legacy /ipfs/<peerId> by normalizing to /p2p/<peerId>
    return addr.replace('/ipfs/', '/p2p/');
  }

  private async connectBootstrapPeers(
    peers: string[],
    phase: 'initial' | 'post-init' | 'manual'
  ): Promise<{
    attempted: number;
    connected: number;
    failed: Array<{ peer: string; error: string }>;
  }> {
    if (!this.helia || !this.isInitialized || !peers.length) {
      return { attempted: 0, connected: 0, failed: [] };
    }

    const uniquePeers = Array.from(new Set(peers.map((p) => this.normalizeBootstrapAddr(p))));
    log.info(`[IPFS] Bootstrap dial (${phase}): attempting ${uniquePeers.length} peers`);

    let connected = 0;
    const failed: Array<{ peer: string; error: string }> = [];
    const dialTasks = uniquePeers.map(async (peerAddr) => {
      try {
        await (this.helia!.libp2p as any).dial(multiaddr(peerAddr));
        connected += 1;
        log.debug(`[IPFS] Bootstrap dial ok (${phase}): ${peerAddr}`);
      } catch (error: any) {
        const message = error?.message || 'unknown error';
        failed.push({ peer: peerAddr, error: message });
        log.debug(`[IPFS] Bootstrap dial failed (${phase}) ${peerAddr}: ${message}`);
      }
    });

    await Promise.all(dialTasks);
    log.info(`[IPFS] Bootstrap dial (${phase}) complete: ${connected}/${uniquePeers.length} connected`);
    return {
      attempted: uniquePeers.length,
      connected,
      failed,
    };
  }
}
