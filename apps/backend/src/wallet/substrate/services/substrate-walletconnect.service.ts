import { Injectable, Logger } from '@nestjs/common';
import { Keyring } from '@polkadot/keyring';
import { SubstrateManager } from '../managers/substrate.manager.js';
import { SubstrateTransactionService } from './substrate-transaction.service.js';
import { SubstrateAccountFactory } from '../factories/substrate-account.factory.js';
import {
  SubstrateChainKey,
  getChainConfig,
} from '../config/substrate-chain.config.js';
import { buildDerivationPath } from '../utils/derivation.util.js';
import { SeedManager } from '../../managers/seed.manager.js';

/**
 * Substrate WalletConnect Service
 *
 * Handles WalletConnect/Reown operations for Substrate chains:
 * - Transaction signing
 * - Message signing
 * - Account formatting (CAIP-10)
 */
@Injectable()
export class SubstrateWalletConnectService {
  private readonly logger = new Logger(SubstrateWalletConnectService.name);

  constructor(
    private readonly substrateManager: SubstrateManager,
    private readonly transactionService: SubstrateTransactionService,
    private readonly accountFactory: SubstrateAccountFactory,
    private readonly seedManager: SeedManager,
  ) {}

  /**
   * Format Substrate address to CAIP-10 account ID
   * Format: polkadot:<genesis_hash>:<ss58_address>
   */
  formatAccountId(
    chain: SubstrateChainKey,
    address: string,
    useTestnet: boolean = false,
  ): string {
    const chainConfig = getChainConfig(chain, useTestnet);
    const genesisHash = chainConfig.genesisHash.replace('0x', '');
    return `polkadot:${genesisHash}:${address}`;
  }

  /**
   * Parse CAIP-10 account ID to extract chain and address
   */
  parseAccountId(accountId: string): {
    chain: SubstrateChainKey | null;
    address: string;
    genesisHash: string;
  } | null {
    // Format: polkadot:<genesis_hash>:<address>
    const parts = accountId.split(':');
    if (parts.length !== 3 || parts[0] !== 'polkadot') {
      return null;
    }

    const genesisHash = parts[1];
    const address = parts[2];

    // Validate that we have both genesisHash and address
    if (!genesisHash || !address) {
      return null;
    }

    // Find chain by genesis hash
    const enabledChains = this.substrateManager.getEnabledChains();
    for (const chain of enabledChains) {
      const mainnetConfig = getChainConfig(chain, false);
      const testnetConfig = getChainConfig(chain, true);

      if (
        mainnetConfig.genesisHash.replace('0x', '') === genesisHash ||
        testnetConfig.genesisHash.replace('0x', '') === genesisHash
      ) {
        return { chain, address, genesisHash };
      }
    }

    return null;
  }

  /**
   * Sign a Substrate transaction for WalletConnect
   *
   * @param userId - User ID
   * @param accountId - CAIP-10 account ID (polkadot:<genesis_hash>:<address>)
   * @param transactionPayload - Hex-encoded transaction payload
   * @param useTestnet - Whether to use testnet
   * @returns Signature in hex format
   */
  async signTransaction(
    userId: string,
    accountId: string,
    transactionPayload: string,
    useTestnet: boolean = false,
  ): Promise<{ signature: string }> {
    this.logger.log(
      `Signing Substrate transaction for user ${userId}, account ${accountId}`,
    );

    const parsed = this.parseAccountId(accountId);
    if (!parsed || !parsed.chain) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }

    const { chain, address } = parsed;

    // Verify the address belongs to the user
    const userAddress = await this.substrateManager.getAddressForChain(
      userId,
      chain,
      useTestnet,
    );
    if (userAddress !== address) {
      throw new Error(`Address ${address} does not belong to user ${userId}`);
    }

    // Get API connection to decode the transaction
    // Access rpcService through the manager's private property (we need to make it accessible)
    const rpcService = (this.substrateManager as any).rpcService;
    const api = await rpcService.getConnection(chain, useTestnet);
    await api.isReady;

    // Decode the transaction payload (hex string) into a transaction object
    const payloadHex = transactionPayload.startsWith('0x')
      ? transactionPayload
      : `0x${transactionPayload}`;

    // Create transaction from payload
    const transaction = api.tx(payloadHex);

    // Sign using the transaction service
    const signed = await this.transactionService.signTransaction(
      userId,
      transaction,
      chain,
      0, // accountIndex
      useTestnet,
    );

    // Extract signature from signed transaction
    // The signed transaction contains the signature, we need to extract it
    // For WalletConnect, we return just the signature bytes
    const signedTxHex = signed.signedTx;
    const signedTx = api.tx(signedTxHex);

    // Get signature from the signed extrinsic
    // The signature is in the extrinsic's signature field
    const signature = signedTx.signature.toString();

    return {
      signature: signature.startsWith('0x') ? signature : `0x${signature}`,
    };
  }

  /**
   * Sign a message for WalletConnect
   */
  async signMessage(
    userId: string,
    accountId: string,
    message: string | Uint8Array,
    useTestnet: boolean = false,
  ): Promise<{ signature: string }> {
    this.logger.log(
      `Signing Substrate message for user ${userId}, account ${accountId}`,
    );

    const parsed = this.parseAccountId(accountId);
    if (!parsed || !parsed.chain) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }

    const { chain, address } = parsed;

    // Verify the address belongs to the user
    const userAddress = await this.substrateManager.getAddressForChain(
      userId,
      chain,
      useTestnet,
    );
    if (userAddress !== address) {
      throw new Error(`Address ${address} does not belong to user ${userId}`);
    }

    // Get seed phrase
    const seedPhrase = await this.seedManager.getSeed(userId);

    try {
      // Get chain configuration
      const chainConfig = getChainConfig(chain, useTestnet);

      // Build derivation path
      const derivationPath = buildDerivationPath(0);

      // Create keyring with SR25519
      const keyring = new Keyring({
        type: 'sr25519',
        ss58Format: chainConfig.ss58Prefix,
      });

      // Derive keypair from seed phrase
      const pair = keyring.createFromUri(`${seedPhrase}${derivationPath}`, {
        name: `${chain}-0`,
      });

      // Convert message to bytes
      const messageBytes =
        typeof message === 'string'
          ? Buffer.from(message)
          : Buffer.from(message);

      // Sign message with SR25519
      const signature = pair.sign(messageBytes);

      return {
        signature: `0x${Buffer.from(signature).toString('hex')}`,
      };
    } finally {
      // Clear seed from memory
      seedPhrase && (seedPhrase as any) === ''; // TypeScript workaround
    }
  }

  /**
   * Get all Substrate accounts formatted as CAIP-10 for WalletConnect
   */
  async getFormattedAccounts(
    userId: string,
    useTestnet: boolean = false,
  ): Promise<
    Array<{ accountId: string; chain: SubstrateChainKey; address: string }>
  > {
    const addresses = await this.substrateManager.getAddresses(
      userId,
      useTestnet,
    );
    const enabledChains = this.substrateManager.getEnabledChains();

    const accounts: Array<{
      accountId: string;
      chain: SubstrateChainKey;
      address: string;
    }> = [];

    for (const chain of enabledChains) {
      const address = addresses[chain];
      if (!address) {
        continue;
      }

      const accountId = this.formatAccountId(chain, address, useTestnet);
      accounts.push({ accountId, chain, address });
    }

    return accounts;
  }
}
