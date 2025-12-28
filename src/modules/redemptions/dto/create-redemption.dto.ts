import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateRedemptionDto {
  @IsNotEmpty()
  @IsString()
  parchiId: string;

  @IsNotEmpty()
  @IsUUID()
  offerId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

