import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class StudentSignupDto {
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
  university: string;

  @IsNotEmpty()
  @IsUrl()
  studentIdImageUrl: string;

  @IsNotEmpty()
  @IsUrl()
  selfieImageUrl: string;
}

