import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  VERIFICATION_STATUS,
  type VerificationStatus,
} from '../../../constants/app.constants';
import { StudentFilterClauseDto } from '../filters/student-filter.dto';


export class QueryStudentsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  institute?: string;

  @IsOptional()
  @IsEnum(VERIFICATION_STATUS, {
    message: `Status must be one of: ${Object.values(VERIFICATION_STATUS).join(', ')}`,
  })
  status?: VerificationStatus;

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

  @IsOptional()
  @IsString()
  emailVerified?: string;

  @IsOptional()
  @IsString()
  groupBy?: 'university' | 'city';

  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  kycStatus?: string; // Can be comma-separated values

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRedemptions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRedemptions?: number;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  hasRedeemed?: string; // 'true' or 'false' from query

  @IsOptional()
  @IsString()
  foundersClub?: string; // 'true' or 'false' from query

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) return undefined;
      return plainToInstance(StudentFilterClauseDto, parsed);
    } catch {
      return undefined;
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentFilterClauseDto)
  filters?: StudentFilterClauseDto[];
}

