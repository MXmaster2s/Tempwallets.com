import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { WalletService } from './wallet.service.js';
import {
  CreateOrImportSeedDto,
  SendCryptoDto,
  WalletConnectSignDto,
} from './dto/wallet.dto.js';
import { PolkadotEvmRpcService } from './services/polkadot-evm-rpc.service.js';
import { SubstrateChainKey } from './substrate/config/substrate-chain.config.js';

@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly polkadotEvmRpcService: PolkadotEvmRpcService,
  ) {}

  @Post('seed')
  async createOrImportSeed(@Body() dto: CreateOrImportSeedDto) {
    this.logger.log(
      `${dto.mode === 'random' ? 'Creating' : 'Importing'} seed for user ${dto.userId}`,
    );

    try {
      await this.walletService.createOrImportSeed(
        dto.userId,
        dto.mode,
        dto.mnemonic,
      );

      return {
        ok: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to ${dto.mode === 'random' ? 'create' : 'import'} seed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('addresses')
  async getAddresses(@Query('userId') userId: string) {
    this.logger.log(`Getting addresses for user ${userId}`);

    try {
      const payload = await this.walletService.getUiWalletAddresses(userId);

      return payload;
    } catch (error) {
      this.logger.error(
        `Failed to get addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('walletconnect/accounts')
  async getWalletConnectAccounts(@Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    this.logger.log(`Getting WalletConnect accounts for user ${userId}`);

    try {
      const namespaces = await this.walletService.getWalletConnectAccounts(userId);
      // Return all namespaces (EIP155, Polkadot, etc.)
      return namespaces;
    } catch (error) {
      this.logger.error(
        `Failed to get WalletConnect accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('balances')
  async getBalances(
    @Query('userId') userId: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    this.logger.log(`Getting balances for user ${userId}${forceRefresh ? ' (force refresh)' : ''}`);

    try {
      const balances = await this.walletService.getBalances(userId, forceRefresh);

      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to get balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Post('balances/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshBalances(@Body() body: { userId: string }) {
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }

    this.logger.debug(`Refreshing balances for user ${body.userId}`);

    try {
      const balances = await this.walletService.refreshBalances(body.userId);

      return {
        success: true,
        balances,
      };
    } catch (error) {
      this.logger.error(
        `Failed to refresh balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('erc4337/paymaster-balances')
  async getErc4337PaymasterBalances(@Query('userId') userId: string) {
    this.logger.log(`Getting ERC-4337 paymaster balances for user ${userId}`);

    try {
      const balances =
        await this.walletService.getErc4337PaymasterBalances(userId);

      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to get paymaster balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendCrypto(@Body() dto: SendCryptoDto) {
    this.logger.log(
      `Sending crypto for user ${dto.userId} on chain ${dto.chain}`,
    );

    try {
      const result = await this.walletService.sendCrypto(
        dto.userId,
        dto.chain,
        dto.recipientAddress,
        dto.amount,
        dto.tokenAddress,
        dto.tokenDecimals,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to send crypto: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.logger.error(
        `Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`,
      );
      throw error;
    }
  }

  @Get('token-balances')
  async getTokenBalances(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    this.logger.log(
      `Getting token balances for user ${userId} on chain ${chain}${forceRefresh ? ' (force refresh)' : ''}`,
    );

    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!chain) {
      throw new BadRequestException('chain is required');
    }

    try {
      const balances = await this.walletService.getTokenBalances(
        userId,
        chain,
        forceRefresh,
      );

      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to get token balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('assets-any')
  async getAssetsAny(
    @Query('userId') userId: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    this.logger.log(
      `Getting any-chain assets for user ${userId}${forceRefresh ? ' (force refresh)' : ''}`,
    );

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    try {
      const assets = await this.walletService.getTokenBalancesAny(
        userId,
        forceRefresh,
      );
      return assets;
    } catch (error) {
      this.logger.error(
        `Failed to get any-chain assets: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('transactions')
  async getTransactionHistory(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(
      `Getting transaction history for user ${userId} on chain ${chain}`,
    );

    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!chain) {
      throw new BadRequestException('chain is required');
    }

    const limitNum = limit ? parseInt(limit, 10) : 50;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    try {
      const transactions = await this.walletService.getTransactionHistory(
        userId,
        chain,
        limitNum,
      );

      return transactions;
    } catch (error) {
      this.logger.error(
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('transactions-any')
  async getTransactionHistoryAny(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`Getting any-chain transaction history for user ${userId}`);

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const limitNum = limit ? parseInt(limit, 10) : 100;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    try {
      const transactions = await this.walletService.getTransactionsAny(
        userId,
        limitNum,
      );
      return transactions;
    } catch (error) {
      this.logger.error(
        `Failed to get any-chain transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('addresses-stream')
  async streamAddresses(@Query('userId') userId: string, @Res() res: Response) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    this.logger.log(`Streaming addresses for user ${userId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      // Stream addresses as they become available
      for await (const payload of this.walletService.streamAddresses(userId)) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }

      // Send completion message
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.end();
    } catch (error) {
      this.logger.error(
        `Error streaming addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`,
      );
      res.end();
    }
  }

  @Get('balances-stream')
  async streamBalances(@Query('userId') userId: string, @Res() res: Response) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    this.logger.log(`Streaming balances for user ${userId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      // Stream balances as they're fetched from Zerion
      for await (const balance of this.walletService.streamBalances(userId)) {
        res.write(`data: ${JSON.stringify(balance)}\n\n`);
      }

      // Send completion message
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.end();
    } catch (error) {
      this.logger.error(
        `Error streaming balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`,
      );
      res.end();
    }
  }

  @Post('walletconnect/sign')
  @HttpCode(HttpStatus.OK)
  async signWalletConnectTransaction(@Body() dto: WalletConnectSignDto) {
    this.logger.log(
      `Signing WalletConnect transaction for user ${dto.userId} on chain ${dto.chainId}`,
    );

    try {
      const result = await this.walletService.signWalletConnectTransaction(
        dto.userId,
        dto.chainId,
        {
          from: dto.from,
          to: dto.to,
          value: dto.value,
          data: dto.data,
          gas: dto.gas,
          gasPrice: dto.gasPrice,
          maxFeePerGas: dto.maxFeePerGas,
          maxPriorityFeePerGas: dto.maxPriorityFeePerGas,
          nonce: dto.nonce,
        },
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to sign WalletConnect transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.logger.error(
        `Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`,
      );
      throw error;
    }
  }

  @Get('test-rpc-balance')
  async testRpcBalance(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
  ) {
    this.logger.log(`Testing RPC balance for user ${userId} on chain ${chain}`);

    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!chain) {
      throw new BadRequestException('chain is required');
    }

    const validChains = ['moonbeamTestnet', 'astarShibuya', 'paseoPassetHub'];
    if (!validChains.includes(chain)) {
      throw new BadRequestException(
        `chain must be one of: ${validChains.join(', ')}`,
      );
    }

    try {
      const addresses = await this.walletService.getAddresses(userId);
      const address = addresses.ethereum;

      if (!address) {
        throw new BadRequestException('No Ethereum address found for user');
      }

      const balance = await this.polkadotEvmRpcService.getNativeBalance(
        address,
        chain,
      );

      return {
        chain,
        address,
        balance,
      };
    } catch (error) {
      this.logger.error(
        `Failed to test RPC balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  @Get('test-rpc-transactions')
  async testRpcTransactions(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(
      `Testing RPC transactions for user ${userId} on chain ${chain}`,
    );

    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!chain) {
      throw new BadRequestException('chain is required');
    }

    const validChains = ['moonbeamTestnet', 'astarShibuya', 'paseoPassetHub'];
    if (!validChains.includes(chain)) {
      throw new BadRequestException(
        `chain must be one of: ${validChains.join(', ')}`,
      );
    }

    const limitNum = limit ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    try {
      const addresses = await this.walletService.getAddresses(userId);
      const address = addresses.ethereum;

      if (!address) {
        throw new BadRequestException('No Ethereum address found for user');
      }

      const transactions =
        await this.polkadotEvmRpcService.getTransactions(
          address,
          chain,
          limitNum,
        );

      return {
        chain,
        address,
        transactions,
        count: transactions.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to test RPC transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get Substrate addresses for a user
   * GET /wallet/substrate/addresses?userId=xxx&useTestnet=false
   */
  @Get('substrate/addresses')
  async getSubstrateAddresses(
    @Query('userId') userId: string,
    @Query('useTestnet') useTestnet?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const useTestnetBool = useTestnet === 'true';

    try {
      // Get Substrate addresses through WalletService
      const substrateAddresses = await this.walletService.getSubstrateAddresses(userId, useTestnetBool);

      return {
        userId,
        useTestnet: useTestnetBool,
        addresses: substrateAddresses,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Substrate addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get Substrate balances for a user
   * GET /wallet/substrate/balances?userId=xxx&useTestnet=false&refresh=false
   */
  @Get('substrate/balances')
  async getSubstrateBalances(
    @Query('userId') userId: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const useTestnetBool = useTestnet === 'true';
    const forceRefresh = refresh === 'true';
    this.logger.log(`Getting Substrate balances for user ${userId} (testnet: ${useTestnetBool}${forceRefresh ? ', force refresh' : ''})`);

    try {
      const balances = await this.walletService.getSubstrateBalances(userId, useTestnetBool, forceRefresh);
      this.logger.log(`Successfully retrieved Substrate balances for user ${userId}: ${Object.keys(balances).length} chains`);
      return {
        userId,
        useTestnet: useTestnetBool,
        balances,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Substrate balances for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Get Substrate transaction history
   * GET /wallet/substrate/transactions?userId=xxx&chain=polkadot&useTestnet=false&limit=10&cursor=xxx
   */
  @Get('substrate/transactions')
  async getSubstrateTransactions(
    @Query('userId') userId: string,
    @Query('chain') chain: string,
    @Query('useTestnet') useTestnet?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!chain) {
      throw new BadRequestException('chain is required');
    }

    const useTestnetBool = useTestnet === 'true';
    const limitNum = limit ? parseInt(limit, 10) : 10;

    try {
      const history = await this.walletService.getSubstrateTransactions(
        userId,
        chain as SubstrateChainKey,
        useTestnetBool,
        limitNum,
        cursor,
      );

      return {
        userId,
        chain,
        useTestnet: useTestnetBool,
        history,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Substrate transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Send Substrate transfer
   * POST /wallet/substrate/send
   */
  @Post('substrate/send')
  @HttpCode(HttpStatus.OK)
  async sendSubstrateTransfer(@Body() body: {
    userId: string;
    chain: SubstrateChainKey;
    to: string;
    amount: string;
    useTestnet?: boolean;
    transferMethod?: 'transferAllowDeath' | 'transferKeepAlive';
  }) {
    if (!body.userId || !body.chain || !body.to || !body.amount) {
      throw new BadRequestException('userId, chain, to, and amount are required');
    }

    try {
      const result = await this.walletService.sendSubstrateTransfer(
        body.userId,
        body.chain,
        body.to,
        body.amount,
        body.useTestnet || false,
        body.transferMethod,
        0, // accountIndex
      );

      return {
        success: result.status !== 'failed' && result.status !== 'error',
        txHash: result.txHash,
        status: result.status,
        blockHash: result.blockHash,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send Substrate transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Health check for Substrate functionality
   * GET /wallet/substrate/health
   */
  @Get('substrate/health')
  async getSubstrateHealth() {
    try {
      // Access through a public method or create a health check method in WalletService
      // For now, return basic health status
      return {
        status: 'ok',
        message: 'Substrate functionality is available',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
