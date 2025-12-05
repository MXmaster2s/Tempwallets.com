const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

export interface SmartAccountSummary {
  key: 'evmSmartAccount';
  label: string;
  canonicalChain: 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche' | null;
  address: string | null;
  chains: Record<
    'ethereumErc4337' | 'baseErc4337' | 'arbitrumErc4337' | 'polygonErc4337' | 'avalancheErc4337',
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

export interface WalletBalance {
  chain: string;
  balance: string;
}

export interface TokenBalance {
  address: string | null;
  symbol: string;
  balance: string;
  decimals: number;
}

// Any-chain aggregated asset returned by backend /wallet/assets-any
export interface AnyChainAsset {
  chain: string; // zerion chain id, e.g., ethereum | base | arbitrum | polygon | solana
  address: string | null; // null for native
  symbol: string;
  balance: string; // smallest units (wei, satoshi, lamports, etc.)
  decimals: number; // actual token decimals (e.g., 6 for USDC, 18 for ETH/WETH, 8 for WBTC)
  balanceHuman?: string; // human-readable balance already converted by backend
}

export interface Transaction {
  txHash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: number | null;
  blockNumber: number | null;
  status: 'success' | 'failed' | 'pending';
  chain: string;
  tokenSymbol?: string;
  tokenAddress?: string;
}

export interface WalletConnectNamespacePayload {
  namespace: 'eip155';
  chains: string[];
  accounts: string[];
  addressesByChain: Record<string, string>;
}

export interface SendCryptoRequest {
  userId: string;
  chain: string;
  tokenAddress?: string;
  tokenDecimals?: number;
  amount: string;
  recipientAddress: string;
}

export interface SendCryptoResponse {
  txHash: string;
}

export interface CreateOrImportSeedRequest {
  userId: string;
  mode: 'random' | 'mnemonic';
  mnemonic?: string;
}

export interface CreateOrImportSeedResponse {
  ok: boolean;
}

// Wallet history entry for authenticated users
export interface WalletHistoryEntry {
  id: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number },
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const timeout = options?.timeout ?? 30000; // Default 30 seconds, can be overridden
  
