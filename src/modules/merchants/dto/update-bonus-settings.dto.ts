import { IsInt, IsNumber, IsOptional, IsString, Min, IsBoolean, IsIn } from 'class-validator';

export class UpdateBonusSettingsDto {
  @IsInt()
  @Min(1)
  redemptionsRequired: number;

  @IsString()
  @IsIn(['percentage', 'fixed'])
  discountType: string;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
