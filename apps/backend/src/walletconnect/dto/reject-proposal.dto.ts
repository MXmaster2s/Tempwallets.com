import { IsNumber, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RejectProposalDto {
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  proposalId: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
