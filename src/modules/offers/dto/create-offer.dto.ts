import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  Min,
  Max,
  IsInt,
  ValidateIf,
  Matches,
} from 'class-validator';

export class CreateOfferDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsNotEmpty()
  @IsEnum(['percentage', 'fixed'])
  discountType: 'percentage' | 'fixed';

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  discountValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsString()
  termsConditions?: string;

  @IsNotEmpty()
  @IsDateString()
  validFrom: string;

  @IsNotEmpty()
  @IsDateString()
  validUntil: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  totalLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsEnum(['always', 'custom'])
  scheduleType?: 'always' | 'custom';

  @ValidateIf((o) => o.scheduleType === 'custom')
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedDays?: number[];

  @ValidateIf((o) => o.scheduleType === 'custom')
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime?: string;

  @ValidateIf((o) => o.scheduleType === 'custom')
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime?: string;
}

