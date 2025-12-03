import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

/**
 * DTO for getting Aptos account balance
 */
export class GetBalanceDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  @IsIn(['mainnet', 'testnet', 'devnet'])
  network?: 'mainnet' | 'testnet' | 'devnet';
}

