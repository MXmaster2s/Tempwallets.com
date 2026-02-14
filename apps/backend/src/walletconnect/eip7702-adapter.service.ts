import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Eip7702AccountFactory } from '../wallet/factories/eip7702-account.factory.js';
import { SeedManager } from '../wallet/managers/seed.manager.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class Eip7702AdapterService {
  private readonly logger = new Logger(Eip7702AdapterService.name);

  // Map CAIP-2 chain IDs to internal chain names
  private readonly CHAIN_ID_TO_NAME: Record<number, string> = {
    1: 'ethereum',
    8453: 'base',
    42161: 'arbitrum',
    10: 'optimism',
    137: 'polygon',
    43114: 'avalanche',
    56: 'bnb',
    11155111: 'sepolia',
  };

  constructor(
    private readonly eip7702Factory: Eip7702AccountFactory,
    private readonly seedManager: SeedManager,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sign a transaction using EIP-7702 smart account
   */
  async signTransaction(
    userId: string,
    chainId: number,
    address: string,
    transaction: any,
  ): Promise<string> {
    // Signing transaction

    // Validate chain is supported
    const chainName = this.CHAIN_ID_TO_NAME[chainId];
    if (!chainName) {
      throw new BadRequestException(`Unsupported chain ID: ${chainId}`);
    }

    // Verify user owns this address on this chain
    const delegation = await this.prisma.eip7702Delegation.findFirst({
      where: {
        walletId: userId,
        chainId,
        address: address.toLowerCase(),
      },
    });

    if (!delegation) {
      throw new BadRequestException(
        `User ${userId} does not own address ${address} on chain ${chainId}`,
      );
    }

    // Get seed phrase
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      // Create EIP-7702 smart account
      const account = await this.eip7702Factory.createAccount(
        seedPhrase,
        chainName as any,
        0, // accountIndex
        userId,
      );

      // Verify address matches
      const accountAddress = await account.getAddress();
      if (accountAddress.toLowerCase() !== address.toLowerCase()) {
        throw new BadRequestException(
          `Address mismatch: expected ${address}, got ${accountAddress}`,
        );
      }

      // Sign the transaction
      // This will automatically use sponsored gas via Pimlico if it's the first transaction
      const txHash = await account.send(
        transaction.to,
        transaction.value || '0',
      );

      // Transaction signed successfully
      return txHash;
    } finally {
      // Clear seed from memory (best effort)
      // Note: JavaScript doesn't guarantee memory clearing, but we try
      if (typeof (seedPhrase as any) === 'string') {
        // Overwrite reference (best practice)
        (seedPhrase as any) = '';
      }
    }
  }

  /**
   * Sign a message using EIP-7702 account's EOA
   */
  async signMessage(
    userId: string,
    chainId: number,
    address: string,
    message: string,
  ): Promise<string> {
    // Signing message

    // For personal_sign, we use the EOA (not the smart account)
    // because message signing is done by the owner, not the delegated contract

    // Verify user owns this address
    const delegation = await this.prisma.eip7702Delegation.findFirst({
      where: {
        walletId: userId,
        chainId,
        address: address.toLowerCase(),
      },
    });

    if (!delegation) {
      throw new BadRequestException(
        `User ${userId} does not own address ${address} on chain ${chainId}`,
      );
    }

    // Get seed and derive EOA
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      const { mnemonicToAccount } = await import('viem/accounts');
      const account = mnemonicToAccount(seedPhrase, { addressIndex: 0 });

      // Sign the message
      const signature = await account.signMessage({
        message: message as any,
      });

      // Message signed successfully
      return signature;
    } finally {
      // Clear seed from memory (best effort)
      if (typeof (seedPhrase as any) === 'string') {
        (seedPhrase as any) = '';
      }
    }
  }

  /**
   * Sign typed data (EIP-712) using EIP-7702 account's EOA
   */
  async signTypedData(
    userId: string,
    chainId: number,
    address: string,
    typedData: any,
  ): Promise<string> {
    // Signing typed data

    // Verify user owns this address
    const delegation = await this.prisma.eip7702Delegation.findFirst({
      where: {
        walletId: userId,
        chainId,
        address: address.toLowerCase(),
      },
    });

    if (!delegation) {
      throw new BadRequestException(
        `User ${userId} does not own address ${address} on chain ${chainId}`,
      );
    }

    // Get seed and derive EOA
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      const { mnemonicToAccount } = await import('viem/accounts');
      const account = mnemonicToAccount(seedPhrase, { addressIndex: 0 });

      // Sign the typed data
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      // Typed data signed successfully
      return signature;
    } finally {
      // Clear seed from memory (best effort)
      if (typeof (seedPhrase as any) === 'string') {
        (seedPhrase as any) = '';
      }
    }
  }
}
