import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VERIFICATION_STATUS,
  type VerificationStatus,
} from '../../../constants/app.constants';


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
}

