import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CorporateSignupDto {
  @IsNotEmpty({ message: 'Business name is required.' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email prefix is required.' })
  @IsString()
  emailPrefix: string;

  @IsNotEmpty({ message: 'Contact email is required.' })
  @IsEmail({}, { message: 'Please enter a valid contact email address.' })
  contactEmail: string;

  @IsNotEmpty({ message: 'Password is required.' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  password: string;

  @IsNotEmpty({ message: 'Contact number is required.' })
  @IsString()
  contact: string;

  @IsOptional()
  @IsString()
  regNumber?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subCategory?: string;

  @IsNotEmpty()
  @IsString()
  email: string; // Calculated: emailPrefix + "@parchipakistan.com"

  @IsNotEmpty()
  @IsString()
  logo_path: string; // URL returned from SupabaseStorageService

  @IsOptional()
  @IsString()
  banner_path?: string; // URL returned from SupabaseStorageService
}

