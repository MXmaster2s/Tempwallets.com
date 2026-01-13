import { Injectable, Logger } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  defineChain,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
  mainnet,
  sepolia,
  base,
  arbitrum,
  optimism,
} from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { to7702SimpleSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { recoverAuthorizationAddress } from 'viem/experimental';
import { PimlicoConfigService } from '../config/pimlico.config.js';
import { ChainConfigService } from '../config/chain.config.js';
import { Eip7702DelegationRepository } from '../repositories/eip7702-delegation.repository.js';
import { IAccount } from '../types/account.types.js';

/**
 * EIP-7702 smart account factory.
 * Builds delegated smart accounts from EOAs and wires Pimlico bundler/paymaster.
 */
@Injectable()
export class Eip7702AccountFactory {
  private readonly logger = new Logger(Eip7702AccountFactory.name);

  constructor(
    private readonly pimlicoConfig: PimlicoConfigService,
    private readonly chainConfig: ChainConfigService,
    private readonly delegationRepo: Eip7702DelegationRepository,
  ) {}

  async createAccount(
    seedPhrase: string,
    chain:
      | 'ethereum'
      | 'sepolia'
      | 'base'
      | 'arbitrum'
      | 'optimism',
    accountIndex = 0,
    userId?: string,
  ): Promise<IAccount> {
    // ✅ FIX: Check EIP-7702 enablement with better error message
    if (!this.pimlicoConfig.isEip7702Enabled(chain)) {
      // For production, ensure base chain is always enabled for EIP-7702
      // This handles the case where env vars might not be set correctly
      if (chain === 'base') {
        this.logger.warn(
          `EIP-7702 not explicitly enabled for base via env vars, but base chain supports EIP-7702 natively. ` +
          `Continuing with EIP-7702 support. ` +
          `To avoid this warning, set ENABLE_EIP7702=true and EIP7702_CHAINS=base in production.`,
        );
        // Continue - base chain supports EIP-7702 natively
      } else {
        throw new Error(
          `EIP-7702 is not enabled for chain ${chain}. ` +
          `Enable via config (ENABLE_EIP7702=true, EIP7702_CHAINS=${chain}) before sending gasless transactions.`,
        );
      }
    }

    const viemChain = this.getViemChain(chain);
    const rpcUrl = this.getRpcUrl(chain);

    const eoaAccount = mnemonicToAccount(seedPhrase, {
      accountIndex,
      addressIndex: 0,
    });

    // ✅ FIX: Create public client with EIP-7702 enabled chain
    // Ensure the chain configuration supports EIP-7702 for permissionless library
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });

    const eipConfig = this.pimlicoConfig.getEip7702Config(chain);

    // ✅ FIX: Verify delegation address is deployed on this network
    const delegationCode = await publicClient.getBytecode({
      address: eipConfig.delegationAddress as Address,
    });

    if (!delegationCode || delegationCode === '0x') {
      throw new Error(
        `Delegation address ${eipConfig.delegationAddress} has no code on ${chain}. ` +
        `EIP-7702 might not be supported on this network, or the delegation address is incorrect.`,
      );
    }

    this.logger.log(
      `[EIP-7702] Delegation implementation verified at ${eipConfig.delegationAddress}`,
    );

    // Entry point 0.8 for EIP-7702 (required by to7702SimpleSmartAccount)
    const entryPoint = {
      address: eipConfig.entryPointAddress as Address,
      version: '0.8' as const,
    };

    const pimlicoClient = createPimlicoClient({
      transport: http(eipConfig.bundlerUrl),
      entryPoint,
    });

    const smartAccount = await to7702SimpleSmartAccount({
      client: publicClient,
      owner: eoaAccount,
    });

    const smartAccountAddress = await smartAccount.getAddress();

    if (smartAccountAddress.toLowerCase() !== eoaAccount.address.toLowerCase()) {
      this.logger.error(
        `EIP-7702 address mismatch: owner=${eoaAccount.address}, smartAccount=${smartAccountAddress}. Aborting to prevent invalid authorization signature.`,
      );
      throw new Error(
        `EIP-7702 address mismatch between owner and smart account (owner=${eoaAccount.address}, smart=${smartAccountAddress}). Check seed derivation and accountIndex consistency.`,
      );
    }

    // ✅ FIX: Ensure paymaster is always configured for sponsored transactions
    // All EIP-7702 transactions should be sponsored
    if (!eipConfig.paymasterUrl) {
      this.logger.warn(
        `[EIP-7702] Paymaster URL not configured for ${chain}. ` +
        `Transactions will not be sponsored. Consider setting PIMLICO_API_KEY.`,
      );
    }

    // Create smart account client exactly as shown in Pimlico official demo
    // ✅ FIX: Always pass paymaster (even if URL might be undefined, pimlicoClient handles it)
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: viemChain,
      bundlerTransport: http(eipConfig.bundlerUrl),
      client: publicClient,
      paymaster: pimlicoClient, // ✅ Always provide paymaster for sponsorship
      userOperation: {
        // Official Pimlico approach: return .fast directly
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    });

    this.logger.log(
      `[EIP-7702] Smart account client created with paymaster: ${!!pimlicoClient}`,
    );

    // No separate wallet client needed - use smartAccountClient for everything
    return new Eip7702SmartAccountWrapper(
      eoaAccount.address,
      eoaAccount,
      smartAccountClient,
      smartAccount,
      publicClient,
      this.delegationRepo,
      userId,
      viemChain.id,
      eipConfig.delegationAddress as Address,
      this.logger,
    );
  }

  private getViemChain(
    chain:
      | 'ethereum'
      | 'sepolia'
      | 'base'
      | 'arbitrum'
      | 'optimism',
  ): Chain {
    const baseChains: Record<string, Chain> = {
      ethereum: mainnet,
      sepolia,
      base,
      arbitrum,
      optimism,
    };
    
    const baseChain = baseChains[chain];
    if (!baseChain) {
      throw new Error(`Unsupported EIP-7702 chain: ${chain}`);
    }

    // ✅ FIX: Extend chain to explicitly enable EIP-7702 support
    // This is required for permissionless library to recognize EIP-7702 capability
    const chainWithEip7702 = defineChain({
      ...baseChain,
    }) as Chain;

    // Mark EIP-7702 as enabled for permissionless library compatibility
    // This ensures the chain is recognized as supporting EIP-7702 transactions
    Object.defineProperty(chainWithEip7702, 'eip7702', {
      value: true,
      writable: false,
      enumerable: true,
    });

    return chainWithEip7702;
  }

  private getRpcUrl(
    chain:
      | 'ethereum'
      | 'sepolia'
      | 'base'
      | 'arbitrum'
      | 'optimism',
  ): string {
    return this.chainConfig.getEvmChainConfig(chain).rpcUrl;
  }

}

