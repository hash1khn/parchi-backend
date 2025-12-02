import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  IsBoolean,
} from 'class-validator';

export class UpdateCorporateAccountDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsUrl()
  logoPath?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  verificationStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
}

