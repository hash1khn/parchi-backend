import {
  IsOptional,
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

export class QueryMerchantOffersDto {
  @IsOptional()
  @IsEnum(OFFER_STATUS, {
    message: `Status must be one of: ${Object.values(OFFER_STATUS).join(', ')}`,
  })
  status?: OfferStatus;

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

