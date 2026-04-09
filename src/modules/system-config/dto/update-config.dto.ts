import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  min_android_build_number?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  min_ios_build_number?: number;

  @IsOptional()
  @IsString()
  force_update_title?: string;

  @IsOptional()
  @IsString()
  force_update_message?: string;

  @IsOptional()
  @IsBoolean()
  is_under_maintenance?: boolean;
}
