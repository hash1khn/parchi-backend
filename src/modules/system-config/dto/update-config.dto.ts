import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

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
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'min_android_version must be in semver format (e.g. 2.1.0)' })
  min_android_version?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'min_ios_version must be in semver format (e.g. 2.1.0)' })
  min_ios_version?: string;

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
