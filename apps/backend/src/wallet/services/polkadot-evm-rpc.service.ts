import { Injectable, Logger } from '@nestjs/common';
import { ChainConfigService } from '../config/chain.config.js';
import { TokenListService } from './token-list.service.js';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface TokenBalance {
  chain: string;
  address: string | null;
  symbol: string;
  balance: string;
  decimals: number;
  balanceHuman?: string;
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
}

/**
 * RPC Service for Polkadot EVM-compatible chains
 * Handles direct JSON-RPC calls for balance and transaction fetching
 */
@Injectable()
export class PolkadotEvmRpcService {
  private readonly logger = new Logger(PolkadotEvmRpcService.name);

  // Polkadot EVM chains that use RPC instead of Zerion
  private readonly polkadotEvmChains = [
    'moonbeamTestnet',
    'astarShibuya',
    'paseoPassetHub',
  ];

  // In-memory cache
  private balanceCache = new Map<string, CachedData<string>>();
  private tokenBalanceCache = new Map<string, CachedData<TokenBalance[]>>();
  private transactionCache = new Map<string, CachedData<Transaction[]>>();

  // Cache TTLs in milliseconds
  private readonly BALANCE_TTL = 30 * 1000; // 30 seconds
  private readonly TRANSACTION_TTL = 60 * 1000; // 60 seconds

  // Request deduplication
  private pendingRequests = new Map<string, Promise<any>>();

  constructor(
    private chainConfig: ChainConfigService,
    private tokenListService: TokenListService,
  ) {}

  /**
   * Check if a chain uses RPC instead of Zerion
   */
  isPolkadotEvmChain(chain: string): boolean {
    return this.polkadotEvmChains.includes(chain);
  }

