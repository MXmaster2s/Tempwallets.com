/**
 * CREATE APP SESSION HTTP REQUEST DTO
 *
 * Presentation Layer - HTTP-specific validation
 *
 * Validates HTTP request for creating app sessions.
 * Controller converts this to application layer DTO.
 */

import { IsString, IsNotEmpty, IsArray, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AllocationRequestDto {
  @IsString()
  @IsNotEmpty()
  participant!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class CreateAppSessionRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  chain!: string;

  @IsArray()
  @IsString({ each: true })
  participants!: string[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  weights?: number[];

  @IsNumber()
  @IsOptional()
  quorum?: number;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationRequestDto)
  @IsOptional()
  initialAllocations?: AllocationRequestDto[];

  @IsOptional()
  sessionData?: any;
}
