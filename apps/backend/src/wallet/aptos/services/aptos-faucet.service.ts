import { Injectable, Logger } from '@nestjs/common';
import { AccountAddress, Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { getNetworkConfig } from '../config/aptos-chain.config.js';
import { normalizeAddress } from '../utils/address.utils.js';

@Injectable()
export class AptosFaucetService {
  private readonly logger = new Logger(AptosFaucetService.name);

  /**
   * Fund account from faucet (testnet/devnet only)
   * 
   * NOTE: Testnet faucet requires manual interaction via https://aptos.dev/network/faucet
   * Only devnet supports programmatic funding via SDK.
   */
  async fundAccount(
    address: string,
    network: 'testnet' | 'devnet',
    amount?: number, // Amount in APT (default: 100)
  ): Promise<{ success: boolean; message: string; hash?: string }> {

    // Testnet faucet doesn't support programmatic funding via SDK
    if (network === 'testnet') {
      const normalizedAddress = normalizeAddress(address);
      const faucetUrl = 'https://aptos.dev/network/faucet';
      this.logger.warn(
        `Testnet faucet requires manual interaction. Visit: ${faucetUrl}`,
      );
      return {
        success: false,
        message: `Testnet faucet requires manual interaction. Please visit ${faucetUrl} and fund address: ${normalizedAddress}`,
      };
    }

    try {
      const normalizedAddress = normalizeAddress(address);
      const faucetAmount = amount || 100; // Default 100 APT

      this.logger.log(
        `Requesting ${faucetAmount} APT from faucet for ${normalizedAddress} on ${network}`,
      );

      // Use Aptos SDK's built-in faucet helper (devnet only)
      const aptosConfig = new AptosConfig({ network: Network.DEVNET });
      const client = new Aptos(aptosConfig);

      const accountAddress = AccountAddress.fromString(normalizedAddress);
      const amountInOctas = Math.floor(faucetAmount * 1e8); // Convert APT to octas

      // Use SDK's fundAccount method (works on devnet only)
      const result = await client.fundAccount({
        accountAddress,
        amount: amountInOctas,
      });

      // The SDK returns an array of transaction hashes
      const hash = Array.isArray(result) && result.length > 0 ? result[0] : undefined;

      this.logger.log(
        `Successfully funded account ${normalizedAddress} with ${faucetAmount} APT. Hash: ${hash}`,
      );

      return {
        success: true,
        message: `Successfully funded account with ${faucetAmount} APT`,
        hash,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fund account: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to fund account: ${errorMessage}`,
      };
    }
  }

  /**
   * Check if faucet is available for network
   */
  isFaucetAvailable(network: 'mainnet' | 'testnet' | 'devnet'): boolean {
    if (network === 'mainnet') {
      return false;
    }
    const config = getNetworkConfig(network);
    return !!config.faucetUrl;
  }
}

