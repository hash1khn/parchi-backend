import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRedemptionDto {
  @IsNotEmpty()
  @IsString()
  parchiId: string;

  @IsNotEmpty()
  @IsString()
  offerId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

