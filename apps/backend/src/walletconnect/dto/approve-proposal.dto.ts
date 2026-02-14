import { IsArray, IsNumber, IsNotEmpty } from 'class-validator';

export class ApproveProposalDto {
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  proposalId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  approvedChains: number[];
}
