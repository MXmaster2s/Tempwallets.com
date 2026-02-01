/**
 * WALLET PROVIDER ADAPTER
 *
 * Infrastructure Layer - Implements Wallet Provider Port
 *
 * This adapter implements the IWalletProviderPort interface defined in the
 * application layer. It wraps the existing WalletService.
 *
 * Simplified from current implementation:
 * - No EOA vs ERC-4337 distinction (Yellow Network doesn't care)
 * - Just returns wallet addresses
 * - Delegates to existing WalletService for actual implementation
 */

import { Injectable } from '@nestjs/common';
import { mnemonicToAccount, HDKey } from 'viem/accounts';
import { bytesToHex } from 'viem';
import type { IWalletProviderPort } from '../../application/app-session/ports/wallet-provider.port.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { SeedRepository } from '../../wallet/seed.repository.js';

@Injectable()
export class WalletProviderAdapter implements IWalletProviderPort {
  constructor(
    private walletService: WalletService,
    private seedRepository: SeedRepository,
  ) {}

  /**
   * Get wallet address for user and chain
   * Auto-creates wallet if it doesn't exist
   */
  async getWalletAddress(userId: string, chain: string): Promise<string> {
    // Normalize chain name (remove Erc4337 suffix if present)
    const baseChain = chain.toLowerCase().replace(/erc4337$/i, '');

    // Get all addresses (auto-creates wallet if needed)
    const allAddresses = await this.walletService.getAddresses(userId);

    // Try base chain first (e.g., 'base')
    let walletAddress = allAddresses[baseChain as keyof typeof allAddresses];

    // If not found, try ERC-4337 variant (e.g., 'baseErc4337')
    if (!walletAddress) {
      const erc4337Chain = `${baseChain}Erc4337`;
      walletAddress = allAddresses[erc4337Chain as keyof typeof allAddresses];
    }

    if (!walletAddress) {
      throw new Error(
        `No wallet address found for chain "${chain}". ` +
        `Available chains: ${Object.keys(allAddresses).filter(k => allAddresses[k as keyof typeof allAddresses]).join(', ')}`
      );
    }

    return walletAddress;
  }

  /**
   * Get private key for user's wallet on a specific chain
   * Derives private key from user's seed phrase using BIP-44 path
   */
  async getPrivateKey(userId: string, _chain: string): Promise<string> {
    // Get seed phrase from repository
    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

    // Derive account from mnemonic and get HD key
    const account = mnemonicToAccount(seedPhrase);
    const hdKey = account.getHdKey();

    // Get the private key from HD key
    if (!hdKey.privateKey) {
      throw new Error('Failed to derive private key from seed phrase');
    }

    // Return private key as hex string with 0x prefix
    return bytesToHex(hdKey.privateKey);
  }

  /**
   * Get all wallet addresses for a user
   */
  async getAllWalletAddresses(userId: string): Promise<Record<string, string>> {
    const allAddresses = await this.walletService.getAddresses(userId);

    // Convert to plain object, filtering out null values
    const result: Record<string, string> = {};
    for (const [chain, address] of Object.entries(allAddresses)) {
      if (address) {
        result[chain] = address;
      }
    }

    return result;
  }
}
