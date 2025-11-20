import { Test, TestingModule } from '@nestjs/testing';
import { AddressManager } from './address.manager.js';
import { SeedManager } from './seed.manager.js';
import { AccountFactory } from '../factories/account.factory.js';
import { PimlicoAccountFactory } from '../factories/pimlico-account.factory.js';
import { SubstrateManager } from '../substrate/managers/substrate.manager.js';
import { AddressCacheRepository } from '../repositories/address-cache.repository.js';
import { WalletAddresses } from '../interfaces/wallet.interfaces.js';

describe('AddressManager', () => {
  let addressManager: AddressManager;
  let seedManager: jest.Mocked<SeedManager>;
  let accountFactory: jest.Mocked<AccountFactory>;
  let pimlicoAccountFactory: jest.Mocked<PimlicoAccountFactory>;
  let substrateManager: jest.Mocked<SubstrateManager>;
  let addressCacheRepository: jest.Mocked<AddressCacheRepository>;

  const mockUserId = 'test-fingerprint-123';
  const mockSeedPhrase = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';

  beforeEach(async () => {
    // Create mocks
    const mockSeedManager = {
      hasSeed: jest.fn(),
      createOrImportSeed: jest.fn(),
      getSeed: jest.fn(),
    };

    const mockAccountFactory = {
      createAccount: jest.fn(),
    };

    const mockPimlicoAccountFactory = {
      createAccount: jest.fn(),
    };

    const mockSubstrateManager = {
      getAddress: jest.fn(),
      getAddresses: jest.fn().mockResolvedValue({}),
    };

    const mockAddressCacheRepository = {
      getCachedAddresses: jest.fn(),
      getCachedAddress: jest.fn(),
      saveAddress: jest.fn(),
      saveAddresses: jest.fn(),
      hasAddresses: jest.fn(),
      clearAddresses: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressManager,
        {
          provide: SeedManager,
          useValue: mockSeedManager,
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
          provide: SubstrateManager,
          useValue: mockSubstrateManager,
        },
        {
          provide: AddressCacheRepository,
          useValue: mockAddressCacheRepository,
        },
      ],
    }).compile();

    addressManager = module.get<AddressManager>(AddressManager);
    seedManager = module.get(SeedManager);
    accountFactory = module.get(AccountFactory);
    pimlicoAccountFactory = module.get(PimlicoAccountFactory);
    substrateManager = module.get(SubstrateManager);
    addressCacheRepository = module.get(AddressCacheRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAddresses()', () => {
    it('should return cached addresses from DB when available', async () => {
      // Mock: All addresses are cached (need all expected chains)
      const cachedAddresses = {
        // EOA chains
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        base: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalanche: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        moonbeamTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        astarShibuya: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        paseoPassetHub: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        hydration: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        unique: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrost: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrostTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        // Non-EVM chains
        tron: 'TXYZabcdefghijklmnopqrstuvwxyz123456',
        bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        // ERC-4337 chains
        ethereumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        baseErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygonErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalancheErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        // Substrate chains
        polkadot: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        hydrationSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        bifrostSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        uniqueSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseo: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseoAssethub: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      };

      addressCacheRepository.getCachedAddresses.mockResolvedValue(cachedAddresses);

      const result = await addressManager.getAddresses(mockUserId);

      // Should return cached addresses without generating new ones
      expect(addressCacheRepository.getCachedAddresses).toHaveBeenCalledWith(mockUserId);
      // Note: hasSeed might be called to check, but createAccount should not be called
      expect(accountFactory.createAccount).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should generate and save addresses when cache miss', async () => {
      // Mock: No cached addresses
      addressCacheRepository.getCachedAddresses.mockResolvedValue({});
      seedManager.hasSeed.mockResolvedValue(true);
      seedManager.getSeed.mockResolvedValue(mockSeedPhrase);

      // Mock account creation
      const mockAccount = {
        getAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
      };
      accountFactory.createAccount.mockResolvedValue(mockAccount as any);

      const result = await addressManager.getAddresses(mockUserId);

      // Should check cache first
      expect(addressCacheRepository.getCachedAddresses).toHaveBeenCalledWith(mockUserId);
      // Should check if seed exists
      expect(seedManager.hasSeed).toHaveBeenCalledWith(mockUserId);
      // Should get seed
      expect(seedManager.getSeed).toHaveBeenCalledWith(mockUserId);
      // Should generate addresses
      expect(accountFactory.createAccount).toHaveBeenCalled();
      // Should save addresses to DB
      expect(addressCacheRepository.saveAddress).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should auto-create wallet if it does not exist', async () => {
      // Mock: No cached addresses, no seed
      addressCacheRepository.getCachedAddresses.mockResolvedValue({});
      seedManager.hasSeed.mockResolvedValue(false);
      seedManager.createOrImportSeed.mockResolvedValue(undefined);
      seedManager.getSeed.mockResolvedValue(mockSeedPhrase);

      const mockAccount = {
        getAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
      };
      accountFactory.createAccount.mockResolvedValue(mockAccount as any);

      await addressManager.getAddresses(mockUserId);

      // Should create seed
      expect(seedManager.hasSeed).toHaveBeenCalledWith(mockUserId);
      expect(seedManager.createOrImportSeed).toHaveBeenCalledWith(mockUserId, 'random');
    });

    it('should return instantly from DB on second call', async () => {
      // Mock: All addresses are cached (need all expected chains)
      const cachedAddresses = {
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        base: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalanche: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        moonbeamTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        astarShibuya: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        paseoPassetHub: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        hydration: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        unique: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrost: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrostTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        tron: 'TXYZabcdefghijklmnopqrstuvwxyz123456',
        bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        ethereumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        baseErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygonErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalancheErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polkadot: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        hydrationSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        bifrostSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        uniqueSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseo: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseoAssethub: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      };

      addressCacheRepository.getCachedAddresses.mockResolvedValue(cachedAddresses);

      // First call
      const result1 = await addressManager.getAddresses(mockUserId);
      // Second call
      const result2 = await addressManager.getAddresses(mockUserId);

      // Should only call cache repository, not generate new addresses
      expect(addressCacheRepository.getCachedAddresses).toHaveBeenCalledTimes(2);
      // Note: hasSeed might be called, but createAccount should not be called
      expect(accountFactory.createAccount).not.toHaveBeenCalled();
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('streamAddresses()', () => {
    it('should stream cached addresses first (instant)', async () => {
      // Mock: All addresses are cached
      const cachedAddresses = {
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        base: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalanche: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        moonbeamTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        astarShibuya: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        paseoPassetHub: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        hydration: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        unique: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrost: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrostTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        tron: 'TXYZabcdefghijklmnopqrstuvwxyz123456',
        bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        ethereumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        baseErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygonErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalancheErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polkadot: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        hydrationSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        bifrostSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        uniqueSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseo: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseoAssethub: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      };

      addressCacheRepository.getCachedAddresses.mockResolvedValue(cachedAddresses);
      seedManager.hasSeed.mockResolvedValue(true);

      const streamed: Array<{ chain: string; address: string | null }> = [];
      for await (const item of addressManager.streamAddresses(mockUserId)) {
        streamed.push(item);
      }

      // Should get cached addresses first
      expect(addressCacheRepository.getCachedAddresses).toHaveBeenCalledWith(mockUserId);
      // Should stream cached addresses
      expect(streamed.length).toBeGreaterThan(0);
      expect(streamed[0]?.chain).toBeDefined();
    });

    it('should save new addresses to DB before streaming', async () => {
      addressCacheRepository.getCachedAddresses.mockResolvedValue({});
      seedManager.hasSeed.mockResolvedValue(true);
      seedManager.getSeed.mockResolvedValue(mockSeedPhrase);
      substrateManager.getAddresses.mockResolvedValue({
        polkadot: null,
        hydration: null,
        bifrost: null,
        unique: null,
        paseo: null,
        paseoAssethub: null,
      });

      const mockAccount = {
        getAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
      };
      accountFactory.createAccount.mockResolvedValue(mockAccount as any);
      pimlicoAccountFactory.createAccount.mockResolvedValue(mockAccount as any);

      const streamed: Array<{ chain: string; address: string | null }> = [];
      for await (const item of addressManager.streamAddresses(mockUserId)) {
        streamed.push(item);
      }

      // Should save to DB before streaming
      expect(addressCacheRepository.saveAddress).toHaveBeenCalled();
      // Should stream addresses
      expect(streamed.length).toBeGreaterThan(0);
    });
  });

  describe('Address persistence', () => {
    it('should persist addresses correctly across requests', async () => {
      // First request: Generate and save
      addressCacheRepository.getCachedAddresses.mockResolvedValue({});
      seedManager.hasSeed.mockResolvedValue(true);
      seedManager.getSeed.mockResolvedValue(mockSeedPhrase);

      const mockAccount = {
        getAddress: jest.fn().mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
      };
      accountFactory.createAccount.mockResolvedValue(mockAccount as any);
      pimlicoAccountFactory.createAccount.mockResolvedValue(mockAccount as any);
      substrateManager.getAddresses.mockResolvedValue({
        polkadot: null,
        hydration: null,
        bifrost: null,
        unique: null,
        paseo: null,
        paseoAssethub: null,
      });

      await addressManager.getAddresses(mockUserId);

      // Verify save was called
      expect(addressCacheRepository.saveAddress).toHaveBeenCalled();

      // Reset mocks for second call
      jest.clearAllMocks();

      // Second request: Should use cached (all chains)
      const allCachedAddresses = {
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        base: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalanche: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        moonbeamTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        astarShibuya: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        paseoPassetHub: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        hydration: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        unique: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrost: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        bifrostTestnet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        tron: 'TXYZabcdefghijklmnopqrstuvwxyz123456',
        bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        solana: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        ethereumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        baseErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        arbitrumErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polygonErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        avalancheErc4337: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        polkadot: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        hydrationSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        bifrostSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        uniqueSubstrate: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseo: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        paseoAssethub: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      };
      addressCacheRepository.getCachedAddresses.mockResolvedValue(allCachedAddresses);

      await addressManager.getAddresses(mockUserId);

      // Should not generate again (createAccount should not be called in second request)
      expect(accountFactory.createAccount).not.toHaveBeenCalled();
    });
  });
});

