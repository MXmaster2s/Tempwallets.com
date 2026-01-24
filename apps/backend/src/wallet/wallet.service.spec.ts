import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service.js';
import { SeedRepository } from './seed.repository.js';
import { ZerionService } from './zerion.service.js';
import { SeedManager } from './managers/seed.manager.js';
import { AddressManager } from './managers/address.manager.js';
import { AccountFactory } from './factories/account.factory.js';
import { PimlicoAccountFactory } from './factories/pimlico-account.factory.js';
import { PolkadotEvmRpcService } from './services/polkadot-evm-rpc.service.js';
import { SubstrateManager } from './substrate/managers/substrate.manager.js';
import { BalanceCacheRepository } from './repositories/balance-cache.repository.js';
import { WalletAddresses } from './interfaces/wallet.interfaces.js';
import { Eip7702DelegationRepository } from './repositories/eip7702-delegation.repository.js';

// Mock TokenListService to avoid import.meta.url issues
jest.mock('./services/token-list.service.js', () => {
  return {
    TokenListService: jest.fn().mockImplementation(() => ({
      getTokensForChain: jest.fn().mockReturnValue([]),
      getAllTokens: jest.fn().mockReturnValue([]),
    })),
  };
});

describe('WalletService', () => {
  let walletService: WalletService;
  let seedRepository: jest.Mocked<SeedRepository>;
  let configService: jest.Mocked<ConfigService>;
  let zerionService: jest.Mocked<ZerionService>;
  let seedManager: jest.Mocked<SeedManager>;
  let addressManager: jest.Mocked<AddressManager>;
  let accountFactory: jest.Mocked<AccountFactory>;
  let pimlicoAccountFactory: jest.Mocked<PimlicoAccountFactory>;
  let polkadotEvmRpcService: jest.Mocked<PolkadotEvmRpcService>;
  let substrateManager: jest.Mocked<SubstrateManager>;
  let balanceCacheRepository: jest.Mocked<BalanceCacheRepository>;
  let eip7702DelegationRepository: jest.Mocked<Eip7702DelegationRepository>;

  const mockUserId = 'test-fingerprint-123';
  const mockAddresses: WalletAddresses = {
    ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    base: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  } as WalletAddresses;

  beforeEach(async () => {
    const mockSeedRepository = {
      createOrUpdateSeed: jest.fn(),
      getSeedPhrase: jest.fn(),
      hasSeed: jest.fn(),
      deleteSeed: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockZerionService = {
      getPortfolio: jest.fn(),
      getPositionsAnyChain: jest.fn(),
    };

    const mockSeedManager = {
      hasSeed: jest.fn(),
      createOrImportSeed: jest.fn(),
      getSeed: jest.fn(),
      storeSeed: jest.fn(),
    };

    const mockAddressManager = {
      getAddresses: jest.fn(),
      streamAddresses: jest.fn(),
      getManagedAddresses: jest.fn(),
    };

    const mockAccountFactory = {
      createAccount: jest.fn(),
    };

    const mockPimlicoAccountFactory = {
      createAccount: jest.fn(),
    };

    const mockPolkadotEvmRpcService = {
      getTokenBalances: jest.fn(),
    };

    const mockSubstrateManager = {
      getBalances: jest.fn(),
    };

    const mockEip7702DelegationRepository = {
      getDelegationsForUser: jest.fn().mockResolvedValue([]),
    };

    const mockBalanceCacheRepository = {
      getCachedBalances: jest.fn(),
      updateCachedBalances: jest.fn(),
      clearCache: jest.fn(),
      hasCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: SeedRepository,
          useValue: mockSeedRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ZerionService,
          useValue: mockZerionService,
        },
        {
          provide: SeedManager,
          useValue: mockSeedManager,
        },
        {
          provide: AddressManager,
          useValue: mockAddressManager,
        },
        {
          provide: AccountFactory,
          useValue: mockAccountFactory,
        },
        {
          provide: PimlicoAccountFactory,
          useValue: mockPimlicoAccountFactory,
        },
        {
          provide: PolkadotEvmRpcService,
          useValue: mockPolkadotEvmRpcService,
        },
        {
          provide: SubstrateManager,
          useValue: mockSubstrateManager,
        },
        {
          provide: BalanceCacheRepository,
          useValue: mockBalanceCacheRepository,
        },
        {
          provide: Eip7702DelegationRepository,
          useValue: mockEip7702DelegationRepository,
        },
      ],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
    seedRepository = module.get(SeedRepository);
    configService = module.get(ConfigService);
    zerionService = module.get(ZerionService);
    seedManager = module.get(SeedManager);
    addressManager = module.get(AddressManager);
    accountFactory = module.get(AccountFactory);
    pimlicoAccountFactory = module.get(PimlicoAccountFactory);
    polkadotEvmRpcService = module.get(PolkadotEvmRpcService);
    substrateManager = module.get(SubstrateManager);
    balanceCacheRepository = module.get(BalanceCacheRepository);
  eip7702DelegationRepository = module.get(Eip7702DelegationRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalances()', () => {
    it('should return cached data when available', async () => {
      const cachedBalances = {
        ethereum: {
          balance: '1000000000000000000',
          lastUpdated: Date.now(),
        },
        base: {
          balance: '500000000000000000',
          lastUpdated: Date.now(),
        },
      };

      balanceCacheRepository.getCachedBalances.mockResolvedValue(
        cachedBalances,
      );

      const result = await walletService.getBalances(mockUserId, false);

      // Should check cache first
      expect(balanceCacheRepository.getCachedBalances).toHaveBeenCalledWith(
        mockUserId,
      );
      // Should not call Zerion API
      expect(zerionService.getPortfolio).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create wallet if it does not exist', async () => {
      balanceCacheRepository.getCachedBalances.mockResolvedValue(null);
      addressManager.getAddresses.mockResolvedValue(mockAddresses);
      seedManager.hasSeed.mockResolvedValue(false);
      seedManager.createOrImportSeed.mockResolvedValue(undefined);

      zerionService.getPortfolio.mockResolvedValue({
        data: {
          attributes: {
            positions_distribution_by_type: {},
            total: {
              positions: [],
            },
          },
        },
      } as any);

      await walletService.getBalances(mockUserId, false);

      // Should check if wallet exists
      expect(addressManager.getAddresses).toHaveBeenCalledWith(mockUserId);
    });

    it('should fetch from API when cache miss', async () => {
      balanceCacheRepository.getCachedBalances.mockResolvedValue(null);
      addressManager.getAddresses.mockResolvedValue(mockAddresses);

      const mockPortfolio = {
        data: {
          attributes: {
            positions_distribution_by_type: {},
            total: {
              positions: [],
            },
          },
        },
      };

      zerionService.getPortfolio.mockResolvedValue(mockPortfolio as any);

      await walletService.getBalances(mockUserId, false);

      // Should call Zerion API
      expect(zerionService.getPortfolio).toHaveBeenCalled();
      // Should save to cache
      expect(balanceCacheRepository.updateCachedBalances).toHaveBeenCalled();
    });

    it('should force refresh when forceRefresh is true', async () => {
      const cachedBalances = {
        ethereum: {
          balance: '1000000000000000000',
          lastUpdated: Date.now(),
        },
      };

      balanceCacheRepository.getCachedBalances.mockResolvedValue(
        cachedBalances,
      );
      addressManager.getAddresses.mockResolvedValue(mockAddresses);

      const mockPortfolio = {
        data: {
          attributes: {
            positions_distribution_by_type: {},
            total: {
              positions: [],
            },
          },
        },
      };

      zerionService.getPortfolio.mockResolvedValue(mockPortfolio as any);

      await walletService.getBalances(mockUserId, true);

      // Should still call API even with cache
      expect(zerionService.getPortfolio).toHaveBeenCalled();
      // Should update cache
      expect(balanceCacheRepository.updateCachedBalances).toHaveBeenCalled();
    });
  });

  describe('refreshBalances()', () => {
    it('should fetch from API and update cache', async () => {
      addressManager.getAddresses.mockResolvedValue(mockAddresses);

      const mockPortfolio = {
        data: {
          attributes: {
            positions_distribution_by_type: {},
            total: {
              positions: [],
            },
          },
        },
      };

      zerionService.getPortfolio.mockResolvedValue(mockPortfolio as any);

      const result = await walletService.refreshBalances(mockUserId);

      // Should get addresses
      expect(addressManager.getAddresses).toHaveBeenCalledWith(mockUserId);
      // Should call Zerion API
      expect(zerionService.getPortfolio).toHaveBeenCalled();
      // Should update cache
      expect(balanceCacheRepository.updateCachedBalances).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Cache operations', () => {
    it('should properly store and retrieve cache', async () => {
      const cachedBalances = {
        ethereum: {
          balance: '1000000000000000000',
          lastUpdated: Date.now(),
        },
      };

      balanceCacheRepository.getCachedBalances.mockResolvedValue(
        cachedBalances,
      );

      const result = await walletService.getBalances(mockUserId, false);

      expect(balanceCacheRepository.getCachedBalances).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(result).toBeDefined();
    });
  });

  describe('getDbTokenBalances', () => {
    let userAssetsRepository: jest.Mocked<any>;
    let zerionSyncService: jest.Mocked<any>;

    beforeEach(() => {
      // Mock dependencies for getDbTokenBalances
      userAssetsRepository = {
        getAssetsForUser: jest.fn(),
        isDataStale: jest.fn(),
      };

      zerionSyncService = {
        syncAssetsForUser: jest.fn(),
      };

      // Inject mocks into walletService
      walletService['userAssetsRepository'] = userAssetsRepository;
      walletService['zerionSyncService'] = zerionSyncService;
    });

    it('should return cached assets without refresh if data is fresh', async () => {
      const mockAssets = [
        {
          chain: 'ethereum',
          address: '0x123',
          symbol: 'USDC',
          balance: '1000000000',
          decimals: 6,
        },
        {
          chain: 'ethereum',
          address: null,
          symbol: 'ETH',
          balance: '1500000000000000000',
          decimals: 18,
        },
      ];

      userAssetsRepository.getAssetsForUser.mockResolvedValue(mockAssets);
      userAssetsRepository.isDataStale.mockResolvedValue(false);

      const result = await walletService.getDbTokenBalances(mockUserId, false);

      expect(userAssetsRepository.getAssetsForUser).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(userAssetsRepository.isDataStale).toHaveBeenCalledWith(mockUserId);
      expect(zerionSyncService.syncAssetsForUser).not.toHaveBeenCalled();
      expect(result).toEqual(mockAssets);
    });

    it('should trigger async refresh if data is stale and refreshIfStale=true', async () => {
      const mockAssets = [
        {
          chain: 'ethereum',
          address: null,
          symbol: 'ETH',
          balance: '1000000000000000000',
          decimals: 18,
        },
      ];

      userAssetsRepository.getAssetsForUser.mockResolvedValue(mockAssets);
      userAssetsRepository.isDataStale.mockResolvedValue(true);
      zerionSyncService.syncAssetsForUser.mockResolvedValue(undefined);

      const result = await walletService.getDbTokenBalances(mockUserId, true);

      // Should return cached data immediately
      expect(result).toEqual(mockAssets);

      // Sync should be triggered but not awaited
      expect(userAssetsRepository.getAssetsForUser).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(userAssetsRepository.isDataStale).toHaveBeenCalledWith(mockUserId);

      // Allow async operations to settle
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(zerionSyncService.syncAssetsForUser).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it('should perform blocking sync if data is stale and no cached assets exist', async () => {
      userAssetsRepository.getAssetsForUser.mockResolvedValue([]);
      userAssetsRepository.isDataStale.mockResolvedValue(true);
      zerionSyncService.syncAssetsForUser.mockResolvedValue(undefined);

      const refreshedAssets = [
        {
          chain: 'ethereum',
          address: null,
          symbol: 'ETH',
          balance: '2000000000000000000',
          decimals: 18,
        },
      ];

      // Mock second call after sync
      userAssetsRepository.getAssetsForUser.mockResolvedValueOnce([]);
      userAssetsRepository.getAssetsForUser.mockResolvedValueOnce(
        refreshedAssets,
      );

      const result = await walletService.getDbTokenBalances(mockUserId, false);

      expect(zerionSyncService.syncAssetsForUser).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(result).toEqual(refreshedAssets);
    });

    it('should handle empty asset list gracefully', async () => {
      userAssetsRepository.getAssetsForUser.mockResolvedValue([]);
      userAssetsRepository.isDataStale.mockResolvedValue(false);

      const result = await walletService.getDbTokenBalances(mockUserId, false);

      expect(result).toEqual([]);
    });
  });
});