  // Get auth token from localStorage if available
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const { timeout: _, ...fetchOptions } = options || {};
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions?.headers as Record<string, string>),
    };

    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = 'API request failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new ApiError(response.status, errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, 'Request timeout');
    }
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new ApiError(503, 'Network error. Please check your connection.');
    }
    throw new ApiError(500, error instanceof Error ? error.message : 'Unknown error');
  }
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
   * Get wallet history for authenticated users
   */
  async getWalletHistory(): Promise<{ wallets: WalletHistoryEntry[] }> {
    return fetchApi<{ wallets: WalletHistoryEntry[] }>('/wallet/history');
  },

  /**
   * Switch to a different wallet from history
   */
  async switchWallet(walletId: string): Promise<{ ok: boolean }> {
    return fetchApi<{ ok: boolean }>('/wallet/switch', {
      method: 'POST',
      body: JSON.stringify({ walletId }),
    });
  },

  /**
   * Delete a wallet from history
   */
  async deleteWalletHistory(walletId: string): Promise<{ ok: boolean }> {
    return fetchApi<{ ok: boolean }>(`/wallet/history/${encodeURIComponent(walletId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get all wallet addresses for a user
   */
  async getAddresses(userId: string): Promise<UiWalletPayload> {
    return fetchApi<UiWalletPayload>(`/wallet/addresses?userId=${encodeURIComponent(userId)}`);
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

  /**
   * Send crypto to a recipient address
   */
  async sendCrypto(data: SendCryptoRequest): Promise<SendCryptoResponse> {
    return fetchApi<SendCryptoResponse>('/wallet/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get token balances for a specific chain
   */
  async getTokenBalances(userId: string, chain: string): Promise<TokenBalance[]> {
    return fetchApi<TokenBalance[]>(
      `/wallet/token-balances?userId=${encodeURIComponent(userId)}&chain=${encodeURIComponent(chain)}`
    );
  },

  /**
   * Get transaction history for a specific chain
   */
  async getTransactionHistory(userId: string, chain: string, limit: number = 50): Promise<Transaction[]> {
    return fetchApi<Transaction[]>(
      `/wallet/transactions?userId=${encodeURIComponent(userId)}&chain=${encodeURIComponent(chain)}&limit=${limit}`
    );
  },

  /**
   * Get aggregated assets (any-chain) for primary addresses (EOA, ERC-4337, Solana)
   */
  async getAssetsAny(userId: string): Promise<AnyChainAsset[]> {
    return fetchApi<AnyChainAsset[]>(`/wallet/assets-any?userId=${encodeURIComponent(userId)}`);
  },

  /**
   * Get aggregated transactions (any-chain) for primary addresses
   */
  async getTransactionsAny(userId: string, limit: number = 100): Promise<Transaction[]> {
    return fetchApi<Transaction[]>(`/wallet/transactions-any?userId=${encodeURIComponent(userId)}&limit=${limit}`);
  },

  /**
   * Get WalletConnect-compatible accounts/namespaces for a user
   */
  async getWalletConnectAccounts(userId: string): Promise<WalletConnectNamespacePayload> {
    return fetchApi<WalletConnectNamespacePayload>(
      `/wallet/walletconnect/accounts?userId=${encodeURIComponent(userId)}`
    );
  },

  /**
   * Sign a WalletConnect transaction
   */
  async signWalletConnectTransaction(data: {
    userId: string;
    chainId: string;
    from: string;
    to?: string;
    value?: string;
    data?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
  }): Promise<{ txHash: string }> {
    return fetchApi<{ txHash: string }>('/wallet/walletconnect/sign', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Substrate/Polkadot API methods
   */

  /**
   * Get Substrate addresses for a user
   */
  async getSubstrateAddresses(userId: string, useTestnet: boolean = false): Promise<Record<string, string | null>> {
    const response = await fetchApi<{
      userId: string;
      useTestnet: boolean;
      addresses: Record<string, string | null>;
    }>(`/wallet/substrate/addresses?userId=${encodeURIComponent(userId)}&useTestnet=${useTestnet}`);
    return response.addresses;
  },

  /**
   * Get Substrate balances for all chains
   */
  async getSubstrateBalances(userId: string, useTestnet: boolean = false): Promise<Record<string, {
    balance: string;
    address: string | null;
    token: string;
    decimals: number;
  }>> {
    // Use longer timeout for Substrate balance calls (60 seconds) as RPC connections can be slow
    const url = `${API_BASE_URL}/wallet/substrate/balances?userId=${encodeURIComponent(userId)}&useTestnet=${useTestnet}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for Substrate

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'API request failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        throw new ApiError(response.status, errorMessage);
      }

      const data = await response.json();
      return data.balances;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout (Substrate RPC connections may be slow)');
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new ApiError(503, 'Network error. Please check your connection.');
      }
      throw new ApiError(500, error instanceof Error ? error.message : 'Unknown error');
    }
  },

  /**
   * Get Substrate transaction history
   */
  async getSubstrateTransactions(
    userId: string,
    chain: string,
    useTestnet: boolean = false,
    limit: number = 10,
    cursor?: string
  ): Promise<{
    transactions: Array<{
      txHash: string;
      blockNumber?: number;
      blockHash?: string;
      timestamp?: number;
      from: string;
      to?: string;
      amount?: string;
      fee?: string;
      status: 'pending' | 'inBlock' | 'finalized' | 'failed' | 'error';
      method?: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const params = new URLSearchParams({
      userId,
      chain,
      useTestnet: useTestnet.toString(),
      limit: limit.toString(),
    });
    if (cursor) {
      params.append('cursor', cursor);
    }
    // Use longer timeout (60 seconds) for transaction history as it may need to scan many blocks
    const response = await fetchApi<{
      userId: string;
      chain: string;
      useTestnet: boolean;
      history: {
        transactions: Array<{
          txHash: string;
          blockNumber?: number;
          blockHash?: string;
          timestamp?: number;
          from: string;
          to?: string;
          amount?: string;
          fee?: string;
          status: 'pending' | 'inBlock' | 'finalized' | 'failed' | 'error';
          method?: string;
        }>;
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
        nextCursor?: string;
      };
    }>(`/wallet/substrate/transactions?${params.toString()}`, { timeout: 60000 });
    return response.history;
  },

  /**
   * Send Substrate transfer
   */
  async sendSubstrateTransfer(data: {
    userId: string;
    chain: string;
    to: string;
    amount: string;
    useTestnet?: boolean;
    transferMethod?: 'transferAllowDeath' | 'transferKeepAlive';
  }): Promise<{
    success: boolean;
    txHash: string;
    status: string;
    blockHash?: string;
    error?: string;
  }> {
    return fetchApi<{
      success: boolean;
      txHash: string;
      status: string;
      blockHash?: string;
      error?: string;
    }>('/wallet/substrate/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get Substrate WalletConnect accounts (CAIP-10 formatted)
   */
  async getSubstrateWalletConnectAccounts(
    userId: string,
    useTestnet: boolean = false,
  ): Promise<{
    userId: string;
    useTestnet: boolean;
    accounts: Array<{
      accountId: string; // CAIP-10 format: polkadot:<genesis_hash>:<address>
      chain: string;
      address: string;
    }>;
  }> {
    return fetchApi<{
      userId: string;
      useTestnet: boolean;
      accounts: Array<{
        accountId: string;
        chain: string;
        address: string;
      }>;
    }>(`/wallet/substrate/walletconnect/accounts?userId=${encodeURIComponent(userId)}&useTestnet=${useTestnet}`);
  },

  /**
   * Sign a Substrate transaction for WalletConnect
   */
  async signSubstrateWalletConnectTransaction(data: {
    userId: string;
    accountId: string; // CAIP-10 format
    transactionPayload: string; // Hex-encoded transaction
    useTestnet?: boolean;
  }): Promise<{ signature: string }> {
    return fetchApi<{ signature: string }>('/wallet/substrate/walletconnect/sign-transaction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Sign a Substrate message for WalletConnect
   */
  async signSubstrateWalletConnectMessage(data: {
    userId: string;
    accountId: string; // CAIP-10 format
    message: string;
    useTestnet?: boolean;
  }): Promise<{ signature: string }> {
    return fetchApi<{ signature: string }>('/wallet/substrate/walletconnect/sign-message', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get EVM WalletConnect accounts (CAIP-10 formatted)
   */
  async getEvmWalletConnectAccounts(
    userId: string,
    useTestnet: boolean = false,
  ): Promise<{
    userId: string;
    useTestnet: boolean;
    accounts: Array<{
      accountId: string; // CAIP-10 format: eip155:<chain_id>:<address>
      chainId: string;
      address: string;
      chainName: string; // Internal chain name (ethereum, base, etc.)
    }>;
  }> {
    return fetchApi<{
      userId: string;
      useTestnet: boolean;
      accounts: Array<{
        accountId: string;
        chainId: string;
        address: string;
        chainName: string;
      }>;
    }>(`/wallet/evm/walletconnect/accounts?userId=${userId}&useTestnet=${useTestnet}`);
  },

  /**
   * Sign an EVM transaction for WalletConnect
   */
  async signEvmWalletConnectTransaction(data: {
    userId: string;
    accountId: string; // CAIP-10 format
    transaction: {
      from: string;
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      nonce?: string;
    };
    useTestnet?: boolean;
  }): Promise<{ signature: string }> {
    return fetchApi<{ signature: string }>('/wallet/evm/walletconnect/sign-transaction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Sign an EVM message for WalletConnect (personal_sign)
   */
  async signEvmWalletConnectMessage(data: {
    userId: string;
    accountId: string; // CAIP-10 format
    message: string;
    useTestnet?: boolean;
  }): Promise<{ signature: string }> {
    return fetchApi<{ signature: string }>('/wallet/evm/walletconnect/sign-message', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Sign EVM typed data for WalletConnect (eth_signTypedData)
   */
  async signEvmWalletConnectTypedData(data: {
    userId: string;
    accountId: string; // CAIP-10 format
    typedData: {
      types: Record<string, any>;
      primaryType: string;
      domain: Record<string, any>;
      message: Record<string, any>;
    };
    useTestnet?: boolean;
  }): Promise<{ signature: string }> {
    return fetchApi<{ signature: string }>('/wallet/evm/walletconnect/sign-typed-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Aptos API methods
   */

  /**
   * Get Aptos address for a user
   */
  async getAptosAddress(userId: string, network: 'mainnet' | 'testnet' | 'devnet' = 'testnet', accountIndex: number = 0): Promise<{
    address: string;
    network: string;
    accountIndex: number;
  }> {
    return fetchApi<{
      address: string;
      network: string;
      accountIndex: number;
    }>(`/wallet/aptos/address?userId=${encodeURIComponent(userId)}&network=${network}&accountIndex=${accountIndex}`);
  },

  /**
   * Get Aptos balance for a user
   */
  async getAptosBalance(userId: string, network: 'mainnet' | 'testnet' | 'devnet' = 'testnet'): Promise<{
    balance: string;
    network: string;
    currency: string;
  }> {
    return fetchApi<{
      balance: string;
      network: string;
      currency: string;
    }>(`/wallet/aptos/balance?userId=${encodeURIComponent(userId)}&network=${network}`);
  },

  /**
   * Send Aptos transaction
   */
  async sendAptosTransaction(data: {
    userId: string;
    recipientAddress: string;
    amount: number;
    network: 'mainnet' | 'testnet' | 'devnet';
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    transactionHash: string;
    sequenceNumber: number;
  }> {
    return fetchApi<{
      success: boolean;
      transactionHash: string;
      sequenceNumber: number;
    }>('/wallet/aptos/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Fund Aptos account from faucet (devnet only)
   */
  async fundAptosAccount(data: {
    userId: string;
    network: 'devnet';
    amount?: number;
  }): Promise<{
    success: boolean;
    message: string;
    transactionHash?: string;
    address: string;
  }> {
    return fetchApi<{
      success: boolean;
      message: string;
      transactionHash?: string;
      address: string;
    }>('/wallet/aptos/faucet', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * EIP-7702 Gasless Wallet API methods
   */

  /**
   * Get EIP-7702 EOA address
   */
  async getEip7702Address(userId: string, chainId?: number): Promise<{
    address: string;
    chainId?: number;
  }> {
    const params = new URLSearchParams({ userId });
    if (chainId) params.append('chainId', chainId.toString());
    return fetchApi<{ address: string; chainId?: number }>(
      `/wallet/eip7702/address?${params.toString()}`
    );
  },

  /**
   * Get delegation status for EIP-7702
   */
  async getEip7702DelegationStatus(userId: string, chainId: number): Promise<{
    userId: string;
    chainId: number;
    address: string;
    isDelegated: boolean;
    delegationAddress?: string;
    authorizedAt?: string;
  }> {
    return fetchApi<{
      userId: string;
      chainId: number;
      address: string;
      isDelegated: boolean;
      delegationAddress?: string;
      authorizedAt?: string;
    }>(`/wallet/eip7702/delegation-status?userId=${encodeURIComponent(userId)}&chainId=${chainId}`);
  },

  /**
   * Get supported chains for EIP-7702 gasless transactions
   */
  async getEip7702SupportedChains(): Promise<Array<{
    chainId: number;
    name: string;
    supportsEip7702: boolean;
    isTestnet: boolean;
  }>> {
    return fetchApi<Array<{
      chainId: number;
      name: string;
      supportsEip7702: boolean;
      isTestnet: boolean;
    }>>('/wallet/eip7702/supported-chains');
  },

  /**
   * Check if paymaster is available for a chain
   */
  async getEip7702PaymasterStatus(chainId: number): Promise<{
    chainId: number;
    isAvailable: boolean;
  }> {
    return fetchApi<{ chainId: number; isAvailable: boolean }>(
      `/wallet/eip7702/paymaster-status?chainId=${chainId}`
    );
  },

  /**
   * Get remaining sponsorship allowance for user
   */
  async getEip7702Allowance(userId: string): Promise<{
    dailyRemaining: string;
    monthlyRemaining: string;
    transactionsRemaining: number;
  }> {
    return fetchApi<{
      dailyRemaining: string;
      monthlyRemaining: string;
      transactionsRemaining: number;
    }>(`/wallet/eip7702/allowance?userId=${encodeURIComponent(userId)}`);
  },

  /**
   * Send gasless transaction via EIP-7702
   */
  async sendEip7702Gasless(data: {
    userId: string;
    chainId: number;
    recipientAddress: string;
    amount: string;
    tokenAddress?: string;
    tokenDecimals?: number;
  }): Promise<{
    success: boolean;
    userOpHash: string;
    transactionHash?: string;
    isFirstTransaction: boolean;
    explorerUrl?: string;
  }> {
    return fetchApi<{
      success: boolean;
      userOpHash: string;
      transactionHash?: string;
      isFirstTransaction: boolean;
      explorerUrl?: string;
    }>('/wallet/eip7702/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Send batch of gasless transactions via EIP-7702
   */
  async sendEip7702Batch(data: {
    userId: string;
    chainId: number;
    calls: Array<{
      to: string;
      value?: string;
      data?: string;
    }>;
  }): Promise<{
    success: boolean;
    userOpHash: string;
    transactionHash?: string;
    isFirstTransaction: boolean;
    explorerUrl?: string;
  }> {
    return fetchApi<{
      success: boolean;
      userOpHash: string;
      transactionHash?: string;
      isFirstTransaction: boolean;
      explorerUrl?: string;
    }>('/wallet/eip7702/send-batch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get EIP-7702 UserOperation receipt
   */
  async getEip7702Receipt(chainId: number, userOpHash: string): Promise<{
    found: boolean;
    userOpHash?: string;
    transactionHash?: string;
    success?: boolean;
    blockNumber?: string;
    gasUsed?: string;
    gasCost?: string;
    reason?: string;
    explorerUrl?: string;
    message?: string;
  }> {
    return fetchApi<{
      found: boolean;
      userOpHash?: string;
      transactionHash?: string;
      success?: boolean;
      blockNumber?: string;
      gasUsed?: string;
      gasCost?: string;
      reason?: string;
      explorerUrl?: string;
      message?: string;
    }>(`/wallet/eip7702/receipt?chainId=${chainId}&userOpHash=${encodeURIComponent(userOpHash)}`);
  },

  /**
   * Wait for EIP-7702 UserOperation confirmation
   */
  async waitEip7702Confirmation(data: {
    chainId: number;
    userOpHash: string;
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    userOpHash: string;
    transactionHash: string;
    executionSuccess: boolean;
    blockNumber: string;
    gasUsed: string;
    gasCost: string;
    reason?: string;
    explorerUrl: string;
  }> {
    return fetchApi<{
      success: boolean;
      userOpHash: string;
      transactionHash: string;
      executionSuccess: boolean;
      blockNumber: string;
      gasUsed: string;
      gasCost: string;
      reason?: string;
      explorerUrl: string;
    }>('/wallet/eip7702/wait-for-confirmation', {
      method: 'POST',
      body: JSON.stringify(data),
      timeout: data.timeoutMs ? data.timeoutMs + 10000 : 130000, // Add buffer
    });
  },

  /**
   * Get EIP-7702 native balance
   */
  async getEip7702Balance(userId: string, chainId: number): Promise<{
    balance: string;
    chainId: number;
  }> {
    return fetchApi<{ balance: string; chainId: number }>(
      `/wallet/eip7702/balance?userId=${encodeURIComponent(userId)}&chainId=${chainId}`
    );
  },
};

/**
 * Helper function to subscribe to Server-Sent Events
 */
export function subscribeToSSE<T>(
  url: string,
  onMessage: (data: T) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
): () => void {
  const eventSource = new EventSource(url);
  let isClosed = false;

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'complete') {
        if (onComplete) onComplete();
        eventSource.close();
        isClosed = true;
        return;
      }
      onMessage(data);
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    if (onError) {
      onError(new Error('SSE connection error'));
    }
    if (!isClosed) {
      eventSource.close();
      isClosed = true;
    }
  };

  // Return cleanup function
  return () => {
    if (!isClosed) {
      eventSource.close();
      isClosed = true;
    }
  };
}

export { ApiError };
