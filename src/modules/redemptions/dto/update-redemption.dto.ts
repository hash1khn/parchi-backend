import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UpdateRedemptionDto {
  @IsOptional()
  @IsEnum(['reject'])
  action?: 'reject';

  @IsOptional()
  @IsString()
  notes?: string;
}

