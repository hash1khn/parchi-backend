import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VERIFICATION_STATUS,
  type VerificationStatus,
} from '../../../constants/app.constants';

export class QueryStudentsDto {
  @IsOptional()
  @IsEnum(VERIFICATION_STATUS, {
    message: `Status must be one of: ${Object.values(VERIFICATION_STATUS).join(', ')}`,
  })
  status?: VerificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

