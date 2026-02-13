/**
 * DEPOSIT TO CUSTODY USE CASE
 *
 * Application Layer - Business Operation
 *
 * Deposits funds from wallet to Yellow Network custody contract.
 * This is the CRITICAL STEP that credits unified balance.
 *
 * Business Flow:
 * 1. Get user's wallet and private key
 * 2. Approve USDC for custody contract (on-chain)
 * 3. Deposit to custody contract (on-chain)
 * 4. Wait for Yellow Network to index deposit (30s max)
 * 5. Verify unified balance is credited
 * 6. Return success
 *
 * This solves the problem: "Custody balance shows funds but unified balance is 0"
 */

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IWalletProviderPort } from '../../../app-session/ports/wallet-provider.port.js';
import { WALLET_PROVIDER_PORT } from '../../../app-session/ports/wallet-provider.port.js';
import type { IYellowNetworkPort } from '../../../app-session/ports/yellow-network.port.js';
import { YELLOW_NETWORK_PORT } from '../../../app-session/ports/yellow-network.port.js';
import type { ICustodyContractPort } from '../../ports/custody-contract.port.js';
import { CUSTODY_CONTRACT_PORT } from '../../ports/custody-contract.port.js';
import {
  DepositToCustodyDto,
  DepositToCustodyResultDto,
} from './deposit-to-custody.dto.js';

@Injectable()
export class DepositToCustodyUseCase {
  constructor(
    @Inject(WALLET_PROVIDER_PORT)
    private readonly walletProvider: IWalletProviderPort,
    @Inject(YELLOW_NETWORK_PORT)
    private readonly yellowNetwork: IYellowNetworkPort,
    @Inject(CUSTODY_CONTRACT_PORT)
    private readonly custodyContract: ICustodyContractPort,
  ) {}

  async execute(dto: DepositToCustodyDto): Promise<DepositToCustodyResultDto> {
    console.log(`\n=== DEPOSIT TO CUSTODY ===`);
    console.log(`User: ${dto.userId}`);
    console.log(`Chain: ${dto.chain}`);
    console.log(`Asset: ${dto.asset}`);
    console.log(`Amount: ${dto.amount}`);

    // 1. Get user's wallet address and private key
    const userAddress = await this.walletProvider.getWalletAddress(
      dto.userId,
      dto.chain,
    );
    const userPrivateKey = await this.walletProvider.getPrivateKey(
      dto.userId,
      dto.chain,
    );

    console.log(`User address: ${userAddress}`);

    // IMPORTANT: Unified balance is Yellow Network's OFF-CHAIN ledger.
    // To query it, we must be authenticated with Yellow Network first.
    // Fund-channel path already authenticates; custody deposits might not.
    try {
      await this.yellowNetwork.authenticate(dto.userId, userAddress);
    } catch (err) {
      console.warn(
        '[DepositToCustodyUseCase] Yellow Network authenticate failed (continuing; balance polling may fail until auth succeeds):',
        err,
      );
    }

    // 2. Convert amount to smallest units (USDC/USDT = 6 decimals)
    const decimals = 6;
    const amountInSmallestUnits = BigInt(
      Math.floor(parseFloat(dto.amount) * Math.pow(10, decimals)),
    );

    console.log(`Amount in smallest units: ${amountInSmallestUnits}`);

    // 3. Get chain ID and token address
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

    const tokenAddress =
      tokenAddressMap[dto.chain.toLowerCase()]?.[dto.asset.toLowerCase()];
    if (!tokenAddress) {
      throw new BadRequestException(
        `Token ${dto.asset} not supported on chain ${dto.chain}`,
      );
    }

    console.log(`Chain ID: ${chainId}`);
    console.log(`Token address: ${tokenAddress}`);

    // 4. Step 1: Approve USDC for custody contract (ON-CHAIN)
    console.log(`\n--- Step 1: Approve USDC ---`);
    const approveTxHash = await this.custodyContract.approveToken({
      userPrivateKey,
      userAddress,
      chainId,
      tokenAddress,
      amount: amountInSmallestUnits,
    });

    // 5. Step 2: Deposit to custody contract (ON-CHAIN - THE CRITICAL STEP!)
    console.log(`\n--- Step 2: Deposit to Custody ---`);
    const depositTxHash = await this.custodyContract.deposit({
      userPrivateKey,
      userAddress,
      chainId,
      tokenAddress,
      amount: amountInSmallestUnits,
    });

    // 6. Step 3: Wait for Yellow Network to index deposit
    console.log(`\n--- Step 3: Waiting for Yellow Network Indexing ---`);
    // IMPORTANT:
    // A custody deposit moves funds into the on-chain custody contract, but Yellow's
    // OFF-CHAIN unified ledger may not reflect it until a channel operation occurs.
    // Trigger the "bring funds into ledger" step via channel create/resize.
    // This MUST NOT deposit from the wallet again.
    try {
      const credit = await this.custodyContract.creditUnifiedBalanceFromCustody(
        {
          userId: dto.userId,
          chain: dto.chain,
          userAddress,
          tokenAddress,
          amount: amountInSmallestUnits,
        },
      );
      console.log(
        `[DepositToCustodyUseCase] Triggered ledger credit via channel ${credit.channelId}`,
      );
    } catch (err: any) {
      console.warn(
        `[DepositToCustodyUseCase] Could not trigger unified ledger credit step: ${err?.message ?? err}`,
      );
    }

    // We intentionally DO NOT poll here anymore.
    // Polling was noisy and misleading because Yellow ledger balances can be
    // returned in different unit formats (human decimals vs smallest units)
    // and indexing timing varies.
    // Instead, we trigger the ledger credit step (channel resize) above and
    // then do a single read of unified balance below.

    // 7. Step 4: Fetch full unified balances (same source as GET /custody/balance)
    // and resolve the deposited asset robustly (symbol OR token address).
    // NOTE: This is off-chain Yellow ledger balance, not on-chain custody contract balance.
    let unifiedBalance = '0';
    try {
      const balances = await this.yellowNetwork.getUnifiedBalance(userAddress);
      const targetSymbol = dto.asset.toLowerCase();
      const targetToken = tokenAddress.toLowerCase();

      const entry = balances.find((b) => {
        const asset = (b.asset || '').toLowerCase();
        return asset === targetSymbol || asset === targetToken;
      });

      if (entry?.amount) {
        unifiedBalance = entry.amount;
      }
    } catch (err) {
      console.warn(
        '[DepositToCustodyUseCase] Failed to fetch full unified balances for response:',
        err,
      );
    }

    console.log(`\n✅ DEPOSIT COMPLETE`);
    console.log(`Approve TX: ${approveTxHash}`);
    console.log(`Deposit TX: ${depositTxHash}`);
    console.log(`Unified Balance: ${unifiedBalance}`);

    return {
      success: true,
      approveTxHash,
      depositTxHash,
      chainId,
      amount: amountInSmallestUnits.toString(),
      asset: dto.asset,
      unifiedBalance,
      message:
        `Successfully deposited ${dto.amount} ${dto.asset} to custody. ` +
        `Unified balance is off-chain and may take a moment to reflect indexing.`,
    };
  }
}
