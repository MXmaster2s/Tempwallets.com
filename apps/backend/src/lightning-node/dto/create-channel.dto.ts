import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  chain: string;

  @IsString()
  @IsNotEmpty()
  asset: string;

  @IsString()
  @IsOptional()
  initialDeposit?: string; // Optional - can create empty channel
}
