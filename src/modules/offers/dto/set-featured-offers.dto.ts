import {
  IsArray,
  IsUUID,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FeaturedOfferDto {
  @IsUUID()
  offerId: string;

  @IsInt()
  @Min(1)
  @Max(6)
  order: number;
}

export class SetFeaturedOffersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeaturedOfferDto)
  offers: FeaturedOfferDto[];
}
