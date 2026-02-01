/**
 * FUND CHANNEL USE CASE
 *
 * Application Layer - Business Operation
 *
 * Creates or resizes a 2-party payment channel.
 * Moves funds from unified balance into the channel.
 *
 * Business Flow:
 * 1. Get user's wallet address
 * 2. Authenticate with Yellow Network
 * 3. Check if channel exists
 * 4. If not, create channel
 * 5. Resize channel to add funds
 * 6. Return channel info
 *
 * Prerequisites: User must have funds in unified balance (use DepositToCustody first)
 */

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IWalletProviderPort } from '../../../app-session/ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../../app-session/ports/wallet-provider.port.js';
import type { IYellowNetworkPort } from '../../../app-session/ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../../app-session/ports/yellow-network.port.js';
import type { IChannelManagerPort } from '../../ports/channel-manager.port.js';
import { CHANNEL_MANAGER_PORT } from '../../ports/channel-manager.port.js';
import { FundChannelDto, FundChannelResultDto } from './fund-channel.dto.js';

@Injectable()
export class FundChannelUseCase {
  constructor(
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(CHANNEL_MANAGER_PORT)
    private readonly channelManager: IChannelManagerPort,
  ) {}

  async execute(dto: FundChannelDto): Promise<FundChannelResultDto> {
    // 1. Get user's wallet address
    const userAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain
    );

    // 2. Authenticate with Yellow Network
    await this.yellowNetwork.authenticate(dto.userId, userAddress);

    // 3. Convert amount to smallest units
    const decimals = 6;
    const amountInSmallestUnits = BigInt(
      Math.floor(parseFloat(dto.amount) * Math.pow(10, decimals))
    );

    // 4. Get chain ID and token address
    const chainIdMap: Record<string, number> = {
      ethereum: 1,
      base: 8453,
      arbitrum: 42161,
      avalanche: 43114,
    };
    const chainId = chainIdMap[dto.chain.toLowerCase()];
    if (!chainId) {
      throw new BadRequestException(`Unsupported chain: ${dto.chain}`);
    }

    const tokenAddressMap: Record<string, Record<string, string>> = {
      base: {
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      },
      arbitrum: {
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      },
      ethereum: {
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      },
      avalanche: {
        usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        usdt: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      },
    };

    const tokenAddress = tokenAddressMap[dto.chain.toLowerCase()]?.[dto.asset.toLowerCase()];
    if (!tokenAddress) {
      throw new BadRequestException(
        `Token ${dto.asset} not supported on chain ${dto.chain}`
      );
    }

    // 5. Check if channel exists
    const existingChannels = await this.channelManager.getChannels(userAddress);
    let channelId: string;

    if (existingChannels.length === 0) {
      // 6. Create new channel if doesn't exist
      const newChannel = await this.channelManager.createChannel({
        userAddress,
        chainId,
        tokenAddress,
        initialBalance: BigInt(0), // Create with 0 balance
      });
      channelId = newChannel.channelId;
    } else {
      // Use first existing channel
      const firstChannel = existingChannels[0];
      if (!firstChannel) {
        throw new BadRequestException('No channels found');
      }
      channelId = firstChannel.channelId;
    }

    // 7. Resize channel to add funds
    await this.channelManager.resizeChannel({
      channelId,
      chainId,
      amount: amountInSmallestUnits,
      userAddress,
      tokenAddress,
      participants: [userAddress, userAddress], // User and clearnode
    });

    // 8. Return result
    return {
      success: true,
      channelId,
      chainId,
      amount: amountInSmallestUnits.toString(),
      message: `Successfully funded channel with ${dto.amount} ${dto.asset}`,
    };
  }
}
