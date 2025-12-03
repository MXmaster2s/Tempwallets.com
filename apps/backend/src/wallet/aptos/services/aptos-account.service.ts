import { Injectable, Logger } from '@nestjs/common';
import { AccountAddress } from '@aptos-labs/ts-sdk';
import { AptosRpcService } from './aptos-rpc.service.js';
import { normalizeAddress } from '../utils/address.utils.js';

// Define proper return type
interface AptosAccountInfo {
  sequence_number: string;
  authentication_key: string;
}

@Injectable()
export class AptosAccountService {
  private readonly logger = new Logger(AptosAccountService.name);

  constructor(private readonly rpcService: AptosRpcService) {}

  /**
   * Check if account exists on-chain
   */
  async accountExists(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  ): Promise<boolean> {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const normalizedAddress = normalizeAddress(address);
      const accountAddress = AccountAddress.fromString(normalizedAddress);

      await this.rpcService.withRetry(
        network,
        async (client) => {
          return await client.getAccountInfo({ accountAddress });
        },
        'accountExists',
      );

      return true;
    } catch (error) {
      // Better error detection
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('404') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('AccountNotFound') ||
        errorMessage.includes('Account not found')
      ) {
        return false;
      }

      // Add context when re-throwing
      this.logger.error(
        `Failed to check account existence for ${address}: ${errorMessage}`,
      );
      throw new Error(`Failed to check account existence: ${errorMessage}`);
    }
  }

  /**
   * Get APT balance in human-readable format
   */
  async getAptBalance(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  ): Promise<string> {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const normalizedAddress = normalizeAddress(address);
      const accountAddress = AccountAddress.fromString(normalizedAddress);

      const accountInfo = await this.rpcService.withRetry(
        network,
        async (client) => {
          return await client.getAccountAPTAmount({ accountAddress });
        },
        'getAptBalance',
      );

      // Better precision handling
      const balance = Number(accountInfo) / 1e8;
      return balance.toFixed(8); // Return fixed decimal places
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get APT balance for ${address}: ${errorMessage}`,
      );
      throw new Error(`Failed to get APT balance: ${errorMessage}`);
    }
  }

  /**
   * Get account sequence number (nonce)
   */
  async getSequenceNumber(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  ): Promise<number> {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const normalizedAddress = normalizeAddress(address);
      const accountAddress = AccountAddress.fromString(normalizedAddress);

      const accountInfo = await this.rpcService.withRetry(
        network,
        async (client) => {
          return await client.getAccountInfo({ accountAddress });
        },
        'getSequenceNumber',
      );

      return Number(accountInfo.sequence_number);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get sequence number for ${address}: ${errorMessage}`,
      );
      throw new Error(`Failed to get sequence number: ${errorMessage}`);
    }
  }

  /**
   * Get full account information
   */
  async getAccountInfo(
    address: string,
    network: 'mainnet' | 'testnet' | 'devnet' = 'mainnet',
  ): Promise<AptosAccountInfo> {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const normalizedAddress = normalizeAddress(address);
      const accountAddress = AccountAddress.fromString(normalizedAddress);

      return await this.rpcService.withRetry(
        network,
        async (client) => {
          return await client.getAccountInfo({ accountAddress });
        },
        'getAccountInfo',
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get account info for ${address}: ${errorMessage}`,
      );
      throw new Error(`Failed to get account info: ${errorMessage}`);
    }
  }
}
