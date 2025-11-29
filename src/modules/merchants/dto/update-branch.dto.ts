import { IsOptional, IsString } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  branch_name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;
}
