import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  IAddressManager,
  WalletAddresses,
  WalletAddressMetadataMap,
  WalletAddressKind,
  WalletAddressKey,
} from '../interfaces/wallet.interfaces.js';
import { AllChainTypes } from '../types/chain.types.js';
import { SeedManager } from './seed.manager.js';
import { AccountFactory } from '../factories/account.factory.js';
import { PimlicoAccountFactory } from '../factories/pimlico-account.factory.js';
import { SubstrateManager } from '../substrate/managers/substrate.manager.js';
import { AddressCacheRepository } from '../repositories/address-cache.repository.js';

/**
 * Address Manager
 * Handles address generation and retrieval for all supported chains
 */
@Injectable()
export class AddressManager implements IAddressManager {
  private readonly logger = new Logger(AddressManager.name);

  // Cache for addresses per user to avoid repeated fetching
  private addressCache: Map<
    string,
    {
      addresses: WalletAddresses;
      metadata: WalletAddressMetadataMap;
      timestamp: number;
    }
  > = new Map();
  private readonly ADDRESS_CACHE_TTL = 60 * 1000; // 1 minute cache

  private readonly eoaChains: WalletAddressKey[] = [
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

  private readonly erc4337Chains: WalletAddressKey[] = [
    'ethereumErc4337',
    'baseErc4337',
    'arbitrumErc4337',
    'polygonErc4337',
    'avalancheErc4337',
  ];

  private readonly nonEvmChains: WalletAddressKey[] = [
    'tron',
    'bitcoin',
    'solana',
  ];

  constructor(
    private seedManager: SeedManager,
    private accountFactory: AccountFactory,
    private pimlicoAccountFactory: PimlicoAccountFactory,
    @Inject(forwardRef(() => SubstrateManager))
    private substrateManager: SubstrateManager,
    private addressCacheRepository: AddressCacheRepository,
  ) {}

  /**
   * Get all wallet addresses for all chains
   * Auto-creates wallet if it doesn't exist
   * Fast path: Returns cached addresses from database instantly
   */
  async getAddresses(userId: string): Promise<WalletAddresses> {
    // Fast path: Check database cache first
    const cachedAddresses = await this.addressCacheRepository.getCachedAddresses(userId);
    
    // If we have cached addresses, check if they're complete
    if (Object.keys(cachedAddresses).length > 0) {
      const allExpectedChains = this.getAllExpectedChainNames();
      const hasAllChains = allExpectedChains.every(chain => cachedAddresses[chain] !== undefined);
      
      if (hasAllChains) {
        // We have all addresses cached, return immediately
        this.logger.debug(`Returning cached addresses from DB for user ${userId}`);
        const partialResult = this.mapCachedAddressesToWalletAddresses(cachedAddresses);
        const result = this.ensureCompleteAddresses(partialResult);
        const metadata = this.buildMetadata(result);
        
        // Update in-memory cache
        this.addressCache.set(userId, {
          addresses: result,
          metadata,
          timestamp: Date.now(),
        });
        
        return result;
      }
    }

    // Ensure wallet exists
    const hasSeed = await this.seedManager.hasSeed(userId);
    if (!hasSeed) {
      this.logger.debug(`No wallet found for user ${userId}. Auto-creating...`);
      await this.seedManager.createOrImportSeed(userId, 'random');
      this.logger.debug(`Successfully auto-created wallet for user ${userId}`);
    }

    const seedPhrase = await this.seedManager.getSeed(userId);

    // Start with cached addresses, then generate missing ones
    const cachedPartial = this.mapCachedAddressesToWalletAddresses(cachedAddresses);
    const addresses: Partial<WalletAddresses> = { ...cachedPartial };
    const addressesToSave: Record<string, string> = {};

    // EOA chains
    const eoaChains: AllChainTypes[] = [
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
      'tron',
      'bitcoin',
      'solana',
    ];

    for (const chain of eoaChains) {
      // Skip if already cached
      if (addresses[chain as keyof WalletAddresses]) {
        continue;
      }

      try {
        const account = await this.accountFactory.createAccount(
          seedPhrase,
          chain,
          0,
        );
        const address = await account.getAddress();
        addresses[chain as keyof WalletAddresses] = address;
        addressesToSave[chain] = address;
        // Save to database immediately
        await this.addressCacheRepository.saveAddress(userId, chain, address);
      } catch (error) {
        this.logger.error(
          `Error getting EOA address for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        addresses[chain as keyof WalletAddresses] = null as any;
      }
    }

    // ERC-4337 smart accounts
    const erc4337Chains: (
      | 'ethereum'
      | 'base'
      | 'arbitrum'
      | 'polygon'
      | 'avalanche'
    )[] = ['ethereum', 'base', 'arbitrum', 'polygon', 'avalanche'];

    for (const chain of erc4337Chains) {
      const chainKey = `${chain}Erc4337` as keyof WalletAddresses;
      
      // Skip if already cached
      if (addresses[chainKey]) {
        continue;
      }

      try {
        const account = await this.pimlicoAccountFactory.createAccount(
          seedPhrase,
          chain,
          0,
        );
        const address = await account.getAddress();
        addresses[chainKey] = address;
        addressesToSave[chainKey] = address;
        // Save to database immediately
        await this.addressCacheRepository.saveAddress(userId, chainKey, address);
      } catch (error) {
        this.logger.error(
          `Error getting ERC-4337 address for ${chain}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        addresses[chainKey] = null as any;
      }
    }

    // Get Substrate addresses (parallel with EVM addresses)
    try {
      const substrateAddresses = await this.substrateManager.getAddresses(userId, false);
      
      // Map Substrate addresses to WalletAddresses format
      const substrateMappings: Array<{ key: keyof WalletAddresses; value: string | null }> = [
        { key: 'polkadot', value: substrateAddresses.polkadot ?? null },
        { key: 'hydrationSubstrate', value: substrateAddresses.hydration ?? null },
        { key: 'bifrostSubstrate', value: substrateAddresses.bifrost ?? null },
        { key: 'uniqueSubstrate', value: substrateAddresses.unique ?? null },
        { key: 'paseo', value: substrateAddresses.paseo ?? null },
        { key: 'paseoAssethub', value: substrateAddresses.paseoAssethub ?? null },
      ];

      for (const { key, value } of substrateMappings) {
        // Only update if not already cached or if cached value is null
        if (addresses[key] === undefined || addresses[key] === null) {
          addresses[key] = value as any;
          if (value) {
            addressesToSave[key] = value;
            // Save to database immediately
            await this.addressCacheRepository.saveAddress(userId, key, value);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error getting Substrate addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Set defaults only if not already set
      if (addresses.polkadot === undefined) addresses.polkadot = null;
      if (addresses.hydrationSubstrate === undefined) addresses.hydrationSubstrate = null;
      if (addresses.bifrostSubstrate === undefined) addresses.bifrostSubstrate = null;
      if (addresses.uniqueSubstrate === undefined) addresses.uniqueSubstrate = null;
      if (addresses.paseo === undefined) addresses.paseo = null;
      if (addresses.paseoAssethub === undefined) addresses.paseoAssethub = null;
    }

    const result = addresses as WalletAddresses;
    const metadata = this.buildMetadata(result);

    // Update in-memory cache
    this.addressCache.set(userId, {
      addresses: result,
      metadata,
      timestamp: Date.now(),
    });
    this.logFinalAddresses(userId, metadata);

    return result;
  }

  async getManagedAddresses(userId: string): Promise<{
    addresses: WalletAddresses;
    metadata: WalletAddressMetadataMap;
  }> {
    await this.getAddresses(userId);
    const cached = this.addressCache.get(userId);
    if (!cached) {
      throw new Error('Address cache missing after retrieval');
    }
    return { addresses: cached.addresses, metadata: cached.metadata };
  }

  /**
   * Get address for a specific chain
   */
  async getAddressForChain(
    userId: string,
    chain: AllChainTypes,
  ): Promise<string> {
    const addresses = await this.getAddresses(userId);
    const address = addresses[chain as keyof WalletAddresses];

    if (!address) {
      throw new Error(`No address found for chain: ${chain}`);
    }

    return address;
  }

  /**
   * Stream addresses progressively (for SSE)
   * Fast path: Streams cached addresses from database first (instant)
   * Then generates and streams missing addresses as they're created
   */
  async *streamAddresses(
    userId: string,
  ): AsyncGenerator<{ chain: string; address: string | null }, void, unknown> {
    // Ensure wallet exists
    const hasSeed = await this.seedManager.hasSeed(userId);
    if (!hasSeed) {
      this.logger.debug(`No wallet found for user ${userId}. Auto-creating...`);
      await this.seedManager.createOrImportSeed(userId, 'random');
      this.logger.debug(`Successfully auto-created wallet for user ${userId}`);
    }

    // Step 1: Fetch all cached addresses from database (instant)
    const cachedAddresses = await this.addressCacheRepository.getCachedAddresses(userId);
    this.logger.debug(`Found ${Object.keys(cachedAddresses).length} cached addresses for user ${userId}`);

    // Step 2: Stream all cached addresses immediately
    const allExpectedChains = this.getAllExpectedChainNames();
    for (const chain of allExpectedChains) {
      if (cachedAddresses[chain]) {
        yield { chain, address: cachedAddresses[chain] };
      }
    }

    // Step 3: Determine which addresses are missing
    const missingChains = allExpectedChains.filter(chain => !cachedAddresses[chain]);
    
    if (missingChains.length === 0) {
      // All addresses are cached, we're done
      return;
    }

    this.logger.debug(`Generating ${missingChains.length} missing addresses for user ${userId}`);

    // Step 4: Generate missing addresses
    const seedPhrase = await this.seedManager.getSeed(userId);

    // Process EOA chains
    const eoaChains: { name: string; chain: AllChainTypes }[] = [
      { name: 'ethereum', chain: 'ethereum' },
      { name: 'base', chain: 'base' },
      { name: 'arbitrum', chain: 'arbitrum' },
      { name: 'polygon', chain: 'polygon' },
      { name: 'avalanche', chain: 'avalanche' },
      { name: 'moonbeamTestnet', chain: 'moonbeamTestnet' },
      { name: 'astarShibuya', chain: 'astarShibuya' },
      { name: 'paseoPassetHub', chain: 'paseoPassetHub' },
      { name: 'tron', chain: 'tron' },
      { name: 'bitcoin', chain: 'bitcoin' },
      { name: 'solana', chain: 'solana' },
    ];

    for (const { name, chain } of eoaChains) {
      // Skip if already cached
      if (cachedAddresses[name]) {
        continue;
      }

      try {
        const account = await this.accountFactory.createAccount(
          seedPhrase,
          chain,
          0,
        );
        const address = await account.getAddress();
        // Save to database BEFORE streaming
        await this.addressCacheRepository.saveAddress(userId, name, address);
        yield { chain: name, address };
      } catch (error) {
        this.logger.error(
          `Error streaming address for ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        yield { chain: name, address: null };
      }
    }

    // Process ERC-4337 chains
    const erc4337Chains: {
      name: string;
      chain: 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche';
    }[] = [
      { name: 'ethereumErc4337', chain: 'ethereum' },
      { name: 'baseErc4337', chain: 'base' },
      { name: 'arbitrumErc4337', chain: 'arbitrum' },
      { name: 'polygonErc4337', chain: 'polygon' },
      { name: 'avalancheErc4337', chain: 'avalanche' },
    ];

    for (const { name, chain } of erc4337Chains) {
      // Skip if already cached
      if (cachedAddresses[name]) {
        continue;
      }

      try {
        const account = await this.pimlicoAccountFactory.createAccount(
          seedPhrase,
          chain,
          0,
        );
        const address = await account.getAddress();
        // Save to database BEFORE streaming
        await this.addressCacheRepository.saveAddress(userId, name, address);
        yield { chain: name, address };
      } catch (error) {
        this.logger.error(
          `Error streaming address for ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        yield { chain: name, address: null };
      }
    }

    // Process Substrate chains
    try {
      const substrateAddresses = await this.substrateManager.getAddresses(userId, false);
      
      // Map Substrate addresses to WalletAddresses format
      const substrateChains: { name: string; address: string | null }[] = [
        { name: 'polkadot', address: substrateAddresses.polkadot ?? null },
        { name: 'hydrationSubstrate', address: substrateAddresses.hydration ?? null },
        { name: 'bifrostSubstrate', address: substrateAddresses.bifrost ?? null },
        { name: 'uniqueSubstrate', address: substrateAddresses.unique ?? null },
        { name: 'paseo', address: substrateAddresses.paseo ?? null },
        { name: 'paseoAssethub', address: substrateAddresses.paseoAssethub ?? null },
      ];

      for (const { name, address } of substrateChains) {
        // Skip if already cached
        if (cachedAddresses[name]) {
          continue;
        }

        if (address) {
          // Save to database BEFORE streaming
          await this.addressCacheRepository.saveAddress(userId, name, address);
        }
        yield { chain: name, address };
      }
    } catch (error) {
      this.logger.error(
        `Error streaming Substrate addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Yield null addresses for all Substrate chains on error (only if not cached)
      const substrateChainNames = ['polkadot', 'hydrationSubstrate', 'bifrostSubstrate', 'uniqueSubstrate', 'paseo', 'paseoAssethub'];
      for (const name of substrateChainNames) {
        if (!cachedAddresses[name]) {
        yield { chain: name, address: null };
        }
      }
    }
  }

  /**
   * Invalidate address cache for a user
   */
  invalidateCache(userId: string): void {
    this.addressCache.delete(userId);
  }

  private logFinalAddresses(
    userId: string,
    metadata: WalletAddressMetadataMap,
  ): void {
    const summary = Object.fromEntries(
      Object.entries(metadata).map(([chain, entry]) => [
        chain,
        this.maskAddress(entry.address),
      ]),
    );
    this.logger.log(
      `Wallet addresses ready for user ${userId}: ${JSON.stringify(summary)}`,
    );
  }

  private maskAddress(address: string | null): string | null {
    if (!address) {
      return null;
    }
    if (address.length <= 10) {
      return address;
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private buildMetadata(addresses: WalletAddresses): WalletAddressMetadataMap {
    const metadata = {} as WalletAddressMetadataMap;

    const assign = (
      chain: WalletAddressKey,
      kind: WalletAddressKind,
      visible: boolean,
    ) => {
      metadata[chain] = {
        chain,
        address: addresses[chain],
        kind,
        visible,
        label: this.getLabelForChain(chain, kind),
      };
    };

    // Standard EOA chains (not visible by default)
    const standardEoaChains = this.eoaChains.filter(
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
    
    this.erc4337Chains.forEach((chain) => assign(chain, 'erc4337', true));
    this.nonEvmChains.forEach((chain) => assign(chain, 'nonEvm', true));

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
      ethereumErc4337: 'Ethereum Smart Account',
      baseErc4337: 'Base Smart Account',
      arbitrumErc4337: 'Arbitrum Smart Account',
      polygonErc4337: 'Polygon Smart Account',
      avalancheErc4337: 'Avalanche Smart Account',
      // Substrate chains
      polkadot: 'Polkadot',
      hydrationSubstrate: 'Hydration (Substrate)',
      bifrostSubstrate: 'Bifrost (Substrate)',
      uniqueSubstrate: 'Unique (Substrate)',
      paseo: 'Paseo',
      paseoAssethub: 'Paseo AssetHub',
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

  /**
   * Get all expected chain names that should be cached
   */
  private getAllExpectedChainNames(): string[] {
    return [
      // EOA chains
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
      'tron',
      'bitcoin',
      'solana',
      'hydration',
      'unique',
      'bifrost',
      'bifrostTestnet',
      // ERC-4337 chains
      'ethereumErc4337',
      'baseErc4337',
      'arbitrumErc4337',
      'polygonErc4337',
      'avalancheErc4337',
      // Substrate chains
      'polkadot',
      'hydrationSubstrate',
      'bifrostSubstrate',
      'uniqueSubstrate',
      'paseo',
      'paseoAssethub',
    ];
  }

  /**
   * Map cached addresses from database format to WalletAddresses format
   */
  private mapCachedAddressesToWalletAddresses(
    cachedAddresses: Record<string, string>,
  ): Partial<WalletAddresses> {
    const addresses: Partial<WalletAddresses> = {};
    
    // Map all known chains
    const allChains = this.getAllExpectedChainNames();
    for (const chain of allChains) {
      if (cachedAddresses[chain]) {
        addresses[chain as keyof WalletAddresses] = cachedAddresses[chain] as any;
      }
    }

    return addresses;
  }

  /**
   * Ensure all required fields are present in WalletAddresses
   * Fills missing fields with null or empty string as appropriate
   */
  private ensureCompleteAddresses(
    partial: Partial<WalletAddresses>,
  ): WalletAddresses {
    const allChains = this.getAllExpectedChainNames();
    const complete: any = { ...partial };

    // Ensure all required string fields have a value (default to empty string)
    const stringFields: (keyof WalletAddresses)[] = [
      'ethereum',
      'base',
      'arbitrum',
      'polygon',
      'avalanche',
      'tron',
      'bitcoin',
      'solana',
      'moonbeamTestnet',
      'astarShibuya',
      'paseoPassetHub',
      'hydration',
      'unique',
      'bifrost',
      'bifrostTestnet',
      'ethereumErc4337',
      'baseErc4337',
      'arbitrumErc4337',
      'polygonErc4337',
      'avalancheErc4337',
    ];

    for (const field of stringFields) {
      if (complete[field] === undefined || complete[field] === null) {
        complete[field] = '';
      }
    }

    // Substrate fields can be null
    const nullableFields: (keyof WalletAddresses)[] = [
      'polkadot',
      'hydrationSubstrate',
      'bifrostSubstrate',
      'uniqueSubstrate',
      'paseo',
      'paseoAssethub',
    ];

    for (const field of nullableFields) {
      if (complete[field] === undefined) {
        complete[field] = null;
      }
    }

    return complete as WalletAddresses;
  }
}
