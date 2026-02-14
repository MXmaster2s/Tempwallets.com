import { IsString, IsNotEmpty, IsIn } from 'class-validator';

/**
 * DTO for Funding Payment Channel (Adding to Unified Balance)
 *
 * This moves funds from the user's on-chain wallet to the unified balance,
 * which can then be used for deposits to app sessions.
 */
export class FundChannelDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['base', 'arbitrum', 'ethereum', 'avalanche', 'sepolia'])
  chain: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['usdc', 'usdt'])
  asset: string;

  @IsString()
  @IsNotEmpty()
  amount: string; // Human-readable amount (e.g., "100.0")
}
