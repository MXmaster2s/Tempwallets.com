import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export class ResizeChannelDto {
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
  @IsNotEmpty()
  amount: string;

  @IsEnum(['unified', 'custody'])
  @IsNotEmpty()
  destination: 'unified' | 'custody';
}
