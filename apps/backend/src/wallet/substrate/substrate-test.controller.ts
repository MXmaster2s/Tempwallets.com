import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ensureCryptoReady, isCryptoReady } from './utils/crypto-init.util.js';
import { ss58Util } from './utils/ss58.util.js';
import {
  buildDerivationPath,
  parseDerivationPath,
} from './utils/derivation.util.js';
import {
  SUBSTRATE_CHAINS,
  getChainConfig,
  getEnabledChains,
  getChainConfigFromAddress,
  SubstrateChainKey,
  ChainNetworkConfig,
} from './config/substrate-chain.config.js';
import { SubstrateRpcService } from './services/substrate-rpc.service.js';
import { SubstrateTransactionService } from './services/substrate-transaction.service.js';
import { MetadataCacheService } from './services/metadata-cache.service.js';
import { NonceManager } from './managers/nonce.manager.js';
import { SubstrateAccountFactory } from './factories/substrate-account.factory.js';
import { SubstrateAddressManager } from './managers/substrate-address.manager.js';

/**
 * Substrate Test Controller
 *
 * Test endpoints for Phase 2 components
 * Use these to verify all services are working correctly
 */
@Controller('wallet/substrate/test')
export class SubstrateTestController {
  private readonly logger = new Logger(SubstrateTestController.name);

  constructor(
    private readonly rpcService: SubstrateRpcService,
    private readonly transactionService: SubstrateTransactionService,
    private readonly metadataCache: MetadataCacheService,
    private readonly nonceManager: NonceManager,
    private readonly accountFactory: SubstrateAccountFactory,
    private readonly addressManager: SubstrateAddressManager,
  ) {}

