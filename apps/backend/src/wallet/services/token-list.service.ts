import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface TokenEntry {
  chain: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number | null;
  logoURI?: string | null;
}

interface TokenListFile {
  name?: string;
  version?: string;
  tokens: TokenEntry[];
}

/**
 * Service to load and manage token lists from JSON files
 * Only for Polkadot EVM chains: moonbeamTestnet, astarShibuya, paseoPassetHub
 */
@Injectable()
export class TokenListService {
  private readonly logger = new Logger(TokenListService.name);

  // Chain mapping: internal chain names to JSON file chain identifiers
  private readonly chainMapping: Record<string, string[]> = {
    moonbeamTestnet: ['moonbase', 'moonbeam-testnet', 'moonbeam', 'mainnet'], // mainnet might be Moonbeam mainnet
    astarShibuya: ['astar-zkevm', 'astar-shibuya', 'astar', 'shibuya'],
    paseoPassetHub: ['paseo', 'passethub', 'paseo-passethub'],
  };

  // Cached token lists
  private polkadotEvmTokens: TokenEntry[] = [];
  private allTokens: TokenEntry[] = [];
  private tokensByChain: Map<string, TokenEntry[]> = new Map();

  constructor() {
    this.loadTokenLists();
  }

  /**
   * Load token lists from JSON files
   */
  private loadTokenLists(): void {
    try {
      // Load polkadot-evm-tokens.json
      // Use import.meta.url to get the current file's directory in ES modules
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const currentDir = path.dirname(currentFilePath); // e.g., /path/to/wallet/services
      const tokensDir = path.join(currentDir, '..', 'tokens');
      const polkadotEvmPath = path.join(
        tokensDir,
        'polkadot-evm-tokens.json',
      );
      if (fs.existsSync(polkadotEvmPath)) {
        const fileContent = fs.readFileSync(polkadotEvmPath, 'utf-8');
        const data: TokenListFile = JSON.parse(fileContent);
        this.polkadotEvmTokens = data.tokens || [];
        this.logger.debug(
          `Loaded ${this.polkadotEvmTokens.length} tokens from polkadot-evm-tokens.json`,
        );
      } else {
        this.logger.warn(
          `Token list file not found: ${polkadotEvmPath}`,
        );
      }

      // Load all-tokens.json (as fallback)
      const allTokensPath = path.join(tokensDir, 'all-tokens.json');
      if (fs.existsSync(allTokensPath)) {
        const fileContent = fs.readFileSync(allTokensPath, 'utf-8');
        const data: TokenListFile = JSON.parse(fileContent);
        this.allTokens = data.tokens || [];
        this.logger.debug(
          `Loaded ${this.allTokens.length} tokens from all-tokens.json`,
        );
      } else {
        this.logger.warn(`Token list file not found: ${allTokensPath}`);
      }

      // Build chain index
      this.buildChainIndex();
    } catch (error) {
      this.logger.error(
        `Failed to load token lists: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Build index of tokens by chain identifier
   */
  private buildChainIndex(): void {
    const allTokensList = [...this.polkadotEvmTokens, ...this.allTokens];
    const chainMap = new Map<string, TokenEntry[]>();

    for (const token of allTokensList) {
      const chainId = token.chain.toLowerCase();
      if (!chainMap.has(chainId)) {
        chainMap.set(chainId, []);
      }
      chainMap.get(chainId)!.push(token);
    }

    this.tokensByChain = chainMap;
    this.logger.log(
      `Indexed tokens for ${chainMap.size} unique chain identifiers`,
    );
  }

  /**
   * Get tokens for a specific internal chain name
   * Maps internal chain names to JSON file chain identifiers
   */
  getTokensForChain(internalChainName: string): TokenEntry[] {
    const chainVariants = this.chainMapping[internalChainName];
    if (!chainVariants) {
      this.logger.debug(
        `No chain mapping found for: ${internalChainName}`,
      );
      return [];
    }

    const tokens: TokenEntry[] = [];
    const seenAddresses = new Set<string>();

    // Try each chain variant
    for (const variant of chainVariants) {
      const chainTokens = this.tokensByChain.get(variant.toLowerCase()) || [];
      for (const token of chainTokens) {
        const addressKey = `${token.chain.toLowerCase()}:${token.address.toLowerCase()}`;
        if (!seenAddresses.has(addressKey)) {
          seenAddresses.add(addressKey);
          tokens.push(token);
        }
      }
    }

    this.logger.debug(
      `Found ${tokens.length} tokens for chain ${internalChainName} (variants: ${chainVariants.join(', ')})`,
    );

    return tokens;
  }

  /**
   * Get token metadata by address and chain
   */
  getTokenMetadata(
    internalChainName: string,
    tokenAddress: string,
  ): TokenEntry | null {
    const tokens = this.getTokensForChain(internalChainName);
    const addressLower = tokenAddress.toLowerCase();

    return (
      tokens.find(
        (token) => token.address.toLowerCase() === addressLower,
      ) || null
    );
  }

  /**
   * Check if a chain is supported (has token list mapping)
   */
  isChainSupported(internalChainName: string): boolean {
    return internalChainName in this.chainMapping;
  }
}

