import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface ZerionToken {
  type: 'token' | 'native';
  attributes: {
    quantity?: {
      int?: string;
      decimals?: number;
      float?: number;
      numeric?: string;
    };
    fungible_info?: {
      name?: string;
      symbol?: string;
      decimals?: number;
      implementations?: Array<{
        address?: string;
        chain_id?: string;
        decimals?: number;
      }>;
    };
  };
  relationships?: {
    chain?: {
      data?: {
        id?: string;
      };
    };
  };
}

// Portfolio summary format (when using portfolio endpoint)
interface ZerionPortfolioSummary {
  data: {
    attributes: {
      positions_distribution_by_chain?: Record<string, Array<ZerionToken>>;
    };
  };
  meta?: {
    currency?: string;
  };
}

// Positions array format (when using positions endpoint)
interface ZerionPositionsArray {
  data: Array<ZerionToken>;
  meta?: {
    currency?: string;
  };
}

// Union type to handle both response formats
type ZerionPortfolioResponse = ZerionPortfolioSummary | ZerionPositionsArray;

interface ZerionTransaction {
  type: string;
  id: string;
  attributes: {
    operation_type?: string;
    hash?: string;
    mined_at?: number;
    sent_at?: number;
    status?: string;
    nonce?: number;
    block_number?: number;
    block_confirmations?: number;
    fee?: {
      value?: number;
      value_usd?: number;
      price?: number;
    };
    transfers?: Array<{
      fungible_info?: {
        name?: string;
        symbol?: string;
        decimals?: number;
      };
      quantity?: {
        int?: string;
        decimals?: number;
      };
      value?: number;
      direction?: string;
      from?: {
        address?: string;
      };
      to?: {
        address?: string;
      };
    }>;
  };
  relationships?: {
    chain?: {
      data?: {
        id?: string;
      };
    };
  };
}

interface ZerionTransactionsResponse {
  data?: ZerionTransaction[];
  links?: {
    next?: string;
  };
}

export interface TokenBalance {
  chain: string;
  symbol: string;
  address: string | null;
  decimals: number | null;
  balanceSmallest: string;
  balanceHuman: number;
  name?: string;
}

@Injectable()
export class ZerionService {
  private readonly logger = new Logger(ZerionService.name);
  private readonly apiKey: string;
  // Zerion API base URL
  // Documentation: https://developers.zerion.io
  // All endpoints are under: https://api.zerion.io/v1
  private readonly baseUrl = 'https://api.zerion.io/v1';

  // In-memory cache
  private balanceCache = new Map<string, CachedData<any>>();
  private transactionCache = new Map<string, CachedData<ZerionTransaction[]>>();

  // Request deduplication - prevent concurrent duplicate requests
  private pendingRequests = new Map<string, Promise<any>>();

  // Cache TTLs in milliseconds
  private readonly BALANCE_TTL = 30 * 1000; // 30 seconds
  private readonly TRANSACTION_TTL = 60 * 1000; // 60 seconds

  // Chain mapping: internal chain names to Zerion chain IDs
  private readonly chainMap: Record<string, string> = {
    ethereum: 'eth',
    base: 'base',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    avalanche: 'avalanche',
    baseErc4337: 'base',
    arbitrumErc4337: 'arbitrum',
    polygonErc4337: 'polygon',
    ethereumErc4337: 'eth', // ERC-4337 uses same address as ethereum
    avalancheErc4337: 'avalanche',
    // Note: Zerion may not support all chains (tron, bitcoin, solana)
    // We'll handle gracefully
    tron: 'tron',
    bitcoin: 'btc',
    solana: 'sol',
  };

  // Zerion only supports EVM chains and Solana
  // Bitcoin and Tron are NOT supported and will cause 400 errors
  private readonly supportedZerionChains = [
    'eth',
    'base',
    'arbitrum',
    'polygon',
    'avalanche',
    'sol',
  ];

  constructor(private configService: ConfigService) {
    // Zerion API key format: Typically just the key, or may need "Basic" encoding
    // Check Zerion docs: https://developers.zerion.io for exact format
    this.apiKey = this.configService.get<string>('ZERION_API_KEY') || '';

    if (!this.apiKey) {
      this.logger.warn(
        'ZERION_API_KEY not found in environment variables. Zerion API calls will fail.',
      );
      this.logger.warn(
        'Get your API key from: https://zerion.io/api or https://developers.zerion.io',
      );
    }
  }