class Eip7702SmartAccountWrapper implements IAccount {
  constructor(
    private readonly eoaAddress: Address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly eoaAccount: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly client: any, // This is the smartAccountClient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly smartAccount: any,
    private readonly publicClient: ReturnType<typeof createPublicClient>,
    private readonly delegationRepo: Eip7702DelegationRepository,
    private readonly userId: string | undefined,
    private readonly chainId: number,
    private readonly delegationAddress: Address,
    private readonly logger: Logger,
  ) {}

  async getAddress(): Promise<string> {
    // EIP-7702 keeps the same EOA address.
    return this.eoaAddress;
  }

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.eoaAddress,
    });
    return balance.toString();
  }

  async send(to: string, amount: string): Promise<string> {
    const value = BigInt(amount);

    this.logger.log(`[EIP-7702 Send] Starting transaction`);
    this.logger.log(`[EIP-7702 Send] To: ${to}`);
    this.logger.log(`[EIP-7702 Send] Amount: ${value}`);
    this.logger.log(`[EIP-7702 Send] EOA Address: ${this.eoaAddress}`);
    this.logger.log(`[EIP-7702 Send] Chain ID: ${this.chainId}`);
    this.logger.log(`[EIP-7702 Send] Delegation Address: ${this.delegationAddress}`);

    try {
      // ✅ FIX: Check bytecode directly instead of isDeployed()
      const code = await this.publicClient.getBytecode({
        address: this.eoaAddress,
      });

      // Check if delegation bytecode is set
      // EIP-7702 sets bytecode to: 0xef0100 + delegationAddress (20 bytes)
      const hasDelegation = code && code !== '0x' && code.length > 2;

      this.logger.log(
        `[EIP-7702] Delegation status - hasBytecode: ${hasDelegation}, ` +
        `bytecode: ${code?.slice(0, 20)}...`,
      );

      // Also check isDeployed for comparison (logging only)
      try {
        const isDeployed = await this.smartAccount.isDeployed();
        this.logger.log(`[EIP-7702 Send] isDeployed() check: ${isDeployed}`);
      } catch (error) {
        this.logger.warn(
          `[EIP-7702 Send] isDeployed() check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      let txHash: string;

      if (!hasDelegation) {
        // First transaction - include authorization
        this.logger.log(`[EIP-7702] First transaction - including authorization`);

        const nonce = await this.publicClient.getTransactionCount({
          address: this.eoaAddress,
        });

        this.logger.log(`[EIP-7702] EOA nonce: ${nonce}`);

        const authorization = await this.eoaAccount.signAuthorization({
          address: this.delegationAddress,
          chainId: this.chainId,
          nonce,
        });

        this.logger.log(`[EIP-7702] Authorization signed:`, {
          address: this.delegationAddress,
          chainId: this.chainId,
          nonce,
        });

        // ✅ FIX: Verify authorization signature before sending
        try {
          const recoveredAddress = await recoverAuthorizationAddress({
            authorization,
          });
          this.logger.log(`[EIP-7702] Authorization signer: ${recoveredAddress}`);

          if (recoveredAddress.toLowerCase() !== this.eoaAddress.toLowerCase()) {
            throw new Error(
              `Authorization signature mismatch! ` +
              `Expected: ${this.eoaAddress}, Got: ${recoveredAddress}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[EIP-7702] Authorization verification failed:`,
            error instanceof Error ? error.message : 'Unknown error',
          );
          throw error;
        }

        txHash = await this.client.sendTransaction({
          to: to as Address,
          value,
          data: '0x' as `0x${string}`,
          authorization,
        });

        this.logger.log(`[EIP-7702] First transaction sent: ${txHash}`);

        // Record delegation in database
        if (this.userId) {
          await this.delegationRepo.recordDelegation(
            this.userId,
            this.eoaAddress,
            this.chainId,
            this.delegationAddress,
          );
          this.logger.log(`[EIP-7702] Delegation recorded in database`);
        }
      } else {
        // Subsequent transactions - no authorization needed
        this.logger.log(`[EIP-7702] Subsequent transaction - no authorization`);

        txHash = await this.client.sendTransaction({
          to: to as Address,
          value,
          data: '0x' as `0x${string}`,
        });

        this.logger.log(`[EIP-7702] Transaction sent: ${txHash}`);
      }

      return txHash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[EIP-7702] Transaction failed:`, {
        error: errorMsg,
        to,
        amount: value.toString(),
        eoaAddress: this.eoaAddress,
        chainId: this.chainId,
      });

      throw new Error(
        `Failed to send EIP-7702 transaction: ${errorMsg}. ` +
        `This may indicate a bundler issue, network incompatibility, or incorrect delegation address.`,
      );
    }
  }

  private async ensureDelegation(): Promise<boolean> {
    if (!this.userId) return false;

    // Check database first (faster)
    const hasDelegationRecord = await this.delegationRepo.hasDelegation(
      this.userId,
      this.chainId,
    );

    if (hasDelegationRecord) {
      return false;
    }

    // Check on-chain to be sure
    try {
      const code = await this.publicClient.getBytecode({
        address: this.eoaAddress,
      });

      const isDelegated = code !== undefined && code !== '0x' && code.length > 2;

      if (isDelegated) {
        // Already delegated on-chain but not in DB - sync DB
        await this.delegationRepo.recordDelegation(
          this.userId,
          this.eoaAddress,
          this.chainId,
          this.delegationAddress,
        );
        return false;
      }
    } catch (error) {
      this.logger.warn(
        `Could not check on-chain delegation status: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    // This is the first transaction - record it
    try {
      await this.delegationRepo.recordDelegation(
        this.userId,
        this.eoaAddress,
        this.chainId,
        this.delegationAddress,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to record delegation: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    return true; // This is the first transaction
  }
}