  /**
   * Test WASM initialization
   * GET /wallet/substrate/test/wasm
   */
  @Get('wasm')
  async testWasm() {
    try {
      const before = isCryptoReady();
      await ensureCryptoReady();
      const after = isCryptoReady();

      return {
        success: true,
        before: before,
        after: after,
        message: 'WASM crypto initialized successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test chain configuration
   * GET /wallet/substrate/test/chains
   */
  @Get('chains')
  async testChains(@Query('useTestnet') useTestnet?: string) {
    const useTestnetBool = useTestnet === 'true';
    const enabledChains = getEnabledChains();
    const chains: Record<string, any> = {};

    for (const chain of enabledChains) {
      const config = getChainConfig(chain, useTestnetBool);
      chains[chain] = {
        name: config.name,
        genesisHash: config.genesisHash,
        rpc: config.rpc,
        ss58Prefix: config.ss58Prefix,
        token: config.token,
        isTestnet: config.isTestnet,
      };
    }

    return {
      success: true,
      enabledChains,
      chains,
      useTestnet: useTestnetBool,
    };
  }

  /**
   * Test SS58 encoding/decoding
   * GET /wallet/substrate/test/ss58?address=xxx&prefix=0
   */
  @Get('ss58')
  async testSS58(
    @Query('address') address?: string,
    @Query('prefix') prefix?: string,
  ) {
    if (!address) {
      // Generate a test address
      const testPublicKey = new Uint8Array(32).fill(1);
      const testPrefix = prefix ? parseInt(prefix, 10) : 0;
      const encoded = ss58Util.encode(testPublicKey, testPrefix);

      return {
        success: true,
        test: 'encode',
        publicKey: Array.from(testPublicKey),
        prefix: testPrefix,
        encodedAddress: encoded,
      };
    }

    // Validate existing address
    const prefixNum = prefix ? parseInt(prefix, 10) : undefined;
    const isValid =
      prefixNum !== undefined
        ? ss58Util.validateWithPrefix(address, prefixNum)
        : ss58Util.validate(address);

    let decoded: { publicKey: Uint8Array; prefix: number } | null = null;
    try {
      decoded = ss58Util.decode(address);
    } catch {
      // Ignore decode errors
    }

    return {
      success: true,
      test: 'validate',
      address,
      isValid,
      decoded: decoded
        ? {
            publicKey: Array.from(decoded.publicKey),
            prefix: decoded.prefix,
          }
        : null,
    };
  }

  /**
   * Test derivation paths
   * GET /wallet/substrate/test/derivation?index=0
   */
  @Get('derivation')
  async testDerivation(@Query('index') index?: string) {
    const accountIndex = index ? parseInt(index, 10) : 0;
    const path = buildDerivationPath(accountIndex);
    const parsed = parseDerivationPath(path);

    return {
      success: true,
      accountIndex,
      derivationPath: path,
      parsedIndex: parsed,
      isValid: parsed === accountIndex,
    };
  }

  /**
   * Test RPC connection
   * GET /wallet/substrate/test/rpc?chain=polkadot&useTestnet=true
   */
  @Get('rpc')
  async testRpc(
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';

    try {
      this.logger.log(
        `Testing RPC connection for ${chainKey} (testnet: ${useTestnetBool})`,
      );

      // Get chain config to show RPC URL
      const chainConfig = getChainConfig(chainKey, useTestnetBool);

      // Test connection with timeout
      const connectionPromise = this.rpcService.getConnection(
        chainKey,
        useTestnetBool,
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('RPC connection test timeout after 45s')),
          45000,
        ),
      );

      const api = await Promise.race([connectionPromise, timeoutPromise]);
      const isConnected = api.isConnected;
      const genesisHash = api.genesisHash.toHex();

      // Test connection health
      const connections = await this.rpcService.checkConnections();

      return {
        success: true,
        chain: chainKey,
        useTestnet: useTestnetBool,
        rpcUrl: chainConfig.rpc,
        isConnected,
        genesisHash,
        expectedGenesisHash: chainConfig.genesisHash,
        genesisHashMatch: genesisHash === chainConfig.genesisHash,
        connections,
      };
    } catch (error) {
      this.logger.error(
        `RPC test failed for ${chainKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Get chain config for error response
      const chainConfig = getChainConfig(chainKey, useTestnetBool);

      return {
        success: false,
        chain: chainKey,
        useTestnet: useTestnetBool,
        rpcUrl: chainConfig.rpc,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'RPC connection may be slow or unavailable. Check network connectivity and RPC endpoint.',
        troubleshooting: [
          'Verify RPC endpoint is accessible',
          'Check network connectivity',
          'Try a different RPC endpoint',
          'WebSocket connections can take 10-30 seconds to establish',
        ],
      };
    }
  }

  /**
   * Test metadata caching
   * GET /wallet/substrate/test/cache?chain=polkadot
   */
  @Get('cache')
  async testCache(@Query('chain') chain?: string) {
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;

    try {
      // Get genesis hash (will be cached)
      const genesisHash1 = await this.rpcService.getGenesisHash(chainKey);

      // Get again (should be from cache)
      const genesisHash2 = await this.rpcService.getGenesisHash(chainKey);

      const stats = this.metadataCache.getStats();

      return {
        success: true,
        chain: chainKey,
        genesisHash1,
        genesisHash2,
        match: genesisHash1 === genesisHash2,
        cacheStats: stats,
      };
    } catch (error) {
      return {
        success: false,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Ensure address is created for a user on a specific chain
   * GET /wallet/substrate/test/ensure-address?userId=test-user&chain=paseoAssethub&useTestnet=true
   * This will create the wallet if it doesn't exist and derive the address for the specified chain
   */
  @Get('ensure-address')
  async ensureAddress(
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId parameter is required');
    }
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';

    try {
      // Clear cache to force fresh derivation
      this.addressManager.clearCache(userId);

      // Get address for the specific chain (this will create wallet if needed)
      const address = await this.addressManager.getAddressForChain(
        userId,
        chainKey,
        useTestnetBool,
      );

      if (!address) {
        return {
          success: false,
          userId,
          chain: chainKey,
          useTestnet: useTestnetBool,
          error: 'Failed to derive address for the specified chain',
          note: 'Check logs for derivation errors. Ensure the chain is enabled and configured correctly.',
        };
      }

      const chainConfig = getChainConfig(chainKey, useTestnetBool);

      return {
        success: true,
        userId,
        chain: chainKey,
        chainName: chainConfig.name,
        useTestnet: useTestnetBool,
        address,
        ss58Prefix: chainConfig.ss58Prefix,
        token: chainConfig.token.symbol,
        note: `Address successfully created/retrieved for ${chainConfig.name}`,
      };
    } catch (error) {
      return {
        success: false,
        userId,
        chain: chainKey,
        useTestnet: useTestnetBool,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Failed to create/retrieve address. Check logs for details.',
      };
    }
  }

  /**
   * Test address derivation
   * GET /wallet/substrate/test/address?userId=test-user&chain=polkadot
   */
  @Get('address')
  async testAddress(
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId parameter is required');
    }
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';

    try {
      const address = await this.addressManager.getAddressForChain(
        userId,
        chainKey,
        useTestnetBool,
      );

      // Validate the address
      const chainConfig = getChainConfig(chainKey, useTestnetBool);
      const isValid = address
        ? ss58Util.validateWithPrefix(address, chainConfig.ss58Prefix)
        : false;

      return {
        success: true,
        userId,
        chain: chainKey,
        useTestnet: useTestnetBool,
        address,
        isValid,
        expectedPrefix: chainConfig.ss58Prefix,
      };
    } catch (error) {
      return {
        success: false,
        userId,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test all addresses for a user
   * GET /wallet/substrate/test/addresses?userId=test-user
   */
  @Get('addresses')
  async testAddresses(
    @Query('userId') userId?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId parameter is required');
    }

    const useTestnetBool = useTestnet === 'true';

    try {
      const addresses = await this.addressManager.getAddresses(
        userId,
        useTestnetBool,
      );

      // Validate each address
      const validated: Record<
        string,
        { address: string | null; isValid: boolean }
      > = {};
      for (const [chain, address] of Object.entries(addresses)) {
        if (address) {
          const chainConfig = getChainConfig(
            chain as SubstrateChainKey,
            useTestnetBool,
          );
          validated[chain] = {
            address,
            isValid: ss58Util.validateWithPrefix(
              address,
              chainConfig.ss58Prefix,
            ),
          };
        } else {
          validated[chain] = { address: null, isValid: false };
        }
      }

      return {
        success: true,
        userId,
        useTestnet: useTestnetBool,
        addresses,
        validated,
      };
    } catch (error) {
      return {
        success: false,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test account factory
   * GET /wallet/substrate/test/account?userId=test-user&chain=polkadot
   */
  @Get('account')
  async testAccount(
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('accountIndex') accountIndex?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId parameter is required');
    }
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const index = accountIndex ? parseInt(accountIndex, 10) : 0;
    const useTestnetBool = useTestnet === 'true';

    try {
      const account = await this.accountFactory.createAccount(
        userId,
        chainKey,
        index,
        useTestnetBool,
      );

      const chainConfig = getChainConfig(chainKey, useTestnetBool);
      const isValid = ss58Util.validateWithPrefix(
        account.address,
        chainConfig.ss58Prefix,
      );

      return {
        success: true,
        userId,
        chain: chainKey,
        accountIndex: index,
        useTestnet: useTestnetBool,
        account: {
          address: account.address,
          publicKey: Array.from(account.publicKey),
          chain: account.chain,
          accountIndex: account.accountIndex,
        },
        isValid,
        expectedPrefix: chainConfig.ss58Prefix,
      };
    } catch (error) {
      return {
        success: false,
        userId,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test balance fetching
   * GET /wallet/substrate/test/balance?address=xxx&chain=polkadot
   */
  @Get('balance')
  async testBalance(
    @Query('address') address?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!address) {
      throw new BadRequestException('address parameter is required');
    }
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';

    try {
      const balance = await this.rpcService.getBalance(
        address,
        chainKey,
        useTestnetBool,
      );

      const chainConfig = getChainConfig(chainKey, useTestnetBool);
      const balanceHuman = (
        BigInt(balance) / BigInt(10 ** chainConfig.token.decimals)
      ).toString();

      return {
        success: true,
        address,
        chain: chainKey,
        useTestnet: useTestnetBool,
        balance,
        balanceHuman,
        token: chainConfig.token.symbol,
        decimals: chainConfig.token.decimals,
      };
    } catch (error) {
      return {
        success: false,
        address,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test nonce management
   * GET /wallet/substrate/test/nonce?address=xxx&chain=polkadot
   */
  @Get('nonce')
  async testNonce(
    @Query('address') address?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!address) {
      throw new BadRequestException('address parameter is required');
    }
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';

    try {
      // Get nonce multiple times to test nonce manager
      const nonce1 = await this.nonceManager.getNextNonce(
        address,
        chainKey,
        useTestnetBool,
      );
      const nonce2 = await this.nonceManager.getNextNonce(
        address,
        chainKey,
        useTestnetBool,
      );
      const nonce3 = await this.nonceManager.getNextNonce(
        address,
        chainKey,
        useTestnetBool,
      );

      // Mark one as used
      this.nonceManager.markNonceUsed(
        address,
        chainKey,
        nonce1,
        useTestnetBool,
      );
      const nonce4 = await this.nonceManager.getNextNonce(
        address,
        chainKey,
        useTestnetBool,
      );

      const pending = this.nonceManager.getPendingNonce(
        address,
        chainKey,
        useTestnetBool,
      );

      return {
        success: true,
        address,
        chain: chainKey,
        useTestnet: useTestnetBool,
        nonces: {
          first: nonce1,
          second: nonce2,
          third: nonce3,
          afterMarkUsed: nonce4,
        },
        pendingNonce: pending,
        note: 'Nonces should increment sequentially',
      };
    } catch (error) {
      return {
        success: false,
        address,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run all Phase 2 tests
   * GET /wallet/substrate/test/all?userId=test-user
   */
  @Get('all')
  async testAll(@Query('userId') userId?: string) {
    if (!userId) {
      throw new BadRequestException('userId parameter is required');
    }

    const results: Record<string, any> = {};

    // Test 1: WASM
    try {
      await ensureCryptoReady();
      results.wasm = { success: true, ready: isCryptoReady() };
    } catch (error) {
      results.wasm = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test 2: Chain Config
    try {
      const enabledChains = getEnabledChains();
      results.chainConfig = {
        success: true,
        enabledChains,
        count: enabledChains.length,
      };
    } catch (error) {
      results.chainConfig = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test 3: SS58
    try {
      // Use a known valid Polkadot address for testing decode/validate
      // This is a test address that should always validate
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

      // Test validation
      const isValid = ss58Util.validate(testAddress);

      // Test decode
      let decoded: { publicKey: Uint8Array; prefix: number } | null = null;
      try {
        decoded = ss58Util.decode(testAddress);
      } catch (decodeError) {
        // Ignore decode errors
      }

      // Test encode (encode the decoded public key back)
      let reEncoded: string | null = null;
      if (decoded) {
        try {
          reEncoded = ss58Util.encode(decoded.publicKey, 0);
        } catch (encodeError) {
          // Ignore encode errors
        }
      }

      results.ss58 = {
        success: isValid && decoded !== null,
        testAddress,
        isValid,
        decoded: decoded ? Array.from(decoded.publicKey) : null,
        prefix: decoded?.prefix ?? null,
        reEncoded,
        note:
          isValid && decoded !== null
            ? 'SS58 encoding/decoding/validation working'
            : 'SS58 test failed - check implementation',
      };
    } catch (error) {
      results.ss58 = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test 4: Derivation
    try {
      const path = buildDerivationPath(0);
      const parsed = parseDerivationPath(path);
      results.derivation = {
        success: true,
        path,
        parsedIndex: parsed,
      };
    } catch (error) {
      results.derivation = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test 5: Address Derivation (testnet)
    try {
      // First check if user has a wallet
      const hasSeed = await this.addressManager['seedManager'].hasSeed(userId);

      // Try to derive addresses
      const addresses = await this.addressManager.getAddresses(userId, true);
      const count = Object.values(addresses).filter((a) => a !== null).length;
      const failedChains = Object.entries(addresses)
        .filter(([_, addr]) => addr === null)
        .map(([chain]) => chain);

      // Try to derive a single address to get more error details
      let singleAddressError: string | null = null;
      if (count === 0 && failedChains.length > 0) {
        try {
          await this.addressManager.getAddressForChain(
            userId,
            failedChains[0] as SubstrateChainKey,
            true,
          );
        } catch (error) {
          singleAddressError =
            error instanceof Error ? error.message : 'Unknown error';
        }
      }

      results.addressDerivation = {
        success: count > 0,
        hasWallet: hasSeed,
        addresses,
        count,
        failedChains: failedChains.length > 0 ? failedChains : undefined,
        error: singleAddressError || undefined,
        note:
          count === 0
            ? hasSeed
              ? 'Wallet exists but address derivation failed - check logs for errors'
              : 'Wallet auto-creation may have failed - check logs'
            : `${count} addresses derived successfully`,
      };
    } catch (error) {
      results.addressDerivation = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Address derivation failed - check if user has a wallet seed',
      };
    }

    // Test 6: RPC Connection (testnet) - Use AssetHub for asset-bearing chain
    try {
      const api = await this.rpcService.getConnection('paseoAssethub', true);
      results.rpc = {
        success: true,
        isConnected: api.isConnected,
        genesisHash: api.genesisHash.toHex(),
      };
    } catch (error) {
      results.rpc = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Calculate overall success
    const allSuccess = Object.values(results).every((r) => r.success === true);

    return {
      success: allSuccess,
      userId,
      results,
      summary: {
        total: Object.keys(results).length,
        passed: Object.values(results).filter((r) => r.success === true).length,
        failed: Object.values(results).filter((r) => r.success === false)
          .length,
      },
    };
  }

  /**
   * Auto-detect chain from address (prefix-agnostic, like Edgeware example)
   * GET /wallet/substrate/test/detect?address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
   */
  @Get('detect')
  async detectChainFromAddress(@Query('address') address?: string) {
    if (!address) {
      throw new BadRequestException('address parameter is required');
    }

    try {
      // Validate address first
      if (!ss58Util.validate(address)) {
        return {
          success: false,
          address,
          error: 'Invalid SS58 address format or checksum',
        };
      }

      // Detect prefix
      const detectedPrefix = ss58Util.detectPrefix(address);
      if (detectedPrefix === null) {
        return {
          success: false,
          address,
          error: 'Could not detect SS58 prefix for address',
        };
      }

      // Find chain configuration from address
      const chainInfo = getChainConfigFromAddress(address);

      // Decode address to bytes (like Edgeware example)
      const addressBytes = ss58Util.decodeToBytes(address);

      return {
        success: true,
        address,
        detectedPrefix,
        chain: chainInfo.chain,
        chainName: chainInfo.config.name,
        isTestnet: chainInfo.isTestnet,
        ss58Prefix: chainInfo.config.ss58Prefix,
        genesisHash: chainInfo.config.genesisHash,
        rpc: chainInfo.config.rpc,
        token: chainInfo.config.token,
        addressBytes: Array.from(addressBytes),
        addressBytesHex: Buffer.from(addressBytes).toString('hex'),
        note: 'Chain and network auto-detected from address prefix',
      };
    } catch (error) {
      return {
        success: false,
        address,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get balance from address (auto-detect chain, prefix-agnostic)
   * GET /wallet/substrate/test/balance-detect?address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
   */
  @Get('balance-detect')
  async getBalanceFromAddress(@Query('address') address?: string) {
    if (!address) {
      throw new BadRequestException('address parameter is required');
    }

    try {
      // Auto-detect chain from address
      const chainInfo = getChainConfigFromAddress(address);

      // Get balance using detected chain
      const balance = await this.rpcService.getBalance(
        address,
        chainInfo.chain,
        chainInfo.isTestnet,
      );

      const balanceHuman = (
        BigInt(balance) / BigInt(10 ** chainInfo.config.token.decimals)
      ).toString();

      return {
        success: true,
        address,
        detectedChain: chainInfo.chain,
        chainName: chainInfo.config.name,
        isTestnet: chainInfo.isTestnet,
        balance,
        balanceHuman,
        token: chainInfo.config.token.symbol,
        decimals: chainInfo.config.token.decimals,
        note: 'Chain auto-detected from address prefix',
      };
    } catch (error) {
      return {
        success: false,
        address,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Decode address to bytes (prefix-agnostic, like Edgeware example)
   * GET /wallet/substrate/test/decode?address=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
   */
  @Get('decode')
  async decodeAddressToBytes(@Query('address') address?: string) {
    if (!address) {
      throw new BadRequestException('address parameter is required');
    }

    try {
      // Validate address
      if (!ss58Util.validate(address)) {
        return {
          success: false,
          address,
          error: 'Invalid SS58 address format or checksum',
        };
      }

      // Decode to bytes (prefix-agnostic)
      const addressBytes = ss58Util.decodeToBytes(address);
      const detectedPrefix = ss58Util.detectPrefix(address);

      // Try to find chain config
      let chainInfo: {
        chain: SubstrateChainKey;
        config: ChainNetworkConfig;
        isTestnet: boolean;
      } | null = null;
      try {
        chainInfo = getChainConfigFromAddress(address);
      } catch {
        // Chain not found, but address is valid
      }

      return {
        success: true,
        address,
        addressBytes: Array.from(addressBytes),
        addressBytesHex: Buffer.from(addressBytes).toString('hex'),
        addressBytesLength: addressBytes.length,
        detectedPrefix,
        chain: chainInfo?.chain || null,
        chainName: chainInfo?.config.name || null,
        isTestnet: chainInfo?.isTestnet ?? null,
        note: 'Address decoded successfully (prefix-agnostic)',
      };
    } catch (error) {
      return {
        success: false,
        address,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test transaction construction
   * GET /wallet/substrate/test/construct?from=xxx&to=yyy&amount=1000000&chain=paseoAssethub&useTestnet=true&transferMethod=transferAllowDeath
   * Note: Use paseoAssethub (not paseo) for transaction testing - Paseo is NOT asset-bearing
   * transferMethod: 'transferAllowDeath' (default) or 'transferKeepAlive'
   */
  @Get('construct')
  async testConstruct(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('transferMethod') transferMethod?: string,
  ) {
    if (!from || !to || !amount || !chain) {
      throw new BadRequestException(
        'from, to, amount, and chain parameters are required',
      );
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const method =
      transferMethod === 'transferKeepAlive'
        ? 'transferKeepAlive'
        : 'transferAllowDeath';

    try {
      const transaction = await this.transactionService.constructTransfer({
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        transferMethod: method,
      });

      return {
        success: true,
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        transferMethod: method,
        method: transaction.method.section + '.' + transaction.method.method,
        args: transaction.method.args.map((arg: any) => arg.toHuman()),
        txHash: transaction.hash.toHex(),
        note: `Transaction constructed successfully using ${method}`,
      };
    } catch (error) {
      return {
        success: false,
        from,
        to,
        amount,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test fee estimation
   * GET /wallet/substrate/test/estimate-fee?from=xxx&to=yyy&amount=1000000&chain=paseoAssethub&useTestnet=true&transferMethod=transferAllowDeath
   * Note: Use paseoAssethub (not paseo) for transaction testing - Paseo is NOT asset-bearing
   * transferMethod: 'transferAllowDeath' (default) or 'transferKeepAlive'
   */
  @Get('estimate-fee')
  async testEstimateFee(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('transferMethod') transferMethod?: string,
  ) {
    if (!from || !to || !amount || !chain) {
      throw new BadRequestException(
        'from, to, amount, and chain parameters are required',
      );
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const method =
      transferMethod === 'transferKeepAlive'
        ? 'transferKeepAlive'
        : 'transferAllowDeath';

    try {
      // Construct transaction
      const transaction = await this.transactionService.constructTransfer({
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        transferMethod: method,
      });

      // Estimate fee
      const feeEstimate = await this.transactionService.estimateFee(
        transaction,
        from,
        chainKey,
        useTestnetBool,
      );

      const chainConfig = getChainConfig(chainKey, useTestnetBool);
      const feeHuman = (
        BigInt(feeEstimate.partialFee) /
        BigInt(10 ** chainConfig.token.decimals)
      ).toString();

      return {
        success: true,
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        fee: feeEstimate.partialFee,
        feeHuman,
        token: chainConfig.token.symbol,
        weight: feeEstimate.weight,
        class: feeEstimate.class,
        transferMethod: method,
        note: `Fee estimated successfully using ${method}`,
      };
    } catch (error) {
      return {
        success: false,
        from,
        to,
        amount,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test transaction signing
   * GET /wallet/substrate/test/sign?userId=xxx&to=yyy&amount=1000000&chain=paseoAssethub&useTestnet=true&transferMethod=transferAllowDeath
   * Note: Use paseoAssethub (not paseo) for transaction testing - Paseo is NOT asset-bearing
   * transferMethod: 'transferAllowDeath' (default) or 'transferKeepAlive'
   */
  @Get('sign')
  async testSign(
    @Query('userId') userId?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('transferMethod') transferMethod?: string,
  ) {
    if (!userId || !to || !amount || !chain) {
      throw new BadRequestException(
        'userId, to, amount, and chain parameters are required',
      );
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const method =
      transferMethod === 'transferKeepAlive'
        ? 'transferKeepAlive'
        : 'transferAllowDeath';

    try {
      // Get sender address
      const from = await this.addressManager.getAddressForChain(
        userId,
        chainKey,
        useTestnetBool,
      );
      if (!from) {
        throw new BadRequestException(
          `No address found for user ${userId} on chain ${chainKey}`,
        );
      }

      // Construct transaction
      const transaction = await this.transactionService.constructTransfer({
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        transferMethod: method,
      });

      // Sign transaction
      const signed = await this.transactionService.signTransaction(
        userId,
        transaction,
        chainKey,
        0, // accountIndex
        useTestnetBool,
      );

      return {
        success: true,
        userId,
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        transferMethod: method,
        txHash: signed.txHash,
        nonce: signed.nonce,
        signedTxLength: signed.signedTx.length,
        note: `Transaction signed successfully using ${method} (not broadcast)`,
      };
    } catch (error) {
      return {
        success: false,
        userId,
        to,
        amount,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test send transfer (construct, sign, and broadcast)
   * GET /wallet/substrate/test/send?userId=xxx&to=yyy&amount=1000000&chain=paseoAssethub&useTestnet=true&transferMethod=transferAllowDeath
   * Note: Use paseoAssethub (not paseo) for transaction testing - Paseo is NOT asset-bearing
   * transferMethod: 'transferAllowDeath' (default) or 'transferKeepAlive'
   */
  @Get('send')
  async testSend(
    @Query('userId') userId?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('transferMethod') transferMethod?: string,
  ) {
    if (!userId || !to || !amount || !chain) {
      throw new BadRequestException(
        'userId, to, amount, and chain parameters are required',
      );
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const method =
      transferMethod === 'transferKeepAlive'
        ? 'transferKeepAlive'
        : 'transferAllowDeath';

    try {
      // Get sender address
      const from = await this.addressManager.getAddressForChain(
        userId,
        chainKey,
        useTestnetBool,
      );
      if (!from) {
        throw new BadRequestException(
          `No address found for user ${userId} on chain ${chainKey}`,
        );
      }

      // Send transfer
      const result = await this.transactionService.sendTransfer(
        userId,
        {
          from,
          to,
          amount,
          chain: chainKey,
          useTestnet: useTestnetBool,
          transferMethod: method,
        },
        0, // accountIndex
      );

      return {
        success: result.status !== 'failed' && result.status !== 'error',
        userId,
        from,
        to,
        amount,
        chain: chainKey,
        useTestnet: useTestnetBool,
        txHash: result.txHash,
        status: result.status,
        blockHash: result.blockHash,
        error: result.error,
        note:
          result.status === 'finalized'
            ? 'Transaction sent and finalized successfully'
            : result.status === 'inBlock'
              ? 'Transaction sent and included in block'
              : 'Transaction sent (pending)',
      };
    } catch (error) {
      return {
        success: false,
        userId,
        to,
        amount,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Test transaction history
   * GET /wallet/substrate/test/history?address=xxx&chain=polkadot&useTestnet=true&limit=10
   */
  @Get('history')
  async testHistory(
    @Query('address') address?: string,
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!address || !chain) {
      throw new BadRequestException(
        'address and chain parameters are required',
      );
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const limitNum = limit ? parseInt(limit, 10) : 10;

    try {
      const history = await this.transactionService.getTransactionHistory(
        address,
        chainKey,
        useTestnetBool,
        limitNum,
        cursor,
      );

      return {
        success: true,
        address,
        chain: chainKey,
        useTestnet: useTestnetBool,
        history,
        note: `Found ${history.transactions.length} transactions`,
      };
    } catch (error) {
      return {
        success: false,
        address,
        chain: chainKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check pallet availability on a chain
   * GET /wallet/substrate/test/check-pallet?chain=paseoAssethub&useTestnet=true&pallet=balances
   */
  @Get('check-pallet')
  async checkPallet(
    @Query('chain') chain?: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('pallet') pallet?: string,
  ) {
    if (!chain) {
      throw new BadRequestException('chain parameter is required');
    }

    const chainKey = chain as SubstrateChainKey;
    const useTestnetBool = useTestnet === 'true';
    const palletName = pallet || 'balances';

    try {
      const api = await this.rpcService.getConnection(chainKey, useTestnetBool);

      // CRITICAL: Always await api.isReady before using .tx or .query
      await api.isReady;

      const chainConfig = getChainConfig(chainKey, useTestnetBool);

      // Check if pallet exists in tx
      const palletExists = !!(api.tx as any)[palletName];
      const palletInfo = palletExists ? (api.tx as any)[palletName] : null;

      // Get available methods if pallet exists
      let availableMethods: string[] = [];
      if (palletInfo && typeof palletInfo === 'object') {
        availableMethods = Object.keys(palletInfo).filter(
          (key) => typeof palletInfo[key] === 'function',
        );
      }

      // Check specific methods for balances pallet
      // Modern Substrate runtimes use transferAllowDeath or transferKeepAlive instead of transfer
      let transferAvailable = false;
      let transferAllowDeathAvailable = false;
      let transferKeepAliveAvailable = false;
      let transferAllAvailable = false;

      if (palletName === 'balances' && palletInfo) {
        transferAvailable = !!palletInfo.transfer; // Deprecated in newer runtimes
        transferAllowDeathAvailable = !!palletInfo.transferAllowDeath; // Recommended default
        transferKeepAliveAvailable = !!palletInfo.transferKeepAlive; // Safer option
        transferAllAvailable = !!palletInfo.transferAll; // Transfer all funds
      }

      // Check query availability
      const queryExists = !!(api.query as any)[palletName];
      const queryInfo = queryExists ? (api.query as any)[palletName] : null;

      return {
        success: true,
        chain: chainKey,
        chainName: chainConfig.name,
        useTestnet: useTestnetBool,
        rpc: chainConfig.rpc,
        pallet: palletName,
        palletExists,
        // Transfer method availability (for balances pallet)
        transferAvailable: palletName === 'balances' ? transferAvailable : null, // Deprecated
        transferAllowDeathAvailable:
          palletName === 'balances' ? transferAllowDeathAvailable : null, // Recommended
        transferKeepAliveAvailable:
          palletName === 'balances' ? transferKeepAliveAvailable : null, // Safer
        transferAllAvailable:
          palletName === 'balances' ? transferAllAvailable : null,
        availableMethods: availableMethods.length > 0 ? availableMethods : null,
        queryAvailable: queryExists,
        apiReady: api.isReady,
        genesisHash: api.genesisHash.toHex(),
        chainDecimals: api.registry.chainDecimals,
        chainTokens: api.registry.chainTokens,
        // Runtime SS58 prefix (what the chain actually uses)
        runtimeSS58Prefix: api.registry.chainSS58,
        configuredSS58Prefix: chainConfig.ss58Prefix,
        ss58PrefixMatch: api.registry.chainSS58 === chainConfig.ss58Prefix,
        note: palletExists
          ? `Pallet ${palletName} is available on ${chainConfig.name}`
          : `Pallet ${palletName} is NOT available on ${chainConfig.name}`,
      };
    } catch (error) {
      return {
        success: false,
        chain: chainKey,
        pallet: palletName,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
