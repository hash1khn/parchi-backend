import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class BranchSignupDto {
  @IsNotEmpty({ message: 'Branch name is required.' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email prefix is required.' })
  @IsString()
  emailPrefix: string;

  @IsNotEmpty({ message: 'Password is required.' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  password: string;

  @IsNotEmpty({ message: 'Address is required.' })
  @IsString()
  address: string;

  @IsNotEmpty({ message: 'City is required.' })
  @IsString()
  city: string;

  @IsNotEmpty({ message: 'Contact number is required.' })
  @IsString()
  contact: string;

  @IsOptional()
  @IsUUID('all', { message: 'Linked corporate account ID is invalid.' })
  linkedCorporate?: string; // merchant_id (UUID) - Required for admin, optional for corporate merchant

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsNotEmpty()
  @IsString()
  email: string; // Calculated: emailPrefix + "@parchipakistan.com"
}


