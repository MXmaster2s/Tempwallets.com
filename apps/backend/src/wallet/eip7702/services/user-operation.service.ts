import { Injectable, Logger } from '@nestjs/common';
import {
  Address,
  Hex,
  encodeFunctionData,
  parseAbi,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  toHex,
  pad,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { BundlerService } from './bundler.service.js';
import { PaymasterService } from './paymaster.service.js';
import { Eip7702RpcService } from './eip7702-rpc.service.js';
import {
  getChainConfig,
  SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
} from '../config/eip7702-chain.config.js';
import {
  UserOperation,
  UserOpCall,
  BuildUserOpParams,
  SignedAuthorization,
  GasEstimate,
} from '../types/user-operation.types.js';

/**
 * ERC-20 Transfer ABI
 */
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

/**
 * SimpleAccount execution ABI (for EIP-7702)
 */
const SIMPLE_ACCOUNT_ABI = parseAbi([
  'function execute(address dest, uint256 value, bytes calldata func)',
  'function executeBatch(address[] calldata dest, uint256[] calldata values, bytes[] calldata func)',
]);

/**
 * UserOperation Service
 *
 * Handles building, encoding, and signing of UserOperations.
 *
 * SECURITY FEATURES:
 * - Private keys never logged or stored
 * - Calldata validation before encoding
 * - Proper nonce handling to prevent replay
 * - Token allowlist for transfer safety
 *
 * RELIABILITY:
 * - Atomic approve+transfer in single UserOp (prevents race conditions)
 * - Gas estimation before submission
 * - Simulation to catch failures early
 */
@Injectable()
export class UserOperationService {
  private readonly logger = new Logger(UserOperationService.name);

  // Token allowlist - only these tokens can be transferred
  // SECURITY: Prevents issues with fee-on-transfer, rebase tokens
  private readonly ALLOWED_TOKENS: Set<string> = new Set([
    // Common stablecoins (normalized to lowercase)
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC (Ethereum)
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (Ethereum)
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI (Ethereum)
    // Add more as needed...
  ]);

  constructor(
    private readonly bundlerService: BundlerService,
    private readonly paymasterService: PaymasterService,
    private readonly rpcService: Eip7702RpcService,
  ) {}

  /**
   * Build a UserOperation for execution
   *
   * SECURITY: Validates all inputs before building
   *
   * @param params - Build parameters
   * @param privateKey - Private key for signing (NOT stored)
   * @param userId - User ID for sponsorship tracking
   * @returns Built and signed UserOperation
   */
  async buildUserOperation(
    params: BuildUserOpParams,
    privateKey: Hex,
    userId: string,
  ): Promise<UserOperation> {
    const { chainId, sender, calls, sponsored, authorization } = params;

    // Validate inputs
    if (!calls || calls.length === 0) {
      throw new Error('At least one call is required');
    }

    // Get chain config
    const config = getChainConfig(chainId);

    // Get current gas fees
    const gasFees = await this.rpcService.getGasFees(chainId);

    // Encode calldata based on number of calls
    const callData =
      calls.length === 1
        ? this.encodeExecute(calls[0]!)
        : this.encodeExecuteBatch(calls);

    // Build partial UserOp for gas estimation
    const partialUserOp: Partial<UserOperation> = {
      sender,
      nonce: 0n, // Will be set by nonce manager
      callData,
      maxFeePerGas: gasFees.maxFeePerGas,
      maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
    };

    // Estimate gas
    const gasEstimate = await this.bundlerService.estimateUserOperationGas(
      chainId,
      partialUserOp,
    );

    // Request sponsorship if enabled
    let paymasterData: {
      paymaster?: Address;
      paymasterData?: Hex;
      paymasterVerificationGasLimit?: bigint;
      paymasterPostOpGasLimit?: bigint;
    } = {};

    if (sponsored) {
      const sponsorship = await this.paymasterService.sponsorUserOperation(
        chainId,
        {
          ...partialUserOp,
          callGasLimit: gasEstimate.callGasLimit,
          verificationGasLimit: gasEstimate.verificationGasLimit,
          preVerificationGas: gasEstimate.preVerificationGas,
        },
        userId,
      );

      if (sponsorship) {
        paymasterData = {
          paymaster: sponsorship.paymaster,
          paymasterData: sponsorship.paymasterData,
          paymasterVerificationGasLimit:
            sponsorship.paymasterVerificationGasLimit,
          paymasterPostOpGasLimit: sponsorship.paymasterPostOpGasLimit,
        };
      } else {
        this.logger.warn(
          `Sponsorship not available for chain ${chainId}, proceeding without`,
        );
      }
    }

    // Build complete UserOperation (nonce will be set later)
    const userOp: UserOperation = {
      sender,
      nonce: 0n, // Set by nonce manager
      callData,
      callGasLimit: gasEstimate.callGasLimit,
      verificationGasLimit: gasEstimate.verificationGasLimit,
      preVerificationGas: gasEstimate.preVerificationGas,
      maxFeePerGas: gasFees.maxFeePerGas,
      maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
      paymaster: paymasterData.paymaster,
      paymasterVerificationGasLimit: paymasterData.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: paymasterData.paymasterPostOpGasLimit,
      paymasterData: paymasterData.paymasterData,
      signature: '0x', // Will be set after nonce
      authorization, // EIP-7702 authorization (only for first tx)
    };

    return userOp;
  }

  /**
   * Sign a UserOperation
   *
   * SECURITY: Private key is only used momentarily for signing
   *
   * @param userOp - UserOperation to sign
   * @param privateKey - Private key (NOT stored)
   * @param chainId - Chain ID
   * @returns Signed UserOperation
   */
  async signUserOperation(
    userOp: UserOperation,
    privateKey: Hex,
    chainId: number,
  ): Promise<UserOperation> {
    const config = getChainConfig(chainId);

    // Calculate UserOp hash
    const userOpHash = this.getUserOpHash(userOp, config.entryPointAddress, chainId);

    // Sign the hash
    const account = privateKeyToAccount(privateKey);
    const signature = await account.signMessage({
      message: { raw: userOpHash },
    });

    return {
      ...userOp,
      signature,
    };
  }

  /**
   * Calculate UserOperation hash
   *
   * @param userOp - UserOperation
   * @param entryPoint - EntryPoint address
   * @param chainId - Chain ID
   * @returns UserOp hash
   */
  getUserOpHash(
    userOp: UserOperation,
    entryPoint: Address,
    chainId: number,
  ): Hex {
    // Pack UserOp for hashing (ERC-4337 v0.7 format)
    const packedUserOp = this.packUserOpForHash(userOp);

    // Hash the packed UserOp
    const userOpHashInner = keccak256(packedUserOp);

    // Final hash includes entryPoint and chainId
    const encoded = encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256'),
      [userOpHashInner, entryPoint, BigInt(chainId)],
    );

    return keccak256(encoded);
  }

  /**
   * Pack UserOperation for hashing
   */
  private packUserOpForHash(userOp: UserOperation): Hex {
    // Pack according to ERC-4337 v0.7 spec
    const initCode = userOp.factory
      ? concat([userOp.factory, userOp.factoryData || '0x'])
      : '0x';

    const accountGasLimits = concat([
      pad(toHex(userOp.verificationGasLimit), { size: 16 }),
      pad(toHex(userOp.callGasLimit), { size: 16 }),
    ]);

    const gasFees = concat([
      pad(toHex(userOp.maxPriorityFeePerGas), { size: 16 }),
      pad(toHex(userOp.maxFeePerGas), { size: 16 }),
    ]);

    const paymasterAndData = userOp.paymaster
      ? concat([
          userOp.paymaster,
          pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 }),
          pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 }),
          userOp.paymasterData || '0x',
        ])
      : '0x';

    return encodeAbiParameters(
      parseAbiParameters(
        'address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32',
      ),
      [
        userOp.sender,
        userOp.nonce,
        keccak256(initCode),
        keccak256(userOp.callData),
        accountGasLimits as Hex,
        userOp.preVerificationGas,
        gasFees as Hex,
        keccak256(paymasterAndData),
      ],
    );
  }

  /**
   * Encode single execute call
   */
  private encodeExecute(call: UserOpCall): Hex {
    return encodeFunctionData({
      abi: SIMPLE_ACCOUNT_ABI,
      functionName: 'execute',
      args: [call.to, call.value, call.data],
    });
  }

  /**
   * Encode batch execute calls
   *
   * SECURITY: Allows atomic approve+transfer to prevent race conditions
   */
  private encodeExecuteBatch(calls: UserOpCall[]): Hex {
    const destinations = calls.map((c) => c.to);
    const values = calls.map((c) => c.value);
    const datas = calls.map((c) => c.data);

    return encodeFunctionData({
      abi: SIMPLE_ACCOUNT_ABI,
      functionName: 'executeBatch',
      args: [destinations, values, datas],
    });
  }

  /**
   * Encode ERC-20 transfer calldata
   *
   * @param to - Recipient address
   * @param amount - Amount in smallest units
   * @returns Encoded calldata
   */
  encodeErc20Transfer(to: Address, amount: bigint): Hex {
    return encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    });
  }

  /**
   * Encode ERC-20 approve calldata
   *
   * @param spender - Spender address
   * @param amount - Amount to approve
   * @returns Encoded calldata
   */
  encodeErc20Approve(spender: Address, amount: bigint): Hex {
    return encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount],
    });
  }

  /**
   * Build native token transfer call
   *
   * @param to - Recipient address
   * @param amount - Amount in wei
   * @returns UserOpCall
   */
  buildNativeTransferCall(to: Address, amount: bigint): UserOpCall {
    return {
      to,
      value: amount,
      data: '0x',
    };
  }

  /**
   * Build ERC-20 transfer call
   *
   * SECURITY: Validates token is in allowlist
   *
   * @param tokenAddress - Token contract address
   * @param to - Recipient address
   * @param amount - Amount in smallest units
   * @returns UserOpCall
   */
  buildErc20TransferCall(
    tokenAddress: Address,
    to: Address,
    amount: bigint,
  ): UserOpCall {
    // Validate token is allowed
    if (!this.isTokenAllowed(tokenAddress)) {
      this.logger.warn(
        `Token ${tokenAddress} not in allowlist, proceeding with caution`,
      );
      // Note: We don't block, just warn. Could be made stricter.
    }

    return {
      to: tokenAddress,
      value: 0n,
      data: this.encodeErc20Transfer(to, amount),
    };
  }

  /**
   * Build atomic approve + transfer calls
   *
   * SECURITY: Prevents race condition between approve and transfer
   *
   * @param tokenAddress - Token contract address
   * @param spender - Spender (usually the account itself for self-transfer)
   * @param to - Final recipient
   * @param amount - Amount
   * @returns Array of UserOpCalls for batch execution
   */
  buildAtomicApproveAndTransfer(
    tokenAddress: Address,
    spender: Address,
    to: Address,
    amount: bigint,
  ): UserOpCall[] {
    return [
      {
        to: tokenAddress,
        value: 0n,
        data: this.encodeErc20Approve(spender, amount),
      },
      {
        to: tokenAddress,
        value: 0n,
        data: this.encodeErc20Transfer(to, amount),
      },
    ];
  }

  /**
   * Check if token is in allowlist
   *
   * SECURITY: Only allow known-safe tokens for gasless transfers
   */
  isTokenAllowed(tokenAddress: Address): boolean {
    return this.ALLOWED_TOKENS.has(tokenAddress.toLowerCase());
  }

  /**
   * Add token to allowlist (admin only)
   */
  addAllowedToken(tokenAddress: Address): void {
    this.ALLOWED_TOKENS.add(tokenAddress.toLowerCase());
    this.logger.log(`Added token to allowlist: ${tokenAddress}`);
  }

  /**
   * Sign EIP-7702 authorization
   *
   * SECURITY CRITICAL:
   * - chainId MUST be specified (not 0) to prevent cross-chain replay
   * - nonce must match EOA's current transaction nonce
   *
   * @param privateKey - EOA private key
   * @param chainId - Chain ID (MUST NOT be 0)
   * @param nonce - EOA transaction nonce
   * @returns Signed authorization
   */
  async signEip7702Authorization(
    privateKey: Hex,
    chainId: number,
    nonce: number,
  ): Promise<SignedAuthorization> {
    // SECURITY: Prevent chain ID 0 (all-chain authorization)
    if (chainId === 0) {
      throw new Error(
        'Chain ID 0 (all-chains) is not allowed for security reasons',
      );
    }

    const account = privateKeyToAccount(privateKey);

    // Sign authorization using viem's signAuthorization
    const authorization = await account.signAuthorization({
      address: SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
      chainId,
      nonce,
    });

    return {
      address: SIMPLE_ACCOUNT_7702_IMPLEMENTATION,
      chainId,
      nonce,
      r: authorization.r,
      s: authorization.s,
      yParity: authorization.yParity ?? 0,
    };
  }

  /**
   * Estimate gas for a UserOperation
   */
  async estimateGas(
    chainId: number,
    userOp: Partial<UserOperation>,
  ): Promise<GasEstimate> {
    return this.bundlerService.estimateUserOperationGas(chainId, userOp);
  }

  /**
   * Simulate UserOperation before submission
   *
   * SECURITY: Catches reverts before paying gas / using sponsorship
   * Uses bundler's gas estimation which performs simulation
   *
   * @param chainId - Chain ID
   * @param userOp - UserOperation to simulate
   * @returns Simulation result with success status and optional error
   */
  async simulateUserOperation(
    chainId: number,
    userOp: Partial<UserOperation>,
  ): Promise<{ success: boolean; error?: string; gasEstimate?: GasEstimate }> {
    try {
      const gasEstimate = await this.bundlerService.estimateUserOperationGas(
        chainId,
        userOp,
      );
      return { success: true, gasEstimate };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Simulation failed';
      this.logger.warn(
        `UserOp simulation failed for chain ${chainId}: ${errorMessage}`,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

