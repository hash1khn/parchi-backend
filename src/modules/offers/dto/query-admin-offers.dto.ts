import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  OFFER_STATUS,
  type OfferStatus,
} from '../../../constants/app.constants';

export class QueryAdminOffersDto {
  @IsOptional()
  @IsEnum(OFFER_STATUS, {
    message: `Status must be one of: ${Object.values(OFFER_STATUS).join(', ')}`,
  })
  status?: OfferStatus;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  search?: string;

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

