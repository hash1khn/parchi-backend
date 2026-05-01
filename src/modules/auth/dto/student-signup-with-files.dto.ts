import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class StudentSignupWithFilesDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsNotEmpty()
  @IsString()
  educationalGrade: string;


  @IsNotEmpty()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!match) return trimmed;
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  })
  @IsISO8601()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsString()
  university: string;
}
