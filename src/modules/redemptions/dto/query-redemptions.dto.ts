import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  IsUUID,
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
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  parchiId?: string;

  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
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

