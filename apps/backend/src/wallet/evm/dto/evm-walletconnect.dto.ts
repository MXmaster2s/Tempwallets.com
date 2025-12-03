import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Transaction parameters for EVM transactions
 */
export class EvmTransactionParams {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsOptional()
  to?: string;

  @IsString()
  @IsOptional()
  value?: string; // Hex string (wei)

  @IsString()
  @IsOptional()
  data?: string; // Hex string (contract call data)

  @IsString()
  @IsOptional()
  gas?: string; // Hex string

  @IsString()
  @IsOptional()
  gasPrice?: string; // Legacy transactions

  @IsString()
  @IsOptional()
  maxFeePerGas?: string; // EIP-1559 transactions

  @IsString()
  @IsOptional()
  maxPriorityFeePerGas?: string; // EIP-1559 transactions

  @IsString()
  @IsOptional()
  nonce?: string; // Hex string
}

/**
 * DTO for signing an EVM transaction via WalletConnect
 * Supports both EIP-1559 and Legacy transaction formats
 */
export class EvmWalletConnectSignTransactionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string; // CAIP-10 format: eip155:<chain_id>:<address>

  @IsObject()
  @ValidateNested()
  @Type(() => EvmTransactionParams)
  transaction: EvmTransactionParams; // Full transaction object

  @IsBoolean()
  @IsOptional()
  useTestnet?: boolean;
}

/**
 * DTO for signing an EVM message via WalletConnect (personal_sign)
 */
export class EvmWalletConnectSignMessageDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string; // CAIP-10 format: eip155:<chain_id>:<address>

  @IsString()
  @IsNotEmpty()
  message: string; // Message to sign (hex-encoded or plain text)

  @IsBoolean()
  @IsOptional()
  useTestnet?: boolean;
}

/**
 * EIP-712 Typed Data structure
 */
export class EvmTypedData {
  @IsObject()
  types: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  primaryType: string;

  @IsObject()
  domain: Record<string, any>;

  @IsObject()
  message: Record<string, any>;
}

/**
 * DTO for signing typed data via WalletConnect (eth_signTypedData)
 */
export class EvmWalletConnectSignTypedDataDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  accountId: string; // CAIP-10 format: eip155:<chain_id>:<address>

  @IsObject()
  @ValidateNested()
  @Type(() => EvmTypedData)
  typedData: EvmTypedData; // EIP-712 typed data structure

  @IsBoolean()
  @IsOptional()
  useTestnet?: boolean;
}
