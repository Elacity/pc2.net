/**
 * @fileoverview Unit tests for WalletService
 * Tests wallet data management, mode switching, and communication with Particle iframe
 */

// Mock dependencies
jest.mock('../../helpers/logger.js', () => ({
    createLogger: () => ({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

jest.mock('../../helpers/ethereum-provider.js', () => ({
    getEthereumProvider: jest.fn(),
    hasEthereumProvider: jest.fn(() => true),
    switchToElastos: jest.fn(),
    sendTransaction: jest.fn(),
    ELASTOS_CHAIN_CONFIG: {
        chainId: '0x14',
        chainName: 'Elastos Smart Chain',
    },
}));

// Import after mocks
import WalletService from '../WalletService.js';

describe('WalletService', () => {
    let walletService;
    
    beforeEach(() => {
        // Reset global state
        global.window = {
            user: {
                wallet_address: '0x1234567890123456789012345678901234567890',
                smart_account_address: '0xABCDEF1234567890123456789012345678901234',
            },
            location: { origin: 'http://localhost:4100' },
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            api_origin: 'http://localhost:4100',
        };
        
        global.$ = jest.fn(() => ({
            trigger: jest.fn(),
        }));
        
        global.document = {
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => ({
                id: '',
                src: '',
                style: {},
                onload: null,
                contentWindow: {
                    postMessage: jest.fn(),
                },
            })),
            body: {
                appendChild: jest.fn(),
            },
        };
        
        // Create fresh instance for each test
        walletService = new WalletService.constructor();
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with default values', () => {
            expect(walletService.walletMode).toBe('universal');
            expect(walletService.walletData.tokens).toEqual([]);
            expect(walletService.walletData.totalBalance).toBe(0);
            expect(walletService.elastosData.tokens).toEqual([]);
        });
        
        test('should detect connected wallet', () => {
            expect(walletService.isConnected()).toBe(true);
        });
        
        test('should return correct address for universal mode', () => {
            walletService.walletMode = 'universal';
            expect(walletService.getAddress()).toBe('0xABCDEF1234567890123456789012345678901234');
        });
        
        test('should return correct address for elastos mode', () => {
            walletService.walletMode = 'elastos';
            expect(walletService.getAddress()).toBe('0x1234567890123456789012345678901234567890');
        });
    });

    describe('Mode Switching', () => {
        test('should switch to elastos mode', async () => {
            await walletService.setMode('elastos');
            expect(walletService.walletMode).toBe('elastos');
        });
        
        test('should switch to universal mode', async () => {
            walletService.walletMode = 'elastos';
            await walletService.setMode('universal');
            expect(walletService.walletMode).toBe('universal');
        });
        
        test('should reject invalid mode', async () => {
            await walletService.setMode('invalid');
            expect(walletService.walletMode).toBe('universal'); // Unchanged
        });
        
        test('should return correct data based on mode', () => {
            walletService.walletData.tokens = [{ symbol: 'USDC' }];
            walletService.elastosData.tokens = [{ symbol: 'ELA' }];
            
            walletService.walletMode = 'universal';
            expect(walletService.getData().tokens[0].symbol).toBe('USDC');
            
            walletService.walletMode = 'elastos';
            expect(walletService.getData().tokens[0].symbol).toBe('ELA');
        });
    });

    describe('Subscription System', () => {
        test('should add listener', () => {
            const callback = jest.fn();
            walletService.subscribe(callback);
            expect(walletService.listeners.size).toBe(1);
        });
        
        test('should remove listener on unsubscribe', () => {
            const callback = jest.fn();
            const unsubscribe = walletService.subscribe(callback);
            unsubscribe();
            expect(walletService.listeners.size).toBe(0);
        });
        
        test('should notify listeners on data change', () => {
            const callback = jest.fn();
            walletService.subscribe(callback);
            walletService._notifyListeners();
            expect(callback).toHaveBeenCalled();
        });
    });

    describe('Balance Calculation', () => {
        test('should calculate total balance correctly', () => {
            const tokens = [
                { usdValue: 100.50 },
                { usdValue: 200.25 },
                { usdValue: '50.00' },
            ];
            const total = walletService._calculateTotalBalance(tokens);
            expect(total).toBeCloseTo(350.75, 2);
        });
        
        test('should handle empty token list', () => {
            const total = walletService._calculateTotalBalance([]);
            expect(total).toBe(0);
        });
        
        test('should handle tokens without usdValue', () => {
            const tokens = [
                { symbol: 'ETH' },
                { usdValue: 100 },
            ];
            const total = walletService._calculateTotalBalance(tokens);
            expect(total).toBe(100);
        });
    });

    describe('Address Helpers', () => {
        test('should return EOA address', () => {
            expect(walletService.getEOAAddress()).toBe('0x1234567890123456789012345678901234567890');
        });
        
        test('should return Smart Account address', () => {
            expect(walletService.getSmartAccountAddress()).toBe('0xABCDEF1234567890123456789012345678901234');
        });
        
        test('should return null when no user', () => {
            global.window.user = null;
            expect(walletService.getEOAAddress()).toBe(null);
            expect(walletService.getSmartAccountAddress()).toBe(null);
        });
    });

    describe('Stablecoin Addresses', () => {
        test('should return Base USDC address', () => {
            const stables = walletService._getStablecoinAddresses(8453);
            expect(stables).toContainEqual(expect.objectContaining({
                symbol: 'USDC',
                address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            }));
        });
        
        test('should return empty for unknown chain', () => {
            const stables = walletService._getStablecoinAddresses(99999);
            expect(stables).toEqual([]);
        });
    });

    describe('RPC URLs', () => {
        test('should return correct Base RPC', () => {
            expect(walletService._getPublicRpcUrl(8453)).toBe('https://mainnet.base.org');
        });
        
        test('should return correct Ethereum RPC', () => {
            expect(walletService._getPublicRpcUrl(1)).toBe('https://eth.llamarpc.com');
        });
        
        test('should return undefined for unknown chain', () => {
            expect(walletService._getPublicRpcUrl(99999)).toBeUndefined();
        });
    });

    describe('Cleanup', () => {
        test('should cleanup on destroy', () => {
            walletService.pollInterval = setInterval(() => {}, 1000);
            walletService.listeners.add(() => {});
            
            walletService.destroy();
            
            expect(walletService.pollInterval).toBe(null);
            expect(walletService.listeners.size).toBe(0);
        });
        
        test('should reset data on reinitialize', () => {
            walletService.walletData.tokens = [{ symbol: 'USDC' }];
            walletService.elastosData.tokens = [{ symbol: 'ELA' }];
            
            walletService.reinitialize();
            
            expect(walletService.walletData.tokens).toEqual([]);
            expect(walletService.elastosData.tokens).toEqual([]);
        });
    });
});

describe('WalletService Message Handling', () => {
    test('should handle tokens response', () => {
        const walletService = new WalletService.constructor();
        
        const payload = {
            tokens: [
                { symbol: 'USDC', balance: '100', usdValue: 100 },
            ],
            totalBalance: 100,
        };
        
        walletService._handleTokensResponse(payload, 1);
        
        expect(walletService.walletData.tokens).toEqual(payload.tokens);
        expect(walletService.walletData.totalBalance).toBe(100);
    });
});


