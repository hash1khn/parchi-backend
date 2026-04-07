import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum StudentVerificationStatusAdmin {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected',
  expired = 'expired',
}

export class UpdateStudentAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  university?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  graduationYear?: number | null;

  @IsOptional()
  @IsBoolean()
  isFoundersClub?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalSavings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  totalRedemptions?: number;

  @IsOptional()
  @IsEnum(StudentVerificationStatusAdmin)
  verificationStatus?: StudentVerificationStatusAdmin;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  verificationExpiresAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(13)
  cnic?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  dateOfBirth?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  profilePicture?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  verificationSelfiePath?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
