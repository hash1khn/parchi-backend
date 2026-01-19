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
import {
  DISCOUNT_TYPE,
  SCHEDULE_TYPE,
  type DiscountType,
  type ScheduleType,
} from '../../../constants/app.constants';

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
  @IsEnum(DISCOUNT_TYPE, {
    message: `Discount type must be one of: ${Object.values(DISCOUNT_TYPE).join(', ')}`,
  })
  discountType: DiscountType;

  @ValidateIf((o) => o.discountType !== DISCOUNT_TYPE.ITEM)
  @IsNotEmpty()
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
  @IsEnum(SCHEDULE_TYPE, {
    message: `Schedule type must be one of: ${Object.values(SCHEDULE_TYPE).join(', ')}`,
  })
  scheduleType?: ScheduleType;

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
  @IsOptional()
  @IsString()
  additionalItem?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

