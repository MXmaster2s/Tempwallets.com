import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ZerionSyncService } from './zerion-sync.service.js';
import { ZerionService } from '../zerion.service.js';
import { UserAssetsRepository } from '../repositories/user-assets.repository.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('ZerionSyncService', () => {
  let service: ZerionSyncService;
  let zerionService: ZerionService;
  let userAssetsRepository: UserAssetsRepository;
  let prismaService: PrismaService;

  const mockZerionService = {
    getPositionsAnyChain: jest.fn(),
  };

  const mockUserAssetsRepository = {
    upsertAsset: jest.fn(),
    clearUserAssets: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
    },
    wallet: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZerionSyncService,
        {
          provide: ZerionService,
          useValue: mockZerionService,
        },
        {
          provide: UserAssetsRepository,
          useValue: mockUserAssetsRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ZerionSyncService>(ZerionSyncService);
    zerionService = module.get<ZerionService>(ZerionService);
    userAssetsRepository = module.get<UserAssetsRepository>(
      UserAssetsRepository,
    );
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('syncAssetsForUser', () => {
    it('should sync assets from Zerion to DB for a user', async () => {
      const userId = 'test-user';
      const mockWallet = { id: 'wallet-1', userId };
      const mockAddresses = ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'];

      const mockPositions = [
        {
          chain: 'ethereum',
          address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
          symbol: 'USDT',
          balanceSmallest: '5000000000',
          decimals: 6,
        },
        {
          chain: 'ethereum',
          address: null,
          symbol: 'ETH',
          balanceSmallest: '1000000000000000000',
          decimals: 18,
        },
      ];

      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
      jest.spyOn(service as any, 'getAddressesForUser').mockReturnValue(mockAddresses);
      mockZerionService.getPositionsAnyChain.mockResolvedValue(mockPositions);
      mockUserAssetsRepository.clearUserAssets.mockResolvedValue({ count: 0 });
      mockUserAssetsRepository.upsertAsset.mockResolvedValue({ id: 'asset-1' });

      await service.syncAssetsForUser(userId);

      expect(mockPrismaService.wallet.findFirst).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockUserAssetsRepository.clearUserAssets).toHaveBeenCalledWith(
        userId,
      );
      expect(mockUserAssetsRepository.upsertAsset).toHaveBeenCalledTimes(2);
      expect(mockUserAssetsRepository.upsertAsset).toHaveBeenNthCalledWith(
        1,
        userId,
        'ethereum',
        '0xdac17f958d2ee523a2206206994597c13d831ec7',
        'USDT',
        '5000000000',
        6,
      );
      expect(mockUserAssetsRepository.upsertAsset).toHaveBeenNthCalledWith(
        2,
        userId,
        'ethereum',
        null,
        'ETH',
        '1000000000000000000',
        18,
      );
    });

    it('should handle missing wallet gracefully', async () => {
      const userId = 'no-wallet-user';

      mockPrismaService.wallet.findFirst.mockResolvedValue(null);

      await service.syncAssetsForUser(userId);

      expect(mockUserAssetsRepository.clearUserAssets).not.toHaveBeenCalled();
      expect(mockUserAssetsRepository.upsertAsset).not.toHaveBeenCalled();
    });

    it('should use default decimals (18) when decimals is null', async () => {
      const userId = 'test-user';
      const mockWallet = { id: 'wallet-1' };
      const mockAddresses = ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'];

      const mockPositions = [
        {
          chain: 'ethereum',
          address: '0x123',
          symbol: 'UNKNOWN',
          balanceSmallest: '1000',
          decimals: null, // Null decimals
        },
      ];

      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
      jest.spyOn(service as any, 'getAddressesForUser').mockReturnValue(mockAddresses);
      mockZerionService.getPositionsAnyChain.mockResolvedValue(mockPositions);
      mockUserAssetsRepository.clearUserAssets.mockResolvedValue({ count: 0 });
      mockUserAssetsRepository.upsertAsset.mockResolvedValue({ id: 'asset-1' });

      await service.syncAssetsForUser(userId);

      // Should use 18 as default
      expect(mockUserAssetsRepository.upsertAsset).toHaveBeenCalledWith(
        userId,
        'ethereum',
        '0x123',
        'UNKNOWN',
        '1000',
        18, // Fallback to 18
      );
    });

    it('should handle Zerion API errors gracefully', async () => {
      const userId = 'error-user';
      const mockWallet = { id: 'wallet-1' };

      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
      mockZerionService.getPositionsAnyChain.mockRejectedValue(
        new Error('Zerion API error'),
      );
      mockUserAssetsRepository.clearUserAssets.mockResolvedValue({ count: 0 });

      // Should not throw, but log error
      await expect(
        service.syncAssetsForUser(userId),
      ).resolves.not.toThrow();

      expect(mockUserAssetsRepository.upsertAsset).not.toHaveBeenCalled();
    });
  });

  describe('syncAllUsersAssets', () => {
    it('should sync assets for all users', async () => {
      const mockUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

      // Mock each sync to resolve
      jest.spyOn(service, 'syncAssetsForUser').mockResolvedValue(undefined);

      await service.syncAllUsersAssets();

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        select: { id: true },
      });
      expect(service.syncAssetsForUser).toHaveBeenCalledTimes(3);
      expect(service.syncAssetsForUser).toHaveBeenNthCalledWith(1, 'user-1');
      expect(service.syncAssetsForUser).toHaveBeenNthCalledWith(2, 'user-2');
      expect(service.syncAssetsForUser).toHaveBeenNthCalledWith(3, 'user-3');
    });

    it('should handle errors during bulk sync', async () => {
      mockPrismaService.user.findMany.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.syncAllUsersAssets(),
      ).resolves.not.toThrow();
    });
  });
});
