import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for signing a Substrate transaction via WalletConnect
 */
export class SubstrateWalletConnectSignTransactionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string; // CAIP-10 format: polkadot:<genesis_hash>:<address>

  @IsString()
  @IsNotEmpty()
  transactionPayload: string; // Hex-encoded transaction payload

  @IsBoolean()
  @IsOptional()
  useTestnet?: boolean;
}

/**
 * DTO for signing a Substrate message via WalletConnect
 */
export class SubstrateWalletConnectSignMessageDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string; // CAIP-10 format: polkadot:<genesis_hash>:<address>

  @IsString()
  @IsNotEmpty()
  message: string; // Message to sign (string or hex)

  @IsBoolean()
  @IsOptional()
  useTestnet?: boolean;
}
