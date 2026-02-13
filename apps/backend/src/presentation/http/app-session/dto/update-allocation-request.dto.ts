/**
 * UPDATE ALLOCATION HTTP REQUEST DTO
 *
 * Presentation Layer - HTTP-specific validation
 */

import { IsString, IsNotEmpty, IsArray, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AllocationDto {
  @IsString()
  @IsNotEmpty()
  participant!: string;

  @IsString()
  @IsNotEmpty()
  asset!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class UpdateAllocationRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  // NOTE: appSessionId comes from URL path param (:sessionId), not from body

  @IsString()
  @IsNotEmpty()
  chain!: string;

  @IsString()
  @IsIn(['DEPOSIT', 'OPERATE', 'WITHDRAW'])
  intent!: 'DEPOSIT' | 'OPERATE' | 'WITHDRAW';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}
