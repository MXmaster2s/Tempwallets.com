import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service.js';
import { UserAssetsRepository } from './user-assets.repository.js';

describe('UserAssetsRepository', () => {
  let repository: UserAssetsRepository;
  let prismaService: PrismaService;

  // Mock Prisma service
  const mockPrisma = {
    userAsset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAssetsRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<UserAssetsRepository>(UserAssetsRepository);
    prismaService = module.get<PrismaService>(PrismaService);

    // Clear mocks before each test
    jest.clearAllMocks();
  });

  describe('getAssetsForUser', () => {
    it('should return all assets for a user', async () => {
      const userId = 'test-user-123';
      const mockAssets = [
        {
          id: 'asset-1',
          userId,
          chain: 'ethereum',
          address: '0x123',
          symbol: 'USDC',
          balance: '1000000000',
          decimals: 6,
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'asset-2',
          userId,
          chain: 'ethereum',
          address: null,
          symbol: 'ETH',
          balance: '1500000000000000000',
          decimals: 18,
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.userAsset.findMany.mockResolvedValue(mockAssets);

      const result = await repository.getAssetsForUser(userId);

      expect(mockPrisma.userAsset.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual(mockAssets);
      expect(result).toHaveLength(2);
    });

    it('should return empty array if user has no assets', async () => {
      const userId = 'empty-user';
      mockPrisma.userAsset.findMany.mockResolvedValue([]);

      const result = await repository.getAssetsForUser(userId);

      expect(result).toEqual([]);
    });
  });

  describe('upsertAsset', () => {
    it('should create or update an asset', async () => {
      const userId = 'test-user';
      const chain = 'ethereum';
      const address = '0xdac17f958d2ee523a2206206994597c13d831ec7';
      const symbol = 'USDT';
      const balance = '5000000000';
      const decimals = 6;

      const mockUpsertResult = {
        id: 'asset-1',
        userId,
        chain,
        address,
        symbol,
        balance,
        decimals,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userAsset.upsert.mockResolvedValue(mockUpsertResult);

      const result = await repository.upsertAsset(
        userId,
        chain,
        address,
        symbol,
        balance,
        decimals,
      );

      expect(mockPrisma.userAsset.upsert).toHaveBeenCalledWith({
        where: {
          userId_chain_address_symbol: {
            userId,
            chain,
            address: address || '',
            symbol,
          },
        },
        update: {
          balance,
          decimals,
          lastSyncedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
        create: {
          userId,
          chain,
          address,
          symbol,
          balance,
          decimals,
          lastSyncedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockUpsertResult);
    });

    it('should handle native token (null address)', async () => {
      const mockResult = {
        id: 'native-asset',
        userId: 'user-1',
        chain: 'ethereum',
        address: null,
        symbol: 'ETH',
        balance: '1000000000000000000',
        decimals: 18,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userAsset.upsert.mockResolvedValue(mockResult);

      const result = await repository.upsertAsset(
        'user-1',
        'ethereum',
        null,
        'ETH',
        '1000000000000000000',
        18,
      );

      expect(result.address).toBeNull();
      expect(result.symbol).toBe('ETH');
    });
  });

  describe('isDataStale', () => {
    it('should return true if data is older than 60 minutes', async () => {
      const userId = 'stale-user';
      const oldDate = new Date(Date.now() - 70 * 60 * 1000); // 70 minutes ago

      mockPrisma.userAsset.findFirst.mockResolvedValue({
        lastSyncedAt: oldDate,
      });

      const result = await repository.isDataStale(userId);

      expect(result).toBe(true);
    });

    it('should return false if data is fresher than 60 minutes', async () => {
      const userId = 'fresh-user';
      const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      mockPrisma.userAsset.findFirst.mockResolvedValue({
        lastSyncedAt: recentDate,
      });

      const result = await repository.isDataStale(userId);

      expect(result).toBe(false);
    });

    it('should return true if no data exists', async () => {
      const userId = 'no-data-user';
      mockPrisma.userAsset.findFirst.mockResolvedValue(null);

      const result = await repository.isDataStale(userId);

      expect(result).toBe(true);
    });
  });

  describe('clearUserAssets', () => {
    it('should delete all assets for a user', async () => {
      const userId = 'user-to-clear';

      mockPrisma.userAsset.deleteMany.mockResolvedValue({ count: 5 });

      const result = await repository.clearUserAssets(userId);

      expect(mockPrisma.userAsset.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toEqual({ count: 5 });
    });
  });
});
