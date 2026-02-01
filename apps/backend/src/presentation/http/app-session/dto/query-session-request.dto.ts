/**
 * QUERY SESSION HTTP REQUEST DTO
 *
 * Presentation Layer - HTTP-specific validation
 */

import { IsString, IsNotEmpty } from 'class-validator';

export class QuerySessionRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  chain!: string;
}
