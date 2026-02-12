import {
  Injectable,
  BadRequestException,
  Logger,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPublicClient, http, formatEther } from 'viem';
import { ConfigService } from '@nestjs/config';
import { SeedRepository } from './seed.repository.js';
import { ZerionService, TokenBalance } from './zerion.service.js';
import { SeedManager } from './managers/seed.manager.js';
import { AddressManager } from './managers/address.manager.js';
import { AccountFactory } from './factories/account.factory.js';
import { NativeEoaFactory } from './factories/native-eoa.factory.js';
import { Eip7702AccountFactory } from './factories/eip7702-account.factory.js';
import { PolkadotEvmRpcService } from './services/polkadot-evm-rpc.service.js';
import { SubstrateManager } from './substrate/managers/substrate.manager.js';
import { SubstrateChainKey } from './substrate/config/substrate-chain.config.js';
import { BalanceCacheRepository } from './repositories/balance-cache.repository.js';
import { WalletHistoryRepository } from './repositories/wallet-history.repository.js';
import { Eip7702DelegationRepository } from './repositories/eip7702-delegation.repository.js';
import { IAccount } from './types/account.types.js';
import { AllChainTypes } from './types/chain.types.js';
import {
  WalletAddresses,
  UiWalletPayload,
  WalletAddressContext,
  WalletAddressMetadataMap,
  SmartAccountSummary,
  UiWalletEntry,
  WalletAddressKey,
  WalletAddressKind,
  WalletConnectNamespacePayload,
} from './interfaces/wallet.interfaces.js';
import {
  convertToSmallestUnits,
  convertSmallestToHuman,
} from './utils/conversion.utils.js';
import { validateAmount, getExplorerUrl } from './utils/validation.utils.js';
import { PimlicoConfigService } from './config/pimlico.config.js';
import { ChainConfigService } from './config/chain.config.js';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  // Cache for discovered tokens: userId:chain -> { tokens, timestamp }
  private tokenCache: Map<
    string,
    {
      tokens: Array<{
        address: string | null;
        symbol: string;
        balance: string;
        decimals: number;
      }>;
      timestamp: number;
    }
  > = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
  private readonly SMART_ACCOUNT_CHAIN_KEYS: Array<
    'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche'
  > = ['ethereum', 'base', 'arbitrum', 'polygon', 'avalanche'];
  private readonly EOA_CHAIN_KEYS: Array<
    | 'ethereum'
    | 'base'
    | 'arbitrum'
    | 'polygon'
    | 'avalanche'
    | 'moonbeamTestnet'
    | 'astarShibuya'
    | 'paseoPassetHub'
    | 'hydration'
    | 'unique'
    | 'bifrost'
    | 'bifrostTestnet'
  > = [
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
      'hydration',
      'unique',
      'bifrost',
      'bifrostTestnet',
    ];
  private readonly NON_EVM_CHAIN_KEYS: Array<
    | 'tron'
    | 'bitcoin'
    | 'solana'
    | 'aptos'
    | 'aptosMainnet'
    | 'aptosTestnet'
    | 'aptosDevnet'
  > = [
      'tron',
      'bitcoin',
      'solana',
      'aptos',
      'aptosMainnet',
      'aptosTestnet',
      'aptosDevnet',
    ];
  private readonly UI_SMART_ACCOUNT_LABEL = 'EVM Smart Account';
  private readonly WALLETCONNECT_CHAIN_CONFIG = [
    {
      chainId: 1,
      key: 'ethereum' as WalletAddressKey,
      label: 'Ethereum',
    },
    {
      chainId: 8453,
      key: 'base' as WalletAddressKey,
      label: 'Base',
    },
    {
      chainId: 42161,
      key: 'arbitrum' as WalletAddressKey,
      label: 'Arbitrum',
    },
    {
      chainId: 137,
      key: 'polygon' as WalletAddressKey,
      label: 'Polygon',
    },
    {
      chainId: 43114,
      key: 'avalanche' as WalletAddressKey,
      label: 'Avalanche',
    },
  ];

  constructor(
    private seedRepository: SeedRepository,
    private configService: ConfigService,
    private zerionService: ZerionService,
    private seedManager: SeedManager,
    private addressManager: AddressManager,
    private accountFactory: AccountFactory,
    private nativeEoaFactory: NativeEoaFactory,
    private eip7702AccountFactory: Eip7702AccountFactory,
    private polkadotEvmRpcService: PolkadotEvmRpcService,
    private substrateManager: SubstrateManager,
    private balanceCacheRepository: BalanceCacheRepository,
    private walletHistoryRepository: WalletHistoryRepository,
    private pimlicoConfig: PimlicoConfigService,
    private eip7702DelegationRepository: Eip7702DelegationRepository,
    private chainConfig: ChainConfigService,
  ) { }

  /**
   * Create or import a wallet seed phrase
   * For authenticated users, saves the current wallet to history before creating new one
   * @param userId - The user ID
   * @param mode - Either 'random' to generate or 'mnemonic' to import
   * @param mnemonic - The mnemonic phrase (required if mode is 'mnemonic')
   * @param saveHistory - Whether to save current wallet to history (default: true for authenticated users)
   */
  async createOrImportSeed(
    userId: string,
    mode: 'random' | 'mnemonic',
    mnemonic?: string,
    saveHistory: boolean = true,
  ): Promise<void> {
    // For authenticated users (non-temp IDs), save current wallet to history
    const isAuthenticatedUser = !userId.startsWith('temp-');

    if (saveHistory && isAuthenticatedUser) {
      try {
        // Check if user has an existing seed to save
        const hasSeed = await this.seedManager.hasSeed(userId);
        if (hasSeed) {
          const currentSeed = await this.seedManager.getSeed(userId);
          await this.walletHistoryRepository.saveToHistory(userId, currentSeed);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to save wallet history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Continue even if history save fails
      }
    }

    // Clear any cached addresses since a new seed means new addresses
    await this.addressManager.clearAddressCache(userId);

    // Use the SeedManager for all seed operations
    return this.seedManager.createOrImportSeed(userId, mode, mnemonic);
  }

  /**
   * Get all wallet addresses for all chains
   * Auto-creates wallet if it doesn't exist
   * @param userId - The user ID
   * @returns Object containing addresses for all chains
   */
  async getAddresses(userId: string): Promise<WalletAddresses> {
    // Use the AddressManager for address operations
    return this.addressManager.getAddresses(userId);
  }

  /**
   * Get wallet history for authenticated users
   * @param userId - The user ID
   */
  async getWalletHistory(userId: string) {
    return this.walletHistoryRepository.getWalletHistory(userId);
  }

  /**
   * Switch to a different wallet from history
   * @param userId - The user ID
   * @param walletId - The wallet history entry ID to switch to
   */
  async switchWallet(userId: string, walletId: string): Promise<boolean> {
    // Get the seed from history
    const seedPhrase = await this.walletHistoryRepository.getSeedFromHistory(
      walletId,
      userId,
    );

    if (!seedPhrase) {
      this.logger.error(`Wallet ${walletId} not found for user ${userId}`);
      return false;
    }

    // Save current wallet to history first (don't save again if switching)
    const hasSeed = await this.seedManager.hasSeed(userId);
    if (hasSeed) {
      const currentSeed = await this.seedManager.getSeed(userId);
      // Only save if it's different from the one we're switching to
      if (currentSeed !== seedPhrase) {
        await this.walletHistoryRepository.saveToHistory(userId, currentSeed);
      }
    }

    // Clear address cache
    await this.addressManager.clearAddressCache(userId);

    // Import the selected wallet's seed
    await this.seedManager.createOrImportSeed(userId, 'mnemonic', seedPhrase);

    // Set this wallet as active
    await this.walletHistoryRepository.setActiveWallet(walletId, userId);

    return true;
  }

  /**
   * Delete a wallet from history
   * @param userId - The user ID
   * @param walletId - The wallet history entry ID to delete
   */
  async deleteWalletHistory(
    userId: string,
    walletId: string,
  ): Promise<boolean> {
    return this.walletHistoryRepository.deleteWallet(walletId, userId);
  }

  async getWalletAddressContext(userId: string): Promise<WalletAddressContext> {
    const { addresses, metadata } =
      await this.addressManager.getManagedAddresses(userId);
    const ui = this.buildUiWalletPayload(metadata);
    return {
      internal: addresses,
      metadata,
      ui,
    };
  }

  async getUiWalletAddresses(userId: string): Promise<UiWalletPayload> {
    const context = await this.getWalletAddressContext(userId);
    return context.ui;
  }

  async getWalletConnectAccounts(
    userId: string,
  ): Promise<WalletConnectNamespacePayload[]> {
    const { metadata } = await this.addressManager.getManagedAddresses(userId);
    const namespaces: WalletConnectNamespacePayload[] = [];

    // EIP155 namespace (EVM chains)
    const eip155Namespace: WalletConnectNamespacePayload = {
      namespace: 'eip155',
      chains: [],
      accounts: [],
      addressesByChain: {},
    };

    for (const config of this.WALLETCONNECT_CHAIN_CONFIG) {
      const address = metadata[config.key]?.address;

      if (!address) {
        continue;
      }

      const chainTag = `eip155:${config.chainId}`;
      eip155Namespace.chains.push(chainTag);
      eip155Namespace.accounts.push(`${chainTag}:${address}`);
      eip155Namespace.addressesByChain[chainTag] = address;
    }

    if (eip155Namespace.accounts.length > 0) {
      namespaces.push(eip155Namespace);
    }

    // Polkadot namespace (Substrate chains) - with error isolation
    try {
      const substrateAddresses = await this.substrateManager.getAddresses(
        userId,
        false,
      );
      const enabledChains = this.substrateManager.getEnabledChains();

      const polkadotNamespace: WalletConnectNamespacePayload = {
        namespace: 'polkadot',
        chains: [],
        accounts: [],
        addressesByChain: {},
      };

      for (const chain of enabledChains) {
        const address = substrateAddresses[chain];
        if (!address) {
          continue;
        }

        const chainConfig = this.substrateManager.getChainConfig(chain, false);
        const genesisHash = chainConfig.genesisHash;
        const chainTag = `polkadot:${genesisHash}`;
        const accountId = `polkadot:${genesisHash}:${address}`;

        polkadotNamespace.chains.push(chainTag);
        polkadotNamespace.accounts.push(accountId);
        polkadotNamespace.addressesByChain[chainTag] = address;
      }

      if (polkadotNamespace.accounts.length > 0) {
        namespaces.push(polkadotNamespace);
      }
    } catch (error) {
      this.logger.error(
        `Failed to register Polkadot namespace for WalletConnect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Continue with other namespaces - error isolation (Issue #6)
    }

    if (namespaces.length === 0) {
      throw new BadRequestException(
        'No WalletConnect-compatible addresses found. Please initialize your wallet first.',
      );
    }

    // Return first namespace for backward compatibility, but log that multiple namespaces are available
    if (namespaces.length > 1) {
      this.logger.debug(
        `Multiple WalletConnect namespaces available: ${namespaces.map((n) => n.namespace).join(', ')}`,
      );
    }

    return namespaces;
  }

  private buildUiWalletPayload(
    metadata: WalletAddressMetadataMap,
  ): UiWalletPayload {
    const chainsRecord = {
      ethereum: metadata.ethereum?.address ?? null,
      base: metadata.base?.address ?? null,
      arbitrum: metadata.arbitrum?.address ?? null,
      polygon: metadata.polygon?.address ?? null,
      avalanche: metadata.avalanche?.address ?? null,
    };

    const canonicalChainKey = this.SMART_ACCOUNT_CHAIN_KEYS.find(
      (key) => metadata[key]?.address,
    );

    const canonicalAddress = canonicalChainKey
      ? (metadata[canonicalChainKey]?.address ?? null)
      : null;
    const canonicalChain = canonicalChainKey ? canonicalChainKey : null;

    const smartAccount: SmartAccountSummary | null = canonicalAddress
      ? {
        key: 'evmSmartAccount',
        label: this.UI_SMART_ACCOUNT_LABEL,
        canonicalChain,
        address: canonicalAddress,
        chains: chainsRecord,
      }
      : null;

    const auxiliary = this.buildAuxiliaryWalletEntries(metadata);

    return {
      smartAccount,
      auxiliary,
    };
  }

  private buildAuxiliaryWalletEntries(
    metadata: WalletAddressMetadataMap,
  ): UiWalletEntry[] {
    const entries: UiWalletEntry[] = [];

    // EVM EOA chains (standard EVM wallets)
    const eoaChains: WalletAddressKey[] = [
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
    ];
    eoaChains.forEach((chain) => {
      const entry = metadata[chain];
      if (entry?.visible && entry.address) {
        entries.push({
          key: chain,
          label: entry.label,
          chain,
          address: entry.address,
          category: 'evm',
        });
      }
    });

    // Polkadot EVM chains
    const polkadotEvmChains: WalletAddressKey[] = [
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
    ];
    polkadotEvmChains.forEach((chain) => {
      const entry = metadata[chain];
      if (entry?.visible && entry.address) {
        entries.push({
          key: chain,
          label: entry.label,
          chain,
          address: entry.address,
          category: 'polkadot-evm',
        });
      }
    });

    // Substrate chains
    const substrateChains: WalletAddressKey[] = [
      'polkadot',
      'hydrationSubstrate',
      'bifrostSubstrate',
      'uniqueSubstrate',
      'paseo',
      'paseoAssethub',
    ];
    substrateChains.forEach((chain) => {
      const entry = metadata[chain];
      if (entry?.visible && entry.address) {
        entries.push({
          key: chain,
          label: entry.label,
          chain,
          address: entry.address,
          category: 'substrate',
        });
      }
    });

    // Non-EVM chains (including Aptos)
    this.NON_EVM_CHAIN_KEYS.forEach((chain) => {
      const entry = metadata[chain];
      if (entry?.visible && entry.address) {
        // Determine category based on chain
        let category: string | undefined;
        if (chain.startsWith('aptos')) {
          category = 'aptos';
        } else if (
          chain === 'tron' ||
          chain === 'bitcoin' ||
          chain === 'solana'
        ) {
          category = 'non-evm';
        }

        entries.push({
          key: chain,
          label: entry.label,
          chain,
          address: entry.address,
          category,
        });
      }
    });

    return entries;
  }

  private buildMetadataSnapshot(
    partial: Partial<Record<WalletAddressKey, string | null>> | WalletAddresses,
  ): WalletAddressMetadataMap {
    const metadata = {} as WalletAddressMetadataMap;

    const assign = (
      chain: WalletAddressKey,
      kind: WalletAddressKind,
      visible: boolean,
    ) => {
      metadata[chain] = {
        chain,
        address: partial[chain] ?? null,
        kind,
        visible,
        label: this.getLabelForChain(chain, kind),
      };
    };

    // Standard EOA chains (not visible by default)
    const standardEoaChains = this.EOA_CHAIN_KEYS.filter(
      (chain) =>
        ![
          'moonbeamTestnet',
          'astarShibuya',
          'paseoPassetHub',
          'hydration',
          'unique',
          'bifrost',
          'bifrostTestnet',
        ].includes(chain),
    );
    standardEoaChains.forEach((chain) => assign(chain, 'eoa', false));

    // Polkadot EVM chains (visible)
    const polkadotEvmChains: WalletAddressKey[] = [
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
      'hydration',
      'unique',
      'bifrost',
      'bifrostTestnet',
    ];
    polkadotEvmChains.forEach((chain) => assign(chain, 'eoa', true));
    this.SMART_ACCOUNT_CHAIN_KEYS.forEach((chain) =>
      assign(chain, 'eoa', true),
    );
    this.NON_EVM_CHAIN_KEYS.forEach((chain) => assign(chain, 'nonEvm', true));

    // Substrate chains (visible)
    const substrateChains: WalletAddressKey[] = [
      'polkadot',
      'hydrationSubstrate',
      'bifrostSubstrate',
      'uniqueSubstrate',
      'paseo',
      'paseoAssethub',
    ];
    substrateChains.forEach((chain) => assign(chain, 'substrate', true));

    return metadata;
  }

  private getLabelForChain(
    chain: WalletAddressKey,
    kind: WalletAddressKind,
  ): string {
    const baseLabels: Partial<Record<WalletAddressKey, string>> = {
      ethereum: 'Ethereum',
      base: 'Base',
      arbitrum: 'Arbitrum',
      polygon: 'Polygon',
      avalanche: 'Avalanche',
      tron: 'Tron',
      bitcoin: 'Bitcoin',
      solana: 'Solana',
      moonbeamTestnet: 'Moonbeam Testnet',
      astarShibuya: 'Astar Shibuya',
      paseoPassetHub: 'Paseo PassetHub',
      hydration: 'Hydration',
      unique: 'Unique',
      bifrost: 'Bifrost Mainnet',
      bifrostTestnet: 'Bifrost Testnet',
    };

    const label = baseLabels[chain];
    if (label) {
      if (kind === 'eoa') {
        return `${label} (EOA)`;
      }
      return label;
    }
    return chain;
  }

  private isVisibleChain(chain: WalletAddressKey): boolean {
    // Substrate chains
    const SUBSTRATE_CHAIN_KEYS: Array<
      | 'polkadot'
      | 'hydrationSubstrate'
      | 'bifrostSubstrate'
      | 'uniqueSubstrate'
      | 'paseo'
      | 'paseoAssethub'
    > = [
        'polkadot',
        'hydrationSubstrate',
        'bifrostSubstrate',
        'uniqueSubstrate',
        'paseo',
        'paseoAssethub',
      ];

    // Polkadot EVM chains
    const POLKADOT_EVM_CHAIN_KEYS: Array<
      'moonbeamTestnet' | 'astarShibuya' | 'paseoPassetHub'
    > = ['moonbeamTestnet', 'astarShibuya', 'paseoPassetHub'];

    return (
      this.SMART_ACCOUNT_CHAIN_KEYS.includes(
        chain as (typeof this.SMART_ACCOUNT_CHAIN_KEYS)[number],
      ) ||
      this.NON_EVM_CHAIN_KEYS.includes(
        chain as (typeof this.NON_EVM_CHAIN_KEYS)[number],
      ) ||
      SUBSTRATE_CHAIN_KEYS.includes(
        chain as (typeof SUBSTRATE_CHAIN_KEYS)[number],
      ) ||
      POLKADOT_EVM_CHAIN_KEYS.includes(
        chain as (typeof POLKADOT_EVM_CHAIN_KEYS)[number],
      ) ||
      this.EOA_CHAIN_KEYS.includes(
        chain as (typeof this.EOA_CHAIN_KEYS)[number],
      )
    );
  }

  /**
   * Get all token positions across any supported chains for the user's primary addresses
   * Uses Zerion any-chain endpoints per address (no chain filter) and merges results.
   * Primary addresses considered: EVM EOA (ethereum), first ERC-4337 smart account, and Solana.
   * @param userId - The user ID
   * @param forceRefresh - Force refresh from API (bypass Zerion's internal cache)
   */
  async getTokenBalancesAny(
    userId: string,
    forceRefresh: boolean = false,
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
    // Ensure wallet exists
    const hasSeed = await this.seedRepository.hasSeed(userId);
    if (!hasSeed) {
      await this.createOrImportSeed(userId, 'random');
    }

    const addresses = await this.getAddresses(userId);

    // Collect all unique target addresses we want Zerion to index
    const seenAddresses = new Set<string>();
    const targetAddresses: string[] = [];
    const addTarget = (addr?: string | null) => {
      if (!addr) return;
      const key = addr.toLowerCase();
      if (seenAddresses.has(key)) return;
      seenAddresses.add(key);
      targetAddresses.push(addr);
    };

    // Primary EVM EOAs (one per supported chain)
    addTarget(addresses.ethereum);
    addTarget(addresses.base);
    addTarget(addresses.arbitrum);
    addTarget(addresses.polygon);
    addTarget(addresses.avalanche);

    // Solana address (Zerion supports Solana)
    addTarget(addresses.solana);

    // Include any recorded EIP-7702 delegated accounts (EOA keeps same address)
    try {
      const delegations =
        await this.eip7702DelegationRepository.getDelegationsForUser(userId);
      for (const delegation of delegations) {
        addTarget(delegation.address);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load EIP-7702 delegations for ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Polkadot EVM chains use the same EOA address as ethereum
    const polkadotEvmAddress = addresses.ethereum;

    // Invalidate Zerion cache for all addresses if force refresh is requested
    if (forceRefresh) {
      for (const addr of targetAddresses) {
        // Invalidate for common chains that Zerion supports
        const chains = [
          'ethereum',
          'base',
          'arbitrum',
          'polygon',
          'avalanche',
          'solana',
        ];
        for (const chain of chains) {
          this.zerionService.invalidateCache(addr, chain);
        }
      }
    }

    // Fetch positions for each address in parallel (Zerion)
    // Use Promise.allSettled to handle individual address failures gracefully
    const zerionSettledResults =
      targetAddresses.length > 0
        ? await Promise.allSettled(
          targetAddresses.map((addr) =>
            this.zerionService.getPositionsAnyChain(addr),
          ),
        )
        : [];

    // Collect successful results and log failures
    const zerionResults: TokenBalance[][] = [];
    const failedAddresses: string[] = [];

    for (let i = 0; i < zerionSettledResults.length; i++) {
      const result = zerionSettledResults[i];
      if (result.status === 'fulfilled') {
        zerionResults.push(result.value);
      } else {
        const address = targetAddresses[i];
        failedAddresses.push(address);
        this.logger.error(
          `Failed to fetch Zerion positions for ${address}: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
        );
      }
    }

    // Log diagnostic information
    if (failedAddresses.length > 0) {
      this.logger.warn(
        `Failed to fetch positions for ${failedAddresses.length}/${targetAddresses.length} addresses`,
      );
    }

    if (zerionResults.length === 0 && targetAddresses.length > 0) {
      this.logger.error(
        `All ${targetAddresses.length} address fetches failed. Check ZERION_API_KEY configuration.`,
      );
    }

    if (zerionResults.every((r) => r.length === 0)) {
      this.logger.warn(
        `All Zerion results returned empty arrays for ${targetAddresses.length} addresses (wallets may be empty or not indexed yet)`,
      );
    }

    // Fetch Polkadot EVM chain assets using RPC
    const polkadotEvmChains = [
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
    ];
    const polkadotResults: Array<{
      chain: string;
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
      balanceHuman?: string;
    }> = [];

    if (polkadotEvmAddress) {
      // Use Promise.allSettled to ensure RPC errors don't block Zerion results
      const polkadotAssetResults = await Promise.allSettled(
        polkadotEvmChains.map(async (chain) => {
          try {
            const assets = await this.polkadotEvmRpcService.getAssets(
              polkadotEvmAddress,
              chain,
            );
            return assets;
          } catch (error) {
            this.logger.error(
              `Error fetching assets for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            return []; // Return empty array on error
          }
        }),
      );

      // Flatten the results
      for (const result of polkadotAssetResults) {
        if (result.status === 'fulfilled') {
          polkadotResults.push(...result.value);
        }
      }
    }

    const results = [...zerionResults];

    // Merge and dedupe across addresses using chain_id + token address/native
    // Preserve Zerion's native balance format (smallest units) and decimals
    const byKey = new Map<
      string,
      {
        chain: string;
        address: string | null;
        symbol: string;
        balance: string;
        decimals: number;
        balanceHuman?: string;
        valueUsd?: number;
      }
    >();

    // Process Zerion results
    for (const parsedTokens of zerionResults) {
      if (!parsedTokens || !Array.isArray(parsedTokens)) continue;
      for (const token of parsedTokens) {
        try {
          const chainId = token.chain;
          const balanceSmallest = token.balanceSmallest;

          // Skip zero balances
          if (balanceSmallest === '0' || BigInt(balanceSmallest) === 0n)
            continue;

          const key = `${chainId}:${token.address ? token.address.toLowerCase() : 'native'}`;
          if (!byKey.has(key)) {
            byKey.set(key, {
              chain: chainId,
              address: token.address,
              symbol: token.symbol,
              balance: balanceSmallest, // Keep smallest units as primary balance
              decimals: token.decimals || 18, // Use Zerion's decimals with fallback
              balanceHuman: token.balanceHuman.toString(), // Add human-readable for UI
              valueUsd: token.valueUsd,
            });
          }
        } catch (e) {
          this.logger.debug(
            `Error processing parsed token: ${e instanceof Error ? e.message : 'Unknown error'}`,
          );
        }
      }
    }

    // Process Polkadot EVM RPC results
    for (const asset of polkadotResults) {
      try {
        // Skip zero balances
        if (asset.balance === '0' || BigInt(asset.balance) === 0n) continue;

        const key = `${asset.chain}:${asset.address ? asset.address.toLowerCase() : 'native'}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            chain: asset.chain,
            address: asset.address,
            symbol: asset.symbol,
            balance: asset.balance,
            decimals: asset.decimals,
            balanceHuman: asset.balanceHuman,
            valueUsd: undefined, // Polkadot assets don't have price yet
          });
        }
      } catch (e) {
        this.logger.debug(
          `Error processing Polkadot EVM asset: ${e instanceof Error ? e.message : 'Unknown error'}`,
        );
      }
    }

    return Array.from(byKey.values());
  }

  /**
   * Get transactions across any supported chains for the user's primary addresses
   * Merges and dedupes by chain_id + tx hash.
   */
  async getTransactionsAny(
    userId: string,
    limit: number = 100,
  ): Promise<
    Array<{
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
    }>
  > {
    const hasSeed = await this.seedRepository.hasSeed(userId);
    if (!hasSeed) {
      await this.createOrImportSeed(userId, 'random');
    }

    const addresses = await this.getAddresses(userId);
    const targetAddresses = [addresses.ethereum, addresses.solana].filter(
      Boolean,
    );

    // Polkadot EVM chains use the same EOA address as ethereum
    const polkadotEvmAddress = addresses.ethereum;

    // Fetch transactions from Zerion with timeout protection
    const zerionPerAddr =
      targetAddresses.length > 0
        ? await Promise.allSettled(
          targetAddresses.map((addr) =>
            Promise.race([
              this.zerionService.getTransactionsAnyChain(addr, limit),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Transaction fetch timeout for ${addr} after 30s`,
                      ),
                    ),
                  30000,
                ),
              ),
            ]).catch((error) => {
              this.logger.warn(
                `Failed to fetch transactions for ${addr}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
              return []; // Return empty array on error/timeout
            }),
          ),
        ).then((results) =>
          results.map((result) =>
            result.status === 'fulfilled' ? result.value : [],
          ),
        )
        : [];

    // Fetch Polkadot EVM chain transactions using RPC
    const polkadotEvmChains = [
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
    ];
    const polkadotTransactions: Array<{
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
    }> = [];

    if (polkadotEvmAddress) {
      // Use Promise.allSettled with timeout to ensure RPC errors don't block Zerion results
      const polkadotResults = await Promise.allSettled(
        polkadotEvmChains.map(async (chain) => {
          try {
            const txs = await Promise.race([
              this.polkadotEvmRpcService.getTransactions(
                polkadotEvmAddress,
                chain,
                limit,
              ),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`RPC timeout for ${chain} after 20s`)),
                  20000,
                ),
              ),
            ]);
            return txs.map((tx) => ({
              txHash: tx.txHash,
              from: tx.from,
              to: tx.to,
              value: tx.value,
              timestamp: tx.timestamp,
              blockNumber: tx.blockNumber,
              status: tx.status,
              chain: tx.chain,
            }));
          } catch (error) {
            this.logger.warn(
              `Error fetching transactions for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            return []; // Return empty array on error
          }
        }),
      );

      // Flatten the results
      for (const result of polkadotResults) {
        if (result.status === 'fulfilled') {
          polkadotTransactions.push(...result.value);
        }
      }
    }

    const perAddr = [...zerionPerAddr];

    const byKey = new Map<
      string,
      {
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
    >();

    for (const list of perAddr) {
      for (const tx of list) {
        try {
          const attrs = tx.attributes || {};
          const chainId =
            tx.relationships?.chain?.data?.id?.toLowerCase() || 'unknown';
          const hash = (attrs.hash || tx.id || '').toLowerCase();
          if (!hash) continue;

          // Determine status
          let status: 'success' | 'failed' | 'pending' = 'pending';
          if (attrs.status) {
            const s = attrs.status.toLowerCase();
            if (s === 'confirmed' || s === 'success') status = 'success';
            else if (s === 'failed' || s === 'error') status = 'failed';
          } else if (
            attrs.block_confirmations !== undefined &&
            attrs.block_confirmations > 0
          ) {
            status = 'success';
          }

          const transfers = attrs.transfers || [];
          let tokenSymbol: string | undefined;
          let tokenAddress: string | undefined;
          let value = '0';
          let toAddress: string | null = null;

          if (transfers.length > 0) {
            const tr = transfers[0];
            if (tr) {
              tokenSymbol = tr.fungible_info?.symbol;
              const q = tr.quantity;
              if (q) {
                const intPart = q.int || '0';
                const decimals = q.decimals || 0;
                value = `${intPart}${'0'.repeat(Math.max(0, 18 - decimals))}`;
              }
              toAddress = tr.to?.address || null;
            }
          }

          const key = `${chainId}:${hash}`;
          if (!byKey.has(key)) {
            byKey.set(key, {
              txHash: hash,
              from: '',
              to: toAddress,
              value,
              timestamp: attrs.mined_at || attrs.sent_at || null,
              blockNumber: attrs.block_number || null,
              status,
              chain: chainId,
              tokenSymbol,
              tokenAddress,
            });
          }
        } catch (e) {
          this.logger.debug(
            `Error processing any-chain tx: ${e instanceof Error ? e.message : 'Unknown error'}`,
          );
        }
      }
    }

    // Process Polkadot EVM RPC transactions
    for (const tx of polkadotTransactions) {
      try {
        const key = `${tx.chain}:${tx.txHash.toLowerCase()}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            txHash: tx.txHash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            timestamp: tx.timestamp,
            blockNumber: tx.blockNumber,
            status: tx.status,
            chain: tx.chain,
          });
        }
      } catch (e) {
        this.logger.debug(
          `Error processing Polkadot EVM transaction: ${e instanceof Error ? e.message : 'Unknown error'}`,
        );
      }
    }

    const sorted = Array.from(byKey.values()).sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeB - timeA; // Most recent first
    });

    this.logger.log(
      `Returning ${Math.min(sorted.length, limit)} transactions (from ${sorted.length} total) for user ${userId}`,
    );

    return sorted.slice(0, limit);
  }

  /**
   * Stream addresses progressively (for SSE)
   * Yields addresses as they become available
   */
  async *streamAddresses(
    userId: string,
  ): AsyncGenerator<UiWalletPayload, void, unknown> {
    const collected: Partial<Record<WalletAddressKey, string | null>> = {};

    for await (const { chain, address } of this.addressManager.streamAddresses(
      userId,
    )) {
      const key = chain as WalletAddressKey;
      collected[key] = address;

      if (!this.isVisibleChain(key)) {
        continue;
      }

      const metadata = this.buildMetadataSnapshot(collected);
      const uiPayload = this.buildUiWalletPayload(metadata);
      yield uiPayload;
    }
  }

  /**
   * Stream balances progressively (for SSE)
   * Yields balances as they're fetched from Zerion
   */
  async *streamBalances(userId: string): AsyncGenerator<
    {
      chain: string;
      nativeBalance: string;
      tokens: Array<{
        address: string | null;
        symbol: string;
        balance: string;
        decimals: number;
      }>;
    },
    void,
    unknown
  > {
    // Get addresses first
    const addresses = await this.getAddresses(userId);

    // Process each chain independently
    for (const [chain, address] of Object.entries(addresses)) {
      if (!address) {
        yield { chain, nativeBalance: '0', tokens: [] };
        continue;
      }

      try {
        // Get token balances from Zerion (includes native + tokens)
        const tokens = await this.getTokenBalances(userId, chain);
        const nativeToken = tokens.find((t) => t.address === null);
        const otherTokens = tokens.filter((t) => t.address !== null);

        yield {
          chain,
          nativeBalance: nativeToken?.balance || '0',
          tokens: otherTokens,
        };
      } catch (error) {
        this.logger.error(
          `Error streaming balance for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        yield { chain, nativeBalance: '0', tokens: [] };
      }
    }
  }

  /**
   * Get balances for all chains using Zerion API
   * Auto-creates wallet if it doesn't exist
   * @param userId - The user ID
   * @returns Array of balance objects
   */
  async getBalances(
    userId: string,
    forceRefresh: boolean = false,
  ): Promise<Array<{ chain: string; balance: string }>> {
    // Substrate chains are handled separately by getSubstrateBalances()
    // Skip them here to avoid returning misleading cached values
    const substrateChains = [
      'polkadot',
      'hydrationSubstrate',
      'bifrostSubstrate',
      'uniqueSubstrate',
      'paseo',
      'paseoAssethub',
    ];

    // Fast path: Check database cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedBalances =
        await this.balanceCacheRepository.getCachedBalances(userId);
      if (cachedBalances) {
        this.logger.debug(
          `Returning cached balances from DB for user ${userId}`,
        );
        // Convert cached format to response format, excluding Substrate chains
        return Object.entries(cachedBalances)
          .filter(
            ([chain]) =>
              !substrateChains.includes(chain) &&
              !chain.startsWith('substrate_'),
          )
          .map(([chain, data]) => ({
            chain,
            balance: data.balance,
          }));
      }
    }

    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);

    if (!hasSeed) {
      await this.createOrImportSeed(userId, 'random');
    }

    // Get addresses first (using WDK - addresses stay on backend)
    const addresses = await this.getAddresses(userId);

    const balances: Array<{ chain: string; balance: string }> = [];
    const balancesToCache: Record<
      string,
      { balance: string; lastUpdated: number }
    > = {};

    // For each chain, get balance from Zerion
    for (const [chain, address] of Object.entries(addresses)) {
      // Skip Substrate chains - they're handled by getSubstrateBalances()
      if (substrateChains.includes(chain)) {
        continue;
      }

      if (!address) {
        balances.push({ chain, balance: '0' });
        balancesToCache[chain] = { balance: '0', lastUpdated: Date.now() };
        continue;
      }

      try {
        // Get portfolio from Zerion
        const portfolio = await this.zerionService.getPortfolio(address, chain);

        if (!portfolio?.data || !Array.isArray(portfolio.data)) {
          // Zerion doesn't support this chain or returned no data
          balances.push({ chain, balance: '0' });
          balancesToCache[chain] = { balance: '0', lastUpdated: Date.now() };
          continue;
        }

        // Find native token in portfolio
        const nativeToken = portfolio.data.find(
          (token) =>
            token.type === 'native' || !token.attributes?.fungible_info,
        );

        let balance = '0';
        if (nativeToken?.attributes?.quantity) {
          const quantity = nativeToken.attributes.quantity;
          // Combine int and decimals parts
          const intPart = quantity.int || '0';
          const decimals = quantity.decimals || 0;
          balance = `${intPart}${'0'.repeat(Math.max(0, 18 - decimals))}`;
        }

        balances.push({
          chain,
          balance,
        });

        balancesToCache[chain] = { balance, lastUpdated: Date.now() };

        this.logger.log(
          `Successfully got balance for ${chain} from Zerion: ${balance}`,
        );
      } catch (error) {
        this.logger.error(
          `Error fetching balance for ${chain} from Zerion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Return 0 balance if Zerion fails (Zerion is primary source)
        balances.push({ chain, balance: '0' });
        balancesToCache[chain] = { balance: '0', lastUpdated: Date.now() };
      }
    }

    // Save to cache
    await this.balanceCacheRepository.updateCachedBalances(
      userId,
      balancesToCache,
    );

    return balances;
  }

  /**
   * Refresh balances from external APIs and update cache
   * @param userId - The user ID
   * @returns Fresh balances from APIs
   */
  async refreshBalances(
    userId: string,
  ): Promise<Array<{ chain: string; balance: string }>> {
    this.logger.debug(`Refreshing balances for user ${userId}`);
    return this.getBalances(userId, true); // Force refresh
  }

  /**
   * Get ERC-4337 paymaster token balances
   * @param userId - The user ID
   * @returns Array of paymaster token balances
   */
  async getErc4337PaymasterBalances(
    userId: string,
  ): Promise<Array<{ chain: string; balance: string }>> {
    this.logger.warn(
      'EIP-7702 migration: paymaster balances for legacy ERC-4337 are disabled.',
    );
    return [];
  }

  /**
   * Convert human-readable amount to smallest units (BigInt)
   * @param humanAmount - Human-readable amount string (e.g., "1.5")
   * @param decimals - Number of decimal places
   * @returns BigInt representing the amount in smallest units
   */
  private convertToSmallestUnits(
    humanAmount: string,
    decimals: number,
  ): bigint {
    const [wholeRaw = '0', fracRaw = ''] = humanAmount.trim().split('.');
    const whole = wholeRaw.replace(/^0+/, '') || '0';
    const fracPadded = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
    const combined = (whole + fracPadded).replace(/^0+/, '') || '0';
    return BigInt(combined);
  }

  /**
   * Convert smallest units to human-readable amount
   * @param smallestUnits - Amount in smallest units (string)
   * @param decimals - Number of decimal places
   * @returns Human-readable amount string
   */
  private convertSmallestToHuman(
    smallestUnits: string,
    decimals: number,
  ): string {
    const smallestBigInt = BigInt(smallestUnits);
    const divisor = BigInt(10 ** decimals);
    const whole = smallestBigInt / divisor;
    const remainder = smallestBigInt % divisor;

    if (remainder === 0n) {
      return whole.toString();
    }

    const remainderStr = remainder.toString().padStart(decimals, '0');
    const trimmedRemainder = remainderStr.replace(/0+$/, '');
    return `${whole}.${trimmedRemainder}`;
  }

  /**
   * Chain ID aliases for Zerion API - Zerion may return chain IDs in different formats
   */
  private readonly CHAIN_ID_ALIASES: Record<string, string[]> = {
    ethereum: ['ethereum', 'eth', 'eip155:1', 'ethereum-mainnet', '1'],
    base: ['base', 'eip155:8453', 'base-mainnet', '8453'],
    arbitrum: ['arbitrum', 'arbitrum-one', 'eip155:42161', '42161'],
    polygon: ['polygon', 'matic', 'eip155:137', 'polygon-mainnet', '137'],
    avalanche: ['avalanche', 'avax', 'eip155:43114', '43114', 'avalanche-c'],
    moonbeamTestnet: [
      'moonbeamTestnet',
      'moonbase',
      'eip155:420420422',
      '420420422',
    ],
    astarShibuya: ['astarShibuya', 'shibuya', 'eip155:81', '81'],
    paseoPassetHub: [
      'paseoPassetHub',
      'paseo',
      'passethub',
      'eip155:420420422',
      '420420422',
    ],
  };

  /**
   * Check if chain is ERC-4337 smart account chain
   * @param chain - Internal chain name
   * @returns true if chain is ERC-4337
   */
  private isErc4337Chain(chain: string): boolean {
    return chain.includes('Erc4337') || chain.includes('erc4337');
  }

  /**
   * Get all possible Zerion chain ID formats for a given internal chain
   * @param internalChain - Internal chain name (e.g., 'baseErc4337' or 'base')
   * @returns Array of possible Zerion chain ID formats
   */
  private getZerionChainAliases(internalChain: string): string[] {
    // Remove ERC-4337 suffix to get base chain
    const baseChain = internalChain.replace(/Erc4337/gi, '').toLowerCase();
    return this.CHAIN_ID_ALIASES[baseChain] || [baseChain];
  }

  /**
   * Check if a smart account is deployed on-chain
   * @param account - WDK account instance
   * @returns true if account is deployed, false otherwise
   */
  private async checkIfDeployed(account: any): Promise<boolean> {
    try {
      const address = await account.getAddress();

      // Get provider from account
      let provider: any = null;
      if ('provider' in account) {
        provider = account.provider;
      } else if (
        'getProvider' in account &&
        typeof account.getProvider === 'function'
      ) {
        provider = await account.getProvider();
      }

      if (!provider || typeof provider.request !== 'function') {
        this.logger.warn(
          `Cannot check deployment status: provider not available for address ${address}`,
        );
        return false;
      }

      // Check if contract code exists at address
      const code = await provider.request({
        method: 'eth_getCode',
        params: [address, 'latest'],
      });

      const isDeployed = code && code !== '0x' && code !== '0x0';

      this.logger.log(
        `[Deployment Check] Address: ${address}, deployed: ${isDeployed}, code length: ${code?.length || 0}`,
      );

      return isDeployed;
    } catch (e) {
      this.logger.error(
        `Failed to check deployment status: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Deploy an ERC-4337 smart account using UserOperation
   * @param account - WDK ERC-4337 account instance
   * @param address - Account address
   * @param chain - Internal chain name
   * @returns Promise that resolves when deployment is complete
   */
  private async deployErc4337Account(
    account: any,
    address: string,
    chain: string,
  ): Promise<void> {
    this.logger.log(
      `[Deploy] Starting deployment for ERC-4337 account ${address} on ${chain}`,
    );

    try {
      // Method 1: Try deployAccount() if available
      if (
        'deployAccount' in account &&
        typeof account.deployAccount === 'function'
      ) {
        await account.deployAccount();
        return;
      }

      // Method 2: Try deploy() if available
      if ('deploy' in account && typeof account.deploy === 'function') {
        await account.deploy();
        return;
      }

      // Method 3: Send a zero-value transaction to self to trigger deployment
      // ERC-4337 accounts typically auto-deploy on first UserOperation
      if ('send' in account && typeof account.send === 'function') {
        await account.send(address, '0');

        // Wait a bit for deployment to be confirmed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify deployment
        const isNowDeployed = await this.checkIfDeployed(account);
        if (!isNowDeployed) {
          throw new Error(
            'Deployment transaction sent but account not deployed yet. Please try again in a moment.',
          );
        }
        return;
      }

      // Method 4: Try transfer with structured params
      if ('transfer' in account && typeof account.transfer === 'function') {
        this.logger.debug(
          `[Deploy] Using account.transfer() to trigger deployment`,
        );
        const result = await account.transfer({
          to: address,
          amount: 0,
        });
        this.logger.log(
          `[Deploy] Deployment triggered via transfer: ${JSON.stringify(result)}`,
        );

        // Wait for deployment confirmation
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify deployment
        const isNowDeployed = await this.checkIfDeployed(account);
        if (!isNowDeployed) {
          throw new Error(
            'Deployment transaction sent but account not deployed yet. Please try again in a moment.',
          );
        }
        return;
      }

      // If no deployment method found, throw error
      throw new Error(
        `No deployment method available for ERC-4337 account. ` +
        `Account type may not support auto-deployment. ` +
        `Available methods: ${Object.keys(account)
          .filter((k) => typeof account[k] === 'function')
          .join(', ')}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[Deploy] Deployment failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Fetch token decimals from RPC using ERC-20 decimals() call
   * @param tokenAddress - Token contract address
   * @param account - WDK account instance
   * @returns Token decimals or null if failed
   */
  private async fetchDecimalsFromRPC(
    tokenAddress: string,
    account: any,
  ): Promise<number | null> {
    try {
      let provider: any = null;
      if ('provider' in account) {
        provider = account.provider;
      } else if (
        'getProvider' in account &&
        typeof account.getProvider === 'function'
      ) {
        provider = await account.getProvider();
      }

      if (!provider || typeof provider.request !== 'function') {
        return null;
      }

      // ERC-20 decimals() function signature: 0x313ce567
      const result = await provider.request({
        method: 'eth_call',
        params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'],
      });

      if (typeof result === 'string' && result !== '0x' && result !== '0x0') {
        const parsed = parseInt(result, 16);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 36) {
          this.logger.log(
            `[RPC Decimals] Fetched decimals for ${tokenAddress}: ${parsed}`,
          );
          return parsed;
        }
      }

      return null;
    } catch (e) {
      this.logger.debug(
        `RPC decimals() call failed for ${tokenAddress}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Validate balance on-chain (source of truth)
   * @param tokenAddress - Token contract address (null for native)
   * @param amountSmallest - Amount in smallest units (BigInt)
   * @param account - WDK account instance
   * @returns Validation result with balance
   */
  private async validateBalanceOnChain(
    tokenAddress: string | null,
    amountSmallest: bigint,
    account: any,
  ): Promise<{ sufficient: boolean; balance: string }> {
    try {
      let balanceBigInt: bigint;

      if (tokenAddress) {
        // ERC-20 token balance
        if (
          'getTokenBalance' in account &&
          typeof account.getTokenBalance === 'function'
        ) {
          const bal = await account.getTokenBalance(tokenAddress);
          balanceBigInt = BigInt(bal?.toString?.() ?? String(bal));
        } else if (
          'balanceOf' in account &&
          typeof account.balanceOf === 'function'
        ) {
          const bal = await account.balanceOf(tokenAddress);
          balanceBigInt = BigInt(bal?.toString?.() ?? String(bal));
        } else {
          // Fallback to direct RPC call
          let provider: any = null;
          if ('provider' in account) {
            provider = account.provider;
          } else if (
            'getProvider' in account &&
            typeof account.getProvider === 'function'
          ) {
            provider = await account.getProvider();
          }

          if (provider && typeof provider.request === 'function') {
            const owner = await account.getAddress();
            const data =
              '0x70a08231' + owner.replace(/^0x/, '').padStart(64, '0');
            const result = await provider.request({
              method: 'eth_call',
              params: [{ to: tokenAddress, data }, 'latest'],
            });

            if (typeof result === 'string' && result.startsWith('0x')) {
              balanceBigInt = BigInt(result);
            } else {
              throw new Error('Invalid RPC response for token balance');
            }
          } else {
            throw new Error('No provider available for balance check');
          }
        }
      } else {
        // Native token balance
        const bal = await account.getBalance();
        balanceBigInt = BigInt(bal?.toString?.() ?? String(bal));
      }

      const sufficient = balanceBigInt >= amountSmallest;

      this.logger.log(
        `[On-Chain Balance] Token: ${tokenAddress || 'native'}, ` +
        `balance: ${balanceBigInt.toString()}, requested: ${amountSmallest.toString()}, ` +
        `sufficient: ${sufficient}`,
      );

      return {
        sufficient,
        balance: balanceBigInt.toString(),
      };
    } catch (e) {
      this.logger.error(
        `On-chain balance validation failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      throw e;
    }
  }

  /**
   * Get token info from Zerion for a specific token address
   * @param tokenAddress - Token contract address
   * @param chain - Internal chain name
   * @param walletAddress - Wallet address to check
   * @returns Token info with decimals and balance, or null if not found
   */
  private async getZerionTokenInfo(
    tokenAddress: string,
    chain: string,
    walletAddress: string,
  ): Promise<{
    decimals: number;
    balanceSmallest: string;
    symbol?: string;
  } | null> {
    try {
      // Get all possible Zerion chain ID formats for this chain
      const chainAliases = this.getZerionChainAliases(chain);
      const tokenAddressLower = tokenAddress.toLowerCase();
      const aliasSet = new Set(
        chainAliases.map((alias) => alias.toLowerCase()),
      );

      this.logger.log(
        `[Zerion Lookup] Fetching positions for address: ${walletAddress}, ` +
        `internal chain: ${chain}, Zerion chain aliases: [${chainAliases.join(', ')}], ` +
        `token: ${tokenAddress}`,
      );

      const positionsAny =
        await this.zerionService.getPositionsAnyChain(walletAddress);

      if (!positionsAny || positionsAny.length === 0) {
        this.logger.warn(
          `[Zerion Lookup] No data returned for ${walletAddress}`,
        );
        return null;
      }

      this.logger.log(
        `[Zerion Lookup] Got ${positionsAny.length} positions for ${walletAddress}`,
      );

      // Log all positions for debugging
      positionsAny.forEach((p: TokenBalance, index: number) => {
        this.logger.debug(
          `[Zerion Position ${index}] symbol=${p.symbol}, ` +
          `address=${p.address}, chain=${p.chain}, balance=${p.balanceSmallest}`,
        );
      });

      // Check all implementations, not just the first one
      const match = positionsAny.find((p: TokenBalance) => {
        // Match by token address (case-insensitive) + Zerion chain aliases
        const positionAddress = p.address?.toLowerCase();
        const positionChain = p.chain?.toLowerCase() || '';
        return (
          !!positionAddress &&
          positionAddress === tokenAddressLower &&
          aliasSet.has(positionChain)
        );
      });

      if (!match) {
        this.logger.warn(
          `[Zerion Lookup] Token ${tokenAddress} not found in Zerion positions for ${walletAddress}. ` +
          `User may not hold this token, or Zerion data is stale. ` +
          `Checked chain aliases: [${chainAliases.join(', ')}]`,
        );
        return null;
      }

      const decimals = match.decimals;
      const balanceSmallest = match.balanceSmallest;

      // CRITICAL VALIDATION: Ensure decimals field exists and is valid
      if (decimals === null || decimals === undefined) {
        this.logger.error(
          `[Zerion Lookup] Token ${tokenAddress} found but decimals field is null/undefined. ` +
          `Decimals value: ${decimals}. Zerion data may be incomplete.`,
        );
        return null;
      }

      if (typeof decimals !== 'number') {
        this.logger.error(
          `[Zerion Lookup] Token ${tokenAddress} has invalid decimals type: ${typeof decimals}. ` +
          `Value: ${decimals}. Expected a number.`,
        );
        return null;
      }

      if (decimals < 0 || decimals > 36) {
        this.logger.error(
          `[Zerion Lookup] Token ${tokenAddress} has out-of-range decimals: ${decimals}. ` +
          `Decimals must be between 0 and 36.`,
        );
        return null;
      }

      this.logger.log(
        `[Zerion Lookup] Successfully found token: symbol=${match.symbol}, ` +
        `decimals=${decimals}, balance=${balanceSmallest}. ` +
        `Data from Zerion is valid and ready for use.`,
      );

      return {
        decimals,
        balanceSmallest,
        symbol: match.symbol,
      };
    } catch (e) {
      this.logger.error(
        `[Zerion Lookup] Failed to get Zerion token info: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Validate balance from Zerion
   * @param tokenAddress - Token contract address (null for native)
   * @param amountSmallest - Amount in smallest units (BigInt)
   * @param chain - Internal chain name
   * @param walletAddress - Wallet address to check
   * @returns Validation result with balance info
   */
  private async validateBalanceFromZerion(
    tokenAddress: string | null,
    amountSmallest: bigint,
    chain: string,
    walletAddress: string,
  ): Promise<{
    sufficient: boolean;
    zerionBalance: string;
    onChainBalance?: string;
    error?: string;
  }> {
    try {
      if (tokenAddress) {
        // ERC-20 token
        const tokenInfo = await this.getZerionTokenInfo(
          tokenAddress,
          chain,
          walletAddress,
        );
        if (!tokenInfo) {
          return {
            sufficient: false,
            zerionBalance: '0',
            error: `Token ${tokenAddress} not found in Zerion for this wallet`,
          };
        }

        const zerionBalanceBigInt = BigInt(tokenInfo.balanceSmallest);
        const sufficient =
          zerionBalanceBigInt >= BigInt(amountSmallest.toString());

        return {
          sufficient,
          zerionBalance: tokenInfo.balanceSmallest,
        };
      } else {
        // Native token - fetch from Zerion
        const chainAliases = this.getZerionChainAliases(chain);

        this.logger.log(
          `[Zerion Balance] Fetching native balance for address: ${walletAddress}, ` +
          `chain: ${chain}, aliases: [${chainAliases.join(', ')}]`,
        );

        const positionsAny =
          await this.zerionService.getPositionsAnyChain(walletAddress);
        if (!positionsAny || positionsAny.length === 0) {
          return {
            sufficient: false,
            zerionBalance: '0',
            error: 'Could not fetch native balance from Zerion',
          };
        }

        const nativeMatch = positionsAny.find((p: TokenBalance) => {
          const isNative = !p.address; // Native tokens have null address
          const chainMatch = chainAliases.some(
            (alias) => p.chain?.toLowerCase() === alias.toLowerCase(),
          );

          return isNative && chainMatch;
        });

        if (!nativeMatch) {
          this.logger.warn(
            `[Zerion Balance] Native token not found for chain=${chain} ` +
            `(checked aliases: [${chainAliases.join(', ')}])`,
          );
          return {
            sufficient: false,
            zerionBalance: '0',
            error: `Native token not found in Zerion for chain ${chain}`,
          };
        }

        const balanceSmallest = nativeMatch.balanceSmallest;
        const zerionBalanceBigInt = BigInt(balanceSmallest);
        const sufficient =
          zerionBalanceBigInt >= BigInt(amountSmallest.toString());

        this.logger.log(
          `[Zerion Balance] Native balance: ${balanceSmallest}, ` +
          `requested: ${amountSmallest.toString()}, sufficient: ${sufficient}`,
        );

        return {
          sufficient,
          zerionBalance: balanceSmallest,
        };
      }
    } catch (e) {
      this.logger.error(
        `Balance validation from Zerion failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
      return {
        sufficient: false,
        zerionBalance: '0',
        error: `Balance validation error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create an account instance using appropriate factory based on chain type
   * @param seedPhrase - The mnemonic seed phrase
   * @param chain - The blockchain network
   * @returns Account instance implementing IAccount interface
   */
  private async createAccountForChain(
    seedPhrase: string,
    chain: AllChainTypes,
    userId?: string,
  ): Promise<IAccount> {
    const eip7702Chains: AllChainTypes[] = [
      'ethereum',
      'base',
      'arbitrum',
      'optimism',
    ];

    const isEip7702 =
      this.pimlicoConfig.isEip7702Enabled(chain) &&
      eip7702Chains.includes(chain);

    if (isEip7702) {
      return this.eip7702AccountFactory.createAccount(
        seedPhrase,
        chain as 'ethereum' | 'base' | 'arbitrum' | 'optimism',
        0,
        userId,
      );
    }

    const evmChains: AllChainTypes[] = [
      'ethereum',
      'base',
      'arbitrum',
      'optimism',
      'polygon',
      'avalanche',
      'bnb',
    ];

    if (evmChains.includes(chain)) {
      return this.nativeEoaFactory.createAccount(
        seedPhrase,
        chain as
        | 'ethereum'
        | 'base'
        | 'arbitrum'
        | 'polygon'
        | 'avalanche',
        0,
      );
    }

    return this.accountFactory.createAccount(seedPhrase, chain, 0);
  }

  /**
   * Send crypto to a recipient address
   * @param userId - The user ID
   * @param chain - The blockchain network
   * @param recipientAddress - The recipient's address
   * @param amount - The amount to send (as string to preserve precision)
   * @param tokenAddress - Optional token contract address for ERC-20 tokens
   * @param tokenDecimals - Optional token decimals from Zerion/UI (if provided, will be used directly)
   * @returns Transaction hash
   */
  async sendCrypto(
    userId: string,
    chain: AllChainTypes,
    recipientAddress: string,
    amount: string,
    tokenAddress?: string,
    tokenDecimals?: number,
    options?: { forceEip7702?: boolean },
  ): Promise<{ txHash: string }> {
    this.logger.log(
      `Sending crypto for user ${userId} on chain ${chain}: ${amount} to ${recipientAddress}`,
    );

    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);

    if (!hasSeed) {
      await this.createOrImportSeed(userId, 'random');
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const forceEip7702 = options?.forceEip7702 === true;
    const isEip7702Chain = this.pimlicoConfig.isEip7702Enabled(chain);
    const accountType = isEip7702Chain ? 'EIP-7702' : 'EOA';

    try {
      const seedPhrase = await this.seedRepository.getSeedPhrase(userId);

      // Auto-route native sends on EIP-7702 enabled chains to the gasless flow to avoid zeroed gas fields
      if (isEip7702Chain && !tokenAddress && !forceEip7702) {
        const chainId = this.pimlicoConfig.getEip7702Config(
          chain as
          | 'ethereum'
          | 'base'
          | 'arbitrum'
          | 'optimism'
          | 'polygon'
          | 'bnb'
          | 'avalanche',
        ).chainId;

        this.logger.warn(
          `[Auto-Route] Chain ${chain} has EIP-7702 enabled but sendCrypto() was called. ` +
          `Routing to sendEip7702Gasless() for proper user operation flow.`,
        );

        const result = await this.sendEip7702Gasless(
          userId,
          chainId,
          recipientAddress,
          amount,
          tokenAddress,
          tokenDecimals,
        );

        return { txHash: result.transactionHash || result.userOpHash };
      }

      // Create account using appropriate factory
      const account = await this.createAccountForChain(
        seedPhrase,
        chain,
        userId,
      );
      const walletAddress = await account.getAddress();

      this.logger.log(
        `[Send Debug] User is sending ${amount} ${tokenAddress || 'native'} from ${chain} ` +
        `(accountType: ${accountType}, address: ${walletAddress})`,
      );

      // Get decimals: Use provided tokenDecimals, or fetch from Zerion, or use native decimals
      let finalDecimals: number;
      let decimalsSource: string;

      if (tokenAddress) {
        // ERC-20 token
        if (
          tokenDecimals !== undefined &&
          tokenDecimals !== null &&
          tokenDecimals >= 0 &&
          tokenDecimals <= 36
        ) {
          // OPTIMIZED: Use provided decimals from UI/Zerion directly - no re-fetch
          finalDecimals = tokenDecimals;
          decimalsSource = 'frontend-zerion';
          this.logger.log(
            `[Decimals Optimization] Using frontend-provided token decimals: ${finalDecimals} ` +
            `(source: ${decimalsSource}). Skipping redundant Zerion API call.`,
          );
        } else {
          // Frontend didn't provide decimals or they're invalid - fetch from Zerion
          this.logger.warn(
            `[Decimals Fallback] Frontend did not provide valid tokenDecimals for ${tokenAddress}. ` +
            `Provided value: ${tokenDecimals}. Falling back to Zerion API lookup.`,
          );

          const tokenInfo = await this.getZerionTokenInfo(
            tokenAddress,
            chain,
            walletAddress,
          );
          if (
            tokenInfo &&
            tokenInfo.decimals !== null &&
            tokenInfo.decimals !== undefined &&
            tokenInfo.decimals >= 0 &&
            tokenInfo.decimals <= 36
          ) {
            finalDecimals = tokenInfo.decimals;
            decimalsSource = 'zerion-api';
            this.logger.log(
              `[Decimals Fallback] Fetched token decimals from Zerion API: ${finalDecimals} ` +
              `(source: ${decimalsSource})`,
            );
          } else {
            // Zerion failed - try RPC as final fallback
            this.logger.warn(
              `[Decimals Fallback] Zerion API lookup failed for ${tokenAddress} on ${chain}. ` +
              `Trying RPC decimals() call as final fallback.`,
            );

            const rpcDecimals = await this.fetchDecimalsFromRPC(
              tokenAddress,
              account,
            );
            if (rpcDecimals !== null && rpcDecimals >= 0 && rpcDecimals <= 36) {
              finalDecimals = rpcDecimals;
              decimalsSource = 'rpc-decimals()';
              this.logger.log(
                `[Decimals Fallback] Fetched token decimals from RPC: ${finalDecimals} ` +
                `(source: ${decimalsSource})`,
              );
            } else {
              // All methods failed
              throw new BadRequestException(
                `Cannot determine token decimals for ${tokenAddress} on ${chain}. ` +
                `Attempted: Frontend (${tokenDecimals}), Zerion API (failed), RPC decimals() (failed). ` +
                `This token may not exist on ${chain}, or Zerion data is incomplete. ` +
                `Please refresh your wallet data and try again.`,
              );
            }
          }
        }
      } else {
        // Native token
        finalDecimals = this.getNativeTokenDecimals(chain);
        decimalsSource = 'native';
        this.logger.log(
          `Using native token decimals: ${finalDecimals} (source: ${decimalsSource})`,
        );
      }

      // Convert human-readable amount to smallest units using Zerion's decimals
      const amountSmallest = this.convertToSmallestUnits(amount, finalDecimals);
      this.logger.log(
        `Send pre-check: chain=${chain}, accountType=${accountType}, token=${tokenAddress || 'native'}, ` +
        `humanAmount=${amount}, decimals=${finalDecimals} (source: ${decimalsSource}), ` +
        `amountSmallest=${amountSmallest.toString()}`,
      );

      // Validate address format (basic check)
      if (!recipientAddress || recipientAddress.trim().length === 0) {
        throw new BadRequestException('Recipient address is required');
      }

      // Validate balance using Zerion as primary source
      const balanceValidation = await this.validateBalanceFromZerion(
        tokenAddress || null,
        amountSmallest,
        chain,
        walletAddress,
      );

      this.logger.log(
        `Balance validation: zerionBalance=${balanceValidation.zerionBalance}, ` +
        `requested=${amountSmallest.toString()}, sufficient=${balanceValidation.sufficient}`,
      );

      // Use on-chain balance as source of truth - verify if Zerion says insufficient
      if (!balanceValidation.sufficient) {
        // Zerion says insufficient - verify with on-chain balance (source of truth)
        this.logger.warn(
          `Zerion reported insufficient balance (${balanceValidation.zerionBalance}), ` +
          `verifying with on-chain balance (source of truth)`,
        );

        try {
          const onChainValidation = await this.validateBalanceOnChain(
            tokenAddress || null,
            amountSmallest,
            account,
          );

          if (onChainValidation.sufficient) {
            // On-chain says sufficient - allow transaction (Zerion may be stale)
            this.logger.warn(
              `Balance discrepancy detected: Zerion shows ${balanceValidation.zerionBalance}, ` +
              `on-chain shows ${onChainValidation.balance}, requested ${amountSmallest.toString()}. ` +
              `Using on-chain balance (source of truth) - proceeding with transaction.`,
            );
            // Don't throw error - proceed with send
          } else {
            // Both Zerion AND on-chain say insufficient
            const errorMessage =
              balanceValidation.error ||
              `Insufficient balance confirmed by both Zerion and on-chain. ` +
              `Zerion: ${balanceValidation.zerionBalance} smallest units, ` +
              `On-chain: ${onChainValidation.balance} smallest units, ` +
              `Requested: ${amountSmallest.toString()} smallest units`;

            this.logger.error(
              `Insufficient balance: ${errorMessage}, token=${tokenAddress || 'native'}, ` +
              `decimals=${finalDecimals}, chain=${chain}`,
            );

            throw new UnprocessableEntityException(errorMessage);
          }
        } catch (e) {
          if (e instanceof UnprocessableEntityException) {
            throw e;
          }

          // Couldn't get on-chain balance - trust Zerion
          this.logger.error(
            `Could not verify with on-chain balance: ${e instanceof Error ? e.message : 'Unknown error'}. ` +
            `Trusting Zerion result.`,
          );

          const errorMessage =
            balanceValidation.error ||
            `Insufficient balance. Zerion shows: ${balanceValidation.zerionBalance} smallest units, ` +
            `Requested: ${amountSmallest.toString()} smallest units. ` +
            `Could not verify with on-chain balance.`;

          throw new UnprocessableEntityException(errorMessage);
        }
      } else {
        // Zerion says sufficient - log for debugging but proceed
        this.logger.log(
          `Balance validation passed: Zerion shows ${balanceValidation.zerionBalance}, ` +
          `requested ${amountSmallest.toString()}`,
        );
      }

      // Send transaction- single mapped method per account type
      let txHash: string = '';
      let sendMethod: string = 'unknown';

      try {
        if (tokenAddress) {
          // ERC-20 token transfer
          // Use account.transfer with structured parameters (preferred for both EOA and ERC-4337)
          if (
            'transfer' in account &&
            typeof (account as any).transfer === 'function'
          ) {
            try {
              // Try with 'recipient' key first
              // Define a type for accounts with transfer method
              type TransferableAccount = {
                transfer(params: {
                  token: string;
                  recipient: string;
                  amount: bigint;
                }): Promise<string | { hash?: string; txHash?: string }>;
              };
              const transferableAccount = account as TransferableAccount;
              const result = await transferableAccount.transfer({
                token: tokenAddress,
                recipient: recipientAddress,
                amount: amountSmallest,
              });
              if (typeof result === 'string') {
                txHash = result;
              } else if (
                typeof result === 'object' &&
                result !== null &&
                ('hash' in result || 'txHash' in result)
              ) {
                txHash =
                  (result as { hash?: string; txHash?: string }).hash ||
                  (result as { hash?: string; txHash?: string }).txHash ||
                  String(result);
              } else {
                txHash = String(result);
              }
              sendMethod = 'transfer({token, recipient, amount})';
            } catch (e1) {
              // Try with 'to' key if 'recipient' was not accepted
              try {
                const result = await (account as any).transfer({
                  token: tokenAddress,
                  to: recipientAddress,
                  amount: amountSmallest,
                });
                txHash =
                  typeof result === 'string'
                    ? result
                    : result?.hash || result?.txHash || String(result);
                sendMethod = 'transfer({token, to, amount})';
              } catch (e2) {
                this.logger.error(
                  `Token transfer via account.transfer failed: ${e2 instanceof Error ? e2.message : 'unknown'}`,
                );
                throw new ServiceUnavailableException(
                  `Token transfer method not supported. Account type: ${accountType}, ` +
                  `Error: ${e2 instanceof Error ? e2.message : 'unknown'}`,
                );
              }
            }
          } else {
            throw new ServiceUnavailableException(
              `Token transfer not supported for account type ${accountType} on chain ${chain}. ` +
              `The account does not support the transfer method.`,
            );
          }
        } else {
          // Native token transfer
          if ('send' in account && typeof account.send === 'function') {
            const result = await account.send(
              recipientAddress,
              amountSmallest.toString(),
            );
            txHash =
              typeof result === 'string'
                ? result
                : (result as any).hash ||
                (result as any).txHash ||
                String(result);
            sendMethod = 'send(recipient, amount)';
          } else if (
            'transfer' in account &&
            typeof (account as any).transfer === 'function'
          ) {
            const result = await (account as any).transfer({
              to: recipientAddress,
              amount: amountSmallest,
            });
            txHash =
              typeof result === 'string'
                ? result
                : result.hash || result.txHash || String(result);
            sendMethod = 'transfer({to, amount})';
          } else {
            throw new BadRequestException(
              `Native token send not supported for chain ${chain}. ` +
              `Account type: ${accountType}. Please check if this chain/account combination is supported.`,
            );
          }
        }

        if (!txHash || typeof txHash !== 'string') {
          throw new ServiceUnavailableException(
            'Transaction submitted but no transaction hash returned',
          );
        }

        // Structured logging for successful transaction
        this.logger.log(
          `Transaction successful: chain=${chain}, accountType=${accountType}, ` +
          `token=${tokenAddress || 'native'}, decimals=${finalDecimals} (source: ${decimalsSource}), ` +
          `humanAmount=${amount}, amountSmallest=${amountSmallest.toString()}, ` +
          `method=${sendMethod}, txHash=${txHash}, recipient=${recipientAddress}`,
        );

        // Invalidate caches after successful send
        try {
          // Invalidate Zerion cache
          this.zerionService.invalidateCache(walletAddress, chain);
          this.logger.log(
            `Invalidated Zerion cache for ${walletAddress} on ${chain} after send`,
          );
        } catch (cacheError) {
          this.logger.warn(
            `Failed to invalidate cache: ${cacheError instanceof Error ? cacheError.message : 'Unknown error'}`,
          );
        }

        return { txHash };
      } catch (error) {
        // Structured error logging
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Transaction failed: chain=${chain}, accountType=${accountType}, ` +
          `token=${tokenAddress || 'native'}, decimals=${finalDecimals} (source: ${decimalsSource}), ` +
          `humanAmount=${amount}, amountSmallest=${amountSmallest.toString()}, ` +
          `method=${sendMethod}, error=${errorMessage}`,
        );

        // Re-throw known exceptions
        if (
          error instanceof BadRequestException ||
          error instanceof UnprocessableEntityException ||
          error instanceof ServiceUnavailableException
        ) {
          throw error;
        }

        // Enhanced error handling with specific messages
        const lowerError = errorMessage.toLowerCase();

        if (
          lowerError.includes('insufficient') ||
          lowerError.includes('balance')
        ) {
          throw new UnprocessableEntityException(
            `Insufficient balance for this transaction. ` +
            `Please check your balance and try again. Error: ${errorMessage}`,
          );
        }

        if (
          lowerError.includes('network') ||
          lowerError.includes('timeout') ||
          lowerError.includes('rpc')
        ) {
          throw new ServiceUnavailableException(
            `Blockchain network is unavailable. Please try again later. Error: ${errorMessage}`,
          );
        }

        if (
          lowerError.includes('invalid address') ||
          lowerError.includes('address')
        ) {
          throw new BadRequestException(
            `Invalid recipient address. Error: ${errorMessage}`,
          );
        }

        if (
          lowerError.includes('nonce') ||
          lowerError.includes('replacement')
        ) {
          throw new ServiceUnavailableException(
            `Transaction nonce error. Please wait a moment and try again. Error: ${errorMessage}`,
          );
        }

        // Generic fallback
        throw new ServiceUnavailableException(
          `Transaction failed: ${errorMessage}`,
        );
      }
    } catch (error) {
      // Re-throw known exceptions (they already have proper error messages)
      if (
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      // Log unexpected errors with full context
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Unexpected error in sendCrypto: userId=${userId}, chain=${chain}, ` +
        `token=${tokenAddress || 'native'}, amount=${amount}, error=${errorMessage}`,
      );
      this.logger.error(
        `Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`,
      );
      throw new ServiceUnavailableException(
        `Failed to send crypto: ${errorMessage}`,
      );
    }
  }

  async sendEip7702Gasless(
    userId: string,
    chainId: number,
    recipientAddress: string,
    amount: string,
    tokenAddress?: string,
    tokenDecimals?: number,
  ): Promise<{
    success: boolean;
    userOpHash: string;
    transactionHash?: string;
    isFirstTransaction: boolean;
    explorerUrl?: string;
  }> {
    const chainIdMap: Record<number, AllChainTypes> = {
      1: 'ethereum',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      137: 'polygon',
      43114: 'avalanche',
      56: 'bnb',
    };

    const chain = chainIdMap[chainId];
    if (!chain) {
      throw new BadRequestException(`Unsupported EIP-7702 chainId: ${chainId}`);
    }

    if (!this.pimlicoConfig.isEip7702Enabled(chain)) {
      throw new BadRequestException(
        `EIP-7702 is not enabled for chain ${chain}. Enable via config before sending gasless transactions.`,
      );
    }

    // Determine if this is the first delegation/transaction before sending
    const isFirstTransaction =
      !(await this.eip7702DelegationRepository.hasDelegation(userId, chainId));

    const { txHash } = await this.sendCrypto(
      userId,
      chain,
      recipientAddress,
      amount,
      tokenAddress,
      tokenDecimals,
      { forceEip7702: true },
    );

    // Generate explorer URL for the transaction
    const explorerUrl = getExplorerUrl(txHash, chainId);

    return {
      success: true,
      userOpHash: txHash,
      transactionHash: txHash,
      isFirstTransaction,
      explorerUrl,
    };
  }

  /**
   * Sign a WalletConnect transaction request
   * @param userId - The user ID
   * @param chainId - WalletConnect chain ID (e.g., "eip155:1", "eip155:8453")
   * @param transaction - Transaction parameters from WalletConnect
   * @returns Transaction hash
   */
  async signWalletConnectTransaction(
    userId: string,
    chainId: string,
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
    },
  ): Promise<{ txHash: string }> {
    const hasSeed = await this.seedRepository.hasSeed(userId);

    if (!hasSeed) {
      await this.createOrImportSeed(userId, 'random');
    }

    const chainIdMatch = chainId.match(/^eip155:(\d+)$/);
    if (!chainIdMatch || !chainIdMatch[1]) {
      throw new BadRequestException(
        `Invalid WalletConnect chain ID format: ${chainId}. Expected format: eip155:chainId`,
      );
    }

    const chainMap: Record<string, AllChainTypes> = {
      '1': 'ethereum',
      '8453': 'base',
      '42161': 'arbitrum',
      '137': 'polygon',
      '43114': 'avalanche',
    };

    const internalChain = chainMap[chainIdMatch[1]];
    if (!internalChain) {
      throw new BadRequestException(
        `Unsupported chain ID: ${chainIdMatch[1]}. Supported chains: ${Object.keys(chainMap).join(', ')}`,
      );
    }

    const seedPhrase = await this.seedRepository.getSeedPhrase(userId);
    const account = await this.createAccountForChain(
      seedPhrase,
      internalChain,
      userId,
    );

    const to = transaction.to || transaction.from;
    const value = transaction.value || '0';
    const txHash = await account.send(to, value);
    return { txHash };
  }

  /**
   * Get token balances for a specific chain using Zerion API
   * @param userId - The user ID
   * @param chain - The blockchain network
   * @param forceRefresh - Force refresh from API (bypass Zerion's internal cache)
   * @returns Array of token balances
   */
  async getTokenBalances(
    userId: string,
    chain: string,
    forceRefresh: boolean = false,
  ): Promise<
    Array<{
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
    }>
  > {
    this.logger.debug(
      `Getting token balances for user ${userId} on chain ${chain} using Zerion${forceRefresh ? ' (force refresh)' : ''}`,
    );

    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);

    if (!hasSeed) {
      this.logger.debug(`No wallet found for user ${userId}. Auto-creating...`);
      await this.createOrImportSeed(userId, 'random');
      this.logger.debug(`Successfully auto-created wallet for user ${userId}`);
    }

    try {
      // Get address for this chain
      const addresses = await this.getAddresses(userId);
      const address = addresses[chain as keyof WalletAddresses];

      if (!address) {
        this.logger.warn(`No address found for chain ${chain}`);
        return [];
      }

      // Invalidate Zerion cache if force refresh is requested
      if (forceRefresh) {
        this.zerionService.invalidateCache(address, chain);
      }

      // Get portfolio from Zerion (includes native + all ERC-20 tokens)
      const portfolio = await this.zerionService.getPortfolio(address, chain);

      // Check if portfolio has valid data array
      if (
        !portfolio?.data ||
        !Array.isArray(portfolio.data) ||
        portfolio.data.length === 0
      ) {
        // Zerion doesn't support this chain or returned no data
        this.logger.warn(
          `No portfolio data from Zerion for ${address} on ${chain}`,
        );
        return [];
      }

      const tokens: Array<{
        address: string | null;
        symbol: string;
        balance: string;
        decimals: number;
      }> = [];

      // Process each token in portfolio
      for (const tokenData of portfolio.data) {
        try {
          const quantity = tokenData.attributes?.quantity;
          if (!quantity) continue;

          const intPart = quantity.int || '0';
          const decimals = quantity.decimals || 0;

          // Convert to standard format (18 decimals)
          const balance = `${intPart}${'0'.repeat(Math.max(0, 18 - decimals))}`;

          // Skip zero balances
          if (parseFloat(balance) === 0) continue;

          // Determine if native token or ERC-20
          const isNative =
            tokenData.type === 'native' || !tokenData.attributes?.fungible_info;
          const fungibleInfo = tokenData.attributes?.fungible_info;

          if (isNative) {
            // Native token
            const nativeSymbol = this.getNativeTokenSymbol(chain);
            const nativeDecimals = this.getNativeTokenDecimals(chain);

            tokens.push({
              address: null,
              symbol: nativeSymbol,
              balance,
              decimals: nativeDecimals,
            });
          } else if (fungibleInfo) {
            // ERC-20 token
            const tokenAddress =
              fungibleInfo.implementations?.[0]?.address || null;
            const symbol = fungibleInfo.symbol || 'UNKNOWN';
            // Use smart fallback for known tokens
            const tokenDecimals =
              fungibleInfo.decimals ??
              this.getDefaultDecimals(chain, tokenAddress);

            tokens.push({
              address: tokenAddress,
              symbol,
              balance,
              decimals: tokenDecimals,
            });
          }
        } catch (error) {
          this.logger.debug(
            `Error processing token from Zerion: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.debug(
        `Retrieved ${tokens.length} tokens from Zerion for ${chain}`,
      );
      return tokens;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error getting token balances from Zerion: ${errorMessage}`,
      );

      // Return empty array if Zerion fails (Zerion is primary source)
      return [];
    }
  }

  /**
   * Get native token symbol for a chain
   */
  private getNativeTokenSymbol(chain: string): string {
    const symbols: Record<string, string> = {
      ethereum: 'ETH',
      base: 'ETH',
      arbitrum: 'ETH',
      polygon: 'MATIC',
      avalanche: 'AVAX',
      tron: 'TRX',
      bitcoin: 'BTC',
      solana: 'SOL',
      ethereumErc4337: 'ETH',
      baseErc4337: 'ETH',
      arbitrumErc4337: 'ETH',
      polygonErc4337: 'MATIC',
      avalancheErc4337: 'AVAX',
    };
    return symbols[chain] || chain.toUpperCase();
  }

  /**
   * Get native token decimals for a chain
   */
  private getNativeTokenDecimals(chain: string): number {
    const decimals: Record<string, number> = {
      ethereum: 18,
      base: 18,
      arbitrum: 18,
      polygon: 18,
      avalanche: 18,
      tron: 6,
      bitcoin: 8,
      solana: 9,
      ethereumErc4337: 18,
      baseErc4337: 18,
      arbitrumErc4337: 18,
      polygonErc4337: 18,
      avalancheErc4337: 18,
    };
    return decimals[chain] || 18;
  }

  /**
   * Get default decimals for a token address with known overrides
   * Used as fallback when Zerion doesn't provide decimals
   * @param chain - The blockchain network
   * @param address - The token contract address (lowercase)
   * @returns Token decimals (defaults to 18 for unknown tokens)
   */
  private getDefaultDecimals(chain: string, address: string | null): number {
    // Native tokens - return 0 to indicate native (caller should use chain-specific decimals)
    if (!address) {
      return 0;
    }

    const addr = address.toLowerCase();

    // Known token decimals overrides (cross-chain)
    const overrides: Record<string, number> = {
      // === Native USDC (6 decimals) ===
      // Base
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,
      // Ethereum
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,
      // Arbitrum
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,
      // Polygon
      '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 6,

      // === USDT (6 decimals) ===
      // Ethereum
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,
      // Arbitrum
      '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6,
      // Polygon
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6,

      // === Bridged USDbC (Base - 18 decimals) ===
      '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 18,

      // === WBTC (8 decimals) ===
      // Ethereum
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 8,
      // Arbitrum
      '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 8,
      // Polygon
      '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 8,
    };

    return overrides[addr] ?? 18;
  }

  /**
   * Check if chain is EVM-compatible
   */
  private isEvmChain(chain: string): boolean {
    const evmChains = [
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
      'ethereumErc4337',
      'baseErc4337',
      'arbitrumErc4337',
      'polygonErc4337',
      'avalancheErc4337',
    ];
    return evmChains.includes(chain);
  }

  /**
   * Discover tokens by scanning Transfer events from the account
   * This scans recent Transfer events to find all tokens the account has interacted with
   */
  private async discoverTokensFromEvents(
    account: any,
    chain: string,
  ): Promise<
    Array<{
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
    }>
  > {
    // EIP-7702 refactor: event-based discovery temporarily disabled.
    // Zerion balance fetch plus cached tokens cover discovery today.
    return [];
  }

  /**
   * Decode string from hex-encoded ABI return value
   */
  private decodeStringFromHex(hex: string): string {
    try {
      // Remove 0x prefix
      const hexWithoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;

      // Skip offset and length (first 64 chars = 32 bytes each)
      // Then decode the string
      const offset = parseInt(hexWithoutPrefix.slice(0, 64), 16);
      const length = parseInt(hexWithoutPrefix.slice(64, 128), 16);
      const stringHex = hexWithoutPrefix.slice(128, 128 + length * 2);

      // Convert hex to string
      let result = '';
      for (let i = 0; i < stringHex.length; i += 2) {
        const charCode = parseInt(stringHex.substr(i, 2), 16);
        if (charCode > 0) {
          result += String.fromCharCode(charCode);
        }
      }

      return result || 'UNKNOWN';
    } catch (error) {
      return 'UNKNOWN';
    }
  }

  /**
   * Refresh balances for known tokens (used when serving from cache)
   * Note: This method now primarily relies on Zerion API for real-time balances
   * Fallback to cached values is acceptable since cache is refreshed periodically
   */
  private async refreshTokenBalances(
    userId: string,
    chain: string,
    cachedTokens: Array<{
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
    }>,
  ): Promise<
    Array<{
      address: string | null;
      symbol: string;
      balance: string;
      decimals: number;
    }>
  > {
    try {
      // For now, return cached tokens as-is
      // The primary balance source is Zerion API which is called in getTokenBalances()
      // This method is mainly used to serve from cache while a background refresh happens
      this.logger.debug(
        `Serving cached token balances for ${chain} (${cachedTokens.length} tokens)`,
      );
      return cachedTokens;
    } catch (error) {
      this.logger.warn(
        `Failed to refresh token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return cachedTokens; // Return cached on error
    }
  }

  /**
   * Get token addresses for a chain (fallback list for common tokens)
   * Used when dynamic discovery fails
   */
  private getTokenAddressesForChain(
    chain: string,
  ): Array<{ address: string; symbol: string; decimals: number }> {
    // Token addresses per network (fallback for common tokens)
    const tokens: Record<
      string,
      Array<{ address: string; symbol: string; decimals: number }>
    > = {
      ethereum: [
        {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          symbol: 'USDT',
          decimals: 6,
        },
        {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          decimals: 6,
        },
      ],
      ethereumErc4337: [
        {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          symbol: 'USDT',
          decimals: 6,
        },
        {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          decimals: 6,
        },
      ],
      baseErc4337: [
        {
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          symbol: 'USDC',
          decimals: 6,
        },
      ],
      arbitrumErc4337: [
        {
          address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
          symbol: 'USDT',
          decimals: 6,
        },
        {
          address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          symbol: 'USDC',
          decimals: 6,
        },
      ],
      polygonErc4337: [
        {
          address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          symbol: 'USDT',
          decimals: 6,
        },
        {
          address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          symbol: 'USDC',
          decimals: 6,
        },
      ],
    };
    return tokens[chain] || [];
  }

  /**
   * Get transaction history for a user on a specific chain using Zerion API
   * @param userId - The user ID
   * @param chain - The chain identifier
   * @param limit - Maximum number of transactions to return (default: 50)
   * @returns Array of transaction objects
   */
  async getTransactionHistory(
    userId: string,
    chain: string,
    limit: number = 50,
  ): Promise<
    Array<{
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
    }>
  > {
    this.logger.log(
      `Getting transaction history for user ${userId} on chain ${chain} using Zerion`,
    );

    // Check if wallet exists, create if not
    const hasSeed = await this.seedRepository.hasSeed(userId);

    if (!hasSeed) {
      this.logger.debug(`No wallet found for user ${userId}. Auto-creating...`);
      await this.createOrImportSeed(userId, 'random');
      this.logger.debug(`Successfully auto-created wallet for user ${userId}`);
    }

    try {
      // Get address for this chain
      const addresses = await this.getAddresses(userId);
      const address = addresses[chain as keyof WalletAddresses];

      if (!address) {
        this.logger.warn(`No address found for chain ${chain}`);
        return [];
      }

      // Get transactions from Zerion
      const zerionTransactions = await this.zerionService.getTransactions(
        address,
        chain,
        limit,
      );

      if (!zerionTransactions || zerionTransactions.length === 0) {
        this.logger.debug(
          `No transactions from Zerion for ${address} on ${chain}`,
        );
        return [];
      }

      const transactions: Array<{
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
      }> = [];

      // Map Zerion transactions to our format
      for (const zerionTx of zerionTransactions) {
        try {
          const attributes = zerionTx.attributes || {};
          const txHash = attributes.hash || zerionTx.id || '';
          const timestamp = attributes.mined_at || attributes.sent_at || null;
          const blockNumber = attributes.block_number || null;

          // Determine status
          let status: 'success' | 'failed' | 'pending' = 'pending';
          if (attributes.status) {
            const statusLower = attributes.status.toLowerCase();
            if (statusLower === 'confirmed' || statusLower === 'success') {
              status = 'success';
            } else if (statusLower === 'failed' || statusLower === 'error') {
              status = 'failed';
            }
          } else if (
            attributes.block_confirmations !== undefined &&
            attributes.block_confirmations > 0
          ) {
            status = 'success';
          }

          // Get transfer information
          const transfers = attributes.transfers || [];
          let tokenSymbol: string | undefined;
          let tokenAddress: string | undefined;
          let value = '0';
          let toAddress: string | null = null;

          if (transfers.length > 0) {
            // Use first transfer for token info
            const transfer = transfers[0];
            if (transfer) {
              tokenSymbol = transfer.fungible_info?.symbol;
              const quantity = transfer.quantity;
              if (quantity) {
                const intPart = quantity.int || '0';
                const decimals = quantity.decimals || 0;
                value = `${intPart}${'0'.repeat(Math.max(0, 18 - decimals))}`;
              }
              toAddress = transfer.to?.address || null;
            }
          } else {
            // Native token transfer - get from fee or use default
            if (attributes.fee?.value) {
              value = attributes.fee.value.toString();
            }
          }

          transactions.push({
            txHash,
            from: address,
            to: toAddress,
            value,
            timestamp,
            blockNumber,
            status,
            chain,
            tokenSymbol,
            tokenAddress,
          });
        } catch (error) {
          this.logger.debug(
            `Error processing transaction from Zerion: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(
        `Retrieved ${transactions.length} transactions from Zerion for ${chain}`,
      );
      return transactions;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error getting transaction history from Zerion: ${errorMessage}`,
      );
      return [];
    }
  }

  /**
   * Get Substrate balances for all chains for a user
   *
   * @param userId - User ID
   * @param useTestnet - Whether to use testnet
   * @returns Map of chain -> balance information
   */
  async getSubstrateBalances(
    userId: string,
    useTestnet: boolean = false,
    forceRefresh: boolean = false,
  ): Promise<
    Record<
      SubstrateChainKey,
      {
        balance: string;
        address: string | null;
        token: string;
        decimals: number;
      }
    >
  > {
    // Fast path: Check database cache first (unless force refresh)
    const cacheKey = `substrate_${useTestnet ? 'testnet' : 'mainnet'}`;

    if (!forceRefresh) {
      const cachedBalances =
        await this.balanceCacheRepository.getCachedBalances(userId);
      if (cachedBalances) {
        // Check if we have substrate balances cached
        const substrateChains: SubstrateChainKey[] = [
          'polkadot',
          'hydration',
          'bifrost',
          'unique',
          'paseo',
          'paseoAssethub',
        ];
        const hasSubstrateCache = substrateChains.some((chain) => {
          const key = `${cacheKey}_${chain}`;
          return cachedBalances[key] !== undefined;
        });

        if (hasSubstrateCache) {
          this.logger.debug(
            `Returning cached Substrate balances from DB for user ${userId}`,
          );
          const result: Record<
            string,
            {
              balance: string;
              address: string | null;
              token: string;
              decimals: number;
            }
          > = {};

          for (const chain of substrateChains) {
            const key = `${cacheKey}_${chain}`;
            const cached = cachedBalances[key];
            if (cached) {
              const chainConfig = this.substrateManager.getChainConfig(
                chain,
                useTestnet,
              );
              // We need to get the address separately since it's not in cache
              const addresses = await this.addressManager.getAddresses(userId);
              let address: string | null = null;

              // Map chain to address key
              const addressMap: Record<
                SubstrateChainKey,
                keyof WalletAddresses
              > = {
                polkadot: 'polkadot',
                hydration: 'hydrationSubstrate',
                bifrost: 'bifrostSubstrate',
                unique: 'uniqueSubstrate',
                paseo: 'paseo',
                paseoAssethub: 'paseoAssethub',
              };

              address = addresses[addressMap[chain]] ?? null;

              result[chain] = {
                balance: cached.balance,
                address,
                token: chainConfig.token.symbol,
                decimals: chainConfig.token.decimals,
              };
            }
          }

          if (Object.keys(result).length > 0) {
            return result as Record<
              SubstrateChainKey,
              {
                balance: string;
                address: string | null;
                token: string;
                decimals: number;
              }
            >;
          }
        }
      }
    }

    this.logger.log(
      `[WalletService] Getting Substrate balances for user ${userId} (testnet: ${useTestnet})`,
    );
    const balances = await this.substrateManager.getBalances(
      userId,
      useTestnet,
    );
    this.logger.log(
      `[WalletService] Received ${Object.keys(balances).length} Substrate chain balances`,
    );

    const result: Record<
      string,
      {
        balance: string;
        address: string | null;
        token: string;
        decimals: number;
      }
    > = {};
    const balancesToCache: Record<
      string,
      { balance: string; lastUpdated: number }
    > = {};

    for (const [chain, data] of Object.entries(balances)) {
      const chainConfig = this.substrateManager.getChainConfig(
        chain as SubstrateChainKey,
        useTestnet,
      );
      result[chain] = {
        balance: data.balance,
        address: data.address,
        token: chainConfig.token.symbol,
        decimals: chainConfig.token.decimals,
      };

      // Cache with a key that includes testnet/mainnet distinction
      const cacheKeyForChain = `${cacheKey}_${chain}`;
      balancesToCache[cacheKeyForChain] = {
        balance: data.balance,
        lastUpdated: Date.now(),
      };

      this.logger.debug(
        `[WalletService] ${chain}: ${data.balance} ${chainConfig.token.symbol} (address: ${data.address ? 'present' : 'null'})`,
      );
    }

    // Update cache with substrate balances (merge with existing cache)
    const existingCache =
      (await this.balanceCacheRepository.getCachedBalances(userId)) || {};
    const mergedCache = { ...existingCache, ...balancesToCache };
    await this.balanceCacheRepository.updateCachedBalances(userId, mergedCache);

    this.logger.log(
      `[WalletService] Returning ${Object.keys(result).length} Substrate balances`,
    );
    return result as Record<
      SubstrateChainKey,
      {
        balance: string;
        address: string | null;
        token: string;
        decimals: number;
      }
    >;
  }

  /**
   * Get Substrate transaction history for a user
   *
   * @param userId - User ID
   * @param chain - Chain key
   * @param useTestnet - Whether to use testnet
   * @param limit - Number of transactions to fetch
   * @param cursor - Pagination cursor
   * @returns Transaction history
   */
  async getSubstrateTransactions(
    userId: string,
    chain: SubstrateChainKey,
    useTestnet: boolean = false,
    limit: number = 10,
    cursor?: string,
  ) {
    return this.substrateManager.getUserTransactionHistory(
      userId,
      chain,
      useTestnet,
      limit,
      cursor,
    );
  }

  /**
   * Get Substrate addresses for a user
   *
   * @param userId - User ID
   * @param useTestnet - Whether to use testnet
   * @returns Substrate addresses
   */
  async getSubstrateAddresses(userId: string, useTestnet: boolean = false) {
    return this.substrateManager.getAddresses(userId, useTestnet);
  }

  /**
   * Send Substrate transfer
   *
   * @param userId - User ID
   * @param chain - Chain key
   * @param to - Recipient address
   * @param amount - Amount in smallest units
   * @param useTestnet - Whether to use testnet
   * @param transferMethod - Transfer method ('transferAllowDeath' or 'transferKeepAlive')
   * @param accountIndex - Account index (default: 0)
   * @returns Transaction result
   */
  async sendSubstrateTransfer(
    userId: string,
    chain: SubstrateChainKey,
    to: string,
    amount: string,
    useTestnet: boolean = false,
    transferMethod?: 'transferAllowDeath' | 'transferKeepAlive',
    accountIndex: number = 0,
  ) {
    return this.substrateManager.sendTransfer(
      userId,
      {
        from: '', // Will be resolved from userId in SubstrateTransactionService
        to,
        amount,
        chain,
        useTestnet,
        transferMethod,
      },
      accountIndex,
    );
  }

  /**
   * Get real-time gas price for a chain
   * Returns estimated fee for a standard transfer (21000 gas) in native units
   */
  async getGasPrice(chain: string): Promise<string> {
    // Handle ERC-4337 chain aliases (e.g., ethereumErc4337 -> ethereum)
    // This allows Smart Accounts to fetch gas prices from the underlying network
    const canonicalChain = chain.replace(/Erc4337$/i, '');

    if (!this.chainConfig.isEvmChain(canonicalChain)) {
      return '--';
    }

    try {
      const config = this.chainConfig.getEvmChainConfig(canonicalChain as any);

      const client = createPublicClient({
        transport: http(config.rpcUrl)
      });

      const gasPrice = await client.getGasPrice();
      // Standard transfer is 21000 gas
      const estimatedCost = gasPrice * 21000n;

      const formatted = formatEther(estimatedCost);
      // Format to 6 decimal places max
      const value = parseFloat(formatted);

      if (value < 0.000001) return '< 0.000001 ' + config.nativeCurrency.symbol;
      return value.toFixed(6) + ' ' + config.nativeCurrency.symbol;
    } catch (error) {
      this.logger.error(`Failed to get gas price for ${chain} (canonical: ${canonicalChain}): ${error instanceof Error ? error.message : 'Unknown error'}`);
      return '--';
    }
  }
}
