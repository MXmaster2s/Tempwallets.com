import { Account, SimpleTransaction, AccountAuthenticator } from '@aptos-labs/ts-sdk';

export interface TransferParams {
  senderAccount: Account;
  recipientAddress: string;
  amount: number; // In APT (human-readable)
  network: 'mainnet' | 'testnet' | 'devnet';
}

export interface TransactionResult {
  hash: string;
  success: boolean;
  version?: string;
  gasUsed?: string;
  sequenceNumber: number;
}

export interface SimulationResult {
  success: boolean;
  gasUsed: string;
  vmStatus: string;
}

