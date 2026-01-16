import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  ValidateIf,
  Matches,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateOrImportSeedDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsIn(['random', 'mnemonic'])
  mode: 'random' | 'mnemonic';

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.mode === 'mnemonic')
  @IsNotEmpty()
  mnemonic?: string;
}

const SUPPORTED_CHAINS = [
  // EVM L1/L2
  'ethereum',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
  'avalanche',
  'bnb',
  // Non-EVM
  'tron',
  'bitcoin',
  'solana',
] as const;

export class SendCryptoDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsIn(SUPPORTED_CHAINS)
  chain: string;

  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @IsNumber()
  @ValidateIf((o) => o.tokenAddress !== undefined && o.tokenAddress !== null)
  @IsNotEmpty({
    message: 'tokenDecimals is required when tokenAddress is provided. This should come from Zerion token data.'
  })
  @Min(0, { message: 'tokenDecimals must be between 0 and 36' })
  @Max(36, { message: 'tokenDecimals must be between 0 and 36' })
  tokenDecimals?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+(\.[0-9]+)?$/, {
    message: 'Amount must be a positive number',
  })
  amount: string;

  @IsString()
  @IsNotEmpty()
  recipientAddress: string;
}

export class SendEip7702Dto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @Min(1)
  chainId: number;

  @IsString()
  @IsNotEmpty()
  recipientAddress: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+(\.[0-9]+)?$/, {
    message: 'Amount must be a positive number',
  })
  amount: string;

  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @IsNumber()
  @ValidateIf((o) => o.tokenAddress !== undefined && o.tokenAddress !== null)
  @IsNotEmpty({
    message: 'tokenDecimals is required when tokenAddress is provided. This should come from Zerion token data.'
  })
  @Min(0, { message: 'tokenDecimals must be between 0 and 36' })
  @Max(36, { message: 'tokenDecimals must be between 0 and 36' })
  tokenDecimals?: number;
}

export class WalletConnectSignDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  chainId: string; // eip155:1, eip155:8453, etc.

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  @IsOptional()
  data?: string;

  @IsString()
  @IsOptional()
  gas?: string;

  @IsString()
  @IsOptional()
  gasPrice?: string;

  @IsString()
  @IsOptional()
  maxFeePerGas?: string;

  @IsString()
  @IsOptional()
  maxPriorityFeePerGas?: string;

  @IsString()
  @IsOptional()
  nonce?: string;
}
