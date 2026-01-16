import { AllChainTypes } from '../types/chain.types.js';
import {
  IAccount,
  TokenBalance,
  TransactionResult,
} from '../types/account.types.js';

/**
 * Wallet addresses for all supported chains
 */
export interface WalletAddresses {
  ethereum: string;
  base: string;
  arbitrum: string;
  polygon: string;
  avalanche: string;
  tron: string;
  bitcoin: string;
  solana: string;
  moonbeamTestnet: string;
  astarShibuya: string;
  paseoPassetHub: string;
  hydration: string;
  unique: string;
  bifrost: string;
  bifrostTestnet: string;
  // Substrate/Polkadot chains (can be null if not derived)
  polkadot: string | null;
  hydrationSubstrate: string | null; // Note: Different from EVM hydration
  bifrostSubstrate: string | null; // Note: Different from EVM bifrost
  uniqueSubstrate: string | null; // Note: Different from EVM unique
  paseo: string | null;
  paseoAssethub: string | null;
  // Aptos chains
  aptos: string;
  aptosMainnet: string;
  aptosTestnet: string;
  aptosDevnet: string;
}

export type WalletAddressKey = keyof WalletAddresses;

export type WalletAddressKind =
  | 'eoa'
  | 'erc4337'
  | 'nonEvm'
  | 'substrate'
  | 'aptos';

export interface WalletAddressMetadata {
  chain: WalletAddressKey;
  address: string | null;
  kind: WalletAddressKind;
  visible: boolean;
  label: string;
}

export type WalletAddressMetadataMap = Record<
  WalletAddressKey,
  WalletAddressMetadata
>;

export interface SmartAccountSummary {
  key: 'evmSmartAccount';
  label: string;
  canonicalChain:
    | 'ethereum'
    | 'base'
    | 'arbitrum'
    | 'polygon'
    | 'avalanche'
    | null;
  address: string | null;
  chains: Record<
    | 'ethereum'
    | 'base'
    | 'arbitrum'
    | 'polygon'
    | 'avalanche',
    string | null
  >;
}

export interface UiWalletEntry {
  key: string;
  label: string;
  chain: string;
  address: string | null;
  category?: string;
}

export interface UiWalletPayload {
  smartAccount: SmartAccountSummary | null;
  auxiliary: UiWalletEntry[];
}

export interface WalletAddressContext {
  internal: WalletAddresses;
  metadata: WalletAddressMetadataMap;
  ui: UiWalletPayload;
}

export interface WalletConnectNamespacePayload {
  namespace: 'eip155' | 'polkadot' | 'solana';
  chains: string[];
  accounts: string[];
  addressesByChain: Record<string, string>;
}

/**
 * Seed phrase manager interface
 */
export interface ISeedManager {
  createRandomSeed(): string;
  validateMnemonic(mnemonic: string): boolean;
  storeSeed(userId: string, seedPhrase: string): Promise<void>;
  getSeed(userId: string): Promise<string>;
  hasSeed(userId: string): Promise<boolean>;
}

/**
 * Account factory interface for creating blockchain accounts
 */
export interface IAccountFactory {
  createAccount(
    seedPhrase: string,
    chain: AllChainTypes,
    accountIndex: number,
  ): Promise<IAccount>;
  getAccountType(): string;
}

/**
 * Address manager interface
 */
export interface IAddressManager {
  getAddresses(userId: string): Promise<WalletAddresses>;
  getManagedAddresses(userId: string): Promise<{
    addresses: WalletAddresses;
    metadata: WalletAddressMetadataMap;
  }>;
  getAddressForChain(userId: string, chain: AllChainTypes): Promise<string>;
  streamAddresses(
    userId: string,
  ): AsyncGenerator<{ chain: string; address: string | null }, void, unknown>;
}

/**
 * Balance manager interface
 */
export interface IBalanceManager {
  getBalances(
    userId: string,
  ): Promise<Array<{ chain: string; balance: string }>>;
  getTokenBalances(
    userId: string,
    chain: AllChainTypes,
  ): Promise<TokenBalance[]>;
  getTokenBalancesAny(userId: string): Promise<TokenBalance[]>;
  streamBalances(userId: string): AsyncGenerator<
    {
      chain: string;
      nativeBalance: string;
      tokens: TokenBalance[];
    },
    void,
    unknown
  >;
}

/**
 * Transaction manager interface
 */
export interface ITransactionManager {
  sendCrypto(
    userId: string,
    chain: AllChainTypes,
    recipientAddress: string,
    amount: string,
    tokenAddress?: string,
    tokenDecimals?: number,
    options?: { forceEip7702?: boolean },
  ): Promise<{ txHash: string }>;

  signWalletConnectTransaction(
    userId: string,
    chainId: string,
    transaction: any,
  ): Promise<{ txHash: string }>;

  getTransactionHistory(
    userId: string,
    chain: AllChainTypes,
    limit?: number,
  ): Promise<TransactionResult[]>;
}
