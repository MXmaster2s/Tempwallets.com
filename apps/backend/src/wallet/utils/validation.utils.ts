import { BadRequestException } from '@nestjs/common';

/**
 * Validation utilities for wallet operations
 */

/**
 * Validate mnemonic phrase
 * @param mnemonic - Mnemonic phrase to validate
 * @returns true if valid, throws error otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new BadRequestException('Mnemonic is required and must be a string');
  }

  const words = mnemonic.trim().split(/\s+/);

  // Must be 12 or 24 words
  if (words.length !== 12 && words.length !== 24) {
    throw new BadRequestException('Mnemonic must be 12 or 24 words');
  }

  // Check for empty words
  if (words.some((word) => !word || word.trim().length === 0)) {
    throw new BadRequestException('Mnemonic contains empty words');
  }

  return true;
}

/**
 * Validate Ethereum address
 * @param address - Address to validate
 * @returns true if valid, throws error otherwise
 */
export function validateEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    throw new BadRequestException('Address is required and must be a string');
  }

  // Basic Ethereum address validation (0x + 40 hex chars)
  const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

  if (!ethereumAddressRegex.test(address)) {
    throw new BadRequestException('Invalid Ethereum address format');
  }

  return true;
}

/**
 * Validate amount
 * @param amount - Amount to validate
 * @returns true if valid, throws error otherwise
 */
export function validateAmount(amount: string): boolean {
  if (!amount || typeof amount !== 'string') {
    throw new BadRequestException('Amount is required and must be a string');
  }

  const amountNum = parseFloat(amount);

  if (isNaN(amountNum)) {
    throw new BadRequestException('Amount must be a valid number');
  }

  if (amountNum <= 0) {
    throw new BadRequestException('Amount must be greater than zero');
  }

  if (!isFinite(amountNum)) {
    throw new BadRequestException('Amount must be a finite number');
  }

  return true;
}

/**
 * Validate token decimals
 * @param decimals - Decimals to validate
 * @returns true if valid, throws error otherwise
 */
export function validateDecimals(decimals: number): boolean {
  if (typeof decimals !== 'number') {
    throw new BadRequestException('Decimals must be a number');
  }

  if (!Number.isInteger(decimals)) {
    throw new BadRequestException('Decimals must be an integer');
  }

  if (decimals < 0 || decimals > 36) {
    throw new BadRequestException('Decimals must be between 0 and 36');
  }

  return true;
}

/**
 * Validate chain name
 * @param chain - Chain name to validate
 * @param supportedChains - List of supported chains
 * @returns true if valid, throws error otherwise
 */
export function validateChain(
  chain: string,
  supportedChains: string[],
): boolean {
  if (!chain || typeof chain !== 'string') {
    throw new BadRequestException('Chain is required and must be a string');
  }

  if (!supportedChains.includes(chain)) {
    throw new BadRequestException(
      `Unsupported chain: ${chain}. Supported chains: ${supportedChains.join(', ')}`,
    );
  }

  return true;
}

/**
 * Validate transaction hash
 * @param txHash - Transaction hash to validate
 * @returns true if valid, throws error otherwise
 */
export function validateTxHash(txHash: string): boolean {
  if (!txHash || typeof txHash !== 'string') {
    throw new BadRequestException(
      'Transaction hash is required and must be a string',
    );
  }

  // Basic validation - should be 0x + 64 hex chars
  const txHashRegex = /^0x[a-fA-F0-9]{64}$/;

  if (!txHashRegex.test(txHash)) {
    throw new BadRequestException('Invalid transaction hash format');
  }

  return true;
}

/**
 * Validate balance is sufficient
 * @param balance - Available balance
 * @param amount - Amount to send
 * @returns true if sufficient, throws error otherwise
 */
export function validateSufficientBalance(
  balance: bigint,
  amount: bigint,
): boolean {
  if (balance < amount) {
    throw new BadRequestException(
      `Insufficient balance. Available: ${balance.toString()}, Required: ${amount.toString()}`,
    );
  }

  return true;
}

/**
 * Get block explorer URL for a transaction
 * @param txHash - Transaction hash
 * @param chain - Chain name or chain ID
 * @returns Block explorer URL
 */
export function getExplorerUrl(
  txHash: string,
  chain: string | number,
): string {
  // Convert chain ID to chain name if needed
  const chainIdMap: Record<number, string> = {
    1: 'ethereum',
    8453: 'base',
    42161: 'arbitrum',
    10: 'optimism',
    137: 'polygon',
    43114: 'avalanche',
    11155111: 'sepolia',
    56: 'bnb',
  };

  const chainName =
    typeof chain === 'number' ? chainIdMap[chain] || 'ethereum' : chain;

  // EVM chain explorers
  const evmExplorers: Record<string, string> = {
    ethereum: 'https://etherscan.io',
    base: 'https://basescan.org',
    arbitrum: 'https://arbiscan.io',
    optimism: 'https://optimistic.etherscan.io',
    polygon: 'https://polygonscan.com',
    avalanche: 'https://snowtrace.io',
    sepolia: 'https://sepolia.etherscan.io',
    bnb: 'https://bscscan.com',
  };

  if (evmExplorers[chainName]) {
    return `${evmExplorers[chainName]}/tx/${txHash}`;
  }

  // Non-EVM chains
  const nonEvmExplorers: Record<string, string> = {
    tron: `https://tronscan.org/#/transaction/${txHash}`,
    bitcoin: `https://blockstream.info/tx/${txHash}`,
    solana: `https://solscan.io/tx/${txHash}`,
    aptos: `https://explorer.aptoslabs.com/?network=mainnet&transaction=${txHash}`,
    aptosTestnet: `https://explorer.aptoslabs.com/?network=testnet&transaction=${txHash}`,
  };

  if (nonEvmExplorers[chainName]) {
    return nonEvmExplorers[chainName];
  }

  // Substrate/Polkadot chains
  const substrateExplorers: Record<string, string> = {
    polkadot: 'https://polkadot.subscan.io',
    hydrationSubstrate: 'https://hydradx.subscan.io',
    bifrostSubstrate: 'https://bifrost.subscan.io',
    uniqueSubstrate: 'https://unique.subscan.io',
    paseo: 'https://paseo.subscan.io',
    paseoAssethub: 'https://assethub-paseo.subscan.io',
  };

  if (substrateExplorers[chainName]) {
    return `${substrateExplorers[chainName]}/extrinsic/${txHash}`;
  }

  // Default fallback
  return `https://etherscan.io/tx/${txHash}`;
}
