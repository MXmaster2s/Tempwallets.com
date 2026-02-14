import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Deprecated: ERC-4337 Pimlico service kept as a stub for compatibility.
 * All ERC-4337 flows have been replaced by native EOA / EIP-7702.
 */
@Injectable()
export class PimlicoService {
  private readonly logger = new Logger(PimlicoService.name);

  constructor(private readonly configService: ConfigService) {}

  getBundlerUrl(_chain: string): string {
    const url = this.configService.get<string>('PIMLICO_BUNDLER_URL');
    if (!url) {
      throw new Error(
        'Pimlico bundler URL not configured (service deprecated)',
      );
    }
    return url;
  }

  getPaymasterUrl(_chain: string): string | undefined {
    return undefined; // Paymaster not used in current flow
  }

  isPaymasterAvailable(_chain: string): boolean {
    return false;
  }

  getEntryPointAddress(): string {
    return '0x0000000000000000000000000000000000000000';
  }

  getFactoryAddress(): string {
    return '0x0000000000000000000000000000000000000000';
  }

  async getGasPrice(): Promise<bigint> {
    this.logger.warn('getGasPrice is deprecated in PimlicoService');
    throw new Error('PimlicoService deprecated');
  }

  async estimateUserOperationGas(): Promise<never> {
    this.logger.warn(
      'estimateUserOperationGas is deprecated in PimlicoService',
    );
    throw new Error('PimlicoService deprecated');
  }

  async getPaymasterData(): Promise<never> {
    this.logger.warn('getPaymasterData is deprecated in PimlicoService');
    throw new Error('PimlicoService deprecated');
  }
}

export default PimlicoService;
