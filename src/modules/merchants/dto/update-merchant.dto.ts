import { IsOptional, IsString } from 'class-validator';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  business_name?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsString()
  contact_email?: string;

  @IsOptional()
  @IsString()
  business_registration_number?: string;
}
