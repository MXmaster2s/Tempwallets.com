/**
 * AUTHENTICATE WALLET DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Input data for authenticating a user's wallet with Yellow Network.
 * This is framework-agnostic (no class-validator decorators).
 */

export class AuthenticateWalletDto {
  userId!: string;
  chain!: string;
}

export class AuthenticateWalletResultDto {
  authenticated!: boolean;
  walletAddress!: string;
  chain!: string;
  timestamp!: number;
}
