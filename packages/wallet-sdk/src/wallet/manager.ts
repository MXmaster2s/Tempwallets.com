import type WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337';
import type { WalletTransaction } from '../types/wallet.js';

export interface TransactionResult {
  hash: string;
  chainId: string;
  fee?: string;
}

export class WalletManager {
  /**
   * Execute a transaction using the wallet account
   * @param wallet - The wallet instance
   * @param tx - The transaction details
   * @param chainId - The chain ID
   * @returns Transaction hash and fee
   */
  async executeTransaction(
    wallet: WalletManagerEvmErc4337,
    tx: WalletTransaction,
    chainId: string
  ): Promise<TransactionResult> {
    try {
      // Get the first account
      const account = await wallet.getAccount(0);
      
      // Convert value to number for transaction
      const valueInWei = Number(tx.value);
      
      // Send the transaction
      const result = await account.sendTransaction({
        to: tx.to,
        value: valueInWei,
        data: tx.data || '0x',
      });

      return {
        hash: result.hash,
        chainId,
        fee: result.fee ? String(result.fee) : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to execute transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Note: The account should be disposed if not reused
      // For now, we'll rely on the service layer to manage lifecycle
    }
  }
}

