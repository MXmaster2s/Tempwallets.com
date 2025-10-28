import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  passkey: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class GetWalletAddressesDto {
  @IsString()
  @IsNotEmpty()
  walletId: string;
}

