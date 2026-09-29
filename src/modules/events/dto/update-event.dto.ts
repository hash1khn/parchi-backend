import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  externalUrl?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  venue?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
