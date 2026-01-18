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

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Length(13, 13, { message: 'CNIC must be exactly 13 digits' })
  @IsNumberString({}, { message: 'CNIC must contain only numbers' })
  cnic: string;

  @IsNotEmpty()
  @IsISO8601()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsString()
  university: string;

  @IsNotEmpty()
  @IsUrl()
  studentIdCardFrontUrl: string;

  @IsNotEmpty()
  @IsUrl()
  studentIdCardBackUrl: string;

  @IsNotEmpty()
  @IsUrl()
  selfieImageUrl: string;

  @IsNotEmpty()
  @IsUrl()
  cnicFrontImageUrl: string;

  @IsNotEmpty()
  @IsUrl()
  cnicBackImageUrl: string;
}

