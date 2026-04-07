import { IsInt, IsNumber, IsOptional, IsString, Min, IsBoolean, IsIn, IsUUID } from 'class-validator';

export class UpdateLoyaltyProgramDto {
  @IsString()
  @IsIn(['merchant', 'offer'])
  scope: 'merchant' | 'offer';

  @IsOptional()
  @IsUUID()
  offerId?: string;

  @IsInt()
  @Min(1)
  redemptionsRequired: number;

  @IsString()
  @IsIn(['percentage', 'fixed', 'item'])
  discountType: string;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsString()
  additionalItem?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
