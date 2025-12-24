import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  REDEMPTION_STATUS,
  type RedemptionStatus,
} from '../../../constants/app.constants';

export class QueryRedemptionsDto {
  @IsOptional()
  @IsEnum(REDEMPTION_STATUS, {
    message: `Status must be one of: ${Object.values(REDEMPTION_STATUS).join(', ')}`,
  })
  status?: RedemptionStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  parchiId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  offerId?: string;

  @IsOptional()
  @IsEnum(['newest', 'oldest', 'merchant', 'branch', 'student', 'savings', 'status'])
  sort?: 'newest' | 'oldest' | 'merchant' | 'branch' | 'student' | 'savings' | 'status';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

