import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  Length,
  IsNumberString,
  IsISO8601,
} from 'class-validator';

export class StudentSignupDto {
  @IsNotEmpty({ message: 'First name is required.' })
  @IsString({ message: 'First name must be text.' })
  firstName: string;

  @IsNotEmpty({ message: 'Last name is required.' })
  @IsString({ message: 'Last name must be text.' })
  lastName: string;

  @IsNotEmpty({ message: 'Email is required.' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsNotEmpty({ message: 'Password is required.' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  password: string;

  @IsNotEmpty({ message: 'Phone number is required.' })
  @IsString({ message: 'Phone number must be text.' })
  phone: string;

  @IsNotEmpty({ message: 'Please select your educational grade/level.' })
  @IsString()
  educationalGrade: string;


  @IsNotEmpty({ message: 'Date of birth is required.' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!match) return trimmed;
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  })
  @IsISO8601({}, { message: 'Please enter a valid date of birth (DD/MM/YYYY).' })
  dateOfBirth: string;

  @IsNotEmpty({ message: 'University is required.' })
  @IsString()
  university: string;

  @IsNotEmpty({ message: 'Student ID card (front) is required.' })
  @IsUrl({}, { message: 'Student ID card (front) failed to upload. Please try again.' })
  studentIdCardFrontUrl: string;

  @IsNotEmpty({ message: 'Student ID card (back) is required.' })
  @IsUrl({}, { message: 'Student ID card (back) failed to upload. Please try again.' })
  studentIdCardBackUrl: string;

  @IsNotEmpty({ message: 'Selfie photo is required.' })
  @IsUrl({}, { message: 'Selfie photo failed to upload. Please try again.' })
  selfieImageUrl: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

