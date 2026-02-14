import { IsString, IsNumber, IsNotEmpty, IsArray } from 'class-validator';

export class SignRequestDto {
  @IsNotEmpty()
  userId: string;

  @IsString()
  topic: string;

  @IsNumber()
  requestId: number;

  @IsString()
  method: string;

  @IsArray()
  params: any[];

  @IsString()
  chainId: string; // CAIP-2 format: "eip155:1"
}
