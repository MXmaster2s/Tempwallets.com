import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337';
import type { ChainConfig } from '../chains/types.js';

export interface WalletInstance {
  wallet: WalletManagerEvmErc4337;
  address: string;
  chainId: string;
}

export interface WalletConfig {
  chainId: number;
  provider: string;
  bundlerUrl: string;
  paymasterUrl: string;
  paymasterAddress: string;
  entryPointAddress: string;
  safeModulesVersion: string;
  paymasterToken: { address: string };
}

export class WalletFactory {
  /**
   * Create a wallet instance for a specific chain using mnemonic
   * @param mnemonic - Decrypted mnemonic from secret manager
   * @param chainConfig - Chain-specific configuration
   * @returns Wallet instance with address
   */
  async createWallet(mnemonic: string, chainConfig: ChainConfig): Promise<WalletInstance> {
    try {
      const config: WalletConfig = {
        chainId: parseInt(chainConfig.chainId),
        provider: chainConfig.rpcUrl || chainConfig.bundlerUrl,
        bundlerUrl: chainConfig.bundlerUrl,
        paymasterUrl: chainConfig.paymasterUrl,
        paymasterAddress: chainConfig.paymasterAddress,
        entryPointAddress: chainConfig.entryPointAddress,
        safeModulesVersion: '1.0.0',
        paymasterToken: { address: '0x0000000000000000000000000000000000000000' },
      };

      const wallet = new WalletManagerEvmErc4337(mnemonic, config);

      // Get the wallet account and address
      const account = await wallet.getAccount(0);
      const address = await account.getAddress();

      return {
        wallet,
        address,
        chainId: chainConfig.chainId,
      };
    } catch (error) {
      throw new Error(`Failed to create wallet for chain ${chainConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

