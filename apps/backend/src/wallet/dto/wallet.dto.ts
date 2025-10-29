import { IsString, IsNotEmpty, IsIn, IsOptional, ValidateIf } from 'class-validator';

export class CreateOrImportSeedDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsIn(['random', 'mnemonic'])
  mode: 'random' | 'mnemonic';

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.mode === 'mnemonic')
  @IsNotEmpty()
  mnemonic?: string;
}