  /**
   * Get cache key for address and chain
   */
  private getCacheKey(
    address: string,
    chain: string,
    type: 'balance' | 'transaction',
  ): string {
    return `${type}:${address.toLowerCase()}:${chain}`;
  }

  /**
   * Get positions for an address across all supported chains (no chain filter)
   * Returns parsed TokenBalance objects with correct decimals from Zerion
   */
  async getPositionsAnyChain(address: string): Promise<TokenBalance[]> {
    const cacheKey = `balance-any:${address.toLowerCase()}`;
    const cached = this.getCached<TokenBalance[]>(
      cacheKey,
      this.BALANCE_TTL,
      'balance',
    );
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/wallets/${address}/positions/?sort=value`;

    try {
      const res = await this.makeRequest<ZerionPositionsArray>(url);

      if (!res || !Array.isArray(res.data)) {
        this.logger.warn(
          `Positions (any-chain) response invalid for ${address}`,
        );
        return [];
      }

      // Parse Zerion positions into TokenBalance objects using KISS principle
      const parsedTokens: TokenBalance[] = res.data.map((pos) => {
        const attributes = pos.attributes;
        const fungibleInfo = attributes?.fungible_info;
        const quantity = attributes?.quantity;
        const chain = pos.relationships?.chain?.data?.id || 'unknown';

        // KISS parsing: Always use Zerion's decimals, never default to 18
        const decimals =
          quantity?.decimals ??
          fungibleInfo?.implementations?.find((impl) => impl.chain_id === chain)
            ?.decimals ??
          fungibleInfo?.decimals ??
          null;

        // Find the correct address for this chain
        const address =
          fungibleInfo?.implementations?.find((impl) => impl.chain_id === chain)
            ?.address ?? null;

        return {
          chain,
          symbol: fungibleInfo?.symbol || 'UNKNOWN',
          address,
          decimals,
          balanceSmallest: quantity?.int || '0',
          balanceHuman: Number(quantity?.float || 0),
          name: fungibleInfo?.name,
        };
      });

      // Remove duplicates by chain + address/symbol
      const dedupedTokens = this.dedupeParsedTokens(parsedTokens);

      this.setCache(cacheKey, dedupedTokens, 'balance');
      this.logger.log(
        `Fetched ${dedupedTokens.length} positions for ${this.maskAddress(address)}`,
      );
      return dedupedTokens;
    } catch (e) {
      this.logger.error(
        `Positions (any-chain) failed for ${address}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * SIMPLE MODE: Fetch transactions for an address across all supported chains (no chain filter)
   * Returns a deduplicated transactions array by chain_id + tx hash
   */
  async getTransactionsAnyChain(
    address: string,
    limit: number = 100,
  ): Promise<ZerionTransaction[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const cacheKey = `transaction-any:${address.toLowerCase()}:${safeLimit}`;
    const cached = this.getCached<ZerionTransaction[]>(
      cacheKey,
      this.TRANSACTION_TTL,
      'transaction',
    );
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/wallets/${address}/transactions/?page[size]=${safeLimit}`;

    try {
      const res = await this.makeRequest<ZerionTransactionsResponse>(url);
      const data = Array.isArray(res?.data) ? res.data : [];
      const deduped = this.dedupeTransactions(data);
      this.setCache(cacheKey, deduped, 'transaction');
      this.logger.log(
        `Fetched ${deduped.length} transactions for ${this.maskAddress(address)}`,
      );
      return deduped;
    } catch (e) {
      this.logger.error(
        `Transactions (any-chain) failed for ${address}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  // --- Helpers for SIMPLE MODE ---
  private dedupePositions(items: ZerionToken[]): ZerionToken[] {
    const map = new Map<string, ZerionToken>();
    for (const p of items) {
      const chainId =
        p.relationships?.chain?.data?.id?.toLowerCase() || 'unknown';
      const implAddr =
        p.attributes?.fungible_info?.implementations?.[0]?.address?.toLowerCase();
      const kind = implAddr
        ? `token:${implAddr}`
        : `native:${p.attributes?.fungible_info?.symbol || p.type}`;
      const key = `${chainId}:${kind}`;
      if (!map.has(key)) map.set(key, p);
    }
    return Array.from(map.values());
  }

  private dedupeTransactions(items: ZerionTransaction[]): ZerionTransaction[] {
    const map = new Map<string, ZerionTransaction>();
    for (const t of items) {
      const chainId =
        t.relationships?.chain?.data?.id?.toLowerCase() || 'unknown';
      const hash = t.attributes?.hash?.toLowerCase() || t.id;
      const key = `${chainId}:${hash}`;
      if (!map.has(key)) map.set(key, t);
    }
    return Array.from(map.values());
  }

  private dedupeParsedTokens(items: TokenBalance[]): TokenBalance[] {
    const map = new Map<string, TokenBalance>();
    for (const token of items) {
      const chainId = token.chain.toLowerCase();
      const key = token.address
        ? `${chainId}:${token.address.toLowerCase()}`
        : `${chainId}:${token.symbol.toLowerCase()}`;
      if (!map.has(key)) map.set(key, token);
    }
    return Array.from(map.values());
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid<T>(
    cached: CachedData<T> | undefined,
    ttl: number,
  ): boolean {
    if (!cached) return false;
    return Date.now() - cached.timestamp < ttl;
  }

  /**
   * Get cached data if valid
   */
  private getCached<T>(
    key: string,
    ttl: number,
    type: 'balance' | 'transaction',
  ): T | null {
    const cache =
      type === 'balance' ? this.balanceCache : this.transactionCache;
    const cached = cache.get(key);
    if (this.isCacheValid(cached as CachedData<T> | undefined, ttl)) {
      return (cached as CachedData<T>)?.data || null;
    }
    // Remove expired cache
    cache.delete(key);
    return null;
  }

  /**
   * Store data in cache
   */
  private setCache<T>(
    key: string,
    data: T,
    type: 'balance' | 'transaction',
  ): void {
    const cache =
      type === 'balance' ? this.balanceCache : this.transactionCache;
    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache for a specific address and chain
   */
  invalidateCache(address: string, chain: string): void {
    const balanceKey = this.getCacheKey(address, chain, 'balance');
    const transactionKey = this.getCacheKey(address, chain, 'transaction');
    this.balanceCache.delete(balanceKey);
    this.transactionCache.delete(transactionKey);
    // Also clear any-chain caches for this address
    const addr = address.toLowerCase();
    const balanceAnyPrefix = `balance-any:${addr}`;
    const txAnyPrefix = `transaction-any:${addr}`;
    for (const key of Array.from(this.balanceCache.keys())) {
      if (key.startsWith(balanceAnyPrefix)) this.balanceCache.delete(key);
    }
    for (const key of Array.from(this.transactionCache.keys())) {
      if (key.startsWith(txAnyPrefix)) this.transactionCache.delete(key);
    }
    this.logger.log(
      `Invalidated cache for ${address} on ${chain} (including any-chain caches)`,
    );
  }

  /**
   * Make request to Zerion API with retry logic
   */
  private async makeRequest<T>(
    url: string,
    retries = 3,
    timeoutMs = 30000,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Zerion API key not configured');
    }

    // Zerion API authentication format
    // Documentation: https://developers.zerion.io shows "Credentials: Basic base64"
    // This means: encode API key as base64 for Basic authentication
    // Format: Basic base64(api_key:)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Zerion uses Basic auth with base64 encoded credentials
    // Format: username:password -> base64(username:password)
    // For API keys, typically: base64(api_key:)
    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited - wait and retry
              const waitTime = attempt * 1000;
              this.logger.warn(
                `Rate limited by Zerion API. Waiting ${waitTime}ms before retry ${attempt}/${retries}`,
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              continue;
            }

            const errorText = await response.text();
            throw new Error(
              `Zerion API error: ${response.status} - ${errorText}`,
            );
          }

          return (await response.json()) as T;
        } catch (fetchError) {
          clearTimeout(timeoutId);

          // Check if it's a timeout/abort error
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
          }

          throw fetchError;
        }
      } catch (error) {
        if (attempt === retries) {
          this.logger.error(
            `Zerion API request failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          throw error;
        }

        // Exponential backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        this.logger.warn(
          `Zerion API request failed, retrying in ${waitTime}ms (attempt ${attempt}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('Zerion API request failed');
  }

  /**
   * Get Zerion chain ID from internal chain name
   * Returns null if chain is not supported by Zerion API
   */
  private getZerionChain(chain: string): string | null {
    // Skip Polkadot EVM chains - they use RPC instead of Zerion
    const polkadotEvmChains = [
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
    ];
    if (polkadotEvmChains.includes(chain)) {
      return null;
    }

    const mappedChain = this.chainMap[chain];
    if (!mappedChain) {
      return null;
    }

    // Early skip for unsupported chains (Bitcoin, Tron)
    // Zerion only supports EVM chains and Solana
    if (!this.supportedZerionChains.includes(mappedChain)) {
      return null;
    }

    return mappedChain;
  }

  /**
   * Get portfolio/balances for an address on a specific chain
   */
  async getPortfolio(
    address: string,
    chain: string,
  ): Promise<ZerionPortfolioResponse | null> {
    const zerionChain = this.getZerionChain(chain);
    if (!zerionChain) {
      // Silently skip unsupported chains (Bitcoin, Tron) - don't log warnings
      // They're expected to not be supported
      return null;
    }

    const cacheKey = this.getCacheKey(address, chain, 'balance');
    const cached = this.getCached<ZerionPortfolioResponse>(
      cacheKey,
      this.BALANCE_TTL,
      'balance',
    );
    if (cached) {
      return cached;
    }

    // Request deduplication - prevent concurrent duplicate requests
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = this.fetchPortfolioInternal(
      address,
      chain,
      zerionChain,
      cacheKey,
    );
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Helper method to extract positions from portfolio response and filter by chain
   */
  private extractAndFilterPositions(
    response: ZerionPortfolioResponse,
    zerionChain: string | null,
  ): Array<ZerionToken> {
    let allPositions: Array<ZerionToken> = [];

    // Check if response is portfolio summary format (positions_distribution_by_chain)
    if (
      'data' in response &&
      response.data &&
      typeof response.data === 'object' &&
      !Array.isArray(response.data)
    ) {
      const summaryData = response.data as {
        attributes?: {
          positions_distribution_by_chain?: Record<string, Array<ZerionToken>>;
        };
      };

      if (summaryData.attributes?.positions_distribution_by_chain) {
        // Extract positions from all chains
        const positionsByChain =
          summaryData.attributes.positions_distribution_by_chain;

        // If chain filtering is requested, only get positions from that chain
        if (zerionChain) {
          // Try exact match first
          if (positionsByChain[zerionChain]) {
            allPositions = positionsByChain[zerionChain];
          } else {
            // Try case-insensitive match
            const matchingChainKey = Object.keys(positionsByChain).find(
              (key) => key.toLowerCase() === zerionChain.toLowerCase(),
            );
            if (matchingChainKey && positionsByChain[matchingChainKey]) {
              allPositions = positionsByChain[matchingChainKey];
            } else {
              // Chain_ids parameter may not have worked - get all positions and filter client-side
              Object.values(positionsByChain).forEach((positions) => {
                allPositions.push(...positions);
              });
            }
          }
        } else {
          // No chain filter - get all positions from all chains
          Object.values(positionsByChain).forEach((positions) => {
            allPositions.push(...positions);
          });
        }
      }
    }
    // Check if response is positions array format
    else if ('data' in response && Array.isArray(response.data)) {
      allPositions = response.data;
    }

    // If chain filtering is needed and we have positions, filter client-side
    if (zerionChain && allPositions.length > 0) {
      allPositions = allPositions.filter((position) => {
        // Check if position has relationship chain data
        if (position.relationships?.chain?.data?.id) {
          const positionChainId =
            position.relationships.chain.data.id.toLowerCase();
          return positionChainId === zerionChain.toLowerCase();
        }

        // Check if any implementation matches the requested chain
        if (position.attributes?.fungible_info?.implementations) {
          const implementations =
            position.attributes.fungible_info.implementations;
          return implementations.some((impl) => {
            // Check if chain_id matches
            if (impl.chain_id) {
              return impl.chain_id.toLowerCase() === zerionChain.toLowerCase();
            }
            // If no chain_id in implementation, we can't determine chain - include it
            // (This is a fallback - ideally chain_ids parameter should handle filtering)
            return true;
          });
        }

        // Native token without chain info - include it (will be filtered by caller if needed)
        // This is a conservative approach - we include it rather than exclude it
        return true;
      });
    }

    return allPositions;
  }

  /**
   * Internal method to fetch portfolio from Zerion API
   */
  private async fetchPortfolioInternal(
    address: string,
    chain: string,
    zerionChain: string,
    cacheKey: string,
  ): Promise<ZerionPortfolioResponse | null> {
    try {
      // Zerion API endpoint for portfolio
      // Documentation: https://developers.zerion.io/reference/getwalletportfolio
      // Endpoint: GET https://api.zerion.io/v1/wallets/{address}/portfolio
      //
      // Note: The portfolio endpoint may return a summary format with positions_distribution_by_chain
      // The chain_ids query parameter may not work, so we'll filter client-side if needed

      // Build URL - fetch portfolio without chain filter first (chain_ids may not work)
      // We'll filter client-side after fetching
      const url = `${this.baseUrl}/wallets/${address}/portfolio`;

      const response = await this.makeRequest<any>(url);

      // Validate response structure
      if (!response) {
        this.logger.warn(
          `Zerion returned null response for ${address} on ${chain}`,
        );
        return null;
      }

      if (response.data === undefined) {
        this.logger.warn(
          `Zerion response missing data field for ${address} on ${chain}`,
        );
        return null;
      }

      // Extract positions from response (handles both summary and array formats)
      let positions: Array<ZerionToken> = [];

      // Check if it's portfolio summary format (positions_distribution_by_chain)
      if (
        response.data &&
        typeof response.data === 'object' &&
        !Array.isArray(response.data)
      ) {
        if (response.data.attributes?.positions_distribution_by_chain) {
          positions = this.extractAndFilterPositions(
            response as ZerionPortfolioSummary,
            zerionChain,
          );
        } else {
          this.logger.warn(
            `Portfolio response has unexpected structure for ${address} on ${chain}`,
          );
          return null;
        }
      }
      // Check if it's positions array format
      else if (Array.isArray(response.data)) {
        positions = response.data;

        // Filter by chain if needed (chain_ids parameter may not have worked)
        if (zerionChain) {
          positions = positions.filter((position) => {
            // Check if position has relationship chain data
            if (position.relationships?.chain?.data?.id) {
              const positionChainId =
                position.relationships.chain.data.id.toLowerCase();
              return positionChainId === zerionChain.toLowerCase();
            }

            // Check if any implementation matches the requested chain
            if (position.attributes?.fungible_info?.implementations) {
              const implementations =
                position.attributes.fungible_info.implementations;
              return implementations.some((impl) => {
                // Check if chain_id matches
                if (impl.chain_id) {
                  return (
                    impl.chain_id.toLowerCase() === zerionChain.toLowerCase()
                  );
                }
                // If no chain_id in implementation, we can't determine chain - include it
                // (This is a fallback - ideally chain_ids parameter should handle filtering)
                return true;
              });
            }

            // Native token without chain info - include it (conservative approach)
            return true;
          });
        }
      } else {
        this.logger.warn(
          `Zerion returned unexpected portfolio structure for ${address} on ${chain}`,
        );
        return null;
      }

      // Normalize response to positions array format for consistent handling
      const normalizedResponse: ZerionPositionsArray = {
        data: positions,
        meta: response.meta,
      };

      // Cache the normalized response
      this.setCache(cacheKey, normalizedResponse, 'balance');

      return normalizedResponse;
    } catch (error) {
      this.logger.error(
        `Failed to fetch portfolio from Zerion: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Get transactions for an address on a specific chain
   */
  async getTransactions(
    address: string,
    chain: string,
    limit: number = 50,
  ): Promise<ZerionTransaction[]> {
    const zerionChain = this.getZerionChain(chain);
    if (!zerionChain) {
      // Silently skip unsupported chains - don't log warnings
      return [];
    }

    const cacheKey = this.getCacheKey(address, chain, 'transaction');
    const cached = this.getCached<ZerionTransaction[]>(
      cacheKey,
      this.TRANSACTION_TTL,
      'transaction',
    );
    if (cached) {
      return cached;
    }

    // Request deduplication - prevent concurrent duplicate requests
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = this.fetchTransactionsInternal(
      address,
      chain,
      zerionChain,
      limit,
      cacheKey,
    );
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method to fetch transactions from Zerion API
   */
  private async fetchTransactionsInternal(
    address: string,
    chain: string,
    zerionChain: string,
    limit: number,
    cacheKey: string,
  ): Promise<ZerionTransaction[]> {
    try {
      // Zerion API endpoint for transactions
      // Documentation: https://developers.zerion.io/reference/listwallettransactions
      // Endpoint: GET https://api.zerion.io/v1/wallets/{address}/transactions/
      //
      // Note: According to Zerion docs, this endpoint supports "a lot of filters, sorting,
      // and pagination parameters" but exact parameter names aren't specified in the base docs.
      // The docs mention keeping URL length under 2000 characters.

      // Build URL with trailing slash (as shown in Zerion docs)
      let url = `${this.baseUrl}/wallets/${address}/transactions/`;

      // Add query parameters
      const queryParams = new URLSearchParams();
      if (zerionChain) {
        queryParams.append('chain_ids', zerionChain); // Try chain_ids first
        // If this doesn't work, try: queryParams.append('chain_id', zerionChain);
      }

      // Pagination - Zerion docs mention pagination but format isn't specified
      // Try common formats:
      queryParams.append('page[size]', limit.toString()); // JSON:API style
      // Alternative formats to try if above doesn't work:
      // queryParams.append('limit', limit.toString());
      // queryParams.append('per_page', limit.toString());

      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      const response = await this.makeRequest<ZerionTransactionsResponse>(url);
      const transactions = response.data || [];

      this.setCache(cacheKey, transactions, 'transaction');

      return transactions;
    } catch (error) {
      this.logger.error(
        `Failed to fetch transactions from Zerion: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * Get token metadata (symbol, decimals, name) from portfolio or separate endpoint
   */
  async getTokenMetadata(
    address: string,
    chain: string,
    tokenAddress: string | null,
  ): Promise<{
    symbol: string;
    decimals: number;
    name?: string;
  } | null> {
    // For native tokens, return default values
    if (!tokenAddress) {
      const nativeSymbols: Record<string, string> = {
        ethereum: 'ETH',
        baseErc4337: 'ETH',
        arbitrumErc4337: 'ETH',
        polygonErc4337: 'MATIC',
        ethereumErc4337: 'ETH',
        tron: 'TRX',
        bitcoin: 'BTC',
        solana: 'SOL',
      };

      return {
        symbol: nativeSymbols[chain] || 'TOKEN',
        decimals: 18,
        name: nativeSymbols[chain] || 'Native Token',
      };
    }

    try {
      // Get portfolio to find token metadata
      const portfolio = await this.getPortfolio(address, chain);
      if (!portfolio?.data) {
        return null;
      }

      // Check if portfolio.data is an array (normalized format)
      if (!Array.isArray(portfolio.data)) {
        this.logger.warn(
          `Portfolio data is not in expected array format for token metadata lookup`,
        );
        return null;
      }

      // Find token in portfolio
      const token = portfolio.data.find((t) => {
        const implAddress =
          t.attributes?.fungible_info?.implementations?.[0]?.address?.toLowerCase();
        return implAddress === tokenAddress.toLowerCase();
      });

      if (token?.attributes?.fungible_info) {
        return {
          symbol: token.attributes.fungible_info.symbol || 'UNKNOWN',
          decimals: token.attributes.fungible_info.decimals || 18,
          name: token.attributes.fungible_info.name,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get token metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  private maskAddress(address: string | null | undefined): string {
    if (!address) {
      return 'unknown';
    }
    if (address.length <= 10) {
      return address;
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
