import { IsArray, IsUUID, IsInt, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FeaturedBrandDto {
  @IsUUID()
  brandId: string;

  @IsInt()
  @Min(1)
  @Max(6)
  order: number;
}

export class SetFeaturedBrandsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeaturedBrandDto)
  brands: FeaturedBrandDto[];
}

