import {
  IsString,
  IsOptional,
  IsUrl,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
  ValidateIf,
  Matches,
} from 'class-validator';

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(['percentage', 'fixed'])
  discountType?: 'percentage' | 'fixed';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  discountValue?: number;

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

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  totalLimit?: number;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

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

