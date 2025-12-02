import {
  IsOptional,
  IsString,
  IsBoolean,
  IsLatitude,
  IsLongitude,
} from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

