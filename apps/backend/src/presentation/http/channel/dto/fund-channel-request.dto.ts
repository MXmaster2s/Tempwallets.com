/**
 * FUND CHANNEL REQUEST DTO
 *
 * Presentation Layer - HTTP Request Validation
 *
 * Validates incoming HTTP requests for funding channels.
 */

import { IsString, IsNotEmpty } from 'class-validator';

export class FundChannelRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  chain!: string;

  @IsString()
  @IsNotEmpty()
  asset!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}
