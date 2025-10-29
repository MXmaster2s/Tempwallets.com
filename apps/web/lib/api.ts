const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

export interface WalletAddresses {
  ethereum: string | null;
  tron: string | null;
  bitcoin: string | null;
  solana: string | null;
  ethereumErc4337: string | null;
  baseErc4337: string | null;
  arbitrumErc4337: string | null;
  polygonErc4337: string | null;
}

export interface WalletBalance {
  chain: string;
  balance: string;
}

export interface CreateOrImportSeedRequest {
  userId: string;
  mode: 'random' | 'mnemonic';
  mnemonic?: string;
}

export interface CreateOrImportSeedResponse {
  ok: boolean;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText || 'API request failed');
  }

  return response.json();
}

export const walletApi = {
  /**
   * Create or import a wallet seed phrase
   */
  async createOrImportSeed(data: CreateOrImportSeedRequest): Promise<CreateOrImportSeedResponse> {
    return fetchApi<CreateOrImportSeedResponse>('/wallet/seed', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get all wallet addresses for a user
   */
  async getAddresses(userId: string): Promise<WalletAddresses> {
    return fetchApi<WalletAddresses>(`/wallet/addresses?userId=${encodeURIComponent(userId)}`);
  },

  /**
   * Get balances for all chains
   */
  async getBalances(userId: string): Promise<WalletBalance[]> {
    return fetchApi<WalletBalance[]>(`/wallet/balances?userId=${encodeURIComponent(userId)}`);
  },

  /**
   * Get ERC-4337 paymaster token balances
   */
  async getErc4337PaymasterBalances(userId: string): Promise<WalletBalance[]> {
    return fetchApi<WalletBalance[]>(`/wallet/erc4337/paymaster-balances?userId=${encodeURIComponent(userId)}`);
  },
};

export { ApiError };
