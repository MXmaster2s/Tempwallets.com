export interface WalletAddress {
  address: string;
  chainId: string;
}

export interface WalletTransaction {
  to: string;
  value: bigint;
  data?: string;
}

