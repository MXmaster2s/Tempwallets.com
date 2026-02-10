/**
 * CUSTODY CONTRACT ADAPTER
 *
 * Infrastructure Layer - External System Integration
 *
 * Handles on-chain custody contract interactions.
 * Deposits funds from wallet to Yellow Network custody contract.
 *
 * Flow:
 * 1. USDC.approve(custodyAddress, amount) - Allow custody to spend
 * 2. Custody.deposit(asset, amount, recipient) - Transfer to custody
 * 3. Yellow Network listens to DepositEvent
 * 4. Unified balance is credited
 *
 * This is the CRITICAL MISSING STEP that credits unified balance.
 */

import { Injectable } from '@nestjs/common';
import { createPublicClient, createWalletClient, http, Address } from 'viem';
import { base, arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ICustodyContractPort,
  DepositParams,
  WithdrawParams,
} from '../../application/custody/ports/custody-contract.port.js';

// ERC20 ABI (approve function)
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Custody Contract ABI — matches @erc7824/nitrolite custodyAbi
// deposit(account, token, amount) — NOTE: account is FIRST, token is SECOND, amount is THIRD
const CUSTODY_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// Custody contract addresses (Yellow Network - from yellow-sdk-tutorials)
const CUSTODY_ADDRESSES: Record<number, Address> = {
  8453: '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6' as Address, // Base Mainnet
  42161: '0x...' as Address, // Arbitrum - TODO: Get from Yellow Network docs
  84532: '0x...' as Address, // Base Sepolia (testnet)
};

@Injectable()
export class CustodyContractAdapter implements ICustodyContractPort {
  /**
   * Approve USDC for custody contract
   */
  async approveToken(params: DepositParams): Promise<string> {
    const { userPrivateKey, chainId, tokenAddress, amount } = params;

    const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
    const chain = this.getChain(chainId);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    console.log(`Approving ${amount} tokens for custody contract...`);

    const custodyAddress = this.getCustodyAddress(chainId);

    const hash = await walletClient.writeContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [custodyAddress, amount],
    });

    console.log(`✅ Approval transaction: ${hash}`);

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Approval confirmed`);

    return hash;
  }

  /**
   * Deposit to custody contract (THE CRITICAL STEP!)
   * This emits DepositEvent that Yellow Network indexes
   */
  async deposit(params: DepositParams): Promise<string> {
    const { userPrivateKey, chainId, tokenAddress, amount, userAddress } = params;

    const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
    const chain = this.getChain(chainId);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    console.log(`Depositing ${amount} tokens to custody contract...`);

    const custodyAddress = this.getCustodyAddress(chainId);

    const hash = await walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_ABI,
      functionName: 'deposit',
      args: [
        userAddress as Address,   // account (recipient of the custody credit)
        tokenAddress as Address,  // token (ERC20 to deposit)
        amount,                   // amount in token's smallest units
      ],
    });

    console.log(`✅ Deposit transaction: ${hash}`);

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Deposit confirmed in block ${receipt.blockNumber}`);
    console.log(`Yellow Network will now index this deposit and credit unified balance`);

    return hash;
  }

  /**
   * Withdraw from custody contract back to wallet (ON-CHAIN)
   * This reduces unified balance and returns funds to user
   */
  async withdraw(params: WithdrawParams): Promise<string> {
    const { userPrivateKey, chainId, tokenAddress, amount, userAddress } = params;

    const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
    const chain = this.getChain(chainId);

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    console.log(`Withdrawing ${amount} tokens from custody contract...`);

    // TODO: Get the actual withdraw function signature from Yellow Network
    // This is a placeholder - actual implementation depends on custody contract ABI
    const custodyAddress = this.getCustodyAddress(chainId);

    // Assuming there's a withdraw function on the custody contract
    // The actual ABI will need to be added once we have it from Yellow Network
    const CUSTODY_WITHDRAW_ABI = [
      {
        name: 'withdraw',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'asset', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
        outputs: [],
      },
    ] as const;

    const hash = await walletClient.writeContract({
      address: custodyAddress,
      abi: CUSTODY_WITHDRAW_ABI,
      functionName: 'withdraw',
      args: [
        tokenAddress as Address,
        amount,
        userAddress as Address,
      ],
    });

    console.log(`✅ Withdraw transaction: ${hash}`);

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Withdraw confirmed in block ${receipt.blockNumber}`);

    return hash;
  }

  /**
   * Get unified balance from Yellow Network
   * NOTE: This queries the off-chain unified balance, NOT custody contract
   */
  async getUnifiedBalance(userAddress: string, asset: string): Promise<string> {
    // TODO: Query Yellow Network API for unified balance
    // For now, this is a placeholder
    console.log(`Querying unified balance for ${userAddress}...`);
    return '0';
  }

  /**
   * Get custody contract address for chain
   */
  private getCustodyAddress(chainId: number): Address {
    const address = CUSTODY_ADDRESSES[chainId];
    if (!address || address === '0x...') {
      throw new Error(
        `Custody contract address not configured for chain ${chainId}. ` +
        `Please add the Yellow Network custody address to CUSTODY_ADDRESSES.`
      );
    }
    return address;
  }

  /**
   * Get viem chain config
   */
  private getChain(chainId: number) {
    switch (chainId) {
      case 8453:
        return base;
      case 42161:
        return arbitrum;
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}
