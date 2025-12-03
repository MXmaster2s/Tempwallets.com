import { Injectable, Logger } from '@nestjs/common';
import { SubstrateChainKey } from '../config/substrate-chain.config.js';
import { SubstrateRpcService } from '../services/substrate-rpc.service.js';

/**
 * Nonce Manager
 *
 * Issue #4: No Nonce Management for Transactions
 * - Track pending nonces per address/chain
 * - Prevent race conditions with simultaneous transactions
 * - Prevent nonce collision causing transaction failures
 */
@Injectable()
export class NonceManager {
  private readonly logger = new Logger(NonceManager.name);
  private readonly pendingNonces = new Map<string, number>();

  constructor(private readonly rpcService: SubstrateRpcService) {}

  /**
   * Get next available nonce for an address
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Next available nonce
   */
  async getNextNonce(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<number> {
    const key = this.getKey(address, chain, useTestnet);

    // Get on-chain nonce
    const onChainNonce = await this.rpcService.getNonce(
      address,
      chain,
      useTestnet,
    );

    // Get pending nonce (if any)
    const pendingNonce = this.pendingNonces.get(key);

    // Use the maximum of on-chain and pending nonce
    const nextNonce =
      pendingNonce !== undefined
        ? Math.max(onChainNonce, pendingNonce)
        : onChainNonce;

    // Reserve the next nonce
    this.pendingNonces.set(key, nextNonce + 1);

    this.logger.debug(
      `Next nonce for ${address} on ${chain}: ${nextNonce} (on-chain: ${onChainNonce}, pending: ${pendingNonce ?? 'none'})`,
    );

    return nextNonce;
  }

  /**
   * Mark nonce as used (transaction confirmed)
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param nonce - Nonce that was used
   * @param useTestnet - Whether to use testnet
   */
  markNonceUsed(
    address: string,
    chain: SubstrateChainKey,
    nonce: number,
    useTestnet?: boolean,
  ): void {
    const key = this.getKey(address, chain, useTestnet);
    const currentPending = this.pendingNonces.get(key);

    // Update pending nonce to be at least nonce + 1
    if (currentPending === undefined || currentPending <= nonce) {
      this.pendingNonces.set(key, nonce + 1);
      this.logger.debug(
        `Marked nonce ${nonce} as used for ${address} on ${chain}`,
      );
    }
  }

  /**
   * Clear pending nonces for an address
   * Useful when transaction fails and we want to reset
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   */
  clearPending(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): void {
    const key = this.getKey(address, chain, useTestnet);
    this.pendingNonces.delete(key);
    this.logger.debug(`Cleared pending nonces for ${address} on ${chain}`);
  }

  /**
   * Get pending nonce for an address (for debugging)
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Pending nonce or undefined
   */
  getPendingNonce(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): number | undefined {
    const key = this.getKey(address, chain, useTestnet);
    return this.pendingNonces.get(key);
  }

  /**
   * Generate cache key for address/chain combination
   */
  private getKey(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): string {
    const network = useTestnet ? 'testnet' : 'mainnet';
    return `${chain}:${network}:${address.toLowerCase()}`;
  }

  /**
   * Clear all pending nonces (for testing or cleanup)
   */
  clearAll(): void {
    this.pendingNonces.clear();
    this.logger.debug('Cleared all pending nonces');
  }
}