  /**
   * Make a JSON-RPC call to a chain endpoint
   */
  private async makeRpcCall<T>(
    rpcUrl: string,
    method: string,
    params: any[],
    retries = 3,
  ): Promise<T> {
    const requestId = Math.floor(Math.random() * 1000000);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
            id: requestId,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`RPC request failed with status ${response.status}`);
        }

        const data = (await response.json()) as RpcResponse<T>;

        if (data.error) {
          throw new Error(
            `RPC error: ${data.error.message} (code: ${data.error.code})`,
          );
        }

        if (data.result === undefined) {
          throw new Error('RPC response missing result');
        }

        return data.result;
      } catch (error) {
        const isLastAttempt = attempt === retries - 1;
        if (isLastAttempt) {
          this.logger.error(
            `RPC call failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          throw error;
        }

        // Exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('RPC call failed');
  }

  /**
   * Get native token balance for an address
   */
  async getNativeBalance(
    address: string,
    chain: string,
  ): Promise<{ balance: string; balanceHuman: string } | null> {
    if (!this.isPolkadotEvmChain(chain)) {
      return null;
    }

    const cacheKey = `${chain}:${address.toLowerCase()}:native`;
    const cached = this.getCached<string>(cacheKey, this.BALANCE_TTL);
    if (cached) {
      const balanceHuman = this.convertWeiToHuman(cached, 18);
      return { balance: cached, balanceHuman };
    }

    // Request deduplication
    if (this.pendingRequests.has(cacheKey)) {
      const result = await this.pendingRequests.get(cacheKey);
      const balanceHuman = this.convertWeiToHuman(result, 18);
      return { balance: result, balanceHuman };
    }

    try {
      const config = this.chainConfig.getEvmChainConfig(chain as any);
      const requestPromise = this.makeRpcCall<string>(
        config.rpcUrl,
        'eth_getBalance',
        [address, 'latest'],
      );

      this.pendingRequests.set(cacheKey, requestPromise);

      const balanceHex = await requestPromise;
      const balance = BigInt(balanceHex).toString();

      // Cache the result
      this.balanceCache.set(cacheKey, {
        data: balance,
        timestamp: Date.now(),
      });

      const balanceHuman = this.convertWeiToHuman(balance, 18);

      return { balance, balanceHuman };
    } catch (error) {
      this.logger.error(
        `Failed to fetch native balance for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Get ERC-20 token balance for an address
   * ONLY fetches balances for tokens in the token list (no discovery)
   */
  async getTokenBalances(
    address: string,
    chain: string,
  ): Promise<TokenBalance[]> {
    if (!this.isPolkadotEvmChain(chain)) {
      return [];
    }

    const cacheKey = `${chain}:${address.toLowerCase()}:tokens`;
    const cached = this.tokenBalanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.BALANCE_TTL) {
      return cached.data;
    }

    try {
      // Get token list for this chain
      const tokens = this.tokenListService.getTokensForChain(chain);
      if (tokens.length === 0) {
        this.logger.debug(`No tokens found in list for chain: ${chain}`);
        return [];
      }

      const config = this.chainConfig.getEvmChainConfig(chain as any);
      const balances: TokenBalance[] = [];

      // Fetch balances for each token with rate limiting
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token) {
          continue; // Skip if token is undefined
        }

        // Add delay between requests to avoid rate limiting (200ms = ~5 req/sec)
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        try {
          // Get balance using balanceOf(address)
          const balanceHex = await this.callTokenMethod<string>(
            config.rpcUrl,
            token.address,
            'balanceOf',
            [address],
          );

          if (!balanceHex || balanceHex === '0x' || balanceHex === '0x0') {
            continue; // Skip zero balances
          }

          const balance = BigInt(balanceHex).toString();
          if (balance === '0') {
            continue; // Skip zero balances
          }

          // Get decimals (use from list if available, otherwise fetch from chain)
          let decimals = token.decimals;
          if (decimals === null) {
            try {
              const decimalsHex = await this.callTokenMethod<string>(
                config.rpcUrl,
                token.address,
                'decimals',
                [],
              );
              decimals = parseInt(decimalsHex, 16);
            } catch (error) {
              this.logger.debug(
                `Failed to fetch decimals for token ${token.address} on ${chain}, using default 18`,
              );
              decimals = 18; // Default to 18 if fetch fails
            }
          }

          const balanceHuman = this.convertWeiToHuman(balance, decimals);

          balances.push({
            chain,
            address: token.address,
            symbol: token.symbol,
            balance,
            decimals,
            balanceHuman,
          });
        } catch (error) {
          // Skip tokens that fail (might not exist or not be ERC-20)
          this.logger.debug(
            `Error fetching balance for token ${token.address} on ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          continue;
        }
      }

      // Cache the result
      this.tokenBalanceCache.set(cacheKey, {
        data: balances,
        timestamp: Date.now(),
      });

      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to fetch token balances for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * Call an ERC-20 token method using eth_call
   */
  private async callTokenMethod<T>(
    rpcUrl: string,
    tokenAddress: string,
    method: 'balanceOf' | 'decimals' | 'symbol',
    params: any[],
  ): Promise<T> {
    let data: string;

    switch (method) {
      case 'balanceOf':
        // balanceOf(address) - 0x70a08231 + padded address (32 bytes)
        if (params.length !== 1 || !params[0]) {
          throw new Error('balanceOf requires an address parameter');
        }
        const address = params[0].startsWith('0x')
          ? params[0].slice(2)
          : params[0];
        data = `0x70a08231${address.padStart(64, '0')}`;
        break;
      case 'decimals':
        // decimals() - 0x313ce567
        data = '0x313ce567';
        break;
      case 'symbol':
        // symbol() - 0x95d89b41
        data = '0x95d89b41';
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    const result = await this.makeRpcCall<string>(rpcUrl, 'eth_call', [
      {
        to: tokenAddress,
        data,
      },
      'latest',
    ]);

    return result as T;
  }

  /**
   * Get transaction history for an address
   * Note: This is a simplified implementation. For production, you'd want to:
   * - Use block explorer APIs if available
   * - Implement efficient block scanning
   * - Cache transaction data
   */
  async getTransactions(
    address: string,
    chain: string,
    limit: number = 100,
  ): Promise<Transaction[]> {
    if (!this.isPolkadotEvmChain(chain)) {
      return [];
    }

    const cacheKey = `${chain}:${address.toLowerCase()}:txs:${limit}`;
    const cached = this.getCached<Transaction[]>(
      cacheKey,
      this.TRANSACTION_TTL,
    );
    if (cached) {
      return cached;
    }

    try {
      const config = this.chainConfig.getEvmChainConfig(chain as any);

      // Get current block number
      const currentBlockHex = await this.makeRpcCall<string>(
        config.rpcUrl,
        'eth_blockNumber',
        [],
      );
      const currentBlock = parseInt(currentBlockHex, 16);

      // Reduce block range to avoid rate limiting (scan last 100 blocks instead of 1000)
      const startBlock = Math.max(0, currentBlock - 100);
      const transactions: Transaction[] = [];
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      // Scan blocks with rate limiting
      for (
        let blockNum = currentBlock;
        blockNum >= startBlock && transactions.length < limit;
        blockNum--
      ) {
        try {
          // Add delay between requests to avoid rate limiting (200ms = ~5 req/sec)
          if (blockNum < currentBlock) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          const blockHex = `0x${blockNum.toString(16)}`;
          const block = await this.makeRpcCall<any>(
            config.rpcUrl,
            'eth_getBlockByNumber',
            [blockHex, true], // true to include full transaction objects
          );

          consecutiveErrors = 0; // Reset on success

          if (block && block.transactions) {
            for (const tx of block.transactions) {
              if (
                tx.from?.toLowerCase() === address.toLowerCase() ||
                tx.to?.toLowerCase() === address.toLowerCase()
              ) {
                const timestamp = block.timestamp
                  ? parseInt(block.timestamp, 16) * 1000
                  : null;

                transactions.push({
                  txHash: tx.hash || '',
                  from: tx.from || '',
                  to: tx.to || null,
                  value: tx.value ? BigInt(tx.value).toString() : '0',
                  timestamp,
                  blockNumber: blockNum,
                  status: tx.blockNumber ? 'success' : 'pending',
                  chain,
                });

                if (transactions.length >= limit) break;
              }
            }
          }
        } catch (error) {
          consecutiveErrors++;

          // If we get rate limited (429), stop scanning to avoid more errors
          if (
            error instanceof Error &&
            (error.message.includes('429') ||
              error.message.includes('rate limit') ||
              error.message.includes('Too Many Requests'))
          ) {
            this.logger.warn(
              `Rate limited on ${chain}. Stopping block scan at block ${blockNum}. Found ${transactions.length} transactions so far.`,
            );
            break; // Exit the loop early
          }

          // If too many consecutive errors, stop scanning
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            this.logger.warn(
              `Too many consecutive errors on ${chain}. Stopping block scan. Found ${transactions.length} transactions so far.`,
            );
            break;
          }

          // Continue scanning other blocks if one fails
          this.logger.debug(
            `Error scanning block ${blockNum} on ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      // Sort by block number (newest first)
      transactions.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));

      // Cache the result (even if empty or partial)
      this.transactionCache.set(cacheKey, {
        data: transactions,
        timestamp: Date.now(),
      });

      return transactions;
    } catch (error) {
      this.logger.error(
        `Failed to fetch transactions for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * Get all assets (native + tokens) for an address on a Polkadot EVM chain
   */
  async getAssets(
    address: string,
    chain: string,
  ): Promise<
    Array<{
      chain: string;
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
      balanceHuman?: string;
    }>
  > {
    if (!this.isPolkadotEvmChain(chain)) {
      return [];
    }

    const assets: Array<{
      chain: string;
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
      balanceHuman?: string;
    }> = [];

    try {
      // Get native balance
      const nativeBalance = await this.getNativeBalance(address, chain);
      if (
        nativeBalance &&
        nativeBalance.balance !== '0' &&
        BigInt(nativeBalance.balance) > 0n
      ) {
        const config = this.chainConfig.getEvmChainConfig(chain as any);
        assets.push({
          chain,
          address: null,
          symbol: config.nativeCurrency.symbol,
          balance: nativeBalance.balance,
          decimals: config.nativeCurrency.decimals,
          balanceHuman: nativeBalance.balanceHuman,
        });
      }

      // Get token balances from token list
      const tokenBalances = await this.getTokenBalances(address, chain);
      for (const tokenBalance of tokenBalances) {
        assets.push({
          chain: tokenBalance.chain,
          address: tokenBalance.address,
          symbol: tokenBalance.symbol,
          balance: tokenBalance.balance,
          decimals: tokenBalance.decimals,
          balanceHuman: tokenBalance.balanceHuman,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch assets for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return assets;
  }

  /**
   * Convert wei (or smallest unit) to human-readable format
   */
  private convertWeiToHuman(wei: string, decimals: number): string {
    const weiBigInt = BigInt(wei);
    const divisor = BigInt(10 ** decimals);
    const whole = weiBigInt / divisor;
    const remainder = weiBigInt % divisor;

    if (remainder === 0n) {
      return whole.toString();
    }

    const remainderStr = remainder.toString().padStart(decimals, '0');
    const trimmedRemainder = remainderStr.replace(/0+$/, '');
    return `${whole}.${trimmedRemainder}`;
  }

  /**
   * Get cached data if still valid
   */
  private getCached<T>(key: string, ttl: number): T | null {
    const cache = this.getCacheForType<T>(key);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  }

  /**
   * Get the appropriate cache map based on key prefix
   */
  private getCacheForType<T>(key: string): Map<string, CachedData<T>> {
    if (key.includes(':txs:')) {
      return this.transactionCache as Map<string, CachedData<T>>;
    }
    if (key.includes(':tokens')) {
      return this.tokenBalanceCache as Map<string, CachedData<T>>;
    }
    return this.balanceCache as Map<string, CachedData<T>>;
  }
}
