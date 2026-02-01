/**
 * AUTHENTICATE WALLET HTTP REQUEST DTO
 *
 * Presentation Layer - HTTP-specific validation
 *
 * This DTO is for HTTP layer validation (class-validator decorators).
 * The controller converts this to the application layer DTO.
 */

import { IsString, IsNotEmpty } from 'class-validator';

export class AuthenticateWalletRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  chain!: string;
}
