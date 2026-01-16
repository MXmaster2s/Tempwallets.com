import { Injectable, Logger } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
  mainnet,
  base,
  arbitrum,
  polygon,
  avalanche,
  optimism,
  bsc,
} from 'viem/chains';
import { ChainConfigService } from '../config/chain.config.js';
import { IAccount } from '../types/account.types.js';

/**
 * Native EOA factory for EVM chains (no WDK dependency).
 * Derives EOAs via viem and exposes IAccount wrapper for reads/writes.
 */
@Injectable()
export class NativeEoaFactory {
  private readonly logger = new Logger(NativeEoaFactory.name);

  constructor(private readonly chainConfig: ChainConfigService) {}

  async createAccount(
    seedPhrase: string,
    chain:
      | 'ethereum'
      | 'base'
      | 'arbitrum'
      | 'polygon'
      | 'avalanche'
      | 'optimism'
      | 'bnb',
    accountIndex = 0,
  ): Promise<IAccount> {
    const viemChain = this.getViemChain(chain);
    const { rpcUrl } = this.chainConfig.getEvmChainConfig(chain);

    const eoaAccount = mnemonicToAccount(seedPhrase, {
      accountIndex,
      addressIndex: 0,
    });

    const transport = http(rpcUrl);
    const publicClient = createPublicClient({ chain: viemChain, transport });
    const walletClient = createWalletClient({
      account: eoaAccount,
      chain: viemChain,
      transport,
    });

    this.logger.debug(
      `Derived native EOA for ${chain}: ${eoaAccount.address} (accountIndex=${accountIndex})`,
    );

    return new NativeEoaAccountWrapper(
      eoaAccount.address,
      publicClient,
      walletClient,
      this.logger,
    );
  }

  private getViemChain(
    chain:
      | 'ethereum'
      | 'base'
      | 'arbitrum'
      | 'polygon'
      | 'avalanche'
      | 'optimism'
      | 'bnb',
  ): Chain {
    const mapping: Record<string, Chain> = {
      ethereum: mainnet,
      base,
      arbitrum,
      polygon,
      avalanche,
      optimism,
      bnb: bsc,
    };

    const viemChain = mapping[chain];
    if (!viemChain) {
      throw new Error(`Unsupported EVM chain for native EOA: ${chain}`);
    }
    return viemChain;
  }
}

class NativeEoaAccountWrapper implements IAccount {
  constructor(
    private readonly address: Address,
    private readonly publicClient: ReturnType<typeof createPublicClient>,
    private readonly walletClient: ReturnType<typeof createWalletClient>,
    private readonly logger: Logger,
  ) {}

  async getAddress(): Promise<string> {
    return this.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({ address: this.address });
    return balance.toString();
  }

  async send(to: string, amount: string): Promise<string> {
    const requestedValue = BigInt(amount);
    
    // Get current balance
    const balance = await this.publicClient.getBalance({ 
      address: this.address 
    });
    
    this.logger.log(
      `Sending ${requestedValue} wei to ${to} from ${this.address} (balance: ${balance})`
    );
    
    try {
      // Estimate gas for this transaction
      const gasEstimate = await this.publicClient.estimateGas({
        account: this.address,
        to: to as Address,
        value: requestedValue,
      });
      
      // Get current gas price
      const gasPrice = await this.publicClient.getGasPrice();
      
      // Calculate total gas cost with 20% buffer for safety
      const gasCostEstimate = gasEstimate * gasPrice;
      const gasCostWithBuffer = (gasCostEstimate * 120n) / 100n;
      
      this.logger.log(
        `Gas estimate: ${gasEstimate} units, price: ${gasPrice} wei, ` +
        `total cost: ${gasCostEstimate} wei (with 20% buffer: ${gasCostWithBuffer} wei)`
      );
      
      // Check if user is trying to send more than they have (including gas)
      const totalNeeded = requestedValue + gasCostWithBuffer;
      
      if (totalNeeded > balance) {
        // User doesn't have enough for both amount + gas
        const maxSendable = balance - gasCostWithBuffer;
        
        if (maxSendable <= 0n) {
          throw new Error(
            `Insufficient balance for gas fees. Balance: ${balance} wei, ` +
            `Gas needed: ${gasCostWithBuffer} wei. Please add more funds to cover gas costs.`
          );
        }
        
        // Calculate percentage difference
        const difference = requestedValue - maxSendable;
        const percentDiff = (difference * 100n) / requestedValue;
        
        this.logger.warn(
          `Requested ${requestedValue} wei but only ${maxSendable} wei available after gas. ` +
          `Difference: ${difference} wei (${percentDiff}%)`
        );
        
        // If difference is significant (>2%), throw error
        if (percentDiff > 2n) {
          throw new Error(
            `Cannot send ${requestedValue} wei. Maximum sendable: ${maxSendable} wei ` +
            `(must reserve ${gasCostWithBuffer} wei for gas). ` +
            `Difference: ${difference} wei (${percentDiff}%). ` +
            `Please reduce your send amount or add more funds.`
          );
        }
        
        // Small difference (<=2%) - auto-adjust and proceed
        this.logger.log(
          `Auto-adjusting send amount from ${requestedValue} to ${maxSendable} ` +
          `to reserve gas (difference: ${difference} wei, ${percentDiff}%)`
        );
        
        const hash = await this.walletClient.sendTransaction({
          chain: this.walletClient.chain,
          account: this.walletClient.account!,
          to: to as Address,
          value: maxSendable,
          gas: gasEstimate,
        });
        
        this.logger.log(
          `Transaction sent with adjusted amount: ${hash} ` +
          `(sent ${maxSendable} wei instead of ${requestedValue} wei)`
        );
        
        return hash;
      }
      
      // Normal case - enough balance for both amount and gas
      const hash = await this.walletClient.sendTransaction({
        chain: this.walletClient.chain,
        account: this.walletClient.account!,
        to: to as Address,
        value: requestedValue,
        gas: gasEstimate,
      });
      
      this.logger.log(`Transaction sent: ${hash}`);
      return hash;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send native token: ${errorMessage}`);
      
      // Re-throw with more context
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('gas required exceeds')) {
        throw new Error(
          `Insufficient funds for transaction. Balance: ${balance} wei, ` +
          `Requested: ${requestedValue} wei. ` +
          `You need additional funds to cover gas fees. Error: ${errorMessage}`
        );
      }
      
      throw error;
    }
  }
}
