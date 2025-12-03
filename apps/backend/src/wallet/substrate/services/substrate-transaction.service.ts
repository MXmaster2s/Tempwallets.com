import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ApiPromise } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import {
  SubstrateChainKey,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import { SubstrateRpcService } from './substrate-rpc.service.js';
import { SubstrateAccountFactory } from '../factories/substrate-account.factory.js';
import { SubstrateAddressManager } from '../managers/substrate-address.manager.js';
import { NonceManager } from '../managers/nonce.manager.js';
import { ensureCryptoReady } from '../utils/crypto-init.util.js';
import { buildDerivationPath } from '../utils/derivation.util.js';
import {
  TransferParams,
  TransferMethod,
  TransactionParams,
  FeeEstimate,
  TransactionResult,
  TransactionHistoryEntry,
  TransactionHistory,
  SignedTransaction,
} from '../types/substrate-transaction.types.js';
import { SeedManager } from '../../managers/seed.manager.js';

/**
 * Substrate Transaction Service
 *
 * Issue #2: Missing Transaction Signing Implementation
 * - Transaction construction, signing, and broadcasting
 * - Fee estimation
 * - Transaction history with pagination
 */
@Injectable()
export class SubstrateTransactionService {
  private readonly logger = new Logger(SubstrateTransactionService.name);

  constructor(
    private readonly rpcService: SubstrateRpcService,
    private readonly accountFactory: SubstrateAccountFactory,
    private readonly nonceManager: NonceManager,
    private readonly seedManager: SeedManager,
    private readonly addressManager: SubstrateAddressManager,
  ) {}

  /**
   * Construct a transfer transaction
   *
   * @param params - Transfer parameters
   * @returns Unsigned transaction
   */
  async constructTransfer(params: TransferParams): Promise<any> {
    const api = await this.rpcService.getConnection(
      params.chain,
      params.useTestnet,
    );
    const chainConfig = getChainConfig(params.chain, params.useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Check if balances pallet is available
      if (!api.tx || !api.tx.balances) {
        throw new Error('Balances pallet not available on this chain');
      }

      // Determine which transfer method to use
      // Modern Substrate runtimes use transferAllowDeath or transferKeepAlive instead of transfer
      const transferMethod: TransferMethod =
        params.transferMethod || 'transferAllowDeath';

      // Check if the requested method is available
      const balancesTx = api.tx.balances as any;
      if (!balancesTx[transferMethod]) {
        // Fallback: try transferKeepAlive if transferAllowDeath not available
        if (
          transferMethod === 'transferAllowDeath' &&
          balancesTx.transferKeepAlive
        ) {
          this.logger.warn(
            `transferAllowDeath not available, falling back to transferKeepAlive on ${params.chain}`,
          );
          const fallbackMethod = 'transferKeepAlive';
          const amount = BigInt(params.amount);
          return balancesTx[fallbackMethod](params.to, amount.toString());
        }
        // Fallback: try transferAllowDeath if transferKeepAlive not available
        if (
          transferMethod === 'transferKeepAlive' &&
          balancesTx.transferAllowDeath
        ) {
          this.logger.warn(
            `transferKeepAlive not available, falling back to transferAllowDeath on ${params.chain}`,
          );
          const fallbackMethod = 'transferAllowDeath';
          const amount = BigInt(params.amount);
          return balancesTx[fallbackMethod](params.to, amount.toString());
        }
        throw new Error(
          `Transfer method ${transferMethod} not available on this chain. Available methods: ${Object.keys(
            balancesTx,
          )
            .filter((k) => typeof balancesTx[k] === 'function')
            .join(', ')}`,
        );
      }

      // Convert amount to proper format
      const amount = BigInt(params.amount);

      // Create transfer extrinsic
      // CRITICAL: Always use plain SS58 address string, never wrap in object
      // Use transferAllowDeath (default) or transferKeepAlive instead of deprecated transfer
      const transfer = balancesTx[transferMethod](
        params.to, // Plain SS58 address string
        amount.toString(),
      );

      return transfer;
    } catch (error) {
      this.logger.error(
        `Failed to construct transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to construct transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Construct a transaction from method and args
   *
   * @param params - Transaction parameters
   * @returns Unsigned transaction
   */
  async constructTransaction(params: TransactionParams): Promise<any> {
    const api = await this.rpcService.getConnection(
      params.chain,
      params.useTestnet,
    );

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Parse method (e.g., 'balances.transfer' -> ['balances', 'transfer'])
      const [pallet, method] = params.method.split('.');
      if (!pallet || !method) {
        throw new Error(
          `Invalid method format: ${params.method}. Expected format: 'pallet.method'`,
        );
      }

      // Check if pallet exists
      if (!api.tx || !(api.tx as any)[pallet]) {
        throw new Error(`Pallet ${pallet} not available on this chain`);
      }

      // Get the transaction method
      const txMethod = (api.tx as any)[pallet]?.[method];
      if (!txMethod) {
        throw new Error(`Transaction method ${params.method} not found`);
      }

      // Construct transaction with args
      const args = Object.values(params.args);
      const transaction = txMethod(...args);

      return transaction;
    } catch (error) {
      this.logger.error(
        `Failed to construct transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to construct transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Estimate transaction fee
   *
   * @param transaction - Unsigned transaction
   * @param from - Sender address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Fee estimate
   */
  async estimateFee(
    transaction: any,
    from: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<FeeEstimate> {
    const api = await this.rpcService.getConnection(chain, useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Get payment info
      const paymentInfo = await transaction.paymentInfo(from);

      return {
        partialFee: paymentInfo.partialFee.toString(),
        weight: paymentInfo.weight.toString(),
        class: paymentInfo.class.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to estimate fee: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to estimate fee: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Sign a transaction
   *
   * @param userId - User ID
   * @param transaction - Unsigned transaction
   * @param chain - Chain key
   * @param accountIndex - Account index (default: 0)
   * @param useTestnet - Whether to use testnet
   * @returns Signed transaction
   */
  async signTransaction(
    userId: string,
    transaction: any,
    chain: SubstrateChainKey,
    accountIndex: number = 0,
    useTestnet?: boolean,
  ): Promise<SignedTransaction> {
    // CRITICAL: Wait for WASM to be ready
    await ensureCryptoReady();

    // CRITICAL: Get seed from userId (not passed as parameter)
    let seedPhrase: string;
    try {
      seedPhrase = await this.seedManager.getSeed(userId);
    } catch (error) {
      this.logger.error(
        `Failed to get seed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }

    try {
      // Get chain configuration
      const chainConfig = getChainConfig(chain, useTestnet);

      // Build derivation path
      const derivationPath = buildDerivationPath(accountIndex);

      // Create keyring with SR25519
      const keyring = new Keyring({
        type: 'sr25519',
        ss58Format: chainConfig.ss58Prefix,
      });

      // Derive keypair from seed phrase
      const pair = keyring.createFromUri(`${seedPhrase}${derivationPath}`, {
        name: `${chain}-${accountIndex}`,
      });

      // Get account address
      const address = pair.address;

      // Get nonce (with pending nonce management)
      const nonce = await this.nonceManager.getNextNonce(
        address,
        chain,
        useTestnet,
      );

      // Get API connection
      const api = await this.rpcService.getConnection(chain, useTestnet);

      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Get current block header for era calculation
      const currentHeader = await api.rpc.chain.getHeader();
      const mortalityPeriod = 64; // Blocks

      // CRITICAL: Get current block hash - required for mortal era (non-immortal)
      // Polkadot.js v7+ requires blockHash when using a mortal era
      const blockHash = currentHeader.hash.toHex();

      // Sign transaction with nonce, era, and blockHash
      // blockHash is required when using a mortal era (non-immortal)
      const signedTx = await transaction.signAsync(pair, {
        nonce,
        era: api.registry.createType('ExtrinsicEra', {
          current: currentHeader.number.toNumber(),
          period: mortalityPeriod,
        }),
        blockHash, // Required for mortal era - checkpoint block hash
      });

      // Get transaction hash
      const txHash = signedTx.hash.toHex();

      // Clear seed from memory
      seedPhrase = '';

      return {
        txHash,
        signedTx: signedTx.toHex(),
        nonce,
      };
    } catch (error) {
      // Clear seed from memory on error
      seedPhrase = '';
      this.logger.error(
        `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Broadcast a signed transaction
   *
   * @param signedTx - Signed transaction (hex string)
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @returns Transaction result
   */
  async broadcastTransaction(
    signedTx: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
  ): Promise<TransactionResult> {
    const api = await this.rpcService.getConnection(chain, useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Decode signed transaction
      const tx = api.tx(signedTx);
      const txHash = tx.hash.toHex();

      return new Promise<TransactionResult>((resolve, reject) => {
        // Send transaction
        tx.send((result) => {
          if (result.isError) {
            const error = result.dispatchError
              ? result.dispatchError.toString()
              : 'Transaction failed';
            this.logger.error(`Transaction ${txHash} failed: ${error}`);
            resolve({
              txHash,
              status: 'failed',
              error,
            });
            return;
          }

          if (result.status.isInBlock) {
            this.logger.log(
              `Transaction ${txHash} in block ${result.status.asInBlock.toHex()}`,
            );
            resolve({
              txHash,
              blockHash: result.status.asInBlock.toHex(),
              status: 'inBlock',
            });
            return;
          }

          if (result.status.isFinalized) {
            this.logger.log(
              `Transaction ${txHash} finalized in block ${result.status.asFinalized.toHex()}`,
            );
            resolve({
              txHash,
              blockHash: result.status.asFinalized.toHex(),
              status: 'finalized',
            });
            return;
          }

          // Still pending
          if (result.status.isReady) {
            this.logger.log(`Transaction ${txHash} ready`);
            resolve({
              txHash,
              status: 'pending',
            });
          }
        }).catch((error) => {
          this.logger.error(
            `Failed to broadcast transaction ${txHash}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to broadcast transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to broadcast transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Send a transfer transaction (construct, sign, and broadcast)
   *
   * @param userId - User ID
   * @param params - Transfer parameters
   * @param accountIndex - Account index (default: 0)
   * @returns Transaction result
   */
  async sendTransfer(
    userId: string,
    params: TransferParams,
    accountIndex: number = 0,
  ): Promise<TransactionResult> {
    try {
      // Resolve from address from userId if not provided
      let fromAddress: string = params.from;
      if (!fromAddress) {
        const resolvedAddress = await this.addressManager.getAddressForChain(
          userId,
          params.chain,
          params.useTestnet,
        );
        if (!resolvedAddress) {
          throw new BadRequestException(
            `No address found for user ${userId} on chain ${params.chain}`,
          );
        }
        fromAddress = resolvedAddress;
      }

      // Update params with resolved from address
      const transferParams: TransferParams = {
        ...params,
        from: fromAddress,
      };

      // Construct transaction
      const transaction = await this.constructTransfer(transferParams);

      // Sign transaction
      const signed = await this.signTransaction(
        userId,
        transaction,
        params.chain,
        accountIndex,
        params.useTestnet,
      );

      // Broadcast transaction
      const result = await this.broadcastTransaction(
        signed.signedTx,
        params.chain,
        params.useTestnet,
      );

      // Update nonce on success
      if (result.status === 'finalized' || result.status === 'inBlock') {
        this.nonceManager.markNonceUsed(
          fromAddress,
          params.chain,
          signed.nonce,
          params.useTestnet,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to send transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get transaction history for an address
   *
   * @param address - SS58 address
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @param limit - Number of transactions to fetch (default: 10)
   * @param cursor - Cursor for pagination (block number or hash)
   * @returns Transaction history
   */
  async getTransactionHistory(
    address: string,
    chain: SubstrateChainKey,
    useTestnet?: boolean,
    limit: number = 10,
    cursor?: string,
  ): Promise<TransactionHistory> {
    const api = await this.rpcService.getConnection(chain, useTestnet);

    try {
      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      // Get current block number
      const currentHeader = await api.rpc.chain.getHeader();
      const currentBlock = currentHeader.number.toNumber();

      // Start from cursor or current block
      let startBlock = cursor ? parseInt(cursor, 10) : currentBlock;
      if (isNaN(startBlock)) {
        startBlock = currentBlock;
      }

      const transactions: TransactionHistoryEntry[] = [];
      // Reduce max blocks to scan to prevent timeouts (scan up to 500 blocks or limit * 5, whichever is smaller)
      const maxBlocksToScan = Math.min(limit * 5, 500);
      let blocksScanned = 0;
      const startTime = Date.now();
      const maxScanTime = 45000; // 45 seconds max scan time to leave buffer for response

      // Scan blocks backwards from startBlock
      for (
        let blockNum = startBlock;
        blockNum > 0 &&
        transactions.length < limit &&
        blocksScanned < maxBlocksToScan;
        blockNum--
      ) {
        // Check if we've exceeded the max scan time
        if (Date.now() - startTime > maxScanTime) {
          this.logger.warn(
            `Transaction history scan timeout for ${address} on ${chain} after ${maxScanTime}ms. Returning ${transactions.length} transactions found so far.`,
          );
          break;
        }
        try {
          const blockHash = await api.rpc.chain.getBlockHash(blockNum);
          const block = await api.rpc.chain.getBlock(blockHash);

          // Check each extrinsic in the block
          for (const extrinsic of block.block.extrinsics) {
            // Check if this extrinsic is from our address
            const signer = extrinsic.signer?.toString();
            if (signer === address) {
              const txHash = extrinsic.hash.toHex();
              const method =
                extrinsic.method.section + '.' + extrinsic.method.method;
              const args = extrinsic.method.args.map((arg: any) =>
                arg.toHuman(),
              );

              // Try to extract transfer info
              let to: string | undefined;
              let amount: string | undefined;
              if (method === 'balances.transfer' && args.length >= 2) {
                to =
                  typeof args[0] === 'object' && args[0]?.Id
                    ? args[0].Id
                    : args[0];
                amount = args[1];
              }

              transactions.push({
                txHash,
                blockNumber: blockNum,
                blockHash: blockHash.toHex(),
                timestamp: undefined, // Would need to query timestamp pallet
                from: address,
                to,
                amount,
                status: 'finalized',
                method,
                args: args as any,
              });

              if (transactions.length >= limit) {
                break;
              }
            }
          }

          blocksScanned++;
        } catch (error) {
          // Block might not exist, continue
          this.logger.warn(
            `Failed to fetch block ${blockNum}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      return {
        transactions,
        total: transactions.length,
        page: 1,
        pageSize: limit,
        hasMore: startBlock - blocksScanned > 0,
        nextCursor:
          startBlock - blocksScanned > 0
            ? (startBlock - blocksScanned).toString()
            : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
