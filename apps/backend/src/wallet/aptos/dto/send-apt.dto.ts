import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for sending APT (Aptos native token)
 */
export class SendAptDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{1,64}$/, {
    message: 'Recipient address must be a valid Aptos address (0x + 1-64 hex chars)',
  })
  recipientAddress: string;

  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.00000001, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsString()
  @IsOptional()
  @IsIn(['mainnet', 'testnet', 'devnet'])
  network?: 'mainnet' | 'testnet' | 'devnet';

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

