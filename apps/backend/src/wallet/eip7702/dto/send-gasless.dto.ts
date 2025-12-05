import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  IsNumberString,
} from 'class-validator';

/**
 * DTO for sending gasless transactions
 *
 * Validates all inputs before processing
 */
export class SendGaslessDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @Min(1)
  chainId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'recipientAddress must be a valid Ethereum address',
  })
  recipientAddress!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string; // Human-readable amount (e.g., "0.1")

  @IsString()
  @IsOptional()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'tokenAddress must be a valid Ethereum address',
  })
  tokenAddress?: string; // For ERC-20 transfers

  @IsNumber()
  @IsOptional()
  @Min(0)
  tokenDecimals?: number; // Required if tokenAddress is provided
}

/**
 * DTO for batch transactions
 */
export class SendBatchDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @Min(1)
  chainId!: number;

  calls!: BatchCallDto[];
}

/**
 * Single call in a batch
 */
export class BatchCallDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'to must be a valid Ethereum address',
  })
  to!: string;

  @IsString()
  @IsOptional()
  value?: string; // ETH amount in human-readable

  @IsString()
  @IsOptional()
  @Matches(/^0x[a-fA-F0-9]*$/, {
    message: 'data must be valid hex',
  })
  data?: string; // Calldata
}

/**
 * DTO for getting delegation status
 */
export class GetDelegationStatusDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @Min(1)
  chainId!: number;
}

/**
 * DTO for getting UserOp receipt
 */
export class GetReceiptDto {
  @IsNumber()
  @Min(1)
  chainId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'userOpHash must be a valid 32-byte hex string',
  })
  userOpHash!: string;
}

