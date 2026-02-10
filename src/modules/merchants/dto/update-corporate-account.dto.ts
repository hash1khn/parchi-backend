import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  IsBoolean,
  IsEnum,
  IsNumber,
} from 'class-validator';
import {
  VERIFICATION_STATUS,
  type VerificationStatus,
} from '../../../constants/app.constants';

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
  @IsEnum(VERIFICATION_STATUS, {
    message: `Verification status must be one of: ${Object.values(VERIFICATION_STATUS).join(', ')}`,
  })
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsUrl()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsNumber()
  redemptionFee?: number;
}

