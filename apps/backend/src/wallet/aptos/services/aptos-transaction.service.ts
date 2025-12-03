import { Injectable, Logger } from '@nestjs/common';
import {
  Account,
  AccountAddress,
  Aptos,
  SimpleTransaction,
  AccountAuthenticator,
} from '@aptos-labs/ts-sdk';
import { AptosRpcService } from './aptos-rpc.service.js';
import { AptosSequenceManager } from '../managers/aptos-sequence.manager.js';
import { AptosAccountService } from './aptos-account.service.js';
import { normalizeAddress, validateAddress } from '../utils/address.utils.js';
import { TransferParams, TransactionResult, SimulationResult } from '../types/transaction.types.js';

@Injectable()
export class AptosTransactionService {
  private readonly logger = new Logger(AptosTransactionService.name);

  constructor(
    private readonly rpcService: AptosRpcService,
    private readonly sequenceManager: AptosSequenceManager,
    private readonly accountService: AptosAccountService,
  ) {}

  /**
   * Transfer APT (native token) with simulation (SDK v5 compatible)
   */
  async transferAPT(params: TransferParams): Promise<TransactionResult> {
    // Validate inputs
    if (!validateAddress(params.recipientAddress)) {
      throw new Error('Invalid recipient address');
    }

    if (params.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const normalizedRecipient = normalizeAddress(params.recipientAddress);
    const senderAddress = params.senderAccount.accountAddress.toString();

    this.logger.log(
      `Transferring ${params.amount} APT from ${senderAddress} to ${normalizedRecipient} on ${params.network}`,
    );

    // Use sequence manager to prevent nonce collisions
    return await this.sequenceManager.withLock(
      senderAddress,
      params.network,
      async (sequenceNumber) => {
        return await this.rpcService.withRetry(
          params.network,
          async (client: Aptos) => {
            // 1. Build transaction
            const transaction = await this.buildTransferTransaction(
              client,
              params.senderAccount,
              normalizedRecipient,
              params.amount,
              sequenceNumber,
            );

            // 2. Simulate (validates before submitting)
            await this.simulateTransaction(client, params.senderAccount, transaction);

            // 3. Sign transaction
            const senderAuthenticator = client.transaction.sign({
              signer: params.senderAccount,
              transaction,
            });

            // 4. Submit transaction
            const pendingTx = await client.transaction.submit.simple({
              transaction,
              senderAuthenticator,
            });

            this.logger.log(`Transaction submitted: ${pendingTx.hash}`);

            // 5. Wait for confirmation
            const executedTx = await client.waitForTransaction({
              transactionHash: pendingTx.hash,
              options: {
                timeoutSecs: 30,
              },
            });

            return {
              hash: pendingTx.hash,
              success: executedTx.success,
              version: executedTx.version,
              sequenceNumber,
            };
          },
          'transferAPT',
        );
      },
    );
  }

  /**
   * Build transfer transaction (SDK v5)
   */
  private async buildTransferTransaction(
    client: Aptos,
    sender: Account,
    recipient: string,
    amountAPT: number,
    sequenceNumber: number,
  ): Promise<SimpleTransaction> {
    // Convert APT to octas (1 APT = 10^8 octas)
    const amountOctas = Math.floor(amountAPT * 1e8);
    const recipientAddress = AccountAddress.fromString(recipient);

    const transaction = await client.transaction.build.simple({
      sender: sender.accountAddress,
      data: {
        function: '0x1::aptos_account::transfer',
        functionArguments: [recipientAddress, amountOctas],
      },
      options: {
        accountSequenceNumber: sequenceNumber,
      },
    });

    this.logger.debug(
      `Built transaction: sender=${sender.accountAddress.toString()}, recipient=${recipient}, amount=${amountAPT} APT, sequence=${sequenceNumber}`,
    );

    return transaction;
  }

  /**
   * Simulate transaction (SDK v5)
   */
  private async simulateTransaction(
    client: Aptos,
    signer: Account,
    transaction: SimpleTransaction,
  ): Promise<void> {
    try {
      const simulationResults = await client.transaction.simulate.simple({
        signerPublicKey: signer.publicKey,
        transaction,
      });

      if (!simulationResults || simulationResults.length === 0) {
        throw new Error('Transaction simulation returned no results');
      }

      const simulationResult = simulationResults[0];
      if (!simulationResult) {
        throw new Error('Transaction simulation returned empty result');
      }

      if (!simulationResult.success) {
        throw new Error(
          `Transaction simulation failed: ${simulationResult.vm_status}`,
        );
      }

      this.logger.debug(
        `Simulation successful. Gas estimate: ${simulationResult.gas_used}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction simulation failed: ${message}`);
      throw new Error(`Transaction would fail: ${message}`);
    }
  }

}

